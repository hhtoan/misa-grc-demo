"use client";

import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleMinus,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";

/* ==================================================================
   Badge hiệu lực kiểm soát.

   Dùng cho cả 3 chỗ: Design Effectiveness, Operation Effectiveness
   và hiệu quả chung, nên mọi bảng trong dự án hiện thống nhất.

   Component KHÔNG tự suy luận, chỉ hiển thị giá trị được truyền vào.
   Việc tính hiệu quả chung do control-utils đảm nhiệm.
   ================================================================== */

export type EffectivenessLabel =
  | "Hiệu quả"
  | "Hiệu quả một phần"
  | "Không hiệu quả"
  | "Chưa đánh giá";

export interface EffectivenessBadgeProps {
  value: string;
  /** Nhãn chiều đánh giá, ví dụ "Thiết kế" hoặc "Vận hành" */
  dimension?: string;
  size?: "sm" | "md";
  /** Rút gọn nhãn để vừa cột hẹp */
  short?: boolean;
  className?: string;
}

const STYLE: Record<string, string> = {
  "Hiệu quả": "bg-lv-low-bg text-lv-low-text border-lv-low-border",
  "Hiệu quả một phần":
    "bg-lv-medium-bg text-lv-medium-text border-lv-medium-border",
  "Không hiệu quả":
    "bg-lv-critical-bg text-lv-critical-text border-lv-critical-border",
  "Chưa đánh giá": "bg-surface-alt text-text-secondary border-border-light",
};

const SHORT_LABEL: Record<string, string> = {
  "Hiệu quả": "Hiệu quả",
  "Hiệu quả một phần": "Một phần",
  "Không hiệu quả": "Không",
  "Chưa đánh giá": "Chưa ĐG",
};

function iconOf(value: string, size: number) {
  if (value === "Hiệu quả") return <IconCircleCheck size={size} />;
  if (value === "Hiệu quả một phần") return <IconCircleMinus size={size} />;
  if (value === "Không hiệu quả") return <IconAlertTriangle size={size} />;
  return <IconCircleDashed size={size} />;
}

export default function EffectivenessBadge({
  value,
  dimension,
  size = "md",
  short = false,
  className,
}: EffectivenessBadgeProps) {
  const style = STYLE[value] ?? STYLE["Chưa đánh giá"];
  const label = short ? (SHORT_LABEL[value] ?? value) : value;
  const iconSize = size === "sm" ? 11 : 13;

  return (
    <span
      title={dimension ? `${dimension}: ${value}` : value}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-badge border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[12px]",
        style,
        className,
      )}
    >
      {iconOf(value, iconSize)}
      {dimension && <span className="opacity-75">{dimension}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}
