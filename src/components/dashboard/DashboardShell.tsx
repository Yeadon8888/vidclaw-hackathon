"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { User } from "@/lib/db/schema";

interface DashboardShellProps {
  user: User;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen bg-[var(--vc-bg-root)]">
      <Sidebar user={user} mobileOpen={sidebarOpen} onMobileClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={user} onMenuClick={openSidebar} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
