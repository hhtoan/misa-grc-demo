"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCalendarExclamation,
  IconClipboardCheck,
  IconClipboardPlus,
  IconDownload,
  IconEdit,
  IconEye,
  IconLink,
  IconTrash,
  IconInfoCircle,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  CodeCell,
  ConfirmDialog,
  DataTable,
  DateInput,
  EmptyState,
  FilterCombobox,
  FormGrid,
  IconButton,
  Input,
  Modal,
  Pagination,
  ReadField,
  RiskBadge,
  RowActions,
  SearchInput,
  Select,
  StatusBadge,
  TableToolbar,
  Textarea,
  TitleCell,
  Tooltip,
  UserCell,
  useToast,
  type Column,
  EffectivenessBadge,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import {
  controlRepo,
  controlTestRepo,
  deficiencyRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  CONTROL_TEST_METHODS,
  CONTROL_TEST_RESULTS,
  RISK_LEVELS,
} from "@/lib/domain/enums";
import {
  controlHealth,
  daysToNextTest,
  isNeverTested,
  isTestDueSoon,
  isTestOverdue,
  nextTestDate,
  testCycleOf,
  DESIGN_QUESTION,
  EFFECTIVENESS_OPTIONS,
  OPERATION_QUESTION,
  applyTestResultToControl,
  combineEffectiveness,
  isTestConclusionComplete,
  normalizeEffectiveness,
  type ControlEffectivenessPatch,
} from "@/lib/domain/control-utils";
import {
  controlTestFormSchema,
  zodErrors,
  type Control,
  type ControlTest,
  type Deficiency,
} from "@/lib/domain/schema";
import {
  formatDate,
  formatNumber,
  matchSearch,
  toInputDate,
} from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const RESULT_OPTIONS = CONTROL_TEST_RESULTS.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Hiệu quả"
      ? "Kiểm soát vận hành đúng thiết kế, không cần khắc phục"
      : v === "Hiệu quả một phần"
        ? "Có vận hành nhưng còn sai sót, phải lập điểm yếu"
        : "Kiểm soát không vận hành hoặc vận hành sai, phải lập điểm yếu",
}));

const METHOD_OPTIONS = CONTROL_TEST_METHODS.map((v) => ({
  value: v,
  label: v,
}));

const SEVERITY_OPTIONS = RISK_LEVELS.map((v) => ({ value: v, label: v }));

/** Mức nghiêm trọng gợi ý cho điểm yếu sinh ra từ kết quả kiểm tra */
function suggestSeverity(
  result: string,
  isKeyControl: boolean,
): (typeof RISK_LEVELS)[number] {
  if (result === "Không hiệu quả") return isKeyControl ? "Trọng yếu" : "Cao";
  if (result === "Hiệu quả một phần")
    return isKeyControl ? "Cao" : "Trung bình";
  return "Thấp";
}

/** Hạn khắc phục gợi ý theo mức nghiêm trọng */
function suggestDueDate(detectedDate: string, severity: string): string {
  const days =
    severity === "Trọng yếu"
      ? 30
      : severity === "Cao"
        ? 60
        : severity === "Trung bình"
          ? 90
          : 120;
  const d = new Date(detectedDate || new Date());
  d.setDate(d.getDate() + days);
  return toInputDate(d);
}

/**
 * Đồng bộ kết quả kiểm tra gần nhất về hồ sơ kiểm soát.
 * Dùng chung cho cả thêm, sửa và xoá đợt kiểm tra.
 */
function syncControlFromTests(controlId: string) {
  const rows = controlTestRepo.list().filter((t) => t.controlId === controlId);
  if (rows.length === 0) {
    controlRepo.update(controlId, { lastTestResult: null, lastTestDate: "" });
    return;
  }
  const latest = rows.reduce((a, b) => (a.testDate >= b.testDate ? a : b));
  controlRepo.update(controlId, {
    lastTestResult: latest.result,
    lastTestDate: latest.testDate,
  });
}

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function KetQuaKiemTraScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const tests = useCollection(controlTestRepo);
  const controls = useCollection(controlRepo);
  const deficiencies = useCollection(deficiencyRepo);

  const canEdit = hasRole("admin", "qtrr", "owner");

  const [results, setResults] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [controlId, setControlId] = useState<string | null>(null);
  const [testerId, setTesterId] = useState<string | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ControlTest | null>(null);
  const [presetControl, setPresetControl] = useState<string>("");
  const [detail, setDetail] = useState<ControlTest | null>(null);
  const [deleting, setDeleting] = useState<ControlTest | null>(null);

  const controlMap = useMemo(
    () => new Map(controls.map((c) => [c.id, c])),
    [controls],
  );
  const defMap = useMemo(
    () => new Map(deficiencies.map((d) => [d.id, d])),
    [deficiencies],
  );

  const controlOptions = useMemo(
    () =>
      controls.map((c) => ({
        value: c.id,
        label: c.name,
        description: `${c.code} - ${c.type} - ${c.status}`,
      })),
    [controls],
  );

  /* ------------------- Kiểm soát đến hạn kiểm tra ---------------- */

  const dueControls = useMemo(
    () =>
      controls
        .filter((c) => isTestOverdue(c) || isTestDueSoon(c) || isNeverTested(c))
        .sort((a, b) => (daysToNextTest(a) ?? 0) - (daysToNextTest(b) ?? 0)),
    [controls],
  );

  /* --------------------------- Table state ----------------------- */

  const t = useTableState<ControlTest>(tests, {
    getKey: (x) => x.id,
    searchText: (x) =>
      [
        x.code,
        x.period,
        x.finding,
        x.recommendation,
        controlMap.get(x.controlId)?.code ?? "",
        controlMap.get(x.controlId)?.name ?? "",
        lk.employeeName(x.testerId, ""),
      ].join(" "),
    filter: (x) => {
      if (results.length > 0 && !results.includes(x.result)) return false;
      if (methods.length > 0 && !methods.includes(x.method)) return false;
      if (controlId && x.controlId !== controlId) return false;
      if (testerId && x.testerId !== testerId) return false;
      if (onlyFailed && x.result === "Hiệu quả") return false;
      return true;
    },
    sortValue: (x, key) => {
      switch (key) {
        case "code":
          return x.code;
        case "control":
          return controlMap.get(x.controlId)?.code ?? "";
        case "period":
          return x.period;
        case "testDate":
          return x.testDate;
        case "tester":
          return lk.employeeName(x.testerId, "");
        case "sample":
          return x.sampleSize === 0 ? 0 : x.failCount / x.sampleSize;
        case "result":
          return x.result === "Không hiệu quả"
            ? 3
            : x.result === "Hiệu quả một phần"
              ? 2
              : 1;
        default:
          return null;
      }
    },
    defaultSort: { key: "testDate", dir: "desc" },
    pageSize: 20,
    filterDeps: [results, methods, controlId, testerId, onlyFailed],
  });

  /* --------------------------- Thống kê -------------------------- */

  const stat = useMemo(() => {
    const rows = t.rows;
    const failed = rows.filter((x) => x.result !== "Hiệu quả").length;
    const sample = rows.reduce((s, x) => s + x.sampleSize, 0);
    const fail = rows.reduce((s, x) => s + x.failCount, 0);
    return {
      total: rows.length,
      ok: rows.length - failed,
      failed,
      failRate: sample === 0 ? 0 : Math.round((fail / sample) * 100),
      overdue: controls.filter((c) => isTestOverdue(c)).length,
    };
  }, [t.rows, controls]);

  /* --------------------------- Hành động ------------------------- */

  function openCreate(preset = "") {
    setEditing(null);
    setPresetControl(preset);
    setFormOpen(true);
  }

  function openEdit(x: ControlTest) {
    setEditing(x);
    setPresetControl("");
    setFormOpen(true);
  }

  function doDelete(x: ControlTest) {
    const linkedDef = x.deficiencyId ? defMap.get(x.deficiencyId) : undefined;
    controlTestRepo.remove(x.id);
    syncControlFromTests(x.controlId);
    setDeleting(null);
    toast.success(
      "Đã xoá đợt kiểm tra",
      linkedDef
        ? `${x.code} đã bị xoá. Điểm yếu ${linkedDef.code} vẫn được giữ lại để theo dõi.`
        : `${x.code} đã bị xoá, kết quả kiểm tra của kiểm soát được tính lại.`,
    );
  }

  /* --------------------------- Cột bảng -------------------------- */

  const columns: Column<ControlTest>[] = [
    {
      key: "code",
      header: "Mã đợt",
      width: 140,
      sortable: true,
      render: (x) => <CodeCell code={x.code} onClick={() => setDetail(x)} />,
    },
    {
      key: "control",
      header: "Kiểm soát",
      minWidth: 300,
      sortable: true,
      render: (x) => {
        const c = controlMap.get(x.controlId);
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
                {c?.isKeyControl && (
                  <Badge tone="brand" size="sm">
                    TY
                  </Badge>
                )}
              </span>
            }
            sub={c ? `${c.type} - ${c.nature} - ${c.frequency}` : undefined}
          />
        );
      },
    },
    {
      key: "period",
      header: "Kỳ kiểm tra",
      width: 140,
      sortable: true,
      render: (x) => (
        <TitleCell title={x.period || "--"} sub={formatDate(x.testDate)} />
      ),
    },
    {
      key: "tester",
      header: "Người kiểm tra",
      width: 200,
      sortable: true,
      render: (x) => (
        <UserCell name={lk.employeeName(x.testerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "method",
      header: "Phương pháp",
      width: 160,
      render: (x) => <span className="text-text-secondary">{x.method}</span>,
    },
    {
      key: "sample",
      header: "Mẫu / lỗi",
      width: 130,
      align: "center",
      sortable: true,
      render: (x) => {
        const rate =
          x.sampleSize === 0
            ? 0
            : Math.round((x.failCount / x.sampleSize) * 100);
        return (
          <Tooltip content={`Tỷ lệ mẫu lỗi ${rate}%`}>
            <span
              className={cn(
                "text-[13px]",
                x.failCount > 0
                  ? "font-medium text-danger"
                  : "text-text-secondary",
              )}
            >
              {formatNumber(x.sampleSize)} / {formatNumber(x.failCount)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "designResult",
      header: "Thiết kế",
      width: 130,
      render: (t) => (
        <EffectivenessBadge
          size="sm"
          short
          dimension="Thiết kế"
          value={t.designResult || "Chưa đánh giá"}
        />
      ),
    },
    {
      key: "operationResult",
      header: "Vận hành",
      width: 130,
      render: (t) => (
        <EffectivenessBadge
          size="sm"
          short
          dimension="Vận hành"
          value={t.operationResult || t.result || "Chưa đánh giá"}
        />
      ),
    },
    {
      key: "deficiency",
      header: "Điểm yếu",
      width: 150,
      render: (x) => {
        if (!x.deficiencyId) {
          if (x.result === "Hiệu quả")
            return <span className="text-text-hint">--</span>;
          return (
            <Tooltip content="Kết luận chưa đạt nhưng chưa gắn điểm yếu, cần rà soát">
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-danger">
                <IconAlertTriangle size={14} />
                Thiếu điểm yếu
              </span>
            </Tooltip>
          );
        }
        const d = defMap.get(x.deficiencyId);
        return (
          <span className="flex flex-col gap-0.5">
            <CodeCell
              code={d?.code ?? "Đã xoá"}
              onClick={() => router.push("/khac-phuc/diem-yeu")}
            />
            {d && (
              <span className="text-[11px] text-text-hint">{d.status}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: 120,
      align: "right",
      render: (x) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => setDetail(x)}>
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <>
              <Tooltip content="Sửa">
                <IconButton label="Sửa" onClick={() => openEdit(x)}>
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Xoá">
                <IconButton label="Xoá" onClick={() => setDeleting(x)}>
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
        title="Kết quả kiểm tra kiểm soát"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconDownload size={16} />}
              onClick={() =>
                toast.info(
                  "Đang xuất khẩu",
                  `Chuẩn bị tệp cho ${t.total} đợt kiểm tra (giả lập).`,
                )
              }
            >
              Xuất khẩu
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                icon={<IconClipboardPlus size={16} />}
                onClick={() => openCreate()}
              >
                Ghi nhận đợt kiểm tra
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
              icon={<IconClipboardCheck size={18} />}
              tone="brand"
              label="Đợt kiểm tra đang hiển thị"
              value={stat.total}
              note={`${stat.ok} kết luận Hiệu quả`}
            />
            <MiniCard
              icon={<IconAlertTriangle size={18} />}
              tone="danger"
              label="Kết luận chưa đạt"
              value={stat.failed}
              note="Bắt buộc có điểm yếu kèm theo"
            />
            <MiniCard
              icon={<IconClipboardCheck size={18} />}
              tone="warning"
              label="Tỷ lệ mẫu lỗi tích luỹ"
              value={`${stat.failRate}%`}
              note="Tính trên toàn bộ mẫu đã kiểm tra"
            />
            <MiniCard
              icon={<IconCalendarExclamation size={18} />}
              tone="high"
              label="Kiểm soát quá hạn kiểm tra"
              value={stat.overdue}
              note="Cần đưa vào kế hoạch kiểm tra ngay"
            />
          </div>

          {/* ------------- Kiểm soát đến hạn kiểm tra ------------- */}
          {dueControls.length > 0 && (
            <ContentCard padded={false} className="overflow-hidden">
              <div className="flex h-14 flex-wrap items-center gap-2 border-b border-border-light px-4">
                <IconCalendarExclamation
                  size={17}
                  className="text-lv-medium-text"
                />
                <h2 className="text-[14px] font-semibold text-text-primary">
                  Kiểm soát cần kiểm tra ({dueControls.length})
                </h2>
                <span className="text-[12px] text-text-secondary">
                  Quá hạn, sắp tới hạn trong 30 ngày hoặc chưa từng kiểm tra
                </span>
              </div>

              <div className="flex flex-col divide-y divide-border-light">
                {dueControls.slice(0, 6).map((c) => (
                  <DueRow
                    key={c.id}
                    control={c}
                    ownerName={lk.employeeName(c.ownerId, "Chưa gán")}
                    canEdit={canEdit}
                    onRecord={() => openCreate(c.id)}
                    onOpen={() =>
                      router.push(`/kiem-soat/so-dang-ky/${c.code}`)
                    }
                  />
                ))}
              </div>

              {dueControls.length > 6 && (
                <div className="border-t border-border-light px-4 py-2 text-center text-[12px] text-text-secondary">
                  Còn {dueControls.length - 6} kiểm soát khác, xem đầy đủ tại
                  tab Cần chú ý của sổ đăng ký kiểm soát.
                </div>
              )}
            </ContentCard>
          )}

          {/* -------------------------- Bảng ------------------------ */}
          <ContentCard padded={false} className="overflow-hidden">
            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã đợt, kiểm soát, phát hiện"
                    width={300}
                  />
                  <FilterCombobox
                    label="Kết luận:"
                    multiple
                    options={RESULT_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                    value={results}
                    onChange={setResults}
                    width={220}
                  />
                  <FilterCombobox
                    label="Kiểm soát:"
                    options={controlOptions}
                    value={controlId}
                    onChange={setControlId}
                    searchable
                    width={240}
                  />
                </>
              }
              right={
                <>
                  <FilterCombobox
                    label="Phương pháp:"
                    multiple
                    options={METHOD_OPTIONS}
                    value={methods}
                    onChange={setMethods}
                    width={220}
                  />
                  <FilterCombobox
                    label="Người kiểm tra:"
                    options={lk.employeeOptions}
                    value={testerId}
                    onChange={setTesterId}
                    searchable
                    width={230}
                  />
                  <Checkbox
                    label="Chỉ kết luận chưa đạt"
                    checked={onlyFailed}
                    onChange={(e) => setOnlyFailed(e.target.checked)}
                  />
                </>
              }
            />

            {tests.length === 0 ? (
              <EmptyState
                icon={<IconClipboardCheck size={24} />}
                title="Chưa ghi nhận đợt kiểm tra nào"
                description="Ghi nhận kết quả kiểm tra để đánh giá hiệu lực thực tế của các kiểm soát."
                action={
                  canEdit ? (
                    <Button
                      variant="primary"
                      icon={<IconClipboardPlus size={16} />}
                      onClick={() => openCreate()}
                    >
                      Ghi nhận đợt kiểm tra
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={t.pageRows}
                  getKey={(x) => x.id}
                  sort={t.sort}
                  onSort={t.toggleSort}
                  onRowClick={setDetail}
                  stickyLast
                  emptyTitle="Không có đợt kiểm tra phù hợp"
                  emptyDescription="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá."
                  rowClassName={(x) =>
                    x.result === "Không hiệu quả"
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

      {/* ========================= Hộp thoại ========================= */}
      <TestFormModal
        open={formOpen}
        record={editing}
        presetControl={presetControl}
        controls={controls}
        controlOptions={controlOptions}
        lk={lk}
        actor={user.name}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setPresetControl("");
        }}
        onDone={(msg, detailMsg) => {
          setFormOpen(false);
          setEditing(null);
          setPresetControl("");
          toast.success(msg, detailMsg);
        }}
      />

      <TestDetailModal
        test={detail}
        control={detail ? (controlMap.get(detail.controlId) ?? null) : null}
        deficiency={
          detail?.deficiencyId
            ? (defMap.get(detail.deficiencyId) ?? null)
            : null
        }
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
        onConfirm={() => deleting && doDelete(deleting)}
        tone="danger"
        title="Xoá đợt kiểm tra"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b>? Kết quả kiểm tra gần
            nhất của kiểm soát sẽ được tính lại từ các đợt còn lại.
          </>
        }
        confirmText="Xoá"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Dòng kiểm soát đến hạn                                        */
/* ================================================================== */

function DueRow({
  control,
  ownerName,
  canEdit,
  onRecord,
  onOpen,
}: {
  control: Control;
  ownerName: string;
  canEdit: boolean;
  onRecord: () => void;
  onOpen: () => void;
}) {
  const remain = daysToNextTest(control);
  const overdue = isTestOverdue(control);
  const never = isNeverTested(control);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#FAFAFA]">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl",
          overdue
            ? "bg-lv-critical-bg text-lv-critical-text"
            : "bg-lv-medium-bg text-lv-medium-text",
        )}
      >
        <IconCalendarExclamation size={16} />
      </span>

      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-[13px] text-text-primary">
          <b className="text-brand">{control.code}</b> {control.name}
        </p>
        <p className="truncate text-[12px] text-text-secondary">
          {ownerName} - Tần suất {control.frequency.toLowerCase()} - Chu kỳ kiểm
          tra {testCycleOf(control)} ngày
        </p>
      </button>

      {never ? (
        <Badge tone="warning" dot>
          Chưa từng kiểm tra
        </Badge>
      ) : overdue ? (
        <Badge tone="danger" dot>
          Quá hạn {Math.abs(remain ?? 0)} ngày
        </Badge>
      ) : (
        <Badge tone="warning" dot>
          Còn {remain} ngày
        </Badge>
      )}

      <span className="w-[110px] shrink-0 text-right text-[12px] text-text-secondary">
        {formatDate(nextTestDate(control)) || "--"}
      </span>

      {canEdit && (
        <Button variant="secondary" size="sm" compact onClick={onRecord}>
          Ghi nhận
        </Button>
      )}
    </div>
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
  tone: "brand" | "success" | "warning" | "high" | "danger";
  label: string;
  value: number | string;
  note: string;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    success: "bg-lv-low-bg text-lv-low-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    high: "bg-lv-high-bg text-lv-high-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
  };
  return (
    <ContentCard className="flex items-start gap-3">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
          style[tone],
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
/* Hộp thoại ghi nhận đợt kiểm tra                                     */
/* ================================================================== */

interface TestFormState {
  controlId: string;
  period: string;
  testDate: string;
  testerId: string;
  method: string;
  sampleSize: string;
  failCount: string;
  result: string;
  finding: string;
  recommendation: string;
  evidenceNote: string;
  /* Điểm yếu phát sinh */
  defName: string;
  defSeverity: string;
  defOwnerId: string;
  defDueDate: string;
  defRootCause: string;
  designResult: string;
  operationResult: string;
}

function emptyTestForm(preset = ""): TestFormState {
  const today = toInputDate(new Date());
  return {
    controlId: preset,
    period: "",
    testDate: today,
    testerId: "",
    method: "Kiểm tra chứng từ",
    sampleSize: "",
    failCount: "0",
    result: "Hiệu quả",
    finding: "",
    recommendation: "",
    evidenceNote: "",
    defName: "",
    defSeverity: "Trung bình",
    defOwnerId: "",
    defDueDate: "",
    defRootCause: "",
    designResult: "",
    operationResult: "",
  };
}

function TestFormModal({
  open,
  record,
  presetControl,
  controls,
  controlOptions,
  lk,
  actor,
  onClose,
  onDone,
}: {
  open: boolean;
  record: ControlTest | null;
  presetControl: string;
  controls: Control[];
  controlOptions: { value: string; label: string; description?: string }[];
  lk: ReturnType<typeof useLookups>;
  actor: string;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [form, setForm] = useState<TestFormState>(() => emptyTestForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState("");

  const key = `${open}-${record?.id ?? "new"}-${presetControl}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setErrors({});
      setForm(
        record
          ? {
              controlId: record.controlId,
              period: record.period,
              testDate: record.testDate,
              testerId: record.testerId,
              method: record.method,
              sampleSize: String(record.sampleSize),
              failCount: String(record.failCount),
              result: record.result,
              finding: record.finding,
              recommendation: record.recommendation,
              evidenceNote: record.evidenceNote,
              defName: "",
              defSeverity: "Trung bình",
              defOwnerId: "",
              defDueDate: "",
              defRootCause: "",
              designResult: record.designResult ?? "",
              operationResult: record.operationResult ?? "",
            }
          : emptyTestForm(presetControl),
      );
    }
  }

  const control = controls.find((c) => c.id === form.controlId) ?? null;
  const needDeficiency = form.result !== "Hiệu quả";
  /** Chỉ tạo điểm yếu khi thêm mới, bản sửa giữ nguyên liên kết cũ */
  const createDeficiency = needDeficiency && !record;

  function patch(next: Partial<TestFormState>) {
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

  /** Đổi kiểm soát thì gợi ý sẵn người kiểm tra và tên điểm yếu */
  function changeControl(id: string) {
    const c = controls.find((x) => x.id === id);
    patch({
      controlId: id,
      defOwnerId: form.defOwnerId || (c?.ownerId ?? ""),
      defName: form.defName || (c ? `Điểm yếu tại kiểm soát ${c.code}` : ""),
    });
  }

  /** Đổi kết luận thì gợi ý lại mức nghiêm trọng và hạn khắc phục */
  function changeResult(v: string) {
    const severity = suggestSeverity(v, control?.isKeyControl ?? false);
    patch({
      result: v,
      defSeverity: severity,
      defDueDate: suggestDueDate(form.testDate, severity),
      defOwnerId: form.defOwnerId || (control?.ownerId ?? ""),
      defName:
        form.defName ||
        (control ? `Điểm yếu tại kiểm soát ${control.code}` : ""),
    });
  }

  const failRate =
    Number(form.sampleSize) > 0
      ? Math.round((Number(form.failCount) / Number(form.sampleSize)) * 100)
      : null;

  function save() {
    const payload = {
      controlId: form.controlId,
      period: form.period.trim(),
      testDate: form.testDate,
      testerId: form.testerId,
      method: form.method,
      sampleSize: Number(form.sampleSize || 0),
      failCount: Number(form.failCount || 0),
      result: form.result,
      finding: form.finding.trim(),
      recommendation: form.recommendation.trim(),
      deficiencyId: record?.deficiencyId ?? "",
      evidenceNote: form.evidenceNote.trim(),
    };

    const parsed = controlTestFormSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    /* ---- Kiểm tra thêm phần điểm yếu bắt buộc ---- */
    if (createDeficiency) {
      const err: Record<string, string> = {};
      if (!form.defName.trim()) err.defName = "Bắt buộc nhập tên điểm yếu";
      if (!form.defOwnerId)
        err.defOwnerId = "Bắt buộc chọn người chịu trách nhiệm khắc phục";
      if (!form.defDueDate) err.defDueDate = "Bắt buộc nhập hạn khắc phục";
      else if (form.defDueDate < form.testDate)
        err.defDueDate = "Hạn khắc phục phải sau ngày kiểm tra";
      const needRoot =
        form.defSeverity === "Cao" || form.defSeverity === "Trọng yếu";
      if (needRoot && !form.defRootCause.trim())
        err.defRootCause =
          "Điểm yếu mức Cao hoặc Trọng yếu bắt buộc phân tích nguyên nhân gốc";
      if (Object.keys(err).length > 0) {
        setErrors(err);
        return;
      }
    }

    if (!isTestConclusionComplete(form)) {
      const err: Record<string, string> = {};
      err.operationResult =
        "Bắt buộc kết luận hiệu lực vận hành, vì đây là mục đích của đợt kiểm tra";
      setErrors(err);
      return;
    }
    /* --------------------------- Lưu -------------------------- */

    if (record) {
      controlTestRepo.update(record.id, parsed.data);
      syncControlFromTests(record.controlId);
      if (parsed.data.controlId !== record.controlId) {
        syncControlFromTests(parsed.data.controlId);
      }
      onDone(
        `Đã lưu ${record.code}`,
        "Kết quả kiểm tra gần nhất của kiểm soát đã được cập nhật lại.",
      );
      return;
    }

    const created = controlTestRepo.create(parsed.data, actor);
    const cRepo = controlRepo as unknown as {
      update: (id: string, patch: ControlEffectivenessPatch) => void;
    };

    /* Đợt kiểm tra là nguồn sinh ra hiệu lực vận hành, nên phải
         đẩy kết luận ngược về hồ sơ kiểm soát ngay tại đây */
    const patch = applyTestResultToControl({
      designResult: form.designResult,
      operationResult: form.operationResult,
      testDate: form.testDate,
    });
    cRepo.update(form.controlId, patch);

    let defCode = "";
    if (createDeficiency && control) {
      const def = deficiencyRepo.create(
        {
          name: form.defName.trim(),
          description: form.finding.trim(),
          sourceType: "Kiểm tra kiểm soát",
          sourceRef: created.code,
          controlId: control.id,
          riskId: control.riskIds[0] ?? "",
          eventId: "",
          severity: form.defSeverity as Deficiency["severity"],
          unitId: control.unitId,
          ownerId: form.defOwnerId,
          detectedDate: form.testDate,
          dueDate: form.defDueDate,
          rootCause: form.defRootCause.trim(),
          status: "Mới ghi nhận",
          statusNote: "",
          kppnIds: [],
        },
        actor,
      );
      defCode = def.code;
      controlTestRepo.update(created.id, { deficiencyId: def.id });
    }

    syncControlFromTests(parsed.data.controlId);

    const overall = combineEffectiveness(
      normalizeEffectiveness(form.designResult),
      normalizeEffectiveness(form.operationResult),
    );

    onDone(
      "Đã ghi nhận kết quả kiểm tra",
      overall === "Không hiệu quả"
        ? "Hiệu quả chung của kiểm soát chuyển sang Không hiệu quả. Nên lập điểm yếu để theo dõi việc khắc phục."
        : `Hiệu quả chung của kiểm soát cập nhật thành ${overall}.`,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={record ? `Sửa ${record.code}` : "Ghi nhận đợt kiểm tra kiểm soát"}
      description="Kết quả kiểm tra sẽ tự cập nhật vào hồ sơ kiểm soát"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={save}>
            {record ? "Lưu thay đổi" : "Ghi nhận"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Select
          label="Kiểm soát được kiểm tra"
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
            <span>
              Tần suất <b className="text-text-primary">{control.frequency}</b>
            </span>
            <span>
              Chu kỳ kiểm tra{" "}
              <b className="text-text-primary">{testCycleOf(control)} ngày</b>
            </span>
            <span>
              Sức khoẻ{" "}
              <b className="text-text-primary">{controlHealth(control)}/100</b>
            </span>
            {control.evidenceRequirement && (
              <span className="w-full text-[11px] text-text-hint">
                Yêu cầu bằng chứng: {control.evidenceRequirement}
              </span>
            )}
          </div>
        )}

        <FormGrid cols={3}>
          <Input
            label="Kỳ kiểm tra"
            placeholder="Ví dụ: Quý III/2026"
            value={form.period}
            error={errors.period}
            onChange={(e) => patch({ period: e.target.value })}
          />
          <DateInput
            label="Ngày kiểm tra"
            required
            value={form.testDate}
            error={errors.testDate}
            onChange={(v) => patch({ testDate: v })}
          />
          <Select
            label="Người kiểm tra"
            required
            searchable
            placeholder="Chọn người kiểm tra"
            options={lk.employeeOptions}
            value={form.testerId || null}
            error={errors.testerId}
            onChange={(v) => patch({ testerId: v ?? "" })}
          />
        </FormGrid>

        <FormGrid cols={3}>
          <Select
            label="Phương pháp kiểm tra"
            options={METHOD_OPTIONS}
            value={form.method}
            onChange={(v) => patch({ method: v ?? "Kiểm tra chứng từ" })}
          />
          <Input
            label="Cỡ mẫu"
            type="number"
            value={form.sampleSize}
            error={errors.sampleSize}
            onChange={(e) => patch({ sampleSize: e.target.value })}
          />
          <Input
            label="Số mẫu lỗi"
            type="number"
            value={form.failCount}
            error={errors.failCount}
            hint={
              errors.failCount || failRate === null
                ? undefined
                : `Tỷ lệ mẫu lỗi ${failRate}%`
            }
            onChange={(e) => patch({ failCount: e.target.value })}
          />
        </FormGrid>

        {/* ============ Kết luận theo hai chiều ============ */}
        <div className="flex flex-col gap-3 rounded-card border border-border-light p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-text-primary">
              Kết luận đợt kiểm tra
            </span>
            <span className="ml-auto">
              <EffectivenessBadge
                value={combineEffectiveness(
                  normalizeEffectiveness(form.designResult),
                  normalizeEffectiveness(form.operationResult),
                )}
              />
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div data-field="designResult">
              <Select
                label="Hiệu lực thiết kế"
                clearable
                placeholder="Để trống nếu đợt này không xét thiết kế"
                options={EFFECTIVENESS_OPTIONS}
                value={form.designResult || null}
                hint={DESIGN_QUESTION}
                onChange={(v) => patch({ designResult: v ?? "" })}
              />
            </div>

            <div data-field="operationResult">
              <Select
                label="Hiệu lực vận hành"
                required
                placeholder="Bắt buộc kết luận"
                options={EFFECTIVENESS_OPTIONS}
                value={form.operationResult || null}
                error={errors.operationResult}
                hint={errors.operationResult ? undefined : OPERATION_QUESTION}
                onChange={(v) => patch({ operationResult: v ?? "" })}
              />
            </div>
          </div>

          {form.designResult === "Không hiệu quả" && (
            <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
              <IconAlertTriangle size={16} className="mt-px shrink-0" />
              <span>
                Thiết kế không hiệu quả thì việc chấn chỉnh người thực hiện{" "}
                <b>không giải quyết được gì</b>. Sau khi lưu, hãy lập điểm yếu
                và sửa lại chính thiết kế kiểm soát.
              </span>
            </div>
          )}

          {form.designResult !== "Không hiệu quả" &&
            form.operationResult === "Không hiệu quả" && (
              <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                <IconAlertTriangle size={16} className="mt-px shrink-0" />
                <span>
                  Thiết kế phù hợp nhưng không được thực hiện. Việc cần làm là{" "}
                  <b>chấn chỉnh người thực hiện</b>, không phải sửa quy định.
                </span>
              </div>
            )}
        </div>

        <Textarea
          label="Phát hiện"
          required={needDeficiency}
          rows={3}
          maxLength={800}
          showCount
          placeholder="Mô tả sai sót, bằng chứng thu thập được"
          value={form.finding}
          error={errors.finding}
          onChange={(e) => patch({ finding: e.target.value })}
        />

        <Textarea
          label="Khuyến nghị"
          required={needDeficiency}
          rows={3}
          maxLength={800}
          placeholder="Đề xuất biện pháp khắc phục hoặc cải tiến kiểm soát"
          value={form.recommendation}
          error={errors.recommendation}
          onChange={(e) => patch({ recommendation: e.target.value })}
        />

        <Textarea
          label="Bằng chứng thu thập"
          rows={2}
          maxLength={500}
          placeholder="Tài liệu, ảnh chụp màn hình, biên bản đã thu thập"
          value={form.evidenceNote}
          onChange={(e) => patch({ evidenceNote: e.target.value })}
        />

        {/* --------------- Điểm yếu bắt buộc phát sinh --------------- */}
        {createDeficiency && (
          <div className="flex flex-col gap-3 rounded-card border border-lv-medium-border bg-lv-medium-bg/50 p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-medium-text">
              <IconLink size={16} />
              Điểm yếu kiểm soát phát sinh
            </p>
            <p className="text-[12px] leading-4 text-lv-medium-text">
              Kết luận khác Hiệu quả thì bắt buộc ghi nhận điểm yếu. Hệ thống sẽ
              tự tạo bản ghi tại phân hệ Khắc phục và phòng ngừa, liên kết ngược
              về đợt kiểm tra này.
            </p>

            <Input
              label="Tên điểm yếu"
              required
              value={form.defName}
              error={errors.defName}
              onChange={(e) => patch({ defName: e.target.value })}
            />

            <FormGrid cols={3}>
              <Select
                label="Mức nghiêm trọng"
                required
                options={SEVERITY_OPTIONS}
                value={form.defSeverity}
                onChange={(v) => {
                  const s = v ?? "Trung bình";
                  patch({
                    defSeverity: s,
                    defDueDate: suggestDueDate(form.testDate, s),
                  });
                }}
              />
              <Select
                label="Người khắc phục"
                required
                searchable
                placeholder="Chọn người phụ trách"
                options={lk.employeeOptions}
                value={form.defOwnerId || null}
                error={errors.defOwnerId}
                onChange={(v) => patch({ defOwnerId: v ?? "" })}
              />
              <DateInput
                label="Hạn khắc phục"
                required
                value={form.defDueDate}
                min={form.testDate || undefined}
                error={errors.defDueDate}
                onChange={(v) => patch({ defDueDate: v })}
              />
            </FormGrid>

            <Textarea
              label="Nguyên nhân gốc"
              required={
                form.defSeverity === "Cao" || form.defSeverity === "Trọng yếu"
              }
              rows={3}
              maxLength={800}
              placeholder="Phân tích vì sao kiểm soát không vận hành đúng thiết kế"
              value={form.defRootCause}
              error={errors.defRootCause}
              onChange={(e) => patch({ defRootCause: e.target.value })}
            />
          </div>
        )}

        {needDeficiency && record && (
          <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
            <IconAlertTriangle size={16} className="mt-px shrink-0" />
            <span>
              Bản ghi đang sửa giữ nguyên liên kết điểm yếu cũ. Nếu cần điểm yếu
              mới, hãy tạo trực tiếp tại phân hệ Khắc phục và phòng ngừa.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Hộp thoại xem chi tiết đợt kiểm tra                                 */
/* ================================================================== */

function TestDetailModal({
  test,
  control,
  deficiency,
  lk,
  onClose,
  onOpenControl,
}: {
  test: ControlTest | null;
  control: Control | null;
  deficiency: Deficiency | null;
  lk: ReturnType<typeof useLookups>;
  onClose: () => void;
  onOpenControl: (code: string) => void;
}) {
  const rate =
    test && test.sampleSize > 0
      ? Math.round((test.failCount / test.sampleSize) * 100)
      : null;

  return (
    <Modal
      open={!!test}
      onClose={onClose}
      size="lg"
      title={
        test ? `${test.code} - ${control?.code ?? "Kiểm soát đã xoá"}` : ""
      }
      headerRight={test ? <StatusBadge status={test.result} /> : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          {control && (
            <Button
              variant="primary"
              onClick={() => onOpenControl(control.code)}
            >
              Xem kiểm soát
            </Button>
          )}
        </>
      }
    >
      {test && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
            <ReadField label="Kiểm soát">
              {control ? `${control.code} - ${control.name}` : "Đã xoá"}
            </ReadField>
            <ReadField label="Kỳ kiểm tra">{test.period || "--"}</ReadField>
            <ReadField label="Ngày kiểm tra">
              {formatDate(test.testDate)}
            </ReadField>
            <ReadField label="Người kiểm tra">
              <UserCell
                name={lk.employeeName(test.testerId, "Chưa gán")}
                size={22}
              />
            </ReadField>
            <ReadField label="Phương pháp">{test.method}</ReadField>
            <ReadField label="Cỡ mẫu / mẫu lỗi">
              {formatNumber(test.sampleSize)} / {formatNumber(test.failCount)}
              {rate !== null ? ` ( ${rate}%)` : ""}
            </ReadField>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ReadField label="Phát hiện">
              <span className="leading-5 whitespace-pre-line">
                {test.finding || "--"}
              </span>
            </ReadField>
            <ReadField label="Khuyến nghị">
              <span className="leading-5 whitespace-pre-line">
                {test.recommendation || "--"}
              </span>
            </ReadField>
          </div>

          <ReadField label="Bằng chứng thu thập">
            <span className="leading-5 whitespace-pre-line">
              {test.evidenceNote || "--"}
            </span>
          </ReadField>

          <div className="border-t border-border-light pt-3">
            <h3 className="mb-2 text-[14px] font-semibold text-text-primary">
              Điểm yếu phát sinh
            </h3>
            {deficiency ? (
              <div className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-medium-bg text-lv-medium-text">
                  <IconAlertTriangle size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-text-primary">
                    <b className="text-brand">{deficiency.code}</b>{" "}
                    {deficiency.name}
                  </p>
                  <p className="truncate text-[12px] text-text-secondary">
                    Phụ trách {lk.employeeName(deficiency.ownerId)} - Hạn{" "}
                    {formatDate(deficiency.dueDate) || "chưa đặt"}
                  </p>
                </div>
                <RiskBadge level={deficiency.severity} />
                <StatusBadge status={deficiency.status} />
              </div>
            ) : test.result === "Hiệu quả" ? (
              <p className="text-[13px] text-text-hint">
                Kết luận Hiệu quả nên không phát sinh điểm yếu.
              </p>
            ) : (
              <div className="flex items-center gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg px-3 py-2.5 text-[12px] text-lv-critical-text">
                <IconAlertTriangle size={16} className="shrink-0" />
                Kết luận chưa đạt nhưng chưa gắn điểm yếu nào. Cần bổ sung tại
                phân hệ Khắc phục và phòng ngừa.
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
