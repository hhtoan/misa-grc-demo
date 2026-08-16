"use client";

import type { ReactNode } from "react";
import { usePersistentState } from "@/lib/hooks";
import { SessionProvider } from "@/config/session";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentState<boolean>(
    "misa-grc:sidebar-collapsed",
    false,
  );

  return (
    <SessionProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-page">
        <Header onToggleSidebar={() => setCollapsed((c) => !c)} />
        <div className="flex min-h-0 flex-1">
          <Sidebar collapsed={collapsed} />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
