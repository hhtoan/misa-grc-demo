"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCircleCheck,
  IconInfoCircle,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import { Badge, Button, Textarea, Tooltip } from "@/components/ui";

import {
  ASSESS_FLOW_STEPS,
  RELEVANCE_QUESTIONS,
  assessFlowStepViews,
  buildQuickView,
  canFinishFlow,
  describeFlowResult,
  emptyAssessFlow,
  flowStepIndexOf,
  quickHeadline,
  validateAssessStep,
  type AssessFlowErrors,
  type AssessFlowStepKey,
  type AssessFlowValue,
  type OeCriterionKey,
  type QuickTone,
  type WeaknessPriorityValue,
} from "@/lib/domain/control-assess-flow";

import { RELEVANCE_OPTIONS } from "@/lib/domain/risk-control-link";

import type { ControlAssessRow } from "@/lib/domain/control-assessment";
import type { ControlRelevance } from "@/lib/domain/enums";
import { cn } from "@/lib/cn";

/* ==================================================================
   Ngăn kéo đánh giá sâu MỘT kiểm soát với MỘT rủi ro.

   Vì sao ngăn kéo bên phải thay vì hộp thoại giữa màn hình: người dùng
   đang rà một bảng nhiều dòng. Ngăn kéo giữ nguyên bảng ở bên trái nên
   không mất ngữ cảnh dòng đang xét, và đóng lại là thấy ngay kết quả
   vừa ghi xuất hiện đúng dòng đó.

   Component KHÔNG gọi repo, không tạo bản ghi nào. Toàn bộ kết quả trả
   ra một lần qua onSubmit khi người dùng bấm Hoàn tất, để một chỗ duy
   nhất là RiskForm/index.tsx quyết định thứ tự ghi:

       liên kết Risk-Control  ->  đợt kiểm tra  ->  điểm yếu

   Thứ tự đó không đảo được, vì đợt kiểm tra cần controlId và điểm yếu
   cần cả riskId lẫn controlId.
   ================================================================== */

/** Kết quả trả về khi người dùng bấm Hoàn tất */
export interface AssessDrawerResult {
  controlId: string;

  /* --- Bước 2, luôn có --- */
  relevance: ControlRelevance;
  relevanceNote: string;

  /* --- Bước 3, chỉ có khi người dùng chủ động ghi --- */
  oe?: {
    checked: OeCriterionKey[];
    method: string;
    note: string;
  };

  /* --- Bước 4, chỉ có khi người dùng bật ghi nhận --- */
  weakness?: {
    name: string;
    description: string;
    priority: WeaknessPriorityValue;
  };
}

export interface ControlAssessDrawerProps {
  open: boolean;

  /** Dòng bảng đang đánh giá, null khi ngăn kéo đóng */
  row: ControlAssessRow | null;

  /** Bối cảnh rủi ro, để người dùng luôn thấy mình đang đối chiếu với gì */
  riskCode: string;
  riskName: string;

  unitName: (id?: string) => string;

  onClose: () => void;
  onSubmit: (result: AssessDrawerResult) => void;
}

/* ------------------------------------------------------------------ */
/* Bảng màu theo sắc thái                                              */
/* ------------------------------------------------------------------ */

const TONE_TEXT: Record<QuickTone, string> = {
  neutral: "text-text-primary",
  good: "text-lv-low-text",
  warn: "text-lv-medium-text",
  bad: "text-lv-critical-text",
};

const TONE_BOX: Record<QuickTone, string> = {
  neutral: "border-border-light bg-surface-alt text-text-secondary",
  good: "border-lv-low-border bg-lv-low-bg text-lv-low-text",
  warn: "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
  bad: "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text",
};

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export default function ControlAssessDrawer({
  open,
  row,
  riskCode,
  riskName,
  unitName,
  onClose,
  onSubmit,
}: ControlAssessDrawerProps) {
  const [step, setStep] = useState<AssessFlowStepKey>("review");
  const [value, setValue] = useState<AssessFlowValue>(emptyAssessFlow());
  const [errors, setErrors] = useState<AssessFlowErrors>({});

  /**
   * Nạp lại giá trị mỗi lần mở cho một kiểm soát khác.
   *
   * Nạp theo row.id chứ không theo open, vì người dùng thường đóng ngăn
   * kéo rồi mở ngay dòng kế bên. Nếu chỉ theo open thì kết luận của
   * dòng trước sẽ còn nguyên trong form và bị ghi nhầm sang dòng mới,
   * đúng loại lỗi không có thông báo nào.
   */
  useEffect(() => {
    if (!open || !row) return;
    setStep("review");
    setValue(emptyAssessFlow(row));
    setErrors({});
  }, [open, row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Đóng bằng phím Esc, thói quen chung của mọi lớp phủ */
  useEffect(() => {
    if (!open) return;

    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  const stepViews = useMemo(
    () => assessFlowStepViews(step, value),
    [step, value],
  );

  const quickGroups = useMemo(() => (row ? buildQuickView(row) : []), [row]);

  const headline = useMemo(() => (row ? quickHeadline(row) : null), [row]);

  const stepIndex = flowStepIndexOf(step);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === ASSESS_FLOW_STEPS.length - 1;

  if (!open || !row) return null;

  /* ------------------------- Điều hướng ---------------------------- */

  function patch(next: Partial<AssessFlowValue>) {
    setValue((prev) => ({ ...prev, ...next }));
  }

  function goNext() {
    const found = validateAssessStep(step, value);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setErrors({});
    const next = ASSESS_FLOW_STEPS[Math.min(stepIndex + 1, 3)];
    setStep(next.key);
  }

  function goBack() {
    setErrors({});
    const prev = ASSESS_FLOW_STEPS[Math.max(stepIndex - 1, 0)];
    setStep(prev.key);
  }

  /**
   * Nhảy thẳng tới một bước bằng cách bấm trên dải mini.
   *
   * Cho nhảy tự do về phía sau, nhưng đi tới thì vẫn phải qua cổng kiểm
   * tra của bước hiện tại. Nếu không, người dùng bỏ qua bước 2 rồi bấm
   * Hoàn tất ở bước 4 và không hiểu vì sao bị chặn.
   */
  function gotoStep(key: AssessFlowStepKey) {
    if (flowStepIndexOf(key) <= stepIndex) {
      setErrors({});
      setStep(key);
      return;
    }

    const found = validateAssessStep(step, value);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setErrors({});
    setStep(key);
  }

  /**
   * Gom kết quả 4 bước rồi trả về một lần duy nhất.
   *
   * Ngăn kéo KHÔNG tự ghi bản ghi nào. Nơi gọi mới biết thứ tự đúng:
   * liên kết Risk-Control trước, rồi đợt kiểm tra, cuối cùng là điểm
   * yếu. Đảo thứ tự thì điểm yếu sẽ mồ côi vì thiếu controlId.
   *
   * Chỉ kiểm tra lại bước 2, vì bước 3 và 4 tuỳ chọn. Nếu bước 2 chưa
   * xong thì nhảy thẳng về đó thay vì chỉ báo lỗi, để người dùng không
   * phải tự đi tìm chỗ còn thiếu.
   */
  function submit() {
    const found = validateAssessStep("relevance", value);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStep("relevance");
      return;
    }

    if (!row || !value.relevance) return;

    onSubmit({
      controlId: row.id,
      relevance: value.relevance,
      relevanceNote: value.relevanceNote.trim(),

      oe: value.oeSubmitted
        ? {
            checked: value.oeChecked,
            method: value.oeMethod,
            note: value.oeNote.trim(),
          }
        : undefined,

      weakness:
        value.hasWeakness && value.weaknessName.trim()
          ? {
              name: value.weaknessName.trim(),
              description: value.weaknessDescription.trim(),
              priority: value.weaknessPriority,
            }
          : undefined,
    });

    onClose();
  }

  /* ============================ Render ============================= */

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* ---------------------- Lớp phủ nền ---------------------- */}
      <div
        className="absolute inset-0 bg-black/25"
        onClick={onClose}
        aria-hidden
      />

      {/* ------------------------ Ngăn kéo ------------------------ */}
      <aside className="relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl">
        {/* ======================= Header ======================= */}
        <header className="flex flex-col gap-2 border-b border-border-light px-4 py-3">
          <div className="flex items-start gap-2">
            <IconShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold text-brand">
                  {row.code}
                </span>
                {row.isKeyControl && (
                  <Badge tone="brand" size="sm">
                    Trọng yếu
                  </Badge>
                )}
                {row.assessed ? (
                  <Badge tone="neutral" size="sm">
                    Đã kết luận {row.relevance}
                  </Badge>
                ) : (
                  <Badge tone="warning" size="sm">
                    Chưa đánh giá
                  </Badge>
                )}
              </span>

              <span className="truncate text-[14px] font-semibold text-text-primary">
                {row.name || "Kiểm soát chưa đặt tên"}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl text-icon-neutral transition-colors hover:bg-surface-alt"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Bối cảnh rủi ro: người dùng phải luôn nhớ mình đang đối
              chiếu kiểm soát này với rủi ro NÀO, vì cùng một kiểm soát
              có thể rất phù hợp với rủi ro A và vô can với rủi ro B */}
          <div className="flex items-start gap-1.5 rounded-ctrl bg-surface-alt px-2.5 py-1.5">
            <IconInfoCircle size={13} className="mt-px shrink-0 text-brand" />
            <span className="min-w-0 text-[11px] leading-4 text-text-secondary">
              Đang đánh giá với rủi ro{" "}
              <b className="text-text-primary">{riskCode || "đang khai báo"}</b>
              {riskName ? ` · ${riskName}` : ""}
            </span>
          </div>
        </header>

        {/* ==================== Dải 4 bước mini ==================== */}
        <nav className="flex items-stretch gap-1 border-b border-border-light px-4 py-2">
          {stepViews.map((s, i) => {
            const active = s.key === step;

            return (
              <Tooltip key={s.key} content={s.description}>
                <button
                  type="button"
                  onClick={() => gotoStep(s.key)}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col gap-1 rounded-ctrl border px-2 py-1.5 text-left transition-colors",
                    active
                      ? "border-brand bg-brand-light"
                      : s.state === "done"
                        ? "border-lv-low-border bg-lv-low-bg"
                        : "border-border-light bg-white hover:border-brand",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                        s.state === "done"
                          ? "bg-lv-low-text text-white"
                          : active
                            ? "bg-brand text-white"
                            : "bg-surface-alt text-text-secondary",
                      )}
                    >
                      {s.state === "done" ? (
                        <IconCircleCheck size={12} />
                      ) : (
                        i + 1
                      )}
                    </span>

                    {ASSESS_FLOW_STEPS[i].optional && !active && (
                      <span className="text-[9px] uppercase tracking-wide text-text-hint">
                        tuỳ chọn
                      </span>
                    )}
                  </span>

                  <span
                    className={cn(
                      "truncate text-[11px] leading-4",
                      active ? "font-medium text-brand" : "text-text-secondary",
                    )}
                  >
                    {s.label}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </nav>

        {/* ======================== Thân ======================== */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {/* ============ Bước 1: Xem nhanh, CHỈ ĐỌC ============ */}
          {step === "review" && (
            <>
              {/* --- Câu tóm tắt, nói thẳng điều bất thường nếu có --- */}
              {headline && (
                <div
                  className={cn(
                    "flex gap-2 rounded-card border p-3 text-[12px] leading-4",
                    TONE_BOX[headline.tone],
                  )}
                >
                  {headline.tone === "good" ? (
                    <IconCircleCheck size={17} className="mt-px shrink-0" />
                  ) : (
                    <IconAlertTriangle size={17} className="mt-px shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">{headline.text}</span>
                </div>
              )}

              {/* --- Bốn nhóm thông tin, gom theo câu hỏi cần trả lời --- */}
              {quickGroups.map((g) => (
                <section key={g.title} className="flex flex-col gap-2">
                  <p className="text-[12px] font-semibold text-text-primary">
                    {g.title}
                  </p>

                  <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-card border border-border-light p-3 sm:grid-cols-2">
                    {g.fields.map((f) => (
                      <div key={f.label} className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-text-secondary">
                          {f.label}
                        </span>
                        <span
                          className={cn(
                            "text-[13px]",
                            TONE_TEXT[f.tone ?? "neutral"],
                          )}
                        >
                          {f.value}
                        </span>
                        {f.hint && (
                          <span className="text-[11px] leading-4 text-text-hint">
                            {f.hint}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {/* --- Đơn vị quản lý, tra từ hàm cha truyền vào --- */}
              <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-hint">
                <IconInfoCircle size={13} className="mt-px shrink-0" />
                Đơn vị quản lý kiểm soát:{" "}
                <b>{unitName(row.unitId) || "chưa gán"}</b>. Bước này chỉ để đọc
                lại hồ sơ, mọi kết luận nằm ở ba bước sau.
              </p>
            </>
          )}

          {/* ========== Bước 2: Xác nhận phù hợp với rủi ro ========== */}
          {step === "relevance" && (
            <>
              <div className="flex gap-2 rounded-card border border-lv-info-border bg-lv-info-bg p-3 text-[12px] leading-4 text-lv-info-text">
                <IconInfoCircle size={17} className="mt-px shrink-0" />
                <span>
                  Đây là câu hỏi <b>khác hẳn</b> với việc kiểm soát có chạy tốt
                  không. Một kiểm soát hoàn toàn hiệu quả vẫn có thể được gắn
                  nhầm vào một rủi ro mà nó không hề bảo vệ, và đó đúng là loại
                  sai sót kiểm toán nội bộ hay phát hiện.
                </span>
              </div>

              {/* ---------- Bộ câu hỏi tự rà, không gợi ý đáp án ---------- */}
              <section className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold text-text-primary">
                  Tự rà ba câu này trước khi kết luận
                </p>

                <ol className="flex flex-col gap-1.5">
                  {RELEVANCE_QUESTIONS.map((q, i) => (
                    <li
                      key={q.question}
                      className="flex gap-2.5 rounded-card border border-border-light p-2.5"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[11px] font-semibold text-text-secondary">
                        {i + 1}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[13px] leading-5 text-text-primary">
                          {q.question}
                        </span>
                        <span className="text-[11px] leading-4 text-text-hint">
                          {q.hint}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              {/* ---------- Ba lựa chọn dạng thẻ ---------- */}
              <section className="flex flex-col gap-2" data-field="relevance">
                <p className="text-[12px] font-semibold text-text-primary">
                  Kết luận mức phù hợp
                  <span className="ml-0.5 text-danger">*</span>
                </p>

                <div className="flex flex-col gap-1.5">
                  {RELEVANCE_OPTIONS.map((o) => {
                    const active = value.relevance === o.value;
                    const danger = o.value === "Không phù hợp";

                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          setErrors({});
                          patch({ relevance: o.value as ControlRelevance });
                        }}
                        className={cn(
                          "flex items-start gap-2.5 rounded-card border px-3 py-2.5 text-left transition-colors",
                          active
                            ? danger
                              ? "border-lv-critical-border bg-lv-critical-bg"
                              : "border-brand bg-brand-light"
                            : "border-border-light bg-white hover:border-brand",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            active
                              ? danger
                                ? "border-lv-critical-text bg-lv-critical-text"
                                : "border-brand bg-brand"
                              : "border-border-neutral bg-white",
                          )}
                        >
                          {active && (
                            <IconCircleCheck size={12} className="text-white" />
                          )}
                        </span>

                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className={cn(
                              "text-[13px] font-medium",
                              active
                                ? danger
                                  ? "text-lv-critical-text"
                                  : "text-brand"
                                : "text-text-primary",
                            )}
                          >
                            {o.label}
                          </span>
                          <span className="text-[11px] leading-4 text-text-secondary">
                            {o.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {errors.relevance && (
                  <p className="flex items-start gap-1 text-[12px] leading-4 text-danger">
                    <IconAlertTriangle size={13} className="mt-px shrink-0" />
                    {errors.relevance}
                  </p>
                )}
              </section>

              {/* ---------- Ô lý do, bắt buộc khi Không phù hợp ---------- */}
              <div data-field="relevanceNote">
                <Textarea
                  label="Căn cứ kết luận"
                  required={value.relevance === "Không phù hợp"}
                  rows={3}
                  maxLength={500}
                  showCount
                  error={errors.relevanceNote}
                  placeholder={
                    value.relevance === "Không phù hợp"
                      ? "Ví dụ: Kiểm soát này đối chiếu công nợ, không liên quan tới nguyên nhân gián đoạn hệ thống"
                      : "Nêu ngắn gọn kiểm soát này chặn nguyên nhân nào, hoặc còn hở phần nào"
                  }
                  value={value.relevanceNote}
                  onChange={(e) => patch({ relevanceNote: e.target.value })}
                />

                <p className="mt-1 text-[11px] leading-4 text-text-hint">
                  {value.relevance === "Không phù hợp"
                    ? "Bắt buộc nêu lý do, vì đây là căn cứ để gỡ kiểm soát khỏi rủi ro."
                    : "Không bắt buộc, nhưng một dòng căn cứ giúp lần rà soát sau không phải đánh giá lại từ đầu."}
                </p>
              </div>

              {/* ---------- Nhắc hệ quả của kết luận vừa chọn ---------- */}
              {value.relevance === "Không phù hợp" && (
                <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
                  <IconAlertTriangle size={16} className="mt-px shrink-0" />
                  <span>
                    Kiểm soát này sẽ <b>không được tính</b> là đang bảo vệ rủi
                    ro, và bị loại khỏi phép tính gợi ý điểm còn lại ở bước 6.
                    Anh nên gỡ nó khỏi hồ sơ, hoặc tìm kiểm soát khác thay thế.
                  </span>
                </div>
              )}

              {value.relevance === "Phù hợp một phần" && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconAlertTriangle size={16} className="mt-px shrink-0" />
                  <span>
                    Kiểm soát vẫn được tính nhưng chỉ che một phần rủi ro. Phần
                    còn hở nên được nêu ở bước <b>Phát hiện điểm yếu</b>, nếu
                    không nó sẽ biến mất khỏi hồ sơ ngay sau buổi đánh giá này.
                  </span>
                </div>
              )}
            </>
          )}

          {/* ====== Bước 3 và 4: dựng thật ở nhịp E4b ====== */}
          {(step === "effectiveness" || step === "weakness") && (
            <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-neutral bg-surface-alt px-4 py-10 text-center">
              <IconInfoCircle size={22} className="text-icon-neutral" />
              <p className="text-[13px] font-medium text-text-primary">
                {step === "effectiveness"
                  ? "Cập nhật hiệu quả vận hành"
                  : "Phát hiện điểm yếu"}
              </p>
              <p className="max-w-[420px] text-[12px] leading-4 text-text-secondary">
                {step === "effectiveness"
                  ? "Bước này sẽ cho phép ghi một đợt tự đánh giá nhanh theo ba tiêu chí, sinh ra bản ghi kiểm tra thật để hiệu lực vận hành luôn có bằng chứng đi kèm."
                  : "Bước này sẽ cho phép ghi nhận khe hở vừa thấy thành một điểm yếu, gắn sẵn với kiểm soát và rủi ro đang đánh giá."}
              </p>
              <p className="text-[11px] text-text-hint">
                Bước tuỳ chọn. Anh bấm <b>Ghi kết luận</b> ngay cũng được, mức
                phù hợp vừa chọn vẫn được lưu đầy đủ.
              </p>
            </div>
          )}
        </div>

        {/* ======================== Footer ======================== */}
        <footer className="flex flex-col gap-2 border-t border-border-light px-4 py-3">
          <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-secondary">
            <IconInfoCircle size={13} className="mt-px shrink-0" />
            {describeFlowResult(value)}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="text" onClick={onClose}>
              Đóng
            </Button>

            <span className="ml-auto flex flex-wrap items-center gap-2">
              {!isFirst && (
                <Button
                  variant="secondary"
                  icon={<IconArrowLeft size={16} />}
                  onClick={goBack}
                >
                  Quay lại
                </Button>
              )}

              {!isLast && (
                <Button
                  variant="secondary"
                  icon={<IconArrowRight size={16} />}
                  onClick={goNext}
                >
                  Bước tiếp theo
                </Button>
              )}

              <Tooltip
                content={
                  canFinishFlow(value)
                    ? "Lưu kết luận và đóng ngăn kéo"
                    : "Cần chọn mức phù hợp ở bước 2 trước"
                }
              >
                <span className="inline-flex">
                  <Button
                    variant="primary"
                    icon={<IconCircleCheck size={16} />}
                    disabled={!canFinishFlow(value)}
                    onClick={submit}
                  >
                    Ghi kết luận
                  </Button>
                </span>
              </Tooltip>
            </span>
          </div>
        </footer>
      </aside>
    </div>
  );
}
