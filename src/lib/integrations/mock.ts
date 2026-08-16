"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DB_PREFIX, kppnRepo, objectiveRepo, readRaw, writeRaw } from "@/lib/db";
import type { Kppn, Objective } from "@/lib/domain/schema";

/* ==================================================================
   Khai báo các kết nối
   ================================================================== */

export type IntegrationKey = "amis-muc-tieu" | "amis-cong-viec" | "jira";

export type SyncDirection = "1 chiều" | "2 chiều";

export interface IntegrationInfo {
  key: IntegrationKey;
  name: string;
  direction: SyncDirection;
  description: string;
  /** Dữ liệu chịu ảnh hưởng khi đồng bộ */
  scope: string;
}

export const INTEGRATIONS: IntegrationInfo[] = [
  {
    key: "amis-muc-tieu",
    name: "AMIS Mục tiêu",
    direction: "1 chiều",
    description:
      "Đồng bộ mục tiêu BSC/OKR từ AMIS Mục tiêu sang GRC. Mục tiêu chỉ đọc trong GRC, mọi thay đổi thực hiện tại hệ thống nguồn.",
    scope: "Mục tiêu",
  },
  {
    key: "amis-cong-viec",
    name: "AMIS Công việc",
    direction: "2 chiều",
    description:
      "GRC giao hành động KPPN sang AMIS Công việc, hệ thống nguồn cập nhật ngược tiến độ và trạng thái thực hiện.",
    scope: "Hành động khắc phục & phòng ngừa (bộ phận chung)",
  },
  {
    key: "jira",
    name: "JIRA",
    direction: "2 chiều",
    description:
      "GRC giao hành động KPPN sang JIRA cho khối IT và Sản xuất, nhận lại tiến độ và trạng thái từ JIRA.",
    scope: "Hành động khắc phục & phòng ngừa (IT, Sản xuất)",
  },
];

/** Ánh xạ hệ thống thực thi trong KPPN sang kết nối tương ứng */
export const SYSTEM_TO_INTEGRATION: Record<string, IntegrationKey | null> = {
  "AMIS Công việc": "amis-cong-viec",
  JIRA: "jira",
  "Theo dõi trong GRC": null,
};

/* ==================================================================
   Trạng thái kết nối, lưu trên localStorage
   ================================================================== */

export interface IntegrationState {
  connected: boolean;
  lastSyncedAt: string;
  lastMessage: string;
}

export type IntegrationStateMap = Record<IntegrationKey, IntegrationState>;

const STATE_KEY = `${DB_PREFIX}:integrations`;

const DEFAULT_STATE: IntegrationStateMap = {
  "amis-muc-tieu": {
    connected: true,
    lastSyncedAt: "2026-08-01T02:00:00.000Z",
    lastMessage: "Đã đồng bộ 8 mục tiêu",
  },
  "amis-cong-viec": {
    connected: true,
    lastSyncedAt: "2026-08-15T01:30:00.000Z",
    lastMessage: "Đã cập nhật 4 hành động",
  },
  jira: {
    connected: true,
    lastSyncedAt: "2026-08-15T01:30:00.000Z",
    lastMessage: "Đã cập nhật 3 hành động",
  },
};

let cachedState: IntegrationStateMap | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function getIntegrationStates(): IntegrationStateMap {
  if (cachedState) return cachedState;

  const raw = readRaw(STATE_KEY);
  if (raw) {
    try {
      cachedState = { ...DEFAULT_STATE, ...(JSON.parse(raw) as IntegrationStateMap) };
      return cachedState;
    } catch {
      /* dữ liệu hỏng, dùng mặc định */
    }
  }
  cachedState = DEFAULT_STATE;
  return cachedState;
}

function patchState(key: IntegrationKey, patch: Partial<IntegrationState>) {
  const next: IntegrationStateMap = {
    ...getIntegrationStates(),
    [key]: { ...getIntegrationStates()[key], ...patch },
  };
  cachedState = next;
  writeRaw(STATE_KEY, JSON.stringify(next));
  emit();
}

export function setConnected(key: IntegrationKey, connected: boolean): void {
  patchState(key, {
    connected,
    lastMessage: connected ? "Đã kết nối lại" : "Đã ngắt kết nối",
  });
}

/** Hook đọc trạng thái kết nối, tự render lại khi thay đổi */
export function useIntegrationStates(): IntegrationStateMap {
  const subscribe = useCallback((fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    getIntegrationStates,
    () => DEFAULT_STATE
  );
}

/* ==================================================================
   Tiện ích giả lập
   ================================================================== */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Độ trễ ngẫu nhiên cho giống gọi mạng thật */
const latency = () => 600 + Math.floor(Math.random() * 900);

export interface SyncResult {
  ok: boolean;
  /** Thông điệp hiển thị trên toast */
  message: string;
  /** Mô tả chi tiết từng thay đổi, hiển thị trong nhật ký đồng bộ */
  details: string[];
  updated: number;
  created: number;
}

function fail(message: string): SyncResult {
  return { ok: false, message, details: [], updated: 0, created: 0 };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ==================================================================
   1. AMIS Mục tiêu - đồng bộ 1 chiều về GRC
   ================================================================== */

/** Mục tiêu mới xuất hiện ở hệ thống nguồn, chỉ thêm khi chưa có */
const INCOMING_OBJECTIVES: Omit<
  Objective,
  "id" | "createdAt" | "updatedAt" | "createdBy"
>[] = [
  {
    code: "OBJ-2026-009",
    name: "Mở rộng thị phần khối doanh nghiệp vừa lên 18%",
    perspective: "Khách hàng",
    level: "Khối",
    unitId: "unit-kd",
    ownerId: "emp-son",
    period: "Năm 2026",
    target: "Thị phần 18%",
    progress: 31,
    source: "AMIS Mục tiêu",
    syncedAt: "",
  },
  {
    code: "OBJ-2026-010",
    name: "Giảm chi phí hạ tầng trên mỗi khách hàng 12%",
    perspective: "Tài chính",
    level: "Khối",
    unitId: "unit-it",
    ownerId: "emp-yen",
    period: "Năm 2026",
    target: "Giảm 12% chi phí đơn vị",
    progress: 22,
    source: "AMIS Mục tiêu",
    syncedAt: "",
  },
];

export async function syncObjectives(): Promise<SyncResult> {
  const state = getIntegrationStates()["amis-muc-tieu"];
  if (!state.connected) {
    return fail("Kết nối AMIS Mục tiêu đang tắt, vui lòng bật trước khi đồng bộ");
  }

  await sleep(latency());

  const now = new Date().toISOString();
  const details: string[] = [];
  const existing = objectiveRepo.list();

  // Cập nhật tiến độ mục tiêu đang có
  let updated = 0;
  existing.forEach((o) => {
    const delta = Math.floor(Math.random() * 7) - 1; // -1 đến +5
    const progress = Math.max(0, Math.min(100, o.progress + delta));
    if (progress === o.progress) return;
    objectiveRepo.update(o.id, { progress, syncedAt: now });
    details.push(
      `${o.code}: tiến độ ${o.progress}% → ${progress}%`
    );
    updated += 1;
  });

  // Thêm mục tiêu mới nếu hệ thống nguồn phát sinh
  let created = 0;
  INCOMING_OBJECTIVES.forEach((item) => {
    if (existing.some((o) => o.code === item.code)) return;
    objectiveRepo.create({ ...item, syncedAt: now });
    details.push(`${item.code}: thêm mới từ AMIS Mục tiêu`);
    created += 1;
  });

  const message =
    created > 0
      ? `Đã đồng bộ ${updated} mục tiêu, thêm mới ${created} mục tiêu`
      : `Đã đồng bộ ${updated} mục tiêu`;

  patchState("amis-muc-tieu", { lastSyncedAt: now, lastMessage: message });

  return { ok: true, message, details, updated, created };
}

/* ==================================================================
   2. AMIS Công việc / JIRA - đồng bộ 2 chiều cho KPPN
   ================================================================== */

/** Sinh mã việc ở hệ thống nguồn */
function makeExternalTask(system: string): { code: string; url: string } {
  const n = Math.floor(1000 + Math.random() * 8999);
  if (system === "JIRA") {
    const project = pick(["ITOPS", "SEC", "PRD"]);
    return {
      code: `${project}-${n}`,
      url: `https://jira.misa.com.vn/browse/${project}-${n}`,
    };
  }
  const year = new Date().getFullYear();
  return {
    code: `CV-${year}-${n}`,
    url: `https://amisapp.misa.vn/task/CV-${year}-${n}`,
  };
}

/**
 * Chiều đi: GRC giao việc sang hệ thống nguồn.
 * Chỉ áp dụng cho KPPN đã được phê duyệt và chưa có mã việc bên ngoài.
 */
export async function pushKppnToSource(kppnId: string): Promise<SyncResult> {
  const kppn = kppnRepo.getById(kppnId);
  if (!kppn) return fail("Không tìm thấy hành động cần giao việc");

  const target = SYSTEM_TO_INTEGRATION[kppn.executionSystem];
  if (!target) {
    return fail(
      "Hành động này được theo dõi trực tiếp trong GRC, không cần giao sang hệ thống ngoài"
    );
  }

  if (!getIntegrationStates()[target].connected) {
    const name = INTEGRATIONS.find((i) => i.key === target)?.name ?? target;
    return fail(`Kết nối ${name} đang tắt, không thể giao việc`);
  }

  if (kppn.status === "Nháp" || kppn.status === "Chờ duyệt") {
    return fail("Chỉ giao việc sang hệ thống nguồn sau khi hành động được phê duyệt");
  }

  if (kppn.externalTaskCode) {
    return fail(`Hành động đã được giao với mã ${kppn.externalTaskCode}`);
  }

  await sleep(latency());

  const now = new Date().toISOString();
  const task = makeExternalTask(kppn.executionSystem);

  kppnRepo.update(kppn.id, {
    externalTaskCode: task.code,
    externalUrl: task.url,
    lastSyncedAt: now,
  });

  const message = `Đã tạo việc ${task.code} trên ${kppn.executionSystem}`;
  patchState(target, { lastSyncedAt: now, lastMessage: message });

  return {
    ok: true,
    message,
    details: [`${kppn.code} → ${task.code}`],
    updated: 1,
    created: 1,
  };
}

/**
 * Chiều về: hệ thống nguồn cập nhật tiến độ và trạng thái.
 * Chỉ tác động tới hành động đang thực hiện, không đụng bản Nháp,
 * Chờ duyệt, Hoàn thành hay Huỷ.
 */
export async function pullKppnFromSource(
  key: IntegrationKey
): Promise<SyncResult> {
  if (key === "amis-muc-tieu") {
    return fail("AMIS Mục tiêu chỉ đồng bộ 1 chiều về GRC");
  }

  if (!getIntegrationStates()[key].connected) {
    const name = INTEGRATIONS.find((i) => i.key === key)?.name ?? key;
    return fail(`Kết nối ${name} đang tắt, vui lòng bật trước khi đồng bộ`);
  }

  await sleep(latency());

  const systemName = key === "jira" ? "JIRA" : "AMIS Công việc";
  const now = new Date().toISOString();
  const details: string[] = [];
  let updated = 0;

  const targets = kppnRepo
    .list()
    .filter(
      (k) =>
        k.executionSystem === systemName &&
        !!k.externalTaskCode &&
        (k.status === "Chưa bắt đầu" || k.status === "Đang thực hiện")
    );

  targets.forEach((k) => {
    const patch = simulateProgress(k);
    if (!patch) return;
    kppnRepo.update(k.id, { ...patch, lastSyncedAt: now });
    details.push(
      `${k.code} ( ${k.externalTaskCode}): tiến độ ${k.progress}% → ${patch.progress}%` +
        (patch.status && patch.status !== k.status
          ? `, trạng thái ${k.status} → ${patch.status}`
          : "")
    );
    updated += 1;
  });

  const message =
    updated === 0
      ? `Không có thay đổi mới từ ${systemName}`
      : `Đã cập nhật ${updated} hành động từ ${systemName}`;

  patchState(key, { lastSyncedAt: now, lastMessage: message });

  return { ok: true, message, details, updated, created: 0 };
}

/** Sinh tiến độ mới cho một hành động, mô phỏng cập nhật từ hệ thống nguồn */
function simulateProgress(k: Kppn): Partial<Kppn> | null {
  const step = 5 + Math.floor(Math.random() * 20);
  const progress = Math.min(100, k.progress + step);
  if (progress === k.progress) return null;

  const patch: Partial<Kppn> = { progress };

  if (k.status === "Chưa bắt đầu" && progress > 0) {
    patch.status = "Đang thực hiện";
  }
  // Đạt 100% thì hệ thống nguồn đẩy sang chờ nghiệm thu, việc nghiệm thu
  // vẫn do người phụ trách trong GRC quyết định
  if (progress >= 100) {
    patch.status = "Chờ nghiệm thu";
    patch.statusNote = `Hệ thống ${k.executionSystem} báo hoàn tất, chờ nghiệm thu trong GRC.`;
  }

  return patch;
}

/* ==================================================================
   Đồng bộ toàn bộ
   ================================================================== */

export async function syncAll(): Promise<SyncResult> {
  const results = await Promise.all([
    syncObjectives(),
    pullKppnFromSource("amis-cong-viec"),
    pullKppnFromSource("jira"),
  ]);

  const ok = results.some((r) => r.ok);
  const updated = results.reduce((s, r) => s + r.updated, 0);
  const created = results.reduce((s, r) => s + r.created, 0);
  const details = results.flatMap((r) => r.details);

  return {
    ok,
    message: ok
      ? `Đồng bộ xong: cập nhật ${updated} bản ghi, thêm mới ${created} bản ghi`
      : "Không có kết nối nào đang bật",
    details,
    updated,
    created,
  };
}
