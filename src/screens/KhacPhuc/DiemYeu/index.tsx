"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconClockExclamation,
  IconDownload,
  IconEdit,
  IconEye,
  IconFileSearch,
  IconHourglass,
  IconPlus,
  IconShieldCheck,
  IconStethoscope,
  IconTool,
  IconTrash,
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
import {
  controlRepo,
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  DEFICIENCY_SOURCES,
  DEFICIENCY_STATUSES,
  RISK_LEVELS,
} from "@/lib/domain/enums";
import {
  DEFICIENCY_STATUS_ORDER,
  SEVERITY_ORDER,
  deficiencyAging,
  deficiencyDaysToDue,
  deficiencyNextTransitions,
  deficiencySearchText,
  isDeficiencyDeletable,
  isDeficiencyDueSoon,
  isDeficiencyEditable,
  isDeficiencyOverdue,
  isMissingKppn,
  isMissingRootCause,
  summarizeDeficiencies,
} from "@/lib/domain/kppn-utils";
import { isKppnOverdue } from "@/lib/domain/schema";
import type { Deficiency, Kppn } from "@/lib/domain/schema";
import { formatDate } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const STATUS_OPTIONS = DEFICIENCY_STATUSES.map((s) => ({ value: s, label: s }));
const SOURCE_OPTIONS = DEFICIENCY_SOURCES.map((s) => ({ value: s, label: s }));
const SEVERITY_OPTIONS = RISK_LEVELS.map((s) => ({ value: s, label: s }));

const SOURCE_ICON: Record<string, React.ReactNode> = {
  "Kiểm tra kiểm soát": <IconShieldCheck size={14} />,
  "Sự kiện": <IconBolt size={14} />,
  "Kiểm toán nội bộ": <IconFileSearch size={14} />,
  "Tự phát hiện": <IconStethoscope size={14} />,
  "Đánh giá hiệu lực": <IconStethoscope size={14} />,
};

type TabKey = "open" | "mine" | "overdue" | "attention" | "closed";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function DiemYeuScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const deficiencies = useCollection(deficiencyRepo);
  const kppns = useCollection(kppnRepo);
  const controls = useCollection(controlRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);

  const canEdit = hasRole("admin", "qtrr", "owner");

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );

  /* ---------------- Bản đồ tra cứu nguồn liên kết ---------------- */

  const controlMap = useMemo(
    () => new Map(controls.map((c) => [c.id, c])),
    [controls],
  );
  const riskMap = useMemo(() => new Map(risks.map((r) => [r.id, r])), [risks]);
  const eventMap = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  /**
   * Lấy hành động KPPN theo quan hệ thật từ phía KPPN, không dựa vào
   * trường kppnIds để tránh lệch dữ liệu khi tạo hành động ở màn khác.
   */
  const kppnByDeficiency = useMemo(() => {
    const map = new Map<string, Kppn[]>();
    kppns.forEach((k) => {
      if (!k.deficiencyId) return;
      const arr = map.get(k.deficiencyId);
      if (arr) arr.push(k);
      else map.set(k.deficiencyId, [k]);
    });
    return map;
  }, [kppns]);

  const kppnCountOf = (id: string) => kppnByDeficiency.get(id)?.length ?? 0;

  const activeKppnCountOf = (id: string) =>
    (kppnByDeficiency.get(id) ?? []).filter(
      (k) => k.status !== "Huỷ" && k.status !== "Hoàn thành",
    ).length;

  const doneKppnCountOf = (id: string) =>
    (kppnByDeficiency.get(id) ?? []).filter((k) => k.status === "Hoàn thành")
      .length;

  const overdueKppnCountOf = (id: string) =>
    (kppnByDeficiency.get(id) ?? []).filter((k) => isKppnOverdue(k)).length;

  const controlOptions = useMemo(
    () =>
      controls.map((c) => ({
        value: c.id,
        label: c.name,
        description: c.code,
      })),
    [controls],
  );

  /* ---------------------------- Bộ lọc ---------------------------- */

  const [tab, setTab] = useState<TabKey>("open");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [controlId, setControlId] = useState<string | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyMissingRoot, setOnlyMissingRoot] = useState(false);
  const [onlyMissingKppn, setOnlyMissingKppn] = useState(false);
  const [onlyNoDueDate, setOnlyNoDueDate] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  /* ---------------------------- Hộp thoại ------------------------- */

  const [deleting, setDeleting] = useState<Deficiency | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [transiting, setTransiting] = useState<Deficiency | null>(null);

  /* ------------------------- Lọc theo tab ------------------------- */

  function matchTab(d: Deficiency): boolean {
    switch (tab) {
      case "mine":
        return !!currentEmployee && d.ownerId === currentEmployee.id;
      case "overdue":
        return isDeficiencyOverdue(d);
      case "attention":
        return (
          isMissingRootCause(d) ||
          isMissingKppn(d, kppnCountOf(d.id)) ||
          (!d.dueDate && d.status !== "Đã đóng")
        );
      case "closed":
        return d.status === "Đã đóng" || d.status === "Đã khắc phục";
      default:
        return d.status !== "Đã đóng";
    }
  }

  const tabCounts = useMemo(
    () => ({
      open: deficiencies.filter((d) => d.status !== "Đã đóng").length,
      mine: currentEmployee
        ? deficiencies.filter((d) => d.ownerId === currentEmployee.id).length
        : 0,
      overdue: deficiencies.filter((d) => isDeficiencyOverdue(d)).length,
      attention: deficiencies.filter(
        (d) =>
          isMissingRootCause(d) ||
          isMissingKppn(d, kppnCountOf(d.id)) ||
          (!d.dueDate && d.status !== "Đã đóng"),
      ).length,
      closed: deficiencies.filter(
        (d) => d.status === "Đã đóng" || d.status === "Đã khắc phục",
      ).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deficiencies, currentEmployee, kppnByDeficiency],
  );

  /* --------------------------- Table state ------------------------ */

  const t = useTableState<Deficiency>(deficiencies, {
    getKey: (d) => d.id,
    searchText: (d) =>
      deficiencySearchText(d, [
        lk.unitName(d.unitId, ""),
        lk.employeeName(d.ownerId, ""),
        controlMap.get(d.controlId)?.code ?? "",
        riskMap.get(d.riskId)?.code ?? "",
        eventMap.get(d.eventId)?.code ?? "",
      ]),
    filter: (d) => {
      if (!matchTab(d)) return false;
      if (statuses.length > 0 && !statuses.includes(d.status)) return false;
      if (severities.length > 0 && !severities.includes(d.severity))
        return false;
      if (sources.length > 0 && !sources.includes(d.sourceType)) return false;
      if (unitId && d.unitId !== unitId) return false;
      if (ownerId && d.ownerId !== ownerId) return false;
      if (controlId && d.controlId !== controlId) return false;
      if (onlyOverdue && !isDeficiencyOverdue(d)) return false;
      if (onlyMissingRoot && !isMissingRootCause(d)) return false;
      if (onlyMissingKppn && !isMissingKppn(d, kppnCountOf(d.id))) return false;
      if (onlyNoDueDate && d.dueDate) return false;
      return true;
    },
    sortValue: (d, key) => {
      switch (key) {
        case "code":
          return d.code;
        case "name":
          return d.name;
        case "source":
          return d.sourceType;
        case "severity":
          return SEVERITY_ORDER[d.severity];
        case "unit":
          return lk.unitName(d.unitId, "");
        case "owner":
          return lk.employeeName(d.ownerId, "");
        case "detected":
          return d.detectedDate;
        case "due": {
          const remain = deficiencyDaysToDue(d);
          return remain === null ? 99999 : remain;
        }
        case "kppn":
          return kppnCountOf(d.id);
        case "aging":
          return deficiencyAging(d);
        case "status":
          return DEFICIENCY_STATUS_ORDER[d.status];
        default:
          return null;
      }
    },
    defaultSort: { key: "due", dir: "asc" },
    pageSize: 20,
    filterDeps: [
      tab,
      statuses,
      severities,
      sources,
      unitId,
      ownerId,
      controlId,
      onlyOverdue,
      onlyMissingRoot,
      onlyMissingKppn,
      onlyNoDueDate,
      kppnByDeficiency,
    ],
  });

  const summary = useMemo(
    () => summarizeDeficiencies(t.rows, kppnCountOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.rows, kppnByDeficiency],
  );

  const filterCount =
    statuses.length +
    severities.length +
    sources.length +
    (unitId ? 1 : 0) +
    (ownerId ? 1 : 0) +
    (controlId ? 1 : 0) +
    (onlyOverdue ? 1 : 0) +
    (onlyMissingRoot ? 1 : 0) +
    (onlyMissingKppn ? 1 : 0) +
    (onlyNoDueDate ? 1 : 0);

  function resetFilter() {
    setStatuses([]);
    setSeverities([]);
    setSources([]);
    setUnitId(null);
    setOwnerId(null);
    setControlId(null);
    setOnlyOverdue(false);
    setOnlyMissingRoot(false);
    setOnlyMissingKppn(false);
    setOnlyNoDueDate(false);
  }

  function toggleSeverity(v: string) {
    setSeverities((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  /* --------------------------- Hành động -------------------------- */

  function goDetail(d: Deficiency) {
    router.push(`/khac-phuc/diem-yeu/${d.code}`);
  }

  function goEdit(d: Deficiency) {
    if (!isDeficiencyEditable(d.status)) {
      toast.warning(
        "Không sửa được",
        `Điểm yếu đang ở trạng thái ${d.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/khac-phuc/diem-yeu/${d.code}/sua`);
  }

  function confirmDelete(d: Deficiency) {
    const n = kppnCountOf(d.id);
    if (!isDeficiencyDeletable(d, n)) {
      toast.error(
        "Không xoá được",
        n > 0
          ? `${d.code} đang có ${n} hành động KPPN gắn kèm. Hãy xoá các hành động đó trước.`
          : `Chỉ xoá được điểm yếu ở trạng thái Mới ghi nhận. ${d.code} đang ở trạng thái ${d.status}.`,
      );
      return;
    }
    setDeleting(d);
  }

  function quickNext(d: Deficiency) {
    const list = deficiencyNextTransitions(d.status);
    if (list.length === 0) {
      toast.warning(
        "Không chuyển được",
        `${d.status} là trạng thái cuối của luồng.`,
      );
      return;
    }
    setTransiting(d);
  }

  function bulkNext() {
    let moved = 0;
    let blocked = 0;
    t.selectedKeys.forEach((id) => {
      const d = deficiencyRepo.getById(id);
      if (!d) return;
      const auto = deficiencyNextTransitions(d.status).find(
        (tr) => !tr.requireReason,
      );
      if (!auto) {
        blocked += 1;
        return;
      }
      // Không cho nhảy sang Đã lập KPPN khi chưa đủ điều kiện
      if (
        auto.to === "Đã lập KPPN" &&
        (kppnCountOf(d.id) === 0 || !d.rootCause.trim())
      ) {
        blocked += 1;
        return;
      }
      deficiencyRepo.update(id, { status: auto.to });
      moved += 1;
    });
    t.clearSelection();
    if (moved === 0) {
      toast.warning(
        "Không có bản ghi nào được chuyển",
        "Các điểm yếu đã chọn ở trạng thái cuối, cần nhập lý do hoặc chưa đủ điều kiện chuyển.",
      );
      return;
    }
    toast.success(
      `Đã chuyển trạng thái ${moved} điểm yếu`,
      blocked > 0 ? `${blocked} bản ghi bị bỏ qua.` : undefined,
    );
  }

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<Deficiency>[] = [
    {
      key: "code",
      header: "Mã điểm yếu",
      width: 140,
      sortable: true,
      render: (d) => <CodeCell code={d.code} onClick={() => goDetail(d)} />,
    },
    {
      key: "name",
      header: "Tên điểm yếu",
      minWidth: 320,
      sortable: true,
      render: (d) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{d.name}</span>
              {isMissingRootCause(d) && (
                <Tooltip content="Mức Cao trở lên hoặc đã lập KPPN nhưng chưa phân tích nguyên nhân gốc">
                  <Badge tone="danger" size="sm">
                    Thiếu NNG
                  </Badge>
                </Tooltip>
              )}
              {isMissingKppn(d, kppnCountOf(d.id)) && (
                <Tooltip content="Điểm yếu mức Cao trở lên nhưng chưa có hành động khắc phục">
                  <Badge tone="warning" size="sm">
                    Thiếu KPPN
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={
            <span className="inline-flex items-center gap-1">
              {SOURCE_ICON[d.sourceType]}
              {d.sourceType}
              {d.sourceRef ? ` - ${d.sourceRef}` : ""}
            </span>
          }
        />
      ),
    },
    {
      key: "severity",
      header: "Mức nghiêm trọng",
      width: 150,
      sortable: true,
      render: (d) => <RiskBadge level={d.severity} />,
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 170,
      sortable: true,
      render: (d) => lk.unitName(d.unitId),
    },
    {
      key: "owner",
      header: "Người chịu trách nhiệm",
      width: 210,
      sortable: true,
      render: (d) => (
        <UserCell name={lk.employeeName(d.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "detected",
      header: "Ngày phát hiện",
      width: 130,
      sortable: true,
      render: (d) => formatDate(d.detectedDate),
    },
    {
      key: "aging",
      header: "Số ngày tồn tại",
      width: 130,
      align: "center",
      sortable: true,
      render: (d) => {
        const age = deficiencyAging(d);
        return (
          <span
            className={cn(
              "text-[13px]",
              age > 180 && d.status !== "Đã đóng"
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
      key: "due",
      header: "Hạn khắc phục",
      width: 145,
      sortable: true,
      render: (d) => {
        if (!d.dueDate)
          return (
            <Tooltip content="Chưa đặt hạn khắc phục nên không theo dõi được tiến độ">
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-lv-medium-text">
                <IconAlertTriangle size={14} />
                Chưa đặt
              </span>
            </Tooltip>
          );
        const remain = deficiencyDaysToDue(d);
        const overdue = isDeficiencyOverdue(d);
        const soon = isDeficiencyDueSoon(d);
        return (
          <Tooltip
            content={
              overdue
                ? `Đã quá hạn ${Math.abs(remain ?? 0)} ngày`
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
              {formatDate(d.dueDate)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "kppn",
      header: "Hành động KPPN",
      width: 165,
      sortable: true,
      render: (d) => {
        const total = kppnCountOf(d.id);
        if (total === 0)
          return (
            <span
              className={cn(
                "text-[12px]",
                isMissingKppn(d, 0)
                  ? "font-medium text-danger"
                  : "text-text-hint",
              )}
            >
              Chưa có
            </span>
          );
        const done = doneKppnCountOf(d.id);
        const late = overdueKppnCountOf(d.id);
        const pct = Math.round((done / total) * 100);
        return (
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    pct === 100 ? "bg-success" : "bg-brand",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="shrink-0 text-[12px] text-text-secondary">
                {done}/{total}
              </span>
            </span>
            {late > 0 && (
              <span className="text-[11px] font-medium text-danger">
                {late} hành động quá hạn
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 145,
      sortable: true,
      render: (d) => <StatusBadge status={d.status} />,
    },
    {
      key: "actions",
      header: "",
      width: 122,
      align: "right",
      render: (d) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => goDetail(d)}>
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <>
              <Tooltip content="Sửa">
                <IconButton label="Sửa" onClick={() => goEdit(d)}>
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Chuyển trạng thái">
                <IconButton
                  label="Chuyển trạng thái"
                  onClick={() => quickNext(d)}
                >
                  <IconArrowRight size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Xoá">
                <IconButton label="Xoá" onClick={() => confirmDelete(d)}>
                  <IconTrash size={16} className="text-danger" />
                </IconButton>
              </Tooltip>
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
        title="Sổ theo dõi điểm yếu kiểm soát"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị tệp Excel cho ${t.total} điểm yếu (giả lập).`,
                )
              }
            >
              Xuất khẩu
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                icon={<IconPlus size={16} />}
                onClick={() => router.push("/khac-phuc/diem-yeu/them-moi")}
              >
                Thêm điểm yếu
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
                    key: "overdue",
                    label: "Quá hạn khắc phục",
                    count: tabCounts.overdue,
                  },
                  {
                    key: "attention",
                    label: "Hồ sơ chưa đủ",
                    count: tabCounts.attention,
                  },
                  {
                    key: "closed",
                    label: "Đã khắc phục & đóng",
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
                icon={<IconTool size={15} />}
                label="Đang hiển thị"
                value={summary.total}
                tone="brand"
                title={`Bình quân tồn tại ${summary.avgAging} ngày`}
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">
                Mức nghiêm trọng:
              </span>

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
                icon={<IconClockExclamation size={15} />}
                label="Quá hạn"
                value={summary.overdue}
                tone="danger"
                active={onlyOverdue}
                onClick={() => setOnlyOverdue((v) => !v)}
                title="Đã qua hạn khắc phục mà chưa hoàn tất"
              />
              <StatChip
                icon={<IconStethoscope size={15} />}
                label="Thiếu nguyên nhân gốc"
                value={summary.missingRootCause}
                tone="high"
                active={onlyMissingRoot}
                onClick={() => setOnlyMissingRoot((v) => !v)}
                title="Mức Cao trở lên hoặc đã lập KPPN nhưng chưa phân tích nguyên nhân"
              />
              <StatChip
                icon={<IconTool size={15} />}
                label="Thiếu KPPN"
                value={summary.missingKppn}
                tone="warning"
                active={onlyMissingKppn}
                onClick={() => setOnlyMissingKppn((v) => !v)}
                title="Điểm yếu mức Cao trở lên chưa có hành động khắc phục"
              />
              <StatChip
                icon={<IconHourglass size={15} />}
                label="Chưa đặt hạn"
                value={summary.noDueDate}
                tone="warning"
                active={onlyNoDueDate}
                onClick={() => setOnlyNoDueDate((v) => !v)}
                title="Không có hạn khắc phục nên không theo dõi được tiến độ"
              />

              <span className="ml-auto text-[12px] text-text-secondary">
                Sắp tới hạn 15 ngày:{" "}
                <b className="text-text-primary">{summary.dueSoon}</b>
              </span>
            </div>

            {/* ----------------------- Toolbar ------------------------ */}
            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, tên, nguồn phát hiện"
                    width={300}
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
                    label="Nguồn:"
                    multiple
                    options={SOURCE_OPTIONS}
                    value={sources}
                    onChange={setSources}
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
              getKey={(d) => d.id}
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
              emptyTitle="Không có điểm yếu phù hợp"
              emptyDescription="Thử bỏ bớt điều kiện lọc, đổi tab hoặc xoá từ khoá tìm kiếm."
              emptyAction={
                canEdit ? (
                  <Button
                    variant="primary"
                    icon={<IconPlus size={16} />}
                    onClick={() => router.push("/khac-phuc/diem-yeu/them-moi")}
                  >
                    Thêm điểm yếu
                  </Button>
                ) : undefined
              }
              rowClassName={(d) =>
                isDeficiencyOverdue(d) || isMissingRootCause(d)
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
          </div>

          {/* -------------------- Bộ lọc nâng cao -------------------- */}
          <FilterPanel
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onReset={resetFilter}
          >
            <FilterGroup label="Mức nghiêm trọng">
              <FilterCombobox
                label="Mức:"
                multiple
                options={SEVERITY_OPTIONS}
                value={severities}
                onChange={setSeverities}
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Đơn vị">
              <FilterCombobox
                label="Đơn vị:"
                options={lk.unitOptions}
                value={unitId}
                onChange={setUnitId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Người chịu trách nhiệm">
              <FilterCombobox
                label="Người:"
                options={lk.employeeOptions}
                value={ownerId}
                onChange={setOwnerId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Kiểm soát liên quan">
              <FilterCombobox
                label="Kiểm soát:"
                options={controlOptions}
                value={controlId}
                onChange={setControlId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Chất lượng hồ sơ">
              <Checkbox
                label="Chỉ điểm yếu quá hạn khắc phục"
                checked={onlyOverdue}
                onChange={(e) => setOnlyOverdue(e.target.checked)}
              />
              <Checkbox
                label="Chỉ điểm yếu thiếu nguyên nhân gốc"
                checked={onlyMissingRoot}
                onChange={(e) => setOnlyMissingRoot(e.target.checked)}
              />
              <Checkbox
                label="Chỉ điểm yếu thiếu hành động KPPN"
                checked={onlyMissingKppn}
                onChange={(e) => setOnlyMissingKppn(e.target.checked)}
              />
              <Checkbox
                label="Chỉ điểm yếu chưa đặt hạn khắc phục"
                checked={onlyNoDueDate}
                onChange={(e) => setOnlyNoDueDate(e.target.checked)}
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
      <DeficiencyTransitionModal
        deficiency={transiting}
        kppnList={transiting ? (kppnByDeficiency.get(transiting.id) ?? []) : []}
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
            deficiencyRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá điểm yếu kiểm soát"
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
            const d = deficiencyRepo.getById(id);
            return d ? isDeficiencyDeletable(d, kppnCountOf(d.id)) : false;
          });
          const skipped = t.selectedKeys.length - ids.length;
          deficiencyRepo.removeMany(ids);
          t.clearSelection();
          setBulkDelete(false);
          if (ids.length === 0) {
            toast.error(
              "Không xoá được bản ghi nào",
              "Chỉ xoá được điểm yếu ở trạng thái Mới ghi nhận và chưa gắn hành động KPPN.",
            );
            return;
          }
          toast.success(
            `Đã xoá ${ids.length} điểm yếu`,
            skipped > 0
              ? `${skipped} bản ghi bị bỏ qua vì đã đi vào xử lý.`
              : undefined,
          );
        }}
        tone="danger"
        title="Xoá nhiều điểm yếu"
        message={
          <>
            Bạn đã chọn <b>{t.selectedKeys.length}</b> bản ghi. Hệ thống chỉ xoá
            những điểm yếu ở trạng thái <b>Mới ghi nhận</b> và chưa gắn hành
            động KPPN, các bản ghi khác được giữ nguyên.
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
/* Hộp thoại chuyển trạng thái điểm yếu                                */
/* ================================================================== */

function DeficiencyTransitionModal({
  deficiency,
  kppnList,
  onClose,
  onDone,
  onError,
}: {
  deficiency: Deficiency | null;
  kppnList: Kppn[];
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onError: (message: string, detail?: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [lastKey, setLastKey] = useState("");

  const list = deficiency ? deficiencyNextTransitions(deficiency.status) : [];

  const key = deficiency?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    setTarget(list[0]?.to ?? "");
    setReason("");
    setError("");
  }

  const selected = list.find((tr) => tr.to === target) ?? list[0];

  const totalKppn = kppnList.length;
  const doneKppn = kppnList.filter((k) => k.status === "Hoàn thành").length;
  const openKppn = kppnList.filter(
    (k) => k.status !== "Hoàn thành" && k.status !== "Huỷ",
  ).length;

  /* --------------------- Điều kiện chặn chuyển ------------------- */

  const blockReasons = useMemo(() => {
    if (!deficiency || !selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Đã lập KPPN") {
      if (!deficiency.rootCause.trim())
        out.push(
          "Bắt buộc phân tích nguyên nhân gốc trước khi chuyển sang Đã lập KPPN.",
        );
      if (totalKppn === 0)
        out.push(
          "Phải có ít nhất 1 hành động khắc phục và phòng ngừa gắn với điểm yếu này.",
        );
    }

    if (selected.to === "Đã khắc phục" && totalKppn > 0 && doneKppn === 0)
      out.push(
        "Chưa có hành động KPPN nào hoàn thành, chưa đủ căn cứ xác nhận đã khắc phục.",
      );

    return out;
  }, [deficiency, selected, totalKppn, doneKppn]);

  /* ----------------------- Cảnh báo mềm ------------------------- */

  const softWarnings = useMemo(() => {
    if (!deficiency || !selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Đã khắc phục" && openKppn > 0)
      out.push(
        `Còn ${openKppn} hành động KPPN chưa kết thúc. Nên hoàn tất trước khi xác nhận khắc phục.`,
      );

    if (selected.to === "Đã đóng" && deficiency.status === "Đã khắc phục")
      out.push(
        "Đóng điểm yếu nghĩa là xác nhận biện pháp đã vận hành hiệu quả và không cần theo dõi thêm.",
      );

    if (
      selected.to === "Đã đóng" &&
      (deficiency.severity === "Cao" || deficiency.severity === "Trọng yếu")
    )
      out.push(
        `Điểm yếu mức ${deficiency.severity} nên được kiểm tra lại hiệu lực kiểm soát trước khi đóng.`,
      );

    return out;
  }, [deficiency, selected, openKppn]);

  function submit() {
    if (!deficiency || !selected) return;

    if (blockReasons.length > 0) {
      onError("Chưa đủ điều kiện chuyển trạng thái", blockReasons.join(" "));
      return;
    }

    if (selected.requireReason && !reason.trim()) {
      setError("Bắt buộc nhập lý do khi chuyển sang trạng thái này");
      return;
    }

    deficiencyRepo.update(deficiency.id, {
      status: selected.to,
      statusNote: reason.trim() || deficiency.statusNote,
      /* Đồng bộ lại danh sách hành động theo quan hệ thật */
      kppnIds: kppnList.map((k) => k.id),
    });

    onDone(
      `${deficiency.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${deficiency.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={!!deficiency}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái điểm yếu"
      description={
        deficiency ? `${deficiency.code} - ${deficiency.name}` : undefined
      }
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
      {deficiency && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
            <span className="text-[12px] text-text-secondary">Hiện tại</span>
            <StatusBadge status={deficiency.status} />
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
              <RiskBadge level={deficiency.severity} />
            </span>
          </div>

          {list.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              Điểm yếu đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                    name="deficiency-transition"
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
                  Hành động KPPN:{" "}
                  <b className="text-text-primary">
                    {doneKppn}/{totalKppn} hoàn thành
                  </b>
                </span>
                <span>
                  Nguyên nhân gốc:{" "}
                  <b
                    className={cn(
                      deficiency.rootCause.trim()
                        ? "text-text-primary"
                        : "text-danger",
                    )}
                  >
                    {deficiency.rootCause.trim() ? "Đã phân tích" : "Chưa có"}
                  </b>
                </span>
                <span>
                  Hạn khắc phục:{" "}
                  <b className="text-text-primary">
                    {formatDate(deficiency.dueDate) || "chưa đặt"}
                  </b>
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
