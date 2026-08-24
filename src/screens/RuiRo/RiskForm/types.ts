/* ==================================================================
   Kiểu dùng chung trong wizard khai báo rủi ro.

   Tách ra file riêng để các bước import mà không phụ thuộc vòng vào
   index.tsx. Cố tình khai tối giản và mọi trường đều tuỳ chọn, để nếu
   schema Control có thêm trường thì vẫn nhận được mà không vỡ build.
   ================================================================== */

import { isControlOperating } from "@/lib/domain/risk-control-link";

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

/**
 * Kiểm soát chưa được tính là đang bảo vệ rủi ro.
 *
 * Bản trước khai tập NOT_YET_ACTIVE gồm Nháp và Chờ duyệt, nên kiểm
 * soát Tạm ngưng và Hết hiệu lực vẫn được tính. Cả hai đều đã ngừng
 * chạy, nên kết luận theo hướng lạc quan hơn thực tế.
 *
 * Giờ hỏi thẳng tầng domain qua isControlOperating, để chỉ có MỘT chỗ
 * quyết định thế nào là đang vận hành.
 */
export function isControlPending(c: ControlLite): boolean {
  return !isControlOperating(c.status);
}
