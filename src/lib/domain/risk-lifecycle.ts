/* ==================================================================
   Vòng đời rủi ro.

   Một nguồn sự thật duy nhất cho 3 nơi:
     - Wizard khai báo  : thứ tự bước và điều kiện mở bước sau
     - Hồ sơ rủi ro     : dải LifecycleStepper
     - Sổ rủi ro        : cột hồ sơ thiếu và quick filter

   Lô này KHÔNG tự tính điểm còn lại. Hệ thống chỉ dẫn đường và chỉ ra
   chỗ còn thiếu, người dùng tự chấm điểm và tự kết luận.
   ================================================================== */

import { isResidualAssessed, isResidualStale } from "./risk-utils";

/* ------------------------------------------------------------------ */
/* Kiểu tối giản, không phụ thuộc schema                               */
/* ------------------------------------------------------------------ */

export interface RiskLifecycleInput {
  id: string;
  status?: string;
  ownerId?: string;
  inherentLikelihood?: number | null;
  inherentImpact?: number | null;
  residualLikelihood?: number | null;
  residualImpact?: number | null;
  residualAssessedAt?: string;
  residualRationale?: string;
  controlsChangedAt?: string;
    /* Tên trường khớp đúng riskSchema, đừng đổi tuỳ ý */
  treatment?: string;
  treatmentNote?: string;
  reviewDate?: string;
  objectiveIds?: string[];
  noControlAccepted?: boolean;

}

/** Cấu trúc trùng khớp với MissingItem của MissingInfoCell */
export interface RiskMissingItem {
  label: string;
  tone: "danger" | "warning" | "info";
  hint: string;
  blocking?: boolean;
}

/* ------------------------------------------------------------------ */
/* Năm giai đoạn                                        */
/* ------------------------------------------------------------------ */

export type RiskStageKey =
  | "identify"
  | "inherent"
  | "controls"
  | "residual"
  | "treat"
  | "closed";

export interface RiskStageMeta {
  key: RiskStageKey;
  label: string;
  description: string;
}

export const RISK_STAGES: RiskStageMeta[] = [
  {
    key: "identify",
    label: "Nhận diện",
    description: "Đã ghi nhận và có chủ sở hữu",
  },
  {
    key: "inherent",
    label: "Đánh giá cố hữu",
    description: "Chấm điểm khi chưa có kiểm soát",
  },
  {
    key: "controls",
    label: "Gắn kiểm soát",
    description: "Chọn kiểm soát từ thư viện",
  },
  {
    key: "residual",
    label: "Đánh giá còn lại",
    description: "Chấm lại điểm sau khi có kiểm soát",
  },
  {
    key: "treat",
    label: "Ứng phó và theo dõi",
    description: "Chiến lược ứng phó và kỳ đánh giá lại",
  },
];

/** Trạng thái coi là đã đóng, giữ một chỗ để đổi enum không phải soát lại */
const CLOSED_STATUS = new Set(["Đã đóng", "Từ chối"]);

export function isRiskClosed(r: RiskLifecycleInput): boolean {
  return CLOSED_STATUS.has(r.status ?? "");
}

/* ------------------------------------------------------------------ */
/* Điều kiện hoàn tất từng giai đoạn                                   */
/* ------------------------------------------------------------------ */

export function isIdentifyDone(r: RiskLifecycleInput): boolean {
  return !!(r.ownerId && r.ownerId.trim());
}

export function isInherentDone(r: RiskLifecycleInput): boolean {
  return !!r.inherentLikelihood && !!r.inherentImpact;
}

export function isControlStageDone(
  r: RiskLifecycleInput,
  controlCount: number,
): boolean {
  if (controlCount > 0) return true;
  /* Rủi ro thấp được phép tuyên bố chấp nhận, không áp dụng kiểm soát */
  return !!r.noControlAccepted;
}

export function isResidualDone(r: RiskLifecycleInput): boolean {
  return isResidualAssessed(r) && !isResidualStale(r);
}

/**
 * Bước ứng phó hoàn tất khi có CẢ phương án và mô tả định hướng.
 * Schema bắt buộc treatmentNote với mọi phương án khác Chấp nhận, nên
 * chỉ có phương án mà thiếu mô tả thì hồ sơ vẫn chưa đủ.
 */
export function isTreatDone(r: RiskLifecycleInput): boolean {
  const t = (r.treatment ?? "").trim();
  if (!t) return false;
  if (t === "Chấp nhận") return true;
  return !!(r.treatmentNote && r.treatmentNote.trim());
}


/** Điểm cố hữu từ mức Cao trở lên thì bắt buộc phải có kiểm soát */
export function requiresControl(r: RiskLifecycleInput): boolean {
  const l = r.inherentLikelihood ?? 0;
  const i = r.inherentImpact ?? 0;
  return l * i > 9;
}

/* ------------------------------------------------------------------ */
/* Giai đoạn hiện tại                                        */
/* ------------------------------------------------------------------ */

export function riskStageOf(
  r: RiskLifecycleInput,
  controlCount: number,
): RiskStageKey {
  if (isRiskClosed(r)) return "closed";
  if (!isIdentifyDone(r)) return "identify";
  if (!isInherentDone(r)) return "inherent";
  if (!isControlStageDone(r, controlCount)) return "controls";
  if (!isResidualDone(r)) return "residual";
  return "treat";
}

export function riskStageLabel(key: RiskStageKey): string {
  if (key === "closed") return "Đã kết thúc";
  return RISK_STAGES.find((s) => s.key === key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/* Trạng thái từng bước cho LifecycleStepper                           */
/* ------------------------------------------------------------------ */

export type StepStateValue = "done" | "current" | "todo" | "skipped";

export interface RiskStepView {
  key: RiskStageKey;
  label: string;
  description: string;
  state: StepStateValue;
  warning?: string;
}

export function riskStepViews(
  r: RiskLifecycleInput,
  controlCount: number,
): RiskStepView[] {
  const stage = riskStageOf(r, controlCount);
  const closed = stage === "closed";
  const currentIndex = closed
    ? RISK_STAGES.length
    : RISK_STAGES.findIndex((s) => s.key === stage);

  const doneMap: Record<RiskStageKey, boolean> = {
    identify: isIdentifyDone(r),
    inherent: isInherentDone(r),
    controls: isControlStageDone(r, controlCount),
    residual: isResidualDone(r),
    treat: isTreatDone(r),
    closed: closed,
  };

  return RISK_STAGES.map((s, i) => {
    let state: StepStateValue = "todo";
    if (doneMap[s.key]) state = "done";
    else if (i === currentIndex) state = "current";

    let warning: string | undefined;

    if (s.key === "controls" && !doneMap.controls && requiresControl(r))
      warning = "Bắt buộc có kiểm soát";

    if (s.key === "residual" && isResidualAssessed(r) && isResidualStale(r))
      warning = "Điểm còn lại đã cũ";

    if (s.key === "treat" && doneMap.treat && isReviewOverdue(r))
      warning = "Quá kỳ đánh giá";

    return {
      key: s.key,
      label: s.label,
      description: s.description,
      state,
      warning,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Quá kỳ đánh giá lại                                        */
/* ------------------------------------------------------------------ */

export function isReviewOverdue(r: RiskLifecycleInput): boolean {
    const due = (r.reviewDate ?? "").trim();

  if (!due) return false;
  const today = new Date().toISOString().slice(0, 10);
  return due < today && !isRiskClosed(r);
}

/* ------------------------------------------------------------------ */
/* Chỉ báo hồ sơ còn thiếu                                        */
/* ------------------------------------------------------------------ */

export function riskMissingInfo(
  r: RiskLifecycleInput,
  controlCount: number,
): RiskMissingItem[] {
  const out: RiskMissingItem[] = [];
  if (isRiskClosed(r)) return out;
    if (!Array.isArray(r.objectiveIds) || r.objectiveIds.length === 0)
    out.push({
      label: "Chưa gắn mục tiêu",
      tone: "danger",
      hint: "Rủi ro phải gắn với ít nhất 1 mục tiêu, đây là quy tắc nghiệp vụ cốt lõi. Không gắn thì không biết rủi ro này đe doạ điều gì",
      blocking: true,
    });


  if (!isIdentifyDone(r))
    out.push({
      label: "Chưa gán chủ sở hữu",
      tone: "danger",
      hint: "Không có chủ sở hữu thì không ai chịu trách nhiệm theo dõi rủi ro này",
      blocking: true,
    });

  if (!isInherentDone(r))
    out.push({
      label: "Chưa đánh giá cố hữu",
      tone: "danger",
      hint: "Thiếu điểm cố hữu thì không có mốc so sánh để biết kiểm soát đã giảm được bao nhiêu",
      blocking: true,
    });

  if (controlCount === 0 && !r.noControlAccepted)
    out.push({
      label: "Chưa gắn kiểm soát",
      tone: requiresControl(r) ? "danger" : "warning",
      hint: requiresControl(r)
        ? "Rủi ro cố hữu mức Cao trở lên bắt buộc có ít nhất 1 kiểm soát"
        : "Nên gắn kiểm soát, hoặc tuyên bố chấp nhận rủi ro nếu không áp dụng kiểm soát nào",
      blocking: requiresControl(r),
    });

  if (!isResidualAssessed(r))
    out.push({
      label: "Chưa chấm điểm còn lại",
      tone: "warning",
      hint: "Chưa biết kiểm soát hiện có đã làm giảm rủi ro tới mức nào",
      blocking: true,
    });
  else if (isResidualStale(r))
    out.push({
      label: "Điểm còn lại đã cũ",
      tone: "warning",
      hint: "Tập kiểm soát đã thay đổi sau lần chấm gần nhất, cần đánh giá lại",
    });

  if (!isTreatDone(r))
    out.push({
      label: "Chưa có chiến lược ứng phó",
      tone: "info",
      hint: "Chưa quyết định sẽ giảm thiểu, chuyển giao, tránh hay chấp nhận rủi ro này",
    });

  if (isReviewOverdue(r))
    out.push({
      label: "Quá kỳ đánh giá",
      tone: "warning",
      hint: "Đã qua ngày đánh giá lại theo kế hoạch, số liệu hiện tại có thể không còn phản ánh thực tế",
    });

  return out;
}

/* ------------------------------------------------------------------ */
/* Tuỳ chọn quick filter                                        */
/* ------------------------------------------------------------------ */

export type RiskQuickFilterKey =
  | "all"
  | RiskStageKey
  | "missing"
  | "stale-residual"
  | "review-overdue";

export interface QuickFilterOption {
  key: string;
  label: string;
  hint: string;
}

export const RISK_QUICK_FILTERS: QuickFilterOption[] = [
  { key: "all", label: "Tất cả", hint: "Toàn bộ rủi ro trong phạm vi" },
  ...RISK_STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    hint: `Rủi ro đang dừng ở giai đoạn ${s.label.toLowerCase()}`,
  })),
  {
    key: "closed",
    label: "Đã kết thúc",
    hint: "Rủi ro đã đóng hoặc bị từ chối",
  },
  {
    key: "missing",
    label: "Hồ sơ chưa đủ",
    hint: "Còn ít nhất 1 mục hồ sơ chặn quy trình",
  },
  {
    key: "stale-residual",
    label: "Điểm còn lại đã cũ",
    hint: "Tập kiểm soát đã đổi sau lần chấm điểm gần nhất",
  },
  {
    key: "review-overdue",
    label: "Quá kỳ đánh giá",
    hint: "Đã qua ngày đánh giá lại theo kế hoạch",
  },
];

/** Một rủi ro có khớp quick filter đang chọn không */
export function matchRiskQuickFilter(
  key: string,
  r: RiskLifecycleInput,
  controlCount: number,
): boolean {
  if (key === "all") return true;

  if (key === "missing")
    return riskMissingInfo(r, controlCount).some((x) => x.blocking);

  if (key === "stale-residual")
    return isResidualAssessed(r) && isResidualStale(r);

  if (key === "review-overdue") return isReviewOverdue(r);

  return riskStageOf(r, controlCount) === key;
}
