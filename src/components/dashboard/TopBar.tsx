"use client";

import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, Menu } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import type { User } from "@/lib/db/schema";

interface TopBarProps {
  user: User;
  onMenuClick?: () => void;
}

export function TopBar({ user, onMenuClick }: TopBarProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--vc-border-subtle)] bg-[var(--vc-bg-root)]/80 px-4 backdrop-blur-sm md:px-6">
      {/* Left: hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="rounded-[var(--vc-radius-sm)] p-1.5 text-[var(--vc-text-muted)] transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden md:block" />

      {/* Right: user info + logout */}
      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex items-center gap-2 text-sm text-[var(--vc-text-secondary)]">
          <UserIcon className="hidden h-4 w-4 sm:block" />
          <span className="max-w-[120px] truncate sm:max-w-none">{user.name ?? user.email}</span>
          {user.role === "admin" && (
            <span className="rounded-[var(--vc-radius-sm)] bg-purple-500/15 px-1.5 py-0.5 text-xs font-medium text-purple-400">
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
