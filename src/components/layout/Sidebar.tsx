"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronRight, IconLock } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import {
  NAVIGATION,
  findModuleByPath,
  firstItemPath,
  type NavItem,
  type NavModule,
} from "@/config/navigation";

/* ------------------------------------------------------------------ */

function ItemLink({
  item,
  active,
  compact = false,
}: {
  item: NavItem;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={item.path}
      className={cn(
        "group/item flex items-center gap-1.5 rounded-ctrl py-1.5 pr-2 text-[13px] transition-colors",
        compact ? "pl-2.5" : "pl-9",
        active
          ? "bg-brand-light font-medium text-brand"
          : "text-text-secondary hover:bg-[#F5F5F5] hover:text-text-primary",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.restricted && (
        <IconLock size={13} className="shrink-0 text-text-hint" />
      )}
      {item.comingSoon && (
        <span className="shrink-0 rounded-[4px] bg-[#F0F0F0] px-1 text-[10px] font-medium text-text-hint">
          Sắp có
        </span>
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ */

function ModuleBlock({
  mod,
  collapsed,
  open,
  activeModuleKey,
  pathname,
  onToggle,
}: {
  mod: NavModule;
  collapsed: boolean;
  open: boolean;
  activeModuleKey?: string;
  pathname: string;
  onToggle: () => void;
}) {
  const Icon = mod.icon;
  const isActiveModule = mod.key === activeModuleKey;

  /* ---------- Chế độ thu gọn: icon + flyout khi hover ---------- */
  if (collapsed) {
    return (
      <div className="group relative">
        <Link
          href={firstItemPath(mod)}
          className={cn(
            "mx-auto flex h-9 w-9 items-center justify-center rounded-ctrl transition-colors",
            isActiveModule
              ? "bg-brand-light text-brand"
              : "text-icon-neutral hover:bg-[#F5F5F5] hover:text-text-primary",
          )}
        >
          <Icon size={19} />
        </Link>

        <div className="pointer-events-none absolute top-0 left-full z-50 hidden pl-2 group-hover:block group-hover:pointer-events-auto">
          <div className="w-[248px] overflow-hidden rounded-card bg-white p-1.5 shadow-dropdown">
            <p className="px-2 py-1.5 text-[13px] font-semibold text-text-primary">
              {mod.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {mod.items.map((it) => (
                <ItemLink
                  key={it.key}
                  item={it}
                  compact
                  active={
                    pathname === it.path || pathname.startsWith(it.path + "/")
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Chế độ đầy đủ: accordion ---------- */
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-ctrl px-2 py-1.5 text-left transition-colors",
          isActiveModule
            ? "text-brand"
            : "text-text-primary hover:bg-[#F5F5F5]",
        )}
      >
        <Icon
          size={18}
          className={cn(
            "shrink-0",
            isActiveModule ? "text-brand" : "text-icon-neutral",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            isActiveModule ? "font-semibold" : "font-medium",
          )}
        >
          {mod.label}
        </span>
        <IconChevronRight
          size={15}
          className={cn(
            "shrink-0 text-icon-neutral transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {mod.items.map((it) => (
            <ItemLink
              key={it.key}
              item={it}
              active={
                pathname === it.path || pathname.startsWith(it.path + "/")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const activeModule = findModuleByPath(pathname);
  const [openKey, setOpenKey] = useState<string | null>(
    activeModule?.key ?? "rui-ro",
  );

  // Tự mở phân hệ tương ứng khi điều hướng
  useEffect(() => {
    if (activeModule) setOpenKey(activeModule.key);
  }, [activeModule?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border-light bg-white transition-[width] duration-200",
        collapsed ? "w-14" : "w-[232px]",
      )}
    >
      <nav
        className={cn(
          "flex flex-1 flex-col gap-0.5 overflow-x-visible overflow-y-auto py-2",
          collapsed ? "px-1.5" : "px-2",
        )}
      >
        {NAVIGATION.map((mod) => (
          <ModuleBlock
            key={mod.key}
            mod={mod}
            collapsed={collapsed}
            open={openKey === mod.key}
            activeModuleKey={activeModule?.key}
            pathname={pathname}
            onToggle={() => setOpenKey((k) => (k === mod.key ? null : mod.key))}
          />
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-border-light px-3 py-2">
          <p className="text-[11px] text-text-hint">
            MISA GRC Demo - phiên bản 0.1
          </p>
          <p className="text-[11px] text-text-hint">
            Dữ liệu lưu tạm trên trình duyệt
          </p>
        </div>
      )}
    </aside>
  );
}
