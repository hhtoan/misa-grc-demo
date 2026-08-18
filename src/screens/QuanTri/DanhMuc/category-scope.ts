/* ==================================================================
   Dự án dùng CHUNG một categoryRepo cho nhóm rủi ro và nhóm sự kiện.
   File này tự dò cách phân loại để hai tab hiển thị đúng phần của mình,
   không phụ thuộc vào tên trường cụ thể trong schema.
   ================================================================== */

export type ScopeKind = "risk" | "event";

export interface AnyCategory {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  description?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

/** Các tên trường có thể mang ý nghĩa phân loại */
const TYPE_FIELDS = [
  "type",
  "categoryType",
  "kind",
  "module",
  "scope",
  "group",
  "domain",
] as const;

const RISK_HINTS = ["risk", "rui ro", "rủi ro", "rui-ro", "ruiro"];
const EVENT_HINTS = ["event", "su kien", "sự kiện", "su-kien", "sukien"];

const RISK_PREFIX = ["rr", "risk", "ro"];
const EVENT_PREFIX = ["sk", "evt", "event"];

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function hit(value: string, hints: string[]): boolean {
  return hints.some((h) => value.includes(h));
}

function prefixOf(code: string): string {
  const m = code.trim().toLowerCase().split(/[-_ ]/)[0];
  return m ?? "";
}

export interface ScopeResolver {
  /** Cách nhận diện đang dùng, chỉ để hiển thị ghi chú */
  strategy: "field" | "prefix" | "usage" | "none";
  /** Tên trường phân loại nếu tìm được */
  field?: string;
  /** Giá trị cần gán khi tạo mới, để bản ghi mới vào đúng tab */
  createPatch: Record<string, unknown>;
  /** Nhóm này thuộc phạm vi đang xét hay không */
  match: (c: AnyCategory) => boolean;
  /** Nhóm chưa xác định được loại, đang hiện ở cả hai tab */
  isAmbiguous: (c: AnyCategory) => boolean;
}

/**
 * @param records  toàn bộ danh mục trong repo dùng chung
 * @param kind     phạm vi cần lọc
 * @param usedIds  id nhóm đang được bản ghi nghiệp vụ của phạm vi này tham chiếu
 * @param otherIds id nhóm đang được bản ghi nghiệp vụ của phạm vi kia tham chiếu
 */
export function resolveScope(
  records: AnyCategory[],
  kind: ScopeKind,
  usedIds: Set<string>,
  otherIds: Set<string>,
): ScopeResolver {
  const mine = kind === "risk" ? RISK_HINTS : EVENT_HINTS;
  const theirs = kind === "risk" ? EVENT_HINTS : RISK_HINTS;

  /* ---------- Lớp 1: tìm trường phân loại ---------- */
  for (const field of TYPE_FIELDS) {
    const values = new Set<string>();
    records.forEach((c) => {
      const v = norm(c[field]);
      if (v) values.add(v);
    });
    if (values.size < 2) continue;

    const list = [...values];
    const hasMine = list.some((v) => hit(v, mine));
    const hasTheirs = list.some((v) => hit(v, theirs));
    if (!hasMine || !hasTheirs) continue;

    const myValue = list.find((v) => hit(v, mine)) ?? "";

    return {
      strategy: "field",
      field,
      createPatch: { [field]: myValue },
      match: (c) => hit(norm(c[field]), mine),
      isAmbiguous: () => false,
    };
  }

  /* ---------- Lớp 2: tiền tố mã ---------- */
  const myPrefix = kind === "risk" ? RISK_PREFIX : EVENT_PREFIX;
  const theirPrefix = kind === "risk" ? EVENT_PREFIX : RISK_PREFIX;

  const prefixSeen = new Set(records.map((c) => prefixOf(c.code)));
  const prefixWorks =
    myPrefix.some((p) => prefixSeen.has(p)) &&
    theirPrefix.some((p) => prefixSeen.has(p));

  if (prefixWorks) {
    return {
      strategy: "prefix",
      createPatch: {},
      match: (c) => myPrefix.includes(prefixOf(c.code)),
      isAmbiguous: (c) =>
        !myPrefix.includes(prefixOf(c.code)) &&
        !theirPrefix.includes(prefixOf(c.code)),
    };
  }

  /* ---------- Lớp 3: dựa vào bản ghi đang tham chiếu ---------- */
  if (usedIds.size > 0 || otherIds.size > 0) {
    return {
      strategy: "usage",
      createPatch: {},
      match: (c) => usedIds.has(c.id) || !otherIds.has(c.id),
      isAmbiguous: (c) => !usedIds.has(c.id) && !otherIds.has(c.id),
    };
  }

  /* ---------- Không nhận ra: hiện tất cả ---------- */
  return {
    strategy: "none",
    createPatch: {},
    match: () => true,
    isAmbiguous: () => true,
  };
}

export const SCOPE_NOTE: Record<ScopeResolver["strategy"], string> = {
  field:
    "Hệ thống dùng chung một danh mục cho cả rủi ro và sự kiện, tab này đang lọc theo trường phân loại có sẵn trong dữ liệu.",
  prefix:
    "Hệ thống dùng chung một danh mục, tab này đang lọc theo tiền tố mã nhóm. Nên đặt mã theo quy ước thống nhất để phân loại luôn đúng.",
  usage:
    "Danh mục dùng chung chưa có trường phân loại, tab này đang suy ra theo bản ghi đang tham chiếu. Nhóm chưa được dùng ở đâu sẽ hiện ở cả hai tab.",
  none: "Danh mục dùng chung chưa phân biệt được loại, tab này đang hiển thị toàn bộ nhóm.",
};
