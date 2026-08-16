"use client";

import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

const SIZE_OPTIONS = [10, 20, 50, 100];

function pagesOf(current: number, count: number): (number | "...")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", count];
  if (current >= count - 3)
    return [1, "...", count - 4, count - 3, count - 2, count - 1, count];
  return [1, "...", current - 1, current, current + 1, "...", count];
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
  className?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const navBtn =
    "inline-flex h-7 w-7 items-center justify-center rounded-ctrl text-icon-neutral transition-colors hover:bg-[#F0F0F0] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={cn(
        "flex h-12 shrink-0 flex-wrap items-center gap-3 border-t border-border-light bg-white px-3",
        className,
      )}
    >
      {/* Số bản ghi mỗi trang */}
      {onPageSizeChange && (
        <div className="flex items-center gap-1.5 text-[13px] text-text-secondary">
          <span className="hidden sm:inline">Hiển thị</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="h-7 rounded-ctrl border border-border-neutral bg-white px-1.5 text-[13px] text-text-primary outline-none focus:border-brand"
          >
            {SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="hidden sm:inline">bản ghi</span>
        </div>
      )}

      <p className="text-[13px] text-text-secondary">
        {total === 0 ? (
          "Không có bản ghi"
        ) : (
          <>
            <b className="font-medium text-text-primary">
              {formatNumber(from)}-{formatNumber(to)}
            </b>{" "}
            trên tổng {formatNumber(total)} bản ghi
          </>
        )}
      </p>

      {/* Điều hướng trang */}
      <div className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          className={navBtn}
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          aria-label="Trang đầu"
        >
          <IconChevronsLeft size={16} />
        </button>
        <button
          type="button"
          className={navBtn}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
        >
          <IconChevronLeft size={16} />
        </button>

        {pagesOf(page, pageCount).map((p, i) =>
          p === "..." ? (
            <span
              key={`gap-${i}`}
              className="px-1 text-[13px] text-text-hint select-none"
            >
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                "inline-flex h-7 min-w-7 items-center justify-center rounded-ctrl px-1.5 text-[13px] transition-colors",
                p === page
                  ? "bg-brand font-semibold text-white"
                  : "text-text-primary hover:bg-[#F0F0F0]",
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          className={navBtn}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
        >
          <IconChevronRight size={16} />
        </button>
        <button
          type="button"
          className={navBtn}
          disabled={page >= pageCount}
          onClick={() => onPageChange(pageCount)}
          aria-label="Trang cuối"
        >
          <IconChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
