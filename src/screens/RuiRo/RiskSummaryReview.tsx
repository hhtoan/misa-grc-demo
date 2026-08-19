"use client";

import {
  IconArrowRight,
  IconShieldCheck,
  IconTarget,
  IconTool,
} from "@tabler/icons-react";
import { Badge, EffectivenessBadge, RiskBadge, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";

/* ==================================================================
   Khối rà soát hồ sơ rủi ro.

   Component THUẦN TRÌNH BÀY: không gọi useCollection, không gọi
   useLookups, không đọc repo. Mọi tên đơn vị, tên người, tên mục tiêu
   đều do màn hình cha tra sẵn rồi truyền vào.

   Nhờ vậy dùng được ở hai nơi mà không sửa gì:
     - Bước 8 của wizard, xem lại trước khi lưu
     - Hồ sơ rủi ro, khối tóm tắt đầu trang (gắn ở lô D4)
   ================================================================== */

export interface ReviewControlItem {
  code: string;
  name?: string;
  type?: string | null;
  status?: string | null;
  isKeyControl?: boolean;
  /** Hiệu quả chung, màn hình cha tính sẵn bằng overallEffectivenessOf */
  effectiveness?: string;
  /** Chưa phê duyệt nên chưa được tính là đang bảo vệ rủi ro */
  pending?: boolean;
}

export interface ReviewSuggestion {
  likelihood: number;
  impact: number;
  hint: string;
}

export interface RiskSummaryReviewProps {
  /* --- Bước 1: bối cảnh --- */
  objectiveNames: string[];
  unitName: string;
  processName?: string;
  systemName?: string;

  /* --- Bước 2: nhận diện --- */
  name: string;
  description?: string;
  categoryName: string;
  ownerName: string;
  source?: string;
  identifiedDate?: string;
  isZeroTolerance?: boolean;

  /* --- Bước 3 và 6: điểm --- */
  inherentScore: number;
  inherentLevel: string;
  inherentLikelihood: number;
  inherentImpact: number;
  residualScore: number;
  residualLevel: string;
  residualLikelihood: number;
  residualImpact: number;
  residualRationale?: string;
  estimatedLoss?: number | null;

  /* --- Bước 4: kiểm soát --- */
  controls: ReviewControlItem[];
  noControlAccepted?: boolean;

  /* --- Bước 5: điểm yếu sơ bộ --- */
  weakness?: { name: string; priority: string } | null;

  /* --- Bước 7: phương án xử lý --- */
  treatment?: string;
  treatmentNote?: string;
  reviewDate?: string;

  /* --- Gợi ý của hệ thống, chỉ hiện khi có --- */
  suggestion?: ReviewSuggestion;

  /** Bản gọn, dùng khi nhúng vào hồ sơ rủi ro */
  compact?: boolean;
}

function formatMoney(v?: number | null): string {
  if (v === null || v === undefined) return "--";
  return `${v.toLocaleString("vi-VN")} đồng`;
}

export default function RiskSummaryReview(props: RiskSummaryReviewProps) {
  const {
    objectiveNames,
    unitName,
    processName,
    systemName,
    name,
    description,
    categoryName,
    ownerName,
    source,
    identifiedDate,
    isZeroTolerance,
    inherentScore,
    inherentLevel,
    inherentLikelihood,
    inherentImpact,
    residualScore,
    residualLevel,
    residualLikelihood,
    residualImpact,
    residualRationale,
    estimatedLoss,
    controls,
    noControlAccepted,
    weakness,
    treatment,
    treatmentNote,
    reviewDate,
    suggestion,
    compact = false,
  } = props;

  const activeControls = controls.filter((c) => !c.pending);

  /* Người dùng có ghi đè gợi ý của hệ thống không */
  const overridden =
    !!suggestion &&
    (suggestion.likelihood !== residualLikelihood ||
      suggestion.impact !== residualImpact);

  return (
    <div className="flex flex-col gap-4">
      {/* ================== Dải hai mức điểm ================== */}
      <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-surface-alt p-3">
        <span className="flex flex-col gap-1">
          <span className="text-[12px] text-text-secondary">Rủi ro vốn có</span>
          <RiskBadge level={inherentLevel as never} score={inherentScore} />
          <span className="text-[11px] text-text-hint">
            Khả năng {inherentLikelihood} × Ảnh hưởng {inherentImpact}
          </span>
        </span>

        <IconArrowRight size={18} className="text-icon-neutral" />

        <span className="flex flex-col gap-1">
          <span className="text-[12px] text-text-secondary">
            Rủi ro còn lại
          </span>
          <RiskBadge level={residualLevel as never} score={residualScore} />
          <span className="text-[11px] text-text-hint">
            Khả năng {residualLikelihood} × Ảnh hưởng {residualImpact}
          </span>
        </span>

        <span className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {isZeroTolerance && (
            <Tooltip content="Tổ chức không chấp nhận rủi ro này ở bất kỳ mức nào">
              <Badge tone="danger" dot>
                Không khoan nhượng
              </Badge>
            </Tooltip>
          )}

          {suggestion && (
            <Tooltip content={suggestion.hint}>
              <Badge tone={overridden ? "warning" : "neutral"} size="sm">
                {overridden
                  ? `Đã sửa khác gợi ý ${suggestion.likelihood} × ${suggestion.impact}`
                  : `Trùng gợi ý hệ thống ${suggestion.likelihood} × ${suggestion.impact}`}
              </Badge>
            </Tooltip>
          )}
        </span>
      </section>

      {/* ================== Bối cảnh và nhận diện ================== */}
      <section className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
        <Row label="Tên rủi ro" value={name} />
        <Row label="Nhóm rủi ro" value={categoryName} />
        <Row label="Đơn vị" value={unitName} />
        <Row label="Chủ sở hữu" value={ownerName} />
        <Row label="Nguồn rủi ro" value={source} />
        <Row label="Ngày nhận diện" value={identifiedDate} />
        {!compact && <Row label="Quy trình liên quan" value={processName} />}
        {!compact && <Row label="Hệ thống liên quan" value={systemName} />}
        <Row label="Ước lượng tổn thất" value={formatMoney(estimatedLoss)} />
        <Row
          label="Phương án xử lý"
          value={
            treatment
              ? `${treatment} · rà soát lại ${reviewDate || "chưa đặt"}`
              : undefined
          }
        />
      </section>

      {/* ================== Mục tiêu bị đe doạ ================== */}
      <section className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <IconTarget size={14} className="text-brand" />
          Mục tiêu bị đe doạ ({objectiveNames.length})
        </p>
        {objectiveNames.length === 0 ? (
          <p className="text-[12px] text-danger">
            Chưa gắn mục tiêu nào, hồ sơ chưa hợp lệ
          </p>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {objectiveNames.map((o) => (
              <Badge key={o} tone="brand" size="sm">
                {o}
              </Badge>
            ))}
          </span>
        )}
      </section>

      {/* ================== Mô tả và luận cứ ================== */}
      {!compact && (
        <section className="flex flex-col gap-3">
          <Block label="Mô tả rủi ro" value={description} />
          <Block
            label="Định hướng xử lý"
            value={treatmentNote}
            emptyNote={
              treatment && treatment !== "Chấp nhận"
                ? "Bắt buộc mô tả định hướng xử lý với phương án này"
                : undefined
            }
          />
          <Block
            label="Luận cứ đánh giá điểm còn lại"
            value={residualRationale}
          />
        </section>
      )}

      {/* ================== Kiểm soát đã gắn ================== */}
      <section className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <IconShieldCheck size={14} className="text-brand" />
          Kiểm soát đang bảo vệ rủi ro ({activeControls.length})
        </p>

        {controls.length === 0 ? (
          <p
            className={cn(
              "rounded-ctrl bg-surface-alt p-2.5 text-[12px]",
              noControlAccepted ? "text-text-secondary" : "text-lv-medium-text",
            )}
          >
            {noControlAccepted
              ? "Đã tuyên bố chấp nhận rủi ro, không áp dụng kiểm soát nào. Đây là quyết định có chủ đích, không phải bỏ trống."
              : "Chưa gắn kiểm soát nào."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {controls.map((c) => (
              <li
                key={c.code}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-ctrl border px-2.5 py-2",
                  c.pending
                    ? "border-border-light bg-surface-alt"
                    : "border-border-light bg-white",
                )}
              >
                <span className="text-[12px] font-medium text-brand">
                  {c.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                  {c.name}
                </span>
                {c.isKeyControl && (
                  <Badge tone="brand" size="sm">
                    Trọng yếu
                  </Badge>
                )}
                {c.type && (
                  <span className="text-[11px] text-text-secondary">
                    {c.type}
                  </span>
                )}
                {c.effectiveness && (
                  <EffectivenessBadge size="sm" short value={c.effectiveness} />
                )}
                {c.pending && (
                  <Tooltip content="Chưa phê duyệt nên chưa được tính là đang bảo vệ rủi ro">
                    <Badge tone="neutral" size="sm">
                      {c.status}
                    </Badge>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ================== Điểm yếu sơ bộ ================== */}
      {weakness && (
        <section className="flex flex-wrap items-center gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg px-3 py-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconTool size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            Có ghi nhận nghi ngờ điểm yếu: <b>{weakness.name}</b>
          </span>
          <Badge tone="warning" size="sm">
            {weakness.priority}
          </Badge>
        </section>
      )}
    </div>
  );
}

/* ================================================================== */
/* Thành phần phụ trợ                                                  */
/* ================================================================== */

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[13px] text-text-primary">
        {value && value.trim() ? value : "--"}
      </span>
    </div>
  );
}

function Block({
  label,
  value,
  emptyNote,
}: {
  label: string;
  value?: string;
  emptyNote?: string;
}) {
  const empty = !value || !value.trim();

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-text-secondary">{label}</span>
      {empty ? (
        <span
          className={cn(
            "text-[12px]",
            emptyNote ? "text-lv-medium-text" : "text-text-hint",
          )}
        >
          {emptyNote ?? "--"}
        </span>
      ) : (
        <span className="whitespace-pre-line text-[13px] leading-5 text-text-primary">
          {value}
        </span>
      )}
    </div>
  );
}
