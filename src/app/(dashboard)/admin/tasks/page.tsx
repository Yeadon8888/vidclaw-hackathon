"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";

interface TaskRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  type: "theme" | "remix" | "url";
  status: string;
  creditsCost: number;
  paramsJson: { model?: string; count?: number } | null;
  createdAt: string;
  completedAt: string | null;
}

export default function AdminTasksPage() {
  const [taskList, setTasks] = useState<TaskRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/tasks?${params}`);
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    analyzing: "bg-blue-500/20 text-blue-400",
    generating: "bg-purple-500/20 text-purple-400",
    polling: "bg-cyan-500/20 text-cyan-400",
    done: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">管理后台</h1>
        <p className="text-sm text-[var(--vc-text-muted)]">管理用户、积分、模型和任务</p>
      </div>

      <AdminTabs />

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white transition-colors focus:border-purple-500 focus:outline-none"
        >
          <option value="">全部状态</option>
          <option value="pending">等待中</option>
          <option value="analyzing">分析中</option>
          <option value="generating">生成中</option>
          <option value="polling">轮询中</option>
          <option value="done">已完成</option>
          <option value="failed">已失败</option>
        </select>
        <span className="text-sm text-[var(--vc-text-muted)]">共 {total} 条任务</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--vc-radius-lg)] border border-[var(--vc-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--vc-bg-surface)] text-[var(--vc-text-secondary)]">
            <tr>
              <th className="px-4 py-3 text-left">用户</th>
              <th className="px-4 py-3 text-center">类型</th>
              <th className="px-4 py-3 text-center">状态</th>
              <th className="px-4 py-3 text-left">模型</th>
              <th className="px-4 py-3 text-right">积分</th>
              <th className="px-4 py-3 text-left">创建时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--vc-border)]">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--vc-text-muted)]">
                  加载中...
                </td>
              </tr>
            ) : taskList.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--vc-text-muted)]">
                  暂无任务
                </td>
              </tr>
            ) : (
              taskList.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="text-white">{t.userEmail}</div>
                    {t.userName && (
                      <div className="text-xs text-zinc-500">{t.userName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-300">
                    {t.type}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        statusColors[t.status] ?? "bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">
                    {t.paramsJson?.model || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {t.creditsCost}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(t.createdAt).toLocaleString("zh-CN")}
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
