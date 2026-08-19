"use client";

import { useMemo } from "react";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { DateInput, RiskBadge, Select, Textarea } from "@/components/ui";
import { ContentCard } from "@/components/layout";
import { RISK_TREATMENTS } from "@/lib/domain/enums";
import {
  residualLevelOf,
  residualScoreOf,
  type RiskFormValue,
} from "@/lib/domain/risk-utils";
import type { FlatErrorMap } from "../wizard-config";
import StepTitle from "./StepTitle";

/* ==================================================================
   Bước 7: Phương án xử lý.

   Hai rule của riskFormSchema có hiệu lực ở bước này, và wizard KHÔNG
   viết lại rule, chỉ hiện lỗi khi schema báo về:

     - Rủi ro không khoan nhượng cấm chọn phương án Chấp nhận
     - Bắt buộc mô tả định hướng xử lý, trừ phương án Chấp nhận

   Riêng ô Chấp nhận bị vô hiệu ngay trên giao diện khi bật cờ không
   khoan nhượng, để người dùng không phải thử rồi mới biết bị chặn.
   ================================================================== */

const TREATMENT_DESC: Record<string, string> = {
  "Giảm thiểu": "Bổ sung hoặc tăng cường kiểm soát để hạ mức rủi ro",
  "Chuyển giao": "Mua bảo hiểm hoặc chuyển trách nhiệm sang bên thứ ba",
  Tránh: "Dừng hoặc thay đổi hoạt động phát sinh rủi ro",
  "Chấp nhận": "Giữ nguyên, chỉ theo dõi vì mức rủi ro trong khẩu vị",
};

export interface TreatStepProps {
  form: RiskFormValue;
  errors: FlatErrorMap;
  patch: (next: Partial<RiskFormValue>) => void;
}

export default function TreatStep({ form, errors, patch }: TreatStepProps) {
  const residual = residualScoreOf(form);
  const level = residualLevelOf(form);

  /** Sinh từ enum, và khoá Chấp nhận khi rủi ro không khoan nhượng */
  const options = useMemo(
    () =>
      RISK_TREATMENTS.map((v) => ({
        value: v,
        label: v,
        description:
          form.isZeroTolerance && v === "Chấp nhận"
            ? "Không dùng được vì đây là rủi ro không khoan nhượng"
            : (TREATMENT_DESC[v] ?? ""),
        disabled: form.isZeroTolerance && v === "Chấp nhận",
      })),
    [form.isZeroTolerance],
  );

  const isAccept = form.treatment === "Chấp nhận";
  const acceptHighRisk = isAccept && residual > 9;

  return (
    <ContentCard className="flex flex-col gap-4">
      <StepTitle
        index={7}
        title="Phương án xử lý"
        note="Quyết định làm gì với mức rủi ro còn lại và khi nào rà soát lại"
      />

      <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt px-3 py-2.5">
        <span className="text-[12px] text-text-secondary">
          Mức rủi ro còn lại đang xử lý
        </span>
        <RiskBadge level={level} score={residual} />
        {form.isZeroTolerance && (
          <span className="text-[12px] text-danger">
            Rủi ro không khoan nhượng
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div data-field="treatment">
          <Select
            label="Chiến lược ứng phó"
            required
            options={options}
            value={form.treatment || null}
            error={errors.treatment}
            onChange={(v) =>
              patch({ treatment: (v ?? "") as typeof form.treatment })
            }
          />
        </div>

        <div data-field="reviewDate">
          <DateInput
            label="Kỳ rà soát lại"
            min={form.identifiedDate}
            value={form.reviewDate}
            error={errors.reviewDate}
            hint={
              errors.reviewDate
                ? undefined
                : "Quá ngày này mà chưa rà soát, hệ thống sẽ hiện nhãn nhắc ở sổ rủi ro"
            }
            onChange={(v) => patch({ reviewDate: v })}
          />
        </div>
      </div>

      <div data-field="treatmentNote">
        <Textarea
          label="Định hướng xử lý"
          required={!isAccept}
          rows={3}
          maxLength={1000}
          showCount
          placeholder="Sẽ làm gì cụ thể, ai làm, mốc thời gian dự kiến"
          value={form.treatmentNote}
          error={errors.treatmentNote}
          hint={
            errors.treatmentNote
              ? undefined
              : isAccept
                ? "Không bắt buộc với phương án Chấp nhận, nhưng nên ghi lý do chấp nhận"
                : "Bắt buộc với mọi phương án khác Chấp nhận. Chọn phương án mà không nói làm gì thì không ai theo dõi được"
          }
          onChange={(e) => patch({ treatmentNote: e.target.value })}
        />
      </div>

      {/* --------- Cảnh báo chấp nhận rủi ro cao --------- */}
      {acceptHighRisk && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Chọn <b>Chấp nhận</b> với rủi ro còn lại mức <b>{level}</b> là quyết
            định cần cấp có thẩm quyền phê duyệt. Nên ghi rõ căn cứ và người phê
            duyệt trong định hướng xử lý.
          </span>
        </div>
      )}

      {!form.reviewDate && (
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-hint">
          <IconInfoCircle size={13} className="mt-px shrink-0" />
          Chưa đặt kỳ rà soát thì hệ thống không nhắc được khi số liệu đã cũ.
          Không bắt buộc, nhưng nên đặt.
        </p>
      )}
    </ContentCard>
  );
}
