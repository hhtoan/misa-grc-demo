"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconBolt,
  IconBuildingBank,
  IconCloudUpload,
  IconDeviceFloppy,
  IconExternalLink,
  IconInfoCircle,
  IconLock,
  IconPlus,
  IconShieldCheck,
  IconTool,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  DateInput,
  EmptyState,
  FormGrid,
  FormSection,
  Input,
  MoneyInput,
  RiskBadge,
  Select,
  StatusBadge,
  Textarea,
  Tooltip,
  useToast,
} from "@/components/ui";
import {
  ContentCard,
  FooterActionBar,
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
  emptyKppnForm,
  expectedProgress,
  isKppnEditable,
  kppnToForm,
  kppnWarnings,
  validateKppnForm,
  type KppnFormValue,
} from "@/lib/domain/kppn-utils";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import type { Kppn } from "@/lib/domain/schema";
import { formatDate, formatDateTime } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const TYPE_OPTIONS = KPPN_TYPES.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Khắc phục"
      ? "Xử lý hậu quả và sửa lỗi đang tồn tại"
      : "Ngăn không cho vấn đề tái diễn trong tương lai",
}));

const SYSTEM_OPTIONS = EXECUTION_SYSTEMS.map((v) => ({
  value: v,
  label: v,
  description:
    v === "AMIS Công việc"
      ? "Dành cho bộ phận chung, đồng bộ 2 chiều với GRC"
      : v === "JIRA"
        ? "Dành cho khối IT và Sản xuất, đồng bộ 2 chiều với GRC"
        : "Người thực hiện tự cập nhật tiến độ ngay trong GRC",
}));

export type KppnFormMode = "create" | "edit";

export interface KppnFormPreset {
  deficiency?: string;
  risk?: string;
  event?: string;
}

/* ================================================================== */
/* Wrapper: tìm bản ghi rồi phân nhánh                                 */
/* ================================================================== */

export default function KppnFormScreen({
  mode,
  code,
  preset,
}: {
  mode: KppnFormMode;
  code?: string;
  preset?: KppnFormPreset;
}) {
  const router = useRouter();
  const kppns = useCollection(kppnRepo);

  const record = useMemo(
    () =>
      mode === "edit" && code
        ? kppns.find((k) => k.code === code || k.id === code)
        : undefined,
    [mode, code, kppns],
  );

  if (mode === "edit" && !record) {
    return (
      <PageContainer>
        <PageHeader title="Sửa hành động" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy hành động"
              description={`Không có bản ghi nào ứng với mã ${code ?? ""}. Có thể bản ghi đã bị xoá.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/khac-phuc/kppn")}
                >
                  Về bảng theo dõi KPPN
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  if (mode === "edit" && record && !isKppnEditable(record.status)) {
    return (
      <PageContainer>
        <PageHeader title={`Sửa ${record.code}`} showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconAlertTriangle size={24} />}
              title={`Hành động đang ở trạng thái ${record.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung. Hãy chuyển trạng thái về mức cho phép sửa trước khi cập nhật."
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push(`/khac-phuc/kppn/${record.code}`)}
                >
                  Xem chi tiết
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return (
    <KppnFormContent mode={mode} record={record ?? null} preset={preset} />
  );
}

/* ================================================================== */
/* Content                                        */
/* ================================================================== */

function KppnFormContent({
  mode,
  record,
  preset,
}: {
  mode: KppnFormMode;
  record: Kppn | null;
  preset?: KppnFormPreset;
}) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();

  const deficiencies = useCollection(deficiencyRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);

  const [form, setForm] = useState<KppnFormValue>(() => emptyKppnForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const loadedFor = useRef<string>("");

  /* ------------- Nạp dữ liệu khi sửa hoặc có preset ------------- */

  useEffect(() => {
    if (mode === "edit") {
      if (!record) return;
      if (loadedFor.current === record.id) return;
      loadedFor.current = record.id;
      setForm(kppnToForm(record));
      setDirty(false);
      setErrors({});
      return;
    }

    /* Chế độ tạo mới: nạp preset đúng một lần */
    if (loadedFor.current === "create") return;
    loadedFor.current = "create";

    const d = preset?.deficiency
      ? deficiencies.find(
          (x) => x.code === preset.deficiency || x.id === preset.deficiency,
        )
      : undefined;
    const r = preset?.risk
      ? risks.find((x) => x.code === preset.risk || x.id === preset.risk)
      : undefined;
    const e = preset?.event
      ? events.find((x) => x.code === preset.event || x.id === preset.event)
      : undefined;

    if (!d && !r && !e) return;

    setForm(
      emptyKppnForm({
        deficiencyId: d?.id ?? "",
        riskId: d?.riskId || r?.id || "",
        eventId: d?.eventId || e?.id || "",
        unitId: d?.unitId ?? e?.unitId ?? r?.unitId ?? "",
        assigneeId: d?.ownerId ?? "",
        name: d ? `Khắc phục điểm yếu ${d.code}` : "",
        description: d?.rootCause ?? "",
        dueDate: d?.dueDate || emptyKppnForm().dueDate,
        type: e ? "Khắc phục" : "Khắc phục",
      }),
    );
  }, [mode, record, preset, deficiencies, risks, events]);

  /* Cảnh báo khi đóng tab lúc còn thay đổi chưa lưu */
  useEffect(() => {
    if (!dirty) return;
    function handler(ev: BeforeUnloadEvent) {
      ev.preventDefault();
      ev.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* --------------------------- Tiện ích -------------------------- */

  function patch(next: Partial<KppnFormValue>) {
    setForm((prev) => ({ ...prev, ...next }));
    setDirty(true);
    const keys = Object.keys(next);
    if (keys.length === 0) return;
    setErrors((prev) => {
      let changed = false;
      const out = { ...prev };
      keys.forEach((k) => {
        if (out[k]) {
          delete out[k];
          changed = true;
        }
      });
      return changed ? out : prev;
    });
  }

  const warnings = useMemo(() => kppnWarnings(form), [form]);

  const deficiencyOptions = useMemo(
    () =>
      deficiencies.map((d) => ({
        value: d.id,
        label: d.name,
        description: `${d.code} - mức ${d.severity} - ${d.status}`,
      })),
    [deficiencies],
  );

  const riskOptions = useMemo(
    () =>
      risks.map((r) => ({
        value: r.id,
        label: r.name,
        description: `${r.code} - mức còn lại ${residualLevelOf(r)}`,
      })),
    [risks],
  );

  const eventOptions = useMemo(
    () =>
      events.map((e) => ({
        value: e.id,
        label: e.name,
        description: `${e.code} - ${e.severity} - ${e.status}`,
      })),
    [events],
  );

  const selectedDeficiency = deficiencies.find(
    (d) => d.id === form.deficiencyId,
  );
  const selectedRisk = risks.find((r) => r.id === form.riskId);
  const selectedEvent = events.find((e) => e.id === form.eventId);

  const hasSource = !!form.deficiencyId || !!form.riskId || !!form.eventId;

  /** Giao ra ngoài thì tiến độ do hệ thống nguồn cập nhật, không sửa tay */
  const externalExecution = form.executionSystem !== "Theo dõi trong GRC";
  const progressLocked = externalExecution && !!form.externalTaskCode;

  const expect = expectedProgress({
    startDate: form.startDate,
    dueDate: form.dueDate,
  } as Kppn);

  /* ---------------------- Thao tác thông minh -------------------- */

  /** Chọn điểm yếu thì kế thừa đơn vị, người phụ trách, hạn và mô tả */
  function changeDeficiency(id: string) {
    const d = deficiencies.find((x) => x.id === id);
    if (!d) {
      patch({ deficiencyId: "" });
      return;
    }
    patch({
      deficiencyId: id,
      riskId: form.riskId || d.riskId,
      eventId: form.eventId || d.eventId,
      unitId: form.unitId || d.unitId,
      assigneeId: form.assigneeId || d.ownerId,
      name: form.name || `Khắc phục điểm yếu ${d.code}`,
      description: form.description || d.rootCause,
      dueDate: d.dueDate || form.dueDate,
    });
    if (d.dueDate) {
      toast.info(
        "Đã lấy hạn theo điểm yếu",
        `Hạn hoàn thành được đặt theo hạn khắc phục của ${d.code} là ${formatDate(d.dueDate)}.`,
      );
    }
  }

  /** Đổi hệ thống thực thi thì nhắc quy tắc điều phối */
  function changeSystem(v: string) {
    const system = (v ?? "AMIS Công việc") as KppnFormValue["executionSystem"];
    patch({ executionSystem: system });
    if (system === "Theo dõi trong GRC") {
      toast.info(
        "Theo dõi trực tiếp trong GRC",
        "Hành động sẽ không được tạo việc trên hệ thống ngoài, người thực hiện phải tự cập nhật tiến độ tại đây.",
      );
    }
  }

  /* ---------------------------- Lưu ------------------------------ */

  function scrollToFirstError(errs: Record<string, string>) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    document
      .querySelector(`[data-field="${first}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function save(options: { thenSubmit?: boolean } = {}) {
    const result = validateKppnForm(form);

    if (!result.ok || !result.data) {
      setErrors(result.errors);
      toast.error(
        "Chưa lưu được",
        `Còn ${Object.keys(result.errors).length} trường chưa hợp lệ, vui lòng kiểm tra lại.`,
      );
      setTimeout(() => scrollToFirstError(result.errors), 0);
      return;
    }

    const data: KppnFormValue = options.thenSubmit
      ? { ...result.data, status: "Chờ duyệt" }
      : result.data;

    setSaving(true);
    try {
      if (mode === "create") {
        const created = kppnRepo.create(data, user.name);
        setDirty(false);
        toast.success(
          `Đã tạo ${created.code}`,
          options.thenSubmit
            ? "Hành động đã được trình duyệt, chờ Ban QTRR phê duyệt và giao việc."
            : `Hành động được lưu ở trạng thái ${data.status}.`,
        );
        router.replace(`/khac-phuc/kppn/${created.code}`);
        return;
      }

      if (record) {
        kppnRepo.update(record.id, data);
        setDirty(false);
        toast.success(
          `Đã lưu ${record.code}`,
          options.thenSubmit
            ? "Hành động đã được trình duyệt."
            : "Thông tin hành động đã được cập nhật.",
        );
        router.replace(`/khac-phuc/kppn/${record.code}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (mode === "edit" && record) {
      router.push(`/khac-phuc/kppn/${record.code}`);
      return;
    }
    if (preset?.deficiency) {
      router.push(`/khac-phuc/diem-yeu/${preset.deficiency}`);
      return;
    }
    router.push("/khac-phuc/kppn");
  }

  function handleCancel() {
    if (dirty) {
      setLeaving(true);
      return;
    }
    goBack();
  }

  /* ------------------------------ Render ------------------------- */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={handleCancel}
        title={
          mode === "create"
            ? "Thêm hành động khắc phục & phòng ngừa"
            : `Sửa ${record?.code}`
        }
        subtitle={
          mode === "create"
            ? "GRC điều phối, việc thực thi được giao sang AMIS Công việc hoặc JIRA"
            : record?.name
        }
        badge={
          dirty ? (
            <Badge tone="warning" dot>
              Có thay đổi chưa lưu
            </Badge>
          ) : undefined
        }
      />

      <PageBody className="pb-2">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
          {/* ============ Nguồn được truyền từ màn hình khác ======== */}
          {mode === "create" && selectedDeficiency && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-info-border bg-lv-info-bg px-3 py-2.5 text-[12px] leading-4 text-lv-info-text">
              <IconInfoCircle size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Đang lập hành động cho điểm yếu <b>{selectedDeficiency.code}</b>{" "}
                - {selectedDeficiency.name}. Đơn vị, người thực hiện và hạn hoàn
                thành đã được kế thừa tự động, anh có thể chỉnh lại nếu cần.
              </span>
              <RiskBadge level={selectedDeficiency.severity} />
            </div>
          )}

          {/* ================= Cảnh báo nghiệp vụ ================= */}
          {warnings.length > 0 && (
            <div className="rounded-card border border-lv-medium-border bg-lv-medium-bg p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-medium-text">
                <IconAlertTriangle size={16} />
                Lưu ý nghiệp vụ ({warnings.length})
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 pl-6">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="list-disc text-[12px] leading-4 text-lv-medium-text"
                  >
                    {w}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 pl-6 text-[11px] text-lv-medium-text opacity-80">
                Các lưu ý này không chặn lưu, chỉ nhắc để bạn kiểm tra lại.
              </p>
            </div>
          )}

          {/* ================= 1. Thông tin chung ================= */}
          <ContentCard>
            <FormSection
              title="Thông tin chung"
              description="Mô tả biện pháp sẽ triển khai và loại hành động"
            >
              <div data-field="name">
                <Input
                  label="Tên hành động"
                  required
                  placeholder="Ví dụ: Tích hợp cảnh báo sao lưu thất bại vào hệ thống giám sát tập trung"
                  value={form.name}
                  error={errors.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <Textarea
                label="Mô tả nội dung thực hiện"
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Các bước cụ thể sẽ làm, phạm vi áp dụng, kết quả mong đợi"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
              />

              <FormGrid cols={3}>
                <div data-field="type">
                  <Select
                    label="Loại hành động"
                    required
                    options={TYPE_OPTIONS}
                    value={form.type}
                    error={errors.type}
                    onChange={(v) =>
                      patch({
                        type: (v ?? "Khắc phục") as KppnFormValue["type"],
                      })
                    }
                  />
                </div>
                <div data-field="unitId">
                  <Select
                    label="Đơn vị thực hiện"
                    required
                    searchable
                    placeholder="Chọn đơn vị"
                    options={lk.unitOptions}
                    value={form.unitId || null}
                    error={errors.unitId}
                    onChange={(v) => patch({ unitId: v ?? "" })}
                  />
                </div>
                <div data-field="estimatedCost">
                  <MoneyInput
                    label="Chi phí ước tính"
                    value={form.estimatedCost}
                    onChange={(v) => patch({ estimatedCost: v })}
                    hint="Để trống nếu không phát sinh chi phí"
                  />
                </div>
              </FormGrid>
            </FormSection>
          </ContentCard>

          {/* ================ 2. Nguồn phát sinh ================== */}
          <ContentCard>
            <FormSection
              title="Nguồn phát sinh"
              description="Hành động phải gắn với ít nhất 1 nguồn: điểm yếu, rủi ro hoặc sự kiện"
            >
              <div data-field="deficiencyId">
                <Select
                  label="Điểm yếu kiểm soát"
                  searchable
                  clearable
                  placeholder="Chọn điểm yếu cần khắc phục"
                  options={deficiencyOptions}
                  value={form.deficiencyId || null}
                  error={errors.deficiencyId}
                  hint={
                    errors.deficiencyId
                      ? undefined
                      : "Chọn điểm yếu sẽ tự kế thừa đơn vị, người thực hiện và hạn khắc phục"
                  }
                  onChange={(v) => changeDeficiency(v ?? "")}
                />
              </div>

              <FormGrid cols={2}>
                <Select
                  label="Rủi ro liên quan"
                  searchable
                  clearable
                  placeholder="Chọn rủi ro cần giảm thiểu"
                  options={riskOptions}
                  value={form.riskId || null}
                  onChange={(v) => patch({ riskId: v ?? "" })}
                />
                <Select
                  label="Sự kiện liên quan"
                  searchable
                  clearable
                  placeholder="Chọn sự kiện cần khắc phục hậu quả"
                  options={eventOptions}
                  value={form.eventId || null}
                  onChange={(v) => patch({ eventId: v ?? "" })}
                />
              </FormGrid>

              {/* Tóm tắt nguồn đã gắn */}
              {hasSource ? (
                <div className="flex flex-col gap-1.5 rounded-ctrl bg-surface-alt p-3">
                  <p className="text-[12px] font-medium text-text-secondary">
                    Nguồn đã gắn
                  </p>
                  {selectedDeficiency && (
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-primary">
                      <IconTool size={14} className="text-lv-medium-text" />
                      Điểm yếu{" "}
                      <b className="text-brand">
                        {selectedDeficiency.code}
                      </b>{" "}
                      {selectedDeficiency.name}
                      <RiskBadge level={selectedDeficiency.severity} />
                      <StatusBadge status={selectedDeficiency.status} />
                    </p>
                  )}
                  {selectedRisk && (
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-primary">
                      <IconShieldCheck size={14} className="text-brand" />
                      Rủi ro <b className="text-brand">
                        {selectedRisk.code}
                      </b>{" "}
                      {selectedRisk.name}
                      <RiskBadge
                        level={residualLevelOf(selectedRisk)}
                        score={residualScoreOf(selectedRisk)}
                      />
                    </p>
                  )}
                  {selectedEvent && (
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-primary">
                      <IconBolt size={14} className="text-lv-high-text" />
                      Sự kiện <b className="text-brand">
                        {selectedEvent.code}
                      </b>{" "}
                      {selectedEvent.name}
                      <RiskBadge level={selectedEvent.severity} />
                    </p>
                  )}
                </div>
              ) : (
                <p
                  className={cn(
                    "rounded-ctrl border border-dashed px-3 py-4 text-center text-[13px]",
                    errors.deficiencyId
                      ? "border-danger text-danger"
                      : "border-border-neutral text-text-hint",
                  )}
                >
                  Chưa gắn nguồn nào. Hành động phải gắn ít nhất 1 điểm yếu, rủi
                  ro hoặc sự kiện mới lưu được.
                </p>
              )}
            </FormSection>
          </ContentCard>

          {/* ============ 3. Phân công và thực thi ================ */}
          <ContentCard>
            <FormSection
              title="Phân công và hệ thống thực thi"
              description="GRC chỉ điều phối, việc thực thi nằm ở hệ thống nguồn nơi người thực hiện làm việc hằng ngày"
            >
              <FormGrid cols={2}>
                <div data-field="assigneeId">
                  <Select
                    label="Người thực hiện"
                    required
                    searchable
                    placeholder="Chọn người trực tiếp làm"
                    options={lk.employeeOptions}
                    value={form.assigneeId || null}
                    error={errors.assigneeId}
                    onChange={(v) => patch({ assigneeId: v ?? "" })}
                  />
                </div>
                <Select
                  label="Người giám sát"
                  searchable
                  clearable
                  placeholder="Chọn người nghiệm thu kết quả"
                  options={lk.employeeOptions}
                  value={form.supervisorId || null}
                  hint="Người này sẽ nghiệm thu khi hành động báo hoàn thành"
                  onChange={(v) => patch({ supervisorId: v ?? "" })}
                />
              </FormGrid>

              <div data-field="executionSystem">
                <Select
                  label="Hệ thống thực thi"
                  required
                  options={SYSTEM_OPTIONS}
                  value={form.executionSystem}
                  error={errors.executionSystem}
                  onChange={(v) => changeSystem(v ?? "AMIS Công việc")}
                />
              </div>

              {/* Trạng thái giao việc */}
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-ctrl border px-3 py-2.5 text-[12px] leading-4",
                  form.externalTaskCode
                    ? "border-lv-low-border bg-lv-low-bg text-lv-low-text"
                    : externalExecution
                      ? "border-lv-info-border bg-lv-info-bg text-lv-info-text"
                      : "border-border-light bg-surface-alt text-text-secondary",
                )}
              >
                <IconCloudUpload size={16} className="shrink-0" />
                {form.externalTaskCode ? (
                  <>
                    <span className="min-w-0 flex-1">
                      Đã tạo việc <b>{form.externalTaskCode}</b> trên{" "}
                      {form.executionSystem}
                      {form.lastSyncedAt
                        ? `, đồng bộ gần nhất ${formatDateTime(form.lastSyncedAt)}`
                        : ""}
                      .
                    </span>
                    {form.externalUrl && (
                      <Button
                        variant="secondary"
                        size="sm"
                        compact
                        icon={<IconExternalLink size={14} />}
                        onClick={() => window.open(form.externalUrl, "_blank")}
                      >
                        Mở
                      </Button>
                    )}
                  </>
                ) : externalExecution ? (
                  <span className="min-w-0 flex-1">
                    Chưa tạo việc trên {form.executionSystem}. Việc giao sẽ được
                    thực hiện sau khi hành động được phê duyệt, tại màn hình chi
                    tiết hoặc bảng theo dõi.
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">
                    Hành động theo dõi trực tiếp trong GRC, không tạo việc trên
                    hệ thống ngoài.
                  </span>
                )}
              </div>
            </FormSection>
          </ContentCard>

          {/* ============ 4. Thời gian và tiến độ ================= */}
          <ContentCard>
            <FormSection
              title="Thời gian và tiến độ"
              description="Mốc thời gian dùng để tính tiến độ kỳ vọng và cảnh báo chậm trễ"
            >
              <FormGrid cols={2}>
                <div data-field="startDate">
                  <DateInput
                    label="Ngày bắt đầu"
                    required
                    value={form.startDate}
                    error={errors.startDate}
                    onChange={(v) => patch({ startDate: v })}
                  />
                </div>
                <div data-field="dueDate">
                  <DateInput
                    label="Hạn hoàn thành"
                    required
                    value={form.dueDate}
                    min={form.startDate || undefined}
                    error={errors.dueDate}
                    hint={
                      errors.dueDate
                        ? undefined
                        : selectedDeficiency?.dueDate
                          ? `Hạn khắc phục của điểm yếu là ${formatDate(selectedDeficiency.dueDate)}`
                          : undefined
                    }
                    onChange={(v) => patch({ dueDate: v })}
                  />
                </div>
              </FormGrid>

              {/* Cảnh báo hạn vượt hạn của điểm yếu */}
              {selectedDeficiency?.dueDate &&
                form.dueDate > selectedDeficiency.dueDate && (
                  <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                    <IconAlertTriangle size={16} className="mt-px shrink-0" />
                    <span>
                      Hạn hoàn thành đang muộn hơn hạn khắc phục của điểm yếu{" "}
                      <b>{selectedDeficiency.code}</b> (
                      {formatDate(selectedDeficiency.dueDate)}). Điểm yếu sẽ bị
                      tính quá hạn trước khi hành động này kết thúc.
                    </span>
                  </div>
                )}

              <div data-field="progress" className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                  Tiến độ thực hiện
                  {progressLocked && (
                    <Tooltip content="Tiến độ do hệ thống nguồn cập nhật qua đồng bộ 2 chiều">
                      <IconLock size={14} className="text-icon-neutral" />
                    </Tooltip>
                  )}
                </span>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={form.progress}
                    disabled={progressLocked}
                    onChange={(e) =>
                      patch({ progress: Number(e.target.value) })
                    }
                    className={cn(
                      "h-1.5 min-w-[220px] flex-1 cursor-pointer appearance-none rounded-full bg-[#F0F0F0] accent-[#245FDF]",
                      progressLocked && "cursor-not-allowed opacity-60",
                    )}
                  />
                  <span className="w-[52px] shrink-0 text-right text-[15px] font-semibold text-text-primary">
                    {form.progress}%
                  </span>
                  <span className="text-[12px] text-text-secondary">
                    Kỳ vọng theo thời gian:{" "}
                    <b
                      className={cn(
                        expect - form.progress >= 20
                          ? "text-lv-medium-text"
                          : "text-text-primary",
                      )}
                    >
                      {expect}%
                    </b>
                  </span>
                </div>

                {errors.progress && (
                  <p className="text-[12px] text-danger">{errors.progress}</p>
                )}

                <p className="text-[11px] text-text-hint">
                  {progressLocked
                    ? `Tiến độ được đồng bộ từ ${form.executionSystem}, không sửa trực tiếp trong GRC.`
                    : "Kéo thanh để cập nhật tiến độ. Sau khi giao việc sang hệ thống nguồn, tiến độ sẽ tự đồng bộ."}
                </p>
              </div>
            </FormSection>
          </ContentCard>

          {/* ============ 5. Hồ sơ nghiệm thu (chỉ đọc) =========== */}
          {mode === "edit" && record && record.status === "Chờ nghiệm thu" && (
            <ContentCard>
              <FormSection
                title="Hồ sơ nghiệm thu"
                description="Kết quả và bằng chứng được nhập khi nghiệm thu tại màn hình chi tiết"
              >
                <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                  <IconInfoCircle size={16} className="mt-px shrink-0" />
                  <span>
                    Hành động đang chờ nghiệm thu. Người giám sát{" "}
                    <b>
                      {lk.employeeName(form.supervisorId, "chưa được chỉ định")}
                    </b>{" "}
                    sẽ nhập kết quả và bằng chứng khi bấm nghiệm thu ở màn hình
                    chi tiết.
                  </span>
                </div>
              </FormSection>
            </ContentCard>
          )}

          {mode === "edit" && record && (
            <p className="pb-1 text-center text-[12px] text-text-hint">
              Trạng thái hiện tại: <b>{record.status}</b>. Việc chuyển trạng
              thái và nghiệm thu thực hiện ở màn hình chi tiết.
            </p>
          )}
        </div>
      </PageBody>

      {/* ===================== Thanh hành động ===================== */}
      <FooterActionBar
        left={
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <Badge tone={form.type === "Khắc phục" ? "info" : "neutral"} dot>
              {form.type}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <IconBuildingBank size={14} />
              {form.executionSystem}
            </span>
            {form.dueDate && (
              <span>
                Hạn:{" "}
                <b className="text-text-primary">{formatDate(form.dueDate)}</b>
              </span>
            )}
            {warnings.length > 0 && (
              <span className="text-lv-medium-text">
                {warnings.length} lưu ý nghiệp vụ
              </span>
            )}
          </span>
        }
      >
        <Button variant="text" onClick={handleCancel} disabled={saving}>
          Huỷ bỏ
        </Button>
        {form.status === "Nháp" && (
          <Button
            variant="secondary"
            icon={<IconArrowNarrowRight size={16} />}
            loading={saving}
            onClick={() => save({ thenSubmit: true })}
          >
            Lưu và trình duyệt
          </Button>
        )}
        <Button
          variant="primary"
          icon={
            mode === "create" ? (
              <IconPlus size={16} />
            ) : (
              <IconDeviceFloppy size={16} />
            )
          }
          loading={saving}
          onClick={() => save()}
        >
          {mode === "create" ? "Thêm hành động" : "Lưu thay đổi"}
        </Button>
      </FooterActionBar>

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          setDirty(false);
          goBack();
        }}
        title="Rời khỏi trang"
        message="Bạn có thay đổi chưa được lưu. Rời khỏi trang bây giờ sẽ mất toàn bộ thay đổi. Tiếp tục?"
        confirmText="Rời đi"
        cancelText="Ở lại"
      />
    </PageContainer>
  );
}
