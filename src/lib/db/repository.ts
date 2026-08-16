"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  emptySnapshot,
  readCollection,
  subscribe,
  writeCollection,
} from "./store";
import type { BaseEntity } from "@/lib/domain/schema";

/* --------------------------- Tiện ích ----------------------------- */

let counter = 0;

export function makeId(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Sinh mã dạng RISK-2026-001, tự tăng theo năm hiện tại */
export function nextCode(prefix: string, existing: string[]): string {
  const year = new Date().getFullYear();
  const head = `${prefix}-${year}-`;
  let max = 0;
  for (const code of existing) {
    if (!code.startsWith(head)) continue;
    const n = Number(code.slice(head.length));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${head}${String(max + 1).padStart(3, "0")}`;
}

/* -------------------------- Repository ---------------------------- */

export type CreateInput<T extends BaseEntity> = Omit<
  T,
  "id" | "code" | "createdAt" | "updatedAt" | "createdBy"
> &
  Partial<Pick<T, "id" | "code" | "createdBy">>;

export interface Repository<T extends BaseEntity> {
  key: string;
  codePrefix: string;
  list: () => T[];
  getById: (id: string) => T | undefined;
  getByCode: (code: string) => T | undefined;
  create: (input: CreateInput<T>, actor?: string) => T;
  createMany: (inputs: CreateInput<T>[], actor?: string) => T[];
  update: (id: string, patch: Partial<T>) => T | undefined;
  updateMany: (ids: string[], patch: Partial<T>) => void;
  remove: (id: string) => void;
  removeMany: (ids: string[]) => void;
  replaceAll: (rows: T[]) => void;
  clear: () => void;
  subscribe: (fn: () => void) => () => void;
}

export function createRepository<T extends BaseEntity>(
  key: string,
  codePrefix: string,
): Repository<T> {
  const list = () => readCollection<T>(key);

  function buildEntity(input: CreateInput<T>, rows: T[], actor: string): T {
    const ts = nowIso();
    return {
      ...(input as object),
      id: input.id ?? makeId(codePrefix.toLowerCase()),
      code:
        input.code ??
        nextCode(
          codePrefix,
          rows.map((r) => r.code),
        ),
      createdAt: ts,
      updatedAt: ts,
      createdBy: input.createdBy ?? actor,
    } as T;
  }

  return {
    key,
    codePrefix,
    list,

    getById: (id) => list().find((r) => r.id === id),
    getByCode: (code) => list().find((r) => r.code === code),

    create(input, actor = "") {
      const rows = list();
      const entity = buildEntity(input, rows, actor);
      writeCollection(key, [entity, ...rows]);
      return entity;
    },

    createMany(inputs, actor = "") {
      const rows = [...list()];
      const created: T[] = [];
      for (const input of inputs) {
        const entity = buildEntity(input, rows, actor);
        rows.unshift(entity);
        created.push(entity);
      }
      writeCollection(key, rows);
      return created;
    },

    update(id, patch) {
      const rows = list();
      let updated: T | undefined;
      const next = rows.map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...patch, id: r.id, updatedAt: nowIso() };
        return updated;
      });
      if (updated) writeCollection(key, next);
      return updated;
    },

    updateMany(ids, patch) {
      const set = new Set(ids);
      const ts = nowIso();
      const next = list().map((r) =>
        set.has(r.id) ? { ...r, ...patch, id: r.id, updatedAt: ts } : r,
      );
      writeCollection(key, next);
    },

    remove(id) {
      writeCollection(
        key,
        list().filter((r) => r.id !== id),
      );
    },

    removeMany(ids) {
      const set = new Set(ids);
      writeCollection(
        key,
        list().filter((r) => !set.has(r.id)),
      );
    },

    replaceAll(rows) {
      writeCollection(key, rows);
    },

    clear() {
      writeCollection(key, [] as T[]);
    },

    subscribe: (fn) => subscribe(key, fn),
  };
}

/* ------------------------- React binding -------------------------- */

/** Lấy dữ liệu của một repository, tự render lại khi dữ liệu đổi */
export function useCollection<T extends BaseEntity>(repo: Repository<T>): T[] {
  const sub = useCallback((fn: () => void) => repo.subscribe(fn), [repo]);
  const snapshot = useCallback(() => repo.list(), [repo]);
  return useSyncExternalStore(sub, snapshot, emptySnapshot<T>);
}

/** Lấy 1 bản ghi theo id, tự cập nhật khi dữ liệu đổi */
export function useRecord<T extends BaseEntity>(
  repo: Repository<T>,
  id: string | null | undefined,
): T | undefined {
  const rows = useCollection(repo);
  if (!id) return undefined;
  return rows.find((r) => r.id === id || r.code === id);
}
