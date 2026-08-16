import { cn } from "@/lib/cn";

export function Spinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-middle",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/** Lớp phủ loading dùng trong bảng, card */
export function LoadingOverlay({
  label = "Đang tải dữ liệu...",
}: {
  label?: string;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-[1px]">
      <Spinner size={22} className="text-brand" />
      <span className="text-[13px] text-text-secondary">{label}</span>
    </div>
  );
}
