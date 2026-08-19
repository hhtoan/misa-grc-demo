"use client";

import {
  IconAlertTriangle,
  IconCoin,
  IconInfoCircle,
  IconRadar,
} from "@tabler/icons-react";
import {
  Input,
  RiskBadge,
  ScoreSelector,
  type ScoreValue,
} from "@/components/ui";
import { ContentCard } from "@/components/layout";
import { RISK_SCORING_CRITERIA } from "@/lib/domain/scoring-criteria";
import {
  inherentLevelOf,
  inherentScoreOf,
  type RiskFormValue,
} from "@/lib/domain/risk-utils";
import type { FlatErrorMap } from "../wizard-config";
import StepTitle from "./StepTitle";

/* ==================================================================
   Bước 3: Đánh giá rủi ro vốn có.

   Hai điểm nghiệp vụ của bước này:

   1. CHẤM KHI GIẢ ĐỊNH CHƯA CÓ KIỂM SOÁT NÀO.
      Nếu chấm theo tình trạng hiện tại thì mất mốc so sánh, và không
      đo được kiểm soát đang mang lại giá trị gì.

   2. ĐIỂM 3/3 LÀ GIÁ TRỊ KHỞI TẠO, KHÔNG PHẢI ĐÁNH GIÁ.
      score là trường bắt buộc 1 tới 5 nên emptyRiskForm đặt 3/3, và
      schema không bao giờ báo thiếu điểm. Bước này nhắc mềm khi người
      dùng chưa chạm vào bảng chấm, nhưng KHÔNG chặn, vì 3/3 vẫn hợp lệ
      nếu đó thực sự là kết luận của họ.
   ================================================================== */

export interface InherentStepProps {
  form: RiskFormValue;
  errors: FlatErrorMap;
  touched: string[];
  patch: (next: Partial<RiskFormValue>) => void;
  markTouched: (...fields: string[]) => void;
  expandedByDefault?: boolean;
}

export default function InherentStep({
  form,
  errors,
  touched,
  patch,
  markTouched,
  expandedByDefault = true,
}: InherentStepProps) {
  const score = inherentScoreOf(form);
  const level = inherentLevelOf(form);
  const requiresControl = score > 9;

  const notTouched =
    !touched.includes("inherentLikelihood") &&
    !touched.includes("inherentImpact");

  const isStillDefault =
    notTouched && form.inherentLikelihood === 3 && form.inherentImpact === 3;

  return (
    <ContentCard className="flex flex-col gap-4">
      <StepTitle
        index={3}
        title="Đánh giá rủi ro vốn có"
        note="Chấm điểm khi giả định CHƯA có kiểm soát nào. Đây là mốc để so sánh về sau"
      />

      <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
        <IconInfoCircle size={16} className="mt-px shrink-0" />
        <span>
          Rủi ro vốn có là mức rủi ro <b>trước khi</b> tính tới tác dụng của
          kiểm soát. Nếu chấm luôn theo tình trạng hiện tại thì mất mốc so sánh,
          và không đo được kiểm soát đang mang lại giá trị gì.
        </span>
      </div>

      {/* --------- Nhắc mềm khi điểm còn ở mức khởi tạo --------- */}
      {isStillDefault && (
        <div className="flex gap-2 rounded-ctrl border border-border-neutral bg-surface-alt p-2.5 text-[12px] leading-4 text-text-secondary">
          <IconRadar size={16} className="mt-px shrink-0" />
          <span>
            Hai dòng điểm đang ở <b>mức mặc định 3</b>. Hãy xác nhận lại hoặc
            điều chỉnh, vì điểm 3 nhìn từ bên ngoài trông giống một đánh giá có
            chủ đích và sẽ được dùng làm mốc cho mọi kỳ sau.
          </span>
        </div>
      )}

      <ScoreSelector
        criteria={RISK_SCORING_CRITERIA}
        expandedByDefault={expandedByDefault}
        value={{
          likelihood: form.inherentLikelihood,
          impact: form.inherentImpact,
        }}
        errors={{
          likelihood: errors.inherentLikelihood,
          impact: errors.inherentImpact,
        }}
        onChange={(v: ScoreValue) => {
          const nextL = v.likelihood ?? form.inherentLikelihood;
          const nextI = v.impact ?? form.inherentImpact;

          if (nextL !== form.inherentLikelihood)
            markTouched("inherentLikelihood");
          if (nextI !== form.inherentImpact) markTouched("inherentImpact");

          patch({ inherentLikelihood: nextL, inherentImpact: nextI });
        }}
        summary={
          <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt p-3">
            <span className="text-[12px] text-text-secondary">
              Rủi ro vốn có
            </span>
            <RiskBadge level={level} score={score} />
            <span className="text-[12px] text-text-secondary">
              Khả năng {form.inherentLikelihood} × Ảnh hưởng{" "}
              {form.inherentImpact} = <b>{score} điểm</b>
            </span>
          </div>
        }
      />

      {/* -------------- Ước lượng tổn thất -------------- */}
      <div
        data-field="estimatedLoss"
        className="flex flex-col gap-2 rounded-card border border-border-light p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <IconCoin size={16} className="text-brand" />
          <span className="text-[13px] font-semibold text-text-primary">
            Ước lượng tổn thất nếu rủi ro xảy ra
          </span>
        </div>

        <Input
          type="number"
          min={0}
          step={1000000}
          placeholder="Để trống nếu chưa lượng hoá được"
          value={form.estimatedLoss === null ? "" : String(form.estimatedLoss)}
          error={errors.estimatedLoss}
          hint={
            errors.estimatedLoss
              ? undefined
              : "Đơn vị đồng. Con số này là căn cứ trực tiếp cho mức Ảnh hưởng vừa chấm, nên hai thông tin cần nhất quán với nhau"
          }
          onChange={(e) => {
            const raw = e.target.value.trim();
            patch({ estimatedLoss: raw === "" ? null : Number(raw) });
          }}
        />
      </div>

      {/* -------------- Cảnh báo bắt buộc có kiểm soát -------------- */}
      {requiresControl && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Điểm vốn có <b>{score}</b> thuộc mức <b>{level}</b>, nên ở bước 4{" "}
            <b>bắt buộc</b> phải gắn ít nhất 1 kiểm soát đã phê duyệt. Ô tuyên
            bố chấp nhận rủi ro sẽ bị khoá.
          </span>
        </div>
      )}
    </ContentCard>
  );
}
