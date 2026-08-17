"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconCoin,
  IconDownload,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconHourglass,
  IconLock,
  IconPlus,
  IconRadar,
  IconShieldCheck,
  IconTrash,
  IconUserExclamation,
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
import { eventRepo, kppnRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  EVENT_IMPACT_TYPES,
  EVENT_STATUSES,
  RISK_LEVELS,
} from "@/lib/domain/enums";
import {
  EVENT_STATUS_ORDER,
  SEVERITY_ORDER,
  canViewEvent,
  detectionLag,
  eventAging,
  eventDisplayName,
  eventNextTransitions,
  eventSearchText,
  isEventClosed,
  isEventDeletable,
  isEventEditable,
  isMissingHandler,
  isMissingRiskLink,
  isMissingRootCause,
  isSlowDetection,
  isStaleEvent,
  netLoss,
  summarizeEvents,
  type EventViewer,
} from "@/lib/domain/event-utils";
import type { GrcEvent } from "@/lib/domain/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const STATUS_OPTIONS = EVENT_STATUSES.map((s) => ({ value: s, label: s }));
const SEVERITY_OPTIONS = RISK_LEVELS.map((s) => ({ value: s, label: s }));
const IMPACT_OPTIONS = EVENT_IMPACT_TYPES.map((s) => ({ value: s, label: s }));

type TabKey = "open" | "mine" | "attention" | "nearmiss" | "closed";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function SoTheoDoiSuKienScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const events = useCollection(eventRepo);
  const kppns = useCollection(kppnRepo);

  const canEdit = hasRole("admin", "qtrr", "owner");

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );

  /** Người có quyền xem nội dung sự kiện bảo mật */
  const viewer = useMemo<EventViewer>(
    () => ({
      privileged: hasRole("admin", "qtrr", "auditor"),
      employeeId: currentEmployee?.id ?? "",
    }),
    [hasRole, currentEmployee],
  );

  const visibleOf = (e: GrcEvent) => canViewEvent(e, viewer);

  /** Số hành động KPPN gắn với từng sự kiện */
  const kppnCountOf = useMemo(() => {
    const map = new Map<string, number>();
    kppns.forEach((k) => {
      if (!k.eventId) return;
      map.set(k.eventId, (map.get(k.eventId) ?? 0) + 1);
    });
    return map;
  }, [kppns]);

  /* ---------------------------- Bộ lọc ---------------------------- */

  const [tab, setTab] = useState<TabKey>("open");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [impacts, setImpacts] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [handlerId, setHandlerId] = useState<string | null>(null);
  const [onlyNearMiss, setOnlyNearMiss] = useState(false);
  const [onlyConfidential, setOnlyConfidential] = useState(false);
  const [onlyMissingRisk, setOnlyMissingRisk] = useState(false);
  const [onlySlowDetection, setOnlySlowDetection] = useState(false);
  const [onlyStale, setOnlyStale] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  /* ---------------------------- Hộp thoại ------------------------- */

  const [deleting, setDeleting] = useState<GrcEvent | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [transiting, setTransiting] = useState<GrcEvent | null>(null);

  /* ------------------------- Lọc theo tab ------------------------- */

  function matchTab(e: GrcEvent): boolean {
    switch (tab) {
      case "mine":
        return (
          !!currentEmployee &&
          (e.reporterId === currentEmployee.id ||
            e.handlerId === currentEmployee.id)
        );
      case "attention":
        return (
          isMissingRiskLink(e) ||
          isMissingRootCause(e) ||
          isMissingHandler(e) ||
          isSlowDetection(e) ||
          isStaleEvent(e)
        );
      case "nearmiss":
        return e.isNearMiss;
      case "closed":
        return isEventClosed(e);
      default:
        return !isEventClosed(e);
    }
  }

  const tabCounts = useMemo(
    () => ({
      open: events.filter((e) => !isEventClosed(e)).length,
      mine: currentEmployee
        ? events.filter(
            (e) =>
              e.reporterId === currentEmployee.id ||
              e.handlerId === currentEmployee.id,
          ).length
        : 0,
      attention: events.filter(
        (e) =>
          isMissingRiskLink(e) ||
          isMissingRootCause(e) ||
          isMissingHandler(e) ||
          isSlowDetection(e) ||
          isStaleEvent(e),
      ).length,
      nearmiss: events.filter((e) => e.isNearMiss).length,
      closed: events.filter((e) => isEventClosed(e)).length,
    }),
    [events, currentEmployee],
  );

  /* --------------------------- Table state ------------------------ */

  const t = useTableState<GrcEvent>(events, {
    getKey: (e) => e.id,
    searchText: (e) =>
      visibleOf(e)
        ? eventSearchText(e, [
            lk.unitName(e.unitId, ""),
            lk.categoryName(e.categoryId, ""),
            lk.employeeName(e.reporterId, ""),
            lk.employeeName(e.handlerId, ""),
          ])
        : `${e.code} ${lk.unitName(e.unitId, "")}`,
    filter: (e) => {
      if (!matchTab(e)) return false;
      if (statuses.length > 0 && !statuses.includes(e.status)) return false;
      if (severities.length > 0 && !severities.includes(e.severity))
        return false;
      if (impacts.length > 0 && !e.impactTypes.some((x) => impacts.includes(x)))
        return false;
      if (categoryId && e.categoryId !== categoryId) return false;
      if (unitId && e.unitId !== unitId) return false;
      if (handlerId && e.handlerId !== handlerId) return false;
      if (onlyNearMiss && !e.isNearMiss) return false;
      if (onlyConfidential && !e.isConfidential) return false;
      if (onlyMissingRisk && !isMissingRiskLink(e)) return false;
      if (onlySlowDetection && !isSlowDetection(e)) return false;
      if (onlyStale && !isStaleEvent(e)) return false;
      return true;
    },
    sortValue: (e, key) => {
      switch (key) {
        case "code":
          return e.code;
        case "name":
          return visibleOf(e) ? e.name : e.code;
        case "category":
          return lk.categoryName(e.categoryId, "");
        case "unit":
          return lk.unitName(e.unitId, "");
        case "occurred":
          return e.occurredDate;
        case "lag":
          return detectionLag(e);
        case "severity":
          return SEVERITY_ORDER[e.severity];
        case "loss":
          return e.actualLoss ?? -1;
        case "handler":
          return lk.employeeName(e.handlerId, "");
        case "aging":
          return eventAging(e);
        case "status":
          return EVENT_STATUS_ORDER[e.status];
        default:
          return null;
      }
    },
    defaultSort: { key: "occurred", dir: "desc" },
    pageSize: 20,
    filterDeps: [
      tab,
      statuses,
      severities,
      impacts,
      categoryId,
      unitId,
      handlerId,
      onlyNearMiss,
      onlyConfidential,
      onlyMissingRisk,
      onlySlowDetection,
      onlyStale,
    ],
  });

  const summary = useMemo(() => summarizeEvents(t.rows), [t.rows]);

  const filterCount =
    statuses.length +
    severities.length +
    impacts.length +
    (categoryId ? 1 : 0) +
    (unitId ? 1 : 0) +
    (handlerId ? 1 : 0) +
    (onlyNearMiss ? 1 : 0) +
    (onlyConfidential ? 1 : 0) +
    (onlyMissingRisk ? 1 : 0) +
    (onlySlowDetection ? 1 : 0) +
    (onlyStale ? 1 : 0);

  function resetFilter() {
    setStatuses([]);
    setSeverities([]);
    setImpacts([]);
    setCategoryId(null);
    setUnitId(null);
    setHandlerId(null);
    setOnlyNearMiss(false);
    setOnlyConfidential(false);
    setOnlyMissingRisk(false);
    setOnlySlowDetection(false);
    setOnlyStale(false);
  }

  function toggleSeverity(v: string) {
    setSeverities((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  /* --------------------------- Hành động -------------------------- */

  function goDetail(e: GrcEvent) {
    if (!visibleOf(e)) {
      toast.warning(
        "Không có quyền xem",
        `${e.code} là sự kiện bảo mật, chỉ Ban QTRR, Kiểm toán nội bộ và người liên quan trực tiếp mới xem được.`,
      );
      return;
    }
    router.push(`/su-kien/so-theo-doi/${e.code}`);
  }

  function goEdit(e: GrcEvent) {
    if (!visibleOf(e)) {
      toast.warning("Không có quyền sửa", `${e.code} là sự kiện bảo mật.`);
      return;
    }
    if (!isEventEditable(e.status)) {
      toast.warning(
        "Không sửa được",
        `Sự kiện đang ở trạng thái ${e.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/su-kien/so-theo-doi/${e.code}/sua`);
  }

  function confirmDelete(e: GrcEvent) {
    if (!isEventDeletable(e)) {
      toast.error(
        "Không xoá được",
        `Chỉ xoá được sự kiện ở trạng thái Mới ghi nhận. ${e.code} đang ở trạng thái ${e.status}.`,
      );
      return;
    }
    setDeleting(e);
  }

  function quickNext(e: GrcEvent) {
    if (!visibleOf(e)) {
      toast.warning("Không có quyền xử lý", `${e.code} là sự kiện bảo mật.`);
      return;
    }
    if (eventNextTransitions(e.status).length === 0) {
      toast.warning(
        "Không chuyển được",
        `${e.status} là trạng thái cuối của luồng.`,
      );
      return;
    }
    setTransiting(e);
  }

  function bulkNext() {
    let moved = 0;
    let blocked = 0;
    t.selectedKeys.forEach((id) => {
      const e = eventRepo.getById(id);
      if (!e) return;
      if (!visibleOf(e)) {
        blocked += 1;
        return;
      }
      const auto = eventNextTransitions(e.status).find(
        (tr) => !tr.requireReason && tr.to !== "Đã đóng",
      );
      if (!auto) {
        blocked += 1;
        return;
      }
      eventRepo.update(id, { status: auto.to });
      moved += 1;
    });
    t.clearSelection();
    if (moved === 0) {
      toast.warning(
        "Không có bản ghi nào được chuyển",
        "Các sự kiện đã chọn ở trạng thái cuối, cần nhập lý do, hoặc bạn không có quyền xử lý.",
      );
      return;
    }
    toast.success(
      `Đã chuyển trạng thái ${moved} sự kiện`,
      blocked > 0 ? `${blocked} bản ghi bị bỏ qua.` : undefined,
    );
  }

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<GrcEvent>[] = [
    {
      key: "code",
      header: "Mã sự kiện",
      width: 140,
      sortable: true,
      render: (e) => <CodeCell code={e.code} onClick={() => goDetail(e)} />,
    },
    {
      key: "name",
      header: "Tên sự kiện",
      minWidth: 330,
      sortable: true,
      render: (e) => {
        const visible = visibleOf(e);
        return (
          <TitleCell
            title={
              <span className="flex min-w-0 items-center gap-1.5">
                {!visible && (
                  <IconLock size={13} className="shrink-0 text-text-hint" />
                )}
                <span
                  className={cn(
                    "truncate",
                    !visible && "text-text-secondary italic",
                  )}
                >
                  {eventDisplayName(e, visible)}
                </span>
                {e.isNearMiss && (
                  <Tooltip content="Sự kiện suýt xảy ra, chưa phát sinh tổn thất thực tế">
                    <Badge tone="info" size="sm">
                      Near miss
                    </Badge>
                  </Tooltip>
                )}
                {e.isConfidential && visible && (
                  <Tooltip content="Sự kiện bảo mật, hạn chế phạm vi tiếp cận">
                    <Badge tone="neutral" size="sm">
                      Bảo mật
                    </Badge>
                  </Tooltip>
                )}
                {isMissingRiskLink(e) && (
                  <Tooltip content="Sự kiện mức Cao trở lên nhưng chưa liên kết rủi ro">
                    <Badge tone="danger" size="sm">
                      Thiếu rủi ro
                    </Badge>
                  </Tooltip>
                )}
              </span>
            }
            sub={
              visible ? (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {lk.categoryName(e.categoryId)}
                  {e.impactTypes.length > 0 && (
                    <span className="text-text-hint">
                      - Ảnh hưởng: {e.impactTypes.join(", ")}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-text-hint">
                  Nội dung bị ẩn theo chính sách bảo mật
                </span>
              )
            }
          />
        );
      },
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 165,
      sortable: true,
      render: (e) => lk.unitName(e.unitId),
    },
    {
      key: "occurred",
      header: "Ngày xảy ra",
      width: 125,
      sortable: true,
      render: (e) => formatDate(e.occurredDate),
    },
    {
      key: "lag",
      header: "Độ trễ phát hiện",
      width: 155,
      align: "center",
      sortable: true,
      render: (e) => {
        const lag = detectionLag(e);
        if (lag === 0)
          return (
            <Tooltip content="Phát hiện ngay trong ngày xảy ra">
              <span className="text-[13px] text-lv-low-text">Cùng ngày</span>
            </Tooltip>
          );
        const slow = isSlowDetection(e);
        return (
          <Tooltip
            content={
              slow
                ? "Phát hiện chậm, dấu hiệu kiểm soát phát hiện đang yếu"
                : `Phát hiện sau ${lag} ngày`
            }
          >
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[13px]",
                slow ? "font-medium text-danger" : "text-text-secondary",
              )}
            >
              {slow && <IconRadar size={14} />}
              {lag} ngày
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "severity",
      header: "Mức độ",
      width: 135,
      sortable: true,
      render: (e) => <RiskBadge level={e.severity} />,
    },
    {
      key: "loss",
      header: "Tổn thất thực tế",
      width: 165,
      align: "right",
      sortable: true,
      render: (e) => {
        if (!visibleOf(e)) return <span className="text-text-hint">--</span>;
        if (e.isNearMiss)
          return (
            <Tooltip content="Sự kiện suýt xảy ra nên không có tổn thất thực tế">
              <span className="text-[12px] text-text-hint">
                Không phát sinh
              </span>
            </Tooltip>
          );
        if (e.actualLoss === null)
          return <span className="text-text-hint">--</span>;
        const net = netLoss(e);
        return (
          <span className="flex flex-col items-end">
            <b className="text-[13px] text-text-primary">
              {formatMoney(e.actualLoss)}
            </b>
            {(e.recoveredAmount ?? 0) > 0 && (
              <span className="text-[11px] text-lv-low-text">
                Ròng {formatMoney(net)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "handler",
      header: "Người xử lý",
      width: 200,
      sortable: true,
      render: (e) => {
        if (!visibleOf(e))
          return <span className="text-[12px] text-text-hint">Bảo mật</span>;
        if (!e.handlerId)
          return (
            <Tooltip content="Chưa phân công người xử lý">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[12px]",
                  isMissingHandler(e)
                    ? "font-medium text-lv-medium-text"
                    : "text-text-hint",
                )}
              >
                <IconUserExclamation size={14} />
                Chưa phân công
              </span>
            </Tooltip>
          );
        return (
          <UserCell
            name={lk.employeeName(e.handlerId)}
            sub={`Báo cáo: ${lk.employeeName(e.reporterId, "không rõ")}`}
            size={24}
          />
        );
      },
    },
    {
      key: "aging",
      header: "Số ngày mở",
      width: 125,
      align: "center",
      sortable: true,
      render: (e) => {
        if (isEventClosed(e)) return <span className="text-text-hint">--</span>;
        const age = eventAging(e);
        return (
          <span
            className={cn(
              "text-[13px]",
              isStaleEvent(e)
                ? "font-medium text-danger"
                : "text-text-secondary",
            )}
          >
            {age}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 150,
      sortable: true,
      render: (e) => (
        <span className="flex flex-col gap-0.5">
          <StatusBadge status={e.status} />
          {isMissingRootCause(e) && (
            <Tooltip content="Chưa phân tích nguyên nhân gốc, không đóng được sự kiện">
              <span className="text-[11px] font-medium text-lv-medium-text">
                Thiếu nguyên nhân gốc
              </span>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: 122,
      align: "right",
      render: (e) => (
        <RowActions>
          <Tooltip content={visibleOf(e) ? "Xem chi tiết" : "Nội dung bảo mật"}>
            <IconButton label="Xem chi tiết" onClick={() => goDetail(e)}>
              {visibleOf(e) ? (
                <IconEye size={16} />
              ) : (
                <IconEyeOff size={16} className="text-text-hint" />
              )}
            </IconButton>
          </Tooltip>
          {canEdit && visibleOf(e) && (
            <>
              <Tooltip content="Sửa">
                <IconButton label="Sửa" onClick={() => goEdit(e)}>
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Chuyển trạng thái">
                <IconButton
                  label="Chuyển trạng thái"
                  onClick={() => quickNext(e)}
                >
                  <IconArrowRight size={16} />
                </IconButton>
              </Tooltip>
              {isEventDeletable(e) && (
                <Tooltip content="Xoá">
                  <IconButton label="Xoá" onClick={() => confirmDelete(e)}>
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

  return (
    <PageContainer>
      <PageHeader
        title="Sổ theo dõi sự kiện"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị tệp Excel cho ${t.total} sự kiện (giả lập).`,
                )
              }
            >
              Xuất khẩu
            </Button>
            <Button
              variant="secondary"
              icon={<IconBolt size={16} />}
              onClick={() => router.push("/su-kien/bao-cao-nhanh")}
            >
              Báo cáo nhanh
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                icon={<IconPlus size={16} />}
                onClick={() => router.push("/su-kien/so-theo-doi/them-moi")}
              >
                Ghi nhận sự kiện
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
                  { key: "open", label: "Đang mở", count: tabCounts.open },
                  { key: "mine", label: "Của tôi", count: tabCounts.mine },
                  {
                    key: "attention",
                    label: "Hồ sơ chưa đủ",
                    count: tabCounts.attention,
                  },
                  {
                    key: "nearmiss",
                    label: "Suýt xảy ra",
                    count: tabCounts.nearmiss,
                  },
                  {
                    key: "closed",
                    label: "Đã đóng & huỷ",
                    count: tabCounts.closed,
                  },
                ]}
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
              />
            </div>

            {/* --------------------- Thẻ thống kê --------------------- */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-light px-3 py-2.5">
              <StatChip
                icon={<IconBolt size={15} />}
                label="Đang hiển thị"
                value={summary.total}
                tone="brand"
                title={`Độ trễ phát hiện bình quân ${summary.avgDetectionLag} ngày`}
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">Mức độ:</span>

              <StatChip
                label="Trọng yếu"
                value={summary.bySeverity["Trọng yếu"]}
                tone="danger"
                active={severities.includes("Trọng yếu")}
                onClick={() => toggleSeverity("Trọng yếu")}
              />
              <StatChip
                label="Cao"
                value={summary.bySeverity["Cao"]}
                tone="high"
                active={severities.includes("Cao")}
                onClick={() => toggleSeverity("Cao")}
              />
              <StatChip
                label="Trung bình"
                value={summary.bySeverity["Trung bình"]}
                tone="warning"
                active={severities.includes("Trung bình")}
                onClick={() => toggleSeverity("Trung bình")}
              />
              <StatChip
                label="Thấp"
                value={summary.bySeverity["Thấp"]}
                tone="success"
                active={severities.includes("Thấp")}
                onClick={() => toggleSeverity("Thấp")}
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">Cảnh báo:</span>

              <StatChip
                icon={<IconShieldCheck size={15} />}
                label="Thiếu liên kết rủi ro"
                value={summary.missingRiskLink}
                tone="danger"
                active={onlyMissingRisk}
                onClick={() => setOnlyMissingRisk((v) => !v)}
                title="Sự kiện mức Cao trở lên chưa liên kết ngược về rủi ro"
              />
              <StatChip
                icon={<IconRadar size={15} />}
                label="Phát hiện chậm"
                value={summary.slowDetection}
                tone="high"
                active={onlySlowDetection}
                onClick={() => setOnlySlowDetection((v) => !v)}
                title="Quá 7 ngày sau khi xảy ra mới được phát hiện"
              />
              <StatChip
                icon={<IconHourglass size={15} />}
                label="Mở quá 60 ngày"
                value={summary.stale}
                tone="warning"
                active={onlyStale}
                onClick={() => setOnlyStale((v) => !v)}
                title="Sự kiện chưa đóng dù đã phát hiện hơn 60 ngày"
              />
              <StatChip
                icon={<IconEyeOff size={15} />}
                label="Suýt xảy ra"
                value={summary.nearMiss}
                tone="brand"
                active={onlyNearMiss}
                onClick={() => setOnlyNearMiss((v) => !v)}
                title="Chưa phát sinh tổn thất nhưng vẫn phải ghi nhận để rút kinh nghiệm"
              />
              {viewer.privileged && (
                <StatChip
                  icon={<IconLock size={15} />}
                  label="Bảo mật"
                  value={summary.confidential}
                  tone="warning"
                  active={onlyConfidential}
                  onClick={() => setOnlyConfidential((v) => !v)}
                  title="Sự kiện hạn chế phạm vi tiếp cận"
                />
              )}

              <span className="ml-auto flex items-center gap-1.5 text-[12px] text-text-secondary">
                <IconCoin size={14} />
                Tổn thất ròng:{" "}
                <b className="text-text-primary">
                  {formatMoney(summary.netLoss)}
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
                    placeholder="Tìm theo mã, tên, nguyên nhân"
                    width={300}
                  />
                  <FilterCombobox
                    label="Trạng thái:"
                    multiple
                    options={STATUS_OPTIONS}
                    value={statuses}
                    onChange={setStatuses}
                    width={215}
                  />
                  <FilterCombobox
                    label="Ảnh hưởng:"
                    multiple
                    options={IMPACT_OPTIONS}
                    value={impacts}
                    onChange={setImpacts}
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
              getKey={(e) => e.id}
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
              emptyTitle="Không có sự kiện phù hợp"
              emptyDescription="Thử bỏ bớt điều kiện lọc, đổi tab hoặc xoá từ khoá tìm kiếm."
              emptyAction={
                canEdit ? (
                  <Button
                    variant="primary"
                    icon={<IconPlus size={16} />}
                    onClick={() => router.push("/su-kien/so-theo-doi/them-moi")}
                  >
                    Ghi nhận sự kiện
                  </Button>
                ) : undefined
              }
              rowClassName={(e) =>
                isMissingRiskLink(e) || isSlowDetection(e)
                  ? "!bg-lv-critical-bg"
                  : !visibleOf(e)
                    ? "!bg-surface-alt"
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
          </div>

          {/* -------------------- Bộ lọc nâng cao -------------------- */}
          <FilterPanel
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onReset={resetFilter}
          >
            <FilterGroup label="Mức độ nghiêm trọng">
              <FilterCombobox
                label="Mức:"
                multiple
                options={SEVERITY_OPTIONS}
                value={severities}
                onChange={setSeverities}
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Nhóm sự kiện">
              <FilterCombobox
                label="Nhóm:"
                options={lk.eventCategoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Đơn vị xảy ra">
              <FilterCombobox
                label="Đơn vị:"
                options={lk.unitOptions}
                value={unitId}
                onChange={setUnitId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Người xử lý">
              <FilterCombobox
                label="Người:"
                options={lk.employeeOptions}
                value={handlerId}
                onChange={setHandlerId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Chất lượng hồ sơ">
              <Checkbox
                label="Chỉ sự kiện suýt xảy ra"
                checked={onlyNearMiss}
                onChange={(e) => setOnlyNearMiss(e.target.checked)}
              />
              <Checkbox
                label="Chỉ sự kiện thiếu liên kết rủi ro"
                checked={onlyMissingRisk}
                onChange={(e) => setOnlyMissingRisk(e.target.checked)}
              />
              <Checkbox
                label="Chỉ sự kiện phát hiện chậm"
                checked={onlySlowDetection}
                onChange={(e) => setOnlySlowDetection(e.target.checked)}
              />
              <Checkbox
                label="Chỉ sự kiện mở quá 60 ngày"
                checked={onlyStale}
                onChange={(e) => setOnlyStale(e.target.checked)}
              />
              {viewer.privileged && (
                <Checkbox
                  label="Chỉ sự kiện bảo mật"
                  checked={onlyConfidential}
                  onChange={(e) => setOnlyConfidential(e.target.checked)}
                />
              )}
            </FilterGroup>

            {!viewer.privileged && (
              <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[11px] leading-4 text-lv-info-text">
                <IconLock size={14} className="mt-px shrink-0" />
                <span>
                  Một số sự kiện bảo mật bị che nội dung với vai trò hiện tại.
                  Số liệu tổng hợp vẫn tính đầy đủ.
                </span>
              </div>
            )}
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
      <EventTransitionModal
        event={transiting}
        kppnCount={transiting ? (kppnCountOf.get(transiting.id) ?? 0) : 0}
        onClose={() => setTransiting(null)}
        onDone={(msg, detail) => {
          setTransiting(null);
          toast.success(msg, detail);
        }}
        onError={(msg, detail) => toast.error(msg, detail)}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            eventRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá sự kiện"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b>? Hành động này không
            thể hoàn tác.
          </>
        }
        confirmText="Xoá"
      />

      <ConfirmDialog
        open={bulkDelete}
        onClose={() => setBulkDelete(false)}
        onConfirm={() => {
          const ids = t.selectedKeys.filter((id) => {
            const e = eventRepo.getById(id);
            return e ? isEventDeletable(e) && visibleOf(e) : false;
          });
          const skipped = t.selectedKeys.length - ids.length;
          eventRepo.removeMany(ids);
          t.clearSelection();
          setBulkDelete(false);
          if (ids.length === 0) {
            toast.error(
              "Không xoá được bản ghi nào",
              "Chỉ xoá được sự kiện ở trạng thái Mới ghi nhận mà bạn có quyền xem.",
            );
            return;
          }
          toast.success(
            `Đã xoá ${ids.length} sự kiện`,
            skipped > 0
              ? `${skipped} bản ghi bị bỏ qua vì đã đi vào xử lý hoặc bị hạn chế truy cập.`
              : undefined,
          );
        }}
        tone="danger"
        title="Xoá nhiều sự kiện"
        message={
          <>
            Bạn đã chọn <b>{t.selectedKeys.length}</b> bản ghi. Hệ thống chỉ xoá
            những sự kiện ở trạng thái <b>Mới ghi nhận</b>, các bản ghi khác
            được giữ nguyên.
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
/* Hộp thoại chuyển trạng thái sự kiện                                 */
/* ================================================================== */

function EventTransitionModal({
  event,
  kppnCount,
  onClose,
  onDone,
  onError,
}: {
  event: GrcEvent | null;
  kppnCount: number;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onError: (message: string, detail?: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [lastKey, setLastKey] = useState("");

  const list = event ? eventNextTransitions(event.status) : [];

  const key = event?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    setTarget(list[0]?.to ?? "");
    setReason("");
    setError("");
  }

  const selected = list.find((tr) => tr.to === target) ?? list[0];

  /* --------------------- Điều kiện chặn chuyển ------------------- */

  const blockReasons = useMemo(() => {
    if (!event || !selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Đang điều tra" && !event.handlerId)
      out.push(
        "Bắt buộc phân công người xử lý trước khi chuyển sang giai đoạn điều tra.",
      );

    if (selected.to === "Đã đóng") {
      if (!event.rootCause.trim())
        out.push("Bắt buộc phân tích nguyên nhân gốc trước khi đóng sự kiện.");
      if (
        (event.severity === "Cao" || event.severity === "Trọng yếu") &&
        event.relatedRiskIds.length === 0
      )
        out.push(
          "Sự kiện mức Cao trở lên phải liên kết ngược về rủi ro trước khi đóng.",
        );
    }

    return out;
  }, [event, selected]);

  /* ----------------------- Cảnh báo mềm ------------------------- */

  const softWarnings = useMemo(() => {
    if (!event || !selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Huỷ ghi nhận")
      out.push(
        "Huỷ ghi nhận nghĩa là xác nhận đây không phải sự kiện rủi ro. Bản ghi vẫn được lưu để truy vết nhưng không tính vào thống kê tổn thất.",
      );

    if (
      selected.to === "Đã đóng" &&
      (event.severity === "Cao" || event.severity === "Trọng yếu") &&
      kppnCount === 0
    )
      out.push(
        `Sự kiện mức ${event.severity} chưa có hành động khắc phục và phòng ngừa nào. Nên lập KPPN trước khi đóng để tránh tái diễn.`,
      );

    if (selected.to === "Đã đóng" && !event.lessonLearned.trim())
      out.push(
        "Chưa ghi bài học kinh nghiệm. Đây là giá trị lớn nhất của việc ghi nhận sự kiện.",
      );

    if (selected.to === "Đã xác minh" && event.relatedControlIds.length === 0)
      out.push(
        "Chưa xác định kiểm soát nào đã thất bại. Nên gắn kiểm soát liên quan để đánh giá lại hiệu lực.",
      );

    if (isSlowDetection(event))
      out.push(
        `Sự kiện được phát hiện sau ${detectionLag(event)} ngày. Nên ghi rõ nguyên nhân phát hiện chậm trong ghi chú.`,
      );

    return out;
  }, [event, selected, kppnCount]);

  function submit() {
    if (!event || !selected) return;

    if (blockReasons.length > 0) {
      onError("Chưa đủ điều kiện chuyển trạng thái", blockReasons.join(" "));
      return;
    }

    if (selected.requireReason && !reason.trim()) {
      setError("Bắt buộc nhập lý do khi chuyển sang trạng thái này");
      return;
    }

    eventRepo.update(event.id, {
      status: selected.to,
      statusNote: reason.trim() || event.statusNote,
    });

    onDone(
      `${event.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${event.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={!!event}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái sự kiện"
      description={event ? `${event.code} - ${event.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={selected?.tone === "danger" ? "danger" : "primary"}
            onClick={submit}
            disabled={!selected || blockReasons.length > 0}
          >
            {selected?.label ?? "Chuyển"}
          </Button>
        </>
      }
    >
      {event && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
            <span className="text-[12px] text-text-secondary">Hiện tại</span>
            <StatusBadge status={event.status} />
            <IconArrowRight size={16} className="text-icon-neutral" />
            <span className="text-[12px] text-text-secondary">Chuyển sang</span>
            {selected ? (
              <StatusBadge status={selected.to} />
            ) : (
              <span className="text-[13px] text-text-hint">
                Không còn trạng thái kế tiếp
              </span>
            )}
            <span className="ml-auto">
              <RiskBadge level={event.severity} />
            </span>
          </div>

          {list.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              Sự kiện đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                    name="event-transition"
                    label={tr.label}
                    description={`Trạng thái sau khi chuyển: ${tr.to}${
                      tr.requireReason ? " - bắt buộc nhập lý do" : ""
                    }`}
                    checked={selected?.to === tr.to}
                    onChange={() => {
                      setTarget(tr.to);
                      setError("");
                    }}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] text-text-secondary">
                <span>
                  Người xử lý:{" "}
                  <b
                    className={cn(
                      event.handlerId ? "text-text-primary" : "text-danger",
                    )}
                  >
                    {event.handlerId ? "Đã phân công" : "Chưa phân công"}
                  </b>
                </span>
                <span>
                  Nguyên nhân gốc:{" "}
                  <b
                    className={cn(
                      event.rootCause.trim()
                        ? "text-text-primary"
                        : "text-danger",
                    )}
                  >
                    {event.rootCause.trim() ? "Đã phân tích" : "Chưa có"}
                  </b>
                </span>
                <span>
                  Rủi ro liên kết:{" "}
                  <b className="text-text-primary">
                    {event.relatedRiskIds.length}
                  </b>
                </span>
                <span>
                  Hành động KPPN:{" "}
                  <b className="text-text-primary">{kppnCount}</b>
                </span>
              </div>

              <Textarea
                label="Lý do / ghi chú"
                required={selected?.requireReason}
                rows={3}
                maxLength={500}
                showCount
                value={reason}
                error={error}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Nhập lý do hoặc ghi chú cho lần chuyển trạng thái này"
              />

              {blockReasons.length > 0 && (
                <div className="flex flex-col gap-1 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <IconAlertTriangle size={15} />
                    Chưa đủ điều kiện chuyển trạng thái
                  </span>
                  <ul className="flex flex-col gap-0.5 pl-5">
                    {blockReasons.map((r, i) => (
                      <li key={i} className="list-disc">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {blockReasons.length === 0 && softWarnings.length > 0 && (
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
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
