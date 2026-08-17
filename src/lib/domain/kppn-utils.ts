import {
  DEFICIENCY_FLOW,
  KPPN_FLOW,
  LOCKED_EDIT_STATUSES,
  nextTransitions,
} from "./workflow";
import {
  deficiencyFormSchema,
  isKppnOverdue,
  kppnFormSchema,
  zodErrors,
  type Deficiency,
  type FieldErrors,
  type Kppn,
} from "./schema";
import type { DeficiencyStatus, KppnStatus, RiskLevelValue } from "./enums";
import { toInputDate } from "@/lib/format";
import type { z } from "zod";

export type DeficiencyFormValue = z.infer<typeof deficiencyFormSchema>;
export type KppnFormValue = z.infer<typeof kppnFormSchema>;

const DAY = 86_400_000;

function endOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ==================================================================
   PHẦN A - ĐIỂM YẾU KIỂM SOÁT
   ================================================================== */

/* --------------------- Trạng thái và quyền ---------------------- */

export function isDeficiencyEditable(status: DeficiencyStatus): boolean {
  return !LOCKED_EDIT_STATUSES.has(status);
}

export function deficiencyNextTransitions(status: DeficiencyStatus) {
  return nextTransitions(DEFICIENCY_FLOW, status);
}

/** Chỉ xoá được điểm yếu mới ghi nhận, chưa gắn hành động nào */
export function isDeficiencyDeletable(d: Deficiency, kppnCount = 0): boolean {
  return d.status === "Mới ghi nhận" && kppnCount === 0;
}

/** Điểm yếu coi như đã kết thúc, không cần theo dõi tiến độ nữa */
export function isDeficiencyClosed(d: Deficiency): boolean {
  return d.status === "Đã đóng";
}

/** Điểm yếu đang mở, cần theo dõi */
export function isDeficiencyOpen(d: Deficiency): boolean {
  return d.status !== "Đã đóng";
}

/* ------------------------- Thời hạn ---------------------------- */

/** Số ngày còn lại tới hạn khắc phục, âm là đã quá hạn */
export function deficiencyDaysToDue(
  d: Deficiency,
  today = new Date(),
): number | null {
  if (!d.dueDate) return null;
  return Math.round((endOfDay(d.dueDate) - today.getTime()) / DAY);
}

/** Quá hạn khắc phục: còn mở mà đã qua hạn */
export function isDeficiencyOverdue(
  d: Deficiency,
  today = new Date(),
): boolean {
  if (d.status === "Đã đóng" || d.status === "Đã khắc phục") return false;
  const remain = deficiencyDaysToDue(d, today);
  return remain !== null && remain < 0;
}

/** Sắp tới hạn khắc phục trong 15 ngày */
export function isDeficiencyDueSoon(
  d: Deficiency,
  days = 15,
  today = new Date(),
): boolean {
  if (d.status === "Đã đóng" || d.status === "Đã khắc phục") return false;
  const remain = deficiencyDaysToDue(d, today);
  return remain !== null && remain >= 0 && remain <= days;
}

/** Số ngày điểm yếu đã tồn tại kể từ khi phát hiện */
export function deficiencyAging(d: Deficiency, today = new Date()): number {
  if (!d.detectedDate) return 0;
  return Math.max(
    0,
    Math.round((today.getTime() - startOfDay(d.detectedDate)) / DAY),
  );
}

/* --------------------- Chất lượng hồ sơ ------------------------ */

/** Mức Cao trở lên hoặc đã lập KPPN thì bắt buộc phân tích nguyên nhân gốc */
export function needRootCause(d: Deficiency): boolean {
  return (
    d.severity === "Cao" ||
    d.severity === "Trọng yếu" ||
    d.status === "Đã lập KPPN"
  );
}

export function isMissingRootCause(d: Deficiency): boolean {
  return needRootCause(d) && !d.rootCause.trim();
}

/** Điểm yếu mức Cao trở lên nhưng chưa có hành động khắc phục nào */
export function isMissingKppn(d: Deficiency, kppnCount: number): boolean {
  if (d.status === "Đã đóng" || d.status === "Đã khắc phục") return false;
  return (
    (d.severity === "Cao" || d.severity === "Trọng yếu") && kppnCount === 0
  );
}

/** Điểm yếu cần chú ý ngay */
export function deficiencyNeedAttention(
  d: Deficiency,
  kppnCount: number,
  today = new Date(),
): boolean {
  return (
    isDeficiencyOverdue(d, today) ||
    isMissingRootCause(d) ||
    isMissingKppn(d, kppnCount) ||
    !d.dueDate
  );
}

/* ---------------------- Tìm kiếm, sắp xếp ---------------------- */

export function deficiencySearchText(
  d: Deficiency,
  extra: string[] = [],
): string {
  return [
    d.code,
    d.name,
    d.description,
    d.sourceType,
    d.sourceRef,
    d.rootCause,
    ...extra,
  ].join(" ");
}

export const DEFICIENCY_STATUS_ORDER: Record<DeficiencyStatus, number> = {
  "Mới ghi nhận": 5,
  "Đang phân tích": 4,
  "Đã lập KPPN": 3,
  "Đã khắc phục": 2,
  "Đã đóng": 1,
};

export const SEVERITY_ORDER: Record<RiskLevelValue, number> = {
  Thấp: 1,
  "Trung bình": 2,
  Cao: 3,
  "Trọng yếu": 4,
};

/* -------------------------- Thống kê --------------------------- */

export interface DeficiencySummary {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  dueSoon: number;
  noDueDate: number;
  high: number;
  missingRootCause: number;
  missingKppn: number;
  bySeverity: Record<RiskLevelValue, number>;
  avgAging: number;
}

export function summarizeDeficiencies(
  rows: Deficiency[],
  kppnCountOf: (id: string) => number = () => 0,
): DeficiencySummary {
  const bySeverity: Record<RiskLevelValue, number> = {
    Thấp: 0,
    "Trung bình": 0,
    Cao: 0,
    "Trọng yếu": 0,
  };

  let open = 0;
  let closed = 0;
  let overdue = 0;
  let dueSoon = 0;
  let noDueDate = 0;
  let high = 0;
  let missingRootCause = 0;
  let missingKppn = 0;
  let aging = 0;

  rows.forEach((d) => {
    bySeverity[d.severity] += 1;
    if (isDeficiencyOpen(d)) open += 1;
    else closed += 1;
    if (isDeficiencyOverdue(d)) overdue += 1;
    if (isDeficiencyDueSoon(d)) dueSoon += 1;
    if (!d.dueDate && isDeficiencyOpen(d)) noDueDate += 1;
    if (d.severity === "Cao" || d.severity === "Trọng yếu") high += 1;
    if (isMissingRootCause(d)) missingRootCause += 1;
    if (isMissingKppn(d, kppnCountOf(d.id))) missingKppn += 1;
    aging += deficiencyAging(d);
  });

  return {
    total: rows.length,
    open,
    closed,
    overdue,
    dueSoon,
    noDueDate,
    high,
    missingRootCause,
    missingKppn,
    bySeverity,
    avgAging: rows.length === 0 ? 0 : Math.round(aging / rows.length),
  };
}

/* --------------------------- Form ------------------------------ */

export function emptyDeficiencyForm(
  preset: Partial<DeficiencyFormValue> = {},
): DeficiencyFormValue {
  return {
    name: "",
    description: "",
    sourceType: "Tự phát hiện",
    sourceRef: "",
    controlId: "",
    riskId: "",
    eventId: "",
    severity: "Trung bình",
    unitId: "",
    ownerId: "",
    detectedDate: toInputDate(new Date()),
    dueDate: "",
    rootCause: "",
    status: "Mới ghi nhận",
    statusNote: "",
    kppnIds: [],
    ...preset,
  };
}

export function deficiencyToForm(d: Deficiency): DeficiencyFormValue {
  return {
    name: d.name,
    description: d.description,
    sourceType: d.sourceType,
    sourceRef: d.sourceRef,
    controlId: d.controlId,
    riskId: d.riskId,
    eventId: d.eventId,
    severity: d.severity,
    unitId: d.unitId,
    ownerId: d.ownerId,
    detectedDate: d.detectedDate,
    dueDate: d.dueDate,
    rootCause: d.rootCause,
    status: d.status,
    statusNote: d.statusNote,
    kppnIds: [...d.kppnIds],
  };
}

export interface DeficiencyValidateResult {
  ok: boolean;
  data?: DeficiencyFormValue;
  errors: FieldErrors;
}

export function validateDeficiencyForm(
  value: unknown,
): DeficiencyValidateResult {
  const parsed = deficiencyFormSchema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data, errors: {} };
  return { ok: false, errors: zodErrors(parsed.error) };
}

/** Hạn khắc phục gợi ý theo mức nghiêm trọng */
export function suggestDeficiencyDueDate(
  detectedDate: string,
  severity: string,
): string {
  const days =
    severity === "Trọng yếu"
      ? 30
      : severity === "Cao"
        ? 60
        : severity === "Trung bình"
          ? 90
          : 120;
  const d = new Date(detectedDate || new Date());
  d.setDate(d.getDate() + days);
  return toInputDate(d);
}

export function deficiencyWarnings(v: DeficiencyFormValue): string[] {
  const out: string[] = [];

  if (!v.dueDate) {
    out.push(
      "Chưa đặt hạn khắc phục, điểm yếu sẽ không được theo dõi tiến độ và không xuất hiện trong danh sách quá hạn.",
    );
  }

  if (
    (v.severity === "Cao" || v.severity === "Trọng yếu") &&
    v.kppnIds.length === 0
  ) {
    out.push(
      `Điểm yếu mức ${v.severity} bắt buộc phải có hành động khắc phục và phòng ngừa kèm theo.`,
    );
  }

  if (v.dueDate && v.detectedDate) {
    const gap = Math.round(
      (endOfDay(v.dueDate) - startOfDay(v.detectedDate)) / DAY,
    );
    if (v.severity === "Trọng yếu" && gap > 60) {
      out.push(
        `Hạn khắc phục cách ngày phát hiện ${gap} ngày. Điểm yếu Trọng yếu nên xử lý trong vòng 30 ngày.`,
      );
    } else if (v.severity === "Cao" && gap > 120) {
      out.push(
        `Hạn khắc phục cách ngày phát hiện ${gap} ngày, khá dài với điểm yếu mức Cao.`,
      );
    }
  }

  if (!v.controlId && !v.riskId && !v.eventId) {
    out.push(
      "Chưa liên kết tới kiểm soát, rủi ro hoặc sự kiện nào, sẽ khó truy vết nguồn gốc điểm yếu.",
    );
  }

  if (!v.description.trim()) {
    out.push(
      "Chưa mô tả chi tiết điểm yếu, người khắc phục sẽ thiếu thông tin.",
    );
  }

  return out;
}

/* ==================================================================
   PHẦN B - HÀNH ĐỘNG KHẮC PHỤC VÀ PHÒNG NGỪA (KPPN)
   ================================================================== */

export { isKppnOverdue };

export function isKppnEditable(status: KppnStatus): boolean {
  return !LOCKED_EDIT_STATUSES.has(status);
}

export function kppnNextTransitions(status: KppnStatus) {
  return nextTransitions(KPPN_FLOW, status);
}

/** Chỉ xoá được hành động chưa trình duyệt */
export function isKppnDeletable(status: KppnStatus): boolean {
  return status === "Nháp";
}

/** Hành động đang thực thi, cần theo dõi tiến độ */
export function isKppnRunning(k: Kppn): boolean {
  return (
    k.status === "Chưa bắt đầu" ||
    k.status === "Đang thực hiện" ||
    k.status === "Chờ nghiệm thu"
  );
}

export function isKppnFinished(k: Kppn): boolean {
  return k.status === "Hoàn thành" || k.status === "Huỷ";
}

/** Đã được phê duyệt nên có thể giao sang hệ thống nguồn */
export function canPushToSource(k: Kppn): boolean {
  return (
    k.executionSystem !== "Theo dõi trong GRC" &&
    !k.externalTaskCode &&
    !isKppnFinished(k) &&
    k.status !== "Nháp" &&
    k.status !== "Chờ duyệt"
  );
}

export function kppnDaysToDue(k: Kppn, today = new Date()): number | null {
  if (!k.dueDate) return null;
  return Math.round((endOfDay(k.dueDate) - today.getTime()) / DAY);
}

export function kppnOverdueDays(k: Kppn, today = new Date()): number {
  if (!isKppnOverdue(k, today)) return 0;
  return Math.abs(kppnDaysToDue(k, today) ?? 0);
}

export function isKppnDueSoon(k: Kppn, days = 7, today = new Date()): boolean {
  if (isKppnFinished(k)) return false;
  const remain = kppnDaysToDue(k, today);
  return remain !== null && remain >= 0 && remain <= days;
}

/**
 * Tiến độ kỳ vọng theo thời gian đã trôi qua giữa ngày bắt đầu và hạn.
 * Dùng để phát hiện hành động chậm so với kế hoạch.
 */
export function expectedProgress(k: Kppn, today = new Date()): number {
  if (!k.startDate || !k.dueDate) return 0;
  const start = startOfDay(k.startDate);
  const end = endOfDay(k.dueDate);
  if (end <= start) return 100;
  const ratio = (today.getTime() - start) / (end - start);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/** Chậm hơn kỳ vọng từ 20 điểm phần trăm trở lên */
export function isKppnBehindSchedule(k: Kppn, today = new Date()): boolean {
  if (!isKppnRunning(k)) return false;
  return expectedProgress(k, today) - k.progress >= 20;
}

/** Đã giao sang hệ thống nguồn nhưng lâu không đồng bộ */
export function isSyncStale(k: Kppn, days = 7, today = new Date()): boolean {
  if (!k.externalTaskCode) return false;
  if (!isKppnRunning(k)) return false;
  if (!k.lastSyncedAt) return true;
  return today.getTime() - new Date(k.lastSyncedAt).getTime() > days * DAY;
}

export function kppnSearchText(k: Kppn, extra: string[] = []): string {
  return [
    k.code,
    k.name,
    k.description,
    k.type,
    k.executionSystem,
    k.externalTaskCode,
    k.result,
    ...extra,
  ].join(" ");
}

export const KPPN_STATUS_ORDER: Record<KppnStatus, number> = {
  "Đang thực hiện": 7,
  "Chờ nghiệm thu": 6,
  "Chưa bắt đầu": 5,
  "Chờ duyệt": 4,
  Nháp: 3,
  "Hoàn thành": 2,
  Huỷ: 1,
};

export interface KppnSummary {
  total: number;
  running: number;
  completed: number;
  cancelled: number;
  overdue: number;
  dueSoon: number;
  behind: number;
  waitingApproval: number;
  waitingAcceptance: number;
  notPushed: number;
  syncStale: number;
  avgProgress: number;
  totalCost: number;
}

export function summarizeKppns(rows: Kppn[]): KppnSummary {
  let running = 0;
  let completed = 0;
  let cancelled = 0;
  let overdue = 0;
  let dueSoon = 0;
  let behind = 0;
  let waitingApproval = 0;
  let waitingAcceptance = 0;
  let notPushed = 0;
  let syncStale = 0;
  let progress = 0;
  let totalCost = 0;

  rows.forEach((k) => {
    if (isKppnRunning(k)) running += 1;
    if (k.status === "Hoàn thành") completed += 1;
    if (k.status === "Huỷ") cancelled += 1;
    if (k.status === "Chờ duyệt") waitingApproval += 1;
    if (k.status === "Chờ nghiệm thu") waitingAcceptance += 1;
    if (isKppnOverdue(k)) overdue += 1;
    if (isKppnDueSoon(k)) dueSoon += 1;
    if (isKppnBehindSchedule(k)) behind += 1;
    if (canPushToSource(k)) notPushed += 1;
    if (isSyncStale(k)) syncStale += 1;
    progress += k.progress;
    totalCost += k.estimatedCost ?? 0;
  });

  return {
    total: rows.length,
    running,
    completed,
    cancelled,
    overdue,
    dueSoon,
    behind,
    waitingApproval,
    waitingAcceptance,
    notPushed,
    syncStale,
    avgProgress: rows.length === 0 ? 0 : Math.round(progress / rows.length),
    totalCost,
  };
}

export function emptyKppnForm(
  preset: Partial<KppnFormValue> = {},
): KppnFormValue {
  const start = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 45);
  return {
    name: "",
    description: "",
    type: "Khắc phục",
    deficiencyId: "",
    riskId: "",
    eventId: "",
    unitId: "",
    assigneeId: "",
    supervisorId: "",
    executionSystem: "AMIS Công việc",
    externalTaskCode: "",
    externalUrl: "",
    lastSyncedAt: "",
    startDate: toInputDate(start),
    dueDate: toInputDate(due),
    completedDate: "",
    progress: 0,
    status: "Nháp",
    statusNote: "",
    result: "",
    evidenceNote: "",
    estimatedCost: null,
    ...preset,
  };
}

export function kppnToForm(k: Kppn): KppnFormValue {
  return {
    name: k.name,
    description: k.description,
    type: k.type,
    deficiencyId: k.deficiencyId,
    riskId: k.riskId,
    eventId: k.eventId,
    unitId: k.unitId,
    assigneeId: k.assigneeId,
    supervisorId: k.supervisorId,
    executionSystem: k.executionSystem,
    externalTaskCode: k.externalTaskCode,
    externalUrl: k.externalUrl,
    lastSyncedAt: k.lastSyncedAt,
    startDate: k.startDate,
    dueDate: k.dueDate,
    completedDate: k.completedDate,
    progress: k.progress,
    status: k.status,
    statusNote: k.statusNote,
    result: k.result,
    evidenceNote: k.evidenceNote,
    estimatedCost: k.estimatedCost,
  };
}

export interface KppnValidateResult {
  ok: boolean;
  data?: KppnFormValue;
  errors: FieldErrors;
}

export function validateKppnForm(value: unknown): KppnValidateResult {
  const parsed = kppnFormSchema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data, errors: {} };
  return { ok: false, errors: zodErrors(parsed.error) };
}

export function kppnWarnings(v: KppnFormValue): string[] {
  const out: string[] = [];

  if (v.executionSystem === "Theo dõi trong GRC") {
    out.push(
      "Hành động được theo dõi trực tiếp trong GRC. Theo nguyên tắc GRC điều phối, nên giao việc sang AMIS Công việc hoặc JIRA để người thực hiện cập nhật tại nơi họ làm việc.",
    );
  }

  if (!v.supervisorId) {
    out.push(
      "Chưa chỉ định người giám sát, sẽ không có người nghiệm thu kết quả khi hành động hoàn thành.",
    );
  }

  if (v.startDate && v.dueDate) {
    const gap = Math.round(
      (endOfDay(v.dueDate) - startOfDay(v.startDate)) / DAY,
    );
    if (gap > 180) {
      out.push(
        `Thời gian thực hiện là ${gap} ngày, vượt 6 tháng. Nên chia nhỏ thành nhiều hành động để dễ theo dõi.`,
      );
    }
  }

  if (v.type === "Khắc phục" && !v.deficiencyId && !v.eventId) {
    out.push(
      "Hành động khắc phục thường phát sinh từ một điểm yếu hoặc sự kiện cụ thể, nên gắn nguồn để truy vết.",
    );
  }

  if (v.estimatedCost === null) {
    out.push("Chưa ước tính chi phí, sẽ khó tổng hợp ngân sách khắc phục.");
  }

  if (v.progress > 0 && v.status === "Chưa bắt đầu") {
    out.push(
      "Tiến độ đã lớn hơn 0 nhưng trạng thái vẫn là Chưa bắt đầu, nên chuyển sang Đang thực hiện.",
    );
  }

  return out;
}
