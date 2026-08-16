"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowRight,
  IconDatabaseExport,
  IconDatabaseImport,
  IconEye,
  IconPlugConnected,
  IconRefresh,
  IconRotate,
  IconTrash,
  IconTrashX,
} from "@tabler/icons-react";
import {
  Badge,
  BulkActionBar,
  BulkButton,
  Button,
  Checkbox,
  CodeCell,
  ConfirmDialog,
  DataTable,
  FilterCombobox,
  FilterGroup,
  FilterPanel,
  IconButton,
  Modal,
  Pagination,
  ReadField,
  RiskBadge,
  RowActions,
  SearchInput,
  StatusBadge,
  Switch,
  TableToolbar,
  TitleCell,
  Tooltip,
  UserCell,
  useToast,
  type Column,
} from "@/components/ui";
import {
  categoryRepo,
  employeeRepo,
  kppnRepo,
  nameById,
  objectiveRepo,
  riskRepo,
  unitRepo,
  useCollection,
} from "@/lib/db";
import { riskLevelOf, riskScore } from "@/lib/domain/matrix";
import { RISK_STATUSES } from "@/lib/domain/enums";
import { RISK_FLOW, nextTransitions } from "@/lib/domain/workflow";
import type { Risk } from "@/lib/domain/schema";
import { isKppnOverdue } from "@/lib/domain/schema";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useTableState } from "@/lib/table";
import {
  INTEGRATIONS,
  pullKppnFromSource,
  setConnected,
  syncAll,
  syncObjectives,
  useIntegrationStates,
  type IntegrationKey,
} from "@/lib/integrations/mock";
import {
  bootstrapSeed,
  clearAllData,
  downloadBackup,
  getDataStats,
  importFromFile,
  loadSeedData,
  resetAllData,
} from "@/lib/seed";

/* ================================================================== */
/* Trang nghiệm thu                                        */
/* ================================================================== */

export default function DataKitPage() {
  const toast = useToast();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bootstrapSeed();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-[13px] text-text-secondary">
        Đang chuẩn bị dữ liệu...
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-h2">Nghiệm thu tầng dữ liệu & bảng dữ liệu</h1>
          <p className="text-[13px] text-text-secondary">
            Giai đoạn 2B và Giai đoạn 4. Trang này có thể xoá khi hoàn thiện dự án.
          </p>
        </div>
        <Badge tone="brand">v0.1 - Giai đoạn 2B + 4</Badge>
      </header>

      <DataStatsCard />
      <IntegrationCard />
      <RiskTableCard />
      <DataManageCard />
    </div>
  );
}

/* ================================================================== */
/* 1. Thống kê dữ liệu                                        */
/* ================================================================== */

function DataStatsCard() {
  const risks = useCollection(riskRepo);
  const kppns = useCollection(kppnRepo);
  const objectives = useCollection(objectiveRepo);

  const stats = useMemo(
    () => getDataStats(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [risks, kppns, objectives]
  );

  const total = stats.reduce((s, r) => s + r.count, 0);
  const overdue = kppns.filter((k) => isKppnOverdue(k)).length;

  return (
    <section className="misa-card p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Thống kê dữ liệu trong trình duyệt
        </h2>
        <span className="text-[12px] text-text-secondary">
          Tổng {total} bản ghi, trong đó {overdue} hành động KPPN quá hạn
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => {
          const diff = s.count !== s.seedCount;
          return (
            <div
              key={s.name}
              className="rounded-ctrl border border-border-light px-3 py-2"
            >
              <p className="truncate text-[12px] text-text-secondary" title={s.label}>
                {s.label}
              </p>
              <p className="flex items-baseline gap-1">
                <span className="text-[18px] font-semibold text-text-primary">
                  {s.count}
                </span>
                {diff && (
                  <span className="text-[11px] text-text-hint">
                    / mẫu {s.seedCount}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== */
/* 2. Kết nối hệ thống (giả lập)                                       */
/* ================================================================== */

function IntegrationCard() {
  const toast = useToast();
  const states = useIntegrationStates();
  const [busy, setBusy] = useState<IntegrationKey | "all" | null>(null);

  async function runSync(key: IntegrationKey) {
    setBusy(key);
    const res =
      key === "amis-muc-tieu"
        ? await syncObjectives()
        : await pullKppnFromSource(key);
    setBusy(null);

    if (res.ok) toast.success(res.message, res.details.slice(0, 2).join(" | "));
    else toast.error("Không đồng bộ được", res.message);
  }

  async function runSyncAll() {
    setBusy("all");
    const res = await syncAll();
    setBusy(null);
    if (res.ok) toast.success(res.message);
    else toast.warning("Không có kết nối nào đang bật", res.message);
  }

  return (
    <section className="misa-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Kết nối hệ thống
        </h2>
        <Button
          variant="primary"
          icon={<IconRefresh size={16} />}
          loading={busy === "all"}
          onClick={runSyncAll}
        >
          Đồng bộ tất cả
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {INTEGRATIONS.map((it) => {
          const st = states[it.key];
          return (
            <div
              key={it.key}
              className="flex flex-col gap-2 rounded-ctrl border border-border-light p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
                    <IconPlugConnected size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-text-primary">
                      {it.name}
                    </p>
                    <Badge
                      tone={it.direction === "1 chiều" ? "neutral" : "info"}
                      size="sm"
                    >
                      Đồng bộ {it.direction}
                    </Badge>
                  </div>
                </div>
                <Switch
                  checked={st.connected}
                  onChange={(v) => setConnected(it.key, v)}
                />
              </div>

              <p className="text-[12px] leading-4 text-text-secondary">
                {it.description}
              </p>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-light pt-2">
                <span className="min-w-0 truncate text-[11px] text-text-hint">
                  {st.lastSyncedAt
                    ? `${formatDateTime(st.lastSyncedAt)} - ${st.lastMessage}`
                    : "Chưa đồng bộ lần nào"}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  compact
                  loading={busy === it.key}
                  onClick={() => runSync(it.key)}
                >
                  Đồng bộ
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== */
/* 3. Bảng rủi ro - nghiệm thu DataTable                               */
/* ================================================================== */

const STATUS_OPTIONS = RISK_STATUSES.map((s) => ({ value: s, label: s }));
const LEVEL_OPTIONS = ["Thấp", "Trung bình", "Cao", "Trọng yếu"].map((s) => ({
  value: s,
  label: s,
}));

function RiskTableCard() {
  const toast = useToast();

  const risks = useCollection(riskRepo);
  const units = useCollection(unitRepo);
  const employees = useCollection(employeeRepo);
  const categories = useCollection(categoryRepo);

  const [statuses, setStatuses] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  const [onlyKeyRisk, setOnlyKeyRisk] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const [detail, setDetail] = useState<Risk | null>(null);
  const [deleting, setDeleting] = useState<Risk | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);

  const unitOptions = useMemo(
    () => units.map((u) => ({ value: u.id, label: u.name })),
    [units]
  );

  const t = useTableState<Risk>(risks, {
    getKey: (r) => r.id,
    searchText: (r) => `${r.code} ${r.name} ${r.tags.join(" ")}`,
    filter: (r) => {
      if (statuses.length > 0 && !statuses.includes(r.status)) return false;
      if (unitId && r.unitId !== unitId) return false;
      if (onlyKeyRisk && !r.isKeyRisk) return false;
      if (levels.length > 0) {
        const lv = riskLevelOf(r.residualLikelihood, r.residualImpact);
        if (!levels.includes(lv)) return false;
      }
      return true;
    },
    sortValue: (r, key) => {
      switch (key) {
        case "code":
          return r.code;
        case "name":
          return r.name;
        case "unit":
          return nameById(units, r.unitId);
        case "owner":
          return nameById(employees, r.ownerId);
        case "inherent":
          return riskScore(r.inherentLikelihood, r.inherentImpact);
        case "residual":
          return riskScore(r.residualLikelihood, r.residualImpact);
        case "loss":
          return r.estimatedLoss ?? 0;
        case "identified":
          return r.identifiedDate;
        case "status":
          return r.status;
        default:
          return null;
      }
    },
    defaultSort: { key: "residual", dir: "desc" },
    pageSize: 10,
    filterDeps: [statuses, unitId, levels, onlyKeyRisk],
  });

  const filterCount =
    statuses.length + levels.length + (unitId ? 1 : 0) + (onlyKeyRisk ? 1 : 0);

  function resetFilter() {
    setStatuses([]);
    setLevels([]);
    setUnitId(null);
    setOnlyKeyRisk(false);
  }

  function moveNext(r: Risk) {
    const next = nextTransitions(RISK_FLOW, r.status)[0];
    if (!next) {
      toast.warning("Không chuyển được", `Trạng thái ${r.status} là trạng thái cuối.`);
      return;
    }
    riskRepo.update(r.id, { status: next.to });
    toast.success(
      `${r.code}: ${next.label}`,
      `Trạng thái chuyển từ ${r.status} sang ${next.to}.`
    );
  }

  const columns: Column<Risk>[] = [
    {
      key: "code",
      header: "Mã",
      width: 140,
      sortable: true,
      render: (r) => <CodeCell code={r.code} onClick={() => setDetail(r)} />,
    },
    {
      key: "name",
      header: "Tên rủi ro",
      minWidth: 300,
      sortable: true,
      render: (r) => (
        <TitleCell
          title={
            <span className="flex items-center gap-1.5">
              {r.name}
              {r.isKeyRisk && (
                <Badge tone="brand" size="sm">
                  Trọng yếu
                </Badge>
              )}
              {r.isZeroTolerance && (
                <Tooltip content="Rủi ro không khoan nhượng">
                  <Badge tone="danger" size="sm">
                    Zero
                  </Badge>
                </Tooltip>
              )}
            </span>
          }
          sub={nameById(categories, r.categoryId)}
        />
      ),
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 170,
      sortable: true,
      render: (r) => nameById(units, r.unitId),
    },
    {
      key: "owner",
      header: "Chủ sở hữu",
      width: 210,
      sortable: true,
      render: (r) => (
        <UserCell
          name={nameById(employees, r.ownerId, "Chưa gán")}
          size={24}
        />
      ),
    },
    {
      key: "inherent",
      header: "Cố hữu",
      width: 100,
      align: "center",
      sortable: true,
      render: (r) => (
        <span className="text-text-secondary">
          {riskScore(r.inherentLikelihood, r.inherentImpact)}
        </span>
      ),
    },
    {
      key: "residual",
      header: "Còn lại",
      width: 150,
      sortable: true,
      render: (r) => (
        <RiskBadge
          level={riskLevelOf(r.residualLikelihood, r.residualImpact)}
          score={riskScore(r.residualLikelihood, r.residualImpact)}
        />
      ),
    },
    {
      key: "loss",
      header: "Tổn thất ước tính",
      width: 150,
      align: "right",
      sortable: true,
      render: (r) => formatMoney(r.estimatedLoss) || "--",
    },
    {
      key: "identified",
      header: "Ngày nhận diện",
      width: 130,
      sortable: true,
      render: (r) => formatDate(r.identifiedDate),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: 140,
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "",
      width: 108,
      align: "right",
      render: (r) => (
        <RowActions>
          <Tooltip content="Xem chi tiết">
            <IconButton label="Xem chi tiết" onClick={() => setDetail(r)}>
              <IconEye size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Chuyển trạng thái tiếp theo">
            <IconButton label="Chuyển trạng thái" onClick={() => moveNext(r)}>
              <IconArrowRight size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Xoá">
            <IconButton label="Xoá" onClick={() => setDeleting(r)}>
              <IconTrash size={16} className="text-danger" />
            </IconButton>
          </Tooltip>
        </RowActions>
      ),
    },
  ];

  return (
    <section className="misa-card flex flex-col overflow-hidden" >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-light px-4">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Sổ đăng ký rủi ro (dữ liệu thật từ localStorage)
        </h2>
        <span className="text-[12px] text-text-secondary">
          {t.total} / {risks.length} bản ghi
        </span>
      </div>

      <div className="flex min-h-[520px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <TableToolbar
            left={
              <>
                <SearchInput
                  value={t.keyword}
                  onChange={t.setKeyword}
                  placeholder="Tìm theo mã, tên rủi ro"
                  width={260}
                />
                <FilterCombobox
                  label="Trạng thái:"
                  multiple
                  options={STATUS_OPTIONS}
                  value={statuses}
                  onChange={setStatuses}
                  width={220}
                />
              </>
            }
            filterCount={filterCount}
            filterOpen={filterOpen}
            onToggleFilter={() => setFilterOpen((o) => !o)}
          />

          <DataTable
            columns={columns}
            rows={t.pageRows}
            getKey={(r) => r.id}
            selectable
            selectedSet={t.selectedSet}
            onToggleRow={t.toggleRow}
            onTogglePage={t.togglePage}
            allPageSelected={t.allPageSelected}
            somePageSelected={t.somePageSelected}
            sort={t.sort}
            onSort={t.toggleSort}
            stickyLast
            emptyTitle="Không có rủi ro phù hợp"
            emptyDescription="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá tìm kiếm."
            rowClassName={(r) =>
              r.isZeroTolerance &&
              riskLevelOf(r.residualLikelihood, r.residualImpact) === "Cao"
                ? "!bg-lv-critical-bg"
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
        </div>

        <FilterPanel
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          onReset={resetFilter}
        >
          <FilterGroup label="Đơn vị">
            <FilterCombobox
              label="Đơn vị:"
              options={unitOptions}
              value={unitId}
              onChange={setUnitId}
              searchable
              width={216}
            />
          </FilterGroup>

          <FilterGroup label="Mức rủi ro còn lại">
            <FilterCombobox
              label="Mức độ:"
              multiple
              options={LEVEL_OPTIONS}
              value={levels}
              onChange={setLevels}
              width={216}
            />
          </FilterGroup>

          <FilterGroup label="Thuộc tính">
            <Checkbox
              label="Chỉ rủi ro trọng yếu"
              checked={onlyKeyRisk}
              onChange={(e) => setOnlyKeyRisk(e.target.checked)}
            />
          </FilterGroup>
        </FilterPanel>
      </div>

      {/* ---------------------- Bulk action ---------------------- */}
      <BulkActionBar
        count={t.selectedKeys.length}
        totalCount={t.total}
        onClear={t.clearSelection}
        onSelectAll={t.selectAll}
      >
        <BulkButton
          icon={<IconArrowRight size={16} />}
          onClick={() => {
            let moved = 0;
            t.selectedKeys.forEach((id) => {
              const r = riskRepo.getById(id);
              if (!r) return;
              const next = nextTransitions(RISK_FLOW, r.status)[0];
              if (!next) return;
              riskRepo.update(id, { status: next.to });
              moved += 1;
            });
            t.clearSelection();
            toast.success(
              `Đã chuyển trạng thái ${moved} rủi ro`,
              moved < t.selectedKeys.length
                ? "Một số bản ghi đang ở trạng thái cuối nên được bỏ qua."
                : undefined
            );
          }}
        >
          Chuyển trạng thái
        </BulkButton>
        <BulkButton
          danger
          icon={<IconTrash size={16} />}
          onClick={() => setBulkDelete(true)}
        >
          Xoá
        </BulkButton>
      </BulkActionBar>

      {/* ------------------------ Modal ------------------------- */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail ? `${detail.code} - ${detail.name}` : ""}
        headerRight={detail && <StatusBadge status={detail.status} />}
        footer={
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Đóng
          </Button>
        }
      >
        {detail && <RiskDetail risk={detail} />}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) riskRepo.remove(deleting.id);
          toast.success("Đã xoá", `${deleting?.code} đã được xoá khỏi dữ liệu.`);
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá rủi ro"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b>? Hành động này không thể
            hoàn tác.
          </>
        }
        confirmText="Xoá"
      />

      <ConfirmDialog
        open={bulkDelete}
        onClose={() => setBulkDelete(false)}
        onConfirm={() => {
          const n = t.selectedKeys.length;
          riskRepo.removeMany(t.selectedKeys);
          t.clearSelection();
          setBulkDelete(false);
          toast.success(`Đã xoá ${n} rủi ro`);
        }}
        tone="danger"
        title="Xoá nhiều rủi ro"
        message={
          <>
            Bạn có chắc muốn xoá <b>{t.selectedKeys.length}</b> bản ghi đã chọn?
          </>
        }
        confirmText="Xoá tất cả"
      />
    </section>
  );
}

/* ------------------------ Nội dung modal ------------------------- */

function RiskDetail({ risk }: { risk: Risk }) {
  const units = useCollection(unitRepo);
  const employees = useCollection(employeeRepo);
  const categories = useCollection(categoryRepo);
  const objectives = useCollection(objectiveRepo);

  const linkedObjectives = objectives.filter((o) =>
    risk.objectiveIds.includes(o.id)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
        <ReadField label="Nhóm rủi ro">
          {nameById(categories, risk.categoryId)}
        </ReadField>
        <ReadField label="Đơn vị">{nameById(units, risk.unitId)}</ReadField>
        <ReadField label="Chủ sở hữu">
          <UserCell name={nameById(employees, risk.ownerId)} size={22} />
        </ReadField>
        <ReadField label="Rủi ro cố hữu">
          <RiskBadge
            level={riskLevelOf(risk.inherentLikelihood, risk.inherentImpact)}
            score={riskScore(risk.inherentLikelihood, risk.inherentImpact)}
          />
        </ReadField>
        <ReadField label="Rủi ro còn lại">
          <RiskBadge
            level={riskLevelOf(risk.residualLikelihood, risk.residualImpact)}
            score={riskScore(risk.residualLikelihood, risk.residualImpact)}
          />
        </ReadField>
        <ReadField label="Phương án xử lý">{risk.treatment}</ReadField>
        <ReadField label="Ngày nhận diện">
          {formatDate(risk.identifiedDate)}
        </ReadField>
        <ReadField label="Ngày rà soát">
          {formatDate(risk.reviewDate) || "--"}
        </ReadField>
        <ReadField label="Tổn thất ước tính">
          {formatMoney(risk.estimatedLoss) || "--"}
        </ReadField>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-text-secondary">
          Mục tiêu bị ảnh hưởng
        </span>
        <div className="flex flex-wrap gap-1.5">
          {linkedObjectives.map((o) => (
            <Badge key={o.id} tone="brand">
              {o.code} - {o.name}
            </Badge>
          ))}
          {linkedObjectives.length === 0 && (
            <span className="text-[13px] text-text-hint">--</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReadField label="Nguyên nhân">{risk.cause}</ReadField>
        <ReadField label="Hậu quả">{risk.consequence}</ReadField>
      </div>

      <ReadField label="Định hướng xử lý">{risk.treatmentNote}</ReadField>

      <div className="rounded-ctrl bg-surface-alt p-3">
        <p className="text-[12px] font-medium text-text-secondary">
          Trạng thái tiếp theo có thể chuyển
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {nextTransitions(RISK_FLOW, risk.status).map((tr) => (
            <Badge key={tr.to} tone={tr.tone === "danger" ? "danger" : "info"}>
              {tr.label} → {tr.to}
            </Badge>
          ))}
          {nextTransitions(RISK_FLOW, risk.status).length === 0 && (
            <span className="text-[13px] text-text-hint">
              Đây là trạng thái cuối của luồng.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* 4. Quản lý dữ liệu                                        */
/* ================================================================== */

function DataManageCard() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function handleImport(file: File) {
    const res = await importFromFile(file);
    if (res.ok) toast.success("Nhập dữ liệu thành công", res.message);
    else toast.error("Không nhập được dữ liệu", res.message);
  }

  return (
    <section className="misa-card p-4">
      <h2 className="mb-1 text-[14px] font-semibold text-text-primary">
        Quản lý dữ liệu demo
      </h2>
      <p className="mb-3 text-[12px] text-text-secondary">
        Toàn bộ dữ liệu lưu trên trình duyệt. Có thể sao lưu ra tệp JSON và nạp
        lại khi cần.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={<IconDatabaseExport size={16} />}
          onClick={() => {
            downloadBackup();
            toast.success("Đã xuất dữ liệu", "Tệp sao lưu đang được tải về máy.");
          }}
        >
          Xuất dữ liệu
        </Button>

        <Button
          variant="secondary"
          icon={<IconDatabaseImport size={16} />}
          onClick={() => fileRef.current?.click()}
        >
          Nhập dữ liệu
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />

        <Button
          variant="secondary"
          icon={<IconRotate size={16} />}
          onClick={() => {
            loadSeedData();
            toast.success("Đã nạp lại dữ liệu mẫu");
          }}
        >
          Nạp lại dữ liệu mẫu
        </Button>

        <Button
          variant="danger-outline"
          icon={<IconRefresh size={16} />}
          onClick={() => setConfirmReset(true)}
        >
          Khôi phục mặc định
        </Button>

        <Button
          variant="danger-outline"
          icon={<IconTrashX size={16} />}
          onClick={() => setConfirmClear(true)}
        >
          Xoá sạch dữ liệu
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetAllData();
          setConfirmReset(false);
          toast.success("Đã khôi phục", "Dữ liệu quay về trạng thái mẫu ban đầu.");
        }}
        title="Khôi phục dữ liệu mặc định"
        message="Toàn bộ thay đổi của bạn sẽ bị xoá và thay bằng bộ dữ liệu mẫu ban đầu. Tiếp tục?"
        confirmText="Khôi phục"
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAllData();
          setConfirmClear(false);
          toast.success("Đã xoá sạch", "Hệ thống đang ở trạng thái rỗng.");
        }}
        tone="danger"
        title="Xoá sạch dữ liệu"
        message="Toàn bộ bản ghi sẽ bị xoá, hệ thống về trạng thái rỗng để kiểm tra màn hình trống. Tiếp tục?"
        confirmText="Xoá sạch"
      />
    </section>
  );
}
