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

export default function TabNhomSuKien({ canEdit }: { canEdit: boolean }) {
  const categories = useCollection(categoryRepo) as unknown as AnyCategory[];
  const events = useCollection(eventRepo) as unknown as WithCategory[];
  const risks = useCollection(riskRepo) as unknown as WithCategory[];

  /* Số sự kiện gắn với từng nhóm */
  const usageOf = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((e) => {
      if (!e.categoryId) return;
      map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + 1);
    });
    return map;
  }, [events]);

  const riskUsedIds = useMemo(
    () =>
      new Set(risks.map((r) => r.categoryId).filter((x): x is string => !!x)),
    [risks],
  );

  const scope = useMemo(
    () =>
      resolveScope(categories, "event", new Set(usageOf.keys()), riskUsedIds),
    [categories, usageOf, riskUsedIds],
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
      usageLabel="sự kiện"
      entityLabel="nhóm sự kiện"
      codeHint="VD: SK-VH"
      namePlaceholder="VD: Sự kiện gián đoạn vận hành"
      note={`Nhóm sự kiện là cơ sở để phát hiện nguyên nhân chung. Nếu một nhóm phát sinh dồn dập trong vài tháng, đó là dấu hiệu quy trình hoặc kiểm soát của mảng đó đang có vấn đề hệ thống. ${SCOPE_NOTE[scope.strategy]}`}
    />
  );
}
