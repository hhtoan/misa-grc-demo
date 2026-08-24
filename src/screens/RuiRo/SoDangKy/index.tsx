"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconClockExclamation,
  IconCopy,
  IconDownload,
  IconEdit,
  IconEye,
  IconPlus,
  IconShieldExclamation,
  IconStar, // ← thêm dòng này
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
  SearchInput,
  StatusBadge,
  TableToolbar,
  Tabs,
  Textarea,
  TitleCell,
  Tooltip,
  UserCell,
  RowActions,
  useToast,
  type Column,
  LifecycleQuickFilter,
  MissingInfoCell,
} from "@/components/ui";
import { PageContainer, PageHeader } from "@/components/layout";
import { LEVEL_TONE } from "@/components/domain";
import {
  controlRepo,
  riskRepo,
  useCollection,
  riskControlLinkRepo,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  RISK_LEVEL_ORDER,
  inherentScoreOf,
  isReviewOverdue,
  isRiskEditable,
  residualLevelOf,
  residualScoreOf,
  riskNextTransitions,
  riskSearchText,
  summarizeRisks,
} from "@/lib/domain/risk-utils";
import {
  RISK_SOURCES,
  RISK_STATUSES,
  RISK_TREATMENTS,
} from "@/lib/domain/enums";
import type { Risk } from "@/lib/domain/schema";
import type { RiskStatus } from "@/lib/domain/enums";
import { formatDate, formatMoney } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";
import {
  RISK_QUICK_FILTERS,
  matchRiskQuickFilter,
  riskMissingInfo,
} from "@/lib/domain/risk-lifecycle";
import { isResidualStale } from "@/lib/domain/risk-utils";

/* ================================================================== */
/* Hằng số bộ lọc                                        */
/* ================================================================== */

const STATUS_OPTIONS = RISK_STATUSES.map((s) => ({ value: s, label: s }));
const LEVEL_OPTIONS = (["Thấp", "Trung bình", "Cao", "Trọng yếu"] as const).map(
  (s) => ({ value: s, label: s }),
);
const TREATMENT_OPTIONS = RISK_TREATMENTS.map((s) => ({ value: s, label: s }));
const SOURCE_OPTIONS = RISK_SOURCES.map((s) => ({ value: s, label: s }));

/** Chỉ được xoá rủi ro chưa đi vào theo dõi */
const DELETABLE_STATUSES = new Set<RiskStatus>(["Nháp", "Từ chối"]);

type TabKey = "all" | "mine" | "key" | "review" | "closed";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function SoDangKyRuiRoScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();

  const risks = useCollection(riskRepo);
  const controls = useCollection(controlRepo) as unknown as {
    riskIds?: string[];
    status?: string;
  }[];

  /**
   * Số kiểm soát ĐÃ PHÊ DUYỆT đang phủ từng rủi ro.
   * Kiểm soát Nháp hoặc Chờ duyệt không tính, vì chưa phê duyệt thì
   * chưa vận hành nên chưa bảo vệ được gì trên thực tế.
   */
  const controlCountOf = useMemo(() => {
    const map = new Map<string, number>();
    const notActive = new Set(["Nháp", "Chờ duyệt"]);

    controls.forEach((c) => {
      if (notActive.has(c.status ?? "")) return;
      (c.riskIds ?? []).forEach((rid) => {
        map.set(rid, (map.get(rid) ?? 0) + 1);
      });
    });

    return map;
  }, [controls]);

  const controlCount = (id: string) => controlCountOf.get(id) ?? 0;

  const links = useCollection(riskControlLinkRepo) as unknown as {
    riskId: string;
    relevance?: string;
  }[];

  const assessedMap = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l) => {
      if (l.relevance === undefined) return;
      m.set(l.riskId, (m.get(l.riskId) ?? 0) + 1);
    });
    return m;
  }, [links]);

  const assessedCountOf = (riskId: string) => assessedMap.get(riskId) ?? 0;

  const lk = useLookups();

  /* --------------------- Nhận diện nhân sự đăng nhập -------------- */
  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );

  /* ---------------------------- Bộ lọc ---------------------------- */
  const [tab, setTab] = useState<TabKey>("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [treatment, setTreatment] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [onlyKeyRisk, setOnlyKeyRisk] = useState(false);
  const [onlyZeroTolerance, setOnlyZeroTolerance] = useState(false);
  const [onlyReviewOverdue, setOnlyReviewOverdue] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  /* ---------------------------- Hộp thoại ------------------------- */
  const [deleting, setDeleting] = useState<Risk | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [transiting, setTransiting] = useState<Risk | null>(null);

  /** Lọc nhanh theo giai đoạn vòng đời, hoạt động độc lập với tab */
  const [lifecycle, setLifecycle] = useState("all");

  const canEdit = hasRole("admin", "qtrr", "owner");

  /* ------------------------- Lọc theo tab ------------------------- */
  function matchTab(r: Risk): boolean {
    switch (tab) {
      case "mine":
        return !!currentEmployee && r.ownerId === currentEmployee.id;
      case "key":
        return r.isKeyRisk || r.isZeroTolerance;
      case "review":
        return isReviewOverdue(r);
      case "closed":
        return r.status === "Đã đóng" || r.status === "Từ chối";
      default:
        return r.status !== "Đã đóng" && r.status !== "Từ chối";
    }
  }

  const tabCounts = useMemo(
    () => ({
      all: risks.filter((r) => r.status !== "Đã đóng" && r.status !== "Từ chối")
        .length,
      mine: currentEmployee
        ? risks.filter((r) => r.ownerId === currentEmployee.id).length
        : 0,
      key: risks.filter((r) => r.isKeyRisk || r.isZeroTolerance).length,
      review: risks.filter((r) => isReviewOverdue(r)).length,
      closed: risks.filter(
        (r) => r.status === "Đã đóng" || r.status === "Từ chối",
      ).length,
    }),
    [risks, currentEmployee],
  );

  /* --------------------------- Table state ------------------------ */
  const t = useTableState<Risk>(risks, {
    getKey: (r) => r.id,
    searchText: (r) =>
      riskSearchText(r, [
        lk.unitName(r.unitId, ""),
        lk.employeeName(r.ownerId, ""),
        lk.categoryName(r.categoryId, ""),
      ]),
    filter: (r) => {
      if (!matchTab(r)) return false;
      if (statuses.length > 0 && !statuses.includes(r.status)) return false;
      if (levels.length > 0 && !levels.includes(residualLevelOf(r)))
        return false;
      if (unitId && r.unitId !== unitId) return false;
      if (ownerId && r.ownerId !== ownerId) return false;
      if (categoryId && r.categoryId !== categoryId) return false;
      if (treatment && r.treatment !== treatment) return false;
      if (source && r.source !== source) return false;
      if (onlyKeyRisk && !r.isKeyRisk) return false;
      if (onlyZeroTolerance && !r.isZeroTolerance) return false;
      if (onlyReviewOverdue && !isReviewOverdue(r)) return false;
      return true;
    },
    sortValue: (r, key) => {
      switch (key) {
        case "code":
          return r.code;
        case "name":
          return r.name;
        case "category":
          return lk.categoryName(r.categoryId, "");
        case "unit":
          return lk.unitName(r.unitId, "");
        case "owner":
          return lk.employeeName(r.ownerId, "");
        case "inherent":
          return inherentScoreOf(r);
        case "residual":
          return (
            RISK_LEVEL_ORDER[residualLevelOf(r)] * 100 + residualScoreOf(r)
          );
        case "treatment":
          return r.treatment;
        case "loss":
          return r.estimatedLoss ?? -1;
        case "identified":
          return r.identifiedDate;
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
    filterDeps: [
      tab,
      statuses,
      levels,
      unitId,
      ownerId,
      categoryId,
      treatment,
      source,
      onlyKeyRisk,
      onlyZeroTolerance,
      onlyReviewOverdue,
    ],
  });

  /**
   * Số đếm cho từng chip quick filter.
   * Đếm trên tập đã áp bộ lọc đơn vị nhưng CHƯA áp từ khoá tìm kiếm:
   * nếu đếm toàn hệ thống thì bấm chip số lớn lại thấy bảng trống,
   * còn nếu đếm sau tìm kiếm thì số nhảy liên tục khi đang gõ.
   */
  const lifecycleCounts = useMemo(() => {
    const base = risks.filter((r) => {
      if (unitId && r.unitId !== unitId) return false;
      return true;
    });

    const out: Record<string, number> = {};
    RISK_QUICK_FILTERS.forEach((f) => {
      out[f.key] = base.filter((r) =>
        matchRiskQuickFilter(f.key, r, controlCount(r.id)),
      ).length;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risks, unitId, controlCountOf]);

  const quickFilterItems = RISK_QUICK_FILTERS.filter(
    (f) => f.key !== "wizard-draft" || (lifecycleCounts[f.key] ?? 0) > 0,
  ).map((f) => ({
    key: f.key,
    label: f.label,
    hint: f.hint,
    count: lifecycleCounts[f.key] ?? 0,
  }));

  const summary = useMemo(() => summarizeRisks(t.rows), [t.rows]);

  const filterCount =
    statuses.length +
    levels.length +
    (unitId ? 1 : 0) +
    (ownerId ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (treatment ? 1 : 0) +
    (source ? 1 : 0) +
    (onlyKeyRisk ? 1 : 0) +
    (onlyZeroTolerance ? 1 : 0) +
    (onlyReviewOverdue ? 1 : 0);

  function resetFilter() {
    setStatuses([]);
    setLevels([]);
    setUnitId(null);
    setOwnerId(null);
    setCategoryId(null);
    setTreatment(null);
    setSource(null);
    setOnlyKeyRisk(false);
    setOnlyZeroTolerance(false);
    setOnlyReviewOverdue(false);
  }

  /** Bấm vào thẻ mức độ để bật/tắt nhanh bộ lọc theo mức */
  function toggleLevel(level: string) {
    setLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  }

  /* --------------------------- Hành động -------------------------- */

  function goDetail(r: Risk) {
    router.push(`/rui-ro/so-dang-ky/${r.code}`);
  }

  function goEdit(r: Risk) {
    if (!isRiskEditable(r.status)) {
      toast.warning(
        "Không sửa được",
        `Rủi ro đang ở trạng thái ${r.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/rui-ro/so-dang-ky/${r.code}/sua`);
  }

  function duplicate(r: Risk) {
    const created = riskRepo.create(
      {
        name: `${r.name} (bản sao)`,
        description: r.description,
        cause: r.cause,
        consequence: r.consequence,
        categoryId: r.categoryId,
        objectiveIds: [...r.objectiveIds],
        unitId: r.unitId,
        ownerId: r.ownerId,
        processId: r.processId,
        systemId: r.systemId,
        source: r.source,
        inherentLikelihood: r.inherentLikelihood,
        inherentImpact: r.inherentImpact,
        residualLikelihood: r.residualLikelihood,
        residualImpact: r.residualImpact,
        treatment: r.treatment,
        treatmentNote: r.treatmentNote,
        isZeroTolerance: r.isZeroTolerance,
        isKeyRisk: r.isKeyRisk,
        identifiedDate: r.identifiedDate,
        reviewDate: "",
        status: "Nháp",
        statusNote: "",
        estimatedLoss: r.estimatedLoss,
        tags: [...r.tags],
      },
      user.name,
    );
    toast.success("Đã nhân bản", `Bản sao ${created.code} ở trạng thái Nháp.`);
  }

  function confirmDelete(r: Risk) {
    if (!DELETABLE_STATUSES.has(r.status)) {
      toast.error(
        "Không xoá được",
        `Chỉ xoá được rủi ro ở trạng thái Nháp hoặc Từ chối. ${r.code} đang ở trạng thái ${r.status}.`,
      );
      return;
    }
    setDeleting(r);
  }

  /** Chuyển nhanh sang trạng thái kế tiếp mặc định */
  function quickNext(r: Risk) {
    const list = riskNextTransitions(r.status);
    if (list.length === 0) {
      toast.warning(
        "Không chuyển được",
        `${r.status} là trạng thái cuối của luồng.`,
      );
      return;
    }
    // Có nhiều nhánh hoặc cần lý do thì mở hộp thoại
    if (list.length > 1 || list[0].requireReason) {
      setTransiting(r);
      return;
    }
    riskRepo.update(r.id, { status: list[0].to });
    toast.success(
      `${r.code}: ${list[0].label}`,
      `Trạng thái chuyển từ ${r.status} sang ${list[0].to}.`,
    );
  }

  function bulkNext() {
    let moved = 0;
    let skipped = 0;
    t.selectedKeys.forEach((id) => {
      const r = riskRepo.getById(id);
      if (!r) return;
      const list = riskNextTransitions(r.status);
      const auto = list.find((tr) => !tr.requireReason);
      if (!auto) {
        skipped += 1;
        return;
      }
      riskRepo.update(id, { status: auto.to });
      moved += 1;
    });
    t.clearSelection();
    if (moved === 0) {
      toast.warning(
        "Không có bản ghi nào được chuyển",
        "Các bản ghi đã chọn đang ở trạng thái cuối hoặc cần nhập lý do.",
      );
      return;
    }
    toast.success(
      `Đã chuyển trạng thái ${moved} rủi ro`,
      skipped > 0
        ? `${skipped} bản ghi bị bỏ qua do ở trạng thái cuối hoặc cần nhập lý do.`
        : undefined,
    );
  }

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<Risk>[] = [
    {
      key: "code",
      header: "Mã rủi ro",
      width: 140,
      sortable: true,
      render: (r) => <CodeCell code={r.code} onClick={() => goDetail(r)} />,
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
      width: 210,
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
      render: (r) => {
        const assessed = !!r.residualLikelihood && !!r.residualImpact;

        if (!assessed)
          return (
            <Tooltip content="Chưa chấm điểm rủi ro còn lại, nên chưa biết kiểm soát đã giảm rủi ro tới mức nào">
              <Badge tone="neutral" size="sm" dot>
                Chưa đánh giá
              </Badge>
            </Tooltip>
          );

        return (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <RiskBadge level={residualLevelOf(r)} score={residualScoreOf(r)} />
            {isResidualStale(r) && (
              <Tooltip content="Tập kiểm soát đã thay đổi sau lần chấm điểm gần nhất, cần đánh giá lại">
                <Badge tone="warning" size="sm">
                  Đã cũ
                </Badge>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      key: "treatment",
      header: "Xử lý",
      width: 120,
      sortable: true,
      render: (r) => <span className="text-text-secondary">{r.treatment}</span>,
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
      render: (r) => {
        if (!r.reviewDate)
          return <span className="text-text-hint">Chưa đặt</span>;
        const overdue = isReviewOverdue(r);
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "font-medium text-danger",
            )}
          >
            {overdue && <IconClockExclamation size={14} />}
            {formatDate(r.reviewDate)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "",
      width: 148,
      align: "right",
      render: (r) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => goDetail(r)}>
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <>
              <Tooltip content="Sửa">
                <IconButton label="Sửa" onClick={() => goEdit(r)}>
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Chuyển trạng thái">
                <IconButton
                  label="Chuyển trạng thái"
                  onClick={() => quickNext(r)}
                >
                  <IconArrowRight size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Nhân bản">
                <IconButton label="Nhân bản" onClick={() => duplicate(r)}>
                  <IconCopy size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Xoá">
                <IconButton label="Xoá" onClick={() => confirmDelete(r)}>
                  <IconTrash size={16} className="text-danger" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </RowActions>
      ),
    },
    {
      key: "missing",
      header: "Hồ sơ",
      minWidth: 220,
      render: (r) => (
        <MissingInfoCell
          items={riskMissingInfo(r, controlCount(r.id), assessedCountOf(r.id))}
          maxVisible={2}
        />
      ),
    },
  ];

  /* ------------------------------ Render -------------------------- */

  return (
    <PageContainer>
      <PageHeader
        title="Sổ đăng ký rủi ro"
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
                onClick={() => router.push("/rui-ro/so-dang-ky/them-moi")}
              >
                Thêm rủi ro
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
                  { key: "all", label: "Đang mở", count: tabCounts.all },
                  { key: "mine", label: "Của tôi", count: tabCounts.mine },
                  {
                    key: "key",
                    label: "Trọng yếu & KKN",
                    count: tabCounts.key,
                  },
                  {
                    key: "review",
                    label: "Quá hạn rà soát",
                    count: tabCounts.review,
                  },
                  { key: "closed", label: "Đã đóng", count: tabCounts.closed },
                ]}
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
              />
            </div>

            {/* --------------------- Thẻ thống kê --------------------- */}
            {/* --------------------- Thẻ thống kê --------------------- */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-light px-3 py-2.5">
              <StatChip
                icon={<IconAlertTriangle size={15} />}
                label="Đang hiển thị"
                value={summary.total}
                tone="brand"
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">
                Mức còn lại:
              </span>

              <StatChip
                label="Trọng yếu"
                value={summary.byLevel["Trọng yếu"]}
                tone="danger"
                active={levels.includes("Trọng yếu")}
                onClick={() => toggleLevel("Trọng yếu")}
                title="Điểm rủi ro còn lại từ 16 đến 25"
              />
              <StatChip
                label="Cao"
                value={summary.byLevel["Cao"]}
                tone="high"
                active={levels.includes("Cao")}
                onClick={() => toggleLevel("Cao")}
                title="Điểm rủi ro còn lại từ 10 đến 15"
              />
              <StatChip
                label="Trung bình"
                value={summary.byLevel["Trung bình"]}
                tone="warning"
                active={levels.includes("Trung bình")}
                onClick={() => toggleLevel("Trung bình")}
                title="Điểm rủi ro còn lại từ 5 đến 9"
              />
              <StatChip
                label="Thấp"
                value={summary.byLevel["Thấp"]}
                tone="success"
                active={levels.includes("Thấp")}
                onClick={() => toggleLevel("Thấp")}
                title="Điểm rủi ro còn lại từ 1 đến 4"
              />

              <span className="mx-0.5 h-5 w-px bg-border-light" />
              <span className="text-[12px] text-text-secondary">Đánh dấu:</span>

              <StatChip
                icon={<IconStar size={15} />}
                label="Rủi ro trọng yếu"
                value={summary.keyRisk}
                tone="brand"
                active={onlyKeyRisk}
                onClick={() => setOnlyKeyRisk((v) => !v)}
                title="Rủi ro được đánh dấu trọng yếu để báo cáo cấp cao"
              />
              <StatChip
                icon={<IconShieldExclamation size={15} />}
                label="Không khoan nhượng"
                value={summary.zeroTolerance}
                tone="danger"
                active={onlyZeroTolerance}
                onClick={() => setOnlyZeroTolerance((v) => !v)}
                title="Rủi ro không được phép chọn phương án Chấp nhận"
              />
              <StatChip
                icon={<IconClockExclamation size={15} />}
                label="Quá hạn rà soát"
                value={summary.reviewOverdue}
                tone="high"
                active={onlyReviewOverdue}
                onClick={() => setOnlyReviewOverdue((v) => !v)}
                title="Đã qua ngày rà soát định kỳ mà chưa cập nhật"
              />

              <span className="ml-auto text-[12px] text-text-secondary">
                Tổn thất ước tính:{" "}
                <b className="text-text-primary">
                  {formatMoney(summary.totalEstimatedLoss)}
                </b>{" "}
                VNĐ
              </span>
            </div>

            <LifecycleQuickFilter
              items={quickFilterItems}
              value={lifecycle}
              onChange={setLifecycle}
            />

            {/* ----------------------- Toolbar ------------------------ */}
            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, tên, đơn vị, chủ sở hữu"
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
                    label="Mức còn lại:"
                    multiple
                    options={LEVEL_OPTIONS}
                    value={levels}
                    onChange={setLevels}
                    width={210}
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
              getKey={(r) => r.id}
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
              emptyTitle="Không có rủi ro phù hợp"
              emptyDescription="Thử bỏ bớt điều kiện lọc, đổi tab hoặc xoá từ khoá tìm kiếm."
              emptyAction={
                canEdit ? (
                  <Button
                    variant="primary"
                    icon={<IconPlus size={16} />}
                    onClick={() => router.push("/rui-ro/so-dang-ky/them-moi")}
                  >
                    Thêm rủi ro
                  </Button>
                ) : undefined
              }
              rowClassName={(r) =>
                r.isZeroTolerance && residualLevelOf(r) !== "Thấp"
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

            <FilterGroup label="Chủ sở hữu rủi ro">
              <FilterCombobox
                label="Người:"
                options={lk.employeeOptions}
                value={ownerId}
                onChange={setOwnerId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Nhóm rủi ro">
              <FilterCombobox
                label="Nhóm:"
                options={lk.riskCategoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                searchable
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Phương án xử lý">
              <FilterCombobox
                label="Xử lý:"
                options={TREATMENT_OPTIONS}
                value={treatment}
                onChange={setTreatment}
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Nguồn rủi ro">
              <FilterCombobox
                label="Nguồn:"
                options={SOURCE_OPTIONS}
                value={source}
                onChange={setSource}
                width={216}
              />
            </FilterGroup>

            <FilterGroup label="Thuộc tính">
              <Checkbox
                label="Chỉ rủi ro trọng yếu"
                checked={onlyKeyRisk}
                onChange={(e) => setOnlyKeyRisk(e.target.checked)}
              />
              <Checkbox
                label="Chỉ rủi ro không khoan nhượng"
                checked={onlyZeroTolerance}
                onChange={(e) => setOnlyZeroTolerance(e.target.checked)}
              />
              <Checkbox
                label="Chỉ rủi ro quá hạn rà soát"
                checked={onlyReviewOverdue}
                onChange={(e) => setOnlyReviewOverdue(e.target.checked)}
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
      <TransitionModal
        risk={transiting}
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
            riskRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá rủi ro"
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
            const r = riskRepo.getById(id);
            return r ? DELETABLE_STATUSES.has(r.status) : false;
          });
          const skipped = t.selectedKeys.length - ids.length;
          riskRepo.removeMany(ids);
          t.clearSelection();
          setBulkDelete(false);
          if (ids.length === 0) {
            toast.error(
              "Không xoá được bản ghi nào",
              "Chỉ xoá được rủi ro ở trạng thái Nháp hoặc Từ chối.",
            );
            return;
          }
          toast.success(
            `Đã xoá ${ids.length} rủi ro`,
            skipped > 0
              ? `${skipped} bản ghi bị bỏ qua vì đã đi vào theo dõi.`
              : undefined,
          );
        }}
        tone="danger"
        title="Xoá nhiều rủi ro"
        message={
          <>
            Bạn đã chọn <b>{t.selectedKeys.length}</b> bản ghi. Hệ thống chỉ xoá
            những rủi ro đang ở trạng thái <b>Nháp</b> hoặc <b>Từ chối</b>, các
            bản ghi khác sẽ được giữ nguyên.
          </>
        }
        confirmText="Xoá các bản hợp lệ"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Thẻ thống kê nhỏ trên thanh tổng quan                               */
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

function TransitionModal({
  risk,
  onClose,
  onDone,
}: {
  risk: Risk | null;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [target, setTarget] = useState<string>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const list = risk ? riskNextTransitions(risk.status) : [];
  const selected = list.find((tr) => tr.to === target) ?? list[0];

  // Đặt lại lựa chọn mỗi lần mở hộp thoại
  const currentKey = risk?.id ?? "";
  const [lastKey, setLastKey] = useState("");
  if (currentKey !== lastKey) {
    setLastKey(currentKey);
    setTarget(list[0]?.to ?? "");
    setReason("");
    setError("");
  }

  function submit() {
    if (!risk || !selected) return;
    if (selected.requireReason && !reason.trim()) {
      setError("Bắt buộc nhập lý do khi chuyển sang trạng thái này");
      return;
    }
    riskRepo.update(risk.id, {
      status: selected.to,
      statusNote: reason.trim(),
    });
    onDone(
      `${risk.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${risk.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={!!risk}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái rủi ro"
      description={risk ? `${risk.code} - ${risk.name}` : undefined}
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
      {risk && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
            <span className="text-[12px] text-text-secondary">Hiện tại</span>
            <StatusBadge status={risk.status} />
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
              Rủi ro đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                    name="transition"
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

              <div className="rounded-ctrl bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                Mức rủi ro còn lại hiện tại là <b>{residualLevelOf(risk)}</b>{" "}
                (điểm {residualScoreOf(risk)}).
                {residualLevelOf(risk) === "Cao" ||
                residualLevelOf(risk) === "Trọng yếu"
                  ? " Theo quy định, rủi ro mức này phải có kế hoạch khắc phục và phòng ngừa trước khi đóng."
                  : ""}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
