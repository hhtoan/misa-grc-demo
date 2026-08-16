"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui";
import { Breadcrumb } from "./Breadcrumb";

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  showBack = false,
  showBreadcrumb = true,
  onBack,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  showBack?: boolean;
  showBreadcrumb?: boolean;
  onBack?: () => void;
  className?: string;
}) {
  const router = useRouter();

  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-3 border-b border-border-light bg-white px-4",
        className,
      )}
    >
      {showBack && (
        <IconButton
          label="Quay lại"
          onClick={onBack ?? (() => router.back())}
          className="-ml-1"
        >
          <IconArrowLeft size={18} />
        </IconButton>
      )}

      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[16px] font-semibold text-text-primary">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle ? (
          <p className="truncate text-[12px] text-text-secondary">{subtitle}</p>
        ) : showBreadcrumb ? (
          <Breadcrumb />
        ) : null}
      </div>

      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
