"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconBell,
  IconChevronDown,
  IconCircleCheck,
  IconHelp,
  IconLogout,
  IconMenu2,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { useClickOutside } from "@/lib/hooks";
import { ROLES, useSession } from "@/config/session";
import { Avatar, IconButton, Tooltip } from "@/components/ui";

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, role, setRole } = useSession();
  const [openUser, setOpenUser] = useState(false);
  const userRef = useClickOutside<HTMLDivElement>(
    () => setOpenUser(false),
    openUser,
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-light bg-white pr-3 pl-2">
      {/* Logo + nút thu gọn */}
      <div className="flex items-center gap-1.5">
        <IconButton label="Thu gọn menu" onClick={onToggleSidebar}>
          <IconMenu2 size={18} />
        </IconButton>

        <Link href="/trang-chu/bang-tin" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-brand text-[13px] font-bold text-white">
            G
          </span>
          <span className="text-[15px] font-semibold text-text-primary">
            MISA <span className="text-brand">GRC</span>
          </span>
        </Link>
      </div>

      {/* Tìm kiếm toàn hệ thống */}
      <div className="mx-auto hidden w-[420px] md:block">
        <div className="relative">
          <IconSearch
            size={16}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-icon-neutral"
          />
          <input
            placeholder="Tìm rủi ro, kiểm soát, sự kiện, KPPN..."
            className={cn(
              "h-8 w-full rounded-ctrl border border-transparent bg-fill-input pr-3 pl-8",
              "text-[13px] text-text-primary placeholder:text-text-hint",
              "outline-none transition-colors focus:border-brand focus:bg-white",
            )}
          />
        </div>
      </div>

      {/* Nhóm hành động bên phải */}
      <div className="ml-auto flex items-center gap-1">
        <Tooltip content="Trợ lý AI">
          <button
            type="button"
            className="btn-ai-outline inline-flex h-8 items-center gap-1.5 rounded-ctrl px-2.5 text-[13px] font-medium"
          >
            <IconSparkles size={16} className="text-[#8B3BFF]" />
            <span className="text-ai hidden lg:inline">Trợ lý AI</span>
          </button>
        </Tooltip>

        <Tooltip content="Thông báo">
          <span className="relative inline-flex">
            <IconButton label="Thông báo">
              <IconBell size={18} />
            </IconButton>
            <span className="pointer-events-none absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              5
            </span>
          </span>
        </Tooltip>

        <Tooltip content="Trợ giúp">
          <IconButton label="Trợ giúp">
            <IconHelp size={18} />
          </IconButton>
        </Tooltip>

        <span className="mx-1 h-5 w-px bg-border-light" />

        {/* Người dùng */}
        <div ref={userRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenUser((o) => !o)}
            className="flex h-9 items-center gap-2 rounded-ctrl px-1.5 transition-colors hover:bg-[#F0F0F0]"
          >
            <Avatar name={user.name} size={26} />
            <span className="hidden flex-col items-start lg:flex">
              <span className="text-[13px] leading-4 font-medium text-text-primary">
                {user.name}
              </span>
              <span className="text-[11px] leading-4 text-text-secondary">
                {role.label}
              </span>
            </span>
            <IconChevronDown
              size={15}
              className={cn(
                "text-icon-neutral transition-transform",
                openUser && "rotate-180",
              )}
            />
          </button>

          {openUser && (
            <div className="animate-fade-in absolute right-0 z-50 mt-1 w-[300px] overflow-hidden rounded-card bg-white shadow-dropdown">
              <div className="flex items-center gap-2.5 border-b border-border-light p-3">
                <Avatar name={user.name} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-text-primary">
                    {user.name}
                  </p>
                  <p className="truncate text-[12px] text-text-secondary">
                    {user.title} - {user.unit}
                  </p>
                  <p className="truncate text-[12px] text-text-hint">
                    {user.email}
                  </p>
                </div>
              </div>

              <div className="p-1.5">
                <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-text-hint uppercase">
                  Đổi vai trò (chỉ dùng cho demo)
                </p>
                {ROLES.map((r) => {
                  const active = r.key === role.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setRole(r.key);
                        setOpenUser(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-ctrl px-2 py-1.5 text-left transition-colors hover:bg-brand-light",
                        active && "bg-brand-light",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[13px]",
                            active
                              ? "font-medium text-brand"
                              : "text-text-primary",
                          )}
                        >
                          {r.label}
                        </span>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {r.description}
                        </span>
                      </span>
                      {active && (
                        <IconCircleCheck
                          size={16}
                          className="shrink-0 text-brand"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-border-light p-1.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-ctrl px-2 py-1.5 text-[13px] text-text-primary transition-colors hover:bg-[#F5F5F5]"
                >
                  <IconLogout size={16} className="text-icon-neutral" />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
