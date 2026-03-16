"use client";

import { useState } from "react";
import Link from "next/link";
import { signup } from "../actions";

export default function RegisterPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const result = await signup(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="vc-glass w-full max-w-sm space-y-6 rounded-2xl p-8 vc-animate-in">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          <span className="vc-gradient-text">VidClaw</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--vc-text-secondary)]">创建新账号</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-zinc-300">
            昵称
          </label>
          <input
            id="name"
            name="name"
            type="text"
            className="mt-1 w-full rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors duration-150 focus:border-[var(--vc-accent)] focus:ring-1 focus:ring-[var(--vc-accent)]/50"
            placeholder="你的昵称"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors duration-150 focus:border-[var(--vc-accent)] focus:ring-1 focus:ring-[var(--vc-accent)]/50"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors duration-150 focus:border-[var(--vc-accent)] focus:ring-1 focus:ring-[var(--vc-accent)]/50"
            placeholder="至少 6 位"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="vc-gradient-btn w-full rounded-[var(--vc-radius-md)] px-4 py-2.5 text-sm font-medium"
        >
          {loading ? "注册中..." : "注册"}
        </button>
      </form>

      <p className="text-center text-sm text-[var(--vc-text-muted)]">
        已有账号？{" "}
        <Link href="/login" className="text-[var(--vc-accent)] transition-colors hover:text-[var(--vc-accent-hover)]">
          登录
        </Link>
      </p>
    </div>
  );
}
