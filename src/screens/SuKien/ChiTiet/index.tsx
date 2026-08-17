"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconBulb,
  IconCoin,
  IconEdit,
  IconHistory,
  IconHourglass,
  IconInfoCircle,
  IconLock,
  IconPlus,
  IconRadar,
  IconShieldCheck,
  IconShieldX,
  IconTool,
  IconTrash,
  IconTrendingDown,
  IconUserExclamation,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  CodeCell,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Modal,
  Radio,
  ReadField,
  RiskBadge,
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
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  canViewEvent,
  detectionLag,
  eventAging,
  eventNextTransitions,
  isEventClosed,
  isEventDeletable,
  isEventEditable,
  isMissingHandler,
  isMissingKppn,
  isMissingRiskLink,
  isMissingRootCause,
  isSlowDetection,
  isStaleEvent,
  lossVariance,
  netLoss,
  recoveryRate,
  suggestSeverity,
  type EventViewer,
} from "@/lib/domain/event-utils";
import { isKppnOverdue } from "@/lib/domain/kppn-utils";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import type {
  Control,
  Deficiency,
  GrcEvent,
  Kppn,
  Risk,
} from "@/lib/domain/schema";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

type TabKey = "tong-quan" | "ton-that" | "rui-ro" | "khac-phuc" | "lich-su";
type Lookups = ReturnType<typeof useLookups>;

/* ================================================================== */
/* Wrapper: tìm bản ghi, kiểm tra quyền xem rồi phân nhánh             */
/* ================================================================== */

export default function SuKienChiTietScreen({ code }: { code: string }) {
  const router = useRouter();
  const { user, hasRole } = useSession();
  const lk = useLookups();
  const events = useCollection(eventRepo);

  const event = useMemo(
    () => events.find((e) => e.code === code || e.id === code),
    [events, code],
  );

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );

  const viewer = useMemo<EventViewer>(
    () => ({
      privileged: hasRole("admin", "qtrr", "auditor"),
      employeeId: currentEmployee?.id ?? "",
    }),
    [hasRole, currentEmployee],
  );

  if (!event) {
    return (
      <PageContainer>
        <PageHeader title="Chi tiết sự kiện" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy sự kiện"
              description={`Không có bản ghi nào ứng với mã ${code}. Có thể bản ghi đã bị xoá hoặc đường dẫn không đúng.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/su-kien/so-theo-doi")}
                >
                  Về sổ theo dõi sự kiện
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  /* Chặn ngay từ cửa vào nếu không có quyền xem sự kiện bảo mật */
  if (!canViewEvent(event, viewer)) {
    return (
      <PageContainer>
        <PageHeader title={`${event.code} - Sự kiện bảo mật`} showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconLock size={24} />}
              title="Bạn không có quyền xem sự kiện này"
              description={`${event.code} được đánh dấu bảo mật. Chỉ Quản trị hệ thống, Ban QTRR, Kiểm toán nội bộ và người liên quan trực tiếp mới xem được nội dung.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/su-kien/so-theo-doi")}
                >
                  Về sổ theo dõi sự kiện
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return <ChiTietContent event={event} />;
}

/* ================================================================== */
/* Content: event luôn tồn tại và người dùng có quyền xem              */
/* ================================================================== */

function ChiTietContent({ event }: { event: GrcEvent }) {
  const router = useRouter();
  const toast = useToast();
  const { hasRole } = useSession();
  const lk = useLookups();

  const risks = useCollection(riskRepo);
  const controls = useCollection(controlRepo);
  const deficiencies = useCollection(deficiencyRepo);
  const kppns = useCollection(kppnRepo);

  const [tab, setTab] = useState<TabKey>("tong-quan");
  const [transiting, setTransiting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = hasRole("admin", "qtrr", "owner");

  /* ---------------------- Dữ liệu liên kết ---------------------- */

  const linkedRisks = useMemo<Risk[]>(
    () => risks.filter((r) => event.relatedRiskIds.includes(r.id)),
    [risks, event.relatedRiskIds],
  );

  const linkedControls = useMemo<Control[]>(
    () => controls.filter((c) => event.relatedControlIds.includes(c.id)),
    [controls, event.relatedControlIds],
  );

  /**
   * Điểm yếu lấy từ hai phía để không lệch dữ liệu:
   * trường deficiencyIds của sự kiện và trường eventId của chính điểm yếu.
   */
  const linkedDeficiencies = useMemo<Deficiency[]>(
    () =>
      deficiencies.filter(
        (d) => event.deficiencyIds.includes(d.id) || d.eventId === event.id,
      ),
    [deficiencies, event.deficiencyIds, event.id],
  );

  /** Hành động KPPN gắn trực tiếp với sự kiện hoặc gắn qua điểm yếu */
  const linkedKppns = useMemo<Kppn[]>(() => {
    const defIds = new Set(linkedDeficiencies.map((d) => d.id));
    return kppns
      .filter((k) => k.eventId === event.id || defIds.has(k.deficiencyId))
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  }, [kppns, event.id, linkedDeficiencies]);

  /* --------------------------- Chỉ số --------------------------- */

  const editable = isEventEditable(event.status);
  const transitions = eventNextTransitions(event.status);
  const lag = detectionLag(event);
  const aging = eventAging(event);
  const net = netLoss(event);
  const rate = recoveryRate(event);
  const variance = lossVariance(event);
  const suggested = suggestSeverity(event.actualLoss, event.isNearMiss);

  const doneKppn = linkedKppns.filter((k) => k.status === "Hoàn thành").length;
  const overdueKppn = linkedKppns.filter((k) => isKppnOverdue(k)).length;

  /* --------------------------- Hành động ------------------------ */

  function goEdit() {
    if (!editable) {
      toast.warning(
        "Không sửa được",
        `Sự kiện đang ở trạng thái ${event.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/su-kien/so-theo-doi/${event.code}/sua`);
  }

  function confirmDelete() {
    if (!isEventDeletable(event)) {
      toast.error(
        "Không xoá được",
        `Chỉ xoá được sự kiện ở trạng thái Mới ghi nhận. ${event.code} đang ở trạng thái ${event.status}.`,
      );
      return;
    }
    setDeleting(true);
  }

  function createDeficiency() {
    router.push(`/khac-phuc/diem-yeu/them-moi?event=${event.code}`);
  }

  function createKppn() {
    router.push(`/khac-phuc/kppn/them-moi?event=${event.code}`);
  }

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => router.push("/su-kien/so-theo-doi")}
        title={
          <span className="flex items-center gap-2">
            <span className="text-brand">{event.code}</span>
            <span className="truncate">{event.name}</span>
          </span>
        }
        badge={
          <span className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={event.status} />
            <RiskBadge level={event.severity} />
            {event.isNearMiss && <Badge tone="info">Near miss</Badge>}
            {event.isConfidential && (
              <Tooltip content="Sự kiện bảo mật, hạn chế phạm vi tiếp cận">
                <Badge tone="neutral" dot>
                  Bảo mật
                </Badge>
              </Tooltip>
            )}
          </span>
        }
        actions={
          canEdit && (
            <>
              {isEventDeletable(event) && (
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
                onClick={createDeficiency}
              >
                Lập điểm yếu
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
          {isSlowDetection(event) && (
            <AlertBar
              tone="danger"
              icon={<IconRadar size={18} />}
              title={`Phát hiện chậm ${lag} ngày sau khi sự kiện xảy ra`}
              description="Vượt ngưỡng 7 ngày. Đây là dấu hiệu kiểm soát phát hiện của quy trình liên quan đang yếu, nên rà soát lại cơ chế giám sát."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("rui-ro")}
                >
                  Xem kiểm soát
                </Button>
              }
            />
          )}

          {isMissingRiskLink(event) && (
            <AlertBar
              tone="danger"
              title={`Sự kiện mức ${event.severity} chưa liên kết rủi ro`}
              description="Thiếu liên kết ngược thì không đánh giá lại được mức rủi ro còn lại, và không đóng được sự kiện."
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

          {isMissingHandler(event) && (
            <AlertBar
              tone="warning"
              icon={<IconUserExclamation size={18} />}
              title="Chưa phân công người xử lý"
              description="Sự kiện đã qua bước tiếp nhận nhưng chưa có người chịu trách nhiệm. Bắt buộc phân công trước khi chuyển sang giai đoạn điều tra."
              action={
                canEdit && editable ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    onClick={goEdit}
                  >
                    Phân công
                  </Button>
                ) : undefined
              }
            />
          )}

          {isMissingRootCause(event) && (
            <AlertBar
              tone="warning"
              title="Chưa phân tích nguyên nhân gốc"
              description="Đây là điều kiện bắt buộc để đóng sự kiện. Không có nguyên nhân gốc thì hành động khắc phục sẽ chỉ xử lý phần ngọn."
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

          {isMissingKppn(event, linkedKppns.length) && (
            <AlertBar
              tone="warning"
              title={`Sự kiện mức ${event.severity} chưa có hành động khắc phục`}
              description="Sự kiện từ mức Cao trở lên nên có hành động khắc phục và phòng ngừa để tránh tái diễn."
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

          {isStaleEvent(event) && (
            <AlertBar
              tone="warning"
              icon={<IconHourglass size={18} />}
              title={`Sự kiện đã mở ${aging} ngày mà chưa đóng`}
              description="Vượt ngưỡng 60 ngày. Nên rà soát tiến độ xử lý hoặc đóng sự kiện nếu đã xử lý xong."
            />
          )}

          {overdueKppn > 0 && (
            <AlertBar
              tone="warning"
              title={`${overdueKppn} hành động KPPN đang quá hạn`}
              description="Tiến độ khắc phục hậu quả sự kiện này đang bị chậm so với kế hoạch."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("khac-phuc")}
                >
                  Xem chi tiết
                </Button>
              }
            />
          )}

          {!editable && (
            <AlertBar
              tone="info"
              title={`Sự kiện đang ở trạng thái ${event.status}`}
              description={
                event.status === "Huỷ ghi nhận"
                  ? "Bản ghi được giữ lại để truy vết nhưng không tính vào thống kê tổn thất."
                  : "Trạng thái này bị khoá chỉnh sửa nội dung. Mở lại sự kiện nếu cần cập nhật."
              }
            />
          )}

          {/* ================== Thẻ tổng quan ================== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <ContentCard className="flex flex-col justify-center gap-1">
              <p className="text-[12px] text-text-secondary">
                Mức độ nghiêm trọng
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={event.severity} />
                {suggested !== event.severity && !event.isNearMiss && (
                  <Tooltip
                    content={`Mức gợi ý theo tổn thất thực tế: ${suggested}`}
                  >
                    <Badge tone="neutral" size="sm">
                      Gợi ý {suggested}
                    </Badge>
                  </Tooltip>
                )}
              </div>
              <p className="text-[11px] text-text-hint">
                {lk.categoryName(event.categoryId, "chưa phân nhóm")} -{" "}
                {lk.unitName(event.unitId, "chưa gán đơn vị")}
              </p>
            </ContentCard>

            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">Tổn thất ròng</p>
              {event.isNearMiss ? (
                <>
                  <p className="text-[20px] leading-7 font-semibold text-lv-low-text">
                    Không phát sinh
                  </p>
                  <p className="text-[11px] text-text-hint">
                    Sự kiện suýt xảy ra, chỉ có tổn thất ước tính nếu đã nhập
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={cn(
                      "text-[22px] leading-8 font-semibold",
                      net > 0 ? "text-text-primary" : "text-lv-low-text",
                    )}
                  >
                    {formatMoney(net) || "0"}
                  </p>
                  <p className="text-[11px] text-text-hint">
                    Thực tế {formatMoney(event.actualLoss) || "--"}
                    {rate !== null ? `, đã thu hồi ${rate}%` : ""}
                  </p>
                </>
              )}
            </ContentCard>

            <ContentCard className="flex flex-col justify-center gap-1">
              <p className="text-[12px] text-text-secondary">
                Độ trễ phát hiện
              </p>
              <p
                className={cn(
                  "flex items-center gap-1.5 text-[22px] leading-8 font-semibold",
                  isSlowDetection(event)
                    ? "text-danger"
                    : lag === 0
                      ? "text-lv-low-text"
                      : "text-text-primary",
                )}
              >
                {isSlowDetection(event) && <IconRadar size={18} />}
                {lag === 0 ? "Cùng ngày" : `${lag} ngày`}
              </p>
              <p className="text-[11px] text-text-hint">
                Xảy ra {formatDate(event.occurredDate)}, phát hiện{" "}
                {formatDate(event.detectedDate)}
              </p>
            </ContentCard>

            <ContentCard className="flex flex-col justify-center gap-1">
              <p className="text-[12px] text-text-secondary">
                {isEventClosed(event) ? "Kết quả xử lý" : "Số ngày đang mở"}
              </p>
              {isEventClosed(event) ? (
                <>
                  <p className="text-[18px] leading-7 font-semibold text-text-primary">
                    {event.status}
                  </p>
                  <p className="text-[11px] text-text-hint">
                    Tổng thời gian xử lý {aging} ngày
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={cn(
                      "text-[22px] leading-8 font-semibold",
                      isStaleEvent(event) ? "text-danger" : "text-text-primary",
                    )}
                  >
                    {aging}
                  </p>
                  <p className="text-[11px] text-text-hint">
                    Người xử lý:{" "}
                    {lk.employeeName(event.handlerId, "chưa phân công")}
                  </p>
                </>
              )}
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
                  { key: "ton-that", label: "Tổn thất & thu hồi" },
                  {
                    key: "rui-ro",
                    label: "Rủi ro & kiểm soát",
                    count: linkedRisks.length + linkedControls.length,
                  },
                  {
                    key: "khac-phuc",
                    label: "Điểm yếu & hành động KPPN",
                    count: linkedDeficiencies.length + linkedKppns.length,
                  },
                  { key: "lich-su", label: "Lịch sử" },
                ]}
              />
            </div>

            <div className="p-4">
              {tab === "tong-quan" && <TabTongQuan event={event} lk={lk} />}
              {tab === "ton-that" && <TabTonThat event={event} />}
              {tab === "rui-ro" && (
                <TabRuiRo
                  event={event}
                  risks={linkedRisks}
                  controls={linkedControls}
                  lk={lk}
                />
              )}
              {tab === "khac-phuc" && (
                <TabKhacPhuc
                  deficiencies={linkedDeficiencies}
                  kppns={linkedKppns}
                  lk={lk}
                  canEdit={canEdit}
                  onCreateDeficiency={createDeficiency}
                  onCreateKppn={createKppn}
                />
              )}
              {tab === "lich-su" && (
                <TabLichSu
                  event={event}
                  deficiencies={linkedDeficiencies}
                  kppns={linkedKppns}
                />
              )}
            </div>
          </ContentCard>
        </div>
      </PageBody>

      {/* ======================== Hộp thoại ======================== */}
      <TransitionModal
        open={transiting}
        event={event}
        kppnCount={linkedKppns.length}
        doneKppn={doneKppn}
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
          eventRepo.remove(event.id);
          setDeleting(false);
          toast.success("Đã xoá", `${event.code} đã được xoá.`);
          router.push("/su-kien/so-theo-doi");
        }}
        tone="danger"
        title="Xoá sự kiện"
        message={
          <>
            Bạn có chắc muốn xoá <b>{event.code}</b>? Hành động này không thể
            hoàn tác. Nếu muốn giữ lại bản ghi để truy vết, hãy dùng{" "}
            <b>Huỷ ghi nhận</b> thay vì xoá.
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
  icon,
  title,
  description,
  action,
}: {
  tone: "info" | "warning" | "danger";
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const style = {
    info: "border-lv-info-border bg-lv-info-bg text-lv-info-text",
    warning: "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
    danger: "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text",
  }[tone];

  const fallback =
    tone === "info" ? (
      <IconInfoCircle size={18} />
    ) : (
      <IconAlertTriangle size={18} />
    );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5",
        style,
      )}
    >
      <span className="shrink-0">{icon ?? fallback}</span>
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

function TabTongQuan({ event, lk }: { event: GrcEvent; lk: Lookups }) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Thông tin định danh">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Mã sự kiện">
            <b className="text-brand">{event.code}</b>
          </ReadField>
          <ReadField label="Nhóm sự kiện">
            {lk.categoryName(event.categoryId)}
          </ReadField>
          <ReadField label="Trạng thái">
            <StatusBadge status={event.status} />
          </ReadField>
          <ReadField label="Đơn vị xảy ra">
            {lk.unitName(event.unitId)}
          </ReadField>
          <ReadField label="Người báo cáo">
            <UserCell
              name={lk.employeeName(event.reporterId, "Không rõ")}
              sub={lk.employeeById(event.reporterId)?.title}
              size={26}
            />
          </ReadField>
          <ReadField label="Người xử lý">
            {event.handlerId ? (
              <UserCell
                name={lk.employeeName(event.handlerId)}
                sub={lk.employeeById(event.handlerId)?.title}
                size={26}
              />
            ) : (
              <span className="inline-flex items-center gap-1 text-lv-medium-text">
                <IconUserExclamation size={14} />
                Chưa phân công
              </span>
            )}
          </ReadField>
          <ReadField label="Ngày xảy ra">
            {formatDate(event.occurredDate)}
          </ReadField>
          <ReadField label="Ngày phát hiện">
            <span
              className={cn(
                isSlowDetection(event) && "font-medium text-danger",
              )}
            >
              {formatDate(event.detectedDate)}
              {isSlowDetection(event)
                ? ` (trễ ${detectionLag(event)} ngày)`
                : ""}
            </span>
          </ReadField>
          <ReadField label="Loại ảnh hưởng">
            {event.impactTypes.length === 0 ? (
              "--"
            ) : (
              <span className="flex flex-wrap gap-1">
                {event.impactTypes.map((v) => (
                  <Badge key={v} tone="neutral" size="sm">
                    {v}
                  </Badge>
                ))}
              </span>
            )}
          </ReadField>
        </div>
      </Section>

      <Section title="Diễn biến sự kiện">
        <p className="text-[13px] leading-5 whitespace-pre-line text-text-primary">
          {event.description || "--"}
        </p>
      </Section>

      <Section title="Nguyên nhân gốc" note="Bắt buộc trước khi đóng sự kiện">
        {event.rootCause.trim() ? (
          <p className="text-[13px] leading-5 whitespace-pre-line text-text-primary">
            {event.rootCause}
          </p>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 rounded-ctrl border px-3 py-2.5 text-[12px]",
              isMissingRootCause(event)
                ? "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text"
                : "border-dashed border-border-neutral text-text-hint",
            )}
          >
            <IconAlertTriangle size={15} className="shrink-0" />
            Chưa phân tích nguyên nhân gốc.
          </div>
        )}
      </Section>

      <Section
        title="Bài học kinh nghiệm"
        note="Giá trị lớn nhất của việc ghi nhận sự kiện"
      >
        {event.lessonLearned.trim() ? (
          <div className="flex gap-2 rounded-ctrl border border-lv-low-border bg-lv-low-bg/40 p-3 text-[13px] leading-5 whitespace-pre-line text-text-primary">
            <IconBulb size={16} className="mt-0.5 shrink-0 text-lv-low-text" />
            {event.lessonLearned}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-ctrl border border-dashed border-border-neutral px-3 py-2.5 text-[12px] text-text-hint">
            <IconBulb size={15} className="shrink-0" />
            Chưa ghi bài học kinh nghiệm. Nên bổ sung trước khi đóng sự kiện.
          </div>
        )}
      </Section>

      <Section title="Thông tin quản trị">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Ghi chú trạng thái">
            {event.statusNote || "--"}
          </ReadField>
          <ReadField label="Người tạo">{event.createdBy || "--"}</ReadField>
          <ReadField label="Số ngày kể từ phát hiện">
            {eventAging(event)} ngày
          </ReadField>
          <ReadField label="Ngày tạo">
            {formatDateTime(event.createdAt)}
          </ReadField>
          <ReadField label="Cập nhật gần nhất">
            {formatDateTime(event.updatedAt)}
          </ReadField>
          <ReadField label="Chế độ bảo mật">
            {event.isConfidential ? (
              <span className="inline-flex items-center gap-1 text-lv-medium-text">
                <IconLock size={14} />
                Hạn chế phạm vi tiếp cận
              </span>
            ) : (
              "Công khai trong hệ thống"
            )}
          </ReadField>
        </div>
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 2: Tổn thất và thu hồi                                        */
/* ================================================================== */

function TabTonThat({ event }: { event: GrcEvent }) {
  const net = netLoss(event);
  const rate = recoveryRate(event);
  const variance = lossVariance(event);
  const suggested = suggestSeverity(event.actualLoss, event.isNearMiss);

  if (event.isNearMiss) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={<IconCoin size={24} />}
          title="Sự kiện suýt xảy ra nên không có tổn thất thực tế"
          description="Giá trị của bản ghi này nằm ở bài học kinh nghiệm và hành động phòng ngừa, không nằm ở con số tổn thất."
          compact
        />
        {event.estimatedLoss !== null && (
          <div className="flex flex-wrap items-center gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg px-3 py-2.5 text-[12px] leading-4 text-lv-info-text">
            <IconInfoCircle size={16} className="shrink-0" />
            <span>
              Tổn thất <b>ước tính</b> nếu sự kiện thực sự xảy ra là{" "}
              <b>{formatMoney(event.estimatedLoss)}</b> VNĐ. Con số này dùng để
              xếp thứ tự ưu tiên phòng ngừa, không tính vào thống kê tổn thất
              thực tế.
            </span>
          </div>
        )}
      </div>
    );
  }

  const max = Math.max(event.estimatedLoss ?? 0, event.actualLoss ?? 0, 1);

  return (
    <div className="flex flex-col gap-5">
      <Section title="Số liệu tổn thất">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <MoneyCard
            label="Tổn thất ước tính"
            value={event.estimatedLoss}
            hint="Ghi nhận tại thời điểm phát hiện"
          />
          <MoneyCard
            label="Tổn thất thực tế"
            value={event.actualLoss}
            hint="Số liệu chốt sau xác minh"
            tone="danger"
          />
          <MoneyCard
            label="Đã thu hồi"
            value={event.recoveredAmount}
            hint={rate !== null ? `Tỷ lệ thu hồi ${rate}%` : "Chưa thu hồi"}
            tone="success"
          />
          <MoneyCard
            label="Tổn thất ròng"
            value={net}
            hint="Con số dùng cho báo cáo Ban điều hành"
            tone="brand"
          />
        </div>
      </Section>

      <Section
        title="So sánh ước tính và thực tế"
        note="Chênh lệch lớn cho thấy khâu đánh giá ban đầu cần cải thiện"
      >
        {event.estimatedLoss === null || event.actualLoss === null ? (
          <p className="text-[13px] text-text-hint">
            Chưa đủ dữ liệu để so sánh, cần có cả tổn thất ước tính và thực tế.
          </p>
        ) : (
          <div className="flex flex-col gap-3 rounded-ctrl border border-border-light p-3">
            <CompareBar
              label="Ước tính"
              value={event.estimatedLoss}
              max={max}
              className="bg-[#B8C0CC]"
            />
            <CompareBar
              label="Thực tế"
              value={event.actualLoss}
              max={max}
              className={cn((variance ?? 0) > 0 ? "bg-danger" : "bg-brand")}
            />
            {(event.recoveredAmount ?? 0) > 0 && (
              <CompareBar
                label="Thu hồi"
                value={event.recoveredAmount ?? 0}
                max={max}
                className="bg-success"
              />
            )}

            <p
              className={cn(
                "border-t border-border-light pt-2.5 text-[12px] leading-4",
                (variance ?? 0) > 0 ? "text-danger" : "text-lv-low-text",
              )}
            >
              {variance === null || variance === 0 ? (
                "Tổn thất thực tế đúng bằng ước tính ban đầu."
              ) : variance > 0 ? (
                <>
                  Tổn thất thực tế{" "}
                  <b>cao hơn ước tính {formatMoney(variance)}</b> VNĐ. Nên rà
                  soát lại cách đánh giá tác động ban đầu để lần sau ước lượng
                  sát hơn.
                </>
              ) : (
                <>
                  Tổn thất thực tế{" "}
                  <b>thấp hơn ước tính {formatMoney(Math.abs(variance))}</b>{" "}
                  VNĐ, phản ánh biện pháp xử lý kịp thời đã hạn chế được thiệt
                  hại.
                </>
              )}
            </p>
          </div>
        )}
      </Section>

      <Section title="Loại ảnh hưởng đã ghi nhận">
        {event.impactTypes.length === 0 ? (
          <p className="text-[13px] text-text-hint">
            Chưa ghi nhận loại ảnh hưởng nào.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {event.impactTypes.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1.5 rounded-ctrl bg-surface-alt px-3 py-1.5 text-[12px] font-medium text-text-primary"
              >
                {v === "Tài chính" ? (
                  <IconCoin size={14} className="text-lv-medium-text" />
                ) : v === "An toàn thông tin" ? (
                  <IconShieldX size={14} className="text-lv-high-text" />
                ) : (
                  <IconBolt size={14} className="text-brand" />
                )}
                {v}
              </span>
            ))}
          </div>
        )}
      </Section>

      {suggested !== event.severity && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Với tổn thất thực tế đã ghi nhận, mức nghiêm trọng gợi ý là{" "}
            <b>{suggested}</b> nhưng sự kiện đang xếp mức{" "}
            <b>{event.severity}</b>. Nếu có căn cứ khác như ảnh hưởng uy tín hay
            pháp lý thì giữ nguyên, ngược lại nên điều chỉnh cho nhất quán.
          </span>
        </div>
      )}
    </div>
  );
}

function MoneyCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | null;
  hint?: string;
  tone?: "neutral" | "brand" | "danger" | "success";
}) {
  const color: Record<string, string> = {
    neutral: "text-text-primary",
    brand: "text-brand",
    danger: "text-danger",
    success: "text-lv-low-text",
  };
  return (
    <div className="flex flex-col gap-0.5 rounded-ctrl border border-border-light p-3">
      <p className="text-[12px] text-text-secondary">{label}</p>
      <p className={cn("text-[18px] leading-7 font-semibold", color[tone])}>
        {value === null ? "--" : formatMoney(value) || "0"}
      </p>
      {hint && <p className="text-[11px] text-text-hint">{hint}</p>}
    </div>
  );
}

function CompareBar({
  label,
  value,
  max,
  className,
}: {
  label: string;
  value: number;
  max: number;
  className?: string;
}) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-[70px] shrink-0 text-[12px] text-text-secondary">
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
        <span
          className={cn("block h-full rounded-full", className)}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-[130px] shrink-0 text-right text-[12px] font-medium text-text-primary">
        {formatMoney(value) || "0"}
      </span>
    </div>
  );
}

/* ================================================================== */
/* Tab 3: Rủi ro và kiểm soát                                        */
/* ================================================================== */

function TabRuiRo({
  event,
  risks,
  controls,
  lk,
}: {
  event: GrcEvent;
  risks: Risk[];
  controls: Control[];
  lk: Lookups;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-5">
      <Section
        title={`Rủi ro đã hiện thực hoá ( ${risks.length})`}
        note="Sự kiện là bằng chứng thực tế để đánh giá lại mức rủi ro còn lại"
      >
        {risks.length === 0 ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-ctrl border px-3 py-2.5 text-[12px]",
              isMissingRiskLink(event)
                ? "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text"
                : "border-dashed border-border-neutral text-text-hint",
            )}
          >
            <IconAlertTriangle size={15} className="shrink-0" />
            {isMissingRiskLink(event)
              ? `Sự kiện mức ${event.severity} bắt buộc liên kết ít nhất 1 rủi ro trước khi đóng.`
              : "Chưa liên kết rủi ro nào trong sổ đăng ký."}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {risks.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/rui-ro/so-dang-ky/${r.code}`)}
                className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-medium-bg text-lv-medium-text">
                  <IconAlertTriangle size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-text-primary">
                    <b className="text-brand">{r.code}</b> {r.name}
                  </p>
                  <p className="truncate text-[12px] text-text-secondary">
                    {lk.categoryName(r.categoryId)} - {lk.unitName(r.unitId)} -{" "}
                    {lk.employeeName(r.ownerId)}
                  </p>
                </div>
                {r.isZeroTolerance && <Badge tone="danger">KKN</Badge>}
                <RiskBadge
                  level={residualLevelOf(r)}
                  score={residualScoreOf(r)}
                />
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={`Kiểm soát đã thất bại ( ${controls.length})`}
        note="Kiểm soát lẽ ra phải ngăn được sự kiện này"
      >
        {controls.length === 0 ? (
          <div className="flex items-center gap-2 rounded-ctrl border border-dashed border-border-neutral px-3 py-2.5 text-[12px] text-text-hint">
            <IconShieldX size={15} className="shrink-0" />
            Chưa xác định kiểm soát nào thất bại. Nên bổ sung để phân hệ Kiểm
            soát đánh giá lại hiệu lực.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {controls.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`/kiem-soat/so-dang-ky/${c.code}`)}
                className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
                  <IconShieldCheck size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-text-primary">
                    <b className="text-brand">{c.code}</b> {c.name}
                  </p>
                  <p className="truncate text-[12px] text-text-secondary">
                    {c.type} - {c.nature} - {c.frequency} -{" "}
                    {lk.employeeName(c.ownerId)}
                  </p>
                </div>
                {c.isKeyControl && <Badge tone="brand">Trọng yếu</Badge>}
                {c.lastTestResult && <StatusBadge status={c.lastTestResult} />}
                <StatusBadge status={c.status} />
              </button>
            ))}
          </div>
        )}
      </Section>

      <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
        <IconInfoCircle size={16} className="mt-px shrink-0" />
        <span>
          Sự kiện đã xảy ra là <b>bằng chứng mạnh nhất</b> cho thấy kiểm soát
          chưa hiệu lực. Sau khi đóng sự kiện, nên tạo đợt kiểm tra lại cho các
          kiểm soát ở trên tại phân hệ Kiểm soát, và đánh giá lại mức rủi ro còn
          lại của các rủi ro liên quan.
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab 4: Điểm yếu và hành động KPPN                                   */
/* ================================================================== */

function TabKhacPhuc({
  deficiencies,
  kppns,
  lk,
  canEdit,
  onCreateDeficiency,
  onCreateKppn,
}: {
  deficiencies: Deficiency[];
  kppns: Kppn[];
  lk: Lookups;
  canEdit: boolean;
  onCreateDeficiency: () => void;
  onCreateKppn: () => void;
}) {
  const router = useRouter();

  const defColumns: Column<Deficiency>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
      render: (d) => (
        <CodeCell
          code={d.code}
          onClick={() => router.push(`/khac-phuc/diem-yeu/${d.code}`)}
        />
      ),
    },
    {
      key: "name",
      header: "Tên điểm yếu",
      minWidth: 280,
      render: (d) => <TitleCell title={d.name} sub={d.sourceType} />,
    },
    {
      key: "owner",
      header: "Người chịu trách nhiệm",
      width: 200,
      render: (d) => (
        <UserCell name={lk.employeeName(d.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "due",
      header: "Hạn khắc phục",
      width: 135,
      render: (d) => formatDate(d.dueDate) || "Chưa đặt",
    },
    {
      key: "severity",
      header: "Mức",
      width: 130,
      render: (d) => <RiskBadge level={d.severity} />,
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 145,
      render: (d) => <StatusBadge status={d.status} />,
    },
  ];

  const kppnColumns: Column<Kppn>[] = [
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
      minWidth: 280,
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
            </span>
          }
          sub={`${k.type} - ${k.executionSystem}`}
        />
      ),
    },
    {
      key: "assignee",
      header: "Người thực hiện",
      width: 190,
      render: (k) => (
        <UserCell name={lk.employeeName(k.assigneeId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "progress",
      header: "Tiến độ",
      width: 145,
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
      key: "status",
      header: "Trạng thái",
      width: 145,
      render: (k) => <StatusBadge status={k.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Section
        title={`Điểm yếu kiểm soát phát hiện qua sự kiện ( ${deficiencies.length})`}
      >
        {deficiencies.length === 0 ? (
          <EmptyState
            icon={<IconTool size={24} />}
            title="Chưa ghi nhận điểm yếu nào"
            description="Nếu sự kiện cho thấy khiếm khuyết của hệ thống kiểm soát, hãy lập điểm yếu để theo dõi việc khắc phục."
            compact
            action={
              canEdit ? (
                <Button
                  variant="primary"
                  icon={<IconPlus size={16} />}
                  onClick={onCreateDeficiency}
                >
                  Lập điểm yếu từ sự kiện
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-ctrl border border-border-light">
              <DataTable
                columns={defColumns}
                rows={deficiencies}
                getKey={(d) => d.id}
                onRowClick={(d) => router.push(`/khac-phuc/diem-yeu/${d.code}`)}
              />
            </div>
            {canEdit && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  icon={<IconPlus size={14} />}
                  onClick={onCreateDeficiency}
                >
                  Lập thêm điểm yếu
                </Button>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        title={`Hành động khắc phục & phòng ngừa ( ${kppns.length})`}
        note="Gồm hành động gắn trực tiếp với sự kiện và hành động gắn qua điểm yếu"
      >
        {kppns.length === 0 ? (
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
                  onClick={onCreateKppn}
                >
                  Lập hành động KPPN
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-ctrl border border-border-light">
              <DataTable
                columns={kppnColumns}
                rows={kppns}
                getKey={(k) => k.id}
                onRowClick={(k) => router.push(`/khac-phuc/kppn/${k.code}`)}
                rowClassName={(k) =>
                  isKppnOverdue(k) ? "!bg-lv-critical-bg" : undefined
                }
              />
            </div>
            {canEdit && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  icon={<IconPlus size={14} />}
                  onClick={onCreateKppn}
                >
                  Lập thêm hành động
                </Button>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 5: Lịch sử                                        */
/* ================================================================== */

interface TimelineItem {
  date: string;
  title: string;
  description?: string;
  tone: "brand" | "success" | "warning" | "danger" | "neutral";
  icon: React.ReactNode;
}

function TabLichSu({
  event,
  deficiencies,
  kppns,
}: {
  event: GrcEvent;
  deficiencies: Deficiency[];
  kppns: Kppn[];
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];

    out.push({
      date: event.occurredDate,
      title: "Sự kiện xảy ra",
      description: event.description || event.name,
      tone:
        event.severity === "Cao" || event.severity === "Trọng yếu"
          ? "danger"
          : "warning",
      icon: <IconBolt size={14} />,
    });

    out.push({
      date: event.detectedDate,
      title: `Phát hiện và ghi nhận ${event.code}`,
      description: isSlowDetection(event)
        ? `Phát hiện sau ${detectionLag(event)} ngày, vượt ngưỡng 7 ngày.`
        : `Độ trễ phát hiện ${detectionLag(event)} ngày.`,
      tone: isSlowDetection(event) ? "danger" : "brand",
      icon: <IconRadar size={14} />,
    });

    deficiencies.forEach((d) => {
      out.push({
        date: d.detectedDate,
        title: `Ghi nhận điểm yếu ${d.code}`,
        description: `${d.name} - mức ${d.severity}.`,
        tone: "warning",
        icon: <IconTool size={14} />,
      });
    });

    kppns.forEach((k) => {
      out.push({
        date: k.startDate,
        title: `Bắt đầu hành động ${k.code}`,
        description: `${k.name} - thực thi trên ${k.executionSystem}.`,
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
    });

    if (isEventClosed(event)) {
      out.push({
        date: event.updatedAt.slice(0, 10),
        title:
          event.status === "Đã đóng" ? "Đóng sự kiện" : "Huỷ ghi nhận sự kiện",
        description:
          event.statusNote ||
          (event.status === "Đã đóng"
            ? "Đã xác minh, xử lý và rút bài học kinh nghiệm."
            : "Xác nhận đây không phải sự kiện rủi ro."),
        tone: event.status === "Đã đóng" ? "success" : "neutral",
        icon: <IconHourglass size={14} />,
      });
    }

    return out
      .filter((x) => !!x.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [event, deficiencies, kppns]);

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
        Dòng thời gian tổng hợp từ các mốc nghiệp vụ liên quan tới sự kiện. Bản
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
  event,
  kppnCount,
  doneKppn,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  event: GrcEvent;
  kppnCount: number;
  doneKppn: number;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onError: (message: string, detail?: string) => void;
}) {
  const list = eventNextTransitions(event.status);
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

  /* --------------------- Điều kiện chặn chuyển ------------------- */

  const blockReasons = useMemo(() => {
    if (!selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Đang điều tra" && !event.handlerId)
      out.push(
        "Bắt buộc phân công người xử lý trước khi chuyển sang giai đoạn điều tra.",
      );

    if (selected.to === "Đã đóng") {
      if (!event.rootCause.trim())
        out.push("Bắt buộc phân tích nguyên nhân gốc trước khi đóng sự kiện.");
      if (
        (event.severity === "Cao" || event.severity === "Trọng yếu") &&
        event.relatedRiskIds.length === 0
      )
        out.push(
          "Sự kiện mức Cao trở lên phải liên kết ngược về rủi ro trước khi đóng.",
        );
    }

    return out;
  }, [event, selected]);

  /* ----------------------- Cảnh báo mềm ------------------------- */

  const softWarnings = useMemo(() => {
    if (!selected) return [] as string[];
    const out: string[] = [];

    if (selected.to === "Huỷ ghi nhận")
      out.push(
        "Huỷ ghi nhận nghĩa là xác nhận đây không phải sự kiện rủi ro. Bản ghi vẫn được lưu để truy vết nhưng không tính vào thống kê tổn thất.",
      );

    if (
      selected.to === "Đã đóng" &&
      (event.severity === "Cao" || event.severity === "Trọng yếu") &&
      kppnCount === 0
    )
      out.push(
        `Sự kiện mức ${event.severity} chưa có hành động khắc phục và phòng ngừa nào. Nên lập KPPN trước khi đóng để tránh tái diễn.`,
      );

    if (selected.to === "Đã đóng" && kppnCount > 0 && doneKppn < kppnCount)
      out.push(
        `Còn ${kppnCount - doneKppn} hành động KPPN chưa hoàn thành. Đóng sự kiện lúc này thì việc khắc phục vẫn phải theo dõi tiếp ở phân hệ Khắc phục.`,
      );

    if (selected.to === "Đã đóng" && !event.lessonLearned.trim())
      out.push(
        "Chưa ghi bài học kinh nghiệm. Đây là giá trị lớn nhất của việc ghi nhận sự kiện.",
      );

    if (selected.to === "Đã xác minh" && event.relatedControlIds.length === 0)
      out.push(
        "Chưa xác định kiểm soát nào đã thất bại. Nên gắn kiểm soát liên quan để đánh giá lại hiệu lực.",
      );

    if (isSlowDetection(event))
      out.push(
        `Sự kiện được phát hiện sau ${detectionLag(event)} ngày. Nên ghi rõ nguyên nhân phát hiện chậm trong ghi chú.`,
      );

    return out;
  }, [event, selected, kppnCount, doneKppn]);

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

    eventRepo.update(event.id, {
      status: selected.to,
      statusNote: reason.trim() || event.statusNote,
    });

    onDone(
      `${event.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${event.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái sự kiện"
      description={`${event.code} - ${event.name}`}
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
          <StatusBadge status={event.status} />
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
            <RiskBadge level={event.severity} />
          </span>
        </div>

        {list.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Sự kiện đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                  name="event-detail-transition"
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
                Người xử lý:{" "}
                <b
                  className={cn(
                    event.handlerId ? "text-text-primary" : "text-danger",
                  )}
                >
                  {event.handlerId ? "Đã phân công" : "Chưa phân công"}
                </b>
              </span>
              <span>
                Nguyên nhân gốc:{" "}
                <b
                  className={cn(
                    event.rootCause.trim()
                      ? "text-text-primary"
                      : "text-danger",
                  )}
                >
                  {event.rootCause.trim() ? "Đã phân tích" : "Chưa có"}
                </b>
              </span>
              <span>
                Rủi ro liên kết:{" "}
                <b className="text-text-primary">
                  {event.relatedRiskIds.length}
                </b>
              </span>
              <span>
                Hành động KPPN:{" "}
                <b className="text-text-primary">
                  {doneKppn}/{kppnCount} hoàn thành
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
