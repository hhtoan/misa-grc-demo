"use client";

import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export function FilterPanel({
  open,
  onClose,
  onReset,
  onApply,
  title = "Bộ lọc nâng cao",
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  onReset?: () => void;
  /** Bỏ trống nếu lọc tức thời (không cần nút Áp dụng) */
  onApply?: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <aside
      className={cn(
        "animate-slide-in-right flex w-60 shrink-0 flex-col border-l border-border-light bg-white",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-light px-3">
        <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bộ lọc"
          className="rounded-ctrl p-1.5 text-icon-neutral transition-colors hover:bg-[#F0F0F0]"
        >
          <IconX size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3">
        {children}
      </div>

      <div className="flex h-14 shrink-0 items-center gap-2 border-t border-border-light px-3">
        <Button
          variant="text"
          size="sm"
          compact
          onClick={onReset}
          className="text-text-secondary"
        >
          Xoá lọc
        </Button>
        <div className="ml-auto">
          {onApply ? (
            <Button variant="primary" size="sm" compact onClick={onApply}>
              Áp dụng
            </Button>
          ) : (
            <Button variant="secondary" size="sm" compact onClick={onClose}>
              Đóng
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

/** Nhóm điều kiện trong panel lọc */
export function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-text-secondary">
        {label}
      </span>
      {children}
    </div>
  );
}
