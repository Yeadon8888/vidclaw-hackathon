"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  status: "active" | "suspended";
  credits: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(data.users ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function updateUser(userId: string, updates: Partial<User>) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });
    fetchUsers();
  }

  async function grantCredits(userId: string) {
    const input = prompt("输入充值积分数量（正数充值，负数扣减）：");
    if (!input) return;
    const amount = parseInt(input, 10);
    if (isNaN(amount) || amount === 0) return;
    const reason = prompt("备注原因（可选）：") || undefined;
    await fetch("/api/admin/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, amount, reason }),
    });
    fetchUsers();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">管理后台</h1>
        <p className="text-sm text-[var(--vc-text-muted)]">管理用户、积分、模型和任务</p>
      </div>

      <AdminTabs />

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="text"
          placeholder="搜索邮箱或用户名..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white placeholder-zinc-500 transition-colors focus:border-purple-500 focus:outline-none sm:w-72"
        />
        <span className="text-sm text-[var(--vc-text-muted)]">共 {total} 个用户</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--vc-radius-lg)] border border-[var(--vc-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--vc-bg-surface)] text-[var(--vc-text-secondary)]">
            <tr>
              <th className="px-4 py-3 text-left">邮箱</th>
              <th className="px-4 py-3 text-left">用户名</th>
              <th className="px-4 py-3 text-center">角色</th>
              <th className="px-4 py-3 text-center">状态</th>
              <th className="px-4 py-3 text-right">积分</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--vc-border)]">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--vc-text-muted)]">
                  加载中...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--vc-text-muted)]">
                  暂无用户
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white">{u.email}</td>
                  <td className="px-4 py-3 text-zinc-300">{u.name || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.role === "admin"
                          ? "bg-purple-500/20 text-purple-400"
                          : "bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.status === "active"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {u.credits}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => grantCredits(u.id)}
                        className="vc-gradient-btn rounded-[var(--vc-radius-sm)] px-2 py-1 text-xs"
                      >
                        充值
                      </button>
                      <button
                        onClick={() =>
                          updateUser(u.id, {
                            status: u.status === "active" ? "suspended" : "active",
                          })
                        }
                        className={`rounded px-2 py-1 text-xs ${
                          u.status === "active"
                            ? "bg-red-600/80 text-white hover:bg-red-500"
                            : "bg-green-600/80 text-white hover:bg-green-500"
                        }`}
                      >
                        {u.status === "active" ? "停用" : "启用"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-[var(--vc-radius-md)] bg-[var(--vc-bg-elevated)] px-3 py-1 text-sm text-zinc-300 transition-colors hover:bg-zinc-600 disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm tabular-nums text-[var(--vc-text-muted)]">
            第 {page} / {Math.ceil(total / 20)} 页
          </span>
          <button
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage(page + 1)}
            className="rounded-[var(--vc-radius-md)] bg-[var(--vc-bg-elevated)] px-3 py-1 text-sm text-zinc-300 transition-colors hover:bg-zinc-600 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
