"use client";

import type { ReactNode } from "react";
import {
  IconArrowsSort,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import type { SortState } from "@/lib/table";
import { Checkbox } from "./Checkbox";
import { EmptyState } from "./EmptyState";
import { LoadingOverlay } from "./Spinner";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Bề rộng cố định (px). Bỏ trống = co giãn */
  width?: number;
  minWidth?: number;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  /** Cho phép xuống dòng thay vì cắt chữ */
  wrap?: boolean;
  className?: string;
  render: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  loading?: boolean;

  /** Chọn nhiều */
  selectable?: boolean;
  selectedSet?: Set<string>;
  onToggleRow?: (key: string) => void;
  onTogglePage?: () => void;
  allPageSelected?: boolean;
  somePageSelected?: boolean;

  /** Sắp xếp */
  sort?: SortState | null;
  onSort?: (key: string) => void;

  onRowClick?: (row: T) => void;
  /** Ghim cột dữ liệu đầu tiên khi cuộn ngang */
  stickyFirst?: boolean;
  /** Ghim cột cuối (thường là cột thao tác) */
  stickyLast?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
  /** Đánh dấu dòng cần chú ý, ví dụ KPPN quá hạn */
  rowClassName?: (row: T) => string | undefined;
}

const ALIGN = {
  left: "text-left justify-start",
  center: "text-center justify-center",
  right: "text-right justify-end",
} as const;

export function DataTable<T>({
  columns,
  rows,
  getKey,
  loading = false,
  selectable = false,
  selectedSet,
  onToggleRow,
  onTogglePage,
  allPageSelected = false,
  somePageSelected = false,
  sort,
  onSort,
  onRowClick,
  stickyFirst = false,
  stickyLast = false,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription,
  emptyAction,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const checkboxWidth = 40;

  function stickyStyle(i: number): React.CSSProperties | undefined {
    if (stickyFirst && i === 0) {
      return {
        position: "sticky",
        left: selectable ? checkboxWidth : 0,
        zIndex: 2,
      };
    }
    if (stickyLast && i === columns.length - 1) {
      return { position: "sticky", right: 0, zIndex: 2 };
    }
    return undefined;
  }

  function stickyClass(i: number) {
    if (stickyFirst && i === 0)
      return "bg-inherit after:absolute after:top-0 after:right-0 after:h-full after:w-px after:bg-border-light";
    if (stickyLast && i === columns.length - 1)
      return "bg-inherit before:absolute before:top-0 before:left-0 before:h-full before:w-px before:bg-border-light";
    return "";
  }

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-alt">
              {selectable && (
                <th
                  className="sticky left-0 z-[3] h-9 border-b border-border-light bg-surface-alt px-3"
                  style={{ width: checkboxWidth }}
                >
                  <Checkbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected}
                    onChange={() => onTogglePage?.()}
                  />
                </th>
              )}

              {columns.map((c, i) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    style={{
                      width: c.width,
                      minWidth: c.minWidth ?? c.width,
                      ...stickyStyle(i),
                    }}
                    className={cn(
                      "relative h-9 border-b border-border-light bg-surface-alt px-3 font-medium whitespace-nowrap text-text-secondary",
                      stickyClass(i) && "z-[3] bg-surface-alt",
                      stickyFirst && i === 0 && "shadow-none",
                      c.className,
                    )}
                  >
                    {c.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cn(
                          "inline-flex w-full items-center gap-1 transition-colors hover:text-brand",
                          ALIGN[c.align ?? "left"],
                          active && "text-brand",
                        )}
                      >
                        {c.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <IconSortAscending size={14} />
                          ) : (
                            <IconSortDescending size={14} />
                          )
                        ) : (
                          <IconArrowsSort
                            size={14}
                            className="text-text-hint opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        )}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "flex w-full items-center",
                          ALIGN[c.align ?? "left"],
                        )}
                      >
                        {c.header}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => {
              const key = getKey(row);
              const checked = selectedSet?.has(key) ?? false;
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "group bg-white transition-colors",
                    checked ? "bg-brand-light" : "hover:bg-[#FAFAFA]",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row),
                  )}
                >
                  {selectable && (
                    <td
                      className="sticky left-0 z-[1] border-b border-border-light bg-inherit px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => onToggleRow?.(key)}
                      />
                    </td>
                  )}

                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      style={stickyStyle(i)}
                      className={cn(
                        "border-b border-border-light bg-inherit px-3 py-2 align-middle text-text-primary",
                        c.wrap
                          ? "whitespace-normal"
                          : "truncate whitespace-nowrap",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                        stickyClass(i),
                        c.className,
                      )}
                    >
                      {c.render(row, idx)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && rows.length === 0 && (
          <div className="bg-white">
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          </div>
        )}
      </div>

      {loading && <LoadingOverlay />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ô hiển thị dùng lại trong bảng                                      */
/* ------------------------------------------------------------------ */

/** Mã bản ghi, luôn là link màu brand */
export function CodeCell({
  code,
  onClick,
}: {
  code: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="font-medium text-brand transition-colors hover:underline"
    >
      {code}
    </button>
  );
}

/** Tên + mô tả phụ trên 2 dòng */
export function TitleCell({
  title,
  sub,
}: {
  title: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-text-primary">{title}</span>
      {sub && (
        <span className="truncate text-[12px] text-text-secondary">{sub}</span>
      )}
    </span>
  );
}

/** Nhóm nút thao tác cuối dòng, chỉ hiện khi hover */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  );
}
