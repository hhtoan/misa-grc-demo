"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { getBreadcrumb, type Crumb } from "@/config/navigation";

export function Breadcrumb({
  items,
  className,
}: {
  /** Truyền vào để ghi đè, bỏ trống thì tự suy ra từ URL */
  items?: Crumb[];
  className?: string;
}) {
  const pathname = usePathname();
  const crumbs = items ?? getBreadcrumb(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Đường dẫn"
      className={cn("flex items-center gap-1 text-[12px]", className)}
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <IconChevronRight size={13} className="text-text-hint" />}
            {c.path && !last ? (
              <Link
                href={c.path}
                className="text-text-secondary transition-colors hover:text-brand"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn(
                  last
                    ? "font-medium text-text-primary"
                    : "text-text-secondary",
                )}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
