"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminTabs } from "@/components/admin/AdminTabs";

interface CreditTxn {
  id: string;
  userId: string;
  type: "grant" | "consume" | "refund" | "adjust" | "payment";
  amount: number;
  reason: string | null;
  balanceAfter: number;
  createdAt: string;
}

interface MatchedUser {
  id: string;
  email: string;
  name: string | null;
}

interface TargetUser extends MatchedUser {
  credits: number;
}

const TYPE_LABELS: Record<CreditTxn["type"], string> = {
  grant: "充值",
  consume: "消费",
  refund: "退款",
  adjust: "调整",
  payment: "支付",
};

const TYPE_STYLES: Record<CreditTxn["type"], string> = {
  grant: "bg-green-500/20 text-green-400",
  consume: "bg-red-500/20 text-red-400",
  refund: "bg-blue-500/20 text-blue-400",
  adjust: "bg-zinc-700 text-zinc-300",
  payment: "bg-cyan-500/20 text-cyan-300",
};

export default function AdminCreditsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get("userId") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [transactions, setTransactions] = useState<CreditTxn[]>([]);
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null);
  const [matches, setMatches] = useState<MatchedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuery = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setMatches([]);

      try {
        const res = await fetch(
          `/api/admin/credits?userId=${encodeURIComponent(trimmed)}`,
        );
        const data = await res.json();

        if (res.status === 404) {
          setError(data.error ?? "未找到用户");
          setTransactions([]);
          setTargetUser(null);
        } else if (res.status === 409) {
          // 多个匹配：展示候选让用户点一下
          setError(data.error ?? "匹配到多个用户");
          setMatches((data.matches as MatchedUser[]) ?? []);
          setTransactions([]);
          setTargetUser(null);
        } else if (!res.ok) {
          setError(data.error ?? `查询失败 (HTTP ${res.status})`);
          setTransactions([]);
          setTargetUser(null);
        } else {
          setTransactions(data.transactions ?? []);
          setTargetUser(data.user ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "查询失败");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // 从 URL 进来时自动查询
  useEffect(() => {
    if (initialQuery) {
      void runQuery(initialQuery);
    }
  }, [initialQuery, runQuery]);

  function submitQuery() {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.replace(`/admin/credits?userId=${encodeURIComponent(trimmed)}`);
    void runQuery(trimmed);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">管理后台</h1>
        <p className="text-sm text-[var(--vc-text-muted)]">管理用户、积分、模型和任务</p>
      </div>

      <AdminTabs />

      {/* Search — 支持 邮箱 / 用户名 / 用户 ID 三种输入 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="输入邮箱、用户名或用户 ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitQuery();
            }}
            className="w-96 rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[var(--vc-accent)] focus:outline-none"
          />
          <button
            onClick={submitQuery}
            disabled={!query.trim() || loading}
            className="vc-gradient-btn rounded-[var(--vc-radius-md)] px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading ? "查询中..." : "查询"}
          </button>
          <Link
            href="/admin"
            className="rounded-[var(--vc-radius-sm)] border border-[var(--vc-border)] px-3 py-1.5 text-xs text-[var(--vc-text-muted)] transition-colors hover:text-white"
          >
            从用户列表选择 →
          </Link>
        </div>
        <p className="text-xs text-zinc-500">
          支持完整邮箱、邮箱前缀、用户名或用户 ID 精确查找；模糊匹配到多个用户时会列出候选让你选。
        </p>
      </div>

      {/* 命中用户：显示上下文 */}
      {targetUser && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] px-4 py-3">
          <div className="flex flex-col text-sm">
            <span className="text-[var(--vc-text-muted)]">当前查看</span>
            <span className="font-mono text-white">
              {targetUser.email}
              {targetUser.name && (
                <span className="ml-2 text-zinc-400">（{targetUser.name}）</span>
              )}
            </span>
            <span className="font-mono text-xs text-zinc-500">{targetUser.id}</span>
          </div>
          <div className="text-right text-sm">
            <span className="text-[var(--vc-text-muted)]">当前余额</span>
            <div className="font-mono text-lg text-white">{targetUser.credits}</div>
          </div>
        </div>
      )}

      {/* 错误 / 提示 */}
      {error && !matches.length && (
        <div className="rounded-[var(--vc-radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* 多候选：点一下直接查对应用户 */}
      {matches.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--vc-radius-md)] border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          <span>{error}</span>
          <div className="mt-2 flex flex-col gap-1">
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setQuery(m.email);
                  router.replace(
                    `/admin/credits?userId=${encodeURIComponent(m.email)}`,
                  );
                  void runQuery(m.email);
                }}
                className="flex items-center justify-between rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-left text-xs transition-colors hover:bg-yellow-500/10"
              >
                <span className="font-mono text-yellow-100">{m.email}</span>
                {m.name && <span className="text-zinc-400">{m.name}</span>}
                <span className="font-mono text-[10px] text-zinc-500">{m.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transaction Table */}
      {transactions.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--vc-radius-lg)] border border-[var(--vc-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--vc-bg-surface)] text-[var(--vc-text-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left">时间</th>
                <th className="px-4 py-3 text-center">类型</th>
                <th className="px-4 py-3 text-right">金额</th>
                <th className="px-4 py-3 text-right">余额</th>
                <th className="px-4 py-3 text-left">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--vc-border)]">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-zinc-800/50">
                  <td className="px-4 py-3 text-zinc-300">
                    {new Date(txn.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${TYPE_STYLES[txn.type] ?? TYPE_STYLES.adjust}`}
                    >
                      {TYPE_LABELS[txn.type] ?? txn.type}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      txn.amount > 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {txn.amount > 0 ? "+" : ""}
                    {txn.amount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {txn.balanceAfter}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {txn.reason || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {targetUser && !loading && transactions.length === 0 && (
        <p className="text-center text-sm text-zinc-500">该用户暂无积分流水</p>
      )}
    </div>
  );
}
