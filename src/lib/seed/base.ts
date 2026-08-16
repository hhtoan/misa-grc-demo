/** Mốc thời gian cố định cho dữ liệu mẫu, tránh lệch giữa các lần nạp */
export const SEED_TS = "2026-02-10T08:00:00.000Z";

/** Dựng phần trường hệ thống của một bản ghi seed */
export function seedBase(id: string, code: string) {
  return {
    id,
    code,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    createdBy: "system",
  };
}
