/* ==================================================================
   Gợi ý điểm rủi ro còn lại từ tập kiểm soát.

   Quyết định chốt ngày 18/08/2026: hệ thống GỢI Ý, người dùng QUYẾT.
   Con số ở đây luôn chỉ là đề xuất được pre-fill vào bảng chấm điểm ở
   bước 6, người dùng sửa tự do và mọi lần ghi đè đều lưu vết qua hai
   trường suggestedResidualLikelihood và suggestedResidualImpact.

   Bốn nguyên tắc của thuật toán:

   1. CHƯA ĐÁNH GIÁ THÌ KHÔNG ĐƯỢC TÍNH LÀ ĐANG GIẢM RỦI RO.
      Kiểm soát chưa có bằng chứng nào bị loại khỏi phép tính, không
      quy đổi thành mức trung bình. Đây là nguyên tắc thận trọng đã
      chốt từ lô A.

   2. CHƯA PHÊ DUYỆT THÌ CHƯA VẬN HÀNH.
      Kiểm soát Nháp hoặc Chờ duyệt bị loại, thống nhất với
      hasControlCoverage đã dùng ở sổ rủi ro.

   3. MỘT KIỂM SOÁT TRỌNG YẾU THẤT BẠI LÀ ĐỦ ĐỂ HẠ TRẦN.
      Không cho phép nhiều kiểm soát thường bù đắp cho một kiểm soát
      trọng yếu không hiệu quả.

   4. PHÒNG NGỪA GIẢM KHẢ NĂNG, PHÁT HIỆN GIẢM ẢNH HƯỞNG.
      Kiểm soát ngăn từ đầu thì rủi ro ít xảy ra hơn. Kiểm soát phát
      hiện và khắc phục không ngăn được việc xảy ra, chỉ giảm mức thiệt
      hại khi đã xảy ra.
   ================================================================== */

import { CONTROL_NATURES, CONTROL_TYPES } from "./enums";
import {
  NOT_ASSESSED,
  overallEffectivenessOf,
  type ControlEffectivenessInput,
  type EffectivenessValue,
} from "./control-utils";

/* ------------------------------------------------------------------ */
/* Kiểu tối giản                                                       */
/* ------------------------------------------------------------------ */

export interface SuggestionControlInput extends ControlEffectivenessInput {
  id?: string;
  code?: string;
  name?: string;
  /** Phòng ngừa, Phát hiện hoặc Khắc phục */
  type?: string | null;
  /** Thủ công, Bán tự động hoặc Tự động */
  nature?: string | null;
  isKeyControl?: boolean;
  riskIds?: string[];
  status?: string | null;
}

/* ------------------------------------------------------------------ */
/* Bốn bảng hệ số                                                      */
/* ------------------------------------------------------------------ */

/**
 * Điểm hiệu lực quy đổi từ kết luận hai chiều.
 * Chưa đánh giá KHÔNG có mặt ở đây, vì kiểm soát đó bị loại khỏi phép
 * tính chứ không phải cho một điểm nào.
 */
export const EFFECTIVENESS_SCORE: Record<string, number> = {
  "Hiệu quả": 5,
  "Hiệu quả một phần": 3,
  "Không hiệu quả": 1,
};

/**
 * Trọng số theo loại kiểm soát.
 * Phòng ngừa được coi trọng nhất vì ngăn rủi ro từ gốc, khắc phục thấp
 * nhất vì chỉ xử lý hậu quả sau khi rủi ro đã xảy ra.
 */
export const TYPE_WEIGHT: Record<string, number> = {
  "Phòng ngừa": 1.5,
  "Phát hiện": 1.0,
  "Khắc phục": 0.75,
};

/** Kiểm soát trọng yếu có tiếng nói lớn hơn trong kết luận chung */
export const KEY_CONTROL_WEIGHT = 1.5;
export const NORMAL_CONTROL_WEIGHT = 1.0;

/**
 * Trọng số theo tính chất.
 * Kiểm soát tự động ít phụ thuộc con người nên độ tin cậy vận hành cao
 * hơn, ít bỏ sót và ít bị làm tắt.
 */
export const NATURE_WEIGHT: Record<string, number> = {
  "Tự động": 1.25,
  "Bán tự động": 1.1,
  "Thủ công": 1.0,
};

/** Số bậc giảm ứng với từng mức hiệu lực tổng hợp */
export const REDUCTION_STEPS: Record<string, number> = {
  "Hiệu quả": 2,
  "Hiệu quả một phần": 1,
  "Không hiệu quả": 0,
  "Chưa đánh giá": 0,
};

/** Ngưỡng quy đổi ngược từ điểm bình quân về mức */
export const SCORE_THRESHOLD_EFFECTIVE = 4.0;
export const SCORE_THRESHOLD_PARTIAL = 2.0;

/**
 * Kiểm soát đang thực sự vận hành.
 *
 * Bản trước chỉ loại Nháp và Chờ duyệt, nên kiểm soát Tạm ngưng và Hết
 * hiệu lực vẫn được tính là đang bảo vệ rủi ro. Cả hai đều đã ngừng
 * chạy, nên gợi ý điểm còn lại đang lạc quan hơn thực tế.
 */
const OPERATING = new Set(["Đang hiệu lực"]);

/* ------------------------------------------------------------------ */
/* Điều kiện được tính vào phép tổng hợp                               */
/* ------------------------------------------------------------------ */

/** Kiểm soát đã phê duyệt và còn hiệu lực chưa */
export function isControlApproved(c: SuggestionControlInput): boolean {
  return OPERATING.has(c.status ?? "");
}

/** Đã có kết luận hiệu lực chưa */
export function isControlAssessed(c: SuggestionControlInput): boolean {
  return overallEffectivenessOf(c) !== NOT_ASSESSED;
}

/**
 * Kiểm soát này có được đưa vào phép tính không.
 * Phải thoả CẢ HAI: đã phê duyệt và đã có kết luận hiệu lực.
 */
export function isControlCounted(c: SuggestionControlInput): boolean {
  return isControlApproved(c) && isControlAssessed(c);
}

/** Lý do một kiểm soát bị loại, dùng để giải thích trên giao diện */
export function exclusionReasonOf(
  c: SuggestionControlInput,
): string | undefined {
  if (!isControlApproved(c)) {
    const s = c.status ?? "";
    if (s === "Tạm ngưng")
      return "Đang tạm ngưng vận hành nên không bảo vệ rủi ro ở thời điểm này";
    if (s === "Hết hiệu lực")
      return "Đã hết hiệu lực, cần thay bằng kiểm soát khác";
    return "Chưa phê duyệt nên chưa được tính là đang vận hành";
  }
  if (!isControlAssessed(c))
    return "Chưa có kết luận hiệu lực nên chưa có bằng chứng bảo vệ rủi ro";
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Trọng số của một kiểm soát                                          */
/* ------------------------------------------------------------------ */

export function typeWeightOf(c: SuggestionControlInput): number {
  return TYPE_WEIGHT[c.type ?? ""] ?? 1.0;
}

export function natureWeightOf(c: SuggestionControlInput): number {
  return NATURE_WEIGHT[c.nature ?? ""] ?? 1.0;
}

export function keyWeightOf(c: SuggestionControlInput): number {
  return c.isKeyControl ? KEY_CONTROL_WEIGHT : NORMAL_CONTROL_WEIGHT;
}

/**
 * Trọng số tổng của một kiểm soát.
 *
 *   w = k_type × k_key × k_nature
 *
 * Ví dụ: kiểm soát Phòng ngừa, trọng yếu, tự động
 *   w = 1.5 × 1.5 × 1.25 = 2.8125
 * so với kiểm soát Khắc phục, thường, thủ công
 *   w = 0.75 × 1.0 × 1.0 = 0.75
 * Chênh gần 4 lần, phản ánh đúng khoảng cách về giá trị bảo vệ.
 */
export function controlWeightOf(c: SuggestionControlInput): number {
  return typeWeightOf(c) * keyWeightOf(c) * natureWeightOf(c);
}

/* ------------------------------------------------------------------ */
/* Quy đổi ngược từ điểm về mức                                        */
/* ------------------------------------------------------------------ */

export function levelFromScore(score: number): EffectivenessValue {
  if (score >= SCORE_THRESHOLD_EFFECTIVE) return "Hiệu quả";
  if (score >= SCORE_THRESHOLD_PARTIAL) return "Hiệu quả một phần";
  return "Không hiệu quả";
}

/* ------------------------------------------------------------------ */
/* Trục giảm điểm                                                      */
/* ------------------------------------------------------------------ */

/**
 * Trục được ưu tiên giảm.
 *   likelihood : tập kiểm soát nghiêng về Phòng ngừa
 *   impact     : nghiêng về Phát hiện và Khắc phục
 */
export type ReductionAxis = "likelihood" | "impact";

/* ------------------------------------------------------------------ */
/* Kết quả tổng hợp                                                    */
/* ------------------------------------------------------------------ */

export interface AggregateResult {
  /** Mức hiệu lực tổng hợp của cả tập kiểm soát */
  level: EffectivenessValue;
  /** Điểm bình quân gia quyền, thang 1 tới 5. null khi không tính được */
  score: number | null;
  /** Số kiểm soát được tính */
  countedCount: number;
  /** Số kiểm soát bị loại kèm lý do */
  excludedCount: number;
  /** Có kiểm soát trọng yếu nào đang Không hiệu quả không */
  hasFailedKeyControl: boolean;
  /** Kết luận đã bị hạ trần vì nguyên tắc số 3 chưa */
  cappedByKeyControl: boolean;
  /** Tổng trọng số nhóm Phòng ngừa */
  preventiveWeight: number;
  /** Tổng trọng số nhóm Phát hiện và Khắc phục */
  reactiveWeight: number;
  /** Trục nên giảm điểm */
  axis: ReductionAxis;
}

/**
 * Tổng hợp hiệu lực của nhiều kiểm soát thành một kết luận.
 *
 *        Σ (w_i × s_i)
 *   S = ---------------
 *          Σ w_i
 *
 * Trục giảm được xác định bằng cách so TỔNG TRỌNG SỐ hai nhóm, không
 * đếm số lượng. Lý do: một kiểm soát phòng ngừa trọng yếu tự động có
 * giá trị bảo vệ lớn hơn ba kiểm soát khắc phục thủ công, nên đếm đầu
 * người sẽ ra kết luận sai. Hoà nhau thì ưu tiên giảm Khả năng, vì
 * ngăn rủi ro xảy ra luôn tốt hơn giảm thiệt hại sau khi đã xảy ra.
 */
export function aggregateControlEffectiveness(
  controls: SuggestionControlInput[],
): AggregateResult {
  const counted = controls.filter(isControlCounted);
  const excludedCount = controls.length - counted.length;

  let preventiveWeight = 0;
  let reactiveWeight = 0;
  let weightSum = 0;
  let weighted = 0;
  let hasFailedKeyControl = false;

  counted.forEach((c) => {
    const level = overallEffectivenessOf(c);
    const s = EFFECTIVENESS_SCORE[level] ?? 1;
    const w = controlWeightOf(c);

    weightSum += w;
    weighted += w * s;

    if (c.type === "Phòng ngừa") preventiveWeight += w;
    else reactiveWeight += w;

    if (c.isKeyControl && level === "Không hiệu quả")
      hasFailedKeyControl = true;
  });

  const axis: ReductionAxis =
    preventiveWeight >= reactiveWeight ? "likelihood" : "impact";

  /* Không có kiểm soát nào được tính thì không kết luận gì */
  if (weightSum === 0)
    return {
      level: NOT_ASSESSED,
      score: null,
      countedCount: 0,
      excludedCount,
      hasFailedKeyControl: false,
      cappedByKeyControl: false,
      preventiveWeight: 0,
      reactiveWeight: 0,
      axis: "likelihood",
    };

  const score = weighted / weightSum;
  let level = levelFromScore(score);
  let cappedByKeyControl = false;

  /* Nguyên tắc 3: một kiểm soát trọng yếu thất bại là đủ hạ trần */
  if (hasFailedKeyControl && level === "Hiệu quả") {
    level = "Hiệu quả một phần";
    cappedByKeyControl = true;
  }

  return {
    level,
    score,
    countedCount: counted.length,
    excludedCount,
    hasFailedKeyControl,
    cappedByKeyControl,
    preventiveWeight,
    reactiveWeight,
    axis,
  };
}

/* ------------------------------------------------------------------ */
/* Phân bổ số bậc giảm vào hai chiều                                   */
/* ------------------------------------------------------------------ */

const MIN_SCORE = 1;

/**
 * Trừ số bậc vào trục chính trước, phần dư tràn sang trục còn lại.
 * Không chiều nào xuống dưới 1, vì thang điểm là 1 tới 5.
 */
function distributeReduction(
  likelihood: number,
  impact: number,
  steps: number,
  axis: ReductionAxis,
): { likelihood: number; impact: number } {
  if (steps <= 0) return { likelihood, impact };

  let l = likelihood;
  let i = impact;

  const primaryIsLikelihood = axis === "likelihood";
  let remain = steps;

  /* Trục chính */
  if (primaryIsLikelihood) {
    const room = l - MIN_SCORE;
    const take = Math.min(room, remain);
    l -= take;
    remain -= take;
  } else {
    const room = i - MIN_SCORE;
    const take = Math.min(room, remain);
    i -= take;
    remain -= take;
  }

  /* Phần dư tràn sang trục còn lại */
  if (remain > 0) {
    if (primaryIsLikelihood) {
      const room = i - MIN_SCORE;
      i -= Math.min(room, remain);
    } else {
      const room = l - MIN_SCORE;
      l -= Math.min(room, remain);
    }
  }

  return { likelihood: l, impact: i };
}

/* ------------------------------------------------------------------ */
/* Gợi ý điểm còn lại                                                  */
/* ------------------------------------------------------------------ */

export interface ResidualSuggestion {
  /** Điểm khả năng gợi ý */
  likelihood: number;
  /** Điểm ảnh hưởng gợi ý */
  impact: number;
  /** Điểm rủi ro gợi ý, bằng likelihood nhân impact */
  score: number;
  /** Có thực sự đề xuất giảm gì không, false nghĩa là giữ nguyên vốn có */
  hasReduction: boolean;
  /** Số bậc giảm đã áp dụng */
  steps: number;
  /** Trục được giảm */
  axis: ReductionAxis;
  /** Kết quả tổng hợp kiểm soát, để giao diện hiện chi tiết */
  aggregate: AggregateResult;
}

export interface SuggestOptions {
  /** Người dùng đã tuyên bố không áp dụng kiểm soát nào */
  noControlAccepted?: boolean;
}

/**
 * Gợi ý điểm rủi ro còn lại.
 *
 * Ba trường hợp trả về đúng bằng điểm vốn có:
 *   - Không có kiểm soát nào gắn với rủi ro
 *   - Đã tuyên bố chấp nhận, không áp dụng kiểm soát
 *   - Có kiểm soát nhưng toàn bộ đều chưa phê duyệt hoặc chưa đánh giá
 *
 * Cả ba đều là kết luận đúng về nghiệp vụ: khi chưa có bằng chứng nào
 * cho thấy rủi ro đang được kiểm soát, thì mức còn lại bằng mức vốn có.
 */
export function suggestResidual(
  inherentLikelihood: number,
  inherentImpact: number,
  controls: SuggestionControlInput[],
  options: SuggestOptions = {},
): ResidualSuggestion {
  const aggregate = aggregateControlEffectiveness(
    options.noControlAccepted ? [] : controls,
  );

  const steps = REDUCTION_STEPS[aggregate.level] ?? 0;

  const next = distributeReduction(
    inherentLikelihood,
    inherentImpact,
    steps,
    aggregate.axis,
  );

  const hasReduction =
    next.likelihood !== inherentLikelihood || next.impact !== inherentImpact;

  return {
    likelihood: next.likelihood,
    impact: next.impact,
    score: next.likelihood * next.impact,
    hasReduction,
    steps,
    axis: aggregate.axis,
    aggregate,
  };
}

/**
 * Bản tiện dụng cho màn hình: tự lọc kiểm soát theo riskIds.
 * Truyền rủi ro chưa lưu thì để riskId rỗng và truyền sẵn danh sách đã
 * chọn trong wizard qua tham số controls.
 */
export function suggestResidualForRisk(
  risk: {
    id?: string;
    inherentLikelihood?: number | null;
    inherentImpact?: number | null;
    noControlAccepted?: boolean;
  },
  allControls: SuggestionControlInput[],
): ResidualSuggestion {
  const l = risk.inherentLikelihood ?? 3;
  const i = risk.inherentImpact ?? 3;

  const linked = risk.id
    ? allControls.filter((c) => (c.riskIds ?? []).includes(risk.id as string))
    : [];

  return suggestResidual(l, i, linked, {
    noControlAccepted: risk.noControlAccepted,
  });
}

/* ------------------------------------------------------------------ */
/* Diễn giải cho giao diện                                             */
/* ------------------------------------------------------------------ */

/**
 * Câu giải thích vì sao hệ thống đề xuất con số đó.
 * Người dùng phải hiểu được căn cứ, nếu không họ sẽ hoặc tin mù quáng
 * hoặc bỏ qua hoàn toàn. Cả hai đều làm mất giá trị của gợi ý.
 */
export function describeSuggestion(s: ResidualSuggestion): string {
  const a = s.aggregate;

  if (a.countedCount === 0) {
    if (a.excludedCount > 0)
      return `Có ${a.excludedCount} kiểm soát gắn với rủi ro này nhưng chưa kiểm soát nào được phê duyệt và đánh giá hiệu lực. Chưa có bằng chứng bảo vệ nên gợi ý giữ nguyên mức vốn có.`;
    return "Chưa có kiểm soát nào được tính, nên gợi ý giữ nguyên mức vốn có.";
  }

  const axisLabel =
    s.axis === "likelihood" ? "Khả năng xảy ra" : "Mức độ ảnh hưởng";

  const axisReason =
    s.axis === "likelihood"
      ? "tập kiểm soát nghiêng về loại Phòng ngừa nên tác dụng chính là làm rủi ro ít xảy ra hơn"
      : "tập kiểm soát nghiêng về loại Phát hiện và Khắc phục nên tác dụng chính là giảm thiệt hại khi rủi ro đã xảy ra";

  const parts: string[] = [];

  parts.push(
    `Tổng hợp ${a.countedCount} kiểm soát cho mức hiệu lực chung là ${a.level}${
      a.score !== null ? ` (điểm bình quân ${a.score.toFixed(2)} trên 5)` : ""
    }.`,
  );

  if (s.steps === 0)
    parts.push(
      "Mức hiệu lực này chưa đủ căn cứ để đề xuất giảm bậc nào, nên gợi ý giữ nguyên mức vốn có.",
    );
  else
    parts.push(
      `Đề xuất giảm ${s.steps} bậc, ưu tiên trừ vào ${axisLabel} vì ${axisReason}.`,
    );

  if (a.cappedByKeyControl)
    parts.push(
      "Kết luận đã bị hạ xuống Hiệu quả một phần vì có kiểm soát trọng yếu đang Không hiệu quả, không cho các kiểm soát thường bù đắp.",
    );

  if (a.excludedCount > 0)
    parts.push(
      `Có ${a.excludedCount} kiểm soát bị loại khỏi phép tính do chưa phê duyệt hoặc chưa đánh giá hiệu lực.`,
    );

  return parts.join(" ");
}

/** Câu ngắn một dòng, dùng cho tooltip và badge */
export function shortSuggestionHint(s: ResidualSuggestion): string {
  if (s.aggregate.countedCount === 0)
    return "Chưa có kiểm soát nào đủ điều kiện tính, gợi ý bằng mức vốn có";
  if (s.steps === 0)
    return `Hiệu lực chung ${s.aggregate.level}, chưa đủ để đề xuất giảm bậc`;
  return `Hiệu lực chung ${s.aggregate.level}, đề xuất giảm ${s.steps} bậc ở ${
    s.axis === "likelihood" ? "Khả năng" : "Ảnh hưởng"
  }`;
}

/* ------------------------------------------------------------------ */
/* Tự kiểm tra cấu hình khi phát triển                                 */
/* ------------------------------------------------------------------ */

/**
 * Xác nhận mọi giá trị enum đều có trọng số tương ứng.
 * Nếu enum được bổ sung giá trị mới mà quên khai trọng số, hàm này chỉ
 * ra ngay thay vì để thuật toán âm thầm dùng hệ số mặc định 1.0.
 */
export function auditWeightTables(): string[] {
  const issues: string[] = [];

  CONTROL_TYPES.forEach((t) => {
    if (TYPE_WEIGHT[t] === undefined)
      issues.push(`TYPE_WEIGHT thiếu giá trị cho loại kiểm soát "${t}"`);
  });

  CONTROL_NATURES.forEach((n) => {
    if (NATURE_WEIGHT[n] === undefined)
      issues.push(`NATURE_WEIGHT thiếu giá trị cho tính chất "${n}"`);
  });

  return issues;
}
