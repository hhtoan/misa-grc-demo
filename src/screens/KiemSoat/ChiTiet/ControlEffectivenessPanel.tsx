"use client";

import { useMemo } from "react";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarClock,
  IconCircleCheck,
  IconFlask,
  IconHistory,
  IconInfoCircle,
  IconSettings,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  EffectivenessBadge,
  EmptyState,
  LifecycleStepper,
  MissingInfoCell,
  Tooltip,
} from "@/components/ui";
import { ContentCard } from "@/components/layout";
import { controlTestRepo, useCollection } from "@/lib/db";
import {
  designEffectivenessOf,
  effectivenessNarrative,
  operationEffectivenessOf,
  overallEffectivenessOf,
} from "@/lib/domain/control-utils";
import {
  controlMissingInfo,
  controlStageLabel,
  controlStageOf,
  controlStepViews,
  isTestOverdue,
  suggestControlAction,
  type ControlLifecycleInput,
} from "@/lib/domain/control-lifecycle";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/* ==================================================================
   Khối hiệu lực kiểm soát theo hai chiều.

   Trả lời đúng câu hỏi cốt lõi của CRO: kiểm soát này có đang hoạt
   động không, và nếu không thì phải làm gì.

   Điểm quan trọng: hai chiều dẫn tới HAI HÀNH ĐỘNG KHÁC NHAU, nên
   khối khuyến nghị chỉ đưa ra ĐÚNG MỘT việc ưu tiên cao nhất.
   ================================================================== */

interface ControlTestLite {
  id: string;
  controlId?: string;
  code?: string;
  testDate?: string;
  testerId?: string;
  result?: string;
  designResult?: string;
  operationResult?: string;
  conclusion?: string;
  note?: string;
}

export interface ControlEffectivenessPanelProps {
  control: ControlLifecycleInput & { code: string };
  /** Tên người kiểm tra gần nhất, màn hình cha tra cứu sẵn */
  testerName?: (id?: string) => string;
  /** Bấm nút Lập đợt kiểm tra */
  onCreateTest?: () => void;
  /** Bấm nút Sửa thiết kế */
  onEditDesign?: () => void;
  /** Bấm nút Lập hành động chấn chỉnh */
  onCreateKppn?: () => void;
  /** Bấm nút Gắn rủi ro */
  onLinkRisk?: () => void;
  editable?: boolean;
}

export default function ControlEffectivenessPanel({
  control,
  testerName,
  onCreateTest,
  onEditDesign,
  onCreateKppn,
  onLinkRisk,
  editable = true,
}: ControlEffectivenessPanelProps) {
  const tests = useCollection(controlTestRepo) as unknown as ControlTestLite[];

  /* --------------------------- Dữ liệu --------------------------- */

  const history = useMemo(
    () =>
      tests
        .filter((t) => t.controlId === control.id)
        .slice()
        .sort((a, b) => ((a.testDate ?? "") < (b.testDate ?? "") ? 1 : -1)),
    [tests, control.id],
  );

  const design = designEffectivenessOf(control);
  const operation = operationEffectivenessOf(control);
  const overall = overallEffectivenessOf(control);

  const steps = controlStepViews(control);
  const missing = controlMissingInfo(control);
  const stage = controlStageOf(control);
  const action = suggestControlAction(control);
  const testLate = isTestOverdue(control);

  const blockingCount = missing.filter((x) => x.blocking).length;

  /* ------------------------ Nút theo hành động ------------------- */

  function actionButton() {
    if (!editable || action.kind === "none") return null;

    if (action.kind === "redesign" && onEditDesign)
      return (
        <Button
          variant="primary"
          icon={<IconSettings size={16} />}
          onClick={onEditDesign}
        >
          Sửa thiết kế kiểm soát
        </Button>
      );

    if (action.kind === "enforce" && onCreateKppn)
      return (
        <Button
          variant="primary"
          icon={<IconUsers size={16} />}
          onClick={onCreateKppn}
        >
          Lập hành động chấn chỉnh
        </Button>
      );

    if (action.kind === "test" && onCreateTest)
      return (
        <Button
          variant="primary"
          icon={<IconFlask size={16} />}
          onClick={onCreateTest}
        >
          Lập đợt kiểm tra
        </Button>
      );

    if (action.kind === "link-risk" && onLinkRisk)
      return (
        <Button
          variant="primary"
          icon={<IconShieldCheck size={16} />}
          onClick={onLinkRisk}
        >
          Gắn rủi ro
        </Button>
      );

    return null;
  }

  const actionStyle: Record<string, string> = {
    danger: "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text",
    warning: "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
    info: "border-lv-info-border bg-lv-info-bg text-lv-info-text",
    success: "border-lv-low-border bg-lv-low-bg text-lv-low-text",
  };

  /* ============================ Render ========================= */

  return (
    <ContentCard className="flex flex-col gap-3 py-3">
      {/* ----------------------- Dòng tiêu đề ---------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-text-primary">
          Hiệu lực kiểm soát
        </span>

        <Badge tone={stage === "retired" ? "neutral" : "brand"} dot>
          {controlStageLabel(stage)}
        </Badge>

        {blockingCount > 0 && (
          <Tooltip content="Không xử lý thì chưa kết luận được kiểm soát có hoạt động hay không">
            <Badge tone="danger" size="sm">
              {blockingCount} mục chặn
            </Badge>
          </Tooltip>
        )}

        <span className="ml-auto">
          <MissingInfoCell items={missing} maxVisible={4} />
        </span>
      </div>

      {/* ------------------------ Dải 5 bước ----------------------- */}
      <LifecycleStepper steps={steps} />

      {/* -------------------- Ba ô kết luận ------------------------ */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <DimensionCard
          icon={<IconSettings size={16} />}
          dimension="Thiết kế"
          question="Nếu chạy đúng như mô tả thì có ngăn được rủi ro?"
          value={design}
          note="Không hiệu quả thì phải sửa chính kiểm soát"
        />
        <DimensionCard
          icon={<IconUsers size={16} />}
          dimension="Vận hành"
          question="Có đang được thực hiện đúng thiết kế không?"
          value={operation}
          note="Không hiệu quả thì phải nhắc người thực hiện"
        />
        <DimensionCard
          icon={<IconShieldCheck size={16} />}
          dimension="Hiệu quả chung"
          question="Kiểm soát này có đang bảo vệ rủi ro không?"
          value={overall}
          note="Thiết kế sai thì vận hành tốt cũng vô nghĩa"
          highlight
        />
      </div>

      {/* --------------------- Diễn giải kết luận ------------------- */}
      <div className="flex gap-2 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] leading-4 text-text-secondary">
        <IconInfoCircle size={15} className="mt-px shrink-0" />
        <span className="min-w-0 flex-1">
          {effectivenessNarrative(control)}
        </span>
      </div>

      {/* ------------------- Khuyến nghị hành động ------------------ */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-ctrl border px-3 py-2.5",
          actionStyle[action.tone],
        )}
      >
        {action.tone === "success" ? (
          <IconCircleCheck size={17} className="shrink-0" />
        ) : (
          <IconAlertTriangle size={17} className="shrink-0" />
        )}

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">
            {action.title}
          </span>
          <span className="block text-[12px] leading-4 opacity-90">
            {action.detail}
          </span>
        </span>

        {actionButton()}
      </div>

      {/* --------------------- Mốc kiểm tra ------------------------ */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ctrl px-3 py-2.5 text-[12px] leading-4",
          testLate
            ? "border border-lv-medium-border bg-lv-medium-bg text-lv-medium-text"
            : "bg-surface-alt text-text-secondary",
        )}
      >
        <IconCalendarClock size={15} className="shrink-0" />

        <span className="inline-flex shrink-0 items-center gap-1">
          Kiểm tra gần nhất{" "}
          <b>
            {control.lastTestDate
              ? formatDate(control.lastTestDate)
              : "chưa có"}
          </b>
        </span>

        <IconArrowRight size={14} className="shrink-0 opacity-60" />

        <span className="inline-flex shrink-0 items-center gap-1">
          Kỳ tới{" "}
          <b>
            {control.nextTestDate
              ? formatDate(control.nextTestDate)
              : "chưa đặt"}
          </b>
        </span>

        <span className="min-w-0 flex-1">
          {testLate
            ? "Đã quá hạn kiểm tra theo kế hoạch, kết luận hiện tại có thể không còn phản ánh thực tế."
            : ""}
        </span>

        <span className="inline-flex shrink-0 items-center gap-1">
          <IconFlask size={14} />
          <b>{history.length}</b> đợt kiểm tra
        </span>
      </div>

      {/* ------------------ Lịch sử theo hai chiều ------------------ */}
      <section className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
          <IconHistory size={15} className="text-brand" />
          Biến động hiệu lực qua các đợt kiểm tra
        </p>

        {history.length === 0 ? (
          <EmptyState
            icon={<IconFlask size={22} />}
            title="Chưa có đợt kiểm tra nào"
            description="Chưa kiểm tra thì chưa có bằng chứng về việc kiểm soát được thực hiện đúng thiết kế, nên hiệu lực vận hành vẫn là Chưa đánh giá."
            compact
          />
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-ctrl border border-border-light">
            {history.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-border-light px-3 py-2.5 last:border-b-0"
              >
                <span className="w-[92px] shrink-0 text-[12px] text-text-secondary">
                  {t.testDate ? formatDate(t.testDate) : "--"}
                </span>

                <span className="flex shrink-0 flex-wrap gap-1.5">
                  <EffectivenessBadge
                    size="sm"
                    dimension="Thiết kế"
                    short
                    value={t.designResult || t.result || "Chưa đánh giá"}
                  />
                  <EffectivenessBadge
                    size="sm"
                    dimension="Vận hành"
                    short
                    value={t.operationResult || t.result || "Chưa đánh giá"}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] leading-4 text-text-primary">
                    {t.conclusion || t.note || "Không có ghi chú"}
                  </span>
                  {testerName && t.testerId && (
                    <span className="block text-[11px] text-text-hint">
                      Người kiểm tra {testerName(t.testerId)}
                    </span>
                  )}
                </span>

                {t.code && (
                  <span className="shrink-0 text-[11px] font-medium text-brand">
                    {t.code}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ContentCard>
  );
}

/* ================================================================== */
/* Ô kết luận từng chiều                                               */
/* ================================================================== */

function DimensionCard({
  icon,
  dimension,
  question,
  value,
  note,
  highlight = false,
}: {
  icon: React.ReactNode;
  dimension: string;
  question: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-ctrl border p-3",
        highlight
          ? "border-brand bg-brand-light/30"
          : "border-border-light bg-white",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-ctrl",
            highlight
              ? "bg-brand text-white"
              : "bg-surface-alt text-icon-neutral",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-primary">
          {dimension}
        </span>
      </div>

      <EffectivenessBadge value={value} />

      <p className="text-[11px] leading-4 text-text-secondary">{question}</p>
      <p className="text-[11px] leading-4 text-text-hint">{note}</p>
    </div>
  );
}
