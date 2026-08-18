"use client";

import { useMemo, useState } from "react";
import {
  IconEdit,
  IconFolder,
  IconInfoCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
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
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ==================================================================
   Kiểu tối giản dùng chung cho mọi danh mục phân loại 2 cấp.
   Cố tình không import type từ schema để không vỡ build khi
   schema thiếu trường tuỳ chọn parentId, description, isActive.
   ================================================================== */

export interface CategoryRecord {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  description?: string;
  isActive?: boolean;
}

export interface SimpleRepo<T> {
  create: (value: Partial<T>, by?: string) => T;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
}

interface CategoryRow extends CategoryRecord {
  depth: number;
}

interface FormValue {
  code: string;
  name: string;
  parentId: string;
  description: string;
  isActive: boolean;
}

const EMPTY_FORM: FormValue = {
  code: "",
  name: "",
  parentId: "",
  description: "",
  isActive: true,
};

/* ================================================================== */
/* Bảng danh mục dùng chung                                            */
/* ================================================================== */

export default function CategoryTable({
  canEdit,
  records,
  repo,
  usageOf,
  usageLabel,
  entityLabel,
  codeHint,
  namePlaceholder,
  note,
  createPatch,
}: {
  canEdit: boolean;
  records: CategoryRecord[];
  repo: SimpleRepo<CategoryRecord>;
  /** Số bản ghi nghiệp vụ đang gắn với từng nhóm */
  usageOf: Map<string, number>;
  /** Nhãn loại bản ghi nghiệp vụ, ví dụ "rủi ro" */
  usageLabel: string;
  /** Nhãn của chính danh mục, ví dụ "nhóm rủi ro" */
  entityLabel: string;
  codeHint: string;
  namePlaceholder: string;
  note: string;
  createPatch?: Record<string, unknown>;
}) {
  const toast = useToast();
  const { user } = useSession();

  const [keyword, setKeyword] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [deleting, setDeleting] = useState<CategoryRecord | null>(null);

  /* ------------------------- Đếm nhóm con ------------------------ */

  const childCountOf = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((c) => {
      if (!c.parentId) return;
      map.set(c.parentId, (map.get(c.parentId) ?? 0) + 1);
    });
    return map;
  }, [records]);

  const usage = (id: string) => usageOf.get(id) ?? 0;
  const children = (id: string) => childCountOf.get(id) ?? 0;
  const blocked = (id: string) => usage(id) + children(id);

  /* ---------------------- Dựng cây theo thứ tự ------------------- */

  const treeRows = useMemo<CategoryRow[]>(() => {
    const byParent = new Map<string, CategoryRecord[]>();
    records.forEach((c) => {
      const key = c.parentId || "__root__";
      const list = byParent.get(key) ?? [];
      list.push(c);
      byParent.set(key, list);
    });
    byParent.forEach((list) =>
      list.sort((a, b) => a.code.localeCompare(b.code)),
    );

    const out: CategoryRow[] = [];
    const seen = new Set<string>();

    function walk(parentKey: string, depth: number) {
      (byParent.get(parentKey) ?? []).forEach((c) => {
        if (seen.has(c.id)) return; // chặn vòng lặp do dữ liệu lỗi
        seen.add(c.id);
        out.push({ ...c, depth });
        walk(c.id, depth + 1);
      });
    }

    walk("__root__", 0);

    /* Nhóm trỏ tới cha không tồn tại vẫn phải hiện, tránh mất bản ghi */
    records.forEach((c) => {
      if (!seen.has(c.id)) out.push({ ...c, depth: 0 });
    });

    return out;
  }, [records]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return treeRows.filter((c) => {
      if (!showInactive && c.isActive === false) return false;
      if (!kw) return true;
      return `${c.code} ${c.name} ${c.description ?? ""}`
        .toLowerCase()
        .includes(kw);
    });
  }, [treeRows, keyword, showInactive]);

  const flatMode = keyword.trim().length > 0;

  /* --------------------------- Hành động ------------------------- */

  function confirmDelete(c: CategoryRecord) {
    const u = usage(c.id);
    const ch = children(c.id);
    if (u + ch > 0) {
      toast.error(
        `Không xoá được ${entityLabel}`,
        u > 0
          ? `${c.code} đang được ${u} ${usageLabel} tham chiếu. Hãy chuyển sang Ngừng sử dụng thay vì xoá.`
          : `${c.code} đang có ${ch} nhóm con. Hãy xử lý nhóm con trước.`,
      );
      return;
    }
    setDeleting(c);
  }

  function toggleActive(c: CategoryRecord) {
    const next = c.isActive === false;
    repo.update(c.id, { isActive: next });
    toast.success(
      next ? `Đã mở lại ${c.code}` : `Đã ngừng sử dụng ${c.code}`,
      next
        ? "Nhóm xuất hiện trở lại trong các danh sách chọn."
        : "Nhóm không còn hiện trong danh sách chọn của form, dữ liệu cũ vẫn giữ nguyên.",
    );
  }

  /* --------------------------- Cột bảng -------------------------- */

  const columns: Column<CategoryRow>[] = [
    {
      key: "code",
      header: "Mã nhóm",
      width: 150,
      render: (c) => (
        <span className="text-[12px] font-medium text-brand">{c.code}</span>
      ),
    },
    {
      key: "name",
      header: "Tên nhóm",
      minWidth: 340,
      render: (c) => (
        <span
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: flatMode ? 0 : c.depth * 18 }}
        >
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-ctrl",
              c.depth === 0
                ? "bg-brand-light text-brand"
                : "bg-surface-alt text-icon-neutral",
            )}
          >
            <IconFolder size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-[13px]",
                  c.isActive === false
                    ? "text-text-secondary line-through"
                    : "text-text-primary",
                  c.depth === 0 && "font-medium",
                )}
              >
                {c.name}
              </span>
              {c.isActive === false && (
                <Badge tone="neutral" size="sm">
                  Ngừng sử dụng
                </Badge>
              )}
              {children(c.id) > 0 && (
                <Tooltip content={`${children(c.id)} nhóm con`}>
                  <Badge tone="neutral" size="sm">
                    {children(c.id)} nhóm con
                  </Badge>
                </Tooltip>
              )}
            </span>
            {c.description && (
              <span className="block truncate text-[12px] text-text-secondary">
                {c.description}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: "usage",
      header: "Đang được tham chiếu",
      width: 230,
      render: (c) => {
        const u = usage(c.id);
        if (u === 0)
          return (
            <span className="text-[12px] text-text-hint">
              Chưa có {usageLabel} nào
            </span>
          );
        return (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary">
            <b className="text-[13px] text-text-primary">{u}</b>
            {usageLabel}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: 120,
      align: "right",
      render: (c) =>
        canEdit ? (
          <RowActions>
            <Tooltip content="Sửa">
              <IconButton label="Sửa" onClick={() => setEditing(c)}>
                <IconEdit size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip
              content={c.isActive === false ? "Mở lại nhóm" : "Ngừng sử dụng"}
            >
              <IconButton
                label="Đổi trạng thái"
                onClick={() => toggleActive(c)}
              >
                {c.isActive === false ? (
                  <IconPlayerPlay size={16} className="text-lv-low-text" />
                ) : (
                  <IconPlayerPause size={16} className="text-lv-medium-text" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip
              content={
                blocked(c.id) > 0
                  ? "Đang được tham chiếu hoặc còn nhóm con, không xoá được"
                  : "Xoá"
              }
            >
              <IconButton
                label="Xoá"
                disabled={blocked(c.id) > 0}
                onClick={() => confirmDelete(c)}
              >
                <IconTrash
                  size={16}
                  className={
                    blocked(c.id) > 0 ? "text-icon-neutral" : "text-danger"
                  }
                />
              </IconButton>
            </Tooltip>
          </RowActions>
        ) : null,
    },
  ];

  /* ------------------------------ Render ------------------------- */

  const activeCount = records.filter((c) => c.isActive !== false).length;
  const orphanUsage = useMemo(() => {
    const ids = new Set(records.map((c) => c.id));
    let sum = 0;
    usageOf.forEach((v, k) => {
      if (!ids.has(k)) sum += v;
    });
    return sum;
  }, [records, usageOf]);

  return (
    <div className="flex flex-col gap-3">
      {/* ----------------------- Thanh công cụ ----------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="Tìm theo mã, tên nhóm"
          width={300}
        />
        <Checkbox
          label="Hiện cả nhóm ngừng sử dụng"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        <span className="text-[12px] text-text-secondary">
          Đang dùng <b className="text-text-primary">{activeCount}</b> /{" "}
          {records.length} nhóm
        </span>

        {canEdit && (
          <Button
            className="ml-auto"
            variant="primary"
            icon={<IconPlus size={16} />}
            onClick={() => setCreating(true)}
          >
            Thêm nhóm
          </Button>
        )}
      </div>

      {/* -------------------------- Ghi chú -------------------------- */}
      <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
        <IconInfoCircle size={16} className="mt-px shrink-0" />
        <span>{note}</span>
      </div>

      {orphanUsage > 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconInfoCircle size={16} className="mt-px shrink-0" />
          <span>
            Có <b>{orphanUsage}</b> {usageLabel} đang trỏ tới nhóm không còn tồn
            tại trong danh mục. Đây là dữ liệu mồ côi do nhóm bị xoá cứng trước
            đây, nên gán lại nhóm cho các bản ghi này.
          </span>
        </div>
      )}

      {/* --------------------------- Bảng ---------------------------- */}
      <div className="overflow-hidden rounded-ctrl border border-border-light">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(c) => c.id}
          stickyLast
          emptyTitle="Không có nhóm phù hợp"
          emptyDescription="Thử xoá từ khoá tìm kiếm hoặc bật hiện nhóm ngừng sử dụng."
          rowClassName={(c) =>
            c.isActive === false ? "!bg-surface-alt" : undefined
          }
        />
      </div>

      {/* -------------------------- Hộp thoại ------------------------ */}
      <CategoryFormModal
        open={creating || !!editing}
        record={editing}
        records={records}
        entityLabel={entityLabel}
        codeHint={codeHint}
        namePlaceholder={namePlaceholder}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(value) => {
          if (editing) {
            repo.update(editing.id, value);
            toast.success(
              `Đã lưu ${value.code}`,
              "Thông tin nhóm đã được cập nhật.",
            );
          } else {
            repo.create({ ...createPatch, ...value }, user.name);
            toast.success(
              `Đã thêm ${value.code}`,
              "Nhóm mới xuất hiện ngay trong danh sách chọn của toàn hệ thống.",
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
            repo.remove(deleting.id);
            toast.success("Đã xoá", `${deleting.code} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title={`Xoá ${entityLabel}`}
        message={
          <>
            Bạn có chắc muốn xoá <b>{deleting?.code}</b> - {deleting?.name}?
            Nhóm này chưa được bản ghi nào tham chiếu nên có thể xoá an toàn.
          </>
        }
        confirmText="Xoá"
      />
    </div>
  );
}

/* ================================================================== */
/* Hộp thoại thêm / sửa nhóm                                           */
/* ================================================================== */

function CategoryFormModal({
  open,
  record,
  records,
  entityLabel,
  codeHint,
  namePlaceholder,
  onClose,
  onSubmit,
}: {
  open: boolean;
  record: CategoryRecord | null;
  records: CategoryRecord[];
  entityLabel: string;
  codeHint: string;
  namePlaceholder: string;
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
            description: record.description ?? "",
            isActive: record.isActive !== false,
          }
        : EMPTY_FORM,
    );
  }

  /** Con cháu của bản ghi đang sửa, không được chọn làm nhóm cha */
  const descendants = useMemo(() => {
    const out = new Set<string>();
    if (!record) return out;
    out.add(record.id);
    let grew = true;
    while (grew) {
      grew = false;
      records.forEach((c) => {
        if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
          out.add(c.id);
          grew = true;
        }
      });
    }
    return out;
  }, [record, records]);

  /** Chỉ cho chọn nhóm cấp 1 làm nhóm cha, giữ cây tối đa 2 cấp */
  const parentOptions = useMemo(
    () =>
      records
        .filter((c) => !c.parentId && !descendants.has(c.id))
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((c) => ({
          value: c.id,
          label: c.name,
          description: c.code,
        })),
    [records, descendants],
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
    if (!code) err.code = "Bắt buộc nhập mã nhóm";
    else if (code.length < 2) err.code = "Mã nhóm quá ngắn";
    else if (
      records.some((c) => c.id !== record?.id && c.code.toUpperCase() === code)
    )
      err.code = "Mã nhóm đã tồn tại, mỗi nhóm phải có mã duy nhất";

    if (!form.name.trim()) err.name = "Bắt buộc nhập tên nhóm";

    if (form.parentId && descendants.has(form.parentId))
      err.parentId =
        "Không được chọn chính nhóm này hoặc nhóm cấp dưới làm nhóm cha";

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    onSubmit({
      ...form,
      code,
      name: form.name.trim(),
      description: form.description.trim(),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        record ? `Sửa ${entityLabel} ${record.code}` : `Thêm ${entityLabel}`
      }
      description="Danh mục phân loại tối đa 2 cấp, dùng để tổng hợp báo cáo theo nhóm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={submit}>
            {record ? "Lưu thay đổi" : "Thêm nhóm"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="Mã nhóm"
            required
            placeholder={codeHint}
            value={form.code}
            error={errors.code}
            onChange={(e) => patch({ code: e.target.value })}
          />
          <div className="md:col-span-2">
            <Input
              label="Tên nhóm"
              required
              placeholder={namePlaceholder}
              value={form.name}
              error={errors.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
        </div>

        <Select
          label="Nhóm cha"
          searchable
          clearable
          placeholder="Để trống nếu là nhóm cấp 1"
          options={parentOptions}
          value={form.parentId || null}
          error={errors.parentId}
          hint={
            errors.parentId
              ? undefined
              : "Chỉ chọn được nhóm cấp 1, danh mục giữ tối đa 2 cấp cho gọn báo cáo"
          }
          onChange={(v) => patch({ parentId: v ?? "" })}
        />

        <Textarea
          label="Mô tả"
          rows={3}
          maxLength={400}
          placeholder="Phạm vi của nhóm, ví dụ điển hình để người nhập liệu chọn đúng"
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
        />

        <div className="flex flex-col gap-1 rounded-ctrl bg-surface-alt px-3 py-2.5">
          <Checkbox
            label="Nhóm đang sử dụng"
            checked={form.isActive}
            onChange={(e) => patch({ isActive: e.target.checked })}
          />
          <span className="pl-6 text-[11px] leading-4 text-text-hint">
            Bỏ tick nếu nhóm không còn dùng để phân loại bản ghi mới. Nhóm biến
            khỏi danh sách chọn nhưng dữ liệu cũ vẫn giữ nguyên.
          </span>
        </div>
      </div>
    </Modal>
  );
}
