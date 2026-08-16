"use client";

import { CODE_PREFIX, KEYS } from "./keys";
import { createRepository } from "./repository";
import type {
  Category,
  Control,
  ControlException,
  ControlTest,
  Deficiency,
  Employee,
  GrcEvent,
  ITSystem,
  Kppn,
  Kri,
  KriReading,
  Objective,
  Process,
  Risk,
  Unit,
} from "@/lib/domain/schema";

export * from "./keys";
export * from "./repository";
export * from "./store";

/* --------------------------- Danh mục ----------------------------- */
export const unitRepo = createRepository<Unit>(KEYS.units, CODE_PREFIX.unit);
export const employeeRepo = createRepository<Employee>(
  KEYS.employees,
  CODE_PREFIX.employee,
);
export const categoryRepo = createRepository<Category>(
  KEYS.categories,
  CODE_PREFIX.category,
);
export const processRepo = createRepository<Process>(
  KEYS.processes,
  CODE_PREFIX.process,
);
export const systemRepo = createRepository<ITSystem>(
  KEYS.systems,
  CODE_PREFIX.system,
);
export const objectiveRepo = createRepository<Objective>(
  KEYS.objectives,
  CODE_PREFIX.objective,
);

/* -------------------------- Nghiệp vụ ----------------------------- */
export const riskRepo = createRepository<Risk>(KEYS.risks, CODE_PREFIX.risk);
export const controlRepo = createRepository<Control>(
  KEYS.controls,
  CODE_PREFIX.control,
);
export const controlTestRepo = createRepository<ControlTest>(
  KEYS.controlTests,
  CODE_PREFIX.controlTest,
);
export const controlExceptionRepo = createRepository<ControlException>(
  KEYS.controlExceptions,
  CODE_PREFIX.controlException,
);
export const deficiencyRepo = createRepository<Deficiency>(
  KEYS.deficiencies,
  CODE_PREFIX.deficiency,
);
export const kppnRepo = createRepository<Kppn>(KEYS.kppns, CODE_PREFIX.kppn);
export const eventRepo = createRepository<GrcEvent>(
  KEYS.events,
  CODE_PREFIX.event,
);
export const kriRepo = createRepository<Kri>(KEYS.kris, CODE_PREFIX.kri);
export const kriReadingRepo = createRepository<KriReading>(
  KEYS.kriReadings,
  CODE_PREFIX.kriReading,
);

/** Gom lại để export/import và reset dữ liệu */
export const ALL_REPOS = {
  units: unitRepo,
  employees: employeeRepo,
  categories: categoryRepo,
  processes: processRepo,
  systems: systemRepo,
  objectives: objectiveRepo,
  risks: riskRepo,
  controls: controlRepo,
  controlTests: controlTestRepo,
  controlExceptions: controlExceptionRepo,
  deficiencies: deficiencyRepo,
  kppns: kppnRepo,
  events: eventRepo,
  kris: kriRepo,
  kriReadings: kriReadingRepo,
} as const;

export type RepoName = keyof typeof ALL_REPOS;

/* ------------------- Tra cứu tên theo id nhanh -------------------- */

export function nameById<T extends { id: string; name: string }>(
  rows: T[],
  id: string | null | undefined,
  fallback = "--",
): string {
  if (!id) return fallback;
  return rows.find((r) => r.id === id)?.name ?? fallback;
}

export function namesByIds<T extends { id: string; name: string }>(
  rows: T[],
  ids: string[] | null | undefined,
): string[] {
  if (!ids || ids.length === 0) return [];
  const map = new Map(rows.map((r) => [r.id, r.name]));
  return ids.map((id) => map.get(id)).filter((v): v is string => !!v);
}
