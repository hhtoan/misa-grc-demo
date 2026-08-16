"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconChartLine,
  IconEdit,
  IconHistory,
  IconPlus,
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
  Input,
  Modal,
  RowActions,
  SearchInput,
  Select,
  Switch,
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
  kriReadingRepo,
  kriRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  CONTROL_FREQUENCIES,
  KRI_DIRECTIONS,
  KRI_STATUSES,
  type KriStatus,
} from "@/lib/domain/enums";
import {
  kriFormSchema,
  kriStatusOf,
  zodErrors,
  type Kri,
  type KriReading,
} from "@/lib/domain/schema";
import { formatDate, formatNumber, matchSearch } from "@/lib/format";
import { toInputDate } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */

const STATUS_TONE: Record<KriStatus, "success" | "warning" | "danger"> = {
  "An toàn": "success",
  "Cảnh báo": "warning",
  "Vượt ngưỡng": "danger",
};

const STATUS_OPTIONS = KRI_STATUSES.map((s) => ({ value: s, label: s }));
const DIRECTION_OPTIONS = KRI_DIRECTIONS.map((s) => ({ value: s, label: s }));
const FREQUENCY_OPTIONS = CONTROL_FREQUENCIES.map((s) => ({
  value: s,
  label: s,
}));

interface KriFormState {
  name: string;
  description: string;
  riskId: string;
  unitId: string;
  ownerId: string;
  measureUnit: string;
  direction: string;
  thresholdWarning: string;
  thresholdBreach: string;
  frequency: string;
  dataSource: string;
  isActive: boolean;
}

const EMPTY_FORM: KriFormState = {
  name: "",
  description: "",
  riskId: "",
  unitId: "",
  ownerId: "",
  measureUnit: "",
  direction: "Càng cao càng xấu",
  thresholdWarning: "",
  thresholdBreach: "",
  frequency: "Hàng tháng",
  dataSource: "",
  isActive: true,
};

/* ================================================================== */

export default function KriScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const kris = useCollection(kriRepo);
  const readings = useCollection(kriReadingRepo);
  const risks = useCollection(riskRepo);

  const [keyword, setKeyword] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [riskId, setRiskId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Kri | null>(null);
  const [reading, setReading] = useState<Kri | null>(null);
  const [history, setHistory] = useState<Kri | null>(null);
  const [deleting, setDeleting] = useState<Kri | null>(null);

  const canEdit = hasRole("admin", "qtrr", "owner");

  const riskOptions = useMemo(
    () =>
      risks.map((r) => ({
        value: r.id,
        label: r.name,
        description: r.code,
      })),
    [risks]
  );

  const riskName = (id: string) =>
    risks.find((r) => r.id === id)?.name ?? "--";
  const riskCode = (id: string) => risks.find((r) => r.id === id)?.code ?? "";

  const rows = useMemo(
    () =>
      kris.filter((k) => {
        if (statuses.length > 0 && !statuses.includes(k.status)) return false;
        if (riskId && k.riskId !== riskId) return false;
        if (
          keyword.trim() &&
          !matchSearch(`${k.code} ${k.name} ${riskName(k.riskId)}`, keyword)
        )
          return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kris, statuses, riskId, keyword, risks]
  );

  const stat = useMemo(
    () => ({
      total: kris.length,
      breach: kris.filter((k) => k.status === "Vượt ngưỡng").length,
      warn: kris.filter((k) => k.status === "Cảnh báo").length,
      safe: kris.filter((k) => k.status === "An toàn").length,
    }),
    [kris]
  );

  const readingsOf = (kriId: string) =>
    readings
      .filter((r) => r.kriId === kriId)
      .sort((a, b) => (a.recordedDate < b.recordedDate ? 1 : -1));

  /* ---------------------------- Cột bảng --------------------------- */

  const columns: Column<Kri>[] = [
    {
      key: "code",
      header: "Mã",
      width: 130,
      render: (k) => <CodeCell code={k.code} onClick={() => setHistory(k)} />,
    },
    {
      key: "name",
      header: "Tên chỉ số",
      minWidth: 300,
      render: (k) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{k.name}</span>
              {!k.isActive && (
                <Badge tone="neutral" size="sm">
                  Ngừng theo dõi
                </Badge>
              )}
            </span>
          }
          sub={`${k.direction} - Tần suất ${k.frequency}`}
        />
      ),
    },
    {
      key: "risk",
      header: "Rủi ro gắn kèm",
      width: 240,
      render: (k) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const code = riskCode(k.riskId);
            if (code) router.push(`/rui-ro/so-dang-ky/${code}`);
          }}
          className="flex min-w-0 flex-col text-left"
        >
          <span className="truncate text-[12px] font-medium text-brand">
            {riskCode(k.riskId)}
          </span>
          <span className="truncate text-[12px] text-text-secondary">
            {riskName(k.riskId)}
          </span>
        </button>
      ),
    },
    {
      key: "owner",
      header: "Người theo dõi",
      width: 200,
      render: (k) => (
        <UserCell name={lk.employeeName(k.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "value",
      header: "Giá trị hiện tại",
      width: 160,
      align: "right",
      render: (k) => (
        <span className="flex flex-col items-end">
          <b className="text-[13px] text-text-primary">
            {k.currentValue === null
              ? "--"
              : `${formatNumber(k.currentValue)} ${k.measureUnit}`}
          </b>
          <span className="text-[11px] text-text-hint">
            {k.currentPeriod || "Chưa có kỳ đo"}
          </span>
        </span>
      ),
    },
    {
      key: "threshold",
      header: "Ngưỡng",
      width: 170,
      render: (k) => (
        <span className="flex flex-col text-[12px]">
          <span className="text-lv-medium-text">
            Cảnh báo: {formatNumber(k.thresholdWarning)} {k.measureUnit}
          </span>
          <span className="text-lv-critical-text">
            Vượt: {formatNumber(k.thresholdBreach)} {k.measureUnit}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      render: (k) => (
        <Badge tone={STATUS_TONE[k.status]} dot>
          {k.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: 150,
      align: "right",
      render: (k) => (
        <RowActions>
          <Tooltip content="Lịch sử kỳ đo">
            <IconButton label="Lịch sử" onClick={() => setHistory(k)}>
              <IconHistory size={16} />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <>
              <Tooltip content="Ghi nhận giá trị kỳ mới">
                <IconButton
                  label="Ghi nhận giá trị"
                  onClick={() => setReading(k)}
                >
                  <IconChartLine size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Sửa">
                <IconButton
                  label="Sửa"
                  onClick={() => {
                    setEditing(k);
                    setFormOpen(true);
                  }}
                >
                  <IconEdit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Xoá">
                <IconButton label="Xoá" onClick={() => setDeleting(k)}>
                  <IconTrash size={16} className="text-danger" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </RowActions>
      ),
    },
  ];

  /* ------------------------------ Render --------------------------- */

  return (
    <PageContainer>
      <PageHeader
        title="Chỉ số cảnh báo (KRI)"
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon={<IconPlus size={16} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Thêm chỉ số
            </Button>
          )
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* --------------------- Thẻ tổng quan --------------------- */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <MiniCard label="Tổng chỉ số" value={stat.total} tone="brand" />
            <MiniCard
              label="Vượt ngưỡng"
              value={stat.breach}
              tone="danger"
              icon={<IconAlertTriangle size={18} />}
            />
            <MiniCard label="Cảnh báo" value={stat.warn} tone="warning" />
            <MiniCard label="An toàn" value={stat.safe} tone="success" />
          </div>

          {/* ------------------------- Bảng -------------------------- */}
          <ContentCard padded={false} className="overflow-hidden">
            <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border-light px-3 py-2">
              <SearchInput
                value={keyword}
                onChange={setKeyword}
                placeholder="Tìm theo mã, tên chỉ số, rủi ro"
                width={280}
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
                label="Rủi ro:"
                options={riskOptions}
                value={riskId}
                onChange={setRiskId}
                searchable
                width={260}
              />
              <span className="ml-auto text-[12px] text-text-secondary">
                {rows.length} / {kris.length} chỉ số
              </span>
            </div>

            {kris.length === 0 ? (
              <EmptyState
                icon={<IconActivityHeartbeat size={24} />}
                title="Chưa có chỉ số cảnh báo nào"
                description="Thêm chỉ số KRI để theo dõi diễn biến rủi ro theo từng kỳ."
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
                      Thêm chỉ số
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                getKey={(k) => k.id}
                stickyLast
                onRowClick={(k) => setHistory(k)}
                emptyTitle="Không có chỉ số phù hợp"
                emptyDescription="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá."
                rowClassName={(k) =>
                  k.status === "Vượt ngưỡng" ? "!bg-lv-critical-bg" : undefined
                }
              />
            )}
          </ContentCard>
        </div>
      </PageBody>

      {/* ========================= Hộp thoại ========================= */}
      <KriFormModal
        open={formOpen}
        record={editing}
        riskOptions={riskOptions}
        lk={lk}
        actor={user.name}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onDone={(msg, detail) => {
          setFormOpen(false);
          setEditing(null);
          toast.success(msg, detail);
        }}
      />

      <ReadingModal
        kri={reading}
        onClose={() => setReading(null)}
        onDone={(msg, detail) => {
          setReading(null);
          toast.success(msg, detail);
        }}
      />

      <HistoryModal
        kri={history}
        readings={history ? readingsOf(history.id) : []}
        riskLabel={
          history ? `${riskCode(history.riskId)} ${riskName(history.riskId)}` : ""
        }
        ownerName={history ? lk.employeeName(history.ownerId) : ""}
        onClose={() => setHistory(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            const ids = readings
              .filter((r) => r.kriId === deleting.id)
              .map((r) => r.id);
            kriReadingRepo.removeMany(ids);
            kriRepo.remove(deleting.id);
            toast.success(
              "Đã xoá chỉ số",
              `${deleting.code} và ${ids.length} kỳ đo liên quan đã bị xoá.`
            );
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá chỉ số cảnh báo"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b>? Toàn bộ kỳ đo của chỉ
            số này cũng sẽ bị xoá.
          </>
        }
        confirmText="Xoá"
      />
    </PageContainer>
  );
}

/* ================================================================== */

function MiniCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "brand" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    success: "bg-lv-low-bg text-lv-low-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
  };

  return (
    <ContentCard className="flex items-center gap-3">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
          style[tone]
        )}
      >
        {icon ?? <IconActivityHeartbeat size={18} />}
      </span>
      <div>
        <p className="text-[12px] text-text-secondary">{label}</p>
        <p className="text-[22px] leading-7 font-semibold text-text-primary">
          {value}
        </p>
      </div>
    </ContentCard>
  );
}

/* ================================================================== */
/* Hộp thoại thêm / sửa chỉ số                                        */
/* ================================================================== */

function KriFormModal({
  open,
  record,
  riskOptions,
  lk,
  actor,
  onClose,
  onDone,
}: {
  open: boolean;
  record: Kri | null;
  riskOptions: { value: string; label: string; description?: string }[];
  lk: ReturnType<typeof useLookups>;
  actor: string;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [form, setForm] = useState<KriFormState>(EMPTY_FORM);
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
              name: record.name,
              description: record.description,
              riskId: record.riskId,
              unitId: record.unitId,
              ownerId: record.ownerId,
              measureUnit: record.measureUnit,
              direction: record.direction,
              thresholdWarning: String(record.thresholdWarning),
              thresholdBreach: String(record.thresholdBreach),
              frequency: record.frequency,
              dataSource: record.dataSource,
              isActive: record.isActive,
            }
          : EMPTY_FORM
      );
    }
  }

  function patch(next: Partial<KriFormState>) {
    setForm((p) => ({ ...p, ...next }));
    const keys = Object.keys(next);
    setErrors((prev) => {
      const out = { ...prev };
      let changed = false;
      keys.forEach((k) => {
        if (out[k]) {
          delete out[k];
          changed = true;
        }
      });
      return changed ? out : prev;
    });
  }

  function save() {
    const payload = {
      name: form.name,
      description: form.description,
      riskId: form.riskId,
      unitId: form.unitId,
      ownerId: form.ownerId,
      measureUnit: form.measureUnit,
      direction: form.direction,
      thresholdWarning: Number(form.thresholdWarning),
      thresholdBreach: Number(form.thresholdBreach),
      frequency: form.frequency,
      dataSource: form.dataSource,
      currentValue: record?.currentValue ?? null,
      currentPeriod: record?.currentPeriod ?? "",
      status: record?.status ?? "An toàn",
      isActive: form.isActive,
    };

    if (form.thresholdWarning.trim() === "" || Number.isNaN(payload.thresholdWarning)) {
      setErrors((p) => ({ ...p, thresholdWarning: "Bắt buộc nhập ngưỡng cảnh báo" }));
      return;
    }
    if (form.thresholdBreach.trim() === "" || Number.isNaN(payload.thresholdBreach)) {
      setErrors((p) => ({ ...p, thresholdBreach: "Bắt buộc nhập ngưỡng vượt" }));
      return;
    }

    const parsed = kriFormSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    /* Tính lại trạng thái theo ngưỡng mới nếu đã có giá trị đo */
    const nextStatus =
      parsed.data.currentValue === null
        ? parsed.data.status
        : kriStatusOf(
            parsed.data.currentValue,
            parsed.data.thresholdWarning,
            parsed.data.thresholdBreach,
            parsed.data.direction
          );

    if (record) {
      kriRepo.update(record.id, { ...parsed.data, status: nextStatus });
      onDone(`Đã lưu ${record.code}`, "Thông tin chỉ số đã được cập nhật.");
    } else {
      const created = kriRepo.create(
        { ...parsed.data, status: nextStatus },
        actor
      );
      onDone(`Đã tạo ${created.code}`, "Chỉ số mới đã được thêm vào danh sách.");
    }
  }

  const hint =
    form.direction === "Càng cao càng xấu"
      ? "Ngưỡng vượt phải lớn hơn ngưỡng cảnh báo"
      : "Ngưỡng vượt phải nhỏ hơn ngưỡng cảnh báo";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={record ? `Sửa ${record.code}` : "Thêm chỉ số cảnh báo"}
      description="Chỉ số KRI phải gắn với một rủi ro trong sổ đăng ký"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={save}>
            {record ? "Lưu thay đổi" : "Thêm chỉ số"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input
          label="Tên chỉ số"
          required
          placeholder="Ví dụ: Tỷ lệ nợ phải thu quá hạn trên 90 ngày"
          value={form.name}
          error={errors.name}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <Textarea
          label="Mô tả cách đo"
          rows={2}
          maxLength={500}
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
        />

        <FormGrid cols={2}>
          <Select
            label="Rủi ro gắn kèm"
            required
            searchable
            placeholder="Chọn rủi ro"
            options={riskOptions}
            value={form.riskId || null}
            error={errors.riskId}
            onChange={(v) => patch({ riskId: v ?? "" })}
          />
          <Select
            label="Người theo dõi"
            required
            searchable
            placeholder="Chọn người theo dõi"
            options={lk.employeeOptions}
            value={form.ownerId || null}
            error={errors.ownerId}
            onChange={(v) => patch({ ownerId: v ?? "" })}
          />
          <Select
            label="Đơn vị"
            searchable
            clearable
            placeholder="Chọn đơn vị"
            options={lk.unitOptions}
            value={form.unitId || null}
            onChange={(v) => patch({ unitId: v ?? "" })}
          />
          <Select
            label="Tần suất đo"
            options={FREQUENCY_OPTIONS}
            value={form.frequency}
            onChange={(v) => patch({ frequency: v ?? "Hàng tháng" })}
          />
        </FormGrid>

        <FormGrid cols={3}>
          <Select
            label="Hướng đo"
            required
            options={DIRECTION_OPTIONS}
            value={form.direction}
            onChange={(v) => patch({ direction: v ?? "Càng cao càng xấu" })}
          />
          <Input
            label="Ngưỡng cảnh báo"
            required
            type="number"
            value={form.thresholdWarning}
            error={errors.thresholdWarning}
            onChange={(e) => patch({ thresholdWarning: e.target.value })}
          />
          <Input
            label="Ngưỡng vượt"
            required
            type="number"
            value={form.thresholdBreach}
            error={errors.thresholdBreach}
            hint={errors.thresholdBreach ? undefined : hint}
            onChange={(e) => patch({ thresholdBreach: e.target.value })}
          />
        </FormGrid>

        <FormGrid cols={2}>
          <Input
            label="Đơn vị tính"
            placeholder="Ví dụ: %, lượt, ngày"
            value={form.measureUnit}
            onChange={(e) => patch({ measureUnit: e.target.value })}
          />
          <Input
            label="Nguồn dữ liệu"
            placeholder="Hệ thống hoặc báo cáo cung cấp số liệu"
            value={form.dataSource}
            onChange={(e) => patch({ dataSource: e.target.value })}
          />
        </FormGrid>

        <div className="rounded-ctrl bg-surface-alt px-3 py-2.5">
          <Switch
            checked={form.isActive}
            onChange={(v) => patch({ isActive: v })}
            label="Đang theo dõi"
          />
        </div>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Hộp thoại ghi nhận giá trị kỳ                                       */
/* ================================================================== */

function ReadingModal({
  kri,
  onClose,
  onDone,
}: {
  kri: Kri | null;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [period, setPeriod] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(toInputDate(new Date()));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState("");

  const key = kri?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    if (kri) {
      setPeriod("");
      setValue("");
      setDate(toInputDate(new Date()));
      setNote("");
      setErrors({});
    }
  }

  const numeric = Number(value);
  const preview =
    kri && value.trim() !== "" && !Number.isNaN(numeric)
      ? kriStatusOf(
          numeric,
          kri.thresholdWarning,
          kri.thresholdBreach,
          kri.direction
        )
      : null;

  function submit() {
    if (!kri) return;
    const err: Record<string, string> = {};
    if (!period.trim()) err.period = "Bắt buộc nhập kỳ đo";
    if (value.trim() === "" || Number.isNaN(numeric))
      err.value = "Bắt buộc nhập giá trị đo dạng số";
    if (!date) err.date = "Bắt buộc nhập ngày ghi nhận";
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    const status = kriStatusOf(
      numeric,
      kri.thresholdWarning,
      kri.thresholdBreach,
      kri.direction
    );

    kriReadingRepo.create({
      kriId: kri.id,
      period: period.trim(),
      value: numeric,
      recordedDate: date,
      status,
      note: note.trim(),
    });

    kriRepo.update(kri.id, {
      currentValue: numeric,
      currentPeriod: period.trim(),
      status,
    });

    onDone(
      `Đã ghi nhận kỳ ${period.trim()}`,
      `${kri.code} chuyển sang trạng thái ${status}.`
    );
  }

  return (
    <Modal
      open={!!kri}
      onClose={onClose}
      size="md"
      title="Ghi nhận giá trị kỳ mới"
      description={kri ? `${kri.code} - ${kri.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={submit}>
            Ghi nhận
          </Button>
        </>
      }
    >
      {kri && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt p-2.5 text-[12px] text-text-secondary">
            <span>
              Hướng đo: <b className="text-text-primary">{kri.direction}</b>
            </span>
            <span className="text-lv-medium-text">
              Cảnh báo: {formatNumber(kri.thresholdWarning)} {kri.measureUnit}
            </span>
            <span className="text-lv-critical-text">
              Vượt: {formatNumber(kri.thresholdBreach)} {kri.measureUnit}
            </span>
          </div>

          <FormGrid cols={2}>
            <Input
              label="Kỳ đo"
              required
              placeholder="Ví dụ: Tháng 9/2026 hoặc Quý III/2026"
              value={period}
              error={errors.period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setErrors((p) => ({ ...p, period: "" }));
              }}
            />
            <Input
              label={`Giá trị đo ${kri.measureUnit ? `( ${kri.measureUnit})` : ""}`}
              required
              type="number"
              value={value}
              error={errors.value}
              onChange={(e) => {
                setValue(e.target.value);
                setErrors((p) => ({ ...p, value: "" }));
              }}
            />
          </FormGrid>

          <DateInput
            label="Ngày ghi nhận"
            required
            value={date}
            error={errors.date}
            onChange={setDate}
          />

          <Textarea
            label="Ghi chú"
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nguyên nhân biến động, sự kiện liên quan..."
          />

          {preview && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-ctrl border p-2.5 text-[12px]",
                preview === "Vượt ngưỡng"
                  ? "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text"
                  : preview === "Cảnh báo"
                    ? "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text"
                    : "border-lv-low-border bg-lv-low-bg text-lv-low-text"
              )}
            >
              <IconAlertTriangle size={16} className="shrink-0" />
              Với giá trị vừa nhập, chỉ số sẽ chuyển sang trạng thái{" "}
              <b>{preview}</b>.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/* Hộp thoại lịch sử kỳ đo                                        */
/* ================================================================== */

function HistoryModal({
  kri,
  readings,
  riskLabel,
  ownerName,
  onClose,
}: {
  kri: Kri | null;
  readings: KriReading[];
  riskLabel: string;
  ownerName: string;
  onClose: () => void;
}) {
  const maxValue = useMemo(
    () => readings.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0),
    [readings]
  );

  return (
    <Modal
      open={!!kri}
      onClose={onClose}
      size="lg"
      title={kri ? `${kri.code} - ${kri.name}` : ""}
      headerRight={
        kri ? (
          <Badge tone={STATUS_TONE[kri.status]} dot>
            {kri.status}
          </Badge>
        ) : undefined
      }
      footer={
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {kri && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-[12px] md:grid-cols-3">
            <Info label="Rủi ro gắn kèm" value={riskLabel} />
            <Info label="Người theo dõi" value={ownerName} />
            <Info label="Tần suất đo" value={kri.frequency} />
            <Info label="Hướng đo" value={kri.direction} />
            <Info
              label="Ngưỡng cảnh báo"
              value={`${formatNumber(kri.thresholdWarning)} ${kri.measureUnit}`}
            />
            <Info
              label="Ngưỡng vượt"
              value={`${formatNumber(kri.thresholdBreach)} ${kri.measureUnit}`}
            />
            <Info
              label="Nguồn dữ liệu"
              value={kri.dataSource || "--"}
              className="md:col-span-3"
            />
          </div>

          <div className="border-t border-border-light pt-3">
            <h3 className="mb-2 text-[14px] font-semibold text-text-primary">
              Lịch sử kỳ đo ({readings.length})
            </h3>

            {readings.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-text-hint">
                Chưa có kỳ đo nào được ghi nhận.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {readings.map((r) => {
                  const pct =
                    maxValue === 0
                      ? 0
                      : Math.max(6, (Math.abs(r.value) / maxValue) * 100);
                  const barColor =
                    r.status === "Vượt ngưỡng"
                      ? "bg-danger"
                      : r.status === "Cảnh báo"
                        ? "bg-warning"
                        : "bg-success";

                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2"
                    >
                      <span className="w-[120px] shrink-0 text-[12px] font-medium text-text-primary">
                        {r.period}
                      </span>

                      <span className="flex min-w-[160px] flex-1 items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
                          <span
                            className={cn("block h-full rounded-full", barColor)}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <b className="w-[90px] shrink-0 text-right text-[13px] text-text-primary">
                          {formatNumber(r.value)} {kri.measureUnit}
                        </b>
                      </span>

                      <Badge tone={STATUS_TONE[r.status]} dot>
                        {r.status}
                      </Badge>

                      <span className="w-[110px] shrink-0 text-right text-[11px] text-text-hint">
                        {formatDate(r.recordedDate)}
                      </span>

                      {r.note && (
                        <p className="w-full text-[12px] leading-4 text-text-secondary">
                          {r.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="text-text-secondary">{label}</span>
      <span className="text-[13px] text-text-primary">{value}</span>
    </div>
  );
}
