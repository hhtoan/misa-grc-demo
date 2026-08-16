"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentItem {
  key: string;
  label?: string;
  icon?: ReactNode;
  title?: string;
}

export function Segments({
  items,
  value,
  onChange,
  size = "md",
  className,
}: {
  items: SegmentItem[];
  value: string;
  onChange: (key: string) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const h = size === "sm" ? "h-7" : "h-8";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-ctrl bg-[#F0F0F0] p-0.5",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            title={it.title ?? it.label}
            onClick={() => onChange(it.key)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-all",
              h,
              !it.label && "w-8 px-0",
              active
                ? "bg-white text-text-primary shadow-segment"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
