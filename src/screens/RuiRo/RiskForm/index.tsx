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
  IconShieldX,
  IconClipboardList,
  IconTool,
  IconLockCheck,
  IconShieldOff,
  IconFileText,
  IconPlayerPlay,
  IconTrash,
  IconClipboardCheck,
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
  TreeSelect,
} from "@/components/ui";
import {
  ContentCard,
  FooterActionBar,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import {
  controlRepo,
  deficiencyRepo,
  riskControlLinkRepo,
  riskRepo,
  useCollection,
} from "@/lib/db";

import { useLookups } from "@/lib/domain/lookups";
import { RISK_SOURCES, ControlRelevance } from "@/lib/domain/enums";
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
  riskStageOf,
} from "@/lib/domain/risk-lifecycle";
import { overallEffectivenessOf } from "@/lib/domain/control-utils";
import {
  shortSuggestionHint,
  suggestResidual,
} from "@/lib/domain/residual-suggestion";
import {
  isControlOperating,
  notOperatingReason,
  findLink,
  removeRiskControlLink,
  upsertRiskControlLink,
  useRiskControlLinks,
} from "@/lib/domain/risk-control-link";
import {
  buildAssessRows,
  summarizeAssessment,
} from "@/lib/domain/control-assessment";
import { toTreeSelectNodes, useCategoryTree } from "@/lib/domain/category-tree";
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

import { EMPTY_EXTRA, type ControlLite, type WizardExtra } from "./types";
import StepTitle from "./steps/StepTitle";
import InherentStep from "./steps/InherentStep";
import ResidualStep from "./steps/ResidualStep";
import TreatStep from "./steps/TreatStep";
import ControlAssessmentStep from "./steps/ControlAssessmentStep";
import type { AssessDrawerResult } from "./steps/ControlAssessDrawer";

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

/* ------------------------------------------------------------------ */
/* Hằng số                                                            */
/* ------------------------------------------------------------------ */

/** Sinh từ enum thay vì khai tay, để không bao giờ lệch giá trị */
const SOURCE_OPTIONS = RISK_SOURCES.map((v) => ({ value: v, label: v }));

interface SimpleRepo {
  create: (
    value: Record<string, unknown>,
    by?: string,
  ) => {
    id: string;
    code: string;
  };
  update: (id: string, patch: Record<string, unknown>) => void;
  remove: (id: string) => void;
  removeMany: (ids: string[]) => void;
}

const rRepo = riskRepo as unknown as SimpleRepo;
const cRepo = controlRepo as unknown as SimpleRepo;
const dRepo = deficiencyRepo as unknown as SimpleRepo;
const lRepo = riskControlLinkRepo as unknown as SimpleRepo;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
/** Cộng thêm số ngày, dùng để đặt hạn xử lý điểm yếu ưu tiên */
function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hạn xử lý theo mức ưu tiên người dùng chọn ở bước 5 */
const WEAKNESS_DUE_DAYS = 7;

/**
 * Mức ưu tiên chỉ đổi HẠN XỬ LÝ, không đổi severity.
 *
 * Lý do: deficiencyFormSchema bắt buộc rootCause khi severity từ Cao trở
 * lên. Bước 5 là khai sơ bộ ngay lúc nhận diện rủi ro, người dùng chưa
 * phân tích nguyên nhân gốc được. Nâng mức nghiêm trọng là việc của Ban
 * QTRR ở hồ sơ điểm yếu, khi đó họ mới phải điền nguyên nhân gốc.
 */
const WEAKNESS_PRIORITY_OPTIONS = [
  {
    value: "Theo dõi sau",
    label: "Theo dõi sau",
    description: "Ghi nhận để rà soát trong kỳ tới, chưa đặt hạn xử lý",
  },
  {
    value: "Phân tích ngay",
    label: "Phân tích ngay",
    description: `Đặt hạn phân tích nguyên nhân gốc trong ${WEAKNESS_DUE_DAYS} ngày`,
  },
];

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
   * Bản ghi rủi ro tạo ở bước 2 khi đang THÊM MỚI.
   *
   * Từ lô E2c, wizard không còn giữ toàn bộ dữ liệu trong trình duyệt
   * rồi ghi một lần ở bước 8. Lý do: các bước 4, 5 và 7 phải tạo bản ghi
   * ở phân hệ khác gồm liên kết kiểm soát, điểm yếu và KPPN, mà cả ba
   * đều cần riskId thật. Không có id thì phải dựng một lớp mô phỏng bản
   * ghi chưa lưu, và đó là chỗ sinh lỗi lệch rất khó tìm.
   */
  const [draftId, setDraftId] = useState("");
  const [draftCode, setDraftCode] = useState("");

  /** Đang mở hộp xác nhận huỷ hồ sơ nháp */
  const [discarding, setDiscarding] = useState(false);

  /**
   * Chữ ký của lần pre-fill gần nhất.
   *
   * Gồm điểm vốn có cộng danh sách kiểm soát đã chọn. Khi chữ ký đổi
   * nghĩa là căn cứ tính gợi ý đã khác, nên tính lại. Khi chữ ký không
   * đổi thì KHÔNG ghi đè, để người dùng sửa điểm xong không bị hệ thống
   * đặt lại ngay lúc render sau.
   */
  const [prefillKey, setPrefillKey] = useState("");
  /**
   * Lỗi của bước 5, giữ riêng vì nghi ngờ điểm yếu KHÔNG thuộc
   * riskFormSchema. Đây là dữ liệu sinh ra bản ghi Deficiency riêng.
   */
  const [weaknessError, setWeaknessError] = useState("");

  /* --------------------------- Nạp dữ liệu ---------------------------- */

  const recordKey = editing?.id ?? "new";
  if (recordKey !== loadedKey) {
    setLoadedKey(recordKey);
    setErrors({});
    setStage("context");
    /* Form sửa: KHÔNG pre-fill, vì điểm hiện tại là kết luận đã có của
       người đánh giá trước. Gợi ý chỉ hiện kèm nút Áp dụng. */
    setPrefillKey(editing ? "locked" : "");
    setDraftId("");
    setDraftCode("");

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
    setExtra((prev) => ({
      ...prev,
      controlIds: draft.controlIds ?? [],
      weakness: draft.weakness ?? prev.weakness,
    }));
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

  /* ------------------- Tạo và ghi bản ghi rủi ro ---------------------- */

  /**
   * Bảo đảm đã có bản ghi rủi ro thật, rồi ghi nội dung form hiện tại.
   *
   * Gọi khi rời bước 2 và ở mỗi lần chuyển bước sau đó. Trả về riskId để
   * nơi gọi dùng ngay, không phải chờ setState.
   *
   * Bản ghi tạo ra mang CỜ isWizardDraft, phân biệt với hồ sơ đã khai
   * xong. Cả hai cùng ở trạng thái Nháp vì việc trình duyệt là thao tác
   * riêng thực hiện ở hồ sơ, không thuộc wizard.
   */
  function ensureRiskRecord(): string {
    /* Sửa hồ sơ cũ: bản ghi đã có, không đụng gì thêm ở đây. Việc ghi
       nội dung do submit đảm nhiệm, tránh sửa hồ sơ đã duyệt giữa chừng */
    if (editing) return editing.id;

    const payload: Record<string, unknown> = {
      ...form,
      status: "Nháp",
      isWizardDraft: true,
    };

    if (draftId) {
      rRepo.update(draftId, payload);
      return draftId;
    }

    const row = rRepo.create(
      { ...payload, controlsChangedAt: today() },
      user.name,
    );

    setDraftId(row.id);
    setDraftCode(row.code);

    /* Bản ghi thật đã ra đời, nháp trong trình duyệt hết vai trò. Giữ cả
       hai sẽ thành hai nguồn sự thật song song */
    clearDraft();

    toast.success(
      `Đã tạo hồ sơ ${row.code}`,
      "Rủi ro được lưu ở trạng thái Nháp, nội dung các bước sau sẽ ghi trực tiếp vào hồ sơ này. Anh đóng trình duyệt rồi quay lại vẫn khai tiếp được.",
    );

    return row.id;
  }
  /* ------------------ Ghi kết luận mức phù hợp ---------------------- */

  /**
   * Ghi kết luận kiểm soát có xử lý đúng rủi ro này không.
   *
   * Bảo đảm có bản ghi rủi ro TRƯỚC khi ghi liên kết, vì riskControlLink
   * bắt buộc có riskId. Nếu người dùng bằng cách nào đó tới được bước 4
   * mà chưa qua bước 2, hàm này tự tạo hồ sơ nháp thay vì im lặng bỏ
   * qua thao tác vừa rồi.
   *
   * Dùng rid trả về từ ensureRiskRecord chứ KHÔNG dùng biến riskId, vì
   * setState chưa kịp áp dụng trong cùng một lượt render.
   */
  function handleAssess(
    controlId: string,
    relevance: ControlRelevance,
    note: string,
  ) {
    const rid = ensureRiskRecord();

    if (!rid) {
      toast.error(
        "Chưa ghi được kết luận",
        "Hồ sơ rủi ro chưa được tạo. Anh quay lại bước 2 và điền đủ thông tin nhận diện.",
      );
      return;
    }

    const existing = findLink(linkApi.index, rid, controlId);

    upsertRiskControlLink(lRepo, existing, {
      riskId: rid,
      controlId,
      relevance,
      relevanceNote: note,
      assessedBy: user.name,
    });

    /* Không phù hợp là kết luận có hệ quả, cần nói rõ để người dùng biết
       kiểm soát đó vừa bị loại khỏi phép tính ở bước 6 */
    if (relevance === "Không phù hợp") {
      const c = controls.find((x) => x.id === controlId);
      toast.warning(
        `Đã ghi kết luận cho ${c?.code ?? "kiểm soát"}`,
        "Kiểm soát này không còn được tính là đang bảo vệ rủi ro. Anh nên gỡ nó khỏi hồ sơ, hoặc tìm kiểm soát khác thay thế.",
      );
    }
  }

  /* --------------- Kết quả micro-flow đánh giá sâu ------------------ */

  /**
   * Nhận kết quả trọn vẹn của luồng 4 bước rồi ghi theo ĐÚNG THỨ TỰ.
   *
   *   1. Liên kết Risk-Control  : luôn có, đây là kết luận bắt buộc
   *   2. Đợt tự đánh giá nhanh  : tuỳ chọn, dựng ở nhịp E4b
   *   3. Điểm yếu phát hiện     : tuỳ chọn, dựng ở nhịp E4b
   *
   * Thứ tự không đảo được: đợt kiểm tra cần controlId, còn điểm yếu cần
   * cả riskId lẫn controlId. Ghi ngược lại thì bản ghi sau sẽ trỏ tới
   * một bản ghi chưa tồn tại.
   *
   * Ở E4a, bước 3 và 4 của ngăn kéo còn là chỗ chờ nên hai trường oe và
   * weakness luôn vắng. Hai nhánh dưới đây giữ sẵn để E4b điền vào, và
   * quan trọng hơn là bảo đảm nếu chúng có giá trị thì hệ thống KHÔNG
   * im lặng bỏ qua dữ liệu người dùng vừa nhập.
   */
  function handleDeepAssess(result: AssessDrawerResult) {
    /* 1. Kết luận mức phù hợp, dùng chung đường ghi với bảng */
    handleAssess(result.controlId, result.relevance, result.relevanceNote);

    /* 2 và 3. Chưa dựng ở nhịp này, báo rõ thay vì nuốt dữ liệu */
    if (result.oe || result.weakness) {
      toast.info?.(
        "Đã lưu mức phù hợp",
        "Phần tự đánh giá hiệu quả và ghi nhận điểm yếu sẽ được lưu ở nhịp tiếp theo.",
      );
    }
  }

  /* --------------- Thêm và gỡ kiểm soát khỏi rủi ro ----------------- */

  /**
   * Cập nhật tập kiểm soát gắn với rủi ro.
   *
   * Từ lô E3, thao tác này ghi NGAY vào dữ liệu thay vì gom lại tới lúc
   * submit. Lý do: bảng đánh giá hiển thị theo bản ghi liên kết, nếu chỉ
   * giữ trong state thì người dùng mở tab khác sẽ thấy hai bức tranh
   * khác nhau về cùng một rủi ro.
   *
   * Ba việc phải làm cùng lúc khi gỡ một kiểm soát:
   *   1. Bỏ khỏi extra.controlIds        (trạng thái giao diện)
   *   2. Gỡ riskId khỏi control.riskIds  (quan hệ hai chiều)
   *   3. Xoá bản ghi riskControlLink     (thuộc tính của quan hệ)
   *
   * Bỏ sót bước 3 thì kết luận cũ sẽ sống lại nếu người dùng gắn lại
   * kiểm soát đó, và họ sẽ thấy một kết luận mình không hề vừa ghi.
   */
  function handleControlIdsChange(nextIds: string[]) {
    const prevIds = extra.controlIds;
    patchExtra({ controlIds: nextIds });

    /* Chưa có bản ghi rủi ro thì chỉ giữ trong state, submit sẽ ghi sau.
       Trường hợp này chỉ xảy ra khi mở form sửa hồ sơ đã đóng */
    if (!riskId) return;

    const added = nextIds.filter((id) => !prevIds.includes(id));
    const removed = prevIds.filter((id) => !nextIds.includes(id));

    added.forEach((id) => {
      const c = controls.find((x) => x.id === id);
      if (!c) return;
      const list = c.riskIds ?? [];
      if (list.includes(riskId)) return;
      cRepo.update(c.id, { riskIds: [...list, riskId] });
    });

    removed.forEach((id) => {
      const c = controls.find((x) => x.id === id);
      if (c)
        cRepo.update(c.id, {
          riskIds: (c.riskIds ?? []).filter((x) => x !== riskId),
        });

      removeRiskControlLink(lRepo, findLink(linkApi.index, riskId, id));
    });

    /* Tập kiểm soát đổi thì điểm còn lại đã chấm trước đó có thể lạc
       hậu. Ghi mốc để hồ sơ hiện nhãn nhắc đánh giá lại */
    if (added.length > 0 || removed.length > 0)
      rRepo.update(riskId, { controlsChangedAt: today() });
  }

  /* --------------------- Huỷ hồ sơ đang khai dở ----------------------- */

  /**
   * Xoá hồ sơ nháp cùng mọi bản ghi sinh ra trong lúc khai báo.
   *
   * Thứ tự xoá đi từ phụ thuộc lên gốc, không đảo được:
   *   1. Gỡ riskId khỏi control.riskIds   (quan hệ hai chiều)
   *   2. Xoá bản ghi liên kết Risk-Control
   *   3. Xoá điểm yếu đã tạo
   *   4. Xoá bản ghi rủi ro
   *
   * Nếu xoá rủi ro trước thì ba loại còn lại thành mồ côi và không còn
   * cách nào tìm ra chúng, vì mọi truy vấn đều đi qua riskId.
   */
  function discardDraft() {
    if (!draftId) return;

    /* 1. Gỡ liên kết hai chiều ở phía kiểm soát */
    dependents.controls.forEach((c) => {
      cRepo.update(c.id, {
        riskIds: (c.riskIds ?? []).filter((x) => x !== draftId),
      });
    });

    /* 2 và 3. Xoá hàng loạt cho gọn, repository đã có removeMany */
    if (dependents.links.length > 0)
      lRepo.removeMany(dependents.links.map((l) => l.id));

    const defCodes = dependents.deficiencies.map((d) => d.code);
    if (dependents.deficiencies.length > 0)
      dRepo.removeMany(dependents.deficiencies.map((d) => d.id));

    /* 4. Cuối cùng mới tới bản ghi gốc */
    rRepo.remove(draftId);

    const removed = draftCode;
    setDiscarding(false);
    setDraftId("");
    setDraftCode("");
    clearDraft();

    toast.success(
      `Đã huỷ hồ sơ ${removed}`,
      defCodes.length > 0
        ? `Đồng thời xoá ${defCodes.length} điểm yếu đã tạo: ${defCodes.join(", ")}.`
        : "Hồ sơ và mọi liên kết đã được dọn sạch, không để lại dữ liệu rác.",
    );

    router.push("/rui-ro/so-dang-ky");
  }

  /* ------------------- Khai tiếp hồ sơ đang dở ------------------------ */

  /**
   * Hồ sơ nháp còn dang dở trong hệ thống.
   *
   * Mở màn thêm mới khi đang có hồ sơ dở mà lặng lẽ tạo bản ghi thứ hai
   * là cách nhanh nhất để sinh dữ liệu rác: người dùng đóng tab hôm qua,
   * hôm nay vào khai lại từ đầu, và cuối tuần sổ có năm hồ sơ trùng nội
   * dung mà không ai biết cái nào là thật.
   */
  const resumeCandidates = useMemo(
    () => (isEdit || draftId ? [] : risks.filter((r) => r.isWizardDraft)),
    [risks, isEdit, draftId],
  );

  function resumeDraft(r: (typeof risks)[number]) {
    const linked = controls.filter((c) => (c.riskIds ?? []).includes(r.id));

    setDraftId(r.id);
    setDraftCode(r.code);
    setForm(riskToForm(r as never));
    setExtra({
      ...EMPTY_EXTRA,
      controlIds: linked.map((c) => c.id),
      /* Hồ sơ đã có điểm nên coi như người dùng từng xác nhận bảng chấm */
      touched: [
        "inherentLikelihood",
        "inherentImpact",
        "residualLikelihood",
        "residualImpact",
      ],
    });

    /* Khoá pre-fill: điểm còn lại hiện có là kết luận đã ghi, không được
       ghi đè bằng gợi ý mới khi người dùng vào lại bước 6 */
    setPrefillKey("locked");
    setErrors({});

    const st = riskStageOf(r as never, linked.length);
    setStage(st === "closed" ? "review" : st);

    toast.info?.(
      `Đang khai tiếp ${r.code}`,
      "Hệ thống đã đưa anh về đúng bước còn dang dở của hồ sơ này.",
    );
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
  const deficiencies = useCollection(deficiencyRepo) as unknown as {
    id: string;
    code: string;
    name?: string;
    severity?: string;
    status?: string;
    dueDate?: string;
    riskId?: string;
  }[];

  /** Điểm yếu đã gắn với rủi ro này, chỉ có ở form sửa */
  const linkedDeficiencies = useMemo(
    () => (editing ? deficiencies.filter((d) => d.riskId === editing.id) : []),
    [deficiencies, editing],
  );

  /* ------------------ Cây danh mục và chính sách nhánh ---------------- */

  const catTree = useCategoryTree("Rủi ro");

  const categoryNodes = useMemo(
    () => toTreeSelectNodes(catTree.tree),
    [catTree.tree],
  );

  /** Tên nhánh đang áp chính sách không khoan nhượng, undefined nếu không có */
  const zeroToleranceBranch = catTree.zeroToleranceBranchName(form.categoryId);
  const derivedZeroTolerance = !!zeroToleranceBranch;

  /**
   * Đồng bộ cờ không khoan nhượng theo nhóm rủi ro đã chọn.
   *
   * Cờ này KHÔNG còn do người khai báo tự bật. Nó là chính sách của tổ
   * chức đặt ở nhánh danh mục, nên mọi rủi ro thuộc nhánh đó đều tuân
   * theo. Hai người khai cùng một loại rủi ro sẽ ra cùng một kết luận.
   *
   * Hai chốt an toàn:
   *
   *   1. Bỏ qua khi cây danh mục rỗng. Ở lần render đầu, useCollection có
   *      thể chưa nạp xong dữ liệu, nếu chạy thì sẽ vô tình xoá cờ của
   *      một rủi ro cũ đang bật đúng.
   *
   *   2. Bỏ qua khi CHƯA có nhánh nào được đánh dấu trong hệ thống. Nhờ
   *      vậy trước khi Ban QTRR cấu hình danh mục, mọi rủi ro mẫu đang
   *      bật cờ bằng tay vẫn giữ nguyên, không bị xoá hàng loạt.
   */
  useEffect(() => {
    if (catTree.tree.length === 0) return;
    if (!catTree.hasAnyZeroToleranceBranch) return;
    if (form.isZeroTolerance === derivedZeroTolerance) return;

    /* Chuyển sang không khoan nhượng mà đang chọn Chấp nhận thì phải đổi
       phương án, nếu không schema sẽ chặn lúc lưu ở một bước rất xa */
    const mustResetTreatment =
      derivedZeroTolerance && form.treatment === "Chấp nhận";

    patch({
      isZeroTolerance: derivedZeroTolerance,
      ...(mustResetTreatment
        ? { treatment: "Giảm thiểu" as typeof form.treatment }
        : {}),
    });

    if (mustResetTreatment)
      toast.warning(
        "Đã đổi phương án xử lý",
        "Nhóm rủi ro vừa chọn thuộc nhánh không khoan nhượng, nên phương án Chấp nhận không dùng được. Hệ thống tạm đặt Giảm thiểu, anh chỉnh lại ở bước 7 nếu cần.",
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    derivedZeroTolerance,
    form.isZeroTolerance,
    form.treatment,
    catTree.tree.length,
    catTree.hasAnyZeroToleranceBranch,
  ]);

  const pickedControls = useMemo(
    () => controls.filter((c) => extra.controlIds.includes(c.id)),
    [controls, extra.controlIds],
  );

  const activePicked = useMemo(
    () => pickedControls.filter((c) => isControlOperating(c.status)),
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
  /* -------------- Tiến độ đánh giá kiểm soát ở bước 4 --------------- */

  /**
   * Dòng bảng đánh giá, tính ở đây thay vì trong component con.
   *
   * Lý do: cổng chặn bước 4 và cảnh báo trên dải vòng đời đều cần các
   * con số này. Nếu để component con tự tính rồi báo ngược lên, sẽ có
   * hai bản logic song song và chúng sẽ lệch nhau vào một ngày nào đó.
   */

  /**
   * Bước 4 đã xong chưa.
   *
   * ĐIỀU KIỆN CHẶT HƠN TRƯỚC. Bản cũ chỉ cần có kiểm soát đang vận hành
   * là qua. Giờ phải kết luận xong mức phù hợp của MỌI kiểm soát đã
   * gắn, vì gợi ý điểm còn lại ở bước 6 tính trên tập đã kết luận. Còn
   * kiểm soát chưa đánh giá thì con số gợi ý dựa trên căn cứ thiếu.
   */
  /* -------------- Tiến độ đánh giá kiểm soát ở bước 4 --------------- */

  /**
   * Dòng bảng đánh giá, tính ở đây thay vì trong component con.
   *
   * Lý do: cổng chặn bước 4 và cảnh báo trên dải vòng đời đều cần các
   * con số này. Nếu để component con tự tính rồi báo ngược lên, sẽ có
   * hai bản logic song song và chúng sẽ lệch nhau vào một ngày nào đó.
   */

  /* ------------------- Bản ghi rủi ro đang thao tác ------------------- */

  /**
   * Id và mã của bản ghi đang thao tác, dù là sửa hồ sơ cũ hay hồ sơ vừa
   * tạo ở bước 2. Mọi chỗ cần riskId đều đọc qua đây, không đọc thẳng
   * editing?.id, để hai luồng sửa và thêm mới đi cùng một đường.
   */
  const riskId = editing?.id ?? draftId;
  const riskCode = editing?.code ?? draftCode;
  const hasRecord = !!riskId;

  /* ------------------ Bản ghi phụ thuộc vào rủi ro này ---------------- */

  /**
   * Liên kết Risk và Control của riêng rủi ro đang thao tác.
   *
   * Hook tự lọc theo riskId và dựng sẵn bảng tra, nên bảng đánh giá ở
   * bước 4 không phải quét lại toàn bộ bộ sưu tập mỗi lần render.
   *
   * Truyền riskId rỗng vẫn an toàn: hook trả về tập rỗng, không cần
   * nhánh điều kiện ở nơi gọi.
   */
  const linkApi = useRiskControlLinks(riskId);

  const allDeficiencies = useCollection(deficiencyRepo) as unknown as {
    id: string;
    code: string;
    riskId?: string;
  }[];

  /**
   * Mọi bản ghi sinh ra trong lúc khai báo, cần dọn khi huỷ hồ sơ nháp.
   *
   * Xoá rủi ro mà để lại điểm yếu mồ côi sẽ làm sổ điểm yếu hiện một
   * dòng trỏ tới riskId không tồn tại, và màn chi tiết crash khi tra tên
   * rủi ro. Đây đúng loại lỗi chỉ lộ ra ở màn hình khác, rất khó truy.
   */
  const dependents = useMemo(() => {
    if (!riskId)
      return { links: [], deficiencies: [], controls: [] as ControlLite[] };

    return {
      links: linkApi.links,
      deficiencies: allDeficiencies.filter((d) => d.riskId === riskId),
      controls: controls.filter((c) => (c.riskIds ?? []).includes(riskId)),
    };
  }, [riskId, linkApi.links, allDeficiencies, controls]);

  const assessRows = useMemo(
    () => buildAssessRows(controls, extra.controlIds, riskId, linkApi.index),
    [controls, extra.controlIds, riskId, linkApi.index],
  );

  const assessSummary = useMemo(
    () => summarizeAssessment(assessRows),
    [assessRows],
  );

  /** Số kiểm soát đã kết luận mức phù hợp, truyền xuống tầng domain */
  const assessedCount = assessSummary.assessed;

  /**
   * Bước 4 đã xong chưa.
   *
   * ĐIỀU KIỆN CHẶT HƠN TRƯỚC. Bản cũ chỉ cần có kiểm soát đang vận hành
   * là qua. Giờ phải kết luận xong mức phù hợp của MỌI kiểm soát đã
   * gắn, vì gợi ý điểm còn lại ở bước 6 tính trên tập đã kết luận. Còn
   * kiểm soát chưa đánh giá thì con số gợi ý dựa trên căn cứ thiếu.
   */
  const controlStageDone =
    (assessSummary.total > 0 && assessSummary.pending === 0) ||
    !!form.noControlAccepted;

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
    /* Cổng chặn riêng của bước 5. Bước này tuỳ chọn nên chỉ chặn khi
       người dùng ĐÃ BẬT ghi nhận mà bỏ trống tên điểm yếu. */
    if (stage === "weakness") {
      if (extra.weakness.has && !extra.weakness.name.trim()) {
        setWeaknessError(
          "Bắt buộc nhập tên điểm yếu, hoặc tắt ghi nhận nếu chưa có nghi ngờ nào",
        );
        scrollToField("weaknessName");
        toast.error(
          "Chưa chuyển bước được",
          "Anh đã bật ghi nhận nghi ngờ điểm yếu nhưng chưa nhập tên.",
        );
        return;
      }
      setWeaknessError("");
    }

    /* Cổng chặn riêng của bước 4, không thuộc schema */
    /* ---------------- Cổng chặn riêng của bước 4 ----------------
       Không thuộc riskFormSchema vì đây là điều kiện về QUAN HỆ giữa
       rủi ro và kiểm soát, không phải điều kiện về trường của rủi ro.

       Ba nhánh, mỗi nhánh dẫn tới một việc phải làm khác hẳn nhau, nên
       thông báo cũng phải khác nhau chứ không gộp thành một câu chung */
    if (stage === "controls" && !controlStageDone) {
      /* Nhánh 1: chưa gắn kiểm soát nào */
      if (assessSummary.total === 0) {
        toast.error(
          "Chưa chuyển bước được",
          requiresControl
            ? "Rủi ro vốn có mức Cao trở lên bắt buộc phải có kiểm soát. Anh tìm kiểm soát ở phần Thêm kiểm soát từ thư viện."
            : "Anh gắn ít nhất 1 kiểm soát, hoặc tích ô chấp nhận rủi ro nếu không áp dụng kiểm soát nào.",
        );
        return;
      }

      /* Nhánh 2: đã gắn nhưng chưa kết luận xong mức phù hợp */
      if (assessSummary.pending > 0) {
        toast.error(
          `Còn ${assessSummary.pending} kiểm soát chưa đánh giá`,
          "Với mỗi kiểm soát đã gắn, anh chọn mức phù hợp ở cột cuối bảng. Gợi ý điểm còn lại ở bước 6 tính trên tập kiểm soát đã kết luận, nên chưa đánh giá xong thì con số gợi ý sẽ dựa trên căn cứ thiếu.",
        );
        return;
      }

      /* Nhánh 3: đã đánh giá đủ nhưng không kiểm soát nào đang bảo vệ */
      toast.error(
        "Chưa chuyển bước được",
        "Không có kiểm soát nào thực sự đang bảo vệ rủi ro này. Kiểm soát phải đang vận hành, đã có kết luận hiệu lực, và được kết luận phù hợp với rủi ro.",
      );
      return;
    }

    setErrors({});

    /* Rời bước 2 là tạo bản ghi thật. Từ đó trở đi mỗi lần chuyển bước
       đều ghi lại, nên đóng tab giữa chừng cũng không mất nội dung */
    if (stage === "identify" || hasRecord) ensureRiskRecord();

    const nextStage = WIZARD_STAGES[Math.min(stageIndex + 1, totalStages - 1)];
    goto(nextStage.key);
  }

  function back() {
    setErrors({});

    /* Ghi cả khi lùi bước: người dùng thường quay lại sửa rồi đi tiếp,
       nếu chỉ ghi lúc tiến thì thao tác sửa ở bước cũ có thể mất */
    if (hasRecord) ensureRiskRecord();

    const prev = WIZARD_STAGES[Math.max(stageIndex - 1, 0)];
    setStage(prev.key);
  }

  /* ----------------------------- Nháp -------------------------------- */
  function saveDraft() {
    /* Đã có bản ghi thật thì lưu nháp nghĩa là ghi vào hồ sơ đó, không
       ghi thêm vào trình duyệt nữa */
    if (hasRecord) {
      ensureRiskRecord();
      toast.success(
        `Đã lưu vào hồ sơ ${riskCode}`,
        "Nội dung nằm trong sổ đăng ký ở trạng thái Nháp, mở lại lúc nào cũng khai tiếp được.",
      );
      return;
    }

    const ok = writeDraft({
      form,
      controlIds: extra.controlIds,
      weakness: extra.weakness,
      stage,
    });

    if (ok)
      toast.success(
        "Đã lưu nháp trong trình duyệt",
        "Từ bước 3 trở đi, hệ thống sẽ lưu thẳng vào hồ sơ rủi ro thay vì lưu tạm như thế này.",
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
    /* Từ lô E3, tập kiểm soát đã được ghi ngay ở bước 4 khi rủi ro có
       bản ghi thật. Hàm này chỉ còn vai trò dự phòng cho nhánh submit
       không đi qua bước 4, ví dụ hồ sơ nhân bản hoặc nhập từ ngoài */
    if (riskId === draftId && draftId) return false;

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

  /**
   * Tạo bản ghi điểm yếu từ khai báo ở bước 5.
   *
   * KHAI ĐỦ 16 TRƯỜNG của deficiencySchema, không trông vào .default().
   * Lý do: createRepository chỉ spread input rồi gán id, code và mốc thời
   * gian, KHÔNG parse qua zod. Nên mọi .default() trong schema đều vô
   * hiệu lúc tạo, và trường thiếu sẽ là undefined rồi gây crash ở màn
   * hình đọc, đúng như lỗi tags.length trước đây.
   *
   * Trả về mã điểm yếu để toast nói rõ người dùng đi tìm ở đâu.
   */
  function createWeakness(
    riskId: string,
    riskCode: string,
  ): string | undefined {
    const w = extra.weakness;
    if (!w.has || !w.name.trim()) return undefined;

    const row = dRepo.create(
      {
        name: w.name.trim(),
        description: w.description.trim(),

        /* Dùng lại giá trị enum có sẵn, mã rủi ro đi vào sourceRef nên
           vẫn truy vết được nguồn gốc mà không phải thêm enum mới */
        sourceType: "Tự phát hiện",
        sourceRef: riskCode,

        controlId: "",
        riskId,
        eventId: "",

        /* Ép Trung bình: schema bắt buộc rootCause khi từ Cao trở lên,
           mà khai sơ bộ thì chưa phân tích nguyên nhân gốc được */
        severity: "Trung bình",

        unitId: form.unitId,
        ownerId: form.ownerId,
        detectedDate: today(),
        dueDate:
          w.priority === "Phân tích ngay" ? addDays(WEAKNESS_DUE_DAYS) : "",
        rootCause: "",
        status: "Mới ghi nhận",
        statusNote: `Ghi nhận sơ bộ khi khai báo rủi ro ${riskCode}, mức ưu tiên ${w.priority}`,
        kppnIds: [],
      },
      user.name,
    );

    return row.code;
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
        const wCode = createWeakness(editing.id, editing.code);

        toast.success(
          `Đã lưu ${editing.code}`,
          wCode
            ? `Hồ sơ đã cập nhật, đồng thời tạo điểm yếu ${wCode}.`
            : "Hồ sơ rủi ro đã được cập nhật.",
        );
        router.push(`/rui-ro/so-dang-ky/${editing.code}`);
        return;
      }

      /* ---------- Đã có bản ghi tạo từ bước 2: ghi tiếp và gỡ cờ ---------- */
      if (draftId) {
        const linkChanged = applyControlLinks(draftId, extra.controlIds);

        rRepo.update(draftId, {
          ...payload,
          /* Gỡ cờ khai dở: hồ sơ đã hoàn tất, không còn là bản ghi tạm */
          isWizardDraft: false,
          controlsChangedAt: linkChanged ? today() : undefined,
        });

        const wCode = createWeakness(draftId, draftCode);
        clearDraft();

        toast.success(
          `Đã ghi nhận ${draftCode}`,
          wCode
            ? `Hồ sơ đã hoàn tất. Đồng thời tạo điểm yếu ${wCode} ở Sổ điểm yếu, trạng thái Mới ghi nhận.`
            : "Hồ sơ đã hoàn tất và xuất hiện trong sổ đăng ký.",
        );

        router.push(`/rui-ro/so-dang-ky/${draftCode}`);
        return;
      }

      /* ---------- Dự phòng: chưa có bản ghi nào, tạo mới trọn vẹn ----------
         Nhánh này chỉ chạy khi người dùng bằng cách nào đó tới được bước 8
         mà chưa qua bước 2, giữ lại để không bao giờ mất dữ liệu vừa nhập */
      const row = rRepo.create(
        { ...payload, isWizardDraft: false, controlsChangedAt: today() },
        user.name,
      );
      applyControlLinks(row.id, extra.controlIds);

      const weaknessCode = createWeakness(row.id, row.code);
      clearDraft();

      toast.success(
        `Đã ghi nhận ${row.code}`,
        weaknessCode
          ? `Rủi ro đã vào sổ đăng ký. Đồng thời tạo điểm yếu ${weaknessCode} ở Sổ điểm yếu.`
          : "Rủi ro mới xuất hiện ngay trong sổ đăng ký.",
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
        title={
          isEdit
            ? `Sửa rủi ro ${editing?.code}`
            : draftCode
              ? `Ghi nhận rủi ro ${draftCode}`
              : "Ghi nhận rủi ro"
        }
        subtitle="Khai báo theo 8 bước, điểm rủi ro còn lại chỉ chấm sau khi đã gắn kiểm soát"
        badge={
          <span className="flex flex-wrap items-center gap-2">
            {!isEdit && draftCode && (
              <Badge tone="neutral" dot>
                <IconFileText size={12} className="mr-1 inline" />
                Nháp {draftCode}
              </Badge>
            )}
            <Badge tone="neutral" dot>
              Vốn có {inherentScore} điểm · {inherentLevelOf(form)}
            </Badge>
          </span>
        }
      />

      <PageBody className="pb-2">
        <div className="mx-auto flex max-w-[1060px] flex-col gap-4">
          {/* ---------- Hồ sơ đang khai dở, mời khai tiếp ---------- */}
          {resumeCandidates.length > 0 && stage === "context" && (
            <ContentCard className="flex flex-col gap-2.5 border-lv-medium-border bg-lv-medium-bg/30">
              <span className="flex items-center gap-2">
                <IconFileText
                  size={16}
                  className="shrink-0 text-lv-medium-text"
                />
                <span className="text-[13px] font-semibold text-text-primary">
                  Có {resumeCandidates.length} hồ sơ đang khai dở
                </span>
              </span>

              <span className="text-[12px] leading-4 text-text-secondary">
                Những hồ sơ này đã được tạo trong sổ đăng ký nhưng chưa hoàn tất
                khai báo. Khai tiếp để tránh tạo hồ sơ trùng nội dung.
              </span>

              <ul className="flex flex-col gap-1.5">
                {resumeCandidates.slice(0, 3).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-ctrl border border-border-light bg-white px-2.5 py-2"
                  >
                    <span className="text-[12px] font-medium text-brand">
                      {r.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                      {r.name || "Chưa đặt tên"}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IconPlayerPlay size={14} />}
                      onClick={() => resumeDraft(r)}
                    >
                      Khai tiếp
                    </Button>
                  </li>
                ))}
              </ul>

              <span className="text-[11px] leading-4 text-text-hint">
                Hoặc cứ điền vào bên dưới để tạo một hồ sơ mới hoàn toàn.
              </span>
            </ContentCard>
          )}

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
                  <TreeSelect
                    label="Nhóm rủi ro"
                    required
                    placeholder="Chọn theo cây danh mục"
                    options={categoryNodes}
                    value={form.categoryId || null}
                    error={errors.categoryId}
                    hint={
                      errors.categoryId
                        ? undefined
                        : "Nhóm rủi ro quyết định chính sách không khoan nhượng"
                    }
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

              {/* ---------- Không khoan nhượng: suy từ nhánh danh mục ---------- */}
              <div
                data-field="isZeroTolerance"
                className={cn(
                  "flex gap-2 rounded-card border p-3",
                  form.isZeroTolerance
                    ? "border-lv-critical-border bg-lv-critical-bg"
                    : "border-border-light bg-surface-alt",
                )}
              >
                {form.isZeroTolerance ? (
                  <IconLockCheck
                    size={17}
                    className="mt-px shrink-0 text-lv-critical-text"
                  />
                ) : (
                  <IconShieldOff
                    size={17}
                    className="mt-px shrink-0 text-icon-neutral"
                  />
                )}

                <div className="flex min-w-0 flex-col gap-1">
                  <span
                    className={cn(
                      "text-[13px] font-semibold",
                      form.isZeroTolerance
                        ? "text-lv-critical-text"
                        : "text-text-primary",
                    )}
                  >
                    {form.isZeroTolerance
                      ? "Rủi ro không khoan nhượng"
                      : "Không thuộc nhóm không khoan nhượng"}
                  </span>

                  <span
                    className={cn(
                      "text-[12px] leading-4",
                      form.isZeroTolerance
                        ? "text-lv-critical-text"
                        : "text-text-secondary",
                    )}
                  >
                    {form.isZeroTolerance ? (
                      zeroToleranceBranch ? (
                        <>
                          Chính sách này áp từ nhánh danh mục{" "}
                          <b>{zeroToleranceBranch}</b>, do Ban QTRR đặt ở màn
                          Quản trị danh mục. Ở bước 7, phương án{" "}
                          <b>Chấp nhận</b> sẽ không chọn được.
                        </>
                      ) : (
                        <>
                          Cờ này được bật từ trước ở hồ sơ. Sau khi Ban QTRR
                          đánh dấu nhánh danh mục, cờ sẽ tự đồng bộ theo nhóm
                          rủi ro.
                        </>
                      )
                    ) : (
                      <>
                        Cờ này <b>suy tự động</b> từ nhánh danh mục của nhóm rủi
                        ro, không nhập tay. Chọn một nhóm thuộc nhánh không
                        khoan nhượng thì cờ tự bật.
                      </>
                    )}
                  </span>
                </div>
              </div>
            </ContentCard>
          )}

          {/* ============ Bước 3 tới 8: chờ nhịp sau ============ */}
          {/* ============== Bước 3: Đánh giá vốn có ============== */}
          {/* ============== Bước 3: Đánh giá vốn có ============== */}
          {stage === "inherent" && (
            <InherentStep
              form={form}
              errors={errors}
              touched={extra.touched}
              patch={patch}
              markTouched={markTouched}
              expandedByDefault={!isEdit}
            />
          )}

          {/* ======= Bước 4: Đánh giá kiểm soát hiện hữu ======= */}
          {stage === "controls" && (
            <ControlAssessmentStep
              riskId={riskId}
              riskCode={riskCode}
              riskName={form.name}
              controls={controls}
              value={extra.controlIds}
              linkIndex={linkApi.index}
              noControlAccepted={!!form.noControlAccepted}
              requiresControl={requiresControl}
              unitName={(id) => lk.unitName(id)}
              onChange={handleControlIdsChange}
              onToggleAccept={(v) => patch({ noControlAccepted: v })}
              onAssess={handleAssess}
              onDeepAssess={handleDeepAssess}
            />
          )}

          {/* ---- Gợi ý từ kết luận vừa ghi ở bước 4 ---- */}
          {assessSummary.mismatched + assessSummary.failedKeyControls > 0 && (
            <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
              <IconClipboardCheck size={16} className="mt-px shrink-0" />
              <span>
                Ở bước 4 anh vừa ghi nhận{" "}
                {assessSummary.mismatched > 0 && (
                  <>
                    <b>{assessSummary.mismatched} kiểm soát không phù hợp</b>
                    {assessSummary.failedKeyControls > 0 && " và "}
                  </>
                )}
                {assessSummary.failedKeyControls > 0 && (
                  <>
                    <b>
                      {assessSummary.failedKeyControls} kiểm soát trọng yếu đang
                      Không hiệu quả
                    </b>
                  </>
                )}
                . Đây thường là dấu hiệu của một khe hở thật, nên cân nhắc ghi
                nhận điểm yếu ngay tại đây thay vì để lần rà soát sau.
              </span>
            </div>
          )}

          {/* ============== Bước 5: Nghi ngờ điểm yếu ============== */}
          {stage === "weakness" && (
            <ContentCard className="flex flex-col gap-4">
              <StepTitle
                index={5}
                title="Nghi ngờ điểm yếu"
                note="Bước tuỳ chọn. Ghi nhận sơ bộ khe hở phát hiện được khi vừa rà qua danh sách kiểm soát ở bước 4"
              />

              <div className="flex gap-2 rounded-ctrl border border-lv-info-border bg-lv-info-bg p-2.5 text-[12px] leading-4 text-lv-info-text">
                <IconInfoCircle size={16} className="mt-px shrink-0" />
                <span>
                  Đây là <b>ghi nhận sơ bộ</b>, không phải kết luận. Hệ thống sẽ
                  tạo một bản ghi điểm yếu ở mức <b>Trung bình</b>, trạng thái{" "}
                  <b>Mới ghi nhận</b>, gắn sẵn với rủi ro này. Việc phân tích
                  nguyên nhân gốc và nâng mức nghiêm trọng do Ban QTRR làm sau ở
                  hồ sơ điểm yếu.
                </span>
              </div>

              {/* ---- Điểm yếu đã gắn, chỉ hiện ở form sửa ---- */}
              {isEdit && linkedDeficiencies.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                    <IconClipboardList size={14} className="text-brand" />
                    Điểm yếu đã gắn với rủi ro này ({linkedDeficiencies.length})
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {linkedDeficiencies.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center gap-2 rounded-ctrl border border-border-light px-2.5 py-2"
                      >
                        <span className="text-[12px] font-medium text-brand">
                          {d.code}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                          {d.name}
                        </span>
                        {d.severity && (
                          <Badge tone="neutral" size="sm">
                            {d.severity}
                          </Badge>
                        )}
                        {d.status && (
                          <Badge tone="brand" size="sm">
                            {d.status}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] leading-4 text-text-hint">
                    Các điểm yếu này không bị sửa ở đây. Khai bên dưới sẽ tạo
                    thêm một bản ghi mới.
                  </p>
                </section>
              )}

              {/* ---- Bật hoặc tắt ghi nhận ---- */}
              <div className="flex flex-col gap-1 rounded-ctrl bg-surface-alt px-3 py-2.5">
                <Checkbox
                  label="Có nghi ngờ điểm yếu trong tập kiểm soát hiện tại"
                  checked={extra.weakness.has}
                  onChange={(e) => {
                    setWeaknessError("");
                    patchExtra({
                      weakness: { ...extra.weakness, has: e.target.checked },
                    });
                  }}
                />
                <span className="pl-6 text-[11px] leading-4 text-text-hint">
                  Không bật thì bấm <b>Bỏ qua và tiếp tục</b> để sang bước 6.
                  Không có gì được tạo thêm.
                </span>
              </div>

              {/* ---- Mini-form ---- */}
              {extra.weakness.has && (
                <div className="flex flex-col gap-4 rounded-card border border-lv-medium-border bg-lv-medium-bg/20 p-3">
                  <div className="flex items-center gap-2">
                    <IconTool size={16} className="text-lv-medium-text" />
                    <span className="text-[13px] font-semibold text-text-primary">
                      Thông tin điểm yếu sơ bộ
                    </span>
                  </div>

                  <div data-field="weaknessName">
                    <Input
                      label="Tên điểm yếu"
                      required
                      placeholder="Ví dụ: Chưa có kiểm soát nào phát hiện việc vượt hạn mức phê duyệt"
                      value={extra.weakness.name}
                      error={weaknessError}
                      onChange={(e) => {
                        setWeaknessError("");
                        patchExtra({
                          weakness: {
                            ...extra.weakness,
                            name: e.target.value,
                          },
                        });
                      }}
                    />
                  </div>

                  <Textarea
                    label="Mô tả khe hở"
                    rows={3}
                    maxLength={1000}
                    showCount
                    placeholder="Khe hở nằm ở đâu, vì sao tập kiểm soát hiện tại chưa đủ"
                    value={extra.weakness.description}
                    onChange={(e) =>
                      patchExtra({
                        weakness: {
                          ...extra.weakness,
                          description: e.target.value,
                        },
                      })
                    }
                  />

                  <Select
                    label="Mức ưu tiên xử lý"
                    options={WEAKNESS_PRIORITY_OPTIONS}
                    value={extra.weakness.priority}
                    hint="Mức ưu tiên chỉ đặt hạn xử lý, mức nghiêm trọng luôn là Trung bình khi khai sơ bộ"
                    onChange={(v) =>
                      patchExtra({
                        weakness: {
                          ...extra.weakness,
                          priority:
                            (v as typeof extra.weakness.priority) ??
                            "Theo dõi sau",
                        },
                      })
                    }
                  />

                  <div className="flex flex-col gap-1 rounded-ctrl bg-white/70 p-2.5 text-[11px] leading-4 text-text-secondary">
                    <span className="font-medium text-text-primary">
                      Bản ghi sẽ được tạo với thông tin sau
                    </span>
                    <span>
                      Nguồn phát hiện <b>Tự phát hiện</b> · mức nghiêm trọng{" "}
                      <b>Trung bình</b> · trạng thái <b>Mới ghi nhận</b>
                    </span>
                    <span>
                      Đơn vị <b>{lk.unitName(form.unitId, "chưa chọn")}</b> ·
                      người chịu trách nhiệm{" "}
                      <b>{lk.employeeName(form.ownerId, "chưa gán")}</b>
                    </span>
                    <span>
                      Hạn khắc phục{" "}
                      <b>
                        {extra.weakness.priority === "Phân tích ngay"
                          ? addDays(WEAKNESS_DUE_DAYS)
                          : "chưa đặt"}
                      </b>
                    </span>
                  </div>
                </div>
              )}

              {/* ---- Nhắc về ảnh hưởng tới bước 6 ---- */}
              {extra.weakness.has && extra.weakness.name.trim() && (
                <div className="flex gap-2 rounded-ctrl border border-lv-medium-border bg-lv-medium-bg p-2.5 text-[12px] leading-4 text-lv-medium-text">
                  <IconAlertTriangle size={16} className="mt-px shrink-0" />
                  <span>
                    Anh vừa ghi nhận một khe hở. Gợi ý điểm còn lại ở bước 6
                    tính theo kết luận hiệu lực <b>đã có</b> của từng kiểm soát,
                    nên <b>chưa tính tới</b> điểm yếu này. Con số gợi ý có thể
                    lạc quan hơn thực tế, anh cân nhắc chấm cao hơn gợi ý và nêu
                    rõ trong luận cứ.
                  </span>
                </div>
              )}
            </ContentCard>
          )}

          {/* ============== Bước 6: Đánh giá còn lại ============== */}
          {stage === "residual" && (
            <ResidualStep
              form={form}
              errors={errors}
              touched={extra.touched}
              pickedControls={pickedControls}
              suggestion={suggestion}
              hasWeakness={
                extra.weakness.has && extra.weakness.name.trim() !== ""
              }
              patch={patch}
              markTouched={markTouched}
            />
          )}

          {/* ============== Bước 7: Phương án xử lý ============== */}
          {stage === "treat" && (
            <TreatStep form={form} errors={errors} patch={patch} />
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
                  /* Dùng dòng bảng đã tính ở bước 4 thay vì tự tính lại,
                     để khối rà soát nói đúng con số mà bước 4 vừa nêu */
                  controls={assessRows.map((r) => ({
                    code: r.code,
                    name: r.name,
                    type: r.type,
                    status: r.status,
                    isKeyControl: r.isKeyControl,
                    effectiveness: r.overall,
                    pending: !r.counted,
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
        {!isEdit && draftId && (
          <Button
            variant="text"
            icon={<IconTrash size={16} />}
            onClick={() => setDiscarding(true)}
            disabled={saving}
          >
            Huỷ và xoá nháp
          </Button>
        )}

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
      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        onConfirm={discardDraft}
        title={`Huỷ hồ sơ ${draftCode}`}
        message={[
          `Hồ sơ ${draftCode} sẽ bị xoá khỏi sổ đăng ký và không khôi phục được.`,
          dependents.deficiencies.length > 0
            ? `${dependents.deficiencies.length} điểm yếu đã tạo trong quá trình khai báo cũng bị xoá theo: ${dependents.deficiencies
                .map((d) => d.code)
                .join(", ")}.`
            : "",
          dependents.controls.length > 0
            ? `${dependents.controls.length} kiểm soát sẽ được gỡ khỏi rủi ro này, nhưng bản thân kiểm soát vẫn giữ nguyên trong thư viện.`
            : "",
          "Nếu chỉ muốn tạm dừng, hãy bấm Ở lại rồi rời trang. Hồ sơ vẫn nằm trong sổ với nhãn Đang khai dở và khai tiếp được bất cứ lúc nào.",
        ]
          .filter((x) => x !== "")
          .join(" ")}
        confirmText="Xoá hồ sơ"
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
