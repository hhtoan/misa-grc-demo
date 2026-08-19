/* ==================================================================
   Kiểu dùng chung trong wizard khai báo rủi ro.

   Tách ra file riêng để các bước import mà không phụ thuộc vòng vào
   index.tsx. Cố tình khai tối giản và mọi trường đều tuỳ chọn, để nếu
   schema Control có thêm trường thì vẫn nhận được mà không vỡ build.
   ================================================================== */

export interface ControlLite {
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

/** Mức ưu tiên xử lý nghi ngờ điểm yếu ở bước 5 */
export type WeaknessPriority = "Theo dõi sau" | "Phân tích ngay";

/**
 * Ba nhóm dữ liệu wizard KHÔNG thuộc riskFormSchema:
 *   - controlIds : liên kết lưu ở control.riskIds
 *   - weakness   : sinh ra bản ghi Deficiency riêng ở bước 5
 *   - touched    : chỉ là trạng thái giao diện, không lưu
 */
export interface WizardExtra {
  controlIds: string[];
  weakness: {
    has: boolean;
    name: string;
    description: string;
    priority: WeaknessPriority;
  };
  touched: string[];
}

export const EMPTY_EXTRA: WizardExtra = {
  controlIds: [],
  weakness: {
    has: false,
    name: "",
    description: "",
    priority: "Theo dõi sau",
  },
  touched: [],
};

/** Kiểm soát chưa phê duyệt thì chưa tính là đang bảo vệ rủi ro */
export const NOT_YET_ACTIVE = new Set(["Nháp", "Chờ duyệt"]);

export function isControlPending(c: ControlLite): boolean {
  return NOT_YET_ACTIVE.has(c.status ?? "");
}
