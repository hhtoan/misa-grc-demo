"use client";

import { useState } from "react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconInfoCircle,
  IconLock,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";

/* ==================================================================
   Bảng chấm điểm theo dòng.

   Nhận danh sách tiêu chí làm THAM SỐ, nên thêm hoặc bớt tiêu chí
   chỉ cần sửa file scoring-criteria.ts, không viết lại component.

   Ba tầng help text:
     1. Nhãn mức ngay trên ô chọn
     2. Mô tả ranh giới ở tooltip khi trỏ vào ô
     3. Bảng đầy đủ 5 mức mở ra khi bấm icon thông tin
   ================================================================== */

export interface ScoreSelectorLevel {
  value: number;
  label: string;
  description: string;
  example?: string;
}

export interface ScoreSelectorCriterion {
  key: string;
  label: string;
  question: string;
  levels: ScoreSelectorLevel[];
}

export type ScoreValue = Record<string, number | null>;

export interface ScoreSelectorProps {
  criteria: ScoreSelectorCriterion[];
  value: ScoreValue;
  onChange?: (next: ScoreValue) => void;
  /** Chỉ đọc, dùng ở trang chi tiết và cột đối chiếu của bước 4 */
  readOnly?: boolean;
  /**
   * Điểm để đối chiếu, thường là điểm cố hữu khi đang chấm điểm còn lại.
   * Hiện dấu neo trên thanh điểm để người dùng thấy mình đang hạ mấy bậc.
   */
  compareValue?: ScoreValue;
  /** Nhãn của cột đối chiếu, ví dụ "Cố hữu" */
  compareLabel?: string;
  /**
   * Điểm tối đa cho phép theo từng tiêu chí.
   * Điểm còn lại không được cao hơn điểm cố hữu, nên truyền điểm cố hữu
   * vào đây để khoá các ô cao hơn ngay tại giao diện.
   */
  maxValue?: ScoreValue;
  /** Lỗi theo từng tiêu chí */
  errors?: Record<string, string>;
  /** Mở sẵn bảng đầy đủ 5 mức, nên bật ở form thêm mới */
  expandedByDefault?: boolean;
  /** Tổng hợp hiển thị dưới bảng, do màn hình truyền vào */
  summary?: React.ReactNode;
}

export default function ScoreSelector({
  criteria,
  value,
  onChange,
  readOnly = false,
  compareValue,
  compareLabel = "Trước đó",
  maxValue,
  errors,
  expandedByDefault = false,
  summary,
}: ScoreSelectorProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (!expandedByDefault) return {};
    const out: Record<string, boolean> = {};
    criteria.forEach((c) => {
      out[c.key] = true;
    });
    return out;
  });

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function pick(key: string, v: number) {
    if (readOnly || !onChange) return;
    const limit = maxValue ? maxValue[key] : null;
    if (limit && v > limit) return;
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="flex flex-col gap-3">
      {criteria.map((c) => {
        const current = value[c.key] ?? null;
        const compare = compareValue ? (compareValue[c.key] ?? null) : null;
        const limit = maxValue ? (maxValue[c.key] ?? null) : null;
        const error = errors ? errors[c.key] : undefined;
        const open = !!expanded[c.key];
        const currentLevel = c.levels.find((l) => l.value === current);
        const gap = compare && current ? compare - current : 0;

        return (
          <section
            key={c.key}
            data-field={c.key}
            className={cn(
              "flex flex-col gap-2 rounded-card border p-3",
              error
                ? "border-lv-critical-border bg-lv-critical-bg/30"
                : "border-border-light",
            )}
          >
            {/* -------------------- Đầu dòng -------------------- */}
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                  {c.label}
                  {!readOnly && <span className="text-danger">*</span>}
                </p>
                <p className="text-[12px] leading-4 text-text-secondary">
                  {c.question}
                </p>
              </div>

              {compare !== null && (
                <span className="shrink-0 rounded-badge bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                  {compareLabel}: {compare}
                </span>
              )}

              <button
                type="button"
                onClick={() => toggle(c.key)}
                className="flex shrink-0 items-center gap-1 rounded-ctrl px-1.5 py-0.5 text-[12px] font-medium text-brand transition-colors hover:bg-brand-light"
                aria-expanded={open}
              >
                <IconInfoCircle size={14} />
                {open ? "Thu gọn tiêu chí" : "Xem tiêu chí"}
                <IconChevronDown
                  size={14}
                  className={cn("transition-transform", open && "rotate-180")}
                />
              </button>
            </div>

            {/* ----------------- Dải 5 ô chọn điểm ----------------- */}
            <div className="grid grid-cols-5 gap-1.5">
              {c.levels.map((lv) => {
                const active = current === lv.value;
                const locked = !!limit && lv.value > limit;
                const isCompare = compare === lv.value;

                return (
                  <button
                    key={lv.value}
                    type="button"
                    disabled={readOnly || locked}
                    onClick={() => pick(c.key, lv.value)}
                    title={
                      locked
                        ? `Không chọn được vì vượt mức ${compareLabel.toLowerCase()} ( ${limit})`
                        : lv.description
                    }
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-ctrl border px-1 py-2 text-center transition-all",
                      active
                        ? "border-brand bg-brand-light ring-1 ring-brand"
                        : "border-border-neutral bg-white",
                      !active &&
                        !readOnly &&
                        !locked &&
                        "hover:border-brand hover:bg-[#FAFAFA]",
                      locked && "cursor-not-allowed opacity-40",
                      readOnly && "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold",
                        active
                          ? "bg-brand text-white"
                          : "bg-surface-alt text-text-secondary",
                      )}
                    >
                      {locked ? <IconLock size={12} /> : lv.value}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] leading-3.5",
                        active
                          ? "font-semibold text-brand"
                          : "text-text-secondary",
                      )}
                    >
                      {lv.label}
                    </span>
                    {isCompare && (
                      <span className="text-[10px] leading-3 text-text-hint">
                        {compareLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* --------------- Mô tả mức đang chọn --------------- */}
            {currentLevel ? (
              <p className="rounded-ctrl bg-surface-alt px-2.5 py-2 text-[12px] leading-4 text-text-secondary">
                <b className="text-text-primary">
                  Mức {currentLevel.value} - {currentLevel.label}:
                </b>{" "}
                {currentLevel.description}
              </p>
            ) : (
              !readOnly && (
                <p className="px-0.5 text-[12px] text-text-hint">
                  Chưa chọn mức nào. Bấm <b>Xem tiêu chí</b> nếu cần đối chiếu
                  mô tả đầy đủ của cả 5 mức.
                </p>
              )
            )}

            {/* --------------- Nhắc mức chênh lệch --------------- */}
            {gap >= 3 && (
              <p className="flex items-start gap-1.5 text-[12px] leading-4 text-lv-medium-text">
                <IconAlertTriangle size={14} className="mt-px shrink-0" />
                Đang hạ <b>{gap} bậc</b> so với {compareLabel.toLowerCase()}.
                Nên nêu rõ luận cứ để người đọc hồ sơ hiểu căn cứ đánh giá.
              </p>
            )}

            {error && (
              <p className="flex items-start gap-1.5 text-[12px] leading-4 text-danger">
                <IconAlertTriangle size={14} className="mt-px shrink-0" />
                {error}
              </p>
            )}

            {/* ------------- Tầng 3: bảng đầy đủ 5 mức ------------- */}
            {open && (
              <div className="overflow-hidden rounded-ctrl border border-border-light">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-surface-alt">
                      <th className="w-[52px] px-2 py-1.5 text-[11px] font-semibold text-text-secondary">
                        Mức
                      </th>
                      <th className="w-[130px] px-2 py-1.5 text-[11px] font-semibold text-text-secondary">
                        Nhãn
                      </th>
                      <th className="px-2 py-1.5 text-[11px] font-semibold text-text-secondary">
                        Mô tả ranh giới
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.levels.map((lv) => (
                      <tr
                        key={lv.value}
                        className={cn(
                          "border-t border-border-light align-top",
                          current === lv.value && "bg-brand-light/40",
                        )}
                      >
                        <td className="px-2 py-1.5 text-[12px] font-semibold text-text-primary">
                          {lv.value}
                        </td>
                        <td className="px-2 py-1.5 text-[12px] font-medium text-text-primary">
                          {lv.label}
                        </td>
                        <td className="px-2 py-1.5 text-[12px] leading-4 text-text-secondary">
                          {lv.description}
                          {lv.example && (
                            <span className="mt-0.5 block text-[11px] text-text-hint">
                              Ví dụ: {lv.example}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {summary}
    </div>
  );
}
