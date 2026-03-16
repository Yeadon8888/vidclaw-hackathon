"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "../actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const result = await login(formData);
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
        <p className="mt-2 text-sm text-[var(--vc-text-secondary)]">登录你的账号</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {justRegistered && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400">
            注册成功！请查收验证邮件后登录
          </div>
        )}
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
            placeholder="••••••••"
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
          {loading ? "登录中..." : "登录"}
        </button>
      </form>

      <p className="text-center text-sm text-[var(--vc-text-muted)]">
        还没有账号？{" "}
        <Link href="/register" className="text-[var(--vc-accent)] transition-colors hover:text-[var(--vc-accent-hover)]">
          注册
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
