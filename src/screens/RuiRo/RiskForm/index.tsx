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
  IconCircleCheck,
  IconCoin,
  IconRadar,
  IconShieldCheck,
  IconShieldX,
  IconSparkles,
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
  EffectivenessBadge,
  RiskBadge,
  ScoreSelector,
  Tooltip,
  type ScoreValue,
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
import { RISK_SOURCES, RISK_TREATMENTS } from "@/lib/domain/enums";
import {
  emptyRiskForm,
  inherentLevelOf,
  inherentScoreOf,
  residualLevelOf,
  residualScoreOf,
  riskToForm,
  type RiskFormValue,
} from "@/lib/domain/risk-utils";
import {
  RISK_STAGES,
  WIZARD_STAGES,
  stageIndexOf,
  type RiskStageKey,
} from "@/lib/domain/risk-lifecycle";
import { RISK_SCORING_CRITERIA } from "@/lib/domain/scoring-criteria";
import { overallEffectivenessOf } from "@/lib/domain/control-utils";
import {
  describeSuggestion,
  shortSuggestionHint,
  suggestResidual,
} from "@/lib/domain/residual-suggestion";
import RiskSummaryReview from "../RiskSummaryReview";
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

/** Sinh từ enum, kèm mô tả để người dùng chọn đúng phương án */
const TREATMENT_DESC: Record<string, string> = {
  "Giảm thiểu": "Bổ sung hoặc tăng cường kiểm soát để hạ mức rủi ro",
  "Chuyển giao": "Mua bảo hiểm hoặc chuyển trách nhiệm sang bên thứ ba",
  Tránh: "Dừng hoặc thay đổi hoạt động phát sinh rủi ro",
  "Chấp nhận": "Giữ nguyên, chỉ theo dõi vì mức rủi ro trong khẩu vị",
};

const TREATMENT_OPTIONS = RISK_TREATMENTS.map((v) => ({
  value: v,
  label: v,
  description: TREATMENT_DESC[v] ?? "",
}));

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
  /**
   * Chữ ký của lần pre-fill gần nhất.
   *
   * Gồm điểm vốn có cộng danh sách kiểm soát đã chọn. Khi chữ ký đổi
   * nghĩa là căn cứ tính gợi ý đã khác, nên tính lại. Khi chữ ký không
   * đổi thì KHÔNG ghi đè, để người dùng sửa điểm xong không bị hệ thống
   * đặt lại ngay lúc render sau.
   */
  const [prefillKey, setPrefillKey] = useState("");

  /* --------------------------- Nạp dữ liệu ---------------------------- */

  const recordKey = editing?.id ?? "new";
  if (recordKey !== loadedKey) {
    setLoadedKey(recordKey);
    setErrors({});
    setStage("context");
    /* Form sửa: KHÔNG pre-fill, vì điểm hiện tại là kết luận đã có của
       người đánh giá trước. Gợi ý chỉ hiện kèm nút Áp dụng. */
    setPrefillKey(editing ? "locked" : "");

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

  /* -------------------------- Gợi ý điểm còn lại ---------------------- */

  const suggestion = useMemo(
    () =>
      suggestResidual(
        form.inherentLikelihood,
        form.inherentImpact,
        pickedControls,
        { noControlAccepted: form.noControlAccepted },
      ),
    [
      form.inherentLikelihood,
      form.inherentImpact,
      form.noControlAccepted,
      pickedControls,
    ],
  );

  /** Chữ ký căn cứ tính gợi ý, đổi thì mới pre-fill lại */
  const suggestionSignature = useMemo(
    () =>
      [
        form.inherentLikelihood,
        form.inherentImpact,
        form.noControlAccepted ? "no-ctrl" : "",
        [...extra.controlIds].sort().join(","),
      ].join("|"),
    [
      form.inherentLikelihood,
      form.inherentImpact,
      form.noControlAccepted,
      extra.controlIds,
    ],
  );

  /**
   * Pre-fill điểm còn lại khi vào bước 6.
   *
   * Luôn lưu vết gợi ý qua suggestedResidual*, kể cả khi không pre-fill,
   * để sau này biết người dùng có ghi đè hay không. Chỉ điền vào ô chấm
   * điểm khi đang TẠO MỚI và căn cứ vừa thay đổi.
   */
  useEffect(() => {
    if (stage !== "residual") return;
    if (prefillKey === suggestionSignature) return;

    const isLocked = prefillKey === "locked";
    setPrefillKey(suggestionSignature);

    patch({
      suggestedResidualLikelihood: suggestion.likelihood,
      suggestedResidualImpact: suggestion.impact,
      ...(isLocked
        ? {}
        : {
            residualLikelihood: suggestion.likelihood,
            residualImpact: suggestion.impact,
          }),
    });

    if (!isLocked) markTouched("residualLikelihood", "residualImpact");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, suggestionSignature, prefillKey]);

  /** Người dùng bấm Áp dụng gợi ý ở form sửa */
  function applySuggestion() {
    patch({
      residualLikelihood: suggestion.likelihood,
      residualImpact: suggestion.impact,
      suggestedResidualLikelihood: suggestion.likelihood,
      suggestedResidualImpact: suggestion.impact,
    });
    markTouched("residualLikelihood", "residualImpact");
    toast.success("Đã áp dụng gợi ý", shortSuggestionHint(suggestion));
  }

  /* --------------------- Dữ liệu dẫn xuất bước 6 và 8 ---------------- */

  const residualScore = residualScoreOf(form);
  const residualLevel = residualLevelOf(form);

  /** Điểm còn lại cao hơn vốn có, trường hợp hợp lệ nhưng cần căn cứ */
  const residualHigher = residualScore > inherentScore;

  /** Người dùng giữ nguyên mức vốn có trong khi hệ thống đề xuất giảm */
  const ignoredReduction =
    suggestion.hasReduction && residualScore === inherentScore;

  /** Ghi đè khác gợi ý */
  const overriddenSuggestion =
    form.residualLikelihood !== suggestion.likelihood ||
    form.residualImpact !== suggestion.impact;

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
          {/* ============== Bước 3: Đánh giá vốn có ============== */}
          {stage === "inherent" && (
            <ContentCard className="flex flex-col gap-4">
              <StepTitle
                index={3}
                title="Đánh giá rủi ro vốn có"
                note="Chấm điểm khi giả định CHƯA có kiểm soát nào. Đây là mốc để so sánh về sau"
              />

              <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                <IconInfoCircle size={16} className="mt-px shrink-0" />
                <span>
                  Rủi ro vốn có là mức rủi ro <b>trước khi</b> tính tới tác dụng
                  của kiểm soát. Nếu chấm luôn theo tình trạng hiện tại thì mất
                  mốc so sánh, và không đo được kiểm soát đang mang lại giá trị
                  gì.
                </span>
              </div>

              <ScoreSelector
                criteria={RISK_SCORING_CRITERIA}
                value={{
                  likelihood: form.inherentLikelihood,
                  impact: form.inherentImpact,
                }}
                onChange={(v: ScoreValue) => {
                  markTouched("inherentLikelihood", "inherentImpact");
                  patch({
                    inherentLikelihood: v.likelihood ?? form.inherentLikelihood,
                    inherentImpact: v.impact ?? form.inherentImpact,
                  });
                }}
                errors={{
                  likelihood: errors.inherentLikelihood,
                  impact: errors.inherentImpact,
                }}
                expandedByDefault={!isEdit}
                summary={
                  <ScoreSummary
                    label="Rủi ro vốn có"
                    score={inherentScore}
                    level={inherentLevelOf(form)}
                    likelihood={form.inherentLikelihood}
                    impact={form.inherentImpact}
                  />
                }
              />

              {/* --- Nhắc mềm khi điểm còn ở mức mặc định --- */}
              {!extra.touched.includes("inherentLikelihood") && (
                <div className="flex gap-2 rounded-ctrl bg-surface-alt p-2.5 text-[12px] leading-4 text-text-secondary">
                  <IconRadar size={15} className="mt-px shrink-0" />
                  <span>
                    Bảng điểm đang ở <b>mức mặc định 3 × 3</b>. Anh vẫn đi tiếp
                    được, nhưng nên xác nhận hoặc điều chỉnh để con số phản ánh
                    đúng đánh giá của mình.
                  </span>
                </div>
              )}

              {/* --- Ước lượng tổn thất --- */}
              <div
                data-field="estimatedLoss"
                className="flex flex-col gap-2 rounded-card border border-border-light p-3"
              >
                <div className="flex items-center gap-2">
                  <IconCoin size={16} className="text-brand" />
                  <span className="text-[13px] font-semibold text-text-primary">
                    Ước lượng tổn thất nếu rủi ro xảy ra
                  </span>
                </div>

                <Input
                  label="Số tiền ước tính"
                  inputMode="numeric"
                  placeholder="Để trống nếu chưa lượng hoá được"
                  value={
                    form.estimatedLoss === null ||
                    form.estimatedLoss === undefined
                      ? ""
                      : String(form.estimatedLoss)
                  }
                  error={errors.estimatedLoss}
                  hint={
                    errors.estimatedLoss
                      ? undefined
                      : "Đơn vị là đồng. Con số này là căn cứ trực tiếp cho mức ảnh hưởng vừa chấm"
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, "");
                    patch({ estimatedLoss: raw === "" ? null : Number(raw) });
                  }}
                />
              </div>

              {requiresControl && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconAlertTriangle size={16} className="mt-px shrink-0" />
                  <span>
                    Điểm vốn có <b>{inherentScore}</b> thuộc mức{" "}
                    <b>{inherentLevelOf(form)}</b>, nên ở bước 4 <b>bắt buộc</b>{" "}
                    phải gắn ít nhất 1 kiểm soát đã phê duyệt.
                  </span>
                </div>
              )}
            </ContentCard>
          )}

          {/* ============== Bước 4: Chọn kiểm soát ============== */}
          {stage === "controls" && (
            <ControlPickerStep
              controls={controls}
              value={extra.controlIds}
              noControlAccepted={!!form.noControlAccepted}
              requiresControl={requiresControl}
              unitName={(id) => lk.unitName(id)}
              onChange={(ids) => patchExtra({ controlIds: ids })}
              onToggleAccept={(v) => patch({ noControlAccepted: v })}
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

          {/* ============== Bước 6: Đánh giá còn lại ============== */}
          {stage === "residual" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              {/* ---------- Cột căn cứ, chỉ đọc ---------- */}
              <ContentCard className="flex flex-col gap-3 xl:col-span-2">
                <p className="text-[13px] font-semibold text-text-primary">
                  Căn cứ đánh giá
                </p>

                <div className="flex flex-col gap-1.5 rounded-ctrl bg-surface-alt p-2.5">
                  <p className="text-[12px] text-text-secondary">
                    Điểm vốn có đã chấm
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge
                      level={inherentLevelOf(form)}
                      score={inherentScore}
                    />
                    <span className="text-[12px] text-text-secondary">
                      Khả năng {form.inherentLikelihood} × Ảnh hưởng{" "}
                      {form.inherentImpact}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-[12px] text-text-secondary">
                    Kiểm soát đang phủ rủi ro này ({activePicked.length})
                  </p>
                  {activePicked.length === 0 ? (
                    <p className="rounded-ctrl bg-surface-alt p-2.5 text-[12px] text-text-hint">
                      Không có kiểm soát nào được tính. Đã tuyên bố chấp nhận
                      rủi ro.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {activePicked.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-col gap-0.5 rounded-ctrl border border-border-light p-2"
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-[12px] font-medium text-brand">
                              {c.code}
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
                          </span>
                          <span className="truncate text-[12px] text-text-primary">
                            {c.name}
                          </span>
                          <span className="text-[11px] text-text-secondary">
                            {c.type} · {c.nature} · {c.frequency}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* ---------- Khối gợi ý của hệ thống ---------- */}
                <div className="flex flex-col gap-2 rounded-ctrl border border-brand bg-brand-light/30 p-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <IconSparkles size={15} className="shrink-0 text-brand" />
                    <span className="text-[12px] font-semibold text-text-primary">
                      Hệ thống gợi ý
                    </span>
                    <span className="ml-auto">
                      <Badge tone="brand" size="sm">
                        {suggestion.likelihood} × {suggestion.impact} ={" "}
                        {suggestion.score} điểm
                      </Badge>
                    </span>
                  </span>

                  <span className="text-[11px] leading-4 text-text-secondary">
                    {describeSuggestion(suggestion)}
                  </span>

                  {isEdit && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IconSparkles size={14} />}
                      onClick={applySuggestion}
                    >
                      Áp dụng gợi ý
                    </Button>
                  )}

                  <span className="text-[11px] leading-4 text-text-hint">
                    Đây chỉ là đề xuất. Anh sửa tự do, hệ thống lưu lại cả con
                    số gợi ý để đối chiếu về sau.
                  </span>
                </div>
              </ContentCard>

              {/* ---------- Cột chấm điểm ---------- */}
              <ContentCard className="flex flex-col gap-4 xl:col-span-3">
                <StepTitle
                  index={6}
                  title="Đánh giá rủi ro còn lại"
                  note="Chấm lại điểm sau khi đã tính tới tác dụng của kiểm soát hiện có"
                />

                {/* KHÔNG còn prop maxValue: điểm còn lại được phép cao hơn
                    vốn có, đây là lớp chặn thứ ba đã gỡ theo quyết định
                    chốt ngày 18/08/2026 */}
                <ScoreSelector
                  criteria={RISK_SCORING_CRITERIA}
                  value={{
                    likelihood: form.residualLikelihood,
                    impact: form.residualImpact,
                  }}
                  onChange={(v: ScoreValue) => {
                    markTouched("residualLikelihood", "residualImpact");
                    patch({
                      residualLikelihood:
                        v.likelihood ?? form.residualLikelihood,
                      residualImpact: v.impact ?? form.residualImpact,
                    });
                  }}
                  compareValue={{
                    likelihood: form.inherentLikelihood,
                    impact: form.inherentImpact,
                  }}
                  compareLabel="Vốn có"
                  errors={{
                    likelihood: errors.residualLikelihood,
                    impact: errors.residualImpact,
                  }}
                  summary={
                    <ScoreSummary
                      label="Rủi ro còn lại"
                      score={residualScore}
                      level={residualLevel}
                      likelihood={form.residualLikelihood}
                      impact={form.residualImpact}
                      compareScore={inherentScore}
                    />
                  }
                />

                {/* --- Cảnh báo 1: cao hơn vốn có --- */}
                {residualHigher && (
                  <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                    <IconAlertTriangle size={16} className="mt-px shrink-0" />
                    <span>
                      Điểm còn lại <b>{residualScore}</b> cao hơn điểm vốn có{" "}
                      <b>{inherentScore}</b>. Đây là <b>trường hợp hợp lệ</b>,
                      ví dụ kiểm soát mới làm phát sinh rủi ro thứ cấp, hoặc bối
                      cảnh đã xấu đi so với lần đánh giá vốn có. Hệ thống chỉ
                      yêu cầu anh <b>nêu căn cứ</b> ở ô luận cứ bên dưới.
                    </span>
                  </div>
                )}

                {/* --- Cảnh báo 2: bỏ qua phần giảm hệ thống đề xuất --- */}
                {ignoredReduction && (
                  <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                    <IconAlertTriangle size={16} className="mt-px shrink-0" />
                    <span>
                      Anh giữ nguyên mức vốn có, trong khi hệ thống đề xuất giảm{" "}
                      <b>{suggestion.steps} bậc</b> dựa trên{" "}
                      {suggestion.aggregate.countedCount} kiểm soát đã đánh giá.
                      Nếu đúng là kiểm soát chưa mang lại tác dụng thực tế thì
                      nên nêu rõ trong luận cứ.
                    </span>
                  </div>
                )}

                {/* --- Cảnh báo 3: hạ nhiều mà không có luận cứ --- */}
                {!residualHigher &&
                  inherentScore - residualScore > 8 &&
                  !(form.residualRationale ?? "").trim() && (
                    <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                      <IconInfoCircle size={16} className="mt-px shrink-0" />
                      <span>
                        Điểm giảm <b>{inherentScore - residualScore}</b> điểm là
                        mức giảm lớn. Nên ghi luận cứ để kiểm toán nội bộ đọc
                        lại vẫn hiểu được căn cứ hạ mức.
                      </span>
                    </div>
                  )}

                {/* --- Luận cứ --- */}
                <div data-field="residualRationale">
                  <Textarea
                    label="Luận cứ đánh giá"
                    required={residualHigher}
                    rows={3}
                    maxLength={800}
                    showCount
                    placeholder="Vì sao chấm mức này, kiểm soát nào tạo ra tác dụng đó, còn khe hở nào"
                    value={form.residualRationale ?? ""}
                    error={errors.residualRationale}
                    hint={
                      errors.residualRationale
                        ? undefined
                        : residualHigher
                          ? "Bắt buộc khi điểm còn lại cao hơn vốn có"
                          : "Không bắt buộc, nhưng rất cần khi hạ nhiều bậc"
                    }
                    onChange={(e) =>
                      patch({ residualRationale: e.target.value })
                    }
                  />
                </div>

                {/* --- Đối chiếu với gợi ý --- */}
                {overriddenSuggestion && (
                  <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-hint">
                    <IconRadar size={13} className="mt-px shrink-0" />
                    Anh đang chọn khác gợi ý của hệ thống (
                    <b>
                      {suggestion.likelihood} × {suggestion.impact}
                    </b>
                    ). Cả hai con số đều được lưu để đối chiếu, con số của anh
                    là con số chính thức.
                  </p>
                )}
              </ContentCard>
            </div>
          )}

          {/* ============== Bước 7: Phương án xử lý ============== */}
          {stage === "treat" && (
            <ContentCard className="flex flex-col gap-4">
              <StepTitle
                index={7}
                title="Phương án xử lý"
                note="Quyết định sẽ làm gì với mức rủi ro còn lại và khi nào rà soát lại"
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div data-field="treatment">
                  <Select
                    label="Phương án xử lý"
                    required
                    options={
                      form.isZeroTolerance
                        ? TREATMENT_OPTIONS.filter(
                            (o) => o.value !== "Chấp nhận",
                          )
                        : TREATMENT_OPTIONS
                    }
                    value={form.treatment || null}
                    error={errors.treatment}
                    hint={
                      errors.treatment
                        ? undefined
                        : form.isZeroTolerance
                          ? "Rủi ro không khoan nhượng nên phương án Chấp nhận đã bị loại khỏi danh sách"
                          : undefined
                    }
                    onChange={(v) =>
                      patch({ treatment: (v ?? "") as typeof form.treatment })
                    }
                  />
                </div>

                <div data-field="reviewDate">
                  <DateInput
                    label="Kỳ rà soát lại"
                    min={form.identifiedDate || undefined}
                    value={form.reviewDate}
                    error={errors.reviewDate}
                    hint={
                      errors.reviewDate
                        ? undefined
                        : "Quá ngày này mà chưa rà soát, hệ thống sẽ hiện nhãn nhắc"
                    }
                    onChange={(v) => patch({ reviewDate: v })}
                  />
                </div>
              </div>

              <div data-field="treatmentNote">
                <Textarea
                  label="Định hướng xử lý"
                  required={form.treatment !== "Chấp nhận"}
                  rows={3}
                  maxLength={1000}
                  showCount
                  placeholder="Sẽ làm gì, ai làm, mốc thời gian dự kiến"
                  value={form.treatmentNote}
                  error={errors.treatmentNote}
                  hint={
                    errors.treatmentNote
                      ? undefined
                      : form.treatment === "Chấp nhận"
                        ? "Với phương án Chấp nhận thì không bắt buộc, nhưng nên nêu điều kiện theo dõi"
                        : "Bắt buộc với mọi phương án khác Chấp nhận"
                  }
                  onChange={(e) => patch({ treatmentNote: e.target.value })}
                />
              </div>

              {form.treatment === "Chấp nhận" && residualScore > 9 && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconAlertTriangle size={16} className="mt-px shrink-0" />
                  <span>
                    Chọn <b>Chấp nhận</b> với rủi ro còn lại mức{" "}
                    <b>{residualLevel}</b> là quyết định cần cấp có thẩm quyền
                    phê duyệt. Nên ghi rõ căn cứ trong luận cứ đánh giá ở bước
                    6.
                  </span>
                </div>
              )}

              {!(form.reviewDate ?? "").trim() && (
                <div className="flex gap-2 rounded-ctrl bg-surface-alt p-2.5 text-[12px] leading-4 text-text-secondary">
                  <IconInfoCircle size={15} className="mt-px shrink-0" />
                  <span>
                    Chưa đặt kỳ rà soát lại. Hồ sơ vẫn lưu được, nhưng rủi ro sẽ
                    không có mốc nào để hệ thống nhắc đánh giá lại.
                  </span>
                </div>
              )}
            </ContentCard>
          )}

          {/* ============== Bước 8: Rà soát và gửi ============== */}
          {stage === "review" && (
            <div className="flex flex-col gap-4">
              {/* ---------- Kết quả kiểm tra toàn bộ ---------- */}
              {(() => {
                const check = validateAll(form);

                if (check.ok)
                  return (
                    <div className="flex gap-2 rounded-card border border-lv-low-border bg-lv-low-bg p-3 text-[12px] leading-4 text-lv-low-text">
                      <IconCircleCheck size={17} className="mt-px shrink-0" />
                      <span>
                        <b className="text-[13px]">
                          Hồ sơ đã đủ điều kiện lưu.
                        </b>
                        <br />
                        Toàn bộ nội dung bắt buộc đã hợp lệ theo quy tắc nghiệp
                        vụ. Anh xem lại phần tóm tắt bên dưới rồi bấm{" "}
                        {isEdit ? "Lưu thay đổi" : "Ghi nhận rủi ro"}.
                      </span>
                    </div>
                  );

                return (
                  <div className="flex flex-col gap-2 rounded-card border border-lv-critical-border bg-lv-critical-bg p-3">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-lv-critical-text">
                      <IconShieldX size={16} />
                      Còn {Object.keys(check.errors).length} nội dung chưa hợp
                      lệ
                    </span>

                    <ul className="flex flex-col gap-2">
                      {check.byStage.map((g) => {
                        const idx = stageIndexOf(g.stage);
                        const meta = WIZARD_STAGES[idx];
                        return (
                          <li key={g.stage} className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => goto(g.stage)}
                              className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-lv-critical-text underline decoration-dotted"
                            >
                              Bước {idx + 1} · {meta?.label ?? g.stage}
                              <IconArrowRight size={13} />
                            </button>
                            <ul className="flex flex-col gap-0.5 pl-4">
                              {g.fields.map((f) => (
                                <li
                                  key={f.field}
                                  className="text-[12px] leading-4 text-lv-critical-text"
                                >
                                  • {f.message}
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>

                    <span className="text-[11px] leading-4 text-lv-critical-text opacity-90">
                      Bấm vào tên bước để nhảy tới đúng chỗ cần bổ sung.
                    </span>
                  </div>
                );
              })()}

              {/* ---------- Tóm tắt hồ sơ ---------- */}
              <ContentCard className="flex flex-col gap-4">
                <StepTitle
                  index={8}
                  title="Rà soát toàn bộ hồ sơ"
                  note="Đối chiếu lần cuối trước khi lưu, mọi mục đều sửa được bằng cách quay lại bước tương ứng"
                />

                <RiskSummaryReview
                  objectiveNames={form.objectiveIds.map((id) =>
                    lk.objectiveName(id, id),
                  )}
                  unitName={lk.unitName(form.unitId, "chưa chọn")}
                  processName={
                    form.processId
                      ? lk.processName(form.processId, "")
                      : undefined
                  }
                  systemName={
                    form.systemId ? lk.systemName(form.systemId, "") : undefined
                  }
                  name={form.name}
                  description={form.description}
                  categoryName={lk.categoryName(form.categoryId, "chưa chọn")}
                  ownerName={lk.employeeName(form.ownerId, "chưa gán")}
                  source={form.source}
                  identifiedDate={form.identifiedDate}
                  isZeroTolerance={form.isZeroTolerance}
                  inherentScore={inherentScore}
                  inherentLevel={inherentLevelOf(form)}
                  inherentLikelihood={form.inherentLikelihood}
                  inherentImpact={form.inherentImpact}
                  residualScore={residualScore}
                  residualLevel={residualLevel}
                  residualLikelihood={form.residualLikelihood}
                  residualImpact={form.residualImpact}
                  residualRationale={form.residualRationale}
                  estimatedLoss={form.estimatedLoss}
                  treatment={form.treatment}
                  treatmentNote={form.treatmentNote}
                  reviewDate={form.reviewDate}
                  noControlAccepted={form.noControlAccepted}
                  controls={pickedControls.map((c) => ({
                    code: c.code,
                    name: c.name,
                    type: c.type,
                    status: c.status,
                    isKeyControl: c.isKeyControl,
                    effectiveness: overallEffectivenessOf(c),
                    pending: NOT_YET_ACTIVE.has(c.status ?? ""),
                  }))}
                  weakness={
                    extra.weakness.has && extra.weakness.name.trim()
                      ? {
                          name: extra.weakness.name,
                          priority: extra.weakness.priority,
                        }
                      : null
                  }
                  suggestion={{
                    likelihood: suggestion.likelihood,
                    impact: suggestion.impact,
                    hint: shortSuggestionHint(suggestion),
                  }}
                />

                <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-hint">
                  <IconInfoCircle size={13} className="mt-px shrink-0" />
                  Rủi ro được lưu ở trạng thái <b>{form.status}</b>. Việc trình
                  duyệt và chuyển trạng thái thực hiện ở hồ sơ rủi ro sau khi
                  lưu.
                </p>
              </ContentCard>
            </div>
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

/* ================================================================== */
/* Tóm tắt điểm dưới bảng chấm                                         */
/* ================================================================== */

function ScoreSummary({
  label,
  score,
  level,
  likelihood,
  impact,
  compareScore,
}: {
  label: string;
  score: number;
  level: string;
  likelihood: number;
  impact: number;
  compareScore?: number;
}) {
  /* diff dương là giảm, âm là tăng. Bản trước chỉ hiện khi giảm nên khi
     điểm còn lại cao hơn vốn có thì người dùng mất hẳn tín hiệu. */
  const diff = compareScore === undefined ? 0 : compareScore - score;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt p-3">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <RiskBadge level={level as never} score={score} />
      <span className="text-[12px] text-text-secondary">
        Khả năng {likelihood} × Ảnh hưởng {impact} = <b>{score} điểm</b>
      </span>

      {diff > 0 && (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-lv-low-text">
          <IconCircleCheck size={14} />
          Giảm {diff} điểm so với vốn có
        </span>
      )}

      {diff < 0 && (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-lv-medium-text">
          <IconAlertTriangle size={14} />
          Tăng {Math.abs(diff)} điểm so với vốn có
        </span>
      )}

      {diff === 0 && compareScore !== undefined && (
        <span className="text-[12px] text-text-hint">
          Giữ nguyên so với vốn có
        </span>
      )}
    </div>
  );
}

/* ================================================================== */
/* Bước 4: chọn kiểm soát từ thư viện                                  */
/* ================================================================== */

function ControlPickerStep({
  controls,
  value,
  noControlAccepted,
  requiresControl,
  unitName,
  onChange,
  onToggleAccept,
}: {
  controls: ControlLite[];
  value: string[];
  noControlAccepted: boolean;
  requiresControl: boolean;
  unitName: (id?: string) => string;
  onChange: (ids: string[]) => void;
  onToggleAccept: (v: boolean) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [onlyKey, setOnlyKey] = useState(false);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return controls
      .filter((c) => {
        if (onlyKey && !c.isKeyControl) return false;
        if (!kw) return true;
        return `${c.code} ${c.name ?? ""} ${c.type ?? ""}`
          .toLowerCase()
          .includes(kw);
      })
      .slice()
      .sort((a, b) => {
        const pa = value.includes(a.id) ? 0 : 1;
        const pb = value.includes(b.id) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.code.localeCompare(b.code);
      });
  }, [controls, keyword, onlyKey, value]);

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  }

  const picked = controls.filter((c) => value.includes(c.id));
  const pendingCount = picked.filter((c) =>
    NOT_YET_ACTIVE.has(c.status ?? ""),
  ).length;
  const activeCount = picked.length - pendingCount;

  return (
    <ContentCard className="flex flex-col gap-4">
      <StepTitle
        index={4}
        title="Chọn kiểm soát từ thư viện"
        note="Chọn các kiểm soát đang bảo vệ rủi ro này. Đây là căn cứ để hệ thống gợi ý điểm còn lại ở bước 6"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="Tìm theo mã, tên kiểm soát"
          width={320}
        />
        <Checkbox
          label="Chỉ kiểm soát trọng yếu"
          checked={onlyKey}
          onChange={(e) => setOnlyKey(e.target.checked)}
        />
        <span className="ml-auto text-[12px] text-text-secondary">
          Đã chọn <b className="text-text-primary">{value.length}</b>, được tính{" "}
          <b className="text-text-primary">{activeCount}</b>
        </span>
      </div>

      {requiresControl && activeCount === 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text">
          <IconShieldX size={16} className="mt-px shrink-0" />
          <span>
            Rủi ro vốn có mức Cao trở lên <b>bắt buộc</b> gắn ít nhất 1 kiểm
            soát đã phê duyệt. Bước 6 sẽ mở ngay khi anh chọn được kiểm soát phù
            hợp.
          </span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Có <b>{pendingCount}</b> kiểm soát đang ở trạng thái Nháp hoặc Chờ
            duyệt. Những kiểm soát này <b>chưa được tính</b> là đang bảo vệ rủi
            ro, và cũng không tham gia vào gợi ý điểm còn lại.
          </span>
        </div>
      )}

      <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto rounded-ctrl border border-border-light p-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-text-hint">
            Không có kiểm soát phù hợp. Thử xoá từ khoá tìm kiếm.
          </p>
        ) : (
          rows.map((c) => {
            const active = value.includes(c.id);
            const pending = NOT_YET_ACTIVE.has(c.status ?? "");
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
                    <EffectivenessBadge
                      size="sm"
                      short
                      value={overallEffectivenessOf(c)}
                    />
                    {pending && (
                      <Tooltip content="Chưa phê duyệt nên chưa tính là đang bảo vệ rủi ro">
                        <Badge tone="neutral" size="sm">
                          {c.status}
                        </Badge>
                      </Tooltip>
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-text-secondary">
                    {c.type} · {c.nature} · {c.frequency} · {unitName(c.unitId)}
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
    </ContentCard>
  );
}
