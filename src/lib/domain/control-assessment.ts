"use client";

import { NOT_ASSESSED, overallEffectivenessOf } from "./control-utils";
import {
  isControlOperating,
  notOperatingReason,
  relevanceOf,
} from "./risk-control-link";
import type { RiskControlLink } from "./schema";
import type { ControlRelevance } from "./enums";

/* ==================================================================
   Dựng dữ liệu cho bảng Đánh giá kiểm soát hiện hữu.

   File THUẦN LOGIC: không import React, không đọc repo. Nhận vào danh
   sách kiểm soát cùng bảng tra liên kết, trả về dòng bảng đã tính sẵn
   mọi thứ cần hiển thị.

   Ba câu hỏi mà bảng này phải trả lời cho TỪNG kiểm soát:

     1. Kiểm soát có đang vận hành không       -> isControlOperating
     2. Kiểm soát có chạy tốt không            -> overallEffectivenessOf
     3. Kiểm soát có xử lý đúng rủi ro này không -> relevance

   Câu 3 là câu mới của đợt này. Trước đây hệ thống chỉ hỏi câu 1 và 2,
   nên một kiểm soát hoàn toàn hiệu quả vẫn có thể bị gắn nhầm vào rủi
   ro nó không hề bảo vệ mà không ai phát hiện.
   ================================================================== */

/** Yêu cầu tối thiểu của một kiểm soát để dựng được dòng bảng */
export interface AssessControlInput {
  id: string;
  code: string;
  name?: string;
  type?: string | null;
  nature?: string | null;
  frequency?: string | null;
  status?: string | null;
  unitId?: string;
  isKeyControl?: boolean;
  riskIds?: string[];
  designEffectiveness?: string | null;
  operationEffectiveness?: string | null;
  lastTestResult?: string | null;
  lastTestDate?: string | null;
}

export interface ControlAssessRow {
  id: string;
  code: string;
  name: string;

  /* --- Thuộc tính của kiểm soát --- */
  type: string;
  nature: string;
  frequency: string;
  unitId: string;
  isKeyControl: boolean;
  status: string;

  /* --- Câu 1: có đang vận hành không --- */
  operating: boolean;
  notOperatingNote?: string;

  /* --- Câu 2: có chạy tốt không --- */
  design: string;
  operation: string;
  overall: string;
  effectivenessAssessed: boolean;

  /* --- Câu 3: có xử lý đúng rủi ro này không --- */
  relevance?: ControlRelevance;
  relevanceNote: string;
  assessedAt?: string;
  assessedBy?: string;
  assessed: boolean;

  /**
   * Kiểm soát này có thực sự đang bảo vệ rủi ro không.
   *
   * Phải thoả BA điều: đang vận hành, đã có kết luận hiệu lực, và mức
   * phù hợp khác Không phù hợp. Thiếu một trong ba thì dù đã gắn liên
   * kết, kiểm soát vẫn không mang lại giá trị bảo vệ nào.
   */
  counted: boolean;

  /** Lý do bị loại, để bảng giải thích thay vì để người dùng tự đoán */
  excludeReason?: string;
}

/* ------------------------------------------------------------------ */
/* Dựng dòng bảng                                                      */
/* ------------------------------------------------------------------ */

export function buildAssessRow(
  c: AssessControlInput,
  riskId: string,
  linkIndex: Map<string, RiskControlLink>,
): ControlAssessRow {
  const operating = isControlOperating(c.status);
  const overall = overallEffectivenessOf(c);
  const effectivenessAssessed = overall !== NOT_ASSESSED;

  const link = riskId ? linkIndex.get(`${riskId}::${c.id}`) : undefined;
  const relevance = riskId ? relevanceOf(linkIndex, riskId, c.id) : undefined;

  const mismatched = relevance === "Không phù hợp";
  const counted = operating && effectivenessAssessed && !mismatched;

  let excludeReason: string | undefined;
  if (!operating) excludeReason = notOperatingReason(c.status);
  else if (!effectivenessAssessed)
    excludeReason =
      "Chưa có kết luận hiệu lực nên chưa có bằng chứng bảo vệ rủi ro";
  else if (mismatched)
    excludeReason = "Đã kết luận không phù hợp với rủi ro này, nên gỡ liên kết";

  return {
    id: c.id,
    code: c.code,
    name: c.name ?? "",

    type: c.type ?? "",
    nature: c.nature ?? "",
    frequency: c.frequency ?? "",
    unitId: c.unitId ?? "",
    isKeyControl: !!c.isKeyControl,
    status: c.status ?? "",

    operating,
    notOperatingNote: notOperatingReason(c.status),

    design: c.designEffectiveness ?? NOT_ASSESSED,
    operation: c.operationEffectiveness ?? NOT_ASSESSED,
    overall,
    effectivenessAssessed,

    relevance,
    relevanceNote: link?.relevanceNote ?? "",
    assessedAt: link?.assessedAt,
    assessedBy: link?.assessedBy,
    assessed: relevance !== undefined,

    counted,
    excludeReason,
  };
}

export function buildAssessRows(
  controls: AssessControlInput[],
  controlIds: string[],
  riskId: string,
  linkIndex: Map<string, RiskControlLink>,
): ControlAssessRow[] {
  const picked = new Set(controlIds);
  return controls
    .filter((c) => picked.has(c.id))
    .map((c) => buildAssessRow(c, riskId, linkIndex));
}

/* ------------------------------------------------------------------ */
/* Sắp xếp                                                             */
/* ------------------------------------------------------------------ */

/**
 * Chưa đánh giá lên đầu, rồi tới kiểm soát trọng yếu, rồi theo mã.
 *
 * Lý do đặt việc còn dang dở lên trên: bảng này là danh sách VIỆC PHẢI
 * LÀM chứ không phải danh sách tra cứu. Người dùng mở ra là để biết còn
 * phải kết luận cái nào.
 */
export function sortAssessRows(rows: ControlAssessRow[]): ControlAssessRow[] {
  return [...rows].sort((a, b) => {
    if (a.assessed !== b.assessed) return a.assessed ? 1 : -1;
    if (a.isKeyControl !== b.isKeyControl) return a.isKeyControl ? -1 : 1;
    return a.code.localeCompare(b.code);
  });
}

/* ------------------------------------------------------------------ */
/* Tổng hợp tiến độ                                                    */
/* ------------------------------------------------------------------ */

export interface AssessSummary {
  /** Tổng số kiểm soát đã gắn với rủi ro */
  total: number;
  /** Đã kết luận mức phù hợp */
  assessed: number;
  /** Chưa kết luận, đây là con số chặn bước 6 */
  pending: number;
  /** Thực sự đang bảo vệ rủi ro, dùng cho gợi ý điểm còn lại */
  counted: number;
  /** Đã kết luận không phù hợp, nên gỡ */
  mismatched: number;
  /** Không đang vận hành */
  notOperating: number;
  /** Chưa có kết luận hiệu lực */
  noEffectiveness: number;
  /** Kiểm soát trọng yếu trong tập */
  keyControls: number;
  /** Kiểm soát trọng yếu đang Không hiệu quả */
  failedKeyControls: number;
}

export function summarizeAssessment(rows: ControlAssessRow[]): AssessSummary {
  return {
    total: rows.length,
    assessed: rows.filter((r) => r.assessed).length,
    pending: rows.filter((r) => !r.assessed).length,
    counted: rows.filter((r) => r.counted).length,
    mismatched: rows.filter((r) => r.relevance === "Không phù hợp").length,
    notOperating: rows.filter((r) => !r.operating).length,
    noEffectiveness: rows.filter((r) => r.operating && !r.effectivenessAssessed)
      .length,
    keyControls: rows.filter((r) => r.isKeyControl).length,
    failedKeyControls: rows.filter(
      (r) => r.isKeyControl && r.overall === "Không hiệu quả",
    ).length,
  };
}

/* ------------------------------------------------------------------ */
/* Bộ lọc nhanh trong bảng                                             */
/* ------------------------------------------------------------------ */

export type AssessFilterKey =
  | "all"
  | "pending"
  | "counted"
  | "excluded"
  | "key";

export interface AssessFilterOption {
  key: AssessFilterKey;
  label: string;
  hint: string;
}

export const ASSESS_FILTERS: AssessFilterOption[] = [
  { key: "all", label: "Tất cả", hint: "Toàn bộ kiểm soát đã gắn" },
  {
    key: "pending",
    label: "Chưa đánh giá",
    hint: "Chưa kết luận có xử lý đúng rủi ro này không",
  },
  {
    key: "counted",
    label: "Đang bảo vệ",
    hint: "Đang vận hành, đã đánh giá hiệu lực và phù hợp với rủi ro",
  },
  {
    key: "excluded",
    label: "Bị loại",
    hint: "Không vận hành, chưa có kết luận hiệu lực, hoặc không phù hợp",
  },
  {
    key: "key",
    label: "Trọng yếu",
    hint: "Kiểm soát trọng yếu, không kiểm soát nào thay thế được",
  },
];

export function matchAssessFilter(
  key: AssessFilterKey,
  row: ControlAssessRow,
): boolean {
  switch (key) {
    case "pending":
      return !row.assessed;
    case "counted":
      return row.counted;
    case "excluded":
      return !row.counted;
    case "key":
      return row.isKeyControl;
    default:
      return true;
  }
}

/* ------------------------------------------------------------------ */
/* Câu tổng kết cho dải tiến độ                                        */
/* ------------------------------------------------------------------ */

export function describeAssessment(s: AssessSummary): string {
  if (s.total === 0)
    return "Chưa gắn kiểm soát nào. Tìm kiểm soát phù hợp ở phần bên dưới, hoặc tuyên bố chấp nhận rủi ro nếu không áp dụng kiểm soát nào.";

  if (s.pending > 0)
    return `Còn ${s.pending} trên ${s.total} kiểm soát chưa kết luận mức phù hợp. Đánh giá xong mới mở được bước 6, vì gợi ý điểm còn lại tính trên tập kiểm soát đã kết luận.`;

  const parts: string[] = [
    `Đã đánh giá đủ ${s.total} kiểm soát, trong đó ${s.counted} thực sự đang bảo vệ rủi ro.`,
  ];

  if (s.mismatched > 0)
    parts.push(
      `${s.mismatched} kiểm soát bị kết luận không phù hợp, nên gỡ khỏi rủi ro này.`,
    );
  if (s.notOperating > 0)
    parts.push(`${s.notOperating} kiểm soát không đang vận hành.`);
  if (s.noEffectiveness > 0)
    parts.push(
      `${s.noEffectiveness} kiểm soát chưa có kết luận hiệu lực nên chưa được tính.`,
    );
  if (s.failedKeyControls > 0)
    parts.push(
      `Có ${s.failedKeyControls} kiểm soát trọng yếu đang Không hiệu quả, đây là khe hở lớn cần nêu ở bước Điểm yếu.`,
    );

  return parts.join(" ");
}
