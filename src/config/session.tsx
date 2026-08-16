"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { usePersistentState } from "@/lib/hooks";

export type RoleKey = "admin" | "qtrr" | "owner" | "auditor" | "staff";

export interface AppRole {
  key: RoleKey;
  label: string;
  /** Mô tả ngắn hiển thị trong menu chọn vai trò */
  description: string;
}

export const ROLES: AppRole[] = [
  { key: "admin", label: "Quản trị hệ thống", description: "Toàn quyền cấu hình" },
  { key: "qtrr", label: "Ban QTRR / CRO", description: "Rà soát, tổng hợp, báo cáo" },
  { key: "owner", label: "Chủ sở hữu rủi ro", description: "Tuyến 1 - tạo và cập nhật" },
  { key: "auditor", label: "Kiểm toán nội bộ", description: "Tuyến 3 - chỉ xem" },
  { key: "staff", label: "Cán bộ nhân viên", description: "Báo cáo sự kiện, phản ánh" },
];

export interface AppUser {
  id: string;
  name: string;
  title: string;
  unit: string;
  email: string;
}

const USER_BY_ROLE: Record<RoleKey, AppUser> = {
  admin: {
    id: "u-admin",
    name: "Đỗ Hải Yến",
    title: "Quản trị hệ thống",
    unit: "Trung tâm CNTT",
    email: "yendh@misa.com.vn",
  },
  qtrr: {
    id: "u-qtrr",
    name: "Trần Thu Hà",
    title: "Trưởng ban QTRR",
    unit: "Ban Quản trị rủi ro",
    email: "hatt@misa.com.vn",
  },
  owner: {
    id: "u-owner",
    name: "Nguyễn Văn Bình",
    title: "Giám đốc Khối Sản xuất",
    unit: "Khối Sản xuất",
    email: "binhnv@misa.com.vn",
  },
  auditor: {
    id: "u-auditor",
    name: "Phạm Ngọc Ánh",
    title: "Trưởng phòng KTNB",
    unit: "Phòng Kiểm toán nội bộ",
    email: "anhpn@misa.com.vn",
  },
  staff: {
    id: "u-staff",
    name: "Lê Minh Quang",
    title: "Chuyên viên",
    unit: "Phòng Kinh doanh 1",
    email: "quanglm@misa.com.vn",
  },
};

interface SessionValue {
  role: AppRole;
  user: AppUser;
  setRole: (key: RoleKey) => void;
  /** Kiểm tra vai trò hiện tại có nằm trong danh sách cho phép không */
  hasRole: (...keys: RoleKey[]) => boolean;
  ready: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession phải nằm trong <SessionProvider>");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [roleKey, setRoleKey, ready] = usePersistentState<RoleKey>(
    "misa-grc:role",
    "qtrr"
  );

  const value = useMemo<SessionValue>(() => {
    const role = ROLES.find((r) => r.key === roleKey) ?? ROLES[1];
    return {
      role,
      user: USER_BY_ROLE[role.key],
      setRole: setRoleKey,
      hasRole: (...keys) => keys.includes(role.key),
      ready,
    };
  }, [roleKey, setRoleKey, ready]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
