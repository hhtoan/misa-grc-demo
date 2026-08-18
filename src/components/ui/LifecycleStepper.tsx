"use client";

import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/cn";

/* ==================================================================
   Dải vòng đời dùng chung cho rủi ro, sự kiện và hành động KPPN.

   Mục đích: người dùng biết ngay mình đang ở bước nào, đã qua bước
   nào và bước nào còn thiếu hồ sơ. Bước có cảnh báo bấm được để
   nhảy tới đúng chỗ cần bổ sung.
   ================================================================== */

export type StepState = "done" | "current" | "todo" | "skipped";

export interface LifecycleStep {
  key: string;
  label: string;
  /** Mô tả ngắn, hiện dưới nhãn ở chế độ đầy đủ */
  description?: string;
  state: StepState;
  /** Nội dung còn thiếu ở bước này, hiện dấu cảnh báo */
  warning?: string;
  /** Bấm vào bước để nhảy tới nơi bổ sung */
  onClick?: () => void;
}

export interface LifecycleStepperProps {
  steps: LifecycleStep[];
  /** compact bỏ phần mô tả, dùng khi đặt trong bảng hoặc modal */
  size?: "default" | "compact";
  className?: string;
}

export default function LifecycleStepper({
  steps,
  size = "default",
  className,
}: LifecycleStepperProps) {
  const compact = size === "compact";

  return (
    <div
      className={cn(
        "flex w-full items-start overflow-x-auto",
        compact ? "gap-0" : "gap-0 pb-1",
        className,
      )}
    >
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const clickable = !!s.onClick;

        const circle =
          s.state === "done"
            ? "bg-lv-low-bg text-lv-low-text border-lv-low-border"
            : s.state === "current"
              ? "bg-brand text-white border-brand"
              : s.state === "skipped"
                ? "bg-surface-alt text-text-hint border-border-light"
                : "bg-white text-text-secondary border-border-neutral";

        const line =
          s.state === "done" ? "bg-lv-low-border" : "bg-border-light";

        return (
          <div
            key={s.key}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center",
              compact ? "px-0.5" : "px-1",
            )}
            style={{ minWidth: compact ? 88 : 116 }}
          >
            {/* ---------- Vòng tròn và đường nối ---------- */}
            <div className="flex w-full items-center">
              <span
                className={cn("h-px flex-1", i === 0 ? "bg-transparent" : line)}
              />
              <button
                type="button"
                disabled={!clickable}
                onClick={s.onClick}
                title={s.warning || s.description || s.label}
                className={cn(
                  "relative flex shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  compact ? "h-6 w-6" : "h-7 w-7",
                  circle,
                  clickable && "cursor-pointer hover:brightness-95",
                  !clickable && "cursor-default",
                )}
              >
                {s.state === "done" ? (
                  <IconCheck size={compact ? 12 : 14} />
                ) : (
                  <span
                    className={cn(
                      "font-semibold",
                      compact ? "text-[11px]" : "text-[12px]",
                    )}
                  >
                    {i + 1}
                  </span>
                )}

                {s.warning && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-lv-medium-text text-white">
                    <IconAlertTriangle size={9} />
                  </span>
                )}
              </button>
              <span
                className={cn("h-px flex-1", last ? "bg-transparent" : line)}
              />
            </div>

            {/* ---------------- Nhãn bước ---------------- */}
            <p
              className={cn(
                "mt-1 w-full truncate px-0.5 text-center",
                compact ? "text-[11px]" : "text-[12px]",
                s.state === "current"
                  ? "font-semibold text-text-primary"
                  : s.state === "done"
                    ? "font-medium text-text-primary"
                    : "text-text-secondary",
              )}
              title={s.label}
            >
              {s.label}
            </p>

            {!compact && s.description && (
              <p
                className="w-full px-0.5 text-center text-[11px] leading-3.5 text-text-hint"
                title={s.description}
              >
                {s.description}
              </p>
            )}

            {!compact && s.warning && (
              <p className="w-full px-0.5 text-center text-[11px] leading-3.5 font-medium text-lv-medium-text">
                {s.warning}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
