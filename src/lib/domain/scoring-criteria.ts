/* ==================================================================
   Tiêu chí chấm điểm rủi ro.

   File này là NGUỒN SỰ THẬT DUY NHẤT về thang điểm và mô tả từng mức.
   Ban Quản trị rủi ro sửa trực tiếp tại đây, không cần chạm code
   màn hình. Muốn thêm tiêu chí thì thêm phần tử vào
   RISK_SCORING_CRITERIA, component ScoreSelector tự sinh thêm dòng.
   ================================================================== */

/** Một mức điểm của tiêu chí */
export interface ScoreLevel {
  /** Điểm, từ 1 tới 5 */
  value: number;
  /** Nhãn ngắn hiện ngay trên ô chọn, tầng help text 1 */
  label: string;
  /** Mô tả ranh giới, hiện ở tooltip, tầng help text 2 */
  description: string;
  /** Ví dụ minh hoạ, hiện ở bảng đầy đủ, tầng help text 3 */
  example?: string;
}

/** Một dòng trong bảng chấm điểm */
export interface ScoreCriterion {
  key: string;
  label: string;
  /** Câu hỏi ngắn giúp người chấm hiểu mình đang trả lời điều gì */
  question: string;
  levels: ScoreLevel[];
}

/* ================================================================== */
/* Tiêu chí 1: Khả năng xảy ra                                        */
/* ================================================================== */

export const LIKELIHOOD_CRITERION: ScoreCriterion = {
  key: "likelihood",
  label: "Khả năng xảy ra",
  question: "Rủi ro này có thể xảy ra với tần suất như thế nào?",
  levels: [
    {
      value: 1,
      label: "Rất hiếm",
      description:
        "Trên 5 năm mới có thể xảy ra một lần, chưa từng ghi nhận tại đơn vị",
      example:
        "Sự cố hạ tầng quy mô lớn ở trung tâm dữ liệu có hai lớp dự phòng",
    },
    {
      value: 2,
      label: "Hiếm khi",
      description:
        "Có thể xảy ra 3 tới 5 năm một lần, đã từng ghi nhận ở đơn vị khác",
      example: "Nhân sự chủ chốt nghỉ việc đột ngột không kịp bàn giao",
    },
    {
      value: 3,
      label: "Thỉnh thoảng",
      description:
        "Có thể xảy ra 1 tới 3 năm một lần, đã từng xảy ra tại đơn vị",
      example: "Sai sót số liệu trong báo cáo tổng hợp cuối kỳ",
    },
    {
      value: 4,
      label: "Thường xuyên",
      description: "Có thể xảy ra vài lần trong một năm",
      example: "Chậm tiến độ giao hàng do phụ thuộc đối tác bên ngoài",
    },
    {
      value: 5,
      label: "Gần như chắc chắn",
      description: "Đang xảy ra hoặc dự kiến xảy ra trong vài tháng tới",
      example: "Thiếu hụt nhân lực ở mảng đang tăng trưởng nhanh",
    },
  ],
};

/* ================================================================== */
/* Tiêu chí 2: Mức độ ảnh hưởng                                        */
/* ================================================================== */

/**
 * Đây là tiêu chí TỔNG HỢP nhiều mặt ảnh hưởng.
 * Nguyên tắc chấm: lấy theo mặt NGHIÊM TRỌNG NHẤT, không lấy bình quân.
 * Chỉ cần một mặt đạt mức 5 là điểm ảnh hưởng bằng 5.
 */
export const IMPACT_CRITERION: ScoreCriterion = {
  key: "impact",
  label: "Mức độ ảnh hưởng",
  question:
    "Nếu xảy ra, rủi ro này gây ảnh hưởng tới mức nào? Lấy theo mặt nghiêm trọng nhất",
  levels: [
    {
      value: 1,
      label: "Không đáng kể",
      description:
        "Tổn thất dưới 50 triệu, xử lý trong ngân sách đơn vị, không ảnh hưởng khách hàng và không gián đoạn hoạt động",
      example:
        "Sai sót nhỏ trong nội bộ, tự khắc phục ngay, không ai bên ngoài biết",
    },
    {
      value: 2,
      label: "Nhẹ",
      description:
        "Tổn thất 50 tới 300 triệu, một vài khách hàng phản ánh, gián đoạn dưới nửa ngày làm việc",
      example:
        "Một chức năng phụ lỗi trong vài giờ, một số khách phản ánh nhưng xử lý tại chỗ",
    },
    {
      value: 3,
      label: "Trung bình",
      description:
        "Tổn thất 300 triệu tới 1 tỷ, một nhóm khách hàng bị ảnh hưởng, bị nhắc nhở hoặc xử phạt hành chính, gián đoạn một phần dưới một ngày",
      example:
        "Chức năng chính suy giảm nhiều giờ, phải gửi thông báo xin lỗi khách hàng",
    },
    {
      value: 4,
      label: "Nghiêm trọng",
      description:
        "Tổn thất 1 tới 5 tỷ, mất khách hàng trọng yếu, lệch mục tiêu doanh thu năm, thông tin bất lợi lan trong ngành, gián đoạn nhiều ngày ở một số đơn vị",
      example:
        "Mất một khách hàng lớn, đối thủ và đối tác trong ngành đều biết vụ việc",
    },
    {
      value: 5,
      label: "Rất nghiêm trọng",
      description:
        "Tổn thất trên 5 tỷ hoặc ảnh hưởng khả năng thanh toán, khách hàng rời bỏ hàng loạt, bị đình chỉ hoạt động hoặc khởi tố, truyền thông đại chúng đưa tin, gián đoạn toàn tổ chức",
      example:
        "Rò rỉ dữ liệu khách hàng diện rộng, báo chí đưa tin, cơ quan quản lý vào kiểm tra",
    },
  ],
};

/* ================================================================== */
/* Bảng chấm điểm rủi ro                                        */
/* ================================================================== */

export const RISK_SCORING_CRITERIA: ScoreCriterion[] = [
  LIKELIHOOD_CRITERION,
  IMPACT_CRITERION,
];

/** Điểm thấp nhất và cao nhất của một tiêu chí */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/* ================================================================== */
/* Tiện ích tra cứu                                        */
/* ================================================================== */

export function criterionByKey(key: string): ScoreCriterion | undefined {
  return RISK_SCORING_CRITERIA.find((c) => c.key === key);
}

export function levelOfCriterion(
  criterion: ScoreCriterion,
  value: number | null | undefined,
): ScoreLevel | undefined {
  if (!value) return undefined;
  return criterion.levels.find((l) => l.value === value);
}

/** Nhãn ngắn của một điểm, dùng ở bảng và badge */
export function scoreLabel(
  criterionKey: string,
  value: number | null | undefined,
): string {
  const c = criterionByKey(criterionKey);
  if (!c) return value ? String(value) : "--";
  const lv = levelOfCriterion(c, value);
  return lv ? lv.label : "--";
}

/** Mô tả ranh giới của một điểm, dùng ở tooltip */
export function scoreDescription(
  criterionKey: string,
  value: number | null | undefined,
): string {
  const c = criterionByKey(criterionKey);
  if (!c) return "";
  const lv = levelOfCriterion(c, value);
  return lv ? lv.description : "";
}

/**
 * Điểm rủi ro bằng khả năng nhân mức ảnh hưởng.
 * Trả về null nếu thiếu bất kỳ tiêu chí nào, để màn hình
 * hiện Chưa đánh giá thay vì hiện số 0 gây hiểu nhầm.
 */
export function riskScoreOf(
  likelihood: number | null | undefined,
  impact: number | null | undefined,
): number | null {
  if (!likelihood || !impact) return null;
  return likelihood * impact;
}
