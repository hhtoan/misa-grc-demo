"use client";

import { useMemo } from "react";
import { categoryRepo, useCollection } from "@/lib/db";
import type { Category } from "@/lib/domain/schema";
import {
  buildTree,
  indexTree,
  inheritedFlagSourceOf,
  pathLabelOf,
  pathOf,
  type TreeIndex,
  type TreeNode,
} from "./tree-utils";

/* ==================================================================
   Cây danh mục rủi ro, kèm chính sách không khoan nhượng theo nhánh.

   Đặt riêng khỏi lookups.ts vì hai lý do:
     1. lookups.ts đang trả về danh sách phẳng cho Select, còn ở đây cần
        cấu trúc cây cùng các phép tra theo nhánh
     2. Không đụng vào file đang chạy ổn ở 12 màn hình khác

   Quy tắc nghiệp vụ cốt lõi của file này:

   RỦI RO KHÔNG KHOAN NHƯỢNG LÀ THUỘC TÍNH CỦA DANH MỤC, KHÔNG PHẢI
   LỰA CHỌN CỦA NGƯỜI KHAI BÁO.

   Trước đây người khai báo tự bật cờ ở từng rủi ro, nên hai người khai
   cùng một loại rủi ro có thể ra hai kết luận khác nhau. Đưa cờ lên
   danh mục thì chính sách được đặt một lần bởi Ban QTRR, và mọi rủi ro
   thuộc nhánh đó đều tuân theo.
   ================================================================== */

export type CategoryNode = TreeNode<Category>;

export interface CategoryTree {
  /** Cây danh mục rủi ro, chỉ gồm group = "Rủi ro" */
  tree: CategoryNode[];
  index: TreeIndex<Category>;

  /** Nhãn đầy đủ dạng "Tài chính › Gian lận › Gian lận nội bộ" */
  pathLabel: (id: string | null | undefined) => string;

  /** Danh mục này thuộc nhánh không khoan nhượng không */
  isZeroTolerance: (id: string | null | undefined) => boolean;

  /**
   * Tên nhánh đang áp chính sách không khoan nhượng.
   * Trả về undefined khi danh mục không thuộc nhánh nào.
   */
  zeroToleranceBranchName: (
    id: string | null | undefined,
  ) => string | undefined;

  /** Có danh mục nào được đánh dấu chưa, dùng để ẩn phần giải thích */
  hasAnyZeroToleranceBranch: boolean;
}

/** Đọc cờ, viết một chỗ để đổi tên trường chỉ phải sửa tại đây */
export function zeroToleranceFlagOf(c: Category): boolean | undefined {
  return c.isZeroToleranceBranch;
}

export function useCategoryTree(
  group: "Rủi ro" | "Sự kiện" = "Rủi ro",
): CategoryTree {
  const categories = useCollection(categoryRepo) as unknown as Category[];

  return useMemo(() => {
    /* Trường group không đáng tin trong dữ liệu hiện có: repo.create chỉ
       spread input nên .default("Rủi ro") của schema vô hiệu, và bản ghi
       cũ có thể thiếu hẳn trường này.

       Chiến lược: nếu KHÔNG bản ghi nào khai group thì coi toàn bộ danh
       mục thuộc nhóm đang xem, thay vì trả về mảng rỗng làm ô chọn nhóm
       rủi ro trắng trơn. Có ít nhất 1 bản ghi khai group thì lọc bình
       thường, và bản ghi thiếu group được coi là "Rủi ro". */
    const anyTagged = categories.some((c) => !!c.group);
    const scoped = anyTagged
      ? categories.filter((c) => (c.group ?? "Rủi ro") === group)
      : categories;

    const tree = buildTree(scoped);
    const index = indexTree(tree);

    return {
      tree,
      index,

      pathLabel: (id) => pathLabelOf(id, index),

      isZeroTolerance: (id) =>
        inheritedFlagSourceOf(id, index, zeroToleranceFlagOf) !== undefined,

      zeroToleranceBranchName: (id) =>
        inheritedFlagSourceOf(id, index, zeroToleranceFlagOf)?.label,

      hasAnyZeroToleranceBranch: scoped.some(
        (c) => c.isZeroToleranceBranch === true,
      ),
    };
  }, [categories, group]);
}

/* ------------------------------------------------------------------ */
/* Chuyển sang dữ liệu cho TreeSelect                                  */
/* ------------------------------------------------------------------ */

export interface TreeSelectNode {
  id: string;
  label: string;
  description?: string;
  parentId: string | null;
  level: number;
  children: TreeSelectNode[];
  /** Nhãn nhỏ hiện cạnh tên, ví dụ cảnh báo không khoan nhượng */
  flag?: { label: string; tone: "danger" | "warning" | "brand" | "neutral" };
  disabled?: boolean;
}

/**
 * Đổi cây danh mục sang dữ liệu hiển thị.
 *
 * Nút tự bật cờ có nhãn "Không khoan nhượng", nút thừa hưởng từ cha có
 * nhãn "Thừa hưởng" nhạt hơn. Phân biệt hai loại giúp người quản trị
 * biết mình đang bật ở đâu, tránh bật trùng ở cả cha lẫn con.
 */
export function toTreeSelectNodes(
  nodes: CategoryNode[],
  inheritedFromParent = false,
): TreeSelectNode[] {
  return nodes.map((n) => {
    const own = n.data.isZeroToleranceBranch === true;
    const inherited = inheritedFromParent && !own;

    return {
      id: n.id,
      label: n.label,
      description: n.data.description || undefined,
      parentId: n.parentId,
      level: n.level,
      children: toTreeSelectNodes(n.children, own || inheritedFromParent),
      flag: own
        ? { label: "Không khoan nhượng", tone: "danger" as const }
        : inherited
          ? { label: "Thừa hưởng", tone: "warning" as const }
          : undefined,
    };
  });
}

/** Tìm một nút trong cây hiển thị theo id */
export function findTreeSelectNode(
  nodes: TreeSelectNode[],
  id: string | null | undefined,
): TreeSelectNode | undefined {
  if (!id) return undefined;

  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findTreeSelectNode(n.children, id);
    if (found) return found;
  }

  return undefined;
}

/** Đường đi tới một nút trong cây hiển thị, dùng để tự mở nhánh */
export function treeSelectPathIds(
  nodes: TreeSelectNode[],
  id: string | null | undefined,
): string[] {
  if (!id) return [];

  function walk(list: TreeSelectNode[], trail: string[]): string[] | undefined {
    for (const n of list) {
      const next = [...trail, n.id];
      if (n.id === id) return next;
      const found = walk(n.children, next);
      if (found) return found;
    }
    return undefined;
  }

  return walk(nodes, []) ?? [];
}
