"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconBuilding,
  IconChecklist,
  IconCircleCheck,
  IconClipboardCheck,
  IconClockExclamation,
  IconEye,
  IconFileSearch,
  IconPlus,
  IconRadar,
  IconShieldCheck,
  IconShieldX,
  IconTool,
  IconUser,
  IconWorld,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  EmptyState,
  RiskBadge,
  StatusBadge,
  Tooltip,
  UserCell,
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
import { RISK_LEVELS } from "@/lib/domain/enums";
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import {
  deficiencyDaysToDue,
  expectedProgress,
  isDeficiencyOverdue,
  isKppnBehindSchedule,
  isKppnFinished,
  isKppnOverdue,
  isMissingRootCause as isDeficiencyMissingRootCause,
  kppnOverdueDays,
} from "@/lib/domain/kppn-utils";
import {
  canViewEvent,
  detectionLag,
  eventAging,
  isEventClosed,
  isMissingHandler,
  isMissingRiskLink,
  isMissingRootCause as isEventMissingRootCause,
  isSlowDetection,
  isStaleEvent,
  netLoss,
  type EventViewer,
} from "@/lib/domain/event-utils";
import type {
  Control,
  Deficiency,
  GrcEvent,
  Kppn,
  Risk,
} from "@/lib/domain/schema";
import type { RiskLevelValue } from "@/lib/domain/enums";
import { formatDate, formatMoney } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Phạm vi dữ liệu theo vai trò                                        */
/* ================================================================== */

type Scope = "all" | "unit" | "self";

const SCOPE_META: Record<
  Scope,
  { label: string; icon: React.ReactNode; note: string }
> = {
  all: {
    label: "Toàn hệ thống",
    icon: <IconWorld size={14} />,
    note: "Bảng tin tổng hợp dữ liệu của tất cả đơn vị",
  },
  unit: {
    label: "Đơn vị của tôi",
    icon: <IconBuilding size={14} />,
    note: "Chỉ hiển thị bản ghi thuộc đơn vị bạn phụ trách",
  },
  self: {
    label: "Của cá nhân tôi",
    icon: <IconUser size={14} />,
    note: "Chỉ hiển thị bản ghi bạn sở hữu, phụ trách hoặc báo cáo",
  },
};

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function TrangChuScreen() {
  const router = useRouter();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const risks = useCollection(riskRepo);
  const controls = useCollection(controlRepo);
  const tests = useCollection(controlTestRepo);
  const deficiencies = useCollection(deficiencyRepo);
  const kppns = useCollection(kppnRepo);
  const events = useCollection(eventRepo);

  const canEdit = hasRole("admin", "qtrr", "owner");
  const isAuditor = hasRole("auditor") && !hasRole("admin", "qtrr");
  const isGovernance = hasRole("admin", "qtrr");

  const me = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );
  const meId = me?.id ?? "";
  const myUnitId = me?.unitId ?? "";

  /** Phạm vi dữ liệu suy ra từ vai trò, sửa 1 chỗ là đổi toàn trang */
  const scope: Scope = useMemo(() => {
    if (hasRole("admin", "qtrr", "auditor")) return "all";
    if (hasRole("owner")) return "unit";
    return "self";
  }, [hasRole]);

  const viewer = useMemo<EventViewer>(
    () => ({
      privileged: hasRole("admin", "qtrr", "auditor"),
      employeeId: meId,
    }),
    [hasRole, meId],
  );

  /* ------------------------ Lọc theo phạm vi ---------------------- */

  const inScopeRisk = (r: Risk) =>
    scope === "all"
      ? true
      : scope === "unit"
        ? r.unitId === myUnitId
        : r.ownerId === meId;

  const inScopeControl = (c: Control) =>
    scope === "all"
      ? true
      : scope === "unit"
        ? c.unitId === myUnitId
        : c.ownerId === meId;

  const inScopeDeficiency = (d: Deficiency) =>
    scope === "all"
      ? true
      : scope === "unit"
        ? d.unitId === myUnitId
        : d.ownerId === meId;

  const inScopeKppn = (k: Kppn) =>
    scope === "all"
      ? true
      : scope === "unit"
        ? k.unitId === myUnitId
        : k.assigneeId === meId || k.supervisorId === meId;

  const inScopeEvent = (e: GrcEvent) => {
    if (!canViewEvent(e, viewer)) return false;
    if (scope === "all") return true;
    if (scope === "unit") return e.unitId === myUnitId;
    return e.reporterId === meId || e.handlerId === meId;
  };

  const myRisks = useMemo(
    () => risks.filter(inScopeRisk),
    [risks, scope, meId, myUnitId],
  );
  const myControls = useMemo(
    () => controls.filter(inScopeControl),
    [controls, scope, meId, myUnitId],
  );
  const myDeficiencies = useMemo(
    () => deficiencies.filter(inScopeDeficiency),
    [deficiencies, scope, meId, myUnitId],
  );
  const myKppns = useMemo(() => myKppnFilter(), [kppns, scope, meId, myUnitId]);
  function myKppnFilter() {
    return kppns.filter(inScopeKppn);
  }
  const myEvents = useMemo(
    () => events.filter(inScopeEvent),
    [events, scope, meId, myUnitId, viewer],
  );

  /* ============================ Chỉ số ============================ */

  const riskStat = useMemo(() => {
    const active = myRisks.filter((r) => r.status !== "Đã đóng");
    const byLevel: Record<RiskLevelValue, number> = {
      Thấp: 0,
      "Trung bình": 0,
      Cao: 0,
      "Trọng yếu": 0,
    };
    active.forEach((r) => {
      byLevel[residualLevelOf(r)] += 1;
    });
    const high = byLevel["Cao"] + byLevel["Trọng yếu"];
    const covered = active.filter((r) =>
      controls.some((c) => c.riskIds.includes(r.id)),
    ).length;
    return {
      total: active.length,
      byLevel,
      high,
      zeroTolerance: active.filter((r) => r.isZeroTolerance).length,
      uncovered: active.length - covered,
    };
  }, [myRisks, controls]);

  const controlStat = useMemo(() => {
    const active = myControls.filter((c) => c.status === "Đang hiệu lực");
    const failed = active.filter((c) => c.lastTestResult === "Không hiệu quả");
    const never = active.filter((c) => !c.lastTestResult);
    return {
      total: active.length,
      key: active.filter((c) => c.isKeyControl).length,
      failed: failed.length,
      never: never.length,
    };
  }, [myControls]);

  const eventStat = useMemo(() => {
    const open = myEvents.filter((e) => !isEventClosed(e));
    return {
      total: myEvents.length,
      open: open.length,
      slow: myEvents.filter((e) => isSlowDetection(e)).length,
      stale: open.filter((e) => isStaleEvent(e)).length,
      missingRisk: open.filter((e) => isMissingRiskLink(e)).length,
      loss: myEvents.reduce((s, e) => s + netLoss(e), 0),
    };
  }, [myEvents]);

  const kppnStat = useMemo(() => {
    const running = myKppns.filter((k) => !isKppnFinished(k));
    const overdue = running.filter((k) => isKppnOverdue(k));
    return {
      total: running.length,
      overdue: overdue.length,
      behind: running.filter(
        (k) => isKppnBehindSchedule(k) && !isKppnOverdue(k),
      ).length,
      acceptance: running.filter((k) => k.status === "Chờ nghiệm thu").length,
      maxLate: overdue.reduce((m, k) => Math.max(m, kppnOverdueDays(k)), 0),
      avgProgress:
        running.length === 0
          ? 0
          : Math.round(
              running.reduce((s, k) => s + k.progress, 0) / running.length,
            ),
    };
  }, [myKppns]);

  const deficiencyStat = useMemo(() => {
    const open = myDeficiencies.filter((d) => d.status !== "Đã đóng");
    return {
      total: open.length,
      overdue: open.filter((d) => isDeficiencyOverdue(d)).length,
      missingRootCause: open.filter((d) => isDeficiencyMissingRootCause(d))
        .length,
    };
  }, [myDeficiencies]);

  /* ==================== Việc cần tôi xử lý ==================== */

  const todos = useMemo<TodoItem[]>(() => {
    const out: TodoItem[] = [];

    /* 1. Hành động KPPN tôi thực hiện đang quá hạn */
    kppns
      .filter((k) => k.assigneeId === meId && isKppnOverdue(k))
      .forEach((k) =>
        out.push({
          id: `kppn-late-${k.id}`,
          tone: "danger",
          icon: <IconClockExclamation size={15} />,
          title: `${k.code} quá hạn ${kppnOverdueDays(k)} ngày`,
          description: `${k.name} - tiến độ ${k.progress}%, kỳ vọng ${expectedProgress(k)}%`,
          href: `/khac-phuc/kppn/${k.code}`,
          weight: 1000 + kppnOverdueDays(k),
        }),
      );

    /* 2. Hành động chờ tôi nghiệm thu */
    kppns
      .filter((k) => k.supervisorId === meId && k.status === "Chờ nghiệm thu")
      .forEach((k) =>
        out.push({
          id: `kppn-acc-${k.id}`,
          tone: "warning",
          icon: <IconCircleCheck size={15} />,
          title: `${k.code} chờ bạn nghiệm thu`,
          description: `${k.name} - người thực hiện đã báo hoàn tất`,
          href: `/khac-phuc/kppn/${k.code}`,
          weight: 900,
        }),
      );

    /* 3. Điểm yếu tôi chịu trách nhiệm đang quá hạn hoặc thiếu nguyên nhân gốc */
    deficiencies
      .filter((d) => d.ownerId === meId && d.status !== "Đã đóng")
      .forEach((d) => {
        if (isDeficiencyOverdue(d))
          out.push({
            id: `def-late-${d.id}`,
            tone: "danger",
            icon: <IconTool size={15} />,
            title: `${d.code} quá hạn khắc phục`,
            description: `${d.name} - hạn ${formatDate(d.dueDate)}`,
            href: `/khac-phuc/diem-yeu/${d.code}`,
            weight: 950 + Math.abs(deficiencyDaysToDue(d) ?? 0),
          });
        else if (isDeficiencyMissingRootCause(d))
          out.push({
            id: `def-rc-${d.id}`,
            tone: "warning",
            icon: <IconFileSearch size={15} />,
            title: `${d.code} chưa có nguyên nhân gốc`,
            description: `Điểm yếu mức ${d.severity} bắt buộc phân tích trước khi lập KPPN`,
            href: `/khac-phuc/diem-yeu/${d.code}`,
            weight: 700,
          });
      });

    /* 4. Sự kiện tôi xử lý còn thiếu hồ sơ */
    events
      .filter(
        (e) =>
          e.handlerId === meId && !isEventClosed(e) && canViewEvent(e, viewer),
      )
      .forEach((e) => {
        const miss: string[] = [];
        if (isMissingRiskLink(e)) miss.push("liên kết rủi ro");
        if (isEventMissingRootCause(e)) miss.push("nguyên nhân gốc");
        if (!e.lessonLearned.trim()) miss.push("bài học kinh nghiệm");
        if (miss.length === 0) return;
        out.push({
          id: `evt-miss-${e.id}`,
          tone: isMissingRiskLink(e) ? "danger" : "warning",
          icon: <IconBolt size={15} />,
          title: `${e.code} thiếu ${miss.length} mục hồ sơ`,
          description: `Còn thiếu: ${miss.join(", ")}`,
          href: `/su-kien/so-theo-doi/${e.code}`,
          weight: 800 + miss.length * 10,
        });
      });

    /* 5. Sự kiện tôi báo cáo chưa được phân công người xử lý */
    events
      .filter(
        (e) =>
          e.reporterId === meId &&
          !isEventClosed(e) &&
          isMissingHandler(e) &&
          canViewEvent(e, viewer),
      )
      .forEach((e) =>
        out.push({
          id: `evt-handler-${e.id}`,
          tone: "warning",
          icon: <IconRadar size={15} />,
          title: `${e.code} chưa có người xử lý`,
          description: `Sự kiện bạn báo cáo đã mở ${eventAging(e)} ngày`,
          href: `/su-kien/so-theo-doi/${e.code}`,
          weight: 600,
        }),
      );

    /* 6. Rủi ro tôi sở hữu ở mức cao mà chưa có kiểm soát nào phủ */
    risks
      .filter(
        (r) =>
          r.ownerId === meId &&
          r.status !== "Đã đóng" &&
          (residualLevelOf(r) === "Cao" ||
            residualLevelOf(r) === "Trọng yếu") &&
          !controls.some((c) => c.riskIds.includes(r.id)),
      )
      .forEach((r) =>
        out.push({
          id: `risk-nocontrol-${r.id}`,
          tone: "danger",
          icon: <IconShieldX size={15} />,
          title: `${r.code} chưa có kiểm soát nào`,
          description: `${r.name} - mức còn lại ${residualLevelOf(r)}`,
          href: `/rui-ro/so-dang-ky/${r.code}`,
          weight: 850,
        }),
      );

    return out.sort((a, b) => b.weight - a.weight);
  }, [kppns, deficiencies, events, risks, controls, meId, viewer]);

  /* ==================== Dữ liệu các khối bảng ==================== */

  const topRisks = useMemo(
    () =>
      myRisks
        .filter((r) => r.status !== "Đã đóng")
        .sort((a, b) => residualScoreOf(b) - residualScoreOf(a))
        .slice(0, 5),
    [myRisks],
  );

  const topKppns = useMemo(
    () =>
      myKppns
        .filter((k) => !isKppnFinished(k) && isKppnOverdue(k))
        .sort((a, b) => kppnOverdueDays(b) - kppnOverdueDays(a))
        .slice(0, 5),
    [myKppns],
  );

  const recentEvents = useMemo(
    () =>
      [...myEvents]
        .sort((a, b) => (a.detectedDate < b.detectedDate ? 1 : -1))
        .slice(0, 5),
    [myEvents],
  );

  /** Đợt kiểm tra gần nhất, chỉ dùng cho vai trò xem toàn hệ thống */
  const recentTests = useMemo(
    () =>
      [...tests]
        .filter((x) => {
          const c = controls.find((y) => y.id === x.controlId);
          return c ? inScopeControl(c) : false;
        })
        .sort((a, b) => (a.testDate < b.testDate ? 1 : -1))
        .slice(0, 5),
    [tests, controls, scope, meId, myUnitId],
  );

  /* --------------------- Biểu đồ sự kiện 6 tháng ------------------ */

  const eventTrend = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `T${d.getMonth() + 1}`,
        value: 0,
      });
    }
    myEvents.forEach((e) => {
      const key = e.occurredDate.slice(0, 7);
      const b = buckets.find((x) => x.key === key);
      if (b) b.value += 1;
    });
    return buckets;
  }, [myEvents]);

  /* ============================ Render ============================ */

  const meta = SCOPE_META[scope];
  const hour = new Date().getHours();
  const greeting =
    hour < 11
      ? "Chào buổi sáng"
      : hour < 18
        ? "Chào buổi chiều"
        : "Chào buổi tối";

  /* Người dùng chưa gắn hồ sơ nhân sự thì phạm vi cá nhân vô nghĩa */
  if (scope !== "all" && !me) {
    return (
      <PageContainer>
        <PageHeader title="Trang chủ" />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconUser size={24} />}
              title="Tài khoản chưa gắn hồ sơ nhân sự"
              description="Hệ thống không xác định được đơn vị và các bản ghi liên quan tới bạn, nên chưa dựng được bảng tin cá nhân. Liên hệ Quản trị hệ thống để gắn hồ sơ nhân sự."
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={`${greeting}, ${me?.name ?? user.name}`}
        subtitle={meta.note}
        showBreadcrumb={false}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand" dot>
              <span className="inline-flex items-center gap-1">
                {meta.icon}
                {meta.label}
              </span>
            </Badge>
            {scope === "unit" && (
              <Badge tone="neutral">{lk.unitName(myUnitId)}</Badge>
            )}
            {isAuditor && <Badge tone="neutral">Chế độ chỉ đọc</Badge>}
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconBolt size={16} />}
              onClick={() => router.push("/su-kien/bao-cao-nhanh")}
            >
              Báo cáo nhanh sự kiện
            </Button>
            <Button
              variant="secondary"
              icon={<IconChecklist size={16} />}
              onClick={() => router.push("/viec-can-xu-ly")}
            >
              Việc cần xử lý
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                icon={<IconPlus size={16} />}
                onClick={() => router.push("/rui-ro/so-dang-ky/them-moi")}
              >
                Ghi nhận rủi ro
              </Button>
            )}
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* ================== Dải cảnh báo ưu tiên ================== */}
          {kppnStat.overdue > 0 && (
            <AlertBar
              tone="danger"
              icon={<IconClockExclamation size={18} />}
              title={`${kppnStat.overdue} hành động khắc phục đang quá hạn`}
              description={`Trễ nhiều nhất ${kppnStat.maxLate} ngày. Hành động quá hạn kéo theo điểm yếu và rủi ro không được xử lý đúng cam kết.`}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => router.push("/khac-phuc/kppn-qua-han")}
                >
                  Xem danh sách
                </Button>
              }
            />
          )}

          {eventStat.missingRisk > 0 && (
            <AlertBar
              tone="danger"
              icon={<IconAlertTriangle size={18} />}
              title={`${eventStat.missingRisk} sự kiện mức cao chưa liên kết rủi ro`}
              description="Thiếu liên kết ngược thì không đánh giá lại được mức rủi ro còn lại, và không đóng được sự kiện."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => router.push("/su-kien/so-theo-doi")}
                >
                  Bổ sung ngay
                </Button>
              }
            />
          )}

          {riskStat.uncovered > 0 && isGovernance && (
            <AlertBar
              tone="warning"
              icon={<IconShieldX size={18} />}
              title={`${riskStat.uncovered} rủi ro chưa có kiểm soát nào phủ`}
              description="Rủi ro không có kiểm soát nghĩa là mức rủi ro còn lại đúng bằng mức rủi ro cố hữu."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  onClick={() => router.push("/kiem-soat/so-dang-ky")}
                >
                  Rà soát kiểm soát
                </Button>
              }
            />
          )}

          {/* ==================== 4 thẻ phân hệ ==================== */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ModuleCard
              tone="danger"
              icon={<IconAlertTriangle size={20} />}
              label="Rủi ro đang theo dõi"
              value={riskStat.total}
              onClick={() => router.push("/rui-ro/so-dang-ky")}
              lines={[
                {
                  text: "Mức Cao trở lên",
                  value: riskStat.high,
                  danger: riskStat.high > 0,
                },
                {
                  text: "Không khẩu vị (KKN)",
                  value: riskStat.zeroTolerance,
                },
                {
                  text: "Chưa có kiểm soát",
                  value: riskStat.uncovered,
                  danger: riskStat.uncovered > 0,
                },
              ]}
            />

            <ModuleCard
              tone="brand"
              icon={<IconShieldCheck size={20} />}
              label="Kiểm soát đang vận hành"
              value={controlStat.total}
              onClick={() => router.push("/kiem-soat/so-dang-ky")}
              lines={[
                { text: "Kiểm soát trọng yếu", value: controlStat.key },
                {
                  text: "Kết quả không hiệu quả",
                  value: controlStat.failed,
                  danger: controlStat.failed > 0,
                },
                {
                  text: "Chưa từng kiểm tra",
                  value: controlStat.never,
                  danger: controlStat.never > 0,
                },
              ]}
            />

            <ModuleCard
              tone="high"
              icon={<IconBolt size={20} />}
              label="Sự kiện đang mở"
              value={eventStat.open}
              onClick={() => router.push("/su-kien/so-theo-doi")}
              lines={[
                {
                  text: "Phát hiện chậm",
                  value: eventStat.slow,
                  danger: eventStat.slow > 0,
                },
                { text: "Mở quá 60 ngày", value: eventStat.stale },
                {
                  text: `Tổn thất ròng ${formatMoney(eventStat.loss) || "0"} đ`,
                  value: null,
                },
              ]}
            />

            <ModuleCard
              tone="warning"
              icon={<IconTool size={20} />}
              label="Hành động KPPN đang chạy"
              value={kppnStat.total}
              onClick={() => router.push("/khac-phuc/kppn")}
              lines={[
                {
                  text: "Quá hạn",
                  value: kppnStat.overdue,
                  danger: kppnStat.overdue > 0,
                },
                { text: "Chậm tiến độ", value: kppnStat.behind },
                {
                  text: `Tiến độ bình quân ${kppnStat.avgProgress}%`,
                  value: null,
                },
              ]}
            />
          </div>

          {/* ============ Việc cần tôi xử lý + 2 biểu đồ ============ */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Cột trái: việc cần xử lý */}
            <ContentCard
              padded={false}
              className="flex flex-col overflow-hidden xl:col-span-2"
            >
              <BlockHeader
                icon={<IconChecklist size={16} />}
                title="Việc cần tôi xử lý"
                count={todos.length}
                actionLabel={todos.length > 6 ? "Xem tất cả" : undefined}
                onAction={() => router.push("/viec-can-xu-ly")}
              />

              {todos.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<IconCircleCheck size={24} />}
                    title="Không có việc nào cần bạn xử lý"
                    description="Toàn bộ hành động, điểm yếu và sự kiện liên quan tới bạn đang bám sát kế hoạch."
                    compact
                  />
                </div>
              ) : (
                <ul className="flex flex-col">
                  {todos.slice(0, 6).map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => router.push(it.href)}
                        className="flex w-full items-center gap-3 border-b border-border-light px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[#FAFAFA]"
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl",
                            it.tone === "danger"
                              ? "bg-lv-critical-bg text-lv-critical-text"
                              : "bg-lv-medium-bg text-lv-medium-text",
                          )}
                        >
                          {it.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-text-primary">
                            {it.title}
                          </span>
                          <span className="block truncate text-[12px] text-text-secondary">
                            {it.description}
                          </span>
                        </span>
                        <IconArrowRight
                          size={16}
                          className="shrink-0 text-icon-neutral"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ContentCard>

            {/* Cột phải: 2 biểu đồ nhỏ */}
            <div className="flex flex-col gap-4">
              <ContentCard className="flex flex-col gap-2.5">
                <p className="text-[13px] font-semibold text-text-primary">
                  Phân bố mức rủi ro còn lại
                </p>
                {riskStat.total === 0 ? (
                  <p className="py-4 text-center text-[12px] text-text-hint">
                    Chưa có rủi ro nào trong phạm vi
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {[...RISK_LEVELS].reverse().map((lv) => (
                      <LevelBar
                        key={lv}
                        level={lv}
                        value={riskStat.byLevel[lv]}
                        max={riskStat.total}
                        onClick={() => router.push("/rui-ro/so-dang-ky")}
                      />
                    ))}
                  </div>
                )}
              </ContentCard>

              <ContentCard className="flex flex-col gap-2.5">
                <p className="text-[13px] font-semibold text-text-primary">
                  Sự kiện 6 tháng gần nhất
                </p>
                <TrendChart data={eventTrend} />
                <p className="text-[11px] text-text-hint">
                  Tính theo ngày xảy ra. Cột cao bất thường là dấu hiệu cần rà
                  soát nhóm nguyên nhân chung.
                </p>
              </ContentCard>
            </div>
          </div>

          {/* =============== Rủi ro trọng yếu + KPPN quá hạn ========= */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ContentCard padded={false} className="overflow-hidden">
              <BlockHeader
                icon={<IconAlertTriangle size={16} />}
                title="Rủi ro cần chú ý nhất"
                count={topRisks.length}
                actionLabel="Sổ đăng ký rủi ro"
                onAction={() => router.push("/rui-ro/so-dang-ky")}
              />
              {topRisks.length === 0 ? (
                <EmptyRow text="Chưa có rủi ro nào trong phạm vi của bạn." />
              ) : (
                <ul className="flex flex-col">
                  {topRisks.map((r) => (
                    <RowLink
                      key={r.id}
                      onClick={() =>
                        router.push(`/rui-ro/so-dang-ky/${r.code}`)
                      }
                      code={r.code}
                      title={r.name}
                      sub={`${lk.unitName(r.unitId)} - ${lk.employeeName(r.ownerId, "chưa gán")}`}
                      right={
                        <span className="flex shrink-0 items-center gap-1.5">
                          {r.isZeroTolerance && (
                            <Tooltip content="Rủi ro không khẩu vị">
                              <Badge tone="danger" size="sm">
                                KKN
                              </Badge>
                            </Tooltip>
                          )}
                          <RiskBadge
                            level={residualLevelOf(r)}
                            score={residualScoreOf(r)}
                          />
                        </span>
                      }
                    />
                  ))}
                </ul>
              )}
            </ContentCard>

            <ContentCard padded={false} className="overflow-hidden">
              <BlockHeader
                icon={<IconClockExclamation size={16} />}
                title="Hành động KPPN quá hạn"
                count={topKppns.length}
                actionLabel="KPPN quá hạn"
                onAction={() => router.push("/khac-phuc/kppn-qua-han")}
              />
              {topKppns.length === 0 ? (
                <EmptyRow text="Không có hành động nào quá hạn. Tiến độ đang bám sát kế hoạch." />
              ) : (
                <ul className="flex flex-col">
                  {topKppns.map((k) => (
                    <RowLink
                      key={k.id}
                      onClick={() => router.push(`/khac-phuc/kppn/${k.code}`)}
                      code={k.code}
                      title={k.name}
                      sub={`${lk.employeeName(k.assigneeId, "chưa gán")} - hạn ${formatDate(k.dueDate)}`}
                      right={
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="text-[12px] text-text-secondary">
                            {k.progress}%
                          </span>
                          <Badge tone="danger" size="sm" dot>
                            {kppnOverdueDays(k)} ngày
                          </Badge>
                        </span>
                      }
                    />
                  ))}
                </ul>
              )}
            </ContentCard>
          </div>

          {/* =============== Sự kiện mới nhất + khối vai trò ========= */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ContentCard padded={false} className="overflow-hidden">
              <BlockHeader
                icon={<IconBolt size={16} />}
                title="Sự kiện ghi nhận gần nhất"
                count={recentEvents.length}
                actionLabel="Sổ theo dõi sự kiện"
                onAction={() => router.push("/su-kien/so-theo-doi")}
              />
              {recentEvents.length === 0 ? (
                <EmptyRow text="Chưa có sự kiện nào trong phạm vi của bạn." />
              ) : (
                <ul className="flex flex-col">
                  {recentEvents.map((e) => (
                    <RowLink
                      key={e.id}
                      onClick={() =>
                        router.push(`/su-kien/so-theo-doi/${e.code}`)
                      }
                      code={e.code}
                      title={e.name}
                      sub={`${lk.unitName(e.unitId)} - phát hiện ${formatDate(e.detectedDate)}`}
                      right={
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isSlowDetection(e) && (
                            <Tooltip
                              content={`Phát hiện sau ${detectionLag(e)} ngày`}
                            >
                              <Badge tone="danger" size="sm">
                                Chậm
                              </Badge>
                            </Tooltip>
                          )}
                          <RiskBadge level={e.severity} />
                          <StatusBadge status={e.status} />
                        </span>
                      }
                    />
                  ))}
                </ul>
              )}
            </ContentCard>

            {/* Khối thay đổi hoàn toàn theo vai trò */}
            {isAuditor ? (
              <ContentCard className="flex flex-col gap-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                  <IconFileSearch size={16} className="text-brand" />
                  Góc nhìn kiểm toán nội bộ
                </p>
                <p className="text-[12px] leading-4 text-text-secondary">
                  Các chỉ số phản ánh chất lượng hồ sơ, dùng để chọn mẫu kiểm
                  toán và đánh giá mức độ tuân thủ quy trình quản trị rủi ro.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <QualityChip
                    label="Sự kiện thiếu liên kết rủi ro"
                    value={eventStat.missingRisk}
                  />
                  <QualityChip
                    label="Điểm yếu thiếu nguyên nhân gốc"
                    value={deficiencyStat.missingRootCause}
                  />
                  <QualityChip
                    label="Rủi ro chưa có kiểm soát"
                    value={riskStat.uncovered}
                  />
                  <QualityChip
                    label="Kiểm soát chưa từng kiểm tra"
                    value={controlStat.never}
                  />
                  <QualityChip
                    label="Điểm yếu quá hạn khắc phục"
                    value={deficiencyStat.overdue}
                  />
                  <QualityChip
                    label="Sự kiện phát hiện chậm"
                    value={eventStat.slow}
                  />
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border-light pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    icon={<IconClipboardCheck size={14} />}
                    onClick={() => router.push("/kiem-soat/ket-qua-kiem-tra")}
                  >
                    Kết quả kiểm tra kiểm soát
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    compact
                    icon={<IconEye size={14} />}
                    onClick={() => router.push("/khac-phuc/diem-yeu")}
                  >
                    Sổ theo dõi điểm yếu
                  </Button>
                </div>
              </ContentCard>
            ) : (
              <ContentCard padded={false} className="overflow-hidden">
                <BlockHeader
                  icon={<IconClipboardCheck size={16} />}
                  title="Đợt kiểm tra kiểm soát gần nhất"
                  count={recentTests.length}
                  actionLabel="Kết quả kiểm tra"
                  onAction={() => router.push("/kiem-soat/ket-qua-kiem-tra")}
                />
                {recentTests.length === 0 ? (
                  <EmptyRow text="Chưa có đợt kiểm tra nào trong phạm vi của bạn." />
                ) : (
                  <ul className="flex flex-col">
                    {recentTests.map((x) => {
                      const c = controls.find((y) => y.id === x.controlId);
                      return (
                        <RowLink
                          key={x.id}
                          onClick={() =>
                            router.push("/kiem-soat/ket-qua-kiem-tra")
                          }
                          code={x.code}
                          title={c?.name ?? "Kiểm soát không xác định"}
                          sub={`${x.period || "không rõ kỳ"} - kiểm tra ${formatDate(x.testDate)} - ${lk.employeeName(x.testerId, "chưa gán")}`}
                          right={<StatusBadge status={x.result} />}
                        />
                      );
                    })}
                  </ul>
                )}
              </ContentCard>
            )}
          </div>

          {/* ============ Gợi ý cho cán bộ nhân viên ============ */}
          {scope === "self" && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-info-border bg-lv-info-bg px-3 py-2.5 text-[12px] leading-4 text-lv-info-text">
              <IconBolt size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Bảng tin đang hiển thị phạm vi <b>cá nhân</b>. Nếu bạn phát hiện
                sự cố, sai sót hoặc tình huống bất thường, hãy dùng{" "}
                <b>Báo cáo nhanh</b> - chỉ mất khoảng 1 phút và không cần biết
                đó là rủi ro nào.
              </span>
              <Button
                variant="secondary"
                size="sm"
                compact
                onClick={() => router.push("/su-kien/bao-cao-nhanh")}
              >
                Báo cáo ngay
              </Button>
            </div>
          )}
        </div>
      </PageBody>
    </PageContainer>
  );
}

/* ================================================================== */
/* Kiểu dữ liệu việc cần xử lý                                        */
/* ================================================================== */

interface TodoItem {
  id: string;
  tone: "danger" | "warning";
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  /** Điểm ưu tiên, càng lớn càng lên đầu */
  weight: number;
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

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5",
        style,
      )}
    >
      <span className="shrink-0">
        {icon ?? <IconAlertTriangle size={18} />}
      </span>
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

function ModuleCard({
  tone,
  icon,
  label,
  value,
  lines,
  onClick,
}: {
  tone: "brand" | "warning" | "high" | "danger";
  icon: React.ReactNode;
  label: string;
  value: number;
  lines: { text: string; value: number | null; danger?: boolean }[];
  onClick: () => void;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    high: "bg-lv-high-bg text-lv-high-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="misa-card flex flex-col gap-2.5 p-4 text-left transition-all hover:brightness-[0.99]"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
            style[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] text-text-secondary">{label}</p>
          <p className="text-[24px] leading-8 font-semibold text-text-primary">
            {value}
          </p>
        </div>
        <IconArrowRight size={16} className="ml-auto text-icon-neutral" />
      </div>

      <ul className="flex flex-col gap-1 border-t border-border-light pt-2">
        {lines.map((l) => (
          <li
            key={l.text}
            className="flex items-center justify-between gap-2 text-[12px]"
          >
            <span className="truncate text-text-secondary">{l.text}</span>
            {l.value !== null && (
              <b
                className={cn(
                  "shrink-0",
                  l.danger ? "text-danger" : "text-text-primary",
                )}
              >
                {l.value}
              </b>
            )}
          </li>
        ))}
      </ul>
    </button>
  );
}

function BlockHeader({
  icon,
  title,
  count,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-light px-4 py-2.5">
      <span className="text-brand">{icon}</span>
      <p className="text-[13px] font-semibold text-text-primary">{title}</p>
      {count !== undefined && count > 0 && (
        <span className="rounded-badge bg-surface-alt px-1.5 text-[11px] font-medium text-text-secondary">
          {count}
        </span>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="ml-auto text-[12px] font-medium text-brand hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function RowLink({
  code,
  title,
  sub,
  right,
  onClick,
}: {
  code: string;
  title: string;
  sub: string;
  right?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 border-b border-border-light px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[#FAFAFA]"
      >
        <span className="w-[110px] shrink-0 truncate text-[12px] font-medium text-brand">
          {code}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-text-primary">
            {title}
          </span>
          <span className="block truncate text-[12px] text-text-secondary">
            {sub}
          </span>
        </span>
        {right}
      </button>
    </li>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="px-4 py-6 text-center text-[12px] text-text-hint">{text}</p>
  );
}

function LevelBar({
  level,
  value,
  max,
  onClick,
}: {
  level: RiskLevelValue;
  value: number;
  max: number;
  onClick: () => void;
}) {
  const bar: Record<RiskLevelValue, string> = {
    Thấp: "bg-lv-low-text",
    "Trung bình": "bg-lv-medium-text",
    Cao: "bg-lv-high-text",
    "Trọng yếu": "bg-lv-critical-text",
  };
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 text-left"
    >
      <span className="w-[86px] shrink-0 text-[12px] text-text-secondary">
        {level}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
        <span
          className={cn("block h-full rounded-full", bar[level])}
          style={{ width: `${Math.max(value === 0 ? 0 : 3, pct)}%` }}
        />
      </span>
      <span className="w-[46px] shrink-0 text-right text-[12px] font-medium text-text-primary">
        {value}
      </span>
    </button>
  );
}

function TrendChart({
  data,
}: {
  data: { key: string; label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex h-[110px] items-end gap-2">
      {data.map((d) => (
        <Tooltip key={d.key} content={`${d.label}: ${d.value} sự kiện`}>
          <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] font-medium text-text-primary">
              {d.value > 0 ? d.value : ""}
            </span>
            <span
              className={cn(
                "w-full rounded-t-ctrl transition-all",
                d.value >= max && d.value > 0 ? "bg-lv-high-text" : "bg-brand",
              )}
              style={{
                height: `${Math.max(d.value === 0 ? 2 : 8, (d.value / max) * 100)}%`,
              }}
            />
            <span className="text-[11px] text-text-secondary">{d.label}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

function QualityChip({ label, value }: { label: string; value: number }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-ctrl border px-2.5 py-2",
        value > 0
          ? "border-lv-medium-border bg-lv-medium-bg"
          : "border-border-light bg-surface-alt",
      )}
    >
      <span
        className={cn(
          "text-[18px] leading-6 font-semibold",
          value > 0 ? "text-lv-medium-text" : "text-lv-low-text",
        )}
      >
        {value}
      </span>
      <span className="text-[11px] leading-3.5 text-text-secondary">
        {label}
      </span>
    </div>
  );
}
