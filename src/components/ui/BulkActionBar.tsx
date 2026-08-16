"use client";

import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

export function BulkActionBar({
  count,
  onClear,
  onSelectAll,
  totalCount,
  children,
  className,
}: {
  count: number;
  onClear: () => void;
  /** Hiện link "Chọn tất cả N bản ghi" */
  onSelectAll?: () => void;
  totalCount?: number;
  children: ReactNode;
  className?: string;
}) {
  if (count === 0) return null;

  const showSelectAll =
    onSelectAll && totalCount !== undefined && count < totalCount;

  return (
    <div
      className={cn(
        "animate-fade-in pointer-events-none fixed bottom-5 left-1/2 z-[60] -translate-x-1/2",
        className,
      )}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-card bg-[#101828] py-2 pr-2 pl-3 shadow-modal">
        <span className="flex items-center gap-2 text-[13px] text-white">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-brand px-1.5 text-[12px] font-semibold">
            {formatNumber(count)}
          </span>
          bản ghi đã chọn
        </span>

        {showSelectAll && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[12px] text-[#9CC0FF] transition-colors hover:text-white"
          >
            Chọn tất cả {formatNumber(totalCount!)}
          </button>
        )}

        <span className="h-5 w-px bg-white/20" />

        <div className="flex items-center gap-1">{children}</div>

        <button
          type="button"
          onClick={onClear}
          aria-label="Bỏ chọn"
          className="rounded-ctrl p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <IconX size={16} />
        </button>
      </div>
    </div>
  );
}

/** Nút dùng bên trong BulkActionBar */
export function BulkButton({
  icon,
  danger = false,
  onClick,
  children,
}: {
  icon?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-ctrl px-2.5 text-[13px] font-medium transition-colors",
        danger
          ? "text-[#FDA29B] hover:bg-danger/20"
          : "text-white hover:bg-white/10",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
