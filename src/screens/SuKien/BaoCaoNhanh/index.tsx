"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconEyeOff,
  IconInfoCircle,
  IconRadar,
  IconSend,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DateInput,
  Input,
  Select,
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
import { eventRepo, useCollection } from "@/lib/db";
import { useLookups } from "@/lib/domain/lookups";
import { EVENT_IMPACT_TYPES } from "@/lib/domain/enums";
import {
  emptyEventForm,
  validateEventForm,
  type EventFormValue,
} from "@/lib/domain/event-utils";
import { formatDate, toInputDate } from "@/lib/format";
import { useSession } from "@/config/session";
import { cn } from "@/lib/cn";

/** Loại ảnh hưởng lấy trực tiếp từ kiểu của form */
type ImpactType = EventFormValue["impactTypes"][number];

const IMPACT_HINT: Record<ImpactType, string> = {
  "Tài chính": "Phát sinh mất mát tiền hoặc tài sản đo đếm được",
  "Uy tín": "Ảnh hưởng hình ảnh, niềm tin của khách hàng và đối tác",
  "Pháp lý": "Vi phạm quy định pháp luật, hợp đồng hoặc quy chế nội bộ",
  "Vận hành": "Gián đoạn quy trình, dịch vụ hoặc hệ thống",
  "An toàn thông tin": "Rò rỉ, mất mát hoặc truy cập trái phép dữ liệu",
  "Con người": "Ảnh hưởng tới an toàn, sức khoẻ hoặc quan hệ lao động",
};

/* ================================================================== */
/* Màn hình                                        */
/* ================================================================== */

export default function BaoCaoNhanhScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const lk = useLookups();

  /* Đăng ký theo dõi để bản ghi mới tạo phản ánh ngay */
  useCollection(eventRepo);

  const currentEmployee = useMemo(
    () => lk.employees.find((e) => e.email === user.email),
    [lk.employees, user.email]
  );

  const today = toInputDate(new Date());

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [occurredDate, setOccurredDate] = useState(today);
  const [impactTypes, setImpactTypes] = useState<ImpactType[]>([]);
  const [isNearMiss, setIsNearMiss] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [created, setCreated] = useState<{ code: string; id: string } | null>(
    null
  );

  const dirty =
    !!name.trim() ||
    !!description.trim() ||
    !!categoryId ||
    !!unitId ||
    impactTypes.length > 0;

  /* Gợi ý đơn vị theo hồ sơ nhân sự của người đăng nhập */
  useEffect(() => {
    if (unitId || !currentEmployee?.unitId) return;
    setUnitId(currentEmployee.unitId);
  }, [currentEmployee, unitId]);

  /* Cảnh báo khi đóng tab lúc còn nội dung chưa gửi */
  useEffect(() => {
    if (!dirty || created) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, created]);

  /* --------------------------- Tiện ích -------------------------- */

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const out = { ...prev };
      delete out[key];
      return out;
    });
  }

  function toggleImpact(v: ImpactType) {
    const next: ImpactType[] = impactTypes.includes(v)
      ? impactTypes.filter((x) => x !== v)
      : [...impactTypes, v];
    setImpactTypes(next);
    clearError("impactTypes");
  }

  /** Số ngày từ lúc xảy ra tới hôm nay */
  const lag = useMemo(() => {
    if (!occurredDate) return 0;
    const a = new Date(occurredDate);
    a.setHours(0, 0, 0, 0);
    const b = new Date();
    b.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
  }, [occurredDate]);

  /* ---------------------------- Gửi ------------------------------ */

  function localErrors(): Record<string, string> {
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Bắt buộc nhập tên sự kiện";
    else if (name.trim().length < 8)
      err.name = "Tên sự kiện quá ngắn, hãy mô tả rõ hơn để người xử lý hiểu";
    if (!categoryId) err.categoryId = "Bắt buộc chọn nhóm sự kiện";
    if (!unitId) err.unitId = "Bắt buộc chọn đơn vị xảy ra";
    if (!occurredDate) err.occurredDate = "Bắt buộc nhập ngày xảy ra";
    else if (occurredDate > today)
      err.occurredDate = "Ngày xảy ra không được ở tương lai";
    if (impactTypes.length === 0)
      err.impactTypes = "Phải chọn ít nhất 1 loại ảnh hưởng";
    if (!description.trim())
      err.description =
        "Bắt buộc mô tả diễn biến, đây là thông tin quan trọng nhất với người xử lý";
    return err;
  }

  function scrollToFirstError(errs: Record<string, string>) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    document
      .querySelector(`[data-field="${first}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function submit() {
    const local = localErrors();
    if (Object.keys(local).length > 0) {
      setErrors(local);
      toast.error(
        "Chưa gửi được",
        `Còn ${Object.keys(local).length} trường chưa hợp lệ, vui lòng kiểm tra lại.`
      );
      setTimeout(() => scrollToFirstError(local), 0);
      return;
    }

    /* Báo cáo nhanh luôn đặt mức Trung bình và trạng thái Mới ghi nhận,
       Ban QTRR sẽ đánh giá lại mức nghiêm trọng khi tiếp nhận xác minh */
    const payload = emptyEventForm({
      name: name.trim(),
      description: description.trim(),
      categoryId,
      unitId,
      occurredDate,
      detectedDate: today,
      reporterId: currentEmployee?.id ?? "",
      impactTypes,
      isNearMiss,
      isConfidential: anonymous,
      severity: "Trung bình",
      status: "Mới ghi nhận",
      statusNote: anonymous
        ? "Báo cáo ẩn danh qua kênh báo cáo nhanh, danh tính người báo cáo được giới hạn phạm vi tiếp cận."
        : "Ghi nhận qua kênh báo cáo nhanh.",
    });

    const result = validateEventForm(payload);
    if (!result.ok || !result.data) {
      setErrors(result.errors);
      toast.error(
        "Chưa gửi được",
        "Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại các trường bắt buộc."
      );
      setTimeout(() => scrollToFirstError(result.errors), 0);
      return;
    }

    setSaving(true);
    try {
      const row = eventRepo.create(result.data, user.name);
      setCreated({ code: row.code, id: row.id });
      toast.success(
        `Đã gửi báo cáo ${row.code}`,
        "Ban QTRR sẽ tiếp nhận và xác minh trong thời gian sớm nhất."
      );
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setName("");
    setDescription("");
    setCategoryId("");
    setUnitId(currentEmployee?.unitId ?? "");
    setOccurredDate(today);
    setImpactTypes([]);
    setIsNearMiss(false);
    setAnonymous(false);
    setErrors({});
    setCreated(null);
  }

  /* ==================== Màn hình sau khi gửi ==================== */

  if (created) {
    return (
      <PageContainer>
        <PageHeader
          title="Đã gửi báo cáo sự kiện"
          showBack
          onBack={() => router.push("/su-kien/cua-toi")}
        />
        <PageBody>
          <div className="mx-auto flex max-w-[720px] flex-col gap-4">
            <ContentCard className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lv-low-bg text-lv-low-text">
                <IconCircleCheck size={30} />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-[18px] font-semibold text-text-primary">
                  Cảm ơn anh đã báo cáo sự kiện
                </p>
                <p className="text-[13px] text-text-secondary">
                  Sự kiện được ghi nhận với mã{" "}
                  <b className="text-brand">{created.code}</b> ở trạng thái{" "}
                  <b>Mới ghi nhận</b>.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  variant="primary"
                  onClick={() =>
                    router.push(`/su-kien/so-theo-doi/${created.code}`)
                  }
                >
                  Xem chi tiết sự kiện
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push("/su-kien/cua-toi")}
                >
                  Về sự kiện của tôi
                </Button>
                <Button variant="text" onClick={resetForm}>
                  Báo cáo sự kiện khác
                </Button>
              </div>
            </ContentCard>

            <ContentCard>
              <p className="mb-2 text-[13px] font-semibold text-text-primary">
                Điều gì xảy ra tiếp theo
              </p>
              <ol className="flex flex-col gap-2">
                <NextStep
                  index={1}
                  title="Ban QTRR tiếp nhận và xác minh"
                  description="Kiểm tra tính xác thực, đánh giá lại mức nghiêm trọng và phân công người xử lý."
                />
                <NextStep
                  index={2}
                  title="Điều tra nguyên nhân gốc"
                  description="Xác định rủi ro đã hiện thực hoá và kiểm soát nào đã thất bại."
                />
                <NextStep
                  index={3}
                  title="Lập hành động khắc phục và phòng ngừa"
                  description="Giao việc sang AMIS Công việc hoặc JIRA để triển khai thực tế."
                />
                <NextStep
                  index={4}
                  title="Đóng sự kiện và rút bài học"
                  description="Ghi nhận bài học kinh nghiệm để tránh tái diễn."
                />
              </ol>
              <p className="mt-3 flex items-start gap-2 rounded-ctrl bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                <IconInfoCircle size={15} className="mt-px shrink-0" />
                Anh có thể theo dõi tiến độ xử lý tại màn hình{" "}
                <b>Sự kiện của tôi</b>. Nếu cần bổ sung thông tin, hệ thống sẽ
                hiển thị việc cần làm ngay trên dòng sự kiện.
              </p>
            </ContentCard>
          </div>
        </PageBody>
      </PageContainer>
    );
  }

  /* ========================= Màn hình form ====================== */

  return (
    <PageContainer>
      <PageHeader
        showBack
        onBack={() => (dirty ? setLeaving(true) : router.back())}
        title="Báo cáo nhanh sự kiện"
        subtitle="Dành cho mọi cán bộ nhân viên, chỉ cần 6 thông tin cơ bản"
      />

      <PageBody className="pb-2">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4">
          {/* ------------------- Hướng dẫn ngắn ------------------- */}
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-lv-info-border bg-lv-info-bg px-3 py-2.5 text-[12px] leading-4 text-lv-info-text">
            <IconBolt size={18} className="shrink-0" />
            <span className="min-w-0 flex-1">
              Báo cáo nhanh dùng khi anh <b>vừa phát hiện</b> một sự cố, sai
              sót hoặc tình huống bất thường. Không cần biết đó là rủi ro nào,
              tổn thất bao nhiêu. Ban QTRR sẽ đánh giá và bổ sung phần còn lại.
            </span>
          </div>

          {/* -------------------- Nội dung form ------------------- */}
          <ContentCard className="flex flex-col gap-4">
            <div data-field="name">
              <Input
                label="Chuyện gì đã xảy ra"
                required
                placeholder="Ví dụ: Hệ thống thanh toán gián đoạn 2 tiếng sáng nay"
                value={name}
                error={errors.name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearError("name");
                }}
              />
            </div>

            <div data-field="description">
              <Textarea
                label="Diễn biến chi tiết"
                required
                rows={4}
                maxLength={1500}
                showCount
                placeholder="Sự việc diễn ra thế nào, ai phát hiện, đã xử lý tạm thời ra sao, còn ảnh hưởng gì không"
                value={description}
                error={errors.description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearError("description");
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div data-field="categoryId">
                <Select
                  label="Thuộc nhóm nào"
                  required
                  searchable
                  placeholder="Chọn nhóm sự kiện"
                  options={lk.eventCategoryOptions}
                  value={categoryId || null}
                  error={errors.categoryId}
                  hint={
                    errors.categoryId
                      ? undefined
                      : "Chọn gần đúng cũng được, Ban QTRR sẽ phân loại lại"
                  }
                  onChange={(v) => {
                    setCategoryId(v ?? "");
                    clearError("categoryId");
                  }}
                />
              </div>

              <div data-field="unitId">
                <Select
                  label="Xảy ra ở đơn vị nào"
                  required
                  searchable
                  placeholder="Chọn đơn vị"
                  options={lk.unitOptions}
                  value={unitId || null}
                  error={errors.unitId}
                  onChange={(v) => {
                    setUnitId(v ?? "");
                    clearError("unitId");
                  }}
                />
              </div>
            </div>

            <div data-field="occurredDate" className="flex flex-col gap-2">
              <DateInput
                label="Xảy ra ngày nào"
                required
                value={occurredDate}
                max={today}
                error={errors.occurredDate}
                hint={
                  errors.occurredDate
                    ? undefined
                    : `Ngày phát hiện được ghi nhận tự động là hôm nay, ${formatDate(today)}`
                }
                onChange={(v) => {
                  setOccurredDate(v);
                  clearError("occurredDate");
                }}
              />

              {lag > 7 && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconRadar size={16} className="mt-px shrink-0" />
                  <span>
                    Sự kiện xảy ra <b>{lag} ngày trước</b> mà bây giờ mới được
                    báo cáo. Anh nên ghi rõ trong phần diễn biến vì sao đến giờ
                    mới phát hiện, thông tin này giúp Ban QTRR rà soát lại cơ
                    chế giám sát.
                  </span>
                </div>
              )}
            </div>

            <div data-field="impactTypes" className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-text-primary">
                Ảnh hưởng tới mặt nào <span className="text-danger">*</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {(EVENT_IMPACT_TYPES as readonly ImpactType[]).map((v) => {
                  const active = impactTypes.includes(v);
                  return (
                    <Tooltip key={v} content={IMPACT_HINT[v]}>
                      <button
                        type="button"
                        onClick={() => toggleImpact(v)}
                        className={cn(
                          "rounded-ctrl border px-3 py-1.5 text-[12px] font-medium transition-all",
                          active
                            ? "border-brand bg-brand-light text-brand"
                            : "border-border-neutral bg-white text-text-secondary hover:bg-[#FAFAFA]"
                        )}
                      >
                        {v}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
              {errors.impactTypes ? (
                <p className="text-[12px] text-danger">{errors.impactTypes}</p>
              ) : (
                <p className="text-[11px] text-text-hint">
                  Chọn được nhiều mặt cùng lúc nếu sự kiện ảnh hưởng rộng.
                </p>
              )}
            </div>

            {/* ------------------ Hai tuỳ chọn ------------------ */}
            <div className="flex flex-col gap-3 rounded-ctrl bg-surface-alt px-3 py-3">
              <div className="flex flex-col gap-1">
                <Checkbox
                  label="Sự việc mới suýt xảy ra, chưa gây hậu quả"
                  checked={isNearMiss}
                  onChange={(e) => setIsNearMiss(e.target.checked)}
                />
                <span className="pl-6 text-[11px] text-text-hint">
                  Vẫn nên báo cáo. Đây là cơ hội phòng ngừa với chi phí thấp
                  nhất, vì chưa mất mát gì.
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <Checkbox
                  label="Báo cáo ẩn danh"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                <span className="flex items-start gap-1 pl-6 text-[11px] leading-4 text-text-hint">
                  <IconEyeOff size={12} className="mt-0.5 shrink-0" />
                  Sự kiện sẽ được đánh dấu bảo mật. Chỉ Ban QTRR, Kiểm toán nội
                  bộ và người xử lý được chỉ định mới xem được nội dung và danh
                  tính người báo cáo.
                </span>
              </div>
            </div>
          </ContentCard>

          {/* ------------------ Ghi chú người báo cáo ------------- */}
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border-light px-3 py-2.5 text-[12px] text-text-secondary">
            {anonymous ? (
              <>
                <IconEyeOff size={16} className="text-lv-medium-text" />
                <span className="min-w-0 flex-1">
                  Báo cáo được gửi ở chế độ <b>ẩn danh</b>. Hệ thống vẫn lưu
                  danh tính để phục vụ truy vết nội bộ, nhưng giới hạn phạm vi
                  người xem.
                </span>
              </>
            ) : (
              <>
                <IconUser size={16} className="text-icon-neutral" />
                <span className="min-w-0 flex-1">
                  Người báo cáo:{" "}
                  <b className="text-text-primary">
                    {currentEmployee?.name ?? user.name}
                  </b>
                  {currentEmployee?.title ? ` - ${currentEmployee.title}` : ""}
                </span>
              </>
            )}
          </div>
        </div>
      </PageBody>

      {/* ===================== Thanh hành động ===================== */}
      <FooterActionBar
        left={
          <span className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <Badge tone="neutral" dot>
              Mức mặc định: Trung bình
            </Badge>
            {isNearMiss && <Badge tone="info">Near miss</Badge>}
            {anonymous && (
              <Badge tone="neutral" dot>
                Ẩn danh
              </Badge>
            )}
            <span className="inline-flex items-center gap-1">
              <IconShieldCheck size={14} />
              Ban QTRR sẽ đánh giá lại mức nghiêm trọng khi tiếp nhận
            </span>
          </span>
        }
      >
        <Button
          variant="text"
          onClick={() => (dirty ? setLeaving(true) : router.back())}
          disabled={saving}
        >
          Huỷ bỏ
        </Button>
        <Button
          variant="primary"
          icon={<IconSend size={16} />}
          loading={saving}
          onClick={submit}
        >
          Gửi báo cáo
        </Button>
      </FooterActionBar>

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          router.push("/su-kien/so-theo-doi");
        }}
        title="Rời khỏi trang"
        message="Nội dung báo cáo chưa được gửi. Rời khỏi trang bây giờ sẽ mất toàn bộ thông tin đã nhập. Tiếp tục?"
        confirmText="Rời đi"
        cancelText="Ở lại"
      />
    </PageContainer>
  );
}

/* ================================================================== */
/* Bước tiếp theo trong màn hình xác nhận                              */
/* ================================================================== */

function NextStep({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-[12px] font-semibold text-brand">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-text-primary">{title}</p>
        <p className="text-[12px] leading-4 text-text-secondary">
          {description}
        </p>
      </div>
    </li>
  );
}
