"use client";

import { useState, useEffect } from "react";

interface Prompts {
  video_remix_base?: string;
  video_remix_with_modification?: string;
  theme_to_video?: string;
  copy_generation?: string;
}

const SECTIONS: {
  key: keyof Prompts;
  label: string;
  description: string;
  placeholder: string;
}[] = [
  {
    key: "theme_to_video",
    label: "主题原创",
    description: "用户只输入主题文字时使用。占位符 {{THEME}} 会被替换为主题内容。",
    placeholder: "留空使用默认 Prompt…",
  },
  {
    key: "video_remix_base",
    label: "视频二创（无修改建议）",
    description: "用户上传视频/链接、没有修改建议时使用。",
    placeholder: "留空使用默认 Prompt…",
  },
  {
    key: "video_remix_with_modification",
    label: "视频二创（有修改建议）",
    description:
      "用户上传视频/链接、带修改建议时使用。占位符 {{MODIFICATION_PROMPT}} 会被替换为修改内容。",
    placeholder: "留空使用默认 Prompt…",
  },
  {
    key: "copy_generation",
    label: "文案生成",
    description:
      "根据 Sora 脚本独立生成标题/文案/首评。占位符 {{SORA_PROMPT}} 会被替换为生成的 Sora 提示词。留空则使用脚本中自带的文案。",
    placeholder: "留空使用脚本自带文案…",
  },
];

export function PromptEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [prompts, setPrompts] = useState<Prompts>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) void fetchPrompts();
  }, [isOpen]);

  async function fetchPrompts() {
    setLoading(true);
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) setPrompts(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prompts),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key: keyof Prompts, value: string) {
    setPrompts((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--vc-border)] px-6 py-4">
          <h2 className="text-lg font-semibold text-white">自定义 Prompt</h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-[var(--vc-text-muted)] hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-8 text-center text-[var(--vc-text-muted)]">加载中...</p>
          ) : (
            <>
              <p className="text-sm text-[var(--vc-text-muted)]">
                每个区块可以单独定制。留空则使用系统默认 Prompt。只需写创意指令和风格要求，系统会自动追加 JSON
                输出格式。
              </p>
              {SECTIONS.map((section) => (
                <div key={section.key}>
                  <label className="mb-1 block text-sm font-medium text-purple-300">
                    {section.label}
                  </label>
                  <p className="mb-2 text-xs text-[var(--vc-text-dim)]">{section.description}</p>
                  <textarea
                    className="w-full resize-y rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2 text-sm text-zinc-200 focus:border-purple-500 focus:outline-none"
                    rows={6}
                    value={prompts[section.key] ?? ""}
                    onChange={(e) => handleChange(section.key, e.target.value)}
                    placeholder={section.placeholder}
                  />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--vc-border)] px-6 py-4">
          {saved && <span className="text-sm text-green-400">已保存 ✓</span>}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--vc-text-muted)] transition hover:text-white"
          >
            关闭
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-[var(--vc-radius-md)] bg-purple-600 px-5 py-2 text-sm transition hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
