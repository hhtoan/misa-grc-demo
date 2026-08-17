import { EVENT_FLOW, LOCKED_EDIT_STATUSES, nextTransitions } from "./workflow";
import {
  eventFormSchema,
  zodErrors,
  type FieldErrors,
  type GrcEvent,
} from "./schema";
import type { EventStatus, RiskLevelValue } from "./enums";
import { toInputDate } from "@/lib/format";
import type { z } from "zod";

export type EventFormValue = z.infer<typeof eventFormSchema>;

const DAY = 86_400_000;

function startOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ==================================================================
   Trạng thái và quyền
   ================================================================== */

export function isEventEditable(status: EventStatus): boolean {
  return !LOCKED_EDIT_STATUSES.has(status);
}

export function eventNextTransitions(status: EventStatus) {
  return nextTransitions(EVENT_FLOW, status);
}

/** Chỉ xoá được sự kiện mới ghi nhận, chưa đi vào xác minh */
export function isEventDeletable(e: GrcEvent): boolean {
  return e.status === "Mới ghi nhận";
}

/** Sự kiện đã kết thúc vòng đời */
export function isEventClosed(e: GrcEvent): boolean {
  return e.status === "Đã đóng" || e.status === "Huỷ ghi nhận";
}

export function isEventOpen(e: GrcEvent): boolean {
  return !isEventClosed(e);
}

/* ==================================================================
   Quyền xem sự kiện bảo mật
   ------------------------------------------------------------------
   Nguyên tắc: sự kiện đánh dấu bảo mật chỉ hiển thị đầy đủ với
   Quản trị hệ thống, Ban QTRR, Kiểm toán nội bộ, hoặc chính người
   báo cáo và người xử lý sự kiện đó.
   Các vai trò khác vẫn thấy dòng trong danh sách nhưng nội dung bị
   che, để số liệu tổng hợp không bị lệch.
   ================================================================== */

export interface EventViewer {
  /** Vai trò hiện tại có quyền xem sự kiện bảo mật hay không */
  privileged: boolean;
  /** Mã nhân sự tương ứng với người đăng nhập */
  employeeId: string;
}

export function canViewEvent(e: GrcEvent, viewer: EventViewer): boolean {
  if (!e.isConfidential) return true;
  if (viewer.privileged) return true;
  if (!viewer.employeeId) return false;
  return (
    e.reporterId === viewer.employeeId || e.handlerId === viewer.employeeId
  );
}

export const MASKED_TEXT = "Nội dung bảo mật";

/** Tên hiển thị sau khi áp dụng quy tắc che */
export function eventDisplayName(e: GrcEvent, visible: boolean): string {
  return visible ? e.name : `${MASKED_TEXT} - ${e.code}`;
}

/** Giá trị văn bản sau khi che */
export function maskText(value: string, visible: boolean): string {
  if (visible) return value;
  return value.trim() ? MASKED_TEXT : "";
}

/** Giá trị tiền sau khi che */
export function maskMoney(
  value: number | null,
  visible: boolean,
): number | null {
  return visible ? value : null;
}

/* ==================================================================
   Thời gian và độ trễ phát hiện
   ================================================================== */

/** Số ngày từ lúc xảy ra tới lúc phát hiện */
export function detectionLag(e: GrcEvent): number {
  if (!e.occurredDate || !e.detectedDate) return 0;
  return Math.max(
    0,
    Math.round((startOfDay(e.detectedDate) - startOfDay(e.occurredDate)) / DAY),
  );
}

/** Phát hiện chậm: quá 7 ngày mới biết sự kiện đã xảy ra */
export function isSlowDetection(e: GrcEvent, days = 7): boolean {
  return detectionLag(e) > days;
}

/** Số ngày sự kiện đã mở kể từ khi phát hiện */
export function eventAging(e: GrcEvent, today = new Date()): number {
  if (!e.detectedDate) return 0;
  return Math.max(
    0,
    Math.round((today.getTime() - startOfDay(e.detectedDate)) / DAY),
  );
}

/** Sự kiện mở quá lâu mà chưa đóng */
export function isStaleEvent(e: GrcEvent, days = 60, today = new Date()) {
  return isEventOpen(e) && eventAging(e, today) > days;
}

/* ==================================================================
   Tổn thất
   ================================================================== */

/** Tổn thất ròng sau khi trừ phần đã thu hồi */
export function netLoss(e: GrcEvent): number {
  return Math.max(0, (e.actualLoss ?? 0) - (e.recoveredAmount ?? 0));
}

/** Tỷ lệ thu hồi trên tổn thất thực tế */
export function recoveryRate(e: GrcEvent): number | null {
  if (!e.actualLoss || e.actualLoss <= 0) return null;
  return Math.round(((e.recoveredAmount ?? 0) / e.actualLoss) * 100);
}

/** Chênh lệch giữa ước tính ban đầu và thực tế */
export function lossVariance(e: GrcEvent): number | null {
  if (e.estimatedLoss === null || e.actualLoss === null) return null;
  return e.actualLoss - e.estimatedLoss;
}

export function hasFinancialImpact(e: GrcEvent): boolean {
  return e.impactTypes.includes("Tài chính");
}

/* ==================================================================
   Chất lượng hồ sơ
   ================================================================== */

/** Sự kiện mức Cao trở lên bắt buộc liên kết ngược về rủi ro */
export function isMissingRiskLink(e: GrcEvent): boolean {
  if (e.status === "Huỷ ghi nhận") return false;
  return (
    (e.severity === "Cao" || e.severity === "Trọng yếu") &&
    e.relatedRiskIds.length === 0
  );
}

/** Đóng sự kiện thì bắt buộc có nguyên nhân gốc */
export function isMissingRootCause(e: GrcEvent): boolean {
  if (e.status === "Huỷ ghi nhận" || e.status === "Mới ghi nhận") return false;
  if (e.status === "Đang xác minh") return false;
  return !e.rootCause.trim();
}

/** Sự kiện mức Cao trở lên nên có hành động khắc phục */
export function isMissingKppn(e: GrcEvent, kppnCount: number): boolean {
  if (isEventClosed(e)) return false;
  return (
    (e.severity === "Cao" || e.severity === "Trọng yếu") && kppnCount === 0
  );
}

/** Chưa phân công người xử lý dù đã qua bước tiếp nhận */
export function isMissingHandler(e: GrcEvent): boolean {
  if (e.status === "Mới ghi nhận" || e.status === "Huỷ ghi nhận") return false;
  return !e.handlerId;
}

export function eventNeedAttention(e: GrcEvent, kppnCount = 0): boolean {
  return (
    isMissingRiskLink(e) ||
    isMissingRootCause(e) ||
    isMissingHandler(e) ||
    isMissingKppn(e, kppnCount) ||
    isSlowDetection(e) ||
    isStaleEvent(e)
  );
}

/* ==================================================================
   Tìm kiếm và sắp xếp
   ================================================================== */

export function eventSearchText(e: GrcEvent, extra: string[] = []): string {
  return [
    e.code,
    e.name,
    e.description,
    e.rootCause,
    e.lessonLearned,
    ...e.impactTypes,
    ...extra,
  ].join(" ");
}

export const EVENT_STATUS_ORDER: Record<EventStatus, number> = {
  "Mới ghi nhận": 7,
  "Đang xác minh": 6,
  "Đã xác minh": 5,
  "Đang điều tra": 4,
  "Đang xử lý": 3,
  "Đã đóng": 2,
  "Huỷ ghi nhận": 1,
};

export const SEVERITY_ORDER: Record<RiskLevelValue, number> = {
  Thấp: 1,
  "Trung bình": 2,
  Cao: 3,
  "Trọng yếu": 4,
};

/* ==================================================================
   Thống kê
   ================================================================== */

export interface EventSummary {
  total: number;
  open: number;
  closed: number;
  cancelled: number;
  nearMiss: number;
  confidential: number;
  bySeverity: Record<RiskLevelValue, number>;
  totalEstimated: number;
  totalActual: number;
  totalRecovered: number;
  netLoss: number;
  missingRiskLink: number;
  missingRootCause: number;
  missingHandler: number;
  slowDetection: number;
  stale: number;
  avgDetectionLag: number;
}

export function summarizeEvents(rows: GrcEvent[]): EventSummary {
  const bySeverity: Record<RiskLevelValue, number> = {
    Thấp: 0,
    "Trung bình": 0,
    Cao: 0,
    "Trọng yếu": 0,
  };

  let open = 0;
  let closed = 0;
  let cancelled = 0;
  let nearMiss = 0;
  let confidential = 0;
  let totalEstimated = 0;
  let totalActual = 0;
  let totalRecovered = 0;
  let missingRiskLink = 0;
  let missingRootCause = 0;
  let missingHandler = 0;
  let slowDetection = 0;
  let stale = 0;
  let lag = 0;

  rows.forEach((e) => {
    bySeverity[e.severity] += 1;
    if (e.status === "Huỷ ghi nhận") cancelled += 1;
    else if (e.status === "Đã đóng") closed += 1;
    else open += 1;

    if (e.isNearMiss) nearMiss += 1;
    if (e.isConfidential) confidential += 1;

    totalEstimated += e.estimatedLoss ?? 0;
    totalActual += e.actualLoss ?? 0;
    totalRecovered += e.recoveredAmount ?? 0;

    if (isMissingRiskLink(e)) missingRiskLink += 1;
    if (isMissingRootCause(e)) missingRootCause += 1;
    if (isMissingHandler(e)) missingHandler += 1;
    if (isSlowDetection(e)) slowDetection += 1;
    if (isStaleEvent(e)) stale += 1;

    lag += detectionLag(e);
  });

  return {
    total: rows.length,
    open,
    closed,
    cancelled,
    nearMiss,
    confidential,
    bySeverity,
    totalEstimated,
    totalActual,
    totalRecovered,
    netLoss: Math.max(0, totalActual - totalRecovered),
    missingRiskLink,
    missingRootCause,
    missingHandler,
    slowDetection,
    stale,
    avgDetectionLag: rows.length === 0 ? 0 : Math.round(lag / rows.length),
  };
}

/* ==================================================================
   Dữ liệu form
   ================================================================== */

export function emptyEventForm(
  preset: Partial<EventFormValue> = {},
): EventFormValue {
  const today = toInputDate(new Date());
  return {
    name: "",
    description: "",
    categoryId: "",
    unitId: "",
    occurredDate: today,
    detectedDate: today,
    reporterId: "",
    handlerId: "",
    impactTypes: [],
    severity: "Trung bình",
    isNearMiss: false,
    isConfidential: false,
    estimatedLoss: null,
    actualLoss: null,
    recoveredAmount: null,
    relatedRiskIds: [],
    relatedControlIds: [],
    deficiencyIds: [],
    kppnIds: [],
    rootCause: "",
    lessonLearned: "",
    status: "Mới ghi nhận",
    statusNote: "",
    ...preset,
  };
}

export function eventToForm(e: GrcEvent): EventFormValue {
  return {
    name: e.name,
    description: e.description,
    categoryId: e.categoryId,
    unitId: e.unitId,
    occurredDate: e.occurredDate,
    detectedDate: e.detectedDate,
    reporterId: e.reporterId,
    handlerId: e.handlerId,
    impactTypes: [...e.impactTypes],
    severity: e.severity,
    isNearMiss: e.isNearMiss,
    isConfidential: e.isConfidential,
    estimatedLoss: e.estimatedLoss,
    actualLoss: e.actualLoss,
    recoveredAmount: e.recoveredAmount,
    relatedRiskIds: [...e.relatedRiskIds],
    relatedControlIds: [...e.relatedControlIds],
    deficiencyIds: [...e.deficiencyIds],
    kppnIds: [...e.kppnIds],
    rootCause: e.rootCause,
    lessonLearned: e.lessonLearned,
    status: e.status,
    statusNote: e.statusNote,
  };
}

export interface EventValidateResult {
  ok: boolean;
  data?: EventFormValue;
  errors: FieldErrors;
}

export function validateEventForm(value: unknown): EventValidateResult {
  const parsed = eventFormSchema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data, errors: {} };
  return { ok: false, errors: zodErrors(parsed.error) };
}

/** Mức nghiêm trọng gợi ý theo tổn thất thực tế */
export function suggestSeverity(
  actualLoss: number | null,
  isNearMiss: boolean,
): RiskLevelValue {
  if (isNearMiss) return "Trung bình";
  const v = actualLoss ?? 0;
  if (v >= 1_000_000_000) return "Trọng yếu";
  if (v >= 300_000_000) return "Cao";
  if (v >= 50_000_000) return "Trung bình";
  return "Thấp";
}

export function eventWarnings(v: EventFormValue): string[] {
  const out: string[] = [];

  if (v.occurredDate && v.detectedDate) {
    const lag = Math.round(
      (startOfDay(v.detectedDate) - startOfDay(v.occurredDate)) / DAY,
    );
    if (lag > 7) {
      out.push(
        `Sự kiện xảy ra ${lag} ngày mới được phát hiện. Đây là dấu hiệu kiểm soát phát hiện đang yếu, nên rà soát lại.`,
      );
    }
  }

  if (
    (v.severity === "Cao" || v.severity === "Trọng yếu") &&
    v.relatedRiskIds.length === 0
  ) {
    out.push(
      `Sự kiện mức ${v.severity} bắt buộc liên kết ngược về rủi ro trong sổ đăng ký. Thiếu liên kết thì không đánh giá lại được mức rủi ro còn lại.`,
    );
  }

  if (v.isNearMiss && v.severity === "Trọng yếu") {
    out.push(
      "Sự kiện suýt xảy ra được đánh mức Trọng yếu. Nên xem lại vì chưa phát sinh tổn thất thực tế.",
    );
  }

  if (!v.isNearMiss && v.actualLoss === null && hasFinancialForm(v)) {
    out.push(
      "Sự kiện có ảnh hưởng tài chính nhưng chưa nhập tổn thất thực tế.",
    );
  }

  if (v.relatedControlIds.length === 0 && v.relatedRiskIds.length > 0) {
    out.push(
      "Chưa xác định kiểm soát nào đã thất bại. Nên gắn kiểm soát liên quan để đánh giá hiệu lực.",
    );
  }

  if (v.isConfidential && !v.handlerId) {
    out.push(
      "Sự kiện bảo mật nên chỉ định người xử lý ngay để giới hạn phạm vi người tiếp cận.",
    );
  }

  if (!v.description.trim()) {
    out.push("Chưa mô tả diễn biến sự kiện, người xử lý sẽ thiếu thông tin.");
  }

  const suggested = suggestSeverity(v.actualLoss, v.isNearMiss);
  if (
    v.actualLoss !== null &&
    v.actualLoss > 0 &&
    SEVERITY_ORDER[suggested] > SEVERITY_ORDER[v.severity]
  ) {
    out.push(
      `Với tổn thất thực tế đã nhập, mức nghiêm trọng gợi ý là ${suggested} nhưng đang chọn ${v.severity}.`,
    );
  }

  return out;
}

function hasFinancialForm(v: EventFormValue): boolean {
  return v.impactTypes.includes("Tài chính");
}
