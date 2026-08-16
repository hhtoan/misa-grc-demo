"use client";

import { useMemo } from "react";
import {
  categoryRepo,
  employeeRepo,
  objectiveRepo,
  processRepo,
  systemRepo,
  unitRepo,
  useCollection,
} from "@/lib/db";
import type {
  Category,
  Employee,
  ITSystem,
  Objective,
  Process,
  Unit,
} from "./schema";

/** Kiểu option tối giản, tương thích với Select và FilterCombobox */
export interface LookupOption {
  value: string;
  label: string;
  description?: string;
}

function nameMapOf<T extends { id: string; name: string }>(rows: T[]) {
  return new Map(rows.map((r) => [r.id, r.name]));
}

function toOption<T extends { id: string; name: string }>(
  rows: T[],
  describe?: (row: T) => string | undefined
): LookupOption[] {
  return rows.map((r) => ({
    value: r.id,
    label: r.name,
    description: describe?.(r),
  }));
}

export interface Lookups {
  /* ------- dữ liệu thô ------- */
  units: Unit[];
  employees: Employee[];
  categories: Category[];
  riskCategories: Category[];
  eventCategories: Category[];
  processes: Process[];
  systems: ITSystem[];
  objectives: Objective[];

  /* ------- option cho Select ------- */
  unitOptions: LookupOption[];
  employeeOptions: LookupOption[];
  riskCategoryOptions: LookupOption[];
  eventCategoryOptions: LookupOption[];
  processOptions: LookupOption[];
  systemOptions: LookupOption[];
  objectiveOptions: LookupOption[];

  /* ------- tra cứu tên ------- */
  unitName: (id: string | null | undefined, fallback?: string) => string;
  employeeName: (id: string | null | undefined, fallback?: string) => string;
  categoryName: (id: string | null | undefined, fallback?: string) => string;
  processName: (id: string | null | undefined, fallback?: string) => string;
  systemName: (id: string | null | undefined, fallback?: string) => string;
  objectiveName: (id: string | null | undefined, fallback?: string) => string;

  /* ------- tra cứu bản ghi ------- */
  employeeById: (id: string | null | undefined) => Employee | undefined;
  unitById: (id: string | null | undefined) => Unit | undefined;
  objectivesByIds: (ids: string[] | null | undefined) => Objective[];
}

/**
 * Đọc toàn bộ danh mục nền tảng một lần, dùng chung cho các màn hình
 * nghiệp vụ. Tự render lại khi dữ liệu danh mục thay đổi.
 */
export function useLookups(): Lookups {
  const units = useCollection(unitRepo);
  const employees = useCollection(employeeRepo);
  const categories = useCollection(categoryRepo);
  const processes = useCollection(processRepo);
  const systems = useCollection(systemRepo);
  const objectives = useCollection(objectiveRepo);

  return useMemo<Lookups>(() => {
    const unitMap = nameMapOf(units);
    const employeeMap = nameMapOf(employees);
    const categoryMap = nameMapOf(categories);
    const processMap = nameMapOf(processes);
    const systemMap = nameMapOf(systems);
    const objectiveMap = nameMapOf(objectives);

    const riskCategories = categories.filter((c) => c.group === "Rủi ro");
    const eventCategories = categories.filter((c) => c.group === "Sự kiện");

    const get = (map: Map<string, string>) =>
      (id: string | null | undefined, fallback = "--") =>
        id ? (map.get(id) ?? fallback) : fallback;

    return {
      units,
      employees,
      categories,
      riskCategories,
      eventCategories,
      processes,
      systems,
      objectives,

      unitOptions: toOption(units, (u) => u.level),
      employeeOptions: toOption(employees, (e) =>
        [e.title, unitMap.get(e.unitId)].filter(Boolean).join(" - ")
      ),
      riskCategoryOptions: toOption(riskCategories, (c) =>
        c.parentId ? categoryMap.get(c.parentId) : undefined
      ),
      eventCategoryOptions: toOption(eventCategories),
      processOptions: toOption(processes, (p) => unitMap.get(p.ownerUnitId)),
      systemOptions: toOption(systems, (s) => s.type),
      objectiveOptions: objectives.map((o) => ({
        value: o.id,
        label: o.name,
        description: `${o.code} - ${o.perspective} - ${o.level}`,
      })),

      unitName: get(unitMap),
      employeeName: get(employeeMap),
      categoryName: get(categoryMap),
      processName: get(processMap),
      systemName: get(systemMap),
      objectiveName: get(objectiveMap),

      employeeById: (id) => (id ? employees.find((e) => e.id === id) : undefined),
      unitById: (id) => (id ? units.find((u) => u.id === id) : undefined),
      objectivesByIds: (ids) =>
        !ids || ids.length === 0
          ? []
          : objectives.filter((o) => ids.includes(o.id)),
    };
  }, [units, employees, categories, processes, systems, objectives]);
}
