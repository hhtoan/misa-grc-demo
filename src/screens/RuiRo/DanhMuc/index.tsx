"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconBolt,
  IconCategory,
  IconChevronRight,
  IconEdit,
  IconFolder,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SearchInput,
  Segments,
  Select,
  Textarea,
  Tooltip,
  useToast,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { LEVEL_TONE } from "@/components/domain";
import { categoryRepo, eventRepo, riskRepo, useCollection } from "@/lib/db";
import type { RiskLevelValue } from "@/lib/domain/enums";
import { RISK_LEVEL_ORDER, residualLevelOf } from "@/lib/domain/risk-utils";
import type { Category } from "@/lib/domain/schema";
import { matchSearch } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

type Group = "Rủi ro" | "Sự kiện";

interface CategoryForm {
  name: string;
  parentId: string;
  description: string;
}

const EMPTY_FORM: CategoryForm = { name: "", parentId: "", description: "" };

/* ================================================================== */

export default function DanhMucRuiRoScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, hasRole } = useSession();

  const categories = useCollection(categoryRepo);
  const risks = useCollection(riskRepo);
  const events = useCollection(eventRepo);

  const [group, setGroup] = useState<Group>("Rủi ro");
  const [keyword, setKeyword] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [presetParent, setPresetParent] = useState<string>("");
  const [deleting, setDeleting] = useState<Category | null>(null);

  const canEdit = hasRole("admin", "qtrr");

  const scoped = useMemo(
    () => categories.filter((c) => c.group === group),
    [categories, group]
  );

  /* -------------------- Đếm số bản ghi sử dụng ------------------ */

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    if (group === "Rủi ro") {
      risks.forEach((r) =>
        map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + 1)
      );
    } else {
      events.forEach((e) =>
        map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + 1)
      );
    }
    return map;
  }, [group, risks, events]);

  /** Mức rủi ro cao nhất trong nhóm, chỉ áp dụng cho danh mục rủi ro */
  const maxLevel = useMemo(() => {
    const map = new Map<string, RiskLevelValue>();
    if (group !== "Rủi ro") return map;
    risks.forEach((r) => {
      if (r.status === "Đã đóng" || r.status === "Từ chối") return;
      const lv = residualLevelOf(r);
      const cur = map.get(r.categoryId);
      if (!cur || RISK_LEVEL_ORDER[lv] > RISK_LEVEL_ORDER[cur])
        map.set(r.categoryId, lv);
    });
    return map;
  }, [group, risks]);

  const childrenOf = (parentId: string | null) =>
    scoped.filter((c) => c.parentId === parentId);

  /** Tổng số bản ghi của một nhóm gồm cả nhóm con */
  function totalUsage(c: Category): number {
    return (
      (usage.get(c.id) ?? 0) +
      childrenOf(c.id).reduce((s, x) => s + totalUsage(x), 0)
    );
  }

  /* --------------------------- Tìm kiếm ------------------------- */

  const roots = useMemo(() => {
    const all = childrenOf(null);
    if (!keyword.trim()) return all;
    return all.filter(
      (c) =>
        matchSearch(`${c.name} ${c.description}`, keyword) ||
        childrenOf(c.id).some((ch) =>
          matchSearch(`${ch.name} ${ch.description}`, keyword)
        )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, keyword]);

  const parentOptions = useMemo(
    () =>
      childrenOf(null)
        .filter((c) => !editing || c.id !== editing.id)
        .map((c) => ({ value: c.id, label: c.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, editing]
  );

  /* --------------------------- Hành động ------------------------ */

  function openCreate(parentId = "") {
    setEditing(null);
    setPresetParent(parentId);
    setFormOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setPresetParent("");
    setFormOpen(true);
  }

  function confirmDelete(c: Category) {
    const used = usage.get(c.id) ?? 0;
    const kids = childrenOf(c.id).length;

    if (kids > 0) {
      toast.error(
        "Không xoá được",
        `${c.name} đang có ${kids} nhóm con. Hãy xoá hoặc chuyển nhóm con trước.`
      );
      return;
    }
    if (used > 0) {
      toast.error(
        "Không xoá được",
        `${c.name} đang được ${used} bản ghi sử dụng. Hãy chuyển sang nhóm khác trước khi xoá.`
      );
      return;
    }
    setDeleting(c);
  }

  const stat = useMemo(
    () => ({
      total: scoped.length,
      roots: childrenOf(null).length,
      unused: scoped.filter(
        (c) => (usage.get(c.id) ?? 0) === 0 && childrenOf(c.id).length === 0
      ).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, usage]
  );

  /* ------------------------------ Render ------------------------ */

  return (
    <PageContainer>
      <PageHeader
        title="Danh mục rủi ro"
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon={<IconPlus size={16} />}
              onClick={() => openCreate()}
            >
              Thêm nhóm
            </Button>
          )
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          {/* ------------------------- Bộ lọc ----------------------- */}
          <ContentCard className="flex flex-wrap items-center gap-2">
            <Segments
              items={[
                {
                  key: "Rủi ro",
                  label: "Nhóm rủi ro",
                  icon: <IconAlertTriangle size={15} />,
                },
                {
                  key: "Sự kiện",
                  label: "Nhóm sự kiện",
                  icon: <IconBolt size={15} />,
                },
              ]}
              value={group}
              onChange={(k) => {
                setGroup(k as Group);
                setKeyword("");
              }}
            />

            <SearchInput
              value={keyword}
              onChange={setKeyword}
              placeholder="Tìm theo tên nhóm"
              width={260}
            />

            <span className="ml-auto flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
              <Badge tone="neutral">{stat.total} nhóm</Badge>
              <Badge tone="brand">{stat.roots} nhóm cha</Badge>
              {stat.unused > 0 && (
                <Tooltip content="Nhóm chưa được bản ghi nào sử dụng">
                  <Badge tone="warning">{stat.unused} chưa dùng</Badge>
                </Tooltip>
              )}
            </span>
          </ContentCard>

          {/* -------------------------- Cây ------------------------- */}
          <ContentCard padded={false} className="overflow-hidden">
            {roots.length === 0 ? (
              <EmptyState
                icon={<IconCategory size={24} />}
                title="Chưa có nhóm nào"
                description={
                  keyword.trim()
                    ? "Không tìm thấy nhóm phù hợp với từ khoá."
                    : "Thêm nhóm để phân loại rủi ro theo cấu trúc của doanh nghiệp."
                }
                action={
                  canEdit && !keyword.trim() ? (
                    <Button
                      variant="primary"
                      icon={<IconPlus size={16} />}
                      onClick={() => openCreate()}
                    >
                      Thêm nhóm
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-border-light">
                {roots.map((root) => (
                  <div key={root.id}>
                    <CategoryRow
                      category={root}
                      isRoot
                      childCount={childrenOf(root.id).length}
                      directUsage={usage.get(root.id) ?? 0}
                      totalUsage={totalUsage(root)}
                      level={maxLevel.get(root.id) ?? null}
                      group={group}
                      canEdit={canEdit}
                      onAddChild={() => openCreate(root.id)}
                      onEdit={() => openEdit(root)}
                      onDelete={() => confirmDelete(root)}
                      onOpenList={() =>
                        router.push(
                          group === "Rủi ro"
                            ? "/rui-ro/so-dang-ky"
                            : "/su-kien/so-theo-doi"
                        )
                      }
                    />

                    {childrenOf(root.id).map((child) => (
                      <CategoryRow
                        key={child.id}
                        category={child}
                        childCount={0}
                        directUsage={usage.get(child.id) ?? 0}
                        totalUsage={usage.get(child.id) ?? 0}
                        level={maxLevel.get(child.id) ?? null}
                        group={group}
                        canEdit={canEdit}
                        onEdit={() => openEdit(child)}
                        onDelete={() => confirmDelete(child)}
                        onOpenList={() =>
                          router.push(
                            group === "Rủi ro"
                              ? "/rui-ro/so-dang-ky"
                              : "/su-kien/so-theo-doi"
                          )
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </ContentCard>

          <p className="text-center text-[12px] text-text-hint">
            Danh mục hỗ trợ tối đa 2 cấp: nhóm cha và nhóm con. Nhóm đang được
            sử dụng hoặc còn nhóm con thì không xoá được.
          </p>
        </div>
      </PageBody>

      {/* ========================= Hộp thoại ======================== */}
      <CategoryFormModal
        open={formOpen}
        record={editing}
        group={group}
        presetParent={presetParent}
        parentOptions={parentOptions}
        existing={scoped}
        actor={user.name}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setPresetParent("");
        }}
        onDone={(msg, detail) => {
          setFormOpen(false);
          setEditing(null);
          setPresetParent("");
          toast.success(msg, detail);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            categoryRepo.remove(deleting.id);
            toast.success("Đã xoá nhóm", `${deleting.name} đã được xoá.`);
          }
          setDeleting(null);
        }}
        tone="danger"
        title="Xoá nhóm danh mục"
        message={
          <>
            Bạn có chắc muốn xoá nhóm <b>{deleting?.name}</b>? Hành động này
            không thể hoàn tác.
          </>
        }
        confirmText="Xoá"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Một dòng danh mục                                        */
/* ================================================================== */

function CategoryRow({
  category,
  isRoot = false,
  childCount,
  directUsage,
  totalUsage,
  level,
  group,
  canEdit,
  onAddChild,
  onEdit,
  onDelete,
  onOpenList,
}: {
  category: Category;
  isRoot?: boolean;
  childCount: number;
  directUsage: number;
  totalUsage: number;
  level: RiskLevelValue | null;
  group: Group;
  canEdit: boolean;
  onAddChild?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenList: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#FAFAFA]",
        !isRoot && "bg-surface-alt/40 pl-11"
      )}
    >
      {!isRoot && (
        <IconChevronRight size={14} className="-ml-6 shrink-0 text-text-hint" />
      )}

      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl",
          isRoot
            ? "bg-brand-light text-brand"
            : "bg-lv-neutral-bg text-lv-neutral-text"
        )}
      >
        {isRoot ? <IconFolder size={17} /> : <IconCategory size={15} />}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[13px] text-text-primary",
            isRoot && "font-semibold"
          )}
        >
          {category.name}
        </p>
        <p className="truncate text-[12px] text-text-secondary">
          {category.description || "Chưa có mô tả"}
        </p>
      </div>

      {isRoot && childCount > 0 && (
        <Badge tone="neutral" size="sm">
          {childCount} nhóm con
        </Badge>
      )}

      {level && (
        <Tooltip content="Mức rủi ro cao nhất trong nhóm">
          <Badge tone={LEVEL_TONE[level]} size="sm" dot>
            {level}
          </Badge>
        </Tooltip>
      )}

      <button
        type="button"
        onClick={onOpenList}
        className="w-[130px] shrink-0 text-right text-[12px] text-text-secondary transition-colors hover:text-brand"
        title={`Xem danh sách ${group === "Rủi ro" ? "rủi ro" : "sự kiện"}`}
      >
        {isRoot && childCount > 0 ? (
          <>
            <b className="text-text-primary">{totalUsage}</b> bản ghi
            {directUsage !== totalUsage && (
              <span className="text-text-hint"> ({directUsage} trực tiếp)</span>
            )}
          </>
        ) : (
          <>
            <b className="text-text-primary">{directUsage}</b> bản ghi
          </>
        )}
      </button>

      {canEdit && (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {isRoot && onAddChild && (
            <Tooltip content="Thêm nhóm con">
              <IconButton label="Thêm nhóm con" onClick={onAddChild}>
                <IconPlus size={16} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip content="Sửa">
            <IconButton label="Sửa" onClick={onEdit}>
              <IconEdit size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Xoá">
            <IconButton label="Xoá" onClick={onDelete}>
              <IconTrash size={16} className="text-danger" />
            </IconButton>
          </Tooltip>
        </span>
      )}
    </div>
  );
}

/* ================================================================== */
/* Hộp thoại thêm / sửa nhóm                                        */
/* ================================================================== */

function CategoryFormModal({
  open,
  record,
  group,
  presetParent,
  parentOptions,
  existing,
  actor,
  onClose,
  onDone,
}: {
  open: boolean;
  record: Category | null;
  group: Group;
  presetParent: string;
  parentOptions: { value: string; label: string }[];
  existing: Category[];
  actor: string;
  onClose: () => void;
  onDone: (message: string, detail?: string) => void;
}) {
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState("");

  const key = `${open}-${record?.id ?? "new"}-${presetParent}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setErrors({});
      setForm(
        record
          ? {
              name: record.name,
              parentId: record.parentId ?? "",
              description: record.description,
            }
          : { ...EMPTY_FORM, parentId: presetParent }
      );
    }
  }

  function patch(next: Partial<CategoryForm>) {
    setForm((p) => ({ ...p, ...next }));
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

  function save() {
    const name = form.name.trim();
    const err: Record<string, string> = {};

    if (!name) {
      err.name = "Bắt buộc nhập tên nhóm";
    } else {
      const duplicated = existing.some(
        (c) =>
          c.id !== record?.id &&
          c.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (duplicated) err.name = "Tên nhóm đã tồn tại trong danh mục này";
    }

    // Nhóm đang có nhóm con thì không được biến thành nhóm con
    if (record && form.parentId) {
      const hasChild = existing.some((c) => c.parentId === record.id);
      if (hasChild)
        err.parentId =
          "Nhóm này đang có nhóm con nên không thể chuyển thành nhóm con";
    }

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    const payload = {
      name,
      group,
      parentId: form.parentId || null,
      description: form.description.trim(),
    };

    if (record) {
      categoryRepo.update(record.id, payload);
      onDone("Đã lưu nhóm", `${name} đã được cập nhật.`);
    } else {
      categoryRepo.create(payload, actor);
      onDone("Đã thêm nhóm", `${name} đã được thêm vào danh mục ${group}.`);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={record ? "Sửa nhóm danh mục" : `Thêm nhóm ${group.toLowerCase()}`}
      description={`Danh mục ${group} dùng để phân loại bản ghi trong hệ thống`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={save}>
            {record ? "Lưu thay đổi" : "Thêm nhóm"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input
          label="Tên nhóm"
          required
          placeholder="Ví dụ: Rủi ro an toàn thông tin"
          value={form.name}
          error={errors.name}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <Select
          label="Nhóm cha"
          clearable
          searchable
          placeholder="Để trống nếu đây là nhóm cấp 1"
          options={parentOptions}
          value={form.parentId || null}
          error={errors.parentId}
          hint={
            errors.parentId
              ? undefined
              : "Danh mục hỗ trợ tối đa 2 cấp, nhóm con không thể có nhóm con"
          }
          onChange={(v) => patch({ parentId: v ?? "" })}
        />

        <Textarea
          label="Mô tả"
          rows={3}
          maxLength={300}
          showCount
          placeholder="Phạm vi áp dụng của nhóm này"
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </div>
    </Modal>
  );
}
