"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";

interface Model {
  id: string;
  name: string;
  slug: string;
  provider: string;
  creditsPerGen: number;
  isActive: boolean;
  apiKey: string | null;
  baseUrl: string | null;
  sortOrder: number;
}

export default function AdminModelsPage() {
  const [modelList, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Model | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", provider: "plato", creditsPerGen: "10", apiKey: "", baseUrl: "" });

  const fetchModels = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/models");
    const data = await res.json();
    setModels(data.models ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  function openEdit(m: Model) {
    setEditing(m);
    setForm({
      name: m.name,
      slug: m.slug,
      provider: m.provider,
      creditsPerGen: String(m.creditsPerGen),
      apiKey: m.apiKey ?? "",
      baseUrl: m.baseUrl ?? "",
    });
  }

  function closeEdit() { setEditing(null); }

  async function saveEdit() {
    if (!editing) return;
    const creditsPerGen = parseInt(form.creditsPerGen, 10);
    if (isNaN(creditsPerGen) || creditsPerGen < 0) return;
    await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: form.name,
        creditsPerGen,
        apiKey: form.apiKey || null,
        baseUrl: form.baseUrl || null,
      }),
    });
    closeEdit();
    fetchModels();
  }

  async function toggleActive(model: Model) {
    await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: model.id, isActive: !model.isActive }),
    });
    fetchModels();
  }

  async function deleteModel(model: Model) {
    if (!confirm(`确定删除模型「${model.name}」？此操作不可恢复。`)) return;
    await fetch("/api/admin/models", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: model.id }),
    });
    fetchModels();
  }

  async function addModel() {
    const name = prompt("模型名称：");
    if (!name) return;
    const slug = prompt("模型 slug（如 veo3.1-fast）：");
    if (!slug) return;
    const provider = prompt("提供商（如 plato）：", "plato");
    if (!provider) return;
    const creditsStr = prompt("每次消耗积分：", "10");
    const creditsPerGen = parseInt(creditsStr || "10", 10);

    await fetch("/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, provider, creditsPerGen }),
    });
    fetchModels();
  }

  function maskKey(key: string | null): string {
    if (!key) return "—（使用环境变量）";
    if (key.length <= 8) return "••••••••";
    return key.slice(0, 4) + "••••" + key.slice(-4);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">管理后台</h1>
        <p className="text-sm text-[var(--vc-text-muted)]">管理用户、积分、模型和任务</p>
      </div>

      <AdminTabs />

      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--vc-text-muted)]">
          共 {modelList.length} 个模型配置
        </span>
        <button
          onClick={addModel}
          className="vc-gradient-btn rounded-[var(--vc-radius-md)] px-4 py-2 text-sm"
        >
          + 新增模型
        </button>
      </div>

      <div className="overflow-x-auto rounded-[var(--vc-radius-lg)] border border-[var(--vc-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--vc-bg-surface)] text-[var(--vc-text-secondary)]">
            <tr>
              <th className="px-4 py-3 text-left">名称</th>
              <th className="px-4 py-3 text-left">Slug</th>
              <th className="px-4 py-3 text-left">提供商</th>
              <th className="px-4 py-3 text-right">积分/次</th>
              <th className="px-4 py-3 text-left">API Key</th>
              <th className="px-4 py-3 text-center">状态</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--vc-border)]">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--vc-text-muted)]">
                  加载中...
                </td>
              </tr>
            ) : modelList.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--vc-text-muted)]">
                  暂无模型配置，请添加
                </td>
              </tr>
            ) : (
              modelList.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white">{m.name}</td>
                  <td className="px-4 py-3 font-mono text-zinc-300">{m.slug}</td>
                  <td className="px-4 py-3 text-zinc-300">{m.provider}</td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {m.creditsPerGen}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {maskKey(m.apiKey)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.isActive
                          ? "bg-green-500/20 text-green-400"
                          : "bg-zinc-700 text-zinc-400"
                      }`}
                    >
                      {m.isActive ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEdit(m)}
                        className="rounded-[var(--vc-radius-sm)] bg-[var(--vc-bg-elevated)] px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-600"
                      >
                        配置
                      </button>
                      <button
                        onClick={() => toggleActive(m)}
                        className={`rounded px-2 py-1 text-xs ${
                          m.isActive
                            ? "bg-red-600/80 text-white hover:bg-red-500"
                            : "bg-green-600/80 text-white hover:bg-green-500"
                        }`}
                      >
                        {m.isActive ? "停用" : "启用"}
                      </button>
                      <button
                        onClick={() => deleteModel(m)}
                        className="rounded px-2 py-1 text-xs bg-red-900/60 text-red-300 hover:bg-red-800"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeEdit}>
          <div
            className="vc-glass w-full max-w-md space-y-4 rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white">配置模型：{editing.name}</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400">名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400">每次消耗积分</label>
                <input
                  type="number"
                  min={0}
                  value={form.creditsPerGen}
                  onChange={(e) => setForm((f) => ({ ...f, creditsPerGen: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400">
                  API Base URL <span className="text-zinc-500">（留空使用环境变量）</span>
                </label>
                <input
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.bltcy.ai"
                  className="mt-1 w-full rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white outline-none focus:border-purple-500 placeholder-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400">
                  API Key <span className="text-zinc-500">（留空使用环境变量）</span>
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-white outline-none focus:border-purple-500 placeholder-zinc-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={closeEdit}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                className="vc-gradient-btn rounded-lg px-4 py-2 text-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
