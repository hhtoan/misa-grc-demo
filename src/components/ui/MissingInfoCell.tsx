"use client";

import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { cn } from "@/lib/cn";

/* ==================================================================
   Chip chỉ báo hồ sơ còn thiếu.

   Dùng chung cho cột "Hồ sơ chưa đủ" của cả 4 phân hệ, thay cho việc
   mỗi màn hình tự dựng một kiểu chip riêng.
   ================================================================== */

export type MissingTone = "danger" | "warning" | "info";

export interface MissingItem {
  label: string;
  tone: MissingTone;
  /** Giải thích vì sao thiếu mục này là vấn đề */
  hint: string;
  /** Mục này đang chặn quy trình, không bổ sung thì không đi tiếp được */
  blocking?: boolean;
}

export interface MissingInfoCellProps {
  items: MissingItem[];
  /** Số chip hiện tối đa, phần còn lại gộp vào chip cộng thêm */
  maxVisible?: number;
  /** Nội dung khi không thiếu gì */
  emptyLabel?: string;
  className?: string;
}

const TONE_CLASS: Record<MissingTone, string> = {
  danger: "bg-lv-critical-bg text-lv-critical-text",
  warning: "bg-lv-medium-bg text-lv-medium-text",
  info: "bg-lv-info-bg text-lv-info-text",
};

const TONE_ORDER: Record<MissingTone, number> = {
  danger: 1,
  warning: 2,
  info: 3,
};

export default function MissingInfoCell({
  items,
  maxVisible = 3,
  emptyLabel = "Hồ sơ đã đủ",
  className,
}: MissingInfoCellProps) {
  if (items.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[12px] text-lv-low-text",
          className,
        )}
      >
        <IconCircleCheck size={14} />
        {emptyLabel}
      </span>
    );
  }

  /* Mục chặn quy trình và mục nghiêm trọng luôn lên trước */
  const sorted = [...items].sort((a, b) => {
    if (!!a.blocking !== !!b.blocking) return a.blocking ? -1 : 1;
    return TONE_ORDER[a.tone] - TONE_ORDER[b.tone];
  });

  const shown = sorted.slice(0, maxVisible);
  const rest = sorted.slice(maxVisible);

  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((x) => (
        <span
          key={x.label}
          title={x.blocking ? `${x.hint} (đang chặn quy trình)` : x.hint}
          className={cn(
            "inline-flex items-center gap-1 rounded-badge px-1.5 py-0.5 text-[11px] font-medium",
            TONE_CLASS[x.tone],
          )}
        >
          {x.blocking && <IconAlertTriangle size={10} />}
          {x.label}
        </span>
      ))}

      {rest.length > 0 && (
        <span
          title={rest.map((x) => x.label).join(", ")}
          className="inline-flex items-center rounded-badge bg-surface-alt px-1.5 py-0.5 text-[11px] font-medium text-text-secondary"
        >
          +{rest.length}
        </span>
      )}
    </span>
  );
}
