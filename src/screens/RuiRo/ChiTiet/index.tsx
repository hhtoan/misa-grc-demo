"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconClockExclamation,
  IconCopy,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconHistory,
  IconInfoCircle,
  IconLink,
  IconShieldCheck,
  IconTarget,
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
  StatusBadge,
  Tabs,
  Textarea,
  TitleCell,
  Tooltip,
  UserCell,
  RowActions,
  useToast,
  type Column,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { LEVEL_TONE, RiskScoreCard } from "@/components/domain";
import {
  controlRepo,
  deficiencyRepo,
  eventRepo,
  kppnRepo,
  kriRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  inherentScoreOf,
  isReviewOverdue,
  isRiskEditable,
  reductionPercentOf,
  requireTreatmentPlan,
  residualLevelOf,
  residualScoreOf,
  riskNextTransitions,
} from "@/lib/domain/risk-utils";
import { isKppnOverdue } from "@/lib/domain/schema";
import type {
  Control,
  Deficiency,
  GrcEvent,
  Kppn,
  Kri,
  Risk,
} from "@/lib/domain/schema";
import { IMPACT_LABELS, LIKELIHOOD_LABELS } from "@/lib/domain/matrix";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

import RiskLifecycleBar from "./RiskLifecycleBar";

/* ================================================================== */
/* Kiểu tab                                        */
/* ================================================================== */

type TabKey =
  | "tong-quan"
  | "kiem-soat"
  | "kppn"
  | "su-kien"
  | "kri"
  | "lich-su";

/* ================================================================== */
/* Màn hình chính                                        */
/* ================================================================== */

/* ================================================================== */
/* Component ngoài: chỉ tìm bản ghi rồi phân nhánh                     */
/* ================================================================== */

export default function ChiTietRuiRoScreen({ code }: { code: string }) {
  const router = useRouter();
  const risks = useCollection(riskRepo);

  const risk = useMemo(
    () => risks.find((r) => r.code === code || r.id === code),
    [risks, code],
  );

  if (!risk) {
    return (
      <PageContainer>
        <PageHeader title="Chi tiết rủi ro" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy rủi ro"
              description={`Không có bản ghi nào ứng với mã ${code}. Có thể bản ghi đã bị xoá hoặc đường dẫn không đúng.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/rui-ro/so-dang-ky")}
                >
                  Về sổ đăng ký rủi ro
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return <ChiTietContent risk={risk} />;
}

/* ================================================================== */
/* Component trong: risk luôn tồn tại, kiểu là Risk                    */
/* ================================================================== */

function ChiTietContent({ risk }: { risk: Risk }) {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const controls = useCollection(controlRepo);
  const kppns = useCollection(kppnRepo);
  const events = useCollection(eventRepo);
  const deficiencies = useCollection(deficiencyRepo);
  const kris = useCollection(kriRepo);

  const [tab, setTab] = useState<TabKey>("tong-quan");
  const [transiting, setTransiting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = hasRole("admin", "qtrr", "owner");

  /* ---------------------- Dữ liệu liên kết ---------------------- */

  const linkedControls = useMemo(
    () => controls.filter((c) => c.riskIds.includes(risk.id)),
    [controls, risk.id],
  );

  const linkedDeficiencies = useMemo(
    () => deficiencies.filter((d) => d.riskId === risk.id),
    [deficiencies, risk.id],
  );

  const linkedKppns = useMemo(() => {
    const defIds = new Set(linkedDeficiencies.map((d) => d.id));
    return kppns.filter(
      (k) =>
        k.riskId === risk.id || (k.deficiencyId && defIds.has(k.deficiencyId)),
    );
  }, [kppns, risk.id, linkedDeficiencies]);

  const linkedEvents = useMemo(
    () => events.filter((e) => e.relatedRiskIds.includes(risk.id)),
    [events, risk.id],
  );

  const linkedKris = useMemo(
    () => kris.filter((k) => k.riskId === risk.id),
    [kris, risk.id],
  );

  /* --------------------------- Hành động ------------------------ */

  const editable = isRiskEditable(risk.status);
  const transitions = riskNextTransitions(risk.status);

  const activeKppns = linkedKppns.filter(
    (k) => k.status !== "Huỷ" && k.status !== "Hoàn thành",
  );
  const needPlanWarning =
    requireTreatmentPlan(risk) && activeKppns.length === 0;

  function goEdit() {
    if (!editable) {
      toast.warning(
        "Không sửa được",
        `Rủi ro đang ở trạng thái ${risk.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/rui-ro/so-dang-ky/${risk.code}/sua`);
  }

  function duplicate() {
    const created = riskRepo.create(
      {
        name: `${risk.name} (bản sao)`,
        description: risk.description,
        cause: risk.cause,
        consequence: risk.consequence,
        categoryId: risk.categoryId,
        objectiveIds: [...risk.objectiveIds],
        unitId: risk.unitId,
        ownerId: risk.ownerId,
        processId: risk.processId,
        systemId: risk.systemId,
        source: risk.source,
        inherentLikelihood: risk.inherentLikelihood,
        inherentImpact: risk.inherentImpact,
        residualLikelihood: risk.residualLikelihood,
        residualImpact: risk.residualImpact,
        treatment: risk.treatment,
        treatmentNote: risk.treatmentNote,
        isZeroTolerance: risk.isZeroTolerance,
        isKeyRisk: risk.isKeyRisk,
        identifiedDate: risk.identifiedDate,
        reviewDate: "",
        status: "Nháp",
        statusNote: "",
        estimatedLoss: risk.estimatedLoss,
        tags: [...risk.tags],
      },
      user.name,
    );
    toast.success("Đã nhân bản", `Bản sao ${created.code} ở trạng thái Nháp.`);
    router.push(`/rui-ro/so-dang-ky/${created.code}`);
  }

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => router.push("/rui-ro/so-dang-ky")}
        title={
          <span className="flex items-center gap-2">
            <span className="text-brand">{risk.code}</span>
            <span className="truncate">{risk.name}</span>
          </span>
        }
        badge={
          <span className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={risk.status} />
            {risk.isKeyRisk && <Badge tone="brand">Trọng yếu</Badge>}
            {risk.isZeroTolerance && (
              <Tooltip content="Rủi ro không khoan nhượng, không được chọn phương án Chấp nhận">
                <Badge tone="danger">Không khoan nhượng</Badge>
              </Tooltip>
            )}
          </span>
        }
        actions={
          canEdit && (
            <>
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
          <RiskLifecycleBar
            risk={risk}
            assessorName={
              risk.residualAssessedBy
                ? lk.employeeName(risk.residualAssessedBy, "")
                : undefined
            }
          />
          {/* ================== Dải cảnh báo ================== */}
          {needPlanWarning && (
            <AlertBar
              tone="warning"
              title={`Mức rủi ro còn lại là ${residualLevelOf(risk)} nhưng chưa có hành động KPPN đang triển khai`}
              description="Theo quy định, rủi ro từ mức Cao trở lên bắt buộc phải có kế hoạch khắc phục và phòng ngừa."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => setTab("kppn")}
                >
                  Xem tab KPPN
                </Button>
              }
            />
          )}

          {isReviewOverdue(risk) && (
            <AlertBar
              tone="danger"
              title={`Đã quá hạn rà soát định kỳ từ ngày ${formatDate(risk.reviewDate)}`}
              description="Cần rà soát lại mức độ rủi ro và cập nhật đánh giá."
            />
          )}

          {!editable && (
            <AlertBar
              tone="info"
              title={`Rủi ro đang ở trạng thái ${risk.status}`}
              description="Trạng thái này bị khoá chỉnh sửa nội dung. Chuyển trạng thái trước nếu cần cập nhật."
            />
          )}

          {/* ================== Thẻ điểm rủi ro ================== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <RiskScoreCard
              title="Rủi ro cố hữu (trước kiểm soát)"
              likelihood={risk.inherentLikelihood}
              impact={risk.inherentImpact}
            />
            <RiskScoreCard
              title="Rủi ro còn lại (sau kiểm soát)"
              likelihood={risk.residualLikelihood}
              impact={risk.residualImpact}
            />
            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">
                Mức giảm nhờ kiểm soát
              </p>
              <p
                className={cn(
                  "text-[24px] leading-8 font-semibold",
                  reductionPercentOf(risk) > 0
                    ? "text-success"
                    : "text-text-hint",
                )}
              >
                {reductionPercentOf(risk)}%
              </p>
              <p className="text-[11px] text-text-hint">
                {inherentScoreOf(risk)} → {residualScoreOf(risk)} điểm, hiện có{" "}
                {linkedControls.length} kiểm soát
              </p>
            </ContentCard>
            <ContentCard className="flex flex-col justify-center">
              <p className="text-[12px] text-text-secondary">
                Tổn thất ước tính
              </p>
              <p className="text-[24px] leading-8 font-semibold text-text-primary">
                {formatMoney(risk.estimatedLoss) || "--"}
              </p>
              <p className="text-[11px] text-text-hint">
                Đơn vị tính: VNĐ. Phương án xử lý: {risk.treatment}
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
                    key: "kiem-soat",
                    label: "Kiểm soát",
                    count: linkedControls.length,
                  },
                  {
                    key: "kppn",
                    label: "Khắc phục & phòng ngừa",
                    count: linkedKppns.length,
                  },
                  {
                    key: "su-kien",
                    label: "Sự kiện",
                    count: linkedEvents.length,
                  },
                  { key: "kri", label: "Chỉ số KRI", count: linkedKris.length },
                  { key: "lich-su", label: "Lịch sử" },
                ]}
              />
            </div>

            <div className="p-4">
              {tab === "tong-quan" && <TabTongQuan risk={risk} lk={lk} />}
              {tab === "kiem-soat" && (
                <TabKiemSoat rows={linkedControls} lk={lk} />
              )}
              {tab === "kppn" && (
                <TabKppn
                  rows={linkedKppns}
                  deficiencies={linkedDeficiencies}
                  lk={lk}
                />
              )}
              {tab === "su-kien" && <TabSuKien rows={linkedEvents} lk={lk} />}
              {tab === "kri" && <TabKri rows={linkedKris} lk={lk} />}
              {tab === "lich-su" && (
                <TabLichSu
                  risk={risk}
                  controls={linkedControls}
                  kppns={linkedKppns}
                  events={linkedEvents}
                  deficiencies={linkedDeficiencies}
                />
              )}
            </div>
          </ContentCard>
        </div>
      </PageBody>

      {/* ======================== Hộp thoại ======================== */}
      <TransitionModal
        open={transiting}
        risk={risk}
        blockClose={needPlanWarning}
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
          riskRepo.remove(risk.id);
          setDeleting(false);
          toast.success("Đã xoá", `${risk.code} đã được xoá khỏi hệ thống.`);
          router.push("/rui-ro/so-dang-ky");
        }}
        tone="danger"
        title="Xoá rủi ro"
        message={
          <>
            Bạn có chắc muốn xoá <b>{risk.code}</b>? Hành động này không thể
            hoàn tác.
          </>
        }
        confirmText="Xoá"
      />
    </PageContainer>
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

/* ================================================================== */
/* Tab 1: Thông tin chung                                        */
/* ================================================================== */

type Lookups = ReturnType<typeof useLookups>;

function TabTongQuan({ risk, lk }: { risk: Risk; lk: Lookups }) {
  const objectives = lk.objectivesByIds(risk.objectiveIds);

  return (
    <div className="flex flex-col gap-5">
      <Section title="Nhận diện rủi ro">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Mã rủi ro">
            <b className="text-brand">{risk.code}</b>
          </ReadField>
          <ReadField label="Nhóm rủi ro">
            {lk.categoryName(risk.categoryId)}
          </ReadField>
          <ReadField label="Nguồn rủi ro">{risk.source}</ReadField>
          <ReadField label="Đơn vị">{lk.unitName(risk.unitId)}</ReadField>
          <ReadField label="Chủ sở hữu rủi ro">
            <UserCell
              name={lk.employeeName(risk.ownerId, "Chưa gán")}
              sub={lk.employeeById(risk.ownerId)?.title}
              size={26}
            />
          </ReadField>
          <ReadField label="Ngày nhận diện">
            {formatDate(risk.identifiedDate)}
          </ReadField>
          <ReadField label="Quy trình liên quan">
            {lk.processName(risk.processId)}
          </ReadField>
          <ReadField label="Hệ thống CNTT liên quan">
            {lk.systemName(risk.systemId)}
          </ReadField>
          <ReadField label="Ngày rà soát định kỳ">
            {risk.reviewDate ? (
              <span
                className={cn(
                  isReviewOverdue(risk) && "font-medium text-danger",
                )}
              >
                {formatDate(risk.reviewDate)}
                {isReviewOverdue(risk) && " (quá hạn)"}
              </span>
            ) : (
              <span className="text-text-hint">Chưa đặt</span>
            )}
          </ReadField>
        </div>
      </Section>

      <Section title="Mô tả, nguyên nhân và hậu quả">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Mô tả chi tiết" className="md:col-span-3">
            <span className="leading-5 whitespace-pre-line">
              {risk.description || "--"}
            </span>
          </ReadField>
          <ReadField label="Nguyên nhân" className="md:col-span-1">
            <span className="leading-5 whitespace-pre-line">
              {risk.cause || "--"}
            </span>
          </ReadField>
          <ReadField label="Hậu quả" className="md:col-span-2">
            <span className="leading-5 whitespace-pre-line">
              {risk.consequence || "--"}
            </span>
          </ReadField>
        </div>
      </Section>

      <Section
        title={`Mục tiêu bị ảnh hưởng ( ${objectives.length})`}
        note="Đồng bộ một chiều từ AMIS Mục tiêu, chỉ đọc trong GRC"
      >
        {objectives.length === 0 ? (
          <p className="text-[13px] text-text-hint">Chưa gắn mục tiêu nào.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {objectives.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
                  <IconTarget size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-text-primary">
                    <b className="text-brand">{o.code}</b> {o.name}
                  </p>
                  <p className="truncate text-[12px] text-text-secondary">
                    {o.perspective} - {o.level} - {lk.unitName(o.unitId)} -{" "}
                    {lk.employeeName(o.ownerId)}
                  </p>
                </div>
                <div className="flex w-[150px] shrink-0 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${o.progress}%` }}
                    />
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    {o.progress}%
                  </span>
                </div>
                <Badge tone="neutral" size="sm">
                  {o.period}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Đánh giá và định hướng xử lý">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Khả năng xảy ra (cố hữu)">
            {LIKELIHOOD_LABELS[risk.inherentLikelihood]} (
            {risk.inherentLikelihood})
          </ReadField>
          <ReadField label="Mức độ ảnh hưởng (cố hữu)">
            {IMPACT_LABELS[risk.inherentImpact]} ({risk.inherentImpact})
          </ReadField>
          <ReadField label="Điểm cố hữu">
            <RiskBadge
              level={residualLevelOf({
                ...risk,
                residualLikelihood: risk.inherentLikelihood,
                residualImpact: risk.inherentImpact,
              })}
              score={inherentScoreOf(risk)}
            />
          </ReadField>
          <ReadField label="Khả năng xảy ra (còn lại)">
            {LIKELIHOOD_LABELS[risk.residualLikelihood]} (
            {risk.residualLikelihood})
          </ReadField>
          <ReadField label="Mức độ ảnh hưởng (còn lại)">
            {IMPACT_LABELS[risk.residualImpact]} ({risk.residualImpact})
          </ReadField>
          <ReadField label="Điểm còn lại">
            <RiskBadge
              level={residualLevelOf(risk)}
              score={residualScoreOf(risk)}
            />
          </ReadField>
          <ReadField label="Phương án xử lý">{risk.treatment}</ReadField>
          <ReadField label="Định hướng xử lý" className="md:col-span-2">
            <span className="leading-5 whitespace-pre-line">
              {risk.treatmentNote || "--"}
            </span>
          </ReadField>
        </div>
      </Section>

      <Section title="Thông tin quản trị">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
          <ReadField label="Thẻ phân loại">
            {risk.tags.length === 0 ? (
              "--"
            ) : (
              <span className="flex flex-wrap gap-1">
                {risk.tags.map((t) => (
                  <Badge key={t} tone="neutral" size="sm">
                    {t}
                  </Badge>
                ))}
              </span>
            )}
          </ReadField>
          <ReadField label="Người tạo">{risk.createdBy || "--"}</ReadField>
          <ReadField label="Ghi chú trạng thái">
            {risk.statusNote || "--"}
          </ReadField>
          <ReadField label="Ngày tạo">
            {formatDateTime(risk.createdAt)}
          </ReadField>
          <ReadField label="Cập nhật gần nhất">
            {formatDateTime(risk.updatedAt)}
          </ReadField>
        </div>
      </Section>
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
/* Tab 2: Kiểm soát liên quan                                        */
/* ================================================================== */

function TabKiemSoat({ rows, lk }: { rows: Control[]; lk: Lookups }) {
  const router = useRouter();

  const columns: Column<Control>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
      render: (c) => (
        <CodeCell
          code={c.code}
          onClick={() => router.push(`/kiem-soat/so-dang-ky/${c.code}`)}
        />
      ),
    },
    {
      key: "name",
      header: "Tên kiểm soát",
      minWidth: 300,
      render: (c) => (
        <TitleCell
          title={
            <span className="flex items-center gap-1.5">
              <span className="truncate">{c.name}</span>
              {c.isKeyControl && (
                <Badge tone="brand" size="sm">
                  Trọng yếu
                </Badge>
              )}
            </span>
          }
          sub={`${c.type} - ${c.nature} - ${c.frequency}`}
        />
      ),
    },
    {
      key: "owner",
      header: "Người chịu trách nhiệm",
      width: 210,
      render: (c) => (
        <UserCell name={lk.employeeName(c.ownerId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "test",
      header: "Kết quả kiểm tra gần nhất",
      width: 200,
      render: (c) =>
        c.lastTestResult ? (
          <span className="flex flex-col">
            <StatusBadge status={c.lastTestResult} />
            <span className="mt-0.5 text-[11px] text-text-hint">
              {formatDate(c.lastTestDate)}
            </span>
          </span>
        ) : (
          <span className="text-text-hint">Chưa đánh giá</span>
        ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      render: (c) => <StatusBadge status={c.status} />,
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconShieldCheck size={24} />}
        title="Chưa có kiểm soát nào gắn với rủi ro này"
        description="Kiểm soát được khai báo tại phân hệ Kiểm soát và gắn ngược về rủi ro."
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SummaryLine
        items={[
          { label: "Tổng kiểm soát", value: rows.length },
          {
            label: "Đang hiệu lực",
            value: rows.filter((c) => c.status === "Đang hiệu lực").length,
            tone: "success",
          },
          {
            label: "Kiểm soát trọng yếu",
            value: rows.filter((c) => c.isKeyControl).length,
            tone: "brand",
          },
          {
            label: "Kết quả chưa đạt",
            value: rows.filter(
              (c) => c.lastTestResult && c.lastTestResult !== "Hiệu quả",
            ).length,
            tone: "danger",
          },
        ]}
      />
      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable columns={columns} rows={rows} getKey={(c) => c.id} />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab 3: Khắc phục & phòng ngừa                                       */
/* ================================================================== */

function TabKppn({
  rows,
  deficiencies,
  lk,
}: {
  rows: Kppn[];
  deficiencies: Deficiency[];
  lk: Lookups;
}) {
  const router = useRouter();

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
            <span className="flex items-center gap-1.5">
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
      width: 200,
      render: (k) => (
        <UserCell name={lk.employeeName(k.assigneeId, "Chưa gán")} size={24} />
      ),
    },
    {
      key: "progress",
      header: "Tiến độ",
      width: 140,
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
      width: 130,
      render: (k) => (
        <span className={cn(isKppnOverdue(k) && "font-medium text-danger")}>
          {formatDate(k.dueDate)}
        </span>
      ),
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

  return (
    <div className="flex flex-col gap-5">
      {/* Điểm yếu liên quan */}
      <Section title={`Điểm yếu kiểm soát liên quan ( ${deficiencies.length})`}>
        {deficiencies.length === 0 ? (
          <p className="text-[13px] text-text-hint">
            Chưa ghi nhận điểm yếu nào liên quan tới rủi ro này.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {deficiencies.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-ctrl border border-border-light px-3 py-2"
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
                  </p>
                </div>
                <RiskBadge level={d.severity} />
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Hành động KPPN */}
      <Section title={`Hành động khắc phục & phòng ngừa ( ${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<IconTool size={24} />}
            title="Chưa có hành động KPPN"
            description="GRC chỉ điều phối, việc thực thi được giao sang AMIS Công việc hoặc JIRA."
            compact
          />
        ) : (
          <div className="flex flex-col gap-2">
            <SummaryLine
              items={[
                { label: "Tổng hành động", value: rows.length },
                {
                  label: "Đang thực hiện",
                  value: rows.filter((k) => k.status === "Đang thực hiện")
                    .length,
                  tone: "brand",
                },
                {
                  label: "Hoàn thành",
                  value: rows.filter((k) => k.status === "Hoàn thành").length,
                  tone: "success",
                },
                {
                  label: "Quá hạn",
                  value: rows.filter((k) => isKppnOverdue(k)).length,
                  tone: "danger",
                },
              ]}
            />
            <div className="overflow-hidden rounded-ctrl border border-border-light">
              <DataTable columns={columns} rows={rows} getKey={(k) => k.id} />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Tab 4: Sự kiện liên quan                                        */
/* ================================================================== */

function TabSuKien({ rows, lk }: { rows: GrcEvent[]; lk: Lookups }) {
  const router = useRouter();

  const columns: Column<GrcEvent>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
      render: (e) => (
        <CodeCell
          code={e.code}
          onClick={() => router.push(`/su-kien/so-theo-doi/${e.code}`)}
        />
      ),
    },
    {
      key: "name",
      header: "Tên sự kiện",
      minWidth: 300,
      render: (e) => (
        <TitleCell
          title={
            <span className="flex items-center gap-1.5">
              <span className="truncate">{e.name}</span>
              {e.isNearMiss && (
                <Badge tone="info" size="sm">
                  Suýt xảy ra
                </Badge>
              )}
              {e.isConfidential && (
                <Tooltip content="Sự kiện bảo mật, hạn chế truy cập">
                  <Badge tone="neutral" size="sm">
                    Bảo mật
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={lk.categoryName(e.categoryId)}
        />
      ),
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 170,
      render: (e) => lk.unitName(e.unitId),
    },
    {
      key: "occurred",
      header: "Ngày xảy ra",
      width: 120,
      render: (e) => formatDate(e.occurredDate),
    },
    {
      key: "severity",
      header: "Mức độ",
      width: 130,
      render: (e) => <RiskBadge level={e.severity} />,
    },
    {
      key: "loss",
      header: "Tổn thất thực tế",
      width: 150,
      align: "right",
      render: (e) => formatMoney(e.actualLoss) || "--",
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 150,
      render: (e) => <StatusBadge status={e.status} />,
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconBolt size={24} />}
        title="Chưa có sự kiện nào liên quan"
        description="Sự kiện được ghi nhận tại phân hệ Sự kiện và liên kết ngược về rủi ro."
        compact
      />
    );
  }

  const totalLoss = rows.reduce((s, e) => s + (e.actualLoss ?? 0), 0);
  const totalRecovered = rows.reduce((s, e) => s + (e.recoveredAmount ?? 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <SummaryLine
        items={[
          { label: "Tổng sự kiện", value: rows.length },
          {
            label: "Đang xử lý",
            value: rows.filter(
              (e) => e.status !== "Đã đóng" && e.status !== "Huỷ ghi nhận",
            ).length,
            tone: "brand",
          },
          {
            label: "Suýt xảy ra",
            value: rows.filter((e) => e.isNearMiss).length,
            tone: "info",
          },
        ]}
        right={
          <span className="text-[12px] text-text-secondary">
            Tổn thất thực tế{" "}
            <b className="text-text-primary">{formatMoney(totalLoss)}</b>, đã
            thu hồi{" "}
            <b className="text-text-primary">{formatMoney(totalRecovered)}</b>{" "}
            VNĐ
          </span>
        }
      />
      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable columns={columns} rows={rows} getKey={(e) => e.id} />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tab 5: Chỉ số KRI                                        */
/* ================================================================== */

function TabKri({ rows, lk }: { rows: Kri[]; lk: Lookups }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconActivityHeartbeat size={24} />}
        title="Chưa có chỉ số cảnh báo nào"
        description="Chỉ số KRI được khai báo tại màn hình Chỉ số cảnh báo của phân hệ Rủi ro."
        compact
      />
    );
  }

  const tone = (s: string) =>
    s === "Vượt ngưỡng" ? "danger" : s === "Cảnh báo" ? "warning" : "success";

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {rows.map((k) => (
        <div
          key={k.id}
          className="flex flex-col gap-2 rounded-ctrl border border-border-light p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-text-primary">
                <span className="text-brand">{k.code}</span> {k.name}
              </p>
              <p className="truncate text-[12px] text-text-secondary">
                {k.direction} - Tần suất {k.frequency} - Theo dõi bởi{" "}
                {lk.employeeName(k.ownerId)}
              </p>
            </div>
            <Badge tone={tone(k.status)} dot>
              {k.status}
            </Badge>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-[11px] text-text-secondary">
                Giá trị kỳ {k.currentPeriod || "hiện tại"}
              </p>
              <p className="text-[22px] leading-7 font-semibold text-text-primary">
                {k.currentValue === null
                  ? "--"
                  : `${formatNumber(k.currentValue)} ${k.measureUnit}`}
              </p>
            </div>
            <div className="text-[12px] text-text-secondary">
              <p>
                Ngưỡng cảnh báo:{" "}
                <b className="text-lv-medium-text">
                  {formatNumber(k.thresholdWarning)} {k.measureUnit}
                </b>
              </p>
              <p>
                Ngưỡng vượt:{" "}
                <b className="text-lv-critical-text">
                  {formatNumber(k.thresholdBreach)} {k.measureUnit}
                </b>
              </p>
            </div>
          </div>

          {k.dataSource && (
            <p className="border-t border-border-light pt-1.5 text-[11px] text-text-hint">
              Nguồn dữ liệu: {k.dataSource}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/* Tab 6: Lịch sử                                        */
/* ================================================================== */

interface TimelineItem {
  date: string;
  title: string;
  description?: string;
  tone: "brand" | "success" | "warning" | "danger" | "neutral";
  icon: React.ReactNode;
}

function TabLichSu({
  risk,
  controls,
  kppns,
  events,
  deficiencies,
}: {
  risk: Risk;
  controls: Control[];
  kppns: Kppn[];
  events: GrcEvent[];
  deficiencies: Deficiency[];
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];

    out.push({
      date: risk.identifiedDate,
      title: "Nhận diện rủi ro",
      description: `${risk.code} được ghi nhận vào sổ đăng ký rủi ro.`,
      tone: "brand",
      icon: <IconAlertTriangle size={14} />,
    });

    controls.forEach((c) => {
      out.push({
        date: c.effectiveDate,
        title: `Kiểm soát ${c.code} có hiệu lực`,
        description: c.name,
        tone: "success",
        icon: <IconShieldCheck size={14} />,
      });
      if (c.lastTestDate) {
        out.push({
          date: c.lastTestDate,
          title: `Kiểm tra kiểm soát ${c.code}: ${c.lastTestResult}`,
          description: c.name,
          tone: c.lastTestResult === "Hiệu quả" ? "success" : "warning",
          icon: <IconEye size={14} />,
        });
      }
    });

    deficiencies.forEach((d) => {
      out.push({
        date: d.detectedDate,
        title: `Phát hiện điểm yếu ${d.code}`,
        description: `${d.name} - mức ${d.severity}`,
        tone: "warning",
        icon: <IconAlertTriangle size={14} />,
      });
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
    });

    events.forEach((e) => {
      out.push({
        date: e.occurredDate,
        title: `Xảy ra sự kiện ${e.code}`,
        description: `${e.name} - mức ${e.severity}`,
        tone:
          e.severity === "Trọng yếu" || e.severity === "Cao"
            ? "danger"
            : "warning",
        icon: <IconBolt size={14} />,
      });
    });

    if (risk.reviewDate) {
      out.push({
        date: risk.reviewDate,
        title: isReviewOverdue(risk)
          ? "Mốc rà soát định kỳ (đã quá hạn)"
          : "Mốc rà soát định kỳ theo kế hoạch",
        description: "Rà soát lại mức độ và hiệu quả kiểm soát.",
        tone: isReviewOverdue(risk) ? "danger" : "neutral",
        icon: <IconClockExclamation size={14} />,
      });
    }

    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [risk, controls, kppns, events, deficiencies]);

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
        Dòng thời gian tổng hợp từ các mốc nghiệp vụ liên quan tới rủi ro. Bản
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
/* Dòng tóm tắt số liệu                                        */
/* ================================================================== */

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
/* Hộp thoại chuyển trạng thái                                        */
/* ================================================================== */

function TransitionModal({
  open,
  risk,
  blockClose,
  onClose,
  onDone,
  onWarn,
}: {
  open: boolean;
  risk: Risk;
  /** Rủi ro mức Cao chưa có KPPN thì cảnh báo khi đóng */
  blockClose: boolean;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
  onWarn: (message: string, detail?: string) => void;
}) {
  const list = riskNextTransitions(risk.status);
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

  function submit() {
    if (!selected) return;

    if (selected.requireReason && !reason.trim()) {
      setError("Bắt buộc nhập lý do khi chuyển sang trạng thái này");
      return;
    }

    // Cảnh báo nghiệp vụ khi đóng rủi ro mức cao mà chưa có KPPN
    if (selected.to === "Đã đóng" && blockClose) {
      onWarn(
        "Rủi ro được đóng khi chưa có KPPN",
        `Mức rủi ro còn lại là ${residualLevelOf(risk)}. Hãy rà soát lại kế hoạch khắc phục và phòng ngừa.`,
      );
    }

    riskRepo.update(risk.id, {
      status: selected.to,
      statusNote: reason.trim() || risk.statusNote,
    });

    onDone(
      `${risk.code}: ${selected.label}`,
      `Trạng thái chuyển từ ${risk.status} sang ${selected.to}.`,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Chuyển trạng thái rủi ro"
      description={`${risk.code} - ${risk.name}`}
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
          <StatusBadge status={risk.status} />
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
            Rủi ro đang ở trạng thái cuối của luồng, không thể chuyển tiếp.
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
                  name="risk-transition"
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

            {selected?.to === "Đã đóng" && blockClose && (
              <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                <IconAlertTriangle size={16} className="mt-px shrink-0" />
                <span>
                  Mức rủi ro còn lại là <b>{residualLevelOf(risk)}</b> nhưng
                  chưa có hành động KPPN đang triển khai. Hệ thống vẫn cho đóng
                  nhưng sẽ ghi nhận cảnh báo này.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
