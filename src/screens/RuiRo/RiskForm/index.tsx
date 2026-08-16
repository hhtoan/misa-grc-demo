"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconCheck,
  IconDeviceFloppy,
  IconInfoCircle,
  IconPlus,
  IconSearch,
  IconTarget,
  IconX,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DateInput,
  EmptyState,
  FormGrid,
  FormSection,
  Input,
  Modal,
  MoneyInput,
  MoneyInput as _Money,
  Select,
  Switch,
  Textarea,
  Tooltip,
  useToast,
} from "@/components/ui";
import {
  ContentCard,
  FooterActionBar,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { LEVEL_TONE, RiskMatrixPicker } from "@/components/domain";
import { riskRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import {
  emptyRiskForm,
  inherentLevelOf,
  inherentScoreOf,
  isRiskEditable,
  reductionPercentOf,
  residualLevelOf,
  residualScoreOf,
  riskToForm,
  riskWarnings,
  validateRiskForm,
  type RiskFormValue,
} from "@/lib/domain/risk-utils";
import { RISK_SOURCES, RISK_TREATMENTS } from "@/lib/domain/enums";
import type { Objective } from "@/lib/domain/schema";
import { matchSearch } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/* ================================================================== */
/* Hằng số                                        */
/* ================================================================== */

const TREATMENT_OPTIONS = RISK_TREATMENTS.map((v) => ({
  value: v,
  label: v,
  description:
    v === "Chấp nhận"
      ? "Giữ nguyên rủi ro trong khẩu vị đã duyệt"
      : v === "Giảm thiểu"
        ? "Bổ sung kiểm soát để hạ mức rủi ro"
        : v === "Chuyển giao"
          ? "Chuyển một phần rủi ro sang bên thứ ba"
          : "Ngừng hoạt động phát sinh rủi ro",
}));

const SOURCE_OPTIONS = RISK_SOURCES.map((v) => ({ value: v, label: v }));

export type RiskFormMode = "create" | "edit";

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function RiskFormScreen({
  mode,
  code,
}: {
  mode: RiskFormMode;
  code?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();
  const risks = useCollection(riskRepo);

  /* ------------------------ Bản ghi đang sửa ---------------------- */
  const record = useMemo(
    () =>
      mode === "edit" && code
        ? risks.find((r) => r.code === code || r.id === code)
        : undefined,
    [mode, code, risks]
  );

  /* ---------------------------- State ----------------------------- */
  const [form, setForm] = useState<RiskFormValue>(() => emptyRiskForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const loadedFor = useRef<string>("");

  /* Nạp dữ liệu vào form một lần khi mở trang sửa */
  useEffect(() => {
    if (mode !== "edit" || !record) return;
    if (loadedFor.current === record.id) return;
    loadedFor.current = record.id;
    setForm(riskToForm(record));
    setDirty(false);
    setErrors({});
  }, [mode, record]);

  /* Cảnh báo khi đóng tab lúc còn thay đổi chưa lưu */
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* --------------------------- Tiện ích --------------------------- */

  function patch(next: Partial<RiskFormValue>) {
    setForm((prev) => ({ ...prev, ...next }));
    setDirty(true);
    // Xoá lỗi của đúng những trường vừa sửa
    const keys = Object.keys(next);
    if (keys.length === 0) return;
    setErrors((prev) => {
      let changed = false;
      const out = { ...prev };
      keys.forEach((k) => {
        if (out[k]) {
          delete out[k];
          changed = true;
        }
      });
      return changed ? out : prev;
    });
  }

  const warnings = useMemo(() => riskWarnings(form), [form]);
  const inherentScore = inherentScoreOf(form);
  const residualScore = residualScoreOf(form);
  const reduction = reductionPercentOf(form);

  /* Khoá phương án Chấp nhận khi là rủi ro không khoan nhượng */
  const treatmentOptions = useMemo(
    () =>
      TREATMENT_OPTIONS.map((o) =>
        o.value === "Chấp nhận" && form.isZeroTolerance
          ? {
              ...o,
              disabled: true,
              description: "Không áp dụng cho rủi ro không khoan nhượng",
            }
          : o
      ),
    [form.isZeroTolerance]
  );

  function toggleZeroTolerance(v: boolean) {
    if (v && form.treatment === "Chấp nhận") {
      patch({ isZeroTolerance: true, treatment: "Giảm thiểu" });
      toast.info(
        "Đã đổi phương án xử lý",
        "Rủi ro không khoan nhượng không được chọn Chấp nhận, hệ thống chuyển sang Giảm thiểu."
      );
      return;
    }
    patch({ isZeroTolerance: v });
  }

  /* ---------------------------- Lưu ------------------------------- */

  function scrollToFirstError(errs: Record<string, string>) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    const el = document.querySelector(`[data-field="${first}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function save(options: { thenSubmit?: boolean } = {}) {
    const result = validateRiskForm(form);

    if (!result.ok || !result.data) {
      setErrors(result.errors);
      const count = Object.keys(result.errors).length;
      toast.error(
        "Chưa lưu được",
        `Còn ${count} trường chưa hợp lệ, vui lòng kiểm tra lại.`
      );
      setTimeout(() => scrollToFirstError(result.errors), 0);
      return;
    }

    setSaving(true);
    const data = result.data;
    const finalData: RiskFormValue = options.thenSubmit
      ? { ...data, status: "Chờ duyệt" }
      : data;

    try {
      if (mode === "create") {
        const created = riskRepo.create(finalData, user.name);
        setDirty(false);
        toast.success(
          `Đã tạo ${created.code}`,
          options.thenSubmit
            ? "Rủi ro đã được trình duyệt."
            : `Rủi ro được lưu ở trạng thái ${finalData.status}.`
        );
        router.replace(`/rui-ro/so-dang-ky/${created.code}`);
      } else if (record) {
        riskRepo.update(record.id, finalData);
        setDirty(false);
        toast.success(
          `Đã lưu ${record.code}`,
          options.thenSubmit
            ? "Rủi ro đã được trình duyệt."
            : "Thông tin rủi ro đã được cập nhật."
        );
        router.replace(`/rui-ro/so-dang-ky/${record.code}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (dirty) {
      setLeaving(true);
      return;
    }
    goBack();
  }

  function goBack() {
    if (mode === "edit" && record) {
      router.push(`/rui-ro/so-dang-ky/${record.code}`);
      return;
    }
    router.push("/rui-ro/so-dang-ky");
  }

  /* ------------------- Trạng thái đặc biệt ------------------------ */

  if (mode === "edit" && !record) {
    return (
      <PageContainer>
        <PageHeader title="Sửa rủi ro" showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              title="Không tìm thấy rủi ro"
              description={`Không có bản ghi nào ứng với mã ${code ?? ""}. Có thể bản ghi đã bị xoá.`}
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push("/rui-ro/so-dang-ky")}
                >
                  Về sổ đăng ký
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  if (mode === "edit" && record && !isRiskEditable(record.status)) {
    return (
      <PageContainer>
        <PageHeader title={`Sửa ${record.code}`} showBack />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconAlertTriangle size={24} />}
              title={`Rủi ro đang ở trạng thái ${record.status}`}
              description="Trạng thái này bị khoá chỉnh sửa. Hãy chuyển trạng thái về mức cho phép sửa trước khi cập nhật nội dung."
              action={
                <Button
                  variant="primary"
                  onClick={() =>
                    router.push(`/rui-ro/so-dang-ky/${record.code}`)
                  }
                >
                  Xem chi tiết
                </Button>
              }
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  const selectedObjectives = lk.objectivesByIds(form.objectiveIds);

  /* ------------------------------ Render -------------------------- */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={handleCancel}
        title={mode === "create" ? "Thêm rủi ro" : `Sửa ${record?.code}`}
        subtitle={
          mode === "create"
            ? "Điền thông tin nhận diện và đánh giá rủi ro"
            : record?.name
        }
        badge={
          dirty ? (
            <Badge tone="warning" dot>
              Có thay đổi chưa lưu
            </Badge>
          ) : undefined
        }
      />

      <PageBody className="pb-2">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
          {/* ================= Cảnh báo nghiệp vụ ================= */}
          {warnings.length > 0 && (
            <div className="rounded-card border border-lv-medium-border bg-lv-medium-bg p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lv-medium-text">
                <IconAlertTriangle size={16} />
                Lưu ý nghiệp vụ ({warnings.length})
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 pl-6">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="list-disc text-[12px] leading-4 text-lv-medium-text"
                  >
                    {w}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 pl-6 text-[11px] text-lv-medium-text opacity-80">
                Các lưu ý này không chặn lưu, chỉ nhắc để bạn kiểm tra lại.
              </p>
            </div>
          )}

          {/* ================= 1. Thông tin chung ================= */}
          <ContentCard>
            <FormSection
              title="Thông tin chung"
              description="Nhận diện rủi ro, nguyên nhân và hậu quả có thể xảy ra"
            >
              <div data-field="name">
                <Input
                  label="Tên rủi ro"
                  required
                  placeholder="Ví dụ: Gián đoạn dịch vụ do sự cố trung tâm dữ liệu"
                  value={form.name}
                  error={errors.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <Textarea
                label="Mô tả chi tiết"
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Mô tả bối cảnh, phạm vi ảnh hưởng của rủi ro"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
              />

              <FormGrid cols={2}>
                <Textarea
                  label="Nguyên nhân"
                  rows={3}
                  maxLength={500}
                  placeholder="Nguyên nhân gốc dẫn tới rủi ro"
                  value={form.cause}
                  onChange={(e) => patch({ cause: e.target.value })}
                />
                <Textarea
                  label="Hậu quả"
                  rows={3}
                  maxLength={500}
                  placeholder="Hậu quả nếu rủi ro xảy ra"
                  value={form.consequence}
                  onChange={(e) => patch({ consequence: e.target.value })}
                />
              </FormGrid>

              <FormGrid cols={3}>
                <div data-field="categoryId">
                  <Select
                    label="Nhóm rủi ro"
                    required
                    searchable
                    placeholder="Chọn nhóm rủi ro"
                    options={lk.riskCategoryOptions}
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
                    placeholder="Chọn đơn vị chịu trách nhiệm"
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
                    onChange={(v) => patch({ ownerId: v ?? "" })}
                  />
                </div>
              </FormGrid>

              <FormGrid cols={3}>
                <Select
                  label="Quy trình liên quan"
                  searchable
                  clearable
                  placeholder="Chọn quy trình"
                  options={lk.processOptions}
                  value={form.processId || null}
                  onChange={(v) => patch({ processId: v ?? "" })}
                />
                <Select
                  label="Hệ thống CNTT liên quan"
                  searchable
                  clearable
                  placeholder="Chọn hệ thống"
                  options={lk.systemOptions}
                  value={form.systemId || null}
                  onChange={(v) => patch({ systemId: v ?? "" })}
                />
                <Select
                  label="Nguồn rủi ro"
                  placeholder="Chọn nguồn"
                  options={SOURCE_OPTIONS}
                  value={form.source}
                  onChange={(v) =>
                    patch({ source: (v ?? "Nội bộ") as RiskFormValue["source"] })
                  }
                />
              </FormGrid>
            </FormSection>
          </ContentCard>

          {/* ============== 2. Mục tiêu bị ảnh hưởng ============== */}
          <ContentCard>
            <FormSection
              title="Mục tiêu bị ảnh hưởng"
              description="Rủi ro bắt buộc gắn với ít nhất 1 mục tiêu. Danh sách mục tiêu đồng bộ một chiều từ AMIS Mục tiêu."
            >
              <div data-field="objectiveIds" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    icon={<IconTarget size={16} />}
                    onClick={() => setObjectiveOpen(true)}
                  >
                    Chọn mục tiêu
                  </Button>
                  <span className="text-[12px] text-text-secondary">
                    Đã chọn{" "}
                    <b className="text-text-primary">
                      {form.objectiveIds.length}
                    </b>{" "}
                    trên {lk.objectives.length} mục tiêu
                  </span>
                </div>

                {selectedObjectives.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {selectedObjectives.map((o) => (
                      <ObjectiveRow
                        key={o.id}
                        objective={o}
                        unitName={lk.unitName(o.unitId)}
                        ownerName={lk.employeeName(o.ownerId)}
                        onRemove={() =>
                          patch({
                            objectiveIds: form.objectiveIds.filter(
                              (id) => id !== o.id
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p
                    className={cn(
                      "rounded-ctrl border border-dashed px-3 py-4 text-center text-[13px]",
                      errors.objectiveIds
                        ? "border-danger text-danger"
                        : "border-border-neutral text-text-hint"
                    )}
                  >
                    Chưa gắn mục tiêu nào. Rủi ro phải gắn ít nhất 1 mục tiêu
                    mới lưu được.
                  </p>
                )}

                {errors.objectiveIds && (
                  <p className="text-[12px] text-danger">
                    {errors.objectiveIds}
                  </p>
                )}
              </div>
            </FormSection>
          </ContentCard>

          {/* ================ 3. Đánh giá rủi ro ================= */}
          <ContentCard>
            <FormSection
              title="Đánh giá rủi ro"
              description="Chọn điểm trên ma trận 5x5. Rủi ro còn lại là mức sau khi đã tính tác dụng của các kiểm soát hiện có."
            >
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <RiskMatrixPicker
                  label="Rủi ro cố hữu (trước kiểm soát)"
                  required
                  likelihood={form.inherentLikelihood}
                  impact={form.inherentImpact}
                  onChange={(l, i) =>
                    patch({ inherentLikelihood: l, inherentImpact: i })
                  }
                />

                <div data-field="residualImpact">
                  <RiskMatrixPicker
                    label="Rủi ro còn lại (sau kiểm soát)"
                    required
                    likelihood={form.residualLikelihood}
                    impact={form.residualImpact}
                    error={errors.residualImpact ?? errors.residualLikelihood}
                    ghost={{
                      likelihood: form.inherentLikelihood,
                      impact: form.inherentImpact,
                      label: "Rủi ro cố hữu",
                    }}
                    onChange={(l, i) =>
                      patch({ residualLikelihood: l, residualImpact: i })
                    }
                  />
                </div>
              </div>

              {/* Bảng tóm tắt điểm */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ScoreBox
                  title="Điểm cố hữu"
                  score={inherentScore}
                  level={inherentLevelOf(form)}
                />
                <ScoreBox
                  title="Điểm còn lại"
                  score={residualScore}
                  level={residualLevelOf(form)}
                />
                <div className="rounded-ctrl border border-border-light p-3">
                  <p className="text-[12px] text-text-secondary">
                    Mức giảm nhờ kiểm soát
                  </p>
                  <p
                    className={cn(
                      "text-[22px] leading-7 font-semibold",
                      reduction > 0 ? "text-success" : "text-text-hint"
                    )}
                  >
                    {reduction}%
                  </p>
                  <p className="text-[11px] text-text-hint">
                    {inherentScore} → {residualScore} điểm
                  </p>
                </div>
              </div>
            </FormSection>
          </ContentCard>

          {/* ============== 4. Xử lý và theo dõi ================== */}
          <ContentCard>
            <FormSection
              title="Xử lý và theo dõi"
              description="Định hướng ứng phó, mốc thời gian và các thuộc tính quản trị"
            >
              <FormGrid cols={2}>
                <div data-field="treatment">
                  <Select
                    label="Phương án xử lý"
                    required
                    placeholder="Chọn phương án"
                    options={treatmentOptions}
                    value={form.treatment}
                    error={errors.treatment}
                    onChange={(v) =>
                      patch({
                        treatment: (v ??
                          "Giảm thiểu") as RiskFormValue["treatment"],
                      })
                    }
                  />
                </div>
                <div data-field="estimatedLoss">
                  <MoneyInput
                    label="Tổn thất ước tính"
                    value={form.estimatedLoss}
                    onChange={(v) => patch({ estimatedLoss: v })}
                    hint="Giá trị tổn thất dự kiến nếu rủi ro xảy ra"
                  />
                </div>
              </FormGrid>

              <div data-field="treatmentNote">
                <Textarea
                  label="Định hướng xử lý"
                  required={form.treatment !== "Chấp nhận"}
                  rows={3}
                  maxLength={800}
                  showCount
                  placeholder="Mô tả cách ứng phó, kiểm soát dự kiến bổ sung"
                  value={form.treatmentNote}
                  error={errors.treatmentNote}
                  onChange={(e) => patch({ treatmentNote: e.target.value })}
                />
              </div>

              <FormGrid cols={2}>
                <div data-field="identifiedDate">
                  <DateInput
                    label="Ngày nhận diện"
                    required
                    value={form.identifiedDate}
                    error={errors.identifiedDate}
                    onChange={(v) => patch({ identifiedDate: v })}
                  />
                </div>
                <div data-field="reviewDate">
                  <DateInput
                    label="Ngày rà soát định kỳ"
                    value={form.reviewDate}
                    min={form.identifiedDate || undefined}
                    error={errors.reviewDate}
                    hint="Mốc rà soát lại mức độ rủi ro"
                    onChange={(v) => patch({ reviewDate: v })}
                  />
                </div>
              </FormGrid>

              <div className="flex flex-wrap items-center gap-6 rounded-ctrl bg-surface-alt px-3 py-2.5">
                <Switch
                  checked={form.isKeyRisk}
                  onChange={(v) => patch({ isKeyRisk: v })}
                  label="Rủi ro trọng yếu"
                />
                <Tooltip content="Rủi ro không được phép chấp nhận, bắt buộc phải xử lý giảm thiểu">
                  <span className="inline-flex items-center gap-1.5">
                    <Switch
                      checked={form.isZeroTolerance}
                      onChange={toggleZeroTolerance}
                      label="Rủi ro không khoan nhượng"
                    />
                    <IconInfoCircle size={15} className="text-icon-neutral" />
                  </span>
                </Tooltip>
              </div>

              <TagEditor
                value={form.tags}
                onChange={(tags) => patch({ tags })}
              />
            </FormSection>
          </ContentCard>

          {mode === "edit" && record && (
            <p className="pb-1 text-center text-[12px] text-text-hint">
              Trạng thái hiện tại: <b>{record.status}</b>. Việc chuyển trạng
              thái thực hiện ở màn hình chi tiết.
            </p>
          )}
        </div>
      </PageBody>

      {/* ===================== Thanh hành động ===================== */}
      <FooterActionBar
        left={
          <span className="flex items-center gap-2 text-[12px] text-text-secondary">
            <Badge tone={LEVEL_TONE[residualLevelOf(form)]} dot>
              Còn lại: {residualLevelOf(form)} ({residualScore})
            </Badge>
            {warnings.length > 0 && (
              <span className="text-lv-medium-text">
                {warnings.length} lưu ý nghiệp vụ
              </span>
            )}
          </span>
        }
      >
        <Button variant="text" onClick={handleCancel} disabled={saving}>
          Huỷ bỏ
        </Button>
        {form.status === "Nháp" && (
          <Button
            variant="secondary"
            icon={<IconArrowNarrowRight size={16} />}
            loading={saving}
            onClick={() => save({ thenSubmit: true })}
          >
            Lưu và trình duyệt
          </Button>
        )}
        <Button
          variant="primary"
          icon={
            mode === "create" ? (
              <IconPlus size={16} />
            ) : (
              <IconDeviceFloppy size={16} />
            )
          }
          loading={saving}
          onClick={() => save()}
        >
          {mode === "create" ? "Thêm rủi ro" : "Lưu thay đổi"}
        </Button>
      </FooterActionBar>

      {/* ======================= Hộp thoại ======================== */}
      <ObjectivePickerModal
        open={objectiveOpen}
        onClose={() => setObjectiveOpen(false)}
        objectives={lk.objectives}
        unitName={lk.unitName}
        selected={form.objectiveIds}
        onConfirm={(ids) => {
          patch({ objectiveIds: ids });
          setObjectiveOpen(false);
        }}
      />

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          setDirty(false);
          goBack();
        }}
        title="Rời khỏi trang"
        message="Bạn có thay đổi chưa được lưu. Rời khỏi trang bây giờ sẽ mất toàn bộ thay đổi. Tiếp tục?"
        confirmText="Rời đi"
        cancelText="Ở lại"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Ô hiển thị điểm rủi ro                                        */
/* ================================================================== */

function ScoreBox({
  title,
  score,
  level,
}: {
  title: string;
  score: number;
  level: keyof typeof LEVEL_TONE;
}) {
  return (
    <div className="rounded-ctrl border border-border-light p-3">
      <p className="text-[12px] text-text-secondary">{title}</p>
      <div className="flex items-center gap-2">
        <span className="text-[22px] leading-7 font-semibold text-text-primary">
          {score}
        </span>
        <Badge tone={LEVEL_TONE[level]} dot>
          {level}
        </Badge>
      </div>
      <p className="text-[11px] text-text-hint">Thang điểm tối đa 25</p>
    </div>
  );
}

/* ================================================================== */
/* Dòng mục tiêu đã chọn                                        */
/* ================================================================== */

function ObjectiveRow({
  objective,
  unitName,
  ownerName,
  onRemove,
}: {
  objective: Objective;
  unitName: string;
  ownerName: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-ctrl border border-border-light px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
        <IconTarget size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-text-primary">
          <b className="text-brand">{objective.code}</b> {objective.name}
        </p>
        <p className="truncate text-[12px] text-text-secondary">
          {objective.perspective} - {objective.level} - {unitName} - {ownerName}
        </p>
      </div>

      <div className="hidden w-[130px] shrink-0 items-center gap-2 sm:flex">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
          <span
            className="block h-full rounded-full bg-brand"
            style={{ width: `${objective.progress}%` }}
          />
        </span>
        <span className="text-[11px] text-text-secondary">
          {objective.progress}%
        </span>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Bỏ gắn mục tiêu"
        className="shrink-0 rounded-ctrl p-1.5 text-icon-neutral transition-colors hover:bg-[#F0F0F0] hover:text-danger"
      >
        <IconX size={16} />
      </button>
    </div>
  );
}

/* ================================================================== */
/* Hộp thoại chọn mục tiêu                                        */
/* ================================================================== */

function ObjectivePickerModal({
  open,
  onClose,
  objectives,
  unitName,
  selected,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  objectives: Objective[];
  unitName: (id: string) => string;
  selected: string[];
  onConfirm: (ids: string[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState<string[]>(selected);
  const [openedKey, setOpenedKey] = useState(false);

  // Đồng bộ lại lựa chọn mỗi lần mở
  if (open !== openedKey) {
    setOpenedKey(open);
    if (open) {
      setDraft(selected);
      setKeyword("");
    }
  }

  const filtered = useMemo(
    () =>
      objectives.filter(
        (o) =>
          matchSearch(o.name, keyword) ||
          matchSearch(o.code, keyword) ||
          matchSearch(o.perspective, keyword)
      ),
    [objectives, keyword]
  );

  function toggle(id: string) {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Chọn mục tiêu bị ảnh hưởng"
      description="Dữ liệu mục tiêu đồng bộ một chiều từ AMIS Mục tiêu, chỉ đọc trong GRC"
      footer={
        <>
          <span className="mr-auto text-[12px] text-text-secondary">
            Đã chọn <b className="text-text-primary">{draft.length}</b> mục tiêu
          </span>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            icon={<IconCheck size={16} />}
            onClick={() => onConfirm(draft)}
          >
            Xác nhận
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          placeholder="Tìm theo mã, tên mục tiêu hoặc khía cạnh BSC"
          prefixIcon={<IconSearch size={16} />}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <div className="flex max-h-[380px] flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[13px] text-text-hint">
              Không tìm thấy mục tiêu phù hợp
            </p>
          )}

          {filtered.map((o) => {
            const checked = draft.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-ctrl border px-3 py-2 text-left transition-colors",
                  checked
                    ? "border-brand bg-brand-light"
                    : "border-border-light hover:bg-[#FAFAFA]"
                )}
              >
                <span className="pt-0.5">
                  <Checkbox checked={checked} readOnly />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text-primary">
                    <b className="text-brand">{o.code}</b> {o.name}
                  </span>
                  <span className="block truncate text-[12px] text-text-secondary">
                    {o.perspective} - {o.level} - {unitName(o.unitId)} - Tiến độ{" "}
                    {o.progress}%
                  </span>
                </span>
                <Badge tone="neutral" size="sm">
                  {o.period}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Trình nhập thẻ (tags)                                        */
/* ================================================================== */

function TagEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim();
    if (!tag) return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text-primary">
        Thẻ phân loại
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[240px]">
          <Input
            placeholder="Nhập thẻ rồi bấm Enter"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button variant="secondary" size="sm" compact onClick={add}>
          Thêm thẻ
        </Button>

        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-badge border border-border-light bg-surface-alt px-2 py-0.5 text-[12px] text-text-primary"
          >
            {tag}
            <button
              type="button"
              aria-label={`Xoá thẻ ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="rounded p-0.5 text-icon-neutral hover:bg-[#F0F0F0] hover:text-danger"
            >
              <IconX size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
