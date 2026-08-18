import type { z } from "zod";
import {
  CONTROL_FLOW,
  LOCKED_EDIT_STATUSES,
  nextTransitions,
} from "./workflow";
import {
  controlFormSchema,
  zodErrors,
  type Control,
  type FieldErrors,
} from "./schema";
import type { ControlStatus, ControlTestResult } from "./enums";
import { toInputDate } from "@/lib/format";

export type ControlFormValue = z.infer<typeof controlFormSchema>;

/* ==================================================================
   Trạng thái và quyền chỉnh sửa
   ================================================================== */

/** Trạng thái đang khoá thì chỉ được xem, không sửa nội dung */
export function isControlEditable(status: ControlStatus): boolean {
  return !LOCKED_EDIT_STATUSES.has(status);
}

export function controlNextTransitions(status: ControlStatus) {
  return nextTransitions(CONTROL_FLOW, status);
}

/** Chỉ xoá được kiểm soát chưa từng đi vào vận hành */
export const CONTROL_DELETABLE_STATUSES = new Set<ControlStatus>(["Nháp"]);

export function isControlDeletable(status: ControlStatus): boolean {
  return CONTROL_DELETABLE_STATUSES.has(status);
}

/** Kiểm soát đang thực sự vận hành */
export function isControlActive(c: Control): boolean {
  return c.status === "Đang hiệu lực";
}

/* ==================================================================
   Hiệu lực theo thời gian
   ================================================================== */

const DAY = 86_400_000;

function endOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Đã qua ngày hết hiệu lực nhưng trạng thái chưa cập nhật */
export function isControlExpired(c: Control, today = new Date()): boolean {
  if (!c.expireDate) return false;
  if (c.status === "Hết hiệu lực") return false;
  return endOfDay(c.expireDate) < today.getTime();
}

/** Sắp hết hiệu lực trong vòng N ngày tới */
export function isExpiringSoon(
  c: Control,
  days = 60,
  today = new Date(),
): boolean {
  if (!c.expireDate) return false;
  if (c.status !== "Đang hiệu lực") return false;
  const remain = endOfDay(c.expireDate) - today.getTime();
  return remain >= 0 && remain <= days * DAY;
}

/* ==================================================================
   Chu kỳ kiểm tra kiểm soát
   ------------------------------------------------------------------
   Tần suất trong hồ sơ là tần suất VẬN HÀNH của kiểm soát.
   Chu kỳ KIỂM TRA hiệu lực được suy ra theo bảng dưới đây: kiểm soát
   vận hành càng dày thì phải kiểm tra càng thường xuyên.
   ================================================================== */

export const TEST_CYCLE_DAYS: Record<string, number> = {
  "Liên tục": 90,
  "Hàng ngày": 90,
  "Hàng tuần": 90,
  "Hàng tháng": 180,
  "Hàng quý": 180,
  "Hàng năm": 365,
  "Theo sự vụ": 365,
};

export function testCycleOf(c: Control): number {
  return TEST_CYCLE_DAYS[c.frequency] ?? 180;
}

/** Ngày đến hạn kiểm tra kế tiếp, tính từ lần kiểm tra gần nhất */
export function nextTestDate(c: Control): string {
  const base = c.lastTestDate || c.effectiveDate;
  if (!base) return "";
  const d = new Date(base);
  d.setDate(d.getDate() + testCycleOf(c));
  return toInputDate(d);
}

/** Số ngày còn lại tới hạn kiểm tra, âm là đã quá hạn */
export function daysToNextTest(c: Control, today = new Date()): number | null {
  const due = nextTestDate(c);
  if (!due) return null;
  return Math.round((endOfDay(due) - today.getTime()) / DAY);
}

/** Đã quá hạn kiểm tra, chỉ áp dụng cho kiểm soát đang hiệu lực */
export function isTestOverdue(c: Control, today = new Date()): boolean {
  if (c.status !== "Đang hiệu lực") return false;
  const remain = daysToNextTest(c, today);
  return remain !== null && remain < 0;
}

/** Sắp tới hạn kiểm tra trong 30 ngày */
export function isTestDueSoon(c: Control, today = new Date()): boolean {
  if (c.status !== "Đang hiệu lực") return false;
  const remain = daysToNextTest(c, today);
  return remain !== null && remain >= 0 && remain <= 30;
}

/** Chưa từng được kiểm tra lần nào dù đã hiệu lực */
export function isNeverTested(c: Control): boolean {
  return c.status === "Đang hiệu lực" && !c.lastTestDate;
}

/** Kết quả kiểm tra gần nhất chưa đạt */
export function isTestFailed(c: Control): boolean {
  return !!c.lastTestResult && c.lastTestResult !== "Hiệu quả";
}

/** Kiểm soát cần được đưa vào kế hoạch kiểm tra kỳ tới */
export function needAttention(c: Control, today = new Date()): boolean {
  return (
    isTestOverdue(c, today) ||
    isNeverTested(c) ||
    isTestFailed(c) ||
    isControlExpired(c, today)
  );
}

/* ==================================================================
   Chấm điểm sức khoẻ kiểm soát
   ================================================================== */

export const TEST_RESULT_SCORE: Record<ControlTestResult, number> = {
  "Hiệu quả": 100,
  "Hiệu quả một phần": 55,
  "Không hiệu quả": 10,
};

/** Điểm sức khoẻ 0-100, dùng cho thanh tiến độ và xếp hạng */
export function controlHealth(c: Control, today = new Date()): number {
  if (c.status === "Hết hiệu lực") return 0;
  if (c.status === "Nháp" || c.status === "Chờ duyệt") return 40;
  if (c.status === "Tạm ngưng") return 30;

  let score = c.lastTestResult ? TEST_RESULT_SCORE[c.lastTestResult] : 50;
  if (isTestOverdue(c, today)) score -= 25;
  else if (isTestDueSoon(c, today)) score -= 8;
  if (isNeverTested(c)) score -= 15;
  if (isControlExpired(c, today)) score -= 30;

  return Math.max(0, Math.min(100, score));
}

/* ==================================================================
   Tìm kiếm và sắp xếp
   ================================================================== */

export function controlSearchText(c: Control, extra: string[] = []): string {
  return [
    c.code,
    c.name,
    c.description,
    c.type,
    c.nature,
    c.frequency,
    c.evidenceRequirement,
    ...extra,
  ].join(" ");
}

/** Thứ tự trạng thái khi sắp xếp, đi từ đang vận hành xuống đã dừng */
export const CONTROL_STATUS_ORDER: Record<ControlStatus, number> = {
  "Đang hiệu lực": 5,
  "Chờ duyệt": 4,
  Nháp: 3,
  "Tạm ngưng": 2,
  "Hết hiệu lực": 1,
};

export const TEST_RESULT_ORDER: Record<string, number> = {
  "Không hiệu quả": 4,
  "Hiệu quả một phần": 3,
  "Hiệu quả": 2,
  "": 1,
};

/* ==================================================================
   Thống kê nhanh
   ================================================================== */

export interface ControlSummary {
  total: number;
  active: number;
  draft: number;
  suspended: number;
  expired: number;
  keyControl: number;
  automated: number;
  testFailed: number;
  testOverdue: number;
  neverTested: number;
  expiringSoon: number;
  avgHealth: number;
  /** Số rủi ro khác nhau được các kiểm soát này phủ */
  coveredRisks: number;
}

export function summarizeControls(rows: Control[]): ControlSummary {
  const covered = new Set<string>();
  let active = 0;
  let draft = 0;
  let suspended = 0;
  let expired = 0;
  let keyControl = 0;
  let automated = 0;
  let testFailed = 0;
  let testOverdue = 0;
  let neverTested = 0;
  let expiringSoon = 0;
  let health = 0;

  rows.forEach((c) => {
    c.riskIds.forEach((id) => covered.add(id));

    if (c.status === "Đang hiệu lực") active += 1;
    if (c.status === "Nháp" || c.status === "Chờ duyệt") draft += 1;
    if (c.status === "Tạm ngưng") suspended += 1;
    if (c.status === "Hết hiệu lực") expired += 1;

    if (c.isKeyControl) keyControl += 1;
    if (c.nature !== "Thủ công") automated += 1;
    if (isTestFailed(c)) testFailed += 1;
    if (isTestOverdue(c)) testOverdue += 1;
    if (isNeverTested(c)) neverTested += 1;
    if (isExpiringSoon(c)) expiringSoon += 1;

    health += controlHealth(c);
  });

  return {
    total: rows.length,
    active,
    draft,
    suspended,
    expired,
    keyControl,
    automated,
    testFailed,
    testOverdue,
    neverTested,
    expiringSoon,
    avgHealth: rows.length === 0 ? 0 : Math.round(health / rows.length),
    coveredRisks: covered.size,
  };
}

/* ==================================================================
   Dữ liệu form
   ================================================================== */

export function emptyControlForm(
  preset: Partial<ControlFormValue> = {},
): ControlFormValue {
  return {
    name: "",
    description: "",
    riskIds: [],
    type: "Phòng ngừa",
    nature: "Thủ công",
    frequency: "Hàng tháng",
    unitId: "",
    ownerId: "",
    processId: "",
    systemId: "",
    isKeyControl: false,
    effectiveDate: toInputDate(new Date()),
    designEffectiveness: "",
    expireDate: "",
    status: "Nháp",
    statusNote: "",
    lastTestResult: null,
    lastTestDate: "",
    evidenceRequirement: "",
    ...preset,
  };
}

export function controlToForm(c: Control): ControlFormValue {
  return {
    name: c.name,
    description: c.description,
    riskIds: [...c.riskIds],
    type: c.type,
    nature: c.nature,
    frequency: c.frequency,
    unitId: c.unitId,
    ownerId: c.ownerId,
    processId: c.processId,
    systemId: c.systemId,
    isKeyControl: c.isKeyControl,
    effectiveDate: c.effectiveDate,
    designEffectiveness: c.designEffectiveness ?? "",
    expireDate: c.expireDate,
    status: c.status,
    statusNote: c.statusNote,
    lastTestResult: c.lastTestResult,
    lastTestDate: c.lastTestDate,
    evidenceRequirement: c.evidenceRequirement,
  };
}

export interface ControlValidateResult {
  ok: boolean;
  data?: ControlFormValue;
  errors: FieldErrors;
}

/** Kiểm tra form theo controlFormSchema, trả về map lỗi theo tên trường */
export function validateControlForm(value: unknown): ControlValidateResult {
  const parsed = controlFormSchema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data, errors: {} };
  return { ok: false, errors: zodErrors(parsed.error) };
}

/**
 * Cảnh báo nghiệp vụ không chặn lưu, hiển thị dạng khối vàng trên form.
 */
export function controlWarnings(v: ControlFormValue): string[] {
  const out: string[] = [];

  if (v.isKeyControl && v.nature === "Thủ công") {
    out.push(
      "Kiểm soát trọng yếu đang vận hành thủ công, nên cân nhắc tự động hoá để giảm phụ thuộc con người.",
    );
  }

  if (
    v.isKeyControl &&
    (v.frequency === "Hàng năm" || v.frequency === "Theo sự vụ")
  ) {
    out.push(
      "Kiểm soát trọng yếu nên vận hành với tần suất từ hàng quý trở lên để bảo đảm hiệu lực.",
    );
  }

  if (!v.processId && !v.systemId) {
    out.push(
      "Chưa gắn quy trình hoặc hệ thống CNTT nào, sẽ khó truy vết khi kiểm tra hiệu lực.",
    );
  }

  if (v.riskIds.length > 5) {
    out.push(
      `Kiểm soát đang gắn ${v.riskIds.length} rủi ro. Nên tách nhỏ để dễ đánh giá hiệu lực cho từng rủi ro.`,
    );
  }

  if (!v.evidenceRequirement.trim()) {
    out.push(
      "Chưa khai báo yêu cầu bằng chứng, người kiểm tra sẽ không biết cần thu thập tài liệu gì.",
    );
  }

  if (v.type === "Phát hiện" && v.nature === "Thủ công") {
    out.push(
      "Kiểm soát phát hiện thủ công thường có độ trễ cao, cân nhắc bổ sung cảnh báo tự động.",
    );
  }

  return out;
}

/* ==================================================================
   ===== BỔ SUNG LÔ A: HIỆU LỰC KIỂM SOÁT THEO HAI CHIỀU =====

   Design Effectiveness    - thiết kế có đúng không, nếu chạy đúng như
                             mô tả thì có ngăn được rủi ro
   Operation Effectiveness - có đang được thực hiện đúng thiết kế không

   Hai chiều này dẫn tới HAI HÀNH ĐỘNG KHẮC PHỤC KHÁC NHAU, nên bắt
   buộc phải tách. Thiết kế sai thì phải thiết kế lại kiểm soát, vận
   hành sai thì phải chấn chỉnh người thực hiện.

   Phần này KHÔNG đụng tới các hàm phía trên (controlHealth,
   testCycleOf, isTestOverdue, validateControlForm...).
   ================================================================== */

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
 * Bảng tổng hợp đã chốt.
 *
 * Hai nguyên tắc nền:
 *   1. Thiết kế sai thì vận hành tốt cũng vô nghĩa
 *   2. Chưa đánh giá là một mức riêng, không phải Hiệu quả
 */
export function combineEffectiveness(
  design: EffectivenessValue,
  operation: EffectivenessValue,
): EffectivenessValue {
  if (design === NOT_ASSESSED && operation === NOT_ASSESSED)
    return NOT_ASSESSED;

  if (design === "Không hiệu quả") return "Không hiệu quả";
  if (operation === "Không hiệu quả") return "Không hiệu quả";

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

/* ==================================================================
   ===== BỔ SUNG LÔ C2: NGUỒN SINH RA DE VÀ OE =====

   Phân vai rõ ràng:
     - DE (thiết kế)  do người thiết kế và người duyệt kết luận,
                      nhập ở form kiểm soát
     - OE (vận hành)  do đợt kiểm tra hiệu lực sinh ra,
                      KHÔNG nhập tay ở form kiểm soát

   Lý do phân vai: nếu cho nhập OE ở form thiết kế thì người dùng tự
   khẳng định kiểm soát đang chạy tốt mà không cần bằng chứng nào,
   đúng cái sai mà CRO đã chỉ ra ở phần điểm rủi ro còn lại.
   ================================================================== */

/** Tuỳ chọn cho Select, dùng chung ở form kiểm soát và form kết quả */
export const EFFECTIVENESS_OPTIONS: {
  value: EffectivenessValue;
  label: string;
  description: string;
}[] = [
  {
    value: "Hiệu quả",
    label: "Hiệu quả",
    description: "Đạt yêu cầu, không phát hiện khe hở đáng kể",
  },
  {
    value: "Hiệu quả một phần",
    label: "Hiệu quả một phần",
    description: "Còn khe hở hoặc thực hiện chưa đều, cần cải thiện",
  },
  {
    value: "Không hiệu quả",
    label: "Không hiệu quả",
    description: "Không đạt yêu cầu, phải xử lý ngay",
  },
];

/** Câu hỏi nghiệp vụ của từng chiều, dùng làm hint trên form */
export const DESIGN_QUESTION =
  "Nếu kiểm soát được thực hiện đúng như mô tả thì có ngăn được rủi ro không";

export const OPERATION_QUESTION =
  "Trên thực tế kiểm soát có đang được thực hiện đúng thiết kế không";

/* ------------------------------------------------------------------ */
/* Áp kết quả một đợt kiểm tra vào hồ sơ kiểm soát                     */
/* ------------------------------------------------------------------ */

export interface TestResultInput {
  designResult?: string | null;
  operationResult?: string | null;
  /** Kết luận chung của đợt, dùng làm dự phòng khi thiếu 2 chiều */
  result?: string | null;
  testDate?: string | null;
}

export interface ControlEffectivenessPatch {
  designEffectiveness?: string;
  operationEffectiveness?: string;
  lastAssessedAt?: string;
  lastTestDate?: string;
  /** Vẫn ghi trường cũ trong một lô để các màn chưa chuyển còn đọc được */
  lastTestResult?: string;
}

/**
 * Sinh patch cập nhật hồ sơ kiểm soát từ kết quả một đợt kiểm tra.
 *
 * Ba nguyên tắc:
 *   1. Đợt kiểm tra luôn kết luận được OE, vì đó là mục đích của nó
 *   2. Đợt kiểm tra CHỈ ghi đè DE khi người kiểm tra thực sự kết luận
 *      về thiết kế, tránh xoá mất kết luận của người duyệt
 *   3. lastTestResult vẫn được ghi để tương thích ngược trong một lô
 */
export function applyTestResultToControl(
  test: TestResultInput,
): ControlEffectivenessPatch {
  const patch: ControlEffectivenessPatch = {};

  const design = normalizeEffectiveness(test.designResult);
  const operation = normalizeEffectiveness(test.operationResult ?? test.result);

  if (design !== NOT_ASSESSED) patch.designEffectiveness = design;
  if (operation !== NOT_ASSESSED) patch.operationEffectiveness = operation;

  const date = (test.testDate ?? "").trim();
  if (date) {
    patch.lastAssessedAt = date;
    patch.lastTestDate = date;
  }

  /* Trường cũ nhận kết luận xấu nhất trong hai chiều, giữ đúng tinh
     thần thận trọng của các màn hình chưa chuyển sang hiệu quả chung */
  const combined = combineEffectiveness(design, operation);
  if (combined !== NOT_ASSESSED) patch.lastTestResult = combined;

  return patch;
}

/**
 * Đợt kiểm tra này có kết luận đủ hai chiều chưa.
 * Dùng để chặn lưu khi người kiểm tra bỏ trống chiều vận hành.
 */
export function isTestConclusionComplete(test: TestResultInput): boolean {
  return (
    normalizeEffectiveness(test.operationResult ?? test.result) !== NOT_ASSESSED
  );
}
