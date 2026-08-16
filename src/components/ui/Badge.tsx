import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "high"
  | "danger"
  | "brand";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-lv-neutral-bg text-lv-neutral-text border-lv-neutral-border",
  info: "bg-lv-info-bg text-lv-info-text border-lv-info-border",
  success: "bg-lv-low-bg text-lv-low-text border-lv-low-border",
  warning: "bg-lv-medium-bg text-lv-medium-text border-lv-medium-border",
  high: "bg-lv-high-bg text-lv-high-text border-lv-high-border",
  danger: "bg-lv-critical-bg text-lv-critical-text border-lv-critical-border",
  brand: "bg-brand-light text-brand border-brand/20",
};

const DOT: Record<BadgeTone, string> = {
  neutral: "bg-[#717680]",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  high: "bg-[#EF6820]",
  danger: "bg-danger",
  brand: "bg-brand",
};

export function Badge({
  tone = "neutral",
  dot = false,
  size = "md",
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-badge border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-[12px]",
        TONE[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

/* ---------- Ánh xạ nghiệp vụ: mức độ rủi ro theo tài liệu ---------- */

export type RiskLevel = "Thấp" | "Trung bình" | "Cao" | "Trọng yếu";

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  Thấp: "success",
  "Trung bình": "warning",
  Cao: "high",
  "Trọng yếu": "danger",
};

export function RiskBadge({
  level,
  score,
  className,
}: {
  level: RiskLevel;
  score?: number;
  className?: string;
}) {
  return (
    <Badge tone={RISK_TONE[level]} dot className={className}>
      {level}
      {score !== undefined && <span className="opacity-70">({score})</span>}
    </Badge>
  );
}

/* --------- Ánh xạ nghiệp vụ: trạng thái bản ghi dùng chung -------- */

export const STATUS_TONE: Record<string, BadgeTone> = {
  // dùng chung nhiều phân hệ
  Nháp: "neutral",
  "Chờ duyệt": "info",
  "Đã duyệt": "success",
  "Đang theo dõi": "brand",
  "Đang xử lý": "brand",
  "Đã đóng": "neutral",
  "Từ chối": "danger",
  "Quá hạn": "danger",
  "Hoàn thành": "success",
  "Chưa bắt đầu": "neutral",
  "Đang thực hiện": "info",
  "Chờ nghiệm thu": "warning",
  Huỷ: "neutral",
  // kiểm soát
  "Hiệu quả": "success",
  "Hiệu quả một phần": "warning",
  "Không hiệu quả": "danger",
  "Chưa đánh giá": "neutral",
  // sự kiện
  "Mới ghi nhận": "info",
  "Đang điều tra": "warning",
  "Đã xác minh": "brand",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} dot className={className}>
      {status}
    </Badge>
  );
}
