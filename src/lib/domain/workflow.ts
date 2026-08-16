import type {
  ControlStatus,
  DeficiencyStatus,
  EventStatus,
  KppnStatus,
  RiskStatus,
} from "./enums";

export interface Transition<S extends string> {
  to: S;
  /** Nhãn hiển thị trên nút */
  label: string;
  /** Kiểu nút hiển thị */
  tone?: "primary" | "secondary" | "danger";
  /** Bắt buộc nhập lý do khi chuyển */
  requireReason?: boolean;
}

export type StateMachine<S extends string> = Record<S, Transition<S>[]>;

/* --------------------------- Rủi ro ------------------------------- */
export const RISK_FLOW: StateMachine<RiskStatus> = {
  Nháp: [{ to: "Chờ duyệt", label: "Trình duyệt", tone: "primary" }],
  "Chờ duyệt": [
    { to: "Đã duyệt", label: "Phê duyệt", tone: "primary" },
    { to: "Từ chối", label: "Từ chối", tone: "danger", requireReason: true },
  ],
  "Đã duyệt": [
    { to: "Đang theo dõi", label: "Đưa vào theo dõi", tone: "primary" },
  ],
  "Đang theo dõi": [
    { to: "Đang xử lý", label: "Bắt đầu xử lý", tone: "primary" },
    {
      to: "Đã đóng",
      label: "Đóng rủi ro",
      tone: "secondary",
      requireReason: true,
    },
  ],
  "Đang xử lý": [
    { to: "Đang theo dõi", label: "Quay lại theo dõi", tone: "secondary" },
    {
      to: "Đã đóng",
      label: "Đóng rủi ro",
      tone: "primary",
      requireReason: true,
    },
  ],
  "Đã đóng": [
    {
      to: "Đang theo dõi",
      label: "Mở lại",
      tone: "secondary",
      requireReason: true,
    },
  ],
  "Từ chối": [{ to: "Nháp", label: "Sửa và trình lại", tone: "secondary" }],
};

/* -------------------------- Kiểm soát ----------------------------- */
export const CONTROL_FLOW: StateMachine<ControlStatus> = {
  Nháp: [{ to: "Chờ duyệt", label: "Trình duyệt", tone: "primary" }],
  "Chờ duyệt": [
    { to: "Đang hiệu lực", label: "Ban hành", tone: "primary" },
    { to: "Nháp", label: "Trả lại", tone: "danger", requireReason: true },
  ],
  "Đang hiệu lực": [
    {
      to: "Tạm ngưng",
      label: "Tạm ngưng",
      tone: "secondary",
      requireReason: true,
    },
    {
      to: "Hết hiệu lực",
      label: "Ngừng áp dụng",
      tone: "danger",
      requireReason: true,
    },
  ],
  "Tạm ngưng": [
    { to: "Đang hiệu lực", label: "Khôi phục", tone: "primary" },
    {
      to: "Hết hiệu lực",
      label: "Ngừng áp dụng",
      tone: "danger",
      requireReason: true,
    },
  ],
  "Hết hiệu lực": [],
};

/* -------------------------- Điểm yếu ------------------------------ */
export const DEFICIENCY_FLOW: StateMachine<DeficiencyStatus> = {
  "Mới ghi nhận": [
    { to: "Đang phân tích", label: "Bắt đầu phân tích", tone: "primary" },
  ],
  "Đang phân tích": [
    { to: "Đã lập KPPN", label: "Đã lập KPPN", tone: "primary" },
  ],
  "Đã lập KPPN": [
    { to: "Đã khắc phục", label: "Xác nhận khắc phục", tone: "primary" },
  ],
  "Đã khắc phục": [
    { to: "Đã đóng", label: "Đóng điểm yếu", tone: "primary" },
    {
      to: "Đang phân tích",
      label: "Mở lại",
      tone: "secondary",
      requireReason: true,
    },
  ],
  "Đã đóng": [],
};

/* ---------------------------- KPPN -------------------------------- */
export const KPPN_FLOW: StateMachine<KppnStatus> = {
  Nháp: [{ to: "Chờ duyệt", label: "Trình duyệt", tone: "primary" }],
  "Chờ duyệt": [
    { to: "Chưa bắt đầu", label: "Phê duyệt & giao việc", tone: "primary" },
    { to: "Nháp", label: "Trả lại", tone: "danger", requireReason: true },
  ],
  "Chưa bắt đầu": [
    { to: "Đang thực hiện", label: "Bắt đầu thực hiện", tone: "primary" },
    { to: "Huỷ", label: "Huỷ", tone: "danger", requireReason: true },
  ],
  "Đang thực hiện": [
    { to: "Chờ nghiệm thu", label: "Gửi nghiệm thu", tone: "primary" },
    { to: "Huỷ", label: "Huỷ", tone: "danger", requireReason: true },
  ],
  "Chờ nghiệm thu": [
    { to: "Hoàn thành", label: "Nghiệm thu đạt", tone: "primary" },
    {
      to: "Đang thực hiện",
      label: "Yêu cầu làm lại",
      tone: "danger",
      requireReason: true,
    },
  ],
  "Hoàn thành": [],
  Huỷ: [],
};

/* --------------------------- Sự kiện ------------------------------ */
export const EVENT_FLOW: StateMachine<EventStatus> = {
  "Mới ghi nhận": [
    { to: "Đang xác minh", label: "Tiếp nhận xác minh", tone: "primary" },
    {
      to: "Huỷ ghi nhận",
      label: "Huỷ ghi nhận",
      tone: "danger",
      requireReason: true,
    },
  ],
  "Đang xác minh": [
    { to: "Đã xác minh", label: "Xác nhận sự kiện", tone: "primary" },
    {
      to: "Huỷ ghi nhận",
      label: "Không phải sự kiện",
      tone: "danger",
      requireReason: true,
    },
  ],
  "Đã xác minh": [
    { to: "Đang điều tra", label: "Điều tra nguyên nhân", tone: "primary" },
  ],
  "Đang điều tra": [
    { to: "Đang xử lý", label: "Chuyển xử lý", tone: "primary" },
  ],
  "Đang xử lý": [
    {
      to: "Đã đóng",
      label: "Đóng sự kiện",
      tone: "primary",
      requireReason: true,
    },
  ],
  "Đã đóng": [
    {
      to: "Đang xử lý",
      label: "Mở lại",
      tone: "secondary",
      requireReason: true,
    },
  ],
  "Huỷ ghi nhận": [],
};

/* ------------------------- Tiện ích ------------------------------- */
export function nextTransitions<S extends string>(
  machine: StateMachine<S>,
  current: S,
): Transition<S>[] {
  return machine[current] ?? [];
}

export function canTransit<S extends string>(
  machine: StateMachine<S>,
  from: S,
  to: S,
): boolean {
  return nextTransitions(machine, from).some((t) => t.to === to);
}

/** Trạng thái kết thúc, không cho sửa nội dung nữa */
export function isTerminal<S extends string>(
  machine: StateMachine<S>,
  current: S,
): boolean {
  return nextTransitions(machine, current).length === 0;
}

/** Trạng thái đã khoá chỉnh sửa (đang chờ duyệt hoặc đã kết thúc) */
export const LOCKED_EDIT_STATUSES = new Set<string>([
  "Chờ duyệt",
  "Đã đóng",
  "Hết hiệu lực",
  "Huỷ",
  "Huỷ ghi nhận",
]);
