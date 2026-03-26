import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { taskItems, tasks } from "@/lib/db/schema";
import type { ScriptResult, TaskParamsSnapshot } from "@/lib/video/types";
import { CopyTextButton } from "@/components/ui/CopyTextButton";
import { buildGenerateReplayHref } from "@/lib/generate/preset";
import {
  buildPublishHashtagText,
  extractHashtags,
  getTaskSourceModeLabel,
} from "@/lib/tasks/presentation";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="vc-card space-y-4 p-5">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const auth = await requireAuth();
  if (auth instanceof Response) return null;
  const user = auth.user;
  const { taskId } = await params;

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
    .limit(1);

  if (!task) notFound();

  const items = await db
    .select()
    .from(taskItems)
    .where(eq(taskItems.taskId, task.id))
    .orderBy(asc(taskItems.createdAt));

  const paramsJson = (task.paramsJson ?? {}) as TaskParamsSnapshot;
  const script = (task.scriptJson ?? null) as ScriptResult | null;
  const hashtags = extractHashtags(script?.copy?.caption);
  const hashtagText = buildPublishHashtagText(script?.copy?.caption);
  const sourceModeLabel = getTaskSourceModeLabel(paramsJson.sourceMode);
  const replayHref = buildGenerateReplayHref(
    paramsJson.sourceMode === "batch"
      ? {
          tab: "batch",
          batchTheme: paramsJson.batchTheme ?? task.inputText ?? undefined,
          batchImageIds: paramsJson.selectedImageIds ?? [],
          params: {
            orientation: paramsJson.orientation,
            duration: paramsJson.duration,
            count: paramsJson.batchTotal ?? paramsJson.count,
            platform: paramsJson.platform,
            model: paramsJson.model,
          },
        }
      : paramsJson.sourceMode === "url"
        ? {
            tab: "url",
            urlInput: task.videoSourceUrl ?? undefined,
            urlBrief: paramsJson.creativeBrief ?? undefined,
            selectedImageIds: paramsJson.selectedImageIds ?? [],
            params: {
              orientation: paramsJson.orientation,
              duration: paramsJson.duration,
              count: paramsJson.count,
              platform: paramsJson.platform,
              model: paramsJson.model,
            },
          }
        : paramsJson.sourceMode === "upload"
          ? {
              tab: "upload",
              uploadUrl: task.videoSourceUrl ?? undefined,
              uploadName: "历史上传视频",
              uploadBrief: paramsJson.creativeBrief ?? undefined,
              selectedImageIds: paramsJson.selectedImageIds ?? [],
              params: {
                orientation: paramsJson.orientation,
                duration: paramsJson.duration,
                count: paramsJson.count,
                platform: paramsJson.platform,
                model: paramsJson.model,
              },
            }
          : {
              tab: "theme",
              themeInput: task.inputText ?? undefined,
              themeBrief: paramsJson.creativeBrief ?? undefined,
              selectedImageIds: paramsJson.selectedImageIds ?? [],
              params: {
                orientation: paramsJson.orientation,
                duration: paramsJson.duration,
                count: paramsJson.count,
                platform: paramsJson.platform,
                model: paramsJson.model,
              },
            },
  );
  const originalInput = [
    paramsJson.batchTheme ? `批量创意主题：${paramsJson.batchTheme}` : null,
    task.videoSourceUrl ? `参考视频：${task.videoSourceUrl}` : null,
    task.inputText ? `主输入：${task.inputText}` : null,
    paramsJson.creativeBrief ? `补充要求：${paramsJson.creativeBrief}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--vc-text-dim)]">
          任务档案
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-white">{sourceModeLabel}</h1>
          <span className="rounded-full border border-[var(--vc-border)] px-3 py-1 text-xs text-[var(--vc-text-muted)]">
            状态：{task.status}
          </span>
          <span className="rounded-full border border-[var(--vc-border)] px-3 py-1 text-xs text-[var(--vc-text-muted)]">
            模型：{paramsJson.model || "—"}
          </span>
        </div>
        <p className="text-sm text-[var(--vc-text-muted)]">
          创建于 {new Date(task.createdAt).toLocaleString("zh-CN")}
        </p>
        {task.taskGroupId && (
          <Link
            href={`/tasks/groups/${task.taskGroupId}`}
            className="inline-flex rounded-full border border-[var(--vc-border)] px-3 py-1 text-xs text-[var(--vc-text-secondary)]"
          >
            返回任务组
          </Link>
        )}
        <Link
          href={replayHref}
          className="inline-flex rounded-full border border-[var(--vc-border)] px-3 py-1 text-xs text-[var(--vc-text-secondary)]"
        >
          按此配置重来
        </Link>
      </div>

      <Section title="原始输入">
        <div className="flex flex-wrap items-center gap-2">
          <CopyTextButton text={originalInput || "无"} />
          {task.soraPrompt && <CopyTextButton text={task.soraPrompt} />}
        </div>
        <pre className="whitespace-pre-wrap rounded-2xl bg-[var(--vc-bg-root)] p-4 text-sm text-[var(--vc-text-secondary)]">
          {originalInput || "无"}
        </pre>
        <div className="grid gap-3 text-sm text-[var(--vc-text-secondary)] sm:grid-cols-2 lg:grid-cols-4">
          <div>比例：{paramsJson.orientation === "landscape" ? "16:9" : "9:16"}</div>
          <div>时长：{paramsJson.duration ?? "—"} 秒</div>
          <div>平台：{paramsJson.platform ?? "—"}</div>
          <div>数量：{paramsJson.count ?? "—"}</div>
        </div>
      </Section>

      <Section title="产品图快照">
        {paramsJson.selectedAssets && paramsJson.selectedAssets.length > 0 ? (
          <div className="space-y-2 text-sm text-[var(--vc-text-secondary)]">
            {paramsJson.selectedAssets.map((asset, index) => (
              <div
                key={`${asset.id}-${index}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--vc-border)] px-4 py-3"
              >
                <div>
                  <p className="text-white">
                    {index + 1}. {asset.filename || asset.id}
                  </p>
                  <p className="truncate text-xs text-[var(--vc-text-dim)]">{asset.url}</p>
                </div>
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--vc-accent)]"
                >
                  打开
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--vc-text-muted)]">未保存产品图快照。</p>
        )}
      </Section>

      {script && (
        <>
          <Section title="分镜脚本">
            <div className="space-y-3">
              {script.shots.map((shot) => (
                <div
                  key={shot.id}
                  className="rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-bg-root)] p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">
                      镜头 {shot.id} · {shot.camera} · {shot.duration_s}s
                    </p>
                    <CopyTextButton text={shot.sora_prompt} />
                  </div>
                  <p className="text-sm text-[var(--vc-text-secondary)]">{shot.scene_zh}</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--vc-text-dim)]">
                    {shot.sora_prompt}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="最终 Prompt">
            <div className="flex justify-end">
              <CopyTextButton text={task.soraPrompt || script.full_sora_prompt} />
            </div>
            <pre className="whitespace-pre-wrap rounded-2xl bg-[var(--vc-bg-root)] p-4 text-xs leading-6 text-[var(--vc-text-secondary)]">
              {task.soraPrompt || script.full_sora_prompt}
            </pre>
          </Section>

          <Section title="文案与标签">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--vc-border)] p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">标题</p>
                  <CopyTextButton text={script.copy.title} />
                </div>
                <p className="text-sm text-[var(--vc-text-secondary)]">{script.copy.title}</p>
              </div>
              <div className="rounded-2xl border border-[var(--vc-border)] p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">正文</p>
                  <CopyTextButton text={script.copy.caption} />
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--vc-text-secondary)]">
                  {script.copy.caption}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--vc-border)] p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">首评</p>
                  <CopyTextButton text={script.copy.first_comment} />
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--vc-text-secondary)]">
                  {script.copy.first_comment}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--vc-border)] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">标签</p>
                <CopyTextButton text={hashtagText} />
              </div>
              <p className="mb-3 text-xs text-[var(--vc-text-muted)]">
                已按发布可用格式整理，最多 8 个，复制后可直接粘贴到 TikTok / 抖音发布页。
              </p>
              {hashtags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--vc-bg-root)] px-3 py-1 text-xs text-[var(--vc-accent)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--vc-text-muted)]">未识别到标签，通常会从正文中的话题提取。</p>
              )}
            </div>
          </Section>
        </>
      )}

      <Section title="执行记录">
        <div className="space-y-3">
          {items.length > 0 ? (
            items.map((item, index) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--vc-border)] px-4 py-3 text-sm text-[var(--vc-text-secondary)]"
              >
                <p className="text-white">子任务 {index + 1}</p>
                <p>Provider Task ID：{item.providerTaskId || "—"}</p>
                <p>状态：{item.status}</p>
                <p>进度：{item.progress}</p>
                {item.failReason && <p className="text-red-400">失败原因：{item.failReason}</p>}
                {item.resultUrl && (
                  <a
                    href={item.resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--vc-accent)]"
                  >
                    打开视频
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--vc-text-muted)]">暂时还没有子任务记录。</p>
          )}
          {task.errorMessage && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {task.errorMessage}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
