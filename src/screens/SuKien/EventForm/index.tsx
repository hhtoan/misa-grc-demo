"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCoin,
  IconDeviceFloppy,
  IconInfoCircle,
  IconLock,
  IconPlus,
  IconRadar,
  IconShieldCheck,
  IconTool,
  IconX,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
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
  controlRepo,
  deficiencyRepo,
  eventRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { EVENT_IMPACT_TYPES, RISK_LEVELS } from "@/lib/domain/enums";
import {
  detectionLag,
  emptyEventForm,
  eventToForm,
  eventWarnings,
  isEventEditable,
  netLoss,
  recoveryRate,
  suggestSeverity,
  validateEventForm,
  type EventFormValue,
} from "@/lib/domain/event-utils";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import type { GrcEvent } from "@/lib/domain/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

type ImpactType = EventFormValue["impactTypes"][number];

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const SEVERITY_OPTIONS = RISK_LEVELS.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Trọng yếu"
      ? "Tổn thất từ 1 tỷ trở lên hoặc ảnh hưởng nghiêm trọng tới uy tín"
      : v === "Cao"
        ? "Tổn thất từ 300 triệu, bắt buộc liên kết rủi ro"
        : v === "Trung bình"
          ? "Tổn thất từ 50 triệu hoặc gián đoạn cục bộ"
          : "Ảnh hưởng nhỏ, xử lý trong nội bộ đơn vị",
}));

const IMPACT_HINT: Record<ImpactType, string> = {
  "Tài chính": "Phát sinh mất mát tiền hoặc tài sản đo đếm được",
  "Uy tín": "Ảnh hưởng hình ảnh, niềm tin của khách hàng và đối tác",
  "Pháp lý": "Vi phạm quy định pháp luật, hợp đồng hoặc quy chế nội bộ",
  "Vận hành": "Gián đoạn quy trình, dịch vụ hoặc hệ thống",
  "An toàn thông tin": "Rò rỉ, mất mát hoặc truy cập trái phép dữ liệu",
  "Con người": "Ảnh hưởng tới an toàn, sức khoẻ hoặc quan hệ lao động",
};

export type EventFormMode = "create" | "edit";

/* ================================================================== */
/* Wrapper: tìm bản ghi rồi phân nhánh                                 */
/* ================================================================== */

export default function EventFormScreen({
  mode,
  code,
}: {
  mode: EventFormMode;
  code?: string;
}) {
  const router = useRouter();
  const events = useCollection(eventRepo);

  const record = useMemo(
    () =>
      mode === "edit" && code
        ? events.find((e) => e.code === code || e.id === code)
        : undefined,
    [mode, code, events],
  );

  if (mode === "edit" && !record) {
    return (
      <PageContainer>
        <PageHeader title="Sửa sự kiện" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy sự kiện"
              description={`Không có bản ghi nào ứng với mã ${code ?? ""}. Có thể bản ghi đã bị xoá.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/su-kien/so-theo-doi")}
                >
                  Về sổ theo dõi sự kiện
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  if (mode === "edit" && record && !isEventEditable(record.status)) {
    return (
      <PageContainer>
        <PageHeader title={`Sửa ${record.code}`} showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconAlertTriangle size={24} />}
              title={`Sự kiện đang ở trạng thái ${record.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung. Hãy mở lại sự kiện trước khi cập nhật."
              action={
                <Button
                  variant="primary"
                  onClick={() =>
                    router.push(`/su-kien/so-theo-doi/${record.code}`)
                  }
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

  return <EventFormContent mode={mode} record={record ?? null} />;
}

/* ================================================================== */
/* Content                                        */
/* ================================================================== */

function EventFormContent({
  mode,
  record,
}: {
  mode: EventFormMode;
  record: GrcEvent | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const risks = useCollection(riskRepo);
  const controls = useCollection(controlRepo);
  const deficiencies = useCollection(deficiencyRepo);

  const canMarkConfidential = hasRole("admin", "qtrr");

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );

  const [form, setForm] = useState<EventFormValue>(() =>
    emptyEventForm({ reporterId: currentEmployee?.id ?? "" }),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const loadedFor = useRef<string>("");

  /* Nạp dữ liệu một lần khi mở trang sửa */
  useEffect(() => {
    if (mode !== "edit" || !record) return;
    if (loadedFor.current === record.id) return;
    loadedFor.current = record.id;
    setForm(eventToForm(record));
    setDirty(false);
    setErrors({});
  }, [mode, record]);

  /* Gợi ý người báo cáo là chính người đang đăng nhập */
  useEffect(() => {
    if (mode !== "create") return;
    if (loadedFor.current === "create") return;
    if (!currentEmployee) return;
    loadedFor.current = "create";
    setForm((p) => ({ ...p, reporterId: p.reporterId || currentEmployee.id }));
  }, [mode, currentEmployee]);

  /* Cảnh báo khi đóng tab lúc còn thay đổi chưa lưu */
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* --------------------------- Tiện ích -------------------------- */

  function patch(next: Partial<EventFormValue>) {
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

  const warnings = useMemo(() => eventWarnings(form), [form]);

  const lag = useMemo(
    () =>
      detectionLag({
        occurredDate: form.occurredDate,
        detectedDate: form.detectedDate,
      } as GrcEvent),
    [form.occurredDate, form.detectedDate],
  );

  const hasFinancial = form.impactTypes.includes("Tài chính");

  const net = netLoss({
    actualLoss: form.actualLoss,
    recoveredAmount: form.recoveredAmount,
  } as GrcEvent);

  const rate = recoveryRate({
    actualLoss: form.actualLoss,
    recoveredAmount: form.recoveredAmount,
  } as GrcEvent);

  const suggested = suggestSeverity(form.actualLoss, form.isNearMiss);

  /* --------------------- Danh sách lựa chọn ---------------------- */

  const riskOptions = useMemo(
    () =>
      risks
        .filter((r) => !form.relatedRiskIds.includes(r.id))
        .map((r) => ({
          value: r.id,
          label: r.name,
          description: `${r.code} - mức còn lại ${residualLevelOf(r)}`,
        })),
    [risks, form.relatedRiskIds],
  );

  const controlOptions = useMemo(
    () =>
      controls
        .filter((c) => !form.relatedControlIds.includes(c.id))
        .map((c) => ({
          value: c.id,
          label: c.name,
          description: `${c.code} - ${c.type} - ${c.status}`,
        })),
    [controls, form.relatedControlIds],
  );

  const deficiencyOptions = useMemo(
    () =>
      deficiencies
        .filter((d) => !form.deficiencyIds.includes(d.id))
        .map((d) => ({
          value: d.id,
          label: d.name,
          description: `${d.code} - mức ${d.severity} - ${d.status}`,
        })),
    [deficiencies, form.deficiencyIds],
  );

  /** Kiểm soát gợi ý theo các rủi ro đã chọn */
  const suggestedControls = useMemo(() => {
    if (form.relatedRiskIds.length === 0) return [];
    return controls.filter(
      (c) =>
        !form.relatedControlIds.includes(c.id) &&
        c.riskIds.some((id) => form.relatedRiskIds.includes(id)),
    );
  }, [controls, form.relatedRiskIds, form.relatedControlIds]);

  /* ---------------------- Thao tác thông minh -------------------- */

  function toggleImpact(v: ImpactType) {
    const next: ImpactType[] = form.impactTypes.includes(v)
      ? form.impactTypes.filter((x) => x !== v)
      : [...form.impactTypes, v];
    patch({ impactTypes: next });
  }

  /** Bật near miss thì xoá toàn bộ số tổn thất */
  function toggleNearMiss(checked: boolean) {
    if (checked) {
      patch({
        isNearMiss: true,
        actualLoss: null,
        recoveredAmount: null,
      });
      toast.info(
        "Sự kiện suýt xảy ra",
        "Tổn thất thực tế và số thu hồi được xoá vì chưa phát sinh mất mát. Vẫn nên nhập tổn thất ước tính nếu sự kiện đã xảy ra.",
      );
      return;
    }
    patch({ isNearMiss: false });
  }

  /** Nhập tổn thất thực tế thì gợi ý lại mức nghiêm trọng */
  function changeActualLoss(v: number | null) {
    patch({ actualLoss: v });
    if (v === null || v <= 0 || form.isNearMiss) return;
    const s = suggestSeverity(v, false);
    if (s !== form.severity) {
      toast.info(
        "Gợi ý mức nghiêm trọng",
        `Với tổn thất ${formatMoney(v)} VNĐ, mức gợi ý là ${s}. Bạn có thể giữ nguyên nếu có căn cứ khác.`,
      );
    }
  }

  function addTo(field: keyof EventFormValue, id: string) {
    const list = form[field] as string[];
    if (!id || list.includes(id)) return;
    patch({ [field]: [...list, id] } as Partial<EventFormValue>);
  }

  function removeFrom(field: keyof EventFormValue, id: string) {
    const list = form[field] as string[];
    patch({ [field]: list.filter((x) => x !== id) } as Partial<EventFormValue>);
  }

  /* ---------------------------- Lưu ------------------------------ */

  function scrollToFirstError(errs: Record<string, string>) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    document
      .querySelector(`[data-field="${first}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** Các rule chặn riêng của sự kiện, kiểm tra trước khi gọi schema */
  function localErrors(): Record<string, string> {
    const err: Record<string, string> = {};

    if (
      form.detectedDate &&
      form.occurredDate &&
      form.detectedDate < form.occurredDate
    )
      err.detectedDate = "Ngày phát hiện không được trước ngày xảy ra";

    if (form.impactTypes.length === 0)
      err.impactTypes = "Phải chọn ít nhất 1 loại ảnh hưởng";

    if (form.isNearMiss && (form.actualLoss ?? 0) > 0)
      err.actualLoss =
        "Sự kiện suýt xảy ra không được có tổn thất thực tế. Hãy nhập vào ô tổn thất ước tính.";

    if (!form.isNearMiss && hasFinancial && form.actualLoss === null)
      err.actualLoss =
        "Sự kiện có ảnh hưởng tài chính bắt buộc nhập tổn thất thực tế, nhập 0 nếu chưa xác định được mất mát.";

    if (
      form.recoveredAmount !== null &&
      form.recoveredAmount > (form.actualLoss ?? 0)
    )
      err.recoveredAmount = "Số tiền thu hồi không được vượt tổn thất thực tế";

    if (form.isConfidential && !form.handlerId)
      err.handlerId =
        "Sự kiện bảo mật bắt buộc chỉ định người xử lý để giới hạn phạm vi tiếp cận";

    return err;
  }

  function save(options: { thenCreateKppn?: boolean } = {}) {
    const local = localErrors();
    if (Object.keys(local).length > 0) {
      setErrors(local);
      toast.error(
        "Chưa lưu được",
        `Còn ${Object.keys(local).length} trường chưa hợp lệ, vui lòng kiểm tra lại.`,
      );
      setTimeout(() => scrollToFirstError(local), 0);
      return;
    }

    const result = validateEventForm(form);
    if (!result.ok || !result.data) {
      setErrors(result.errors);
      toast.error(
        "Chưa lưu được",
        `Còn ${Object.keys(result.errors).length} trường chưa hợp lệ, vui lòng kiểm tra lại.`,
      );
      setTimeout(() => scrollToFirstError(result.errors), 0);
      return;
    }

    setSaving(true);
    try {
      const data = result.data;

      if (mode === "create") {
        const created = eventRepo.create(data, user.name);
        setDirty(false);
        toast.success(
          `Đã ghi nhận ${created.code}`,
          "Sự kiện ở trạng thái Mới ghi nhận, chờ Ban QTRR tiếp nhận xác minh.",
        );
        router.replace(
          options.thenCreateKppn
            ? `/khac-phuc/kppn/them-moi?event=${created.code}`
            : `/su-kien/so-theo-doi/${created.code}`,
        );
        return;
      }

      if (record) {
        eventRepo.update(record.id, data);
        setDirty(false);
        toast.success(
          `Đã lưu ${record.code}`,
          "Thông tin sự kiện đã được cập nhật.",
        );
        router.replace(
          options.thenCreateKppn
            ? `/khac-phuc/kppn/them-moi?event=${record.code}`
            : `/su-kien/so-theo-doi/${record.code}`,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (mode === "edit" && record) {
      router.push(`/su-kien/so-theo-doi/${record.code}`);
      return;
    }
    router.push("/su-kien/so-theo-doi");
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
        title={mode === "create" ? "Ghi nhận sự kiện" : `Sửa ${record?.code}`}
        subtitle={
          mode === "create"
            ? "Ghi nhận sự kiện rủi ro đã xảy ra hoặc suýt xảy ra để phân tích và phòng ngừa"
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
              description="Mô tả diễn biến sự kiện và phân loại theo danh mục dùng chung"
            >
              <div data-field="name">
                <Input
                  label="Tên sự kiện"
                  required
                  placeholder="Ví dụ: Gián đoạn dịch vụ thanh toán do lỗi cấu hình máy chủ"
                  value={form.name}
                  error={errors.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <Textarea
                label="Diễn biến chi tiết"
                rows={4}
                maxLength={1500}
                showCount
                placeholder="Sự kiện xảy ra thế nào, ai phát hiện, đã xử lý tạm thời ra sao"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
              />

              <FormGrid cols={3}>
                <div data-field="categoryId">
                  <Select
                    label="Nhóm sự kiện"
                    required
                    searchable
                    placeholder="Chọn nhóm theo danh mục"
                    options={lk.eventCategoryOptions}
                    value={form.categoryId || null}
                    error={errors.categoryId}
                    onChange={(v) => patch({ categoryId: v ?? "" })}
                  />
                </div>
                <div data-field="unitId">
                  <Select
                    label="Đơn vị xảy ra"
                    required
                    searchable
                    placeholder="Chọn đơn vị"
                    options={lk.unitOptions}
                    value={form.unitId || null}
                    error={errors.unitId}
                    onChange={(v) => patch({ unitId: v ?? "" })}
                  />
                </div>
                <div data-field="severity">
                  <Select
                    label="Mức độ nghiêm trọng"
                    required
                    options={SEVERITY_OPTIONS}
                    value={form.severity}
                    error={errors.severity}
                    hint={
                      errors.severity
                        ? undefined
                        : `Gợi ý theo tổn thất đã nhập: ${suggested}`
                    }
                    onChange={(v) =>
                      patch({
                        severity: (v ??
                          "Trung bình") as EventFormValue["severity"],
                      })
                    }
                  />
                </div>
              </FormGrid>

              <div className="flex flex-wrap items-start gap-6 rounded-ctrl bg-surface-alt px-3 py-2.5">
                <div className="flex flex-col gap-1">
                  <Checkbox
                    label="Sự kiện suýt xảy ra (near miss)"
                    checked={form.isNearMiss}
                    onChange={(e) => toggleNearMiss(e.target.checked)}
                  />
                  <span className="pl-6 text-[11px] text-text-hint">
                    Chưa phát sinh tổn thất nhưng vẫn phải ghi nhận để rút kinh
                    nghiệm
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <Tooltip
                    content={
                      canMarkConfidential
                        ? "Giới hạn phạm vi người xem nội dung sự kiện"
                        : "Chỉ Quản trị hệ thống và Ban QTRR được đánh dấu bảo mật"
                    }
                  >
                    <span>
                      <Checkbox
                        label="Sự kiện bảo mật"
                        checked={form.isConfidential}
                        disabled={!canMarkConfidential}
                        onChange={(e) =>
                          patch({ isConfidential: e.target.checked })
                        }
                      />
                    </span>
                  </Tooltip>
                  <span className="flex items-center gap-1 pl-6 text-[11px] text-text-hint">
                    <IconLock size={12} />
                    Chỉ Ban QTRR, Kiểm toán nội bộ và người liên quan trực tiếp
                    xem được
                  </span>
                </div>
              </div>
            </FormSection>
          </ContentCard>

          {/* ============ 2. Thời gian và phát hiện =============== */}
          <ContentCard>
            <FormSection
              title="Thời gian và phát hiện"
              description="Độ trễ giữa lúc xảy ra và lúc phát hiện phản ánh chất lượng kiểm soát phát hiện"
            >
              <FormGrid cols={2}>
                <div data-field="occurredDate">
                  <DateInput
                    label="Ngày xảy ra"
                    required
                    value={form.occurredDate}
                    max={form.detectedDate || undefined}
                    error={errors.occurredDate}
                    onChange={(v) => patch({ occurredDate: v })}
                  />
                </div>
                <div data-field="detectedDate">
                  <DateInput
                    label="Ngày phát hiện"
                    required
                    value={form.detectedDate}
                    min={form.occurredDate || undefined}
                    error={errors.detectedDate}
                    onChange={(v) => patch({ detectedDate: v })}
                  />
                </div>
              </FormGrid>

              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-ctrl border px-3 py-2.5 text-[12px] leading-4",
                  lag > 7
                    ? "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text"
                    : lag > 0
                      ? "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text"
                      : "border-lv-low-border bg-lv-low-bg text-lv-low-text",
                )}
              >
                <IconRadar size={16} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  {lag === 0 ? (
                    <>
                      Sự kiện được phát hiện <b>ngay trong ngày xảy ra</b>. Kiểm
                      soát phát hiện đang vận hành tốt.
                    </>
                  ) : lag > 7 ? (
                    <>
                      Độ trễ phát hiện là <b>{lag} ngày</b>, vượt ngưỡng 7 ngày.
                      Đây là dấu hiệu kiểm soát phát hiện đang yếu, nên rà soát
                      lại cơ chế giám sát của quy trình liên quan.
                    </>
                  ) : (
                    <>
                      Độ trễ phát hiện là <b>{lag} ngày</b>.
                    </>
                  )}
                </span>
              </div>

              <FormGrid cols={2}>
                <div data-field="reporterId">
                  <Select
                    label="Người báo cáo"
                    required
                    searchable
                    placeholder="Chọn người phát hiện và báo cáo"
                    options={lk.employeeOptions}
                    value={form.reporterId || null}
                    error={errors.reporterId}
                    onChange={(v) => patch({ reporterId: v ?? "" })}
                  />
                </div>
                <div data-field="handlerId">
                  <Select
                    label="Người xử lý"
                    required={form.isConfidential}
                    searchable
                    clearable={!form.isConfidential}
                    placeholder="Chọn người chịu trách nhiệm xử lý"
                    options={lk.employeeOptions}
                    value={form.handlerId || null}
                    error={errors.handlerId}
                    hint={
                      errors.handlerId
                        ? undefined
                        : "Bắt buộc trước khi chuyển sang giai đoạn điều tra"
                    }
                    onChange={(v) => patch({ handlerId: v ?? "" })}
                  />
                </div>
              </FormGrid>
            </FormSection>
          </ContentCard>

          {/* ============ 3. Ảnh hưởng và tổn thất =============== */}
          <ContentCard>
            <FormSection
              title="Loại ảnh hưởng và tổn thất"
              description="Chọn ít nhất 1 loại ảnh hưởng. Nếu có ảnh hưởng tài chính thì bắt buộc nhập tổn thất thực tế"
            >
              <div data-field="impactTypes" className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-text-primary">
                  Loại ảnh hưởng <span className="text-danger">*</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {EVENT_IMPACT_TYPES.map((v) => {
                    const active = form.impactTypes.includes(v);
                    return (
                      <Tooltip key={v} content={IMPACT_HINT[v] ?? v}>
                        <button
                          type="button"
                          onClick={() => toggleImpact(v)}
                          className={cn(
                            "rounded-ctrl border px-3 py-1.5 text-[12px] font-medium transition-all",
                            active
                              ? "border-brand bg-brand-light text-brand"
                              : "border-border-neutral bg-white text-text-secondary hover:bg-[#FAFAFA]",
                          )}
                        >
                          {v}
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
                {errors.impactTypes ? (
                  <p className="text-[12px] text-danger">
                    {errors.impactTypes}
                  </p>
                ) : (
                  <p className="text-[11px] text-text-hint">
                    Một sự kiện có thể ảnh hưởng nhiều mặt cùng lúc.
                  </p>
                )}
              </div>

              <FormGrid cols={3}>
                <div data-field="estimatedLoss">
                  <MoneyInput
                    label="Tổn thất ước tính"
                    value={form.estimatedLoss}
                    onChange={(v) => patch({ estimatedLoss: v })}
                    hint="Con số ước lượng tại thời điểm ghi nhận"
                  />
                </div>
                <div data-field="actualLoss">
                  <MoneyInput
                    label="Tổn thất thực tế"
                    required={hasFinancial && !form.isNearMiss}
                    value={form.actualLoss}
                    disabled={form.isNearMiss}
                    error={errors.actualLoss}
                    onChange={changeActualLoss}
                    hint={
                      errors.actualLoss
                        ? undefined
                        : form.isNearMiss
                          ? "Sự kiện suýt xảy ra nên không có tổn thất thực tế"
                          : "Số liệu chốt sau khi xác minh"
                    }
                  />
                </div>
                <div data-field="recoveredAmount">
                  <MoneyInput
                    label="Số tiền thu hồi"
                    value={form.recoveredAmount}
                    disabled={form.isNearMiss}
                    error={errors.recoveredAmount}
                    onChange={(v) => patch({ recoveredAmount: v })}
                    hint={
                      errors.recoveredAmount
                        ? undefined
                        : "Phần đã thu hồi được từ bảo hiểm, đối tác hoặc truy thu"
                    }
                  />
                </div>
              </FormGrid>

              {/* Tóm tắt tổn thất */}
              {(form.actualLoss ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-4 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <IconCoin size={15} className="text-lv-medium-text" />
                    Tổn thất ròng:{" "}
                    <b className="text-[13px] text-text-primary">
                      {formatMoney(net)}
                    </b>{" "}
                    VNĐ
                  </span>
                  {rate !== null && (
                    <span>
                      Tỷ lệ thu hồi:{" "}
                      <b
                        className={cn(
                          rate >= 50 ? "text-lv-low-text" : "text-text-primary",
                        )}
                      >
                        {rate}%
                      </b>
                    </span>
                  )}
                  {form.estimatedLoss !== null && form.actualLoss !== null && (
                    <span>
                      Lệch so với ước tính:{" "}
                      <b
                        className={cn(
                          form.actualLoss > form.estimatedLoss
                            ? "text-danger"
                            : "text-lv-low-text",
                        )}
                      >
                        {form.actualLoss > form.estimatedLoss ? "+" : ""}
                        {formatMoney(form.actualLoss - form.estimatedLoss)}
                      </b>{" "}
                      VNĐ
                    </span>
                  )}
                  <span className="ml-auto">
                    Mức gợi ý theo tổn thất: <RiskBadge level={suggested} />
                  </span>
                </div>
              )}
            </FormSection>
          </ContentCard>

          {/* ============ 4. Liên kết rủi ro & kiểm soát ========== */}
          <ContentCard>
            <FormSection
              title="Liên kết rủi ro, kiểm soát và điểm yếu"
              description="Liên kết ngược giúp đánh giá lại mức rủi ro còn lại và hiệu lực kiểm soát sau sự kiện"
            >
              {/* Rủi ro */}
              <div data-field="relatedRiskIds" className="flex flex-col gap-2">
                <Select
                  label="Rủi ro liên quan"
                  required={
                    form.severity === "Cao" || form.severity === "Trọng yếu"
                  }
                  searchable
                  placeholder="Chọn rủi ro đã hiện thực hoá thành sự kiện này"
                  options={riskOptions}
                  value={null}
                  error={errors.relatedRiskIds}
                  hint={
                    errors.relatedRiskIds
                      ? undefined
                      : "Sự kiện mức Cao trở lên bắt buộc có ít nhất 1 rủi ro"
                  }
                  onChange={(v) => v && addTo("relatedRiskIds", v)}
                />
                <ChipList
                  ids={form.relatedRiskIds}
                  emptyText="Chưa gắn rủi ro nào"
                  render={(id) => {
                    const r = risks.find((x) => x.id === id);
                    if (!r) return null;
                    return (
                      <>
                        <IconAlertTriangle
                          size={13}
                          className="text-lv-medium-text"
                        />
                        <b className="text-brand">{r.code}</b>
                        <span className="max-w-[260px] truncate">{r.name}</span>
                        <RiskBadge
                          level={residualLevelOf(r)}
                          score={residualScoreOf(r)}
                        />
                      </>
                    );
                  }}
                  onRemove={(id) => removeFrom("relatedRiskIds", id)}
                />
              </div>

              {/* Kiểm soát */}
              <div className="flex flex-col gap-2">
                <Select
                  label="Kiểm soát đã thất bại"
                  searchable
                  placeholder="Chọn kiểm soát lẽ ra phải ngăn được sự kiện này"
                  options={controlOptions}
                  value={null}
                  hint="Dùng để đánh giá lại hiệu lực kiểm soát ở phân hệ Kiểm soát"
                  onChange={(v) => v && addTo("relatedControlIds", v)}
                />
                <ChipList
                  ids={form.relatedControlIds}
                  emptyText="Chưa xác định kiểm soát nào thất bại"
                  render={(id) => {
                    const c = controls.find((x) => x.id === id);
                    if (!c) return null;
                    return (
                      <>
                        <IconShieldCheck size={13} className="text-brand" />
                        <b className="text-brand">{c.code}</b>
                        <span className="max-w-[260px] truncate">{c.name}</span>
                        {c.isKeyControl && (
                          <Badge tone="brand" size="sm">
                            Trọng yếu
                          </Badge>
                        )}
                        <StatusBadge status={c.status} />
                      </>
                    );
                  }}
                  onRemove={(id) => removeFrom("relatedControlIds", id)}
                />

                {suggestedControls.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg px-3 py-2 text-[12px] text-lv-info-text">
                    <IconInfoCircle size={15} className="shrink-0" />
                    <span>Kiểm soát đang phủ các rủi ro đã chọn:</span>
                    {suggestedControls.slice(0, 4).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => addTo("relatedControlIds", c.id)}
                        className="rounded-badge border border-lv-info-border bg-white px-2 py-0.5 font-medium transition-colors hover:bg-lv-info-bg"
                      >
                        + {c.code}
                      </button>
                    ))}
                    {suggestedControls.length > 4 && (
                      <span className="opacity-80">
                        và {suggestedControls.length - 4} kiểm soát khác
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Điểm yếu */}
              <div className="flex flex-col gap-2">
                <Select
                  label="Điểm yếu kiểm soát phát hiện qua sự kiện"
                  searchable
                  placeholder="Chọn điểm yếu đã ghi nhận có liên quan"
                  options={deficiencyOptions}
                  value={null}
                  hint="Nếu chưa có, sau khi lưu sự kiện có thể lập điểm yếu mới từ trang chi tiết"
                  onChange={(v) => v && addTo("deficiencyIds", v)}
                />
                <ChipList
                  ids={form.deficiencyIds}
                  emptyText="Chưa gắn điểm yếu nào"
                  render={(id) => {
                    const d = deficiencies.find((x) => x.id === id);
                    if (!d) return null;
                    return (
                      <>
                        <IconTool size={13} className="text-lv-medium-text" />
                        <b className="text-brand">{d.code}</b>
                        <span className="max-w-[260px] truncate">{d.name}</span>
                        <RiskBadge level={d.severity} />
                      </>
                    );
                  }}
                  onRemove={(id) => removeFrom("deficiencyIds", id)}
                />
              </div>
            </FormSection>
          </ContentCard>

          {/* ============ 5. Nguyên nhân và bài học ============== */}
          <ContentCard>
            <FormSection
              title="Nguyên nhân gốc và bài học kinh nghiệm"
              description="Nguyên nhân gốc là điều kiện bắt buộc để đóng sự kiện. Bài học kinh nghiệm là giá trị lớn nhất của việc ghi nhận"
            >
              <div data-field="rootCause">
                <Textarea
                  label="Nguyên nhân gốc"
                  rows={4}
                  maxLength={1000}
                  showCount
                  placeholder="Vì sao sự kiện xảy ra, thuộc về quy trình, con người, hệ thống hay yếu tố bên ngoài"
                  value={form.rootCause}
                  error={errors.rootCause}
                  hint={
                    errors.rootCause
                      ? undefined
                      : "Chưa bắt buộc ở bước ghi nhận, nhưng bắt buộc trước khi đóng sự kiện"
                  }
                  onChange={(e) => patch({ rootCause: e.target.value })}
                />
              </div>

              <Textarea
                label="Bài học kinh nghiệm"
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Rút ra điều gì, cần thay đổi quy trình hay bổ sung kiểm soát nào"
                value={form.lessonLearned}
                onChange={(e) => patch({ lessonLearned: e.target.value })}
              />

              {mode === "edit" && record && (
                <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] text-text-secondary">
                  <span>
                    Trạng thái hiện tại:{" "}
                    <b className="text-text-primary">{record.status}</b>
                  </span>
                  <span>
                    Ghi nhận ngày{" "}
                    <b className="text-text-primary">
                      {formatDate(record.detectedDate)}
                    </b>
                  </span>
                  {record.statusNote && (
                    <span className="w-full text-[11px] text-text-hint">
                      Ghi chú trạng thái: {record.statusNote}
                    </span>
                  )}
                  <span className="w-full text-[11px] text-text-hint">
                    Việc chuyển trạng thái thực hiện tại màn hình chi tiết để hệ
                    thống kiểm tra đủ điều kiện.
                  </span>
                </div>
              )}
            </FormSection>
          </ContentCard>
        </div>
      </PageBody>

      {/* ===================== Thanh hành động ===================== */}
      <FooterActionBar
        left={
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <RiskBadge level={form.severity} />
            {form.isNearMiss && <Badge tone="info">Near miss</Badge>}
            {form.isConfidential && (
              <Badge tone="neutral" dot>
                Bảo mật
              </Badge>
            )}
            <span>
              Độ trễ phát hiện:{" "}
              <b className={cn(lag > 7 ? "text-danger" : "text-text-primary")}>
                {lag} ngày
              </b>
            </span>
            {(form.actualLoss ?? 0) > 0 && (
              <span>
                Tổn thất ròng:{" "}
                <b className="text-text-primary">{formatMoney(net)}</b> VNĐ
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
        <Tooltip content="Lưu sự kiện rồi mở luôn form lập hành động khắc phục">
          <Button
            variant="secondary"
            icon={<IconTool size={16} />}
            loading={saving}
            onClick={() => save({ thenCreateKppn: true })}
          >
            Lưu và lập hành động KPPN
          </Button>
        </Tooltip>
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
          {mode === "create" ? "Ghi nhận sự kiện" : "Lưu thay đổi"}
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

/* ================================================================== */
/* Danh sách chip cho các trường nhiều lựa chọn                        */
/* ================================================================== */

function ChipList({
  ids,
  emptyText,
  render,
  onRemove,
}: {
  ids: string[];
  emptyText: string;
  render: (id: string) => React.ReactNode;
  onRemove: (id: string) => void;
}) {
  if (ids.length === 0) {
    return (
      <p className="rounded-ctrl border border-dashed border-border-neutral px-3 py-2 text-[12px] text-text-hint">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ids.map((id) => {
        const content = render(id);
        if (!content) return null;
        return (
          <div
            key={id}
            className="flex flex-wrap items-center gap-1.5 rounded-ctrl border border-border-light px-3 py-1.5 text-[12px] text-text-primary"
          >
            {content}
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label="Bỏ liên kết"
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-ctrl text-icon-neutral transition-colors hover:bg-lv-critical-bg hover:text-danger"
            >
              <IconX size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
