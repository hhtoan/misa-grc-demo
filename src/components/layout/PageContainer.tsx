import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Khung màn hình: PageHeader + PageBody (+ FooterActionBar) */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}

/** Vùng nội dung cuộn được */
export function PageBody({
  children,
  padded = true,
  className,
}: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card trắng bọc nội dung, dùng cho form và bảng */
export function ContentCard({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={cn("misa-card", padded && "p-4", className)}>
      {children}
    </div>
  );
}
