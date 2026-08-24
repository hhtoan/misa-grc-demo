/* ==================================================================
   Tiện ích cây phân cấp.

   File THUẦN LOGIC: không import React, không import schema, không đọc
   repo. Nhận vào một mảng phẳng có id và parentId, trả về cây cùng các
   phép tra cứu thường dùng.

   Nhờ vậy dùng chung được cho danh mục rủi ro, danh mục sự kiện, và cây
   đơn vị (unitSchema cũng có parentId), mà không phải viết lại.

   Ba tình huống dữ liệu xấu đều được xử lý thay vì để vỡ trang:
     1. parentId trỏ tới id không tồn tại  -> coi như nút gốc
     2. parentId trỏ vào chính nó          -> coi như nút gốc
     3. Vòng lặp cha con (A -> B -> A)     -> cắt vòng, giữ nút ở gốc
   ================================================================== */

/** Yêu cầu tối thiểu của một phần tử để dựng được cây */
export interface TreeItemBase {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface TreeNode<T extends TreeItemBase = TreeItemBase> {
  id: string;
  label: string;
  parentId: string | null;
  /** Độ sâu, nút gốc là 0 */
  level: number;
  children: TreeNode<T>[];
  /** Bản ghi gốc, giữ nguyên để nơi gọi đọc thêm trường riêng */
  data: T;
}

/** Bảng tra nhanh theo id, dùng cho mọi phép đi ngược lên cha */
export type TreeIndex<T extends TreeItemBase = TreeItemBase> = Map<
  string,
  TreeNode<T>
>;

/** Giới hạn độ sâu, chặn vòng lặp vô hạn khi dữ liệu hỏng */
const MAX_DEPTH = 12;

/* ------------------------------------------------------------------ */
/* Dựng cây                                                            */
/* ------------------------------------------------------------------ */

/**
 * Dựng cây từ mảng phẳng.
 *
 * Trả về danh sách nút gốc. Con của mỗi nút được sắp theo tên để thứ tự
 * hiển thị ổn định, không phụ thuộc thứ tự lưu trong localStorage.
 */
export function buildTree<T extends TreeItemBase>(items: T[]): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>();

  items.forEach((item) => {
    nodes.set(item.id, {
      id: item.id,
      label: item.name,
      parentId: null,
      level: 0,
      children: [],
      data: item,
    });
  });

  const roots: TreeNode<T>[] = [];

  items.forEach((item) => {
    const node = nodes.get(item.id);
    if (!node) return;

    const parentId = item.parentId ?? null;

    /* Nút gốc, cha không tồn tại, hoặc tự trỏ vào chính mình */
    if (!parentId || parentId === item.id || !nodes.has(parentId)) {
      roots.push(node);
      return;
    }

    /* Chặn vòng lặp: nếu đi ngược từ cha mà gặp lại chính nút này thì
       quan hệ cha con đang tạo thành vòng, bỏ quan hệ đó đi */
    if (hasAncestorLoop(item.id, parentId, items)) {
      roots.push(node);
      return;
    }

    node.parentId = parentId;
    nodes.get(parentId)?.children.push(node);
  });

  const byName = (a: TreeNode<T>, b: TreeNode<T>) =>
    a.label.localeCompare(b.label, "vi");

  function assignLevel(list: TreeNode<T>[], level: number) {
    list.sort(byName);
    list.forEach((n) => {
      n.level = level;
      assignLevel(n.children, level + 1);
    });
  }

  assignLevel(roots, 0);
  return roots;
}

/** Đi ngược từ startParent lên gốc, xem có gặp lại selfId không */
function hasAncestorLoop<T extends TreeItemBase>(
  selfId: string,
  startParent: string,
  items: T[],
): boolean {
  const parentOf = new Map<string, string | null>();
  items.forEach((i) => parentOf.set(i.id, i.parentId ?? null));

  let cursor: string | null = startParent;
  let depth = 0;

  while (cursor && depth < MAX_DEPTH) {
    if (cursor === selfId) return true;
    cursor = parentOf.get(cursor) ?? null;
    depth += 1;
  }

  return depth >= MAX_DEPTH;
}

/** Bảng tra theo id, gồm cả nút con ở mọi cấp */
export function indexTree<T extends TreeItemBase>(
  roots: TreeNode<T>[],
): TreeIndex<T> {
  const map: TreeIndex<T> = new Map();

  function walk(list: TreeNode<T>[]) {
    list.forEach((n) => {
      map.set(n.id, n);
      walk(n.children);
    });
  }

  walk(roots);
  return map;
}

/* ------------------------------------------------------------------ */
/* Duyệt và làm phẳng                                                  */
/* ------------------------------------------------------------------ */

/** Toàn bộ nút theo thứ tự hiển thị, không quan tâm đóng mở */
export function flattenTree<T extends TreeItemBase>(
  roots: TreeNode<T>[],
): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];

  function walk(list: TreeNode<T>[]) {
    list.forEach((n) => {
      out.push(n);
      walk(n.children);
    });
  }

  walk(roots);
  return out;
}

/**
 * Chỉ những nút đang nhìn thấy, tức là mọi tổ tiên đều đang mở.
 * Dùng khi muốn render danh sách phẳng thay vì đệ quy.
 */
export function visibleNodes<T extends TreeItemBase>(
  roots: TreeNode<T>[],
  expanded: Set<string>,
): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];

  function walk(list: TreeNode<T>[]) {
    list.forEach((n) => {
      out.push(n);
      if (n.children.length > 0 && expanded.has(n.id)) walk(n.children);
    });
  }

  walk(roots);
  return out;
}

/* ------------------------------------------------------------------ */
/* Tra cứu quan hệ                                                     */
/* ------------------------------------------------------------------ */

/** Đường đi từ gốc xuống tới nút, gồm cả chính nút đó */
export function pathOf<T extends TreeItemBase>(
  id: string | null | undefined,
  index: TreeIndex<T>,
): TreeNode<T>[] {
  if (!id) return [];

  const out: TreeNode<T>[] = [];
  let cursor = index.get(id);
  let depth = 0;

  while (cursor && depth < MAX_DEPTH) {
    out.unshift(cursor);
    cursor = cursor.parentId ? index.get(cursor.parentId) : undefined;
    depth += 1;
  }

  return out;
}

/** Nhãn đầy đủ dạng "Cha › Con › Cháu" */
export function pathLabelOf<T extends TreeItemBase>(
  id: string | null | undefined,
  index: TreeIndex<T>,
  separator = " › ",
): string {
  return pathOf(id, index)
    .map((n) => n.label)
    .join(separator);
}

/** Id của mọi tổ tiên, từ cha gần nhất lên tới gốc */
export function ancestorIdsOf<T extends TreeItemBase>(
  id: string | null | undefined,
  index: TreeIndex<T>,
): string[] {
  return pathOf(id, index)
    .slice(0, -1)
    .map((n) => n.id)
    .reverse();
}

/** Id của mọi con cháu, không gồm chính nó */
export function descendantIdsOf<T extends TreeItemBase>(
  id: string,
  index: TreeIndex<T>,
): string[] {
  const node = index.get(id);
  if (!node) return [];

  const out: string[] = [];

  function walk(list: TreeNode<T>[]) {
    list.forEach((n) => {
      out.push(n.id);
      walk(n.children);
    });
  }

  walk(node.children);
  return out;
}

/** Id của chính nó cộng toàn bộ con cháu, dùng khi lọc theo nhánh */
export function branchIdsOf<T extends TreeItemBase>(
  id: string,
  index: TreeIndex<T>,
): string[] {
  return [id, ...descendantIdsOf(id, index)];
}

export function isLeaf<T extends TreeItemBase>(node: TreeNode<T>): boolean {
  return node.children.length === 0;
}

/* ------------------------------------------------------------------ */
/* Tìm kiếm                                                            */
/* ------------------------------------------------------------------ */

/**
 * Lọc cây theo vị từ, GIỮ LẠI TỔ TIÊN của nút khớp.
 *
 * Nếu chỉ giữ nút khớp thì cây bị vỡ cấu trúc và người dùng không biết
 * nút đó nằm ở nhánh nào. Giữ tổ tiên tốn thêm vài dòng nhưng kết quả
 * tìm kiếm vẫn đọc được theo ngữ cảnh.
 */
export function filterTree<T extends TreeItemBase>(
  roots: TreeNode<T>[],
  predicate: (node: TreeNode<T>) => boolean,
): TreeNode<T>[] {
  function walk(list: TreeNode<T>[]): TreeNode<T>[] {
    const out: TreeNode<T>[] = [];

    list.forEach((n) => {
      const keptChildren = walk(n.children);
      if (predicate(n) || keptChildren.length > 0)
        out.push({ ...n, children: keptChildren });
    });

    return out;
  }

  return walk(roots);
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phụ thuộc dấu */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** Lọc theo từ khoá, so cả tên và mô tả nếu có */
export function searchTree<T extends TreeItemBase & { description?: string }>(
  roots: TreeNode<T>[],
  keyword: string,
): TreeNode<T>[] {
  const kw = normalizeText(keyword);
  if (!kw) return roots;

  return filterTree(roots, (n) =>
    normalizeText(`${n.label} ${n.data.description ?? ""}`).includes(kw),
  );
}

/* ------------------------------------------------------------------ */
/* Cờ thừa hưởng theo nhánh                                            */
/* ------------------------------------------------------------------ */

/**
 * Nút nào trong đường đi đang bật một cờ boolean.
 *
 * Trả về nút Ở GẦN GỐC NHẤT có cờ bật, vì đó mới là nút đại diện cho cả
 * nhánh. Nếu trả về nút gần nhất thì thông báo cho người dùng sẽ nêu tên
 * một danh mục con, không nói được chính sách đang áp từ đâu.
 */
export function inheritedFlagSourceOf<T extends TreeItemBase>(
  id: string | null | undefined,
  index: TreeIndex<T>,
  flagOf: (item: T) => boolean | undefined,
): TreeNode<T> | undefined {
  return pathOf(id, index).find((n) => flagOf(n.data) === true);
}

/** Nút này hoặc một tổ tiên của nó có bật cờ không */
export function hasInheritedFlag<T extends TreeItemBase>(
  id: string | null | undefined,
  index: TreeIndex<T>,
  flagOf: (item: T) => boolean | undefined,
): boolean {
  return inheritedFlagSourceOf(id, index, flagOf) !== undefined;
}
