import { z } from "zod";
import {
  BSC_PERSPECTIVES,
  CONTROL_FREQUENCIES,
  CONTROL_NATURES,
  CONTROL_STATUSES,
  CONTROL_TEST_METHODS,
  CONTROL_TEST_RESULTS,
  CONTROL_TYPES,
  DEFICIENCY_SOURCES,
  DEFICIENCY_STATUSES,
  EVENT_IMPACT_TYPES,
  EVENT_STATUSES,
  EXECUTION_SYSTEMS,
  KPPN_STATUSES,
  KPPN_TYPES,
  KRI_DIRECTIONS,
  KRI_STATUSES,
  OBJECTIVE_LEVELS,
  RISK_LEVELS,
  RISK_SOURCES,
  RISK_STATUSES,
  RISK_TREATMENTS,
  CONTROL_RELEVANCE,
} from "./enums";
import type { KriStatus } from "./enums";

/* ==================================================================
   Kiểu nền tảng
   ================================================================== */

export const baseEntity = z.object({
  id: z.string(),
  code: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().default(""),
});
export type BaseEntity = z.infer<typeof baseEntity>;

/** Các trường hệ thống tự sinh, không nằm trong form nhập liệu */
export const SYSTEM_FIELDS = {
  id: true,
  code: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
} as const;

const required = (msg: string) => z.string().trim().min(1, msg);
const score = z
  .number({ invalid_type_error: "Bắt buộc chọn giá trị" })
  .int()
  .min(1)
  .max(5);
const money = z.number().nullable().default(null);

/* ==================================================================
   Danh mục nền tảng
   ================================================================== */

export const unitSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên đơn vị"),
  parentId: z.string().nullable().default(null),
  level: z.enum(["Công ty", "Khối", "Phòng ban"]).default("Phòng ban"),
  managerId: z.string().default(""),
});
export type Unit = z.infer<typeof unitSchema>;

export const employeeSchema = baseEntity.extend({
  name: required("Bắt buộc nhập họ tên"),
  title: z.string().default(""),
  unitId: z.string().default(""),
  email: z.string().email("Email không hợp lệ").or(z.literal("")).default(""),
});
export type Employee = z.infer<typeof employeeSchema>;

export const categorySchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên danh mục"),
  group: z.enum(["Rủi ro", "Sự kiện"]).default("Rủi ro"),
  parentId: z.string().nullable().default(null),
  description: z.string().default(""),

  /**
   * Đánh dấu nhánh không khoan nhượng.
   *
   * Bật ở một nút thì MỌI danh mục con cháu của nút đó đều thừa hưởng,
   * và rủi ro thuộc các danh mục ấy tự động là rủi ro không khoan
   * nhượng. Người dùng không tự bật cờ ở từng rủi ro nữa: đây là chính
   * sách của tổ chức đặt ở danh mục, không phải lựa chọn của người khai
   * báo.
   *
   * Dùng .optional() chứ không .default(false) vì createRepository chỉ
   * spread input, không parse qua zod. Đặt .default() sẽ làm kiểu output
   * thành bắt buộc và kéo theo lỗi TS2739 ở toàn bộ seed danh mục, đúng
   * như đã gặp với noControlAccepted ở lô D.
   */
  isZeroToleranceBranch: z.boolean().optional(),
});

export type Category = z.infer<typeof categorySchema>;

export const processSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên quy trình"),
  ownerUnitId: z.string().default(""),
  description: z.string().default(""),
});
export type Process = z.infer<typeof processSchema>;

export const itSystemSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên hệ thống"),
  type: z.string().default(""),
  ownerUnitId: z.string().default(""),
  criticality: z.enum(RISK_LEVELS).default("Trung bình"),
});
export type ITSystem = z.infer<typeof itSystemSchema>;

/* ==================================================================
   Mục tiêu - đồng bộ 1 chiều từ AMIS Mục tiêu
   ================================================================== */

export const objectiveSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên mục tiêu"),
  perspective: z.enum(BSC_PERSPECTIVES),
  level: z.enum(OBJECTIVE_LEVELS).default("Công ty"),
  unitId: z.string().default(""),
  ownerId: z.string().default(""),
  period: z.string().default(""),
  target: z.string().default(""),
  progress: z.number().min(0).max(100).default(0),
  /** Chỉ đọc trong GRC */
  source: z.literal("AMIS Mục tiêu").default("AMIS Mục tiêu"),
  syncedAt: z.string().default(""),
});
export type Objective = z.infer<typeof objectiveSchema>;

/* ==================================================================
   Rủi ro
   ================================================================== */

export const riskSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên rủi ro"),
  description: z.string().default(""),
  cause: z.string().default(""),
  consequence: z.string().default(""),
  categoryId: required("Bắt buộc chọn nhóm rủi ro"),
  /** Bắt buộc gắn ít nhất 1 mục tiêu (quy tắc nghiệp vụ cốt lõi) */
  objectiveIds: z
    .array(z.string())
    .min(1, "Rủi ro phải gắn với ít nhất 1 mục tiêu"),
  unitId: required("Bắt buộc chọn đơn vị"),
  ownerId: required("Bắt buộc chọn chủ sở hữu rủi ro"),
  processId: z.string().default(""),
  systemId: z.string().default(""),
  source: z.enum(RISK_SOURCES).default("Nội bộ"),

  /* --- Dấu vết đánh giá điểm rủi ro còn lại --- */

  /** Ngày chấm điểm còn lại gần nhất, rỗng nghĩa là chưa từng chấm */
  residualAssessedAt: z.string().optional(),

  /** Người chấm điểm còn lại gần nhất */
  residualAssessedBy: z.string().optional(),

  /** Luận cứ đánh giá, phục vụ kiểm toán nội bộ */
  residualRationale: z.string().optional(),

  /**
   * Ngày tập kiểm soát của rủi ro này thay đổi gần nhất.
   * Mới hơn residualAssessedAt nghĩa là điểm còn lại đã cũ.
   */
  controlsChangedAt: z.string().optional(),

  /* --- Lưu vết gợi ý của hệ thống ở bước Đánh giá còn lại --- */

  /**
   * Điểm khả năng mà hệ thống gợi ý tại thời điểm người dùng chấm.
   *
   * Lưu để so với giá trị người dùng chốt. Nếu tỷ lệ ghi đè gợi ý cao
   * thì thuật toán cần hiệu chỉnh, chứ không phải người dùng làm sai.
   * Đây là dữ liệu quan trọng cho round review với CRO.
   */
  suggestedResidualLikelihood: z.number().int().min(1).max(5).optional(),

  /** Điểm ảnh hưởng mà hệ thống gợi ý, cùng mục đích như trên */
  suggestedResidualImpact: z.number().int().min(1).max(5).optional(),

  inherentLikelihood: score,
  inherentImpact: score,
  residualLikelihood: score,
  residualImpact: score,

  /**
   * Tuyên bố không áp dụng kiểm soát nào, chấp nhận rủi ro ở mức hiện tại.
   *
   * Dùng .optional() chứ không .default(false) vì .default() làm kiểu
   * output bắt buộc, kéo theo 10 bản ghi seed và 2 hàm nhân bản rủi ro
   * đều phải khai thêm trường. Đúng quy ước đã chốt ở lô A cho trường
   * bổ sung: mọi nơi đọc đều dùng !!r.noControlAccepted nên an toàn với
   * undefined.
   */
  noControlAccepted: z.boolean().optional(),

  treatment: z.enum(RISK_TREATMENTS).default("Giảm thiểu"),
  treatmentNote: z.string().default(""),
  /** Rủi ro không khoan nhượng: cấm chọn phương án Chấp nhận */
  isZeroTolerance: z.boolean().default(false),
  isKeyRisk: z.boolean().default(false),

  identifiedDate: required("Bắt buộc nhập ngày nhận diện"),
  reviewDate: z.string().default(""),
  /**
   * Hồ sơ đang khai dở trong wizard, chưa bấm Ghi nhận ở bước 8.
   *
   * Vì sao cần cờ riêng thay vì dùng status: wizard tạo bản ghi ngay từ
   * bước 2 để các bước sau có riskId thật mà gắn kiểm soát, điểm yếu và
   * KPPN. Bản ghi đó và bản ghi đã khai xong CÙNG ở trạng thái Nháp, vì
   * việc trình duyệt là thao tác riêng làm ở hồ sơ.
   *
   * Nhét dấu này vào status sẽ trộn hai khái niệm khác nhau: một cái là
   * tiến độ nhập liệu, một cái là trạng thái phê duyệt của hồ sơ.
   *
   * Dùng .optional() theo đúng quy ước: repo.create chỉ spread input,
   * không parse qua zod, nên .default() sẽ làm kiểu output thành bắt
   * buộc và kéo theo lỗi TS2739 ở toàn bộ seed.
   */
  isWizardDraft: z.boolean().optional(),
  status: z.enum(RISK_STATUSES).default("Nháp"),
  statusNote: z.string().default(""),
  estimatedLoss: money,
  tags: z.array(z.string()).default([]),
});
export type Risk = z.infer<typeof riskSchema>;

export const riskFormSchema = riskSchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    /* ==============================================================
       1. Rủi ro không khoan nhượng cấm chọn phương án Chấp nhận
       ============================================================== */
    if (v.isZeroTolerance && v.treatment === "Chấp nhận") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["treatment"],
        message:
          "Rủi ro không khoan nhượng không được chọn phương án Chấp nhận",
      });
    }

    /* ==============================================================
       2. Điểm còn lại CAO HƠN vốn có là trường hợp HỢP LỆ

       Quyết định chốt ngày 18/08/2026: gỡ chặn cứng, vì thực tế
       nghiệp vụ có ít nhất ba tình huống điểm còn lại cao hơn vốn có
       một cách chính đáng:

         - Kiểm soát mới làm phát sinh rủi ro thứ cấp, ví dụ thêm một
           lớp phê duyệt thủ công thì tăng rủi ro chậm tiến độ
         - Bối cảnh xấu đi giữa hai lần đánh giá, còn điểm vốn có thì
           giữ nguyên vì đó là mốc lịch sử
         - Đánh giá vốn có trước đây quá lạc quan, lần này chấm đúng
           hơn nhưng không sửa lại mốc cũ để giữ vết

       Thay chặn cứng bằng BẮT BUỘC NÊU CĂN CỨ. Không chặn quyền quyết
       định của người đánh giá, chỉ chặn quyết định không có căn cứ,
       để kiểm toán nội bộ đọc lại vẫn hiểu được.
       ============================================================== */
    const inherent = v.inherentLikelihood * v.inherentImpact;
    const residual = v.residualLikelihood * v.residualImpact;

    if (residual > inherent && !(v.residualRationale ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["residualRationale"],
        message:
          "Điểm rủi ro còn lại cao hơn rủi ro vốn có. Đây là trường hợp hợp lệ nhưng bắt buộc nêu căn cứ đánh giá",
      });
    }

    /* ==============================================================
       3. Ngày rà soát phải sau ngày nhận diện
       ============================================================== */
    if (v.reviewDate && v.reviewDate < v.identifiedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewDate"],
        message: "Ngày rà soát phải sau ngày nhận diện",
      });
    }

    /* ==============================================================
       4. Bắt buộc mô tả định hướng xử lý, trừ phương án Chấp nhận
       ============================================================== */
    if (v.treatment !== "Chấp nhận" && !v.treatmentNote.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["treatmentNote"],
        message: "Bắt buộc mô tả định hướng xử lý",
      });
    }
  });
export type RiskForm = z.infer<typeof riskFormSchema>;

/* ==================================================================
   Kiểm soát
   ================================================================== */

export const controlSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên kiểm soát"),
  description: z.string().default(""),
  riskIds: z
    .array(z.string())
    .min(1, "Kiểm soát phải gắn với ít nhất 1 rủi ro"),
  type: z.enum(CONTROL_TYPES),
  nature: z.enum(CONTROL_NATURES).default("Thủ công"),
  frequency: z.enum(CONTROL_FREQUENCIES).default("Hàng tháng"),
  unitId: required("Bắt buộc chọn đơn vị"),
  ownerId: required("Bắt buộc chọn người chịu trách nhiệm"),
  processId: z.string().default(""),
  systemId: z.string().default(""),
  isKeyControl: z.boolean().default(false),
  effectiveDate: required("Bắt buộc nhập ngày hiệu lực"),
  expireDate: z.string().default(""),
  status: z.enum(CONTROL_STATUSES).default("Nháp"),
  statusNote: z.string().default(""),
  lastTestResult: z.enum(CONTROL_TEST_RESULTS).nullable().default(null),
  lastTestDate: z.string().default(""),
  evidenceRequirement: z.string().default(""),
  designEffectiveness: z.string().optional(),
  operationEffectiveness: z.string().optional(),
  lastAssessedAt: z.string().optional(),
});
export type Control = z.infer<typeof controlSchema>;

export const controlFormSchema = controlSchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    if (v.expireDate && v.expireDate < v.effectiveDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expireDate"],
        message: "Ngày hết hiệu lực phải sau ngày hiệu lực",
      });
    }
    if (v.nature !== "Thủ công" && !v.systemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["systemId"],
        message: "Kiểm soát tự động hoặc bán tự động phải chọn hệ thống CNTT",
      });
    }
    if (v.isKeyControl && !v.evidenceRequirement.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceRequirement"],
        message: "Kiểm soát trọng yếu bắt buộc khai báo yêu cầu bằng chứng",
      });
    }
  });
export type ControlForm = z.infer<typeof controlFormSchema>;

/* ==================================================================
   Kết quả kiểm tra kiểm soát
   ================================================================== */

export const controlTestSchema = baseEntity.extend({
  controlId: required("Bắt buộc chọn kiểm soát"),
  period: z.string().default(""),
  testDate: required("Bắt buộc nhập ngày kiểm tra"),
  testerId: required("Bắt buộc chọn người kiểm tra"),
  method: z.enum(CONTROL_TEST_METHODS).default("Kiểm tra chứng từ"),
  sampleSize: z.number().int().min(0).default(0),
  failCount: z.number().int().min(0).default(0),
  result: z.enum(CONTROL_TEST_RESULTS),
  finding: z.string().default(""),
  recommendation: z.string().default(""),
  /* --- Kết quả kiểm tra tách theo hai chiều --- */

  designResult: z.string().optional(),
  operationResult: z.string().optional(),

  /** Bắt buộc sinh điểm yếu khi kết luận khác Hiệu quả */
  deficiencyId: z.string().default(""),
  evidenceNote: z.string().default(""),
});
export type ControlTest = z.infer<typeof controlTestSchema>;

export const controlTestFormSchema = controlTestSchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    if (v.failCount > v.sampleSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failCount"],
        message: "Số mẫu lỗi không được lớn hơn cỡ mẫu",
      });
    }
    if (v.result !== "Hiệu quả" && !v.finding.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["finding"],
        message: "Bắt buộc mô tả phát hiện khi kết luận khác Hiệu quả",
      });
    }
    if (v.result !== "Hiệu quả" && !v.recommendation.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendation"],
        message: "Bắt buộc nhập khuyến nghị khi kết luận khác Hiệu quả",
      });
    }
    if (
      v.sampleSize > 0 &&
      v.failCount === 0 &&
      v.result === "Không hiệu quả"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result"],
        message: "Không có mẫu lỗi thì không thể kết luận Không hiệu quả",
      });
    }
  });
export type ControlTestForm = z.infer<typeof controlTestFormSchema>;

/* ==================================================================
   Ngoại lệ kiểm soát
   ================================================================== */

export const CONTROL_EXCEPTION_STATUSES = [
  "Chờ duyệt",
  "Đã duyệt",
  "Từ chối",
  "Hết hiệu lực",
] as const;
export type ControlExceptionStatus =
  (typeof CONTROL_EXCEPTION_STATUSES)[number];

export const controlExceptionSchema = baseEntity.extend({
  controlId: required("Bắt buộc chọn kiểm soát"),
  reason: required("Bắt buộc nhập lý do xin ngoại lệ"),
  requesterId: required("Bắt buộc chọn người đề nghị"),
  approverId: z.string().default(""),
  unitId: z.string().default(""),
  startDate: required("Bắt buộc nhập ngày bắt đầu"),
  endDate: required("Bắt buộc nhập ngày kết thúc"),
  compensatingControl: required("Bắt buộc mô tả biện pháp bù đắp"),
  residualRiskLevel: z.enum(RISK_LEVELS).default("Trung bình"),
  status: z.enum(CONTROL_EXCEPTION_STATUSES).default("Chờ duyệt"),
  statusNote: z.string().default(""),
});
export type ControlException = z.infer<typeof controlExceptionSchema>;

export const controlExceptionFormSchema = controlExceptionSchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    if (v.endDate <= v.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Ngày kết thúc phải sau ngày bắt đầu",
      });
    }
    if (v.status === "Đã duyệt" && !v.approverId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approverId"],
        message: "Ngoại lệ đã duyệt phải có người phê duyệt",
      });
    }
  });
export type ControlExceptionForm = z.infer<typeof controlExceptionFormSchema>;

/* ==================================================================
   Liên kết Rủi ro và Kiểm soát, kèm thuộc tính của quan hệ

   Vì sao tách entity riêng thay vì đổi control.riskIds thành mảng
   object: riskIds đang được đọc ở khoảng một chục chỗ và có rule .min(1)
   trong controlSchema. Đổi cấu trúc sẽ kéo theo sửa toàn bộ seed và mọi
   màn hình đọc quan hệ này.

   Cách hiện tại giữ riskIds làm QUAN HỆ CƠ BẢN, còn bản ghi link chỉ
   lưu THUỘC TÍNH của quan hệ. Không có bản ghi link nghĩa là chưa đánh
   giá mức phù hợp, không phá gì đang chạy.
   ================================================================== */

export const riskControlLinkSchema = baseEntity.extend({
  riskId: required("Bắt buộc gắn rủi ro"),
  controlId: required("Bắt buộc gắn kiểm soát"),

  /** Để trống nghĩa là chưa đánh giá mức phù hợp */
  relevance: z.enum(CONTROL_RELEVANCE).optional(),

  /** Lý do kết luận, bắt buộc khi chọn Không phù hợp, kiểm tra ở tầng form */
  relevanceNote: z.string().optional(),

  assessedAt: z.string().optional(),
  assessedBy: z.string().optional(),
});
export type RiskControlLink = z.infer<typeof riskControlLinkSchema>;

/* ==================================================================
   Điểm yếu kiểm soát
   ================================================================== */

export const deficiencySchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên điểm yếu"),
  description: z.string().default(""),
  sourceType: z.enum(DEFICIENCY_SOURCES),
  sourceRef: z.string().default(""),
  controlId: z.string().default(""),
  riskId: z.string().default(""),
  eventId: z.string().default(""),
  severity: z.enum(RISK_LEVELS).default("Trung bình"),
  unitId: required("Bắt buộc chọn đơn vị"),
  ownerId: required("Bắt buộc chọn người chịu trách nhiệm"),
  detectedDate: required("Bắt buộc nhập ngày phát hiện"),
  dueDate: z.string().default(""),
  rootCause: z.string().default(""),
  status: z.enum(DEFICIENCY_STATUSES).default("Mới ghi nhận"),
  statusNote: z.string().default(""),
  kppnIds: z.array(z.string()).default([]),
});
export type Deficiency = z.infer<typeof deficiencySchema>;

export const deficiencyFormSchema = deficiencySchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    if (v.dueDate && v.dueDate < v.detectedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "Hạn khắc phục phải sau ngày phát hiện",
      });
    }
    if (v.sourceType === "Kiểm tra kiểm soát" && !v.controlId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["controlId"],
        message: "Điểm yếu từ kiểm tra kiểm soát phải gắn với kiểm soát",
      });
    }
    if (v.sourceType === "Sự kiện" && !v.eventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventId"],
        message: "Điểm yếu từ sự kiện phải gắn với sự kiện gốc",
      });
    }
    const needRootCause =
      v.severity === "Cao" ||
      v.severity === "Trọng yếu" ||
      v.status === "Đã lập KPPN";
    if (needRootCause && !v.rootCause.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rootCause"],
        message:
          "Điểm yếu mức Cao/Trọng yếu hoặc đã lập KPPN bắt buộc phân tích nguyên nhân gốc",
      });
    }
    if (v.status === "Đã lập KPPN" && v.kppnIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kppnIds"],
        message: "Trạng thái Đã lập KPPN yêu cầu ít nhất 1 hành động KPPN",
      });
    }
  });
export type DeficiencyForm = z.infer<typeof deficiencyFormSchema>;

/* ==================================================================
   KPPN - Khắc phục & phòng ngừa
   ================================================================== */

export const kppnSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên hành động"),
  description: z.string().default(""),
  type: z.enum(KPPN_TYPES).default("Khắc phục"),
  deficiencyId: z.string().default(""),
  riskId: z.string().default(""),
  eventId: z.string().default(""),
  unitId: required("Bắt buộc chọn đơn vị thực hiện"),
  assigneeId: required("Bắt buộc chọn người thực hiện"),
  supervisorId: z.string().default(""),
  /** GRC điều phối, việc thực thi nằm ở hệ thống nguồn */
  executionSystem: z.enum(EXECUTION_SYSTEMS).default("AMIS Công việc"),
  externalTaskCode: z.string().default(""),
  externalUrl: z.string().default(""),
  lastSyncedAt: z.string().default(""),
  startDate: required("Bắt buộc nhập ngày bắt đầu"),
  dueDate: required("Bắt buộc nhập hạn hoàn thành"),
  completedDate: z.string().default(""),
  progress: z.number().min(0).max(100).default(0),
  status: z.enum(KPPN_STATUSES).default("Nháp"),
  statusNote: z.string().default(""),
  result: z.string().default(""),
  evidenceNote: z.string().default(""),
  estimatedCost: money,
});
export type Kppn = z.infer<typeof kppnSchema>;

export const kppnFormSchema = kppnSchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    if (v.dueDate < v.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "Hạn hoàn thành phải sau ngày bắt đầu",
      });
    }
    if (!v.deficiencyId && !v.riskId && !v.eventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deficiencyId"],
        message:
          "KPPN phải gắn với ít nhất 1 nguồn: điểm yếu, rủi ro hoặc sự kiện",
      });
    }
    if (v.status === "Hoàn thành") {
      if (!v.completedDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["completedDate"],
          message: "Bắt buộc nhập ngày hoàn thành",
        });
      }
      if (v.progress !== 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["progress"],
          message: "Hành động hoàn thành phải đạt tiến độ 100%",
        });
      }
      if (!v.result.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["result"],
          message: "Bắt buộc mô tả kết quả thực hiện",
        });
      }
      if (!v.evidenceNote.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidenceNote"],
          message: "Bắt buộc đính kèm hoặc mô tả bằng chứng nghiệm thu",
        });
      }
    }
    if (v.completedDate && v.completedDate < v.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedDate"],
        message: "Ngày hoàn thành phải sau ngày bắt đầu",
      });
    }
  });
export type KppnForm = z.infer<typeof kppnFormSchema>;

/** KPPN quá hạn: chưa kết thúc mà đã qua hạn */
export function isKppnOverdue(k: Kppn, today = new Date()): boolean {
  if (k.status === "Hoàn thành" || k.status === "Huỷ") return false;
  if (!k.dueDate) return false;
  const due = new Date(k.dueDate);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < today.getTime();
}

/* ==================================================================
   Sự kiện
   ================================================================== */

export const eventSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên sự kiện"),
  description: z.string().default(""),
  categoryId: required("Bắt buộc chọn nhóm sự kiện"),
  unitId: required("Bắt buộc chọn đơn vị xảy ra"),
  occurredDate: required("Bắt buộc nhập ngày xảy ra"),
  detectedDate: required("Bắt buộc nhập ngày phát hiện"),
  reporterId: required("Bắt buộc chọn người báo cáo"),
  handlerId: z.string().default(""),
  impactTypes: z
    .array(z.enum(EVENT_IMPACT_TYPES))
    .min(1, "Bắt buộc chọn ít nhất 1 loại ảnh hưởng"),
  severity: z.enum(RISK_LEVELS).default("Trung bình"),
  /** Sự kiện suýt xảy ra: chưa phát sinh tổn thất thực tế */
  isNearMiss: z.boolean().default(false),
  isConfidential: z.boolean().default(false),
  estimatedLoss: money,
  actualLoss: money,
  recoveredAmount: money,
  relatedRiskIds: z.array(z.string()).default([]),
  relatedControlIds: z.array(z.string()).default([]),
  deficiencyIds: z.array(z.string()).default([]),
  kppnIds: z.array(z.string()).default([]),
  rootCause: z.string().default(""),
  lessonLearned: z.string().default(""),
  status: z.enum(EVENT_STATUSES).default("Mới ghi nhận"),
  statusNote: z.string().default(""),
});
export type GrcEvent = z.infer<typeof eventSchema>;

export const eventFormSchema = eventSchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    if (v.detectedDate < v.occurredDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["detectedDate"],
        message: "Ngày phát hiện không được trước ngày xảy ra",
      });
    }
    if (v.isNearMiss && (v.actualLoss ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualLoss"],
        message: "Sự kiện suýt xảy ra không được có tổn thất thực tế",
      });
    }
    if (
      !v.isNearMiss &&
      v.impactTypes.includes("Tài chính") &&
      (v.actualLoss === null || v.actualLoss <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualLoss"],
        message: "Sự kiện ảnh hưởng tài chính bắt buộc nhập tổn thất thực tế",
      });
    }
    if (
      v.recoveredAmount !== null &&
      v.actualLoss !== null &&
      v.recoveredAmount > v.actualLoss
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recoveredAmount"],
        message: "Số tiền thu hồi không được lớn hơn tổn thất thực tế",
      });
    }
    if (
      (v.severity === "Cao" || v.severity === "Trọng yếu") &&
      v.relatedRiskIds.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relatedRiskIds"],
        message: "Sự kiện mức Cao/Trọng yếu bắt buộc liên kết về rủi ro",
      });
    }
    if (v.status === "Đã đóng" && !v.rootCause.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rootCause"],
        message: "Bắt buộc phân tích nguyên nhân gốc trước khi đóng sự kiện",
      });
    }
  });
export type EventForm = z.infer<typeof eventFormSchema>;

/* ==================================================================
   KRI - chỉ số cảnh báo rủi ro
   ================================================================== */

export const kriSchema = baseEntity.extend({
  name: required("Bắt buộc nhập tên chỉ số"),
  description: z.string().default(""),
  riskId: required("Bắt buộc gắn với rủi ro"),
  unitId: z.string().default(""),
  ownerId: required("Bắt buộc chọn người theo dõi"),
  measureUnit: z.string().default(""),
  direction: z.enum(KRI_DIRECTIONS).default("Càng cao càng xấu"),
  thresholdWarning: z.number(),
  thresholdBreach: z.number(),
  frequency: z.enum(CONTROL_FREQUENCIES).default("Hàng tháng"),
  dataSource: z.string().default(""),
  currentValue: z.number().nullable().default(null),
  currentPeriod: z.string().default(""),
  status: z.enum(KRI_STATUSES).default("An toàn"),
  isActive: z.boolean().default(true),
});
export type Kri = z.infer<typeof kriSchema>;

export const kriFormSchema = kriSchema
  .omit(SYSTEM_FIELDS)
  .superRefine((v, ctx) => {
    if (
      v.direction === "Càng cao càng xấu" &&
      v.thresholdBreach <= v.thresholdWarning
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thresholdBreach"],
        message: "Ngưỡng vượt phải lớn hơn ngưỡng cảnh báo",
      });
    }
    if (
      v.direction === "Càng thấp càng xấu" &&
      v.thresholdBreach >= v.thresholdWarning
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thresholdBreach"],
        message: "Ngưỡng vượt phải nhỏ hơn ngưỡng cảnh báo",
      });
    }
  });
export type KriForm = z.infer<typeof kriFormSchema>;

export const kriReadingSchema = baseEntity.extend({
  kriId: required("Bắt buộc chọn chỉ số"),
  period: required("Bắt buộc nhập kỳ đo"),
  value: z.number(),
  recordedDate: required("Bắt buộc nhập ngày ghi nhận"),
  status: z.enum(KRI_STATUSES).default("An toàn"),
  note: z.string().default(""),
});
export type KriReading = z.infer<typeof kriReadingSchema>;

/** Quy đổi giá trị đo sang trạng thái cảnh báo */
export function kriStatusOf(
  value: number,
  warning: number,
  breach: number,
  direction: string,
): KriStatus {
  if (direction === "Càng cao càng xấu") {
    if (value >= breach) return "Vượt ngưỡng";
    if (value >= warning) return "Cảnh báo";
    return "An toàn";
  }
  if (value <= breach) return "Vượt ngưỡng";
  if (value <= warning) return "Cảnh báo";
  return "An toàn";
}

/* ==================================================================
   Tiện ích validation dùng chung cho form
   ================================================================== */

export type FieldErrors = Record<string, string>;

export function zodErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export interface ValidateResult<T> {
  ok: boolean;
  data?: T;
  errors: FieldErrors;
}

/** Kiểm tra dữ liệu form, trả về map lỗi theo tên trường */
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
): ValidateResult<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data, errors: {} };
  return { ok: false, errors: zodErrors(parsed.error) };
}
