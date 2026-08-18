"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarExclamation,
  IconCopy,
  IconDownload,
  IconEdit,
  IconEye,
  IconPlus,
  IconRobot,
  IconShieldCheck,
  IconStar,
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
  EffectivenessBadge,
  LifecycleQuickFilter,
  MissingInfoCell,
} from "@/components/ui";
import { PageContainer, PageHeader } from "@/components/layout";
import { controlRepo, riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  CONTROL_FREQUENCIES,
  CONTROL_NATURES,
  CONTROL_STATUSES,
  CONTROL_TEST_RESULTS,
  CONTROL_TYPES,
} from "@/lib/domain/enums";
import {
  CONTROL_STATUS_ORDER,
  TEST_RESULT_ORDER,
  controlHealth,
  controlNextTransitions,
  controlSearchText,
  daysToNextTest,
  isControlDeletable,
  isControlEditable,
  isControlExpired,
  isExpiringSoon,
  isNeverTested,
  isTestDueSoon,
  isTestFailed,
  isTestOverdue,
  nextTestDate,
  summarizeControls,
} from "@/lib/domain/control-utils";
import type { Control } from "@/lib/domain/schema";
import {
  designEffectivenessOf,
  operationEffectivenessOf,
  overallEffectivenessOf,
} from "@/lib/domain/control-utils";
import {
  CONTROL_QUICK_FILTERS,
  controlMissingInfo,
  matchControlQuickFilter,
} from "@/lib/domain/control-lifecycle";

import { formatDate } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số bộ lọc                                        */
/* ================================================================== */

const STATUS_OPTIONS = CONTROL_STATUSES.map((s) => ({ value: s, label: s }));
const TYPE_OPTIONS = CONTROL_TYPES.map((s) => ({ value: s, label: s }));
const NATURE_OPTIONS = CONTROL_NATURES.map((s) => ({ value: s, label: s }));
const FREQUENCY_OPTIONS = CONTROL_FREQUENCIES.map((s) => ({
  value: s,
  label: s,
}));
const RESULT_OPTIONS = [
  ...CONTROL_TEST_RESULTS.map((s) => ({ value: s, label: s })),
  { value: "__none__", label: "Chưa đánh giá" },
];

type TabKey = "all" | "mine" | "key" | "attention" | "inactive";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function SoDangKyKiemSoatScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();

  const controls = useCollection(controlRepo);
  const risks = useCollection(riskRepo);
  const lk = useLookups();

  const canEdit = hasRole("admin", "qtrr", "owner");

  /* ------------------ Nhận diện nhân sự đăng nhập ----------------- */
  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );

  /* --------------------- Tra cứu rủi ro theo id ------------------- */
  const riskMap = useMemo(() => new Map(risks.map((r) => [r.id, r])), [risks]);

  const riskOptions = useMemo(
    () =>
      risks.map((r) => ({
        value: r.id,
        label: r.name,
        description: r.code,
      })),
    [risks],
  );

  /* ---------------------------- Bộ lọc ---------------------------- */
  const [tab, setTab] = useState<TabKey>("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [natures, setNatures] = useState<string[]>([]);
  const [frequencies, setFrequencies] = useState<string[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [processId, setProcessId] = useState<string | null>(null);
  const [systemId, setSystemId] = useState<string | null>(null);
  const [riskId, setRiskId] = useState<string | null>(null);
  const [onlyKeyControl, setOnlyKeyControl] = useState(false);
  const [onlyTestOverdue, setOnlyTestOverdue] = useState(false);
  const [onlyTestFailed, setOnlyTestFailed] = useState(false);
  const [onlyExpiringSoon, setOnlyExpiringSoon] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  /** Lọc nhanh theo vòng đời và hiệu lực, độc lập với tab hiện có */
  const [lifecycle, setLifecycle] = useState("all");

  /* ---------------------------- Hộp thoại ------------------------- */
  const [deleting, setDeleting] = useState<Control | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [transiting, setTransiting] = useState<Control | null>(null);

  /* ------------------------- Lọc theo tab ------------------------- */
  function matchTab(c: Control): boolean {
    switch (tab) {
      case "mine":
        return !!currentEmployee && c.ownerId === currentEmployee.id;
      case "key":
        return c.isKeyControl;
      case "attention":
        return (
          isTestOverdue(c) ||
          isNeverTested(c) ||
          isTestFailed(c) ||
          isControlExpired(c)
        );
      case "inactive":
        return c.status === "Hết hiệu lực" || c.status === "Tạm ngưng";
      default:
        return c.status !== "Hết hiệu lực";
    }
  }

  const tabCounts = useMemo(
    () => ({
      all: controls.filter((c) => c.status !== "Hết hiệu lực").length,
      mine: currentEmployee
        ? controls.filter((c) => c.ownerId === currentEmployee.id).length
        : 0,
      key: controls.filter((c) => c.isKeyControl).length,
      attention: controls.filter(
        (c) =>
          isTestOverdue(c) ||
          isNeverTested(c) ||
          isTestFailed(c) ||
          isControlExpired(c),
      ).length,
      inactive: controls.filter(
        (c) => c.status === "Hết hiệu lực" || c.status === "Tạm ngưng",
      ).length,
    }),
    [controls, currentEmployee],
  );

  /* --------------------------- Table state ------------------------ */
  const t = useTableState<Control>(controls, {
    getKey: (c) => c.id,
    searchText: (c) =>
      controlSearchText(c, [
        lk.unitName(c.unitId, ""),
        lk.employeeName(c.ownerId, ""),
        lk.processName(c.processId, ""),
        lk.systemName(c.systemId, ""),
        ...c.riskIds.map((id) => riskMap.get(id)?.code ?? ""),
      ]),
    filter: (c) => {
      if (!matchTab(c)) return false;
      if (statuses.length > 0 && !statuses.includes(c.status)) return false;
      if (types.length > 0 && !types.includes(c.type)) return false;
      if (natures.length > 0 && !natures.includes(c.nature)) return false;
      if (frequencies.length > 0 && !frequencies.includes(c.frequency))
        return false;
      if (results.length > 0) {
        const key = c.lastTestResult ?? "__none__";
        if (!results.includes(key)) return false;
      }
      if (unitId && c.unitId !== unitId) return false;
      if (ownerId && c.ownerId !== ownerId) return false;
      if (processId && c.processId !== processId) return false;
      if (systemId && c.systemId !== systemId) return false;
      if (riskId && !c.riskIds.includes(riskId)) return false;
      if (onlyKeyControl && !c.isKeyControl) return false;
      if (onlyTestOverdue && !isTestOverdue(c)) return false;
      if (onlyTestFailed && !isTestFailed(c)) return false;
      if (onlyExpiringSoon && !isExpiringSoon(c)) return false;
      return true;
    },
    sortValue: (c, key) => {
      switch (key) {
        case "code":
          return c.code;
        case "name":
          return c.name;
        case "risks":
          return c.riskIds.length;
        case "type":
          return c.type;
        case "nature":
          return c.nature;
        case "unit":
          return lk.unitName(c.unitId, "");
        case "owner":
          return lk.employeeName(c.ownerId, "");
        case "result":
          return TEST_RESULT_ORDER[c.lastTestResult ?? ""] ?? 0;
        case "nextTest": {
          const d = daysToNextTest(c);
          return d === null ? 9999 : d;
        }
        case "health":
          return controlHealth(c);
        case "effective":
          return c.effectiveDate;
        case "status":
          return CONTROL_STATUS_ORDER[c.status];
        case "design":
          return designEffectivenessOf(c);
        case "operation":
          return operationEffectivenessOf(c);
        case "overall":
          return overallEffectivenessOf(c);

        default:
          return null;
      }
    },
    defaultSort: { key: "health", dir: "asc" },
    pageSize: 20,
    filterDeps: [
      tab,
      statuses,
      types,
      natures,
      frequencies,
      results,
      unitId,
      ownerId,
      processId,
      systemId,
      riskId,
      onlyKeyControl,
      onlyTestOverdue,
      onlyTestFailed,
      onlyExpiringSoon,
      lifecycle,
    ],
  });

  /**
   * Số đếm cho từng chip quick filter.
   * Đếm trên tập đã áp bộ lọc đơn vị nhưng chưa áp từ khoá tìm kiếm,
   * để số trên chip không nhảy liên tục khi người dùng đang gõ.
   */
  const lifecycleCounts = useMemo(() => {
    const base = controls.filter((c) => {
      if (unitId && c.unitId !== unitId) return false;
      return true;
    });

    const out: Record<string, number> = {};
    CONTROL_QUICK_FILTERS.forEach((f) => {
      out[f.key] = base.filter((c) => matchControlQuickFilter(f.key, c)).length;
    });
    return out;
  }, [controls, unitId]);

  const quickFilterItems = CONTROL_QUICK_FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    hint: f.hint,
    count: lifecycleCounts[f.key] ?? 0,
  }));

  const summary = useMemo(() => summarizeControls(t.rows), [t.rows]);

  const filterCount =
    statuses.length +
    types.length +
    natures.length +
    frequencies.length +
    results.length +
    (unitId ? 1 : 0) +
    (ownerId ? 1 : 0) +
    (processId ? 1 : 0) +
    (systemId ? 1 : 0) +
    (riskId ? 1 : 0) +
    (onlyKeyControl ? 1 : 0) +
    (onlyTestOverdue ? 1 : 0) +
    (onlyTestFailed ? 1 : 0) +
    (onlyExpiringSoon ? 1 : 0);

  function resetFilter() {
    setStatuses([]);
    setTypes([]);
    setNatures([]);
    setFrequencies([]);
    setResults([]);
    setUnitId(null);
    setOwnerId(null);
    setProcessId(null);
    setSystemId(null);
    setRiskId(null);
    setOnlyKeyControl(false);
    setOnlyTestOverdue(false);
    setOnlyTestFailed(false);
    setOnlyExpiringSoon(false);
  }

  /* --------------------------- Hành động -------------------------- */

  function goDetail(c: Control) {
    router.push(`/kiem-soat/so-dang-ky/${c.code}`);
  }

  function goEdit(c: Control) {
    if (!isControlEditable(c.status)) {
      toast.warning(
        "Không sửa được",
        `Kiểm soát đang ở trạng thái ${c.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/kiem-soat/so-dang-ky/${c.code}/sua`);
  }

  function duplicate(c: Control) {
    const created = controlRepo.create(
      {
        name: `${c.name} (bản sao)`,
        description: c.description,
        riskIds: [...c.riskIds],
        type: c.type,
        nature: c.nature,
        frequency: c.frequency,
        unitId: c.unitId,
        ownerId: c.ownerId,
        processId: c.processId,
        systemId: c.systemId,
        isKeyControl: c.isKeyControl,
        effectiveDate: c.effectiveDate,
        expireDate: "",
        status: "Nháp",
        statusNote: "",
        lastTestResult: null,
        lastTestDate: "",
        evidenceRequirement: c.evidenceRequirement,
      },
      user.name,
    );
    toast.success("Đã nhân bản", `Bản sao ${created.code} ở trạng thái Nháp.`);
  }

  function confirmDelete(c: Control) {
    if (!isControlDeletable(c.status)) {
      toast.error(
        "Không xoá được",
        `Chỉ xoá được kiểm soát ở trạng thái Nháp. ${c.code} đang ở trạng thái ${c.status}.`,
      );
      return;
    }
    setDeleting(c);
  }

  function quickNext(c: Control) {
    const list = controlNextTransitions(c.status);
    if (list.length === 0) {
      toast.warning(
        "Không chuyển được",
        `${c.status} là trạng thái cuối của luồng.`,
      );
      return;
    }
    if (list.length > 1 || list[0].requireReason) {
      setTransiting(c);
      return;
    }
    controlRepo.update(c.id, { status: list[0].to });
    toast.success(
      `${c.code}: ${list[0].label}`,
      `Trạng thái chuyển từ ${c.status} sang ${list[0].to}.`,
    );
  }

  function bulkNext() {
    let moved = 0;
    let skipped = 0;
    t.selectedKeys.forEach((id) => {
      const c = controlRepo.getById(id);
      if (!c) return;
      const auto = controlNextTransitions(c.status).find(
        (tr) => !tr.requireReason,
      );
      if (!auto) {
        skipped += 1;
        return;
      }
      controlRepo.update(id, { status: auto.to });
      moved += 1;
    });
    t.clearSelection();
    if (moved === 0) {
      toast.warning(
        "Không có bản ghi nào được chuyển",
        "Các kiểm soát đã chọn đang ở trạng thái cuối hoặc cần nhập lý do.",
      );
      return;
    }
    toast.success(
      `Đã chuyển trạng thái ${moved} kiểm soát`,
      skipped > 0
        ? `${skipped} bản ghi bị bỏ qua do ở trạng thái cuối hoặc cần nhập lý do.`
        : undefined,
    );
  }

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<Control>[] = [
    {
      key: "code",
      header: "Mã kiểm soát",
      width: 140,
      sortable: true,
      render: (c) => <CodeCell code={c.code} onClick={() => goDetail(c)} />,
    },
    {
      key: "name",
      header: "Tên kiểm soát",
      minWidth: 320,
      sortable: true,
      render: (c) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{c.name}</span>
              {c.isKeyControl && (
                <Tooltip content="Kiểm soát trọng yếu">
                  <Badge tone="brand" size="sm">
                    TY
                  </Badge>
                </Tooltip>
              )}
              {c.nature !== "Thủ công" && (
                <Tooltip content={`Kiểm soát ${c.nature.toLowerCase()}`}>
                  <Badge tone="info" size="sm">
                    <IconRobot size={11} />
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={`${c.type} - ${c.nature} - ${c.frequency}`}
        />
      ),
    },
    {
      key: "risks",
      header: "Rủi ro",
      width: 100,
      align: "center",
      sortable: true,
      render: (c) => (
        <Tooltip
          content={
            <span className="flex flex-col gap-0.5">
              {c.riskIds.map((id) => {
                const r = riskMap.get(id);
                return (
                  <span key={id}>
                    {r ? `${r.code} - ${r.name}` : "Rủi ro không còn tồn tại"}
                  </span>
                );
              })}
            </span>
          }
        >
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[13px]",
              c.riskIds.length === 0
                ? "font-medium text-danger"
                : "text-text-secondary",
            )}
          >
            {c.riskIds.length === 0 && <IconAlertTriangle size={14} />}
            {c.riskIds.length}
          </span>
        </Tooltip>
      ),
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 170,
      sortable: true,
      render: (c) => lk.unitName(c.unitId),
    },
    {
      key: "owner",
      header: "Người chịu trách nhiệm",
      width: 210,
      sortable: true,
      render: (c) => (
        <UserCell name={lk.employeeName(c.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "result",
      header: "Kết quả kiểm tra",
      width: 190,
      sortable: true,
      render: (c) =>
        c.lastTestResult ? (
          <span className="flex flex-col gap-0.5">
            <StatusBadge status={c.lastTestResult} />
            <span className="text-[11px] text-text-hint">
              {formatDate(c.lastTestDate)}
            </span>
          </span>
        ) : (
          <span
            className={cn(
              "text-[12px]",
              isNeverTested(c)
                ? "font-medium text-lv-medium-text"
                : "text-text-hint",
            )}
          >
            Chưa đánh giá
          </span>
        ),
    },
    {
      key: "nextTest",
      header: "Hạn kiểm tra kế tiếp",
      width: 160,
      sortable: true,
      render: (c) => {
        if (c.status !== "Đang hiệu lực")
          return <span className="text-text-hint">--</span>;
        const due = nextTestDate(c);
        const remain = daysToNextTest(c);
        if (!due || remain === null)
          return <span className="text-text-hint">--</span>;
        const overdue = remain < 0;
        const soon = !overdue && remain <= 30;
        return (
          <Tooltip
            content={
              overdue
                ? `Đã quá hạn ${Math.abs(remain)} ngày`
                : `Còn ${remain} ngày`
            }
          >
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "font-medium text-danger",
                soon && "font-medium text-lv-medium-text",
              )}
            >
              {(overdue || soon) && <IconCalendarExclamation size={14} />}
              {formatDate(due)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "health",
      header: "Sức khoẻ",
      width: 130,
      sortable: true,
      render: (c) => <HealthBar value={controlHealth(c)} />,
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 150,
      sortable: true,
      render: (c) => (
        <span className="flex flex-col gap-0.5">
          <StatusBadge status={c.status} />
          {isControlExpired(c) && (
            <span className="text-[11px] font-medium text-danger">
              Quá ngày hết hiệu lực
            </span>
          )}
          {isExpiringSoon(c) && (
            <span className="text-[11px] text-lv-medium-text">
              Hết hiệu lực {formatDate(c.expireDate)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "design",
      header: "Thiết kế",
      width: 130,
      sortable: true,
      render: (c) => (
        <EffectivenessBadge
          size="sm"
          short
          value={designEffectivenessOf(c)}
          dimension="Thiết kế"
        />
      ),
    },
    {
      key: "operation",
      header: "Vận hành",
      width: 130,
      sortable: true,
      render: (c) => (
        <EffectivenessBadge
          size="sm"
          short
          value={operationEffectivenessOf(c)}
          dimension="Vận hành"
        />
      ),
    },
    {
      key: "overall",
      header: "Hiệu quả chung",
      width: 160,
      sortable: true,
      render: (c) => <EffectivenessBadge value={overallEffectivenessOf(c)} />,
    },
    {
      key: "missing",
      header: "Hồ sơ",
      minWidth: 220,
      render: (c) => (
        <MissingInfoCell items={controlMissingInfo(c)} maxVisible={2} />
      ),
    },

    {
      key: "actions",
      header: "",
      width: 148,
      align: "right",
      render: (c) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => goDetail(c)}>
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <>
              <Tooltip content="Sửa">
                <IconButton label="Sửa" onClick={() => goEdit(c)}>
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Chuyển trạng thái">
                <IconButton
                  label="Chuyển trạng thái"
                  onClick={() => quickNext(c)}
                >
                  <IconArrowRight size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Nhân bản">
                <IconButton label="Nhân bản" onClick={() => duplicate(c)}>
                  <IconCopy size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Xoá">
                <IconButton label="Xoá" onClick={() => confirmDelete(c)}>
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
        title="Sổ đăng ký kiểm soát"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị tệp Excel cho ${t.total} bản ghi (giả lập).`,
                )
              }
            >
              Xuất khẩu
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                icon={<IconPlus size={16} />}
                onClick={() => router.push("/kiem-soat/so-dang-ky/them-moi")}
              >
                Thêm kiểm soát
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
                  { key: "all", label: "Đang áp dụng", count: tabCounts.all },
                  { key: "mine", label: "Của tôi", count: tabCounts.mine },
                  { key: "key", label: "Trọng yếu", count: tabCounts.key },
                  {
                    key: "attention",
                    label: "Cần chú ý",
                    count: tabCounts.attention,
                  },
                  {
                    key: "inactive",
                    label: "Tạm ngưng & hết hiệu lực",
                    count: tabCounts.inactive,
                  },
                ]}
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
              />
            </div>

            {/* --------------------- Thẻ thống kê --------------------- */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-light px-3 py-2.5">
              <StatChip
                icon={<IconShieldCheck size={15} />}
                label="Đang hiển thị"
                value={summary.total}
                tone="brand"
                title={`Đang phủ ${summary.coveredRisks} rủi ro khác nhau`}
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">
                Trạng thái:
              </span>

              <StatChip
                label="Đang hiệu lực"
                value={summary.active}
                tone="success"
                active={statuses.includes("Đang hiệu lực")}
                onClick={() => toggleStatus("Đang hiệu lực")}
              />
              <StatChip
                label="Nháp & chờ duyệt"
                value={summary.draft}
                tone="warning"
                active={
                  statuses.includes("Nháp") && statuses.includes("Chờ duyệt")
                }
                onClick={() => toggleDraft()}
              />
              <StatChip
                label="Tạm ngưng"
                value={summary.suspended}
                tone="high"
                active={statuses.includes("Tạm ngưng")}
                onClick={() => toggleStatus("Tạm ngưng")}
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">Cảnh báo:</span>

              <StatChip
                icon={<IconStar size={15} />}
                label="Kiểm soát trọng yếu"
                value={summary.keyControl}
                tone="brand"
                active={onlyKeyControl}
                onClick={() => setOnlyKeyControl((v) => !v)}
                title="Kiểm soát then chốt, bắt buộc khai báo yêu cầu bằng chứng"
              />
              <StatChip
                icon={<IconAlertTriangle size={15} />}
                label="Kết quả chưa đạt"
                value={summary.testFailed}
                tone="danger"
                active={onlyTestFailed}
                onClick={() => setOnlyTestFailed((v) => !v)}
                title="Lần kiểm tra gần nhất kết luận khác Hiệu quả"
              />
              <StatChip
                icon={<IconCalendarExclamation size={15} />}
                label="Quá hạn kiểm tra"
                value={summary.testOverdue}
                tone="high"
                active={onlyTestOverdue}
                onClick={() => setOnlyTestOverdue((v) => !v)}
                title="Đã qua chu kỳ kiểm tra hiệu lực theo tần suất vận hành"
              />
              <StatChip
                label="Sắp hết hiệu lực"
                value={summary.expiringSoon}
                tone="warning"
                active={onlyExpiringSoon}
                onClick={() => setOnlyExpiringSoon((v) => !v)}
                title="Hết hiệu lực trong vòng 60 ngày tới"
              />

              <span className="ml-auto text-[12px] text-text-secondary">
                Sức khoẻ bình quân:{" "}
                <b className="text-text-primary">{summary.avgHealth}%</b>
              </span>
            </div>
            <LifecycleQuickFilter
              items={quickFilterItems}
              value={lifecycle}
              onChange={setLifecycle}
              hideEmpty
            />

            {/* ----------------------- Toolbar ------------------------ */}
            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, tên, rủi ro, quy trình"
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
                    label="Loại:"
                    multiple
                    options={TYPE_OPTIONS}
                    value={types}
                    onChange={setTypes}
                    width={190}
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
              getKey={(c) => c.id}
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
              emptyTitle="Không có kiểm soát phù hợp"
              emptyDescription="Thử bỏ bớt điều kiện lọc, đổi tab hoặc xoá từ khoá tìm kiếm."
              emptyAction={
                canEdit ? (
                  <Button
                    variant="primary"
                    icon={<IconPlus size={16} />}
                    onClick={() =>
                      router.push("/kiem-soat/so-dang-ky/them-moi")
                    }
                  >
                    Thêm kiểm soát
                  </Button>
                ) : undefined
              }
              rowClassName={(c) =>
                c.lastTestResult === "Không hiệu quả" || isControlExpired(c)
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
            <FilterGroup label="Tính chất vận hành">
              <FilterCombobox
                label="Tính chất:"
                multiple
                options={NATURE_OPTIONS}
                value={natures}
                onChange={setNatures}
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Tần suất vận hành">
              <FilterCombobox
                label="Tần suất:"
                multiple
                options={FREQUENCY_OPTIONS}
                value={frequencies}
                onChange={setFrequencies}
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Kết quả kiểm tra gần nhất">
              <FilterCombobox
                label="Kết quả:"
                multiple
                options={RESULT_OPTIONS}
                value={results}
                onChange={setResults}
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

            <FilterGroup label="Rủi ro được kiểm soát">
              <FilterCombobox
                label="Rủi ro:"
                options={riskOptions}
                value={riskId}
                onChange={setRiskId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Quy trình">
              <FilterCombobox
                label="Quy trình:"
                options={lk.processOptions}
                value={processId}
                onChange={setProcessId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Hệ thống CNTT">
              <FilterCombobox
                label="Hệ thống:"
                options={lk.systemOptions}
                value={systemId}
                onChange={setSystemId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Thuộc tính">
              <Checkbox
                label="Chỉ kiểm soát trọng yếu"
                checked={onlyKeyControl}
                onChange={(e) => setOnlyKeyControl(e.target.checked)}
              />
              <Checkbox
                label="Chỉ kiểm soát quá hạn kiểm tra"
                checked={onlyTestOverdue}
                onChange={(e) => setOnlyTestOverdue(e.target.checked)}
              />
              <Checkbox
                label="Chỉ kiểm soát có kết quả chưa đạt"
                checked={onlyTestFailed}
                onChange={(e) => setOnlyTestFailed(e.target.checked)}
              />
              <Checkbox
                label="Chỉ kiểm soát sắp hết hiệu lực"
                checked={onlyExpiringSoon}
                onChange={(e) => setOnlyExpiringSoon(e.target.checked)}
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
      <ControlTransitionModal
        control={transiting}
        onClose={() => setTransiting(null)}
        onDone={(msg, detail) => {
          setTransiting(null);
          toast.success(msg, detail);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            controlRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá kiểm soát"
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
            const c = controlRepo.getById(id);
            return c ? isControlDeletable(c.status) : false;
          });
          const skipped = t.selectedKeys.length - ids.length;
          controlRepo.removeMany(ids);
          t.clearSelection();
          setBulkDelete(false);
          if (ids.length === 0) {
            toast.error(
              "Không xoá được bản ghi nào",
              "Chỉ xoá được kiểm soát ở trạng thái Nháp.",
            );
            return;
          }
          toast.success(
            `Đã xoá ${ids.length} kiểm soát`,
            skipped > 0
              ? `${skipped} bản ghi bị bỏ qua vì đã đi vào vận hành.`
              : undefined,
          );
        }}
        tone="danger"
        title="Xoá nhiều kiểm soát"
        message={
          <>
            Bạn đã chọn <b>{t.selectedKeys.length}</b> bản ghi. Hệ thống chỉ xoá
            những kiểm soát đang ở trạng thái <b>Nháp</b>, các bản ghi khác sẽ
            được giữ nguyên.
          </>
        }
        confirmText="Xoá các bản hợp lệ"
      />
    </PageContainer>
  );

  /* --------------------- Hàm phụ trong màn hình ------------------- */

  function toggleStatus(s: string) {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function toggleDraft() {
    const both = statuses.includes("Nháp") && statuses.includes("Chờ duyệt");
    setStatuses((prev) => {
      const rest = prev.filter((x) => x !== "Nháp" && x !== "Chờ duyệt");
      return both ? rest : [...rest, "Nháp", "Chờ duyệt"];
    });
  }
}

/* ================================================================== */
/* Thanh sức khoẻ kiểm soát                                        */
/* ================================================================== */

function HealthBar({ value }: { value: number }) {
  const color =
    value >= 75 ? "bg-success" : value >= 45 ? "bg-warning" : "bg-danger";
  return (
    <Tooltip content="Điểm tổng hợp từ kết quả kiểm tra, chu kỳ kiểm tra và hiệu lực">
      <span className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
          <span
            className={cn("block h-full rounded-full", color)}
            style={{ width: `${value}%` }}
          />
        </span>
        <span className="w-8 shrink-0 text-right text-[12px] text-text-secondary">
          {value}
        </span>
      </span>
    </Tooltip>
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
/* Hộp thoại chuyển trạng thái                                        */
/* ================================================================== */

function ControlTransitionModal({
  control,
  onClose,
  onDone,
}: {
  control: Control | null;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [target, setTarget] = useState<string>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [lastKey, setLastKey] = useState("");

  const list = control ? controlNextTransitions(control.status) : [];

  const currentKey = control?.id ?? "";
  if (currentKey !== lastKey) {
    setLastKey(currentKey);
    setTarget(list[0]?.to ?? "");
    setReason("");
    setError("");
  }

  const selected = list.find((tr) => tr.to === target) ?? list[0];

  function submit() {
    if (!control || !selected) return;
    if (selected.requireReason && !reason.trim()) {
      setError("Bắt buộc nhập lý do khi chuyển sang trạng thái này");
      return;
    }
    controlRepo.update(control.id, {
      status: selected.to,
      statusNote: reason.trim() || control.statusNote,
    });
    onDone(
      `${control.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${control.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={!!control}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái kiểm soát"
      description={control ? `${control.code} - ${control.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={selected?.tone === "danger" ? "danger" : "primary"}
            onClick={submit}
            disabled={!selected}
          >
            {selected?.label ?? "Chuyển"}
          </Button>
        </>
      }
    >
      {control && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
            <span className="text-[12px] text-text-secondary">Hiện tại</span>
            <StatusBadge status={control.status} />
            <IconArrowRight size={16} className="text-icon-neutral" />
            <span className="text-[12px] text-text-secondary">Chuyển sang</span>
            {selected ? (
              <StatusBadge status={selected.to} />
            ) : (
              <span className="text-[13px] text-text-hint">
                Không còn trạng thái kế tiếp
              </span>
            )}
          </div>

          {list.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              Kiểm soát đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                    name="control-transition"
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

              {selected?.to === "Đang hiệu lực" && control.isKeyControl && (
                <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                  <IconShieldCheck size={16} className="mt-px shrink-0" />
                  <span>
                    Đây là kiểm soát trọng yếu. Sau khi ban hành, chu kỳ kiểm
                    tra hiệu lực sẽ là <b>{control.frequency.toLowerCase()}</b>{" "}
                    theo tần suất vận hành đã khai báo.
                  </span>
                </div>
              )}

              {(selected?.to === "Tạm ngưng" ||
                selected?.to === "Hết hiệu lực") &&
                control.riskIds.length > 0 && (
                  <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                    <IconAlertTriangle size={16} className="mt-px shrink-0" />
                    <span>
                      Kiểm soát này đang phủ <b>{control.riskIds.length}</b> rủi
                      ro. Khi ngừng áp dụng, mức rủi ro còn lại của các rủi ro
                      đó cần được đánh giá lại.
                    </span>
                  </div>
                )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
