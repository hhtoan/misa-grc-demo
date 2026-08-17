"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconCircleCheck,
  IconClockExclamation,
  IconCloudUpload,
  IconEdit,
  IconExternalLink,
  IconHistory,
  IconHourglass,
  IconInfoCircle,
  IconLink,
  IconPlugConnected,
  IconRefresh,
  IconSend,
  IconShieldCheck,
  IconTool,
  IconTrash,
  IconTrendingDown,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DateInput,
  EmptyState,
  Modal,
  Radio,
  ReadField,
  RiskBadge,
  StatusBadge,
  Tabs,
  Textarea,
  Tooltip,
  UserCell,
  useToast,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import {
  controlRepo,
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  canPushToSource,
  expectedProgress,
  isKppnBehindSchedule,
  isKppnDeletable,
  isKppnDueSoon,
  isKppnEditable,
  isKppnFinished,
  isKppnOverdue,
  isKppnRunning,
  isSyncStale,
  kppnDaysToDue,
  kppnNextTransitions,
} from "@/lib/domain/kppn-utils";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import type {
  Control,
  Deficiency,
  GrcEvent,
  Kppn,
  Risk,
} from "@/lib/domain/schema";
import {
  INTEGRATIONS,
  SYSTEM_TO_INTEGRATION,
  pullKppnFromSource,
  pushKppnToSource,
  useIntegrationStates,
  type IntegrationKey,
} from "@/lib/integrations/mock";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  toInputDate,
} from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

type TabKey = "tong-quan" | "nguon-goc" | "dong-bo" | "lich-su";
type Lookups = ReturnType<typeof useLookups>;

/* ================================================================== */
/* Wrapper: tìm bản ghi rồi phân nhánh                                 */
/* ================================================================== */

export default function KppnChiTietScreen({ code }: { code: string }) {
  const router = useRouter();
  const kppns = useCollection(kppnRepo);

  const kppn = useMemo(
    () => kppns.find((k) => k.code === code || k.id === code),
    [kppns, code],
  );

  if (!kppn) {
    return (
      <PageContainer>
        <PageHeader title="Chi tiết hành động" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy hành động"
              description={`Không có bản ghi nào ứng với mã ${code}. Có thể bản ghi đã bị xoá hoặc đường dẫn không đúng.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/khac-phuc/kppn")}
                >
                  Về bảng theo dõi KPPN
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return <ChiTietContent kppn={kppn} />;
}

/* ================================================================== */
/* Content: kppn luôn tồn tại                                        */
/* ================================================================== */

function ChiTietContent({ kppn }: { kppn: Kppn }) {
  const router = useRouter();
  const toast = useToast();
  const { hasRole } = useSession();
  const lk = useLookups();

  const deficiencies = useCollection(deficiencyRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);
  const controls = useCollection(controlRepo);
  const states = useIntegrationStates();

  const [tab, setTab] = useState<TabKey>("tong-quan");
  const [transiting, setTransiting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = hasRole("admin", "qtrr", "owner");
  const canApprove = hasRole("admin", "qtrr");

  /* ---------------------- Dữ liệu liên kết ---------------------- */

  const deficiency = useMemo<Deficiency | null>(
    () => deficiencies.find((d) => d.id === kppn.deficiencyId) ?? null,
    [deficiencies, kppn.deficiencyId],
  );

  const risk = useMemo<Risk | null>(
    () => risks.find((r) => r.id === kppn.riskId) ?? null,
    [risks, kppn.riskId],
  );

  const event = useMemo<GrcEvent | null>(
    () => events.find((e) => e.id === kppn.eventId) ?? null,
    [events, kppn.eventId],
  );

  /** Kiểm soát suy ra từ điểm yếu nguồn */
  const control = useMemo<Control | null>(
    () =>
      deficiency?.controlId
        ? (controls.find((c) => c.id === deficiency.controlId) ?? null)
        : null,
    [controls, deficiency],
  );

  /** Hành động anh em cùng điểm yếu */
  const allKppns = useCollection(kppnRepo);

  const siblings = useMemo(
    () =>
      kppn.deficiencyId
        ? allKppns.filter(
            (k) => k.deficiencyId === kppn.deficiencyId && k.id !== kppn.id,
          )
        : [],
    [allKppns, kppn.deficiencyId, kppn.id],
  );

  /* --------------------------- Chỉ số --------------------------- */

  const editable = isKppnEditable(kppn.status);
  const transitions = kppnNextTransitions(kppn.status);
  const remain = kppnDaysToDue(kppn);
  const expect = expectedProgress(kppn);
  const gap = expect - kppn.progress;

  const integrationKey = SYSTEM_TO_INTEGRATION[kppn.executionSystem] ?? null;
  const integration = integrationKey
    ? (INTEGRATIONS.find((i) => i.key === integrationKey) ?? null)
    : null;
  const connected = integrationKey ? states[integrationKey].connected : false;

  /* --------------------------- Hành động ------------------------ */

  function goEdit() {
    if (!editable) {
      toast.warning(
        "Không sửa được",
        `Hành động đang ở trạng thái ${kppn.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/khac-phuc/kppn/${kppn.code}/sua`);
  }

  function confirmDelete() {
    if (!isKppnDeletable(kppn.status)) {
      toast.error(
        "Không xoá được",
        `Chỉ xoá được hành động ở trạng thái Nháp. ${kppn.code} đang ở trạng thái ${kppn.status}.`,
      );
      return;
    }
    setDeleting(true);
  }

  async function push() {
    setBusy(true);
    const res = await pushKppnToSource(kppn.id);
    setBusy(false);
    if (res.ok) toast.success(res.message, res.details.join(" | "));
    else toast.error("Không giao việc được", res.message);
  }

  async function pull() {
    if (!integrationKey) {
      toast.warning(
        "Không có kết nối",
        "Hành động này được theo dõi trực tiếp trong GRC, không đồng bộ với hệ thống ngoài.",
      );
      return;
    }
    setBusy(true);
    const res = await pullKppnFromSource(integrationKey);
    setBusy(false);
    if (!res.ok) {
      toast.error("Không đồng bộ được", res.message);
      return;
    }
    const mine = res.details.find((d) => d.startsWith(kppn.code));
    if (mine) toast.success(`Đã cập nhật ${kppn.code}`, mine);
    else
      toast.info(
        "Không có thay đổi cho hành động này",
        `${kppn.executionSystem} chưa cập nhật gì thêm.`,
      );
  }

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => router.push("/khac-phuc/kppn")}
        title={
          <span className="flex items-center gap-2">
            <span className="text-brand">{kppn.code}</span>
            <span className="truncate">{kppn.name}</span>
          </span>
        }
        badge={
          <span className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={kppn.status} />
            <Badge tone={kppn.type === "Khắc phục" ? "info" : "neutral"}>
              {kppn.type}
            </Badge>
          </span>
        }
        actions={
          canEdit && (
            <>
              {isKppnDeletable(kppn.status) && (
                <Button
                  variant="danger-outline"
                  icon={<IconTrash size={16} />}
                  onClick={confirmDelete}
                >
                  Xoá
                </Button>
              )}
              {kppn.externalUrl && (
                <Button
                  variant="secondary"
                  icon={<IconExternalLink size={16} />}
                  onClick={() => window.open(kppn.externalUrl, "_blank")}
                >
                  Mở {kppn.externalTaskCode}
                </Button>
              )}
              {canPushToSource(kppn) && (
                <Button
                  variant="secondary"
                  icon={<IconSend size={16} />}
                  loading={busy}
                  onClick={push}
                >
                  Giao việc
                </Button>
              )}
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
          {isKppnOverdue(kppn) && (
            <AlertBar
              tone="danger"
              title={`Quá hạn hoàn thành ${Math.abs(remain ?? 0)} ngày`}
              description={`Hạn là ${formatDate(kppn.dueDate)} nhưng tiến độ mới đạt ${kppn.progress}%.`}
            />
          )}

          {isKppnBehindSchedule(kppn) && !isKppnOverdue(kppn) && (
            <AlertBar
              tone="warning"
              title={`Chậm tiến độ ${gap} điểm phần trăm so với kỳ vọng`}
              description={`Theo thời gian đã trôi qua, tiến độ đáng lẽ phải đạt ${expect}% nhưng thực tế mới ${kppn.progress}%.`}
            />
          )}

          {canPushToSource(kppn) && (
            <AlertBar
              tone="warning"
              title={`Chưa tạo việc trên ${kppn.executionSystem}`}
              description="Hành động đã được phê duyệt nhưng chưa giao sang hệ thống thực thi, người thực hiện có thể chưa biết nhiệm vụ này."
              action={
                canEdit ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    loading={busy}
                    onClick={push}
                  >
                    Giao việc ngay
                  </Button>
                ) : undefined
              }
            />
          )}

          {isSyncStale(kppn) && (
            <AlertBar
              tone="warning"
              title={`Quá 7 ngày chưa nhận cập nhật từ ${kppn.executionSystem}`}
              description={
                kppn.lastSyncedAt
                  ? `Đồng bộ gần nhất ${formatDateTime(kppn.lastSyncedAt)}.`
                  : "Chưa từng đồng bộ kể từ khi giao việc."
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  loading={busy}
                  onClick={() => setTab("dong-bo")}
                >
                  Xem đồng bộ
                </Button>
              }
            />
          )}

          {kppn.status === "Chờ nghiệm thu" && (
            <AlertBar
              tone="info"
              title="Hành động đang chờ nghiệm thu"
              description={`Người giám sát ${lk.employeeName(kppn.supervisorId, "chưa được chỉ định")} cần xác nhận kết quả và bằng chứng trước khi đóng.`}
              action={
                canEdit ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    onClick={() => setTransiting(true)}
                  >
                    Nghiệm thu
                  </Button>
                ) : undefined
              }
            />
          )}

          {!editable && (
            <AlertBar
              tone="info"
              title={`Hành động đang ở trạng thái ${kppn.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung."
            />
          )}

          {/* ================== Thẻ tổng quan ================== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <ContentCard className="flex flex-col justify-center gap-1.5">
              <p className="text-[12px] text-text-secondary">
                Tiến độ thực hiện
              </p>
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-[24px] leading-8 font-semibold",
                    kppn.progress >= 100
                      ? "text-lv-low-text"
                      : isKppnBehindSchedule(kppn)
                        ? "text-lv-medium-text"
                        : "text-text-primary",
                  )}
                >
                  {kppn.progress}%
                </span>
                {isKppnRunning(kppn) && (
                  <span className="text-[12px] text-text-secondary">
                    kỳ vọng {expect}%
                  </span>
                )}
              </div>
              <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    kppn.progress >= 100
                      ? "bg-success"
                      : isKppnBehindSchedule(kppn)
                        ? "bg-warning"
                        : "bg-brand",
                  )}
                  style={{ width: `${kppn.progress}%` }}
                />
                {isKppnRunning(kppn) && (
                  <span
                    className="absolute top-0 h-full w-px bg-[#717680]"
                    style={{ left: `${expect}%` }}
                  />
                )}
              </span>
              <p className="text-[11px] text-text-hint">
                {isKppnRunning(kppn)
                  ? gap >= 20
                    ? `Chậm ${gap} điểm so với kỳ vọng`
                    : "Bám sát kế hoạch"
                  : `Trạng thái ${kppn.status.toLowerCase()}`}
              </p>
            </ContentCard>

            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">Hạn hoàn thành</p>
              <p
                className={cn(
                  "text-[20px] leading-7 font-semibold",
                  isKppnOverdue(kppn)
                    ? "text-danger"
                    : isKppnDueSoon(kppn)
                      ? "text-lv-medium-text"
                      : "text-text-primary",
                )}
              >
                {formatDate(kppn.dueDate)}
              </p>
              <p className="text-[11px] text-text-hint">
                {isKppnFinished(kppn)
                  ? kppn.completedDate
                    ? `Hoàn thành ${formatDate(kppn.completedDate)}`
                    : "Đã kết thúc"
                  : remain === null
                    ? ""
                    : remain < 0
                      ? `Đã quá hạn ${Math.abs(remain)} ngày`
                      : `Còn ${remain} ngày, bắt đầu ${formatDate(kppn.startDate)}`}
              </p>
            </ContentCard>

            <ContentCard className="flex flex-col justify-center gap-1">
              <p className="text-[12px] text-text-secondary">
                Hệ thống thực thi
              </p>
              <p className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
                <IconTool size={16} className="text-brand" />
                {kppn.executionSystem}
              </p>
              {kppn.externalTaskCode ? (
                <button
                  type="button"
                  onClick={() =>
                    kppn.externalUrl && window.open(kppn.externalUrl, "_blank")
                  }
                  className="flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                >
                  {kppn.externalTaskCode}
                  <IconExternalLink size={12} />
                </button>
              ) : (
                <p className="text-[11px] text-text-hint">
                  {integrationKey ? "Chưa tạo việc" : "Theo dõi trong GRC"}
                </p>
              )}
            </ContentCard>

            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">
                Chi phí ước tính
              </p>
              <p className="text-[20px] leading-7 font-semibold text-text-primary">
                {formatMoney(kppn.estimatedCost) || "--"}
              </p>
              <p className="text-[11px] text-text-hint">
                Đơn vị tính VNĐ - thực hiện bởi{" "}
                {lk.unitName(kppn.unitId, "chưa gán đơn vị")}
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
                  { key: "nguon-goc", label: "Nguồn gốc & liên kết" },
                  { key: "dong-bo", label: "Đồng bộ hệ thống nguồn" },
                  { key: "lich-su", label: "Lịch sử" },
                ]}
              />
            </div>

            <div className="p-4">
              {tab === "tong-quan" && <TabTongQuan kppn={kppn} lk={lk} />}
              {tab === "nguon-goc" && (
                <TabNguonGoc
                  kppn={kppn}
                  deficiency={deficiency}
                  risk={risk}
                  event={event}
                  control={control}
                  siblings={siblings}
                  lk={lk}
                />
              )}
              {tab === "dong-bo" && (
                <TabDongBo
                  kppn={kppn}
                  connected={connected}
                  integrationName={integration?.name ?? null}
                  integrationDesc={integration?.description ?? null}
                  canEdit={canEdit}
                  busy={busy}
                  onPush={push}
                  onPull={pull}
                />
              )}
              {tab === "lich-su" && (
                <TabLichSu kppn={kppn} deficiency={deficiency} />
              )}
            </div>
          </ContentCard>
        </div>
      </PageBody>

      {/* ======================== Hộp thoại ======================== */}
      <TransitionModal
        open={transiting}
        kppn={kppn}
        canApprove={canApprove}
        onClose={() => setTransiting(false)}
        onDone={(msg, detail) => {
          setTransiting(false);
          toast.success(msg, detail);
        }}
        onPush={push}
      />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          kppnRepo.remove(kppn.id);
          setDeleting(false);
          toast.success("Đã xoá", `${kppn.code} đã được xoá.`);
          router.push("/khac-phuc/kppn");
        }}
        tone="danger"
        title="Xoá hành động khắc phục"
        message={
          <>
            Bạn có chắc muốn xoá <b>{kppn.code}</b>? Hành động này không thể
            hoàn tác.
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
        ? IconTrendingDown
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

/* ================================================================== */
/* Tab 1: Thông tin chung                                        */
/* ================================================================== */

function TabTongQuan({ kppn, lk }: { kppn: Kppn; lk: Lookups }) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Thông tin định danh">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Mã hành động">
            <b className="text-brand">{kppn.code}</b>
          </ReadField>
          <ReadField label="Loại hành động">
            <Badge tone={kppn.type === "Khắc phục" ? "info" : "neutral"} dot>
              {kppn.type}
            </Badge>
          </ReadField>
          <ReadField label="Trạng thái">
            <StatusBadge status={kppn.status} />
          </ReadField>
          <ReadField label="Đơn vị thực hiện">
            {lk.unitName(kppn.unitId)}
          </ReadField>
          <ReadField label="Người thực hiện">
            <UserCell
              name={lk.employeeName(kppn.assigneeId, "Chưa gán")}
              sub={lk.employeeById(kppn.assigneeId)?.title}
              size={26}
            />
          </ReadField>
          <ReadField label="Người giám sát">
            {kppn.supervisorId ? (
              <UserCell
                name={lk.employeeName(kppn.supervisorId)}
                sub={lk.employeeById(kppn.supervisorId)?.title}
                size={26}
              />
            ) : (
              <span className="text-lv-medium-text">Chưa chỉ định</span>
            )}
          </ReadField>
          <ReadField label="Ngày bắt đầu">
            {formatDate(kppn.startDate)}
          </ReadField>
          <ReadField label="Hạn hoàn thành">
            <span
              className={cn(isKppnOverdue(kppn) && "font-medium text-danger")}
            >
              {formatDate(kppn.dueDate)}
              {isKppnOverdue(kppn) ? " (quá hạn)" : ""}
            </span>
          </ReadField>
          <ReadField label="Ngày hoàn thành">
            {formatDate(kppn.completedDate) || "--"}
          </ReadField>
        </div>
      </Section>

      <Section title="Nội dung thực hiện">
        <p className="text-[13px] leading-5 whitespace-pre-line text-text-primary">
          {kppn.description || "--"}
        </p>
      </Section>

      <Section
        title="Kết quả và bằng chứng nghiệm thu"
        note="Chỉ có nội dung sau khi hành động được nghiệm thu"
      >
        {kppn.result.trim() || kppn.evidenceNote.trim() ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ReadField label="Kết quả thực hiện">
              <span className="leading-5 whitespace-pre-line">
                {kppn.result || "--"}
              </span>
            </ReadField>
            <ReadField label="Bằng chứng nghiệm thu">
              <span className="leading-5 whitespace-pre-line">
                {kppn.evidenceNote || "--"}
              </span>
            </ReadField>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-ctrl border border-dashed border-border-neutral px-3 py-2.5 text-[12px] text-text-hint">
            <IconCircleCheck size={15} className="shrink-0" />
            Chưa nghiệm thu nên chưa có kết quả và bằng chứng.
          </div>
        )}
      </Section>

      <Section title="Thông tin quản trị">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Chi phí ước tính">
            {formatMoney(kppn.estimatedCost) || "--"}
          </ReadField>
          <ReadField label="Ghi chú trạng thái">
            {kppn.statusNote || "--"}
          </ReadField>
          <ReadField label="Người tạo">{kppn.createdBy || "--"}</ReadField>
          <ReadField label="Ngày tạo">
            {formatDateTime(kppn.createdAt)}
          </ReadField>
          <ReadField label="Cập nhật gần nhất">
            {formatDateTime(kppn.updatedAt)}
          </ReadField>
        </div>
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 2: Nguồn gốc và liên kết                                        */
/* ================================================================== */

function TabNguonGoc({
  kppn,
  deficiency,
  risk,
  event,
  control,
  siblings,
  lk,
}: {
  kppn: Kppn;
  deficiency: Deficiency | null;
  risk: Risk | null;
  event: GrcEvent | null;
  control: Control | null;
  siblings: Kppn[];
  lk: Lookups;
}) {
  const router = useRouter();

  const hasSource = !!deficiency || !!risk || !!event;

  return (
    <div className="flex flex-col gap-5">
      {!hasSource && (
        <div className="flex items-center gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg px-3 py-2.5 text-[12px] text-lv-critical-text">
          <IconAlertTriangle size={16} className="shrink-0" />
          Hành động chưa gắn nguồn nào. Đây là lỗi dữ liệu, cần sửa lại để truy
          vết được lý do phát sinh.
        </div>
      )}

      {/* Điểm yếu nguồn */}
      <Section
        title="Điểm yếu kiểm soát"
        note="Nguồn chính để đánh giá hiệu quả khắc phục"
      >
        {deficiency ? (
          <button
            type="button"
            onClick={() =>
              router.push(`/khac-phuc/diem-yeu/${deficiency.code}`)
            }
            className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-medium-bg text-lv-medium-text">
              <IconTool size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-text-primary">
                <b className="text-brand">{deficiency.code}</b>{" "}
                {deficiency.name}
              </p>
              <p className="truncate text-[12px] text-text-secondary">
                Nguồn {deficiency.sourceType} - phát hiện{" "}
                {formatDate(deficiency.detectedDate)} - hạn{" "}
                {formatDate(deficiency.dueDate) || "chưa đặt"}
              </p>
            </div>
            <RiskBadge level={deficiency.severity} />
            <StatusBadge status={deficiency.status} />
          </button>
        ) : (
          <p className="text-[13px] text-text-hint">
            Hành động này không gắn với điểm yếu nào.
          </p>
        )}

        {deficiency?.dueDate && kppn.dueDate > deficiency.dueDate && (
          <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
            <IconAlertTriangle size={15} className="mt-px shrink-0" />
            <span>
              Hạn hoàn thành của hành động ({formatDate(kppn.dueDate)}) muộn hơn
              hạn khắc phục của điểm yếu ({formatDate(deficiency.dueDate)}).
              Điểm yếu sẽ bị tính quá hạn trước khi hành động kết thúc.
            </span>
          </div>
        )}
      </Section>

      {/* Kiểm soát suy ra từ điểm yếu */}
      {control && (
        <Section title="Kiểm soát bị ảnh hưởng" note="Suy ra từ điểm yếu nguồn">
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
                {control.type} - {control.nature} - {control.frequency}
              </p>
            </div>
            {control.isKeyControl && <Badge tone="brand">Trọng yếu</Badge>}
            <StatusBadge status={control.status} />
          </button>
        </Section>
      )}

      {/* Rủi ro */}
      <Section title="Rủi ro liên quan">
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
                {lk.categoryName(risk.categoryId)} - {lk.unitName(risk.unitId)}
              </p>
            </div>
            {risk.isZeroTolerance && <Badge tone="danger">KKN</Badge>}
            <RiskBadge
              level={residualLevelOf(risk)}
              score={residualScoreOf(risk)}
            />
          </button>
        ) : (
          <p className="text-[13px] text-text-hint">Chưa gắn rủi ro nào.</p>
        )}
      </Section>

      {/* Sự kiện */}
      <Section title="Sự kiện liên quan">
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
          <p className="text-[13px] text-text-hint">Chưa gắn sự kiện nào.</p>
        )}
      </Section>

      {/* Hành động anh em */}
      <Section
        title={`Hành động khác cùng điểm yếu ( ${siblings.length})`}
        note="Cùng khắc phục một điểm yếu nên cần theo dõi song song"
      >
        {siblings.length === 0 ? (
          <p className="text-[13px] text-text-hint">
            Không có hành động nào khác gắn cùng điểm yếu này.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {siblings.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => router.push(`/khac-phuc/kppn/${s.code}`)}
                className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
              >
                <span className="w-[130px] shrink-0 text-[12px] font-medium text-brand">
                  {s.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                  {s.name}
                </span>
                {isKppnOverdue(s) && (
                  <Badge tone="danger" size="sm">
                    Quá hạn
                  </Badge>
                )}
                <span className="w-[110px] shrink-0 text-right text-[12px] text-text-secondary">
                  {s.progress}% - {formatDate(s.dueDate)}
                </span>
                <StatusBadge status={s.status} />
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 3: Đồng bộ hệ thống nguồn                                       */
/* ================================================================== */

function TabDongBo({
  kppn,
  connected,
  integrationName,
  integrationDesc,
  canEdit,
  busy,
  onPush,
  onPull,
}: {
  kppn: Kppn;
  connected: boolean;
  integrationName: string | null;
  integrationDesc: string | null;
  canEdit: boolean;
  busy: boolean;
  onPush: () => void;
  onPull: () => void;
}) {
  /* Trường hợp theo dõi trong GRC, không có hệ thống ngoài */
  if (!integrationName) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={<IconTool size={24} />}
          title="Hành động được theo dõi trực tiếp trong GRC"
          description="Không tạo việc trên hệ thống ngoài. Người thực hiện phải tự cập nhật tiến độ tại màn hình sửa hành động."
          compact
        />
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconInfoCircle size={16} className="mt-px shrink-0" />
          <span>
            Theo nguyên tắc <b>GRC điều phối, hệ thống nguồn thực thi</b>, nên
            chuyển hành động sang AMIS Công việc hoặc JIRA để người thực hiện
            cập nhật ngay tại nơi họ làm việc hằng ngày.
          </span>
        </div>
      </div>
    );
  }

  const pushed = !!kppn.externalTaskCode;

  return (
    <div className="flex flex-col gap-5">
      {/* Trạng thái kết nối */}
      <Section title="Kết nối hệ thống">
        <div className="flex flex-col gap-3 rounded-ctrl border border-border-light p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
              <IconPlugConnected size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-text-primary">
                {integrationName}
              </p>
              <p className="text-[12px] text-text-secondary">
                Đồng bộ 2 chiều với GRC
              </p>
            </div>
            {connected ? (
              <Badge tone="success" dot>
                Đang kết nối
              </Badge>
            ) : (
              <Badge tone="danger" dot>
                Đã ngắt kết nối
              </Badge>
            )}
          </div>

          {integrationDesc && (
            <p className="text-[12px] leading-4 text-text-secondary">
              {integrationDesc}
            </p>
          )}

          {!connected && (
            <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
              <IconAlertTriangle size={15} className="mt-px shrink-0" />
              <span>
                Kết nối đang tắt nên không giao việc và không nhận được cập nhật
                tiến độ. Bật lại tại màn hình Quản trị - Kết nối hệ thống.
              </span>
            </div>
          )}
        </div>
      </Section>

      {/* Việc trên hệ thống nguồn */}
      <Section title="Việc trên hệ thống nguồn">
        <div className="flex flex-col gap-3 rounded-ctrl border border-border-light p-3">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
            <ReadField label="Mã việc">
              {pushed ? (
                <b className="text-brand">{kppn.externalTaskCode}</b>
              ) : (
                <span className="text-lv-medium-text">Chưa tạo việc</span>
              )}
            </ReadField>
            <ReadField label="Đường dẫn">
              {kppn.externalUrl ? (
                <button
                  type="button"
                  onClick={() => window.open(kppn.externalUrl, "_blank")}
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  Mở trên {integrationName}
                  <IconExternalLink size={13} />
                </button>
              ) : (
                "--"
              )}
            </ReadField>
            <ReadField label="Đồng bộ gần nhất">
              <span
                className={cn(
                  isSyncStale(kppn) && "font-medium text-lv-medium-text",
                )}
              >
                {formatDateTime(kppn.lastSyncedAt) || "Chưa đồng bộ"}
              </span>
            </ReadField>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
            {canEdit && canPushToSource(kppn) && (
              <Button
                variant="primary"
                icon={<IconSend size={16} />}
                loading={busy}
                onClick={onPush}
              >
                Giao việc sang {integrationName}
              </Button>
            )}
            {pushed && canEdit && (
              <Button
                variant="secondary"
                icon={<IconRefresh size={16} />}
                loading={busy}
                onClick={onPull}
              >
                Đồng bộ ngay
              </Button>
            )}
            {!pushed && !canPushToSource(kppn) && (
              <span className="text-[12px] text-text-secondary">
                {kppn.status === "Nháp" || kppn.status === "Chờ duyệt"
                  ? "Chỉ giao việc sau khi hành động được phê duyệt."
                  : "Hành động đã kết thúc nên không giao việc nữa."}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Quy tắc đồng bộ */}
      <Section title="Quy tắc đồng bộ hai chiều">
        <div className="flex flex-col gap-2">
          <SyncRule
            icon={<IconCloudUpload size={15} />}
            tone="brand"
            title={`GRC → ${integrationName}`}
            description="Sau khi hành động được phê duyệt, GRC tạo việc trên hệ thống nguồn kèm mã liên kết ngược. Việc giao chỉ thực hiện một lần, không tạo trùng."
          />
          <SyncRule
            icon={<IconRefresh size={15} />}
            tone="info"
            title={`${integrationName} → GRC`}
            description="Hệ thống nguồn cập nhật tiến độ và trạng thái về GRC. Tiến độ trong GRC bị khoá chỉnh sửa để tránh lệch số liệu."
          />
          <SyncRule
            icon={<IconCircleCheck size={15} />}
            tone="success"
            title="Quyền nghiệm thu thuộc về GRC"
            description="Khi hệ thống nguồn báo hoàn tất, hành động chỉ chuyển sang Chờ nghiệm thu. Người giám sát trong GRC mới là người xác nhận Hoàn thành."
          />
        </div>
      </Section>
    </div>
  );
}

function SyncRule({
  icon,
  tone,
  title,
  description,
}: {
  icon: React.ReactNode;
  tone: "brand" | "info" | "success";
  title: string;
  description: string;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    info: "bg-lv-info-bg text-lv-info-text",
    success: "bg-lv-low-bg text-lv-low-text",
  };
  return (
    <div className="flex items-start gap-2.5 rounded-ctrl border border-border-light px-3 py-2.5">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl",
          style[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-text-primary">{title}</p>
        <p className="text-[12px] leading-4 text-text-secondary">
          {description}
        </p>
      </div>
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
  kppn,
  deficiency,
}: {
  kppn: Kppn;
  deficiency: Deficiency | null;
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];

    if (deficiency) {
      out.push({
        date: deficiency.detectedDate,
        title: `Phát hiện điểm yếu ${deficiency.code}`,
        description: `${deficiency.name} - mức ${deficiency.severity}, nguồn ${deficiency.sourceType}.`,
        tone: "warning",
        icon: <IconTool size={14} />,
      });
    }

    out.push({
      date: kppn.createdAt.slice(0, 10),
      title: `Lập hành động ${kppn.code}`,
      description: `${kppn.type} - thực thi trên ${kppn.executionSystem}, người tạo ${kppn.createdBy || "không rõ"}.`,
      tone: "neutral",
      icon: <IconLink size={14} />,
    });

    out.push({
      date: kppn.startDate,
      title: "Ngày bắt đầu theo kế hoạch",
      description: `Tiến độ hiện tại ${kppn.progress}%, kỳ vọng ${expectedProgress(kppn)}%.`,
      tone: "brand",
      icon: <IconHourglass size={14} />,
    });

    if (kppn.externalTaskCode) {
      out.push({
        date: (kppn.lastSyncedAt || kppn.updatedAt).slice(0, 10),
        title: `Đã giao việc ${kppn.externalTaskCode} trên ${kppn.executionSystem}`,
        description: kppn.lastSyncedAt
          ? `Đồng bộ gần nhất ${formatDateTime(kppn.lastSyncedAt)}.`
          : "Chưa nhận cập nhật nào từ hệ thống nguồn.",
        tone: "brand",
        icon: <IconCloudUpload size={14} />,
      });
    }

    if (kppn.completedDate) {
      out.push({
        date: kppn.completedDate,
        title: `Hoàn thành hành động ${kppn.code}`,
        description: kppn.result || "Đã nghiệm thu và đóng hành động.",
        tone: "success",
        icon: <IconCircleCheck size={14} />,
      });
    } else {
      out.push({
        date: kppn.dueDate,
        title: isKppnOverdue(kppn)
          ? "Hạn hoàn thành (đã quá hạn)"
          : "Hạn hoàn thành theo kế hoạch",
        description: isKppnOverdue(kppn)
          ? `Đã quá hạn ${Math.abs(kppnDaysToDue(kppn) ?? 0)} ngày mà tiến độ mới đạt ${kppn.progress}%.`
          : "Mốc phải hoàn tất và gửi nghiệm thu.",
        tone: isKppnOverdue(kppn) ? "danger" : "neutral",
        icon: <IconClockExclamation size={14} />,
      });
    }

    if (deficiency?.dueDate) {
      out.push({
        date: deficiency.dueDate,
        title: `Hạn khắc phục điểm yếu ${deficiency.code}`,
        description:
          "Mốc điểm yếu phải được xử lý xong, tính độc lập với hạn của hành động.",
        tone: "neutral",
        icon: <IconHourglass size={14} />,
      });
    }

    return out
      .filter((x) => !!x.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [kppn, deficiency]);

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
        Dòng thời gian tổng hợp từ các mốc nghiệp vụ của hành động. Bản demo
        chưa lưu nhật ký thao tác chi tiết của người dùng.
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
  kppn,
  canApprove,
  onClose,
  onDone,
  onPush,
}: {
  open: boolean;
  kppn: Kppn;
  canApprove: boolean;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onPush: () => void;
}) {
  const list = kppnNextTransitions(kppn.status);
  const [target, setTarget] = useState(list[0]?.to ?? "");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState(kppn.result);
  const [evidence, setEvidence] = useState(kppn.evidenceNote);
  const [completedDate, setCompletedDate] = useState(
    kppn.completedDate || toInputDate(new Date()),
  );
  const [autoPush, setAutoPush] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTarget(list[0]?.to ?? "");
      setReason("");
      setResult(kppn.result);
      setEvidence(kppn.evidenceNote);
      setCompletedDate(kppn.completedDate || toInputDate(new Date()));
      setAutoPush(true);
      setErrors({});
    }
  }

  const selected = list.find((tr) => tr.to === target) ?? list[0];

  const isApprovalStep =
    selected?.to === "Chưa bắt đầu" && kppn.status === "Chờ duyệt";
  const isAcceptanceStep = selected?.to === "Hoàn thành";
  const willPush =
    isApprovalStep &&
    autoPush &&
    kppn.executionSystem !== "Theo dõi trong GRC" &&
    !kppn.externalTaskCode;

  const softWarnings = useMemo(() => {
    if (!selected) return [] as string[];
    const out: string[] = [];

    if (isApprovalStep && kppn.executionSystem === "Theo dõi trong GRC")
      out.push(
        "Hành động theo dõi trực tiếp trong GRC nên không giao việc ra ngoài. Người thực hiện phải tự cập nhật tiến độ tại đây.",
      );

    if (isAcceptanceStep && !kppn.supervisorId)
      out.push(
        "Hành động chưa có người giám sát, việc nghiệm thu sẽ thiếu người xác nhận độc lập.",
      );

    if (isAcceptanceStep && isKppnOverdue(kppn))
      out.push(
        `Hành động đã quá hạn ${Math.abs(kppnDaysToDue(kppn) ?? 0)} ngày, nên ghi rõ lý do chậm trễ trong kết quả thực hiện.`,
      );

    if (selected.to === "Huỷ" && kppn.progress > 0)
      out.push(
        `Hành động đã đạt tiến độ ${kppn.progress}%. Huỷ sẽ mất toàn bộ kết quả đang theo dõi, nên cân nhắc phương án thay thế.`,
      );

    return out;
  }, [kppn, selected, isApprovalStep, isAcceptanceStep]);

  function submit() {
    if (!selected) return;

    const err: Record<string, string> = {};

    if (selected.requireReason && !reason.trim())
      err.reason = "Bắt buộc nhập lý do khi chuyển sang trạng thái này";

    if (isAcceptanceStep) {
      if (!result.trim()) err.result = "Bắt buộc mô tả kết quả thực hiện";
      if (!evidence.trim())
        err.evidence = "Bắt buộc mô tả bằng chứng nghiệm thu";
      if (!completedDate) err.completedDate = "Bắt buộc nhập ngày hoàn thành";
      else if (completedDate < kppn.startDate)
        err.completedDate = "Ngày hoàn thành phải sau ngày bắt đầu";
    }

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    const patch: Partial<Kppn> = {
      status: selected.to,
      statusNote: reason.trim() || kppn.statusNote,
    };

    if (isAcceptanceStep) {
      patch.progress = 100;
      patch.completedDate = completedDate;
      patch.result = result.trim();
      patch.evidenceNote = evidence.trim();
    }

    if (selected.to === "Đang thực hiện" && kppn.progress === 0)
      patch.progress = 5;

    kppnRepo.update(kppn.id, patch);

    onDone(
      `${kppn.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${kppn.status} sang ${selected.to}.`,
    );

    if (willPush) onPush();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái hành động"
      description={`${kppn.code} - ${kppn.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={selected?.tone === "danger" ? "danger" : "primary"}
            onClick={submit}
            disabled={!selected || (isApprovalStep && !canApprove)}
          >
            {selected?.label ?? "Chuyển"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
          <span className="text-[12px] text-text-secondary">Hiện tại</span>
          <StatusBadge status={kppn.status} />
          <IconArrowRight size={16} className="text-icon-neutral" />
          <span className="text-[12px] text-text-secondary">Chuyển sang</span>
          {selected ? (
            <StatusBadge status={selected.to} />
          ) : (
            <span className="text-[13px] text-text-hint">
              Không còn trạng thái kế tiếp
            </span>
          )}
          <span className="ml-auto text-[12px] text-text-secondary">
            Tiến độ <b className="text-text-primary">{kppn.progress}%</b>
          </span>
        </div>

        {list.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Hành động đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                  name="kppn-detail-transition"
                  label={tr.label}
                  description={`Trạng thái sau khi chuyển: ${tr.to}${
                    tr.requireReason ? " - bắt buộc nhập lý do" : ""
                  }`}
                  checked={selected?.to === tr.to}
                  onChange={() => {
                    setTarget(tr.to);
                    setErrors({});
                  }}
                />
              ))}
            </div>

            {isApprovalStep && (
              <div className="flex flex-col gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                <span className="flex items-center gap-1.5 font-semibold">
                  <IconCloudUpload size={15} />
                  Giao việc sang hệ thống thực thi
                </span>
                {kppn.executionSystem === "Theo dõi trong GRC" ? (
                  <span>
                    Hành động này được theo dõi trực tiếp trong GRC, không tạo
                    việc trên hệ thống ngoài.
                  </span>
                ) : kppn.externalTaskCode ? (
                  <span>
                    Đã có mã việc <b>{kppn.externalTaskCode}</b> trên{" "}
                    {kppn.executionSystem}, không tạo thêm.
                  </span>
                ) : (
                  <Checkbox
                    label={`Tạo việc trên ${kppn.executionSystem} ngay sau khi phê duyệt`}
                    checked={autoPush}
                    onChange={(e) => setAutoPush(e.target.checked)}
                  />
                )}
                {!canApprove && (
                  <span className="font-medium">
                    Chỉ Quản trị hệ thống và Ban QTRR mới được phê duyệt hành
                    động.
                  </span>
                )}
              </div>
            )}

            {isAcceptanceStep && (
              <div className="flex flex-col gap-3 rounded-card border border-lv-low-border bg-lv-low-bg/40 p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-low-text">
                  <IconCircleCheck size={16} />
                  Hồ sơ nghiệm thu
                </p>
                <p className="text-[12px] leading-4 text-lv-low-text">
                  Hành động hoàn thành bắt buộc có kết quả và bằng chứng. Hệ
                  thống sẽ tự đặt tiến độ 100%.
                </p>

                <DateInput
                  label="Ngày hoàn thành"
                  required
                  value={completedDate}
                  min={kppn.startDate || undefined}
                  error={errors.completedDate}
                  onChange={(v) => {
                    setCompletedDate(v);
                    setErrors((p) => ({ ...p, completedDate: "" }));
                  }}
                />

                <Textarea
                  label="Kết quả thực hiện"
                  required
                  rows={3}
                  maxLength={800}
                  showCount
                  placeholder="Đã làm gì, kết quả đo được ra sao"
                  value={result}
                  error={errors.result}
                  onChange={(e) => {
                    setResult(e.target.value);
                    setErrors((p) => ({ ...p, result: "" }));
                  }}
                />

                <Textarea
                  label="Bằng chứng nghiệm thu"
                  required
                  rows={2}
                  maxLength={500}
                  placeholder="Biên bản, ảnh chụp cấu hình, báo cáo kiểm tra lại"
                  value={evidence}
                  error={errors.evidence}
                  onChange={(e) => {
                    setEvidence(e.target.value);
                    setErrors((p) => ({ ...p, evidence: "" }));
                  }}
                />
              </div>
            )}

            <Textarea
              label="Lý do / ghi chú"
              required={selected?.requireReason}
              rows={3}
              maxLength={500}
              showCount
              value={reason}
              error={errors.reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErrors((p) => ({ ...p, reason: "" }));
              }}
              placeholder="Nhập lý do hoặc ghi chú cho lần chuyển trạng thái này"
            />

            {softWarnings.length > 0 && (
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
