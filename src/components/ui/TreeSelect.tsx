"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";

/* ==================================================================
   Ô chọn một giá trị từ cây phân cấp.

   Vì sao không mở rộng Select đang có: Select nhận danh sách phẳng và
   hiển thị theo một cấp. Cây danh mục cần đóng mở nhánh, hiện đường dẫn
   đầy đủ của giá trị đã chọn, và tìm kiếm phải giữ lại tổ tiên của nút
   khớp. Ba việc đó đủ khác để tách thành component riêng, thay vì nhồi
   thêm nhánh điều kiện vào một component đang dùng ở nhiều màn hình.

   Component KHÔNG phụ thuộc domain: nhận vào cây đã dựng sẵn, nên dùng
   được cho danh mục rủi ro, danh mục sự kiện và cây đơn vị.
   ================================================================== */

export interface TreeSelectOptionNode {
  id: string;
  label: string;
  description?: string;
  parentId: string | null;
  level: number;
  children: TreeSelectOptionNode[];
  flag?: { label: string; tone: "danger" | "warning" | "brand" | "neutral" };
  disabled?: boolean;
}

export interface TreeSelectProps {
  label?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  clearable?: boolean;

  options: TreeSelectOptionNode[];
  value: string | null;
  onChange: (id: string | null) => void;

  /**
   * Có cho chọn nút cha không.
   *
   * Mặc định cho chọn, vì danh mục rủi ro của nhiều tổ chức dùng cả cấp
   * cha lẫn cấp con. Đặt "leaf" khi muốn ép người dùng đi tới cấp cuối.
   */
  selectable?: "all" | "leaf";

  /** Chiều cao tối đa của vùng danh sách, mặc định 280 */
  maxHeight?: number;

  /** Bật thì hiện đường dẫn đầy đủ ở nút bấm thay vì chỉ tên */
  showPath?: boolean;
}

const FLAG_TONE: Record<string, string> = {
  danger: "bg-lv-critical-bg text-lv-critical-text",
  warning: "bg-lv-medium-bg text-lv-medium-text",
  brand: "bg-brand-light text-brand",
  neutral: "bg-surface-alt text-text-secondary",
};

/* ------------------------------------------------------------------ */
/* Tiện ích cục bộ                                                     */
/* ------------------------------------------------------------------ */

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** Lọc cây theo từ khoá, giữ tổ tiên của nút khớp */
function filterNodes(
  nodes: TreeSelectOptionNode[],
  keyword: string,
): TreeSelectOptionNode[] {
  const kw = normalize(keyword);
  if (!kw) return nodes;

  const out: TreeSelectOptionNode[] = [];

  nodes.forEach((n) => {
    const kept = filterNodes(n.children, keyword);
    const hit = normalize(`${n.label} ${n.description ?? ""}`).includes(kw);
    if (hit || kept.length > 0) out.push({ ...n, children: kept });
  });

  return out;
}

function collectIds(nodes: TreeSelectOptionNode[]): string[] {
  const out: string[] = [];

  function walk(list: TreeSelectOptionNode[]) {
    list.forEach((n) => {
      out.push(n.id);
      walk(n.children);
    });
  }

  walk(nodes);
  return out;
}

function findNode(
  nodes: TreeSelectOptionNode[],
  id: string | null,
): TreeSelectOptionNode | undefined {
  if (!id) return undefined;

  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }

  return undefined;
}

/** Đường đi tới một nút, dùng để tự mở nhánh khi mở danh sách */
function pathIdsOf(nodes: TreeSelectOptionNode[], id: string | null): string[] {
  if (!id) return [];

  function walk(
    list: TreeSelectOptionNode[],
    trail: string[],
  ): string[] | undefined {
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

function labelPathOf(
  nodes: TreeSelectOptionNode[],
  id: string | null,
): string[] {
  const ids = pathIdsOf(nodes, id);
  return ids
    .map((x) => findNode(nodes, x)?.label ?? "")
    .filter((x) => x !== "");
}

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export function TreeSelect({
  label,
  required = false,
  placeholder = "Chọn giá trị",
  hint,
  error,
  disabled = false,
  clearable = false,
  options,
  value,
  onChange,
  selectable = "all",
  maxHeight = 280,
  showPath = true,
}: TreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => findNode(options, value), [options, value]);
  const selectedPath = useMemo(
    () => labelPathOf(options, value),
    [options, value],
  );

  /* Khi tìm kiếm thì mở hết nhánh còn lại, nếu không người dùng phải tự
     bấm mở từng cấp mới thấy kết quả nằm sâu */
  const visibleTree = useMemo(
    () => filterNodes(options, keyword),
    [options, keyword],
  );

  const forceExpandAll = keyword.trim() !== "";

  /* --------------------------- Đóng mở ---------------------------- */

  useEffect(() => {
    if (!open) return;

    function onClickOutside(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }

    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function openPanel() {
    if (disabled) return;

    /* Mở sẵn đường đi tới giá trị đang chọn, để người dùng thấy ngay
       mình đang ở đâu trong cây thay vì nhìn một danh sách gốc */
    setExpanded((prev) => {
      const next = new Set(prev);
      pathIdsOf(options, value).forEach((id) => next.add(id));
      return next;
    });

    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pick(node: TreeSelectOptionNode) {
    if (node.disabled) return;
    if (selectable === "leaf" && node.children.length > 0) {
      toggleExpand(node.id);
      return;
    }

    onChange(node.id);
    setOpen(false);
    setKeyword("");
  }

  function expandAll() {
    setExpanded(new Set(collectIds(options)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  /* ---------------------------- Render ---------------------------- */

  function renderNode(node: TreeSelectOptionNode) {
    const hasChildren = node.children.length > 0;
    const isOpen = forceExpandAll || expanded.has(node.id);
    const active = node.id === value;
    const notSelectable =
      node.disabled || (selectable === "leaf" && hasChildren);

    return (
      <div key={node.id} className="flex flex-col">
        <div
          className={cn(
            "flex items-center gap-1 rounded-ctrl pr-2 transition-colors",
            active ? "bg-brand-light" : "hover:bg-[#FAFAFA]",
          )}
          style={{ paddingLeft: 4 + node.level * 16 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ctrl text-icon-neutral hover:bg-surface-alt"
              aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
            >
              {isOpen ? (
                <IconChevronDown size={14} />
              ) : (
                <IconChevronRight size={14} />
              )}
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" />
          )}

          <button
            type="button"
            onClick={() => pick(node)}
            disabled={node.disabled}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left",
              notSelectable && "cursor-default",
              node.disabled && "opacity-50",
            )}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[13px]",
                  active
                    ? "font-medium text-brand"
                    : notSelectable
                      ? "text-text-secondary"
                      : "text-text-primary",
                )}
              >
                {node.label}
              </span>
              {node.description && (
                <span className="block truncate text-[11px] text-text-hint">
                  {node.description}
                </span>
              )}
            </span>

            {node.flag && (
              <span
                className={cn(
                  "shrink-0 rounded-ctrl px-1.5 py-0.5 text-[10px] font-medium",
                  FLAG_TONE[node.flag.tone] ?? FLAG_TONE.neutral,
                )}
              >
                {node.flag.label}
              </span>
            )}

            {active && <IconCheck size={14} className="shrink-0 text-brand" />}
          </button>
        </div>

        {hasChildren && isOpen && (
          <div className="flex flex-col">
            {node.children.map((c) => renderNode(c))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1">
      {label && (
        <label className="text-[12px] font-medium text-text-secondary">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}

      {/* ------------------------ Nút bấm ------------------------ */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        disabled={disabled}
        className={cn(
          "flex min-h-[36px] w-full items-center gap-2 rounded-ctrl border px-2.5 py-1.5 text-left transition-colors",
          error
            ? "border-danger bg-white"
            : open
              ? "border-brand bg-white"
              : "border-border-neutral bg-white hover:border-brand",
          disabled && "cursor-not-allowed bg-surface-alt opacity-60",
        )}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-[13px] text-text-primary">
                {selected.label}
              </span>
              {showPath && selectedPath.length > 1 && (
                <span className="block truncate text-[11px] text-text-hint">
                  {selectedPath.slice(0, -1).join(" › ")}
                </span>
              )}
            </>
          ) : (
            <span className="text-[13px] text-text-hint">{placeholder}</span>
          )}
        </span>

        {selected?.flag && (
          <span
            className={cn(
              "shrink-0 rounded-ctrl px-1.5 py-0.5 text-[10px] font-medium",
              FLAG_TONE[selected.flag.tone] ?? FLAG_TONE.neutral,
            )}
          >
            {selected.flag.label}
          </span>
        )}

        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ctrl text-icon-neutral hover:bg-surface-alt"
          >
            <IconX size={13} />
          </span>
        )}

        <IconChevronDown
          size={15}
          className={cn(
            "shrink-0 text-icon-neutral transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* ------------------------ Danh sách ------------------------ */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col rounded-card border border-border-light bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-border-light px-2.5 py-2">
            <IconSearch size={14} className="shrink-0 text-icon-neutral" />
            <input
              ref={searchRef}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo tên danh mục"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-hint"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword("")}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ctrl text-icon-neutral hover:bg-surface-alt"
              >
                <IconX size={13} />
              </button>
            )}
          </div>

          <div
            className="flex flex-col gap-0.5 overflow-y-auto p-1.5"
            style={{ maxHeight }}
          >
            {visibleTree.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-text-hint">
                Không có danh mục phù hợp. Thử xoá bớt từ khoá.
              </p>
            ) : (
              visibleTree.map((n) => renderNode(n))
            )}
          </div>

          {!keyword && (
            <div className="flex items-center gap-3 border-t border-border-light px-2.5 py-1.5">
              <button
                type="button"
                onClick={expandAll}
                className="text-[11px] text-text-secondary underline decoration-dotted hover:text-brand"
              >
                Mở tất cả
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-[11px] text-text-secondary underline decoration-dotted hover:text-brand"
              >
                Thu gọn
              </button>
              {selectable === "leaf" && (
                <span className="ml-auto text-[11px] text-text-hint">
                  Chỉ chọn được danh mục cấp cuối
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {error ? (
        <p className="flex items-start gap-1 text-[12px] leading-4 text-danger">
          <IconAlertTriangle size={13} className="mt-px shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] leading-4 text-text-hint">{hint}</p>
      )}
    </div>
  );
}
