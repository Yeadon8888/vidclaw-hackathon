"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, Menu, Bell } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import type { User } from "@/lib/db/schema";

interface Announcement {
  id: string;
  content: string;
  createdAt: string;
}

interface TopBarProps {
  user: User;
  onMenuClick?: () => void;
}

export function TopBar({ user, onMenuClick }: TopBarProps) {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((data) => setAnnouncements(data))
      .catch(() => {});
  }, []);

  // Load read IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("vc_read_announcements");
      if (stored) setReadIds(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  function handleToggle() {
    setOpen((prev) => !prev);
    // Mark all as read
    if (!open && announcements.length > 0) {
      const allIds = new Set(announcements.map((a) => a.id));
      setReadIds(allIds);
      try {
        localStorage.setItem("vc_read_announcements", JSON.stringify([...allIds]));
      } catch {}
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-800 bg-[var(--vc-bg-root)]/80 px-4 backdrop-blur-md md:px-6">
      {/* Left: hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="rounded-[var(--vc-radius-sm)] p-1.5 text-[var(--vc-text-muted)] transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden md:block" />

      {/* Right: announcements + user info + logout */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Bell / Announcements */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={handleToggle}
            className="relative rounded-[var(--vc-radius-sm)] p-1.5 text-[var(--vc-text-muted)] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] shadow-2xl">
              <div className="border-b border-[var(--vc-border)] px-4 py-3">
                <span className="text-sm font-medium text-white">公告通知</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {announcements.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-[var(--vc-text-muted)]">暂无公告</div>
                ) : (
                  announcements.map((a) => (
                    <div key={a.id} className="border-b border-[var(--vc-border)]/50 px-4 py-3 last:border-b-0">
                      <p className="text-sm text-slate-200">{a.content}</p>
                      <p className="mt-1 text-xs text-[var(--vc-text-dim)]">
                        {new Date(a.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-[var(--vc-text-secondary)]">
          <UserIcon className="hidden h-4 w-4 sm:block" />
          <span className="max-w-[120px] truncate sm:max-w-none">{user.name ?? user.email}</span>
          {user.role === "admin" && (
            <span className="rounded-[var(--vc-radius-sm)] bg-[var(--vc-accent)]/15 px-1.5 py-0.5 text-xs font-medium text-[var(--vc-accent)]">
              管理员
            </span>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1 rounded-[var(--vc-radius-sm)] px-2 py-1 text-sm text-[var(--vc-text-muted)] transition-colors duration-150 hover:bg-white/[0.04] hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">退出</span>
        </button>
      </div>
    </header>
  );
}
