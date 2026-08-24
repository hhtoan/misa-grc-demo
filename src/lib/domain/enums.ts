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

/**
 * Trạng thái mà kiểm soát THỰC SỰ đang vận hành.
 *
 * Sửa một lỗi tồn đọng từ lô D: khi đó chỉ loại Nháp và Chờ duyệt, nên
 * kiểm soát Tạm ngưng và Hết hiệu lực vẫn được tính là đang bảo vệ rủi
 * ro. Cả hai trạng thái ấy đều nghĩa là kiểm soát KHÔNG còn chạy, nên
 * gợi ý điểm còn lại đang lạc quan hơn thực tế.
 *
 * Khai theo hướng DANH SÁCH TRẮNG: thêm trạng thái mới vào enum sẽ mặc
 * định không được tính, an toàn hơn là quên bổ sung vào danh sách đen.
 */
export const CONTROL_OPERATING_STATUSES = ["Đang hiệu lực"] as const;

/**
 * Mức phù hợp của một kiểm soát với MỘT rủi ro cụ thể.
 *
 * Khác hoàn toàn với hiệu lực kiểm soát. Một kiểm soát có thể hoàn toàn
 * hiệu quả nhưng bị gắn nhầm vào rủi ro nó không bảo vệ, và đó đúng là
 * loại sai sót kiểm toán nội bộ hay phát hiện.
 */
export const CONTROL_RELEVANCE = [
  "Phù hợp",
  "Phù hợp một phần",
  "Không phù hợp",
] as const;
export type ControlRelevance = (typeof CONTROL_RELEVANCE)[number];

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

/* ==================================================================
   Hiệu lực kiểm soát theo hai chiều
   Design Effectiveness và Operation Effectiveness
   ================================================================== */

/** Ba mức kết luận, dùng cho cả hai chiều và cho hiệu quả chung */
export const CONTROL_EFFECTIVENESS = [
  "Hiệu quả",
  "Hiệu quả một phần",
  "Không hiệu quả",
] as const;

export type ControlEffectivenessValue = (typeof CONTROL_EFFECTIVENESS)[number];

/**
 * Giá trị hiển thị khi chưa có kết luận.
 * KHÔNG đưa vào CONTROL_EFFECTIVENESS vì đây không phải một kết luận
 * đánh giá, mà là trạng thái chưa đánh giá.
 */
export const CONTROL_EFFECTIVENESS_NOT_ASSESSED = "Chưa đánh giá" as const;

/** Tuỳ chọn cho các bộ lọc trên sổ kiểm soát */
export const CONTROL_EFFECTIVENESS_FILTER = [
  ...CONTROL_EFFECTIVENESS,
  CONTROL_EFFECTIVENESS_NOT_ASSESSED,
] as const;

/** Thứ tự sắp xếp từ tốt tới xấu */
export const CONTROL_EFFECTIVENESS_ORDER: Record<string, number> = {
  "Hiệu quả": 1,
  "Hiệu quả một phần": 2,
  "Không hiệu quả": 3,
  "Chưa đánh giá": 4,
};

/* ==================================================================
   Giai đoạn vòng đời rủi ro, dùng cho wizard và LifecycleStepper
   ================================================================== */

/* ==================================================================
   Vòng đời rủi ro: 8 bước theo đặc tả chốt ngày 18/08/2026

   Bước 5 Điểm yếu là TUỲ CHỌN, người dùng bỏ qua được.
   Bước 8 Rà soát chỉ tồn tại trong wizard, không phải một giai đoạn
   của bản ghi, nên dải vòng đời trên hồ sơ chỉ hiện 7 bước đầu.
   ================================================================== */

export const RISK_LIFECYCLE_STEPS = [
  "Bối cảnh",
  "Nhận diện",
  "Đánh giá vốn có",
  "Đánh giá kiểm soát",
  "Điểm yếu",
  "Đánh giá còn lại",
  "Phương án xử lý",
  "Rà soát và gửi",
] as const;

export type RiskLifecycleStep = (typeof RISK_LIFECYCLE_STEPS)[number];
