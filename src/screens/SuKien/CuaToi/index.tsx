"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconClipboardList,
  IconEdit,
  IconEye,
  IconHourglass,
  IconPlus,
  IconRadar,
  IconTool,
  IconUserExclamation,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  CodeCell,
  DataTable,
  EmptyState,
  FilterCombobox,
  IconButton,
  Pagination,
  RiskBadge,
  RowActions,
  SearchInput,
  StatusBadge,
  TableToolbar,
  Tabs,
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
import { eventRepo, kppnRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { EVENT_STATUSES } from "@/lib/domain/enums";
import {
  EVENT_STATUS_ORDER,
  SEVERITY_ORDER,
  detectionLag,
  eventAging,
  eventSearchText,
  isEventClosed,
  isEventEditable,
  isMissingHandler,
  isMissingKppn,
  isMissingRiskLink,
  isMissingRootCause,
  isSlowDetection,
  isStaleEvent,
  netLoss,
} from "@/lib/domain/event-utils";
import type { GrcEvent } from "@/lib/domain/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

const STATUS_OPTIONS = EVENT_STATUSES.map((s) => ({ value: s, label: s }));

type TabKey = "todo" | "reported" | "handling" | "closed";

/* ================================================================== */
/* Việc cần làm của từng sự kiện                                       */
/* ================================================================== */

interface Todo {
  label: string;
  tone: "danger" | "warning";
  hint: string;
}

function todosOf(e: GrcEvent, kppnCount: number): Todo[] {
  const out: Todo[] = [];

  if (isMissingHandler(e))
    out.push({
      label: "Phân công người xử lý",
      tone: "danger",
      hint: "Bắt buộc trước khi chuyển sang giai đoạn điều tra",
    });

  if (isMissingRiskLink(e))
    out.push({
      label: "Liên kết rủi ro",
      tone: "danger",
      hint: `Sự kiện mức ${e.severity} bắt buộc liên kết rủi ro trước khi đóng`,
    });

  if (isMissingRootCause(e))
    out.push({
      label: "Phân tích nguyên nhân gốc",
      tone: "warning",
      hint: "Điều kiện bắt buộc để đóng sự kiện",
    });

  if (isMissingKppn(e, kppnCount))
    out.push({
      label: "Lập hành động KPPN",
      tone: "warning",
      hint: "Sự kiện mức Cao trở lên nên có hành động khắc phục",
    });

  if (!e.lessonLearned.trim() && !isEventClosed(e))
    out.push({
      label: "Ghi bài học kinh nghiệm",
      tone: "warning",
      hint: "Giá trị lớn nhất của việc ghi nhận sự kiện",
    });

  if (isStaleEvent(e))
    out.push({
      label: "Rà soát tiến độ",
      tone: "warning",
      hint: "Sự kiện đã mở quá 60 ngày mà chưa đóng",
    });

  return out;
}

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function SuKienCuaToiScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();

  const events = useCollection(eventRepo);
  const kppns = useCollection(kppnRepo);

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email],
  );
  const meId = currentEmployee?.id ?? "";

  /** Số hành động KPPN gắn với từng sự kiện */
  const kppnCountOf = useMemo(() => {
    const map = new Map<string, number>();
    kppns.forEach((k) => {
      if (!k.eventId) return;
      map.set(k.eventId, (map.get(k.eventId) ?? 0) + 1);
    });
    return map;
  }, [kppns]);

  /** Toàn bộ sự kiện có liên quan tới người đăng nhập */
  const mine = useMemo(
    () =>
      meId
        ? events.filter((e) => e.reporterId === meId || e.handlerId === meId)
        : [],
    [events, meId],
  );

  const isHandler = (e: GrcEvent) => e.handlerId === meId;
  const isReporter = (e: GrcEvent) => e.reporterId === meId;

  const todoCountOf = (e: GrcEvent) =>
    todosOf(e, kppnCountOf.get(e.id) ?? 0).length;

  /* ---------------------------- Bộ lọc ---------------------------- */

  const [tab, setTab] = useState<TabKey>("todo");
  const [statuses, setStatuses] = useState<string[]>([]);

  function matchTab(e: GrcEvent): boolean {
    switch (tab) {
      case "reported":
        return isReporter(e);
      case "handling":
        return isHandler(e) && !isEventClosed(e);
      case "closed":
        return isEventClosed(e);
      default:
        return !isEventClosed(e) && todoCountOf(e) > 0;
    }
  }

  const tabCounts = useMemo(
    () => ({
      todo: mine.filter((e) => !isEventClosed(e) && todoCountOf(e) > 0).length,
      reported: mine.filter((e) => isReporter(e)).length,
      handling: mine.filter((e) => isHandler(e) && !isEventClosed(e)).length,
      closed: mine.filter((e) => isEventClosed(e)).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, kppnCountOf, meId],
  );

  /* ------------------------- Chỉ số nhanh ------------------------- */

  const stat = useMemo(() => {
    const open = mine.filter((e) => !isEventClosed(e));
    return {
      total: mine.length,
      open: open.length,
      todo: open.reduce((s, e) => s + todoCountOf(e), 0),
      slow: mine.filter((e) => isSlowDetection(e)).length,
      loss: mine.reduce((s, e) => s + netLoss(e), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, kppnCountOf]);

  /* --------------------------- Table state ------------------------ */

  const t = useTableState<GrcEvent>(mine, {
    getKey: (e) => e.id,
    searchText: (e) =>
      eventSearchText(e, [
        lk.unitName(e.unitId, ""),
        lk.categoryName(e.categoryId, ""),
      ]),
    filter: (e) => {
      if (!matchTab(e)) return false;
      if (statuses.length > 0 && !statuses.includes(e.status)) return false;
      return true;
    },
    sortValue: (e, key) => {
      switch (key) {
        case "code":
          return e.code;
        case "name":
          return e.name;
        case "role":
          return isHandler(e) ? 1 : 2;
        case "occurred":
          return e.occurredDate;
        case "severity":
          return SEVERITY_ORDER[e.severity];
        case "todo":
          return todoCountOf(e);
        case "aging":
          return eventAging(e);
        case "status":
          return EVENT_STATUS_ORDER[e.status];
        default:
          return null;
      }
    },
    defaultSort: { key: "todo", dir: "desc" },
    pageSize: 20,
    filterDeps: [tab, statuses, meId],
  });

  /* --------------------------- Hành động -------------------------- */

  function goDetail(e: GrcEvent) {
    router.push(`/su-kien/so-theo-doi/${e.code}`);
  }

  function goEdit(e: GrcEvent) {
    if (!isEventEditable(e.status)) {
      toast.warning(
        "Không sửa được",
        `Sự kiện đang ở trạng thái ${e.status} nên bị khoá chỉnh sửa.`,
      );
      return;
    }
    router.push(`/su-kien/so-theo-doi/${e.code}/sua`);
  }

  /* --------------------------- Cột bảng --------------------------- */

  const columns: Column<GrcEvent>[] = [
    {
      key: "code",
      header: "Mã sự kiện",
      width: 140,
      sortable: true,
      render: (e) => <CodeCell code={e.code} onClick={() => goDetail(e)} />,
    },
    {
      key: "name",
      header: "Tên sự kiện",
      minWidth: 320,
      sortable: true,
      render: (e) => (
        <TitleCell
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{e.name}</span>
              {e.isNearMiss && (
                <Badge tone="info" size="sm">
                  Near miss
                </Badge>
              )}
              {isSlowDetection(e) && (
                <Tooltip
                  content={`Phát hiện sau ${detectionLag(e)} ngày, vượt ngưỡng 7 ngày`}
                >
                  <Badge tone="danger" size="sm">
                    Phát hiện chậm
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={`${lk.categoryName(e.categoryId)} - ${lk.unitName(e.unitId)}`}
        />
      ),
    },
    {
      key: "role",
      header: "Vai trò của tôi",
      width: 165,
      sortable: true,
      render: (e) => (
        <span className="flex flex-col gap-0.5">
          {isHandler(e) && (
            <Badge tone="brand" size="sm" dot>
              Tôi xử lý
            </Badge>
          )}
          {isReporter(e) && (
            <Badge tone="neutral" size="sm" dot>
              Tôi báo cáo
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "occurred",
      header: "Ngày xảy ra",
      width: 125,
      sortable: true,
      render: (e) => formatDate(e.occurredDate),
    },
    {
      key: "severity",
      header: "Mức độ",
      width: 130,
      sortable: true,
      render: (e) => <RiskBadge level={e.severity} />,
    },
    {
      key: "todo",
      header: "Việc cần làm",
      minWidth: 280,
      sortable: true,
      render: (e) => {
        const todos = todosOf(e, kppnCountOf.get(e.id) ?? 0);
        if (todos.length === 0)
          return (
            <span className="inline-flex items-center gap-1 text-[12px] text-lv-low-text">
              <IconCircleCheck size={14} />
              Hồ sơ đã đủ
            </span>
          );
        return (
          <span className="flex flex-wrap gap-1">
            {todos.slice(0, 3).map((x) => (
              <Tooltip key={x.label} content={x.hint}>
                <Badge tone={x.tone} size="sm">
                  {x.label}
                </Badge>
              </Tooltip>
            ))}
            {todos.length > 3 && (
              <Tooltip
                content={todos
                  .slice(3)
                  .map((x) => x.label)
                  .join(", ")}
              >
                <Badge tone="neutral" size="sm">
                  +{todos.length - 3}
                </Badge>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      key: "aging",
      header: "Số ngày mở",
      width: 120,
      align: "center",
      sortable: true,
      render: (e) => {
        if (isEventClosed(e)) return <span className="text-text-hint">--</span>;
        return (
          <span
            className={cn(
              "text-[13px]",
              isStaleEvent(e)
                ? "font-medium text-danger"
                : "text-text-secondary",
            )}
          >
            {eventAging(e)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 150,
      sortable: true,
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: "actions",
      header: "",
      width: 90,
      align: "right",
      render: (e) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => goDetail(e)}>
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          {isHandler(e) && isEventEditable(e.status) && (
            <Tooltip content="Bổ sung hồ sơ">
              <IconButton label="Bổ sung hồ sơ" onClick={() => goEdit(e)}>
                <IconEdit size={16} />
              </IconButton>
            </Tooltip>
          )}
        </RowActions>
      ),
    },
  ];

  /* ------------------------------ Render -------------------------- */

  if (!currentEmployee) {
    return (
      <PageContainer>
        <PageHeader title="Sự kiện của tôi" />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconUserExclamation size={24} />}
              title="Không tìm thấy hồ sơ nhân sự của tài khoản"
              description="Tài khoản đang đăng nhập chưa được gắn với nhân sự trong danh mục, nên hệ thống không xác định được sự kiện liên quan."
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Sự kiện của tôi"
        subtitle={`${currentEmployee.name} - gồm sự kiện tôi báo cáo và sự kiện tôi đang xử lý`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconBolt size={16} />}
              onClick={() => router.push("/su-kien/bao-cao-nhanh")}
            >
              Báo cáo nhanh
            </Button>
            <Button
              variant="primary"
              icon={<IconPlus size={16} />}
              onClick={() => router.push("/su-kien/so-theo-doi/them-moi")}
            >
              Ghi nhận sự kiện
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* -------------------- Thẻ chỉ số nhanh ------------------ */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <MiniCard
              icon={<IconClipboardList size={20} />}
              tone="brand"
              label="Sự kiện đang mở"
              value={stat.open}
              hint={`Tổng cộng ${stat.total} sự kiện liên quan tới tôi`}
            />
            <MiniCard
              icon={<IconAlertTriangle size={20} />}
              tone="warning"
              label="Việc cần làm"
              value={stat.todo}
              hint="Tổng số mục hồ sơ còn thiếu ở các sự kiện đang mở"
            />
            <MiniCard
              icon={<IconRadar size={20} />}
              tone="danger"
              label="Phát hiện chậm"
              value={stat.slow}
              hint="Sự kiện phát hiện sau hơn 7 ngày kể từ khi xảy ra"
            />
            <MiniCard
              icon={<IconHourglass size={20} />}
              tone="neutral"
              label="Tổn thất ròng"
              value={formatMoney(stat.loss) || "0"}
              hint="Tính trên toàn bộ sự kiện liên quan tới tôi, đơn vị VNĐ"
              isText
            />
          </div>

          {/* ------------------------ Khối chính -------------------- */}
          <ContentCard padded={false} className="overflow-hidden">
            <div className="px-3">
              <Tabs
                value={tab}
                onChange={(k) => setTab(k as TabKey)}
                items={[
                  {
                    key: "todo",
                    label: "Cần tôi bổ sung",
                    count: tabCounts.todo,
                  },
                  {
                    key: "handling",
                    label: "Tôi đang xử lý",
                    count: tabCounts.handling,
                  },
                  {
                    key: "reported",
                    label: "Tôi đã báo cáo",
                    count: tabCounts.reported,
                  },
                  {
                    key: "closed",
                    label: "Đã kết thúc",
                    count: tabCounts.closed,
                  },
                ]}
              />
            </div>

            <TableToolbar
              left={
                <>
                  <SearchInput
                    value={t.keyword}
                    onChange={t.setKeyword}
                    placeholder="Tìm theo mã, tên sự kiện"
                    width={300}
                  />
                  <FilterCombobox
                    label="Trạng thái:"
                    multiple
                    options={STATUS_OPTIONS}
                    value={statuses}
                    onChange={setStatuses}
                    width={215}
                  />
                </>
              }
              right={
                statuses.length > 0 ? (
                  <Button
                    variant="text"
                    size="sm"
                    compact
                    onClick={() => setStatuses([])}
                  >
                    Xoá lọc ({statuses.length})
                  </Button>
                ) : undefined
              }
            />

            {mine.length === 0 ? (
              <EmptyState
                icon={<IconBolt size={24} />}
                title="Chưa có sự kiện nào liên quan tới anh"
                description="Khi anh báo cáo một sự kiện hoặc được phân công xử lý, sự kiện sẽ xuất hiện tại đây."
                action={
                  <Button
                    variant="primary"
                    icon={<IconBolt size={16} />}
                    onClick={() => router.push("/su-kien/bao-cao-nhanh")}
                  >
                    Báo cáo nhanh sự kiện
                  </Button>
                }
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={t.pageRows}
                  getKey={(e) => e.id}
                  sort={t.sort}
                  onSort={t.toggleSort}
                  onRowClick={goDetail}
                  stickyLast
                  emptyTitle={
                    tab === "todo"
                      ? "Không còn việc cần bổ sung"
                      : "Không có sự kiện phù hợp"
                  }
                  emptyDescription={
                    tab === "todo"
                      ? "Toàn bộ sự kiện đang mở của anh đã đủ hồ sơ. Anh có thể chuyển sang tab khác để xem lại."
                      : "Thử đổi tab hoặc bỏ bớt điều kiện lọc."
                  }
                  rowClassName={(e) =>
                    todoCountOf(e) >= 3 && !isEventClosed(e)
                      ? "!bg-lv-medium-bg"
                      : undefined
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
            )}
          </ContentCard>

          {/* ------------------- Gợi ý nghiệp vụ -------------------- */}
          {tabCounts.todo > 0 && tab !== "todo" && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-medium-border bg-lv-medium-bg px-3 py-2.5 text-[12px] leading-4 text-lv-medium-text">
              <IconTool size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Anh đang có <b>{tabCounts.todo}</b> sự kiện cần bổ sung hồ sơ.
                Hồ sơ thiếu sẽ chặn việc chuyển trạng thái và đóng sự kiện.
              </span>
              <Button
                variant="secondary"
                size="sm"
                compact
                onClick={() => setTab("todo")}
              >
                Xem ngay
              </Button>
            </div>
          )}
        </div>
      </PageBody>
    </PageContainer>
  );
}

/* ================================================================== */
/* Thẻ chỉ số nhỏ                                        */
/* ================================================================== */

function MiniCard({
  icon,
  tone,
  label,
  value,
  hint,
  isText = false,
}: {
  icon: React.ReactNode;
  tone: "brand" | "warning" | "danger" | "neutral";
  label: string;
  value: number | string;
  hint: string;
  isText?: boolean;
}) {
  const style: Record<string, string> = {
    brand: "bg-brand-light text-brand",
    warning: "bg-lv-medium-bg text-lv-medium-text",
    danger: "bg-lv-critical-bg text-lv-critical-text",
    neutral: "bg-lv-neutral-bg text-lv-neutral-text",
  };

  return (
    <div className="misa-card flex items-start gap-3 p-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
          style[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-text-secondary">{label}</p>
        <p
          className={cn(
            "font-semibold text-text-primary",
            isText ? "text-[17px] leading-7" : "text-[22px] leading-7",
          )}
        >
          {value}
        </p>
        <p className="truncate text-[11px] text-text-hint" title={hint}>
          {hint}
        </p>
      </div>
    </div>
  );
}
