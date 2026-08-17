"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconBolt,
  IconBuilding,
  IconEdit,
  IconInfoCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconShieldCheck,
  IconTool,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  IconButton,
  Input,
  Modal,
  RowActions,
  SearchInput,
  Select,
  Textarea,
  Tooltip,
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
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ==================================================================
   Kiểu tối giản dùng nội bộ màn hình quản trị.
   Cố tình KHÔNG import type từ schema để màn hình không vỡ build
   khi schema thiếu trường tuỳ chọn như parentId, isActive, note.
   ================================================================== */

interface UnitRecord {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  managerId?: string;
  isActive?: boolean;
  note?: string;
}

interface EmployeeLite {
  id: string;
  name: string;
  title?: string;
  unitId?: string;
  email?: string;
}

interface WithUnit {
  unitId?: string;
}

interface SimpleRepo<T> {
  create: (value: Partial<T>, by?: string) => T;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
}

/** Cast một lần tại đây, phần còn lại của file dùng kiểu nội bộ */
const uRepo = unitRepo as unknown as SimpleRepo<UnitRecord>;

interface UnitRow extends UnitRecord {
  /** Độ sâu trong cây, dùng để thụt lề */
  depth: number;
}

interface Usage {
  employees: number;
  risks: number;
  controls: number;
  deficiencies: number;
  kppns: number;
  events: number;
  children: number;
  total: number;
}

const EMPTY_USAGE: Usage = {
  employees: 0,
  risks: 0,
  controls: 0,
  deficiencies: 0,
  kppns: 0,
  events: 0,
  children: 0,
  total: 0,
};

interface FormValue {
  code: string;
  name: string;
  parentId: string;
  managerId: string;
  isActive: boolean;
  note: string;
}

const EMPTY_FORM: FormValue = {
  code: "",
  name: "",
  parentId: "",
  managerId: "",
  isActive: true,
  note: "",
};

/* ================================================================== */
/* Tab Đơn vị                                        */
/* ================================================================== */

export default function TabDonVi({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const { user } = useSession();

  const units = useCollection(unitRepo) as unknown as UnitRecord[];
  const employees = useCollection(employeeRepo) as unknown as EmployeeLite[];
  const risks = useCollection(riskRepo) as unknown as WithUnit[];
  const controls = useCollection(controlRepo) as unknown as WithUnit[];
  const deficiencies = useCollection(deficiencyRepo) as unknown as WithUnit[];
  const kppns = useCollection(kppnRepo) as unknown as WithUnit[];
  const events = useCollection(eventRepo) as unknown as WithUnit[];

  const [keyword, setKeyword] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UnitRecord | null>(null);
  const [deleting, setDeleting] = useState<UnitRecord | null>(null);

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

    employees.forEach((e) => add(e.unitId, "employees"));
    risks.forEach((r) => add(r.unitId, "risks"));
    controls.forEach((c) => add(c.unitId, "controls"));
    deficiencies.forEach((d) => add(d.unitId, "deficiencies"));
    kppns.forEach((k) => add(k.unitId, "kppns"));
    events.forEach((e) => add(e.unitId, "events"));
    units.forEach((u) => add(u.parentId, "children"));

    return map;
  }, [employees, risks, controls, deficiencies, kppns, events, units]);

  function usage(id: string): Usage {
    return usageOf.get(id) ?? EMPTY_USAGE;
  }

  /* ---------------------- Dựng cây theo thứ tự ------------------- */

  const treeRows = useMemo<UnitRow[]>(() => {
    const byParent = new Map<string, UnitRecord[]>();
    units.forEach((u) => {
      const key = u.parentId || "__root__";
      const list = byParent.get(key) ?? [];
      list.push(u);
      byParent.set(key, list);
    });
    byParent.forEach((list) =>
      list.sort((a, b) => a.code.localeCompare(b.code)),
    );

    const out: UnitRow[] = [];
    const seen = new Set<string>();

    function walk(parentKey: string, depth: number) {
      (byParent.get(parentKey) ?? []).forEach((u) => {
        if (seen.has(u.id)) return; // chặn vòng lặp do dữ liệu lỗi
        seen.add(u.id);
        out.push({ ...u, depth });
        walk(u.id, depth + 1);
      });
    }

    walk("__root__", 0);

    /* Đơn vị trỏ tới cha không tồn tại vẫn phải hiện, tránh mất bản ghi */
    units.forEach((u) => {
      if (!seen.has(u.id)) out.push({ ...u, depth: 0 });
    });

    return out;
  }, [units]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return treeRows.filter((u) => {
      if (!showInactive && u.isActive === false) return false;
      if (!kw) return true;
      return `${u.code} ${u.name} ${u.note ?? ""}`.toLowerCase().includes(kw);
    });
  }, [treeRows, keyword, showInactive]);

  /** Đang tìm kiếm thì bỏ thụt lề cho dễ đọc */
  const flatMode = keyword.trim().length > 0;

  /* --------------------------- Hành động ------------------------- */

  function confirmDelete(u: UnitRecord) {
    const use = usage(u.id);
    if (use.total > 0) {
      toast.error(
        "Không xoá được đơn vị",
        `${u.code} đang được ${use.total} bản ghi tham chiếu. Hãy chuyển sang Ngừng sử dụng thay vì xoá.`,
      );
      return;
    }
    setDeleting(u);
  }

  function toggleActive(u: UnitRecord) {
    const next = u.isActive === false;
    uRepo.update(u.id, { isActive: next });
    toast.success(
      next ? `Đã mở lại ${u.code}` : `Đã ngừng sử dụng ${u.code}`,
      next
        ? "Đơn vị xuất hiện trở lại trong các danh sách chọn."
        : "Đơn vị không còn hiện trong danh sách chọn của form, dữ liệu cũ vẫn giữ nguyên.",
    );
  }

  /* --------------------------- Cột bảng -------------------------- */

  const columns: Column<UnitRow>[] = [
    {
      key: "code",
      header: "Mã đơn vị",
      width: 150,
      render: (u) => (
        <span className="text-[12px] font-medium text-brand">{u.code}</span>
      ),
    },
    {
      key: "name",
      header: "Tên đơn vị",
      minWidth: 320,
      render: (u) => (
        <span
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: flatMode ? 0 : u.depth * 18 }}
        >
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-ctrl",
              u.depth === 0
                ? "bg-brand-light text-brand"
                : "bg-surface-alt text-icon-neutral",
            )}
          >
            <IconBuilding size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-[13px]",
                  u.isActive === false
                    ? "text-text-secondary line-through"
                    : "text-text-primary",
                  u.depth === 0 && "font-medium",
                )}
              >
                {u.name}
              </span>
              {u.isActive === false && (
                <Badge tone="neutral" size="sm">
                  Ngừng sử dụng
                </Badge>
              )}
            </span>
            {u.note && (
              <span className="block truncate text-[12px] text-text-secondary">
                {u.note}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: "manager",
      header: "Người phụ trách",
      width: 210,
      render: (u) => {
        const m = employees.find((e) => e.id === u.managerId);
        if (!m)
          return (
            <span className="text-[12px] text-lv-medium-text">Chưa gán</span>
          );
        return (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] text-text-primary">
              {m.name}
            </span>
            <span className="truncate text-[12px] text-text-secondary">
              {m.title || m.email || ""}
            </span>
          </span>
        );
      },
    },
    {
      key: "usage",
      header: "Đang được tham chiếu",
      minWidth: 280,
      render: (u) => {
        const x = usage(u.id);
        if (x.total === 0)
          return (
            <span className="text-[12px] text-text-hint">
              Chưa có bản ghi nào
            </span>
          );
        return (
          <span className="flex flex-wrap gap-1">
            {x.children > 0 && (
              <UsageChip
                icon={<IconBuilding size={12} />}
                label="đơn vị con"
                value={x.children}
              />
            )}
            {x.employees > 0 && (
              <UsageChip
                icon={<IconUsers size={12} />}
                label="nhân sự"
                value={x.employees}
              />
            )}
            {x.risks > 0 && (
              <UsageChip
                icon={<IconAlertTriangle size={12} />}
                label="rủi ro"
                value={x.risks}
              />
            )}
            {x.controls > 0 && (
              <UsageChip
                icon={<IconShieldCheck size={12} />}
                label="kiểm soát"
                value={x.controls}
              />
            )}
            {x.kppns + x.deficiencies > 0 && (
              <UsageChip
                icon={<IconTool size={12} />}
                label="bản ghi khắc phục"
                value={x.kppns + x.deficiencies}
              />
            )}
            {x.events > 0 && (
              <UsageChip
                icon={<IconBolt size={12} />}
                label="sự kiện"
                value={x.events}
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
      render: (u) =>
        canEdit ? (
          <RowActions>
            <Tooltip content="Sửa">
              <IconButton label="Sửa" onClick={() => setEditing(u)}>
                <IconEdit size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip
              content={u.isActive === false ? "Mở lại đơn vị" : "Ngừng sử dụng"}
            >
              <IconButton
                label="Đổi trạng thái"
                onClick={() => toggleActive(u)}
              >
                {u.isActive === false ? (
                  <IconPlayerPlay size={16} className="text-lv-low-text" />
                ) : (
                  <IconPlayerPause size={16} className="text-lv-medium-text" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip
              content={
                usage(u.id).total > 0
                  ? "Đang được tham chiếu, không xoá được"
                  : "Xoá"
              }
            >
              <IconButton
                label="Xoá"
                disabled={usage(u.id).total > 0}
                onClick={() => confirmDelete(u)}
              >
                <IconTrash
                  size={16}
                  className={
                    usage(u.id).total > 0 ? "text-icon-neutral" : "text-danger"
                  }
                />
              </IconButton>
            </Tooltip>
          </RowActions>
        ) : null,
    },
  ];

  /* ------------------------------ Render ------------------------- */

  const activeCount = units.filter((u) => u.isActive !== false).length;

  return (
    <div className="flex flex-col gap-3">
      {/* ----------------------- Thanh công cụ ----------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="Tìm theo mã, tên đơn vị"
          width={300}
        />
        <Checkbox
          label="Hiện cả đơn vị ngừng sử dụng"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        <span className="text-[12px] text-text-secondary">
          Đang dùng <b className="text-text-primary">{activeCount}</b> /{" "}
          {units.length} đơn vị
        </span>

        {canEdit && (
          <Button
            className="ml-auto"
            variant="primary"
            icon={<IconPlus size={16} />}
            onClick={() => setCreating(true)}
          >
            Thêm đơn vị
          </Button>
        )}
      </div>

      {/* -------------------------- Ghi chú -------------------------- */}
      <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
        <IconInfoCircle size={16} className="mt-px shrink-0" />
        <span>
          Đơn vị đang được bản ghi khác tham chiếu thì <b>không xoá được</b>.
          Trường hợp giải thể hoặc sáp nhập, hãy chuyển sang{" "}
          <b>Ngừng sử dụng</b> - đơn vị biến khỏi mọi danh sách chọn nhưng dữ
          liệu lịch sử vẫn nguyên vẹn để truy vết.
        </span>
      </div>

      {/* --------------------------- Bảng ---------------------------- */}
      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(u) => u.id}
          stickyLast
          emptyTitle="Không có đơn vị phù hợp"
          emptyDescription="Thử xoá từ khoá tìm kiếm hoặc bật hiện đơn vị ngừng sử dụng."
          rowClassName={(u) =>
            u.isActive === false ? "!bg-surface-alt" : undefined
          }
        />
      </div>

      {/* -------------------------- Hộp thoại ------------------------ */}
      <UnitFormModal
        open={creating || !!editing}
        record={editing}
        units={units}
        employees={employees}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(value) => {
          if (editing) {
            uRepo.update(editing.id, value);
            toast.success(
              `Đã lưu ${value.code}`,
              "Thông tin đơn vị đã được cập nhật.",
            );
          } else {
            uRepo.create(value, user.name);
            toast.success(
              `Đã thêm ${value.code}`,
              "Đơn vị mới xuất hiện ngay trong danh sách chọn của toàn hệ thống.",
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
            uRepo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá đơn vị"
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b> - {deleting?.name}? Đơn
            vị này chưa được bản ghi nào tham chiếu nên có thể xoá an toàn.
          </>
        }
        confirmText="Xoá"
      />
    </div>
  );
}

/* ================================================================== */
/* Chip đếm tham chiếu                                        */
/* ================================================================== */

function UsageChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Tooltip content={`${value} ${label} đang gắn với đơn vị này`}>
      <span className="inline-flex items-center gap-1 rounded-badge bg-surface-alt px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">
        {icon}
        {value}
      </span>
    </Tooltip>
  );
}

/* ================================================================== */
/* Hộp thoại thêm / sửa đơn vị                                        */
/* ================================================================== */

function UnitFormModal({
  open,
  record,
  units,
  employees,
  onClose,
  onSubmit,
}: {
  open: boolean;
  record: UnitRecord | null;
  units: UnitRecord[];
  employees: EmployeeLite[];
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
            code: record.code,
            name: record.name,
            parentId: record.parentId ?? "",
            managerId: record.managerId ?? "",
            isActive: record.isActive !== false,
            note: record.note ?? "",
          }
        : EMPTY_FORM,
    );
  }

  /** Con cháu của bản ghi đang sửa, không được chọn làm đơn vị cha */
  const descendants = useMemo(() => {
    const out = new Set<string>();
    if (!record) return out;
    out.add(record.id);
    let grew = true;
    while (grew) {
      grew = false;
      units.forEach((u) => {
        if (u.parentId && out.has(u.parentId) && !out.has(u.id)) {
          out.add(u.id);
          grew = true;
        }
      });
    }
    return out;
  }, [record, units]);

  const parentOptions = useMemo(
    () =>
      units
        .filter((u) => !descendants.has(u.id))
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((u) => ({
          value: u.id,
          label: u.name,
          description: u.code,
        })),
    [units, descendants],
  );

  const managerOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: e.name,
        description: e.title ?? "",
      })),
    [employees],
  );

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

    const code = form.code.trim().toUpperCase();
    if (!code) err.code = "Bắt buộc nhập mã đơn vị";
    else if (code.length < 2) err.code = "Mã đơn vị quá ngắn";
    else if (
      units.some((u) => u.id !== record?.id && u.code.toUpperCase() === code)
    )
      err.code = "Mã đơn vị đã tồn tại, mỗi đơn vị phải có mã duy nhất";

    if (!form.name.trim()) err.name = "Bắt buộc nhập tên đơn vị";

    if (form.parentId && descendants.has(form.parentId))
      err.parentId =
        "Không được chọn chính đơn vị này hoặc đơn vị cấp dưới làm đơn vị cha";

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    onSubmit({
      ...form,
      code,
      name: form.name.trim(),
      note: form.note.trim(),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={record ? `Sửa đơn vị ${record.code}` : "Thêm đơn vị"}
      description="Đơn vị dùng chung cho cả 4 phân hệ, nên đặt mã theo quy ước thống nhất"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={submit}>
            {record ? "Lưu thay đổi" : "Thêm đơn vị"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="Mã đơn vị"
            required
            placeholder="VD: CNTT"
            value={form.code}
            error={errors.code}
            onChange={(e) => patch({ code: e.target.value })}
          />
          <div className="md:col-span-2">
            <Input
              label="Tên đơn vị"
              required
              placeholder="VD: Trung tâm Công nghệ thông tin"
              value={form.name}
              error={errors.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Đơn vị cha"
            searchable
            clearable
            placeholder="Để trống nếu là đơn vị cấp cao nhất"
            options={parentOptions}
            value={form.parentId || null}
            error={errors.parentId}
            hint={
              errors.parentId
                ? undefined
                : "Dùng để dựng cây tổ chức và tổng hợp báo cáo theo khối"
            }
            onChange={(v) => patch({ parentId: v ?? "" })}
          />
          <Select
            label="Người phụ trách"
            searchable
            clearable
            placeholder="Chọn lãnh đạo đơn vị"
            options={managerOptions}
            value={form.managerId || null}
            hint="Người nhận báo cáo tổng hợp rủi ro của đơn vị"
            onChange={(v) => patch({ managerId: v ?? "" })}
          />
        </div>

        <Textarea
          label="Ghi chú"
          rows={2}
          maxLength={300}
          placeholder="Phạm vi hoạt động, lưu ý khi phân loại rủi ro của đơn vị"
          value={form.note}
          onChange={(e) => patch({ note: e.target.value })}
        />

        <div className="flex flex-col gap-1 rounded-ctrl bg-surface-alt px-3 py-2.5">
          <Checkbox
            label="Đơn vị đang hoạt động"
            checked={form.isActive}
            onChange={(e) => patch({ isActive: e.target.checked })}
          />
          <span className="pl-6 text-[11px] leading-4 text-text-hint">
            Bỏ tick nếu đơn vị đã giải thể hoặc sáp nhập. Đơn vị sẽ không hiện
            trong danh sách chọn của các form, nhưng dữ liệu cũ vẫn giữ nguyên.
          </span>
        </div>
      </div>
    </Modal>
  );
}
