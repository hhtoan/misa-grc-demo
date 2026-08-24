import type {
  Category,
  Employee,
  ITSystem,
  Objective,
  Process,
  Unit,
} from "@/lib/domain/schema";
import { seedBase } from "./base";

/* ==================================================================
   Đơn vị - 8 bản ghi
   ================================================================== */

export const SEED_UNITS: Unit[] = [
  {
    ...seedBase("unit-cty", "UNIT-001"),
    name: "MISA",
    parentId: null,
    level: "Công ty",
    managerId: "emp-ceo",
  },
  {
    ...seedBase("unit-sx", "UNIT-002"),
    name: "Khối Sản xuất",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-binh",
  },
  {
    ...seedBase("unit-kd", "UNIT-003"),
    name: "Khối Kinh doanh",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-son",
  },
  {
    ...seedBase("unit-tc", "UNIT-004"),
    name: "Khối Tài chính",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-mai",
  },
  {
    ...seedBase("unit-it", "UNIT-005"),
    name: "Trung tâm CNTT",
    parentId: "unit-cty",
    level: "Khối",
    managerId: "emp-yen",
  },
  {
    ...seedBase("unit-ns", "UNIT-006"),
    name: "Phòng Nhân sự",
    parentId: "unit-cty",
    level: "Phòng ban",
    managerId: "emp-anh",
  },
  {
    ...seedBase("unit-qtrr", "UNIT-007"),
    name: "Ban Quản trị rủi ro",
    parentId: "unit-cty",
    level: "Phòng ban",
    managerId: "emp-ha",
  },
  {
    ...seedBase("unit-ktnb", "UNIT-008"),
    name: "Phòng Kiểm toán nội bộ",
    parentId: "unit-cty",
    level: "Phòng ban",
    managerId: "emp-anh",
  },
];

/* ==================================================================
   Nhân sự - 10 bản ghi
   ================================================================== */

export const SEED_EMPLOYEES: Employee[] = [
  {
    ...seedBase("emp-ceo", "EMP-001"),
    name: "Vũ Quốc Hùng",
    title: "Tổng giám đốc",
    unitId: "unit-cty",
    email: "hungvq@misa.com.vn",
  },
  {
    ...seedBase("emp-binh", "EMP-002"),
    name: "Nguyễn Văn Bình",
    title: "Giám đốc Khối Sản xuất",
    unitId: "unit-sx",
    email: "binhnv@misa.com.vn",
  },
  {
    ...seedBase("emp-ha", "EMP-003"),
    name: "Trần Thu Hà",
    title: "Trưởng ban Quản trị rủi ro",
    unitId: "unit-qtrr",
    email: "hatt@misa.com.vn",
  },
  {
    ...seedBase("emp-quang", "EMP-004"),
    name: "Lê Minh Quang",
    title: "Chuyên viên Quản trị rủi ro",
    unitId: "unit-qtrr",
    email: "quanglm@misa.com.vn",
  },
  {
    ...seedBase("emp-anh", "EMP-005"),
    name: "Phạm Ngọc Ánh",
    title: "Trưởng phòng Kiểm toán nội bộ",
    unitId: "unit-ktnb",
    email: "anhpn@misa.com.vn",
  },
  {
    ...seedBase("emp-yen", "EMP-006"),
    name: "Đỗ Hải Yến",
    title: "Giám đốc Công nghệ thông tin",
    unitId: "unit-it",
    email: "yendh@misa.com.vn",
  },
  {
    ...seedBase("emp-son", "EMP-007"),
    name: "Hoàng Thanh Sơn",
    title: "Giám đốc Kinh doanh",
    unitId: "unit-kd",
    email: "sonht@misa.com.vn",
  },
  {
    ...seedBase("emp-mai", "EMP-008"),
    name: "Bùi Thị Mai",
    title: "Kế toán trưởng",
    unitId: "unit-tc",
    email: "maibt@misa.com.vn",
  },
  {
    ...seedBase("emp-tuan", "EMP-009"),
    name: "Đặng Anh Tuấn",
    title: "Trưởng nhóm hạ tầng",
    unitId: "unit-it",
    email: "tuanda@misa.com.vn",
  },
  {
    ...seedBase("emp-linh", "EMP-010"),
    name: "Ngô Thuỳ Linh",
    title: "Chuyên viên nhân sự",
    unitId: "unit-ns",
    email: "linhnt@misa.com.vn",
  },
];

/* ==================================================================
   Danh mục rủi ro và sự kiện - 11 bản ghi
   ================================================================== */

export const SEED_CATEGORIES: Category[] = [
  /* ---------- Ba nhóm rủi ro cấp 1 ---------- */
  {
    ...seedBase("cat-grp-hd", "RR-NHOM-HD"),
    name: "Rủi ro hoạt động",
    group: "Rủi ro",
    parentId: null,
    description: "Rủi ro phát sinh từ con người, quy trình và hệ thống nội bộ",
  },
  {
    ...seedBase("cat-grp-tc", "RR-NHOM-TC"),
    name: "Rủi ro tài chính",
    group: "Rủi ro",
    parentId: null,
    description: "Rủi ro liên quan tới dòng tiền, công nợ và tỷ giá",
  },
  {
    ...seedBase("cat-grp-tt", "RR-NHOM-TT"),
    name: "Rủi ro tuân thủ và bảo mật",
    group: "Rủi ro",
    parentId: null,
    description:
      "Vi phạm pháp luật, quy định nội bộ và an toàn thông tin. Tổ chức không chấp nhận rủi ro này ở bất kỳ mức nào",
    /* Cờ đặt ở CHA, hai danh mục con tự thừa hưởng. Đây là cách đúng:
       chính sách phát biểu ở một chỗ, không rải ở từng nút con */
    isZeroToleranceBranch: true,
  },
  {
    ...seedBase("cat-cl", "CAT-001"),
    name: "Rủi ro chiến lược",
    group: "Rủi ro",
    parentId: "cat-grp-hd",
    description: "Ảnh hưởng tới định hướng và mục tiêu dài hạn",
  },
  {
    ...seedBase("cat-vh", "CAT-002"),
    name: "Rủi ro vận hành",
    group: "Rủi ro",
    parentId: "cat-grp-hd",
    description: "Quy trình, con người, hệ thống trong vận hành hằng ngày",
  },
  {
    ...seedBase("cat-tc", "CAT-003"),
    name: "Rủi ro tài chính",
    group: "Rủi ro",
    parentId: "cat-grp-tc",
    description: "Dòng tiền, công nợ, tỷ giá, chi phí vốn",
  },
  {
    ...seedBase("cat-tt", "CAT-004"),
    name: "Rủi ro tuân thủ",
    group: "Rủi ro",
    parentId: "cat-grp-tt",
    description: "Pháp lý, quy định của cơ quan quản lý và quy chế nội bộ",
  },
  {
    ...seedBase("cat-cntt", "CAT-005"),
    name: "Rủi ro công nghệ thông tin",
    group: "Rủi ro",
    parentId: "cat-grp-hd",
    description: "Hạ tầng, phần mềm, dữ liệu và tính sẵn sàng hệ thống",
  },
  {
    ...seedBase("cat-attt", "CAT-006"),
    name: "Rủi ro an toàn thông tin",
    group: "Rủi ro",
    parentId: "cat-grp-tt",
    description: "Bảo mật, phân quyền, rò rỉ và lộ lọt dữ liệu",
  },
  {
    ...seedBase("cat-ns", "CAT-007"),
    name: "Rủi ro nhân sự",
    group: "Rủi ro",
    parentId: "cat-grp-hd",
    description: "Tuyển dụng, giữ chân và kế thừa nhân sự trọng yếu",
  },
  {
    ...seedBase("cat-sk-vh", "CAT-008"),
    name: "Sự cố vận hành",
    group: "Sự kiện",
    parentId: null,
    description: "Gián đoạn nghiệp vụ, lỗi quy trình, chậm tiến độ",
  },
  {
    ...seedBase("cat-sk-attt", "CAT-009"),
    name: "Sự cố an toàn thông tin",
    group: "Sự kiện",
    parentId: null,
    description: "Tấn công, truy cập trái phép, rò rỉ dữ liệu",
  },
  {
    ...seedBase("cat-sk-tc", "CAT-010"),
    name: "Sự cố tài chính",
    group: "Sự kiện",
    parentId: null,
    description: "Sai sót hạch toán, thanh toán nhầm, thất thoát",
  },
  {
    ...seedBase("cat-sk-kh", "CAT-011"),
    name: "Khiếu nại khách hàng",
    group: "Sự kiện",
    parentId: null,
    description: "Phản ánh về chất lượng sản phẩm và dịch vụ hỗ trợ",
  },
];

/* ==================================================================
   Quy trình - 6 bản ghi
   ================================================================== */

export const SEED_PROCESSES: Process[] = [
  {
    ...seedBase("prc-ban", "PRC-001"),
    name: "Quy trình bán hàng và thu tiền",
    ownerUnitId: "unit-kd",
    description: "Từ báo giá, ký hợp đồng tới thu hồi công nợ",
  },
  {
    ...seedBase("prc-mua", "PRC-002"),
    name: "Quy trình mua hàng và thanh toán",
    ownerUnitId: "unit-tc",
    description: "Từ đề nghị mua sắm tới thanh toán nhà cung cấp",
  },
  {
    ...seedBase("prc-pt", "PRC-003"),
    name: "Quy trình phát triển sản phẩm",
    ownerUnitId: "unit-sx",
    description: "Từ tiếp nhận yêu cầu tới phát hành phiên bản",
  },
  {
    ...seedBase("prc-van-hanh", "PRC-004"),
    name: "Quy trình vận hành hệ thống",
    ownerUnitId: "unit-it",
    description: "Giám sát, sao lưu, xử lý sự cố và khôi phục dịch vụ",
  },
  {
    ...seedBase("prc-ns", "PRC-005"),
    name: "Quy trình tuyển dụng và đào tạo",
    ownerUnitId: "unit-ns",
    description: "Từ xác định nhu cầu nhân sự tới hội nhập và đào tạo",
  },
  {
    ...seedBase("prc-attt", "PRC-006"),
    name: "Quy trình quản lý an toàn thông tin",
    ownerUnitId: "unit-it",
    description: "Phân quyền, mã hoá, giám sát và ứng phó sự cố bảo mật",
  },
];

/* ==================================================================
   Hệ thống công nghệ thông tin - 5 bản ghi
   ================================================================== */

export const SEED_SYSTEMS: ITSystem[] = [
  {
    ...seedBase("sys-erp", "SYS-001"),
    name: "Hệ thống ERP nội bộ",
    type: "Ứng dụng lõi",
    ownerUnitId: "unit-tc",
    criticality: "Trọng yếu",
  },
  {
    ...seedBase("sys-crm", "SYS-002"),
    name: "Hệ thống CRM",
    type: "Ứng dụng nghiệp vụ",
    ownerUnitId: "unit-kd",
    criticality: "Cao",
  },
  {
    ...seedBase("sys-dc", "SYS-003"),
    name: "Trung tâm dữ liệu chính",
    type: "Hạ tầng",
    ownerUnitId: "unit-it",
    criticality: "Trọng yếu",
  },
  {
    ...seedBase("sys-hr", "SYS-004"),
    name: "Hệ thống quản trị nhân sự",
    type: "Ứng dụng nghiệp vụ",
    ownerUnitId: "unit-ns",
    criticality: "Trung bình",
  },
  {
    ...seedBase("sys-cloud", "SYS-005"),
    name: "Nền tảng đám mây dịch vụ khách hàng",
    type: "Hạ tầng",
    ownerUnitId: "unit-it",
    criticality: "Cao",
  },
];

/* ==================================================================
   Mục tiêu - 8 bản ghi (giả lập đồng bộ 1 chiều từ AMIS Mục tiêu)
   ================================================================== */

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
    ...seedBase(id, code),
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
    "Thời gian phát hành 4 tuần",
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
    "Tính sẵn sàng 99,9%",
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
    "Tỷ lệ giữ chân 92%",
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
