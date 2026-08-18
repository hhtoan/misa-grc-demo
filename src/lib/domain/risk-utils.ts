import { LOCKED_EDIT_STATUSES, RISK_FLOW, nextTransitions } from "./workflow";
import { riskLevelFromScore, riskScore } from "./matrix";
import {
  riskFormSchema,
  zodErrors,
  type FieldErrors,
  type Risk,
} from "./schema";
import type { RiskLevelValue, RiskStatus } from "./enums";
import { toInputDate } from "@/lib/format";
import type { z } from "zod";

export type RiskFormValue = z.infer<typeof riskFormSchema>;

/* ==================================================================
   Tính toán điểm và mức độ
   ================================================================== */

export function inherentScoreOf(r: Risk | RiskFormValue): number {
  return riskScore(r.inherentLikelihood, r.inherentImpact);
}

export function residualScoreOf(r: Risk | RiskFormValue): number {
  return riskScore(r.residualLikelihood, r.residualImpact);
}

export function inherentLevelOf(r: Risk | RiskFormValue): RiskLevelValue {
  return riskLevelFromScore(inherentScoreOf(r));
}

export function residualLevelOf(r: Risk | RiskFormValue): RiskLevelValue {
  return riskLevelFromScore(residualScoreOf(r));
}

/** Tỷ lệ giảm rủi ro nhờ kiểm soát, tính theo phần trăm */
export function reductionPercentOf(r: Risk | RiskFormValue): number {
  const inherent = inherentScoreOf(r);
  if (inherent <= 0) return 0;
  return Math.round(((inherent - residualScoreOf(r)) / inherent) * 100);
}

/** Rủi ro bắt buộc phải có kế hoạch KPPN khi mức còn lại từ Cao trở lên */
export function requireTreatmentPlan(r: Risk | RiskFormValue): boolean {
  const lv = residualLevelOf(r);
  return lv === "Cao" || lv === "Trọng yếu";
}

/* ==================================================================
   Trạng thái và quyền chỉnh sửa
   ================================================================== */

/** Trạng thái đang khoá thì chỉ được xem, không sửa nội dung */
export function isRiskEditable(status: RiskStatus): boolean {
  return !LOCKED_EDIT_STATUSES.has(status);
}

export function riskNextTransitions(status: RiskStatus) {
  return nextTransitions(RISK_FLOW, status);
}

/** Rủi ro cần rà soát: đã quá ngày rà soát mà chưa đóng */
export function isReviewOverdue(r: Risk, today = new Date()): boolean {
  if (!r.reviewDate) return false;
  if (r.status === "Đã đóng" || r.status === "Từ chối") return false;
  const d = new Date(r.reviewDate);
  d.setHours(23, 59, 59, 999);
  return d.getTime() < today.getTime();
}

/* ==================================================================
   Tìm kiếm và sắp xếp
   ================================================================== */

/** Chuỗi phục vụ tìm kiếm không dấu trên màn hình danh sách */
export function riskSearchText(r: Risk, extra: string[] = []): string {
  return [r.code, r.name, r.description, r.cause, ...r.tags, ...extra].join(
    " ",
  );
}

/** Thứ tự mức độ, dùng khi sắp xếp theo mức thay vì theo điểm */
export const RISK_LEVEL_ORDER: Record<RiskLevelValue, number> = {
  Thấp: 1,
  "Trung bình": 2,
  Cao: 3,
  "Trọng yếu": 4,
};

/* ==================================================================
   Thống kê nhanh cho thẻ tổng quan
   ================================================================== */

export interface RiskSummary {
  total: number;
  byLevel: Record<RiskLevelValue, number>;
  keyRisk: number;
  zeroTolerance: number;
  reviewOverdue: number;
  openStatus: number;
  totalEstimatedLoss: number;
}

export function summarizeRisks(rows: Risk[]): RiskSummary {
  const byLevel: Record<RiskLevelValue, number> = {
    Thấp: 0,
    "Trung bình": 0,
    Cao: 0,
    "Trọng yếu": 0,
  };

  let keyRisk = 0;
  let zeroTolerance = 0;
  let reviewOverdue = 0;
  let openStatus = 0;
  let totalEstimatedLoss = 0;

  rows.forEach((r) => {
    byLevel[residualLevelOf(r)] += 1;
    if (r.isKeyRisk) keyRisk += 1;
    if (r.isZeroTolerance) zeroTolerance += 1;
    if (isReviewOverdue(r)) reviewOverdue += 1;
    if (r.status !== "Đã đóng" && r.status !== "Từ chối") openStatus += 1;
    totalEstimatedLoss += r.estimatedLoss ?? 0;
  });

  return {
    total: rows.length,
    byLevel,
    keyRisk,
    zeroTolerance,
    reviewOverdue,
    openStatus,
    totalEstimatedLoss,
  };
}

/* ==================================================================
   Dữ liệu form
   ================================================================== */

/** Giá trị khởi tạo cho form thêm mới */
export function emptyRiskForm(
  preset: Partial<RiskFormValue> = {},
): RiskFormValue {
  return {
    name: "",
    description: "",
    cause: "",
    consequence: "",
    categoryId: "",
    objectiveIds: [],
    unitId: "",
    ownerId: "",
    processId: "",
    systemId: "",
    source: "Nội bộ",
    inherentLikelihood: 3,
    inherentImpact: 3,
    residualLikelihood: 3,
    residualImpact: 3,
    treatment: "Giảm thiểu",
    treatmentNote: "",
    isZeroTolerance: false,
    isKeyRisk: false,
    identifiedDate: toInputDate(new Date()),
    reviewDate: "",
    status: "Nháp",
    statusNote: "",
    estimatedLoss: null,
    tags: [],
    ...preset,
  };
}

/** Chuyển bản ghi đang có sang giá trị form để sửa */
export function riskToForm(r: Risk): RiskFormValue {
  return {
    name: r.name,
    description: r.description,
    cause: r.cause,
    consequence: r.consequence,
    categoryId: r.categoryId,
    objectiveIds: [...r.objectiveIds],
    unitId: r.unitId,
    ownerId: r.ownerId,
    processId: r.processId,
    systemId: r.systemId,
    source: r.source,
    inherentLikelihood: r.inherentLikelihood,
    inherentImpact: r.inherentImpact,
    residualLikelihood: r.residualLikelihood,
    residualImpact: r.residualImpact,
    treatment: r.treatment,
    treatmentNote: r.treatmentNote,
    isZeroTolerance: r.isZeroTolerance,
    isKeyRisk: r.isKeyRisk,
    identifiedDate: r.identifiedDate,
    reviewDate: r.reviewDate,
    status: r.status,
    statusNote: r.statusNote,
    estimatedLoss: r.estimatedLoss,
    tags: [...r.tags],
  };
}

export interface RiskValidateResult {
  ok: boolean;
  data?: RiskFormValue;
  errors: FieldErrors;
}

/** Kiểm tra toàn bộ form theo riskFormSchema, trả về map lỗi theo trường */
export function validateRiskForm(value: unknown): RiskValidateResult {
  const parsed = riskFormSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, data: parsed.data, errors: {} };
  }
  return { ok: false, errors: zodErrors(parsed.error) };
}

/**
 * Cảnh báo nghiệp vụ không chặn lưu, hiển thị dạng thông báo vàng
 * trên form. Khác với lỗi validation là chặn lưu hoàn toàn.
 */
export function riskWarnings(v: RiskFormValue): string[] {
  const out: string[] = [];

  if (requireTreatmentPlan(v)) {
    out.push(
      `Mức rủi ro còn lại là ${residualLevelOf(v)}, theo quy định phải có kế hoạch khắc phục và phòng ngừa kèm theo.`,
    );
  }

  if (v.isZeroTolerance && residualLevelOf(v) !== "Thấp") {
    out.push(
      "Rủi ro không khoan nhượng nhưng mức còn lại chưa về Thấp, cần bổ sung kiểm soát.",
    );
  }

  if (
    residualScoreOf(v) === inherentScoreOf(v) &&
    v.treatment === "Giảm thiểu"
  ) {
    out.push(
      "Phương án là Giảm thiểu nhưng điểm rủi ro còn lại bằng điểm cố hữu, kiểm tra lại đánh giá sau kiểm soát.",
    );
  }

  if (!v.reviewDate) {
    out.push("Chưa đặt ngày rà soát định kỳ cho rủi ro này.");
  }

  if (v.estimatedLoss === null && requireTreatmentPlan(v)) {
    out.push("Rủi ro mức Cao trở lên nên ước tính giá trị tổn thất.");
  }

  return out;
}

/* ==================================================================
   Trạng thái đánh giá điểm rủi ro còn lại

   Lô này KHÔNG tự tính điểm còn lại từ tập kiểm soát. Người dùng tự
   chấm, hệ thống chỉ nhận diện và nhắc khi điểm đã cũ hoặc chưa chấm.
   ================================================================== */

interface RiskAssessmentInput {
  id: string;
  residualAssessedAt?: string;
  controlsChangedAt?: string;
  residualLikelihood?: number | null;
  residualImpact?: number | null;
}

interface ControlCoverageInput {
  riskIds?: string[];
  status?: string;
}

/** Kiểm soát ở trạng thái chưa phê duyệt thì chưa coi là đang phủ rủi ro */
const COVERAGE_EXCLUDED_STATUS = new Set(["Nháp", "Chờ duyệt"]);

/** Rủi ro này có kiểm soát nào phủ chưa */
export function hasControlCoverage(
  risk: { id: string },
  controls: ControlCoverageInput[],
): boolean {
  return controls.some(
    (c) =>
      Array.isArray(c.riskIds) &&
      c.riskIds.includes(risk.id) &&
      !COVERAGE_EXCLUDED_STATUS.has(c.status ?? ""),
  );
}

/** Số kiểm soát đang phủ rủi ro này */
export function controlCoverageCount(
  risk: { id: string },
  controls: ControlCoverageInput[],
): number {
  return controls.filter(
    (c) =>
      Array.isArray(c.riskIds) &&
      c.riskIds.includes(risk.id) &&
      !COVERAGE_EXCLUDED_STATUS.has(c.status ?? ""),
  ).length;
}

/** Đã từng chấm điểm còn lại chưa */
export function isResidualAssessed(risk: RiskAssessmentInput): boolean {
  if (risk.residualAssessedAt && risk.residualAssessedAt.trim()) return true;
  /* Dữ liệu cũ chưa có dấu vết, suy từ chính điểm đã chấm */
  return !!risk.residualLikelihood && !!risk.residualImpact;
}

/**
 * Điểm còn lại đã cũ so với tập kiểm soát.
 * Tập kiểm soát đổi sau lần chấm cuối nghĩa là con số hiện tại
 * không còn phản ánh thực tế.
 */
export function isResidualStale(risk: RiskAssessmentInput): boolean {
  const assessed = (risk.residualAssessedAt ?? "").trim();
  const changed = (risk.controlsChangedAt ?? "").trim();
  if (!assessed || !changed) return false;
  return changed > assessed;
}

/** Trạng thái tổng hợp của việc đánh giá điểm còn lại */
export type ResidualState = "not-assessed" | "stale" | "current";

export function residualStateOf(risk: RiskAssessmentInput): ResidualState {
  if (!isResidualAssessed(risk)) return "not-assessed";
  if (isResidualStale(risk)) return "stale";
  return "current";
}

export function residualStateLabel(state: ResidualState): string {
  switch (state) {
    case "not-assessed":
      return "Chưa đánh giá";
    case "stale":
      return "Điểm còn lại đã cũ";
    default:
      return "Đã đánh giá";
  }
}

export function residualStateHint(state: ResidualState): string {
  switch (state) {
    case "not-assessed":
      return "Chưa chấm điểm rủi ro còn lại, nên chưa biết kiểm soát đã làm giảm rủi ro tới mức nào";
    case "stale":
      return "Tập kiểm soát đã thay đổi sau lần chấm điểm gần nhất, cần đánh giá lại điểm còn lại";
    default:
      return "Điểm còn lại đã được chấm và vẫn khớp với tập kiểm soát hiện tại";
  }
}
