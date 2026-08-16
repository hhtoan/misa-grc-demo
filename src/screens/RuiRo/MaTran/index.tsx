"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconChartGridDots,
  IconDownload,
  IconFilterOff,
  IconInfoCircle,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  CodeCell,
  DataTable,
  EmptyState,
  FilterCombobox,
  RiskBadge,
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
import {
  LevelDistributionBar,
  RiskMatrixHeatmap,
  risksToPoints,
  type MatrixMode,
} from "@/components/domain";
import { riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  IMPACT_LABELS,
  LIKELIHOOD_LABELS,
  riskLevelOf,
  riskScore,
} from "@/lib/domain/matrix";
import { RISK_STATUSES, type RiskLevelValue } from "@/lib/domain/enums";
import {
  inherentScoreOf,
  residualLevelOf,
  residualScoreOf,
} from "@/lib/domain/risk-utils";
import type { Risk } from "@/lib/domain/schema";
import { formatMoney } from "@/lib/format";

const STATUS_OPTIONS = RISK_STATUSES.map((s) => ({ value: s, label: s }));

const EMPTY_COUNT: Record<RiskLevelValue, number> = {
  "Thấp": 0,
  "Trung bình": 0,
  "Cao": 0,
  "Trọng yếu": 0,
};

export default function MaTranRuiRoScreen() {
  const router = useRouter();
  const toast = useToast();
  const lk = useLookups();
  const risks = useCollection(riskRepo);

  const [mode, setMode] = useState<MatrixMode>("residual");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [onlyKeyRisk, setOnlyKeyRisk] = useState(false);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [cell, setCell] = useState<{ likelihood: number; impact: number } | null>(
    null
  );

  /* --------------------------- Lọc dữ liệu --------------------------- */

  const filtered = useMemo(
    () =>
      risks.filter((r) => {
        if (!includeClosed && (r.status === "Đã đóng" || r.status === "Từ chối"))
          return false;
        if (statuses.length > 0 && !statuses.includes(r.status)) return false;
        if (unitId && r.unitId !== unitId) return false;
        if (categoryId && r.categoryId !== categoryId) return false;
        if (ownerId && r.ownerId !== ownerId) return false;
        if (onlyKeyRisk && !r.isKeyRisk) return false;
        return true;
      }),
    [risks, includeClosed, statuses, unitId, categoryId, ownerId, onlyKeyRisk]
  );

  const points = useMemo(() => risksToPoints(filtered, mode), [filtered, mode]);

  const pairOf = (r: Risk) =>
    mode === "inherent"
      ? { l: r.inherentLikelihood, i: r.inherentImpact }
      : { l: r.residualLikelihood, i: r.residualImpact };

  const counts = useMemo(() => {
    const out = { ...EMPTY_COUNT };
    filtered.forEach((r) => {
      const { l, i } = pairOf(r);
      out[riskLevelOf(l, i)] += 1;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, mode]);

  const cellRisks = useMemo(() => {
    if (!cell) return [];
    return filtered.filter((r) => {
      const { l, i } = pairOf(r);
      return l === cell.likelihood && i === cell.impact;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, cell, mode]);

  const topRisks = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => {
          const sa =
            mode === "inherent" ? inherentScoreOf(a) : residualScoreOf(a);
          const sb =
            mode === "inherent" ? inherentScoreOf(b) : residualScoreOf(b);
          return sb - sa;
        })
        .slice(0, 6),
    [filtered, mode]
  );

  const filterCount =
    statuses.length +
    (unitId ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (ownerId ? 1 : 0) +
    (onlyKeyRisk ? 1 : 0) +
    (includeClosed ? 1 : 0);

  function resetFilter() {
    setStatuses([]);
    setUnitId(null);
    setCategoryId(null);
    setOwnerId(null);
    setOnlyKeyRisk(false);
    setIncludeClosed(false);
    setCell(null);
  }

  const totalLoss = filtered.reduce((s, r) => s + (r.estimatedLoss ?? 0), 0);

  /* ----------------------------- Cột bảng ---------------------------- */

  const columns: Column<Risk>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
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
      render: (r) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{r.name}</span>
              {r.isKeyRisk && (
                <Badge tone="brand" size="sm">
                  TY
                </Badge>
              )}
              {r.isZeroTolerance && (
                <Badge tone="danger" size="sm">
                  KKN
                </Badge>
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
      render: (r) => lk.unitName(r.unitId),
    },
    {
      key: "owner",
      header: "Chủ sở hữu",
      width: 200,
      render: (r) => (
        <UserCell name={lk.employeeName(r.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "score",
      header: mode === "inherent" ? "Điểm cố hữu" : "Điểm còn lại",
      width: 150,
      render: (r) => {
        const { l, i } = pairOf(r);
        return <RiskBadge level={riskLevelOf(l, i)} score={riskScore(l, i)} />;
      },
    },
    {
      key: "loss",
      header: "Tổn thất ước tính",
      width: 150,
      align: "right",
      render: (r) => formatMoney(r.estimatedLoss) || "--",
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  /* ------------------------------ Render ----------------------------- */

  return (
    <PageContainer>
      <PageHeader
        title="Ma trận rủi ro"
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
                  `Chuẩn bị tệp ma trận cho ${filtered.length} rủi ro (giả lập).`
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
          {/* ------------------------- Bộ lọc ------------------------- */}
          <ContentCard className="flex flex-wrap items-center gap-2">
            <Segments
              items={[
                { key: "residual", label: "Rủi ro còn lại" },
                { key: "inherent", label: "Rủi ro cố hữu" },
              ]}
              value={mode}
              onChange={(k) => {
                setMode(k as MatrixMode);
                setCell(null);
              }}
            />

            <span className="mx-1 h-6 w-px bg-border-light" />

            <FilterCombobox
              label="Trạng thái:"
              multiple
              options={STATUS_OPTIONS}
              value={statuses}
              onChange={(v) => {
                setStatuses(v);
                setCell(null);
              }}
              width={200}
            />
            <FilterCombobox
              label="Đơn vị:"
              options={lk.unitOptions}
              value={unitId}
              onChange={(v) => {
                setUnitId(v);
                setCell(null);
              }}
              searchable
              width={200}
            />
            <FilterCombobox
              label="Nhóm:"
              options={lk.riskCategoryOptions}
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
                setCell(null);
              }}
              searchable
              width={210}
            />
            <FilterCombobox
              label="Chủ sở hữu:"
              options={lk.employeeOptions}
              value={ownerId}
              onChange={(v) => {
                setOwnerId(v);
                setCell(null);
              }}
              searchable
              width={220}
            />

            <Checkbox
              label="Chỉ rủi ro trọng yếu"
              checked={onlyKeyRisk}
              onChange={(e) => {
                setOnlyKeyRisk(e.target.checked);
                setCell(null);
              }}
            />
            <Checkbox
              label="Gồm cả rủi ro đã đóng"
              checked={includeClosed}
              onChange={(e) => {
                setIncludeClosed(e.target.checked);
                setCell(null);
              }}
            />
          </ContentCard>

          {/* ---------------------- Heatmap + phụ ---------------------- */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <ContentCard>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-text-primary">
                  {mode === "inherent"
                    ? "Phân bố rủi ro cố hữu (trước kiểm soát)"
                    : "Phân bố rủi ro còn lại (sau kiểm soát)"}
                </h2>
                <span className="text-[12px] text-text-secondary">
                  Bấm vào ô để xem danh sách rủi ro trong ô đó
                </span>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={<IconChartGridDots size={24} />}
                  title="Không có rủi ro phù hợp"
                  description="Thử bỏ bớt điều kiện lọc phía trên."
                />
              ) : (
                <RiskMatrixHeatmap
                  points={points}
                  selected={cell}
                  onSelectCell={(c) =>
                    setCell(
                      c ? { likelihood: c.likelihood, impact: c.impact } : null
                    )
                  }
                  showCodes
                  cellHeight={80}
                />
              )}
            </ContentCard>

            <div className="flex flex-col gap-4">
              <ContentCard>
                <h3 className="mb-2 text-[14px] font-semibold text-text-primary">
                  Tổng quan
                </h3>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-text-secondary">
                      Số rủi ro đang xét
                    </span>
                    <b className="text-[20px] text-text-primary">
                      {filtered.length}
                    </b>
                  </div>
                  <LevelDistributionBar counts={counts} />
                  <div className="flex items-baseline justify-between border-t border-border-light pt-2">
                    <span className="text-[12px] text-text-secondary">
                      Tổn thất ước tính
                    </span>
                    <b className="text-[13px] text-text-primary">
                      {formatMoney(totalLoss)} VNĐ
                    </b>
                  </div>
                </div>
              </ContentCard>

              <ContentCard>
                <h3 className="mb-2 text-[14px] font-semibold text-text-primary">
                  Rủi ro điểm cao nhất
                </h3>
                {topRisks.length === 0 ? (
                  <p className="text-[13px] text-text-hint">Chưa có dữ liệu.</p>
                ) : (
                  <ol className="flex flex-col gap-1.5">
                    {topRisks.map((r) => {
                      const { l, i } = pairOf(r);
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-2 rounded-ctrl border border-border-light px-2 py-1.5"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/rui-ro/so-dang-ky/${r.code}`)
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-[12px] font-medium text-brand">
                              {r.code}
                            </span>
                            <span className="block truncate text-[12px] text-text-secondary">
                              {r.name}
                            </span>
                          </button>
                          <RiskBadge
                            level={riskLevelOf(l, i)}
                            score={riskScore(l, i)}
                          />
                        </li>
                      );
                    })}
                  </ol>
                )}
              </ContentCard>

              <div className="flex gap-2 rounded-card border border-lv-info-border bg-lv-info-bg p-3 text-[12px] leading-4 text-lv-info-text">
                <IconInfoCircle size={16} className="mt-px shrink-0" />
                <span>
                  Điểm rủi ro = Khả năng xảy ra × Mức độ ảnh hưởng. Ngưỡng quy
                  đổi: 1-4 Thấp, 5-9 Trung bình, 10-15 Cao, 16-25 Trọng yếu.
                </span>
              </div>
            </div>
          </div>

          {/* ------------------- Danh sách theo ô chọn ------------------ */}
          {cell && (
            <ContentCard padded={false} className="overflow-hidden">
              <div className="flex h-14 flex-wrap items-center gap-2 border-b border-border-light px-4">
                <h3 className="text-[14px] font-semibold text-text-primary">
                  Rủi ro tại ô đã chọn
                </h3>
                <Tooltip content="Bấm lại vào ô trên ma trận để bỏ chọn">
                  <Badge tone="brand">
                    {LIKELIHOOD_LABELS[cell.likelihood]} ×{" "}
                    {IMPACT_LABELS[cell.impact]} = điểm{" "}
                    {riskScore(cell.likelihood, cell.impact)}
                  </Badge>
                </Tooltip>
                <span className="text-[12px] text-text-secondary">
                  {cellRisks.length} bản ghi
                </span>
                <Button
                  variant="text"
                  size="sm"
                  compact
                  className="ml-auto"
                  onClick={() => setCell(null)}
                >
                  Bỏ chọn ô
                </Button>
              </div>

              <DataTable
                columns={columns}
                rows={cellRisks}
                getKey={(r) => r.id}
                onRowClick={(r) => router.push(`/rui-ro/so-dang-ky/${r.code}`)}
                emptyTitle="Ô này chưa có rủi ro nào"
              />
            </ContentCard>
          )}
        </div>
      </PageBody>
    </PageContainer>
  );
}
