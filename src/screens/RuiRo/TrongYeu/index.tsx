"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconClockExclamation,
  IconDownload,
  IconShieldExclamation,
  IconStar,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  CodeCell,
  DataTable,
  EmptyState,
  FilterCombobox,
  Pagination,
  RiskBadge,
  SearchInput,
  Segments,
  StatusBadge,
  TableToolbar,
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
import { LevelDistributionBar } from "@/components/domain";
import { kppnRepo, riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  RISK_LEVEL_ORDER,
  inherentScoreOf,
  isReviewOverdue,
  requireTreatmentPlan,
  residualLevelOf,
  residualScoreOf,
  riskSearchText,
  summarizeRisks,
} from "@/lib/domain/risk-utils";
import type { Risk } from "@/lib/domain/schema";
import type { RiskLevelValue } from "@/lib/domain/enums";
import { formatDate, formatMoney } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { cn } from "@/lib/cn";

type Scope = "all" | "key" | "zero";

export default function RuiRoTrongYeuScreen() {
  const router = useRouter();
  const toast = useToast();
  const lk = useLookups();
  const risks = useCollection(riskRepo);
  const kppns = useCollection(kppnRepo);

  const [scope, setScope] = useState<Scope>("all");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [levels, setLevels] = useState<string[]>([]);

  /* Rủi ro trọng yếu hoặc không khoan nhượng, bỏ bản đã đóng */
  const source = useMemo(
    () =>
      risks.filter(
        (r) =>
          (r.isKeyRisk || r.isZeroTolerance) &&
          r.status !== "Đã đóng" &&
          r.status !== "Từ chối"
      ),
    [risks]
  );

  /** Số hành động KPPN đang mở của một rủi ro */
  const activeKppnCount = useMemo(() => {
    const map = new Map<string, number>();
    kppns.forEach((k) => {
      if (!k.riskId) return;
      if (k.status === "Huỷ" || k.status === "Hoàn thành") return;
      map.set(k.riskId, (map.get(k.riskId) ?? 0) + 1);
    });
    return map;
  }, [kppns]);

  const t = useTableState<Risk>(source, {
    getKey: (r) => r.id,
    searchText: (r) =>
      riskSearchText(r, [
        lk.unitName(r.unitId, ""),
        lk.employeeName(r.ownerId, ""),
      ]),
    filter: (r) => {
      if (scope === "key" && !r.isKeyRisk) return false;
      if (scope === "zero" && !r.isZeroTolerance) return false;
      if (unitId && r.unitId !== unitId) return false;
      if (levels.length > 0 && !levels.includes(residualLevelOf(r)))
        return false;
      return true;
    },
    sortValue: (r, key) => {
      switch (key) {
        case "code":
          return r.code;
        case "name":
          return r.name;
        case "unit":
          return lk.unitName(r.unitId, "");
        case "owner":
          return lk.employeeName(r.ownerId, "");
        case "inherent":
          return inherentScoreOf(r);
        case "residual":
          return RISK_LEVEL_ORDER[residualLevelOf(r)] * 100 + residualScoreOf(r);
        case "kppn":
          return activeKppnCount.get(r.id) ?? 0;
        case "loss":
          return r.estimatedLoss ?? -1;
        case "review":
          return r.reviewDate || "9999-12-31";
        case "status":
          return r.status;
        default:
          return null;
      }
    },
    defaultSort: { key: "residual", dir: "desc" },
    pageSize: 20,
    filterDeps: [scope, unitId, levels],
  });

  const summary = useMemo(() => summarizeRisks(t.rows), [t.rows]);

  const counts = useMemo(() => {
    const out: Record<RiskLevelValue, number> = {
      "Thấp": 0,
      "Trung bình": 0,
      "Cao": 0,
      "Trọng yếu": 0,
    };
    t.rows.forEach((r) => {
      out[residualLevelOf(r)] += 1;
    });
    return out;
  }, [t.rows]);

  /* Rủi ro cần chú ý: mức Cao trở lên mà chưa có KPPN đang mở */
  const missingPlan = useMemo(
    () =>
      t.rows.filter(
        (r) => requireTreatmentPlan(r) && (activeKppnCount.get(r.id) ?? 0) === 0
      ),
    [t.rows, activeKppnCount]
  );

  const columns: Column<Risk>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
      sortable: true,
      render: (r) => (
        <CodeCell
          code={r.code}
          onClick={() => router.push(`/rui-ro/so-dang-ky/${r.code}`)}
        />
      ),
    },
    {
      key: "name",
      header: "Tên rủi ro",
      minWidth: 320,
      sortable: true,
      render: (r) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{r.name}</span>
              {r.isKeyRisk && (
                <Tooltip content="Rủi ro trọng yếu">
                  <Badge tone="brand" size="sm">
                    TY
                  </Badge>
                </Tooltip>
              )}
              {r.isZeroTolerance && (
                <Tooltip content="Rủi ro không khoan nhượng">
                  <Badge tone="danger" size="sm">
                    KKN
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={lk.categoryName(r.categoryId)}
        />
      ),
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 170,
      sortable: true,
      render: (r) => lk.unitName(r.unitId),
    },
    {
      key: "owner",
      header: "Chủ sở hữu",
      width: 200,
      sortable: true,
      render: (r) => (
        <UserCell name={lk.employeeName(r.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "inherent",
      header: "Cố hữu",
      width: 90,
      align: "center",
      sortable: true,
      render: (r) => (
        <span className="text-text-secondary">{inherentScoreOf(r)}</span>
      ),
    },
    {
      key: "residual",
      header: "Còn lại",
      width: 150,
      sortable: true,
      render: (r) => (
        <RiskBadge level={residualLevelOf(r)} score={residualScoreOf(r)} />
      ),
    },
    {
      key: "kppn",
      header: "KPPN đang mở",
      width: 130,
      align: "center",
      sortable: true,
      render: (r) => {
        const n = activeKppnCount.get(r.id) ?? 0;
        const need = requireTreatmentPlan(r) && n === 0;
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[13px]",
              need ? "font-medium text-danger" : "text-text-secondary"
            )}
          >
            {need && <IconAlertTriangle size={14} />}
            {n}
          </span>
        );
      },
    },
    {
      key: "loss",
      header: "Tổn thất ước tính",
      width: 150,
      align: "right",
      sortable: true,
      render: (r) => formatMoney(r.estimatedLoss) || "--",
    },
    {
      key: "review",
      header: "Ngày rà soát",
      width: 130,
      sortable: true,
      render: (r) =>
        r.reviewDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              isReviewOverdue(r) && "font-medium text-danger"
            )}
          >
            {isReviewOverdue(r) && <IconClockExclamation size={14} />}
            {formatDate(r.reviewDate)}
          </span>
        ) : (
          <span className="text-text-hint">Chưa đặt</span>
        ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Rủi ro trọng yếu"
        subtitle="Danh mục rủi ro trọng yếu và rủi ro không khoan nhượng phục vụ báo cáo cấp cao"
        showBreadcrumb={false}
        actions={
          <Button
            variant="secondary"
            icon={<IconDownload size={16} />}
            onClick={() =>
              toast.info(
                "Đang xuất khẩu",
                `Chuẩn bị tệp báo cáo cho ${t.total} rủi ro (giả lập).`
              )
            }
          >
            Xuất khẩu
          </Button>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* ------------------------ Scorecard ------------------------ */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ScoreCard
              icon={<IconStar size={20} />}
              tone="brand"
              label="Rủi ro trọng yếu"
              value={summary.keyRisk}
              note="Được đánh dấu để báo cáo cấp cao"
            />
            <ScoreCard
              icon={<IconShieldExclamation size={20} />}
              tone="danger"
              label="Không khoan nhượng"
              value={summary.zeroTolerance}
              note="Không được chọn phương án Chấp nhận"
            />
            <ScoreCard
              icon={<IconAlertTriangle size={20} />}
              tone="high"
              label="Thiếu kế hoạch KPPN"
              value={missingPlan.length}
              note="Mức Cao trở lên mà chưa có hành động đang mở"
            />
            <ScoreCard
              icon={<IconClockExclamation size={20} />}
              tone="warning"
              label="Quá hạn rà soát"
              value={summary.reviewOverdue}
              note="Cần cập nhật lại đánh giá rủi ro"
            />
          </div>

          {/* --------------------- Phân bố mức độ --------------------- */}
          <ContentCard>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-text-primary">
                Phân bố theo mức rủi ro còn lại
              </h2>
              <span className="text-[12px] text-text-secondary">
                Tổn thất ước tính:{" "}
                <b className="text-text-primary">
                  {formatMoney(summary.totalEstimatedLoss)}
                </b>{" "}
                VNĐ
              </span>
            </div>
            <LevelDistributionBar counts={counts} />
          </ContentCard>

          {/* -------------------- Cảnh báo thiếu KPPN ------------------ */}
          {missingPlan.length > 0 && (
            <div className="rounded-card border border-lv-medium-border bg-lv-medium-bg p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-medium-text">
                <IconAlertTriangle size={16} />
                {missingPlan.length} rủi ro mức Cao trở lên chưa có hành động
                khắc phục và phòng ngừa đang triển khai
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {missingPlan.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => router.push(`/rui-ro/so-dang-ky/${r.code}`)}
                    className="rounded-badge border border-lv-medium-border bg-white px-2 py-0.5 text-[12px] font-medium text-lv-medium-text transition-colors hover:bg-lv-medium-bg"
                  >
                    {r.code}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* --------------------------- Bảng -------------------------- */}
          <ContentCard padded={false} className="overflow-hidden">
            <TableToolbar
              left={
                <>
                  <Segments
                    items={[
                      { key: "all", label: "Tất cả" },
                      { key: "key", label: "Trọng yếu" },
                      { key: "zero", label: "Không khoan nhượng" },
                    ]}
                    value={scope}
                    onChange={(k) => setScope(k as Scope)}
                  />
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, tên rủi ro"
                    width={260}
                  />
                </>
              }
              right={
                <>
                  <FilterCombobox
                    label="Đơn vị:"
                    options={lk.unitOptions}
                    value={unitId}
                    onChange={setUnitId}
                    searchable
                    width={200}
                  />
                  <FilterCombobox
                    label="Mức còn lại:"
                    multiple
                    options={(
                      ["Thấp", "Trung bình", "Cao", "Trọng yếu"] as const
                    ).map((v) => ({ value: v, label: v }))}
                    value={levels}
                    onChange={setLevels}
                    width={200}
                  />
                </>
              }
            />

            {source.length === 0 ? (
              <EmptyState
                icon={<IconStar size={24} />}
                title="Chưa có rủi ro trọng yếu"
                description="Đánh dấu Rủi ro trọng yếu hoặc Không khoan nhượng ở màn hình thêm/sửa rủi ro."
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={t.pageRows}
                  getKey={(r) => r.id}
                  sort={t.sort}
                  onSort={t.toggleSort}
                  onRowClick={(r) =>
                    router.push(`/rui-ro/so-dang-ky/${r.code}`)
                  }
                  emptyTitle="Không có rủi ro phù hợp"
                  emptyDescription="Thử đổi phạm vi hoặc bỏ bớt điều kiện lọc."
                  rowClassName={(r) =>
                    requireTreatmentPlan(r) &&
                    (activeKppnCount.get(r.id) ?? 0) === 0
                      ? "!bg-lv-critical-bg"
                      : undefined
                  }
                />
                <Pagination
                  page={t.page}
                  pageCount={t.pageCount}
                  pageSize={t.pageSize}
                  total={t.total}
                  onPageChange={t.setPage}
                  onPageSizeChange={t.setPageSize}
                />
              </>
            )}
          </ContentCard>
        </div>
      </PageBody>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */

function ScoreCard({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  tone: "brand" | "danger" | "high" | "warning";
  label: string;
  value: number;
  note: string;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    danger: "bg-lv-critical-bg text-lv-critical-text",
    high: "bg-lv-high-bg text-lv-high-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
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
