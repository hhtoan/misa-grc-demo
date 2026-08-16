"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 border-b border-border-light",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            disabled={it.disabled}
            onClick={() => onChange(it.key)}
            className={cn(
              "relative inline-flex items-center gap-1.5 px-3 font-medium transition-colors",
              size === "sm" ? "h-8 text-[12px]" : "h-10 text-[13px]",
              "disabled:cursor-not-allowed disabled:text-text-hint",
              active
                ? "text-brand"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {it.icon}
            {it.label}
            {it.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[11px] font-semibold",
                  active
                    ? "bg-brand-light text-brand"
                    : "bg-[#F0F0F0] text-text-secondary",
                )}
              >
                {it.count}
              </span>
            )}
            {active && (
              <span className="absolute right-0 -bottom-px left-0 h-0.5 rounded-t bg-brand" />
            )}
          </button>
        );
      })}
    </div>
  );
}
