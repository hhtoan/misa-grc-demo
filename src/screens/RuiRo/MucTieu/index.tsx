"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCloudDownload,
  IconInfoCircle,
  IconLock,
  IconTarget,
  IconTrendingUp,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  CodeCell,
  DataTable,
  EmptyState,
  FilterCombobox,
  Modal,
  Pagination,
  ReadField,
  RiskBadge,
  SearchInput,
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
import { LEVEL_TONE } from "@/components/domain";
import { objectiveRepo, riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { BSC_PERSPECTIVES, OBJECTIVE_LEVELS } from "@/lib/domain/enums";
import type { RiskLevelValue } from "@/lib/domain/enums";
import {
  RISK_LEVEL_ORDER,
  residualLevelOf,
  residualScoreOf,
} from "@/lib/domain/risk-utils";
import type { Objective, Risk } from "@/lib/domain/schema";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { syncObjectives, useIntegrationStates } from "@/lib/integrations/mock";
import { cn } from "@/lib/cn";

const PERSPECTIVE_OPTIONS = BSC_PERSPECTIVES.map((v) => ({
  value: v,
  label: v,
}));
const LEVEL_OPTIONS = OBJECTIVE_LEVELS.map((v) => ({ value: v, label: v }));

/* ================================================================== */

export default function MucTieuScreen() {
  const router = useRouter();
  const toast = useToast();
  const lk = useLookups();

  const objectives = useCollection(objectiveRepo);
  const risks = useCollection(riskRepo);
  const states = useIntegrationStates();

  const [perspectives, setPerspectives] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Objective | null>(null);
  const [syncing, setSyncing] = useState(false);

  /* ---------------- Bản đồ rủi ro theo mục tiêu ---------------- */

  const riskMap = useMemo(() => {
    const map = new Map<string, Risk[]>();
    risks.forEach((r) => {
      if (r.status === "Đã đóng" || r.status === "Từ chối") return;
      r.objectiveIds.forEach((oid) => {
        const arr = map.get(oid);
        if (arr) arr.push(r);
        else map.set(oid, [r]);
      });
    });
    return map;
  }, [risks]);

  function maxLevelOf(objectiveId: string): RiskLevelValue | null {
    const rows = riskMap.get(objectiveId) ?? [];
    if (rows.length === 0) return null;
    return rows.reduce<RiskLevelValue>((acc, r) => {
      const lv = residualLevelOf(r);
      return RISK_LEVEL_ORDER[lv] > RISK_LEVEL_ORDER[acc] ? lv : acc;
    }, "Thấp");
  }

  /* --------------------------- Table --------------------------- */

  const t = useTableState<Objective>(objectives, {
    getKey: (o) => o.id,
    searchText: (o) =>
      `${o.code} ${o.name} ${o.perspective} ${o.target} ${lk.unitName(o.unitId, "")}`,
    filter: (o) => {
      if (perspectives.length > 0 && !perspectives.includes(o.perspective))
        return false;
      if (levels.length > 0 && !levels.includes(o.level)) return false;
      if (unitId && o.unitId !== unitId) return false;
      return true;
    },
    sortValue: (o, key) => {
      switch (key) {
        case "code":
          return o.code;
        case "name":
          return o.name;
        case "perspective":
          return o.perspective;
        case "level":
          return o.level;
        case "unit":
          return lk.unitName(o.unitId, "");
        case "owner":
          return lk.employeeName(o.ownerId, "");
        case "progress":
          return o.progress;
        case "risk": {
          const lv = maxLevelOf(o.id);
          const n = riskMap.get(o.id)?.length ?? 0;
          return (lv ? RISK_LEVEL_ORDER[lv] : 0) * 100 + n;
        }
        default:
          return null;
      }
    },
    defaultSort: { key: "code", dir: "asc" },
    pageSize: 20,
    filterDeps: [perspectives, levels, unitId],
  });

  /* -------------------------- Thống kê -------------------------- */

  const stat = useMemo(() => {
    const total = objectives.length;
    const withRisk = objectives.filter(
      (o) => (riskMap.get(o.id)?.length ?? 0) > 0
    ).length;
    const avgProgress =
      total === 0
        ? 0
        : Math.round(objectives.reduce((s, o) => s + o.progress, 0) / total);
    const highRisk = objectives.filter((o) => {
      const lv = maxLevelOf(o.id);
      return lv === "Cao" || lv === "Trọng yếu";
    }).length;
    return { total, withRisk, noRisk: total - withRisk, avgProgress, highRisk };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectives, riskMap]);

  async function runSync() {
    setSyncing(true);
    const res = await syncObjectives();
    setSyncing(false);
    if (res.ok) toast.success(res.message, res.details.slice(0, 2).join(" | "));
    else toast.error("Không đồng bộ được", res.message);
  }

  /* --------------------------- Cột bảng ------------------------- */

  const columns: Column<Objective>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
      sortable: true,
      render: (o) => <CodeCell code={o.code} onClick={() => setDetail(o)} />,
    },
    {
      key: "name",
      header: "Tên mục tiêu",
      minWidth: 320,
      sortable: true,
      render: (o) => (
        <TitleCell
          title={o.name}
          sub={o.target ? `Chỉ tiêu: ${o.target}` : o.period}
        />
      ),
    },
    {
      key: "perspective",
      header: "Khía cạnh BSC",
      width: 170,
      sortable: true,
      render: (o) => <Badge tone="neutral">{o.perspective}</Badge>,
    },
    {
      key: "level",
      header: "Cấp",
      width: 110,
      sortable: true,
      render: (o) => <span className="text-text-secondary">{o.level}</span>,
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 170,
      sortable: true,
      render: (o) => lk.unitName(o.unitId),
    },
    {
      key: "owner",
      header: "Người phụ trách",
      width: 200,
      sortable: true,
      render: (o) => (
        <UserCell name={lk.employeeName(o.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "progress",
      header: "Tiến độ",
      width: 150,
      sortable: true,
      render: (o) => <ProgressBar value={o.progress} />,
    },
    {
      key: "risk",
      header: "Rủi ro liên quan",
      width: 190,
      sortable: true,
      render: (o) => {
        const rows = riskMap.get(o.id) ?? [];
        const lv = maxLevelOf(o.id);
        if (rows.length === 0)
          return (
            <Tooltip content="Mục tiêu chưa được nhận diện rủi ro nào">
              <span className="inline-flex items-center gap-1 text-[12px] text-text-hint">
                <IconAlertTriangle size={14} />
                Chưa gắn rủi ro
              </span>
            </Tooltip>
          );
        return (
          <span className="flex items-center gap-1.5">
            <b className="text-[13px] text-text-primary">{rows.length}</b>
            <span className="text-[12px] text-text-secondary">rủi ro</span>
            {lv && (
              <Badge tone={LEVEL_TONE[lv]} size="sm" dot>
                {lv}
              </Badge>
            )}
          </span>
        );
      },
    },
  ];

  /* ------------------------------ Render ------------------------ */

  const syncState = states["amis-muc-tieu"];

  return (
    <PageContainer>
      <PageHeader
        title="Mục tiêu"
        actions={
          <Button
            variant="primary"
            icon={<IconCloudDownload size={16} />}
            loading={syncing}
            onClick={runSync}
          >
            Đồng bộ từ AMIS Mục tiêu
          </Button>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* --------------------- Dải thông tin --------------------- */}
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-lv-info-border bg-lv-info-bg px-3 py-2.5 text-[12px] leading-4 text-lv-info-text">
            <IconLock size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">
              Mục tiêu được đồng bộ <b>một chiều</b> từ AMIS Mục tiêu, chỉ đọc
              trong GRC. Mọi thay đổi về tên, chỉ tiêu và tiến độ phải thực hiện
              tại hệ thống nguồn.
            </span>
            <span className="shrink-0">
              {syncState.connected ? (
                <Badge tone="success" dot>
                  Đang kết nối
                </Badge>
              ) : (
                <Badge tone="danger" dot>
                  Đã ngắt kết nối
                </Badge>
              )}
            </span>
            <span className="shrink-0 opacity-80">
              {syncState.lastSyncedAt
                ? `Đồng bộ gần nhất ${formatDateTime(syncState.lastSyncedAt)}`
                : "Chưa đồng bộ lần nào"}
            </span>
          </div>

          {/* ----------------------- Thẻ tổng quan ------------------- */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <MiniCard
              icon={<IconTarget size={18} />}
              tone="brand"
              label="Tổng mục tiêu"
              value={stat.total}
              note={`${stat.withRisk} mục tiêu đã nhận diện rủi ro`}
            />
            <MiniCard
              icon={<IconTrendingUp size={18} />}
              tone="success"
              label="Tiến độ bình quân"
              value={`${stat.avgProgress}%`}
              note="Tính trên toàn bộ mục tiêu"
            />
            <MiniCard
              icon={<IconAlertTriangle size={18} />}
              tone="high"
              label="Có rủi ro mức Cao trở lên"
              value={stat.highRisk}
              note="Cần ưu tiên kiểm soát"
            />
            <MiniCard
              icon={<IconInfoCircle size={18} />}
              tone="warning"
              label="Chưa gắn rủi ro"
              value={stat.noRisk}
              note="Cần rà soát nhận diện rủi ro"
            />
          </div>

          {/* -------------------------- Bảng ------------------------- */}
          <ContentCard padded={false} className="overflow-hidden">
            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, tên mục tiêu, chỉ tiêu"
                    width={300}
                  />
                  <FilterCombobox
                    label="Khía cạnh:"
                    multiple
                    options={PERSPECTIVE_OPTIONS}
                    value={perspectives}
                    onChange={setPerspectives}
                    width={220}
                  />
                  <FilterCombobox
                    label="Cấp:"
                    multiple
                    options={LEVEL_OPTIONS}
                    value={levels}
                    onChange={setLevels}
                    width={180}
                  />
                  <FilterCombobox
                    label="Đơn vị:"
                    options={lk.unitOptions}
                    value={unitId}
                    onChange={setUnitId}
                    searchable
                    width={210}
                  />
                </>
              }
              right={
                <span className="text-[12px] text-text-secondary">
                  {t.total} / {objectives.length} mục tiêu
                </span>
              }
            />

            {objectives.length === 0 ? (
              <EmptyState
                icon={<IconTarget size={24} />}
                title="Chưa có mục tiêu nào"
                description="Bấm Đồng bộ từ AMIS Mục tiêu để nạp danh sách mục tiêu BSC/OKR."
                action={
                  <Button
                    variant="primary"
                    icon={<IconCloudDownload size={16} />}
                    loading={syncing}
                    onClick={runSync}
                  >
                    Đồng bộ ngay
                  </Button>
                }
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={t.pageRows}
                  getKey={(o) => o.id}
                  sort={t.sort}
                  onSort={t.toggleSort}
                  onRowClick={setDetail}
                  emptyTitle="Không có mục tiêu phù hợp"
                  emptyDescription="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá."
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

      {/* ========================= Chi tiết ========================= */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail ? `${detail.code} - ${detail.name}` : ""}
        headerRight={
          detail ? <Badge tone="brand">{detail.perspective}</Badge> : undefined
        }
        footer={
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Đóng
          </Button>
        }
      >
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
              <ReadField label="Cấp mục tiêu">{detail.level}</ReadField>
              <ReadField label="Đơn vị">{lk.unitName(detail.unitId)}</ReadField>
              <ReadField label="Người phụ trách">
                <UserCell name={lk.employeeName(detail.ownerId)} size={22} />
              </ReadField>
              <ReadField label="Kỳ áp dụng">{detail.period}</ReadField>
              <ReadField label="Chỉ tiêu">{detail.target || "--"}</ReadField>
              <ReadField label="Tiến độ">
                <ProgressBar value={detail.progress} />
              </ReadField>
              <ReadField label="Nguồn dữ liệu">{detail.source}</ReadField>
              <ReadField label="Đồng bộ gần nhất" className="md:col-span-2">
                {formatDateTime(detail.syncedAt) || "--"}
              </ReadField>
            </div>

            <div className="border-t border-border-light pt-3">
              <h3 className="mb-2 text-[14px] font-semibold text-text-primary">
                Rủi ro ảnh hưởng tới mục tiêu (
                {riskMap.get(detail.id)?.length ?? 0})
              </h3>

              {(riskMap.get(detail.id)?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg px-3 py-2.5 text-[12px] text-lv-medium-text">
                  <IconAlertTriangle size={16} className="shrink-0" />
                  Mục tiêu này chưa được nhận diện rủi ro nào. Nên rà soát lại
                  để bảo đảm mục tiêu được bảo vệ.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(riskMap.get(detail.id) ?? []).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setDetail(null);
                        router.push(`/rui-ro/so-dang-ky/${r.code}`);
                      }}
                      className="flex items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
                    >
                      <span className="w-[130px] shrink-0 text-[12px] font-medium text-brand">
                        {r.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                        {r.name}
                      </span>
                      <RiskBadge
                        level={residualLevelOf(r)}
                        score={residualScoreOf(r)}
                      />
                      <StatusBadge status={r.status} />
                    </button>
                  ))}
                  <p className="mt-1 text-right text-[12px] text-text-secondary">
                    Tổng tổn thất ước tính:{" "}
                    <b className="text-text-primary">
                      {formatMoney(
                        (riskMap.get(detail.id) ?? []).reduce(
                          (s, r) => s + (r.estimatedLoss ?? 0),
                          0
                        )
                      )}
                    </b>{" "}
                    VNĐ
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}

/* ================================================================== */

function ProgressBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-success" : value >= 50 ? "bg-brand" : "bg-warning";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
        <span
          className={cn("block h-full rounded-full", color)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
      <span className="w-9 shrink-0 text-right text-[12px] text-text-secondary">
        {value}%
      </span>
    </span>
  );
}

function MiniCard({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  tone: "brand" | "success" | "warning" | "high";
  label: string;
  value: number | string;
  note: string;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    success: "bg-lv-low-bg text-lv-low-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    high: "bg-lv-high-bg text-lv-high-text",
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
        <p className="truncate text-[11px] text-text-hint">{note}</p>
      </div>
    </ContentCard>
  );
}
