import type { RiskLevelValue } from "./enums";

export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: "Hiếm khi",
  2: "Ít khi",
  3: "Có thể",
  4: "Thường xuyên",
  5: "Gần như chắc chắn",
};

export const IMPACT_LABELS: Record<number, string> = {
  1: "Không đáng kể",
  2: "Nhẹ",
  3: "Trung bình",
  4: "Nghiêm trọng",
  5: "Rất nghiêm trọng",
};

/** Điểm rủi ro = Khả năng xảy ra × Mức độ ảnh hưởng */
export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

/** Quy đổi điểm sang mức độ theo ngưỡng của ma trận 5x5 */
export function riskLevelFromScore(score: number): RiskLevelValue {
  if (score <= 4) return "Thấp";
  if (score <= 9) return "Trung bình";
  if (score <= 15) return "Cao";
  return "Trọng yếu";
}

export function riskLevelOf(
  likelihood: number,
  impact: number,
): RiskLevelValue {
  return riskLevelFromScore(riskScore(likelihood, impact));
}

/** Màu nền ô ma trận, dùng cho heatmap */
export const LEVEL_COLOR: Record<RiskLevelValue, string> = {
  Thấp: "#ECFDF3",
  "Trung bình": "#FFFAEB",
  Cao: "#FFF4ED",
  "Trọng yếu": "#FEF3F2",
};

export const LEVEL_TEXT_COLOR: Record<RiskLevelValue, string> = {
  Thấp: "#067647",
  "Trung bình": "#B54708",
  Cao: "#C4320A",
  "Trọng yếu": "#B42318",
};

/** Sinh dữ liệu 5x5 để vẽ ma trận: hàng = khả năng (5 xuống 1) */
export function buildMatrix() {
  const rows: {
    likelihood: number;
    cells: {
      likelihood: number;
      impact: number;
      score: number;
      level: RiskLevelValue;
    }[];
  }[] = [];

  for (let l = 5; l >= 1; l--) {
    const cells = [];
    for (let i = 1; i <= 5; i++) {
      cells.push({
        likelihood: l,
        impact: i,
        score: riskScore(l, i),
        level: riskLevelOf(l, i),
      });
    }
    rows.push({ likelihood: l, cells });
  }
  return rows;
}

/** Mức độ giảm được nhờ kiểm soát, dùng ở màn hình đánh giá */
export function riskReduction(
  inherentScore: number,
  residualScore: number,
): number {
  if (inherentScore <= 0) return 0;
  return Math.round(((inherentScore - residualScore) / inherentScore) * 100);
}
