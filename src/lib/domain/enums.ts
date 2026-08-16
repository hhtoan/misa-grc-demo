/* ==================================================================
   Hằng số nghiệp vụ dùng chung toàn hệ thống
   ================================================================== */

/* ------------------------- Mức độ rủi ro -------------------------- */
export const RISK_LEVELS = ["Thấp", "Trung bình", "Cao", "Trọng yếu"] as const;
export type RiskLevelValue = (typeof RISK_LEVELS)[number];

/* --------------------------- Trạng thái --------------------------- */
export const RISK_STATUSES = [
  "Nháp",
  "Chờ duyệt",
  "Đã duyệt",
  "Đang theo dõi",
  "Đang xử lý",
  "Đã đóng",
  "Từ chối",
] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const CONTROL_STATUSES = [
  "Nháp",
  "Chờ duyệt",
  "Đang hiệu lực",
  "Tạm ngưng",
  "Hết hiệu lực",
] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

export const DEFICIENCY_STATUSES = [
  "Mới ghi nhận",
  "Đang phân tích",
  "Đã lập KPPN",
  "Đã khắc phục",
  "Đã đóng",
] as const;
export type DeficiencyStatus = (typeof DEFICIENCY_STATUSES)[number];

export const KPPN_STATUSES = [
  "Nháp",
  "Chờ duyệt",
  "Chưa bắt đầu",
  "Đang thực hiện",
  "Chờ nghiệm thu",
  "Hoàn thành",
  "Huỷ",
] as const;
export type KppnStatus = (typeof KPPN_STATUSES)[number];

export const EVENT_STATUSES = [
  "Mới ghi nhận",
  "Đang xác minh",
  "Đã xác minh",
  "Đang điều tra",
  "Đang xử lý",
  "Đã đóng",
  "Huỷ ghi nhận",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/* --------------------- Thuộc tính rủi ro -------------------------- */
export const RISK_TREATMENTS = [
  "Chấp nhận",
  "Giảm thiểu",
  "Chuyển giao",
  "Né tránh",
] as const;
export type RiskTreatment = (typeof RISK_TREATMENTS)[number];

export const RISK_SOURCES = ["Nội bộ", "Bên ngoài", "Kết hợp"] as const;

/* --------------------- Thuộc tính kiểm soát ----------------------- */
export const CONTROL_TYPES = ["Phòng ngừa", "Phát hiện", "Khắc phục"] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

export const CONTROL_NATURES = ["Thủ công", "Bán tự động", "Tự động"] as const;

export const CONTROL_FREQUENCIES = [
  "Liên tục",
  "Hàng ngày",
  "Hàng tuần",
  "Hàng tháng",
  "Hàng quý",
  "Hàng năm",
  "Theo sự vụ",
] as const;

export const CONTROL_TEST_RESULTS = [
  "Hiệu quả",
  "Hiệu quả một phần",
  "Không hiệu quả",
] as const;
export type ControlTestResult = (typeof CONTROL_TEST_RESULTS)[number];

export const CONTROL_TEST_METHODS = [
  "Phỏng vấn",
  "Quan sát",
  "Kiểm tra chứng từ",
  "Thực hiện lại",
  "Phân tích dữ liệu",
] as const;

/* ------------------------- Điểm yếu ------------------------------- */
export const DEFICIENCY_SOURCES = [
  "Kiểm tra kiểm soát",
  "Sự kiện",
  "Kiểm toán nội bộ",
  "Tự phát hiện",
  "Đánh giá hiệu lực",
] as const;

/* --------------------------- KPPN --------------------------------- */
export const KPPN_TYPES = ["Khắc phục", "Phòng ngừa"] as const;
export type KppnType = (typeof KPPN_TYPES)[number];

/** Hệ thống thực thi - GRC chỉ điều phối, việc làm nằm ở hệ thống nguồn */
export const EXECUTION_SYSTEMS = [
  "AMIS Công việc",
  "JIRA",
  "Theo dõi trong GRC",
] as const;
export type ExecutionSystem = (typeof EXECUTION_SYSTEMS)[number];

/* -------------------------- Sự kiện ------------------------------- */
export const EVENT_IMPACT_TYPES = [
  "Tài chính",
  "Uy tín",
  "Pháp lý",
  "Vận hành",
  "An toàn thông tin",
  "Con người",
] as const;

/* --------------------------- KRI ---------------------------------- */
export const KRI_DIRECTIONS = [
  "Càng cao càng xấu",
  "Càng thấp càng xấu",
] as const;
export const KRI_STATUSES = ["An toàn", "Cảnh báo", "Vượt ngưỡng"] as const;
export type KriStatus = (typeof KRI_STATUSES)[number];

/* --------------------- Khía cạnh BSC (mục tiêu) ------------------- */
export const BSC_PERSPECTIVES = [
  "Tài chính",
  "Khách hàng",
  "Quy trình nội bộ",
  "Học hỏi & phát triển",
] as const;

export const OBJECTIVE_LEVELS = ["Công ty", "Khối", "Phòng ban"] as const;

/* ------------------ Tiện ích tạo option cho Select ---------------- */
export function toOptions(values: readonly string[]) {
  return values.map((v) => ({ value: v, label: v }));
}
