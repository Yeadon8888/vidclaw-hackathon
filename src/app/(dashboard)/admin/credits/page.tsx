"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";

interface CreditTxn {
  id: string;
  userId: string;
  type: "grant" | "consume" | "refund" | "adjust";
  amount: number;
  reason: string | null;
  balanceAfter: number;
  createdAt: string;
}

export default function AdminCreditsPage() {
  const [userId, setUserId] = useState("");
  const [transactions, setTransactions] = useState<CreditTxn[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTxns = useCallback(async () => {
    if (!userId.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/admin/credits?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    setTransactions(data.transactions ?? []);
    setLoading(false);
  }, [userId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">管理后台</h1>
        <p className="text-sm text-[var(--vc-text-muted)]">管理用户、积分、模型和任务</p>
      </div>

      <AdminTabs />

      {/* Search by User ID */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="输入用户 ID 查询积分流水..."
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-96 rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white placeholder-zinc-500 transition-colors focus:border-[var(--vc-accent)] focus:outline-none"
        />
        <button
          onClick={fetchTxns}
          disabled={!userId.trim()}
          className="vc-gradient-btn rounded-[var(--vc-radius-md)] px-4 py-2 text-sm"
        >
          查询
        </button>
      </div>

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
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--vc-text-muted)]">
                    加载中...
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-zinc-800/50">
                    <td className="px-4 py-3 text-zinc-300">
                      {new Date(txn.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          txn.type === "grant"
                            ? "bg-green-500/20 text-green-400"
                            : txn.type === "consume"
                              ? "bg-red-500/20 text-red-400"
                              : txn.type === "refund"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-zinc-700 text-zinc-300"
                        }`}
                      >
                        {txn.type === "grant"
                          ? "充值"
                          : txn.type === "consume"
                            ? "消费"
                            : txn.type === "refund"
                              ? "退款"
                              : "调整"}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && userId.trim() && transactions.length === 0 && (
        <p className="text-center text-sm text-zinc-500">暂无积分记录</p>
      )}
    </div>
  );
}
