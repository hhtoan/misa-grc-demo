"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconBolt,
  IconEdit,
  IconInfoCircle,
  IconMail,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconShieldCheck,
  IconTool,
  IconTrash,
  IconUserExclamation,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  FilterCombobox,
  IconButton,
  Input,
  Modal,
  Pagination,
  RowActions,
  SearchInput,
  Select,
  Tooltip,
  UserCell,
  useToast,
  type Column,
} from "@/components/ui";
import {
  controlRepo,
  deficiencyRepo,
  employeeRepo,
  eventRepo,
  kppnRepo,
  riskRepo,
  unitRepo,
  useCollection,
} from "@/lib/db";
import { useTableState } from "@/lib/table";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ==================================================================
   Kiểu tối giản dùng nội bộ, không phụ thuộc schema
   ================================================================== */

interface EmployeeRecord {
  id: string;
  name: string;
  email: string;
  code?: string;
  title?: string;
  unitId?: string;
  phone?: string;
  isActive?: boolean;
}

interface UnitLite {
  id: string;
  code: string;
  name: string;
  managerId?: string;
  isActive?: boolean;
}

interface OwnerRef {
  ownerId?: string;
  status?: string;
}

interface KppnRef {
  assigneeId?: string;
  supervisorId?: string;
  status?: string;
}

interface EventRef {
  reporterId?: string;
  handlerId?: string;
  status?: string;
}

interface SimpleRepo<T> {
  create: (value: Partial<T>, by?: string) => T;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
}

const eRepo = employeeRepo as unknown as SimpleRepo<EmployeeRecord>;

interface Usage {
  riskOwner: number;
  controlOwner: number;
  deficiencyOwner: number;
  kppn: number;
  event: number;
  unitManager: number;
  total: number;
}

const EMPTY_USAGE: Usage = {
  riskOwner: 0,
  controlOwner: 0,
  deficiencyOwner: 0,
  kppn: 0,
  event: 0,
  unitManager: 0,
  total: 0,
};

interface FormValue {
  code: string;
  name: string;
  email: string;
  title: string;
  unitId: string;
  phone: string;
  isActive: boolean;
}

const EMPTY_FORM: FormValue = {
  code: "",
  name: "",
  email: "",
  title: "",
  unitId: "",
  phone: "",
  isActive: true,
};

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

/* ================================================================== */
/* Tab Nhân sự                                        */
/* ================================================================== */

export default function TabNhanSu({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const { user } = useSession();

  const employees = useCollection(employeeRepo) as unknown as EmployeeRecord[];
  const units = useCollection(unitRepo) as unknown as UnitLite[];
  const risks = useCollection(riskRepo) as unknown as OwnerRef[];
  const controls = useCollection(controlRepo) as unknown as OwnerRef[];
  const deficiencies = useCollection(deficiencyRepo) as unknown as OwnerRef[];
  const kppns = useCollection(kppnRepo) as unknown as KppnRef[];
  const events = useCollection(eventRepo) as unknown as EventRef[];

  const [unitId, setUnitId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [deleting, setDeleting] = useState<EmployeeRecord | null>(null);

  /* --------------------- Danh sách đơn vị dùng chung -------------- */

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const unitOptions = useMemo(
    () =>
      units
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((u) => ({
          value: u.id,
          label: u.name,
          description: u.code,
        })),
    [units],
  );

  function unitName(id?: string, fallback = "--") {
    if (!id) return fallback;
    return unitMap.get(id)?.name ?? fallback;
  }

  /* ------------------------- Bản đồ tham chiếu ------------------- */

  const usageOf = useMemo(() => {
    const map = new Map<string, Usage>();

    function add(id: string | undefined, key: keyof Omit<Usage, "total">) {
      if (!id) return;
      const cur = map.get(id) ?? { ...EMPTY_USAGE };
      cur[key] += 1;
      cur.total += 1;
      map.set(id, cur);
    }

    risks.forEach((r) => add(r.ownerId, "riskOwner"));
    controls.forEach((c) => add(c.ownerId, "controlOwner"));
    deficiencies.forEach((d) => add(d.ownerId, "deficiencyOwner"));
    kppns.forEach((k) => {
      add(k.assigneeId, "kppn");
      add(k.supervisorId, "kppn");
    });
    events.forEach((e) => {
      add(e.reporterId, "event");
      add(e.handlerId, "event");
    });
    units.forEach((u) => add(u.managerId, "unitManager"));

    return map;
  }, [risks, controls, deficiencies, kppns, events, units]);

  function usage(id: string): Usage {
    return usageOf.get(id) ?? EMPTY_USAGE;
  }

  /** Việc chưa kết thúc, ngừng sử dụng sẽ để việc treo */
  function openWorkload(id: string): number {
    const k = kppns.filter(
      (x) =>
        (x.assigneeId === id || x.supervisorId === id) &&
        x.status !== "Hoàn thành" &&
        x.status !== "Huỷ",
    ).length;
    const e = events.filter(
      (x) =>
        x.handlerId === id &&
        x.status !== "Đã đóng" &&
        x.status !== "Huỷ ghi nhận",
    ).length;
    const d = deficiencies.filter(
      (x) => x.ownerId === id && x.status !== "Đã đóng",
    ).length;
    return k + e + d;
  }

  /* --------------------------- Table state ------------------------ */

  const t = useTableState<EmployeeRecord>(employees, {
    getKey: (e) => e.id,
    searchText: (e) =>
      `${e.code ?? ""} ${e.name} ${e.email} ${e.title ?? ""} ${unitName(e.unitId, "")}`,
    filter: (e) => {
      if (!showInactive && e.isActive === false) return false;
      if (unitId && e.unitId !== unitId) return false;
      if (onlyUnassigned && e.unitId) return false;
      return true;
    },
    sortValue: (e, key) => {
      switch (key) {
        case "name":
          return e.name;
        case "email":
          return e.email;
        case "unit":
          return unitName(e.unitId, "");
        case "workload":
          return usage(e.id).total;
        default:
          return null;
      }
    },
    defaultSort: { key: "name", dir: "asc" },
    pageSize: 20,
    filterDeps: [unitId, showInactive, onlyUnassigned],
  });

  /* --------------------------- Hành động ------------------------- */

  function confirmDelete(e: EmployeeRecord) {
    const use = usage(e.id);
    if (use.total > 0) {
      toast.error(
        "Không xoá được nhân sự",
        `${e.name} đang được ${use.total} bản ghi tham chiếu. Hãy chuyển sang Ngừng sử dụng để giữ lịch sử truy vết.`,
      );
      return;
    }
    setDeleting(e);
  }

  function toggleActive(e: EmployeeRecord) {
    const next = e.isActive === false;

    if (!next) {
      const load = openWorkload(e.id);
      if (load > 0) {
        toast.warning(
          `Còn ${load} việc chưa kết thúc`,
          "Hãy bàn giao lại các hành động, điểm yếu và sự kiện đang mở cho người khác.",
        );
      }
    }

    eRepo.update(e.id, { isActive: next });

    toast.success(
      next ? `Đã mở lại ${e.name}` : `Đã ngừng sử dụng ${e.name}`,
      next
        ? "Nhân sự xuất hiện trở lại trong các danh sách chọn."
        : "Nhân sự không còn hiện trong danh sách chọn, dữ liệu cũ vẫn giữ nguyên.",
    );
  }

  /* --------------------------- Cột bảng -------------------------- */

  const columns: Column<EmployeeRecord>[] = [
    {
      key: "name",
      header: "Nhân sự",
      minWidth: 280,
      sortable: true,
      render: (e) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <UserCell
            name={e.name}
            sub={e.code ? `${e.code} - ${e.title ?? ""}` : (e.title ?? "")}
            size={28}
          />
          {e.isActive === false && (
            <Badge tone="neutral" size="sm">
              Ngừng sử dụng
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email đăng nhập",
      width: 250,
      sortable: true,
      render: (e) => (
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-secondary">
          <IconMail size={13} className="shrink-0" />
          <span className="truncate">{e.email}</span>
        </span>
      ),
    },
    {
      key: "unit",
      header: "Đơn vị",
      width: 210,
      sortable: true,
      render: (e) =>
        e.unitId ? (
          <span className="text-[13px] text-text-primary">
            {unitName(e.unitId)}
          </span>
        ) : (
          <Tooltip content="Nhân sự chưa gắn đơn vị sẽ không nhận được dữ liệu theo phạm vi đơn vị">
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-lv-medium-text">
              <IconUserExclamation size={14} />
              Chưa gán đơn vị
            </span>
          </Tooltip>
        ),
    },
    {
      key: "workload",
      header: "Đang đảm nhiệm",
      minWidth: 260,
      sortable: true,
      render: (e) => {
        const x = usage(e.id);
        if (x.total === 0)
          return (
            <span className="text-[12px] text-text-hint">
              Chưa gắn bản ghi nào
            </span>
          );
        return (
          <span className="flex flex-wrap gap-1">
            {x.riskOwner > 0 && (
              <RoleChip
                icon={<IconAlertTriangle size={12} />}
                label="rủi ro làm chủ sở hữu"
                value={x.riskOwner}
              />
            )}
            {x.controlOwner > 0 && (
              <RoleChip
                icon={<IconShieldCheck size={12} />}
                label="kiểm soát làm chủ"
                value={x.controlOwner}
              />
            )}
            {x.kppn + x.deficiencyOwner > 0 && (
              <RoleChip
                icon={<IconTool size={12} />}
                label="việc khắc phục"
                value={x.kppn + x.deficiencyOwner}
              />
            )}
            {x.event > 0 && (
              <RoleChip
                icon={<IconBolt size={12} />}
                label="sự kiện"
                value={x.event}
              />
            )}
            {x.unitManager > 0 && (
              <RoleChip
                icon={<IconShieldCheck size={12} />}
                label="đơn vị phụ trách"
                value={x.unitManager}
              />
            )}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: 120,
      align: "right",
      render: (e) =>
        canEdit ? (
          <RowActions>
            <Tooltip content="Sửa">
              <IconButton label="Sửa" onClick={() => setEditing(e)}>
                <IconEdit size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip
              content={
                e.isActive === false ? "Mở lại nhân sự" : "Ngừng sử dụng"
              }
            >
              <IconButton
                label="Đổi trạng thái"
                onClick={() => toggleActive(e)}
              >
                {e.isActive === false ? (
                  <IconPlayerPlay size={16} className="text-lv-low-text" />
                ) : (
                  <IconPlayerPause size={16} className="text-lv-medium-text" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip
              content={
                usage(e.id).total > 0
                  ? "Đang được tham chiếu, không xoá được"
                  : "Xoá"
              }
            >
              <IconButton
                label="Xoá"
                disabled={usage(e.id).total > 0}
                onClick={() => confirmDelete(e)}
              >
                <IconTrash
                  size={16}
                  className={
                    usage(e.id).total > 0 ? "text-icon-neutral" : "text-danger"
                  }
                />
              </IconButton>
            </Tooltip>
          </RowActions>
        ) : null,
    },
  ];

  /* ------------------------------ Render ------------------------- */

  const unassigned = employees.filter((e) => !e.unitId).length;

  return (
    <div className="flex flex-col gap-3">
      {/* ----------------------- Thanh công cụ ----------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={t.keyword}
          onChange={t.setKeyword}
          placeholder="Tìm theo tên, email, chức danh"
          width={300}
        />
        <FilterCombobox
          label="Đơn vị:"
          options={unitOptions}
          value={unitId}
          onChange={setUnitId}
          searchable
          width={230}
        />
        <Checkbox
          label="Hiện cả nhân sự ngừng sử dụng"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        <Checkbox
          label="Chỉ nhân sự chưa gán đơn vị"
          checked={onlyUnassigned}
          onChange={(e) => setOnlyUnassigned(e.target.checked)}
        />

        {canEdit && (
          <Button
            className="ml-auto"
            variant="primary"
            icon={<IconPlus size={16} />}
            onClick={() => setCreating(true)}
          >
            Thêm nhân sự
          </Button>
        )}
      </div>

      {/* ------------------------- Cảnh báo -------------------------- */}
      {unassigned > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconUserExclamation size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">
            Có <b>{unassigned}</b> nhân sự chưa gắn đơn vị. Những người này mở
            trang chủ sẽ không thấy dữ liệu theo phạm vi đơn vị, và không nhận
            được việc phát sinh theo đơn vị.
          </span>
          <Button
            variant="secondary"
            size="sm"
            compact
            onClick={() => setOnlyUnassigned(true)}
          >
            Xem danh sách
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
          <IconInfoCircle size={16} className="mt-px shrink-0" />
          <span>
            <b>Email</b> là khoá nối giữa tài khoản đăng nhập và hồ sơ nhân sự.
            Sai email thì người dùng vào hệ thống sẽ không thấy dữ liệu cá nhân
            ở Trang chủ và Việc cần xử lý.
          </span>
        </div>
      )}

      {/* --------------------------- Bảng ---------------------------- */}
      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable
          columns={columns}
          rows={t.pageRows}
          getKey={(e) => e.id}
          sort={t.sort}
          onSort={t.toggleSort}
          stickyLast
          emptyTitle="Không có nhân sự phù hợp"
          emptyDescription="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá tìm kiếm."
          rowClassName={(e) =>
            e.isActive === false ? "!bg-surface-alt" : undefined
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

      {/* -------------------------- Hộp thoại ------------------------ */}
      <EmployeeFormModal
        open={creating || !!editing}
        record={editing}
        employees={employees}
        unitOptions={unitOptions}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(value) => {
          if (editing) {
            eRepo.update(editing.id, value);
            toast.success(
              `Đã lưu ${value.name}`,
              "Thông tin nhân sự đã được cập nhật.",
            );
          } else {
            eRepo.create(value, user.name);
            toast.success(
              `Đã thêm ${value.name}`,
              "Nhân sự mới xuất hiện ngay trong danh sách chọn của toàn hệ thống.",
            );
          }
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            eRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.name} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá nhân sự"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.name}</b>? Nhân sự này chưa được
            bản ghi nào tham chiếu nên có thể xoá an toàn.
          </>
        }
        confirmText="Xoá"
      />
    </div>
  );
}

/* ================================================================== */
/* Chip vai trò                                        */
/* ================================================================== */

function RoleChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Tooltip content={`${value} ${label}`}>
      <span className="inline-flex items-center gap-1 rounded-badge bg-surface-alt px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">
        {icon}
        {value}
      </span>
    </Tooltip>
  );
}

/* ================================================================== */
/* Hộp thoại thêm / sửa nhân sự                                        */
/* ================================================================== */

function EmployeeFormModal({
  open,
  record,
  employees,
  unitOptions,
  onClose,
  onSubmit,
}: {
  open: boolean;
  record: EmployeeRecord | null;
  employees: EmployeeRecord[];
  unitOptions: { value: string; label: string; description?: string }[];
  onClose: () => void;
  onSubmit: (value: FormValue) => void;
}) {
  const [form, setForm] = useState<FormValue>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState("");

  const key = `${open}-${record?.id ?? "new"}`;
  if (key !== lastKey) {
    setLastKey(key);
    setErrors({});
    setForm(
      record
        ? {
            code: record.code ?? "",
            name: record.name,
            email: record.email,
            title: record.title ?? "",
            unitId: record.unitId ?? "",
            phone: record.phone ?? "",
            isActive: record.isActive !== false,
          }
        : EMPTY_FORM,
    );
  }

  function patch(next: Partial<FormValue>) {
    setForm((prev) => ({ ...prev, ...next }));
    setErrors((prev) => {
      const out = { ...prev };
      let changed = false;
      Object.keys(next).forEach((k) => {
        if (out[k]) {
          delete out[k];
          changed = true;
        }
      });
      return changed ? out : prev;
    });
  }

  function submit() {
    const err: Record<string, string> = {};

    if (!form.name.trim()) err.name = "Bắt buộc nhập họ tên";

    const email = form.email.trim().toLowerCase();
    if (!email) err.email = "Bắt buộc nhập email đăng nhập";
    else if (!EMAIL_RE.test(email)) err.email = "Email không đúng định dạng";
    else if (
      employees.some(
        (e) => e.id !== record?.id && e.email.toLowerCase() === email,
      )
    )
      err.email =
        "Email đã được dùng cho nhân sự khác. Mỗi email chỉ gắn với 1 hồ sơ.";

    const code = form.code.trim().toUpperCase();
    if (
      code &&
      employees.some(
        (e) => e.id !== record?.id && (e.code ?? "").toUpperCase() === code,
      )
    )
      err.code = "Mã nhân sự đã tồn tại";

    if (!form.unitId) err.unitId = "Bắt buộc chọn đơn vị công tác";

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    onSubmit({
      ...form,
      code,
      email,
      name: form.name.trim(),
      title: form.title.trim(),
      phone: form.phone.trim(),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={record ? `Sửa nhân sự ${record.name}` : "Thêm nhân sự"}
      description="Hồ sơ nhân sự là cầu nối giữa tài khoản đăng nhập và dữ liệu nghiệp vụ"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={submit}>
            {record ? "Lưu thay đổi" : "Thêm nhân sự"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="Mã nhân sự"
            placeholder="VD: NV0125"
            value={form.code}
            error={errors.code}
            onChange={(e) => patch({ code: e.target.value })}
          />
          <div className="md:col-span-2">
            <Input
              label="Họ và tên"
              required
              placeholder="VD: Nguyễn Văn An"
              value={form.name}
              error={errors.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
        </div>

        <Input
          label="Email đăng nhập"
          required
          placeholder="ten.nhanvien@misa.com.vn"
          value={form.email}
          error={errors.email}
          hint={
            errors.email
              ? undefined
              : "Phải trùng email tài khoản, đây là khoá nối duy nhất giữa tài khoản và hồ sơ"
          }
          onChange={(e) => patch({ email: e.target.value })}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Đơn vị công tác"
            required
            searchable
            placeholder="Chọn đơn vị"
            options={unitOptions}
            value={form.unitId || null}
            error={errors.unitId}
            onChange={(v) => patch({ unitId: v ?? "" })}
          />
          <Input
            label="Chức danh"
            placeholder="VD: Trưởng phòng Hạ tầng"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>

        <Input
          label="Điện thoại"
          placeholder="VD: 0912 345 678"
          value={form.phone}
          onChange={(e) => patch({ phone: e.target.value })}
        />

        <div className="flex flex-col gap-1 rounded-ctrl bg-surface-alt px-3 py-2.5">
          <Checkbox
            label="Nhân sự đang làm việc"
            checked={form.isActive}
            onChange={(e) => patch({ isActive: e.target.checked })}
          />
          <span className="pl-6 text-[11px] leading-4 text-text-hint">
            Bỏ tick khi nhân sự nghỉ việc hoặc chuyển công tác. Trước khi ngừng
            sử dụng, hãy bàn giao lại các hành động, điểm yếu và sự kiện đang
            mở.
          </span>
        </div>
      </div>
    </Modal>
  );
}
