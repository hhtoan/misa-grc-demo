"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconShieldCheck,
  IconShieldX,
} from "@tabler/icons-react";
import {
  Badge,
  Checkbox,
  EffectivenessBadge,
  SearchInput,
  Tooltip,
} from "@/components/ui";
import { ContentCard } from "@/components/layout";
import {
  designEffectivenessOf,
  operationEffectivenessOf,
  overallEffectivenessOf,
} from "@/lib/domain/control-utils";
import { cn } from "@/lib/cn";
import { notOperatingReason } from "@/lib/domain/risk-control-link";
import { isControlPending, type ControlLite } from "../types";
import StepTitle from "./StepTitle";

/* ==================================================================
   Bước 4: Chọn kiểm soát từ thư viện.

   Đây là bước quyết định CỔNG CHẶN của wizard: bước 6 chỉ mở khi bước
   này hoàn tất, vì điểm còn lại là kết quả sau khi đã có kiểm soát.

   Hiển thị hiệu lực theo HAI CHIỀU ngay trên từng dòng, để người dùng
   chọn kiểm soát mà biết luôn nó có đang hoạt động hay không. Kiểm soát
   thiết kế sai thì gắn vào cũng không giảm được rủi ro nào.
   ================================================================== */

export interface ControlPickerStepProps {
  controls: ControlLite[];
  value: string[];
  noControlAccepted: boolean;
  requiresControl: boolean;
  /** Cổng chặn đã thoả chưa, chỉ dùng để hiện nhắc */
  stageDone: boolean;
  unitName: (id?: string) => string;
  onChange: (ids: string[]) => void;
  onToggleAccept: (v: boolean) => void;
}

export default function ControlPickerStep({
  controls,
  value,
  noControlAccepted,
  requiresControl,
  stageDone,
  unitName,
  onChange,
  onToggleAccept,
}: ControlPickerStepProps) {
  const [keyword, setKeyword] = useState("");
  const [onlyKey, setOnlyKey] = useState(false);
  const [onlyWorking, setOnlyWorking] = useState(false);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    return controls
      .filter((c) => {
        if (onlyKey && !c.isKeyControl) return false;
        if (onlyWorking && overallEffectivenessOf(c) !== "Hiệu quả")
          return false;
        if (!kw) return true;
        return `${c.code} ${c.name ?? ""} ${c.type ?? ""}`
          .toLowerCase()
          .includes(kw);
      })
      .slice()
      .sort((a, b) => {
        /* Đã chọn lên đầu, sau đó theo mã */
        const pa = value.includes(a.id) ? 0 : 1;
        const pb = value.includes(b.id) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.code.localeCompare(b.code);
      });
  }, [controls, keyword, onlyKey, onlyWorking, value]);

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  }

  const picked = controls.filter((c) => value.includes(c.id));
  const pendingCount = picked.filter(isControlPending).length;
  const activeCount = picked.length - pendingCount;

  return (
    <ContentCard className="flex flex-col gap-4">
      <StepTitle
        index={4}
        title="Chọn kiểm soát"
        note="Gắn các kiểm soát đang bảo vệ rủi ro này. Đây là căn cứ để hệ thống gợi ý điểm còn lại ở bước 6"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="Tìm theo mã, tên kiểm soát"
          width={300}
        />
        <Checkbox
          label="Chỉ kiểm soát trọng yếu"
          checked={onlyKey}
          onChange={(e) => setOnlyKey(e.target.checked)}
        />
        <Checkbox
          label="Chỉ kiểm soát đang hoạt động tốt"
          checked={onlyWorking}
          onChange={(e) => setOnlyWorking(e.target.checked)}
        />
        <span className="ml-auto text-[12px] text-text-secondary">
          Đã chọn <b className="text-text-primary">{value.length}</b>, được tính{" "}
          <b className="text-text-primary">{activeCount}</b>
        </span>
      </div>

      {/* ----------- Nhắc khi cổng chặn chưa thoả ----------- */}
      {!stageDone && (
        <div
          className={cn(
            "flex gap-2 rounded-ctrl border p-2.5 text-[12px] leading-4",
            requiresControl
              ? "border-lv-critical-border bg-lv-critical-bg text-lv-critical-text"
              : "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
          )}
        >
          <IconShieldX size={16} className="mt-px shrink-0" />
          <span>
            {requiresControl
              ? "Rủi ro vốn có mức Cao trở lên nên bắt buộc gắn ít nhất 1 kiểm soát đã phê duyệt. Bước 6 chưa mở được."
              : "Chọn ít nhất 1 kiểm soát, hoặc tuyên bố chấp nhận rủi ro nếu không áp dụng kiểm soát nào. Bước 6 chưa mở được."}
          </span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Có <b>{pendingCount}</b> kiểm soát <b>chưa đang vận hành</b>, gồm
            các trạng thái Nháp, Chờ duyệt, Tạm ngưng hoặc Hết hiệu lực. Những
            kiểm soát này chưa được tính là đang bảo vệ rủi ro, và cũng không
            vào phép tính gợi ý điểm còn lại. Rê chuột lên nhãn trạng thái của
            từng dòng để xem lý do cụ thể.
          </span>
        </div>
      )}

      {/* -------------------- Danh sách -------------------- */}
      <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto rounded-ctrl border border-border-light p-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-text-hint">
            Không có kiểm soát phù hợp. Thử xoá từ khoá hoặc bỏ bộ lọc.
          </p>
        ) : (
          rows.map((c) => {
            const active = value.includes(c.id);
            const pending = isControlPending(c);

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-ctrl border px-2.5 py-2 text-left transition-all",
                  active
                    ? "border-brand bg-brand-light"
                    : "border-border-light bg-white hover:bg-[#FAFAFA]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-ctrl border",
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-border-neutral bg-white",
                  )}
                >
                  {active && <IconCheck size={13} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-medium text-brand">
                      {c.code}
                    </span>
                    <span className="truncate text-[13px] text-text-primary">
                      {c.name}
                    </span>
                    {c.isKeyControl && (
                      <Badge tone="brand" size="sm">
                        Trọng yếu
                      </Badge>
                    )}
                    {pending && (
                      <Tooltip
                        content={
                          notOperatingReason(c.status) ??
                          "Chưa được tính là đang bảo vệ rủi ro"
                        }
                      >
                        <Badge tone="neutral" size="sm">
                          {c.status}
                        </Badge>
                      </Tooltip>
                    )}
                  </span>

                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <EffectivenessBadge
                      size="sm"
                      short
                      dimension="Thiết kế"
                      value={designEffectivenessOf(c)}
                    />
                    <EffectivenessBadge
                      size="sm"
                      short
                      dimension="Vận hành"
                      value={operationEffectivenessOf(c)}
                    />
                    <span className="truncate text-[11px] text-text-hint">
                      {c.type} · {c.nature} · {c.frequency} ·{" "}
                      {unitName(c.unitId)}
                    </span>
                  </span>
                </span>

                <IconShieldCheck
                  size={16}
                  className={cn(
                    "mt-0.5 shrink-0",
                    active ? "text-brand" : "text-icon-neutral",
                  )}
                />
              </button>
            );
          })
        )}
      </div>

      {/* --------- Tuyên bố chấp nhận, chỉ cho rủi ro thấp --------- */}
      <div
        data-field="noControlAccepted"
        className={cn(
          "flex flex-col gap-1 rounded-ctrl bg-surface-alt px-3 py-2.5",
          requiresControl && "opacity-60",
        )}
      >
        <Checkbox
          label="Không áp dụng kiểm soát nào, chấp nhận rủi ro ở mức hiện tại"
          checked={noControlAccepted}
          disabled={requiresControl}
          onChange={(e) => onToggleAccept(e.target.checked)}
        />
        <span className="pl-6 text-[11px] leading-4 text-text-hint">
          {requiresControl
            ? "Không dùng được vì rủi ro vốn có đang ở mức Cao trở lên, bắt buộc phải có kiểm soát."
            : "Dùng khi rủi ro ở mức thấp và chi phí kiểm soát lớn hơn lợi ích. Khi bật, gợi ý điểm còn lại sẽ đúng bằng điểm vốn có."}
        </span>
      </div>
    </ContentCard>
  );
}
