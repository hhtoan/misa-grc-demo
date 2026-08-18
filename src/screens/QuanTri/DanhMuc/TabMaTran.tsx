"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconDeviceFloppy,
  IconGridDots,
  IconInfoCircle,
  IconRefresh,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Segments,
  Tooltip,
  useToast,
} from "@/components/ui";
import { riskRepo, useCollection } from "@/lib/db";
import { cn } from "@/lib/cn";

/* ==================================================================
   Kiểu tối giản, không phụ thuộc schema
   ================================================================== */

interface RiskLite {
  id: string;
  code?: string;
  name?: string;
  status?: string;
  residualLikelihood?: number;
  residualImpact?: number;
  inherentLikelihood?: number;
  inherentImpact?: number;
  likelihood?: number;
  impact?: number;
}

type LevelKey = "low" | "medium" | "high" | "critical";

const LEVEL_META: Record<
  LevelKey,
  { label: string; cell: string; chip: string }
> = {
  low: {
    label: "Thấp",
    cell: "bg-lv-low-bg text-lv-low-text border-lv-low-border",
    chip: "bg-lv-low-bg text-lv-low-text",
  },
  medium: {
    label: "Trung bình",
    cell: "bg-lv-medium-bg text-lv-medium-text border-lv-medium-border",
    chip: "bg-lv-medium-bg text-lv-medium-text",
  },
  high: {
    label: "Cao",
    cell: "bg-lv-high-bg text-lv-high-text border-lv-high-border",
    chip: "bg-lv-high-bg text-lv-high-text",
  },
  critical: {
    label: "Trọng yếu",
    cell: "bg-lv-critical-bg text-lv-critical-text border-lv-critical-border",
    chip: "bg-lv-critical-bg text-lv-critical-text",
  },
};

interface MatrixConfig {
  likelihoodLabels: string[];
  impactLabels: string[];
  /** Ngưỡng trên của từng mức, tính theo điểm khả năng nhân tác động */
  thresholds: { low: number; medium: number; high: number };
}

const DEFAULT_CONFIG: MatrixConfig = {
  likelihoodLabels: [
    "Rất hiếm",
    "Hiếm khi",
    "Thỉnh thoảng",
    "Thường xuyên",
    "Gần như chắc chắn",
  ],
  impactLabels: [
    "Không đáng kể",
    "Nhẹ",
    "Trung bình",
    "Nghiêm trọng",
    "Rất nghiêm trọng",
  ],
  thresholds: { low: 4, medium: 9, high: 15 },
};

const STORAGE_KEY = "misa-grc-risk-matrix";

function levelOfScore(score: number, th: MatrixConfig["thresholds"]): LevelKey {
  if (score <= th.low) return "low";
  if (score <= th.medium) return "medium";
  if (score <= th.high) return "high";
  return "critical";
}

/* ================================================================== */
/* Tab Ma trận rủi ro                                                  */
/* ================================================================== */

export default function TabMaTran({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const risks = useCollection(riskRepo) as unknown as RiskLite[];

  const [saved, setSaved] = useState<MatrixConfig>(DEFAULT_CONFIG);
  const [draft, setDraft] = useState<MatrixConfig>(DEFAULT_CONFIG);
  const [mode, setMode] = useState<"residual" | "inherent">("residual");
  const [error, setError] = useState("");

  /* Nạp cấu hình đã lưu trong trình duyệt */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as MatrixConfig;
      if (
        Array.isArray(parsed.likelihoodLabels) &&
        parsed.likelihoodLabels.length === 5 &&
        Array.isArray(parsed.impactLabels) &&
        parsed.impactLabels.length === 5 &&
        parsed.thresholds
      ) {
        setSaved(parsed);
        setDraft(parsed);
      }
    } catch {
      /* Dữ liệu hỏng thì bỏ qua, dùng cấu hình mặc định */
    }
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  );

  /* -------------------- Toạ độ rủi ro trên lưới ------------------- */

  function cellOf(r: RiskLite): { l: number; i: number } | null {
    const l =
      mode === "residual"
        ? (r.residualLikelihood ?? r.likelihood)
        : (r.inherentLikelihood ?? r.likelihood);
    const i =
      mode === "residual"
        ? (r.residualImpact ?? r.impact)
        : (r.inherentImpact ?? r.impact);
    if (!l || !i) return null;
    if (l < 1 || l > 5 || i < 1 || i > 5) return null;
    return { l: Math.round(l), i: Math.round(i) };
  }

  const activeRisks = useMemo(
    () => risks.filter((r) => r.status !== "Đã đóng"),
    [risks],
  );

  const cellRisks = useMemo(() => {
    const map = new Map<string, RiskLite[]>();
    activeRisks.forEach((r) => {
      const c = cellOf(r);
      if (!c) return;
      const key = `${c.l}-${c.i}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRisks, mode]);

  const unmapped = useMemo(
    () => activeRisks.filter((r) => !cellOf(r)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRisks, mode],
  );

  /* --------------------- So sánh trước và sau --------------------- */

  const compare = useMemo(() => {
    const before: Record<LevelKey, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    const after: Record<LevelKey, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    let changed = 0;

    activeRisks.forEach((r) => {
      const c = cellOf(r);
      if (!c) return;
      const score = c.l * c.i;
      const b = levelOfScore(score, saved.thresholds);
      const a = levelOfScore(score, draft.thresholds);
      before[b] += 1;
      after[a] += 1;
      if (a !== b) changed += 1;
    });

    return { before, after, changed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRisks, saved, draft, mode]);

  /* ----------------------------- Lưu ------------------------------ */

  function validate(): string {
    const { low, medium, high } = draft.thresholds;
    if ([low, medium, high].some((x) => !Number.isFinite(x)))
      return "Ngưỡng phải là số";
    if (low < 1 || high > 24)
      return "Ngưỡng phải nằm trong khoảng từ 1 đến 24 điểm";
    if (!(low < medium && medium < high))
      return "Ba ngưỡng phải tăng dần: Thấp nhỏ hơn Trung bình, Trung bình nhỏ hơn Cao";
    if (draft.likelihoodLabels.some((x) => !x.trim()))
      return "Không được để trống nhãn mức khả năng";
    if (draft.impactLabels.some((x) => !x.trim()))
      return "Không được để trống nhãn mức tác động";
    return "";
  }

  function save() {
    const msg = validate();
    if (msg) {
      setError(msg);
      toast.error("Chưa lưu được cấu hình", msg);
      return;
    }
    setError("");
    setSaved(draft);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* Trình duyệt chặn localStorage thì vẫn giữ trong phiên */
    }
    toast.success(
      "Đã lưu cấu hình ma trận",
      compare.changed > 0
        ? `${compare.changed} rủi ro đổi mức phân loại theo ngưỡng mới.`
        : "Không có rủi ro nào đổi mức phân loại.",
    );
  }

  function reset() {
    setDraft(DEFAULT_CONFIG);
    setError("");
    toast.info(
      "Đã khôi phục cấu hình mặc định",
      "Bấm Lưu cấu hình để áp dụng, hoặc rời trang nếu muốn giữ nguyên bản cũ.",
    );
  }

  function patchLabel(kind: "likelihood" | "impact", idx: number, v: string) {
    setDraft((prev) => {
      const key = kind === "likelihood" ? "likelihoodLabels" : "impactLabels";
      const list = [...prev[key]];
      list[idx] = v;
      return { ...prev, [key]: list };
    });
    setError("");
  }

  function patchThreshold(key: keyof MatrixConfig["thresholds"], v: string) {
    setDraft((prev) => ({
      ...prev,
      thresholds: { ...prev.thresholds, [key]: Number(v) },
    }));
    setError("");
  }

  /* ------------------------------ Render -------------------------- */

  const rowsDesc = [5, 4, 3, 2, 1];
  const colsAsc = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col gap-4">
      {/* ----------------------- Thanh công cụ ----------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Segments
          items={[
            { key: "residual", label: "Rủi ro còn lại" },
            { key: "inherent", label: "Rủi ro cố hữu" },
          ]}
          value={mode}
          onChange={(k) => setMode(k as "residual" | "inherent")}
        />
        <span className="text-[12px] text-text-secondary">
          Đang xếp <b className="text-text-primary">{activeRisks.length}</b> rủi
          ro chưa đóng lên lưới
        </span>

        {canEdit && (
          <span className="ml-auto flex items-center gap-2">
            {dirty && (
              <Badge tone="warning" dot>
                Có thay đổi chưa lưu
              </Badge>
            )}
            <Button
              variant="secondary"
              icon={<IconRefresh size={16} />}
              onClick={reset}
            >
              Khôi phục mặc định
            </Button>
            <Button
              variant="primary"
              icon={<IconDeviceFloppy size={16} />}
              disabled={!dirty}
              onClick={save}
            >
              Lưu cấu hình
            </Button>
          </span>
        )}
      </div>

      {error && (
        <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* --------------------------- Lưới ---------------------------- */}
      <div className="flex flex-col gap-2 rounded-card border border-border-light p-4">
        <div className="flex items-center gap-2">
          <IconGridDots size={16} className="text-brand" />
          <p className="text-[13px] font-semibold text-text-primary">
            Ma trận 5 x 5 theo ngưỡng đang chỉnh
          </p>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {(Object.keys(LEVEL_META) as LevelKey[]).map((k) => (
              <span
                key={k}
                className={cn(
                  "inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[11px] font-medium",
                  LEVEL_META[k].chip,
                )}
              >
                {LEVEL_META[k].label}
                <b>{compare.after[k]}</b>
              </span>
            ))}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1">
            <tbody>
              {rowsDesc.map((l) => (
                <tr key={l}>
                  <th className="w-[150px] align-middle">
                    {canEdit ? (
                      <Input
                        value={draft.likelihoodLabels[l - 1]}
                        onChange={(e) =>
                          patchLabel("likelihood", l - 1, e.target.value)
                        }
                        placeholder={`Mức khả năng ${l}`}
                      />
                    ) : (
                      <span className="block truncate text-right text-[12px] text-text-secondary">
                        {draft.likelihoodLabels[l - 1]}
                      </span>
                    )}
                  </th>

                  {colsAsc.map((i) => {
                    const score = l * i;
                    const lv = levelOfScore(score, draft.thresholds);
                    const list = cellRisks.get(`${l}-${i}`) ?? [];
                    return (
                      <td key={i} className="p-0">
                        <Tooltip
                          content={
                            list.length === 0
                              ? `Điểm ${score} - mức ${LEVEL_META[lv].label} - chưa có rủi ro nào`
                              : `${LEVEL_META[lv].label} - ${list
                                  .slice(0, 6)
                                  .map((r) => r.code ?? "")
                                  .join(", ")}${list.length > 6 ? "..." : ""}`
                          }
                        >
                          <div
                            className={cn(
                              "flex h-[74px] flex-col items-center justify-center gap-0.5 rounded-ctrl border",
                              LEVEL_META[lv].cell,
                            )}
                          >
                            <span className="text-[11px] opacity-80">
                              {score} điểm
                            </span>
                            <span className="text-[20px] leading-6 font-semibold">
                              {list.length}
                            </span>
                            <span className="text-[11px] opacity-80">
                              {LEVEL_META[lv].label}
                            </span>
                          </div>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr>
                <th />
                {colsAsc.map((i) => (
                  <td key={i}>
                    {canEdit ? (
                      <Input
                        value={draft.impactLabels[i - 1]}
                        onChange={(e) =>
                          patchLabel("impact", i - 1, e.target.value)
                        }
                        placeholder={`Mức tác động ${i}`}
                      />
                    ) : (
                      <span className="block truncate text-center text-[12px] text-text-secondary">
                        {draft.impactLabels[i - 1]}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-text-hint">
          Trục dọc là mức khả năng xảy ra, trục ngang là mức tác động. Số lớn
          trong ô là số rủi ro đang rơi vào ô đó.
        </p>
      </div>

      {/* ------------------------- Ngưỡng mức ------------------------ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-2.5 rounded-card border border-border-light p-4 xl:col-span-2">
          <p className="text-[13px] font-semibold text-text-primary">
            Ngưỡng phân mức theo điểm rủi ro
          </p>
          <p className="text-[12px] leading-4 text-text-secondary">
            Điểm rủi ro bằng mức khả năng nhân mức tác động, dao động từ 1 tới
            25. Ba ngưỡng dưới đây là giới hạn trên của từng mức.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              label="Mức Thấp tối đa"
              type="number"
              min={1}
              max={22}
              disabled={!canEdit}
              value={String(draft.thresholds.low)}
              hint={`Điểm 1 tới ${draft.thresholds.low}`}
              onChange={(e) => patchThreshold("low", e.target.value)}
            />
            <Input
              label="Mức Trung bình tối đa"
              type="number"
              min={2}
              max={23}
              disabled={!canEdit}
              value={String(draft.thresholds.medium)}
              hint={`Điểm ${draft.thresholds.low + 1} tới ${draft.thresholds.medium}`}
              onChange={(e) => patchThreshold("medium", e.target.value)}
            />
            <Input
              label="Mức Cao tối đa"
              type="number"
              min={3}
              max={24}
              disabled={!canEdit}
              value={String(draft.thresholds.high)}
              hint={`Điểm ${draft.thresholds.medium + 1} tới ${draft.thresholds.high}, trên nữa là Trọng yếu`}
              onChange={(e) => patchThreshold("high", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2.5 rounded-card border border-border-light p-4">
          <p className="text-[13px] font-semibold text-text-primary">
            Ảnh hưởng của thay đổi
          </p>
          {compare.changed === 0 ? (
            <p className="text-[12px] leading-4 text-text-secondary">
              Ngưỡng đang chỉnh không làm rủi ro nào đổi mức so với cấu hình
              hiện hành.
            </p>
          ) : (
            <p className="text-[12px] leading-4 text-lv-medium-text">
              Có <b>{compare.changed}</b> rủi ro sẽ đổi mức phân loại nếu lưu
              cấu hình này.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {(Object.keys(LEVEL_META) as LevelKey[]).map((k) => {
              const b = compare.before[k];
              const a = compare.after[k];
              const diff = a - b;
              return (
                <div
                  key={k}
                  className="flex items-center gap-2 text-[12px] text-text-secondary"
                >
                  <span
                    className={cn(
                      "w-[92px] shrink-0 rounded-badge px-2 py-0.5 text-center text-[11px] font-medium",
                      LEVEL_META[k].chip,
                    )}
                  >
                    {LEVEL_META[k].label}
                  </span>
                  <span className="text-text-primary">{b}</span>
                  <span className="text-icon-neutral">→</span>
                  <b className="text-text-primary">{a}</b>
                  {diff !== 0 && (
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        diff > 0 ? "text-danger" : "text-lv-low-text",
                      )}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ------------------------- Ghi chú --------------------------- */}
      {unmapped > 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Có <b>{unmapped}</b> rủi ro chưa xếp được lên lưới vì thiếu điểm khả
            năng hoặc điểm tác động ở chế độ đang xem. Những rủi ro này không
            xuất hiện trong báo cáo phân bố mức độ.
          </span>
        </div>
      )}

      <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
        <IconInfoCircle size={16} className="mt-px shrink-0" />
        <span>
          Cấu hình này được lưu trong trình duyệt để phục vụ demo. Khi nối API
          thật, chỉ cần thay hai chỗ đọc ghi <b>localStorage</b> bằng lời gọi
          API và đưa hàm <b>levelOfScore</b> vào <b>risk-utils</b> để toàn hệ
          thống dùng chung một quy tắc phân mức.
        </span>
      </div>

      {activeRisks.length === 0 && (
        <EmptyState
          icon={<IconGridDots size={24} />}
          title="Chưa có rủi ro nào để xếp lên ma trận"
          description="Ma trận vẫn cấu hình được, số liệu sẽ hiện ngay khi có rủi ro trong sổ đăng ký."
          compact
        />
      )}
    </div>
  );
}
