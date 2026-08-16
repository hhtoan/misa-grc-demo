"use client";

import {
  ALL_REPOS,
  DATA_VERSION,
  KEYS,
  bindStorageSync,
  clearAll,
  readRaw,
  writeRaw,
  type RepoName,
  type Repository,
} from "@/lib/db";
import type { BaseEntity } from "@/lib/domain/schema";

import {
  SEED_CATEGORIES,
  SEED_EMPLOYEES,
  SEED_OBJECTIVES,
  SEED_PROCESSES,
  SEED_SYSTEMS,
  SEED_UNITS,
} from "./master";
import { SEED_RISKS } from "./risks";
import {
  SEED_CONTROLS,
  SEED_CONTROL_EXCEPTIONS,
  SEED_CONTROL_TESTS,
} from "./controls";
import { SEED_DEFICIENCIES } from "./deficiencies";
import { SEED_KPPNS } from "./kppns";
import { SEED_EVENTS } from "./events";
import { SEED_KRIS, SEED_KRI_READINGS } from "./kris";

/* ==================================================================
   Xuất lại toàn bộ dữ liệu mẫu để nơi khác dùng khi cần
   ================================================================== */

export * from "./base";
export * from "./master";
export * from "./risks";
export * from "./controls";
export * from "./deficiencies";
export * from "./kppns";
export * from "./events";
export * from "./kris";

/* ==================================================================
   Bộ dữ liệu mẫu, khoá theo đúng tên repository
   ================================================================== */

type SeedDataset = {
  [K in RepoName]: ReturnType<(typeof ALL_REPOS)[K]["list"]>;
};

export const SEED_DATASET: SeedDataset = {
  units: SEED_UNITS,
  employees: SEED_EMPLOYEES,
  categories: SEED_CATEGORIES,
  processes: SEED_PROCESSES,
  systems: SEED_SYSTEMS,
  objectives: SEED_OBJECTIVES,
  risks: SEED_RISKS,
  controls: SEED_CONTROLS,
  controlTests: SEED_CONTROL_TESTS,
  controlExceptions: SEED_CONTROL_EXCEPTIONS,
  deficiencies: SEED_DEFICIENCIES,
  kppns: SEED_KPPNS,
  events: SEED_EVENTS,
  kris: SEED_KRIS,
  kriReadings: SEED_KRI_READINGS,
};

/** Nhãn tiếng Việt của từng bộ dữ liệu, dùng cho màn hình Quản trị */
export const REPO_LABEL: Record<RepoName, string> = {
  units: "Đơn vị",
  employees: "Nhân sự",
  categories: "Danh mục rủi ro & sự kiện",
  processes: "Quy trình",
  systems: "Hệ thống CNTT",
  objectives: "Mục tiêu",
  risks: "Rủi ro",
  controls: "Kiểm soát",
  controlTests: "Kết quả kiểm tra kiểm soát",
  controlExceptions: "Ngoại lệ kiểm soát",
  deficiencies: "Điểm yếu kiểm soát",
  kppns: "Hành động khắc phục & phòng ngừa",
  events: "Sự kiện",
  kris: "Chỉ số cảnh báo (KRI)",
  kriReadings: "Kỳ đo chỉ số KRI",
};

const REPO_NAMES = Object.keys(ALL_REPOS) as RepoName[];

/** Ép kiểu về repository chung để thao tác theo vòng lặp */
function repoOf(name: RepoName): Repository<BaseEntity> {
  return ALL_REPOS[name] as unknown as Repository<BaseEntity>;
}

/* ==================================================================
   Nạp dữ liệu mẫu
   ================================================================== */

/** Ghi đè toàn bộ dữ liệu bằng bộ mẫu */
export function loadSeedData(): void {
  REPO_NAMES.forEach((name) => {
    repoOf(name).replaceAll(SEED_DATASET[name] as BaseEntity[]);
  });
  writeRaw(KEYS.version, String(DATA_VERSION));
}

/** Kiểm tra đã từng nạp dữ liệu chưa */
export function isSeeded(): boolean {
  return readRaw(KEYS.version) === String(DATA_VERSION);
}

/**
 * Nạp dữ liệu lần đầu mở ứng dụng.
 * - Chưa có dữ liệu       -> nạp bộ mẫu
 * - Khác DATA_VERSION     -> xoá sạch rồi nạp lại
 * - Đã đúng phiên bản     -> giữ nguyên dữ liệu người dùng đang thao tác
 */
export function bootstrapSeed(): { seeded: boolean; reason: string } {
  bindStorageSync();

  const current = readRaw(KEYS.version);

  if (current === null) {
    loadSeedData();
    return { seeded: true, reason: "Nạp dữ liệu mẫu lần đầu" };
  }

  if (current !== String(DATA_VERSION)) {
    clearAll();
    loadSeedData();
    return {
      seeded: true,
      reason: `Cấu trúc dữ liệu đổi từ phiên bản ${current} sang ${DATA_VERSION}, đã nạp lại bộ mẫu`,
    };
  }

  return { seeded: false, reason: "Dữ liệu đã sẵn sàng" };
}

/** Xoá sạch dữ liệu và nạp lại bộ mẫu */
export function resetAllData(): void {
  clearAll();
  loadSeedData();
}

/** Xoá sạch dữ liệu, không nạp lại (bắt đầu từ trạng thái rỗng) */
export function clearAllData(): void {
  clearAll();
  REPO_NAMES.forEach((name) => repoOf(name).clear());
  writeRaw(KEYS.version, String(DATA_VERSION));
}

/* ==================================================================
   Thống kê nhanh
   ================================================================== */

export interface DataStat {
  name: RepoName;
  label: string;
  count: number;
  seedCount: number;
}

export function getDataStats(): DataStat[] {
  return REPO_NAMES.map((name) => ({
    name,
    label: REPO_LABEL[name],
    count: repoOf(name).list().length,
    seedCount: (SEED_DATASET[name] as BaseEntity[]).length,
  }));
}

export function totalRecords(): number {
  return REPO_NAMES.reduce((sum, name) => sum + repoOf(name).list().length, 0);
}

/* ==================================================================
   Xuất / nhập dữ liệu dạng JSON
   ================================================================== */

export interface BackupFile {
  app: "MISA GRC Demo";
  version: number;
  exportedAt: string;
  data: Partial<Record<RepoName, BaseEntity[]>>;
}

/** Gom toàn bộ dữ liệu hiện tại thành một đối tượng sao lưu */
export function exportAllData(): BackupFile {
  const data: Partial<Record<RepoName, BaseEntity[]>> = {};
  REPO_NAMES.forEach((name) => {
    data[name] = repoOf(name).list();
  });
  return {
    app: "MISA GRC Demo",
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/** Chuỗi JSON đã định dạng, sẵn sàng để tải về */
export function exportAllDataAsText(): string {
  return JSON.stringify(exportAllData(), null, 2);
}

/** Tải file sao lưu về máy */
export function downloadBackup(fileName?: string): void {
  if (typeof window === "undefined") return;

  const stamp = new Date().toISOString().slice(0, 10);
  const name = fileName ?? `misa-grc-backup-${stamp}.json`;

  const blob = new Blob([exportAllDataAsText()], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  ok: boolean;
  message: string;
  imported: Partial<Record<RepoName, number>>;
}

/**
 * Nạp dữ liệu từ nội dung file JSON đã xuất trước đó.
 * Chỉ chấp nhận các bộ dữ liệu có tên khớp với repository đã khai báo.
 */
export function importAllData(json: string): ImportResult {
  const imported: Partial<Record<RepoName, number>> = {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      message: "Tệp không phải định dạng JSON hợp lệ",
      imported,
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, message: "Nội dung tệp không hợp lệ", imported };
  }

  const backup = parsed as Partial<BackupFile>;

  if (!backup.data || typeof backup.data !== "object") {
    return {
      ok: false,
      message: "Không tìm thấy phần dữ liệu trong tệp sao lưu",
      imported,
    };
  }

  if (backup.version !== undefined && backup.version !== DATA_VERSION) {
    return {
      ok: false,
      message: `Tệp thuộc phiên bản dữ liệu ${backup.version}, hệ thống đang dùng phiên bản ${DATA_VERSION}`,
      imported,
    };
  }

  let touched = 0;
  REPO_NAMES.forEach((name) => {
    const rows = backup.data?.[name];
    if (!Array.isArray(rows)) return;
    repoOf(name).replaceAll(rows as BaseEntity[]);
    imported[name] = rows.length;
    touched += 1;
  });

  if (touched === 0) {
    return {
      ok: false,
      message: "Tệp không chứa bộ dữ liệu nào phù hợp",
      imported,
    };
  }

  writeRaw(KEYS.version, String(DATA_VERSION));

  const total = Object.values(imported).reduce((s, n) => s + (n ?? 0), 0);
  return {
    ok: true,
    message: `Đã nhập ${total} bản ghi thuộc ${touched} bộ dữ liệu`,
    imported,
  };
}

/** Đọc file người dùng chọn rồi nhập vào hệ thống */
export async function importFromFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    return importAllData(text);
  } catch {
    return {
      ok: false,
      message: "Không đọc được nội dung tệp",
      imported: {},
    };
  }
}
