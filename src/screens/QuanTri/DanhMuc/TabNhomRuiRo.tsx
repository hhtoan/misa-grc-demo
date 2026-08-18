"use client";

import { useMemo } from "react";
import { categoryRepo, eventRepo, riskRepo, useCollection } from "@/lib/db";
import CategoryTable, {
  type CategoryRecord,
  type SimpleRepo,
} from "./CategoryTable";
import { SCOPE_NOTE, resolveScope, type AnyCategory } from "./category-scope";

interface WithCategory {
  categoryId?: string;
}

const cRepo = categoryRepo as unknown as SimpleRepo<CategoryRecord>;

export default function TabNhomRuiRo({ canEdit }: { canEdit: boolean }) {
  const categories = useCollection(categoryRepo) as unknown as AnyCategory[];
  const risks = useCollection(riskRepo) as unknown as WithCategory[];
  const events = useCollection(eventRepo) as unknown as WithCategory[];

  /* Số rủi ro gắn với từng nhóm */
  const usageOf = useMemo(() => {
    const map = new Map<string, number>();
    risks.forEach((r) => {
      if (!r.categoryId) return;
      map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + 1);
    });
    return map;
  }, [risks]);

  const eventUsedIds = useMemo(
    () =>
      new Set(events.map((e) => e.categoryId).filter((x): x is string => !!x)),
    [events],
  );

  const scope = useMemo(
    () =>
      resolveScope(categories, "risk", new Set(usageOf.keys()), eventUsedIds),
    [categories, usageOf, eventUsedIds],
  );

  const records = useMemo(
    () => categories.filter(scope.match) as unknown as CategoryRecord[],
    [categories, scope],
  );

  return (
    <CategoryTable
      canEdit={canEdit}
      records={records}
      repo={cRepo}
      createPatch={scope.createPatch}
      usageOf={usageOf}
      usageLabel="rủi ro"
      entityLabel="nhóm rủi ro"
      codeHint="VD: RR-CNTT"
      namePlaceholder="VD: Rủi ro công nghệ thông tin"
      note={`Nhóm rủi ro quyết định cách tổng hợp báo cáo theo loại rủi ro. Nhóm đang được rủi ro tham chiếu thì không xoá được, hãy chuyển sang Ngừng sử dụng để giữ nguyên số liệu các kỳ trước. ${SCOPE_NOTE[scope.strategy]}`}
    />
  );
}
