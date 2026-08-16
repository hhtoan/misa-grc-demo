"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCheck,
  IconClockPause,
  IconDownload,
  IconEdit,
  IconEye,
  IconPlus,
  IconShieldOff,
  IconTrash,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  CodeCell,
  ConfirmDialog,
  DataTable,
  DateInput,
  EmptyState,
  FilterCombobox,
  FormGrid,
  IconButton,
  Modal,
  Pagination,
  ReadField,
  RiskBadge,
  RowActions,
  SearchInput,
  Select,
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
import { controlExceptionRepo, controlRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { RISK_LEVELS } from "@/lib/domain/enums";
import { isControlActive } from "@/lib/domain/control-utils";
import {
  CONTROL_EXCEPTION_STATUSES,
  controlExceptionFormSchema,
  zodErrors,
  type Control,
  type ControlException,
} from "@/lib/domain/schema";
import { formatDate, toInputDate } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Tiện ích riêng của ngoại lệ                                        */
/* ================================================================== */

const DAY = 86_400_000;

function endOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Đã duyệt và còn trong thời hạn */
function isActiveException(e: ControlException, today = new Date()): boolean {
  if (e.status !== "Đã duyệt") return false;
  return (
    endOfDay(e.endDate) >= today.getTime() &&
    new Date(e.startDate).getTime() <= today.getTime()
  );
}

/** Đã duyệt nhưng qua ngày kết thúc mà chưa cập nhật trạng thái */
function isPastDue(e: ControlException, today = new Date()): boolean {
  return e.status === "Đã duyệt" && endOfDay(e.endDate) < today.getTime();
}

/** Sắp hết hạn trong N ngày tới */
function isExpiringSoon(e: ControlException, days = 30, today = new Date()) {
  if (e.status !== "Đã duyệt") return false;
  const remain = endOfDay(e.endDate) - today.getTime();
  return remain >= 0 && remain <= days * DAY;
}

function daysLeft(e: ControlException, today = new Date()): number {
  return Math.round((endOfDay(e.endDate) - today.getTime()) / DAY);
}

function durationDays(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.round((endOfDay(end) - new Date(start).getTime()) / DAY);
}

/** Hai khoảng thời gian có giao nhau không */
function overlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

const STATUS_OPTIONS = CONTROL_EXCEPTION_STATUSES.map((v) => ({
  value: v,
  label: v,
}));
const LEVEL_OPTIONS = RISK_LEVELS.map((v) => ({ value: v, label: v }));

type TabKey = "active" | "pending" | "expiring" | "all";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function NgoaiLeKiemSoatScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const exceptions = useCollection(controlExceptionRepo);
  const controls = useCollection(controlRepo);

  const canEdit = hasRole("admin", "qtrr", "owner");
  const canApprove = hasRole("admin", "qtrr");

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email]
  );

  const [tab, setTab] = useState<TabKey>("active");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [controlId, setControlId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ControlException | null>(null);
  const [detail, setDetail] = useState<ControlException | null>(null);
  const [approving, setApproving] = useState<ControlException | null>(null);
  const [deleting, setDeleting] = useState<ControlException | null>(null);

  const controlMap = useMemo(
    () => new Map(controls.map((c) => [c.id, c])),
    [controls]
  );

  const controlOptions = useMemo(
    () =>
      controls.map((c) => ({
        value: c.id,
        label: c.name,
        description: `${c.code} - ${c.status}`,
      })),
    [controls]
  );

  /* ------------------------- Lọc theo tab ------------------------ */

  function matchTab(e: ControlException): boolean {
    switch (tab) {
      case "active":
        return isActiveException(e);
      case "pending":
        return e.status === "Chờ duyệt";
      case "expiring":
        return isExpiringSoon(e) || isPastDue(e);
      default:
        return true;
    }
  }

  const tabCounts = useMemo(
    () => ({
      active: exceptions.filter((e) => isActiveException(e)).length,
      pending: exceptions.filter((e) => e.status === "Chờ duyệt").length,
      expiring: exceptions.filter((e) => isExpiringSoon(e) || isPastDue(e))
        .length,
      all: exceptions.length,
    }),
    [exceptions]
  );

  /* --------------------------- Table state ----------------------- */

  const t = useTableState<ControlException>(exceptions, {
    getKey: (e) => e.id,
    searchText: (e) =>
      [
        e.code,
        e.reason,
        e.compensatingControl,
        controlMap.get(e.controlId)?.code ?? "",
        controlMap.get(e.controlId)?.name ?? "",
        lk.employeeName(e.requesterId, ""),
      ].join(" "),
    filter: (e) => {
      if (!matchTab(e)) return false;
      if (statuses.length > 0 && !statuses.includes(e.status)) return false;
      if (controlId && e.controlId !== controlId) return false;
      if (unitId && e.unitId !== unitId) return false;
      return true;
    },
    sortValue: (e, key) => {
      switch (key) {
        case "code":
          return e.code;
        case "control":
          return controlMap.get(e.controlId)?.code ?? "";
        case "start":
          return e.startDate;
        case "end":
          return e.endDate;
        case "level":
          return e.residualRiskLevel;
        case "status":
          return e.status;
        default:
          return null;
      }
    },
    defaultSort: { key: "end", dir: "asc" },
    pageSize: 20,
    filterDeps: [tab, statuses, controlId, unitId],
  });

  /* --------------------------- Thống kê -------------------------- */

  const stat = useMemo(
    () => ({
      active: exceptions.filter((e) => isActiveException(e)).length,
      pending: exceptions.filter((e) => e.status === "Chờ duyệt").length,
      expiring: exceptions.filter((e) => isExpiringSoon(e)).length,
      pastDue: exceptions.filter((e) => isPastDue(e)).length,
    }),
    [exceptions]
  );

  const pastDueList = useMemo(
    () => exceptions.filter((e) => isPastDue(e)),
    [exceptions]
  );

  /* --------------------------- Hành động ------------------------- */

  function approve(e: ControlException, note: string) {
    controlExceptionRepo.update(e.id, {
      status: "Đã duyệt",
      approverId: currentEmployee?.id ?? "",
      statusNote: note.trim(),
    });
    setApproving(null);
    toast.success(
      `Đã phê duyệt ${e.code}`,
      `Ngoại lệ có hiệu lực tới ${formatDate(e.endDate)}.`
    );
  }

  function reject(e: ControlException, note: string) {
    if (!note.trim()) {
      toast.error("Chưa từ chối được", "Bắt buộc nhập lý do từ chối.");
      return;
    }
    controlExceptionRepo.update(e.id, {
      status: "Từ chối",
      approverId: currentEmployee?.id ?? "",
      statusNote: note.trim(),
    });
    setApproving(null);
    toast.success(
      `Đã từ chối ${e.code}`,
      "Kiểm soát tiếp tục áp dụng bình thường."
    );
  }

  function closeException(e: ControlException) {
    controlExceptionRepo.update(e.id, {
      status: "Hết hiệu lực",
      statusNote:
        e.statusNote ||
        "Đã hết thời hạn ngoại lệ, kiểm soát quay lại vận hành bình thường.",
    });
    toast.success(
      `Đã kết thúc ${e.code}`,
      "Kiểm soát quay lại vận hành bình thường."
    );
  }

  /* --------------------------- Cột bảng -------------------------- */

  const columns: Column<ControlException>[] = [
    {
      key: "code",
      header: "Mã",
      width: 130,
      sortable: true,
      render: (e) => <CodeCell code={e.code} onClick={() => setDetail(e)} />,
    },
    {
      key: "control",
      header: "Kiểm soát",
      minWidth: 280,
      sortable: true,
      render: (e) => {
        const c = controlMap.get(e.controlId);
        return (
          <TitleCell
            title={
              <span className="flex min-w-0 items-center gap-1.5">
                <b className="shrink-0 text-[12px] text-brand">
                  {c?.code ?? "Đã xoá"}
                </b>
                <span className="truncate">
                  {c?.name ?? "Kiểm soát không còn tồn tại"}
                </span>
              </span>
            }
            sub={c ? `${c.type} - ${c.status}` : undefined}
          />
        );
      },
    },
    {
      key: "reason",
      header: "Lý do đề nghị",
      minWidth: 260,
      wrap: true,
      render: (e) => (
        <span className="text-[12px] leading-4 text-text-secondary">
          {e.reason}
        </span>
      ),
    },
    {
      key: "requester",
      header: "Người đề nghị",
      width: 190,
      render: (e) => (
        <UserCell name={lk.employeeName(e.requesterId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "start",
      header: "Từ ngày",
      width: 115,
      sortable: true,
      render: (e) => formatDate(e.startDate),
    },
    {
      key: "end",
      header: "Đến ngày",
      width: 150,
      sortable: true,
      render: (e) => {
        const left = daysLeft(e);
        const past = isPastDue(e);
        const soon = isExpiringSoon(e);
        return (
          <Tooltip
            content={
              past
                ? `Đã quá hạn ${Math.abs(left)} ngày mà chưa kết thúc`
                : soon
                  ? `Còn ${left} ngày`
                  : formatDate(e.endDate)
            }
          >
            <span
              className={cn(
                "inline-flex items-center gap-1",
                past && "font-medium text-danger",
                soon && !past && "font-medium text-lv-medium-text"
              )}
            >
              {(past || soon) && <IconClockPause size={14} />}
              {formatDate(e.endDate)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "level",
      header: "Rủi ro trong kỳ",
      width: 150,
      sortable: true,
      render: (e) => <RiskBadge level={e.residualRiskLevel} />,
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      sortable: true,
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: "actions",
      header: "",
      width: 155,
      align: "right",
      render: (e) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => setDetail(e)}>
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          {canApprove && e.status === "Chờ duyệt" && (
            <Tooltip content="Phê duyệt hoặc từ chối">
              <IconButton label="Phê duyệt" onClick={() => setApproving(e)}>
                <IconCheck size={16} className="text-success" />
              </IconButton>
            </Tooltip>
          )}
          {canApprove && isPastDue(e) && (
            <Tooltip content="Kết thúc hiệu lực">
              <IconButton
                label="Kết thúc hiệu lực"
                onClick={() => closeException(e)}
              >
                <IconClockPause size={16} className="text-lv-medium-text" />
              </IconButton>
            </Tooltip>
          )}
          {canEdit && e.status === "Chờ duyệt" && (
            <>
              <Tooltip content="Sửa">
                <IconButton
                  label="Sửa"
                  onClick={() => {
                    setEditing(e);
                    setFormOpen(true);
                  }}
                >
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Xoá">
                <IconButton label="Xoá" onClick={() => setDeleting(e)}>
                  <IconTrash size={16} className="text-danger" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </RowActions>
      ),
    },
  ];

  /* ------------------------------ Render ------------------------- */

  return (
    <PageContainer>
      <PageHeader
        title="Ngoại lệ kiểm soát"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị tệp cho ${t.total} ngoại lệ (giả lập).`
                )
              }
            >
              Xuất khẩu
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                icon={<IconPlus size={16} />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Đề nghị ngoại lệ
              </Button>
            )}
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* --------------------- Thẻ tổng quan -------------------- */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <MiniCard
              icon={<IconShieldOff size={18} />}
              tone="warning"
              label="Đang có hiệu lực"
              value={stat.active}
              note="Kiểm soát tạm không áp dụng đầy đủ"
            />
            <MiniCard
              icon={<IconAlertTriangle size={18} />}
              tone="brand"
              label="Chờ phê duyệt"
              value={stat.pending}
              note="Cần Ban QTRR xem xét"
            />
            <MiniCard
              icon={<IconClockPause size={18} />}
              tone="high"
              label="Sắp hết hạn"
              value={stat.expiring}
              note="Hết hiệu lực trong 30 ngày tới"
            />
            <MiniCard
              icon={<IconClockPause size={18} />}
              tone="danger"
              label="Quá hạn chưa kết thúc"
              value={stat.pastDue}
              note="Đã qua ngày kết thúc mà chưa cập nhật"
            />
          </div>

          {/* ------------------ Cảnh báo quá hạn ------------------ */}
          {pastDueList.length > 0 && (
            <div className="rounded-card border border-lv-critical-border bg-lv-critical-bg p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-critical-text">
                <IconClockPause size={16} />
                {pastDueList.length} ngoại lệ đã qua ngày kết thúc nhưng vẫn ở
                trạng thái Đã duyệt
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pastDueList.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setDetail(e)}
                    className="rounded-badge border border-lv-critical-border bg-white px-2 py-0.5 text-[12px] font-medium text-lv-critical-text transition-colors hover:bg-lv-critical-bg"
                  >
                    {e.code} ({formatDate(e.endDate)})
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-lv-critical-text opacity-80">
                Cần chuyển sang Hết hiệu lực để kiểm soát quay lại vận hành bình
                thường, hoặc gia hạn bằng một đề nghị mới.
              </p>
            </div>
          )}

          {/* -------------------------- Bảng ------------------------ */}
          <ContentCard padded={false} className="overflow-hidden">
            <div className="px-3">
              <Tabs
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
                items={[
                  {
                    key: "active",
                    label: "Đang hiệu lực",
                    count: tabCounts.active,
                  },
                  {
                    key: "pending",
                    label: "Chờ duyệt",
                    count: tabCounts.pending,
                  },
                  {
                    key: "expiring",
                    label: "Sắp hết hạn & quá hạn",
                    count: tabCounts.expiring,
                  },
                  { key: "all", label: "Tất cả", count: tabCounts.all },
                ]}
              />
            </div>

            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, kiểm soát, lý do"
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
                </>
              }
              right={
                <>
                  <FilterCombobox
                    label="Kiểm soát:"
                    options={controlOptions}
                    value={controlId}
                    onChange={setControlId}
                    searchable
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
                </>
              }
            />

            {exceptions.length === 0 ? (
              <EmptyState
                icon={<IconShieldOff size={24} />}
                title="Chưa có đề nghị ngoại lệ nào"
                description="Ngoại lệ được dùng khi đơn vị tạm thời chưa thể tuân thủ đầy đủ một kiểm soát, kèm biện pháp bù đắp."
                action={
                  canEdit ? (
                    <Button
                      variant="primary"
                      icon={<IconPlus size={16} />}
                      onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                      }}
                    >
                      Đề nghị ngoại lệ
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={t.pageRows}
                  getKey={(e) => e.id}
                  sort={t.sort}
                  onSort={t.toggleSort}
                  onRowClick={setDetail}
                  stickyLast
                  emptyTitle="Không có ngoại lệ phù hợp"
                  emptyDescription="Thử đổi tab hoặc bỏ bớt điều kiện lọc."
                  rowClassName={(e) =>
                    isPastDue(e) ? "!bg-lv-critical-bg" : undefined
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

      {/* ========================= Hộp thoại ========================= */}
      <ExceptionFormModal
        open={formOpen}
        record={editing}
        controls={controls}
        controlOptions={controlOptions}
        existing={exceptions}
        lk={lk}
        actor={user.name}
        defaultRequesterId={currentEmployee?.id ?? ""}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onDone={(msg, note) => {
          setFormOpen(false);
          setEditing(null);
          toast.success(msg, note);
        }}
      />

      <ApproveModal
        record={approving}
        control={approving ? controlMap.get(approving.controlId) ?? null : null}
        onClose={() => setApproving(null)}
        onApprove={approve}
        onReject={reject}
      />

      <ExceptionDetailModal
        record={detail}
        control={detail ? controlMap.get(detail.controlId) ?? null : null}
        lk={lk}
        onClose={() => setDetail(null)}
        onOpenControl={(code) => {
          setDetail(null);
          router.push(`/kiem-soat/so-dang-ky/${code}`);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            controlExceptionRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá đề nghị ngoại lệ"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b>? Chỉ xoá được đề nghị
            đang ở trạng thái Chờ duyệt.
          </>
        }
        confirmText="Xoá"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Thẻ nhỏ                                        */
/* ================================================================== */

function MiniCard({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  tone: "brand" | "warning" | "high" | "danger";
  label: string;
  value: number;
  note: string;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
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
        <p className="truncate text-[11px] text-text-hint">{note}</p>
      </div>
    </ContentCard>
  );
}

/* ================================================================== */
/* Hộp thoại thêm / sửa đề nghị ngoại lệ                               */
/* ================================================================== */

interface ExceptionFormState {
  controlId: string;
  reason: string;
  requesterId: string;
  unitId: string;
  startDate: string;
  endDate: string;
  compensatingControl: string;
  residualRiskLevel: string;
}

function emptyExceptionForm(requesterId: string): ExceptionFormState {
  const today = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 90);
  return {
    controlId: "",
    reason: "",
    requesterId,
    unitId: "",
    startDate: toInputDate(today),
    endDate: toInputDate(end),
    compensatingControl: "",
    residualRiskLevel: "Trung bình",
  };
}

function ExceptionFormModal({
  open,
  record,
  controls,
  controlOptions,
  existing,
  lk,
  actor,
  defaultRequesterId,
  onClose,
  onDone,
}: {
  open: boolean;
  record: ControlException | null;
  controls: Control[];
  controlOptions: { value: string; label: string; description?: string }[];
  existing: ControlException[];
  lk: ReturnType<typeof useLookups>;
  actor: string;
  defaultRequesterId: string;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [form, setForm] = useState<ExceptionFormState>(() =>
    emptyExceptionForm(defaultRequesterId)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState("");

  const key = `${open}-${record?.id ?? "new"}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setErrors({});
      setForm(
        record
          ? {
              controlId: record.controlId,
              reason: record.reason,
              requesterId: record.requesterId,
              unitId: record.unitId,
              startDate: record.startDate,
              endDate: record.endDate,
              compensatingControl: record.compensatingControl,
              residualRiskLevel: record.residualRiskLevel,
            }
          : emptyExceptionForm(defaultRequesterId)
      );
    }
  }

  const control = controls.find((c) => c.id === form.controlId) ?? null;

  function patch(next: Partial<ExceptionFormState>) {
    setForm((p) => ({ ...p, ...next }));
    setErrors((prev) => {
      const out = { ...prev };
      let changed = false;
      Object.keys(next).forEach((k) => {
        if (out[k]) {
          delete out[k];
          changed = true;
        }
      });
      return changed ? out : prev;
    });
  }

  /** Đổi kiểm soát thì gợi ý sẵn đơn vị theo hồ sơ kiểm soát */
  function changeControl(id: string) {
    const c = controls.find((x) => x.id === id);
    patch({ controlId: id, unitId: form.unitId || (c?.unitId ?? "") });
  }

  const duration = durationDays(form.startDate, form.endDate);

  /* ------------------------ Cảnh báo mềm ------------------------ */

  const warnings = useMemo(() => {
    const out: string[] = [];
    if (control && !isControlActive(control)) {
      out.push(
        `Kiểm soát đang ở trạng thái ${control.status}, chưa thực sự vận hành nên việc xin ngoại lệ có thể không cần thiết.`
      );
    }
    if (control?.isKeyControl) {
      out.push(
        "Đây là kiểm soát trọng yếu. Ngoại lệ với kiểm soát trọng yếu cần được cấp có thẩm quyền cao hơn xem xét."
      );
    }
    if (duration > 180) {
      out.push(
        `Thời hạn ngoại lệ là ${duration} ngày, vượt quá 6 tháng. Nên chia nhỏ theo từng giai đoạn để rà soát định kỳ.`
      );
    }
    if (
      form.residualRiskLevel === "Cao" ||
      form.residualRiskLevel === "Trọng yếu"
    ) {
      out.push(
        `Mức rủi ro trong thời gian ngoại lệ là ${form.residualRiskLevel}. Cần bổ sung biện pháp bù đắp mạnh hơn hoặc rút ngắn thời hạn.`
      );
    }
    return out;
  }, [control, duration, form.residualRiskLevel]);

  /* ----------------------------- Lưu ---------------------------- */

  function save() {
    const payload = {
      controlId: form.controlId,
      reason: form.reason.trim(),
      requesterId: form.requesterId,
      approverId: record?.approverId ?? "",
      unitId: form.unitId,
      startDate: form.startDate,
      endDate: form.endDate,
      compensatingControl: form.compensatingControl.trim(),
      residualRiskLevel: form.residualRiskLevel,
      status: record?.status ?? "Chờ duyệt",
      statusNote: record?.statusNote ?? "",
    };

    const parsed = controlExceptionFormSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    /* Chặn chồng lấn thời gian với ngoại lệ khác của cùng kiểm soát */
    const conflict = existing.find(
      (e) =>
        e.id !== record?.id &&
        e.controlId === form.controlId &&
        (e.status === "Đã duyệt" || e.status === "Chờ duyệt") &&
        overlap(form.startDate, form.endDate, e.startDate, e.endDate)
    );

    if (conflict) {
      setErrors({
        startDate: `Trùng thời gian với ${conflict.code} ( ${formatDate(
          conflict.startDate
        )} - ${formatDate(conflict.endDate)})`,
      });
      return;
    }

    if (record) {
      controlExceptionRepo.update(record.id, parsed.data);
      onDone(`Đã lưu ${record.code}`, "Đề nghị ngoại lệ đã được cập nhật.");
      return;
    }

    const created = controlExceptionRepo.create(parsed.data, actor);
    onDone(
      `Đã tạo ${created.code}`,
      "Đề nghị đang ở trạng thái Chờ duyệt, cần Ban QTRR phê duyệt trước khi có hiệu lực."
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={record ? `Sửa ${record.code}` : "Đề nghị ngoại lệ kiểm soát"}
      description="Ngoại lệ chỉ có hiệu lực sau khi được phê duyệt và luôn phải kèm biện pháp bù đắp"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={save}>
            {record ? "Lưu thay đổi" : "Gửi đề nghị"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {warnings.length > 0 && (
          <div className="rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-lv-medium-text">
              <IconAlertTriangle size={15} />
              Lưu ý ({warnings.length})
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 pl-5">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="list-disc text-[12px] leading-4 text-lv-medium-text"
                >
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Select
          label="Kiểm soát xin ngoại lệ"
          required
          searchable
          placeholder="Chọn kiểm soát"
          options={controlOptions}
          value={form.controlId || null}
          error={errors.controlId}
          onChange={(v) => changeControl(v ?? "")}
        />

        {control && (
          <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] text-text-secondary">
            <StatusBadge status={control.status} />
            {control.isKeyControl && <Badge tone="brand">Trọng yếu</Badge>}
            <span>
              Loại <b className="text-text-primary">{control.type}</b>
            </span>
            <span>
              Tần suất <b className="text-text-primary">{control.frequency}</b>
            </span>
            <span>
              Phủ <b className="text-text-primary">{control.riskIds.length}</b>{" "}
              rủi ro
            </span>
          </div>
        )}

        <Textarea
          label="Lý do đề nghị"
          required
          rows={3}
          maxLength={800}
          showCount
          placeholder="Vì sao đơn vị chưa thể tuân thủ đầy đủ kiểm soát này"
          value={form.reason}
          error={errors.reason}
          onChange={(e) => patch({ reason: e.target.value })}
        />

        <FormGrid cols={2}>
          <Select
            label="Người đề nghị"
            required
            searchable
            placeholder="Chọn người đề nghị"
            options={lk.employeeOptions}
            value={form.requesterId || null}
            error={errors.requesterId}
            onChange={(v) => patch({ requesterId: v ?? "" })}
          />
          <Select
            label="Đơn vị đề nghị"
            searchable
            clearable
            placeholder="Chọn đơn vị"
            options={lk.unitOptions}
            value={form.unitId || null}
            onChange={(v) => patch({ unitId: v ?? "" })}
          />
        </FormGrid>

        <FormGrid cols={3}>
          <DateInput
            label="Từ ngày"
            required
            value={form.startDate}
            error={errors.startDate}
            onChange={(v) => patch({ startDate: v })}
          />
          <DateInput
            label="Đến ngày"
            required
            value={form.endDate}
            min={form.startDate || undefined}
            error={errors.endDate}
            hint={
              errors.endDate || duration <= 0
                ? undefined
                : `Thời hạn ${duration} ngày`
            }
            onChange={(v) => patch({ endDate: v })}
          />
          <Select
            label="Mức rủi ro trong kỳ"
            required
            options={LEVEL_OPTIONS}
            value={form.residualRiskLevel}
            onChange={(v) => patch({ residualRiskLevel: v ?? "Trung bình" })}
          />
        </FormGrid>

        <Textarea
          label="Biện pháp bù đắp"
          required
          rows={3}
          maxLength={800}
          showCount
          placeholder="Biện pháp thay thế để giữ rủi ro trong ngưỡng chấp nhận suốt thời gian ngoại lệ"
          value={form.compensatingControl}
          error={errors.compensatingControl}
          onChange={(e) => patch({ compensatingControl: e.target.value })}
        />
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Hộp thoại phê duyệt                                        */
/* ================================================================== */

function ApproveModal({
  record,
  control,
  onClose,
  onApprove,
  onReject,
}: {
  record: ControlException | null;
  control: Control | null;
  onClose: () => void;
  onApprove: (e: ControlException, note: string) => void;
  onReject: (e: ControlException, note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [lastKey, setLastKey] = useState("");

  const key = record?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    if (record) setNote("");
  }

  const duration = record ? durationDays(record.startDate, record.endDate) : 0;

  return (
    <Modal
      open={!!record}
      onClose={onClose}
      size="md"
      title="Phê duyệt đề nghị ngoại lệ"
      description={record ? `${record.code} - ${control?.code ?? ""}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="danger"
            onClick={() => record && onReject(record, note)}
          >
            Từ chối
          </Button>
          <Button
            variant="primary"
            icon={<IconCheck size={16} />}
            onClick={() => record && onApprove(record, note)}
          >
            Phê duyệt
          </Button>
        </>
      }
    >
      {record && (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            <ReadField label="Kiểm soát">
              {control ? `${control.code} - ${control.name}` : "Đã xoá"}
            </ReadField>
            <ReadField label="Thời hạn đề nghị">
              {formatDate(record.startDate)} - {formatDate(record.endDate)} (
              {duration} ngày)
            </ReadField>
            <ReadField label="Mức rủi ro trong kỳ">
              <RiskBadge level={record.residualRiskLevel} />
            </ReadField>
            <ReadField label="Kiểm soát trọng yếu">
              {control?.isKeyControl ? "Có" : "Không"}
            </ReadField>
          </div>

          <ReadField label="Lý do đề nghị">
            <span className="leading-5 whitespace-pre-line">{record.reason}</span>
          </ReadField>

          <ReadField label="Biện pháp bù đắp">
            <span className="leading-5 whitespace-pre-line">
              {record.compensatingControl}
            </span>
          </ReadField>

          <Textarea
            label="Ý kiến phê duyệt"
            rows={3}
            maxLength={500}
            showCount
            placeholder="Điều kiện kèm theo khi phê duyệt, hoặc lý do nếu từ chối"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {(record.residualRiskLevel === "Cao" ||
            record.residualRiskLevel === "Trọng yếu" ||
            control?.isKeyControl) && (
            <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
              <IconAlertTriangle size={16} className="mt-px shrink-0" />
              <span>
                Đề nghị liên quan tới kiểm soát trọng yếu hoặc mức rủi ro cao.
                Nên yêu cầu báo cáo tiến độ định kỳ trong thời gian ngoại lệ.
              </span>
            </div>
          )}

          <p className="text-[12px] text-text-hint">
            Từ chối bắt buộc phải nhập lý do trong ô ý kiến phê duyệt.
          </p>
        </div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/* Hộp thoại xem chi tiết                                        */
/* ================================================================== */

function ExceptionDetailModal({
  record,
  control,
  lk,
  onClose,
  onOpenControl,
}: {
  record: ControlException | null;
  control: Control | null;
  lk: ReturnType<typeof useLookups>;
  onClose: () => void;
  onOpenControl: (code: string) => void;
}) {
  const duration = record ? durationDays(record.startDate, record.endDate) : 0;
  const left = record ? daysLeft(record) : 0;

  return (
    <Modal
      open={!!record}
      onClose={onClose}
      size="lg"
      title={record ? `${record.code} - ${control?.code ?? "Kiểm soát đã xoá"}` : ""}
      headerRight={record ? <StatusBadge status={record.status} /> : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          {control && (
            <Button variant="primary" onClick={() => onOpenControl(control.code)}>
              Xem kiểm soát
            </Button>
          )}
        </>
      }
    >
      {record && (
        <div className="flex flex-col gap-4">
          {isPastDue(record) && (
            <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
              <IconClockPause size={16} className="mt-px shrink-0" />
              <span>
                Ngoại lệ đã qua ngày kết thúc {Math.abs(left)} ngày nhưng vẫn ở
                trạng thái Đã duyệt. Cần chuyển sang Hết hiệu lực.
              </span>
            </div>
          )}

          {isActiveException(record) && (
            <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
              <IconShieldOff size={16} className="mt-px shrink-0" />
              <span>
                Ngoại lệ đang có hiệu lực, còn {left} ngày. Trong thời gian này
                kiểm soát không được áp dụng đầy đủ, rủi ro được giữ ở mức{" "}
                <b>{record.residualRiskLevel}</b> nhờ biện pháp bù đắp.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
            <ReadField label="Kiểm soát">
              {control ? `${control.code} - ${control.name}` : "Đã xoá"}
            </ReadField>
            <ReadField label="Đơn vị đề nghị">
              {lk.unitName(record.unitId)}
            </ReadField>
            <ReadField label="Người đề nghị">
              <UserCell
                name={lk.employeeName(record.requesterId, "Chưa gán")}
                size={22}
              />
            </ReadField>
            <ReadField label="Từ ngày">{formatDate(record.startDate)}</ReadField>
            <ReadField label="Đến ngày">{formatDate(record.endDate)}</ReadField>
            <ReadField label="Thời hạn">{duration} ngày</ReadField>
            <ReadField label="Mức rủi ro trong kỳ">
              <RiskBadge level={record.residualRiskLevel} />
            </ReadField>
            <ReadField label="Người phê duyệt">
              {record.approverId ? (
                <UserCell name={lk.employeeName(record.approverId)} size={22} />
              ) : (
                <span className="text-text-hint">Chưa phê duyệt</span>
              )}
            </ReadField>
            <ReadField label="Trạng thái">
              <StatusBadge status={record.status} />
            </ReadField>
          </div>

          <ReadField label="Lý do đề nghị">
            <span className="leading-5 whitespace-pre-line">{record.reason}</span>
          </ReadField>

          <ReadField label="Biện pháp bù đắp">
            <span className="leading-5 whitespace-pre-line">
              {record.compensatingControl}
            </span>
          </ReadField>

          <ReadField label="Ý kiến phê duyệt">
            <span className="leading-5 whitespace-pre-line">
              {record.statusNote || "--"}
            </span>
          </ReadField>
        </div>
      )}
    </Modal>
  );
}
