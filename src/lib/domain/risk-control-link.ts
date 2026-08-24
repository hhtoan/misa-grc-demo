"use client";

import { useMemo } from "react";
import { riskControlLinkRepo, useCollection } from "@/lib/db";
import {
  CONTROL_OPERATING_STATUSES,
  CONTROL_RELEVANCE,
  type ControlRelevance,
} from "./enums";
import type { RiskControlLink } from "./schema";

/* ==================================================================
   Thuộc tính của quan hệ Rủi ro và Kiểm soát.

   Câu hỏi mà file này trả lời:

       "Kiểm soát X có xử lý đúng rủi ro Y không"

   Khác hẳn câu hỏi mà control-utils.ts trả lời:

       "Kiểm soát X có đang chạy tốt không"

   Một kiểm soát đối chiếu công nợ hoàn toàn hiệu quả vẫn có thể bị gắn
   nhầm vào rủi ro gián đoạn hệ thống. Hiệu lực của nó không nói gì về
   việc nó có bảo vệ rủi ro đó hay không.
   ================================================================== */

/* ------------------------------------------------------------------ */
/* Tuỳ chọn cho giao diện                                              */
/* ------------------------------------------------------------------ */

const RELEVANCE_DESC: Record<string, string> = {
  "Phù hợp": "Kiểm soát này xử lý trực tiếp nguyên nhân hoặc hệ quả của rủi ro",
  "Phù hợp một phần":
    "Chỉ che được một phần rủi ro, còn khe hở phải bù bằng kiểm soát khác",
  "Không phù hợp":
    "Không xử lý rủi ro này, nên gỡ liên kết hoặc thay bằng kiểm soát khác",
};

/** Sinh từ enum để không bao giờ lệch giá trị làm z.enum chặn lưu */
export const RELEVANCE_OPTIONS = CONTROL_RELEVANCE.map((v) => ({
  value: v,
  label: v,
  description: RELEVANCE_DESC[v] ?? "",
}));

/**
 * Hệ số che phủ, dùng khi tính gợi ý điểm rủi ro còn lại ở E4.
 *
 * Không phù hợp cho hệ số 0, tức là loại hẳn khỏi phép tính. Một kiểm
 * soát không xử lý rủi ro này thì dù hiệu quả tới đâu cũng không làm
 * giảm rủi ro đó, nên cho nó tiếng nói dù nhỏ vẫn là sai về bản chất.
 */
export const RELEVANCE_WEIGHT: Record<string, number> = {
  "Phù hợp": 1,
  "Phù hợp một phần": 0.6,
  "Không phù hợp": 0,
};

/* ------------------------------------------------------------------ */
/* Kiểm soát có đang vận hành không                                    */
/* ------------------------------------------------------------------ */

const OPERATING = new Set<string>(CONTROL_OPERATING_STATUSES);

/**
 * Kiểm soát đang thực sự vận hành chưa.
 *
 * Nháp và Chờ duyệt thì chưa phê duyệt. Tạm ngưng và Hết hiệu lực thì
 * đã ngừng chạy. Cả bốn đều không bảo vệ rủi ro tại thời điểm này.
 */
export function isControlOperating(status?: string | null): boolean {
  return OPERATING.has(status ?? "");
}

/** Câu giải thích vì sao một kiểm soát chưa được tính */
export function notOperatingReason(status?: string | null): string | undefined {
  if (isControlOperating(status)) return undefined;

  switch (status) {
    case "Nháp":
    case "Chờ duyệt":
      return "Chưa phê duyệt nên chưa được tính là đang bảo vệ rủi ro";
    case "Tạm ngưng":
      return "Đang tạm ngưng vận hành nên không bảo vệ rủi ro ở thời điểm này";
    case "Hết hiệu lực":
      return "Đã hết hiệu lực, cần thay bằng kiểm soát khác";
    default:
      return "Chưa xác định được trạng thái vận hành";
  }
}

/* ------------------------------------------------------------------ */
/* Tra cứu bản ghi liên kết                                            */
/* ------------------------------------------------------------------ */

export function linkKeyOf(riskId: string, controlId: string): string {
  return `${riskId}::${controlId}`;
}

export function indexLinks(
  links: RiskControlLink[],
): Map<string, RiskControlLink> {
  const map = new Map<string, RiskControlLink>();
  links.forEach((l) => map.set(linkKeyOf(l.riskId, l.controlId), l));
  return map;
}

export function findLink(
  index: Map<string, RiskControlLink>,
  riskId: string,
  controlId: string,
): RiskControlLink | undefined {
  return index.get(linkKeyOf(riskId, controlId));
}

export function relevanceOf(
  index: Map<string, RiskControlLink>,
  riskId: string,
  controlId: string,
): ControlRelevance | undefined {
  return findLink(index, riskId, controlId)?.relevance;
}

/** Kiểm soát này đã được kết luận mức phù hợp với rủi ro đó chưa */
export function isRelevanceAssessed(
  index: Map<string, RiskControlLink>,
  riskId: string,
  controlId: string,
): boolean {
  return relevanceOf(index, riskId, controlId) !== undefined;
}

/** Đếm số kiểm soát đã kết luận, dùng cho cổng chặn bước 4 */
export function assessedCountOf(
  index: Map<string, RiskControlLink>,
  riskId: string,
  controlIds: string[],
): number {
  return controlIds.filter((cid) => isRelevanceAssessed(index, riskId, cid))
    .length;
}

/** Kiểm soát bị kết luận Không phù hợp, nên gỡ liên kết */
export function mismatchedControlIds(
  index: Map<string, RiskControlLink>,
  riskId: string,
  controlIds: string[],
): string[] {
  return controlIds.filter(
    (cid) => relevanceOf(index, riskId, cid) === "Không phù hợp",
  );
}

/* ------------------------------------------------------------------ */
/* Hook dùng ở màn hình                                                */
/* ------------------------------------------------------------------ */

export interface RiskControlLinkApi {
  links: RiskControlLink[];
  index: Map<string, RiskControlLink>;
  relevanceOf: (controlId: string) => ControlRelevance | undefined;
  noteOf: (controlId: string) => string;
  isAssessed: (controlId: string) => boolean;
  assessedCount: (controlIds: string[]) => number;
}

/**
 * Đọc liên kết của MỘT rủi ro.
 *
 * Truyền riskId rỗng khi rủi ro chưa được tạo, hook vẫn chạy an toàn và
 * trả về tập rỗng, không cần nhánh điều kiện ở nơi gọi.
 */
export function useRiskControlLinks(riskId: string): RiskControlLinkApi {
  const all = useCollection(
    riskControlLinkRepo,
  ) as unknown as RiskControlLink[];

  return useMemo(() => {
    const links = riskId ? all.filter((l) => l.riskId === riskId) : [];
    const index = indexLinks(links);

    return {
      links,
      index,
      relevanceOf: (cid) => relevanceOf(index, riskId, cid),
      noteOf: (cid) => findLink(index, riskId, cid)?.relevanceNote ?? "",
      isAssessed: (cid) => isRelevanceAssessed(index, riskId, cid),
      assessedCount: (cids) => assessedCountOf(index, riskId, cids),
    };
  }, [all, riskId]);
}

/* ------------------------------------------------------------------ */
/* Ghi bản ghi liên kết                                                */
/* ------------------------------------------------------------------ */

export interface LinkRepoLike {
  create: (
    value: Record<string, unknown>,
    by?: string,
  ) => { id: string; code: string };
  update: (id: string, patch: Record<string, unknown>) => void;
  remove?: (id: string) => boolean | void;
}

export interface UpsertLinkInput {
  riskId: string;
  controlId: string;
  relevance: ControlRelevance;
  relevanceNote?: string;
  assessedBy: string;
}

/**
 * Ghi kết luận mức phù hợp.
 *
 * KHAI ĐỦ MỌI TRƯỜNG khi tạo mới, không trông vào .default() của schema.
 * createRepository chỉ spread input rồi gán id, code và mốc thời gian,
 * không parse qua zod, nên trường thiếu sẽ là undefined và gây crash ở
 * màn hình đọc, đúng như lỗi tags.length đã gặp.
 */
export function upsertRiskControlLink(
  repo: LinkRepoLike,
  existing: RiskControlLink | undefined,
  input: UpsertLinkInput,
): void {
  const today = new Date().toISOString().slice(0, 10);

  const payload = {
    riskId: input.riskId,
    controlId: input.controlId,
    relevance: input.relevance,
    relevanceNote: input.relevanceNote ?? "",
    assessedAt: today,
    assessedBy: input.assessedBy,
  };

  if (existing) repo.update(existing.id, payload);
  else repo.create(payload, input.assessedBy);
}

/** Gỡ kết luận khi người dùng bỏ chọn kiểm soát khỏi rủi ro */
export function removeRiskControlLink(
  repo: LinkRepoLike,
  existing: RiskControlLink | undefined,
): void {
  if (!existing || !repo.remove) return;
  repo.remove(existing.id);
}

/** Gỡ toàn bộ liên kết của một rủi ro, dùng khi huỷ nháp ở E2c */
export function removeAllLinksOfRisk(
  repo: LinkRepoLike,
  links: RiskControlLink[],
  riskId: string,
): number {
  if (!repo.remove) return 0;

  const target = links.filter((l) => l.riskId === riskId);
  target.forEach((l) => repo.remove?.(l.id));
  return target.length;
}
