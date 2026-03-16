"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  History,
  ImageIcon,
  Settings,
  Shield,
  X,
} from "lucide-react";
import type { User } from "@/lib/db/schema";

interface SidebarProps {
  user: User;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const userLinks = [
  { href: "/generate", label: "生成视频", icon: Clapperboard },
  { href: "/tasks", label: "任务历史", icon: History },
  { href: "/assets", label: "参考图片", icon: ImageIcon },
  { href: "/settings", label: "设置", icon: Settings },
];

const adminLinks = [
  { href: "/admin", label: "管理后台", icon: Shield },
];

export function Sidebar({ user, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  const links = [
    ...userLinks,
    ...(user.role === "admin" ? adminLinks : []),
  ];

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onMobileClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">⚡</span>
          <span className="vc-gradient-text text-lg font-bold tracking-tight">
            VidClaw
          </span>
        </div>
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="rounded-[var(--vc-radius-sm)] p-1 text-[var(--vc-text-muted)] transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {links.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`group flex items-center gap-3 rounded-[var(--vc-radius-md)] px-3 py-2.5 text-sm transition-all duration-150 ${
                isActive
                  ? "bg-[var(--vc-accent)]/12 text-[var(--vc-accent)] shadow-[inset_0_0_0_1px_rgba(13,204,242,0.15)]"
                  : "text-[var(--vc-text-secondary)] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <link.icon className={`h-4 w-4 transition-transform duration-150 ${isActive ? "" : "group-hover:scale-110"}`} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Credits badge */}
      <div className="border-t border-[var(--vc-border-subtle)] px-4 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--vc-text-muted)]">积分余额</span>
          <span className="font-semibold tabular-nums text-white">{user.credits}</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside className="vc-glass hidden w-56 flex-col rounded-none border-0 border-r border-[var(--vc-border-subtle)] md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--vc-bg-surface)] shadow-2xl md:hidden"
            style={{ animation: "vc-slide-in-left var(--vc-duration-slow) var(--vc-ease) both" }}
          >
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
