"use client";

import { useMemo } from "react";
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
import type { Risk } from "@/lib/domain/schema";
import { Tooltip } from "@/components/ui";
import { ALL_LEVELS, MatrixLegend } from "./RiskMatrixPicker";

/* ------------------------------------------------------------------ */
/* Kiểu điểm dữ liệu trên ma trận                                      */
/* ------------------------------------------------------------------ */

export interface MatrixPoint {
  id: string;
  code: string;
  name: string;
  likelihood: number;
  impact: number;
}

export type MatrixMode = "residual" | "inherent";

/** Chuyển danh sách rủi ro sang điểm trên ma trận theo chế độ đang xem */
export function risksToPoints(rows: Risk[], mode: MatrixMode): MatrixPoint[] {
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    likelihood:
      mode === "inherent" ? r.inherentLikelihood : r.residualLikelihood,
    impact: mode === "inherent" ? r.inherentImpact : r.residualImpact,
  }));
}

export interface MatrixCell {
  likelihood: number;
  impact: number;
  score: number;
  level: RiskLevelValue;
  points: MatrixPoint[];
}

const LIKELIHOOD_ROWS = [5, 4, 3, 2, 1];
const IMPACT_COLS = [1, 2, 3, 4, 5];

function buildCells(points: MatrixPoint[]): MatrixCell[][] {
  const bucket = new Map<string, MatrixPoint[]>();
  points.forEach((p) => {
    const key = `${p.likelihood}-${p.impact}`;
    const arr = bucket.get(key);
    if (arr) arr.push(p);
    else bucket.set(key, [p]);
  });

  return LIKELIHOOD_ROWS.map((l) =>
    IMPACT_COLS.map((i) => ({
      likelihood: l,
      impact: i,
      score: riskScore(l, i),
      level: riskLevelOf(l, i),
      points: bucket.get(`${l}-${i}`) ?? [],
    }))
  );
}

/* ------------------------------------------------------------------ */
/* Bản đồ nhiệt                                        */
/* ------------------------------------------------------------------ */

export interface RiskMatrixHeatmapProps {
  points: MatrixPoint[];
  /** Ô đang được chọn để lọc danh sách */
  selected?: { likelihood: number; impact: number } | null;
  onSelectCell?: (cell: MatrixCell | null) => void;
  /** Hiện mã bản ghi trong ô khi số lượng ít */
  showCodes?: boolean;
  className?: string;
  cellHeight?: number;
  emptyText?: string;
}

export function RiskMatrixHeatmap({
  points,
  selected = null,
  onSelectCell,
  showCodes = false,
  className,
  cellHeight = 74,
  emptyText = "Chưa có dữ liệu",
}: RiskMatrixHeatmapProps) {
  const rows = useMemo(() => buildCells(points), [points]);

  const counts = useMemo(() => {
    const out: Record<RiskLevelValue, number> = {
      "Thấp": 0,
      "Trung bình": 0,
      "Cao": 0,
      "Trọng yếu": 0,
    };
    points.forEach((p) => {
      out[riskLevelOf(p.likelihood, p.impact)] += 1;
    });
    return out;
  }, [points]);

  const maxCount = useMemo(
    () => rows.flat().reduce((m, c) => Math.max(m, c.points.length), 0),
    [rows]
  );

  function handleClick(cell: MatrixCell) {
    if (!onSelectCell) return;
    const isSame =
      selected?.likelihood === cell.likelihood &&
      selected?.impact === cell.impact;
    onSelectCell(isSame ? null : cell);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex gap-2">
        {/* Nhãn trục dọc */}
        <div className="flex w-[20px] shrink-0 items-center justify-center">
          <span className="rotate-180 text-[12px] font-medium whitespace-nowrap text-text-secondary [writing-mode:vertical-rl]">
            Khả năng xảy ra
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1.5">
            {rows.map((cells, rowIdx) => {
              const l = LIKELIHOOD_ROWS[rowIdx];
              return (
                <div key={l} className="flex items-stretch gap-1.5">
                  <div className="flex w-[120px] shrink-0 flex-col justify-center pr-1 text-right">
                    <span className="truncate text-[12px] font-medium text-text-primary">
                      {LIKELIHOOD_LABELS[l]}
                    </span>
                    <span className="text-[11px] text-text-hint">Mức {l}</span>
                  </div>

                  <div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5">
                    {cells.map((cell) => {
                      const n = cell.points.length;
                      const isSelected =
                        selected?.likelihood === cell.likelihood &&
                        selected?.impact === cell.impact;
                      const intensity =
                        maxCount === 0 ? 0 : Math.round((n / maxCount) * 100);

                      const inner = (
                        <button
                          type="button"
                          onClick={() => handleClick(cell)}
                          disabled={!onSelectCell}
                          style={{
                            height: cellHeight,
                            background: LEVEL_COLOR[cell.level],
                            color: LEVEL_TEXT_COLOR[cell.level],
                            borderColor: isSelected
                              ? LEVEL_TEXT_COLOR[cell.level]
                              : "transparent",
                          }}
                          className={cn(
                            "relative flex w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-ctrl border-2 p-1 transition-all",
                            onSelectCell && "cursor-pointer hover:brightness-95",
                            !onSelectCell && "cursor-default",
                            isSelected && "ring-2 ring-brand ring-offset-1",
                            n === 0 && "opacity-55"
                          )}
                        >
                          {/* Dải cường độ theo số lượng */}
                          {n > 0 && (
                            <span
                              className="absolute inset-x-0 bottom-0 opacity-25"
                              style={{
                                height: `${Math.max(intensity, 8)}%`,
                                background: LEVEL_TEXT_COLOR[cell.level],
                              }}
                            />
                          )}

                          <span className="relative text-[18px] leading-6 font-bold">
                            {n > 0 ? n : ""}
                          </span>

                          {showCodes && n > 0 && n <= 2 ? (
                            <span className="relative w-full truncate text-[10px] leading-3 opacity-80">
                              {cell.points.map((p) => p.code).join(", ")}
                            </span>
                          ) : (
                            <span className="relative text-[10px] leading-3 opacity-70">
                              điểm {cell.score}
                            </span>
                          )}
                        </button>
                      );

                      return n > 0 ? (
                        <Tooltip
                          key={cell.impact}
                          content={
                            <span className="flex flex-col gap-0.5">
                              <b>
                                {LIKELIHOOD_LABELS[cell.likelihood]} ×{" "}
                                {IMPACT_LABELS[cell.impact]} = {cell.score} (
                                {cell.level})
                              </b>
                              {cell.points.slice(0, 6).map((p) => (
                                <span key={p.id}>
                                  {p.code} - {p.name}
                                </span>
                              ))}
                              {cell.points.length > 6 && (
                                <span>
                                  và {cell.points.length - 6} bản ghi khác
                                </span>
                              )}
                            </span>
                          }
                        >
                          {inner}
                        </Tooltip>
                      ) : (
                        <span key={cell.impact} className="flex">
                          {inner}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Nhãn trục ngang */}
            <div className="flex items-start gap-1.5">
              <span className="w-[120px] shrink-0" />
              <div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5">
                {IMPACT_COLS.map((i) => (
                  <span
                    key={i}
                    className="flex flex-col items-center text-center"
                  >
                    <span className="w-full truncate text-[12px] font-medium text-text-primary">
                      {IMPACT_LABELS[i]}
                    </span>
                    <span className="text-[11px] text-text-hint">Mức {i}</span>
                  </span>
                ))}
              </div>
            </div>

            <p className="text-center text-[12px] font-medium text-text-secondary">
              Mức độ ảnh hưởng
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-2.5">
        <MatrixLegend counts={counts} />
        <span className="text-[12px] text-text-secondary">
          {points.length === 0 ? emptyText : `Tổng ${points.length} bản ghi`}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thanh phân bố theo mức độ, dùng kèm heatmap hoặc trên dashboard     */
/* ------------------------------------------------------------------ */

export function LevelDistributionBar({
  counts,
  className,
}: {
  counts: Record<RiskLevelValue, number>;
  className?: string;
}) {
  const total = ALL_LEVELS.reduce((s, lv) => s + counts[lv], 0);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
        {ALL_LEVELS.map((lv) => {
          const pct = total === 0 ? 0 : (counts[lv] / total) * 100;
          if (pct === 0) return null;
          return (
            <span
              key={lv}
              title={`${lv}: ${counts[lv]}`}
              style={{
                width: `${pct}%`,
                background: LEVEL_TEXT_COLOR[lv],
              }}
            />
          );
        })}
      </div>
      <MatrixLegend counts={counts} />
    </div>
  );
}
