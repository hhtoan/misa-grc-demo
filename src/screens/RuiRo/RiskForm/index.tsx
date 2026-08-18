"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconDeviceFloppy,
  IconInfoCircle,
  IconLock,
  IconRadar,
  IconShieldCheck,
  IconShieldX,
  IconTrash,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DateInput,
  Input,
  LifecycleStepper,
  RiskBadge,
  ScoreSelector,
  SearchInput,
  Select,
  Textarea,
  Tooltip,
  useToast,
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
import { RISK_SCORING_CRITERIA } from "@/lib/domain/scoring-criteria";
import { overallEffectivenessOf } from "@/lib/domain/control-utils";
import { RISK_STAGES } from "@/lib/domain/risk-lifecycle";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ==================================================================
   Kiểu tối giản, không import từ schema
   ================================================================== */

interface RiskRecord {
  id: string;
  code: string;
  name?: string;
  description?: string;
  cause?: string;
  consequence?: string;
  categoryId?: string;
  unitId?: string;
  ownerId?: string;
  source?: string;
  status?: string;
  inherentLikelihood?: number | null;
  inherentImpact?: number | null;
  residualLikelihood?: number | null;
  residualImpact?: number | null;
  residualAssessedAt?: string;
  residualAssessedBy?: string;
  residualRationale?: string;
  controlsChangedAt?: string;
  treatmentStrategy?: string;
  nextReviewDate?: string;
  isZeroTolerance?: boolean;
  noControlAccepted?: boolean;
}

interface ControlRecord {
  id: string;
  code: string;
  name?: string;
  type?: string;
  frequency?: string;
  status?: string;
  unitId?: string;
  ownerId?: string;
  isKeyControl?: boolean;
  riskIds?: string[];
  designEffectiveness?: string;
  operationEffectiveness?: string;
  lastTestResult?: string;
}

interface SimpleRepo<T> {
  create: (value: Partial<T>, by?: string) => T;
  update: (id: string, patch: Partial<T>) => void;
}

const rRepo = riskRepo as unknown as SimpleRepo<RiskRecord>;
const cRepo = controlRepo as unknown as SimpleRepo<ControlRecord>;

/* ==================================================================
   Hằng số
   ================================================================== */

const TREATMENT_OPTIONS = [
  {
    value: "Giảm thiểu",
    label: "Giảm thiểu",
    description: "Bổ sung hoặc tăng cường kiểm soát để hạ mức rủi ro",
  },
  {
    value: "Chuyển giao",
    label: "Chuyển giao",
    description: "Mua bảo hiểm hoặc chuyển trách nhiệm sang bên thứ ba",
  },
  {
    value: "Tránh",
    label: "Tránh",
    description: "Dừng hoặc thay đổi hoạt động phát sinh rủi ro",
  },
  {
    value: "Chấp nhận",
    label: "Chấp nhận",
    description: "Giữ nguyên, chỉ theo dõi vì mức rủi ro trong khẩu vị",
  },
];

const SOURCE_OPTIONS = [
  { value: "Nội bộ", label: "Nội bộ" },
  { value: "Bên ngoài", label: "Bên ngoài" },
  { value: "Kết hợp", label: "Kết hợp" },
];

const DRAFT_KEY = "misa-grc-risk-wizard-draft";

/** Ngưỡng phân mức, khớp cấu hình mặc định của tab Ma trận rủi ro */
function levelOfScore(score: number) {
  if (score <= 4) return "Thấp" as const;
  if (score <= 9) return "Trung bình" as const;
  if (score <= 15) return "Cao" as const;
  return "Trọng yếu" as const;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Kiểm soát chưa phê duyệt thì chưa coi là đang bảo vệ rủi ro */
const NOT_YET_ACTIVE = new Set(["Nháp", "Chờ duyệt"]);

/* ==================================================================
   Giá trị wizard
   ================================================================== */

interface WizardValue {
  name: string;
  description: string;
  cause: string;
  consequence: string;
  categoryId: string;
  unitId: string;
  ownerId: string;
  source: string;
  inherentLikelihood: number | null;
  inherentImpact: number | null;
  residualLikelihood: number | null;
  residualImpact: number | null;
  residualRationale: string;
  treatmentStrategy: string;
  nextReviewDate: string;
  isZeroTolerance: boolean;
  noControlAccepted: boolean;
  controlIds: string[];
}

const EMPTY: WizardValue = {
  name: "",
  description: "",
  cause: "",
  consequence: "",
  categoryId: "",
  unitId: "",
  ownerId: "",
  source: "Nội bộ",
  inherentLikelihood: null,
  inherentImpact: null,
  residualLikelihood: null,
  residualImpact: null,
  residualRationale: "",
  treatmentStrategy: "",
  nextReviewDate: "",
  isZeroTolerance: false,
  noControlAccepted: false,
  controlIds: [],
};

/* ==================================================================
   Màn hình
   ================================================================== */

export default function RiskFormScreen({ code }: { code?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();

  const risks = useCollection(riskRepo) as unknown as RiskRecord[];
  const controls = useCollection(controlRepo) as unknown as ControlRecord[];

  const editing = useMemo(
    () => (code ? risks.find((r) => r.code === code) : undefined),
    [risks, code],
  );
  const isEdit = !!editing;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardValue>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");

  /* ------------------------- Nạp dữ liệu ------------------------- */

  const key = editing?.id ?? "new";
  if (key !== loadedKey) {
    setLoadedKey(key);
    setErrors({});
    setStep(0);
    if (editing) {
      setForm({
        name: editing.name ?? "",
        description: editing.description ?? "",
        cause: editing.cause ?? "",
        consequence: editing.consequence ?? "",
        categoryId: editing.categoryId ?? "",
        unitId: editing.unitId ?? "",
        ownerId: editing.ownerId ?? "",
        source: editing.source ?? "Nội bộ",
        inherentLikelihood: editing.inherentLikelihood ?? null,
        inherentImpact: editing.inherentImpact ?? null,
        residualLikelihood: editing.residualLikelihood ?? null,
        residualImpact: editing.residualImpact ?? null,
        residualRationale: editing.residualRationale ?? "",
        treatmentStrategy: editing.treatmentStrategy ?? "",
        nextReviewDate: editing.nextReviewDate ?? "",
        isZeroTolerance: !!editing.isZeroTolerance,
        noControlAccepted: !!editing.noControlAccepted,
        controlIds: controls
          .filter((c) => (c.riskIds ?? []).includes(editing.id))
          .map((c) => c.id),
      });
    } else {
      setForm(EMPTY);
    }
  }

  /* Nạp nháp khi thêm mới */
  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WizardValue;
      if (parsed && typeof parsed.name === "string") setForm(parsed);
    } catch {
      /* Nháp hỏng thì bỏ qua */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- Tiện ích -------------------------- */

  function patch(next: Partial<WizardValue>) {
    setForm((prev) => ({ ...prev, ...next }));
    setErrors((prev) => {
      const out = { ...prev };
      let changed = false;
      Object.keys(next).forEach((k) => {
        if (out[k]) {
          delete out[k];
          changed = true;
        }
      });
      return changed ? out : prev;
    });
  }

  const categoryOptions = lk.riskCategoryOptions ?? [];

  const inherentScore =
    form.inherentLikelihood && form.inherentImpact
      ? form.inherentLikelihood * form.inherentImpact
      : null;

  const residualScore =
    form.residualLikelihood && form.residualImpact
      ? form.residualLikelihood * form.residualImpact
      : null;

  const requiresControl = !!inherentScore && inherentScore > 9;

  const pickedControls = useMemo(
    () => controls.filter((c) => form.controlIds.includes(c.id)),
    [controls, form.controlIds],
  );

  const activePicked = pickedControls.filter(
    (c) => !NOT_YET_ACTIVE.has(c.status ?? ""),
  );

  const controlStageDone = activePicked.length > 0 || form.noControlAccepted;

  /* ------------------------ Kiểm tra từng bước ------------------- */

  function validateStep(i: number): Record<string, string> {
    const err: Record<string, string> = {};

    if (i === 0) {
      if (!form.name.trim()) err.name = "Bắt buộc nhập tên rủi ro";
      else if (form.name.trim().length < 8)
        err.name = "Tên rủi ro quá ngắn, hãy mô tả rõ hơn để người khác hiểu";
      if (!form.description.trim()) err.description = "Bắt buộc mô tả rủi ro";
      if (!form.categoryId) err.categoryId = "Bắt buộc chọn nhóm rủi ro";
      if (!form.unitId) err.unitId = "Bắt buộc chọn đơn vị";
      if (!form.ownerId)
        err.ownerId =
          "Bắt buộc chọn chủ sở hữu, đây là người chịu trách nhiệm theo dõi rủi ro";
    }

    if (i === 1) {
      if (!form.inherentLikelihood)
        err.likelihood = "Bắt buộc chấm mức khả năng xảy ra";
      if (!form.inherentImpact) err.impact = "Bắt buộc chấm mức độ ảnh hưởng";
    }

    if (i === 2) {
      if (activePicked.length === 0 && !form.noControlAccepted)
        err.controls = requiresControl
          ? "Rủi ro cố hữu mức Cao trở lên bắt buộc gắn ít nhất 1 kiểm soát đã phê duyệt"
          : "Chọn ít nhất 1 kiểm soát, hoặc tuyên bố chấp nhận rủi ro nếu không áp dụng kiểm soát nào";
      if (requiresControl && activePicked.length === 0)
        err.controls =
          "Rủi ro cố hữu mức Cao trở lên bắt buộc gắn ít nhất 1 kiểm soát đã phê duyệt";
    }

    if (i === 3) {
      if (!form.residualLikelihood)
        err.likelihood = "Bắt buộc chấm mức khả năng còn lại";
      if (!form.residualImpact)
        err.impact = "Bắt buộc chấm mức ảnh hưởng còn lại";
      if (
        form.residualLikelihood &&
        form.inherentLikelihood &&
        form.residualLikelihood > form.inherentLikelihood
      )
        err.likelihood = "Khả năng còn lại không được cao hơn khả năng cố hữu";
      if (
        form.residualImpact &&
        form.inherentImpact &&
        form.residualImpact > form.inherentImpact
      )
        err.impact = "Mức ảnh hưởng còn lại không được cao hơn mức cố hữu";
    }

    if (i === 4) {
      if (!form.treatmentStrategy)
        err.treatmentStrategy = "Bắt buộc chọn chiến lược ứng phó";
      if (!form.nextReviewDate)
        err.nextReviewDate = "Bắt buộc đặt kỳ đánh giá lại";
      else if (form.nextReviewDate <= today())
        err.nextReviewDate = "Kỳ đánh giá lại phải ở tương lai";
    }

    return err;
  }

  /** Bước 4 chỉ mở khi đã đi qua bước 3 */
  const step3Locked = !controlStageDone;

  function goto(i: number) {
    if (i > 3 || i === 3) {
      if (step3Locked) {
        toast.warning(
          "Chưa mở được bước đánh giá còn lại",
          "Phải gắn kiểm soát trước, vì điểm còn lại là kết quả sau khi có kiểm soát.",
        );
        return;
      }
    }
    setStep(i);
  }

  function next() {
    const err = validateStep(step);
    if (Object.keys(err).length > 0) {
      setErrors(err);
      const first = Object.keys(err)[0];
      setTimeout(() => {
        document
          .querySelector(`[data-field="${first}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      toast.error(
        "Chưa chuyển bước được",
        `Còn ${Object.keys(err).length} nội dung chưa hợp lệ ở bước này.`,
      );
      return;
    }
    if (step === 2 && step3Locked) return;
    setStep((s) => Math.min(s + 1, 4));
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      toast.success(
        "Đã lưu nháp",
        "Nội dung được giữ trong trình duyệt, anh có thể quay lại hoàn tất sau.",
      );
    } catch {
      toast.error(
        "Không lưu nháp được",
        "Trình duyệt đang chặn bộ nhớ cục bộ.",
      );
    }
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* bỏ qua */
    }
  }

  /* -------------------- Gắn kiểm soát vào rủi ro ----------------- */

  /**
   * Kiểm soát gắn rủi ro qua control.riskIds, nên phải cập nhật hai
   * chiều: thêm id vào kiểm soát mới chọn, bỏ khỏi kiểm soát bị bỏ.
   */
  function applyControlLinks(riskId: string, nextIds: string[]) {
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

  /* ----------------------------- Lưu ---------------------------- */

  function submit() {
    const all: Record<string, string> = {};
    for (let i = 0; i <= 4; i += 1) {
      const err = validateStep(i);
      if (Object.keys(err).length > 0) {
        setStep(i);
        setErrors(err);
        toast.error(
          "Chưa lưu được",
          `Bước ${i + 1} còn ${Object.keys(err).length} nội dung chưa hợp lệ.`,
        );
        return;
      }
      Object.assign(all, err);
    }

    setSaving(true);
    try {
      const base = {
        name: form.name.trim(),
        description: form.description.trim(),
        cause: form.cause.trim(),
        consequence: form.consequence.trim(),
        categoryId: form.categoryId,
        unitId: form.unitId,
        ownerId: form.ownerId,
        source: form.source,
        inherentLikelihood: form.inherentLikelihood,
        inherentImpact: form.inherentImpact,
        residualLikelihood: form.residualLikelihood,
        residualImpact: form.residualImpact,
        residualRationale: form.residualRationale.trim(),
        residualAssessedAt: today(),
        residualAssessedBy: form.ownerId,
        treatmentStrategy: form.treatmentStrategy,
        nextReviewDate: form.nextReviewDate,
        isZeroTolerance: form.isZeroTolerance,
        noControlAccepted: form.noControlAccepted,
      };

      if (editing) {
        const linkChanged = applyControlLinks(editing.id, form.controlIds);
        rRepo.update(editing.id, {
          ...base,
          controlsChangedAt: linkChanged
            ? today()
            : (editing.controlsChangedAt ?? ""),
        });
        toast.success(
          `Đã lưu ${editing.code}`,
          "Hồ sơ rủi ro đã được cập nhật.",
        );
        router.push(`/rui-ro/so-dang-ky/${editing.code}`);
      } else {
        const row = rRepo.create(
          { ...base, controlsChangedAt: today() },
          user.name,
        );
        applyControlLinks(row.id, form.controlIds);
        clearDraft();
        toast.success(
          `Đã ghi nhận ${row.code}`,
          "Rủi ro mới xuất hiện ngay trong sổ đăng ký.",
        );
        router.push(`/rui-ro/so-dang-ky/${row.code}`);
      }
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------ Dải vòng đời ------------------------ */

  const stepperItems = RISK_STAGES.map((s, i) => ({
    key: s.key,
    label: s.label,
    description: s.description,
    state:
      i < step
        ? ("done" as const)
        : i === step
          ? ("current" as const)
          : ("todo" as const),
    warning: i === 3 && step3Locked ? "Cần gắn kiểm soát trước" : undefined,
    onClick: () => goto(i),
  }));

  /* ============================ Render ========================= */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => setLeaving(true)}
        title={isEdit ? `Sửa rủi ro ${editing?.code}` : "Ghi nhận rủi ro"}
        subtitle="Khai báo theo 5 bước, điểm rủi ro còn lại chỉ chấm sau khi đã gắn kiểm soát"
        badge={
          inherentScore ? (
            <Badge tone="neutral" dot>
              Cố hữu {inherentScore} điểm
            </Badge>
          ) : undefined
        }
      />

      <PageBody className="pb-2">
        <div className="mx-auto flex max-w-[1000px] flex-col gap-4">
          <ContentCard className="py-3">
            <LifecycleStepper steps={stepperItems} />
          </ContentCard>

          {/* ==================== Bước 1 ==================== */}
          {step === 0 && (
            <ContentCard className="flex flex-col gap-4">
              <StepTitle
                index={1}
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
                  required
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
                <Textarea
                  label="Nguyên nhân"
                  rows={3}
                  maxLength={800}
                  placeholder="Nguyên nhân gốc dẫn tới rủi ro này"
                  value={form.cause}
                  onChange={(e) => patch({ cause: e.target.value })}
                />
                <Textarea
                  label="Hệ quả nếu xảy ra"
                  rows={3}
                  maxLength={800}
                  placeholder="Điều gì sẽ xảy ra nếu rủi ro hiện thực hoá"
                  value={form.consequence}
                  onChange={(e) => patch({ consequence: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div data-field="categoryId">
                  <Select
                    label="Nhóm rủi ro"
                    required
                    searchable
                    placeholder="Chọn nhóm"
                    options={categoryOptions}
                    value={form.categoryId || null}
                    error={errors.categoryId}
                    onChange={(v) => patch({ categoryId: v ?? "" })}
                  />
                </div>
                <div data-field="unitId">
                  <Select
                    label="Đơn vị"
                    required
                    searchable
                    placeholder="Chọn đơn vị"
                    options={lk.unitOptions}
                    value={form.unitId || null}
                    error={errors.unitId}
                    onChange={(v) => patch({ unitId: v ?? "" })}
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
                        : "Người chịu trách nhiệm theo dõi và báo cáo rủi ro này"
                    }
                    onChange={(v) => patch({ ownerId: v ?? "" })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                  label="Nguồn rủi ro"
                  options={SOURCE_OPTIONS}
                  value={form.source || null}
                  onChange={(v) => patch({ source: v ?? "Nội bộ" })}
                />
                <div className="flex flex-col gap-1 rounded-ctrl bg-surface-alt px-3 py-2.5">
                  <Checkbox
                    label="Rủi ro không khẩu vị"
                    checked={form.isZeroTolerance}
                    onChange={(e) =>
                      patch({ isZeroTolerance: e.target.checked })
                    }
                  />
                  <span className="pl-6 text-[11px] leading-4 text-text-hint">
                    Tổ chức không chấp nhận rủi ro này ở bất kỳ mức nào, ví dụ
                    gian lận hoặc vi phạm pháp luật.
                  </span>
                </div>
              </div>
            </ContentCard>
          )}

          {/* ==================== Bước 2 ==================== */}
          {step === 1 && (
            <ContentCard className="flex flex-col gap-4">
              <StepTitle
                index={2}
                title="Đánh giá rủi ro cố hữu"
                note="Chấm điểm khi giả định CHƯA có kiểm soát nào. Đây là mốc để so sánh về sau"
              />

              <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                <IconInfoCircle size={16} className="mt-px shrink-0" />
                <span>
                  Rủi ro cố hữu là mức rủi ro <b>trước khi</b> tính tới tác dụng
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
                onChange={(v: ScoreValue) =>
                  patch({
                    inherentLikelihood: v.likelihood ?? null,
                    inherentImpact: v.impact ?? null,
                  })
                }
                errors={errors}
                expandedByDefault={!isEdit}
                summary={
                  <ScoreSummary
                    label="Rủi ro cố hữu"
                    score={inherentScore}
                    likelihood={form.inherentLikelihood}
                    impact={form.inherentImpact}
                  />
                }
              />

              {requiresControl && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconAlertTriangle size={16} className="mt-px shrink-0" />
                  <span>
                    Điểm cố hữu <b>{inherentScore}</b> thuộc mức{" "}
                    <b>{levelOfScore(inherentScore ?? 0)}</b>, nên ở bước sau
                    <b> bắt buộc</b> phải gắn ít nhất 1 kiểm soát đã phê duyệt.
                  </span>
                </div>
              )}
            </ContentCard>
          )}

          {/* ==================== Bước 3 ==================== */}
          {step === 2 && (
            <ControlPickerStep
              controls={controls}
              value={form.controlIds}
              noControlAccepted={form.noControlAccepted}
              requiresControl={requiresControl}
              error={errors.controls}
              unitName={(id) => lk.unitName(id)}
              onChange={(ids) => patch({ controlIds: ids })}
              onToggleAccept={(v) => patch({ noControlAccepted: v })}
            />
          )}

          {/* ==================== Bước 4 ==================== */}
          {step === 3 && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              {/* Cột căn cứ, chỉ đọc */}
              <ContentCard className="flex flex-col gap-3 xl:col-span-2">
                <p className="text-[13px] font-semibold text-text-primary">
                  Căn cứ đánh giá
                </p>

                <div className="flex flex-col gap-1.5 rounded-ctrl bg-surface-alt p-2.5">
                  <p className="text-[12px] text-text-secondary">
                    Điểm cố hữu đã chấm
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge
                      level={levelOfScore(inherentScore ?? 0)}
                      score={inherentScore ?? 0}
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
                      Không có kiểm soát nào. Đã tuyên bố chấp nhận rủi ro.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {activePicked.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-col gap-0.5 rounded-ctrl border border-border-light p-2"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[12px] font-medium text-brand">
                              {c.code}
                            </span>
                            {c.isKeyControl && (
                              <Badge tone="brand" size="sm">
                                Trọng yếu
                              </Badge>
                            )}
                          </span>
                          <span className="truncate text-[12px] text-text-primary">
                            {c.name}
                          </span>
                          <span className="text-[11px] text-text-secondary">
                            {c.type} · {c.frequency} · hiệu quả{" "}
                            <b>{overallEffectivenessOf(c)}</b>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-hint">
                  <IconRadar size={13} className="mt-px shrink-0" />
                  Hệ thống <b>không tự tính</b> điểm còn lại. Anh tự đánh giá
                  dựa trên tác dụng thực tế của các kiểm soát trên.
                </p>
              </ContentCard>

              {/* Cột chấm điểm */}
              <ContentCard className="flex flex-col gap-4 xl:col-span-3">
                <StepTitle
                  index={4}
                  title="Đánh giá rủi ro còn lại"
                  note="Chấm lại điểm sau khi đã tính tới tác dụng của kiểm soát hiện có"
                />

                <ScoreSelector
                  criteria={RISK_SCORING_CRITERIA}
                  value={{
                    likelihood: form.residualLikelihood,
                    impact: form.residualImpact,
                  }}
                  onChange={(v: ScoreValue) =>
                    patch({
                      residualLikelihood: v.likelihood ?? null,
                      residualImpact: v.impact ?? null,
                    })
                  }
                  compareValue={{
                    likelihood: form.inherentLikelihood,
                    impact: form.inherentImpact,
                  }}
                  compareLabel="Cố hữu"
                  maxValue={{
                    likelihood: form.inherentLikelihood,
                    impact: form.inherentImpact,
                  }}
                  errors={errors}
                  summary={
                    <ScoreSummary
                      label="Rủi ro còn lại"
                      score={residualScore}
                      likelihood={form.residualLikelihood}
                      impact={form.residualImpact}
                      compareScore={inherentScore}
                    />
                  }
                />

                {residualScore !== null &&
                  inherentScore !== null &&
                  residualScore === inherentScore &&
                  activePicked.length > 0 && (
                    <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                      <IconAlertTriangle size={16} className="mt-px shrink-0" />
                      <span>
                        Điểm còn lại <b>giữ nguyên</b> như điểm cố hữu dù đã gắn{" "}
                        {activePicked.length} kiểm soát. Nếu đúng như vậy thì
                        nên nêu rõ trong luận cứ, vì đây là dấu hiệu kiểm soát
                        hiện có chưa mang lại tác dụng thực tế.
                      </span>
                    </div>
                  )}

                <Textarea
                  label="Luận cứ đánh giá"
                  rows={3}
                  maxLength={800}
                  showCount
                  placeholder="Vì sao hạ xuống mức này, kiểm soát nào tạo ra tác dụng đó, còn khe hở nào"
                  value={form.residualRationale}
                  hint="Không bắt buộc, nhưng rất cần khi hạ nhiều bậc vì kiểm toán nội bộ sẽ đọc lại"
                  onChange={(e) => patch({ residualRationale: e.target.value })}
                />
              </ContentCard>
            </div>
          )}

          {/* ==================== Bước 5 ==================== */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <ContentCard className="flex flex-col gap-4">
                <StepTitle
                  index={5}
                  title="Ứng phó và theo dõi"
                  note="Quyết định sẽ làm gì với mức rủi ro còn lại và khi nào đánh giá lại"
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div data-field="treatmentStrategy">
                    <Select
                      label="Chiến lược ứng phó"
                      required
                      options={TREATMENT_OPTIONS}
                      value={form.treatmentStrategy || null}
                      error={errors.treatmentStrategy}
                      onChange={(v) => patch({ treatmentStrategy: v ?? "" })}
                    />
                  </div>
                  <div data-field="nextReviewDate">
                    <DateInput
                      label="Kỳ đánh giá lại"
                      required
                      min={today()}
                      value={form.nextReviewDate}
                      error={errors.nextReviewDate}
                      hint={
                        errors.nextReviewDate
                          ? undefined
                          : "Quá ngày này mà chưa đánh giá lại, hệ thống sẽ hiện nhãn nhắc"
                      }
                      onChange={(v) => patch({ nextReviewDate: v })}
                    />
                  </div>
                </div>

                {form.treatmentStrategy === "Chấp nhận" &&
                  !!residualScore &&
                  residualScore > 9 && (
                    <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                      <IconAlertTriangle size={16} className="mt-px shrink-0" />
                      <span>
                        Chọn <b>Chấp nhận</b> với rủi ro còn lại mức{" "}
                        <b>{levelOfScore(residualScore)}</b> là quyết định cần
                        cấp có thẩm quyền phê duyệt. Nên ghi rõ căn cứ trong
                        luận cứ đánh giá ở bước trước.
                      </span>
                    </div>
                  )}
              </ContentCard>

              {/* -------------------- Xem lại -------------------- */}
              <ContentCard className="flex flex-col gap-3">
                <p className="text-[13px] font-semibold text-text-primary">
                  Xem lại trước khi lưu
                </p>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <ReviewRow label="Tên rủi ro" value={form.name} />
                  <ReviewRow
                    label="Nhóm và đơn vị"
                    value={`${lk.categoryName(form.categoryId)} · ${lk.unitName(form.unitId)}`}
                  />
                  <ReviewRow
                    label="Chủ sở hữu"
                    value={lk.employeeName(form.ownerId, "chưa gán")}
                  />
                  <ReviewRow
                    label="Kiểm soát đã gắn"
                    value={
                      activePicked.length > 0
                        ? `${activePicked.length} kiểm soát`
                        : "Không có, đã chấp nhận rủi ro"
                    }
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 rounded-ctrl bg-surface-alt p-3">
                  <span className="flex flex-col gap-1">
                    <span className="text-[12px] text-text-secondary">
                      Rủi ro cố hữu
                    </span>
                    <RiskBadge
                      level={levelOfScore(inherentScore ?? 0)}
                      score={inherentScore ?? 0}
                    />
                  </span>
                  <IconArrowRight size={18} className="text-icon-neutral" />
                  <span className="flex flex-col gap-1">
                    <span className="text-[12px] text-text-secondary">
                      Rủi ro còn lại
                    </span>
                    <RiskBadge
                      level={levelOfScore(residualScore ?? 0)}
                      score={residualScore ?? 0}
                    />
                  </span>
                  {form.isZeroTolerance && (
                    <Badge tone="danger" dot>
                      Không khẩu vị
                    </Badge>
                  )}
                  <span className="ml-auto text-[12px] text-text-secondary">
                    Chấm ngày <b className="text-text-primary">{today()}</b> bởi{" "}
                    <b className="text-text-primary">
                      {lk.employeeName(form.ownerId, user.name)}
                    </b>
                  </span>
                </div>
              </ContentCard>
            </div>
          )}
        </div>
      </PageBody>

      {/* ===================== Thanh hành động ===================== */}
      <FooterActionBar
        left={
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <Badge tone="neutral" dot>
              Bước {step + 1} / 5
            </Badge>
            <span>{RISK_STAGES[step].label}</span>
            {step3Locked && step < 3 && (
              <span className="inline-flex items-center gap-1 text-lv-medium-text">
                <IconLock size={13} />
                Bước 4 mở sau khi gắn kiểm soát
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
          disabled={step === 0 || saving}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Quay lại
        </Button>
        {step < 4 ? (
          <Button
            variant="primary"
            icon={<IconArrowRight size={16} />}
            onClick={next}
          >
            Bước tiếp theo
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
/* Bước 3: chọn kiểm soát từ thư viện                                  */
/* ================================================================== */

function ControlPickerStep({
  controls,
  value,
  noControlAccepted,
  requiresControl,
  error,
  unitName,
  onChange,
  onToggleAccept,
}: {
  controls: ControlRecord[];
  value: string[];
  noControlAccepted: boolean;
  requiresControl: boolean;
  error?: string;
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

  return (
    <ContentCard className="flex flex-col gap-4">
      <StepTitle
        index={3}
        title="Gắn kiểm soát từ thư viện"
        note="Chọn các kiểm soát đang bảo vệ rủi ro này. Đây là căn cứ để chấm điểm còn lại ở bước sau"
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
          Đã chọn <b className="text-text-primary">{value.length}</b> kiểm soát
        </span>
      </div>

      {error && (
        <div
          data-field="controls"
          className="flex gap-2 rounded-ctrl border border-lv-critical-border bg-lv-critical-bg p-2.5 text-[12px] leading-4 text-lv-critical-text"
        >
          <IconShieldX size={16} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>
            Có <b>{pendingCount}</b> kiểm soát đang ở trạng thái Nháp hoặc Chờ
            duyệt. Những kiểm soát này <b>chưa được tính</b> là đang bảo vệ rủi
            ro, vì chưa phê duyệt thì chưa vận hành.
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
                    {pending && (
                      <Tooltip content="Chưa phê duyệt nên chưa tính là đang bảo vệ rủi ro">
                        <Badge tone="neutral" size="sm">
                          {c.status}
                        </Badge>
                      </Tooltip>
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-text-secondary">
                    {c.type} · {c.frequency} · {unitName(c.unitId)} · hiệu quả{" "}
                    {overallEffectivenessOf(c)}
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
          "flex flex-col gap-1 rounded-ctrl px-3 py-2.5",
          requiresControl ? "bg-surface-alt opacity-60" : "bg-surface-alt",
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
            ? "Không dùng được vì rủi ro cố hữu đang ở mức Cao trở lên, bắt buộc phải có kiểm soát."
            : "Dùng khi rủi ro ở mức thấp và chi phí kiểm soát lớn hơn lợi ích. Hồ sơ vẫn ghi nhận là quyết định có chủ đích, không phải bỏ trống."}
        </span>
      </div>
    </ContentCard>
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

function ScoreSummary({
  label,
  score,
  likelihood,
  impact,
  compareScore,
}: {
  label: string;
  score: number | null;
  likelihood: number | null;
  impact: number | null;
  compareScore?: number | null;
}) {
  if (!score)
    return (
      <div className="flex items-center gap-2 rounded-ctrl bg-surface-alt p-3 text-[12px] text-text-hint">
        <IconRadar size={16} />
        Chấm đủ 2 dòng để hệ thống hiện điểm và mức rủi ro
      </div>
    );

  const diff = compareScore ? compareScore - score : 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-ctrl bg-surface-alt p-3">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <RiskBadge level={levelOfScore(score)} score={score} />
      <span className="text-[12px] text-text-secondary">
        Khả năng {likelihood} × Ảnh hưởng {impact} = <b>{score} điểm</b>
      </span>
      {diff > 0 && (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-lv-low-text">
          <IconCircleCheck size={14} />
          Giảm {diff} điểm so với cố hữu
        </span>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[13px] text-text-primary">{value || "--"}</span>
    </div>
  );
}
