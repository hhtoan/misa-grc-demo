"use client";

import { cn } from "@/lib/cn";
import {
  IMPACT_LABELS,
  LEVEL_COLOR,
  LEVEL_TEXT_COLOR,
  LIKELIHOOD_LABELS,
  riskLevelOf,
  riskScore,
} from "@/lib/domain/matrix";
import type { RiskLevelValue } from "@/lib/domain/enums";
import type { BadgeTone } from "@/components/ui";
import { Badge } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Ánh xạ mức độ sang tone của Badge                                   */
/* ------------------------------------------------------------------ */

export const LEVEL_TONE: Record<RiskLevelValue, BadgeTone> = {
  "Thấp": "success",
  "Trung bình": "warning",
  "Cao": "high",
  "Trọng yếu": "danger",
};

export const ALL_LEVELS: RiskLevelValue[] = [
  "Thấp",
  "Trung bình",
  "Cao",
  "Trọng yếu",
];

/** Trục khả năng xảy ra hiển thị từ 5 xuống 1 */
const LIKELIHOOD_ROWS = [5, 4, 3, 2, 1];
const IMPACT_COLS = [1, 2, 3, 4, 5];

/* ------------------------------------------------------------------ */
/* Chú giải mức độ                                        */
/* ------------------------------------------------------------------ */

export function MatrixLegend({
  counts,
  className,
}: {
  /** Nếu truyền vào sẽ hiện số lượng kèm theo từng mức */
  counts?: Record<RiskLevelValue, number>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {ALL_LEVELS.map((lv) => (
        <span key={lv} className="flex items-center gap-1.5 text-[12px]">
          <span
            className="h-3 w-3 rounded-[3px] border"
            style={{
              background: LEVEL_COLOR[lv],
              borderColor: LEVEL_TEXT_COLOR[lv],
            }}
          />
          <span className="text-text-secondary">{lv}</span>
          {counts && (
            <span className="font-semibold text-text-primary">
              {counts[lv]}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ma trận chọn điểm                                        */
/* ------------------------------------------------------------------ */

export interface RiskMatrixPickerProps {
  label?: string;
  required?: boolean;
  likelihood: number;
  impact: number;
  onChange: (likelihood: number, impact: number) => void;
  disabled?: boolean;
  error?: string;
  /** Điểm tham chiếu hiển thị bằng viền đứt, ví dụ vị trí rủi ro cố hữu */
  ghost?: { likelihood: number; impact: number; label?: string } | null;
  /** Ẩn dòng tóm tắt phía dưới */
  hideSummary?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function RiskMatrixPicker({
  label,
  required,
  likelihood,
  impact,
  onChange,
  disabled = false,
  error,
  ghost = null,
  hideSummary = false,
  className,
  size = "md",
}: RiskMatrixPickerProps) {
  const score = riskScore(likelihood, impact);
  const level = riskLevelOf(likelihood, impact);
  const cellH = size === "sm" ? "h-8" : "h-10";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <span className="text-[13px] font-medium text-text-primary">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </span>
      )}

      <div
        className={cn(
          "rounded-ctrl border p-2",
          error ? "border-danger" : "border-border-light"
        )}
      >
        <div className="flex gap-1.5">
          {/* Nhãn trục dọc */}
          <div className="flex w-[18px] shrink-0 items-center justify-center">
            <span className="rotate-180 text-[11px] font-medium whitespace-nowrap text-text-secondary [writing-mode:vertical-rl]">
              Khả năng xảy ra
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {/* Lưới 5 hàng */}
            <div className="flex flex-col gap-1">
              {LIKELIHOOD_ROWS.map((l) => (
                <div key={l} className="flex items-center gap-1">
                  <span
                    className="w-[104px] shrink-0 truncate text-right text-[11px] text-text-secondary"
                    title={LIKELIHOOD_LABELS[l]}
                  >
                    {l}. {LIKELIHOOD_LABELS[l]}
                  </span>

                  <div className="grid min-w-0 flex-1 grid-cols-5 gap-1">
                    {IMPACT_COLS.map((i) => {
                      const cellScore = riskScore(l, i);
                      const cellLevel = riskLevelOf(l, i);
                      const selected = l === likelihood && i === impact;
                      const isGhost =
                        !!ghost &&
                        ghost.likelihood === l &&
                        ghost.impact === i &&
                        !selected;

                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={disabled}
                          onClick={() => onChange(l, i)}
                          title={`${LIKELIHOOD_LABELS[l]} × ${IMPACT_LABELS[i]} = ${cellScore} ( ${cellLevel})`}
                          className={cn(
                            "relative flex items-center justify-center rounded-[6px] border text-[13px] font-semibold transition-all",
                            cellH,
                            disabled
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:scale-[1.04]",
                            selected
                              ? "ring-2 ring-brand ring-offset-1"
                              : "border-transparent",
                            isGhost && "border-dashed border-[#717680]"
                          )}
                          style={{
                            background: LEVEL_COLOR[cellLevel],
                            color: LEVEL_TEXT_COLOR[cellLevel],
                            borderColor: selected
                              ? LEVEL_TEXT_COLOR[cellLevel]
                              : isGhost
                                ? "#717680"
                                : "transparent",
                          }}
                        >
                          {cellScore}
                          {isGhost && (
                            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#717680]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Nhãn trục ngang */}
              <div className="mt-0.5 flex items-start gap-1">
                <span className="w-[104px] shrink-0" />
                <div className="grid min-w-0 flex-1 grid-cols-5 gap-1">
                  {IMPACT_COLS.map((i) => (
                    <span
                      key={i}
                      className="truncate text-center text-[11px] text-text-secondary"
                      title={IMPACT_LABELS[i]}
                    >
                      {i}. {IMPACT_LABELS[i]}
                    </span>
                  ))}
                </div>
              </div>

              <p className="mt-1 text-center text-[11px] font-medium text-text-secondary">
                Mức độ ảnh hưởng
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      {!hideSummary && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
          <span>
            {LIKELIHOOD_LABELS[likelihood]}{" "}
            <b className="text-text-primary">({likelihood})</b> ×{" "}
            {IMPACT_LABELS[impact]}{" "}
            <b className="text-text-primary">({impact})</b> ={" "}
            <b className="text-text-primary">{score}</b>
          </span>
          <Badge tone={LEVEL_TONE[level]} dot>
            {level}
          </Badge>
          {ghost && (
            <span className="flex items-center gap-1 text-text-hint">
              <span className="h-2 w-2 rounded-full border border-dashed border-[#717680]" />
              {ghost.label ?? "Điểm tham chiếu"}:{" "}
              {riskScore(ghost.likelihood, ghost.impact)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thẻ hiển thị điểm rủi ro dạng gọn, dùng ở trang chi tiết            */
/* ------------------------------------------------------------------ */

export function RiskScoreCard({
  title,
  likelihood,
  impact,
  note,
  className,
}: {
  title: string;
  likelihood: number;
  impact: number;
  note?: string;
  className?: string;
}) {
  const score = riskScore(likelihood, impact);
  const level = riskLevelOf(likelihood, impact);

  return (
    <div
      className={cn("rounded-ctrl border border-border-light p-3", className)}
    >
      <p className="text-[12px] text-text-secondary">{title}</p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctrl text-[18px] font-bold"
          style={{
            background: LEVEL_COLOR[level],
            color: LEVEL_TEXT_COLOR[level],
          }}
        >
          {score}
        </span>
        <div className="min-w-0">
          <Badge tone={LEVEL_TONE[level]} dot>
            {level}
          </Badge>
          <p className="mt-0.5 truncate text-[12px] text-text-hint">
            {LIKELIHOOD_LABELS[likelihood]} × {IMPACT_LABELS[impact]}
          </p>
        </div>
      </div>
      {note && <p className="mt-1.5 text-[12px] text-text-secondary">{note}</p>}
    </div>
  );
}
