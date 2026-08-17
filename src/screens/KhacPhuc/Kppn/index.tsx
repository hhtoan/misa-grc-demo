"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconCircleCheck,
  IconClockExclamation,
  IconCloudUpload,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconPlus,
  IconRefresh,
  IconSend,
  IconTool,
  IconTrash,
  IconTrendingDown,
} from "@tabler/icons-react";
import {
  Badge,
  BulkActionBar,
  BulkButton,
  Button,
  Checkbox,
  CodeCell,
  ConfirmDialog,
  DataTable,
  DateInput,
  FilterCombobox,
  FilterGroup,
  FilterPanel,
  IconButton,
  Modal,
  Pagination,
  Radio,
  RiskBadge,
  RowActions,
  SearchInput,
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
import { PageContainer, PageHeader } from "@/components/layout";
import {
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  EXECUTION_SYSTEMS,
  KPPN_STATUSES,
  KPPN_TYPES,
} from "@/lib/domain/enums";
import {
  KPPN_STATUS_ORDER,
  canPushToSource,
  expectedProgress,
  isKppnBehindSchedule,
  isKppnDeletable,
  isKppnDueSoon,
  isKppnEditable,
  isKppnFinished,
  isKppnOverdue,
  isKppnRunning,
  isSyncStale,
  kppnDaysToDue,
  kppnNextTransitions,
  kppnSearchText,
  summarizeKppns,
} from "@/lib/domain/kppn-utils";
import type { Kppn } from "@/lib/domain/schema";
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
/* Hằng số                                        */
/* ================================================================== */

const STATUS_OPTIONS = KPPN_STATUSES.map((s) => ({ value: s, label: s }));
const TYPE_OPTIONS = KPPN_TYPES.map((s) => ({ value: s, label: s }));
const SYSTEM_OPTIONS = EXECUTION_SYSTEMS.map((s) => ({ value: s, label: s }));

type TabKey = "running" | "mine" | "overdue" | "acceptance" | "finished";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function KppnScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const kppns = useCollection(kppnRepo);
  const deficiencies = useCollection(deficiencyRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);
  const states = useIntegrationStates();

  const canEdit = hasRole("admin", "qtrr", "owner");
  const canApprove = hasRole("admin", "qtrr");

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );

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

  const deficiencyOptions = useMemo(
    () =>
      deficiencies.map((d) => ({
        value: d.id,
        label: d.name,
        description: `${d.code} - ${d.severity}`,
      })),
    [deficiencies],
  );

  /** Nhãn nguồn phát sinh của một hành động */
  function sourceOf(
    k: Kppn,
  ): { code: string; label: string; href: string } | null {
    if (k.deficiencyId) {
      const d = defMap.get(k.deficiencyId);
      if (d)
        return {
          code: d.code,
          label: d.name,
          href: `/khac-phuc/diem-yeu/${d.code}`,
        };
    }
    if (k.eventId) {
      const e = eventMap.get(k.eventId);
      if (e)
        return {
          code: e.code,
          label: e.name,
          href: `/su-kien/so-theo-doi/${e.code}`,
        };
    }
    if (k.riskId) {
      const r = riskMap.get(k.riskId);
      if (r)
        return {
          code: r.code,
          label: r.name,
          href: `/rui-ro/so-dang-ky/${r.code}`,
        };
    }
    return null;
  }

  /* ---------------------------- Bộ lọc ---------------------------- */

  const [tab, setTab] = useState<TabKey>("running");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [systems, setSystems] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [deficiencyId, setDeficiencyId] = useState<string | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyBehind, setOnlyBehind] = useState(false);
  const [onlyNotPushed, setOnlyNotPushed] = useState(false);
  const [onlySyncStale, setOnlySyncStale] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  /* ---------------------------- Hộp thoại ------------------------- */

  const [deleting, setDeleting] = useState<Kppn | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [transiting, setTransiting] = useState<Kppn | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  /* ------------------------- Lọc theo tab ------------------------- */

  function matchTab(k: Kppn): boolean {
    switch (tab) {
      case "mine":
        return (
          !!currentEmployee &&
          (k.assigneeId === currentEmployee.id ||
            k.supervisorId === currentEmployee.id)
        );
      case "overdue":
        return isKppnOverdue(k);
      case "acceptance":
        return k.status === "Chờ nghiệm thu" || k.status === "Chờ duyệt";
      case "finished":
        return isKppnFinished(k);
      default:
        return !isKppnFinished(k);
    }
  }

  const tabCounts = useMemo(
    () => ({
      running: kppns.filter((k) => !isKppnFinished(k)).length,
      mine: currentEmployee
        ? kppns.filter(
            (k) =>
              k.assigneeId === currentEmployee.id ||
              k.supervisorId === currentEmployee.id,
          ).length
        : 0,
      overdue: kppns.filter((k) => isKppnOverdue(k)).length,
      acceptance: kppns.filter(
        (k) => k.status === "Chờ nghiệm thu" || k.status === "Chờ duyệt",
      ).length,
      finished: kppns.filter((k) => isKppnFinished(k)).length,
    }),
    [kppns, currentEmployee],
  );

  /* --------------------------- Table state ------------------------ */

  const t = useTableState<Kppn>(kppns, {
    getKey: (k) => k.id,
    searchText: (k) =>
      kppnSearchText(k, [
        lk.unitName(k.unitId, ""),
        lk.employeeName(k.assigneeId, ""),
        lk.employeeName(k.supervisorId, ""),
        defMap.get(k.deficiencyId)?.code ?? "",
        riskMap.get(k.riskId)?.code ?? "",
        eventMap.get(k.eventId)?.code ?? "",
      ]),
    filter: (k) => {
      if (!matchTab(k)) return false;
      if (statuses.length > 0 && !statuses.includes(k.status)) return false;
      if (types.length > 0 && !types.includes(k.type)) return false;
      if (systems.length > 0 && !systems.includes(k.executionSystem))
        return false;
      if (unitId && k.unitId !== unitId) return false;
      if (assigneeId && k.assigneeId !== assigneeId) return false;
      if (supervisorId && k.supervisorId !== supervisorId) return false;
      if (deficiencyId && k.deficiencyId !== deficiencyId) return false;
      if (onlyOverdue && !isKppnOverdue(k)) return false;
      if (onlyBehind && !isKppnBehindSchedule(k)) return false;
      if (onlyNotPushed && !canPushToSource(k)) return false;
      if (onlySyncStale && !isSyncStale(k)) return false;
      return true;
    },
    sortValue: (k, key) => {
      switch (key) {
        case "code":
          return k.code;
        case "name":
          return k.name;
        case "type":
          return k.type;
        case "source":
          return sourceOf(k)?.code ?? "";
        case "unit":
          return lk.unitName(k.unitId, "");
        case "assignee":
          return lk.employeeName(k.assigneeId, "");
        case "system":
          return k.executionSystem;
        case "progress":
          return k.progress;
        case "due": {
          const remain = kppnDaysToDue(k);
          return remain === null ? 99999 : remain;
        }
        case "cost":
          return k.estimatedCost ?? -1;
        case "status":
          return KPPN_STATUS_ORDER[k.status];
        default:
          return null;
      }
    },
    defaultSort: { key: "due", dir: "asc" },
    pageSize: 20,
    filterDeps: [
      tab,
      statuses,
      types,
      systems,
      unitId,
      assigneeId,
      supervisorId,
      deficiencyId,
      onlyOverdue,
      onlyBehind,
      onlyNotPushed,
      onlySyncStale,
    ],
  });

  const summary = useMemo(() => summarizeKppns(t.rows), [t.rows]);

  const filterCount =
    statuses.length +
    types.length +
    systems.length +
    (unitId ? 1 : 0) +
    (assigneeId ? 1 : 0) +
    (supervisorId ? 1 : 0) +
    (deficiencyId ? 1 : 0) +
    (onlyOverdue ? 1 : 0) +
    (onlyBehind ? 1 : 0) +
    (onlyNotPushed ? 1 : 0) +
    (onlySyncStale ? 1 : 0);

  function resetFilter() {
    setStatuses([]);
    setTypes([]);
    setSystems([]);
    setUnitId(null);
    setAssigneeId(null);
    setSupervisorId(null);
    setDeficiencyId(null);
    setOnlyOverdue(false);
    setOnlyBehind(false);
    setOnlyNotPushed(false);
    setOnlySyncStale(false);
  }

  function toggleStatus(v: string) {
    setStatuses((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  /* --------------------------- Hành động -------------------------- */

  function goDetail(k: Kppn) {
    router.push(`/khac-phuc/kppn/${k.code}`);
  }

  function goEdit(k: Kppn) {
    if (!isKppnEditable(k.status)) {
      toast.warning(
        "Không sửa được",
        `Hành động đang ở trạng thái ${k.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/khac-phuc/kppn/${k.code}/sua`);
  }

  function confirmDelete(k: Kppn) {
    if (!isKppnDeletable(k.status)) {
      toast.error(
        "Không xoá được",
        `Chỉ xoá được hành động ở trạng thái Nháp. ${k.code} đang ở trạng thái ${k.status}.`,
      );
      return;
    }
    setDeleting(k);
  }

  async function pushOne(k: Kppn) {
    setPushing(k.id);
    const res = await pushKppnToSource(k.id);
    setPushing(null);
    if (res.ok) toast.success(res.message, res.details.join(" | "));
    else toast.error("Không giao việc được", res.message);
  }

  async function syncAll() {
    setSyncing(true);
    const [amis, jira] = await Promise.all([
      pullKppnFromSource("amis-cong-viec"),
      pullKppnFromSource("jira"),
    ]);
    setSyncing(false);
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
      "Hệ thống nguồn chưa cập nhật gì thêm.",
    );
  }

  async function bulkPush() {
    const targets = t.selectedKeys
      .map((id) => kppnRepo.getById(id))
      .filter((k): k is Kppn => !!k && canPushToSource(k));

    if (targets.length === 0) {
      toast.warning(
        "Không có hành động nào giao được",
        "Chỉ giao được hành động đã phê duyệt, chưa có mã việc và không theo dõi trong GRC.",
      );
      return;
    }

    setSyncing(true);
    let ok = 0;
    for (const k of targets) {
      const res = await pushKppnToSource(k.id);
      if (res.ok) ok += 1;
    }
    setSyncing(false);
    t.clearSelection();
    toast.success(
      `Đã giao ${ok} hành động sang hệ thống nguồn`,
      targets.length > ok
        ? `${targets.length - ok} hành động không giao được do kết nối đang tắt.`
        : undefined,
    );
  }

  function bulkNext() {
    let moved = 0;
    let blocked = 0;
    t.selectedKeys.forEach((id) => {
      const k = kppnRepo.getById(id);
      if (!k) return;
      const auto = kppnNextTransitions(k.status).find(
        (tr) => !tr.requireReason && tr.to !== "Hoàn thành",
      );
      if (!auto) {
        blocked += 1;
        return;
      }
      const patch: Partial<Kppn> = { status: auto.to };
      if (auto.to === "Đang thực hiện" && k.progress === 0) patch.progress = 5;
      kppnRepo.update(id, patch);
      moved += 1;
    });
    t.clearSelection();
    if (moved === 0) {
      toast.warning(
        "Không có bản ghi nào được chuyển",
        "Các hành động đã chọn ở trạng thái cuối, cần nhập lý do hoặc cần nghiệm thu riêng.",
      );
      return;
    }
    toast.success(
      `Đã chuyển trạng thái ${moved} hành động`,
      blocked > 0 ? `${blocked} bản ghi bị bỏ qua.` : undefined,
    );
  }

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<Kppn>[] = [
    {
      key: "code",
      header: "Mã hành động",
      width: 150,
      sortable: true,
      render: (k) => <CodeCell code={k.code} onClick={() => goDetail(k)} />,
    },
    {
      key: "name",
      header: "Tên hành động",
      minWidth: 320,
      sortable: true,
      render: (k) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{k.name}</span>
              {isKppnOverdue(k) && (
                <Tooltip
                  content={`Quá hạn ${Math.abs(kppnDaysToDue(k) ?? 0)} ngày`}
                >
                  <Badge tone="danger" size="sm">
                    Quá hạn
                  </Badge>
                </Tooltip>
              )}
              {isKppnBehindSchedule(k) && !isKppnOverdue(k) && (
                <Tooltip
                  content={`Tiến độ kỳ vọng ${expectedProgress(k)}% nhưng thực tế mới ${k.progress}%`}
                >
                  <Badge tone="warning" size="sm">
                    Chậm
                  </Badge>
                </Tooltip>
              )}
              <Badge
                tone={k.type === "Khắc phục" ? "info" : "neutral"}
                size="sm"
              >
                {k.type}
              </Badge>
            </span>
          }
          sub={
            <span className="inline-flex items-center gap-1">
              <IconTool size={12} />
              {k.executionSystem}
              {k.externalTaskCode ? ` - ${k.externalTaskCode}` : ""}
            </span>
          }
        />
      ),
    },
    {
      key: "source",
      header: "Nguồn phát sinh",
      width: 200,
      sortable: true,
      render: (k) => {
        const s = sourceOf(k);
        if (!s)
          return (
            <Tooltip content="Hành động chưa gắn nguồn, khó truy vết">
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-lv-medium-text">
                <IconAlertTriangle size={14} />
                Chưa gắn
              </span>
            </Tooltip>
          );
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(s.href);
            }}
            className="flex min-w-0 flex-col text-left"
          >
            <span className="truncate text-[12px] font-medium text-brand">
              {s.code}
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
      key: "progress",
      header: "Tiến độ",
      width: 165,
      sortable: true,
      render: (k) => {
        const expect = expectedProgress(k);
        const behind = isKppnBehindSchedule(k);
        return (
          <Tooltip
            content={
              isKppnRunning(k)
                ? `Kỳ vọng theo thời gian: ${expect}% - thực tế ${k.progress}%`
                : `Tiến độ ${k.progress}%`
            }
          >
            <span className="flex items-center gap-2">
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    k.progress >= 100
                      ? "bg-success"
                      : behind
                        ? "bg-warning"
                        : "bg-brand",
                  )}
                  style={{ width: `${k.progress}%` }}
                />
                {isKppnRunning(k) && (
                  <span
                    className="absolute top-0 h-full w-px bg-[#717680]"
                    style={{ left: `${expect}%` }}
                  />
                )}
              </span>
              <span className="w-9 shrink-0 text-right text-[12px] text-text-secondary">
                {k.progress}%
              </span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "due",
      header: "Hạn hoàn thành",
      width: 145,
      sortable: true,
      render: (k) => {
        const remain = kppnDaysToDue(k);
        const overdue = isKppnOverdue(k);
        const soon = isKppnDueSoon(k);
        return (
          <Tooltip
            content={
              overdue
                ? `Đã quá hạn ${Math.abs(remain ?? 0)} ngày`
                : isKppnFinished(k)
                  ? `Bắt đầu ${formatDate(k.startDate)}`
                  : `Còn ${remain} ngày`
            }
          >
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "font-medium text-danger",
                soon && !overdue && "font-medium text-lv-medium-text",
              )}
            >
              {(overdue || soon) && <IconClockExclamation size={14} />}
              {formatDate(k.dueDate)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "cost",
      header: "Chi phí ước tính",
      width: 150,
      align: "right",
      sortable: true,
      render: (k) => formatMoney(k.estimatedCost) || "--",
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 150,
      sortable: true,
      render: (k) => (
        <span className="flex flex-col gap-0.5">
          <StatusBadge status={k.status} />
          {isSyncStale(k) && (
            <Tooltip content="Đã giao sang hệ thống nguồn nhưng lâu chưa đồng bộ">
              <span className="text-[11px] text-lv-medium-text">
                Chưa đồng bộ gần đây
              </span>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: 150,
      align: "right",
      render: (k) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => goDetail(k)}>
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
                disabled={pushing === k.id}
                onClick={() => pushOne(k)}
              >
                <IconSend size={16} className="text-brand" />
              </IconButton>
            </Tooltip>
          )}
          {canEdit && (
            <>
              <Tooltip content="Sửa">
                <IconButton label="Sửa" onClick={() => goEdit(k)}>
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Chuyển trạng thái">
                <IconButton
                  label="Chuyển trạng thái"
                  onClick={() => setTransiting(k)}
                >
                  <IconArrowRight size={16} />
                </IconButton>
              </Tooltip>
              {isKppnDeletable(k.status) && (
                <Tooltip content="Xoá">
                  <IconButton label="Xoá" onClick={() => confirmDelete(k)}>
                    <IconTrash size={16} className="text-danger" />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
        </RowActions>
      ),
    },
  ];

  /* ------------------------------ Render -------------------------- */

  const anyConnected =
    states["amis-cong-viec"].connected || states["jira"].connected;

  return (
    <PageContainer>
      <PageHeader
        title="Bảng theo dõi khắc phục & phòng ngừa"
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
                loading={syncing}
                onClick={syncAll}
              >
                Đồng bộ từ hệ thống nguồn
              </Button>
            </Tooltip>
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị tệp Excel cho ${t.total} hành động (giả lập).`,
                )
              }
            >
              Xuất khẩu
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                icon={<IconPlus size={16} />}
                onClick={() => router.push("/khac-phuc/kppn/them-moi")}
              >
                Thêm hành động
              </Button>
            )}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="misa-card flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
            {/* ------------------------- Tabs ------------------------- */}
            <div className="shrink-0 px-3">
              <Tabs
                items={[
                  {
                    key: "running",
                    label: "Đang triển khai",
                    count: tabCounts.running,
                  },
                  { key: "mine", label: "Của tôi", count: tabCounts.mine },
                  {
                    key: "overdue",
                    label: "Quá hạn",
                    count: tabCounts.overdue,
                  },
                  {
                    key: "acceptance",
                    label: "Chờ duyệt & nghiệm thu",
                    count: tabCounts.acceptance,
                  },
                  {
                    key: "finished",
                    label: "Đã kết thúc",
                    count: tabCounts.finished,
                  },
                ]}
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
              />
            </div>

            {/* --------------------- Thẻ thống kê --------------------- */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-light px-3 py-2.5">
              <StatChip
                icon={<IconTool size={15} />}
                label="Đang hiển thị"
                value={summary.total}
                tone="brand"
                title={`Tiến độ bình quân ${summary.avgProgress}%`}
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">
                Trạng thái:
              </span>

              <StatChip
                label="Đang thực hiện"
                value={summary.running}
                tone="brand"
                active={statuses.includes("Đang thực hiện")}
                onClick={() => toggleStatus("Đang thực hiện")}
              />
              <StatChip
                icon={<IconCircleCheck size={15} />}
                label="Chờ nghiệm thu"
                value={summary.waitingAcceptance}
                tone="warning"
                active={statuses.includes("Chờ nghiệm thu")}
                onClick={() => toggleStatus("Chờ nghiệm thu")}
                title="Người thực hiện báo xong, chờ người giám sát nghiệm thu"
              />
              <StatChip
                label="Chờ duyệt"
                value={summary.waitingApproval}
                tone="warning"
                active={statuses.includes("Chờ duyệt")}
                onClick={() => toggleStatus("Chờ duyệt")}
              />
              <StatChip
                label="Hoàn thành"
                value={summary.completed}
                tone="success"
                active={statuses.includes("Hoàn thành")}
                onClick={() => toggleStatus("Hoàn thành")}
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">Cảnh báo:</span>

              <StatChip
                icon={<IconClockExclamation size={15} />}
                label="Quá hạn"
                value={summary.overdue}
                tone="danger"
                active={onlyOverdue}
                onClick={() => setOnlyOverdue((v) => !v)}
                title="Đã qua hạn hoàn thành mà chưa kết thúc"
              />
              <StatChip
                icon={<IconTrendingDown size={15} />}
                label="Chậm tiến độ"
                value={summary.behind}
                tone="high"
                active={onlyBehind}
                onClick={() => setOnlyBehind((v) => !v)}
                title="Tiến độ thực tế thấp hơn kỳ vọng từ 20 điểm phần trăm trở lên"
              />
              <StatChip
                icon={<IconCloudUpload size={15} />}
                label="Chưa giao việc"
                value={summary.notPushed}
                tone="warning"
                active={onlyNotPushed}
                onClick={() => setOnlyNotPushed((v) => !v)}
                title="Đã phê duyệt nhưng chưa tạo việc trên hệ thống nguồn"
              />
              <StatChip
                icon={<IconRefresh size={15} />}
                label="Chưa đồng bộ gần đây"
                value={summary.syncStale}
                tone="warning"
                active={onlySyncStale}
                onClick={() => setOnlySyncStale((v) => !v)}
                title="Quá 7 ngày chưa nhận cập nhật từ hệ thống nguồn"
              />

              <span className="ml-auto text-[12px] text-text-secondary">
                Chi phí ước tính:{" "}
                <b className="text-text-primary">
                  {formatMoney(summary.totalCost)}
                </b>{" "}
                VNĐ
              </span>
            </div>

            {/* ----------------------- Toolbar ------------------------ */}
            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, tên, mã việc hệ thống nguồn"
                    width={310}
                  />
                  <FilterCombobox
                    label="Trạng thái:"
                    multiple
                    options={STATUS_OPTIONS}
                    value={statuses}
                    onChange={setStatuses}
                    width={210}
                  />
                  <FilterCombobox
                    label="Hệ thống:"
                    multiple
                    options={SYSTEM_OPTIONS}
                    value={systems}
                    onChange={setSystems}
                    width={220}
                  />
                </>
              }
              filterCount={filterCount}
              filterOpen={filterOpen}
              onToggleFilter={() => setFilterOpen((o) => !o)}
            />

            {/* ------------------------ Bảng -------------------------- */}
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
              onRowClick={goDetail}
              stickyLast
              emptyTitle="Không có hành động phù hợp"
              emptyDescription="Thử bỏ bớt điều kiện lọc, đổi tab hoặc xoá từ khoá tìm kiếm."
              emptyAction={
                canEdit ? (
                  <Button
                    variant="primary"
                    icon={<IconPlus size={16} />}
                    onClick={() => router.push("/khac-phuc/kppn/them-moi")}
                  >
                    Thêm hành động
                  </Button>
                ) : undefined
              }
              rowClassName={(k) =>
                isKppnOverdue(k) ? "!bg-lv-critical-bg" : undefined
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
          </div>

          {/* -------------------- Bộ lọc nâng cao -------------------- */}
          <FilterPanel
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onReset={resetFilter}
          >
            <FilterGroup label="Loại hành động">
              <FilterCombobox
                label="Loại:"
                multiple
                options={TYPE_OPTIONS}
                value={types}
                onChange={setTypes}
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Đơn vị thực hiện">
              <FilterCombobox
                label="Đơn vị:"
                options={lk.unitOptions}
                value={unitId}
                onChange={setUnitId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Người thực hiện">
              <FilterCombobox
                label="Người:"
                options={lk.employeeOptions}
                value={assigneeId}
                onChange={setAssigneeId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Người giám sát">
              <FilterCombobox
                label="Giám sát:"
                options={lk.employeeOptions}
                value={supervisorId}
                onChange={setSupervisorId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Điểm yếu nguồn">
              <FilterCombobox
                label="Điểm yếu:"
                options={deficiencyOptions}
                value={deficiencyId}
                onChange={setDeficiencyId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Tình trạng theo dõi">
              <Checkbox
                label="Chỉ hành động quá hạn"
                checked={onlyOverdue}
                onChange={(e) => setOnlyOverdue(e.target.checked)}
              />
              <Checkbox
                label="Chỉ hành động chậm tiến độ"
                checked={onlyBehind}
                onChange={(e) => setOnlyBehind(e.target.checked)}
              />
              <Checkbox
                label="Chỉ hành động chưa giao việc"
                checked={onlyNotPushed}
                onChange={(e) => setOnlyNotPushed(e.target.checked)}
              />
              <Checkbox
                label="Chỉ hành động lâu chưa đồng bộ"
                checked={onlySyncStale}
                onChange={(e) => setOnlySyncStale(e.target.checked)}
              />
            </FilterGroup>
          </FilterPanel>
        </div>
      </div>

      {/* ---------------------- Thanh chọn nhiều ---------------------- */}
      <BulkActionBar
        count={t.selectedKeys.length}
        totalCount={t.total}
        onClear={t.clearSelection}
        onSelectAll={t.selectAll}
      >
        <BulkButton icon={<IconSend size={16} />} onClick={bulkPush}>
          Giao việc
        </BulkButton>
        <BulkButton icon={<IconArrowRight size={16} />} onClick={bulkNext}>
          Chuyển trạng thái
        </BulkButton>
        <BulkButton
          danger
          icon={<IconTrash size={16} />}
          onClick={() => setBulkDelete(true)}
        >
          Xoá
        </BulkButton>
      </BulkActionBar>

      {/* -------------------------- Hộp thoại ------------------------ */}
      <KppnTransitionModal
        kppn={transiting}
        canApprove={canApprove}
        onClose={() => setTransiting(null)}
        onDone={(msg, detail) => {
          setTransiting(null);
          toast.success(msg, detail);
        }}
        onPush={pushOne}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            kppnRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá hành động khắc phục"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b> - {deleting?.name}?
            Hành động này không thể hoàn tác.
          </>
        }
        confirmText="Xoá"
      />

      <ConfirmDialog
        open={bulkDelete}
        onClose={() => setBulkDelete(false)}
        onConfirm={() => {
          const ids = t.selectedKeys.filter((id) => {
            const k = kppnRepo.getById(id);
            return k ? isKppnDeletable(k.status) : false;
          });
          const skipped = t.selectedKeys.length - ids.length;
          kppnRepo.removeMany(ids);
          t.clearSelection();
          setBulkDelete(false);
          if (ids.length === 0) {
            toast.error(
              "Không xoá được bản ghi nào",
              "Chỉ xoá được hành động ở trạng thái Nháp.",
            );
            return;
          }
          toast.success(
            `Đã xoá ${ids.length} hành động`,
            skipped > 0
              ? `${skipped} bản ghi bị bỏ qua vì đã trình duyệt hoặc đang triển khai.`
              : undefined,
          );
        }}
        tone="danger"
        title="Xoá nhiều hành động"
        message={
          <>
            Bạn đã chọn <b>{t.selectedKeys.length}</b> bản ghi. Hệ thống chỉ xoá
            những hành động ở trạng thái <b>Nháp</b>, các bản ghi khác được giữ
            nguyên.
          </>
        }
        confirmText="Xoá các bản hợp lệ"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Thẻ thống kê nhỏ                                        */
/* ================================================================== */

function StatChip({
  icon,
  label,
  value,
  tone,
  active = false,
  onClick,
  title,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone: "brand" | "success" | "warning" | "high" | "danger";
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    success: "bg-lv-low-bg text-lv-low-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    high: "bg-lv-high-bg text-lv-high-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
  };

  const ring: Record<string, string> = {
    brand: "ring-brand",
    success: "ring-lv-low-text",
    warning: "ring-lv-medium-text",
    high: "ring-lv-high-text",
    danger: "ring-lv-critical-text",
  };

  const content = (
    <>
      {icon}
      {label}
      <b className="text-[13px]">{value}</b>
    </>
  );

  const base = cn(
    "inline-flex items-center gap-1.5 rounded-ctrl px-2.5 py-1 text-[12px] font-medium transition-all",
    style[tone],
    value === 0 && !active && "opacity-55",
  );

  if (!onClick) {
    return (
      <span className={base} title={title}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        base,
        "cursor-pointer hover:brightness-95",
        active && "opacity-100 ring-2 ring-offset-1",
        active && ring[tone],
      )}
    >
      {content}
    </button>
  );
}

/* ================================================================== */
/* Hộp thoại chuyển trạng thái hành động KPPN                          */
/* ================================================================== */

function KppnTransitionModal({
  kppn,
  canApprove,
  onClose,
  onDone,
  onPush,
}: {
  kppn: Kppn | null;
  canApprove: boolean;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onPush: (k: Kppn) => void;
}) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState("");
  const [evidence, setEvidence] = useState("");
  const [completedDate, setCompletedDate] = useState("");
  const [autoPush, setAutoPush] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState("");

  const list = kppn ? kppnNextTransitions(kppn.status) : [];

  const key = kppn?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    setTarget(list[0]?.to ?? "");
    setReason("");
    setResult(kppn?.result ?? "");
    setEvidence(kppn?.evidenceNote ?? "");
    setCompletedDate(kppn?.completedDate || toInputDate(new Date()));
    setAutoPush(true);
    setErrors({});
  }

  const selected = list.find((tr) => tr.to === target) ?? list[0];

  const isApprovalStep =
    selected?.to === "Chưa bắt đầu" && kppn?.status === "Chờ duyệt";
  const isAcceptanceStep = selected?.to === "Hoàn thành";
  const willPush =
    isApprovalStep &&
    autoPush &&
    !!kppn &&
    kppn.executionSystem !== "Theo dõi trong GRC" &&
    !kppn.externalTaskCode;

  /* ------------------------ Cảnh báo mềm ------------------------ */

  const softWarnings = useMemo(() => {
    if (!kppn || !selected) return [] as string[];
    const out: string[] = [];

    if (isApprovalStep && kppn.executionSystem === "Theo dõi trong GRC")
      out.push(
        "Hành động được theo dõi trực tiếp trong GRC nên không giao việc sang hệ thống nguồn. Người thực hiện phải tự cập nhật tiến độ tại đây.",
      );

    if (isAcceptanceStep && !kppn.supervisorId)
      out.push(
        "Hành động chưa có người giám sát, việc nghiệm thu sẽ thiếu người xác nhận độc lập.",
      );

    if (isAcceptanceStep && isKppnOverdue(kppn))
      out.push(
        `Hành động đã quá hạn ${Math.abs(kppnDaysToDue(kppn) ?? 0)} ngày, nên ghi rõ lý do chậm trễ trong kết quả thực hiện.`,
      );

    if (selected.to === "Huỷ" && kppn.progress > 0)
      out.push(
        `Hành động đã đạt tiến độ ${kppn.progress}%. Huỷ sẽ mất toàn bộ kết quả đang theo dõi, nên cân nhắc phương án thay thế.`,
      );

    return out;
  }, [kppn, selected, isApprovalStep, isAcceptanceStep]);

  function submit() {
    if (!kppn || !selected) return;

    const err: Record<string, string> = {};

    if (selected.requireReason && !reason.trim())
      err.reason = "Bắt buộc nhập lý do khi chuyển sang trạng thái này";

    if (isAcceptanceStep) {
      if (!result.trim()) err.result = "Bắt buộc mô tả kết quả thực hiện";
      if (!evidence.trim())
        err.evidence = "Bắt buộc mô tả bằng chứng nghiệm thu";
      if (!completedDate) err.completedDate = "Bắt buộc nhập ngày hoàn thành";
      else if (completedDate < kppn.startDate)
        err.completedDate = "Ngày hoàn thành phải sau ngày bắt đầu";
    }

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    const patch: Partial<Kppn> = {
      status: selected.to,
      statusNote: reason.trim() || kppn.statusNote,
    };

    if (isAcceptanceStep) {
      patch.progress = 100;
      patch.completedDate = completedDate;
      patch.result = result.trim();
      patch.evidenceNote = evidence.trim();
    }

    if (selected.to === "Đang thực hiện" && kppn.progress === 0)
      patch.progress = 5;

    kppnRepo.update(kppn.id, patch);

    onDone(
      `${kppn.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${kppn.status} sang ${selected.to}.`,
    );

    /* Giao việc ngay sau khi phê duyệt nếu người dùng chọn */
    if (willPush) {
      const fresh = kppnRepo.getById(kppn.id);
      if (fresh) onPush(fresh);
    }
  }

  return (
    <Modal
      open={!!kppn}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái hành động"
      description={kppn ? `${kppn.code} - ${kppn.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={selected?.tone === "danger" ? "danger" : "primary"}
            onClick={submit}
            disabled={!selected || (isApprovalStep && !canApprove)}
          >
            {selected?.label ?? "Chuyển"}
          </Button>
        </>
      }
    >
      {kppn && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
            <span className="text-[12px] text-text-secondary">Hiện tại</span>
            <StatusBadge status={kppn.status} />
            <IconArrowRight size={16} className="text-icon-neutral" />
            <span className="text-[12px] text-text-secondary">Chuyển sang</span>
            {selected ? (
              <StatusBadge status={selected.to} />
            ) : (
              <span className="text-[13px] text-text-hint">
                Không còn trạng thái kế tiếp
              </span>
            )}
            <span className="ml-auto text-[12px] text-text-secondary">
              Tiến độ <b className="text-text-primary">{kppn.progress}%</b>
            </span>
          </div>

          {list.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              Hành động đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-text-primary">
                  Chọn hành động
                </span>
                {list.map((tr) => (
                  <Radio
                    key={tr.to}
                    name="kppn-transition"
                    label={tr.label}
                    description={`Trạng thái sau khi chuyển: ${tr.to}${
                      tr.requireReason ? " - bắt buộc nhập lý do" : ""
                    }`}
                    checked={selected?.to === tr.to}
                    onChange={() => {
                      setTarget(tr.to);
                      setErrors({});
                    }}
                  />
                ))}
              </div>

              {/* Bước phê duyệt và giao việc */}
              {isApprovalStep && (
                <div className="flex flex-col gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <IconCloudUpload size={15} />
                    Giao việc sang hệ thống thực thi
                  </span>
                  {kppn.executionSystem === "Theo dõi trong GRC" ? (
                    <span>
                      Hành động này được theo dõi trực tiếp trong GRC, không tạo
                      việc trên hệ thống ngoài.
                    </span>
                  ) : kppn.externalTaskCode ? (
                    <span>
                      Đã có mã việc <b>{kppn.externalTaskCode}</b> trên{" "}
                      {kppn.executionSystem}, không tạo thêm.
                    </span>
                  ) : (
                    <Checkbox
                      label={`Tạo việc trên ${kppn.executionSystem} ngay sau khi phê duyệt`}
                      checked={autoPush}
                      onChange={(e) => setAutoPush(e.target.checked)}
                    />
                  )}
                  {!canApprove && (
                    <span className="font-medium">
                      Chỉ Quản trị hệ thống và Ban QTRR mới được phê duyệt hành
                      động.
                    </span>
                  )}
                </div>
              )}

              {/* Bước nghiệm thu */}
              {isAcceptanceStep && (
                <div className="flex flex-col gap-3 rounded-card border border-lv-low-border bg-lv-low-bg/40 p-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-low-text">
                    <IconCircleCheck size={16} />
                    Hồ sơ nghiệm thu
                  </p>
                  <p className="text-[12px] leading-4 text-lv-low-text">
                    Hành động hoàn thành bắt buộc có kết quả và bằng chứng. Hệ
                    thống sẽ tự đặt tiến độ 100%.
                  </p>

                  <DateInput
                    label="Ngày hoàn thành"
                    required
                    value={completedDate}
                    min={kppn.startDate || undefined}
                    error={errors.completedDate}
                    onChange={(v) => {
                      setCompletedDate(v);
                      setErrors((p) => ({ ...p, completedDate: "" }));
                    }}
                  />

                  <Textarea
                    label="Kết quả thực hiện"
                    required
                    rows={3}
                    maxLength={800}
                    showCount
                    placeholder="Đã làm gì, kết quả đo được ra sao"
                    value={result}
                    error={errors.result}
                    onChange={(e) => {
                      setResult(e.target.value);
                      setErrors((p) => ({ ...p, result: "" }));
                    }}
                  />

                  <Textarea
                    label="Bằng chứng nghiệm thu"
                    required
                    rows={2}
                    maxLength={500}
                    placeholder="Biên bản, ảnh chụp cấu hình, báo cáo kiểm tra lại"
                    value={evidence}
                    error={errors.evidence}
                    onChange={(e) => {
                      setEvidence(e.target.value);
                      setErrors((p) => ({ ...p, evidence: "" }));
                    }}
                  />
                </div>
              )}

              <Textarea
                label="Lý do / ghi chú"
                required={selected?.requireReason}
                rows={3}
                maxLength={500}
                showCount
                value={reason}
                error={errors.reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErrors((p) => ({ ...p, reason: "" }));
                }}
                placeholder="Nhập lý do hoặc ghi chú cho lần chuyển trạng thái này"
              />

              {softWarnings.length > 0 && (
                <div className="flex flex-col gap-1 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <IconAlertTriangle size={15} />
                    Lưu ý
                  </span>
                  <ul className="flex flex-col gap-0.5 pl-5">
                    {softWarnings.map((r, i) => (
                      <li key={i} className="list-disc">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {kppn.lastSyncedAt && (
                <p className="text-[11px] text-text-hint">
                  Đồng bộ gần nhất với {kppn.executionSystem}:{" "}
                  {formatDateTime(kppn.lastSyncedAt)}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
