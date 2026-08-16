import type { ReactNode } from "react";
import { IconInbox } from "@tabler/icons-react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title = "Chưa có dữ liệu",
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 py-8" : "gap-2 py-16",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F5F5] text-text-hint">
        {icon ?? <IconInbox size={24} />}
      </span>
      <p className="text-[14px] font-semibold text-text-primary">{title}</p>
      {description && (
        <p className="max-w-[420px] text-[13px] text-text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Màn hình phân hệ chưa phát triển - dùng cho 8 phân hệ "Sắp có" */
export function ComingSoon({ moduleName }: { moduleName: string }) {
  return (
    <div className="misa-card m-4 flex flex-1 items-center justify-center p-8">
      <EmptyState
        title={`Phân hệ ${moduleName} đang được phát triển`}
        description="Nội dung nghiệp vụ của phân hệ này sẽ được bổ sung ở phiên bản tiếp theo."
      />
    </div>
  );
}
