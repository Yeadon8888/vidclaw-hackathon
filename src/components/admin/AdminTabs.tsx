"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Coins, Settings2, ListTodo, Megaphone } from "lucide-react";

const tabs = [
  { href: "/admin", label: "用户管理", icon: Users },
  { href: "/admin/credits", label: "积分管理", icon: Coins },
  { href: "/admin/models", label: "模型配置", icon: Settings2 },
  { href: "/admin/tasks", label: "任务监控", icon: ListTodo },
  { href: "/admin/announcements", label: "公告管理", icon: Megaphone },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-[var(--vc-border-subtle)] px-1">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors duration-150 ${
              isActive
                ? "border-[var(--vc-accent)] text-[var(--vc-accent)]"
                : "border-transparent text-[var(--vc-text-secondary)] hover:text-white"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
