import { NOT_ASSESSED } from "./control-utils";
import { notOperatingReason } from "./risk-control-link";
import type { ControlAssessRow } from "./control-assessment";
import type { ControlRelevance } from "./enums";

/* ==================================================================
   Micro-flow đánh giá sâu MỘT kiểm soát với MỘT rủi ro.

   File THUẦN LOGIC: không import React, không đọc repo, không gọi
   component. Nhận vào một dòng bảng đã dựng ở control-assessment.ts,
   trả về cấu hình bước, dữ liệu trình bày và kết quả kiểm tra.

   Bốn bước, đi theo đúng thứ tự tư duy của người đánh giá:

     1. Xem nhanh        : đọc lại hồ sơ kiểm soát, CHỈ ĐỌC
     2. Xác nhận phù hợp : kiểm soát có xử lý đúng rủi ro này không
     3. Cập nhật hiệu quả: thực tế còn chạy tốt không, tuỳ chọn
     4. Phát hiện điểm yếu: ghi nhận khe hở vừa thấy, tuỳ chọn

   Vì sao bước 1 không có ô nhập nào: đây là bước ĐỌC LẠI trước khi kết
   luận. Nếu trộn ô nhập vào đây, người dùng sẽ kết luận trước rồi mới
   đọc, và bước 1 mất hẳn lý do tồn tại.

   Vì sao KHÔNG tự động đề xuất mức phù hợp: hệ thống chỉ biết thuộc
   tính của kiểm soát, không biết nội dung nghiệp vụ của rủi ro, nên mọi
   đề xuất đều là đoán. Đề xuất sẵn còn có hại: phần lớn người dùng sẽ
   bấm qua, và cột mức phù hợp trở thành một cột toàn giá trị giống nhau
   không mang thông tin gì. Thay vào đó file này cung cấp BỘ CÂU HỎI TỰ
   RÀ để người dùng tự kết luận có căn cứ.
   ================================================================== */

/* ------------------------------------------------------------------ */
/* Cấu hình bước                                                       */
/* ------------------------------------------------------------------ */

export type AssessFlowStepKey =
  | "review"
  | "relevance"
  | "effectiveness"
  | "weakness";

export interface AssessFlowStep {
  key: AssessFlowStepKey;
  label: string;
  description: string;
  /** Bước tuỳ chọn, bỏ qua không chặn việc hoàn tất */
  optional?: boolean;
}

export const ASSESS_FLOW_STEPS: AssessFlowStep[] = [
  {
    key: "review",
    label: "Xem nhanh",
    description:
      "Đọc lại hồ sơ kiểm soát: thiết kế thế nào, ai vận hành, lần kiểm tra gần nhất kết luận gì",
  },
  {
    key: "relevance",
    label: "Xác nhận phù hợp",
    description:
      "Kiểm soát này có xử lý đúng rủi ro đang khai báo không, hay chỉ được gắn theo thói quen",
  },
  {
    key: "effectiveness",
    label: "Cập nhật hiệu quả",
    description:
      "Nếu vừa quan sát được thực tế vận hành, ghi lại thành một đợt tự đánh giá nhanh",
    optional: true,
  },
  {
    key: "weakness",
    label: "Phát hiện điểm yếu",
    description: "Ghi nhận khe hở vừa thấy để chuyển sang phân hệ Khắc phục",
    optional: true,
  },
];

export function flowStepIndexOf(key: AssessFlowStepKey): number {
  const i = ASSESS_FLOW_STEPS.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
}

/* ------------------------------------------------------------------ */
/* Giá trị của micro-flow                                              */
/* ------------------------------------------------------------------ */

export type OeCriterionKey = "performed" | "evidence" | "timely";

export interface OeCriterion {
  key: OeCriterionKey;
  label: string;
  hint: string;
}

/**
 * Ba tiêu chí tự đánh giá nhanh hiệu lực vận hành.
 *
 * Cố ý giữ đúng ba câu và đều trả lời được bằng có hoặc không. Nhiều
 * hơn thì người dùng bỏ dở giữa chừng, ít hơn thì kết luận thiếu căn cứ.
 */
export const OE_CRITERIA: OeCriterion[] = [
  {
    key: "performed",
    label: "Kiểm soát thực sự được thực hiện trong kỳ",
    hint: "Có người làm thật, không phải chỉ tồn tại trên quy trình",
  },
  {
    key: "evidence",
    label: "Có bằng chứng lưu lại",
    hint: "Biên bản, nhật ký hệ thống, chữ ký duyệt hoặc tài liệu tương đương",
  },
  {
    key: "timely",
    label: "Thực hiện đúng tần suất đã quy định",
    hint: "Không bị bỏ kỳ, không làm gộp nhiều kỳ vào một lần",
  },
];

export type WeaknessPriorityValue = "Theo dõi sau" | "Phân tích ngay";

export interface AssessFlowValue {
  /* --- Bước 2 --- */
  relevance?: ControlRelevance;
  relevanceNote: string;

  /* --- Bước 3 --- */
  oeChecked: OeCriterionKey[];
  oeMethod: string;
  oeNote: string;
  /** Người dùng có chủ động ghi đợt tự đánh giá không */
  oeSubmitted: boolean;

  /* --- Bước 4 --- */
  hasWeakness: boolean;
  weaknessName: string;
  weaknessDescription: string;
  weaknessPriority: WeaknessPriorityValue;
}

/**
 * Giá trị khởi tạo, nạp sẵn kết luận đã ghi nếu có.
 *
 * Mở lại micro-flow của một kiểm soát đã đánh giá thì phải thấy nguyên
 * kết luận cũ, không phải form trống. Nếu trống, người dùng sẽ tưởng hệ
 * thống mất dữ liệu và ghi lại một lần nữa.
 */
export function emptyAssessFlow(row?: ControlAssessRow): AssessFlowValue {
  return {
    relevance: row?.relevance,
    relevanceNote: row?.relevanceNote ?? "",

    oeChecked: [],
    oeMethod: "",
    oeNote: "",
    oeSubmitted: false,

    hasWeakness: false,
    weaknessName: "",
    weaknessDescription: "",
    weaknessPriority: "Theo dõi sau",
  };
}

/* ------------------------------------------------------------------ */
/* Bộ câu hỏi tự rà ở bước 2                                           */
/* ------------------------------------------------------------------ */

export interface RelevanceQuestion {
  question: string;
  hint: string;
}

/**
 * Ba câu hỏi giúp người dùng tự kết luận, KHÔNG phải gợi ý đáp án.
 *
 * Thứ tự có chủ đích: hỏi về nguyên nhân trước, hệ quả sau, rồi mới tới
 * mức che phủ. Nhiều kiểm soát bị gắn nhầm vì người ta thấy nó cùng
 * phòng ban hoặc cùng quy trình với rủi ro, chứ chưa hề tự hỏi nó chặn
 * cái gì.
 */
export const RELEVANCE_QUESTIONS: RelevanceQuestion[] = [
  {
    question: "Kiểm soát này chặn nguyên nhân nào của rủi ro",
    hint: "Nêu được đích danh một nguyên nhân thì mức Phù hợp có căn cứ. Không nêu được thì nhiều khả năng nó được gắn theo thói quen",
  },
  {
    question: "Nếu kiểm soát này chạy đúng thiết kế, rủi ro có giảm không",
    hint: "Giảm khả năng xảy ra, giảm mức ảnh hưởng, hoặc cả hai. Không giảm gì thì đây là kiểm soát của rủi ro khác",
  },
  {
    question: "Nó che được toàn bộ rủi ro hay chỉ một phần",
    hint: "Chỉ che một nhánh, một khâu hoặc một loại giao dịch thì chọn Phù hợp một phần, và phần còn lại cần kiểm soát khác bù vào",
  },
];

/* ------------------------------------------------------------------ */
/* Dữ liệu bước 1 Xem nhanh                                            */
/* ------------------------------------------------------------------ */

export type QuickTone = "neutral" | "good" | "warn" | "bad";

export interface QuickField {
  label: string;
  value: string;
  tone?: QuickTone;
  hint?: string;
}

export interface QuickGroup {
  title: string;
  fields: QuickField[];
}

function toneOfEffectiveness(v: string): QuickTone {
  if (v === NOT_ASSESSED) return "warn";
  if (v === "Hiệu quả") return "good";
  if (v === "Không hiệu quả") return "bad";
  return "warn";
}

/**
 * Dựng bốn nhóm thông tin cho bước Xem nhanh.
 *
 * Gom theo CÂU HỎI người đánh giá cần trả lời, không gom theo thứ tự
 * trường trong schema. Nhờ vậy đọc từ trên xuống là đi đúng mạch: kiểm
 * soát này là gì, thiết kế ra sao, thực tế chạy thế nào, có bằng chứng
 * gì để tin.
 */
export function buildQuickView(row: ControlAssessRow): QuickGroup[] {
  const groups: QuickGroup[] = [];

  groups.push({
    title: "Kiểm soát này là gì",
    fields: [
      { label: "Mã kiểm soát", value: row.code },
      { label: "Tên kiểm soát", value: row.name || "--" },
      {
        label: "Mức độ",
        value: row.isKeyControl ? "Trọng yếu" : "Thường",
        tone: row.isKeyControl ? "warn" : "neutral",
        hint: row.isKeyControl
          ? "Không kiểm soát nào khác thay thế được, nên hỏng là rủi ro lộ ra ngay"
          : undefined,
      },
    ],
  });

  groups.push({
    title: "Thiết kế thế nào",
    fields: [
      { label: "Loại kiểm soát", value: row.type || "--" },
      { label: "Tính chất", value: row.nature || "--" },
      { label: "Tần suất", value: row.frequency || "--" },
      {
        label: "Hiệu lực thiết kế",
        value: row.design,
        tone: toneOfEffectiveness(row.design),
      },
    ],
  });

  groups.push({
    title: "Thực tế chạy thế nào",
    fields: [
      {
        label: "Trạng thái vận hành",
        value: row.status || "Chưa rõ",
        tone: row.operating ? "good" : "bad",
        hint: row.notOperatingNote,
      },
      {
        label: "Hiệu lực vận hành",
        value: row.operation,
        tone: toneOfEffectiveness(row.operation),
      },
      {
        label: "Kết luận chung",
        value: row.overall,
        tone: toneOfEffectiveness(row.overall),
        hint:
          row.overall === NOT_ASSESSED
            ? "Chưa có bằng chứng nào nên chưa được tính là đang bảo vệ rủi ro"
            : undefined,
      },
    ],
  });

  groups.push({
    title: "Kết luận hiện có với rủi ro này",
    fields: [
      {
        label: "Mức phù hợp",
        value: row.relevance ?? "Chưa kết luận",
        tone: row.relevance
          ? row.relevance === "Không phù hợp"
            ? "bad"
            : row.relevance === "Phù hợp"
              ? "good"
              : "warn"
          : "warn",
      },
      {
        label: "Người kết luận",
        value: row.assessedBy || "--",
      },
      {
        label: "Ngày kết luận",
        value: row.assessedAt || "--",
      },
    ],
  });

  return groups;
}

/**
 * Câu tóm tắt hiện ở đầu ngăn kéo.
 *
 * Nêu thẳng điều bất thường nếu có, thay vì để người dùng tự đối chiếu
 * ba nhóm thông tin bên dưới rồi mới nhận ra.
 */
export function quickHeadline(row: ControlAssessRow): {
  text: string;
  tone: QuickTone;
} {
  if (!row.operating)
    return {
      text:
        notOperatingReason(row.status) ??
        "Kiểm soát này không đang vận hành nên chưa bảo vệ rủi ro",
      tone: "bad",
    };

  if (!row.effectivenessAssessed)
    return {
      text: "Kiểm soát đang vận hành nhưng chưa có kết luận hiệu lực nào, nên chưa có bằng chứng cho thấy nó thực sự bảo vệ rủi ro",
      tone: "warn",
    };

  if (row.isKeyControl && row.overall === "Không hiệu quả")
    return {
      text: "Kiểm soát trọng yếu đang Không hiệu quả. Đây là khe hở lớn, nên ghi nhận điểm yếu ở bước cuối của luồng này",
      tone: "bad",
    };

  if (row.overall === "Hiệu quả một phần")
    return {
      text: "Kiểm soát đang hiệu quả một phần, còn khe hở cần kiểm soát khác bù vào",
      tone: "warn",
    };

  return {
    text: "Kiểm soát đang vận hành và đã có kết luận hiệu lực",
    tone: "good",
  };
}

/* ------------------------------------------------------------------ */
/* Kiểm tra từng bước                                                  */
/* ------------------------------------------------------------------ */

export type AssessFlowErrors = Partial<
  Record<"relevance" | "relevanceNote" | "oeMethod" | "weaknessName", string>
>;

export function validateAssessStep(
  step: AssessFlowStepKey,
  v: AssessFlowValue,
): AssessFlowErrors {
  const out: AssessFlowErrors = {};

  if (step === "relevance") {
    if (!v.relevance)
      out.relevance =
        "Bắt buộc kết luận mức phù hợp của kiểm soát với rủi ro này";

    /* Không phù hợp là căn cứ để gỡ kiểm soát khỏi hồ sơ, nên phải nêu
       lý do. Hai mức còn lại thì lý do là tuỳ chọn */
    if (v.relevance === "Không phù hợp" && !v.relevanceNote.trim())
      out.relevanceNote =
        "Bắt buộc nêu lý do, vì đây là căn cứ để gỡ kiểm soát khỏi rủi ro";
  }

  if (step === "effectiveness" && v.oeSubmitted && !v.oeMethod.trim())
    out.oeMethod = "Chọn cách anh quan sát được thực tế vận hành";

  if (step === "weakness" && v.hasWeakness && !v.weaknessName.trim())
    out.weaknessName =
      "Bắt buộc nhập tên điểm yếu, hoặc tắt ghi nhận nếu chưa có nghi ngờ nào";

  return out;
}

/** Đã đủ điều kiện bấm Hoàn tất chưa */
export function canFinishFlow(v: AssessFlowValue): boolean {
  return Object.keys(validateAssessStep("relevance", v)).length === 0;
}

/* ------------------------------------------------------------------ */
/* Trạng thái bốn bước cho dải mini                                    */
/* ------------------------------------------------------------------ */

export type FlowStepState = "done" | "current" | "todo" | "skipped";

export interface FlowStepView {
  key: AssessFlowStepKey;
  label: string;
  description: string;
  state: FlowStepState;
}

export function assessFlowStepViews(
  current: AssessFlowStepKey,
  v: AssessFlowValue,
): FlowStepView[] {
  const doneMap: Record<AssessFlowStepKey, boolean> = {
    /* Bước xem nhanh coi như xong khi người dùng đã rời khỏi nó */
    review: flowStepIndexOf(current) > 0,
    relevance: !!v.relevance,
    effectiveness: v.oeSubmitted,
    weakness: v.hasWeakness && v.weaknessName.trim() !== "",
  };

  return ASSESS_FLOW_STEPS.map((s) => {
    let state: FlowStepState = "todo";

    if (doneMap[s.key]) state = "done";
    else if (s.key === current) state = "current";
    else if (s.optional) state = "skipped";

    return {
      key: s.key,
      label: s.label,
      description: s.description,
      state,
    };
  });
}

/** Câu tổng kết hiện ở footer ngăn kéo trước khi bấm Hoàn tất */
export function describeFlowResult(v: AssessFlowValue): string {
  if (!v.relevance) return "Chưa kết luận mức phù hợp, chưa lưu được.";

  const parts: string[] = [`Kết luận mức phù hợp: ${v.relevance}.`];

  if (v.oeSubmitted)
    parts.push(
      `Ghi thêm một đợt tự đánh giá nhanh với ${v.oeChecked.length} trên ${OE_CRITERIA.length} tiêu chí đạt.`,
    );

  if (v.hasWeakness && v.weaknessName.trim())
    parts.push(`Tạo một điểm yếu mới, mức ưu tiên ${v.weaknessPriority}.`);

  return parts.join(" ");
}
