"use client";

import { useState } from "react";
import { IconLock } from "@tabler/icons-react";
import { Badge, EmptyState, Tabs } from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { useSession } from "@/config/session";
import TabDonVi from "./TabDonVi";
import TabNhanSu from "./TabNhanSu";
import TabNhomRuiRo from "./TabNhomRuiRo";
import TabNhomSuKien from "./TabNhomSuKien";
import TabMaTran from "./TabMaTran";
import TabKetNoi from "./TabKetNoi";

type TabKey =
  | "don-vi"
  | "nhan-su"
  | "nhom-rui-ro"
  | "nhom-su-kien"
  | "ma-tran"
  | "ket-noi";

export default function QuanTriDanhMucScreen() {
  const { hasRole } = useSession();
  const [tab, setTab] = useState<TabKey>("don-vi");

  /** Chỉ Quản trị hệ thống được sửa danh mục, các vai trò còn lại chỉ xem */
  const canEdit = hasRole("admin");
  const canView = hasRole("admin", "qtrr", "auditor");

  if (!canView) {
    return (
      <PageContainer>
        <PageHeader title="Quản trị danh mục" />
        <PageBody>
          <ContentCard>
            <EmptyState
              icon={<IconLock size={24} />}
              title="Bạn không có quyền truy cập màn hình này"
              description="Danh mục dùng chung chỉ dành cho Quản trị hệ thống, Ban QTRR và Kiểm toán nội bộ. Thay đổi tại đây ảnh hưởng tới dữ liệu của cả 4 phân hệ."
            />
          </ContentCard>
        </PageBody>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Quản trị danh mục dùng chung"
        subtitle="Dữ liệu nền được cả 4 phân hệ tham chiếu, thay đổi tại đây ảnh hưởng toàn hệ thống"
        showBreadcrumb={false}
        badge={
          canEdit ? (
            <Badge tone="brand" dot>
              Quyền chỉnh sửa
            </Badge>
          ) : (
            <Badge tone="neutral" dot>
              Chế độ chỉ đọc
            </Badge>
          )
        }
      />

      <PageBody>
        <ContentCard padded={false} className="overflow-hidden">
          <div className="px-3">
            <Tabs
              value={tab}
              onChange={(k) => setTab(k as TabKey)}
              items={[
                { key: "don-vi", label: "Đơn vị" },
                { key: "nhan-su", label: "Nhân sự" },
                { key: "nhom-rui-ro", label: "Nhóm rủi ro" },
                { key: "nhom-su-kien", label: "Nhóm sự kiện" },
                { key: "ma-tran", label: "Ma trận rủi ro" },
                { key: "ket-noi", label: "Kết nối hệ thống" },
              ]}
            />
          </div>

          <div className="p-4">
            {tab === "don-vi" && <TabDonVi canEdit={canEdit} />}
            {tab === "nhan-su" && <TabNhanSu canEdit={canEdit} />}
            {tab === "nhom-rui-ro" && <TabNhomRuiRo canEdit={canEdit} />}
            {tab === "nhom-su-kien" && <TabNhomSuKien canEdit={canEdit} />}
            {tab === "ma-tran" && <TabMaTran canEdit={canEdit} />}
            {tab === "ket-noi" && <TabKetNoi canEdit={canEdit} />}
          </div>
        </ContentCard>
      </PageBody>
    </PageContainer>
  );
}
