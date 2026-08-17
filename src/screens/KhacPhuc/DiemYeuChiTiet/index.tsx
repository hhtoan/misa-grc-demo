"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconClipboardCheck,
  IconClockExclamation,
  IconEdit,
  IconExternalLink,
  IconFileSearch,
  IconHistory,
  IconHourglass,
  IconInfoCircle,
  IconPlus,
  IconShieldCheck,
  IconStethoscope,
  IconTool,
  IconTrash,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  CodeCell,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  Modal,
  Radio,
  ReadField,
  RiskBadge,
  RowActions,
  StatusBadge,
  Tabs,
  Textarea,
  TitleCell,
  Tooltip,
  UserCell,
  useToast,
  type Column,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import {
  controlRepo,
  controlTestRepo,
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  deficiencyAging,
  deficiencyDaysToDue,
  deficiencyNextTransitions,
  isDeficiencyDeletable,
  isDeficiencyDueSoon,
  isDeficiencyEditable,
  isDeficiencyOverdue,
  isKppnBehindSchedule,
  isKppnOverdue,
  isMissingKppn,
  isMissingRootCause,
  needRootCause,
} from "@/lib/domain/kppn-utils";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import type {
  Control,
  ControlTest,
  Deficiency,
  GrcEvent,
  Kppn,
  Risk,
} from "@/lib/domain/schema";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

type TabKey = "tong-quan" | "kppn" | "nguon-goc" | "lich-su";
type Lookups = ReturnType<typeof useLookups>;

/* ================================================================== */
/* Wrapper: tìm bản ghi rồi phân nhánh                                 */
/* ================================================================== */

export default function DiemYeuChiTietScreen({ code }: { code: string }) {
  const router = useRouter();
  const deficiencies = useCollection(deficiencyRepo);

  const deficiency = useMemo(
    () => deficiencies.find((d) => d.code === code || d.id === code),
    [deficiencies, code],
  );

  if (!deficiency) {
    return (
      <PageContainer>
        <PageHeader title="Chi tiết điểm yếu" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy điểm yếu"
              description={`Không có bản ghi nào ứng với mã ${code}. Có thể bản ghi đã bị xoá hoặc đường dẫn không đúng.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/khac-phuc/diem-yeu")}
                >
                  Về sổ theo dõi điểm yếu
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return <ChiTietContent deficiency={deficiency} />;
}

/* ================================================================== */
/* Content: deficiency luôn tồn tại                                    */
/* ================================================================== */

function ChiTietContent({ deficiency }: { deficiency: Deficiency }) {
  const router = useRouter();
  const toast = useToast();
  const { hasRole } = useSession();
  const lk = useLookups();

  const kppns = useCollection(kppnRepo);
  const controls = useCollection(controlRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);
  const tests = useCollection(controlTestRepo);

  const [tab, setTab] = useState<TabKey>("tong-quan");
  const [transiting, setTransiting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = hasRole("admin", "qtrr", "owner");

  /* ---------------------- Dữ liệu liên kết ---------------------- */

  const linkedKppns = useMemo(
    () =>
      kppns
        .filter((k) => k.deficiencyId === deficiency.id)
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    [kppns, deficiency.id],
  );

  const control = useMemo<Control | null>(
    () => controls.find((c) => c.id === deficiency.controlId) ?? null,
    [controls, deficiency.controlId],
  );

  const risk = useMemo<Risk | null>(
    () => risks.find((r) => r.id === deficiency.riskId) ?? null,
    [risks, deficiency.riskId],
  );

  const event = useMemo<GrcEvent | null>(
    () => events.find((e) => e.id === deficiency.eventId) ?? null,
    [events, deficiency.eventId],
  );

  /** Đợt kiểm tra gốc: tìm theo deficiencyId hoặc theo mã tham chiếu */
  const sourceTest = useMemo<ControlTest | null>(
    () =>
      tests.find(
        (x) =>
          x.deficiencyId === deficiency.id ||
          (!!deficiency.sourceRef && x.code === deficiency.sourceRef),
      ) ?? null,
    [tests, deficiency.id, deficiency.sourceRef],
  );

  /* --------------------------- Chỉ số --------------------------- */

  const total = linkedKppns.length;
  const done = linkedKppns.filter((k) => k.status === "Hoàn thành").length;
  const openKppn = linkedKppns.filter(
    (k) => k.status !== "Hoàn thành" && k.status !== "Huỷ",
  ).length;
  const overdueKppn = linkedKppns.filter((k) => isKppnOverdue(k)).length;
  const donePct = total === 0 ? 0 : Math.round((done / total) * 100);
  const totalCost = linkedKppns.reduce((s, k) => s + (k.estimatedCost ?? 0), 0);

  const editable = isDeficiencyEditable(deficiency.status);
  const transitions = deficiencyNextTransitions(deficiency.status);
  const remain = deficiencyDaysToDue(deficiency);
  const aging = deficiencyAging(deficiency);

  /* --------------------------- Hành động ------------------------ */

  function goEdit() {
    if (!editable) {
      toast.warning(
        "Không sửa được",
        `Điểm yếu đang ở trạng thái ${deficiency.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/khac-phuc/diem-yeu/${deficiency.code}/sua`);
  }

  function confirmDelete() {
    if (!isDeficiencyDeletable(deficiency, total)) {
      toast.error(
        "Không xoá được",
        total > 0
          ? `${deficiency.code} đang có ${total} hành động KPPN gắn kèm. Hãy xoá các hành động đó trước.`
          : "Chỉ xoá được điểm yếu ở trạng thái Mới ghi nhận.",
      );
      return;
    }
    setDeleting(true);
  }

  function createKppn() {
    router.push(`/khac-phuc/kppn/them-moi?deficiency=${deficiency.code}`);
  }

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => router.push("/khac-phuc/diem-yeu")}
        title={
          <span className="flex items-center gap-2">
            <span className="text-brand">{deficiency.code}</span>
            <span className="truncate">{deficiency.name}</span>
          </span>
        }
        badge={
          <span className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={deficiency.status} />
            <RiskBadge level={deficiency.severity} />
          </span>
        }
        actions={
          canEdit && (
            <>
              {isDeficiencyDeletable(deficiency, total) && (
                <Button
                  variant="danger-outline"
                  icon={<IconTrash size={16} />}
                  onClick={confirmDelete}
                >
                  Xoá
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<IconTool size={16} />}
                onClick={createKppn}
              >
                Tạo hành động KPPN
              </Button>
              <Button
                variant="secondary"
                icon={<IconEdit size={16} />}
                onClick={goEdit}
                disabled={!editable}
              >
                Sửa
              </Button>
              <Button
                variant="primary"
                icon={<IconArrowRight size={16} />}
                onClick={() => setTransiting(true)}
                disabled={transitions.length === 0}
              >
                Chuyển trạng thái
              </Button>
            </>
          )
        }
      />

      <PageBody className="pt-3">
        <div className="flex flex-col gap-4">
          {/* ================== Dải cảnh báo ================== */}
          {isDeficiencyOverdue(deficiency) && (
            <AlertBar
              tone="danger"
              title={`Quá hạn khắc phục ${Math.abs(remain ?? 0)} ngày`}
              description={`Hạn khắc phục là ${formatDate(deficiency.dueDate)}, điểm yếu đã tồn tại ${aging} ngày kể từ khi phát hiện.`}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("kppn")}
                >
                  Xem hành động
                </Button>
              }
            />
          )}

          {isMissingRootCause(deficiency) && (
            <AlertBar
              tone="danger"
              title="Chưa phân tích nguyên nhân gốc"
              description={`Điểm yếu mức ${deficiency.severity} bắt buộc phân tích nguyên nhân gốc. Thiếu nội dung này thì không chuyển được sang trạng thái Đã lập KPPN.`}
              action={
                canEdit && editable ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    onClick={goEdit}
                  >
                    Bổ sung ngay
                  </Button>
                ) : undefined
              }
            />
          )}

          {isMissingKppn(deficiency, total) && (
            <AlertBar
              tone="warning"
              title={`Điểm yếu mức ${deficiency.severity} chưa có hành động khắc phục`}
              description="Theo quy định, điểm yếu từ mức Cao trở lên bắt buộc phải có hành động khắc phục và phòng ngừa."
              action={
                canEdit ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    onClick={createKppn}
                  >
                    Lập hành động
                  </Button>
                ) : undefined
              }
            />
          )}

          {!deficiency.dueDate && deficiency.status !== "Đã đóng" && (
            <AlertBar
              tone="warning"
              title="Chưa đặt hạn khắc phục"
              description="Điểm yếu không có hạn nên không xuất hiện trong danh sách quá hạn và khó theo dõi tiến độ."
              action={
                canEdit && editable ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    onClick={goEdit}
                  >
                    Đặt hạn
                  </Button>
                ) : undefined
              }
            />
          )}

          {overdueKppn > 0 && (
            <AlertBar
              tone="warning"
              title={`${overdueKppn} hành động KPPN đang quá hạn`}
              description="Tiến độ khắc phục điểm yếu này đang bị chậm so với kế hoạch."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("kppn")}
                >
                  Xem chi tiết
                </Button>
              }
            />
          )}

          {!editable && (
            <AlertBar
              tone="info"
              title={`Điểm yếu đang ở trạng thái ${deficiency.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung. Mở lại điểm yếu nếu cần cập nhật."
            />
          )}

          {/* ================== Thẻ tổng quan ================== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <ContentCard className="flex flex-col justify-center gap-1">
              <p className="text-[12px] text-text-secondary">
                Mức nghiêm trọng
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={deficiency.severity} />
                {needRootCause(deficiency) && (
                  <Tooltip content="Mức này bắt buộc phân tích nguyên nhân gốc và lập KPPN">
                    <Badge tone="neutral" size="sm">
                      Bắt buộc NNG
                    </Badge>
                  </Tooltip>
                )}
              </div>
              <p className="text-[11px] text-text-hint">
                Đã tồn tại {aging} ngày kể từ{" "}
                {formatDate(deficiency.detectedDate)}
              </p>
            </ContentCard>

            <ContentCard className="flex flex-col justify-center gap-1.5">
              <p className="text-[12px] text-text-secondary">
                Tiến độ khắc phục
              </p>
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-[24px] leading-8 font-semibold",
                    donePct === 100 ? "text-lv-low-text" : "text-text-primary",
                  )}
                >
                  {donePct}%
                </span>
                <span className="text-[12px] text-text-secondary">
                  {done}/{total} hành động
                </span>
              </div>
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    donePct === 100 ? "bg-success" : "bg-brand",
                  )}
                  style={{ width: `${donePct}%` }}
                />
              </span>
              <p className="text-[11px] text-text-hint">
                {openKppn} hành động đang mở
                {totalCost > 0
                  ? `, chi phí ước tính ${formatMoney(totalCost)} VNĐ`
                  : ""}
              </p>
            </ContentCard>

            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">Hạn khắc phục</p>
              {deficiency.dueDate ? (
                <>
                  <p
                    className={cn(
                      "text-[20px] leading-7 font-semibold",
                      isDeficiencyOverdue(deficiency)
                        ? "text-danger"
                        : isDeficiencyDueSoon(deficiency)
                          ? "text-lv-medium-text"
                          : "text-text-primary",
                    )}
                  >
                    {formatDate(deficiency.dueDate)}
                  </p>
                  <p className="text-[11px] text-text-hint">
                    {remain === null
                      ? ""
                      : remain < 0
                        ? `Đã quá hạn ${Math.abs(remain)} ngày`
                        : `Còn ${remain} ngày`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[20px] leading-7 font-semibold text-lv-medium-text">
                    Chưa đặt
                  </p>
                  <p className="text-[11px] text-text-hint">
                    Không theo dõi được tiến độ
                  </p>
                </>
              )}
            </ContentCard>

            <ContentCard className="flex flex-col justify-center gap-1">
              <p className="text-[12px] text-text-secondary">Nguồn phát hiện</p>
              <p className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
                <SourceIcon type={deficiency.sourceType} />
                {deficiency.sourceType}
              </p>
              <p className="truncate text-[11px] text-text-hint">
                {deficiency.sourceRef
                  ? `Tham chiếu ${deficiency.sourceRef}`
                  : "Chưa có mã tham chiếu"}
              </p>
            </ContentCard>
          </div>

          {/* ====================== Khối tab ====================== */}
          <ContentCard padded={false} className="overflow-hidden">
            <div className="px-3">
              <Tabs
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
                items={[
                  { key: "tong-quan", label: "Thông tin chung" },
                  {
                    key: "kppn",
                    label: "Hành động khắc phục & phòng ngừa",
                    count: total,
                  },
                  { key: "nguon-goc", label: "Nguồn gốc & liên kết" },
                  { key: "lich-su", label: "Lịch sử" },
                ]}
              />
            </div>

            <div className="p-4">
              {tab === "tong-quan" && (
                <TabTongQuan deficiency={deficiency} lk={lk} />
              )}
              {tab === "kppn" && (
                <TabKppn
                  rows={linkedKppns}
                  lk={lk}
                  canEdit={canEdit}
                  onCreate={createKppn}
                />
              )}
              {tab === "nguon-goc" && (
                <TabNguonGoc
                  control={control}
                  risk={risk}
                  event={event}
                  test={sourceTest}
                  lk={lk}
                />
              )}
              {tab === "lich-su" && (
                <TabLichSu
                  deficiency={deficiency}
                  kppns={linkedKppns}
                  test={sourceTest}
                />
              )}
            </div>
          </ContentCard>
        </div>
      </PageBody>

      {/* ======================== Hộp thoại ======================== */}
      <TransitionModal
        open={transiting}
        deficiency={deficiency}
        kppnList={linkedKppns}
        onClose={() => setTransiting(false)}
        onDone={(msg, detail) => {
          setTransiting(false);
          toast.success(msg, detail);
        }}
        onError={(msg, detail) => toast.error(msg, detail)}
      />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          deficiencyRepo.remove(deficiency.id);
          setDeleting(false);
          toast.success("Đã xoá", `${deficiency.code} đã được xoá.`);
          router.push("/khac-phuc/diem-yeu");
        }}
        tone="danger"
        title="Xoá điểm yếu kiểm soát"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deficiency.code}</b>? Hành động này không
            thể hoàn tác.
          </>
        }
        confirmText="Xoá"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Thành phần phụ trợ                                        */
/* ================================================================== */

function SourceIcon({ type }: { type: string }) {
  if (type === "Kiểm tra kiểm soát")
    return <IconShieldCheck size={16} className="text-brand" />;
  if (type === "Sự kiện")
    return <IconBolt size={16} className="text-lv-medium-text" />;
  if (type === "Kiểm toán nội bộ")
    return <IconFileSearch size={16} className="text-info" />;
  return <IconStethoscope size={16} className="text-icon-neutral" />;
}

function AlertBar({
  tone,
  title,
  description,
  action,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const style = {
    info: "border-lv-info-border bg-lv-info-bg text-lv-info-text",
    warning: "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
    danger: "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text",
  }[tone];

  const Icon =
    tone === "info"
      ? IconInfoCircle
      : tone === "warning"
        ? IconAlertTriangle
        : IconClockExclamation;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5",
        style,
      )}
    >
      <Icon size={18} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{title}</p>
        {description && (
          <p className="text-[12px] leading-4 opacity-90">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border-light pb-1.5">
        <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
        {note && <span className="text-[12px] text-text-hint">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function SummaryLine({
  items,
  right,
}: {
  items: {
    label: string;
    value: number;
    tone?: "brand" | "success" | "warning" | "danger" | "info";
  }[];
  right?: React.ReactNode;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    success: "bg-lv-low-bg text-lv-low-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
    info: "bg-lv-info-bg text-lv-info-text",
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => (
        <span
          key={it.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-ctrl px-2.5 py-1 text-[12px] font-medium",
            it.tone ? style[it.tone] : "bg-surface-alt text-text-secondary",
          )}
        >
          {it.label}
          <b className="text-[13px]">{it.value}</b>
        </span>
      ))}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

/* ================================================================== */
/* Tab 1: Thông tin chung                                        */
/* ================================================================== */

function TabTongQuan({
  deficiency,
  lk,
}: {
  deficiency: Deficiency;
  lk: Lookups;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Thông tin định danh">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Mã điểm yếu">
            <b className="text-brand">{deficiency.code}</b>
          </ReadField>
          <ReadField label="Mức nghiêm trọng">
            <RiskBadge level={deficiency.severity} />
          </ReadField>
          <ReadField label="Trạng thái">
            <StatusBadge status={deficiency.status} />
          </ReadField>
          <ReadField label="Đơn vị">{lk.unitName(deficiency.unitId)}</ReadField>
          <ReadField label="Người chịu trách nhiệm">
            <UserCell
              name={lk.employeeName(deficiency.ownerId, "Chưa gán")}
              sub={lk.employeeById(deficiency.ownerId)?.title}
              size={26}
            />
          </ReadField>
          <ReadField label="Nguồn phát hiện">
            <span className="inline-flex items-center gap-1.5">
              <SourceIcon type={deficiency.sourceType} />
              {deficiency.sourceType}
            </span>
          </ReadField>
          <ReadField label="Ngày phát hiện">
            {formatDate(deficiency.detectedDate)}
          </ReadField>
          <ReadField label="Hạn khắc phục">
            {deficiency.dueDate ? (
              <span
                className={cn(
                  isDeficiencyOverdue(deficiency) && "font-medium text-danger",
                  isDeficiencyDueSoon(deficiency) &&
                    !isDeficiencyOverdue(deficiency) &&
                    "font-medium text-lv-medium-text",
                )}
              >
                {formatDate(deficiency.dueDate)}
                {isDeficiencyOverdue(deficiency) ? " (quá hạn)" : ""}
              </span>
            ) : (
              <span className="text-lv-medium-text">Chưa đặt</span>
            )}
          </ReadField>
          <ReadField label="Mã tham chiếu">
            {deficiency.sourceRef || "--"}
          </ReadField>
        </div>
      </Section>

      <Section title="Mô tả điểm yếu">
        <p className="text-[13px] leading-5 whitespace-pre-line text-text-primary">
          {deficiency.description || "--"}
        </p>
      </Section>

      <Section
        title="Phân tích nguyên nhân gốc"
        note={
          needRootCause(deficiency)
            ? "Bắt buộc với mức Cao trở lên hoặc đã lập KPPN"
            : "Không bắt buộc nhưng nên có"
        }
      >
        {deficiency.rootCause.trim() ? (
          <p className="text-[13px] leading-5 whitespace-pre-line text-text-primary">
            {deficiency.rootCause}
          </p>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 rounded-ctrl border px-3 py-2.5 text-[12px]",
              needRootCause(deficiency)
                ? "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text"
                : "border-dashed border-border-neutral text-text-hint",
            )}
          >
            <IconAlertTriangle size={15} className="shrink-0" />
            {needRootCause(deficiency)
              ? "Chưa phân tích nguyên nhân gốc. Đây là điều kiện bắt buộc để chuyển sang Đã lập KPPN."
              : "Chưa phân tích nguyên nhân gốc."}
          </div>
        )}
      </Section>

      <Section title="Thông tin quản trị">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Ghi chú trạng thái">
            {deficiency.statusNote || "--"}
          </ReadField>
          <ReadField label="Người tạo">
            {deficiency.createdBy || "--"}
          </ReadField>
          <ReadField label="Số ngày tồn tại">
            {deficiencyAging(deficiency)} ngày
          </ReadField>
          <ReadField label="Ngày tạo">
            {formatDateTime(deficiency.createdAt)}
          </ReadField>
          <ReadField label="Cập nhật gần nhất">
            {formatDateTime(deficiency.updatedAt)}
          </ReadField>
        </div>
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 2: Hành động KPPN                                        */
/* ================================================================== */

function TabKppn({
  rows,
  lk,
  canEdit,
  onCreate,
}: {
  rows: Kppn[];
  lk: Lookups;
  canEdit: boolean;
  onCreate: () => void;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconTool size={24} />}
        title="Chưa có hành động khắc phục và phòng ngừa"
        description="GRC chỉ điều phối, việc thực thi được giao sang AMIS Công việc hoặc JIRA."
        compact
        action={
          canEdit ? (
            <Button
              variant="primary"
              icon={<IconPlus size={16} />}
              onClick={onCreate}
            >
              Tạo hành động KPPN
            </Button>
          ) : undefined
        }
      />
    );
  }

  const columns: Column<Kppn>[] = [
    {
      key: "code",
      header: "Mã",
      width: 150,
      render: (k) => (
        <CodeCell
          code={k.code}
          onClick={() => router.push(`/khac-phuc/kppn/${k.code}`)}
        />
      ),
    },
    {
      key: "name",
      header: "Tên hành động",
      minWidth: 300,
      render: (k) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{k.name}</span>
              {isKppnOverdue(k) && (
                <Badge tone="danger" size="sm">
                  Quá hạn
                </Badge>
              )}
              {isKppnBehindSchedule(k) && !isKppnOverdue(k) && (
                <Tooltip content="Tiến độ thực tế chậm hơn kỳ vọng theo thời gian">
                  <Badge tone="warning" size="sm">
                    Chậm
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={`${k.type} - ${k.executionSystem}`}
        />
      ),
    },
    {
      key: "assignee",
      header: "Người thực hiện",
      width: 200,
      render: (k) => (
        <UserCell name={lk.employeeName(k.assigneeId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "progress",
      header: "Tiến độ",
      width: 150,
      render: (k) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
            <span
              className={cn(
                "block h-full rounded-full",
                k.progress >= 100 ? "bg-success" : "bg-brand",
              )}
              style={{ width: `${k.progress}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right text-[12px] text-text-secondary">
            {k.progress}%
          </span>
        </span>
      ),
    },
    {
      key: "due",
      header: "Hạn hoàn thành",
      width: 135,
      render: (k) => (
        <span className={cn(isKppnOverdue(k) && "font-medium text-danger")}>
          {formatDate(k.dueDate)}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Chi phí ước tính",
      width: 145,
      align: "right",
      render: (k) => formatMoney(k.estimatedCost) || "--",
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 150,
      render: (k) => <StatusBadge status={k.status} />,
    },
    {
      key: "external",
      header: "",
      width: 60,
      align: "right",
      render: (k) =>
        k.externalUrl ? (
          <RowActions>
            <Tooltip
              content={`Mở ${k.externalTaskCode} trên ${k.executionSystem}`}
            >
              <IconButton
                label="Mở hệ thống nguồn"
                onClick={() => window.open(k.externalUrl, "_blank")}
              >
                <IconExternalLink size={16} />
              </IconButton>
            </Tooltip>
          </RowActions>
        ) : null,
    },
  ];

  const done = rows.filter((k) => k.status === "Hoàn thành").length;
  const running = rows.filter(
    (k) => k.status !== "Hoàn thành" && k.status !== "Huỷ",
  ).length;
  const overdue = rows.filter((k) => isKppnOverdue(k)).length;
  const cost = rows.reduce((s, k) => s + (k.estimatedCost ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <SummaryLine
        items={[
          { label: "Tổng hành động", value: rows.length, tone: "brand" },
          { label: "Hoàn thành", value: done, tone: "success" },
          { label: "Đang mở", value: running, tone: "info" },
          { label: "Quá hạn", value: overdue, tone: "danger" },
        ]}
        right={
          <span className="flex items-center gap-2 text-[12px] text-text-secondary">
            Chi phí ước tính{" "}
            <b className="text-text-primary">{formatMoney(cost)}</b> VNĐ
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                compact
                icon={<IconPlus size={14} />}
                onClick={onCreate}
              >
                Thêm
              </Button>
            )}
          </span>
        }
      />

      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(k) => k.id}
          onRowClick={(k) => router.push(`/khac-phuc/kppn/${k.code}`)}
          rowClassName={(k) =>
            isKppnOverdue(k) ? "!bg-lv-critical-bg" : undefined
          }
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab 3: Nguồn gốc và liên kết                                        */
/* ================================================================== */

function TabNguonGoc({
  control,
  risk,
  event,
  test,
  lk,
}: {
  control: Control | null;
  risk: Risk | null;
  event: GrcEvent | null;
  test: ControlTest | null;
  lk: Lookups;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-5">
      {/* Đợt kiểm tra gốc */}
      {test && (
        <Section
          title="Đợt kiểm tra kiểm soát gốc"
          note="Điểm yếu này phát sinh từ kết quả kiểm tra hiệu lực"
        >
          <div className="flex flex-col gap-2 rounded-ctrl border border-border-light p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
                <IconClipboardCheck size={15} />
              </span>
              <b className="text-[13px] text-brand">{test.code}</b>
              <span className="text-[12px] text-text-secondary">
                {test.period || "không rõ kỳ"} - kiểm tra{" "}
                {formatDate(test.testDate)}
              </span>
              <span className="ml-auto">
                <StatusBadge status={test.result} />
              </span>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-3">
              <ReadField label="Người kiểm tra">
                <UserCell
                  name={lk.employeeName(test.testerId, "Chưa gán")}
                  size={22}
                />
              </ReadField>
              <ReadField label="Phương pháp">{test.method}</ReadField>
              <ReadField label="Cỡ mẫu / mẫu lỗi">
                {test.sampleSize} / {test.failCount}
              </ReadField>
              <ReadField label="Phát hiện" className="md:col-span-3">
                <span className="leading-5 whitespace-pre-line">
                  {test.finding || "--"}
                </span>
              </ReadField>
              <ReadField label="Khuyến nghị" className="md:col-span-3">
                <span className="leading-5 whitespace-pre-line">
                  {test.recommendation || "--"}
                </span>
              </ReadField>
            </div>

            <div className="border-t border-border-light pt-2">
              <Button
                variant="text"
                size="sm"
                compact
                onClick={() => router.push("/kiem-soat/ket-qua-kiem-tra")}
              >
                Tới màn hình kết quả kiểm tra
              </Button>
            </div>
          </div>
        </Section>
      )}

      {/* Kiểm soát */}
      <Section title="Kiểm soát liên quan">
        {control ? (
          <button
            type="button"
            onClick={() => router.push(`/kiem-soat/so-dang-ky/${control.code}`)}
            className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
              <IconShieldCheck size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-text-primary">
                <b className="text-brand">{control.code}</b> {control.name}
              </p>
              <p className="truncate text-[12px] text-text-secondary">
                {control.type} - {control.nature} - {control.frequency} -{" "}
                {lk.employeeName(control.ownerId)}
              </p>
            </div>
            {control.isKeyControl && <Badge tone="brand">Trọng yếu</Badge>}
            {control.lastTestResult && (
              <StatusBadge status={control.lastTestResult} />
            )}
            <StatusBadge status={control.status} />
          </button>
        ) : (
          <p className="text-[13px] text-text-hint">Chưa gắn kiểm soát nào.</p>
        )}
      </Section>

      {/* Rủi ro */}
      <Section title="Rủi ro bị ảnh hưởng">
        {risk ? (
          <button
            type="button"
            onClick={() => router.push(`/rui-ro/so-dang-ky/${risk.code}`)}
            className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-medium-bg text-lv-medium-text">
              <IconAlertTriangle size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-text-primary">
                <b className="text-brand">{risk.code}</b> {risk.name}
              </p>
              <p className="truncate text-[12px] text-text-secondary">
                {lk.categoryName(risk.categoryId)} - {lk.unitName(risk.unitId)}{" "}
                - {lk.employeeName(risk.ownerId)}
              </p>
            </div>
            {risk.isZeroTolerance && <Badge tone="danger">KKN</Badge>}
            <RiskBadge
              level={residualLevelOf(risk)}
              score={residualScoreOf(risk)}
            />
            <StatusBadge status={risk.status} />
          </button>
        ) : (
          <p className="text-[13px] text-text-hint">
            Chưa gắn rủi ro nào. Nên gắn để đánh giá lại mức rủi ro còn lại sau
            khi khắc phục.
          </p>
        )}
      </Section>

      {/* Sự kiện */}
      <Section title="Sự kiện gốc">
        {event ? (
          <button
            type="button"
            onClick={() => router.push(`/su-kien/so-theo-doi/${event.code}`)}
            className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-high-bg text-lv-high-text">
              <IconBolt size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-text-primary">
                <b className="text-brand">{event.code}</b> {event.name}
              </p>
              <p className="truncate text-[12px] text-text-secondary">
                Xảy ra {formatDate(event.occurredDate)} -{" "}
                {lk.unitName(event.unitId)}
              </p>
            </div>
            <RiskBadge level={event.severity} />
            <StatusBadge status={event.status} />
          </button>
        ) : (
          <p className="text-[13px] text-text-hint">
            Điểm yếu này không phát sinh từ sự kiện nào.
          </p>
        )}
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 4: Lịch sử                                        */
/* ================================================================== */

interface TimelineItem {
  date: string;
  title: string;
  description?: string;
  tone: "brand" | "success" | "warning" | "danger" | "neutral";
  icon: React.ReactNode;
}

function TabLichSu({
  deficiency,
  kppns,
  test,
}: {
  deficiency: Deficiency;
  kppns: Kppn[];
  test: ControlTest | null;
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];

    if (test) {
      out.push({
        date: test.testDate,
        title: `Kiểm tra kiểm soát ${test.code}: ${test.result}`,
        description: test.finding || undefined,
        tone: test.result === "Hiệu quả" ? "success" : "warning",
        icon: <IconClipboardCheck size={14} />,
      });
    }

    out.push({
      date: deficiency.detectedDate,
      title: `Ghi nhận điểm yếu ${deficiency.code}`,
      description: `Nguồn ${deficiency.sourceType}, mức ${deficiency.severity}.`,
      tone:
        deficiency.severity === "Cao" || deficiency.severity === "Trọng yếu"
          ? "danger"
          : "warning",
      icon: <IconAlertTriangle size={14} />,
    });

    kppns.forEach((k) => {
      out.push({
        date: k.startDate,
        title: `Bắt đầu hành động ${k.code}`,
        description: `${k.name} - thực thi trên ${k.executionSystem}`,
        tone: "brand",
        icon: <IconTool size={14} />,
      });
      if (k.completedDate) {
        out.push({
          date: k.completedDate,
          title: `Hoàn thành hành động ${k.code}`,
          description: k.result || k.name,
          tone: "success",
          icon: <IconTool size={14} />,
        });
      }
      if (isKppnOverdue(k)) {
        out.push({
          date: k.dueDate,
          title: `Hành động ${k.code} quá hạn`,
          description: `Hạn hoàn thành là ${formatDate(k.dueDate)} nhưng tiến độ mới đạt ${k.progress}%.`,
          tone: "danger",
          icon: <IconClockExclamation size={14} />,
        });
      }
    });

    if (deficiency.dueDate) {
      out.push({
        date: deficiency.dueDate,
        title: isDeficiencyOverdue(deficiency)
          ? "Hạn khắc phục (đã quá hạn)"
          : "Hạn khắc phục theo kế hoạch",
        description:
          "Mốc phải hoàn tất khắc phục và xác nhận hiệu lực kiểm soát.",
        tone: isDeficiencyOverdue(deficiency) ? "danger" : "neutral",
        icon: <IconHourglass size={14} />,
      });
    }

    return out
      .filter((x) => !!x.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [deficiency, kppns, test]);

  const toneClass: Record<TimelineItem["tone"], string> = {
    brand: "bg-brand-light text-brand",
    success: "bg-lv-low-bg text-lv-low-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
    neutral: "bg-lv-neutral-bg text-lv-neutral-text",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-ctrl bg-lv-info-bg px-3 py-2 text-[12px] text-lv-info-text">
        <IconHistory size={15} />
        Dòng thời gian tổng hợp từ các mốc nghiệp vụ liên quan tới điểm yếu. Bản
        demo chưa lưu nhật ký thao tác chi tiết của người dùng.
      </div>

      <ol className="flex flex-col">
        {items.map((it, i) => (
          <li key={`${it.date}-${i}`} className="flex gap-3">
            <div className="flex w-[92px] shrink-0 flex-col items-end pt-0.5">
              <span className="text-[12px] font-medium text-text-primary">
                {formatDate(it.date)}
              </span>
            </div>

            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  toneClass[it.tone],
                )}
              >
                {it.icon}
              </span>
              {i < items.length - 1 && (
                <span className="w-px flex-1 bg-border-light" />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <p className="text-[13px] font-medium text-text-primary">
                {it.title}
              </p>
              {it.description && (
                <p className="text-[12px] leading-4 text-text-secondary">
                  {it.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ================================================================== */
/* Hộp thoại chuyển trạng thái                                        */
/* ================================================================== */

function TransitionModal({
  open,
  deficiency,
  kppnList,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  deficiency: Deficiency;
  kppnList: Kppn[];
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onError: (message: string, detail?: string) => void;
}) {
  const list = deficiencyNextTransitions(deficiency.status);
  const [target, setTarget] = useState(list[0]?.to ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTarget(list[0]?.to ?? "");
      setReason("");
      setError("");
    }
  }

  const selected = list.find((tr) => tr.to === target) ?? list[0];

  const totalKppn = kppnList.length;
  const doneKppn = kppnList.filter((k) => k.status === "Hoàn thành").length;
  const openKppn = kppnList.filter(
    (k) => k.status !== "Hoàn thành" && k.status !== "Huỷ",
  ).length;

  /* --------------------- Điều kiện chặn chuyển ------------------- */

  const blockReasons = useMemo(() => {
    if (!selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Đã lập KPPN") {
      if (!deficiency.rootCause.trim())
        out.push(
          "Bắt buộc phân tích nguyên nhân gốc trước khi chuyển sang Đã lập KPPN.",
        );
      if (totalKppn === 0)
        out.push(
          "Phải có ít nhất 1 hành động khắc phục và phòng ngừa gắn với điểm yếu này.",
        );
    }

    if (selected.to === "Đã khắc phục") {
      if (totalKppn === 0)
        out.push(
          "Chưa có hành động khắc phục nào, chưa đủ căn cứ xác nhận đã khắc phục.",
        );
      else if (doneKppn === 0)
        out.push(
          "Chưa có hành động KPPN nào hoàn thành, chưa đủ căn cứ xác nhận đã khắc phục.",
        );
    }

    return out;
  }, [deficiency, selected, totalKppn, doneKppn]);

  /* ----------------------- Cảnh báo mềm ------------------------- */

  const softWarnings = useMemo(() => {
    if (!selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Đã khắc phục" && openKppn > 0)
      out.push(
        `Còn ${openKppn} hành động KPPN chưa kết thúc. Nên hoàn tất trước khi xác nhận khắc phục.`,
      );

    if (selected.to === "Đã đóng")
      out.push(
        "Đóng điểm yếu nghĩa là xác nhận biện pháp đã vận hành hiệu quả và không cần theo dõi thêm.",
      );

    if (
      selected.to === "Đã đóng" &&
      (deficiency.severity === "Cao" || deficiency.severity === "Trọng yếu")
    )
      out.push(
        `Điểm yếu mức ${deficiency.severity} nên được kiểm tra lại hiệu lực kiểm soát trước khi đóng.`,
      );

    if (isDeficiencyOverdue(deficiency) && selected.to !== "Đã đóng")
      out.push(
        "Điểm yếu đang quá hạn khắc phục, nên ghi rõ lý do chậm trễ trong ghi chú.",
      );

    return out;
  }, [deficiency, selected, openKppn]);

  function submit() {
    if (!selected) return;

    if (blockReasons.length > 0) {
      onError("Chưa đủ điều kiện chuyển trạng thái", blockReasons.join(" "));
      return;
    }

    if (selected.requireReason && !reason.trim()) {
      setError("Bắt buộc nhập lý do khi chuyển sang trạng thái này");
      return;
    }

    deficiencyRepo.update(deficiency.id, {
      status: selected.to,
      statusNote: reason.trim() || deficiency.statusNote,
      /* Đồng bộ lại danh sách hành động theo quan hệ thật từ phía KPPN */
      kppnIds: kppnList.map((k) => k.id),
    });

    onDone(
      `${deficiency.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${deficiency.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái điểm yếu"
      description={`${deficiency.code} - ${deficiency.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={selected?.tone === "danger" ? "danger" : "primary"}
            onClick={submit}
            disabled={!selected || blockReasons.length > 0}
          >
            {selected?.label ?? "Chuyển"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
          <span className="text-[12px] text-text-secondary">Hiện tại</span>
          <StatusBadge status={deficiency.status} />
          <IconArrowRight size={16} className="text-icon-neutral" />
          <span className="text-[12px] text-text-secondary">Chuyển sang</span>
          {selected ? (
            <StatusBadge status={selected.to} />
          ) : (
            <span className="text-[13px] text-text-hint">
              Không còn trạng thái kế tiếp
            </span>
          )}
          <span className="ml-auto">
            <RiskBadge level={deficiency.severity} />
          </span>
        </div>

        {list.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Điểm yếu đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-text-primary">
                Chọn hành động
              </span>
              {list.map((tr) => (
                <Radio
                  key={tr.to}
                  name="deficiency-detail-transition"
                  label={tr.label}
                  description={`Trạng thái sau khi chuyển: ${tr.to}${
                    tr.requireReason ? " - bắt buộc nhập lý do" : ""
                  }`}
                  checked={selected?.to === tr.to}
                  onChange={() => {
                    setTarget(tr.to);
                    setError("");
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt px-3 py-2.5 text-[12px] text-text-secondary">
              <span>
                Hành động KPPN:{" "}
                <b className="text-text-primary">
                  {doneKppn}/{totalKppn} hoàn thành
                </b>
              </span>
              <span>
                Nguyên nhân gốc:{" "}
                <b
                  className={cn(
                    deficiency.rootCause.trim()
                      ? "text-text-primary"
                      : "text-danger",
                  )}
                >
                  {deficiency.rootCause.trim() ? "Đã phân tích" : "Chưa có"}
                </b>
              </span>
              <span>
                Hạn khắc phục:{" "}
                <b className="text-text-primary">
                  {formatDate(deficiency.dueDate) || "chưa đặt"}
                </b>
              </span>
            </div>

            <Textarea
              label="Lý do / ghi chú"
              required={selected?.requireReason}
              rows={3}
              maxLength={500}
              showCount
              value={reason}
              error={error}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              placeholder="Nhập lý do hoặc ghi chú cho lần chuyển trạng thái này"
            />

            {blockReasons.length > 0 && (
              <div className="flex flex-col gap-1 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
                <span className="flex items-center gap-1.5 font-semibold">
                  <IconAlertTriangle size={15} />
                  Chưa đủ điều kiện chuyển trạng thái
                </span>
                <ul className="flex flex-col gap-0.5 pl-5">
                  {blockReasons.map((r, i) => (
                    <li key={i} className="list-disc">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {blockReasons.length === 0 && softWarnings.length > 0 && (
              <div className="flex flex-col gap-1 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                <span className="flex items-center gap-1.5 font-semibold">
                  <IconAlertTriangle size={15} />
                  Lưu ý
                </span>
                <ul className="flex flex-col gap-0.5 pl-5">
                  {softWarnings.map((r, i) => (
                    <li key={i} className="list-disc">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
