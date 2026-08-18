/* ==================================================================
   Hiệu lực kiểm soát theo hai chiều.

   Design Effectiveness  - thiết kế có đúng không, nếu chạy đúng như
                           mô tả thì có ngăn được rủi ro
   Operation Effectiveness - có đang được thực hiện đúng thiết kế không

   Hai chiều này dẫn tới HAI HÀNH ĐỘNG KHẮC PHỤC KHÁC NHAU, nên bắt
   buộc phải tách. Thiết kế sai thì phải thiết kế lại, vận hành sai
   thì phải chấn chỉnh người thực hiện.
   ================================================================== */

/* ------------------------------------------------------------------ */
/* Kiểu tối giản, không import từ schema để không vỡ build khi schema  */
/* chưa bổ sung đủ trường                                        */
/* ------------------------------------------------------------------ */

export type EffectivenessValue =
  | "Hiệu quả"
  | "Hiệu quả một phần"
  | "Không hiệu quả"
  | "Chưa đánh giá";

export interface ControlEffectivenessInput {
  designEffectiveness?: string | null;
  operationEffectiveness?: string | null;
  /** Trường cũ, giữ để tương thích trong một lô rồi gỡ */
  lastTestResult?: string | null;
  status?: string | null;
  isKeyControl?: boolean;
  lastAssessedAt?: string | null;
}

export const NOT_ASSESSED: EffectivenessValue = "Chưa đánh giá";

/** Thứ tự từ tốt tới xấu, dùng khi sắp xếp bảng */
export const EFFECTIVENESS_ORDER: Record<EffectivenessValue, number> = {
  "Hiệu quả": 1,
  "Hiệu quả một phần": 2,
  "Không hiệu quả": 3,
  "Chưa đánh giá": 4,
};

/* ------------------------------------------------------------------ */
/* Chuẩn hoá giá trị                                        */
/* ------------------------------------------------------------------ */

/**
 * Đưa một chuỗi bất kỳ về đúng 4 giá trị hợp lệ.
 * Chuỗi rỗng, null hoặc giá trị lạ đều thành Chưa đánh giá,
 * KHÔNG bao giờ ngầm hiểu là Hiệu quả.
 */
export function normalizeEffectiveness(
  value: string | null | undefined,
): EffectivenessValue {
  const v = (value ?? "").trim();
  if (v === "Hiệu quả") return "Hiệu quả";
  if (v === "Hiệu quả một phần") return "Hiệu quả một phần";
  if (v === "Không hiệu quả") return "Không hiệu quả";
  return NOT_ASSESSED;
}

/**
 * Đọc Design Effectiveness.
 * Nếu chưa có trường mới thì tạm suy từ lastTestResult để dữ liệu cũ
 * vẫn hiển thị được. Bỏ nhánh này khi đã gỡ lastTestResult.
 */
export function designEffectivenessOf(
  c: ControlEffectivenessInput,
): EffectivenessValue {
  if (c.designEffectiveness)
    return normalizeEffectiveness(c.designEffectiveness);
  return normalizeEffectiveness(c.lastTestResult);
}

/** Đọc Operation Effectiveness, cùng cơ chế tương thích như trên */
export function operationEffectivenessOf(
  c: ControlEffectivenessInput,
): EffectivenessValue {
  if (c.operationEffectiveness)
    return normalizeEffectiveness(c.operationEffectiveness);
  return normalizeEffectiveness(c.lastTestResult);
}

/* ------------------------------------------------------------------ */
/* Tổng hợp hiệu quả chung                                        */
/* ------------------------------------------------------------------ */

/**
 * Bảng tổng hợp đã chốt với CRO.
 *
 * Hai nguyên tắc nền:
 *   1. Thiết kế sai thì vận hành tốt cũng vô nghĩa
 *   2. Chưa đánh giá là một mức riêng, không phải Hiệu quả
 */
export function combineEffectiveness(
  design: EffectivenessValue,
  operation: EffectivenessValue,
): EffectivenessValue {
  /* Chưa đánh giá chiều nào thì chưa kết luận được */
  if (design === NOT_ASSESSED && operation === NOT_ASSESSED)
    return NOT_ASSESSED;

  /* Thiết kế sai là kết luận cuối, không cần xét vận hành */
  if (design === "Không hiệu quả") return "Không hiệu quả";

  /* Vận hành sai thì kiểm soát không bảo vệ được gì trên thực tế */
  if (operation === "Không hiệu quả") return "Không hiệu quả";

  /* Còn một chiều chưa đánh giá thì hạ xuống mức một phần */
  if (design === NOT_ASSESSED || operation === NOT_ASSESSED)
    return "Hiệu quả một phần";

  if (design === "Hiệu quả một phần" || operation === "Hiệu quả một phần")
    return "Hiệu quả một phần";

  return "Hiệu quả";
}

/** Hiệu quả chung của một kiểm soát */
export function overallEffectivenessOf(
  c: ControlEffectivenessInput,
): EffectivenessValue {
  return combineEffectiveness(
    designEffectivenessOf(c),
    operationEffectivenessOf(c),
  );
}

/* ------------------------------------------------------------------ */
/* Câu trả lời cho câu hỏi cốt lõi của CRO                             */
/* ------------------------------------------------------------------ */

/**
 * Kiểm soát này có đang thực sự hoạt động không.
 * Chỉ trả về true khi CẢ HAI chiều đều được đánh giá là Hiệu quả.
 */
export function isControlWorking(c: ControlEffectivenessInput): boolean {
  return overallEffectivenessOf(c) === "Hiệu quả";
}

/** Đã đánh giá đủ hai chiều chưa */
export function isFullyAssessed(c: ControlEffectivenessInput): boolean {
  return (
    designEffectivenessOf(c) !== NOT_ASSESSED &&
    operationEffectivenessOf(c) !== NOT_ASSESSED
  );
}

/** Chưa từng đánh giá chiều nào */
export function isNeverAssessed(c: ControlEffectivenessInput): boolean {
  return (
    designEffectivenessOf(c) === NOT_ASSESSED &&
    operationEffectivenessOf(c) === NOT_ASSESSED
  );
}

/** Thiết kế sai, phải thiết kế lại kiểm soát */
export function needsRedesign(c: ControlEffectivenessInput): boolean {
  return designEffectivenessOf(c) === "Không hiệu quả";
}

/**
 * Thiết kế đúng nhưng không ai làm, phải chấn chỉnh việc thực hiện.
 * Đây là loại việc hoàn toàn khác needsRedesign, giao cho người khác
 * và cách xử lý khác.
 */
export function needsEnforcement(c: ControlEffectivenessInput): boolean {
  const design = designEffectivenessOf(c);
  const operation = operationEffectivenessOf(c);
  return design !== "Không hiệu quả" && operation === "Không hiệu quả";
}

/* ------------------------------------------------------------------ */
/* Hỗ trợ hiển thị                                        */
/* ------------------------------------------------------------------ */

export type EffectivenessTone = "success" | "warning" | "danger" | "neutral";

export function effectivenessTone(
  value: EffectivenessValue,
): EffectivenessTone {
  switch (value) {
    case "Hiệu quả":
      return "success";
    case "Hiệu quả một phần":
      return "warning";
    case "Không hiệu quả":
      return "danger";
    default:
      return "neutral";
  }
}

/** Câu giải thích ngắn, dùng cho tooltip trên bảng */
export function effectivenessHint(value: EffectivenessValue): string {
  switch (value) {
    case "Hiệu quả":
      return "Thiết kế đúng và đang được thực hiện đúng thiết kế";
    case "Hiệu quả một phần":
      return "Còn khe hở trong thiết kế hoặc thực hiện chưa đều, cần theo dõi";
    case "Không hiệu quả":
      return "Kiểm soát không bảo vệ được rủi ro trên thực tế, cần xử lý ngay";
    default:
      return "Chưa có bằng chứng nào chứng minh kiểm soát vận hành đúng thiết kế";
  }
}

/** Diễn giải kết luận theo hai chiều, dùng ở chi tiết kiểm soát */
export function effectivenessNarrative(c: ControlEffectivenessInput): string {
  const design = designEffectivenessOf(c);
  const operation = operationEffectivenessOf(c);

  if (isNeverAssessed(c))
    return "Kiểm soát chưa được đánh giá cả về thiết kế và vận hành, nên chưa thể coi là đang bảo vệ rủi ro.";

  if (needsRedesign(c))
    return "Thiết kế của kiểm soát không phù hợp để ngăn rủi ro. Dù người thực hiện làm đúng quy định thì rủi ro vẫn xảy ra, nên phải thiết kế lại kiểm soát.";

  if (needsEnforcement(c))
    return "Thiết kế của kiểm soát phù hợp, nhưng trên thực tế không được thực hiện đúng. Cần chấn chỉnh việc thực hiện thay vì sửa quy định.";

  if (design === NOT_ASSESSED)
    return "Chưa đánh giá thiết kế của kiểm soát, nên chưa kết luận được kiểm soát có đủ sức ngăn rủi ro hay không.";

  if (operation === NOT_ASSESSED)
    return "Thiết kế đã được đánh giá nhưng chưa có bằng chứng về việc vận hành. Cần lập đợt kiểm tra hiệu lực.";

  if (design === "Hiệu quả" && operation === "Hiệu quả")
    return "Kiểm soát được thiết kế đúng và đang vận hành đúng thiết kế.";

  return "Kiểm soát còn khe hở về thiết kế hoặc thực hiện chưa đều, cần theo dõi và cải thiện.";
}
