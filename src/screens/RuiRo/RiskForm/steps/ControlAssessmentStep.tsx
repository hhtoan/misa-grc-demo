"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconListSearch,
  IconPlus,
  IconShieldCheck,
  IconShieldX,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import {
  Badge,
  Button,
  Checkbox,
  EffectivenessBadge,
  SearchInput,
  Select,
  Textarea,
  Tooltip,
} from "@/components/ui";
import { ContentCard } from "@/components/layout";
import {
  ASSESS_FILTERS,
  buildAssessRows,
  describeAssessment,
  matchAssessFilter,
  sortAssessRows,
  summarizeAssessment,
  type AssessFilterKey,
  type ControlAssessRow,
} from "@/lib/domain/control-assessment";
import {
  RELEVANCE_OPTIONS,
  isControlOperating,
} from "@/lib/domain/risk-control-link";
import { overallEffectivenessOf } from "@/lib/domain/control-utils";
import type { RiskControlLink } from "@/lib/domain/schema";
import type { ControlRelevance } from "@/lib/domain/enums";
import { cn } from "@/lib/cn";
import StepTitle from "./StepTitle";
import ControlAssessDrawer, {
  type AssessDrawerResult,
} from "./ControlAssessDrawer";

import type { ControlLite } from "../types";

/* ==================================================================
   Bước 4: Đánh giá kiểm soát hiện hữu.

   Đổi từ DANH SÁCH CHỌN sang BẢNG ĐÁNH GIÁ. Khác biệt không nằm ở cách
   trình bày mà ở việc bước này giờ có KẾT LUẬN:

     Trước: chọn kiểm soát nào bảo vệ rủi ro này -> xong
     Sau  : với từng kiểm soát đã gắn, kết luận nó có xử lý đúng rủi ro
            này không, và nếu không thì vì sao

   Bố cục hai vùng:
     1. Bảng kiểm soát đã gắn, đây là việc chính
     2. Panel tìm thêm kiểm soát, thu gọn mặc định khi đã có kiểm soát

   Component KHÔNG gọi repo. Mọi thao tác ghi đi qua callback onAssess và
   onChange, để một chỗ duy nhất là index.tsx quyết định thứ tự tạo và
   dọn bản ghi. Nhờ vậy khi huỷ hồ sơ nháp ở E2c-3, việc dọn liên kết
   vẫn nằm gọn một chỗ thay vì rải trong từng bước.
   ================================================================== */

export interface ControlAssessmentStepProps {
  /** Rỗng khi rủi ro chưa được tạo, bảng vẫn render được */
  riskId: string;
  /** Bối cảnh rủi ro, hiện trong ngăn kéo để không mất ngữ cảnh */
  riskCode: string;
  riskName: string;

  controls: ControlLite[];
  /** Id kiểm soát đã gắn với rủi ro này */
  value: string[];
  /** Bảng tra liên kết, khoá là `${riskId}::${controlId}` */
  linkIndex: Map<string, RiskControlLink>;

  noControlAccepted: boolean;
  requiresControl: boolean;

  unitName: (id?: string) => string;

  onChange: (ids: string[]) => void;
  onToggleAccept: (v: boolean) => void;
  /**
   * Kết quả trọn vẹn của micro-flow 4 bước.
   *
   * Tách khỏi onAssess vì hai đường ghi khác nhau: onAssess là kết luận
   * nhanh ngay trên dòng bảng, chỉ có mức phù hợp. Còn đây là kết quả
   * đánh giá sâu, có thể kèm đợt tự kiểm tra và điểm yếu mới.
   */
  onDeepAssess: (result: AssessDrawerResult) => void;

  onAssess: (
    controlId: string,
    relevance: ControlRelevance,
    note: string,
  ) => void;
}

export default function ControlAssessmentStep({
  riskId,
  riskCode,
  riskName,
  controls,
  value,
  linkIndex,
  noControlAccepted,
  requiresControl,
  unitName,
  onChange,
  onToggleAccept,
  onAssess,
  onDeepAssess,
}: ControlAssessmentStepProps) {
  const [filter, setFilter] = useState<AssessFilterKey>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [onlyKey, setOnlyKey] = useState(false);

  /** Dòng đang mở ô lý do, khoá là controlId, giá trị là nội dung đang gõ */
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  /** Id kiểm soát đang mở ngăn kéo đánh giá sâu, null là đang đóng */
  const [assessingId, setAssessingId] = useState<string | null>(null);

  /* ------------------------- Dữ liệu bảng -------------------------- */

  const rows = useMemo(
    () => sortAssessRows(buildAssessRows(controls, value, riskId, linkIndex)),
    [controls, value, riskId, linkIndex],
  );

  const summary = useMemo(() => summarizeAssessment(rows), [rows]);

  const visibleRows = useMemo(
    () => rows.filter((r) => matchAssessFilter(filter, r)),
    [rows, filter],
  );

  /**
   * Dòng đang mở trong ngăn kéo.
   *
   * Tra lại từ rows chứ KHÔNG giữ bản sao trong state. Nhờ vậy khi người
   * dùng vừa ghi kết luận, ngăn kéo mở lại sẽ thấy dữ liệu mới ngay,
   * thay vì thấy ảnh chụp lúc bấm nút.
   */
  const assessingRow = useMemo(
    () => rows.find((r) => r.id === assessingId) ?? null,
    [rows, assessingId],
  );

  const stageDone =
    (summary.total > 0 && summary.pending === 0) || noControlAccepted;

  /* ------------------------ Panel tìm thêm ------------------------- */

  const pickerRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const picked = new Set(value);

    return controls
      .filter((c) => {
        if (picked.has(c.id)) return false;
        if (onlyKey && !c.isKeyControl) return false;
        if (!kw) return true;
        return `${c.code} ${c.name ?? ""} ${c.type ?? ""}`
          .toLowerCase()
          .includes(kw);
      })
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [controls, value, keyword, onlyKey]);

  function addControl(id: string) {
    onChange([...value, id]);
  }

  function removeControl(id: string) {
    /* Gỡ đúng dòng đang mở thì phải đóng ngăn kéo, nếu không nó sẽ trỏ
       tới một kiểm soát không còn trong danh sách */
    if (assessingId === id) setAssessingId(null);

    onChange(value.filter((x) => x !== id));
    /* Dọn luôn ô lý do đang mở của dòng đó, tránh state rác treo lại */
    setNoteDraft((prev) => {
      if (prev[id] === undefined) return prev;
      const out = { ...prev };
      delete out[id];
      return out;
    });
  }

  /* --------------------- Ghi kết luận mức phù hợp ------------------ */

  function pickRelevance(row: ControlAssessRow, next: ControlRelevance) {
    /* Không phù hợp là quyết định có hệ quả: kiểm soát bị loại khỏi phép
       tính gợi ý và được đề nghị gỡ khỏi rủi ro. Bắt buộc nêu lý do
       TRƯỚC khi ghi, thay vì ghi rồi mới hỏi, để không có bản ghi nào
       tồn tại ở trạng thái thiếu căn cứ dù chỉ trong chốc lát */
    if (next === "Không phù hợp") {
      setNoteDraft((prev) => ({
        ...prev,
        [row.id]: prev[row.id] ?? row.relevanceNote,
      }));
      return;
    }

    onAssess(row.id, next, row.relevanceNote);
  }

  function confirmMismatch(row: ControlAssessRow) {
    const note = (noteDraft[row.id] ?? "").trim();
    if (!note) return;

    onAssess(row.id, "Không phù hợp", note);
    setNoteDraft((prev) => {
      const out = { ...prev };
      delete out[row.id];
      return out;
    });
  }

  function cancelMismatch(id: string) {
    setNoteDraft((prev) => {
      const out = { ...prev };
      delete out[id];
      return out;
    });
  }
  /* ============================ Render ============================= */

  return (
    <ContentCard className="flex flex-col gap-4">
      <StepTitle
        index={4}
        title="Đánh giá kiểm soát hiện hữu"
        note="Với từng kiểm soát đang bảo vệ rủi ro, kết luận nó có xử lý đúng rủi ro này không và thực tế còn chạy tốt không"
      />

      {/* ==================== Dải tiến độ ==================== */}
      <div
        className={cn(
          "flex gap-2 rounded-card border p-3 text-[12px] leading-4",
          stageDone
            ? "border-lv-low-border bg-lv-low-bg text-lv-low-text"
            : summary.total === 0
              ? "border-border-light bg-surface-alt text-text-secondary"
              : "border-lv-medium-border bg-lv-medium-bg text-lv-medium-text",
        )}
      >
        {stageDone ? (
          <IconShieldCheck size={17} className="mt-px shrink-0" />
        ) : (
          <IconAlertTriangle size={17} className="mt-px shrink-0" />
        )}
        <span className="min-w-0 flex-1">{describeAssessment(summary)}</span>
      </div>

      {/* ==================== Chip đếm và lọc ==================== */}
      {summary.total > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ASSESS_FILTERS.map((f) => {
            const count = rows.filter((r) =>
              matchAssessFilter(f.key, r),
            ).length;
            const active = filter === f.key;

            return (
              <Tooltip key={f.key} content={f.hint}>
                <button
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-ctrl border px-2.5 py-1 text-[12px] transition-colors",
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-border-light bg-white text-text-secondary hover:border-brand",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "ml-1.5 font-semibold",
                      active ? "text-white" : "text-text-primary",
                    )}
                  >
                    {count}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* ==================== Bảng đánh giá ==================== */}
      {summary.total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-neutral bg-surface-alt px-4 py-8 text-center">
          <IconShieldX size={24} className="text-icon-neutral" />
          <p className="text-[13px] font-medium text-text-primary">
            Chưa gắn kiểm soát nào với rủi ro này
          </p>
          <p className="max-w-[460px] text-[12px] leading-4 text-text-secondary">
            Tìm kiểm soát ở phần bên dưới. Nếu rủi ro ở mức thấp và chi phí kiểm
            soát lớn hơn lợi ích, anh tuyên bố chấp nhận rủi ro cũng được.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border-light">
          {/* ------------------ Tiêu đề cột ------------------ */}
          <div className="hidden bg-surface-alt px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,2fr)_84px] lg:gap-3">
            <span>Kiểm soát</span>
            <span>Vận hành</span>
            <span>Hiệu lực</span>
            <span>Phù hợp với rủi ro này</span>
            <span />
          </div>

          {/* --------------------- Các dòng --------------------- */}
          <div className="flex flex-col divide-y divide-border-light">
            {visibleRows.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-text-hint">
                Không có kiểm soát nào thuộc nhóm lọc này.
              </p>
            ) : (
              visibleRows.map((row) => {
                const editingNote = noteDraft[row.id] !== undefined;

                return (
                  <div
                    key={row.id}
                    className={cn(
                      "flex flex-col gap-2 px-3 py-2.5",
                      !row.assessed && "bg-lv-medium-bg/20",
                    )}
                  >
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,2fr)_84px] lg:items-center lg:gap-3">
                      {/* ---------- Cột 1: kiểm soát ---------- */}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="text-[12px] font-medium text-brand">
                            {row.code}
                          </span>
                          {row.isKeyControl && (
                            <Tooltip content="Kiểm soát trọng yếu, không kiểm soát nào khác thay thế được">
                              <span className="inline-flex">
                                <Badge tone="brand" size="sm">
                                  Trọng yếu
                                </Badge>
                              </span>
                            </Tooltip>
                          )}
                          {!row.assessed && (
                            <Badge tone="warning" size="sm">
                              Chưa đánh giá
                            </Badge>
                          )}
                        </span>
                        <span className="truncate text-[13px] text-text-primary">
                          {row.name}
                        </span>
                        <span className="truncate text-[11px] text-text-hint">
                          {[
                            row.type,
                            row.nature,
                            row.frequency,
                            unitName(row.unitId),
                          ]
                            .filter((x) => x)
                            .join(" · ")}
                        </span>
                      </div>

                      {/* ---------- Cột 2: có đang vận hành không ---------- */}
                      <div className="flex items-center">
                        {row.operating ? (
                          <Badge tone="success" size="sm" dot>
                            Đang hiệu lực
                          </Badge>
                        ) : (
                          <Tooltip
                            content={
                              row.notOperatingNote ??
                              "Chưa được tính là đang bảo vệ rủi ro"
                            }
                          >
                            <span className="inline-flex">
                              <Badge tone="neutral" size="sm">
                                {row.status || "Chưa rõ"}
                              </Badge>
                            </span>
                          </Tooltip>
                        )}
                      </div>

                      {/* ---------- Cột 3: hiệu lực hai chiều ---------- */}
                      <div className="flex flex-wrap items-center gap-1">
                        <Tooltip content={`Thiết kế: ${row.design}`}>
                          <span className="inline-flex">
                            <EffectivenessBadge
                              size="sm"
                              short
                              value={row.design}
                            />
                          </span>
                        </Tooltip>
                        <Tooltip content={`Vận hành: ${row.operation}`}>
                          <span className="inline-flex">
                            <EffectivenessBadge
                              size="sm"
                              short
                              value={row.operation}
                            />
                          </span>
                        </Tooltip>
                      </div>

                      {/* ---------- Cột 4: mức phù hợp với rủi ro ---------- */}
                      <div className="min-w-0">
                        <Select
                          options={RELEVANCE_OPTIONS}
                          value={row.relevance ?? null}
                          placeholder="Chưa kết luận"
                          onChange={(v) =>
                            v && pickRelevance(row, v as ControlRelevance)
                          }
                        />
                      </div>

                      {/* -------- Cột 5: đánh giá sâu và gỡ -------- */}
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip content="Mở luồng đánh giá 4 bước: xem nhanh hồ sơ, xác nhận phù hợp, cập nhật hiệu quả, ghi nhận điểm yếu">
                          <button
                            type="button"
                            onClick={() => setAssessingId(row.id)}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-ctrl transition-colors",
                              row.assessed
                                ? "text-icon-neutral hover:bg-brand-light hover:text-brand"
                                : "bg-brand-light text-brand hover:bg-brand hover:text-white",
                            )}
                          >
                            <IconListSearch size={15} />
                          </button>
                        </Tooltip>

                        <Tooltip content="Gỡ kiểm soát này khỏi rủi ro">
                          <button
                            type="button"
                            onClick={() => removeControl(row.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-ctrl text-icon-neutral transition-colors hover:bg-lv-critical-bg hover:text-lv-critical-text"
                          >
                            <IconTrash size={15} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {/* ---------- Ô lý do khi chọn Không phù hợp ---------- */}
                    {editingNote && (
                      <div className="flex flex-col gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg/30 p-2.5">
                        <span className="text-[12px] font-medium text-lv-critical-text">
                          Vì sao kiểm soát này không phù hợp với rủi ro đang
                          khai báo
                        </span>

                        <Textarea
                          rows={2}
                          maxLength={500}
                          placeholder="Ví dụ: Kiểm soát này đối chiếu công nợ, không liên quan tới nguyên nhân gián đoạn hệ thống"
                          value={noteDraft[row.id] ?? ""}
                          onChange={(e) =>
                            setNoteDraft((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                        />

                        <span className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<IconCheck size={14} />}
                            disabled={!(noteDraft[row.id] ?? "").trim()}
                            onClick={() => confirmMismatch(row)}
                          >
                            Ghi kết luận
                          </Button>
                          <Button
                            variant="text"
                            size="sm"
                            icon={<IconX size={14} />}
                            onClick={() => cancelMismatch(row.id)}
                          >
                            Huỷ
                          </Button>
                          <span className="text-[11px] text-text-hint">
                            Bắt buộc nêu lý do, vì đây là căn cứ để gỡ kiểm soát
                            khỏi rủi ro
                          </span>
                        </span>
                      </div>
                    )}

                    {/* ---------- Dải giải thích khi bị loại ---------- */}
                    {!editingNote && row.assessed && row.excludeReason && (
                      <p className="flex items-start gap-1.5 pl-0.5 text-[11px] leading-4 text-lv-medium-text">
                        <IconAlertTriangle
                          size={13}
                          className="mt-px shrink-0"
                        />
                        <span>
                          Không vào phép tính gợi ý điểm còn lại:{" "}
                          {row.excludeReason}
                          {row.relevance === "Không phù hợp" &&
                            row.relevanceNote &&
                            `. Lý do đã ghi: ${row.relevanceNote}`}
                        </span>
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {/* ============== Cảnh báo bắt buộc có kiểm soát ============== */}
      {requiresControl && summary.counted === 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
          <IconShieldX size={16} className="mt-px shrink-0" />
          <span>
            Rủi ro vốn có mức Cao trở lên <b>bắt buộc</b> có ít nhất 1 kiểm soát
            đang bảo vệ, tức là đang vận hành, đã đánh giá hiệu lực và được kết
            luận phù hợp với rủi ro này.
          </span>
        </div>
      )}

      {/* ============== Panel tìm thêm kiểm soát ============== */}
      <div className="flex flex-col gap-3 rounded-card border border-border-light p-3">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <IconPlus size={16} className="shrink-0 text-brand" />
          <span className="text-[13px] font-semibold text-text-primary">
            Thêm kiểm soát từ thư viện
          </span>
          <span className="ml-auto text-[12px] text-text-secondary">
            {pickerRows.length} kiểm soát chưa gắn
          </span>
          {pickerOpen ? (
            <IconChevronUp size={15} className="shrink-0 text-icon-neutral" />
          ) : (
            <IconChevronDown size={15} className="shrink-0 text-icon-neutral" />
          )}
        </button>

        {(pickerOpen || summary.total === 0) && (
          <>
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
            </div>

            <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto rounded-ctrl border border-border-light p-2">
              {pickerRows.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] text-text-hint">
                  Không có kiểm soát phù hợp. Thử xoá từ khoá tìm kiếm.
                </p>
              ) : (
                pickerRows.map((c) => {
                  const operating = isControlOperating(c.status);

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addControl(c.id)}
                      className="flex items-start gap-2.5 rounded-ctrl border border-border-light bg-white px-2.5 py-2 text-left transition-colors hover:border-brand hover:bg-[#FAFAFA]"
                    >
                      <IconPlus
                        size={15}
                        className="mt-0.5 shrink-0 text-brand"
                      />

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
                          <EffectivenessBadge
                            size="sm"
                            short
                            value={overallEffectivenessOf(c)}
                          />
                          {!operating && (
                            <Badge tone="neutral" size="sm">
                              {c.status}
                            </Badge>
                          )}
                        </span>

                        <span className="block truncate text-[11px] text-text-hint">
                          {[c.type, c.nature, c.frequency, unitName(c.unitId)]
                            .filter((x) => x)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ========= Tuyên bố chấp nhận, chỉ cho rủi ro thấp ========= */}
      <div
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
            : "Dùng khi rủi ro ở mức thấp và chi phí kiểm soát lớn hơn lợi ích. Hồ sơ vẫn ghi nhận là quyết định có chủ đích, không phải bỏ trống."}
        </span>
      </div>

      {/* ============ Nhắc về ảnh hưởng tới bước 6 ============ */}
      {summary.total > 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
          <IconInfoCircle size={16} className="mt-px shrink-0" />
          <span>
            Gợi ý điểm rủi ro còn lại ở bước 6 chỉ tính trên{" "}
            <b>{summary.counted} kiểm soát đang bảo vệ</b>. Kiểm soát không vận
            hành, chưa đánh giá hiệu lực, hoặc không phù hợp đều bị loại khỏi
            phép tính, nên con số gợi ý phản ánh đúng mức bảo vệ thực tế.
          </span>
        </div>
      )}
      {/* ============== Ngăn kéo đánh giá sâu ============== */}
      <ControlAssessDrawer
        open={assessingRow !== null}
        row={assessingRow}
        riskCode={riskCode}
        riskName={riskName}
        unitName={unitName}
        onClose={() => setAssessingId(null)}
        onSubmit={(result) => {
          onDeepAssess(result);
          setAssessingId(null);
        }}
      />
    </ContentCard>
  );
}
