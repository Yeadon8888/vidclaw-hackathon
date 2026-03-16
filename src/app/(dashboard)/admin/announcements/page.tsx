"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Trash2, Plus, Megaphone } from "lucide-react";

interface Announcement {
  id: string;
  content: string;
  createdBy: string | null;
  createdAt: string;
}

export default function AdminAnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/announcements");
    const data = await res.json();
    setList(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function handleCreate() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim() }),
    });
    setContent("");
    setSubmitting(false);
    fetchList();
  }

  async function handleDelete(id: string) {
    if (!confirm("确认删除这条公告？")) return;
    await fetch(`/api/admin/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    fetchList();
  }

  return (
    <div className="space-y-6">
      <AdminTabs />

      <div className="px-4 md:px-6">
        {/* Create form */}
        <div className="vc-card mb-6 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
            <Megaphone className="h-4 w-4 text-[var(--vc-accent)]" />
            发布新公告
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="输入公告内容..."
              className="flex-1 rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-elevated)] px-3 py-2 text-sm text-white placeholder-[var(--vc-text-muted)] outline-none focus:border-[var(--vc-accent)]"
            />
            <button
              onClick={handleCreate}
              disabled={!content.trim() || submitting}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--vc-accent)] px-4 py-2 text-sm font-medium text-black transition-opacity disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              发布
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--vc-text-muted)]">加载中...</div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--vc-text-muted)]">暂无公告</div>
        ) : (
          <div className="space-y-3">
            {list.map((item) => (
              <div
                key={item.id}
                className="vc-card flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{item.content}</p>
                  <p className="mt-1 text-xs text-[var(--vc-text-muted)]">
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--vc-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="删除公告"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
