import type { Deficiency } from "@/lib/domain/schema";
import { seedBase } from "./base";

/* ==================================================================
   Điểm yếu kiểm soát - 8 bản ghi
   ------------------------------------------------------------------
   Nguồn phát sinh:
   - def-01 -> def-04 : sinh từ kết quả kiểm tra kiểm soát (controls.ts)
   - def-05           : sinh từ sự kiện (events.ts)
   - def-06           : phát hiện qua kiểm toán nội bộ
   - def-07           : đơn vị tự phát hiện
   - def-08           : phát hiện qua đánh giá hiệu lực
   ================================================================== */

export const SEED_DEFICIENCIES: Deficiency[] = [
  {
    ...seedBase("def-01", "DEF-2026-001"),
    name: "Thiếu cơ chế cảnh báo khi tác vụ sao lưu thất bại",
    description:
      "Có 4 ngày trong quý không ghi nhận nhật ký sao lưu thành công nhưng không ai được cảnh báo. Diễn tập khôi phục quý II cũng chưa được thực hiện.",
    sourceType: "Kiểm tra kiểm soát",
    sourceRef: "TEST-2026-001",
    controlId: "ctrl-01",
    riskId: "risk-01",
    eventId: "",
    severity: "Cao",
    unitId: "unit-it",
    ownerId: "emp-tuan",
    detectedDate: "2026-06-25",
    dueDate: "2026-09-30",
    rootCause:
      "Công cụ sao lưu chỉ ghi nhật ký cục bộ, chưa tích hợp với hệ thống giám sát tập trung nên lỗi không được đẩy thành cảnh báo. Lịch diễn tập khôi phục chưa được đưa vào kế hoạch công việc định kỳ.",
    status: "Đã lập KPPN",
    statusNote: "",
    kppnIds: ["kppn-01", "kppn-02"],
  },
  {
    ...seedBase("def-02", "DEF-2026-002"),
    name: "Tài khoản đối tác không được thu hồi quyền sau khi chấm dứt hợp đồng",
    description:
      "27/120 tài khoản đối tác đại lý vẫn còn quyền truy cập dữ liệu khách hàng dù hợp đồng đã kết thúc.",
    sourceType: "Kiểm tra kiểm soát",
    sourceRef: "TEST-2026-003",
    controlId: "ctrl-03",
    riskId: "risk-02",
    eventId: "",
    severity: "Trọng yếu",
    unitId: "unit-it",
    ownerId: "emp-tuan",
    detectedDate: "2026-04-20",
    dueDate: "2026-07-31",
    rootCause:
      "Quy trình chấm dứt hợp đồng đối tác không có bước bắt buộc thông báo sang bộ phận quản trị hệ thống, việc thu hồi quyền phụ thuộc hoàn toàn vào thao tác thủ công.",
    status: "Đã lập KPPN",
    statusNote: "Đang theo dõi tiến độ, một hành động đã quá hạn.",
    kppnIds: ["kppn-03", "kppn-04"],
  },
  {
    ...seedBase("def-03", "DEF-2026-003"),
    name: "Hợp đồng bán chịu được ký trước khi phê duyệt hạn mức tín dụng",
    description:
      "6/40 hợp đồng trong kỳ được ký trước, phê duyệt hạn mức tín dụng được bổ sung sau ngày ký.",
    sourceType: "Kiểm tra kiểm soát",
    sourceRef: "TEST-2026-005",
    controlId: "ctrl-05",
    riskId: "risk-03",
    eventId: "",
    severity: "Trung bình",
    unitId: "unit-tc",
    ownerId: "emp-mai",
    detectedDate: "2026-05-30",
    dueDate: "2026-10-31",
    rootCause: "",
    status: "Đang phân tích",
    statusNote: "Đang làm việc với Khối Kinh doanh để xác định nguyên nhân gốc.",
    kppnIds: [],
  },
  {
    ...seedBase("def-04", "DEF-2026-004"),
    name: "Thay đổi phạm vi phát hành không có phê duyệt của hội đồng sản phẩm",
    description:
      "3/8 chu kỳ phát hành có điều chỉnh phạm vi giữa chu kỳ nhưng không tìm thấy hồ sơ phê duyệt.",
    sourceType: "Kiểm tra kiểm soát",
    sourceRef: "TEST-2026-008",
    controlId: "ctrl-09",
    riskId: "risk-04",
    eventId: "",
    severity: "Trung bình",
    unitId: "unit-sx",
    ownerId: "emp-binh",
    detectedDate: "2026-06-15",
    dueDate: "2026-11-30",
    rootCause: "",
    status: "Mới ghi nhận",
    statusNote: "",
    kppnIds: [],
  },
  {
    ...seedBase("def-05", "DEF-2026-005"),
    name: "Thiếu giám sát truy vấn bất thường trên hệ thống CRM",
    description:
      "Sự kiện rò rỉ dữ liệu khách hàng chỉ được phát hiện sau khi khách hàng phản ánh, hệ thống không phát cảnh báo dù có truy vấn khối lượng lớn bất thường.",
    sourceType: "Sự kiện",
    sourceRef: "EVT-2026-002",
    controlId: "ctrl-03",
    riskId: "risk-02",
    eventId: "evt-02",
    severity: "Trọng yếu",
    unitId: "unit-it",
    ownerId: "emp-yen",
    detectedDate: "2026-03-18",
    dueDate: "2026-08-15",
    rootCause:
      "Hệ thống CRM chỉ ghi nhật ký truy cập mà chưa có luật phát hiện hành vi bất thường, đồng thời nhật ký không được đẩy về công cụ giám sát tập trung để phân tích.",
    status: "Đã lập KPPN",
    statusNote: "",
    kppnIds: ["kppn-05", "kppn-06"],
  },
  {
    ...seedBase("def-06", "DEF-2026-006"),
    name: "Phân tách nhiệm vụ trong thanh toán chưa được cấu hình đầy đủ",
    description:
      "Kiểm toán nội bộ phát hiện 2 tài khoản người dùng được gán đồng thời quyền lập và quyền duyệt đề nghị thanh toán trên ERP.",
    sourceType: "Kiểm toán nội bộ",
    sourceRef: "Báo cáo kiểm toán quý I/2026",
    controlId: "ctrl-08",
    riskId: "risk-07",
    eventId: "",
    severity: "Cao",
    unitId: "unit-tc",
    ownerId: "emp-mai",
    detectedDate: "2026-03-05",
    dueDate: "2026-06-30",
    rootCause:
      "Khi bổ sung nhân sự thay thế trong giai đoạn cao điểm, quyền tạm thời được cấp thêm nhưng không thu hồi sau khi kết thúc giai đoạn, do thiếu cơ chế rà soát quyền định kỳ trên ERP.",
    status: "Đã khắc phục",
    statusNote: "Đã thu hồi quyền và bật kiểm tra xung đột quyền tự động, chờ đóng.",
    kppnIds: ["kppn-07"],
  },
  {
    ...seedBase("def-07", "DEF-2026-007"),
    name: "Danh sách vị trí trọng yếu chưa được cập nhật theo cơ cấu mới",
    description:
      "Phòng Nhân sự tự rà soát và phát hiện bản đồ vị trí trọng yếu vẫn theo cơ cấu tổ chức cũ, thiếu 5 vị trí mới thành lập.",
    sourceType: "Tự phát hiện",
    sourceRef: "Biên bản rà soát nội bộ Phòng Nhân sự",
    controlId: "ctrl-10",
    riskId: "risk-05",
    eventId: "",
    severity: "Trung bình",
    unitId: "unit-ns",
    ownerId: "emp-anh",
    detectedDate: "2026-02-20",
    dueDate: "2026-05-31",
    rootCause: "",
    status: "Đã đóng",
    statusNote:
      "Đã cập nhật đầy đủ 5 vị trí mới và gắn người kế thừa dự kiến, đóng điểm yếu ngày 28/05/2026.",
    kppnIds: [],
  },
  {
    ...seedBase("def-08", "DEF-2026-008"),
    name: "Chưa có tiêu chí đo lường hiệu lực cho kiểm soát thủ công",
    description:
      "Đợt đánh giá hiệu lực hệ thống kiểm soát nội bộ ghi nhận nhóm kiểm soát thủ công chưa có tiêu chí đo lường và bằng chứng chuẩn hoá.",
    sourceType: "Đánh giá hiệu lực",
    sourceRef: "Kết quả đánh giá hiệu lực đợt 1/2026",
    controlId: "ctrl-09",
    riskId: "risk-04",
    eventId: "",
    severity: "Thấp",
    unitId: "unit-qtrr",
    ownerId: "emp-ha",
    detectedDate: "2026-07-10",
    dueDate: "2026-12-31",
    rootCause: "",
    status: "Đang phân tích",
    statusNote: "",
    kppnIds: [],
  },
];
