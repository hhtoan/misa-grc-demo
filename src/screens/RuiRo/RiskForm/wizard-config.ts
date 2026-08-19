/* ==================================================================
   Cấu hình wizard khai báo rủi ro.

   File này là NGUỒN SỰ THẬT DUY NHẤT về việc trường nào thuộc bước nào.

   Nguyên tắc quan trọng nhất: KIỂM TRA BẰNG riskFormSchema, KHÔNG TỰ
   VIẾT RULE. Wizard chỉ quyết định "lỗi này hiện ở bước nào", còn việc
   "có phải lỗi hay không" hoàn toàn do schema kết luận.

   Nhờ vậy 4 rule nghiệp vụ của riskFormSchema tự động có hiệu lực mà
   không phải viết lại:
     1. Rủi ro không khoan nhượng cấm chọn phương án Chấp nhận
     2. Điểm còn lại cao hơn vốn có thì bắt buộc nêu căn cứ
     3. Ngày rà soát phải sau ngày nhận diện
     4. Bắt buộc mô tả định hướng xử lý, trừ phương án Chấp nhận
   ================================================================== */

import { validateRiskForm, type RiskFormValue } from "@/lib/domain/risk-utils";
import { RISK_STAGES, type RiskStageKey } from "@/lib/domain/risk-lifecycle";

/* ------------------------------------------------------------------ */
/* Kiểu lỗi                                                            */
/* ------------------------------------------------------------------ */

/** Lấy đúng kiểu mà validateRiskForm trả về, không tự đoán */
export type RawErrorMap = ReturnType<typeof validateRiskForm>["errors"];

/** Map lỗi đã chuẩn hoá về chuỗi, dùng trực tiếp cho prop error */
export type FlatErrorMap = Record<string, string>;

/**
 * Đọc một thông báo lỗi ra chuỗi.
 * Không giả định FieldErrors là chuỗi hay mảng chuỗi, nên an toàn kể cả
 * khi tầng domain đổi kiểu về sau.
 */
export function messageOf(
  errors: RawErrorMap,
  key: string,
): string | undefined {
  const raw = (errors as Record<string, unknown>)[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first === undefined ? undefined : String(first);
  }
  return String(raw);
}

/** Chuẩn hoá toàn bộ map lỗi về dạng phẳng */
export function flattenErrors(errors: RawErrorMap): FlatErrorMap {
  const out: FlatErrorMap = {};
  Object.keys(errors as Record<string, unknown>).forEach((k) => {
    const msg = messageOf(errors, k);
    if (msg) out[k] = msg;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Trường nào thuộc bước nào                                           */
/* ------------------------------------------------------------------ */

/**
 * Ánh xạ bước tới danh sách trường của riskFormSchema.
 *
 * Ba bước có danh sách rỗng là có chủ đích:
 *   - controls : liên kết kiểm soát lưu ở control.riskIds, không thuộc Risk
 *   - weakness : sinh ra bản ghi Deficiency riêng, không thuộc Risk
 *   - review   : không có trường riêng, kiểm tra toàn bộ
 */
export const STEP_FIELDS: Record<RiskStageKey, string[]> = {
  context: ["objectiveIds", "unitId", "processId", "systemId"],
  identify: [
    "name",
    "description",
    "cause",
    "consequence",
    "categoryId",
    "ownerId",
    "source",
    "identifiedDate",
    "isZeroTolerance",
  ],
  inherent: ["inherentLikelihood", "inherentImpact", "estimatedLoss"],
  controls: [],
  weakness: [],
  residual: ["residualLikelihood", "residualImpact", "residualRationale"],
  treat: ["treatment", "treatmentNote", "reviewDate"],
  review: [],
  closed: [],
};

/**
 * Trường không được gán cho bước nào.
 *
 * Ba trường này wizard không phơi ô nhập: status luôn là Nháp khi tạo,
 * isKeyRisk và tags do Ban QTRR đặt sau ở màn hình sửa. Nhưng nếu chúng
 * phát sinh lỗi thì lỗi đó phải hiện ở đâu đó, nếu không người dùng sẽ
 * bị chặn lưu mà không hiểu vì sao. Bước Rà soát chịu trách nhiệm này.
 */
export const UNASSIGNED_FIELDS = ["status", "statusNote", "isKeyRisk", "tags"];

/** Bước nào chứa trường này, dùng để nhảy tới đúng chỗ khi bấm vào lỗi */
export function stageOfField(field: string): RiskStageKey {
  const found = RISK_STAGES.find((s) => STEP_FIELDS[s.key].includes(field));
  return found ? found.key : "review";
}

/* ------------------------------------------------------------------ */
/* Thông báo thân thiện theo ngữ cảnh wizard                           */
/* ------------------------------------------------------------------ */

/**
 * Ghi đè thông báo của schema cho một số trường.
 *
 * Schema viết ngắn gọn để dùng chung mọi nơi, còn wizard cần câu hướng
 * dẫn nói rõ vì sao trường đó quan trọng. Chỉ ghi đè khi thật cần, các
 * trường không có ở đây vẫn dùng nguyên câu của schema.
 */
const FRIENDLY_MESSAGE: Record<string, string> = {
  objectiveIds:
    "Bắt buộc chọn ít nhất 1 mục tiêu. Không có mục tiêu thì không biết rủi ro này đang đe doạ điều gì của tổ chức",
  unitId:
    "Bắt buộc chọn đơn vị. Thiếu đơn vị thì rủi ro không xuất hiện trong báo cáo theo đơn vị",
  ownerId:
    "Bắt buộc chọn chủ sở hữu. Đây là người chịu trách nhiệm theo dõi và báo cáo rủi ro này",
  categoryId:
    "Bắt buộc chọn nhóm rủi ro để tổng hợp được theo loại khi báo cáo",
  identifiedDate:
    "Bắt buộc nhập ngày nhận diện. Đây là mốc để tính tuổi rủi ro và kỳ rà soát",
};

export function friendlyMessage(field: string, original: string): string {
  return FRIENDLY_MESSAGE[field] ?? original;
}

/* ------------------------------------------------------------------ */
/* Lọc lỗi theo bước                                                   */
/* ------------------------------------------------------------------ */

export interface StepValidation {
  /** Lỗi thuộc đúng bước đang đứng */
  errors: FlatErrorMap;
  /** Bước này đã hợp lệ chưa */
  ok: boolean;
  /** Trường lỗi đầu tiên, dùng để cuộn tới */
  firstField?: string;
}

/**
 * Kiểm tra một bước.
 *
 * Luôn validate TOÀN BỘ form bằng schema, rồi chỉ lấy phần lỗi thuộc
 * bước đang xem. Cách này đắt hơn việc kiểm tra riêng vài trường, nhưng
 * đổi lại không bao giờ lệch với rule thật, và các rule liên trường như
 * treatment với treatmentNote tự động đúng.
 */
export function validateStage(
  form: RiskFormValue,
  stage: RiskStageKey,
): StepValidation {
  const all = flattenErrors(validateRiskForm(form).errors);
  const fields = STEP_FIELDS[stage] ?? [];

  const errors: FlatErrorMap = {};
  fields.forEach((f) => {
    if (all[f]) errors[f] = friendlyMessage(f, all[f]);
  });

  const keys = Object.keys(errors);
  return {
    errors,
    ok: keys.length === 0,
    firstField: keys[0],
  };
}

/** Kiểm tra toàn bộ form, dùng ở bước Rà soát và lúc lưu */
export function validateAll(form: RiskFormValue): {
  ok: boolean;
  errors: FlatErrorMap;
  /** Lỗi gom theo bước, để bước Rà soát liệt kê có thứ tự */
  byStage: {
    stage: RiskStageKey;
    fields: { field: string; message: string }[];
  }[];
} {
  const errors = flattenErrors(validateRiskForm(form).errors);
  const keys = Object.keys(errors);

  const byStage = RISK_STAGES.map((s) => ({
    stage: s.key,
    fields: keys
      .filter((k) => stageOfField(k) === s.key)
      .map((k) => ({ field: k, message: friendlyMessage(k, errors[k]) })),
  })).filter((g) => g.fields.length > 0);

  return { ok: keys.length === 0, errors, byStage };
}

/* ------------------------------------------------------------------ */
/* Theo dõi người dùng đã chạm vào bảng điểm chưa                      */
/* ------------------------------------------------------------------ */

/**
 * score là trường bắt buộc 1 tới 5 nên emptyRiskForm khởi tạo 3/3.
 * Vì vậy schema không bao giờ báo thiếu điểm, và bảng chấm luôn có một
 * ô được chọn sẵn ở mức Trung bình.
 *
 * Wizard giữ danh sách trường điểm đã được người dùng chạm tới, để nhắc
 * mềm rằng con số hiện tại chỉ là mặc định. KHÔNG chặn chuyển bước, chỉ
 * nhắc, vì 3/3 vẫn là một giá trị hợp lệ nếu người dùng thực sự chọn.
 */
export const SCORE_FIELDS = [
  "inherentLikelihood",
  "inherentImpact",
  "residualLikelihood",
  "residualImpact",
] as const;

export type ScoreField = (typeof SCORE_FIELDS)[number];

export function isDefaultScore(
  form: RiskFormValue,
  field: ScoreField,
): boolean {
  return form[field] === 3;
}

/* ------------------------------------------------------------------ */
/* Nháp                                                               */
/* ------------------------------------------------------------------ */

/**
 * Khoá nháp phiên bản 2.
 *
 * Bump từ v1 vì cấu trúc wizard đổi từ 5 bước sang 8 bước và state đổi
 * từ WizardValue sang RiskFormValue. Nháp cũ nạp vào form mới sẽ thiếu
 * objectiveIds, identifiedDate, treatmentNote và gây lỗi runtime. Nháp
 * cũ bị xoá, chấp nhận được vì đây là bản demo.
 */
export const DRAFT_KEY = "misa-grc-risk-wizard-draft-v2";
const DRAFT_KEY_LEGACY = "misa-grc-risk-wizard-draft";

/** Nghi ngờ điểm yếu khai ở bước 5, không thuộc riskFormSchema */
export interface DraftWeakness {
  has: boolean;
  name: string;
  description: string;
  priority: "Theo dõi sau" | "Phân tích ngay";
}

export interface DraftPayload {
  form: RiskFormValue;
  controlIds: string[];
  /** Có thể vắng ở nháp lưu trước khi bước 5 được dựng */
  weakness?: DraftWeakness;
  stage: RiskStageKey;
  savedAt: string;
}

export function readDraft(): DraftPayload | undefined {
  try {
    /* Dọn nháp phiên bản cũ, hình dạng không còn tương thích */
    window.localStorage.removeItem(DRAFT_KEY_LEGACY);

    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as DraftPayload;

    /* Kiểm tra tối thiểu, nháp hỏng thì bỏ qua thay vì để vỡ trang */
    if (!parsed || typeof parsed !== "object") return undefined;
    if (!parsed.form || typeof parsed.form.name !== "string") return undefined;
    if (!Array.isArray(parsed.form.objectiveIds)) return undefined;

    return parsed;
  } catch {
    return undefined;
  }
}

export function writeDraft(payload: Omit<DraftPayload, "savedAt">): boolean {
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...payload, savedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* bỏ qua */
  }
}
