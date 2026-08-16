import type { z } from "zod";
import { CONTROL_FLOW, LOCKED_EDIT_STATUSES, nextTransitions } from "./workflow";
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
  today = new Date()
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
  "Nháp": 3,
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
  preset: Partial<ControlFormValue> = {}
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
      "Kiểm soát trọng yếu đang vận hành thủ công, nên cân nhắc tự động hoá để giảm phụ thuộc con người."
    );
  }

  if (
    v.isKeyControl &&
    (v.frequency === "Hàng năm" || v.frequency === "Theo sự vụ")
  ) {
    out.push(
      "Kiểm soát trọng yếu nên vận hành với tần suất từ hàng quý trở lên để bảo đảm hiệu lực."
    );
  }

  if (!v.processId && !v.systemId) {
    out.push(
      "Chưa gắn quy trình hoặc hệ thống CNTT nào, sẽ khó truy vết khi kiểm tra hiệu lực."
    );
  }

  if (v.riskIds.length > 5) {
    out.push(
      `Kiểm soát đang gắn ${v.riskIds.length} rủi ro. Nên tách nhỏ để dễ đánh giá hiệu lực cho từng rủi ro.`
    );
  }

  if (!v.evidenceRequirement.trim()) {
    out.push(
      "Chưa khai báo yêu cầu bằng chứng, người kiểm tra sẽ không biết cần thu thập tài liệu gì."
    );
  }

  if (v.type === "Phát hiện" && v.nature === "Thủ công") {
    out.push(
      "Kiểm soát phát hiện thủ công thường có độ trễ cao, cân nhắc bổ sung cảnh báo tự động."
    );
  }

  return out;
}
