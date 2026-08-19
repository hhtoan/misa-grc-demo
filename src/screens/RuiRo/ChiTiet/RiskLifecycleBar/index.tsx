"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconMessage2,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";
import {
  Badge,
  LifecycleStepper,
  MissingInfoCell,
  Tooltip,
} from "@/components/ui";
import { ContentCard } from "@/components/layout";
import { controlRepo, useCollection, deficiencyRepo } from "@/lib/db";
import {
  isReviewOverdue,
  riskMissingInfo,
  riskStageLabel,
  riskStageOf,
  riskStepViews,
  type RiskLifecycleInput,
} from "@/lib/domain/risk-lifecycle";
import { residualStateHint, residualStateOf } from "@/lib/domain/risk-utils";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/* ==================================================================
   Dải vòng đời đặt ngay dưới PageHeader của hồ sơ rủi ro.

   Ba việc component này làm:
     1. Cho biết rủi ro đang ở giai đoạn nào trong 5 bước
     2. Chỉ ra hồ sơ còn thiếu gì, bấm được để nhảy sang form bổ sung
     3. Hiện dấu vết chấm điểm còn lại: ai chấm, ngày nào, luận cứ gì

   Component KHÔNG tự tính điểm, chỉ dẫn đường và nhắc.
   ================================================================== */

interface ControlLite {
  id: string;
  riskIds?: string[];
  status?: string;
}

/** Kiểm soát chưa phê duyệt thì chưa coi là đang bảo vệ rủi ro */
const NOT_YET_ACTIVE = new Set(["Nháp", "Chờ duyệt"]);

export interface RiskLifecycleBarProps {
  risk: RiskLifecycleInput & { code: string };
  /** Tên người chấm điểm còn lại gần nhất, màn hình cha tra cứu sẵn */
  assessorName?: string;
  /** Cho phép bấm vào bước để nhảy sang form sửa */
  editable?: boolean;
  /**
   * Số điểm yếu đang gắn với rủi ro này.
   *
   * Bước Điểm yếu là bước tuỳ chọn, nên trạng thái của nó suy từ dữ liệu
   * thật: có điểm yếu thì done, không có thì skipped màu xám. Tô xanh một
   * bước người dùng chưa làm là báo sai.
   */
  deficiencyCount?: number;
}

export default function RiskLifecycleBar({
  risk,
  assessorName,
  editable = true,
  deficiencyCount,
}: RiskLifecycleBarProps) {
  const router = useRouter();
  const controls = useCollection(controlRepo) as unknown as ControlLite[];
  const deficiencies = useCollection(deficiencyRepo) as unknown as {
    riskId?: string;
  }[];

  /**
   * Ưu tiên số do màn hình cha truyền vào để tránh đếm lại, nhưng vẫn tự
   * đếm được nếu nơi gọi chưa cập nhật. Nhờ vậy component dùng được ở cả
   * hồ sơ rủi ro và các chỗ nhúng khác mà không bắt buộc sửa nơi gọi.
   */
  const weaknessCount = useMemo(
    () =>
      deficiencyCount ??
      deficiencies.filter((d) => d.riskId === risk.id).length,
    [deficiencyCount, deficiencies, risk.id],
  );

  /* ------------------- Số kiểm soát đang phủ ------------------- */

  const controlCount = useMemo(
    () =>
      controls.filter(
        (c) =>
          (c.riskIds ?? []).includes(risk.id) &&
          !NOT_YET_ACTIVE.has(c.status ?? ""),
      ).length,
    [controls, risk.id],
  );

  /* ------------------------ Dữ liệu dẫn xuất -------------------- */

  const steps = useMemo(
    () =>
      riskStepViews(risk, controlCount, weaknessCount).map((s) => ({
        ...s,
        onClick: editable
          ? () => router.push(`/rui-ro/so-dang-ky/${risk.code}/sua`)
          : undefined,
      })),
    [risk, controlCount, editable, router],
  );

  const missing = useMemo(
    () => riskMissingInfo(risk, controlCount),
    [risk, controlCount],
  );

  const stage = riskStageOf(risk, controlCount);
  const resState = residualStateOf(risk);
  const reviewLate = isReviewOverdue(risk);

  const blockingCount = missing.filter((x) => x.blocking).length;

  /* ============================ Render ========================= */

  return (
    <ContentCard className="flex flex-col gap-3 py-3">
      {/* ----------------------- Dòng tiêu đề ---------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-text-primary">
          Tiến trình vòng đời rủi ro
        </span>

        <Badge tone={stage === "closed" ? "neutral" : "brand"} dot>
          {riskStageLabel(stage)}
        </Badge>

        {blockingCount > 0 && (
          <Tooltip content="Không bổ sung thì hồ sơ không đi tiếp được">
            <Badge tone="danger" size="sm">
              {blockingCount} mục chặn
            </Badge>
          </Tooltip>
        )}

        <span className="ml-auto">
          <MissingInfoCell items={missing} maxVisible={4} />
        </span>
      </div>

      {/* 7 bước × 116px = 928px sẽ chật ở màn 1366px, nên dùng compact
          (88px mỗi bước, tổng 704px). Mô tả bước vẫn xem được qua tooltip. */}
      <LifecycleStepper steps={steps} size="compact" />

      {/* --------------- Dấu vết chấm điểm còn lại ----------------- */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ctrl px-3 py-2.5 text-[12px] leading-4",
          resState === "current"
            ? "bg-surface-alt text-text-secondary"
            : "border border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
        )}
      >
        {resState === "current" ? (
          <IconShieldCheck size={16} className="shrink-0" />
        ) : (
          <IconAlertTriangle size={16} className="shrink-0" />
        )}

        <span className="min-w-0 flex-1">{residualStateHint(resState)}</span>

        {risk.residualAssessedAt && (
          <span className="inline-flex shrink-0 items-center gap-1">
            <IconCalendarClock size={14} />
            Chấm ngày <b>{formatDate(risk.residualAssessedAt)}</b>
          </span>
        )}

        {assessorName && (
          <span className="inline-flex shrink-0 items-center gap-1">
            <IconUser size={14} />
            <b>{assessorName}</b>
          </span>
        )}

        {controlCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1">
            <IconShieldCheck size={14} />
            <b>{controlCount}</b> kiểm soát đang phủ
          </span>
        )}
      </div>

      {/* -------------------- Luận cứ đánh giá --------------------- */}
      {risk.residualRationale && risk.residualRationale.trim() && (
        <div className="flex gap-2 rounded-ctrl border border-border-light px-3 py-2.5">
          <IconMessage2
            size={15}
            className="mt-px shrink-0 text-icon-neutral"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-text-primary">
              Luận cứ đánh giá điểm còn lại
            </span>
            <span className="block whitespace-pre-line text-[12px] leading-4 text-text-secondary">
              {risk.residualRationale}
            </span>
          </span>
        </div>
      )}

      {/* -------------------- Nhắc kỳ đánh giá --------------------- */}
      {reviewLate && (
        <div className="flex flex-wrap items-center gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg px-3 py-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconCalendarClock size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            Đã quá kỳ đánh giá lại theo kế hoạch, hạn{" "}
            <b>{formatDate(risk.reviewDate ?? "")}</b>. Số liệu hiện tại có thể
            không còn phản ánh đúng thực tế.
          </span>
        </div>
      )}
    </ContentCard>
  );
}
