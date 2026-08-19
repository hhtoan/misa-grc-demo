"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconAlertTriangle,
  IconBolt,
  IconDeviceFloppy,
  IconFileSearch,
  IconLink,
  IconPlus,
  IconShieldCheck,
  IconStethoscope,
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
  RiskBadge,
  Select,
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
  controlTestRepo,
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { DEFICIENCY_SOURCES, RISK_LEVELS } from "@/lib/domain/enums";
import {
  deficiencyToForm,
  deficiencyWarnings,
  emptyDeficiencyForm,
  isDeficiencyEditable,
  suggestDeficiencyDueDate,
  validateDeficiencyForm,
  type DeficiencyFormValue,
} from "@/lib/domain/kppn-utils";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import type { Deficiency } from "@/lib/domain/schema";
import { formatDate } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const SOURCE_OPTIONS = DEFICIENCY_SOURCES.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Kiểm tra kiểm soát"
      ? "Phát sinh từ một đợt kiểm tra hiệu lực kiểm soát"
      : v === "Sự kiện"
        ? "Phát hiện khi điều tra nguyên nhân một sự kiện"
        : v === "Kiểm toán nội bộ"
          ? "Do Phòng Kiểm toán nội bộ phát hiện"
          : v === "Tự phát hiện"
            ? "Đơn vị tự rà soát và ghi nhận"
            : "Từ đợt đánh giá hiệu lực hệ thống kiểm soát nội bộ",
}));

const SEVERITY_OPTIONS = RISK_LEVELS.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Trọng yếu"
      ? "Nên xử lý trong 30 ngày, bắt buộc nguyên nhân gốc và KPPN"
      : v === "Cao"
        ? "Nên xử lý trong 60 ngày, bắt buộc nguyên nhân gốc và KPPN"
        : v === "Trung bình"
          ? "Nên xử lý trong 90 ngày"
          : "Nên xử lý trong 120 ngày",
}));

export type DeficiencyFormMode = "create" | "edit";

/* ================================================================== */
/* Wrapper: tìm bản ghi rồi phân nhánh                                 */
/* ================================================================== */

export default function DeficiencyFormScreen({
  mode,
  code,
}: {
  mode: DeficiencyFormMode;
  code?: string;
}) {
  const router = useRouter();
  const deficiencies = useCollection(deficiencyRepo);

  const record = useMemo(
    () =>
      mode === "edit" && code
        ? deficiencies.find((d) => d.code === code || d.id === code)
        : undefined,
    [mode, code, deficiencies],
  );

  if (mode === "edit" && !record) {
    return (
      <PageContainer>
        <PageHeader title="Sửa điểm yếu" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy điểm yếu"
              description={`Không có bản ghi nào ứng với mã ${code ?? ""}. Có thể bản ghi đã bị xoá.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/khac-phuc/diem-yeu")}
                >
                  Về sổ theo dõi điểm yếu
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  if (mode === "edit" && record && !isDeficiencyEditable(record.status)) {
    return (
      <PageContainer>
        <PageHeader title={`Sửa ${record.code}`} showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconAlertTriangle size={24} />}
              title={`Điểm yếu đang ở trạng thái ${record.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung. Hãy mở lại điểm yếu trước khi cập nhật."
              action={
                <Button
                  variant="primary"
                  onClick={() =>
                    router.push(`/khac-phuc/diem-yeu/${record.code}`)
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

  return <DeficiencyFormContent mode={mode} record={record ?? null} />;
}

/* ================================================================== */
/* Content                                        */
/* ================================================================== */
const searchParams = useSearchParams();
const risks = useCollection(riskRepo) as unknown as {
  id: string;
  code: string;
  unitId?: string;
  ownerId?: string;
}[];

/**
 * Nạp sẵn khi mở form từ hồ sơ rủi ro.
 *
 * Param dùng MÃ rủi ro chứ không dùng id nội bộ, đúng quy ước đường
 * dẫn của dự án: mã đọc được và chia sẻ được.
 */
const presetFromRisk = useMemo(() => {
  const riskCode = searchParams.get("risk");
  if (!riskCode) return {};

  const r = risks.find((x) => x.code === riskCode);
  if (!r) return {};

  return {
    riskId: r.id,
    sourceType: "Tự phát hiện" as const,
    sourceRef: r.code,
    unitId: r.unitId ?? "",
    ownerId: r.ownerId ?? "",
  };
}, [searchParams, risks]);

function DeficiencyFormContent({
  mode,
  record,
}: {
  mode: DeficiencyFormMode;
  record: Deficiency | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();

  const controls = useCollection(controlRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);
  const tests = useCollection(controlTestRepo);
  const kppns = useCollection(kppnRepo);

  const [form, setForm] = useState<DeficiencyFormValue>(() =>
    emptyDeficiencyForm(presetFromRisk),
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
    setForm(deficiencyToForm(record));
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

  function patch(next: Partial<DeficiencyFormValue>) {
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

  const warnings = useMemo(() => deficiencyWarnings(form), [form]);

  /** Số hành động KPPN thật đang gắn với điểm yếu, lấy từ phía KPPN */
  const kppnCount = useMemo(
    () =>
      record ? kppns.filter((k) => k.deficiencyId === record.id).length : 0,
    [kppns, record],
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

  /** Đợt kiểm tra để chọn nhanh, lọc theo kiểm soát nếu đã chọn */
  const testOptions = useMemo(
    () =>
      tests
        .filter((x) => (form.controlId ? x.controlId === form.controlId : true))
        .map((x) => ({
          value: x.id,
          label: `${x.code} - ${x.result}`,
          description: `${x.period || "không rõ kỳ"} - kiểm tra ${formatDate(x.testDate)}`,
        })),
    [tests, form.controlId],
  );

  const selectedControl = controls.find((c) => c.id === form.controlId) ?? null;
  const selectedRisk = risks.find((r) => r.id === form.riskId) ?? null;

  const rootCauseRequired =
    form.severity === "Cao" ||
    form.severity === "Trọng yếu" ||
    form.status === "Đã lập KPPN";

  /* ---------------------- Thao tác thông minh -------------------- */

  /** Đổi mức nghiêm trọng thì gợi ý lại hạn khắc phục */
  function changeSeverity(v: string) {
    const severity = (v ?? "Trung bình") as DeficiencyFormValue["severity"];
    const nextDue = suggestDeficiencyDueDate(form.detectedDate, severity);
    patch({ severity, dueDate: form.dueDate || nextDue });
    if (
      (severity === "Cao" || severity === "Trọng yếu") &&
      !form.rootCause.trim()
    ) {
      toast.info(
        "Cần phân tích nguyên nhân gốc",
        `Điểm yếu mức ${severity} bắt buộc mô tả nguyên nhân gốc trước khi lưu.`,
      );
    }
  }

  /** Đổi kiểm soát thì gợi ý đơn vị, người phụ trách và rủi ro liên quan */
  function changeControl(id: string) {
    const c = controls.find((x) => x.id === id);
    patch({
      controlId: id,
      unitId: form.unitId || (c?.unitId ?? ""),
      ownerId: form.ownerId || (c?.ownerId ?? ""),
      riskId: form.riskId || (c?.riskIds[0] ?? ""),
    });
  }

  /** Chọn đợt kiểm tra thì tự điền mã tham chiếu, kiểm soát và mô tả */
  function changeTest(id: string) {
    const x = tests.find((t) => t.id === id);
    if (!x) return;
    const c = controls.find((y) => y.id === x.controlId);
    patch({
      sourceRef: x.code,
      controlId: x.controlId,
      unitId: form.unitId || (c?.unitId ?? ""),
      ownerId: form.ownerId || (c?.ownerId ?? ""),
      riskId: form.riskId || (c?.riskIds[0] ?? ""),
      description: form.description || x.finding,
    });
  }

  /** Chọn sự kiện thì gợi ý đơn vị và rủi ro liên quan */
  function changeEvent(id: string) {
    const e = events.find((x) => x.id === id);
    patch({
      eventId: id,
      sourceRef: form.sourceRef || (e?.code ?? ""),
      unitId: form.unitId || (e?.unitId ?? ""),
      riskId: form.riskId || (e?.relatedRiskIds[0] ?? ""),
    });
  }

  /* ---------------------------- Lưu ------------------------------ */

  function scrollToFirstError(errs: Record<string, string>) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    document
      .querySelector(`[data-field="${first}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function save(options: { thenCreateKppn?: boolean } = {}) {
    const result = validateDeficiencyForm(form);

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
        const created = deficiencyRepo.create(data, user.name);
        setDirty(false);
        toast.success(
          `Đã tạo ${created.code}`,
          "Điểm yếu được ghi nhận ở trạng thái Mới ghi nhận.",
        );
        router.replace(
          options.thenCreateKppn
            ? `/khac-phuc/kppn/them-moi?deficiency=${created.code}`
            : `/khac-phuc/diem-yeu/${created.code}`,
        );
        return;
      }

      if (record) {
        deficiencyRepo.update(record.id, data);
        setDirty(false);
        toast.success(
          `Đã lưu ${record.code}`,
          "Thông tin điểm yếu đã được cập nhật.",
        );
        router.replace(
          options.thenCreateKppn
            ? `/khac-phuc/kppn/them-moi?deficiency=${record.code}`
            : `/khac-phuc/diem-yeu/${record.code}`,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (mode === "edit" && record) {
      router.push(`/khac-phuc/diem-yeu/${record.code}`);
      return;
    }
    router.push("/khac-phuc/diem-yeu");
  }

  function handleCancel() {
    if (dirty) {
      setLeaving(true);
      return;
    }
    goBack();
  }

  /* ------------------------------ Render ------------------------- */

  const sourceIcon =
    form.sourceType === "Kiểm tra kiểm soát" ? (
      <IconShieldCheck size={16} />
    ) : form.sourceType === "Sự kiện" ? (
      <IconBolt size={16} />
    ) : form.sourceType === "Kiểm toán nội bộ" ? (
      <IconFileSearch size={16} />
    ) : (
      <IconStethoscope size={16} />
    );

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={handleCancel}
        title={
          mode === "create" ? "Thêm điểm yếu kiểm soát" : `Sửa ${record?.code}`
        }
        subtitle={
          mode === "create"
            ? "Ghi nhận khiếm khuyết của hệ thống kiểm soát nội bộ"
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
              description="Mô tả khiếm khuyết và đơn vị chịu trách nhiệm khắc phục"
            >
              <div data-field="name">
                <Input
                  label="Tên điểm yếu"
                  required
                  placeholder="Ví dụ: Thiếu cơ chế cảnh báo khi tác vụ sao lưu thất bại"
                  value={form.name}
                  error={errors.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <Textarea
                label="Mô tả chi tiết"
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Khiếm khuyết cụ thể là gì, phát hiện ở đâu, bằng chứng nào"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
              />

              <FormGrid cols={3}>
                <div data-field="severity">
                  <Select
                    label="Mức nghiêm trọng"
                    required
                    options={SEVERITY_OPTIONS}
                    value={form.severity}
                    error={errors.severity}
                    onChange={(v) => changeSeverity(v ?? "Trung bình")}
                  />
                </div>
                <div data-field="unitId">
                  <Select
                    label="Đơn vị"
                    required
                    searchable
                    placeholder="Chọn đơn vị chịu trách nhiệm"
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
                    placeholder="Chọn người phụ trách khắc phục"
                    options={lk.employeeOptions}
                    value={form.ownerId || null}
                    error={errors.ownerId}
                    onChange={(v) => patch({ ownerId: v ?? "" })}
                  />
                </div>
              </FormGrid>
            </FormSection>
          </ContentCard>

          {/* ================= 2. Nguồn phát hiện ================= */}
          <ContentCard>
            <FormSection
              title="Nguồn phát hiện và liên kết"
              description="Xác định nơi phát hiện điểm yếu để truy vết ngược về kiểm soát, rủi ro hoặc sự kiện"
            >
              <FormGrid cols={2}>
                <div data-field="sourceType">
                  <Select
                    label="Nguồn phát hiện"
                    required
                    options={SOURCE_OPTIONS}
                    value={form.sourceType}
                    error={errors.sourceType}
                    onChange={(v) =>
                      patch({
                        sourceType: (v ??
                          "Tự phát hiện") as DeficiencyFormValue["sourceType"],
                      })
                    }
                  />
                </div>
                <Input
                  label="Mã tham chiếu"
                  placeholder="Mã đợt kiểm tra, số báo cáo kiểm toán, mã sự kiện"
                  value={form.sourceRef}
                  hint="Giúp truy vết lại hồ sơ gốc khi cần đối chiếu"
                  onChange={(e) => patch({ sourceRef: e.target.value })}
                />
              </FormGrid>

              {form.sourceType === "Kiểm tra kiểm soát" && (
                <Select
                  label="Chọn nhanh từ đợt kiểm tra đã ghi nhận"
                  searchable
                  clearable
                  placeholder="Chọn đợt kiểm tra để tự điền thông tin"
                  options={testOptions}
                  value={null}
                  hint="Chọn ở đây sẽ tự điền mã tham chiếu, kiểm soát và mô tả"
                  onChange={(v) => v && changeTest(v)}
                />
              )}

              <div data-field="controlId">
                <Select
                  label="Kiểm soát liên quan"
                  required={form.sourceType === "Kiểm tra kiểm soát"}
                  searchable
                  clearable={form.sourceType !== "Kiểm tra kiểm soát"}
                  placeholder={
                    form.sourceType === "Kiểm tra kiểm soát"
                      ? "Bắt buộc chọn kiểm soát bị phát hiện điểm yếu"
                      : "Chọn kiểm soát nếu có"
                  }
                  options={controlOptions}
                  value={form.controlId || null}
                  error={errors.controlId}
                  onChange={(v) => changeControl(v ?? "")}
                />
              </div>

              <FormGrid cols={2}>
                <Select
                  label="Rủi ro liên quan"
                  searchable
                  clearable
                  placeholder="Chọn rủi ro bị ảnh hưởng"
                  options={riskOptions}
                  value={form.riskId || null}
                  onChange={(v) => patch({ riskId: v ?? "" })}
                />
                <div data-field="eventId">
                  <Select
                    label="Sự kiện gốc"
                    required={form.sourceType === "Sự kiện"}
                    searchable
                    clearable={form.sourceType !== "Sự kiện"}
                    placeholder={
                      form.sourceType === "Sự kiện"
                        ? "Bắt buộc chọn sự kiện gốc"
                        : "Chọn sự kiện nếu có"
                    }
                    options={eventOptions}
                    value={form.eventId || null}
                    error={errors.eventId}
                    onChange={(v) => changeEvent(v ?? "")}
                  />
                </div>
              </FormGrid>

              {/* Bảng tóm tắt liên kết */}
              {(selectedControl || selectedRisk) && (
                <div className="flex flex-col gap-1.5 rounded-ctrl bg-surface-alt p-3">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
                    {sourceIcon}
                    Liên kết hiện tại
                  </p>
                  {selectedControl && (
                    <p className="text-[12px] text-text-primary">
                      Kiểm soát{" "}
                      <b className="text-brand">{selectedControl.code}</b>{" "}
                      {selectedControl.name} - trạng thái{" "}
                      {selectedControl.status}
                      {selectedControl.isKeyControl
                        ? ", kiểm soát trọng yếu"
                        : ""}
                    </p>
                  )}
                  {selectedRisk && (
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-primary">
                      Rủi ro <b className="text-brand">{selectedRisk.code}</b>{" "}
                      {selectedRisk.name}
                      <RiskBadge
                        level={residualLevelOf(selectedRisk)}
                        score={residualScoreOf(selectedRisk)}
                      />
                    </p>
                  )}
                </div>
              )}
            </FormSection>
          </ContentCard>

          {/* ============ 3. Nguyên nhân gốc và thời hạn ========== */}
          <ContentCard>
            <FormSection
              title="Nguyên nhân gốc và thời hạn khắc phục"
              description="Phân tích nguyên nhân gốc là điều kiện bắt buộc để chuyển sang trạng thái Đã lập KPPN"
            >
              <div data-field="rootCause">
                <Textarea
                  label="Nguyên nhân gốc"
                  required={rootCauseRequired}
                  rows={4}
                  maxLength={1000}
                  showCount
                  placeholder="Vì sao kiểm soát không vận hành đúng thiết kế, nguyên nhân thuộc quy trình, con người hay hệ thống"
                  value={form.rootCause}
                  error={errors.rootCause}
                  hint={
                    errors.rootCause
                      ? undefined
                      : rootCauseRequired
                        ? "Bắt buộc với điểm yếu mức Cao trở lên hoặc đã lập KPPN"
                        : "Nên phân tích sớm để hành động khắc phục đúng gốc rễ"
                  }
                  onChange={(e) => patch({ rootCause: e.target.value })}
                />
              </div>

              <FormGrid cols={2}>
                <div data-field="detectedDate">
                  <DateInput
                    label="Ngày phát hiện"
                    required
                    value={form.detectedDate}
                    error={errors.detectedDate}
                    onChange={(v) => patch({ detectedDate: v })}
                  />
                </div>
                <div data-field="dueDate">
                  <DateInput
                    label="Hạn khắc phục"
                    value={form.dueDate}
                    min={form.detectedDate || undefined}
                    error={errors.dueDate}
                    hint={
                      errors.dueDate
                        ? undefined
                        : `Gợi ý theo mức ${form.severity}: ${formatDate(
                            suggestDeficiencyDueDate(
                              form.detectedDate,
                              form.severity,
                            ),
                          )}`
                    }
                    onChange={(v) => patch({ dueDate: v })}
                  />
                </div>
              </FormGrid>

              {!form.dueDate && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconAlertTriangle size={16} className="mt-px shrink-0" />
                  <span>
                    Chưa đặt hạn khắc phục. Điểm yếu sẽ không xuất hiện trong
                    danh sách quá hạn và khó theo dõi tiến độ.{" "}
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          dueDate: suggestDeficiencyDueDate(
                            form.detectedDate,
                            form.severity,
                          ),
                        })
                      }
                      className="font-semibold underline"
                    >
                      Dùng hạn gợi ý
                    </button>
                  </span>
                </div>
              )}
            </FormSection>
          </ContentCard>

          {/* ============ 4. Trạng thái xử lý (chỉ khi sửa) ======== */}
          {mode === "edit" && record && (
            <ContentCard>
              <FormSection
                title="Trạng thái xử lý"
                description="Việc chuyển trạng thái thực hiện tại màn hình chi tiết để hệ thống kiểm tra đủ điều kiện"
              >
                <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] text-text-secondary">
                  <span>
                    Trạng thái hiện tại:{" "}
                    <b className="text-text-primary">{record.status}</b>
                  </span>
                  <span>
                    Hành động KPPN đang gắn:{" "}
                    <b
                      className={cn(
                        kppnCount === 0 &&
                          (form.severity === "Cao" ||
                            form.severity === "Trọng yếu")
                          ? "text-danger"
                          : "text-text-primary",
                      )}
                    >
                      {kppnCount}
                    </b>
                  </span>
                  {record.statusNote && (
                    <span className="w-full text-[11px] text-text-hint">
                      Ghi chú trạng thái: {record.statusNote}
                    </span>
                  )}
                </div>

                {kppnCount === 0 &&
                  (form.severity === "Cao" ||
                    form.severity === "Trọng yếu") && (
                    <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
                      <IconTool size={16} className="mt-px shrink-0" />
                      <span>
                        Điểm yếu mức {form.severity} chưa có hành động khắc phục
                        nào. Bấm <b>Lưu và tạo hành động KPPN</b> ở thanh dưới
                        để lập ngay.
                      </span>
                    </div>
                  )}
              </FormSection>
            </ContentCard>
          )}
        </div>
      </PageBody>

      {/* ===================== Thanh hành động ===================== */}
      <FooterActionBar
        left={
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <RiskBadge level={form.severity} />
            <span>
              Nguồn: <b className="text-text-primary">{form.sourceType}</b>
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
        <Tooltip content="Lưu điểm yếu rồi mở luôn form tạo hành động khắc phục">
          <Button
            variant="secondary"
            icon={<IconLink size={16} />}
            loading={saving}
            onClick={() => save({ thenCreateKppn: true })}
          >
            Lưu và tạo hành động KPPN
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
          {mode === "create" ? "Thêm điểm yếu" : "Lưu thay đổi"}
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
