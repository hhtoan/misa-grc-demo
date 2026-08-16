import type {
  Category,
  Employee,
  ITSystem,
  Objective,
  Process,
  Unit,
} from "@/lib/domain/schema";

const TS = "2026-01-05T08:00:00.000Z";

function base(id: string, code: string) {
  return { id, code, createdAt: TS, updatedAt: TS, createdBy: "system" };
}

/* ---------------------------- Đơn vị ------------------------------ */

export const SEED_UNITS: Unit[] = [
  {
    ...base("unit-cty", "UNIT-001"),
    name: "MISA",
    parentId: null,
    level: "Công ty",
    managerId: "emp-ceo",
  },
  {
    ...base("unit-sx", "UNIT-002"),
    name: "Khối Sản xuất",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-binh",
  },
  {
    ...base("unit-kd", "UNIT-003"),
    name: "Khối Kinh doanh",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-son",
  },
  {
    ...base("unit-tc", "UNIT-004"),
    name: "Khối Tài chính",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-mai",
  },
  {
    ...base("unit-it", "UNIT-005"),
    name: "Trung tâm CNTT",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-yen",
  },
  {
    ...base("unit-ns", "UNIT-006"),
    name: "Phòng Nhân sự",
    parentId: "unit-cty",
    level: "Phòng ban",
    managerId: "emp-anh",
  },
  {
    ...base("unit-qtrr", "UNIT-007"),
    name: "Ban Quản trị rủi ro",
    parentId: "unit-cty",
    level: "Phòng ban",
    managerId: "emp-ha",
  },
  {
    ...base("unit-ktnb", "UNIT-008"),
    name: "Phòng Kiểm toán nội bộ",
    parentId: "unit-cty",
    level: "Phòng ban",
    managerId: "emp-anh",
  },
];

/* --------------------------- Nhân sự ------------------------------ */

export const SEED_EMPLOYEES: Employee[] = [
  {
    ...base("emp-ceo", "EMP-001"),
    name: "Vũ Quốc Hùng",
    title: "Tổng giám đốc",
    unitId: "unit-cty",
    email: "hungvq@misa.com.vn",
  },
  {
    ...base("emp-binh", "EMP-002"),
    name: "Nguyễn Văn Bình",
    title: "Giám đốc Khối Sản xuất",
    unitId: "unit-sx",
    email: "binhnv@misa.com.vn",
  },
  {
    ...base("emp-ha", "EMP-003"),
    name: "Trần Thu Hà",
    title: "Trưởng ban QTRR",
    unitId: "unit-qtrr",
    email: "hatt@misa.com.vn",
  },
  {
    ...base("emp-quang", "EMP-004"),
    name: "Lê Minh Quang",
    title: "Chuyên viên QTRR",
    unitId: "unit-qtrr",
    email: "quanglm@misa.com.vn",
  },
  {
    ...base("emp-anh", "EMP-005"),
    name: "Phạm Ngọc Ánh",
    title: "Trưởng phòng KTNB",
    unitId: "unit-ktnb",
    email: "anhpn@misa.com.vn",
  },
  {
    ...base("emp-yen", "EMP-006"),
    name: "Đỗ Hải Yến",
    title: "Giám đốc CNTT",
    unitId: "unit-it",
    email: "yendh@misa.com.vn",
  },
  {
    ...base("emp-son", "EMP-007"),
    name: "Hoàng Thanh Sơn",
    title: "Giám đốc Kinh doanh",
    unitId: "unit-kd",
    email: "sonht@misa.com.vn",
  },
  {
    ...base("emp-mai", "EMP-008"),
    name: "Bùi Thị Mai",
    title: "Kế toán trưởng",
    unitId: "unit-tc",
    email: "maibt@misa.com.vn",
  },
  {
    ...base("emp-tuan", "EMP-009"),
    name: "Đặng Anh Tuấn",
    title: "Trưởng nhóm hạ tầng",
    unitId: "unit-it",
    email: "tuanda@misa.com.vn",
  },
  {
    ...base("emp-linh", "EMP-010"),
    name: "Ngô Thuỳ Linh",
    title: "Chuyên viên nhân sự",
    unitId: "unit-ns",
    email: "linhnt@misa.com.vn",
  },
];

/* ---------------------- Nhóm rủi ro / sự kiện --------------------- */

export const SEED_CATEGORIES: Category[] = [
  {
    ...base("cat-cl", "CAT-001"),
    name: "Rủi ro chiến lược",
    group: "Rủi ro",
    parentId: null,
    description: "Ảnh hưởng tới định hướng dài hạn",
  },
  {
    ...base("cat-vh", "CAT-002"),
    name: "Rủi ro vận hành",
    group: "Rủi ro",
    parentId: null,
    description: "Quy trình, con người, hệ thống",
  },
  {
    ...base("cat-tc", "CAT-003"),
    name: "Rủi ro tài chính",
    group: "Rủi ro",
    parentId: null,
    description: "Dòng tiền, công nợ, tỷ giá",
  },
  {
    ...base("cat-tt", "CAT-004"),
    name: "Rủi ro tuân thủ",
    group: "Rủi ro",
    parentId: null,
    description: "Pháp lý, quy định nội bộ",
  },
  {
    ...base("cat-cntt", "CAT-005"),
    name: "Rủi ro công nghệ thông tin",
    group: "Rủi ro",
    parentId: "cat-vh",
    description: "Hạ tầng, phần mềm, dữ liệu",
  },
  {
    ...base("cat-attt", "CAT-006"),
    name: "Rủi ro an toàn thông tin",
    group: "Rủi ro",
    parentId: "cat-cntt",
    description: "Bảo mật, rò rỉ dữ liệu",
  },
  {
    ...base("cat-ns", "CAT-007"),
    name: "Rủi ro nhân sự",
    group: "Rủi ro",
    parentId: "cat-vh",
    description: "Tuyển dụng, giữ chân, kế thừa",
  },
  {
    ...base("cat-sk-vh", "CAT-008"),
    name: "Sự cố vận hành",
    group: "Sự kiện",
    parentId: null,
    description: "Gián đoạn nghiệp vụ",
  },
  {
    ...base("cat-sk-attt", "CAT-009"),
    name: "Sự cố an toàn thông tin",
    group: "Sự kiện",
    parentId: null,
    description: "Tấn công, rò rỉ, lộ lọt",
  },
  {
    ...base("cat-sk-tc", "CAT-010"),
    name: "Sự cố tài chính",
    group: "Sự kiện",
    parentId: null,
    description: "Sai sót, thất thoát",
  },
  {
    ...base("cat-sk-kh", "CAT-011"),
    name: "Khiếu nại khách hàng",
    group: "Sự kiện",
    parentId: null,
    description: "Phản ánh chất lượng dịch vụ",
  },
];

/* -------------------------- Quy trình ----------------------------- */

export const SEED_PROCESSES: Process[] = [
  {
    ...base("prc-ban", "PRC-001"),
    name: "Quy trình bán hàng và thu tiền",
    ownerUnitId: "unit-kd",
    description: "Từ báo giá tới thu hồi công nợ",
  },
  {
    ...base("prc-mua", "PRC-002"),
    name: "Quy trình mua hàng và thanh toán",
    ownerUnitId: "unit-tc",
    description: "Từ đề nghị mua tới thanh toán",
  },
  {
    ...base("prc-pt", "PRC-003"),
    name: "Quy trình phát triển sản phẩm",
    ownerUnitId: "unit-sx",
    description: "Từ yêu cầu tới phát hành",
  },
  {
    ...base("prc-van-hanh", "PRC-004"),
    name: "Quy trình vận hành hệ thống",
    ownerUnitId: "unit-it",
    description: "Giám sát, sao lưu, khắc phục sự cố",
  },
  {
    ...base("prc-ns", "PRC-005"),
    name: "Quy trình tuyển dụng và đào tạo",
    ownerUnitId: "unit-ns",
    description: "Từ nhu cầu nhân sự tới hội nhập",
  },
  {
    ...base("prc-attt", "PRC-006"),
    name: "Quy trình quản lý an toàn thông tin",
    ownerUnitId: "unit-it",
    description: "Phân quyền, mã hoá, giám sát",
  },
];

/* ------------------------ Hệ thống CNTT --------------------------- */

export const SEED_SYSTEMS: ITSystem[] = [
  {
    ...base("sys-erp", "SYS-001"),
    name: "Hệ thống ERP nội bộ",
    type: "Ứng dụng lõi",
    ownerUnitId: "unit-tc",
    criticality: "Trọng yếu",
  },
  {
    ...base("sys-crm", "SYS-002"),
    name: "Hệ thống CRM",
    type: "Ứng dụng nghiệp vụ",
    ownerUnitId: "unit-kd",
    criticality: "Cao",
  },
  {
    ...base("sys-dc", "SYS-003"),
    name: "Trung tâm dữ liệu chính",
    type: "Hạ tầng",
    ownerUnitId: "unit-it",
    criticality: "Trọng yếu",
  },
  {
    ...base("sys-hr", "SYS-004"),
    name: "Hệ thống quản trị nhân sự",
    type: "Ứng dụng nghiệp vụ",
    ownerUnitId: "unit-ns",
    criticality: "Trung bình",
  },
  {
    ...base("sys-cloud", "SYS-005"),
    name: "Nền tảng đám mây dịch vụ khách hàng",
    type: "Hạ tầng",
    ownerUnitId: "unit-it",
    criticality: "Cao",
  },
];

/* -------------- Mục tiêu (giả lập đồng bộ từ AMIS Mục tiêu) ------- */

const SYNC_TS = "2026-08-01T02:00:00.000Z";

function objective(
  id: string,
  code: string,
  name: string,
  perspective: Objective["perspective"],
  level: Objective["level"],
  unitId: string,
  ownerId: string,
  target: string,
  progress: number,
): Objective {
  return {
    ...base(id, code),
    name,
    perspective,
    level,
    unitId,
    ownerId,
    period: "Năm 2026",
    target,
    progress,
    source: "AMIS Mục tiêu",
    syncedAt: SYNC_TS,
  };
}

export const SEED_OBJECTIVES: Objective[] = [
  objective(
    "obj-01",
    "OBJ-2026-001",
    "Tăng trưởng doanh thu 25% so với năm 2025",
    "Tài chính",
    "Công ty",
    "unit-cty",
    "emp-ceo",
    "Doanh thu 2.500 tỷ",
    62,
  ),
  objective(
    "obj-02",
    "OBJ-2026-002",
    "Giữ tỷ lệ khách hàng gia hạn trên 90%",
    "Khách hàng",
    "Công ty",
    "unit-cty",
    "emp-son",
    "Tỷ lệ gia hạn 90%",
    74,
  ),
  objective(
    "obj-03",
    "OBJ-2026-003",
    "Rút ngắn thời gian phát hành sản phẩm còn 4 tuần",
    "Quy trình nội bộ",
    "Khối",
    "unit-sx",
    "emp-binh",
    "Lead time 4 tuần",
    48,
  ),
  objective(
    "obj-04",
    "OBJ-2026-004",
    "Đảm bảo tính sẵn sàng hệ thống đạt 99,9%",
    "Quy trình nội bộ",
    "Khối",
    "unit-it",
    "emp-yen",
    "Uptime 99,9%",
    88,
  ),
  objective(
    "obj-05",
    "OBJ-2026-005",
    "Không để xảy ra sự cố lộ lọt dữ liệu khách hàng",
    "Quy trình nội bộ",
    "Khối",
    "unit-it",
    "emp-yen",
    "0 sự cố nghiêm trọng",
    95,
  ),
  objective(
    "obj-06",
    "OBJ-2026-006",
    "Kiểm soát tỷ lệ nợ quá hạn dưới 3%",
    "Tài chính",
    "Khối",
    "unit-tc",
    "emp-mai",
    "Nợ quá hạn dưới 3%",
    55,
  ),
  objective(
    "obj-07",
    "OBJ-2026-007",
    "Nâng tỷ lệ giữ chân nhân sự chủ chốt lên 92%",
    "Học hỏi & phát triển",
    "Phòng ban",
    "unit-ns",
    "emp-anh",
    "Retention 92%",
    70,
  ),
  objective(
    "obj-08",
    "OBJ-2026-008",
    "Hoàn thành tuân thủ khung bảo vệ dữ liệu cá nhân",
    "Quy trình nội bộ",
    "Công ty",
    "unit-cty",
    "emp-ha",
    "100% hạng mục bắt buộc",
    40,
  ),
];
