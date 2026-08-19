"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconDeviceFloppy,
  IconInfoCircle,
  IconLock,
  IconTarget,
  IconTools,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DateInput,
  Input,
  LifecycleStepper,
  SearchInput,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  ContentCard,
  FooterActionBar,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { controlRepo, riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { RISK_SOURCES } from "@/lib/domain/enums";
import {
  emptyRiskForm,
  inherentLevelOf,
  inherentScoreOf,
  riskToForm,
  type RiskFormValue,
} from "@/lib/domain/risk-utils";
import {
  RISK_STAGES,
  WIZARD_STAGES,
  stageIndexOf,
  type RiskStageKey,
} from "@/lib/domain/risk-lifecycle";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";
import {
  clearDraft,
  readDraft,
  validateAll,
  validateStage,
  writeDraft,
  type FlatErrorMap,
} from "./wizard-config";

/* ==================================================================
   Wizard khai báo rủi ro, 8 bước.

   Điểm khác biệt cốt lõi so với bản 5 bước:

   1. STATE LÀ RiskFormValue, KHÔNG PHẢI KIỂU TỰ KHAI.
      Nhờ vậy gõ sai tên trường là TypeScript báo đỏ ngay, thay vì lưu
      xong mới phát hiện dữ liệu mất. Bốn lỗi trước đây gồm treatment,
      reviewDate, identifiedDate và tags đều thuộc loại đó.

   2. KIỂM TRA BẰNG SCHEMA, WIZARD CHỈ LỌC THEO BƯỚC.
      Mọi rule nghiệp vụ nằm ở riskFormSchema, wizard không viết lại.

   3. KHÔNG CHẶN ĐIỂM CÒN LẠI CAO HƠN VỐN CÓ.
      Ba lớp chặn cũ đã gỡ hết: superRefine ở schema, điều kiện trong
      validateStep, và prop maxValue của ScoreSelector. Thay bằng cảnh
      báo mềm cộng bắt buộc nêu căn cứ.

   4. ĐIỀU HƯỚNG THEO KHOÁ GIAI ĐOẠN, KHÔNG THEO CHỈ SỐ.
      Đây là lần thứ hai đổi số bước, nên mọi chỗ so khớp bằng khoá để
      lần sau thêm bước chỉ cần sửa mảng cấu hình.
   ================================================================== */

/* ------------------------------------------------------------------ */
/* Kiểu tối giản cho dữ liệu ngoài phạm vi Risk                        */
/* ------------------------------------------------------------------ */

interface ControlLite {
  id: string;
  code: string;
  name?: string;
  type?: string | null;
  nature?: string | null;
  frequency?: string | null;
  status?: string | null;
  unitId?: string;
  isKeyControl?: boolean;
  riskIds?: string[];
  designEffectiveness?: string | null;
  operationEffectiveness?: string | null;
  lastTestResult?: string | null;
}

/**
 * Ba nhóm dữ liệu wizard KHÔNG thuộc riskFormSchema, nên giữ state riêng:
 *   - controlIds : liên kết lưu ở control.riskIds
 *   - weakness   : sinh ra bản ghi Deficiency riêng ở bước 5
 *   - touched    : chỉ là trạng thái giao diện, không lưu
 */
interface WizardExtra {
  controlIds: string[];
  weakness: {
    has: boolean;
    name: string;
    description: string;
    priority: "Theo dõi sau" | "Phân tích ngay";
  };
  touched: string[];
}

const EMPTY_EXTRA: WizardExtra = {
  controlIds: [],
  weakness: {
    has: false,
    name: "",
    description: "",
    priority: "Theo dõi sau",
  },
  touched: [],
};

/* ------------------------------------------------------------------ */
/* Hằng số                                                            */
/* ------------------------------------------------------------------ */

/** Sinh từ enum thay vì khai tay, để không bao giờ lệch giá trị */
const SOURCE_OPTIONS = RISK_SOURCES.map((v) => ({ value: v, label: v }));

/** Kiểm soát chưa phê duyệt thì chưa tính là đang bảo vệ rủi ro */
const NOT_YET_ACTIVE = new Set(["Nháp", "Chờ duyệt"]);

interface SimpleRepo {
  create: (
    value: Record<string, unknown>,
    by?: string,
  ) => {
    id: string;
    code: string;
  };
  update: (id: string, patch: Record<string, unknown>) => void;
}

const rRepo = riskRepo as unknown as SimpleRepo;
const cRepo = controlRepo as unknown as SimpleRepo;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ================================================================== */
/* Màn hình                                                            */
/* ================================================================== */

export default function RiskFormScreen({ code }: { code?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();

  const risks = useCollection(riskRepo) as unknown as (RiskFormValue & {
    id: string;
    code: string;
  })[];
  const controls = useCollection(controlRepo) as unknown as ControlLite[];

  const editing = useMemo(
    () => (code ? risks.find((r) => r.code === code) : undefined),
    [risks, code],
  );
  const isEdit = !!editing;

  const [stage, setStage] = useState<RiskStageKey>("context");
  const [form, setForm] = useState<RiskFormValue>(() => emptyRiskForm());
  const [extra, setExtra] = useState<WizardExtra>(EMPTY_EXTRA);
  const [errors, setErrors] = useState<FlatErrorMap>({});
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  /* --------------------------- Nạp dữ liệu ---------------------------- */

  const recordKey = editing?.id ?? "new";
  if (recordKey !== loadedKey) {
    setLoadedKey(recordKey);
    setErrors({});
    setStage("context");

    if (editing) {
      setForm(riskToForm(editing as never));
      setExtra({
        ...EMPTY_EXTRA,
        controlIds: controls
          .filter((c) => (c.riskIds ?? []).includes(editing.id))
          .map((c) => c.id),
        /* Bản ghi đã có thì coi như điểm đã được xác nhận */
        touched: [
          "inherentLikelihood",
          "inherentImpact",
          "residualLikelihood",
          "residualImpact",
        ],
      });
    } else {
      setForm(emptyRiskForm());
      setExtra(EMPTY_EXTRA);
    }
  }

  /* Nạp nháp, chỉ khi thêm mới và chỉ một lần */
  useEffect(() => {
    if (isEdit || draftLoaded) return;
    setDraftLoaded(true);

    const draft = readDraft();
    if (!draft) return;

    setForm(draft.form);
    setExtra((prev) => ({ ...prev, controlIds: draft.controlIds ?? [] }));
    setStage(draft.stage ?? "context");

    toast.info?.(
      "Đã nạp lại bản nháp",
      "Nội dung anh lưu trước đó được phục hồi, có thể tiếp tục từ bước đang dừng.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, draftLoaded]);

  /* ---------------------------- Tiện ích ------------------------------ */

  function patch(next: Partial<RiskFormValue>) {
    setForm((prev) => ({ ...prev, ...next }));

    /* Người dùng vừa sửa trường nào thì xoá lỗi của trường đó */
    setErrors((prev) => {
      const keys = Object.keys(next);
      if (!keys.some((k) => prev[k])) return prev;
      const out = { ...prev };
      keys.forEach((k) => delete out[k]);
      return out;
    });
  }

  function patchExtra(next: Partial<WizardExtra>) {
    setExtra((prev) => ({ ...prev, ...next }));
  }

  /** Ghi nhận người dùng đã chạm vào một trường điểm */
  function markTouched(...fields: string[]) {
    setExtra((prev) => {
      const missing = fields.filter((f) => !prev.touched.includes(f));
      if (missing.length === 0) return prev;
      return { ...prev, touched: [...prev.touched, ...missing] };
    });
  }

  /* -------------------------- Dữ liệu dẫn xuất ------------------------ */

  const pickedControls = useMemo(
    () => controls.filter((c) => extra.controlIds.includes(c.id)),
    [controls, extra.controlIds],
  );

  const activePicked = useMemo(
    () => pickedControls.filter((c) => !NOT_YET_ACTIVE.has(c.status ?? "")),
    [pickedControls],
  );

  const inherentScore = inherentScoreOf(form);
  const requiresControl = inherentScore > 9;

  /**
   * Bước 4 đã hoàn tất chưa. Đây là CỔNG CHẶN duy nhất của wizard.
   *
   * Lưu ý neo vào bước 4, KHÔNG neo vào bước liền trước bước 6. Bước 5
   * Điểm yếu là tuỳ chọn và bỏ qua được, nếu neo sai thì bỏ qua bước 5
   * sẽ khoá luôn bước 6.
   */
  const controlStageDone = activePicked.length > 0 || !!form.noControlAccepted;

  /* --------------------------- Điều hướng ----------------------------- */

  const stageIndex = stageIndexOf(stage);
  const totalStages = WIZARD_STAGES.length;

  /** Bước này có bị khoá không, kèm lý do để giải thích cho người dùng */
  function lockReasonOf(key: RiskStageKey): string | undefined {
    const idx = stageIndexOf(key);
    const gateIdx = stageIndexOf("residual");

    if (idx >= gateIdx && !controlStageDone)
      return "Phải gắn kiểm soát ở bước 4 trước, vì điểm còn lại là kết quả sau khi đã có kiểm soát";

    return undefined;
  }

  function goto(key: RiskStageKey) {
    const lock = lockReasonOf(key);
    if (lock) {
      toast.warning("Chưa mở được bước này", lock);
      return;
    }
    setStage(key);
  }

  function scrollToField(field?: string) {
    if (!field) return;
    setTimeout(() => {
      document
        .querySelector(`[data-field="${field}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function next() {
    const check = validateStage(form, stage);

    if (!check.ok) {
      setErrors(check.errors);
      scrollToField(check.firstField);
      const n = Object.keys(check.errors).length;
      toast.error(
        "Chưa chuyển bước được",
        `Còn ${n} nội dung chưa hợp lệ ở bước này.`,
      );
      return;
    }

    /* Cổng chặn riêng của bước 4, không thuộc schema */
    if (stage === "controls" && !controlStageDone) {
      toast.error(
        "Chưa chuyển bước được",
        requiresControl
          ? "Rủi ro vốn có mức Cao trở lên bắt buộc gắn ít nhất 1 kiểm soát đã phê duyệt."
          : "Chọn ít nhất 1 kiểm soát, hoặc tuyên bố chấp nhận rủi ro nếu không áp dụng kiểm soát nào.",
      );
      return;
    }

    setErrors({});
    const nextStage = WIZARD_STAGES[Math.min(stageIndex + 1, totalStages - 1)];
    goto(nextStage.key);
  }

  function back() {
    setErrors({});
    const prev = WIZARD_STAGES[Math.max(stageIndex - 1, 0)];
    setStage(prev.key);
  }

  /* ----------------------------- Nháp -------------------------------- */

  function saveDraft() {
    const ok = writeDraft({ form, controlIds: extra.controlIds, stage });
    if (ok)
      toast.success(
        "Đã lưu nháp",
        "Nội dung được giữ trong trình duyệt, anh có thể quay lại hoàn tất sau.",
      );
    else
      toast.error(
        "Không lưu nháp được",
        "Trình duyệt đang chặn bộ nhớ cục bộ.",
      );
  }

  /* ------------------- Gắn kiểm soát vào rủi ro ---------------------- */

  /**
   * Kiểm soát gắn rủi ro qua control.riskIds, nên phải cập nhật hai
   * chiều: thêm id vào kiểm soát mới chọn, bỏ khỏi kiểm soát bị bỏ.
   */
  function applyControlLinks(riskId: string, nextIds: string[]): boolean {
    let changed = false;

    controls.forEach((c) => {
      const list = c.riskIds ?? [];
      const has = list.includes(riskId);
      const should = nextIds.includes(c.id);
      if (has === should) return;

      changed = true;
      cRepo.update(c.id, {
        riskIds: should ? [...list, riskId] : list.filter((x) => x !== riskId),
      });
    });

    return changed;
  }

  /* ------------------------------ Lưu -------------------------------- */

  function submit() {
    const result = validateAll(form);

    if (!result.ok) {
      const firstGroup = result.byStage[0];
      setStage(firstGroup.stage);
      setErrors(
        Object.fromEntries(
          firstGroup.fields.map((f) => [f.field, f.message]),
        ) as FlatErrorMap,
      );
      scrollToField(firstGroup.fields[0]?.field);
      toast.error(
        "Chưa lưu được",
        `Còn ${Object.keys(result.errors).length} nội dung chưa hợp lệ, đã chuyển tới bước đầu tiên có vấn đề.`,
      );
      return;
    }

    setSaving(true);
    try {
      /* Truyền cả form nên không thể thiếu hoặc sai tên trường nào */
      const payload: Record<string, unknown> = { ...form };

      if (editing) {
        const linkChanged = applyControlLinks(editing.id, extra.controlIds);
        rRepo.update(editing.id, {
          ...payload,
          controlsChangedAt: linkChanged
            ? today()
            : ((editing as { controlsChangedAt?: string }).controlsChangedAt ??
              ""),
        });
        toast.success(
          `Đã lưu ${editing.code}`,
          "Hồ sơ rủi ro đã được cập nhật.",
        );
        router.push(`/rui-ro/so-dang-ky/${editing.code}`);
        return;
      }

      const row = rRepo.create(
        { ...payload, controlsChangedAt: today() },
        user.name,
      );
      applyControlLinks(row.id, extra.controlIds);
      clearDraft();

      toast.success(
        `Đã ghi nhận ${row.code}`,
        "Rủi ro mới xuất hiện ngay trong sổ đăng ký.",
      );
      router.push(`/rui-ro/so-dang-ky/${row.code}`);
    } finally {
      setSaving(false);
    }
  }

  /* -------------------------- Dải vòng đời --------------------------- */

  const stepperItems = WIZARD_STAGES.map((s) => {
    const idx = stageIndexOf(s.key);
    const lock = lockReasonOf(s.key);

    return {
      key: s.key,
      label: s.label,
      description: s.description,
      state:
        idx < stageIndex
          ? ("done" as const)
          : idx === stageIndex
            ? ("current" as const)
            : s.optional
              ? ("skipped" as const)
              : ("todo" as const),
      warning: lock ? "Cần gắn kiểm soát trước" : undefined,
      onClick: () => goto(s.key),
    };
  });

  const currentMeta = WIZARD_STAGES[stageIndex];

  /* ============================== Render ============================= */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => setLeaving(true)}
        title={isEdit ? `Sửa rủi ro ${editing?.code}` : "Ghi nhận rủi ro"}
        subtitle="Khai báo theo 8 bước, điểm rủi ro còn lại chỉ chấm sau khi đã gắn kiểm soát"
        badge={
          <Badge tone="neutral" dot>
            Vốn có {inherentScore} điểm · {inherentLevelOf(form)}
          </Badge>
        }
      />

      <PageBody className="pb-2">
        <div className="mx-auto flex max-w-[1060px] flex-col gap-4">
          <ContentCard className="py-3">
            <LifecycleStepper steps={stepperItems} size="compact" />
          </ContentCard>

          {/* ==================== Bước 1: Bối cảnh ==================== */}
          {stage === "context" && (
            <ContentCard className="flex flex-col gap-4">
              <StepTitle
                index={1}
                title="Bối cảnh rủi ro"
                note="Rủi ro này đang đe doạ mục tiêu nào, phát sinh ở đơn vị và quy trình nào"
              />

              <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                <IconInfoCircle size={16} className="mt-px shrink-0" />
                <span>
                  Mỗi rủi ro <b>bắt buộc gắn với ít nhất 1 mục tiêu</b>. Đây là
                  quy tắc nghiệp vụ cốt lõi: rủi ro không đe doạ mục tiêu nào
                  thì không cần quản lý, và cũng không có căn cứ để xếp mức ưu
                  tiên.
                </span>
              </div>

              <ObjectivePicker
                options={lk.objectiveOptions}
                value={form.objectiveIds}
                error={errors.objectiveIds}
                onChange={(ids) => patch({ objectiveIds: ids })}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div data-field="unitId">
                  <Select
                    label="Đơn vị"
                    required
                    searchable
                    placeholder="Chọn đơn vị chịu ảnh hưởng"
                    options={lk.unitOptions}
                    value={form.unitId || null}
                    error={errors.unitId}
                    onChange={(v) => patch({ unitId: v ?? "" })}
                  />
                </div>

                <div data-field="processId">
                  <Select
                    label="Quy trình liên quan"
                    clearable
                    searchable
                    placeholder="Không bắt buộc"
                    options={lk.processOptions}
                    value={form.processId || null}
                    error={errors.processId}
                    hint={
                      errors.processId
                        ? undefined
                        : "Gắn quy trình giúp tra được rủi ro khi rà soát quy trình đó"
                    }
                    onChange={(v) => patch({ processId: v ?? "" })}
                  />
                </div>

                <div data-field="systemId">
                  <Select
                    label="Hệ thống CNTT liên quan"
                    clearable
                    searchable
                    placeholder="Không bắt buộc"
                    options={lk.systemOptions}
                    value={form.systemId || null}
                    error={errors.systemId}
                    hint={
                      errors.systemId
                        ? undefined
                        : "Cần khai nếu rủi ro phát sinh từ hệ thống hoặc dữ liệu"
                    }
                    onChange={(v) => patch({ systemId: v ?? "" })}
                  />
                </div>
              </div>
            </ContentCard>
          )}

          {/* =================== Bước 2: Nhận diện ==================== */}
          {stage === "identify" && (
            <ContentCard className="flex flex-col gap-4">
              <StepTitle
                index={2}
                title="Nhận diện rủi ro"
                note="Mô tả rủi ro đủ rõ để người khác đọc hiểu mà không cần hỏi lại"
              />

              <div data-field="name">
                <Input
                  label="Tên rủi ro"
                  required
                  placeholder="Ví dụ: Gián đoạn dịch vụ do phụ thuộc một nhà cung cấp hạ tầng duy nhất"
                  value={form.name}
                  error={errors.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <div data-field="description">
                <Textarea
                  label="Mô tả rủi ro"
                  rows={3}
                  maxLength={1500}
                  showCount
                  placeholder="Rủi ro là gì, xảy ra trong hoàn cảnh nào, ai chịu ảnh hưởng"
                  value={form.description}
                  error={errors.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div data-field="cause">
                  <Textarea
                    label="Nguyên nhân"
                    rows={3}
                    maxLength={800}
                    placeholder="Nguyên nhân gốc dẫn tới rủi ro này"
                    value={form.cause}
                    error={errors.cause}
                    onChange={(e) => patch({ cause: e.target.value })}
                  />
                </div>
                <div data-field="consequence">
                  <Textarea
                    label="Hệ quả nếu xảy ra"
                    rows={3}
                    maxLength={800}
                    placeholder="Điều gì sẽ xảy ra nếu rủi ro hiện thực hoá"
                    value={form.consequence}
                    error={errors.consequence}
                    onChange={(e) => patch({ consequence: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div data-field="categoryId">
                  <Select
                    label="Nhóm rủi ro"
                    required
                    searchable
                    placeholder="Chọn nhóm"
                    options={lk.riskCategoryOptions}
                    value={form.categoryId || null}
                    error={errors.categoryId}
                    onChange={(v) => patch({ categoryId: v ?? "" })}
                  />
                </div>

                <div data-field="ownerId">
                  <Select
                    label="Chủ sở hữu rủi ro"
                    required
                    searchable
                    placeholder="Chọn người phụ trách"
                    options={lk.employeeOptions}
                    value={form.ownerId || null}
                    error={errors.ownerId}
                    hint={
                      errors.ownerId
                        ? undefined
                        : "Người chịu trách nhiệm theo dõi rủi ro này"
                    }
                    onChange={(v) => patch({ ownerId: v ?? "" })}
                  />
                </div>

                <div data-field="source">
                  <Select
                    label="Nguồn rủi ro"
                    options={SOURCE_OPTIONS}
                    value={form.source || null}
                    error={errors.source}
                    onChange={(v) =>
                      patch({ source: (v ?? "Nội bộ") as typeof form.source })
                    }
                  />
                </div>

                <div data-field="identifiedDate">
                  <DateInput
                    label="Ngày nhận diện"
                    required
                    max={today()}
                    value={form.identifiedDate}
                    error={errors.identifiedDate}
                    hint={
                      errors.identifiedDate
                        ? undefined
                        : "Mốc tính tuổi rủi ro và kỳ rà soát"
                    }
                    onChange={(v) => patch({ identifiedDate: v })}
                  />
                </div>
              </div>

              <div
                data-field="isZeroTolerance"
                className="flex flex-col gap-1 rounded-ctrl bg-surface-alt px-3 py-2.5"
              >
                <Checkbox
                  label="Rủi ro không khoan nhượng"
                  checked={form.isZeroTolerance}
                  onChange={(e) => patch({ isZeroTolerance: e.target.checked })}
                />
                <span className="pl-6 text-[11px] leading-4 text-text-hint">
                  Tổ chức không chấp nhận rủi ro này ở bất kỳ mức nào, ví dụ
                  gian lận hoặc vi phạm pháp luật. Bật cờ này thì ở bước 7{" "}
                  <b>không chọn được</b> phương án Chấp nhận.
                </span>
              </div>
            </ContentCard>
          )}

          {/* ============ Bước 3 tới 8: chờ nhịp sau ============ */}
          {stage === "inherent" && (
            <StepPlaceholder
              index={3}
              title="Đánh giá rủi ro vốn có"
              note="Chấm điểm khi giả định chưa có kiểm soát nào, kèm ước lượng tổn thất"
              batch="D2b"
            />
          )}

          {stage === "controls" && (
            <StepPlaceholder
              index={4}
              title="Chọn kiểm soát"
              note="Gắn kiểm soát đang bảo vệ rủi ro này từ thư viện kiểm soát"
              batch="D2b"
              extraNote={
                controlStageDone
                  ? undefined
                  : "Bước 6 đang bị khoá cho tới khi bước này hoàn tất."
              }
            />
          )}

          {stage === "weakness" && (
            <StepPlaceholder
              index={5}
              title="Nghi ngờ điểm yếu"
              note="Bước tuỳ chọn, ghi nhận sơ bộ điểm yếu phát hiện khi rà kiểm soát"
              batch="D3"
            />
          )}

          {stage === "residual" && (
            <StepPlaceholder
              index={6}
              title="Đánh giá rủi ro còn lại"
              note="Hệ thống gợi ý điểm từ tập kiểm soát, người dùng sửa tự do"
              batch="D2b"
            />
          )}

          {stage === "treat" && (
            <StepPlaceholder
              index={7}
              title="Phương án xử lý"
              note="Chiến lược ứng phó, định hướng xử lý và kỳ rà soát lại"
              batch="D2b"
            />
          )}

          {stage === "review" && (
            <StepPlaceholder
              index={8}
              title="Rà soát và gửi"
              note="Xem lại toàn bộ hồ sơ, liệt kê mọi nội dung còn thiếu theo từng bước"
              batch="D2b"
            />
          )}
        </div>
      </PageBody>

      {/* ======================= Thanh hành động ======================= */}
      <FooterActionBar
        left={
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <Badge tone="neutral" dot>
              Bước {stageIndex + 1} / {totalStages}
            </Badge>
            <span>{currentMeta.label}</span>
            {currentMeta.optional && (
              <span className="text-text-hint">có thể bỏ qua</span>
            )}
            {!controlStageDone && stageIndex < stageIndexOf("residual") && (
              <span className="inline-flex items-center gap-1 text-lv-medium-text">
                <IconLock size={13} />
                Bước 6 mở sau khi gắn kiểm soát
              </span>
            )}
          </span>
        }
      >
        {!isEdit && (
          <Button
            variant="text"
            icon={<IconDeviceFloppy size={16} />}
            onClick={saveDraft}
            disabled={saving}
          >
            Lưu nháp
          </Button>
        )}

        <Button
          variant="secondary"
          icon={<IconArrowLeft size={16} />}
          disabled={stageIndex === 0 || saving}
          onClick={back}
        >
          Quay lại
        </Button>

        {stage !== "review" ? (
          <Button
            variant="primary"
            icon={<IconArrowRight size={16} />}
            onClick={next}
          >
            {currentMeta.optional ? "Bỏ qua và tiếp tục" : "Bước tiếp theo"}
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={<IconCheck size={16} />}
            loading={saving}
            onClick={submit}
          >
            {isEdit ? "Lưu thay đổi" : "Ghi nhận rủi ro"}
          </Button>
        )}
      </FooterActionBar>

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          router.push("/rui-ro/so-dang-ky");
        }}
        title="Rời khỏi trang"
        message="Nội dung chưa lưu sẽ mất. Anh có thể bấm Lưu nháp trước khi rời đi."
        confirmText="Rời đi"
        cancelText="Ở lại"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Ô chọn nhiều mục tiêu                                               */
/* ================================================================== */

interface LookupOptionLite {
  value: string;
  label: string;
  description?: string;
}

/**
 * Chọn nhiều mục tiêu bằng danh sách checkbox có tìm kiếm.
 *
 * Cố tình KHÔNG dùng Select đa chọn, vì component Select của dự án đang
 * nhận value là một chuỗi. Dựng bằng Checkbox và SearchInput là hai
 * component đã dùng ở nhiều màn hình nên chắc chắn có sẵn.
 */
function ObjectivePicker({
  options,
  value,
  error,
  onChange,
}: {
  options: LookupOptionLite[];
  value: string[];
  error?: string;
  onChange: (ids: string[]) => void;
}) {
  const [keyword, setKeyword] = useState("");

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const list = kw
      ? options.filter((o) =>
          `${o.label} ${o.description ?? ""}`.toLowerCase().includes(kw),
        )
      : options;

    /* Mục đã chọn luôn lên đầu để người dùng thấy ngay mình đã chọn gì */
    return [...list].sort((a, b) => {
      const pa = value.includes(a.value) ? 0 : 1;
      const pb = value.includes(b.value) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.label.localeCompare(b.label);
    });
  }, [options, keyword, value]);

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  }

  return (
    <section
      data-field="objectiveIds"
      className={cn(
        "flex flex-col gap-2.5 rounded-card border p-3",
        error
          ? "border-lv-critical-border bg-lv-critical-bg/30"
          : "border-border-light",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IconTarget size={16} className="text-brand" />
        <span className="text-[13px] font-semibold text-text-primary">
          Mục tiêu bị đe doạ <span className="text-danger">*</span>
        </span>
        <span className="ml-auto text-[12px] text-text-secondary">
          Đã chọn <b className="text-text-primary">{value.length}</b>
        </span>
      </div>

      <SearchInput
        value={keyword}
        onChange={setKeyword}
        placeholder="Tìm theo tên mục tiêu"
        width={340}
      />

      <div className="flex max-h-[240px] flex-col gap-1 overflow-y-auto rounded-ctrl border border-border-light p-2">
        {rows.length === 0 ? (
          <p className="px-2 py-5 text-center text-[12px] text-text-hint">
            Không có mục tiêu phù hợp. Thử xoá từ khoá tìm kiếm.
          </p>
        ) : (
          rows.map((o) => {
            const active = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "flex items-start gap-2.5 rounded-ctrl border px-2.5 py-2 text-left transition-all",
                  active
                    ? "border-brand bg-brand-light"
                    : "border-transparent bg-white hover:bg-[#FAFAFA]",
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
                  <span className="block truncate text-[13px] text-text-primary">
                    {o.label}
                  </span>
                  {o.description && (
                    <span className="block truncate text-[11px] text-text-hint">
                      {o.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-[12px] leading-4 text-danger">
          <IconAlertTriangle size={14} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}

/* ================================================================== */
/* Thành phần phụ trợ                                                  */
/* ================================================================== */

function StepTitle({
  index,
  title,
  note,
}: {
  index: number;
  title: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-[13px] font-semibold text-brand">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        <p className="text-[12px] leading-4 text-text-secondary">{note}</p>
      </div>
    </div>
  );
}

/**
 * Ô giữ chỗ cho các bước sẽ dựng ở nhịp sau.
 *
 * Có ô này thì build sạch ngay sau D2a và luồng điều hướng 8 bước thử
 * được đầy đủ, thay vì phải chờ tới khi mọi bước hoàn thiện.
 */
function StepPlaceholder({
  index,
  title,
  note,
  batch,
  extraNote,
}: {
  index: number;
  title: string;
  note: string;
  batch: string;
  extraNote?: string;
}) {
  return (
    <ContentCard className="flex flex-col gap-4">
      <StepTitle index={index} title={title} note={note} />

      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-neutral bg-surface-alt px-4 py-10 text-center">
        <IconTools size={26} className="text-icon-neutral" />
        <p className="text-[13px] font-medium text-text-primary">
          Bước này đang được dựng ở nhịp {batch}
        </p>
        <p className="max-w-[520px] text-[12px] leading-4 text-text-secondary">
          Luồng điều hướng và cơ chế kiểm tra đã hoạt động đầy đủ, anh bấm qua
          lại giữa các bước để thử được ngay. Phần nhập liệu của bước này sẽ
          thay thế khối này.
        </p>
        {extraNote && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-lv-medium-text">
            <IconAlertTriangle size={14} />
            {extraNote}
          </p>
        )}
      </div>
    </ContentCard>
  );
}
