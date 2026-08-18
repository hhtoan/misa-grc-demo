"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarExclamation,
  IconCalendarRepeat,
  IconClipboardCheck,
  IconCopy,
  IconEdit,
  IconFileOff,
  IconHistory,
  IconInfoCircle,
  IconRobot,
  IconShieldCheck,
  IconShieldOff,
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
  controlExceptionRepo,
  controlRepo,
  controlTestRepo,
  deficiencyRepo,
  kppnRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  controlHealth,
  controlNextTransitions,
  daysToNextTest,
  isControlDeletable,
  isControlEditable,
  isControlExpired,
  isExpiringSoon,
  isNeverTested,
  isTestDueSoon,
  isTestFailed,
  isTestOverdue,
  nextTestDate,
  testCycleOf,
} from "@/lib/domain/control-utils";
import {
  inherentScoreOf,
  reductionPercentOf,
  residualLevelOf,
  residualScoreOf,
} from "@/lib/domain/risk-utils";
import type {
  Control,
  ControlException,
  ControlTest,
  Deficiency,
  Kppn,
  Risk,
} from "@/lib/domain/schema";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";
import ControlEffectivenessPanel from "./ControlEffectivenessPanel";

/* ================================================================== */

type TabKey = "tong-quan" | "rui-ro" | "kiem-tra" | "diem-yeu" | "lich-su";

type Lookups = ReturnType<typeof useLookups>;

/* ================================================================== */
/* Wrapper: tìm bản ghi rồi phân nhánh                                 */
/* ================================================================== */

export default function ChiTietKiemSoatScreen({ code }: { code: string }) {
  const router = useRouter();
  const controls = useCollection(controlRepo);

  const control = useMemo(
    () => controls.find((c) => c.code === code || c.id === code),
    [controls, code],
  );

  if (!control) {
    return (
      <PageContainer>
        <PageHeader title="Chi tiết kiểm soát" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy kiểm soát"
              description={`Không có bản ghi nào ứng với mã ${code}. Có thể bản ghi đã bị xoá hoặc đường dẫn không đúng.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/kiem-soat/so-dang-ky")}
                >
                  Về sổ đăng ký kiểm soát
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return <ChiTietContent control={control} />;
}

/* ================================================================== */
/* Content: control luôn tồn tại                                       */
/* ================================================================== */

function ChiTietContent({ control }: { control: Control }) {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const risks = useCollection(riskRepo);
  const tests = useCollection(controlTestRepo);
  const exceptions = useCollection(controlExceptionRepo);
  const deficiencies = useCollection(deficiencyRepo);
  const kppns = useCollection(kppnRepo);

  const [tab, setTab] = useState<TabKey>("tong-quan");
  const [transiting, setTransiting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = hasRole("admin", "qtrr", "owner");

  /* ---------------------- Dữ liệu liên kết ---------------------- */

  const linkedRisks = useMemo(
    () => risks.filter((r) => control.riskIds.includes(r.id)),
    [risks, control.riskIds],
  );

  const linkedTests = useMemo(
    () =>
      tests
        .filter((t) => t.controlId === control.id)
        .sort((a, b) => (a.testDate < b.testDate ? 1 : -1)),
    [tests, control.id],
  );

  const linkedDeficiencies = useMemo(
    () => deficiencies.filter((d) => d.controlId === control.id),
    [deficiencies, control.id],
  );

  const linkedExceptions = useMemo(
    () =>
      exceptions
        .filter((e) => e.controlId === control.id)
        .sort((a, b) => (a.startDate < b.startDate ? 1 : -1)),
    [exceptions, control.id],
  );

  const linkedKppns = useMemo(() => {
    const defIds = new Set(linkedDeficiencies.map((d) => d.id));
    return kppns.filter((k) => k.deficiencyId && defIds.has(k.deficiencyId));
  }, [kppns, linkedDeficiencies]);

  /* --------------------------- Trạng thái ----------------------- */

  const editable = isControlEditable(control.status);
  const transitions = controlNextTransitions(control.status);
  const health = controlHealth(control);
  const remain = daysToNextTest(control);
  const due = nextTestDate(control);

  const activeException = useMemo(
    () => linkedExceptions.find((e) => e.status === "Đã duyệt"),
    [linkedExceptions],
  );

  const openDeficiencies = linkedDeficiencies.filter(
    (d) => d.status !== "Đã đóng",
  );

  /* --------------------------- Hành động ------------------------ */

  function goEdit() {
    if (!editable) {
      toast.warning(
        "Không sửa được",
        `Kiểm soát đang ở trạng thái ${control.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/kiem-soat/so-dang-ky/${control.code}/sua`);
  }

  function duplicate() {
    const created = controlRepo.create(
      {
        name: `${control.name} (bản sao)`,
        description: control.description,
        riskIds: [...control.riskIds],
        type: control.type,
        nature: control.nature,
        frequency: control.frequency,
        unitId: control.unitId,
        ownerId: control.ownerId,
        processId: control.processId,
        systemId: control.systemId,
        isKeyControl: control.isKeyControl,
        effectiveDate: control.effectiveDate,
        expireDate: "",
        status: "Nháp",
        statusNote: "",
        lastTestResult: null,
        lastTestDate: "",
        evidenceRequirement: control.evidenceRequirement,
      },
      user.name,
    );
    toast.success("Đã nhân bản", `Bản sao ${created.code} ở trạng thái Nháp.`);
    router.push(`/kiem-soat/so-dang-ky/${created.code}`);
  }

  function confirmDelete() {
    if (!isControlDeletable(control.status)) {
      toast.error(
        "Không xoá được",
        `Chỉ xoá được kiểm soát ở trạng thái Nháp. ${control.code} đang ở trạng thái ${control.status}.`,
      );
      return;
    }
    setDeleting(true);
  }

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => router.push("/kiem-soat/so-dang-ky")}
        title={
          <span className="flex items-center gap-2">
            <span className="text-brand">{control.code}</span>
            <span className="truncate">{control.name}</span>
          </span>
        }
        badge={
          <span className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={control.status} />
            {control.isKeyControl && <Badge tone="brand">Trọng yếu</Badge>}
            {control.nature !== "Thủ công" && (
              <Tooltip content={`Kiểm soát ${control.nature.toLowerCase()}`}>
                <Badge tone="info" dot>
                  {control.nature}
                </Badge>
              </Tooltip>
            )}
          </span>
        }
        actions={
          canEdit && (
            <>
              {isControlDeletable(control.status) && (
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
                icon={<IconCopy size={16} />}
                onClick={duplicate}
              >
                Nhân bản
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
          <ControlEffectivenessPanel
            control={control}
            editable={canEdit}
            testerName={(id) => lk.employeeName(id, "không rõ")}
            onCreateTest={() =>
              router.push(`/kiem-soat/ket-qua-kiem-tra?control=${control.code}`)
            }
            onEditDesign={() =>
              router.push(`/kiem-soat/so-dang-ky/${control.code}/sua`)
            }
            onCreateKppn={() =>
              router.push(`/khac-phuc/kppn/them-moi?control=${control.code}`)
            }
            onLinkRisk={() =>
              router.push(`/kiem-soat/so-dang-ky/${control.code}/sua`)
            }
          />

          {/* ================== Dải cảnh báo ================== */}
          {isControlExpired(control) && (
            <AlertBar
              tone="danger"
              title={`Đã qua ngày hết hiệu lực ${formatDate(control.expireDate)} nhưng trạng thái vẫn là ${control.status}`}
              description="Cần chuyển sang Hết hiệu lực hoặc gia hạn thời gian áp dụng."
            />
          )}

          {isTestOverdue(control) && (
            <AlertBar
              tone="danger"
              title={`Quá hạn kiểm tra hiệu lực ${Math.abs(remain ?? 0)} ngày`}
              description={`Chu kỳ kiểm tra là ${testCycleOf(control)} ngày theo tần suất vận hành ${control.frequency.toLowerCase()}. Hạn gần nhất là ${formatDate(due)}.`}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("kiem-tra")}
                >
                  Xem lịch sử kiểm tra
                </Button>
              }
            />
          )}

          {isNeverTested(control) && (
            <AlertBar
              tone="warning"
              title="Kiểm soát đang hiệu lực nhưng chưa từng được kiểm tra"
              description={`Đã hiệu lực từ ${formatDate(control.effectiveDate)}. Cần đưa vào kế hoạch kiểm tra kỳ gần nhất.`}
            />
          )}

          {isTestFailed(control) && (
            <AlertBar
              tone="warning"
              title={`Kết quả kiểm tra gần nhất là ${control.lastTestResult}`}
              description={
                openDeficiencies.length > 0
                  ? `Đang có ${openDeficiencies.length} điểm yếu chưa đóng liên quan tới kiểm soát này.`
                  : "Chưa ghi nhận điểm yếu nào từ kết quả kiểm tra này, cần rà soát lại."
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("diem-yeu")}
                >
                  Xem điểm yếu
                </Button>
              }
            />
          )}

          {activeException && (
            <AlertBar
              tone="info"
              title={`Đang có ngoại lệ ${activeException.code} được phê duyệt`}
              description={`Hiệu lực từ ${formatDate(activeException.startDate)} đến ${formatDate(activeException.endDate)}. Biện pháp bù đắp: ${activeException.compensatingControl}`}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("diem-yeu")}
                >
                  Xem ngoại lệ
                </Button>
              }
            />
          )}

          {!editable && (
            <AlertBar
              tone="info"
              title={`Kiểm soát đang ở trạng thái ${control.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung. Chuyển trạng thái trước nếu cần cập nhật."
            />
          )}

          {/* ================== Thẻ tổng quan ================== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <HealthCard value={health} status={control.status} />

            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">
                Kết quả kiểm tra gần nhất
              </p>
              {control.lastTestResult ? (
                <>
                  <div className="mt-1">
                    <StatusBadge status={control.lastTestResult} />
                  </div>
                  <p className="mt-1 text-[11px] text-text-hint">
                    Kiểm tra ngày {formatDate(control.lastTestDate)}, tổng{" "}
                    {linkedTests.length} đợt đã thực hiện
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[20px] leading-7 font-semibold text-text-hint">
                    Chưa đánh giá
                  </p>
                  <p className="text-[11px] text-text-hint">
                    Chưa có đợt kiểm tra hiệu lực nào được ghi nhận
                  </p>
                </>
              )}
            </ContentCard>

            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">
                Hạn kiểm tra kế tiếp
              </p>
              {control.status !== "Đang hiệu lực" || !due ? (
                <>
                  <p className="text-[20px] leading-7 font-semibold text-text-hint">
                    --
                  </p>
                  <p className="text-[11px] text-text-hint">
                    Chỉ áp dụng khi kiểm soát đang hiệu lực
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={cn(
                      "text-[20px] leading-7 font-semibold",
                      isTestOverdue(control)
                        ? "text-danger"
                        : isTestDueSoon(control)
                          ? "text-lv-medium-text"
                          : "text-text-primary",
                    )}
                  >
                    {formatDate(due)}
                  </p>
                  <p className="text-[11px] text-text-hint">
                    {remain === null
                      ? ""
                      : remain < 0
                        ? `Đã quá hạn ${Math.abs(remain)} ngày`
                        : `Còn ${remain} ngày, chu kỳ ${testCycleOf(control)} ngày`}
                  </p>
                </>
              )}
            </ContentCard>

            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">
                Rủi ro đang được phủ
              </p>
              <p className="text-[24px] leading-8 font-semibold text-text-primary">
                {linkedRisks.length}
              </p>
              <p className="text-[11px] text-text-hint">
                {linkedDeficiencies.length} điểm yếu, {linkedExceptions.length}{" "}
                ngoại lệ đã ghi nhận
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
                    key: "rui-ro",
                    label: "Rủi ro được kiểm soát",
                    count: linkedRisks.length,
                  },
                  {
                    key: "kiem-tra",
                    label: "Kết quả kiểm tra",
                    count: linkedTests.length,
                  },
                  {
                    key: "diem-yeu",
                    label: "Điểm yếu & ngoại lệ",
                    count: linkedDeficiencies.length + linkedExceptions.length,
                  },
                  { key: "lich-su", label: "Lịch sử" },
                ]}
              />
            </div>

            <div className="p-4">
              {tab === "tong-quan" && (
                <TabTongQuan
                  control={control}
                  lk={lk}
                  testCount={linkedTests.length}
                />
              )}
              {tab === "rui-ro" && (
                <TabRuiRo rows={linkedRisks} lk={lk} control={control} />
              )}
              {tab === "kiem-tra" && (
                <TabKiemTra
                  rows={linkedTests}
                  deficiencies={linkedDeficiencies}
                  lk={lk}
                />
              )}
              {tab === "diem-yeu" && (
                <TabDiemYeu
                  deficiencies={linkedDeficiencies}
                  exceptions={linkedExceptions}
                  kppns={linkedKppns}
                  lk={lk}
                />
              )}
              {tab === "lich-su" && (
                <TabLichSu
                  control={control}
                  tests={linkedTests}
                  deficiencies={linkedDeficiencies}
                  exceptions={linkedExceptions}
                />
              )}
            </div>
          </ContentCard>
        </div>
      </PageBody>

      {/* ======================== Hộp thoại ======================== */}
      <TransitionModal
        open={transiting}
        control={control}
        riskCount={linkedRisks.length}
        openDeficiencyCount={openDeficiencies.length}
        onClose={() => setTransiting(false)}
        onDone={(msg, detail) => {
          setTransiting(false);
          toast.success(msg, detail);
        }}
        onWarn={(msg, detail) => toast.warning(msg, detail)}
      />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          controlRepo.remove(control.id);
          setDeleting(false);
          toast.success("Đã xoá", `${control.code} đã được xoá khỏi hệ thống.`);
          router.push("/kiem-soat/so-dang-ky");
        }}
        tone="danger"
        title="Xoá kiểm soát"
        message={
          <>
            Bạn có chắc muốn xoá <b>{control.code}</b>? Hành động này không thể
            hoàn tác.
          </>
        }
        confirmText="Xoá"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Thẻ sức khoẻ kiểm soát                                        */
/* ================================================================== */

function HealthCard({ value, status }: { value: number; status: string }) {
  const tone =
    value >= 75
      ? { bar: "bg-success", text: "text-lv-low-text", label: "Tốt" }
      : value >= 45
        ? {
            bar: "bg-warning",
            text: "text-lv-medium-text",
            label: "Cần theo dõi",
          }
        : { bar: "bg-danger", text: "text-lv-critical-text", label: "Yếu" };

  return (
    <ContentCard className="flex flex-col justify-center gap-1.5">
      <p className="text-[12px] text-text-secondary">Sức khoẻ kiểm soát</p>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-[24px] leading-8 font-semibold", tone.text)}>
          {value}
        </span>
        <span className="text-[12px] text-text-secondary">/ 100</span>
        <Badge
          tone={value >= 75 ? "success" : value >= 45 ? "warning" : "danger"}
          dot
          className="ml-auto"
        >
          {tone.label}
        </Badge>
      </div>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
        <span
          className={cn("block h-full rounded-full", tone.bar)}
          style={{ width: `${value}%` }}
        />
      </span>
      <p className="text-[11px] text-text-hint">
        Tổng hợp từ kết quả kiểm tra, chu kỳ kiểm tra, hiệu lực và trạng thái{" "}
        {status.toLowerCase()}
      </p>
    </ContentCard>
  );
}

/* ================================================================== */
/* Dải cảnh báo dùng chung                                        */
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
        ? IconAlertTriangle
        : IconCalendarExclamation;

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
  control,
  lk,
  testCount,
}: {
  control: Control;
  lk: Lookups;
  testCount: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Thông tin định danh">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Mã kiểm soát">
            <b className="text-brand">{control.code}</b>
          </ReadField>
          <ReadField label="Đơn vị vận hành">
            {lk.unitName(control.unitId)}
          </ReadField>
          <ReadField label="Người chịu trách nhiệm">
            <UserCell
              name={lk.employeeName(control.ownerId, "Chưa gán")}
              sub={lk.employeeById(control.ownerId)?.title}
              size={26}
            />
          </ReadField>
          <ReadField label="Quy trình liên quan">
            {lk.processName(control.processId)}
          </ReadField>
          <ReadField label="Hệ thống CNTT thực hiện">
            {lk.systemName(control.systemId)}
          </ReadField>
          <ReadField label="Mức độ quan trọng">
            {control.isKeyControl ? (
              <Badge tone="brand" dot>
                Kiểm soát trọng yếu
              </Badge>
            ) : (
              <span className="text-text-secondary">Kiểm soát thường</span>
            )}
          </ReadField>
        </div>
      </Section>

      <Section title="Mô tả cách thức thực hiện">
        <p className="text-[13px] leading-5 whitespace-pre-line text-text-primary">
          {control.description || "--"}
        </p>
      </Section>

      <Section title="Cách vận hành">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Loại kiểm soát">
            <span className="inline-flex items-center gap-1.5">
              {control.type === "Phòng ngừa" ? (
                <IconShieldCheck size={15} className="text-success" />
              ) : control.type === "Phát hiện" ? (
                <IconActivity size={15} className="text-info" />
              ) : (
                <IconTool size={15} className="text-warning" />
              )}
              {control.type}
            </span>
          </ReadField>
          <ReadField label="Tính chất vận hành">
            <span className="inline-flex items-center gap-1.5">
              {control.nature !== "Thủ công" && (
                <IconRobot size={15} className="text-brand" />
              )}
              {control.nature}
            </span>
          </ReadField>
          <ReadField label="Tần suất vận hành">{control.frequency}</ReadField>
          <ReadField label="Chu kỳ kiểm tra hiệu lực">
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarRepeat size={15} className="text-icon-neutral" />
              {testCycleOf(control)} ngày
            </span>
          </ReadField>
          <ReadField label="Số đợt kiểm tra đã thực hiện">
            {testCount}
          </ReadField>
          <ReadField label="Kết quả kiểm tra gần nhất">
            {control.lastTestResult ? (
              <StatusBadge status={control.lastTestResult} />
            ) : (
              <span className="text-text-hint">Chưa đánh giá</span>
            )}
          </ReadField>
        </div>
      </Section>

      <Section
        title="Yêu cầu bằng chứng"
        note="Tài liệu cần thu thập khi kiểm tra hiệu lực"
      >
        <p className="text-[13px] leading-5 whitespace-pre-line text-text-primary">
          {control.evidenceRequirement || "--"}
        </p>
      </Section>

      <Section title="Hiệu lực và thông tin quản trị">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Ngày hiệu lực">
            {formatDate(control.effectiveDate)}
          </ReadField>
          <ReadField label="Ngày hết hiệu lực">
            {control.expireDate ? (
              <span
                className={cn(
                  isControlExpired(control) && "font-medium text-danger",
                  isExpiringSoon(control) && "font-medium text-lv-medium-text",
                )}
              >
                {formatDate(control.expireDate)}
                {isControlExpired(control) ? " (đã quá hạn)" : ""}
                {isExpiringSoon(control) ? " (sắp tới)" : ""}
              </span>
            ) : (
              <span className="text-text-secondary">Áp dụng vô thời hạn</span>
            )}
          </ReadField>
          <ReadField label="Ghi chú trạng thái">
            {control.statusNote || "--"}
          </ReadField>
          <ReadField label="Người tạo">{control.createdBy || "--"}</ReadField>
          <ReadField label="Ngày tạo">
            {formatDateTime(control.createdAt)}
          </ReadField>
          <ReadField label="Cập nhật gần nhất">
            {formatDateTime(control.updatedAt)}
          </ReadField>
        </div>
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 2: Rủi ro được kiểm soát                                        */
/* ================================================================== */

function TabRuiRo({
  rows,
  lk,
  control,
}: {
  rows: Risk[];
  lk: Lookups;
  control: Control;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconAlertTriangle size={24} />}
        title="Kiểm soát chưa gắn rủi ro nào"
        description="Đây là lỗi dữ liệu. Hãy sửa kiểm soát và gắn ít nhất 1 rủi ro trong sổ đăng ký rủi ro."
        compact
      />
    );
  }

  const columns: Column<Risk>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
      render: (r) => (
        <CodeCell
          code={r.code}
          onClick={() => router.push(`/rui-ro/so-dang-ky/${r.code}`)}
        />
      ),
    },
    {
      key: "name",
      header: "Tên rủi ro",
      minWidth: 300,
      render: (r) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{r.name}</span>
              {r.isKeyRisk && (
                <Badge tone="brand" size="sm">
                  TY
                </Badge>
              )}
              {r.isZeroTolerance && (
                <Badge tone="danger" size="sm">
                  KKN
                </Badge>
              )}
            </span>
          }
          sub={lk.categoryName(r.categoryId)}
        />
      ),
    },
    {
      key: "owner",
      header: "Chủ sở hữu",
      width: 200,
      render: (r) => (
        <UserCell name={lk.employeeName(r.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "inherent",
      header: "Cố hữu",
      width: 90,
      align: "center",
      render: (r) => (
        <span className="text-text-secondary">{inherentScoreOf(r)}</span>
      ),
    },
    {
      key: "residual",
      header: "Còn lại",
      width: 150,
      render: (r) => (
        <RiskBadge level={residualLevelOf(r)} score={residualScoreOf(r)} />
      ),
    },
    {
      key: "reduction",
      header: "Mức giảm",
      width: 140,
      render: (r) => {
        const pct = reductionPercentOf(r);
        return (
          <span className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
              <span
                className={cn(
                  "block h-full rounded-full",
                  pct > 0 ? "bg-success" : "bg-[#D5D7DA]",
                )}
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-[12px] text-text-secondary">
              {pct}%
            </span>
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  const zeroTolerance = rows.filter((r) => r.isZeroTolerance).length;
  const highResidual = rows.filter(
    (r) => residualLevelOf(r) === "Cao" || residualLevelOf(r) === "Trọng yếu",
  ).length;
  const noReduction = rows.filter((r) => reductionPercentOf(r) === 0).length;

  return (
    <div className="flex flex-col gap-3">
      <SummaryLine
        items={[
          { label: "Rủi ro đang phủ", value: rows.length, tone: "brand" },
          {
            label: "Mức còn lại Cao trở lên",
            value: highResidual,
            tone: "danger",
          },
          {
            label: "Không khoan nhượng",
            value: zeroTolerance,
            tone: "warning",
          },
        ]}
        right={
          <span className="text-[12px] text-text-secondary">
            Mức giảm bình quân:{" "}
            <b className="text-text-primary">
              {Math.round(
                rows.reduce((s, r) => s + reductionPercentOf(r), 0) /
                  rows.length,
              )}
              %
            </b>
          </span>
        }
      />

      {noReduction > 0 && control.status === "Đang hiệu lực" && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Có <b>{noReduction}</b> rủi ro chưa ghi nhận mức giảm nào dù đã có
            kiểm soát đang hiệu lực. Nên đánh giá lại điểm rủi ro còn lại của
            các rủi ro đó.
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(r) => r.id}
          onRowClick={(r) => router.push(`/rui-ro/so-dang-ky/${r.code}`)}
        />
      </div>

      <p className="text-[12px] text-text-hint">
        Mức giảm được tính trên toàn bộ kiểm soát của rủi ro, không chỉ riêng
        kiểm soát này.
      </p>
    </div>
  );
}

/* ================================================================== */
/* Tab 3: Kết quả kiểm tra                                        */
/* ================================================================== */

function TabKiemTra({
  rows,
  deficiencies,
  lk,
}: {
  rows: ControlTest[];
  deficiencies: Deficiency[];
  lk: Lookups;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconClipboardCheck size={24} />}
        title="Chưa có đợt kiểm tra nào"
        description="Kết quả kiểm tra được ghi nhận tại màn hình Kết quả kiểm tra kiểm soát."
        compact
        action={
          <Button
            variant="primary"
            onClick={() => router.push("/kiem-soat/ket-qua-kiem-tra")}
          >
            Tới màn hình kiểm tra
          </Button>
        }
      />
    );
  }

  const defMap = new Map(deficiencies.map((d) => [d.id, d]));

  const columns: Column<ControlTest>[] = [
    {
      key: "code",
      header: "Mã đợt",
      width: 140,
      render: (t) => (
        <CodeCell
          code={t.code}
          onClick={() => router.push("/kiem-soat/ket-qua-kiem-tra")}
        />
      ),
    },
    {
      key: "period",
      header: "Kỳ kiểm tra",
      width: 130,
      render: (t) => (
        <TitleCell title={t.period || "--"} sub={formatDate(t.testDate)} />
      ),
    },
    {
      key: "tester",
      header: "Người kiểm tra",
      width: 200,
      render: (t) => (
        <UserCell name={lk.employeeName(t.testerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "method",
      header: "Phương pháp",
      width: 160,
      render: (t) => <span className="text-text-secondary">{t.method}</span>,
    },
    {
      key: "sample",
      header: "Mẫu / lỗi",
      width: 110,
      align: "center",
      render: (t) => (
        <span
          className={cn(
            "text-[13px]",
            t.failCount > 0 ? "font-medium text-danger" : "text-text-secondary",
          )}
        >
          {formatNumber(t.sampleSize)} / {formatNumber(t.failCount)}
        </span>
      ),
    },
    {
      key: "result",
      header: "Kết luận",
      width: 170,
      render: (t) => <StatusBadge status={t.result} />,
    },
    {
      key: "finding",
      header: "Phát hiện",
      minWidth: 280,
      wrap: true,
      render: (t) => (
        <span className="text-[12px] leading-4 text-text-secondary">
          {t.finding || "--"}
        </span>
      ),
    },
    {
      key: "deficiency",
      header: "Điểm yếu",
      width: 140,
      render: (t) => {
        if (!t.deficiencyId) return <span className="text-text-hint">--</span>;
        const d = defMap.get(t.deficiencyId);
        return (
          <CodeCell
            code={d?.code ?? "Đã xoá"}
            onClick={() => router.push("/khac-phuc/diem-yeu")}
          />
        );
      },
    },
  ];

  const failed = rows.filter((t) => t.result !== "Hiệu quả").length;
  const totalSample = rows.reduce((s, t) => s + t.sampleSize, 0);
  const totalFail = rows.reduce((s, t) => s + t.failCount, 0);

  return (
    <div className="flex flex-col gap-3">
      <SummaryLine
        items={[
          { label: "Tổng đợt kiểm tra", value: rows.length, tone: "brand" },
          {
            label: "Kết luận Hiệu quả",
            value: rows.length - failed,
            tone: "success",
          },
          { label: "Kết luận chưa đạt", value: failed, tone: "danger" },
        ]}
        right={
          <span className="text-[12px] text-text-secondary">
            Tỷ lệ mẫu lỗi tích luỹ:{" "}
            <b className="text-text-primary">
              {totalSample === 0
                ? "--"
                : `${Math.round((totalFail / totalSample) * 100)}%`}
            </b>{" "}
            ({formatNumber(totalFail)} / {formatNumber(totalSample)} mẫu)
          </span>
        }
      />

      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable columns={columns} rows={rows} getKey={(t) => t.id} />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab 4: Điểm yếu và ngoại lệ                                        */
/* ================================================================== */

function TabDiemYeu({
  deficiencies,
  exceptions,
  kppns,
  lk,
}: {
  deficiencies: Deficiency[];
  exceptions: ControlException[];
  kppns: Kppn[];
  lk: Lookups;
}) {
  const router = useRouter();

  const kppnByDef = useMemo(() => {
    const map = new Map<string, number>();
    kppns.forEach((k) => {
      if (!k.deficiencyId) return;
      map.set(k.deficiencyId, (map.get(k.deficiencyId) ?? 0) + 1);
    });
    return map;
  }, [kppns]);

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------ Điểm yếu ------------------------ */}
      <Section
        title={`Điểm yếu kiểm soát ( ${deficiencies.length})`}
        note="Phát sinh từ kiểm tra hiệu lực, sự kiện hoặc kiểm toán nội bộ"
      >
        {deficiencies.length === 0 ? (
          <p className="text-[13px] text-text-hint">
            Chưa ghi nhận điểm yếu nào cho kiểm soát này.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {deficiencies.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => router.push("/khac-phuc/diem-yeu")}
                className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2 text-left transition-colors hover:bg-[#FAFAFA]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-medium-bg text-lv-medium-text">
                  <IconAlertTriangle size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-text-primary">
                    <b className="text-brand">{d.code}</b> {d.name}
                  </p>
                  <p className="truncate text-[12px] text-text-secondary">
                    Nguồn: {d.sourceType} - Phát hiện{" "}
                    {formatDate(d.detectedDate)} - Phụ trách{" "}
                    {lk.employeeName(d.ownerId)}
                    {d.dueDate ? ` - Hạn ${formatDate(d.dueDate)}` : ""}
                  </p>
                </div>
                <Badge tone="neutral" size="sm">
                  {kppnByDef.get(d.id) ?? 0} KPPN
                </Badge>
                <RiskBadge level={d.severity} />
                <StatusBadge status={d.status} />
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------ Ngoại lệ ------------------------ */}
      <Section
        title={`Ngoại lệ kiểm soát ( ${exceptions.length})`}
        note="Trường hợp được phép tạm không tuân thủ kiểm soát, kèm biện pháp bù đắp"
      >
        {exceptions.length === 0 ? (
          <p className="text-[13px] text-text-hint">
            Chưa có đề nghị ngoại lệ nào cho kiểm soát này.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {exceptions.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "flex flex-col gap-2 rounded-ctrl border p-3",
                  e.status === "Đã duyệt"
                    ? "border-lv-info-border bg-lv-info-bg/40"
                    : "border-border-light",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-lv-neutral-bg text-lv-neutral-text">
                    <IconShieldOff size={15} />
                  </span>
                  <b className="text-[13px] text-brand">{e.code}</b>
                  <span className="text-[12px] text-text-secondary">
                    {formatDate(e.startDate)} - {formatDate(e.endDate)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Tooltip content="Mức rủi ro còn lại trong thời gian ngoại lệ">
                      <RiskBadge level={e.residualRiskLevel} />
                    </Tooltip>
                    <StatusBadge status={e.status} />
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-3">
                  <ReadField label="Lý do đề nghị" className="md:col-span-2">
                    <span className="leading-5">{e.reason}</span>
                  </ReadField>
                  <ReadField label="Người đề nghị">
                    <UserCell
                      name={lk.employeeName(e.requesterId, "Chưa gán")}
                      size={22}
                    />
                  </ReadField>
                  <ReadField label="Biện pháp bù đắp" className="md:col-span-2">
                    <span className="leading-5">{e.compensatingControl}</span>
                  </ReadField>
                  <ReadField label="Người phê duyệt">
                    {e.approverId ? (
                      <UserCell
                        name={lk.employeeName(e.approverId)}
                        size={22}
                      />
                    ) : (
                      <span className="text-text-hint">Chưa phê duyệt</span>
                    )}
                  </ReadField>
                </div>

                {e.statusNote && (
                  <p className="border-t border-border-light pt-1.5 text-[12px] text-text-secondary">
                    Ghi chú: {e.statusNote}
                  </p>
                )}
              </div>
            ))}
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
  control,
  tests,
  deficiencies,
  exceptions,
}: {
  control: Control;
  tests: ControlTest[];
  deficiencies: Deficiency[];
  exceptions: ControlException[];
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];

    out.push({
      date: control.effectiveDate,
      title: "Kiểm soát bắt đầu có hiệu lực",
      description: `${control.code} - ${control.type}, vận hành ${control.nature.toLowerCase()}, tần suất ${control.frequency.toLowerCase()}.`,
      tone: "brand",
      icon: <IconShieldCheck size={14} />,
    });

    tests.forEach((t) => {
      out.push({
        date: t.testDate,
        title: `Kiểm tra hiệu lực ${t.code}: ${t.result}`,
        description:
          t.finding ||
          `Kỳ ${t.period || "không rõ"}, cỡ mẫu ${t.sampleSize}, mẫu lỗi ${t.failCount}.`,
        tone: t.result === "Hiệu quả" ? "success" : "warning",
        icon: <IconClipboardCheck size={14} />,
      });
    });

    deficiencies.forEach((d) => {
      out.push({
        date: d.detectedDate,
        title: `Phát hiện điểm yếu ${d.code}`,
        description: `${d.name} - mức ${d.severity}, nguồn ${d.sourceType}.`,
        tone:
          d.severity === "Cao" || d.severity === "Trọng yếu"
            ? "danger"
            : "warning",
        icon: <IconAlertTriangle size={14} />,
      });
    });

    exceptions.forEach((e) => {
      out.push({
        date: e.startDate,
        title: `Bắt đầu ngoại lệ ${e.code}`,
        description: `${e.reason} Biện pháp bù đắp: ${e.compensatingControl}`,
        tone: "warning",
        icon: <IconShieldOff size={14} />,
      });
      out.push({
        date: e.endDate,
        title: `Kết thúc hiệu lực ngoại lệ ${e.code}`,
        description:
          e.status === "Hết hiệu lực"
            ? "Kiểm soát quay lại vận hành bình thường."
            : "Mốc kết thúc theo đề nghị đã đăng ký.",
        tone: "neutral",
        icon: <IconFileOff size={14} />,
      });
    });

    if (control.expireDate) {
      out.push({
        date: control.expireDate,
        title: isControlExpired(control)
          ? "Mốc hết hiệu lực (đã qua)"
          : "Mốc hết hiệu lực theo kế hoạch",
        description: "Cần rà soát gia hạn hoặc thay thế bằng kiểm soát khác.",
        tone: isControlExpired(control) ? "danger" : "neutral",
        icon: <IconCalendarExclamation size={14} />,
      });
    }

    const due = nextTestDate(control);
    if (control.status === "Đang hiệu lực" && due) {
      out.push({
        date: due,
        title: isTestOverdue(control)
          ? "Hạn kiểm tra kế tiếp (đã quá hạn)"
          : "Hạn kiểm tra kế tiếp",
        description: `Chu kỳ ${testCycleOf(control)} ngày theo tần suất vận hành.`,
        tone: isTestOverdue(control) ? "danger" : "neutral",
        icon: <IconCalendarRepeat size={14} />,
      });
    }

    return out
      .filter((x) => !!x.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [control, tests, deficiencies, exceptions]);

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
        Dòng thời gian tổng hợp từ các mốc nghiệp vụ của kiểm soát. Bản demo
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
  control,
  riskCount,
  openDeficiencyCount,
  onClose,
  onDone,
  onWarn,
}: {
  open: boolean;
  control: Control;
  riskCount: number;
  openDeficiencyCount: number;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onWarn: (message: string, detail?: string) => void;
}) {
  const list = controlNextTransitions(control.status);
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

  const selected = list.find((t) => t.to === target) ?? list[0];

  const stopping =
    selected?.to === "Tạm ngưng" || selected?.to === "Hết hiệu lực";

  function submit() {
    if (!selected) return;

    if (selected.requireReason && !reason.trim()) {
      setError("Bắt buộc nhập lý do khi chuyển sang trạng thái này");
      return;
    }

    if (stopping && riskCount > 0) {
      onWarn(
        "Kiểm soát ngừng vận hành",
        `Có ${riskCount} rủi ro đang được phủ bởi kiểm soát này, cần đánh giá lại mức rủi ro còn lại.`,
      );
    }

    controlRepo.update(control.id, {
      status: selected.to,
      statusNote: reason.trim() || control.statusNote,
    });

    onDone(
      `${control.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${control.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái kiểm soát"
      description={`${control.code} - ${control.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={selected?.tone === "danger" ? "danger" : "primary"}
            onClick={submit}
            disabled={!selected}
          >
            {selected?.label ?? "Chuyển"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2 rounded-ctrl bg-surface-alt p-2.5">
          <span className="text-[12px] text-text-secondary">Hiện tại</span>
          <StatusBadge status={control.status} />
          <IconArrowRight size={16} className="text-icon-neutral" />
          <span className="text-[12px] text-text-secondary">Chuyển sang</span>
          {selected ? (
            <StatusBadge status={selected.to} />
          ) : (
            <span className="text-[13px] text-text-hint">
              Không còn trạng thái kế tiếp
            </span>
          )}
        </div>

        {list.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Kiểm soát đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                  name="control-detail-transition"
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

            {selected?.to === "Đang hiệu lực" && (
              <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                <IconCalendarRepeat size={16} className="mt-px shrink-0" />
                <span>
                  Sau khi ban hành, chu kỳ kiểm tra hiệu lực là{" "}
                  <b>{testCycleOf(control)} ngày</b> theo tần suất vận hành{" "}
                  {control.frequency.toLowerCase()}. Hệ thống sẽ nhắc khi tới
                  hạn.
                </span>
              </div>
            )}

            {stopping && riskCount > 0 && (
              <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                <IconAlertTriangle size={16} className="mt-px shrink-0" />
                <span>
                  Kiểm soát đang phủ <b>{riskCount}</b> rủi ro
                  {openDeficiencyCount > 0
                    ? ` và còn ${openDeficiencyCount} điểm yếu chưa đóng`
                    : ""}
                  . Khi ngừng áp dụng, mức rủi ro còn lại của các rủi ro liên
                  quan cần được đánh giá lại.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
