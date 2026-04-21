"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  History,
  ImageIcon,
  Images,
  UserCircle,
  Settings,
  Shield,
  Coins,
  ScanSearch,
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
  { href: "/analyze", label: "视频拆解", icon: ScanSearch },
  { href: "/scene", label: "商品组图", icon: Images },
  // { href: "/face-swap", label: "视频换人", icon: UserCircle }, // 暂未开放
  { href: "/tasks", label: "任务历史", icon: History },
  { href: "/assets", label: "产品图片", icon: ImageIcon },
  { href: "/pricing", label: "积分充值", icon: Coins },
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
      {/* Logo — clicking returns to the public landing page */}
      <div className="flex items-center justify-between px-5 py-5">
        <Link
          href="/"
          aria-label="返回首页"
          title="返回首页"
          className="flex items-center gap-2.5 rounded-[var(--vc-radius-sm)] transition-opacity duration-150 hover:opacity-80"
        >
          <span className="text-lg">⚡</span>
          <span className="vc-gradient-text text-lg font-bold tracking-tight">
            VidClaw
          </span>
        </Link>
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
              className={`group flex items-center gap-3 rounded-[var(--vc-radius-md)] px-4 py-3 text-sm transition-all duration-150 ${
                isActive
                  ? "bg-[var(--vc-accent)]/10 font-medium text-[var(--vc-accent)]"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <link.icon className={`h-4 w-4 transition-transform duration-150 ${isActive ? "" : "group-hover:scale-110"}`} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Credits progress */}
      <div className="mt-auto border-t border-[var(--vc-border-subtle)] px-4 py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">积分余额</span>
          <span className="font-semibold tabular-nums text-white">{user.credits}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--vc-accent)] to-purple-400 transition-all duration-500"
            style={{ width: `${Math.min(100, (user.credits / 500) * 100)}%` }}
          />
        </div>
        <Link
          href="/pricing"
          className="block text-center text-xs text-[var(--vc-accent)] transition-colors hover:text-[var(--vc-accent)]/80"
        >
          充值积分 →
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside className="vc-glass hidden w-64 flex-col rounded-none border-0 border-r border-slate-800 md:flex">
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
