/* ==================================================================
   Vòng đời rủi ro.

   Một nguồn sự thật duy nhất cho 3 nơi:
     - Wizard khai báo  : thứ tự 8 bước và điều kiện mở bước sau
     - Hồ sơ rủi ro     : dải LifecycleStepper 7 bước
     - Sổ rủi ro        : cột hồ sơ thiếu và quick filter 5 nhóm

   Hai nguyên tắc thiết kế của file này:

   1. MỌI CHỖ SO KHỚP THEO KHOÁ, KHÔNG THEO CHỈ SỐ.
      Đây là lần thứ hai đổi số bước (5 lên 8). Dùng chỉ số thì mỗi
      lần đổi phải soát lại toàn bộ file, dùng khoá thì chỉ sửa mảng
      cấu hình.

   2. TÊN TRƯỜNG PHẢI KHỚP riskSchema.
      treatment, reviewDate, identifiedDate là tên thật. Trước đây file
      này đọc treatmentStrategy và nextReviewDate nên hai hàm liên quan
      luôn trả về sai.
   ================================================================== */

import { isResidualAssessed, isResidualStale } from "./risk-utils";

/* ------------------------------------------------------------------ */
/* Kiểu tối giản, không phụ thuộc schema                               */
/* ------------------------------------------------------------------ */

export interface RiskLifecycleInput {
  id: string;
  status?: string;

  /* --- Bước 1: bối cảnh --- */
  objectiveIds?: string[];
  unitId?: string;
  processId?: string;
  systemId?: string;

  /* --- Bước 2: nhận diện --- */
  name?: string;
  description?: string;
  categoryId?: string;
  ownerId?: string;
  identifiedDate?: string;

  /* --- Bước 3: đánh giá vốn có --- */
  inherentLikelihood?: number | null;
  inherentImpact?: number | null;

  /* --- Bước 6: đánh giá còn lại --- */
  residualLikelihood?: number | null;
  residualImpact?: number | null;
  residualAssessedAt?: string;
  residualRationale?: string;
  controlsChangedAt?: string;

  /* --- Bước 7: phương án xử lý --- */
  treatment?: string;
  treatmentNote?: string;
  reviewDate?: string;

  /* --- Tuyên bố không áp dụng kiểm soát --- */
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
/* Tám giai đoạn                                                       */
/* ------------------------------------------------------------------ */

export type RiskStageKey =
  | "context"
  | "identify"
  | "inherent"
  | "controls"
  | "weakness"
  | "residual"
  | "treat"
  | "review"
  | "closed";

export interface RiskStageMeta {
  key: RiskStageKey;
  label: string;
  description: string;
  /** Bước tuỳ chọn, bỏ qua được mà không chặn bước sau */
  optional?: boolean;
  /**
   * Chỉ tồn tại trong wizard, không phải giai đoạn của bản ghi.
   * Dải vòng đời trên hồ sơ rủi ro không hiện bước này.
   */
  wizardOnly?: boolean;
}

export const RISK_STAGES: RiskStageMeta[] = [
  {
    key: "context",
    label: "Bối cảnh",
    description: "Mục tiêu, đơn vị, quy trình và hệ thống liên quan",
  },
  {
    key: "identify",
    label: "Nhận diện",
    description: "Tên, mô tả, nhóm rủi ro và chủ sở hữu",
  },
  {
    key: "inherent",
    label: "Đánh giá vốn có",
    description: "Chấm điểm khi chưa tính tới kiểm soát",
  },
  {
    key: "controls",
    label: "Chọn kiểm soát",
    description: "Gắn kiểm soát đang bảo vệ rủi ro này",
  },
  {
    key: "weakness",
    label: "Điểm yếu",
    description: "Ghi nhận nghi ngờ điểm yếu, có thể bỏ qua",
    optional: true,
  },
  {
    key: "residual",
    label: "Đánh giá còn lại",
    description: "Chấm lại điểm sau khi đã có kiểm soát",
  },
  {
    key: "treat",
    label: "Phương án xử lý",
    description: "Chiến lược ứng phó và kỳ rà soát lại",
  },
  {
    key: "review",
    label: "Rà soát và gửi",
    description: "Xem lại toàn bộ hồ sơ trước khi lưu",
    wizardOnly: true,
  },
];

/** Các bước hiện trong wizard, đủ 8 */
export const WIZARD_STAGES = RISK_STAGES;

/**
 * Các bước hiện trên dải vòng đời của hồ sơ, 7 bước.
 * Bỏ Rà soát vì đó là thao tác của wizard, không phải trạng thái hồ sơ.
 */
export const LIFECYCLE_STAGES = RISK_STAGES.filter((s) => !s.wizardOnly);

/** Tra nhanh theo khoá, tránh dùng chỉ số ở mọi nơi */
export function stageMetaOf(key: RiskStageKey): RiskStageMeta | undefined {
  return RISK_STAGES.find((s) => s.key === key);
}

/** Vị trí của một bước trong wizard, dùng khi cần so trước sau */
export function stageIndexOf(key: RiskStageKey): number {
  return RISK_STAGES.findIndex((s) => s.key === key);
}

/* ------------------------------------------------------------------ */
/* Trạng thái đã kết thúc                                              */
/* ------------------------------------------------------------------ */

/** Giữ một chỗ để đổi enum không phải soát lại toàn file */
const CLOSED_STATUS = new Set(["Đã đóng", "Từ chối"]);

export function isRiskClosed(r: RiskLifecycleInput): boolean {
  return CLOSED_STATUS.has(r.status ?? "");
}

/* ------------------------------------------------------------------ */
/* Điều kiện hoàn tất từng giai đoạn                                   */
/* ------------------------------------------------------------------ */

/**
 * Bước 1 Bối cảnh.
 * objectiveIds là quy tắc nghiệp vụ cốt lõi, riskSchema khai .min(1)
 * nên bản ghi không có mục tiêu là bản ghi không hợp lệ.
 */
export function isContextDone(r: RiskLifecycleInput): boolean {
  const hasObjective = Array.isArray(r.objectiveIds)
    ? r.objectiveIds.length > 0
    : false;
  return hasObjective && !!(r.unitId && r.unitId.trim());
}

/** Bước 2 Nhận diện */
export function isIdentifyDone(r: RiskLifecycleInput): boolean {
  return !!(
    r.name &&
    r.name.trim() &&
    r.categoryId &&
    r.categoryId.trim() &&
    r.ownerId &&
    r.ownerId.trim() &&
    r.identifiedDate &&
    r.identifiedDate.trim()
  );
}

/**
 * Bước 3 Đánh giá vốn có.
 *
 * score là trường bắt buộc 1 tới 5 nên luôn có giá trị, emptyRiskForm
 * khởi tạo 3/3. Vì vậy hàm này chỉ kiểm tra dữ liệu hợp lệ, KHÔNG kết
 * luận được người dùng đã thực sự đánh giá hay chưa. Việc theo dõi
 * người dùng có chạm vào bảng điểm hay không do wizard tự giữ bằng
 * state cục bộ, không lưu vào bản ghi.
 */
export function isInherentDone(r: RiskLifecycleInput): boolean {
  return !!r.inherentLikelihood && !!r.inherentImpact;
}

/** Bước 4 Chọn kiểm soát */
export function isControlStageDone(
  r: RiskLifecycleInput,
  controlCount: number,
): boolean {
  if (controlCount > 0) return true;
  /* Rủi ro thấp được phép tuyên bố chấp nhận, không áp dụng kiểm soát */
  return !!r.noControlAccepted;
}

/**
 * Bước 5 Điểm yếu là bước TUỲ CHỌN.
 *
 * Luôn coi là đã hoàn tất để không chặn bước 6. Nếu người dùng có khai
 * điểm yếu thì bản ghi Deficiency được tạo riêng, và mối liên kết hiện
 * ở tab Điểm yếu của hồ sơ rủi ro chứ không phải ở dải vòng đời.
 */
export function isWeaknessDone(): boolean {
  return true;
}

/** Bước 6 Đánh giá còn lại */
export function isResidualDone(r: RiskLifecycleInput): boolean {
  return isResidualAssessed(r) && !isResidualStale(r);
}

/**
 * Bước 7 Phương án xử lý.
 * riskFormSchema bắt buộc treatmentNote khi treatment khác Chấp nhận,
 * nên kiểm tra cả hai trường thay vì chỉ treatment.
 */
export function isTreatDone(r: RiskLifecycleInput): boolean {
  const t = (r.treatment ?? "").trim();
  if (!t) return false;
  if (t === "Chấp nhận") return true;
  return !!(r.treatmentNote && r.treatmentNote.trim());
}

/** Điểm vốn có từ mức Cao trở lên thì bắt buộc phải có kiểm soát */
export function requiresControl(r: RiskLifecycleInput): boolean {
  const l = r.inherentLikelihood ?? 0;
  const i = r.inherentImpact ?? 0;
  return l * i > 9;
}

/* ------------------------------------------------------------------ */
/* Giai đoạn hiện tại                                                  */
/* ------------------------------------------------------------------ */

/**
 * Giai đoạn mà rủi ro đang dừng lại.
 *
 * Lưu ý quan trọng: bước weakness KHÔNG xuất hiện trong chuỗi kiểm tra
 * này, vì nó tuỳ chọn. Nếu đưa vào, người dùng bỏ qua bước 5 sẽ bị
 * khoá luôn bước 6, đúng cái bẫy đã nêu trong phân tích.
 */
export function riskStageOf(
  r: RiskLifecycleInput,
  controlCount: number,
): RiskStageKey {
  if (isRiskClosed(r)) return "closed";
  if (!isContextDone(r)) return "context";
  if (!isIdentifyDone(r)) return "identify";
  if (!isInherentDone(r)) return "inherent";
  if (!isControlStageDone(r, controlCount)) return "controls";
  if (!isResidualDone(r)) return "residual";
  if (!isTreatDone(r)) return "treat";
  return "treat";
}

export function riskStageLabel(key: RiskStageKey): string {
  if (key === "closed") return "Đã kết thúc";
  return stageMetaOf(key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/* Quá kỳ rà soát lại                                                  */
/* ------------------------------------------------------------------ */

/**
 * Đã qua ngày rà soát lại theo kế hoạch chưa.
 *
 * Đọc reviewDate đúng theo riskSchema. Trước đây hàm này đọc
 * nextReviewDate nên luôn trả về false, khiến nhãn Quá kỳ đánh giá
 * không bao giờ hiện và chip cùng tên luôn đếm 0.
 */
export function isReviewOverdue(r: RiskLifecycleInput): boolean {
  const due = (r.reviewDate ?? "").trim();
  if (!due) return false;
  if (isRiskClosed(r)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return due < today;
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

/**
 * Dựng 7 bước cho dải vòng đời trên hồ sơ rủi ro.
 *
 * Bước Rà soát không có mặt vì mang cờ wizardOnly.
 *
 * Bước Điểm yếu là bước tuỳ chọn nên có 2 trạng thái riêng:
 *   - Có bản ghi điểm yếu   : done
 *   - Không có              : skipped, kèm mô tả Đã bỏ qua
 * Không bao giờ là todo, vì như vậy hồ sơ sẽ trông như còn thiếu việc
 * trong khi người dùng đã chủ động bỏ qua.
 *
 * @param deficiencyCount Số điểm yếu đang gắn với rủi ro này. Màn hình
 *                        gọi hàm tự đếm và truyền vào, để file domain
 *                        không phải phụ thuộc repo.
 */
export function riskStepViews(
  r: RiskLifecycleInput,
  controlCount: number,
  deficiencyCount = 0,
): RiskStepView[] {
  const stage = riskStageOf(r, controlCount);
  const closed = stage === "closed";

  const doneMap: Record<RiskStageKey, boolean> = {
    context: isContextDone(r),
    identify: isIdentifyDone(r),
    inherent: isInherentDone(r),
    controls: isControlStageDone(r, controlCount),
    weakness: deficiencyCount > 0,
    residual: isResidualDone(r),
    treat: isTreatDone(r),
    review: closed,
    closed,
  };

  return LIFECYCLE_STAGES.map((s) => {
    /* --- Trạng thái hình ảnh của bước --- */
    let state: StepStateValue = "todo";

    if (doneMap[s.key]) state = "done";
    else if (s.optional) state = "skipped";
    else if (!closed && s.key === stage) state = "current";

    /* --- Dấu cảnh báo trên bước --- */
    let warning: string | undefined;

    if (s.key === "context" && !doneMap.context)
      warning = "Bắt buộc gắn mục tiêu";

    if (s.key === "controls" && !doneMap.controls && requiresControl(r))
      warning = "Bắt buộc có kiểm soát";

    if (s.key === "residual" && isResidualAssessed(r) && isResidualStale(r))
      warning = "Điểm còn lại đã cũ";

    if (s.key === "treat" && doneMap.treat && isReviewOverdue(r))
      warning = "Quá kỳ rà soát";

    /* --- Mô tả riêng cho bước tuỳ chọn --- */
    const description =
      s.optional && !doneMap[s.key]
        ? "Đã bỏ qua, ghi nhận sau cũng được"
        : s.optional && doneMap[s.key]
          ? `Đã ghi nhận ${deficiencyCount} điểm yếu`
          : s.description;

    return {
      key: s.key,
      label: s.label,
      description,
      state,
      warning,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Chỉ báo hồ sơ còn thiếu                                             */
/* ------------------------------------------------------------------ */

export function riskMissingInfo(
  r: RiskLifecycleInput,
  controlCount: number,
): RiskMissingItem[] {
  const out: RiskMissingItem[] = [];
  if (isRiskClosed(r)) return out;

  /* ---------------- Bước 1: bối cảnh ---------------- */

  const hasObjective = Array.isArray(r.objectiveIds)
    ? r.objectiveIds.length > 0
    : false;

  if (!hasObjective)
    out.push({
      label: "Chưa gắn mục tiêu",
      tone: "danger",
      hint: "Rủi ro phải gắn với ít nhất 1 mục tiêu, vì rủi ro chỉ có nghĩa khi nó đe doạ một mục tiêu cụ thể",
      blocking: true,
    });

  if (!r.unitId || !r.unitId.trim())
    out.push({
      label: "Chưa chọn đơn vị",
      tone: "danger",
      hint: "Không có đơn vị thì không biết rủi ro thuộc phạm vi quản lý của ai",
      blocking: true,
    });

  /* ---------------- Bước 2: nhận diện ---------------- */

  if (!r.ownerId || !r.ownerId.trim())
    out.push({
      label: "Chưa gán chủ sở hữu",
      tone: "danger",
      hint: "Không có chủ sở hữu thì không ai chịu trách nhiệm theo dõi rủi ro này",
      blocking: true,
    });

  if (!r.categoryId || !r.categoryId.trim())
    out.push({
      label: "Chưa chọn nhóm rủi ro",
      tone: "warning",
      hint: "Thiếu nhóm rủi ro thì không tổng hợp được báo cáo theo phân loại",
      blocking: true,
    });

  /* ---------------- Bước 4: kiểm soát ---------------- */

  if (controlCount === 0 && !r.noControlAccepted)
    out.push({
      label: "Chưa gắn kiểm soát",
      tone: requiresControl(r) ? "danger" : "warning",
      hint: requiresControl(r)
        ? "Rủi ro vốn có mức Cao trở lên bắt buộc có ít nhất 1 kiểm soát"
        : "Nên gắn kiểm soát, hoặc tuyên bố chấp nhận rủi ro nếu không áp dụng kiểm soát nào",
      blocking: requiresControl(r),
    });

  /* ---------------- Bước 6: đánh giá còn lại ---------------- */

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

  /* ---------------- Bước 7: phương án xử lý ---------------- */

  const treatment = (r.treatment ?? "").trim();

  if (!treatment)
    out.push({
      label: "Chưa chọn phương án xử lý",
      tone: "info",
      hint: "Chưa quyết định sẽ giảm thiểu, chuyển giao, tránh hay chấp nhận rủi ro này",
    });
  else if (treatment !== "Chấp nhận" && !(r.treatmentNote ?? "").trim())
    out.push({
      label: "Chưa mô tả định hướng xử lý",
      tone: "info",
      hint: "Phương án khác Chấp nhận bắt buộc mô tả sẽ làm gì cụ thể, nếu không thì không lưu được hồ sơ",
      blocking: true,
    });

  if (!r.reviewDate || !r.reviewDate.trim())
    out.push({
      label: "Chưa đặt kỳ rà soát",
      tone: "info",
      hint: "Không có kỳ rà soát thì hệ thống không nhắc được khi số liệu đã cũ",
    });
  else if (isReviewOverdue(r))
    out.push({
      label: "Quá kỳ rà soát",
      tone: "warning",
      hint: "Đã qua ngày rà soát lại theo kế hoạch, số liệu hiện tại có thể không còn phản ánh thực tế",
    });

  return out;
}

/* ------------------------------------------------------------------ */
/* Quick filter gom 5 nhóm nghiệp vụ                                   */
/* ------------------------------------------------------------------ */

/**
 * Vì sao gom nhóm.
 *
 * 8 giai đoạn cộng 4 chip đặc biệt sẽ thành 13 chip, tràn 2 tới 3 dòng
 * trên màn 1440px. Gom về 5 nhóm nghiệp vụ giữ dải lọc trên một dòng,
 * mà vẫn phân biệt được rủi ro đang dừng ở khâu nào.
 *
 * Dải LifecycleStepper trên hồ sơ vẫn hiện đủ 7 bước, nên người dùng
 * không mất chi tiết: lọc theo nhóm lớn, xem chi tiết theo từng bước.
 */
export type RiskGroupKey =
  | "declaring"
  | "assessing"
  | "controlling"
  | "residual"
  | "treating"
  | "closed";

/** Giai đoạn thuộc nhóm nào */
const STAGE_TO_GROUP: Record<RiskStageKey, RiskGroupKey> = {
  context: "declaring",
  identify: "declaring",
  inherent: "assessing",
  controls: "controlling",
  weakness: "controlling",
  residual: "residual",
  treat: "treating",
  review: "treating",
  closed: "closed",
};

export function riskGroupOf(
  r: RiskLifecycleInput,
  controlCount: number,
): RiskGroupKey {
  return STAGE_TO_GROUP[riskStageOf(r, controlCount)];
}

export interface QuickFilterOption {
  key: string;
  label: string;
  hint: string;
}

export const RISK_QUICK_FILTERS: QuickFilterOption[] = [
  { key: "all", label: "Tất cả", hint: "Toàn bộ rủi ro trong phạm vi" },

  /* --- 5 nhóm nghiệp vụ --- */
  {
    key: "declaring",
    label: "Đang khai báo",
    hint: "Còn thiếu bối cảnh hoặc thông tin nhận diện cơ bản",
  },
  {
    key: "assessing",
    label: "Chờ đánh giá vốn có",
    hint: "Đã khai báo xong nhưng chưa có điểm rủi ro vốn có",
  },
  {
    key: "controlling",
    label: "Chờ gắn kiểm soát",
    hint: "Đã chấm điểm vốn có nhưng chưa gắn kiểm soát nào",
  },
  {
    key: "residual",
    label: "Chờ đánh giá còn lại",
    hint: "Đã có kiểm soát nhưng chưa chấm hoặc điểm còn lại đã cũ",
  },
  {
    key: "treating",
    label: "Đang theo dõi",
    hint: "Hồ sơ đã đủ, đang trong kỳ theo dõi theo phương án xử lý",
  },
  {
    key: "closed",
    label: "Đã kết thúc",
    hint: "Rủi ro đã đóng hoặc bị từ chối",
  },

  /* --- 3 chip theo chất lượng hồ sơ --- */
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
    label: "Quá kỳ rà soát",
    hint: "Đã qua ngày rà soát lại theo kế hoạch",
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

  /* Còn lại là 6 nhóm nghiệp vụ */
  return riskGroupOf(r, controlCount) === key;
}
