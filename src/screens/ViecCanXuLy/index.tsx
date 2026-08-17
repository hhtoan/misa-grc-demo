"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBell,
  IconBellOff,
  IconBolt,
  IconCircleCheck,
  IconClipboardCheck,
  IconClockExclamation,
  IconEye,
  IconFileSearch,
  IconHourglass,
  IconRadar,
  IconRefresh,
  IconShieldX,
  IconTool,
  IconTrendingDown,
  IconUser,
  IconUserExclamation,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterCombobox,
  IconButton,
  Modal,
  Pagination,
  RiskBadge,
  RowActions,
  SearchInput,
  Segments,
  StatusBadge,
  TableToolbar,
  Tabs,
  TitleCell,
  Tooltip,
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
import { residualLevelOf, residualScoreOf } from "@/lib/domain/risk-utils";
import {
  canPushToSource,
  deficiencyDaysToDue,
  expectedProgress,
  isDeficiencyDueSoon,
  isDeficiencyOverdue,
  isKppnBehindSchedule,
  isKppnDueSoon,
  isKppnFinished,
  isKppnOverdue,
  isMissingRootCause as isDeficiencyMissingRootCause,
  kppnDaysToDue,
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
  type EventViewer,
} from "@/lib/domain/event-utils";
import { pushKppnToSource } from "@/lib/integrations/mock";
import type { Kppn } from "@/lib/domain/schema";
import { formatDate, toInputDate } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số nghiệp vụ - sửa ở đây nếu enum thay đổi                     */
/* ================================================================== */

const STATUS_CLOSED = "Đã đóng";
const STATUS_KPPN_ACCEPTANCE = "Chờ nghiệm thu";
const STATUS_KPPN_RUNNING = "Đang thực hiện";
const STATUS_EVENT_NEW = "Mới ghi nhận";
const TEST_RESULT_FAILED = "Không hiệu quả";
const CONTROL_ACTIVE = "Đang hiệu lực";

/** Ngưỡng coi là sắp đến hạn */
const SOON_DAYS = 7;

/* ================================================================== */
/* Mô hình việc cần xử lý                                        */
/* ================================================================== */

type ModuleKey = "rui-ro" | "kiem-soat" | "su-kien" | "khac-phuc";
type Urgency = "overdue" | "now" | "soon" | "watch";
type MyRole = "Tôi thực hiện" | "Tôi giám sát" | "Tôi sở hữu" | "Tôi báo cáo";

interface TaskItem {
  id: string;
  module: ModuleKey;
  /** Nhãn ngắn phân loại việc, dùng cho bộ lọc */
  type: string;
  urgency: Urgency;
  role: MyRole;
  code: string;
  title: string;
  description: string;
  /** Hạn liên quan tới việc, có thể trống */
  dueDate: string;
  /** Số ngày đã trễ, 0 nếu chưa trễ */
  lateDays: number;
  href: string;
  /** Điểm ưu tiên, càng lớn càng lên đầu */
  weight: number;
  /** Bản ghi KPPN kèm theo để mở hộp thoại cập nhật tiến độ */
  kppn?: Kppn;
  /** Cho phép giao việc nhanh sang hệ thống nguồn */
  canPush?: boolean;
}

const MODULE_META: Record<
  ModuleKey,
  { label: string; icon: React.ReactNode; tone: string }
> = {
  "rui-ro": {
    label: "Rủi ro",
    icon: <IconAlertTriangle size={14} />,
    tone: "bg-lv-critical-bg text-lv-critical-text",
  },
  "kiem-soat": {
    label: "Kiểm soát",
    icon: <IconClipboardCheck size={14} />,
    tone: "bg-brand-light text-brand",
  },
  "su-kien": {
    label: "Sự kiện",
    icon: <IconBolt size={14} />,
    tone: "bg-lv-high-bg text-lv-high-text",
  },
  "khac-phuc": {
    label: "Khắc phục",
    icon: <IconTool size={14} />,
    tone: "bg-lv-medium-bg text-lv-medium-text",
  },
};

const URGENCY_META: Record<
  Urgency,
  {
    label: string;
    note: string;
    tone: "danger" | "high" | "warning" | "neutral";
    icon: React.ReactNode;
  }
> = {
  overdue: {
    label: "Đã quá hạn",
    note: "Đã qua hạn cam kết, cần xử lý hoặc gia hạn chính thức",
    tone: "danger",
    icon: <IconClockExclamation size={20} />,
  },
  now: {
    label: "Cần làm ngay",
    note: "Đang chặn bước tiếp theo của quy trình",
    tone: "high",
    icon: <IconAlertTriangle size={20} />,
  },
  soon: {
    label: "Sắp đến hạn",
    note: `Còn dưới ${SOON_DAYS} ngày là tới hạn`,
    tone: "warning",
    icon: <IconHourglass size={20} />,
  },
  watch: {
    label: "Cần theo dõi",
    note: "Chưa gấp nhưng nên hoàn thiện để hồ sơ đầy đủ",
    tone: "neutral",
    icon: <IconEye size={20} />,
  },
};

const URGENCY_ORDER: Urgency[] = ["overdue", "now", "soon", "watch"];

const URGENCY_WEIGHT: Record<Urgency, number> = {
  overdue: 4000,
  now: 3000,
  soon: 2000,
  watch: 1000,
};

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function ViecCanXuLyScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();
  const lk = useLookups();

  const risks = useCollection(riskRepo);
  const controls = useCollection(controlRepo);
  const tests = useCollection(controlTestRepo);
  const deficiencies = useCollection(deficiencyRepo);
  const kppns = useCollection(kppnRepo);
  const events = useCollection(eventRepo);

  const isGovernance = hasRole("admin", "qtrr");

  const me = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );
  const meId = me?.id ?? "";

  const viewer = useMemo<EventViewer>(
    () => ({
      privileged: hasRole("admin", "qtrr", "auditor"),
      employeeId: meId,
    }),
    [hasRole, meId],
  );

  /* ---------------------- Hoãn nhắc trong phiên ------------------- */

  /** Bản đồ id việc → ngày hết hạn hoãn. Chỉ lưu trong phiên làm việc */
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});

  const today = toInputDate(new Date());

  function isSnoozed(id: string): boolean {
    const until = snoozed[id];
    return !!until && until > today;
  }

  /* ========================= Sinh danh sách việc ==================== */

  const allTasks = useMemo<TaskItem[]>(() => {
    if (!meId) return [];
    const out: TaskItem[] = [];

    /* ---------------- Phân hệ Khắc phục: hành động KPPN ------------ */

    kppns
      .filter((k) => !isKppnFinished(k))
      .forEach((k) => {
        const mine = k.assigneeId === meId;
        const supervise = k.supervisorId === meId;
        if (!mine && !supervise && !isGovernance) return;

        const role: MyRole = mine
          ? "Tôi thực hiện"
          : supervise
            ? "Tôi giám sát"
            : "Tôi sở hữu";

        /* Chờ tôi nghiệm thu */
        if (
          k.status === STATUS_KPPN_ACCEPTANCE &&
          (supervise || isGovernance)
        ) {
          out.push({
            id: `kppn-acc-${k.id}`,
            module: "khac-phuc",
            type: "Nghiệm thu hành động",
            urgency: "now",
            role: supervise ? "Tôi giám sát" : "Tôi sở hữu",
            code: k.code,
            title: `Nghiệm thu ${k.code}`,
            description: `${k.name} - người thực hiện đã báo hoàn tất, cần xác nhận kết quả và bằng chứng`,
            dueDate: k.dueDate,
            lateDays: kppnOverdueDays(k),
            href: `/khac-phuc/kppn/${k.code}`,
            weight: URGENCY_WEIGHT.now + 500,
            kppn: k,
          });
          return;
        }

        /* Quá hạn */
        if (isKppnOverdue(k) && (mine || supervise)) {
          const late = kppnOverdueDays(k);
          out.push({
            id: `kppn-late-${k.id}`,
            module: "khac-phuc",
            type: "Hành động quá hạn",
            urgency: "overdue",
            role,
            code: k.code,
            title: `${k.code} quá hạn ${late} ngày`,
            description: `${k.name} - tiến độ ${k.progress}%, kỳ vọng ${expectedProgress(k)}%`,
            dueDate: k.dueDate,
            lateDays: late,
            href: `/khac-phuc/kppn/${k.code}`,
            weight: URGENCY_WEIGHT.overdue + late,
            kppn: k,
          });
          return;
        }

        /* Chậm tiến độ nhưng chưa quá hạn */
        if (isKppnBehindSchedule(k) && mine) {
          const gap = expectedProgress(k) - k.progress;
          out.push({
            id: `kppn-behind-${k.id}`,
            module: "khac-phuc",
            type: "Hành động chậm tiến độ",
            urgency: "now",
            role,
            code: k.code,
            title: `${k.code} chậm ${gap} điểm so với kỳ vọng`,
            description: `${k.name} - còn ${kppnDaysToDue(k)} ngày tới hạn nhưng tiến độ mới ${k.progress}%`,
            dueDate: k.dueDate,
            lateDays: 0,
            href: `/khac-phuc/kppn/${k.code}`,
            weight: URGENCY_WEIGHT.now + gap,
            kppn: k,
          });
          return;
        }

        /* Sắp đến hạn */
        if (isKppnDueSoon(k) && mine) {
          out.push({
            id: `kppn-soon-${k.id}`,
            module: "khac-phuc",
            type: "Hành động sắp đến hạn",
            urgency: "soon",
            role,
            code: k.code,
            title: `${k.code} còn ${kppnDaysToDue(k)} ngày`,
            description: `${k.name} - tiến độ hiện tại ${k.progress}%`,
            dueDate: k.dueDate,
            lateDays: 0,
            href: `/khac-phuc/kppn/${k.code}`,
            weight: URGENCY_WEIGHT.soon + (SOON_DAYS - (kppnDaysToDue(k) ?? 0)),
            kppn: k,
          });
        }

        /* Đã duyệt nhưng chưa giao việc sang hệ thống nguồn */
        if (canPushToSource(k) && (supervise || isGovernance)) {
          out.push({
            id: `kppn-push-${k.id}`,
            module: "khac-phuc",
            type: "Chưa giao việc",
            urgency: "now",
            role: supervise ? "Tôi giám sát" : "Tôi sở hữu",
            code: k.code,
            title: `${k.code} chưa được giao sang ${k.executionSystem}`,
            description:
              "Hành động đã phê duyệt nhưng người thực hiện chưa nhận được việc trên hệ thống nguồn",
            dueDate: k.dueDate,
            lateDays: 0,
            href: `/khac-phuc/kppn/${k.code}`,
            weight: URGENCY_WEIGHT.now + 300,
            kppn: k,
            canPush: true,
          });
        }
      });

    /* ---------------- Phân hệ Khắc phục: điểm yếu ------------------ */

    deficiencies
      .filter((d) => d.status !== STATUS_CLOSED)
      .forEach((d) => {
        if (d.ownerId !== meId && !isGovernance) return;
        const role: MyRole = d.ownerId === meId ? "Tôi sở hữu" : "Tôi sở hữu";
        const kppnCount = kppns.filter((k) => k.deficiencyId === d.id).length;

        if (isDeficiencyOverdue(d)) {
          const late = Math.abs(deficiencyDaysToDue(d) ?? 0);
          out.push({
            id: `def-late-${d.id}`,
            module: "khac-phuc",
            type: "Điểm yếu quá hạn",
            urgency: "overdue",
            role,
            code: d.code,
            title: `${d.code} quá hạn khắc phục ${late} ngày`,
            description: `${d.name} - mức ${d.severity}, đang có ${kppnCount} hành động khắc phục`,
            dueDate: d.dueDate,
            lateDays: late,
            href: `/khac-phuc/diem-yeu/${d.code}`,
            weight: URGENCY_WEIGHT.overdue + late,
          });
        } else if (isDeficiencyDueSoon(d)) {
          out.push({
            id: `def-soon-${d.id}`,
            module: "khac-phuc",
            type: "Điểm yếu sắp đến hạn",
            urgency: "soon",
            role,
            code: d.code,
            title: `${d.code} còn ${deficiencyDaysToDue(d)} ngày`,
            description: `${d.name} - mức ${d.severity}`,
            dueDate: d.dueDate,
            lateDays: 0,
            href: `/khac-phuc/diem-yeu/${d.code}`,
            weight: URGENCY_WEIGHT.soon + 100,
          });
        }

        if (isDeficiencyMissingRootCause(d)) {
          out.push({
            id: `def-rc-${d.id}`,
            module: "khac-phuc",
            type: "Thiếu nguyên nhân gốc",
            urgency: "now",
            role,
            code: d.code,
            title: `${d.code} chưa phân tích nguyên nhân gốc`,
            description: `Điểm yếu mức ${d.severity} bắt buộc có nguyên nhân gốc trước khi lập KPPN`,
            dueDate: d.dueDate,
            lateDays: 0,
            href: `/khac-phuc/diem-yeu/${d.code}`,
            weight: URGENCY_WEIGHT.now + 200,
          });
        }

        if (
          kppnCount === 0 &&
          (d.severity === "Cao" || d.severity === "Trọng yếu")
        ) {
          out.push({
            id: `def-nokppn-${d.id}`,
            module: "khac-phuc",
            type: "Chưa lập hành động",
            urgency: "now",
            role,
            code: d.code,
            title: `${d.code} chưa có hành động khắc phục`,
            description: `Điểm yếu mức ${d.severity} bắt buộc phải có hành động khắc phục và phòng ngừa`,
            dueDate: d.dueDate,
            lateDays: 0,
            href: `/khac-phuc/diem-yeu/${d.code}`,
            weight: URGENCY_WEIGHT.now + 150,
          });
        }
      });

    /* ---------------------- Phân hệ Sự kiện ------------------------ */

    events
      .filter((e) => !isEventClosed(e) && canViewEvent(e, viewer))
      .forEach((e) => {
        const handle = e.handlerId === meId;
        const report = e.reporterId === meId;
        if (!handle && !report && !isGovernance) return;

        /* Sự kiện mới chờ Ban QTRR tiếp nhận */
        if (e.status === STATUS_EVENT_NEW && isGovernance) {
          out.push({
            id: `evt-new-${e.id}`,
            module: "su-kien",
            type: "Chờ tiếp nhận xác minh",
            urgency: "now",
            role: "Tôi sở hữu",
            code: e.code,
            title: `${e.code} chờ tiếp nhận xác minh`,
            description: `${e.name} - đã mở ${eventAging(e)} ngày kể từ khi phát hiện`,
            dueDate: e.detectedDate,
            lateDays: 0,
            href: `/su-kien/so-theo-doi/${e.code}`,
            weight: URGENCY_WEIGHT.now + 400,
          });
        }

        if (handle) {
          if (isMissingRiskLink(e))
            out.push({
              id: `evt-risk-${e.id}`,
              module: "su-kien",
              type: "Thiếu liên kết rủi ro",
              urgency: "now",
              role: "Tôi sở hữu",
              code: e.code,
              title: `${e.code} chưa liên kết rủi ro`,
              description: `Sự kiện mức ${e.severity} bắt buộc liên kết ngược về rủi ro trước khi đóng`,
              dueDate: "",
              lateDays: 0,
              href: `/su-kien/so-theo-doi/${e.code}`,
              weight: URGENCY_WEIGHT.now + 350,
            });

          if (isEventMissingRootCause(e))
            out.push({
              id: `evt-rc-${e.id}`,
              module: "su-kien",
              type: "Thiếu nguyên nhân gốc",
              urgency: "now",
              role: "Tôi sở hữu",
              code: e.code,
              title: `${e.code} chưa phân tích nguyên nhân gốc`,
              description: "Điều kiện bắt buộc để đóng sự kiện",
              dueDate: "",
              lateDays: 0,
              href: `/su-kien/so-theo-doi/${e.code}`,
              weight: URGENCY_WEIGHT.now + 250,
            });

          if (!e.lessonLearned.trim())
            out.push({
              id: `evt-lesson-${e.id}`,
              module: "su-kien",
              type: "Thiếu bài học kinh nghiệm",
              urgency: "watch",
              role: "Tôi sở hữu",
              code: e.code,
              title: `${e.code} chưa ghi bài học kinh nghiệm`,
              description:
                "Đây là giá trị lớn nhất của việc ghi nhận sự kiện, nên bổ sung trước khi đóng",
              dueDate: "",
              lateDays: 0,
              href: `/su-kien/so-theo-doi/${e.code}`,
              weight: URGENCY_WEIGHT.watch + 100,
            });

          if (isStaleEvent(e))
            out.push({
              id: `evt-stale-${e.id}`,
              module: "su-kien",
              type: "Sự kiện mở quá lâu",
              urgency: "overdue",
              role: "Tôi sở hữu",
              code: e.code,
              title: `${e.code} đã mở ${eventAging(e)} ngày`,
              description:
                "Vượt ngưỡng 60 ngày. Nên rà soát tiến độ xử lý hoặc đóng nếu đã xử lý xong",
              dueDate: "",
              lateDays: eventAging(e) - 60,
              href: `/su-kien/so-theo-doi/${e.code}`,
              weight: URGENCY_WEIGHT.overdue + eventAging(e),
            });
        }

        if (report && isMissingHandler(e))
          out.push({
            id: `evt-handler-${e.id}`,
            module: "su-kien",
            type: "Chưa có người xử lý",
            urgency: "soon",
            role: "Tôi báo cáo",
            code: e.code,
            title: `${e.code} chưa được phân công người xử lý`,
            description: `Sự kiện bạn báo cáo đã mở ${eventAging(e)} ngày mà chưa có ai tiếp nhận`,
            dueDate: "",
            lateDays: 0,
            href: `/su-kien/so-theo-doi/${e.code}`,
            weight: URGENCY_WEIGHT.soon + 50,
          });

        if (report && isSlowDetection(e) && e.status === STATUS_EVENT_NEW)
          out.push({
            id: `evt-slow-${e.id}`,
            module: "su-kien",
            type: "Bổ sung lý do phát hiện chậm",
            urgency: "watch",
            role: "Tôi báo cáo",
            code: e.code,
            title: `${e.code} phát hiện chậm ${detectionLag(e)} ngày`,
            description:
              "Nên bổ sung lý do phát hiện muộn vào phần diễn biến để Ban QTRR rà soát cơ chế giám sát",
            dueDate: "",
            lateDays: 0,
            href: `/su-kien/so-theo-doi/${e.code}`,
            weight: URGENCY_WEIGHT.watch + 50,
          });
      });

    /* ---------------------- Phân hệ Rủi ro ------------------------- */

    risks
      .filter((r) => r.status !== STATUS_CLOSED)
      .forEach((r) => {
        if (r.ownerId !== meId && !isGovernance) return;
        const level = residualLevelOf(r);
        const high = level === "Cao" || level === "Trọng yếu";
        const covered = controls.some((c) => c.riskIds.includes(r.id));

        if (high && !covered)
          out.push({
            id: `risk-nocontrol-${r.id}`,
            module: "rui-ro",
            type: "Rủi ro chưa có kiểm soát",
            urgency: "now",
            role: "Tôi sở hữu",
            code: r.code,
            title: `${r.code} chưa có kiểm soát nào phủ`,
            description: `${r.name} - mức còn lại ${level} ( ${residualScoreOf(r)} điểm), đang bằng đúng mức cố hữu`,
            dueDate: "",
            lateDays: 0,
            href: `/rui-ro/so-dang-ky/${r.code}`,
            weight: URGENCY_WEIGHT.now + residualScoreOf(r),
          });

        if (r.isZeroTolerance && high)
          out.push({
            id: `risk-kkn-${r.id}`,
            module: "rui-ro",
            type: "Rủi ro không khẩu vị vượt ngưỡng",
            urgency: "overdue",
            role: "Tôi sở hữu",
            code: r.code,
            title: `${r.code} vượt khẩu vị rủi ro`,
            description: `Rủi ro không khẩu vị nhưng mức còn lại đang ở ${level}, cần bổ sung biện pháp giảm thiểu ngay`,
            dueDate: "",
            lateDays: 0,
            href: `/rui-ro/so-dang-ky/${r.code}`,
            weight: URGENCY_WEIGHT.overdue + residualScoreOf(r),
          });
      });

    /* --------------------- Phân hệ Kiểm soát ----------------------- */

    controls
      .filter((c) => c.status === CONTROL_ACTIVE)
      .forEach((c) => {
        if (c.ownerId !== meId && !isGovernance) return;

        if (!c.lastTestResult)
          out.push({
            id: `ctrl-notest-${c.id}`,
            module: "kiem-soat",
            type: "Kiểm soát chưa từng kiểm tra",
            urgency: c.isKeyControl ? "now" : "watch",
            role: "Tôi sở hữu",
            code: c.code,
            title: `${c.code} chưa từng được kiểm tra hiệu lực`,
            description: `${c.name}${c.isKeyControl ? " - đây là kiểm soát trọng yếu" : ""}`,
            dueDate: "",
            lateDays: 0,
            href: `/kiem-soat/so-dang-ky/${c.code}`,
            weight: c.isKeyControl
              ? URGENCY_WEIGHT.now + 100
              : URGENCY_WEIGHT.watch + 30,
          });

        if (c.lastTestResult === TEST_RESULT_FAILED)
          out.push({
            id: `ctrl-failed-${c.id}`,
            module: "kiem-soat",
            type: "Kiểm soát không hiệu quả",
            urgency: "now",
            role: "Tôi sở hữu",
            code: c.code,
            title: `${c.code} có kết quả kiểm tra không hiệu quả`,
            description: `${c.name} - cần lập điểm yếu và hành động khắc phục`,
            dueDate: "",
            lateDays: 0,
            href: `/kiem-soat/so-dang-ky/${c.code}`,
            weight: URGENCY_WEIGHT.now + 320,
          });
      });

    /* Đợt kiểm tra kết luận không hiệu quả nhưng chưa lập điểm yếu */
    tests
      .filter((x) => x.result === TEST_RESULT_FAILED && !x.deficiencyId)
      .forEach((x) => {
        if (x.testerId !== meId && !isGovernance) return;
        const c = controls.find((y) => y.id === x.controlId);
        out.push({
          id: `test-nodef-${x.id}`,
          module: "kiem-soat",
          type: "Chưa lập điểm yếu từ kết quả kiểm tra",
          urgency: "now",
          role: x.testerId === meId ? "Tôi thực hiện" : "Tôi sở hữu",
          code: x.code,
          title: `${x.code} kết luận không hiệu quả nhưng chưa lập điểm yếu`,
          description: `${c?.name ?? "Kiểm soát không xác định"} - kiểm tra ngày ${formatDate(x.testDate)}`,
          dueDate: x.testDate,
          lateDays: 0,
          href: "/kiem-soat/ket-qua-kiem-tra",
          weight: URGENCY_WEIGHT.now + 280,
        });
      });

    return out.sort((a, b) => b.weight - a.weight);
  }, [
    kppns,
    deficiencies,
    events,
    risks,
    controls,
    tests,
    meId,
    isGovernance,
    viewer,
  ]);

  /* ------------------------ Tách hoãn nhắc ------------------------ */

  const activeTasks = useMemo(
    () => allTasks.filter((x) => !isSnoozed(x.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, snoozed, today],
  );

  const snoozedTasks = useMemo(
    () => allTasks.filter((x) => isSnoozed(x.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, snoozed, today],
  );

  /* ---------------------------- Bộ lọc ---------------------------- */

  const [tab, setTab] = useState<"active" | "snoozed">("active");
  const [view, setView] = useState<"list" | "group">("list");
  const [urgencies, setUrgencies] = useState<Urgency[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  const [progressing, setProgressing] = useState<Kppn | null>(null);
  const [busy, setBusy] = useState(false);

  const typeOptions = useMemo(
    () =>
      [...new Set(allTasks.map((x) => x.type))]
        .sort()
        .map((v) => ({ value: v, label: v })),
    [allTasks],
  );

  const roleOptions = useMemo(
    () =>
      [...new Set(allTasks.map((x) => x.role))]
        .sort()
        .map((v) => ({ value: v, label: v })),
    [allTasks],
  );

  const moduleOptions = (Object.keys(MODULE_META) as ModuleKey[]).map((k) => ({
    value: k,
    label: MODULE_META[k].label,
  }));

  const source = tab === "active" ? activeTasks : snoozedTasks;

  const t = useTableState<TaskItem>(source, {
    getKey: (x) => x.id,
    searchText: (x) => `${x.code} ${x.title} ${x.description} ${x.type}`,
    filter: (x) => {
      if (urgencies.length > 0 && !urgencies.includes(x.urgency)) return false;
      if (modules.length > 0 && !modules.includes(x.module)) return false;
      if (types.length > 0 && !types.includes(x.type)) return false;
      if (roles.length > 0 && !roles.includes(x.role)) return false;
      return true;
    },
    sortValue: (x, key) => {
      switch (key) {
        case "title":
          return x.title;
        case "module":
          return MODULE_META[x.module].label;
        case "type":
          return x.type;
        case "role":
          return x.role;
        case "due":
          return x.dueDate || "9999-12-31";
        case "urgency":
          return URGENCY_WEIGHT[x.urgency] + x.lateDays;
        default:
          return null;
      }
    },
    defaultSort: { key: "urgency", dir: "desc" },
    pageSize: 20,
    filterDeps: [tab, urgencies, modules, types, roles],
  });

  /* --------------------------- Thống kê --------------------------- */

  const stat = useMemo(() => {
    const out: Record<Urgency, number> = {
      overdue: 0,
      now: 0,
      soon: 0,
      watch: 0,
    };
    activeTasks.forEach((x) => {
      out[x.urgency] += 1;
    });
    return out;
  }, [activeTasks]);

  const byModule = useMemo(() => {
    const out = new Map<ModuleKey, TaskItem[]>();
    t.rows.forEach((x) => {
      const list = out.get(x.module) ?? [];
      list.push(x);
      out.set(x.module, list);
    });
    return out;
  }, [t.rows]);

  const filterCount =
    urgencies.length + modules.length + types.length + roles.length;

  function resetFilter() {
    setUrgencies([]);
    setModules([]);
    setTypes([]);
    setRoles([]);
  }

  function toggleUrgency(u: Urgency) {
    setUrgencies((prev) =>
      prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u],
    );
  }

  /* --------------------------- Hành động -------------------------- */

  function snooze(x: TaskItem, days = 7) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setSnoozed((prev) => ({ ...prev, [x.id]: toInputDate(d) }));
    toast.info(
      "Đã hoãn nhắc",
      `${x.code} sẽ không xuất hiện trong danh sách chính tới ${formatDate(toInputDate(d))}.`,
    );
  }

  function unsnooze(x: TaskItem) {
    setSnoozed((prev) => {
      const out = { ...prev };
      delete out[x.id];
      return out;
    });
    toast.success("Đã bỏ hoãn", `${x.code} quay lại danh sách việc cần xử lý.`);
  }

  async function pushOne(x: TaskItem) {
    if (!x.kppn) return;
    setBusy(true);
    const res = await pushKppnToSource(x.kppn.id);
    setBusy(false);
    if (res.ok) toast.success(res.message, res.details.join(" | "));
    else toast.error("Không giao việc được", res.message);
  }

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<TaskItem>[] = [
    {
      key: "urgency",
      header: "Mức khẩn",
      width: 150,
      sortable: true,
      render: (x) => {
        const m = URGENCY_META[x.urgency];
        return (
          <Tooltip content={m.note}>
            <span className="flex flex-col gap-0.5">
              <Badge tone={m.tone} size="sm" dot>
                {m.label}
              </Badge>
              {x.lateDays > 0 && (
                <span className="text-[11px] font-medium text-danger">
                  Trễ {x.lateDays} ngày
                </span>
              )}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "title",
      header: "Việc cần làm",
      minWidth: 380,
      sortable: true,
      render: (x) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{x.title}</span>
            </span>
          }
          sub={x.description}
        />
      ),
    },
    {
      key: "module",
      header: "Phân hệ",
      width: 150,
      sortable: true,
      render: (x) => {
        const m = MODULE_META[x.module];
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-ctrl px-2 py-1 text-[12px] font-medium",
              m.tone,
            )}
          >
            {m.icon}
            {m.label}
          </span>
        );
      },
    },
    {
      key: "type",
      header: "Loại việc",
      width: 210,
      sortable: true,
      render: (x) => (
        <span className="text-[12px] text-text-secondary">{x.type}</span>
      ),
    },
    {
      key: "role",
      header: "Vai trò của tôi",
      width: 145,
      sortable: true,
      render: (x) => (
        <Badge tone="neutral" size="sm">
          {x.role}
        </Badge>
      ),
    },
    {
      key: "due",
      header: "Hạn liên quan",
      width: 135,
      sortable: true,
      render: (x) =>
        x.dueDate ? (
          <span className={cn(x.lateDays > 0 && "font-medium text-danger")}>
            {formatDate(x.dueDate)}
          </span>
        ) : (
          <span className="text-text-hint">--</span>
        ),
    },
    {
      key: "actions",
      header: "",
      width: 150,
      align: "right",
      render: (x) => (
        <RowActions>
          <Tooltip content="Mở màn hình xử lý">
            <IconButton label="Xử lý" onClick={() => router.push(x.href)}>
              <IconArrowRight size={16} className="text-brand" />
            </IconButton>
          </Tooltip>

          {x.kppn && x.role === "Tôi thực hiện" && !x.kppn.externalTaskCode && (
            <Tooltip content="Cập nhật nhanh tiến độ">
              <IconButton
                label="Cập nhật tiến độ"
                onClick={() => setProgressing(x.kppn ?? null)}
              >
                <IconRefresh size={16} />
              </IconButton>
            </Tooltip>
          )}

          {x.canPush && (
            <Tooltip content={`Giao việc sang ${x.kppn?.executionSystem}`}>
              <IconButton
                label="Giao việc"
                disabled={busy}
                onClick={() => pushOne(x)}
              >
                <IconClipboardCheck size={16} className="text-brand" />
              </IconButton>
            </Tooltip>
          )}

          {tab === "active" ? (
            <Tooltip content="Hoãn nhắc 7 ngày">
              <IconButton label="Hoãn nhắc" onClick={() => snooze(x)}>
                <IconBellOff size={16} />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip content="Bỏ hoãn, đưa lại danh sách chính">
              <IconButton label="Bỏ hoãn" onClick={() => unsnooze(x)}>
                <IconBell size={16} className="text-brand" />
              </IconButton>
            </Tooltip>
          )}
        </RowActions>
      ),
    },
  ];

  /* ------------------------------ Render -------------------------- */

  if (!me) {
    return (
      <PageContainer>
        <PageHeader title="Việc cần xử lý" />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconUserExclamation size={24} />}
              title="Tài khoản chưa gắn hồ sơ nhân sự"
              description="Hệ thống không xác định được bản ghi nào gắn với bạn nên chưa dựng được hộp thư việc. Liên hệ Quản trị hệ thống để gắn hồ sơ nhân sự."
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Việc cần xử lý"
        subtitle={`${me.name} - tổng hợp việc từ cả 4 phân hệ, sắp theo mức khẩn`}
        showBreadcrumb={false}
        badge={
          isGovernance ? (
            <Tooltip content="Vai trò quản trị nhìn thấy cả việc điều phối chung của Ban QTRR">
              <Badge tone="brand" dot>
                Gồm việc điều phối chung
              </Badge>
            </Tooltip>
          ) : undefined
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
              icon={<IconEye size={16} />}
              onClick={() => router.push("/")}
            >
              Về trang chủ
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* ---------------- 4 thẻ mức khẩn ---------------- */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {URGENCY_ORDER.map((u) => (
              <UrgencyCard
                key={u}
                urgency={u}
                value={stat[u]}
                active={urgencies.includes(u)}
                onClick={() => toggleUrgency(u)}
              />
            ))}
          </div>

          {/* ---------------- Dải tổng hợp ---------------- */}
          {stat.overdue + stat.now === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-low-border bg-lv-low-bg/50 px-3 py-2.5 text-[12px] leading-4 text-lv-low-text">
              <IconCircleCheck size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Không còn việc quá hạn hay việc chặn quy trình. Các mục còn lại
                chỉ ở mức sắp đến hạn và theo dõi, anh có thể xử lý theo kế
                hoạch.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-critical-border bg-lv-critical-bg px-3 py-2.5 text-[12px] leading-4 text-lv-critical-text">
              <IconClockExclamation size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Đang có <b>{stat.overdue}</b> việc quá hạn và <b>{stat.now}</b>{" "}
                việc đang chặn bước tiếp theo của quy trình. Nên xử lý dứt điểm
                nhóm này trước khi làm các việc còn lại.
              </span>
              <Button
                variant="secondary"
                size="sm"
                compact
                onClick={() => setUrgencies(["overdue", "now"])}
              >
                Lọc ngay
              </Button>
            </div>
          )}

          {/* ---------------- Khối chính ---------------- */}
          <ContentCard padded={false} className="overflow-hidden">
            <div className="px-3">
              <Tabs
                value={tab}
                onChange={(k) => setTab(k as "active" | "snoozed")}
                items={[
                  {
                    key: "active",
                    label: "Cần xử lý",
                    count: activeTasks.length,
                  },
                  {
                    key: "snoozed",
                    label: "Đã hoãn nhắc",
                    count: snoozedTasks.length,
                  },
                ]}
              />
            </div>

            <TableToolbar
              left={
                <>
                  <Segments
                    items={[
                      { key: "list", label: "Danh sách" },
                      { key: "group", label: "Theo phân hệ" },
                    ]}
                    value={view}
                    onChange={(k) => setView(k as "list" | "group")}
                  />
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, nội dung việc"
                    width={280}
                  />
                </>
              }
              right={
                <>
                  <FilterCombobox
                    label="Phân hệ:"
                    multiple
                    options={moduleOptions}
                    value={modules}
                    onChange={setModules}
                    width={200}
                  />
                  <FilterCombobox
                    label="Loại việc:"
                    multiple
                    options={typeOptions}
                    value={types}
                    onChange={setTypes}
                    searchable
                    width={230}
                  />
                  <FilterCombobox
                    label="Vai trò:"
                    multiple
                    options={roleOptions}
                    value={roles}
                    onChange={setRoles}
                    width={200}
                  />
                  {filterCount > 0 && (
                    <Button
                      variant="text"
                      size="sm"
                      compact
                      onClick={resetFilter}
                    >
                      Xoá lọc ({filterCount})
                    </Button>
                  )}
                </>
              }
            />

            {source.length === 0 ? (
              <EmptyState
                icon={<IconCircleCheck size={24} />}
                title={
                  tab === "active"
                    ? "Không có việc nào cần bạn xử lý"
                    : "Chưa hoãn nhắc việc nào"
                }
                description={
                  tab === "active"
                    ? "Toàn bộ rủi ro, kiểm soát, sự kiện và hành động khắc phục liên quan tới bạn đang bám sát kế hoạch."
                    : "Khi hoãn nhắc một việc, việc đó sẽ chuyển sang tab này cho tới ngày nhắc lại."
                }
              />
            ) : view === "list" ? (
              <>
                <DataTable
                  columns={columns}
                  rows={t.pageRows}
                  getKey={(x) => x.id}
                  sort={t.sort}
                  onSort={t.toggleSort}
                  onRowClick={(x) => router.push(x.href)}
                  stickyLast
                  emptyTitle="Không có việc phù hợp"
                  emptyDescription="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá tìm kiếm."
                  rowClassName={(x) =>
                    x.urgency === "overdue" ? "!bg-lv-critical-bg" : undefined
                  }
                />
                <Pagination
                  page={t.page}
                  pageCount={t.pageCount}
                  pageSize={t.pageSize}
                  total={t.total}
                  onPageChange={t.setPage}
                  onPageSizeChange={t.setPageSize}
                />
              </>
            ) : (
              <GroupView
                groups={byModule}
                onOpen={(x) => router.push(x.href)}
              />
            )}
          </ContentCard>

          {/* ---------------- Giải thích cách xếp thứ tự ---------------- */}
          <div className="flex gap-2 rounded-card border border-lv-info-border bg-lv-info-bg px-3 py-2.5 text-[12px] leading-4 text-lv-info-text">
            <IconRadar size={16} className="mt-px shrink-0" />
            <span>
              Danh sách sắp theo <b>mức khẩn</b> rồi tới <b>số ngày trễ</b>.
              Việc ở nhóm <b>Cần làm ngay</b> tuy chưa quá hạn nhưng đang chặn
              bước tiếp theo của quy trình, ví dụ điểm yếu thiếu nguyên nhân gốc
              thì không lập được KPPN, nên được xếp trên việc sắp đến hạn.
            </span>
          </div>
        </div>
      </PageBody>

      {/* -------------------------- Hộp thoại ------------------------ */}
      <ProgressModal
        kppn={progressing}
        onClose={() => setProgressing(null)}
        onDone={(msg, detail) => {
          setProgressing(null);
          toast.success(msg, detail);
        }}
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Thẻ mức khẩn                                        */
/* ================================================================== */

function UrgencyCard({
  urgency,
  value,
  active,
  onClick,
}: {
  urgency: Urgency;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  const m = URGENCY_META[urgency];
  const style: Record<string, string> = {
    danger: "bg-lv-critical-bg text-lv-critical-text",
    high: "bg-lv-high-bg text-lv-high-text",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    neutral: "bg-lv-neutral-bg text-lv-neutral-text",
  };
  const ring: Record<string, string> = {
    danger: "ring-lv-critical-text",
    high: "ring-lv-high-text",
    warning: "ring-lv-medium-text",
    neutral: "ring-lv-neutral-text",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={m.note}
      className={cn(
        "misa-card flex items-start gap-3 p-4 text-left transition-all",
        value === 0 && !active && "opacity-60",
        active && "ring-2 ring-offset-1",
        active && ring[m.tone],
        "hover:brightness-[0.99]",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
          style[m.tone],
        )}
      >
        {m.icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-text-secondary">{m.label}</p>
        <p className="text-[22px] leading-7 font-semibold text-text-primary">
          {value}
        </p>
        <p className="truncate text-[11px] text-text-hint">{m.note}</p>
      </div>
    </button>
  );
}

/* ================================================================== */
/* Chế độ nhóm theo phân hệ                                        */
/* ================================================================== */

function GroupView({
  groups,
  onOpen,
}: {
  groups: Map<ModuleKey, TaskItem[]>;
  onOpen: (x: TaskItem) => void;
}) {
  const keys = (Object.keys(MODULE_META) as ModuleKey[]).filter(
    (k) => (groups.get(k)?.length ?? 0) > 0,
  );

  if (keys.length === 0) {
    return (
      <EmptyState
        icon={<IconCircleCheck size={24} />}
        title="Không có việc phù hợp"
        description="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá tìm kiếm."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {keys.map((k) => {
        const m = MODULE_META[k];
        const list = groups.get(k) ?? [];
        const overdue = list.filter((x) => x.urgency === "overdue").length;

        return (
          <section
            key={k}
            className="overflow-hidden rounded-card border border-border-light"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-border-light bg-surface-alt px-3 py-2">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-ctrl",
                  m.tone,
                )}
              >
                {m.icon}
              </span>
              <p className="text-[13px] font-semibold text-text-primary">
                {m.label}
              </p>
              <span className="rounded-badge bg-white px-1.5 text-[11px] font-medium text-text-secondary">
                {list.length} việc
              </span>
              {overdue > 0 && (
                <Badge tone="danger" size="sm" dot>
                  {overdue} quá hạn
                </Badge>
              )}
            </div>

            <ul className="flex flex-col">
              {list.map((x) => {
                const u = URGENCY_META[x.urgency];
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(x)}
                      className="flex w-full items-center gap-3 border-b border-border-light px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[#FAFAFA]"
                    >
                      <Badge tone={u.tone} size="sm" dot>
                        {u.label}
                      </Badge>
                      <span className="w-[120px] shrink-0 truncate text-[12px] font-medium text-brand">
                        {x.code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text-primary">
                          {x.title}
                        </span>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {x.description}
                        </span>
                      </span>
                      {x.dueDate && (
                        <span
                          className={cn(
                            "w-[100px] shrink-0 text-right text-[12px]",
                            x.lateDays > 0
                              ? "font-medium text-danger"
                              : "text-text-secondary",
                          )}
                        >
                          {formatDate(x.dueDate)}
                        </span>
                      )}
                      <IconArrowRight
                        size={16}
                        className="shrink-0 text-icon-neutral"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Hộp thoại cập nhật nhanh tiến độ                                    */
/* ================================================================== */

function ProgressModal({
  kppn,
  onClose,
  onDone,
}: {
  kppn: Kppn | null;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [value, setValue] = useState(0);
  const [lastKey, setLastKey] = useState("");

  const key = kppn?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    setValue(kppn?.progress ?? 0);
  }

  if (!kppn) return null;

  const expect = expectedProgress(kppn);
  const willFinish = value >= 100;

  function submit() {
    if (!kppn) return;

    const patch: Partial<Kppn> = { progress: value };

    /* Báo hoàn tất thì chuyển sang chờ nghiệm thu, quyền đóng vẫn thuộc
       người giám sát trong GRC, không tự đặt Hoàn thành */
    if (willFinish && kppn.status === STATUS_KPPN_RUNNING)
      patch.status = STATUS_KPPN_ACCEPTANCE;

    kppnRepo.update(kppn.id, patch);

    onDone(
      `Đã cập nhật ${kppn.code}`,
      willFinish
        ? "Tiến độ đạt 100%, hành động chuyển sang Chờ nghiệm thu để người giám sát xác nhận."
        : `Tiến độ chuyển từ ${kppn.progress}% sang ${value}%.`,
    );
  }

  return (
    <Modal
      open={!!kppn}
      onClose={onClose}
      size="sm"
      title="Cập nhật tiến độ nhanh"
      description={`${kppn.code} - ${kppn.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={submit}>
            Cập nhật
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt p-2.5 text-[12px] text-text-secondary">
          <StatusBadge status={kppn.status} />
          <span>
            Hạn:{" "}
            <b
              className={cn(
                isKppnOverdue(kppn) ? "text-danger" : "text-text-primary",
              )}
            >
              {formatDate(kppn.dueDate)}
            </b>
          </span>
          <span>
            Kỳ vọng theo thời gian:{" "}
            <b className="text-text-primary">{expect}%</b>
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-text-primary">
            Tiến độ thực hiện
          </span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="h-1.5 min-w-[180px] flex-1 cursor-pointer appearance-none rounded-full bg-[#F0F0F0] accent-[#245FDF]"
            />
            <span className="w-[52px] shrink-0 text-right text-[16px] font-semibold text-text-primary">
              {value}%
            </span>
          </div>
          {expect - value >= 20 && (
            <p className="flex items-center gap-1.5 text-[12px] text-lv-medium-text">
              <IconTrendingDown size={14} />
              Vẫn chậm {expect - value} điểm so với kỳ vọng theo thời gian.
            </p>
          )}
        </div>

        {willFinish && (
          <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
            <IconCircleCheck size={15} className="mt-px shrink-0" />
            <span>
              Đạt 100% nghĩa là báo hoàn tất. Hành động sẽ chuyển sang{" "}
              <b>Chờ nghiệm thu</b>, người giám sát mới là người xác nhận
              <b> Hoàn thành</b> kèm kết quả và bằng chứng.
            </span>
          </div>
        )}

        {kppn.externalTaskCode && (
          <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
            <IconAlertTriangle size={15} className="mt-px shrink-0" />
            <span>
              Hành động đã có mã việc <b>{kppn.externalTaskCode}</b> trên{" "}
              {kppn.executionSystem}. Nên cập nhật ở hệ thống nguồn để hai bên
              không lệch số liệu.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
