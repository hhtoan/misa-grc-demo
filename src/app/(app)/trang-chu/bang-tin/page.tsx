"use client";

import {
  IconAlertTriangle,
  IconBolt,
  IconClockExclamation,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  RiskBadge,
  StatusBadge,
  UserCell,
} from "@/components/ui";
import {
  ContentCard,
  PageBody,
  PageContainer,
  PageHeader,
} from "@/components/layout";
import { useSession } from "@/config/session";

const STATS = [
  {
    label: "Rủi ro đang theo dõi",
    value: "128",
    sub: "+6 trong tháng",
    icon: IconAlertTriangle,
    tone: "text-brand bg-brand-light",
  },
  {
    label: "Rủi ro trọng yếu",
    value: "9",
    sub: "Cần báo cáo UB KT&RR",
    icon: IconShieldCheck,
    tone: "text-lv-critical-text bg-lv-critical-bg",
  },
  {
    label: "KPPN quá hạn",
    value: "14",
    sub: "Đồng bộ từ AMIS Công việc / JIRA",
    icon: IconClockExclamation,
    tone: "text-lv-high-text bg-lv-high-bg",
  },
  {
    label: "Sự kiện trong tháng",
    value: "23",
    sub: "5 đang điều tra",
    icon: IconBolt,
    tone: "text-lv-medium-text bg-lv-medium-bg",
  },
];

const TASKS = [
  {
    code: "RISK-2026-018",
    name: "Gián đoạn hệ thống máy chủ trung tâm dữ liệu",
    level: "Trọng yếu" as const,
    score: 25,
    status: "Chờ duyệt",
    owner: "Nguyễn Văn Bình",
  },
  {
    code: "KPPN-2026-042",
    name: "Bổ sung quy trình sao lưu định kỳ",
    level: "Cao" as const,
    score: 16,
    status: "Quá hạn",
    owner: "Lê Minh Quang",
  },
  {
    code: "EVT-2026-107",
    name: "Sự cố rò rỉ dữ liệu khách hàng tại kênh đại lý",
    level: "Cao" as const,
    score: 15,
    status: "Đang xử lý",
    owner: "Trần Thu Hà",
  },
];

export default function BangTinPage() {
  const { user, role } = useSession();

  return (
    <PageContainer>
      <PageHeader
        title="Bảng tin"
        badge={<Badge tone="brand">{role.label}</Badge>}
        actions={
          <>
            <Button variant="secondary" icon={<IconRefresh size={16} />}>
              Đồng bộ dữ liệu
            </Button>
            <Button variant="primary" icon={<IconPlus size={16} />}>
              Báo cáo nhanh
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          <ContentCard>
            <p className="text-[15px] font-semibold text-text-primary">
              Chào {user.name} 👋
            </p>
            <p className="text-[13px] text-text-secondary">
              {user.title} - {user.unit}. Đây là tổng quan nhanh theo vai trò
              hiện tại của bạn.
            </p>
          </ContentCard>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STATS.map((s) => {
              const Icon = s.icon;
              return (
                <ContentCard key={s.label} className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl ${s.tone}`}
                  >
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] text-text-secondary">{s.label}</p>
                    <p className="text-[22px] leading-7 font-semibold text-text-primary">
                      {s.value}
                    </p>
                    <p className="truncate text-[12px] text-text-hint">
                      {s.sub}
                    </p>
                  </div>
                </ContentCard>
              );
            })}
          </div>

          <ContentCard padded={false}>
            <div className="flex h-14 items-center justify-between border-b border-border-light px-4">
              <h2 className="text-[14px] font-semibold text-text-primary">
                Việc cần xử lý
              </h2>
              <Button variant="text" size="sm" compact>
                Xem tất cả
              </Button>
            </div>
            <div className="divide-y divide-border-light">
              {TASKS.map((t) => (
                <div
                  key={t.code}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FAFAFA]"
                >
                  <span className="w-[150px] shrink-0 text-[13px] font-medium text-brand">
                    {t.code}
                  </span>
                  <span className="min-w-[220px] flex-1 truncate text-[13px] text-text-primary">
                    {t.name}
                  </span>
                  <RiskBadge level={t.level} score={t.score} />
                  <StatusBadge status={t.status} />
                  <div className="w-[190px] shrink-0">
                    <UserCell name={t.owner} size={24} />
                  </div>
                </div>
              ))}
            </div>
          </ContentCard>
        </div>
      </PageBody>
    </PageContainer>
  );
}
