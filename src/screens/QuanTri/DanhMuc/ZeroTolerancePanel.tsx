"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconInfoCircle,
  IconLockCheck,
} from "@tabler/icons-react";
import {
  Badge,
  Checkbox,
  ConfirmDialog,
  Tooltip,
  useToast,
} from "@/components/ui";
import { categoryRepo, riskRepo, useCollection } from "@/lib/db";
import { useCategoryTree, type CategoryNode } from "@/lib/domain/category-tree";
import { branchIdsOf } from "@/lib/domain/tree-utils";
import { cn } from "@/lib/cn";

/* ==================================================================
   Cấu hình chính sách rủi ro không khoan nhượng theo nhánh danh mục.

   Đây là màn CẤU HÌNH CHÍNH SÁCH, không phải màn quản lý danh mục. Việc
   thêm sửa xoá danh mục vẫn nằm ở bảng phía dưới.

   Nguyên tắc nghiệp vụ:

     RỦI RO KHÔNG KHOAN NHƯỢNG LÀ THUỘC TÍNH CỦA DANH MỤC, KHÔNG PHẢI
     LỰA CHỌN CỦA NGƯỜI KHAI BÁO.

   Trước đây người khai báo tự bật cờ ở từng rủi ro, nên hai người khai
   cùng một loại rủi ro có thể ra hai kết luận khác nhau mà không ai sai,
   vì chẳng có chuẩn nào để đối chiếu.

   Ba quyết định thiết kế của panel này:

   1. BẬT Ở CHA THÌ CON CHÁU THỪA HƯỞNG, và ô tích của con bị khoá. Nếu
      cho bật trùng ở cả cha lẫn con thì sau này gỡ cờ ở cha, con vẫn
      giữ cờ, và không ai nhớ nút nào mới là gốc của chính sách.

   2. ĐỔI CHÍNH SÁCH THÌ CẬP NHẬT NGAY CÁC RỦI RO ĐANG CÓ. Nếu chỉ đổi
      ở danh mục thì hồ sơ rủi ro cũ vẫn hiện cờ cũ, và người xem sẽ
      thấy badge mâu thuẫn với chính sách đang hiển thị.

   3. BẬT CỜ THÌ ĐỔI LUÔN PHƯƠNG ÁN CHẤP NHẬN. riskFormSchema cấm rủi ro
      không khoan nhượng chọn Chấp nhận, nên nếu để nguyên thì hồ sơ đó
      thành không hợp lệ và bị chặn lúc lưu ở một chỗ rất xa nguyên nhân.
   ================================================================== */

interface SimpleRepo {
  update: (id: string, patch: Record<string, unknown>) => void;
}

interface RiskLite {
  id: string;
  code: string;
  name?: string;
  categoryId?: string;
  isZeroTolerance?: boolean;
  treatment?: string;
}

const cRepo = categoryRepo as unknown as SimpleRepo;
const rRepo = riskRepo as unknown as SimpleRepo;

interface PendingToggle {
  node: CategoryNode;
  next: boolean;
  affected: RiskLite[];
  acceptRisks: RiskLite[];
}

export default function ZeroTolerancePanel({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const catTree = useCategoryTree("Rủi ro");
  const risks = useCollection(riskRepo) as unknown as RiskLite[];

  /* Giữ danh sách nút ĐANG THU GỌN thay vì đang mở, để mặc định mở hết
     mà không phải chờ dữ liệu nạp xong rồi mới khởi tạo state */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingToggle | null>(null);

  const riskCountOf = useMemo(() => {
    const map = new Map<string, number>();
    risks.forEach((r) => {
      if (!r.categoryId) return;
      map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + 1);
    });
    return map;
  }, [risks]);

  function risksInBranch(id: string): RiskLite[] {
    const ids = new Set(branchIdsOf(id, catTree.index));
    return risks.filter((r) => r.categoryId && ids.has(r.categoryId));
  }

  function branchRiskCount(id: string): number {
    return risksInBranch(id).length;
  }

  const markedCount = useMemo(
    () =>
      Array.from(catTree.index.values()).filter(
        (n) => n.data.isZeroToleranceBranch === true,
      ).length,
    [catTree.index],
  );

  const zeroToleranceRiskCount = useMemo(
    () => risks.filter((r) => r.isZeroTolerance).length,
    [risks],
  );

  /* --------------------------- Thao tác ---------------------------- */

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function ask(node: CategoryNode, next: boolean) {
    const affected = risksInBranch(node.id);
    setPending({
      node,
      next,
      affected,
      acceptRisks: next
        ? affected.filter((r) => r.treatment === "Chấp nhận")
        : [],
    });
  }

  function apply() {
    if (!pending) return;
    const { node, next, affected, acceptRisks } = pending;

    cRepo.update(node.id, { isZeroToleranceBranch: next });

    affected.forEach((r) => {
      const patch: Record<string, unknown> = { isZeroTolerance: next };
      if (next && r.treatment === "Chấp nhận") patch.treatment = "Giảm thiểu";
      rRepo.update(r.id, patch);
    });

    setPending(null);

    const base = next
      ? `Nhánh ${node.label} đã thành không khoan nhượng.`
      : `Đã gỡ chính sách không khoan nhượng khỏi nhánh ${node.label}.`;

    const detail =
      affected.length === 0
        ? "Chưa có rủi ro nào thuộc nhánh này."
        : `${affected.length} rủi ro đã được cập nhật.${
            acceptRisks.length > 0
              ? ` Trong đó ${acceptRisks.length} rủi ro đang chọn phương án Chấp nhận đã chuyển sang Giảm thiểu.`
              : ""
          }`;

    toast.success(base, detail);
  }

  /* ---------------------------- Render ----------------------------- */

  function renderNode(node: CategoryNode, inheritedFromParent: boolean) {
    const own = node.data.isZeroToleranceBranch === true;
    const inherited = inheritedFromParent && !own;
    const hasChildren = node.children.length > 0;
    const open = !collapsed.has(node.id);
    const count = branchRiskCount(node.id);

    return (
      <div key={node.id} className="flex flex-col">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-ctrl pr-2.5 transition-colors",
            own
              ? "bg-lv-critical-bg"
              : inherited
                ? "bg-lv-medium-bg/40"
                : "hover:bg-[#FAFAFA]",
          )}
          style={{ paddingLeft: 4 + node.level * 18 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapse(node.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ctrl text-icon-neutral hover:bg-surface-alt"
              aria-label={open ? "Thu gọn" : "Mở rộng"}
            >
              {open ? (
                <IconChevronDown size={14} />
              ) : (
                <IconChevronRight size={14} />
              )}
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" />
          )}

          <span className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
            <Tooltip
              content={
                inherited
                  ? "Đang thừa hưởng từ nhánh cha. Muốn gỡ thì gỡ ở nút cha đang bật cờ."
                  : own
                    ? "Bỏ tích để gỡ chính sách khỏi cả nhánh này"
                    : "Tích để áp chính sách không khoan nhượng cho nhánh này và toàn bộ danh mục con"
              }
            >
              <span className="inline-flex">
                <Checkbox
                  checked={own || inherited}
                  disabled={!canEdit || inherited}
                  onChange={(e) => ask(node, e.target.checked)}
                />
              </span>
            </Tooltip>

            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[13px]",
                  own
                    ? "font-medium text-lv-critical-text"
                    : "text-text-primary",
                )}
              >
                {node.label}
              </span>
              {node.data.description && (
                <span className="block truncate text-[11px] text-text-hint">
                  {node.data.description}
                </span>
              )}
            </span>

            {own && (
              <Badge tone="danger" size="sm">
                Không khoan nhượng
              </Badge>
            )}
            {inherited && (
              <Badge tone="warning" size="sm">
                Thừa hưởng
              </Badge>
            )}

            <span className="shrink-0 text-[11px] text-text-secondary">
              {count === 0 ? "chưa có rủi ro" : `${count} rủi ro`}
            </span>
          </span>
        </div>

        {hasChildren && open && (
          <div className="flex flex-col">
            {node.children.map((c) =>
              renderNode(c, own || inheritedFromParent),
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border-light p-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconLockCheck size={17} className="shrink-0 text-lv-critical-text" />
        <span className="text-[13px] font-semibold text-text-primary">
          Chính sách rủi ro không khoan nhượng
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
          <Badge tone="neutral" size="sm">
            {markedCount} nhánh được đánh dấu
          </Badge>
          <Badge
            tone={zeroToleranceRiskCount > 0 ? "danger" : "neutral"}
            size="sm"
          >
            {zeroToleranceRiskCount} rủi ro đang áp
          </Badge>
        </span>
      </div>

      <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
        <IconInfoCircle size={16} className="mt-px shrink-0" />
        <span>
          Đánh dấu ở đây thì <b>mọi rủi ro thuộc nhánh</b> tự động là rủi ro
          không khoan nhượng, và không chọn được phương án <b>Chấp nhận</b>.
          Người khai báo <b>không tự bật được cờ này</b> ở từng rủi ro nữa, nên
          hai người khai cùng một loại rủi ro sẽ ra cùng một kết luận.
        </span>
      </div>

      {catTree.tree.length === 0 ? (
        <p className="rounded-ctrl bg-surface-alt px-3 py-6 text-center text-[12px] text-text-hint">
          Chưa có nhóm rủi ro nào để cấu hình. Thêm nhóm ở bảng bên dưới trước.
        </p>
      ) : (
        <div className="flex max-h-[360px] flex-col gap-0.5 overflow-y-auto rounded-ctrl border border-border-light p-1.5">
          {catTree.tree.map((n) => renderNode(n, false))}
        </div>
      )}

      {!canEdit && (
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-hint">
          <IconAlertTriangle size={13} className="mt-px shrink-0" />
          Chỉ vai trò quản trị mới đổi được chính sách này.
        </p>
      )}

      {/* ---------------------- Xác nhận thay đổi ---------------------- */}
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={apply}
        title={
          pending?.next
            ? "Áp chính sách không khoan nhượng"
            : "Gỡ chính sách không khoan nhượng"
        }
        message={
          pending
            ? [
                pending.next
                  ? `Nhánh "${pending.node.label}" và toàn bộ danh mục con sẽ thành không khoan nhượng.`
                  : `Nhánh "${pending.node.label}" và toàn bộ danh mục con sẽ thôi áp chính sách này.`,
                pending.affected.length === 0
                  ? "Hiện chưa có rủi ro nào thuộc nhánh này, nên không hồ sơ nào bị ảnh hưởng."
                  : `${pending.affected.length} rủi ro đang thuộc nhánh sẽ được cập nhật ngay.`,
                pending.acceptRisks.length > 0
                  ? `Trong đó ${pending.acceptRisks.length} rủi ro đang chọn phương án Chấp nhận sẽ tự chuyển sang Giảm thiểu, vì rủi ro không khoan nhượng không được chấp nhận.`
                  : "",
              ]
                .filter((x) => x !== "")
                .join(" ")
            : ""
        }
        confirmText={pending?.next ? "Áp chính sách" : "Gỡ chính sách"}
        cancelText="Huỷ"
      />
    </section>
  );
}
