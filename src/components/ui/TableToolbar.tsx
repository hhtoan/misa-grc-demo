"use client";

import type { ReactNode } from "react";
import { IconFilter, IconFilterOff } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export function TableToolbar({
  left,
  right,
  filterCount = 0,
  onToggleFilter,
  filterOpen = false,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  /** Số điều kiện lọc đang áp dụng */
  filterCount?: number;
  onToggleFilter?: () => void;
  filterOpen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border-light bg-white px-3 py-2",
        className,
      )}
    >
      {left}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {right}

        {onToggleFilter && (
          <Button
            variant="secondary"
            compact
            onClick={onToggleFilter}
            icon={
              filterOpen ? (
                <IconFilterOff size={16} />
              ) : (
                <IconFilter size={16} />
              )
            }
            className={cn(filterCount > 0 && "border-brand text-brand")}
          >
            Bộ lọc
            {filterCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                {filterCount}
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
