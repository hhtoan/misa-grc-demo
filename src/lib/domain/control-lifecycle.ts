/* ==================================================================
   Vòng đời kiểm soát.

   Một nguồn sự thật duy nhất cho 3 nơi:
     - Sổ đăng ký kiểm soát : quick filter và cột hồ sơ thiếu
     - Chi tiết kiểm soát   : dải LifecycleStepper và khuyến nghị
     - Việc cần xử lý       : điều kiện sinh việc (lô sau)

   Câu hỏi cốt lõi mà file này giúp trả lời:
   KIỂM SOÁT NÀY CÓ ĐANG HOẠT ĐỘNG KHÔNG.
   ================================================================== */

import {
  designEffectivenessOf,
  isNeverAssessed,
  needsEnforcement,
  needsRedesign,
  operationEffectivenessOf,
  overallEffectivenessOf,
  NOT_ASSESSED,
  type ControlEffectivenessInput,
} from "./control-utils";

/* ------------------------------------------------------------------ */
/* Kiểu tối giản, không phụ thuộc schema                               */
/* ------------------------------------------------------------------ */

export interface ControlLifecycleInput extends ControlEffectivenessInput {
  id: string;
  code?: string;
  riskIds?: string[];
  /** Ngày kiểm tra hiệu lực gần nhất */
  lastTestDate?: string;
  /** Ngày phải kiểm tra lần tới theo kế hoạch */
  nextTestDate?: string;
  isKeyControl?: boolean;
}

/** Cấu trúc trùng khớp với MissingItem của MissingInfoCell */
export interface ControlMissingItem {
  label: string;
  tone: "danger" | "warning" | "info";
  hint: string;
  blocking?: boolean;
}

/* ------------------------------------------------------------------ */
/* Năm giai đoạn                                                       */
/* ------------------------------------------------------------------ */

export type ControlStageKey =
  | "design"
  | "approve"
  | "operate"
  | "test"
  | "conclude"
  | "retired";

export interface ControlStageMeta {
  key: ControlStageKey;
  label: string;
  description: string;
}

export const CONTROL_STAGES: ControlStageMeta[] = [
  {
    key: "design",
    label: "Thiết kế",
    description: "Mô tả cách kiểm soát ngăn rủi ro",
  },
  {
    key: "approve",
    label: "Phê duyệt",
    description: "Cấp có thẩm quyền chấp thuận thiết kế",
  },
  {
    key: "operate",
    label: "Đang vận hành",
    description: "Kiểm soát có hiệu lực và được thực hiện",
  },
  {
    key: "test",
    label: "Kiểm tra hiệu lực",
    description: "Thu thập bằng chứng về việc thực hiện",
  },
  {
    key: "conclude",
    label: "Kết luận hiệu lực",
    description: "Có kết luận cả thiết kế và vận hành",
  },
];

/* ------------------------------------------------------------------ */
/* Trạng thái                                                          */
/* ------------------------------------------------------------------ */

const DRAFT_STATUS = new Set(["Nháp"]);
const PENDING_STATUS = new Set(["Chờ duyệt"]);
const RETIRED_STATUS = new Set(["Hết hiệu lực", "Tạm ngưng", "Huỷ"]);

export function isControlDraft(c: ControlLifecycleInput): boolean {
  return DRAFT_STATUS.has(c.status ?? "");
}

export function isControlPending(c: ControlLifecycleInput): boolean {
  return PENDING_STATUS.has(c.status ?? "");
}

export function isControlRetired(c: ControlLifecycleInput): boolean {
  return RETIRED_STATUS.has(c.status ?? "");
}

/** Đã phê duyệt và chưa hết hiệu lực thì coi là đang vận hành */
export function isControlActive(c: ControlLifecycleInput): boolean {
  return !isControlDraft(c) && !isControlPending(c) && !isControlRetired(c);
}

/* ------------------------------------------------------------------ */
/* Điều kiện hoàn tất từng giai đoạn                                   */
/* ------------------------------------------------------------------ */

export function hasRiskCoverage(c: ControlLifecycleInput): boolean {
  return Array.isArray(c.riskIds) && c.riskIds.length > 0;
}

export function hasEverTested(c: ControlLifecycleInput): boolean {
  if (c.lastTestDate && c.lastTestDate.trim()) return true;
  /* Dữ liệu cũ chưa có ngày kiểm tra, suy từ chính kết luận đã có */
  return operationEffectivenessOf(c) !== NOT_ASSESSED;
}

export function isDesignConcluded(c: ControlLifecycleInput): boolean {
  return designEffectivenessOf(c) !== NOT_ASSESSED;
}

export function isOperationConcluded(c: ControlLifecycleInput): boolean {
  return operationEffectivenessOf(c) !== NOT_ASSESSED;
}

export function isFullyConcluded(c: ControlLifecycleInput): boolean {
  return isDesignConcluded(c) && isOperationConcluded(c);
}

/** Quá hạn kiểm tra theo kế hoạch */
export function isTestOverdue(c: ControlLifecycleInput): boolean {
  const due = (c.nextTestDate ?? "").trim();
  if (!due) return false;
  if (!isControlActive(c)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return due < today;
}

/* ------------------------------------------------------------------ */
/* Giai đoạn hiện tại                                                  */
/* ------------------------------------------------------------------ */

export function controlStageOf(c: ControlLifecycleInput): ControlStageKey {
  if (isControlRetired(c)) return "retired";
  if (isControlDraft(c)) return "design";
  if (isControlPending(c)) return "approve";
  if (!hasEverTested(c)) return "operate";
  if (!isFullyConcluded(c)) return "test";
  return "conclude";
}

export function controlStageLabel(key: ControlStageKey): string {
  if (key === "retired") return "Đã ngừng";
  return CONTROL_STAGES.find((s) => s.key === key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/* Trạng thái từng bước cho LifecycleStepper                           */
/* ------------------------------------------------------------------ */

export type StepStateValue = "done" | "current" | "todo" | "skipped";

export interface ControlStepView {
  key: ControlStageKey;
  label: string;
  description: string;
  state: StepStateValue;
  warning?: string;
}

export function controlStepViews(c: ControlLifecycleInput): ControlStepView[] {
  const stage = controlStageOf(c);
  const retired = stage === "retired";

  const currentIndex = retired
    ? CONTROL_STAGES.length
    : CONTROL_STAGES.findIndex((s) => s.key === stage);

  const doneMap: Record<ControlStageKey, boolean> = {
    design: !isControlDraft(c),
    approve: isControlActive(c) || isControlRetired(c),
    operate: isControlActive(c) && hasEverTested(c),
    test: hasEverTested(c),
    conclude: isFullyConcluded(c),
    retired: retired,
  };

  return CONTROL_STAGES.map((s, i) => {
    let state: StepStateValue = "todo";
    if (doneMap[s.key]) state = "done";
    else if (i === currentIndex) state = "current";

    let warning: string | undefined;

    if (s.key === "test" && isTestOverdue(c)) warning = "Quá hạn kiểm tra";

    if (s.key === "conclude" && needsRedesign(c))
      warning = "Thiết kế không hiệu quả";
    else if (s.key === "conclude" && needsEnforcement(c))
      warning = "Vận hành không hiệu quả";

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
/* Chỉ báo hồ sơ còn thiếu                                             */
/* ------------------------------------------------------------------ */

export function controlMissingInfo(
  c: ControlLifecycleInput,
): ControlMissingItem[] {
  const out: ControlMissingItem[] = [];
  if (isControlRetired(c)) return out;

  if (!hasRiskCoverage(c))
    out.push({
      label: "Chưa gắn rủi ro",
      tone: "danger",
      hint: "Kiểm soát không gắn rủi ro nào thì không biết nó đang bảo vệ điều gì, và không xuất hiện khi người dùng chấm điểm rủi ro còn lại",
      blocking: true,
    });

  if (needsRedesign(c))
    out.push({
      label: "Cần thiết kế lại",
      tone: "danger",
      hint: "Thiết kế không phù hợp để ngăn rủi ro. Dù người thực hiện làm đúng quy định thì rủi ro vẫn xảy ra",
      blocking: true,
    });
  else if (needsEnforcement(c))
    out.push({
      label: "Cần chấn chỉnh thực hiện",
      tone: "danger",
      hint: "Thiết kế đúng nhưng trên thực tế không được thực hiện. Cần nhắc người thực hiện thay vì sửa quy định",
      blocking: true,
    });

  if (isNeverAssessed(c) && isControlActive(c))
    out.push({
      label: "Chưa từng đánh giá",
      tone: "warning",
      hint: "Kiểm soát đang có hiệu lực nhưng chưa có bằng chứng nào chứng minh nó hoạt động đúng thiết kế",
      blocking: true,
    });
  else {
    if (!isDesignConcluded(c) && isControlActive(c))
      out.push({
        label: "Chưa đánh giá thiết kế",
        tone: "warning",
        hint: "Chưa kết luận thiết kế có đủ sức ngăn rủi ro hay không",
      });

    if (!isOperationConcluded(c) && isControlActive(c))
      out.push({
        label: "Chưa đánh giá vận hành",
        tone: "warning",
        hint: "Chưa có bằng chứng về việc kiểm soát được thực hiện đúng thiết kế, cần lập đợt kiểm tra",
      });
  }

  if (isTestOverdue(c))
    out.push({
      label: "Quá hạn kiểm tra",
      tone: "warning",
      hint: "Đã qua ngày kiểm tra theo kế hoạch, kết luận hiệu lực hiện tại có thể không còn phản ánh thực tế",
    });

  if (isControlPending(c))
    out.push({
      label: "Chờ phê duyệt",
      tone: "info",
      hint: "Chưa phê duyệt thì kiểm soát chưa được tính là đang bảo vệ rủi ro nào",
    });

  return out;
}

/* ------------------------------------------------------------------ */
/* Tuỳ chọn quick filter                                               */
/* ------------------------------------------------------------------ */

export interface QuickFilterOption {
  key: string;
  label: string;
  hint: string;
}

export const CONTROL_QUICK_FILTERS: QuickFilterOption[] = [
  { key: "all", label: "Tất cả", hint: "Toàn bộ kiểm soát trong phạm vi" },
  ...CONTROL_STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    hint: `Kiểm soát đang dừng ở giai đoạn ${s.label.toLowerCase()}`,
  })),
  {
    key: "retired",
    label: "Đã ngừng",
    hint: "Kiểm soát hết hiệu lực hoặc tạm ngưng",
  },
  {
    key: "working",
    label: "Đang hoạt động",
    hint: "Thiết kế đúng và đang được thực hiện đúng thiết kế",
  },
  {
    key: "needs-redesign",
    label: "Cần thiết kế lại",
    hint: "Thiết kế không hiệu quả, phải sửa chính kiểm soát",
  },
  {
    key: "needs-enforcement",
    label: "Cần chấn chỉnh",
    hint: "Thiết kế đúng nhưng không ai thực hiện",
  },
  {
    key: "never-assessed",
    label: "Chưa từng đánh giá",
    hint: "Đang có hiệu lực nhưng chưa có bằng chứng nào",
  },
  {
    key: "test-overdue",
    label: "Quá hạn kiểm tra",
    hint: "Đã qua ngày kiểm tra theo kế hoạch",
  },
];

/** Một kiểm soát có khớp quick filter đang chọn không */
export function matchControlQuickFilter(
  key: string,
  c: ControlLifecycleInput,
): boolean {
  if (key === "all") return true;

  if (key === "working") return overallEffectivenessOf(c) === "Hiệu quả";
  if (key === "needs-redesign") return needsRedesign(c);
  if (key === "needs-enforcement") return needsEnforcement(c);
  if (key === "never-assessed") return isNeverAssessed(c) && isControlActive(c);
  if (key === "test-overdue") return isTestOverdue(c);
  return controlStageOf(c) === key;
}

/* ------------------------------------------------------------------ */
/* Khuyến nghị hành động                                               */
/* ------------------------------------------------------------------ */

export type ControlActionKind =
  | "redesign"
  | "enforce"
  | "test"
  | "link-risk"
  | "approve"
  | "none";

export interface ControlAction {
  kind: ControlActionKind;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "info" | "success";
}

/**
 * Hành động nên làm tiếp với kiểm soát này.
 * Trả về đúng MỘT việc ưu tiên cao nhất, tránh làm người dùng phân tán.
 */
export function suggestControlAction(c: ControlLifecycleInput): ControlAction {
  if (isControlRetired(c))
    return {
      kind: "none",
      title: "Kiểm soát đã ngừng",
      detail:
        "Không cần hành động nào. Dữ liệu lịch sử vẫn giữ để truy vết các kỳ trước.",
      tone: "info",
    };

  if (needsRedesign(c))
    return {
      kind: "redesign",
      title: "Thiết kế lại kiểm soát",
      detail:
        "Thiết kế hiện tại không đủ sức ngăn rủi ro. Sửa chính mô tả kiểm soát, đừng nhắc người thực hiện vì họ đang làm đúng quy định.",
      tone: "danger",
    };

  if (needsEnforcement(c))
    return {
      kind: "enforce",
      title: "Chấn chỉnh việc thực hiện",
      detail:
        "Thiết kế phù hợp nhưng thực tế không được thực hiện. Lập hành động khắc phục nhắc chủ kiểm soát và trưởng đơn vị, không sửa quy định.",
      tone: "danger",
    };

  if (isControlPending(c))
    return {
      kind: "approve",
      title: "Trình phê duyệt thiết kế",
      detail:
        "Chưa phê duyệt thì kiểm soát chưa được tính là đang bảo vệ rủi ro nào.",
      tone: "warning",
    };

  if (isNeverAssessed(c) || !isFullyConcluded(c) || isTestOverdue(c))
    return {
      kind: "test",
      title: "Lập đợt kiểm tra hiệu lực",
      detail:
        "Cần bằng chứng về cả thiết kế và vận hành để kết luận kiểm soát có đang hoạt động hay không.",
      tone: "warning",
    };

  return {
    kind: "none",
    title: "Kiểm soát đang hoạt động tốt",
    detail:
      "Thiết kế đúng và đang được thực hiện đúng thiết kế. Duy trì theo kỳ kiểm tra đã lập.",
    tone: "success",
  };
}
