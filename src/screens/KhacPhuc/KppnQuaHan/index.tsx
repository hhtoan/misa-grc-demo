"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuilding,
  IconCalendarPlus,
  IconClockExclamation,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFlame,
  IconLayoutList,
  IconRefresh,
  IconUsers,
} from "@tabler/icons-react";
import {
  Badge,
  BulkActionBar,
  BulkButton,
  Button,
  Checkbox,
  CodeCell,
  DataTable,
  DateInput,
  EmptyState,
  FilterCombobox,
  IconButton,
  Modal,
  Pagination,
  RiskBadge,
  RowActions,
  SearchInput,
  Segments,
  StatusBadge,
  TableToolbar,
  Tabs,
  Textarea,
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
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { EXECUTION_SYSTEMS, KPPN_TYPES } from "@/lib/domain/enums";
import {
  canPushToSource,
  expectedProgress,
  isKppnBehindSchedule,
  isKppnFinished,
  isKppnOverdue,
  isSyncStale,
  kppnDaysToDue,
  kppnOverdueDays,
  kppnSearchText,
} from "@/lib/domain/kppn-utils";
import type { Deficiency, Kppn } from "@/lib/domain/schema";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  toInputDate,
} from "@/lib/format";
import { useTableState } from "@/lib/table";
import {
  pullKppnFromSource,
  pushKppnToSource,
  useIntegrationStates,
} from "@/lib/integrations/mock";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Phân nhóm mức độ trễ                                        */
/* ================================================================== */

type LateBucket = "low" | "medium" | "high" | "critical";

const BUCKET_META: Record<
  LateBucket,
  {
    label: string;
    range: string;
    tone: "warning" | "high" | "danger";
    note: string;
  }
> = {
  low: {
    label: "Trễ nhẹ",
    range: "1 đến 7 ngày",
    tone: "warning",
    note: "Nhắc người thực hiện đẩy nhanh tiến độ",
  },
  medium: {
    label: "Trễ vừa",
    range: "8 đến 30 ngày",
    tone: "warning",
    note: "Cần rà soát nguyên nhân chậm và cam kết mốc mới",
  },
  high: {
    label: "Trễ nặng",
    range: "31 đến 90 ngày",
    tone: "high",
    note: "Báo cáo lên cấp quản lý đơn vị, cân nhắc gia hạn chính thức",
  },
  critical: {
    label: "Trễ nghiêm trọng",
    range: "trên 90 ngày",
    tone: "danger",
    note: "Đưa vào báo cáo Ban điều hành, xem xét đổi phương án",
  },
};

function bucketOf(days: number): LateBucket {
  if (days > 90) return "critical";
  if (days > 30) return "high";
  if (days > 7) return "medium";
  return "low";
}

const BUCKET_ORDER: LateBucket[] = ["critical", "high", "medium", "low"];

const TYPE_OPTIONS = KPPN_TYPES.map((v) => ({ value: v, label: v }));
const SYSTEM_OPTIONS = EXECUTION_SYSTEMS.map((v) => ({ value: v, label: v }));

type TabKey = "overdue" | "behind" | "stale";
type ViewMode = "list" | "unit" | "assignee";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function KppnQuaHanScreen() {
  const router = useRouter();
  const toast = useToast();
  const { hasRole } = useSession();
  const lk = useLookups();

  const kppns = useCollection(kppnRepo);
  const deficiencies = useCollection(deficiencyRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);
  const states = useIntegrationStates();

  const canEdit = hasRole("admin", "qtrr", "owner");
  const canExtend = hasRole("admin", "qtrr");

  /* --------------------- Bản đồ tra cứu nguồn -------------------- */

  const defMap = useMemo(
    () => new Map(deficiencies.map((d) => [d.id, d])),
    [deficiencies],
  );
  const riskMap = useMemo(() => new Map(risks.map((r) => [r.id, r])), [risks]);
  const eventMap = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  function sourceOf(k: Kppn) {
    if (k.deficiencyId) {
      const d = defMap.get(k.deficiencyId);
      if (d)
        return {
          code: d.code,
          label: d.name,
          href: `/khac-phuc/diem-yeu/${d.code}`,
          severity: d.severity,
        };
    }
    if (k.eventId) {
      const e = eventMap.get(k.eventId);
      if (e)
        return {
          code: e.code,
          label: e.name,
          href: `/su-kien/so-theo-doi/${e.code}`,
          severity: e.severity,
        };
    }
    if (k.riskId) {
      const r = riskMap.get(k.riskId);
      if (r)
        return {
          code: r.code,
          label: r.name,
          href: `/rui-ro/so-dang-ky/${r.code}`,
          severity: undefined,
        };
    }
    return null;
  }

  /* ------------------------- Tập cần can thiệp ------------------- */

  /** Toàn bộ hành động đang có vấn đề tiến độ */
  const attention = useMemo(
    () =>
      kppns.filter(
        (k) =>
          !isKppnFinished(k) &&
          (isKppnOverdue(k) || isKppnBehindSchedule(k) || isSyncStale(k)),
      ),
    [kppns],
  );

  /* ---------------------------- Bộ lọc ---------------------------- */

  const [tab, setTab] = useState<TabKey>("overdue");
  const [view, setView] = useState<ViewMode>("list");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [systems, setSystems] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [onlyNoSupervisor, setOnlyNoSupervisor] = useState(false);
  const [onlyHighSeverity, setOnlyHighSeverity] = useState(false);

  const [extending, setExtending] = useState<Kppn | null>(null);
  const [busy, setBusy] = useState(false);

  function matchTab(k: Kppn): boolean {
    switch (tab) {
      case "behind":
        return isKppnBehindSchedule(k) && !isKppnOverdue(k);
      case "stale":
        return isSyncStale(k);
      default:
        return isKppnOverdue(k);
    }
  }

  const tabCounts = useMemo(
    () => ({
      overdue: attention.filter((k) => isKppnOverdue(k)).length,
      behind: attention.filter(
        (k) => isKppnBehindSchedule(k) && !isKppnOverdue(k),
      ).length,
      stale: attention.filter((k) => isSyncStale(k)).length,
    }),
    [attention],
  );

  /** Mức nghiêm trọng của nguồn có phải Cao trở lên không */
  function isHighSource(k: Kppn): boolean {
    const s = sourceOf(k);
    return s?.severity === "Cao" || s?.severity === "Trọng yếu";
  }

  /* --------------------------- Table state ------------------------ */

  const t = useTableState<Kppn>(attention, {
    getKey: (k) => k.id,
    searchText: (k) =>
      kppnSearchText(k, [
        lk.unitName(k.unitId, ""),
        lk.employeeName(k.assigneeId, ""),
        sourceOf(k)?.code ?? "",
      ]),
    filter: (k) => {
      if (!matchTab(k)) return false;
      if (buckets.length > 0) {
        const days = kppnOverdueDays(k);
        if (days === 0) return false;
        if (!buckets.includes(bucketOf(days))) return false;
      }
      if (types.length > 0 && !types.includes(k.type)) return false;
      if (systems.length > 0 && !systems.includes(k.executionSystem))
        return false;
      if (unitId && k.unitId !== unitId) return false;
      if (assigneeId && k.assigneeId !== assigneeId) return false;
      if (onlyNoSupervisor && k.supervisorId) return false;
      if (onlyHighSeverity && !isHighSource(k)) return false;
      return true;
    },
    sortValue: (k, key) => {
      switch (key) {
        case "code":
          return k.code;
        case "name":
          return k.name;
        case "source":
          return sourceOf(k)?.code ?? "";
        case "unit":
          return lk.unitName(k.unitId, "");
        case "assignee":
          return lk.employeeName(k.assigneeId, "");
        case "late":
          return kppnOverdueDays(k);
        case "gap":
          return expectedProgress(k) - k.progress;
        case "due":
          return k.dueDate;
        case "sync":
          return k.lastSyncedAt || "";
        case "status":
          return k.status;
        default:
          return null;
      }
    },
    defaultSort: { key: "late", dir: "desc" },
    pageSize: 20,
    filterDeps: [
      tab,
      buckets,
      types,
      systems,
      unitId,
      assigneeId,
      onlyNoSupervisor,
      onlyHighSeverity,
    ],
  });

  /* --------------------------- Thống kê -------------------------- */

  const bucketStat = useMemo(() => {
    const out: Record<LateBucket, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    attention.forEach((k) => {
      const days = kppnOverdueDays(k);
      if (days > 0) out[bucketOf(days)] += 1;
    });
    return out;
  }, [attention]);

  const stat = useMemo(() => {
    const overdue = attention.filter((k) => isKppnOverdue(k));
    const maxLate = overdue.reduce(
      (m, k) => Math.max(m, kppnOverdueDays(k)),
      0,
    );
    const avgLate =
      overdue.length === 0
        ? 0
        : Math.round(
            overdue.reduce((s, k) => s + kppnOverdueDays(k), 0) /
              overdue.length,
          );
    return {
      overdue: overdue.length,
      maxLate,
      avgLate,
      cost: overdue.reduce((s, k) => s + (k.estimatedCost ?? 0), 0),
      highSource: overdue.filter((k) => isHighSource(k)).length,
      notPushed: attention.filter((k) => canPushToSource(k)).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention, defMap, eventMap]);

  function toggleBucket(b: LateBucket) {
    setBuckets((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  }

  function resetFilter() {
    setBuckets([]);
    setTypes([]);
    setSystems([]);
    setUnitId(null);
    setAssigneeId(null);
    setOnlyNoSupervisor(false);
    setOnlyHighSeverity(false);
  }

  const filterCount =
    buckets.length +
    types.length +
    systems.length +
    (unitId ? 1 : 0) +
    (assigneeId ? 1 : 0) +
    (onlyNoSupervisor ? 1 : 0) +
    (onlyHighSeverity ? 1 : 0);

  /* --------------------------- Hành động ------------------------- */

  async function syncAll() {
    setBusy(true);
    const [amis, jira] = await Promise.all([
      pullKppnFromSource("amis-cong-viec"),
      pullKppnFromSource("jira"),
    ]);
    setBusy(false);
    const updated = amis.updated + jira.updated;
    if (updated > 0) {
      toast.success(
        `Đã cập nhật ${updated} hành động từ hệ thống nguồn`,
        [...amis.details, ...jira.details].slice(0, 2).join(" | "),
      );
      return;
    }
    if (!amis.ok && !jira.ok) {
      toast.error("Không đồng bộ được", amis.message);
      return;
    }
    toast.info(
      "Không có thay đổi mới",
      "Hệ thống nguồn chưa cập nhật tiến độ nào cho các hành động đang trễ.",
    );
  }

  async function pushOne(k: Kppn) {
    setBusy(true);
    const res = await pushKppnToSource(k.id);
    setBusy(false);
    if (res.ok) toast.success(res.message, res.details.join(" | "));
    else toast.error("Không giao việc được", res.message);
  }

  function remind(rows: Kppn[]) {
    if (rows.length === 0) {
      toast.warning("Chưa chọn hành động nào", "Hãy chọn ít nhất 1 dòng.");
      return;
    }
    const people = new Set(rows.map((k) => k.assigneeId).filter(Boolean));
    toast.success(
      `Đã gửi nhắc việc cho ${people.size} người thực hiện`,
      `Bao gồm ${rows.length} hành động đang trễ (giả lập gửi thông báo).`,
    );
    t.clearSelection();
  }

  const anyConnected =
    states["amis-cong-viec"].connected || states["jira"].connected;

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<Kppn>[] = [
    {
      key: "code",
      header: "Mã hành động",
      width: 150,
      sortable: true,
      render: (k) => (
        <CodeCell
          code={k.code}
          onClick={() => router.push(`/khac-phuc/kppn/${k.code}`)}
        />
      ),
    },
    {
      key: "name",
      header: "Tên hành động",
      minWidth: 300,
      sortable: true,
      render: (k) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{k.name}</span>
              <Badge
                tone={k.type === "Khắc phục" ? "info" : "neutral"}
                size="sm"
              >
                {k.type}
              </Badge>
              {isSyncStale(k) && (
                <Tooltip content="Quá 7 ngày chưa nhận cập nhật từ hệ thống nguồn">
                  <Badge tone="warning" size="sm">
                    Chưa đồng bộ
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={`${k.executionSystem}${k.externalTaskCode ? ` - ${k.externalTaskCode}` : " - chưa giao việc"}`}
        />
      ),
    },
    {
      key: "source",
      header: "Nguồn phát sinh",
      width: 195,
      sortable: true,
      render: (k) => {
        const s = sourceOf(k);
        if (!s)
          return <span className="text-[12px] text-text-hint">Chưa gắn</span>;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(s.href);
            }}
            className="flex min-w-0 flex-col text-left"
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-medium text-brand">
                {s.code}
              </span>
              {s.severity && <RiskBadge level={s.severity} />}
            </span>
            <span className="truncate text-[12px] text-text-secondary">
              {s.label}
            </span>
          </button>
        );
      },
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 165,
      sortable: true,
      render: (k) => lk.unitName(k.unitId),
    },
    {
      key: "assignee",
      header: "Người thực hiện",
      width: 205,
      sortable: true,
      render: (k) => (
        <UserCell
          name={lk.employeeName(k.assigneeId, "Chưa gán")}
          sub={
            k.supervisorId
              ? `Giám sát: ${lk.employeeName(k.supervisorId)}`
              : "Chưa có người giám sát"
          }
          size={24}
        />
      ),
    },
    {
      key: "late",
      header: "Số ngày trễ",
      width: 160,
      sortable: true,
      render: (k) => {
        const days = kppnOverdueDays(k);
        if (days === 0)
          return (
            <Tooltip
              content={`Chưa quá hạn, còn ${kppnDaysToDue(k)} ngày nhưng tiến độ chậm hơn kỳ vọng`}
            >
              <Badge tone="warning" dot>
                Chậm tiến độ
              </Badge>
            </Tooltip>
          );
        const b = bucketOf(days);
        return (
          <Tooltip content={BUCKET_META[b].note}>
            <span className="flex items-center gap-1.5">
              <Badge tone={BUCKET_META[b].tone} dot>
                {days} ngày
              </Badge>
              {b === "critical" && (
                <IconFlame size={14} className="text-lv-critical-text" />
              )}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "gap",
      header: "Tiến độ",
      width: 175,
      sortable: true,
      render: (k) => {
        const expect = expectedProgress(k);
        const gap = expect - k.progress;
        return (
          <Tooltip content={`Kỳ vọng ${expect}% - thực tế ${k.progress}%`}>
            <span className="flex items-center gap-2">
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    gap >= 20 ? "bg-danger" : "bg-warning",
                  )}
                  style={{ width: `${k.progress}%` }}
                />
                <span
                  className="absolute top-0 h-full w-px bg-[#717680]"
                  style={{ left: `${expect}%` }}
                />
              </span>
              <span className="w-[62px] shrink-0 text-right text-[12px] text-text-secondary">
                {k.progress}%
                {gap > 0 && <span className="text-danger"> -{gap}</span>}
              </span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "due",
      header: "Hạn hoàn thành",
      width: 135,
      sortable: true,
      render: (k) => (
        <span className={cn(isKppnOverdue(k) && "font-medium text-danger")}>
          {formatDate(k.dueDate)}
        </span>
      ),
    },
    {
      key: "sync",
      header: "Đồng bộ gần nhất",
      width: 160,
      sortable: true,
      render: (k) => {
        if (k.executionSystem === "Theo dõi trong GRC")
          return (
            <span className="text-[12px] text-text-hint">
              Theo dõi trong GRC
            </span>
          );
        if (!k.externalTaskCode)
          return (
            <span className="text-[12px] font-medium text-lv-medium-text">
              Chưa giao việc
            </span>
          );
        return (
          <span
            className={cn(
              "text-[12px]",
              isSyncStale(k)
                ? "font-medium text-lv-medium-text"
                : "text-text-secondary",
            )}
          >
            {formatDateTime(k.lastSyncedAt) || "Chưa đồng bộ"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 145,
      sortable: true,
      render: (k) => <StatusBadge status={k.status} />,
    },
    {
      key: "actions",
      header: "",
      width: 140,
      align: "right",
      render: (k) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton
              label="Xem chi tiết"
              onClick={() => router.push(`/khac-phuc/kppn/${k.code}`)}
            >
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          {k.externalUrl && (
            <Tooltip
              content={`Mở ${k.externalTaskCode} trên ${k.executionSystem}`}
            >
              <IconButton
                label="Mở hệ thống nguồn"
                onClick={() => window.open(k.externalUrl, "_blank")}
              >
                <IconExternalLink size={16} />
              </IconButton>
            </Tooltip>
          )}
          {canEdit && canPushToSource(k) && (
            <Tooltip content={`Giao việc sang ${k.executionSystem}`}>
              <IconButton
                label="Giao việc"
                disabled={busy}
                onClick={() => pushOne(k)}
              >
                <IconArrowRight size={16} className="text-brand" />
              </IconButton>
            </Tooltip>
          )}
          {canExtend && (
            <Tooltip content="Gia hạn hoàn thành">
              <IconButton label="Gia hạn" onClick={() => setExtending(k)}>
                <IconCalendarPlus size={16} className="text-lv-medium-text" />
              </IconButton>
            </Tooltip>
          )}
        </RowActions>
      ),
    },
  ];

  /* ------------------------------ Render -------------------------- */

  return (
    <PageContainer>
      <PageHeader
        title="KPPN quá hạn"
        subtitle="Các hành động khắc phục và phòng ngừa đang trễ hạn hoặc chậm tiến độ"
        showBreadcrumb={false}
        actions={
          <>
            <Tooltip
              content={
                anyConnected
                  ? "Nhận tiến độ mới nhất từ AMIS Công việc và JIRA"
                  : "Cả hai kết nối đang tắt, bật lại tại màn hình Kết nối hệ thống"
              }
            >
              <Button
                variant="secondary"
                icon={<IconRefresh size={16} />}
                loading={busy}
                onClick={syncAll}
              >
                Đồng bộ tất cả
              </Button>
            </Tooltip>
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị báo cáo cho ${t.total} hành động đang trễ (giả lập).`,
                )
              }
            >
              Xuất báo cáo
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* ------------------ Thẻ phân nhóm mức trễ ---------------- */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {BUCKET_ORDER.map((b) => (
              <BucketCard
                key={b}
                bucket={b}
                value={bucketStat[b]}
                active={buckets.includes(b)}
                onClick={() => toggleBucket(b)}
              />
            ))}
          </div>

          {/* -------------------- Dải tổng hợp ----------------------- */}
          {stat.overdue > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-critical-border bg-lv-critical-bg px-3 py-2.5 text-[12px] leading-4 text-lv-critical-text">
              <IconClockExclamation size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Đang có <b>{stat.overdue}</b> hành động quá hạn, trễ bình quân{" "}
                <b>{stat.avgLate} ngày</b>, cao nhất <b>{stat.maxLate} ngày</b>.
                Trong đó <b>{stat.highSource}</b> hành động thuộc nguồn mức Cao
                trở lên.
              </span>
              {stat.cost > 0 && (
                <span className="shrink-0">
                  Chi phí liên quan <b>{formatMoney(stat.cost)}</b> VNĐ
                </span>
              )}
            </div>
          )}

          {stat.notPushed > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-medium-border bg-lv-medium-bg px-3 py-2.5 text-[12px] leading-4 text-lv-medium-text">
              <IconAlertTriangle size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Có <b>{stat.notPushed}</b> hành động đã phê duyệt nhưng chưa
                được giao sang hệ thống thực thi. Đây thường là nguyên nhân gốc
                khiến hành động bị trễ vì người thực hiện chưa nhận được việc.
              </span>
            </div>
          )}

          {/* ------------------------ Khối chính --------------------- */}
          <ContentCard padded={false} className="overflow-hidden">
            <div className="px-3">
              <Tabs
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
                items={[
                  {
                    key: "overdue",
                    label: "Đã quá hạn",
                    count: tabCounts.overdue,
                  },
                  {
                    key: "behind",
                    label: "Chậm tiến độ, chưa quá hạn",
                    count: tabCounts.behind,
                  },
                  {
                    key: "stale",
                    label: "Lâu chưa đồng bộ",
                    count: tabCounts.stale,
                  },
                ]}
              />
            </div>

            <TableToolbar
              left={
                <>
                  <Segments
                    items={[
                      {
                        key: "list",
                        label: "Danh sách",
                        icon: <IconLayoutList size={15} />,
                      },
                      {
                        key: "unit",
                        label: "Theo đơn vị",
                        icon: <IconBuilding size={15} />,
                      },
                      {
                        key: "assignee",
                        label: "Theo người thực hiện",
                        icon: <IconUsers size={15} />,
                      },
                    ]}
                    value={view}
                    onChange={(k) => setView(k as ViewMode)}
                  />
                  {view === "list" && (
                    <SearchInput
                      value={t.keyword}
                      onChange={t.setKeyword}
                      placeholder="Tìm theo mã, tên, nguồn"
                      width={260}
                    />
                  )}
                </>
              }
              right={
                <>
                  <FilterCombobox
                    label="Loại:"
                    multiple
                    options={TYPE_OPTIONS}
                    value={types}
                    onChange={setTypes}
                    width={190}
                  />
                  <FilterCombobox
                    label="Hệ thống:"
                    multiple
                    options={SYSTEM_OPTIONS}
                    value={systems}
                    onChange={setSystems}
                    width={215}
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
                    label="Người thực hiện:"
                    options={lk.employeeOptions}
                    value={assigneeId}
                    onChange={setAssigneeId}
                    searchable
                    width={230}
                  />
                  <Checkbox
                    label="Nguồn mức Cao trở lên"
                    checked={onlyHighSeverity}
                    onChange={(e) => setOnlyHighSeverity(e.target.checked)}
                  />
                  <Checkbox
                    label="Chưa có người giám sát"
                    checked={onlyNoSupervisor}
                    onChange={(e) => setOnlyNoSupervisor(e.target.checked)}
                  />
                  {filterCount > 0 && (
                    <Button
                      variant="text"
                      size="sm"
                      compact
                      onClick={resetFilter}
                    >
                      Xoá lọc ({filterCount})
                    </Button>
                  )}
                </>
              }
            />

            {attention.length === 0 ? (
              <EmptyState
                icon={<IconClockExclamation size={24} />}
                title="Không có hành động nào đang trễ"
                description="Toàn bộ hành động khắc phục và phòng ngừa đang bám sát kế hoạch."
              />
            ) : view === "list" ? (
              <>
                <DataTable
                  columns={columns}
                  rows={t.pageRows}
                  getKey={(k) => k.id}
                  selectable={canEdit}
                  selectedSet={t.selectedSet}
                  onToggleRow={t.toggleRow}
                  onTogglePage={t.togglePage}
                  allPageSelected={t.allPageSelected}
                  somePageSelected={t.somePageSelected}
                  sort={t.sort}
                  onSort={t.toggleSort}
                  onRowClick={(k) => router.push(`/khac-phuc/kppn/${k.code}`)}
                  stickyLast
                  emptyTitle="Không có hành động phù hợp"
                  emptyDescription="Thử đổi tab hoặc bỏ bớt điều kiện lọc."
                  rowClassName={(k) =>
                    kppnOverdueDays(k) > 30 ? "!bg-lv-critical-bg" : undefined
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
            ) : (
              <GroupView
                rows={t.rows}
                mode={view}
                nameOf={(k) =>
                  view === "unit"
                    ? lk.unitName(k.unitId, "Chưa gán đơn vị")
                    : lk.employeeName(k.assigneeId, "Chưa gán người thực hiện")
                }
                keyOf={(k) =>
                  view === "unit"
                    ? k.unitId || "__none__"
                    : k.assigneeId || "__none__"
                }
              />
            )}
          </ContentCard>
        </div>
      </PageBody>

      {/* ---------------------- Thanh chọn nhiều ---------------------- */}
      <BulkActionBar
        count={t.selectedKeys.length}
        totalCount={t.total}
        onClear={t.clearSelection}
        onSelectAll={t.selectAll}
      >
        <BulkButton
          icon={<IconRefresh size={16} />}
          onClick={() =>
            remind(
              t.selectedKeys
                .map((id) => kppnRepo.getById(id))
                .filter((k): k is Kppn => !!k),
            )
          }
        >
          Nhắc việc
        </BulkButton>
        <BulkButton
          icon={<IconArrowRight size={16} />}
          onClick={async () => {
            const targets = t.selectedKeys
              .map((id) => kppnRepo.getById(id))
              .filter((k): k is Kppn => !!k && canPushToSource(k));
            if (targets.length === 0) {
              toast.warning(
                "Không có hành động nào giao được",
                "Chỉ giao được hành động đã duyệt và chưa có mã việc.",
              );
              return;
            }
            setBusy(true);
            let ok = 0;
            for (const k of targets) {
              const res = await pushKppnToSource(k.id);
              if (res.ok) ok += 1;
            }
            setBusy(false);
            t.clearSelection();
            toast.success(`Đã giao ${ok} hành động sang hệ thống nguồn`);
          }}
        >
          Giao việc
        </BulkButton>
      </BulkActionBar>

      {/* -------------------------- Hộp thoại ------------------------ */}
      <ExtendModal
        kppn={extending}
        deficiency={
          extending?.deficiencyId
            ? (defMap.get(extending.deficiencyId) ?? null)
            : null
        }
        onClose={() => setExtending(null)}
        onDone={(msg, detail) => {
          setExtending(null);
          toast.success(msg, detail);
        }}
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Thẻ phân nhóm mức trễ                                        */
/* ================================================================== */

function BucketCard({
  bucket,
  value,
  active,
  onClick,
}: {
  bucket: LateBucket;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  const meta = BUCKET_META[bucket];
  const style: Record<string, string> = {
    warning: "bg-lv-medium-bg text-lv-medium-text",
    high: "bg-lv-high-bg text-lv-high-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
  };
  const ring: Record<string, string> = {
    warning: "ring-lv-medium-text",
    high: "ring-lv-high-text",
    danger: "ring-lv-critical-text",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={meta.note}
      className={cn(
        "misa-card flex items-start gap-3 p-4 text-left transition-all",
        value === 0 && !active && "opacity-60",
        active && "ring-2 ring-offset-1",
        active && ring[meta.tone],
        "hover:brightness-[0.99]",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
          style[meta.tone],
        )}
      >
        {bucket === "critical" ? (
          <IconFlame size={20} />
        ) : (
          <IconClockExclamation size={20} />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-text-secondary">{meta.label}</p>
        <p className="text-[22px] leading-7 font-semibold text-text-primary">
          {value}
        </p>
        <p className="truncate text-[11px] text-text-hint">Trễ {meta.range}</p>
      </div>
    </button>
  );
}

/* ================================================================== */
/* Chế độ nhóm theo đơn vị hoặc người thực hiện                        */
/* ================================================================== */

interface GroupRow {
  id: string;
  name: string;
  total: number;
  overdue: number;
  behind: number;
  maxLate: number;
  avgLate: number;
  notPushed: number;
  cost: number;
}

function GroupView({
  rows,
  mode,
  nameOf,
  keyOf,
}: {
  rows: Kppn[];
  mode: ViewMode;
  nameOf: (k: Kppn) => string;
  keyOf: (k: Kppn) => string;
}) {
  const grouped = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();

    rows.forEach((k) => {
      const id = keyOf(k);
      let g = map.get(id);
      if (!g) {
        g = {
          id,
          name: nameOf(k),
          total: 0,
          overdue: 0,
          behind: 0,
          maxLate: 0,
          avgLate: 0,
          notPushed: 0,
          cost: 0,
        };
        map.set(id, g);
      }
      const days = kppnOverdueDays(k);
      g.total += 1;
      if (days > 0) {
        g.overdue += 1;
        g.avgLate += days;
        g.maxLate = Math.max(g.maxLate, days);
      } else if (isKppnBehindSchedule(k)) {
        g.behind += 1;
      }
      if (canPushToSource(k)) g.notPushed += 1;
      g.cost += k.estimatedCost ?? 0;
    });

    return [...map.values()]
      .map((g) => ({
        ...g,
        avgLate: g.overdue === 0 ? 0 : Math.round(g.avgLate / g.overdue),
      }))
      .sort((a, b) => b.maxLate - a.maxLate || b.overdue - a.overdue);
  }, [rows, keyOf, nameOf]);

  const columns: Column<GroupRow>[] = [
    {
      key: "name",
      header: mode === "unit" ? "Đơn vị" : "Người thực hiện",
      minWidth: 260,
      render: (g) => (
        <TitleCell title={g.name} sub={`${g.total} hành động cần can thiệp`} />
      ),
    },
    {
      key: "overdue",
      header: "Quá hạn",
      width: 110,
      align: "center",
      render: (g) => (
        <b
          className={cn(g.overdue > 0 ? "text-danger" : "text-text-secondary")}
        >
          {g.overdue}
        </b>
      ),
    },
    {
      key: "behind",
      header: "Chậm tiến độ",
      width: 130,
      align: "center",
      render: (g) => (
        <span className={cn(g.behind > 0 && "font-medium text-lv-medium-text")}>
          {g.behind}
        </span>
      ),
    },
    {
      key: "maxLate",
      header: "Trễ nhiều nhất",
      width: 165,
      render: (g) =>
        g.maxLate === 0 ? (
          <span className="text-text-hint">--</span>
        ) : (
          <Badge tone={BUCKET_META[bucketOf(g.maxLate)].tone} dot>
            {g.maxLate} ngày
          </Badge>
        ),
    },
    {
      key: "avgLate",
      header: "Trễ bình quân",
      width: 135,
      align: "center",
      render: (g) => (
        <span className="text-text-secondary">
          {g.avgLate === 0 ? "--" : `${g.avgLate} ngày`}
        </span>
      ),
    },
    {
      key: "notPushed",
      header: "Chưa giao việc",
      width: 145,
      align: "center",
      render: (g) => (
        <span
          className={cn(g.notPushed > 0 && "font-medium text-lv-medium-text")}
        >
          {g.notPushed}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Chi phí liên quan",
      width: 160,
      align: "right",
      render: (g) => formatMoney(g.cost) || "--",
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={grouped}
      getKey={(g) => g.id}
      emptyTitle="Không có dữ liệu để nhóm"
      emptyDescription="Thử đổi tab hoặc bỏ bớt điều kiện lọc."
      rowClassName={(g) => (g.maxLate > 30 ? "!bg-lv-critical-bg" : undefined)}
    />
  );
}

/* ================================================================== */
/* Hộp thoại gia hạn                                        */
/* ================================================================== */

function ExtendModal({
  kppn,
  deficiency,
  onClose,
  onDone,
}: {
  kppn: Kppn | null;
  deficiency: Deficiency | null;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [newDue, setNewDue] = useState("");
  const [reason, setReason] = useState("");
  const [syncDeficiency, setSyncDeficiency] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState("");

  const key = kppn?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    if (kppn) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setNewDue(toInputDate(d));
      setReason("");
      setSyncDeficiency(true);
      setErrors({});
    }
  }

  const lateDays = kppn ? kppnOverdueDays(kppn) : 0;

  /** Hạn mới vượt hạn khắc phục của điểm yếu */
  const exceedDeficiency =
    !!deficiency?.dueDate && !!newDue && newDue > deficiency.dueDate;

  function submit() {
    if (!kppn) return;

    const err: Record<string, string> = {};
    if (!newDue) err.newDue = "Bắt buộc nhập hạn hoàn thành mới";
    else if (newDue <= kppn.dueDate)
      err.newDue = "Hạn mới phải muộn hơn hạn hiện tại";
    if (!reason.trim())
      err.reason = "Bắt buộc nhập lý do gia hạn để phục vụ truy vết";

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    const note = `Gia hạn từ ${formatDate(kppn.dueDate)} sang ${formatDate(newDue)}. Lý do: ${reason.trim()}`;

    kppnRepo.update(kppn.id, {
      dueDate: newDue,
      statusNote: note,
    });

    let detail = `Hạn hoàn thành chuyển sang ${formatDate(newDue)}.`;

    if (syncDeficiency && deficiency && newDue > (deficiency.dueDate || "")) {
      deficiencyRepo.update(deficiency.id, {
        dueDate: newDue,
        statusNote: `Hạn khắc phục được điều chỉnh theo gia hạn của ${kppn.code}. ${reason.trim()}`,
      });
      detail += ` Hạn khắc phục của ${deficiency.code} cũng được điều chỉnh theo.`;
    }

    onDone(`Đã gia hạn ${kppn.code}`, detail);
  }

  return (
    <Modal
      open={!!kppn}
      onClose={onClose}
      size="md"
      title="Gia hạn hành động khắc phục"
      description={kppn ? `${kppn.code} - ${kppn.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            icon={<IconCalendarPlus size={16} />}
            onClick={submit}
          >
            Xác nhận gia hạn
          </Button>
        </>
      }
    >
      {kppn && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt p-2.5 text-[12px] text-text-secondary">
            <StatusBadge status={kppn.status} />
            <span>
              Hạn hiện tại:{" "}
              <b className="text-text-primary">{formatDate(kppn.dueDate)}</b>
            </span>
            {lateDays > 0 && (
              <span>
                Đang trễ <b className="text-danger">{lateDays} ngày</b>
              </span>
            )}
            <span>
              Tiến độ <b className="text-text-primary">{kppn.progress}%</b>, kỳ
              vọng {expectedProgress(kppn)}%
            </span>
          </div>

          <DateInput
            label="Hạn hoàn thành mới"
            required
            value={newDue}
            min={kppn.dueDate || undefined}
            error={errors.newDue}
            onChange={(v) => {
              setNewDue(v);
              setErrors((p) => ({ ...p, newDue: "" }));
            }}
          />

          <Textarea
            label="Lý do gia hạn"
            required
            rows={3}
            maxLength={500}
            showCount
            placeholder="Nguyên nhân chậm trễ, cam kết mới của đơn vị thực hiện"
            value={reason}
            error={errors.reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((p) => ({ ...p, reason: "" }));
            }}
          />

          {deficiency && (
            <div className="flex flex-col gap-2 rounded-ctrl border border-border-light p-2.5">
              <p className="text-[12px] text-text-secondary">
                Điểm yếu nguồn <b className="text-brand">{deficiency.code}</b>{" "}
                đang có hạn khắc phục{" "}
                <b className="text-text-primary">
                  {formatDate(deficiency.dueDate) || "chưa đặt"}
                </b>
                .
              </p>
              <Checkbox
                label="Điều chỉnh luôn hạn khắc phục của điểm yếu theo hạn mới"
                checked={syncDeficiency}
                onChange={(e) => setSyncDeficiency(e.target.checked)}
              />
              {exceedDeficiency && !syncDeficiency && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconAlertTriangle size={15} className="mt-px shrink-0" />
                  <span>
                    Hạn mới muộn hơn hạn khắc phục của điểm yếu. Nếu không điều
                    chỉnh, điểm yếu sẽ bị tính quá hạn trước khi hành động này
                    kết thúc.
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
            <IconAlertTriangle size={15} className="mt-px shrink-0" />
            <span>
              Gia hạn chỉ đổi mốc theo dõi trong GRC. Nếu hành động đã giao sang{" "}
              {kppn.executionSystem}, cần cập nhật lại hạn ở hệ thống nguồn để
              hai bên khớp nhau.
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
