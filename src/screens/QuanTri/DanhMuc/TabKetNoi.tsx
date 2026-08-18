"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCloudUpload,
  IconInfoCircle,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
} from "@tabler/icons-react";
import { Badge, Button, EmptyState, Tooltip, useToast } from "@/components/ui";
import { kppnRepo, useCollection } from "@/lib/db";
import * as integrationApi from "@/lib/integrations/mock";
import {
  INTEGRATIONS,
  SYSTEM_TO_INTEGRATION,
  pullKppnFromSource,
  useIntegrationStates,
  type IntegrationKey,
} from "@/lib/integrations/mock";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

/* ==================================================================
   Kiểu tối giản, không phụ thuộc schema
   ================================================================== */

interface KppnLite {
  id: string;
  code?: string;
  status?: string;
  executionSystem?: string;
  externalTaskCode?: string;
  lastSyncedAt?: string;
}

/**
 * Hàm bật tắt kết nối có thể mang nhiều tên khác nhau tuỳ bản mock.
 * Cast namespace một lần để không vỡ build nếu hàm chưa tồn tại.
 */
interface ToggleApi {
  setIntegrationConnected?: (key: IntegrationKey, connected: boolean) => void;
  toggleIntegration?: (key: IntegrationKey) => void;
  connectIntegration?: (key: IntegrationKey) => void;
  disconnectIntegration?: (key: IntegrationKey) => void;
}

const toggleApi = integrationApi as unknown as ToggleApi;

interface LogItem {
  at: string;
  key: IntegrationKey;
  title: string;
  detail: string;
  tone: "success" | "info" | "danger";
}

/* ================================================================== */
/* Tab Kết nối hệ thống                                                */
/* ================================================================== */

export default function TabKetNoi({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const states = useIntegrationStates();
  const kppns = useCollection(kppnRepo) as unknown as KppnLite[];

  const [busy, setBusy] = useState<IntegrationKey | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);

  /* ------------------------ Thống kê theo hệ thống ---------------- */

  const statOf = useMemo(() => {
    const map = new Map<
      IntegrationKey,
      { total: number; pushed: number; running: number; lastSync: string }
    >();

    kppns.forEach((k) => {
      const key = k.executionSystem
        ? SYSTEM_TO_INTEGRATION[
            k.executionSystem as keyof typeof SYSTEM_TO_INTEGRATION
          ]
        : undefined;
      if (!key) return;
      const cur = map.get(key) ?? {
        total: 0,
        pushed: 0,
        running: 0,
        lastSync: "",
      };
      cur.total += 1;
      if (k.externalTaskCode) cur.pushed += 1;
      if (k.status !== "Hoàn thành" && k.status !== "Huỷ") cur.running += 1;
      if (k.lastSyncedAt && k.lastSyncedAt > cur.lastSync)
        cur.lastSync = k.lastSyncedAt;
      map.set(key, cur);
    });

    return map;
  }, [kppns]);

  /* ---------------------------- Hành động ------------------------- */

  function addLog(item: LogItem) {
    setLog((prev) => [item, ...prev].slice(0, 12));
  }

  function applyConnection(key: IntegrationKey, next: boolean): boolean {
    if (toggleApi.setIntegrationConnected) {
      toggleApi.setIntegrationConnected(key, next);
      return true;
    }
    if (next && toggleApi.connectIntegration) {
      toggleApi.connectIntegration(key);
      return true;
    }
    if (!next && toggleApi.disconnectIntegration) {
      toggleApi.disconnectIntegration(key);
      return true;
    }
    if (toggleApi.toggleIntegration) {
      toggleApi.toggleIntegration(key);
      return true;
    }
    return false;
  }

  function toggle(key: IntegrationKey, name: string) {
    const next = !states[key].connected;
    const ok = applyConnection(key, next);

    if (!ok) {
      toast.error(
        "Không đổi được trạng thái kết nối",
        "Bản mock hiện chưa có hàm bật tắt kết nối. Cần bổ sung setIntegrationConnected trong lib/integrations/mock.",
      );
      return;
    }

    addLog({
      at: new Date().toISOString(),
      key,
      title: next ? `Bật kết nối ${name}` : `Ngắt kết nối ${name}`,
      detail: next
        ? "Hệ thống có thể giao việc và nhận cập nhật tiến độ trở lại."
        : "Mọi thao tác giao việc và đồng bộ với hệ thống này sẽ bị chặn.",
      tone: next ? "success" : "danger",
    });

    toast.success(
      next ? `Đã bật kết nối ${name}` : `Đã ngắt kết nối ${name}`,
      next
        ? "Các hành động khắc phục có thể giao việc sang hệ thống này."
        : "Hành động đã giao vẫn giữ mã việc cũ, nhưng không nhận được cập nhật mới.",
    );
  }

  async function sync(key: IntegrationKey, name: string) {
    setBusy(key);
    const res = await pullKppnFromSource(key);
    setBusy(null);

    if (!res.ok) {
      addLog({
        at: new Date().toISOString(),
        key,
        title: `Đồng bộ ${name} thất bại`,
        detail: res.message,
        tone: "danger",
      });
      toast.error("Không đồng bộ được", res.message);
      return;
    }

    addLog({
      at: new Date().toISOString(),
      key,
      title: `Đồng bộ ${name}`,
      detail:
        res.updated > 0
          ? `Cập nhật ${res.updated} hành động. ${res.details.slice(0, 2).join(" | ")}`
          : "Hệ thống nguồn chưa có thay đổi nào.",
      tone: res.updated > 0 ? "success" : "info",
    });

    if (res.updated > 0)
      toast.success(
        `Đã cập nhật ${res.updated} hành động từ ${name}`,
        res.details.slice(0, 2).join(" | "),
      );
    else
      toast.info(
        "Không có thay đổi mới",
        `${name} chưa cập nhật tiến độ nào cho các hành động đang chạy.`,
      );
  }

  /* ------------------------------ Render -------------------------- */

  const connectedCount = INTEGRATIONS.filter(
    (x) => states[x.key].connected,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* --------------------------- Dải tóm tắt ---------------------- */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5 text-[12px] leading-4",
          connectedCount === INTEGRATIONS.length
            ? "border-lv-low-border bg-lv-low-bg text-lv-low-text"
            : "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
        )}
      >
        {connectedCount === INTEGRATIONS.length ? (
          <IconCircleCheck size={18} className="shrink-0" />
        ) : (
          <IconAlertTriangle size={18} className="shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          Đang bật <b>{connectedCount}</b> / {INTEGRATIONS.length} kết nối.{" "}
          {connectedCount === INTEGRATIONS.length
            ? "Toàn bộ hành động khắc phục đều giao việc và nhận cập nhật tiến độ bình thường."
            : "Kết nối đang tắt sẽ chặn giao việc mới và không nhận được tiến độ từ hệ thống nguồn, dẫn tới số liệu trong GRC bị cũ."}
        </span>
      </div>

      {/* ------------------------- Thẻ kết nối ------------------------ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {INTEGRATIONS.map((it) => {
          const connected = states[it.key].connected;
          const s = statOf.get(it.key) ?? {
            total: 0,
            pushed: 0,
            running: 0,
            lastSync: "",
          };

          return (
            <div
              key={it.key}
              className="flex flex-col gap-3 rounded-card border border-border-light p-4"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl",
                    connected
                      ? "bg-brand-light text-brand"
                      : "bg-lv-neutral-bg text-lv-neutral-text",
                  )}
                >
                  {connected ? (
                    <IconPlugConnected size={20} />
                  ) : (
                    <IconPlugConnectedX size={20} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-text-primary">
                    {it.name}
                  </p>
                  <p className="text-[12px] text-text-secondary">
                    Đồng bộ 2 chiều với phân hệ Khắc phục
                  </p>
                </div>
                {connected ? (
                  <Badge tone="success" dot>
                    Đang kết nối
                  </Badge>
                ) : (
                  <Badge tone="danger" dot>
                    Đã ngắt
                  </Badge>
                )}
              </div>

              {it.description && (
                <p className="text-[12px] leading-4 text-text-secondary">
                  {it.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 border-t border-border-light pt-3 md:grid-cols-4">
                <MiniStat label="Hành động gắn hệ thống" value={s.total} />
                <MiniStat label="Đã tạo mã việc" value={s.pushed} />
                <MiniStat
                  label="Chưa giao việc"
                  value={s.total - s.pushed}
                  danger={s.total - s.pushed > 0}
                />
                <MiniStat label="Đang chạy" value={s.running} />
              </div>

              <p className="text-[11px] text-text-hint">
                Đồng bộ gần nhất:{" "}
                {s.lastSync ? formatDateTime(s.lastSync) : "chưa có dữ liệu"}
              </p>

              {!connected && (
                <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
                  <IconAlertTriangle size={15} className="mt-px shrink-0" />
                  <span>
                    Kết nối đang tắt nên <b>{s.running}</b> hành động đang chạy
                    không nhận được cập nhật tiến độ. Số liệu trong GRC sẽ cũ
                    dần so với thực tế.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
                {canEdit && (
                  <Tooltip
                    content={
                      connected
                        ? "Ngắt kết nối để dừng giao việc và đồng bộ"
                        : "Bật lại kết nối với hệ thống nguồn"
                    }
                  >
                    <Button
                      variant={connected ? "danger-outline" : "primary"}
                      icon={
                        connected ? (
                          <IconPlugConnectedX size={16} />
                        ) : (
                          <IconPlugConnected size={16} />
                        )
                      }
                      onClick={() => toggle(it.key, it.name)}
                    >
                      {connected ? "Ngắt kết nối" : "Bật kết nối"}
                    </Button>
                  </Tooltip>
                )}
                <Button
                  variant="secondary"
                  icon={<IconRefresh size={16} />}
                  loading={busy === it.key}
                  disabled={!connected}
                  onClick={() => sync(it.key, it.name)}
                >
                  Đồng bộ ngay
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ------------------------ Nhật ký phiên ----------------------- */}
      <div className="flex flex-col gap-2 rounded-card border border-border-light p-4">
        <div className="flex items-center gap-2">
          <IconCloudUpload size={16} className="text-brand" />
          <p className="text-[13px] font-semibold text-text-primary">
            Nhật ký thao tác trong phiên
          </p>
          {log.length > 0 && (
            <button
              type="button"
              onClick={() => setLog([])}
              className="ml-auto text-[12px] font-medium text-brand hover:underline"
            >
              Xoá nhật ký
            </button>
          )}
        </div>

        {log.length === 0 ? (
          <EmptyState
            title="Chưa có thao tác nào trong phiên này"
            description="Bật tắt kết nối hoặc bấm Đồng bộ ngay, kết quả sẽ được ghi lại tại đây."
            compact
          />
        ) : (
          <ul className="flex flex-col">
            {log.map((x, i) => (
              <li
                key={`${x.at}-${i}`}
                className="flex items-start gap-2.5 border-b border-border-light py-2.5 last:border-b-0"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-ctrl",
                    x.tone === "success"
                      ? "bg-lv-low-bg text-lv-low-text"
                      : x.tone === "danger"
                        ? "bg-lv-critical-bg text-lv-critical-text"
                        : "bg-lv-info-bg text-lv-info-text",
                  )}
                >
                  {x.tone === "danger" ? (
                    <IconAlertTriangle size={13} />
                  ) : (
                    <IconRefresh size={13} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-text-primary">
                    {x.title}
                  </p>
                  <p className="text-[12px] leading-4 text-text-secondary">
                    {x.detail}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-text-hint">
                  {formatDateTime(x.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
        <IconInfoCircle size={16} className="mt-px shrink-0" />
        <span>
          Nguyên tắc tích hợp: <b>GRC điều phối, hệ thống nguồn thực thi</b>. Hệ
          thống nguồn báo hoàn tất chỉ đưa hành động sang trạng thái Chờ nghiệm
          thu, quyền xác nhận Hoàn thành luôn thuộc về người giám sát trong GRC.
          Nhật ký ở đây chỉ ghi trong phiên làm việc, bản chạy thật sẽ lưu vào
          nhật ký hệ thống.
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Ô chỉ số nhỏ                                                        */
/* ================================================================== */

function MiniStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "text-[18px] leading-6 font-semibold",
          danger && value > 0 ? "text-danger" : "text-text-primary",
        )}
      >
        {value}
      </span>
      <span className="text-[11px] leading-3.5 text-text-secondary">
        {label}
      </span>
    </div>
  );
}
