"use client";

import { DB_PREFIX } from "./keys";

type Listener = () => void;

/** Mảng rỗng dùng chung để giữ tham chiếu ổn định khi SSR */
const EMPTY: readonly unknown[] = Object.freeze([]);

const cache = new Map<string, unknown[]>();
const listeners = new Map<string, Set<Listener>>();

export const isBrowser = typeof window !== "undefined";

/* ------------------------- Đọc / ghi ------------------------------ */

export function readCollection<T>(key: string): T[] {
  if (!isBrowser) return EMPTY as T[];

  const cached = cache.get(key);
  if (cached) return cached as T[];

  let rows: T[] = [];
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed as T[];
    }
  } catch {
    rows = [];
  }
  cache.set(key, rows as unknown[]);
  return rows;
}

export function writeCollection<T>(key: string, rows: T[]): void {
  cache.set(key, rows as unknown[]);
  if (isBrowser) {
    try {
      window.localStorage.setItem(key, JSON.stringify(rows));
    } catch {
      // localStorage đầy hoặc bị chặn -> vẫn giữ dữ liệu trong bộ nhớ
    }
  }
  emit(key);
}

export function readRaw(key: string): string | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* bỏ qua */
  }
}

export function removeKey(key: string): void {
  cache.delete(key);
  if (isBrowser) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* bỏ qua */
    }
  }
  emit(key);
}

/** Xoá toàn bộ dữ liệu của ứng dụng */
export function clearAll(): void {
  if (!isBrowser) return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(DB_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* bỏ qua */
    }
  });
  cache.clear();
  listeners.forEach((set) => set.forEach((fn) => fn()));
}

/* --------------------------- Sự kiện ------------------------------ */

export function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

function emit(key: string): void {
  listeners.get(key)?.forEach((fn) => fn());
}

/* --------------- Đồng bộ khi mở nhiều tab trình duyệt -------------- */

let storageBound = false;

export function bindStorageSync(): void {
  if (!isBrowser || storageBound) return;
  storageBound = true;
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(DB_PREFIX)) return;
    cache.delete(e.key);
    emit(e.key);
  });
}

/** Server snapshot dùng cho useSyncExternalStore */
export function emptySnapshot<T>(): T[] {
  return EMPTY as T[];
}
