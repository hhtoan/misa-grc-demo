export const DB_PREFIX = "misa-grc";

/** Tăng số này khi đổi cấu trúc dữ liệu để buộc seed lại */
export const DATA_VERSION = 1;

export const KEYS = {
  version: `${DB_PREFIX}:version`,

  units: `${DB_PREFIX}:units`,
  employees: `${DB_PREFIX}:employees`,
  categories: `${DB_PREFIX}:categories`,
  processes: `${DB_PREFIX}:processes`,
  systems: `${DB_PREFIX}:systems`,
  objectives: `${DB_PREFIX}:objectives`,

  risks: `${DB_PREFIX}:risks`,
  controls: `${DB_PREFIX}:controls`,
  controlTests: `${DB_PREFIX}:control-tests`,
  controlExceptions: `${DB_PREFIX}:control-exceptions`,
  deficiencies: `${DB_PREFIX}:deficiencies`,
  kppns: `${DB_PREFIX}:kppns`,
  events: `${DB_PREFIX}:events`,
  kris: `${DB_PREFIX}:kris`,
  kriReadings: `${DB_PREFIX}:kri-readings`,
} as const;

export type DbKey = (typeof KEYS)[keyof typeof KEYS];

/** Mã tiền tố sinh code tự động cho từng thực thể */
export const CODE_PREFIX = {
  risk: "RISK",
  control: "CTRL",
  controlTest: "TEST",
  controlException: "EXC",
  deficiency: "DEF",
  kppn: "KPPN",
  event: "EVT",
  kri: "KRI",
  kriReading: "KRV",
  objective: "OBJ",
  unit: "UNIT",
  employee: "EMP",
  category: "CAT",
  process: "PRC",
  system: "SYS",
} as const;
