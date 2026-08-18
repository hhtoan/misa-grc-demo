"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconCalendarRepeat,
  IconCheck,
  IconDeviceFloppy,
  IconInfoCircle,
  IconPlus,
  IconSearch,
  IconShieldCheck,
  IconX,
  IconSettings,
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
  Modal,
  RiskBadge,
  Select,
  Switch,
  Textarea,
  Tooltip,
  useToast,
  EffectivenessBadge,
} from "@/components/ui";
import {
  ContentCard,
  FooterActionBar,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { controlRepo, riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  CONTROL_FREQUENCIES,
  CONTROL_NATURES,
  CONTROL_TYPES,
} from "@/lib/domain/enums";
import {
  TEST_CYCLE_DAYS,
  controlToForm,
  controlWarnings,
  emptyControlForm,
  isControlEditable,
  validateControlForm,
  type ControlFormValue,
  DESIGN_QUESTION,
  EFFECTIVENESS_OPTIONS,
  designEffectivenessOf,
} from "@/lib/domain/control-utils";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import type { Control, Risk } from "@/lib/domain/schema";
import { matchSearch } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const TYPE_OPTIONS = CONTROL_TYPES.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Phòng ngừa"
      ? "Ngăn rủi ro xảy ra ngay từ đầu"
      : v === "Phát hiện"
        ? "Phát hiện sai sót sau khi đã phát sinh"
        : "Khắc phục hậu quả sau khi rủi ro xảy ra",
}));

const NATURE_OPTIONS = CONTROL_NATURES.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Thủ công"
      ? "Con người thực hiện toàn bộ"
      : v === "Bán tự động"
        ? "Hệ thống hỗ trợ, người quyết định"
        : "Hệ thống thực hiện tự động hoàn toàn",
}));

const FREQUENCY_OPTIONS = CONTROL_FREQUENCIES.map((v) => ({
  value: v,
  label: v,
  description: `Chu kỳ kiểm tra hiệu lực: ${TEST_CYCLE_DAYS[v] ?? 180} ngày`,
}));

export type ControlFormMode = "create" | "edit";

/* ================================================================== */
/* Wrapper: tìm bản ghi rồi phân nhánh                                 */
/* ================================================================== */

export default function ControlFormScreen({
  mode,
  code,
}: {
  mode: ControlFormMode;
  code?: string;
}) {
  const router = useRouter();
  const controls = useCollection(controlRepo);

  const record = useMemo(
    () =>
      mode === "edit" && code
        ? controls.find((c) => c.code === code || c.id === code)
        : undefined,
    [mode, code, controls],
  );

  /* ------------------ Không tìm thấy bản ghi ------------------- */
  if (mode === "edit" && !record) {
    return (
      <PageContainer>
        <PageHeader title="Sửa kiểm soát" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy kiểm soát"
              description={`Không có bản ghi nào ứng với mã ${code ?? ""}. Có thể bản ghi đã bị xoá.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/kiem-soat/so-dang-ky")}
                >
                  Về sổ đăng ký kiểm soát
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  /* --------------------- Trạng thái khoá sửa -------------------- */
  if (mode === "edit" && record && !isControlEditable(record.status)) {
    return (
      <PageContainer>
        <PageHeader title={`Sửa ${record.code}`} showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconAlertTriangle size={24} />}
              title={`Kiểm soát đang ở trạng thái ${record.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung. Hãy chuyển trạng thái về mức cho phép sửa trước khi cập nhật."
              action={
                <Button
                  variant="primary"
                  onClick={() =>
                    router.push(`/kiem-soat/so-dang-ky/${record.code}`)
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

  return <ControlFormContent mode={mode} record={record ?? null} />;
}

/* ================================================================== */
/* Content: toàn bộ logic form                                        */
/* ================================================================== */

function ControlFormContent({
  mode,
  record,
}: {
  mode: ControlFormMode;
  record: Control | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();
  const risks = useCollection(riskRepo);

  const [form, setForm] = useState<ControlFormValue>(() => emptyControlForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [riskPickerOpen, setRiskPickerOpen] = useState(false);
  const loadedFor = useRef<string>("");

  /* Nạp dữ liệu vào form một lần khi mở trang sửa */
  useEffect(() => {
    if (mode !== "edit" || !record) return;
    if (loadedFor.current === record.id) return;
    loadedFor.current = record.id;
    setForm(controlToForm(record));
    setDirty(false);
    setErrors({});
  }, [mode, record]);

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

  function patch(next: Partial<ControlFormValue>) {
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

  const warnings = useMemo(() => controlWarnings(form), [form]);

  const selectedRisks = useMemo(
    () => risks.filter((r) => form.riskIds.includes(r.id)),
    [risks, form.riskIds],
  );

  const needSystem = form.nature !== "Thủ công";
  const testCycle = TEST_CYCLE_DAYS[form.frequency] ?? 180;

  /* Đổi tính chất sang tự động mà chưa có hệ thống thì nhắc ngay */
  function changeNature(v: string) {
    const nature = (v ?? "Thủ công") as ControlFormValue["nature"];
    patch({ nature });
    if (nature !== "Thủ công" && !form.systemId) {
      toast.info(
        "Cần chọn hệ thống CNTT",
        `Kiểm soát ${nature.toLowerCase()} bắt buộc gắn với hệ thống thực hiện.`,
      );
    }
  }

  function toggleKeyControl(v: boolean) {
    patch({ isKeyControl: v });
    if (v && !form.evidenceRequirement.trim()) {
      toast.info(
        "Cần khai báo yêu cầu bằng chứng",
        "Kiểm soát trọng yếu bắt buộc mô tả bằng chứng cần thu thập khi kiểm tra.",
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
    const result = validateControlForm(form);

    if (!result.ok || !result.data) {
      setErrors(result.errors);
      toast.error(
        "Chưa lưu được",
        `Còn ${Object.keys(result.errors).length} trường chưa hợp lệ, vui lòng kiểm tra lại.`,
      );
      setTimeout(() => scrollToFirstError(result.errors), 0);
      return;
    }

    const data: ControlFormValue = options.thenSubmit
      ? { ...result.data, status: "Chờ duyệt" }
      : result.data;

    setSaving(true);
    try {
      if (mode === "create") {
        const created = controlRepo.create(data, user.name);
        setDirty(false);
        toast.success(
          `Đã tạo ${created.code}`,
          options.thenSubmit
            ? "Kiểm soát đã được trình duyệt."
            : `Kiểm soát được lưu ở trạng thái ${data.status}.`,
        );
        router.replace(`/kiem-soat/so-dang-ky/${created.code}`);
        return;
      }

      if (record) {
        controlRepo.update(record.id, data);
        setDirty(false);
        toast.success(
          `Đã lưu ${record.code}`,
          options.thenSubmit
            ? "Kiểm soát đã được trình duyệt."
            : "Thông tin kiểm soát đã được cập nhật.",
        );
        router.replace(`/kiem-soat/so-dang-ky/${record.code}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (mode === "edit" && record) {
      router.push(`/kiem-soat/so-dang-ky/${record.code}`);
      return;
    }
    router.push("/kiem-soat/so-dang-ky");
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
        title={mode === "create" ? "Thêm kiểm soát" : `Sửa ${record?.code}`}
        subtitle={
          mode === "create"
            ? "Khai báo biện pháp kiểm soát và các rủi ro được phủ"
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
              description="Mô tả biện pháp kiểm soát và đơn vị chịu trách nhiệm vận hành"
            >
              <div data-field="name">
                <Input
                  label="Tên kiểm soát"
                  required
                  placeholder="Ví dụ: Sao lưu dữ liệu tự động hằng ngày và kiểm tra khôi phục"
                  value={form.name}
                  error={errors.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <Textarea
                label="Mô tả cách thức thực hiện"
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Ai làm, làm gì, làm khi nào, kết quả đầu ra là gì"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
              />

              <FormGrid cols={3}>
                <div data-field="unitId">
                  <Select
                    label="Đơn vị"
                    required
                    searchable
                    placeholder="Chọn đơn vị vận hành"
                    options={lk.unitOptions}
                    value={form.unitId || null}
                    error={errors.unitId}
                    onChange={(v) => patch({ unitId: v ?? "" })}
                  />
                </div>
                <div data-field="ownerId">
                  <Select
                    label="Người chịu trách nhiệm"
                    required
                    searchable
                    placeholder="Chọn người phụ trách"
                    options={lk.employeeOptions}
                    value={form.ownerId || null}
                    error={errors.ownerId}
                    onChange={(v) => patch({ ownerId: v ?? "" })}
                  />
                </div>
                <Select
                  label="Quy trình liên quan"
                  searchable
                  clearable
                  placeholder="Chọn quy trình"
                  options={lk.processOptions}
                  value={form.processId || null}
                  onChange={(v) => patch({ processId: v ?? "" })}
                />
              </FormGrid>
            </FormSection>
          </ContentCard>

          {/* ============ 2. Rủi ro được kiểm soát =============== */}
          <ContentCard>
            <FormSection
              title="Rủi ro được kiểm soát"
              description="Kiểm soát bắt buộc gắn với ít nhất 1 rủi ro trong sổ đăng ký rủi ro"
            >
              <div data-field="riskIds" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    icon={<IconShieldCheck size={16} />}
                    onClick={() => setRiskPickerOpen(true)}
                  >
                    Chọn rủi ro
                  </Button>
                  <span className="text-[12px] text-text-secondary">
                    Đã chọn{" "}
                    <b className="text-text-primary">{form.riskIds.length}</b>{" "}
                    trên {risks.length} rủi ro
                  </span>
                </div>

                {selectedRisks.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {selectedRisks.map((r) => (
                      <RiskRow
                        key={r.id}
                        risk={r}
                        unitName={lk.unitName(r.unitId)}
                        ownerName={lk.employeeName(r.ownerId)}
                        onRemove={() =>
                          patch({
                            riskIds: form.riskIds.filter((id) => id !== r.id),
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p
                    className={cn(
                      "rounded-ctrl border border-dashed px-3 py-4 text-center text-[13px]",
                      errors.riskIds
                        ? "border-danger text-danger"
                        : "border-border-neutral text-text-hint",
                    )}
                  >
                    Chưa gắn rủi ro nào. Kiểm soát phải gắn ít nhất 1 rủi ro mới
                    lưu được.
                  </p>
                )}

                {errors.riskIds && (
                  <p className="text-[12px] text-danger">{errors.riskIds}</p>
                )}
              </div>
            </FormSection>
          </ContentCard>

          {/* ========== 3. Vận hành và bằng chứng ================ */}
          <ContentCard>
            <FormSection
              title="Vận hành và bằng chứng"
              description="Cách kiểm soát được thực hiện và tài liệu chứng minh khi kiểm tra hiệu lực"
            >
              <FormGrid cols={3}>
                <div data-field="type">
                  <Select
                    label="Loại kiểm soát"
                    required
                    placeholder="Chọn loại"
                    options={TYPE_OPTIONS}
                    value={form.type}
                    error={errors.type}
                    onChange={(v) =>
                      patch({
                        type: (v ?? "Phòng ngừa") as ControlFormValue["type"],
                      })
                    }
                  />
                </div>
                <div data-field="nature">
                  <Select
                    label="Tính chất vận hành"
                    required
                    placeholder="Chọn tính chất"
                    options={NATURE_OPTIONS}
                    value={form.nature}
                    error={errors.nature}
                    onChange={(v) => changeNature(v ?? "Thủ công")}
                  />
                </div>
                <div data-field="frequency">
                  <Select
                    label="Tần suất vận hành"
                    required
                    placeholder="Chọn tần suất"
                    options={FREQUENCY_OPTIONS}
                    value={form.frequency}
                    error={errors.frequency}
                    onChange={(v) =>
                      patch({
                        frequency: (v ??
                          "Hàng tháng") as ControlFormValue["frequency"],
                      })
                    }
                  />
                </div>
              </FormGrid>
              {/* ============ Kết luận về thiết kế kiểm soát ============ */}
              <div className="flex flex-col gap-2.5 rounded-card border border-border-light p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <IconSettings size={16} className="text-brand" />
                  <span className="text-[13px] font-semibold text-text-primary">
                    Đánh giá thiết kế kiểm soát
                  </span>
                  <span className="ml-auto">
                    <EffectivenessBadge
                      size="sm"
                      value={designEffectivenessOf({
                        designEffectiveness: form.designEffectiveness,
                      })}
                    />
                  </span>
                </div>

                <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                  <IconInfoCircle size={16} className="mt-px shrink-0" />
                  <span>
                    Đây là kết luận về <b>bản thân thiết kế</b>, không phải về
                    việc thực hiện. Hiệu lực <b>vận hành</b> chỉ được kết luận
                    từ đợt kiểm tra thực tế, nên không nhập ở đây.
                  </span>
                </div>

                <div data-field="designEffectiveness">
                  <Select
                    label="Hiệu lực thiết kế"
                    clearable
                    placeholder="Để trống nếu chưa kết luận"
                    options={EFFECTIVENESS_OPTIONS}
                    value={form.designEffectiveness || null}
                    error={errors.designEffectiveness}
                    hint={
                      errors.designEffectiveness ? undefined : DESIGN_QUESTION
                    }
                    onChange={(v) => patch({ designEffectiveness: v ?? "" })}
                  />
                </div>

                {form.designEffectiveness === "Không hiệu quả" && (
                  <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
                    <IconAlertTriangle size={16} className="mt-px shrink-0" />
                    <span>
                      Kết luận <b>Không hiệu quả</b> về thiết kế nghĩa là kiểm
                      soát này không đủ sức ngăn rủi ro, dù người thực hiện làm
                      đúng quy định. Cần <b>sửa lại mô tả kiểm soát</b> trước
                      khi trình duyệt, thay vì để hồ sơ ở trạng thái này.
                    </span>
                  </div>
                )}
              </div>
              <div data-field="systemId">
                <Select
                  label="Hệ thống CNTT thực hiện"
                  required={needSystem}
                  searchable
                  clearable={!needSystem}
                  placeholder={
                    needSystem
                      ? "Bắt buộc chọn hệ thống với kiểm soát tự động"
                      : "Chọn hệ thống nếu có"
                  }
                  options={lk.systemOptions}
                  value={form.systemId || null}
                  error={errors.systemId}
                  hint={
                    errors.systemId
                      ? undefined
                      : needSystem
                        ? `Kiểm soát ${form.nature.toLowerCase()} phải xác định rõ hệ thống vận hành`
                        : "Không bắt buộc với kiểm soát thủ công"
                  }
                  onChange={(v) => patch({ systemId: v ?? "" })}
                />
              </div>

              <div data-field="evidenceRequirement">
                <Textarea
                  label="Yêu cầu bằng chứng"
                  required={form.isKeyControl}
                  rows={3}
                  maxLength={800}
                  showCount
                  placeholder="Ví dụ: Nhật ký sao lưu hằng ngày, biên bản diễn tập khôi phục hằng quý"
                  value={form.evidenceRequirement}
                  error={errors.evidenceRequirement}
                  onChange={(e) =>
                    patch({ evidenceRequirement: e.target.value })
                  }
                />
              </div>

              {/* Chu kỳ kiểm tra suy ra từ tần suất */}
              <div className="flex flex-wrap items-center gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg px-3 py-2.5 text-[12px] leading-4 text-lv-info-text">
                <IconCalendarRepeat size={16} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  Với tần suất vận hành <b>{form.frequency.toLowerCase()}</b>,
                  chu kỳ kiểm tra hiệu lực của kiểm soát này là{" "}
                  <b>{testCycle} ngày</b>. Hệ thống sẽ tự nhắc khi tới hạn kiểm
                  tra.
                </span>
              </div>
            </FormSection>
          </ContentCard>

          {/* ============ 4. Hiệu lực và thuộc tính ============== */}
          <ContentCard>
            <FormSection
              title="Hiệu lực và thuộc tính"
              description="Thời gian áp dụng và mức độ quan trọng của kiểm soát"
            >
              <FormGrid cols={2}>
                <div data-field="effectiveDate">
                  <DateInput
                    label="Ngày hiệu lực"
                    required
                    value={form.effectiveDate}
                    error={errors.effectiveDate}
                    onChange={(v) => patch({ effectiveDate: v })}
                  />
                </div>
                <div data-field="expireDate">
                  <DateInput
                    label="Ngày hết hiệu lực"
                    value={form.expireDate}
                    min={form.effectiveDate || undefined}
                    error={errors.expireDate}
                    hint={
                      errors.expireDate
                        ? undefined
                        : "Để trống nếu kiểm soát áp dụng vô thời hạn"
                    }
                    onChange={(v) => patch({ expireDate: v })}
                  />
                </div>
              </FormGrid>

              <div className="flex flex-wrap items-center gap-6 rounded-ctrl bg-surface-alt px-3 py-2.5">
                <Tooltip content="Kiểm soát then chốt, bắt buộc khai báo yêu cầu bằng chứng và được ưu tiên kiểm tra">
                  <span className="inline-flex items-center gap-1.5">
                    <Switch
                      checked={form.isKeyControl}
                      onChange={toggleKeyControl}
                      label="Kiểm soát trọng yếu"
                    />
                    <IconInfoCircle size={15} className="text-icon-neutral" />
                  </span>
                </Tooltip>
              </div>

              {mode === "edit" && record?.lastTestResult && (
                <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] text-text-secondary">
                  <IconInfoCircle size={15} className="shrink-0" />
                  Kết quả kiểm tra gần nhất là{" "}
                  <b className="text-text-primary">{record.lastTestResult}</b>.
                  Kết quả này chỉ thay đổi khi ghi nhận đợt kiểm tra mới tại màn
                  hình Kết quả kiểm tra kiểm soát.
                </div>
              )}
            </FormSection>
          </ContentCard>

          {mode === "edit" && record && (
            <p className="pb-1 text-center text-[12px] text-text-hint">
              Trạng thái hiện tại: <b>{record.status}</b>. Việc chuyển trạng
              thái thực hiện ở màn hình chi tiết.
            </p>
          )}
        </div>
      </PageBody>

      {/* ===================== Thanh hành động ===================== */}
      <FooterActionBar
        left={
          <span className="flex items-center gap-2 text-[12px] text-text-secondary">
            <Badge tone={form.isKeyControl ? "brand" : "neutral"} dot>
              {form.isKeyControl ? "Kiểm soát trọng yếu" : "Kiểm soát thường"}
            </Badge>
            <span>
              Phủ <b className="text-text-primary">{form.riskIds.length}</b> rủi
              ro
            </span>
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
          {mode === "create" ? "Thêm kiểm soát" : "Lưu thay đổi"}
        </Button>
      </FooterActionBar>

      {/* ======================= Hộp thoại ======================== */}
      <RiskPickerModal
        open={riskPickerOpen}
        onClose={() => setRiskPickerOpen(false)}
        risks={risks}
        unitName={lk.unitName}
        categoryName={lk.categoryName}
        selected={form.riskIds}
        onConfirm={(ids) => {
          patch({ riskIds: ids });
          setRiskPickerOpen(false);
        }}
      />

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
/* Dòng rủi ro đã chọn                                        */
/* ================================================================== */

function RiskRow({
  risk,
  unitName,
  ownerName,
  onRemove,
}: {
  risk: Risk;
  unitName: string;
  ownerName: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-ctrl border border-border-light px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-medium-bg text-lv-medium-text">
        <IconAlertTriangle size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-text-primary">
          <b className="text-brand">{risk.code}</b> {risk.name}
        </p>
        <p className="truncate text-[12px] text-text-secondary">
          {unitName} - {ownerName}
          {risk.isZeroTolerance ? " - Không khoan nhượng" : ""}
        </p>
      </div>

      <RiskBadge
        level={residualLevelOf(risk)}
        score={residualScoreOf(risk)}
        className="shrink-0"
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label="Bỏ gắn rủi ro"
        className="shrink-0 rounded-ctrl p-1.5 text-icon-neutral transition-colors hover:bg-[#F0F0F0] hover:text-danger"
      >
        <IconX size={16} />
      </button>
    </div>
  );
}

/* ================================================================== */
/* Hộp thoại chọn rủi ro                                        */
/* ================================================================== */

function RiskPickerModal({
  open,
  onClose,
  risks,
  unitName,
  categoryName,
  selected,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  risks: Risk[];
  unitName: (id: string) => string;
  categoryName: (id: string) => string;
  selected: string[];
  onConfirm: (ids: string[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [draft, setDraft] = useState<string[]>(selected);
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDraft(selected);
      setKeyword("");
      setOnlyOpen(true);
    }
  }

  const filtered = useMemo(
    () =>
      risks.filter((r) => {
        if (
          onlyOpen &&
          (r.status === "Đã đóng" || r.status === "Từ chối") &&
          !draft.includes(r.id)
        )
          return false;
        if (!keyword.trim()) return true;
        return matchSearch(`${r.code} ${r.name} ${r.description}`, keyword);
      }),
    [risks, keyword, onlyOpen, draft],
  );

  function toggle(id: string) {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Chọn rủi ro được kiểm soát"
      description="Một kiểm soát có thể phủ nhiều rủi ro, nhưng nên giới hạn để dễ đánh giá hiệu lực"
      footer={
        <>
          <span className="mr-auto text-[12px] text-text-secondary">
            Đã chọn <b className="text-text-primary">{draft.length}</b> rủi ro
          </span>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            icon={<IconCheck size={16} />}
            onClick={() => onConfirm(draft)}
          >
            Xác nhận
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[260px] flex-1">
            <Input
              placeholder="Tìm theo mã, tên rủi ro"
              prefixIcon={<IconSearch size={16} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <Checkbox
            label="Chỉ rủi ro đang mở"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
        </div>

        <div className="flex max-h-[380px] flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[13px] text-text-hint">
              Không tìm thấy rủi ro phù hợp
            </p>
          )}

          {filtered.map((r) => {
            const checked = draft.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-ctrl border px-3 py-2 text-left transition-colors",
                  checked
                    ? "border-brand bg-brand-light"
                    : "border-border-light hover:bg-[#FAFAFA]",
                )}
              >
                <span className="pt-0.5">
                  <Checkbox checked={checked} readOnly />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <b className="shrink-0 text-[12px] text-brand">{r.code}</b>
                    <span className="truncate text-[13px] text-text-primary">
                      {r.name}
                    </span>
                    {r.isZeroTolerance && (
                      <Badge tone="danger" size="sm">
                        KKN
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-text-secondary">
                    {categoryName(r.categoryId)} - {unitName(r.unitId)} -{" "}
                    {r.status}
                  </span>
                </span>

                <RiskBadge
                  level={residualLevelOf(r)}
                  score={residualScoreOf(r)}
                  className="shrink-0"
                />
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
