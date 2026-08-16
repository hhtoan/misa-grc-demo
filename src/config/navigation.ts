import type { ComponentType } from "react";
import {
  IconAlertTriangle,
  IconBolt,
  IconBuildingStore,
  IconChartPie,
  IconFileCertificate,
  IconFileSearch,
  IconFolders,
  IconGauge,
  IconHome,
  IconReport,
  IconScale,
  IconSettings,
  IconShieldCheck,
  IconTool,
} from "@tabler/icons-react";

export type NavIcon = ComponentType<{
  size?: number;
  stroke?: number;
  className?: string;
}>;

export interface NavItem {
  key: string;
  label: string;
  path: string;
  /** Chưa có tài liệu nghiệp vụ -> hiển thị màn hình "Sắp có" */
  comingSoon?: boolean;
  /** Mục hạn chế truy cập (🔒 theo tài liệu) */
  restricted?: boolean;
}

export interface NavModule {
  key: string;
  label: string;
  shortLabel?: string;
  icon: NavIcon;
  basePath: string;
  comingSoon?: boolean;
  items: NavItem[];
}

export const NAVIGATION: NavModule[] = [
  {
    key: "trang-chu",
    label: "Trang chủ",
    icon: IconHome,
    basePath: "/trang-chu",
    items: [
      { key: "bang-tin", label: "Bảng tin", path: "/trang-chu/bang-tin" },
      {
        key: "viec-can-xu-ly",
        label: "Việc cần xử lý",
        path: "/trang-chu/viec-can-xu-ly",
      },
      { key: "thong-bao", label: "Thông báo", path: "/trang-chu/thong-bao" },
    ],
  },
  {
    key: "rui-ro",
    label: "Rủi ro",
    icon: IconAlertTriangle,
    basePath: "/rui-ro",
    items: [
      { key: "muc-tieu", label: "Mục tiêu", path: "/rui-ro/muc-tieu" },
      {
        key: "ban-do-muc-tieu",
        label: "Bản đồ mục tiêu - rủi ro",
        path: "/rui-ro/ban-do-muc-tieu",
      },
      {
        key: "so-dang-ky",
        label: "Sổ đăng ký rủi ro",
        path: "/rui-ro/so-dang-ky",
      },
      {
        key: "trong-yeu",
        label: "Rủi ro trọng yếu",
        path: "/rui-ro/trong-yeu",
      },
      { key: "ma-tran", label: "Ma trận rủi ro", path: "/rui-ro/ma-tran" },
      { key: "kri", label: "Chỉ số cảnh báo (KRI)", path: "/rui-ro/kri" },
      { key: "danh-muc", label: "Danh mục rủi ro", path: "/rui-ro/danh-muc" },
    ],
  },
  {
    key: "kiem-soat",
    label: "Kiểm soát",
    icon: IconShieldCheck,
    basePath: "/kiem-soat",
    items: [
      {
        key: "so-dang-ky",
        label: "Sổ đăng ký kiểm soát",
        path: "/kiem-soat/so-dang-ky",
      },
      {
        key: "ma-tran",
        label: "Ma trận kiểm soát",
        path: "/kiem-soat/ma-tran",
      },
      {
        key: "ket-qua-kiem-tra",
        label: "Kết quả kiểm tra kiểm soát",
        path: "/kiem-soat/ket-qua-kiem-tra",
      },
      {
        key: "ngoai-le",
        label: "Ngoại lệ kiểm soát",
        path: "/kiem-soat/ngoai-le",
      },
    ],
  },
  {
    key: "khac-phuc",
    label: "Khắc phục & phòng ngừa",
    shortLabel: "Khắc phục",
    icon: IconTool,
    basePath: "/khac-phuc",
    items: [
      {
        key: "diem-yeu",
        label: "Sổ theo dõi điểm yếu kiểm soát",
        path: "/khac-phuc/diem-yeu",
      },
      { key: "kppn", label: "Bảng theo dõi KPPN", path: "/khac-phuc/kppn" },
      {
        key: "kppn-qua-han",
        label: "KPPN quá hạn",
        path: "/khac-phuc/kppn-qua-han",
      },
    ],
  },
  {
    key: "su-kien",
    label: "Sự kiện",
    icon: IconBolt,
    basePath: "/su-kien",
    items: [
      {
        key: "so-theo-doi",
        label: "Sổ theo dõi sự kiện",
        path: "/su-kien/so-theo-doi",
      },
      {
        key: "bao-cao-nhanh",
        label: "Báo cáo nhanh",
        path: "/su-kien/bao-cao-nhanh",
      },
      { key: "cua-toi", label: "Sự kiện của tôi", path: "/su-kien/cua-toi" },
    ],
  },
  {
    key: "dao-duc",
    label: "Đạo đức",
    icon: IconScale,
    basePath: "/dao-duc",
    comingSoon: true,
    items: [
      {
        key: "gui-phan-anh",
        label: "Gửi phản ánh",
        path: "/dao-duc/gui-phan-anh",
        comingSoon: true,
      },
      {
        key: "so-theo-doi",
        label: "Sổ theo dõi vụ việc",
        path: "/dao-duc/so-theo-doi",
        comingSoon: true,
        restricted: true,
      },
      {
        key: "cua-toi",
        label: "Vụ việc của tôi",
        path: "/dao-duc/cua-toi",
        comingSoon: true,
        restricted: true,
      },
    ],
  },
  {
    key: "tuan-thu",
    label: "Tuân thủ",
    icon: IconFileCertificate,
    basePath: "/tuan-thu",
    comingSoon: true,
    items: [
      {
        key: "nghia-vu",
        label: "Danh mục nghĩa vụ pháp lý",
        path: "/tuan-thu/nghia-vu",
        comingSoon: true,
      },
      {
        key: "ma-tran",
        label: "Ma trận tuân thủ",
        path: "/tuan-thu/ma-tran",
        comingSoon: true,
      },
      {
        key: "ket-qua",
        label: "Kết quả đánh giá tuân thủ",
        path: "/tuan-thu/ket-qua",
        comingSoon: true,
      },
    ],
  },
  {
    key: "ben-thu-ba",
    label: "Bên thứ ba",
    icon: IconBuildingStore,
    basePath: "/ben-thu-ba",
    comingSoon: true,
    items: [
      {
        key: "doi-tac",
        label: "Danh mục đối tác",
        path: "/ben-thu-ba/doi-tac",
        comingSoon: true,
      },
      {
        key: "danh-gia",
        label: "Đánh giá rủi ro đối tác",
        path: "/ben-thu-ba/danh-gia",
        comingSoon: true,
      },
      {
        key: "su-kien",
        label: "Sự kiện liên quan đối tác",
        path: "/ben-thu-ba/su-kien",
        comingSoon: true,
      },
    ],
  },
  {
    key: "danh-gia-hieu-luc",
    label: "Đánh giá hiệu lực",
    icon: IconGauge,
    basePath: "/danh-gia-hieu-luc",
    comingSoon: true,
    items: [
      {
        key: "ke-hoach",
        label: "Kế hoạch đánh giá",
        path: "/danh-gia-hieu-luc/ke-hoach",
        comingSoon: true,
      },
      {
        key: "ket-qua",
        label: "Kết quả đánh giá",
        path: "/danh-gia-hieu-luc/ket-qua",
        comingSoon: true,
      },
      {
        key: "khuyen-nghi",
        label: "Khuyến nghị cải tiến",
        path: "/danh-gia-hieu-luc/khuyen-nghi",
        comingSoon: true,
      },
    ],
  },
  {
    key: "kiem-toan",
    label: "Kiểm toán",
    icon: IconFileSearch,
    basePath: "/kiem-toan",
    comingSoon: true,
    items: [
      {
        key: "ke-hoach",
        label: "Kế hoạch kiểm toán",
        path: "/kiem-toan/ke-hoach",
        comingSoon: true,
      },
      {
        key: "phat-hien",
        label: "Phát hiện kiểm toán",
        path: "/kiem-toan/phat-hien",
        comingSoon: true,
      },
      {
        key: "theo-doi",
        label: "Theo dõi khắc phục",
        path: "/kiem-toan/theo-doi",
        comingSoon: true,
      },
    ],
  },
  {
    key: "bao-cao",
    label: "Báo cáo",
    icon: IconReport,
    basePath: "/bao-cao",
    comingSoon: true,
    items: [
      {
        key: "dot-xuat",
        label: "Báo cáo đột xuất",
        path: "/bao-cao/dot-xuat",
        comingSoon: true,
      },
      {
        key: "dinh-ky",
        label: "Báo cáo định kỳ",
        path: "/bao-cao/dinh-ky",
        comingSoon: true,
      },
      {
        key: "chuyen-de",
        label: "Báo cáo chuyên đề",
        path: "/bao-cao/chuyen-de",
        comingSoon: true,
      },
      {
        key: "chi-dao",
        label: "Chỉ đạo sau báo cáo",
        path: "/bao-cao/chi-dao",
        comingSoon: true,
      },
      {
        key: "ban-tin",
        label: "Bản tin rủi ro",
        path: "/bao-cao/ban-tin",
        comingSoon: true,
      },
    ],
  },
  {
    key: "phan-tich",
    label: "Phân tích",
    icon: IconChartPie,
    basePath: "/phan-tich",
    comingSoon: true,
    items: [
      {
        key: "tong-quan",
        label: "Tổng quan toàn công ty",
        path: "/phan-tich/tong-quan",
        comingSoon: true,
      },
      {
        key: "theo-don-vi",
        label: "Theo đơn vị",
        path: "/phan-tich/theo-don-vi",
        comingSoon: true,
      },
      {
        key: "rui-ro-kiem-soat",
        label: "Rủi ro & kiểm soát",
        path: "/phan-tich/rui-ro-kiem-soat",
        comingSoon: true,
      },
      {
        key: "su-kien-kppn",
        label: "Sự kiện & KPPN",
        path: "/phan-tich/su-kien-kppn",
        comingSoon: true,
      },
      {
        key: "dao-duc",
        label: "Đạo đức",
        path: "/phan-tich/dao-duc",
        comingSoon: true,
        restricted: true,
      },
      {
        key: "tuy-chinh",
        label: "Báo cáo tuỳ chỉnh",
        path: "/phan-tich/tuy-chinh",
        comingSoon: true,
      },
    ],
  },
  {
    key: "ho-so",
    label: "Hồ sơ",
    icon: IconFolders,
    basePath: "/ho-so",
    comingSoon: true,
    items: [
      {
        key: "kho-ho-so",
        label: "Kho hồ sơ",
        path: "/ho-so/kho-ho-so",
        comingSoon: true,
      },
      {
        key: "luu-ngoai",
        label: "Hồ sơ lưu ngoài",
        path: "/ho-so/luu-ngoai",
        comingSoon: true,
      },
      {
        key: "nhat-ky",
        label: "Nhật ký truy vết",
        path: "/ho-so/nhat-ky",
        comingSoon: true,
        restricted: true,
      },
    ],
  },
  {
    key: "quan-tri",
    label: "Quản trị",
    icon: IconSettings,
    basePath: "/quan-tri",
    items: [
      {
        key: "nguoi-dung",
        label: "Người dùng & phân quyền",
        path: "/quan-tri/nguoi-dung",
        comingSoon: true,
        restricted: true,
      },
      {
        key: "danh-muc-dung-chung",
        label: "Danh mục dùng chung",
        path: "/quan-tri/danh-muc-dung-chung",
        restricted: true,
      },
      {
        key: "luong-phe-duyet",
        label: "Luồng phê duyệt",
        path: "/quan-tri/luong-phe-duyet",
        comingSoon: true,
        restricted: true,
      },
      {
        key: "bieu-mau",
        label: "Biểu mẫu",
        path: "/quan-tri/bieu-mau",
        comingSoon: true,
        restricted: true,
      },
      {
        key: "ket-noi-he-thong",
        label: "Kết nối hệ thống",
        path: "/quan-tri/ket-noi-he-thong",
        restricted: true,
      },
      {
        key: "nhat-ky-he-thong",
        label: "Nhật ký hệ thống",
        path: "/quan-tri/nhat-ky-he-thong",
        comingSoon: true,
        restricted: true,
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Tiện ích tra cứu                                        */
/* ------------------------------------------------------------------ */

function isUnder(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

export function findModuleByPath(pathname: string): NavModule | undefined {
  return NAVIGATION.find((m) => isUnder(pathname, m.basePath));
}

export function findItemByPath(
  pathname: string,
): { module: NavModule; item: NavItem } | null {
  for (const m of NAVIGATION) {
    if (!isUnder(pathname, m.basePath)) continue;
    // ưu tiên path dài nhất để tránh nhầm /kppn với /kppn-qua-han
    const matched = [...m.items]
      .filter((it) => isUnder(pathname, it.path))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (matched) return { module: m, item: matched };
  }
  return null;
}

/** Mục đầu tiên của phân hệ, dùng khi bấm vào tên phân hệ */
export function firstItemPath(m: NavModule): string {
  return m.items[0]?.path ?? m.basePath;
}

export interface Crumb {
  label: string;
  path?: string;
}

export function getBreadcrumb(pathname: string): Crumb[] {
  const found = findItemByPath(pathname);
  if (!found) return [];
  const crumbs: Crumb[] = [
    { label: found.module.label, path: firstItemPath(found.module) },
    { label: found.item.label, path: found.item.path },
  ];
  // route chi tiết: /rui-ro/so-dang-ky/RISK-2026-001
  if (pathname !== found.item.path) {
    const last = pathname.slice(found.item.path.length + 1).split("/")[0];
    crumbs.push({ label: decodeURIComponent(last) });
  }
  return crumbs;
}

/** Tiêu đề hiển thị trên thanh PageHeader mặc định */
export function getPageTitle(pathname: string): string {
  return findItemByPath(pathname)?.item.label ?? "MISA GRC";
}
