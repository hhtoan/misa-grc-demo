"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuilding,
  IconDownload,
  IconFilterOff,
  IconGridDots,
  IconInfoCircle,
  IconLayoutList,
  IconPlus,
  IconShieldCheck,
  IconShieldOff,
  IconShieldX,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  CodeCell,
  DataTable,
  EmptyState,
  FilterCombobox,
  Modal,
  ReadField,
  RiskBadge,
  SearchInput,
  Segments,
  StatusBadge,
  TitleCell,
  Tooltip,
  UserCell,
  useToast,
  type Column,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { LEVEL_TONE } from "@/components/domain";
import { controlRepo, riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { CONTROL_TYPES } from "@/lib/domain/enums";
import {
  controlHealth,
  isControlActive,
  isNeverTested,
  isTestFailed,
  isTestOverdue,
  nextTestDate,
  testCycleOf,
} from "@/lib/domain/control-utils";
import {
  RISK_LEVEL_ORDER,
  inherentScoreOf,
  requireTreatmentPlan,
  residualLevelOf,
  residualScoreOf,
} from "@/lib/domain/risk-utils";
import type { Control, Risk } from "@/lib/domain/schema";
import { formatDate, matchSearch } from "@/lib/format";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Kiểu dữ liệu độ phủ                                        */
/* ================================================================== */

type CoverageStatus = "none" | "inactive" | "weak" | "ok";

interface Coverage {
  risk: Risk;
  controls: Control[];
  active: Control[];
  status: CoverageStatus;
  hasPreventive: boolean;
  weakCount: number;
  bestHealth: number;
}

const COVERAGE_META: Record<
  CoverageStatus,
  {
    label: string;
    tone: "success" | "warning" | "high" | "danger";
    note: string;
  }
> = {
  ok: {
    label: "Được phủ tốt",
    tone: "success",
    note: "Có kiểm soát đang hiệu lực và kết quả kiểm tra còn tin cậy",
  },
  weak: {
    label: "Kiểm soát yếu",
    tone: "warning",
    note: "Toàn bộ kiểm soát đang hiệu lực đều chưa đạt, quá hạn hoặc chưa từng kiểm tra",
  },
  inactive: {
    label: "Chưa có hiệu lực",
    tone: "high",
    note: "Có khai báo kiểm soát nhưng chưa kiểm soát nào được ban hành",
  },
  none: {
    label: "Chưa có kiểm soát",
    tone: "danger",
    note: "Rủi ro chưa được gắn bất kỳ kiểm soát nào",
  },
};

/** Ký hiệu loại kiểm soát hiển thị trong ô ma trận */
const TYPE_MARK: Record<string, { letter: string; name: string }> = {
  "Phòng ngừa": { letter: "P", name: "Phòng ngừa" },
  "Phát hiện": { letter: "D", name: "Phát hiện" },
  "Khắc phục": { letter: "K", name: "Khắc phục" },
};

const TYPE_OPTIONS = CONTROL_TYPES.map((v) => ({ value: v, label: v }));

type ViewMode = "matrix" | "coverage" | "unit";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function MaTranKiemSoatScreen() {
  const router = useRouter();
  const toast = useToast();
  const lk = useLookups();

  const risks = useCollection(riskRepo);
  const controls = useCollection(controlRepo);

  const [view, setView] = useState<ViewMode>("matrix");
  const [keyword, setKeyword] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [onlyKeyRisk, setOnlyKeyRisk] = useState(false);
  const [onlyGap, setOnlyGap] = useState(false);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(true);

  const [cell, setCell] = useState<{ risk: Risk; control: Control } | null>(
    null
  );

  /* ---------------------- Lọc kiểm soát ------------------------- */

  const scopedControls = useMemo(
    () =>
      controls.filter((c) => {
        if (types.length > 0 && !types.includes(c.type)) return false;
        if (!includeInactive && !isControlActive(c)) return false;
        return true;
      }),
    [controls, types, includeInactive]
  );

  /* ---------------------- Tính độ phủ --------------------------- */

  const controlsByRisk = useMemo(() => {
    const map = new Map<string, Control[]>();
    scopedControls.forEach((c) => {
      c.riskIds.forEach((rid) => {
        const arr = map.get(rid);
        if (arr) arr.push(c);
        else map.set(rid, [c]);
      });
    });
    map.forEach((arr) => arr.sort((a, b) => a.code.localeCompare(b.code)));
    return map;
  }, [scopedControls]);

  function buildCoverage(risk: Risk): Coverage {
    const list = controlsByRisk.get(risk.id) ?? [];
    const active = list.filter(isControlActive);
    const weakCount = active.filter(
      (c) => isTestFailed(c) || isNeverTested(c) || isTestOverdue(c)
    ).length;

    let status: CoverageStatus;
    if (list.length === 0) status = "none";
    else if (active.length === 0) status = "inactive";
    else if (weakCount === active.length) status = "weak";
    else status = "ok";

    return {
      risk,
      controls: list,
      active,
      status,
      hasPreventive: active.some((c) => c.type === "Phòng ngừa"),
      weakCount,
      bestHealth:
        active.length === 0
          ? 0
          : Math.max(...active.map((c) => controlHealth(c))),
    };
  }

  const coverages = useMemo(() => {
    return risks
      .filter((r) => {
        if (!includeClosed && (r.status === "Đã đóng" || r.status === "Từ chối"))
          return false;
        if (unitId && r.unitId !== unitId) return false;
        if (categoryId && r.categoryId !== categoryId) return false;
        if (onlyKeyRisk && !r.isKeyRisk && !r.isZeroTolerance) return false;
        if (keyword.trim() && !matchSearch(`${r.code} ${r.name}`, keyword))
          return false;
        return true;
      })
      .map(buildCoverage)
      .filter((cv) => (onlyGap ? cv.status !== "ok" : true))
      .sort((a, b) => {
        // rủi ro thiếu phủ lên trước, sau đó theo mức rủi ro giảm dần
        const gap = (s: CoverageStatus) =>
          s === "none" ? 4 : s === "inactive" ? 3 : s === "weak" ? 2 : 1;
        const g = gap(b.status) - gap(a.status);
        if (g !== 0) return g;
        return (
          RISK_LEVEL_ORDER[residualLevelOf(b.risk)] * 100 +
          residualScoreOf(b.risk) -
          (RISK_LEVEL_ORDER[residualLevelOf(a.risk)] * 100 +
            residualScoreOf(a.risk))
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    risks,
    controlsByRisk,
    includeClosed,
    unitId,
    categoryId,
    onlyKeyRisk,
    onlyGap,
    keyword,
  ]);

  /** Kiểm soát thực sự xuất hiện trong ma trận sau khi lọc rủi ro */
  const matrixControls = useMemo(() => {
    const ids = new Set<string>();
    coverages.forEach((cv) => cv.controls.forEach((c) => ids.add(c.id)));
    return scopedControls
      .filter((c) => ids.has(c.id))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [coverages, scopedControls]);

  /* --------------------------- Thống kê ------------------------- */

  const stat = useMemo(() => {
    const none = coverages.filter((c) => c.status === "none").length;
    const inactive = coverages.filter((c) => c.status === "inactive").length;
    const weak = coverages.filter((c) => c.status === "weak").length;
    const ok = coverages.filter((c) => c.status === "ok").length;
    const highNoPreventive = coverages.filter(
      (c) => requireTreatmentPlan(c.risk) && !c.hasPreventive
    ).length;
    const orphanControls = scopedControls.filter(
      (c) => c.riskIds.length === 0
    ).length;
    const totalLinks = coverages.reduce((s, c) => s + c.controls.length, 0);

    return {
      total: coverages.length,
      none,
      inactive,
      weak,
      ok,
      highNoPreventive,
      orphanControls,
      avgPerRisk:
        coverages.length === 0
          ? 0
          : Math.round((totalLinks / coverages.length) * 10) / 10,
      coverRate:
        coverages.length === 0
          ? 0
          : Math.round((ok / coverages.length) * 100),
    };
  }, [coverages, scopedControls]);

  const gapList = useMemo(
    () => coverages.filter((c) => c.status === "none" || c.status === "inactive"),
    [coverages]
  );

  const filterCount =
    types.length +
    (unitId ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (onlyKeyRisk ? 1 : 0) +
    (onlyGap ? 1 : 0) +
    (includeClosed ? 1 : 0) +
    (!includeInactive ? 1 : 0);

  function resetFilter() {
    setKeyword("");
    setUnitId(null);
    setCategoryId(null);
    setTypes([]);
    setOnlyKeyRisk(false);
    setOnlyGap(false);
    setIncludeClosed(false);
    setIncludeInactive(true);
  }

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        title="Ma trận kiểm soát"
        actions={
          <>
            {filterCount > 0 && (
              <Button
                variant="text"
                icon={<IconFilterOff size={16} />}
                onClick={resetFilter}
              >
                Xoá lọc ({filterCount})
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị ma trận ${stat.total} rủi ro × ${matrixControls.length} kiểm soát (giả lập).`
                )
              }
            >
              Xuất khẩu
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* ------------------------ Bộ lọc ------------------------ */}
          <ContentCard className="flex flex-wrap items-center gap-2">
            <Segments
              items={[
                {
                  key: "matrix",
                  label: "Ma trận chéo",
                  icon: <IconGridDots size={15} />,
                },
                {
                  key: "coverage",
                  label: "Độ phủ theo rủi ro",
                  icon: <IconLayoutList size={15} />,
                },
                {
                  key: "unit",
                  label: "Theo đơn vị",
                  icon: <IconBuilding size={15} />,
                },
              ]}
              value={view}
              onChange={(k) => setView(k as ViewMode)}
            />

            <span className="mx-1 h-6 w-px bg-border-light" />

            <SearchInput
              value={keyword}
              onChange={setKeyword}
              placeholder="Tìm rủi ro"
              width={230}
            />
            <FilterCombobox
              label="Đơn vị:"
              options={lk.unitOptions}
              value={unitId}
              onChange={setUnitId}
              searchable
              width={200}
            />
            <FilterCombobox
              label="Nhóm rủi ro:"
              options={lk.riskCategoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              searchable
              width={220}
            />
            <FilterCombobox
              label="Loại kiểm soát:"
              multiple
              options={TYPE_OPTIONS}
              value={types}
              onChange={setTypes}
              width={220}
            />

            <Checkbox
              label="Chỉ rủi ro trọng yếu & KKN"
              checked={onlyKeyRisk}
              onChange={(e) => setOnlyKeyRisk(e.target.checked)}
            />
            <Checkbox
              label="Chỉ rủi ro có lỗ hổng"
              checked={onlyGap}
              onChange={(e) => setOnlyGap(e.target.checked)}
            />
            <Checkbox
              label="Gồm kiểm soát chưa hiệu lực"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            <Checkbox
              label="Gồm rủi ro đã đóng"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
            />
          </ContentCard>

          {/* --------------------- Thẻ tổng quan -------------------- */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <ScoreCard
              icon={<IconShieldCheck size={20} />}
              tone="success"
              label="Được phủ tốt"
              value={stat.ok}
              note={`Tỷ lệ phủ ${stat.coverRate}% trên ${stat.total} rủi ro`}
            />
            <ScoreCard
              icon={<IconShieldOff size={20} />}
              tone="warning"
              label="Kiểm soát yếu"
              value={stat.weak}
              note="Toàn bộ kiểm soát đều chưa đạt hoặc quá hạn kiểm tra"
            />
            <ScoreCard
              icon={<IconShieldX size={20} />}
              tone="danger"
              label="Chưa có kiểm soát"
              value={stat.none + stat.inactive}
              note={`${stat.none} chưa gắn, ${stat.inactive} chưa ban hành`}
            />
            <ScoreCard
              icon={<IconAlertTriangle size={20} />}
              tone="high"
              label="Mức Cao thiếu phòng ngừa"
              value={stat.highNoPreventive}
              note={`Bình quân ${stat.avgPerRisk} kiểm soát trên mỗi rủi ro`}
            />
          </div>

          {/* ------------------ Cảnh báo lỗ hổng ------------------- */}
          {gapList.length > 0 && (
            <div className="rounded-card border border-lv-critical-border bg-lv-critical-bg p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-critical-text">
                <IconShieldX size={16} />
                {gapList.length} rủi ro chưa có kiểm soát đang hiệu lực
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {gapList.map((cv) => (
                  <button
                    key={cv.risk.id}
                    type="button"
                    onClick={() =>
                      router.push(`/rui-ro/so-dang-ky/${cv.risk.code}`)
                    }
                    className="inline-flex items-center gap-1 rounded-badge border border-lv-critical-border bg-white px-2 py-0.5 text-[12px] font-medium text-lv-critical-text transition-colors hover:bg-lv-critical-bg"
                  >
                    {cv.risk.code}
                    <span className="opacity-70">
                      ({residualLevelOf(cv.risk)})
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-lv-critical-text opacity-80">
                Rủi ro không có kiểm soát nào đang vận hành thì mức rủi ro còn
                lại đang khai báo là không có căn cứ.
              </p>
            </div>
          )}

          {stat.orphanControls > 0 && (
            <div className="flex items-center gap-2 rounded-card border border-lv-medium-border bg-lv-medium-bg px-3 py-2.5 text-[12px] text-lv-medium-text">
              <IconAlertTriangle size={16} className="shrink-0" />
              Có <b>{stat.orphanControls}</b> kiểm soát chưa gắn với rủi ro nào.
              Đây là lỗi dữ liệu, cần rà soát lại tại sổ đăng ký kiểm soát.
            </div>
          )}

          {/* ------------------------ Nội dung ---------------------- */}
          {coverages.length === 0 ? (
            <ContentCard>
              <EmptyState
                icon={<IconGridDots size={24} />}
                title="Không có rủi ro phù hợp"
                description="Thử bỏ bớt điều kiện lọc phía trên."
              />
            </ContentCard>
          ) : view === "matrix" ? (
            <MatrixView
              coverages={coverages}
              controls={matrixControls}
              lk={lk}
              onCell={(risk, control) => setCell({ risk, control })}
              onOpenRisk={(code) => router.push(`/rui-ro/so-dang-ky/${code}`)}
              onOpenControl={(code) =>
                router.push(`/kiem-soat/so-dang-ky/${code}`)
              }
            />
          ) : view === "coverage" ? (
            <CoverageView
              coverages={coverages}
              lk={lk}
              onOpenRisk={(code) => router.push(`/rui-ro/so-dang-ky/${code}`)}
              onOpenControl={(code) =>
                router.push(`/kiem-soat/so-dang-ky/${code}`)
              }
            />
          ) : (
            <UnitView coverages={coverages} lk={lk} />
          )}
        </div>
      </PageBody>

      {/* ---------------------- Chi tiết ô ma trận ---------------------- */}
      <CellModal
        pair={cell}
        lk={lk}
        onClose={() => setCell(null)}
        onOpenRisk={(code) => {
          setCell(null);
          router.push(`/rui-ro/so-dang-ky/${code}`);
        }}
        onOpenControl={(code) => {
          setCell(null);
          router.push(`/kiem-soat/so-dang-ky/${code}`);
        }}
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Chế độ 1: Ma trận chéo                                        */
/* ================================================================== */

type Lookups = ReturnType<typeof useLookups>;

function MatrixView({
  coverages,
  controls,
  lk,
  onCell,
  onOpenRisk,
  onOpenControl,
}: {
  coverages: Coverage[];
  controls: Control[];
  lk: Lookups;
  onCell: (risk: Risk, control: Control) => void;
  onOpenRisk: (code: string) => void;
  onOpenControl: (code: string) => void;
}) {
  const riskIdSet = useMemo(
    () => new Set(coverages.map((c) => c.risk.id)),
    [coverages]
  );

  /** Số rủi ro trong ma trận mà mỗi kiểm soát đang phủ */
  const countByControl = useMemo(() => {
    const map = new Map<string, number>();
    controls.forEach((c) =>
      map.set(c.id, c.riskIds.filter((id) => riskIdSet.has(id)).length)
    );
    return map;
  }, [controls, riskIdSet]);

  return (
    <ContentCard padded={false} className="overflow-hidden">
      <div className="flex h-14 flex-wrap items-center gap-3 border-b border-border-light px-4">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Lưới rủi ro × kiểm soát
        </h2>
        <span className="text-[12px] text-text-secondary">
          {coverages.length} rủi ro × {controls.length} kiểm soát
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
          <LegendMark letter="P" label="Phòng ngừa" />
          <LegendMark letter="D" label="Phát hiện" />
          <LegendMark letter="K" label="Khắc phục" />
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-success" /> Tốt
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-warning" /> Cần theo dõi
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-danger" /> Yếu
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] border border-dashed border-border-neutral" />{" "}
            Chưa hiệu lực
          </span>
        </span>
      </div>

      <div className="max-h-[640px] overflow-auto">
        <table className="border-collapse text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-surface-alt">
              <th
                className="sticky left-0 z-30 h-16 min-w-[340px] border-b border-r border-border-light bg-surface-alt px-3 text-left font-medium text-text-secondary"
                style={{ width: 340 }}
              >
                Rủi ro
              </th>
              <th className="h-16 w-[130px] border-b border-border-light bg-surface-alt px-2 text-center font-medium text-text-secondary">
                Mức còn lại
              </th>
              <th className="h-16 w-[110px] border-b border-r border-border-light bg-surface-alt px-2 text-center font-medium text-text-secondary">
                Độ phủ
              </th>

              {controls.map((c) => (
                <th
                  key={c.id}
                  className="h-16 w-[52px] border-b border-border-light bg-surface-alt p-1 text-center align-bottom"
                >
                  <Tooltip
                    content={
                      <span className="flex flex-col gap-0.5">
                        <b>
                          {c.code} - {c.name}
                        </b>
                        <span>
                          {c.type} - {c.nature} - {c.frequency}
                        </span>
                        <span>
                          Trạng thái {c.status}, sức khoẻ {controlHealth(c)}/100
                        </span>
                        <span>
                          Phủ {countByControl.get(c.id) ?? 0} rủi ro trong ma
                          trận này
                        </span>
                      </span>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onOpenControl(c.code)}
                      className="flex w-full flex-col items-center gap-1"
                    >
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          isControlActive(c) ? "text-brand" : "text-text-hint"
                        )}
                      >
                        {c.code.split("-").pop()}
                      </span>
                      <span className="text-[10px] text-text-hint">
                        {countByControl.get(c.id) ?? 0}
                      </span>
                    </button>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {coverages.map((cv) => {
              const meta = COVERAGE_META[cv.status];
              const gap = cv.status === "none" || cv.status === "inactive";
              return (
                <tr
                  key={cv.risk.id}
                  className={cn(
                    "group bg-white transition-colors hover:bg-[#FAFAFA]",
                    gap && "bg-lv-critical-bg hover:bg-lv-critical-bg"
                  )}
                >
                  <td
                    className="sticky left-0 z-10 border-b border-r border-border-light bg-inherit px-3 py-2"
                    style={{ width: 340 }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRisk(cv.risk.code)}
                      className="flex w-full min-w-0 flex-col text-left"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <b className="shrink-0 text-[12px] text-brand">
                          {cv.risk.code}
                        </b>
                        <span className="truncate text-[13px] text-text-primary">
                          {cv.risk.name}
                        </span>
                        {cv.risk.isZeroTolerance && (
                          <Badge tone="danger" size="sm">
                            KKN
                          </Badge>
                        )}
                      </span>
                      <span className="truncate text-[12px] text-text-secondary">
                        {lk.unitName(cv.risk.unitId)} -{" "}
                        {lk.employeeName(cv.risk.ownerId, "Chưa gán")}
                      </span>
                    </button>
                  </td>

                  <td className="border-b border-border-light bg-inherit px-2 py-2 text-center">
                    <RiskBadge
                      level={residualLevelOf(cv.risk)}
                      score={residualScoreOf(cv.risk)}
                    />
                  </td>

                  <td className="border-b border-r border-border-light bg-inherit px-2 py-2 text-center">
                    <Tooltip content={meta.note}>
                      <Badge tone={meta.tone} dot>
                        {cv.controls.length}
                      </Badge>
                    </Tooltip>
                  </td>

                  {controls.map((c) => {
                    const linked = c.riskIds.includes(cv.risk.id);
                    return (
                      <td
                        key={c.id}
                        className="border-b border-border-light bg-inherit p-1 text-center"
                      >
                        {linked ? (
                          <Tooltip
                            content={
                              <span className="flex flex-col gap-0.5">
                                <b>
                                  {c.code} - {c.name}
                                </b>
                                <span>
                                  {c.type} - {c.status}
                                </span>
                                <span>Sức khoẻ {controlHealth(c)}/100</span>
                                <span>Bấm để xem chi tiết cặp ghép</span>
                              </span>
                            }
                          >
                            <button
                              type="button"
                              onClick={() => onCell(cv.risk, c)}
                              className={cn(
                                "inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[12px] font-bold transition-transform hover:scale-110",
                                markClass(c)
                              )}
                            >
                              {TYPE_MARK[c.type]?.letter ?? "?"}
                            </button>
                          </Tooltip>
                        ) : (
                          <span className="inline-block h-7 w-7" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-light px-4 py-2.5 text-[12px] text-text-secondary">
        <IconInfoCircle size={15} className="shrink-0" />
        Dòng nền đỏ là rủi ro chưa có kiểm soát nào đang hiệu lực. Con số dưới mã
        kiểm soát ở hàng tiêu đề là số rủi ro mà kiểm soát đó đang phủ.
      </div>
    </ContentCard>
  );
}

function markClass(c: Control): string {
  if (!isControlActive(c))
    return "border border-dashed border-border-neutral bg-white text-text-hint";
  const h = controlHealth(c);
  if (h >= 75) return "bg-lv-low-bg text-lv-low-text border border-lv-low-border";
  if (h >= 45)
    return "bg-lv-medium-bg text-lv-medium-text border border-lv-medium-border";
  return "bg-lv-critical-bg text-lv-critical-text border border-lv-critical-border";
}

function LegendMark({ letter, label }: { letter: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] border border-border-neutral bg-white text-[10px] font-bold text-text-secondary">
        {letter}
      </span>
      {label}
    </span>
  );
}

/* ================================================================== */
/* Chế độ 2: Độ phủ theo rủi ro                                        */
/* ================================================================== */

function CoverageView({
  coverages,
  lk,
  onOpenRisk,
  onOpenControl,
}: {
  coverages: Coverage[];
  lk: Lookups;
  onOpenRisk: (code: string) => void;
  onOpenControl: (code: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {coverages.map((cv) => {
        const meta = COVERAGE_META[cv.status];
        return (
          <div
            key={cv.risk.id}
            className={cn(
              "misa-card flex flex-col gap-2.5 border-l-4 p-3",
              cv.status === "none"
                ? "border-l-lv-critical-text"
                : cv.status === "inactive"
                  ? "border-l-lv-high-text"
                  : cv.status === "weak"
                    ? "border-l-lv-medium-text"
                    : "border-l-lv-low-text"
            )}
          >
            {/* Đầu thẻ */}
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl",
                  cv.status === "ok"
                    ? "bg-lv-low-bg text-lv-low-text"
                    : cv.status === "weak"
                      ? "bg-lv-medium-bg text-lv-medium-text"
                      : "bg-lv-critical-bg text-lv-critical-text"
                )}
              >
                {cv.status === "ok" ? (
                  <IconShieldCheck size={17} />
                ) : cv.status === "weak" ? (
                  <IconShieldOff size={17} />
                ) : (
                  <IconShieldX size={17} />
                )}
              </span>

              <button
                type="button"
                onClick={() => onOpenRisk(cv.risk.code)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="text-[13px] leading-5 font-semibold text-text-primary">
                  <span className="text-brand">{cv.risk.code}</span>{" "}
                  {cv.risk.name}
                </p>
                <p className="truncate text-[12px] text-text-secondary">
                  {lk.categoryName(cv.risk.categoryId)} -{" "}
                  {lk.unitName(cv.risk.unitId)} -{" "}
                  {lk.employeeName(cv.risk.ownerId, "Chưa gán")}
                </p>
              </button>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <RiskBadge
                  level={residualLevelOf(cv.risk)}
                  score={residualScoreOf(cv.risk)}
                />
                <Tooltip content={meta.note}>
                  <Badge tone={meta.tone} dot>
                    {meta.label}
                  </Badge>
                </Tooltip>
              </div>
            </div>

            {/* Danh sách kiểm soát */}
            {cv.controls.length === 0 ? (
              <div className="flex items-center gap-2 rounded-ctrl border border-dashed border-lv-critical-border px-3 py-2.5 text-[12px] text-lv-critical-text">
                <IconAlertTriangle size={15} className="shrink-0" />
                Chưa gắn kiểm soát nào. Điểm rủi ro còn lại{" "}
                {residualScoreOf(cv.risk)} hiện chưa có căn cứ.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {cv.controls.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpenControl(c.code)}
                    className="group/row flex items-center gap-2 rounded-ctrl px-2 py-1.5 text-left transition-colors hover:bg-[#FAFAFA]"
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-bold",
                        markClass(c)
                      )}
                    >
                      {TYPE_MARK[c.type]?.letter ?? "?"}
                    </span>
                    <span className="w-[120px] shrink-0 text-[12px] font-medium text-brand">
                      {c.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                      {c.name}
                    </span>
                    {isTestOverdue(c) && (
                      <Badge tone="danger" size="sm">
                        Quá hạn KT
                      </Badge>
                    )}
                    {isNeverTested(c) && (
                      <Badge tone="warning" size="sm">
                        Chưa KT
                      </Badge>
                    )}
                    <StatusBadge status={c.status} />
                    <IconArrowRight
                      size={14}
                      className="shrink-0 text-icon-neutral opacity-0 transition-opacity group-hover/row:opacity-100"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Chân thẻ */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-2 text-[11px] text-text-secondary">
              <span>
                {cv.active.length} đang hiệu lực trên {cv.controls.length} kiểm
                soát
                {cv.weakCount > 0 ? ` - ${cv.weakCount} cần chú ý` : ""}
              </span>
              {requireTreatmentPlan(cv.risk) && !cv.hasPreventive && (
                <span className="font-medium text-lv-medium-text">
                  Thiếu kiểm soát phòng ngừa
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Chế độ 3: Theo đơn vị                                        */
/* ================================================================== */

interface UnitRow {
  id: string;
  name: string;
  risks: number;
  controls: number;
  ok: number;
  weak: number;
  gap: number;
  rate: number;
}

function UnitView({
  coverages,
  lk,
}: {
  coverages: Coverage[];
  lk: Lookups;
}) {
  const rows = useMemo<UnitRow[]>(() => {
    const map = new Map<string, UnitRow>();

    coverages.forEach((cv) => {
      const id = cv.risk.unitId || "__none__";
      let row = map.get(id);
      if (!row) {
        row = {
          id,
          name: lk.unitName(cv.risk.unitId, "Chưa gán đơn vị"),
          risks: 0,
          controls: 0,
          ok: 0,
          weak: 0,
          gap: 0,
          rate: 0,
        };
        map.set(id, row);
      }
      row.risks += 1;
      row.controls += cv.controls.length;
      if (cv.status === "ok") row.ok += 1;
      else if (cv.status === "weak") row.weak += 1;
      else row.gap += 1;
    });

    return [...map.values()]
      .map((r) => ({
        ...r,
        rate: r.risks === 0 ? 0 : Math.round((r.ok / r.risks) * 100),
      }))
      .sort((a, b) => a.rate - b.rate);
  }, [coverages, lk]);

  const columns: Column<UnitRow>[] = [
    {
      key: "name",
      header: "Đơn vị",
      minWidth: 260,
      render: (r) => (
        <TitleCell
          title={r.name}
          sub={`${r.controls} lượt gắn kiểm soát`}
        />
      ),
    },
    {
      key: "risks",
      header: "Rủi ro",
      width: 100,
      align: "center",
      render: (r) => <b className="text-text-primary">{r.risks}</b>,
    },
    {
      key: "ok",
      header: "Phủ tốt",
      width: 110,
      align: "center",
      render: (r) => (
        <span className="text-lv-low-text">{r.ok}</span>
      ),
    },
    {
      key: "weak",
      header: "Kiểm soát yếu",
      width: 130,
      align: "center",
      render: (r) => (
        <span className={cn(r.weak > 0 && "font-medium text-lv-medium-text")}>
          {r.weak}
        </span>
      ),
    },
    {
      key: "gap",
      header: "Chưa có kiểm soát",
      width: 150,
      align: "center",
      render: (r) => (
        <span
          className={cn(
            r.gap > 0 ? "font-medium text-danger" : "text-text-secondary"
          )}
        >
          {r.gap}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Tỷ lệ phủ tốt",
      width: 190,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
            <span
              className={cn(
                "block h-full rounded-full",
                r.rate >= 75
                  ? "bg-success"
                  : r.rate >= 40
                    ? "bg-warning"
                    : "bg-danger"
              )}
              style={{ width: `${r.rate}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-[12px] text-text-secondary">
            {r.rate}%
          </span>
        </span>
      ),
    },
  ];

  return (
    <ContentCard padded={false} className="overflow-hidden">
      <div className="flex h-14 items-center justify-between border-b border-border-light px-4">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Độ phủ kiểm soát theo đơn vị
        </h2>
        <span className="text-[12px] text-text-secondary">
          Sắp xếp theo tỷ lệ phủ tăng dần, đơn vị yếu nhất lên đầu
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        emptyTitle="Chưa có dữ liệu theo đơn vị"
        rowClassName={(r) => (r.gap > 0 ? "!bg-lv-critical-bg" : undefined)}
      />
    </ContentCard>
  );
}

/* ================================================================== */
/* Thẻ tổng quan                                        */
/* ================================================================== */

function ScoreCard({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  tone: "success" | "warning" | "high" | "danger";
  label: string;
  value: number;
  note: string;
}) {
  const style: Record<string, string> = {
    success: "bg-lv-low-bg text-lv-low-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    high: "bg-lv-high-bg text-lv-high-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
  };

  return (
    <ContentCard className="flex items-start gap-3">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
          style[tone]
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-text-secondary">{label}</p>
        <p className="text-[22px] leading-7 font-semibold text-text-primary">
          {value}
        </p>
        <p className="text-[11px] leading-4 text-text-hint">{note}</p>
      </div>
    </ContentCard>
  );
}

/* ================================================================== */
/* Hộp thoại chi tiết cặp rủi ro - kiểm soát                           */
/* ================================================================== */

function CellModal({
  pair,
  lk,
  onClose,
  onOpenRisk,
  onOpenControl,
}: {
  pair: { risk: Risk; control: Control } | null;
  lk: Lookups;
  onClose: () => void;
  onOpenRisk: (code: string) => void;
  onOpenControl: (code: string) => void;
}) {
  return (
    <Modal
      open={!!pair}
      onClose={onClose}
      size="lg"
      title="Cặp rủi ro - kiểm soát"
      description={
        pair ? `${pair.risk.code} được phủ bởi ${pair.control.code}` : undefined
      }
      footer={
        <>
          {pair && (
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenRisk(pair.risk.code)}
              >
                Xem rủi ro
              </Button>
              <Button
                variant="primary"
                onClick={() => onOpenControl(pair.control.code)}
              >
                Xem kiểm soát
              </Button>
            </>
          )}
        </>
      }
    >
      {pair && (
        <div className="flex flex-col gap-4">
          {/* Rủi ro */}
          <div className="rounded-ctrl border border-border-light p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
              <IconAlertTriangle size={16} className="text-lv-medium-text" />
              {pair.risk.code} - {pair.risk.name}
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-3">
              <ReadField label="Nhóm rủi ro">
                {lk.categoryName(pair.risk.categoryId)}
              </ReadField>
              <ReadField label="Đơn vị">
                {lk.unitName(pair.risk.unitId)}
              </ReadField>
              <ReadField label="Chủ sở hữu">
                <UserCell
                  name={lk.employeeName(pair.risk.ownerId, "Chưa gán")}
                  size={22}
                />
              </ReadField>
              <ReadField label="Điểm cố hữu">
                {inherentScoreOf(pair.risk)}
              </ReadField>
              <ReadField label="Điểm còn lại">
                <RiskBadge
                  level={residualLevelOf(pair.risk)}
                  score={residualScoreOf(pair.risk)}
                />
              </ReadField>
              <ReadField label="Phương án xử lý">
                {pair.risk.treatment}
              </ReadField>
            </div>
          </div>

          {/* Kiểm soát */}
          <div className="rounded-ctrl border border-border-light p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
              <IconShieldCheck size={16} className="text-brand" />
              {pair.control.code} - {pair.control.name}
              {pair.control.isKeyControl && (
                <Badge tone="brand" size="sm">
                  Trọng yếu
                </Badge>
              )}
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-3">
              <ReadField label="Loại kiểm soát">{pair.control.type}</ReadField>
              <ReadField label="Tính chất">{pair.control.nature}</ReadField>
              <ReadField label="Tần suất vận hành">
                {pair.control.frequency}
              </ReadField>
              <ReadField label="Người chịu trách nhiệm">
                <UserCell
                  name={lk.employeeName(pair.control.ownerId, "Chưa gán")}
                  size={22}
                />
              </ReadField>
              <ReadField label="Trạng thái">
                <StatusBadge status={pair.control.status} />
              </ReadField>
              <ReadField label="Kết quả kiểm tra gần nhất">
                {pair.control.lastTestResult ? (
                  <StatusBadge status={pair.control.lastTestResult} />
                ) : (
                  <span className="text-text-hint">Chưa đánh giá</span>
                )}
              </ReadField>
              <ReadField label="Sức khoẻ kiểm soát">
                {controlHealth(pair.control)} / 100
              </ReadField>
              <ReadField label="Chu kỳ kiểm tra">
                {testCycleOf(pair.control)} ngày
              </ReadField>
              <ReadField label="Hạn kiểm tra kế tiếp">
                {pair.control.status === "Đang hiệu lực"
                  ? formatDate(nextTestDate(pair.control)) || "--"
                  : "--"}
              </ReadField>
            </div>
          </div>

          {/* Nhận xét tự động */}
          <div className="flex flex-col gap-1.5">
            {!isControlActive(pair.control) && (
              <Note tone="danger">
                Kiểm soát chưa ở trạng thái Đang hiệu lực nên chưa thực sự bảo vệ
                rủi ro này.
              </Note>
            )}
            {isTestOverdue(pair.control) && (
              <Note tone="danger">
                Kiểm soát đã quá hạn kiểm tra hiệu lực, kết quả gần nhất không
                còn đủ tin cậy.
              </Note>
            )}
            {isNeverTested(pair.control) && (
              <Note tone="warning">
                Kiểm soát chưa từng được kiểm tra kể từ ngày hiệu lực{" "}
                {formatDate(pair.control.effectiveDate)}.
              </Note>
            )}
            {isTestFailed(pair.control) && (
              <Note tone="warning">
                Kết quả kiểm tra gần nhất là {pair.control.lastTestResult}, cần
                xem lại mức rủi ro còn lại đang khai báo.
              </Note>
            )}
            {requireTreatmentPlan(pair.risk) &&
              pair.control.type !== "Phòng ngừa" && (
                <Note tone="warning">
                  Rủi ro ở mức {residualLevelOf(pair.risk)} nhưng kiểm soát này
                  thuộc loại {pair.control.type}. Nên bổ sung kiểm soát phòng
                  ngừa.
                </Note>
              )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Note({
  tone,
  children,
}: {
  tone: "warning" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-ctrl border p-2.5 text-[12px] leading-4",
        tone === "danger"
          ? "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text"
          : "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text"
      )}
    >
      <IconAlertTriangle size={15} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}
