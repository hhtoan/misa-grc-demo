"use client";

import { cn } from "@/lib/cn";

/* ==================================================================
   Dải lọc nhanh theo vòng đời.

   Dùng chung cho sổ rủi ro, sổ kiểm soát, sổ theo dõi sự kiện và
   bảng KPPN, để người dùng học một lần dùng được cả 4 nơi.
   ================================================================== */

export interface QuickFilterItem {
  key: string;
  label: string;
  hint?: string;
  count?: number;
}

export interface LifecycleQuickFilterProps {
  items: QuickFilterItem[];
  value: string;
  onChange: (key: string) => void;
  /** Ẩn chip có số đếm bằng 0, trừ chip đang chọn */
  hideEmpty?: boolean;
  className?: string;
}

export default function LifecycleQuickFilter({
  items,
  value,
  onChange,
  hideEmpty = false,
  className,
}: LifecycleQuickFilterProps) {
  const shown = hideEmpty
    ? items.filter(
        (x) => x.key === value || x.count === undefined || x.count > 0,
      )
    : items;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 border-b border-border-light px-3 py-2.5",
        className,
      )}
    >
      <span className="mr-0.5 text-[12px] text-text-secondary">Vòng đời:</span>

      {shown.map((x) => {
        const active = x.key === value;
        return (
          <button
            key={x.key}
            type="button"
            title={x.hint}
            onClick={() => onChange(x.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-ctrl border px-2.5 py-1 text-[12px] font-medium transition-all",
              active
                ? "border-brand bg-brand-light text-brand ring-1 ring-brand"
                : "border-border-neutral bg-white text-text-secondary hover:bg-[#FAFAFA]",
              !active && x.count === 0 && "opacity-55",
            )}
          >
            {x.label}
            {x.count !== undefined && (
              <b
                className={cn(
                  "text-[13px]",
                  active ? "text-brand" : "text-text-primary",
                )}
              >
                {x.count}
              </b>
            )}
          </button>
        );
      })}
    </div>
  );
}
