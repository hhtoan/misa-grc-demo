import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Thanh hành động cố định đáy màn hình, cao 56px */
export function FooterActionBar({
  left,
  children,
  className,
}: {
  left?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-t border-border-light bg-white px-4",
        className,
      )}
    >
      {left && <div className="flex items-center gap-2">{left}</div>}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
