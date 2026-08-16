import type { KriStatus } from "@/lib/domain/enums";
import type { Kri, KriReading } from "@/lib/domain/schema";
import { seedBase } from "./base";

/* ==================================================================
   Chỉ số cảnh báo rủi ro (KRI) - 6 bản ghi
   ------------------------------------------------------------------
   Quy tắc ngưỡng trong kriFormSchema:
   - "Càng cao càng xấu"  -> thresholdBreach > thresholdWarning
   - "Càng thấp càng xấu" -> thresholdBreach < thresholdWarning

   Trạng thái được tính lại bằng kriStatusOf(value, warning, breach,
   direction), dữ liệu mẫu dưới đây đã khớp sẵn với hàm này.
   ================================================================== */

export const SEED_KRIS: Kri[] = [
  {
    ...seedBase("kri-01", "KRI-2026-001"),
    name: "Tỷ lệ thời gian sẵn sàng của dịch vụ khách hàng",
    description:
      "Đo tổng thời gian dịch vụ khách hàng hoạt động bình thường trên tổng thời gian trong kỳ.",
    riskId: "risk-01",
    unitId: "unit-it",
    ownerId: "emp-yen",
    measureUnit: "%",
    direction: "Càng thấp càng xấu",
    thresholdWarning: 99.9,
    thresholdBreach: 99.5,
    frequency: "Hàng tháng",
    dataSource: "Hệ thống giám sát hạ tầng - báo cáo uptime tự động",
    currentValue: 99.72,
    currentPeriod: "Tháng 8/2026",
    status: "Cảnh báo",
    isActive: true,
  },
  {
    ...seedBase("kri-02", "KRI-2026-002"),
    name: "Số lượt truy vấn dữ liệu khách hàng bất thường",
    description:
      "Đếm số lượt truy vấn vượt ngưỡng khối lượng hoặc thực hiện ngoài giờ làm việc trên hệ thống CRM.",
    riskId: "risk-02",
    unitId: "unit-it",
    ownerId: "emp-tuan",
    measureUnit: "lượt",
    direction: "Càng cao càng xấu",
    thresholdWarning: 5,
    thresholdBreach: 10,
    frequency: "Hàng tháng",
    dataSource: "Nhật ký truy cập hệ thống CRM",
    currentValue: 12,
    currentPeriod: "Tháng 8/2026",
    status: "Vượt ngưỡng",
    isActive: true,
  },
  {
    ...seedBase("kri-03", "KRI-2026-003"),
    name: "Tỷ lệ nợ phải thu quá hạn trên 90 ngày",
    description:
      "Tỷ trọng dư nợ quá hạn trên 90 ngày so với tổng dư nợ phải thu tại thời điểm cuối kỳ.",
    riskId: "risk-03",
    unitId: "unit-tc",
    ownerId: "emp-mai",
    measureUnit: "%",
    direction: "Càng cao càng xấu",
    thresholdWarning: 3,
    thresholdBreach: 5,
    frequency: "Hàng tháng",
    dataSource: "Báo cáo tuổi nợ trên hệ thống ERP",
    currentValue: 3.8,
    currentPeriod: "Tháng 8/2026",
    status: "Cảnh báo",
    isActive: true,
  },
  {
    ...seedBase("kri-04", "KRI-2026-004"),
    name: "Số ngày chậm phát hành bình quân của sản phẩm",
    description:
      "Chênh lệch bình quân giữa ngày phát hành thực tế và ngày cam kết trong kỳ.",
    riskId: "risk-04",
    unitId: "unit-sx",
    ownerId: "emp-binh",
    measureUnit: "ngày",
    direction: "Càng cao càng xấu",
    thresholdWarning: 3,
    thresholdBreach: 7,
    frequency: "Hàng quý",
    dataSource: "Công cụ quản lý phát hành sản phẩm",
    currentValue: 2,
    currentPeriod: "Quý II/2026",
    status: "An toàn",
    isActive: true,
  },
  {
    ...seedBase("kri-05", "KRI-2026-005"),
    name: "Tỷ lệ nghỉ việc của nhân sự thuộc vị trí trọng yếu",
    description:
      "Tỷ lệ nhân sự nghỉ việc trong kỳ so với tổng số nhân sự đang giữ vị trí trọng yếu.",
    riskId: "risk-05",
    unitId: "unit-ns",
    ownerId: "emp-anh",
    measureUnit: "%",
    direction: "Càng cao càng xấu",
    thresholdWarning: 8,
    thresholdBreach: 12,
    frequency: "Hàng quý",
    dataSource: "Hệ thống quản trị nhân sự",
    currentValue: 6.5,
    currentPeriod: "Quý II/2026",
    status: "An toàn",
    isActive: true,
  },
  {
    ...seedBase("kri-06", "KRI-2026-006"),
    name: "Tiến độ hoàn thành hạng mục bảo vệ dữ liệu cá nhân",
    description:
      "Tỷ lệ hạng mục bắt buộc đã hoàn thành trên tổng số hạng mục trong kế hoạch tuân thủ bảo vệ dữ liệu cá nhân.",
    riskId: "risk-06",
    unitId: "unit-qtrr",
    ownerId: "emp-ha",
    measureUnit: "%",
    direction: "Càng thấp càng xấu",
    thresholdWarning: 80,
    thresholdBreach: 60,
    frequency: "Hàng quý",
    dataSource: "Bảng theo dõi kế hoạch tuân thủ của Ban QTRR",
    currentValue: 45,
    currentPeriod: "Quý II/2026",
    status: "Vượt ngưỡng",
    isActive: true,
  },
];

/* ==================================================================
   Kỳ đo KRI - 23 bản ghi
   ================================================================== */

let seq = 0;

function reading(
  kriId: string,
  period: string,
  value: number,
  recordedDate: string,
  status: KriStatus,
  note = ""
): KriReading {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  return {
    ...seedBase(`kriv-${n}`, `KRV-2026-${n}`),
    kriId,
    period,
    value,
    recordedDate,
    status,
    note,
  };
}

export const SEED_KRI_READINGS: KriReading[] = [
  /* ---------- KRI-2026-001: tính sẵn sàng dịch vụ ---------- */
  reading("kri-01", "Tháng 5/2026", 99.95, "2026-06-02", "An toàn"),
  reading("kri-01", "Tháng 6/2026", 99.88, "2026-07-02", "Cảnh báo",
    "Có 2 lần gián đoạn ngắn khi bảo trì ngoài kế hoạch."),
  reading("kri-01", "Tháng 7/2026", 99.42, "2026-08-03", "Vượt ngưỡng",
    "Ảnh hưởng bởi sự kiện EVT-2026-010, mất kết nối nhà cung cấp đám mây 45 phút."),
  reading("kri-01", "Tháng 8/2026", 99.72, "2026-08-15", "Cảnh báo",
    "Số liệu tạm tính tới ngày 15/08/2026."),

  /* ---------- KRI-2026-002: truy vấn dữ liệu bất thường ---------- */
  reading("kri-02", "Tháng 5/2026", 3, "2026-06-02", "An toàn"),
  reading("kri-02", "Tháng 6/2026", 6, "2026-07-02", "Cảnh báo",
    "Tăng do mở rộng nhóm đối tác đại lý mới."),
  reading("kri-02", "Tháng 7/2026", 9, "2026-08-03", "Cảnh báo"),
  reading("kri-02", "Tháng 8/2026", 12, "2026-08-15", "Vượt ngưỡng",
    "Đã bật luật cảnh báo mới theo KPPN-2026-005, số lượt phát hiện tăng."),

  /* ---------- KRI-2026-003: nợ quá hạn trên 90 ngày ---------- */
  reading("kri-03", "Tháng 5/2026", 2.4, "2026-06-05", "An toàn"),
  reading("kri-03", "Tháng 6/2026", 3.1, "2026-07-05", "Cảnh báo"),
  reading("kri-03", "Tháng 7/2026", 3.5, "2026-08-05", "Cảnh báo",
    "Tập trung ở nhóm khách hàng doanh nghiệp vừa và nhỏ."),
  reading("kri-03", "Tháng 8/2026", 3.8, "2026-08-15", "Cảnh báo",
    "Đang theo dõi sát, chưa vượt ngưỡng 5%."),

  /* ---------- KRI-2026-004: số ngày chậm phát hành ---------- */
  reading("kri-04", "Quý III/2025", 2, "2025-10-05", "An toàn"),
  reading("kri-04", "Quý IV/2025", 4, "2026-01-06", "Cảnh báo"),
  reading("kri-04", "Quý I/2026", 5, "2026-04-06", "Cảnh báo",
    "Do thay đổi phạm vi giữa chu kỳ, liên quan điểm yếu DEF-2026-004."),
  reading("kri-04", "Quý II/2026", 2, "2026-07-06", "An toàn",
    "Cải thiện sau khi siết quy trình chốt phạm vi đầu chu kỳ."),

  /* ---------- KRI-2026-005: nghỉ việc vị trí trọng yếu ---------- */
  reading("kri-05", "Quý III/2025", 5.2, "2025-10-08", "An toàn"),
  reading("kri-05", "Quý IV/2025", 7.4, "2026-01-08", "An toàn"),
  reading("kri-05", "Quý I/2026", 9.1, "2026-04-08", "Cảnh báo",
    "Tập trung ở nhóm kỹ sư hạ tầng."),
  reading("kri-05", "Quý II/2026", 6.5, "2026-07-08", "An toàn"),

  /* ---------- KRI-2026-006: tiến độ tuân thủ dữ liệu cá nhân ---------- */
  reading("kri-06", "Quý IV/2025", 25, "2026-01-10", "Vượt ngưỡng",
    "Mới khởi động kế hoạch, phần lớn hạng mục chưa triển khai."),
  reading("kri-06", "Quý I/2026", 38, "2026-04-10", "Vượt ngưỡng"),
  reading("kri-06", "Quý II/2026", 45, "2026-07-10", "Vượt ngưỡng",
    "Chậm tiến độ do KPPN-2026-011 quá hạn, mới rà soát 4/9 khối đơn vị."),
];
