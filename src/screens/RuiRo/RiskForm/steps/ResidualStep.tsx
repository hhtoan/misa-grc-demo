"use client";

import {
  IconAlertTriangle,
  IconArrowRight,
  IconBulb,
  IconCircleCheck,
  IconInfoCircle,
  IconRefresh,
  IconShieldCheck,
  IconTool,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  EffectivenessBadge,
  RiskBadge,
  ScoreSelector,
  Textarea,
  Tooltip,
  type ScoreValue,
} from "@/components/ui";
import { ContentCard } from "@/components/layout";
import { RISK_SCORING_CRITERIA } from "@/lib/domain/scoring-criteria";
import {
  inherentLevelOf,
  inherentScoreOf,
  residualLevelOf,
  residualScoreOf,
  type RiskFormValue,
} from "@/lib/domain/risk-utils";
import { overallEffectivenessOf } from "@/lib/domain/control-utils";
import {
  describeSuggestion,
  exclusionReasonOf,
  isControlCounted,
  type ResidualSuggestion,
} from "@/lib/domain/residual-suggestion";
import type { FlatErrorMap } from "../wizard-config";
import type { ControlLite } from "../types";
import StepTitle from "./StepTitle";

/* ==================================================================
   Bước 6: Đánh giá rủi ro còn lại.

   Ba nguyên tắc của bước này, theo quyết định chốt ngày 18/08/2026:

   1. HỆ THỐNG GỢI Ý, NGƯỜI DÙNG QUYẾT.
      Điểm được pre-fill từ suggestResidual, người dùng sửa tự do. Mọi
      lần ghi đè đều lưu vết qua suggestedResidualLikelihood và
      suggestedResidualImpact.

   2. KHÔNG CHẶN ĐIỂM CÒN LẠI CAO HƠN VỐN CÓ.
      Prop maxValue của ScoreSelector đã được GỠ HẲN. Đây là lớp chặn
      thứ ba mà tài liệu bỏ sót, hai lớp kia là superRefine ở schema và
      điều kiện trong validateStep.

   3. CAO HƠN VỐN CÓ THÌ BẮT BUỘC NÊU CĂN CỨ.
      Rule này nằm ở riskFormSchema nên bước này không viết lại, chỉ
      hiện lỗi ở ô Luận cứ khi schema báo về.
   ================================================================== */

export interface ResidualStepProps {
  form: RiskFormValue;
  errors: FlatErrorMap;
  touched: string[];
  pickedControls: ControlLite[];
  suggestion: ResidualSuggestion;
  /** Người dùng có khai nghi ngờ điểm yếu ở bước 5 không */
  hasWeakness: boolean;
  patch: (next: Partial<RiskFormValue>) => void;
  markTouched: (...fields: string[]) => void;
}

export default function ResidualStep({
  form,
  errors,
  touched,
  pickedControls,
  suggestion,
  hasWeakness,
  patch,
  markTouched,
}: ResidualStepProps) {
  const inherentScore = inherentScoreOf(form);
  const residual = residualScoreOf(form);

  const counted = pickedControls.filter(isControlCounted);
  const excluded = pickedControls.filter((c) => !isControlCounted(c));

  /* Người dùng đã sửa khác gợi ý chưa */
  const overridden =
    form.suggestedResidualLikelihood !== undefined &&
    form.suggestedResidualImpact !== undefined &&
    (form.residualLikelihood !== form.suggestedResidualLikelihood ||
      form.residualImpact !== form.suggestedResidualImpact);

  const isHigher = residual > inherentScore;

  /**
   * Người dùng để nguyên bằng điểm vốn có TRONG KHI gợi ý có giảm.
   *
   * Điều kiện phải có phần "trong khi gợi ý có giảm", nếu không thì khi
   * thuật toán tính ra không giảm được bậc nào, form tự điền bằng vốn
   * có và cảnh báo này sẽ tự bật lên tố cáo chính hệ thống.
   */
  const ignoredReduction =
    residual === inherentScore && suggestion.hasReduction;

  function applySuggestion() {
    markTouched("residualLikelihood", "residualImpact");
    patch({
      residualLikelihood: suggestion.likelihood,
      residualImpact: suggestion.impact,
      suggestedResidualLikelihood: suggestion.likelihood,
      suggestedResidualImpact: suggestion.impact,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      {/* ================= Cột căn cứ, chỉ đọc ================= */}
      <ContentCard className="flex flex-col gap-3 xl:col-span-2">
        <p className="text-[13px] font-semibold text-text-primary">
          Căn cứ đánh giá
        </p>

        {/* --------- Điểm vốn có --------- */}
        <div className="flex flex-col gap-1.5 rounded-ctrl bg-surface-alt p-2.5">
          <p className="text-[12px] text-text-secondary">Điểm vốn có đã chấm</p>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={inherentLevelOf(form)} score={inherentScore} />
            <span className="text-[12px] text-text-secondary">
              Khả năng {form.inherentLikelihood} × Ảnh hưởng{" "}
              {form.inherentImpact}
            </span>
          </div>
        </div>

        {/* --------- Kiểm soát được tính --------- */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-text-secondary">
            Kiểm soát được tính vào gợi ý ({counted.length})
          </p>

          {counted.length === 0 ? (
            <p className="rounded-ctrl bg-surface-alt p-2.5 text-[12px] leading-4 text-text-hint">
              {form.noControlAccepted
                ? "Đã tuyên bố chấp nhận rủi ro, không áp dụng kiểm soát nào."
                : "Không có kiểm soát nào đủ điều kiện tính. Kiểm soát phải đã phê duyệt và đã có kết luận hiệu lực."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {counted.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-1 rounded-ctrl border border-border-light p-2"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium text-brand">
                      {c.code}
                    </span>
                    {c.isKeyControl && (
                      <Badge tone="brand" size="sm">
                        Trọng yếu
                      </Badge>
                    )}
                  </span>
                  <span className="truncate text-[12px] text-text-primary">
                    {c.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <EffectivenessBadge
                      size="sm"
                      value={overallEffectivenessOf(c)}
                    />
                    <span className="text-[11px] text-text-hint">
                      {c.type} · {c.nature}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* --------- Kiểm soát bị loại --------- */}
        {excluded.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12px] text-text-secondary">
              Bị loại khỏi phép tính ({excluded.length})
            </p>
            <ul className="flex flex-col gap-1">
              {excluded.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col rounded-ctrl bg-surface-alt px-2 py-1.5"
                >
                  <span className="truncate text-[12px] text-text-secondary">
                    <b className="text-text-primary">{c.code}</b> {c.name}
                  </span>
                  <span className="text-[11px] leading-4 text-text-hint">
                    {exclusionReasonOf(c)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* --------- Diễn giải gợi ý --------- */}
        <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
          <IconBulb size={16} className="mt-px shrink-0" />
          <span className="min-w-0 flex-1">
            {describeSuggestion(suggestion)}
          </span>
        </div>

        {/* --------- Nhắc về điểm yếu vừa khai --------- */}
        {hasWeakness && (
          <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
            <IconTool size={16} className="mt-px shrink-0" />
            <span>
              Anh vừa ghi nhận nghi ngờ điểm yếu ở bước 5. Gợi ý của hệ thống{" "}
              <b>chưa tính tới điểm yếu đó</b>, nên có thể đang lạc quan hơn
              thực tế. Hãy cân nhắc chấm cao hơn gợi ý.
            </span>
          </div>
        )}
      </ContentCard>

      {/* ================= Cột chấm điểm ================= */}
      <ContentCard className="flex flex-col gap-4 xl:col-span-3">
        <StepTitle
          index={6}
          title="Đánh giá rủi ro còn lại"
          note="Hệ thống đã điền sẵn theo tập kiểm soát, anh xác nhận hoặc điều chỉnh tự do"
        />

        {/* --------- Dải so sánh với gợi ý --------- */}
        <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt px-3 py-2.5">
          <IconBulb size={15} className="shrink-0 text-brand" />
          <span className="text-[12px] text-text-secondary">
            Hệ thống gợi ý
          </span>
          <b className="text-[12px] text-text-primary">
            {suggestion.likelihood} × {suggestion.impact} = {suggestion.score}{" "}
            điểm
          </b>

          {overridden ? (
            <>
              <Tooltip content="Anh đã điều chỉnh khác gợi ý. Hệ thống lưu lại cả hai con số để phục vụ rà soát về sau">
                <Badge tone="warning" size="sm">
                  Đã điều chỉnh
                </Badge>
              </Tooltip>
              <Button
                variant="text"
                size="sm"
                icon={<IconRefresh size={14} />}
                onClick={applySuggestion}
              >
                Dùng lại gợi ý
              </Button>
            </>
          ) : (
            <Badge tone="neutral" size="sm" dot>
              Đang dùng gợi ý
            </Badge>
          )}
        </div>

        {/* --------- Bảng chấm điểm, KHÔNG có maxValue --------- */}
        <ScoreSelector
          criteria={RISK_SCORING_CRITERIA}
          value={{
            likelihood: form.residualLikelihood,
            impact: form.residualImpact,
          }}
          compareValue={{
            likelihood: form.inherentLikelihood,
            impact: form.inherentImpact,
          }}
          compareLabel="Vốn có"
          errors={{
            likelihood: errors.residualLikelihood,
            impact: errors.residualImpact,
          }}
          onChange={(v: ScoreValue) => {
            const nextL = v.likelihood ?? form.residualLikelihood;
            const nextI = v.impact ?? form.residualImpact;

            if (nextL !== form.residualLikelihood)
              markTouched("residualLikelihood");
            if (nextI !== form.residualImpact) markTouched("residualImpact");

            patch({ residualLikelihood: nextL, residualImpact: nextI });
          }}
          summary={
            <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt p-3">
              <span className="flex flex-col gap-1">
                <span className="text-[11px] text-text-secondary">Vốn có</span>
                <RiskBadge
                  level={inherentLevelOf(form)}
                  score={inherentScore}
                />
              </span>

              <IconArrowRight size={16} className="text-icon-neutral" />

              <span className="flex flex-col gap-1">
                <span className="text-[11px] text-text-secondary">Còn lại</span>
                <RiskBadge level={residualLevelOf(form)} score={residual} />
              </span>

              <span className="ml-auto text-[12px]">
                {residual < inherentScore && (
                  <span className="inline-flex items-center gap-1 font-medium text-lv-low-text">
                    <IconCircleCheck size={14} />
                    Giảm {inherentScore - residual} điểm
                  </span>
                )}
                {residual === inherentScore && (
                  <span className="text-text-secondary">
                    Giữ nguyên so với vốn có
                  </span>
                )}
                {residual > inherentScore && (
                  <span className="inline-flex items-center gap-1 font-medium text-lv-medium-text">
                    <IconAlertTriangle size={14} />
                    Tăng {residual - inherentScore} điểm
                  </span>
                )}
              </span>
            </div>
          }
        />

        {/* --------- Cảnh báo mềm: cao hơn vốn có --------- */}
        {isHigher && (
          <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
            <IconAlertTriangle size={16} className="mt-px shrink-0" />
            <span>
              Điểm còn lại <b>cao hơn</b> điểm vốn có. Đây là trường hợp{" "}
              <b>hợp lệ</b>, thường gặp khi kiểm soát mới làm phát sinh rủi ro
              thứ cấp, hoặc bối cảnh xấu đi sau lần đánh giá vốn có. Hệ thống
              không chặn, nhưng <b>bắt buộc nêu căn cứ</b> ở ô bên dưới để kiểm
              toán nội bộ đọc lại vẫn hiểu được.
            </span>
          </div>
        )}

        {/* --------- Nhắc khi bỏ qua phần giảm mà hệ thống đề xuất --------- */}
        {ignoredReduction && (
          <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
            <IconShieldCheck size={16} className="mt-px shrink-0" />
            <span>
              Điểm còn lại đang <b>giữ nguyên</b> như vốn có, trong khi hệ thống
              đề xuất giảm <b>{suggestion.steps} bậc</b> dựa trên{" "}
              {suggestion.aggregate.countedCount} kiểm soát đã đánh giá. Nếu
              đúng là kiểm soát không mang lại tác dụng thực tế thì nên nêu rõ
              trong luận cứ.
            </span>
          </div>
        )}

        {/* --------- Luận cứ --------- */}
        <div data-field="residualRationale">
          <Textarea
            label="Luận cứ đánh giá"
            required={isHigher}
            rows={3}
            maxLength={800}
            showCount
            placeholder="Vì sao chốt ở mức này, kiểm soát nào tạo ra tác dụng đó, còn khe hở nào"
            value={form.residualRationale ?? ""}
            error={errors.residualRationale}
            hint={
              errors.residualRationale
                ? undefined
                : isHigher
                  ? "Bắt buộc vì điểm còn lại cao hơn vốn có"
                  : "Không bắt buộc, nhưng rất cần khi hạ nhiều bậc hoặc khi chấm khác gợi ý của hệ thống"
            }
            onChange={(e) => patch({ residualRationale: e.target.value })}
          />
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-hint">
          <IconInfoCircle size={13} className="mt-px shrink-0" />
          Con số hệ thống đưa ra chỉ là <b>đề xuất</b>. Quyết định cuối cùng
          thuộc về người đánh giá, và hệ thống lưu lại cả hai con số để so sánh
          về sau.
        </p>
      </ContentCard>
    </div>
  );
}
