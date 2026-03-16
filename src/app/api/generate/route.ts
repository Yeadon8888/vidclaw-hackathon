import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateScript, generateCopy } from "@/lib/gemini";
import {
  listAssets,
  isUploadGatewayEnabled,
  fetchAssetBuffer,
  loadUserPrompts,
} from "@/lib/storage/gateway";
import { createTasks, type ApiOverrides } from "@/lib/video/plato";
import type { VideoParams, GenerateRequest } from "@/lib/video/types";
import {
  isTikHubEnabled,
  extractUrl,
  downloadVideoFromUrl,
} from "@/lib/tikhub";
import { db } from "@/lib/db";
import { tasks, taskItems, creditTxns, users, models } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const maxDuration = 300; // Vercel max

function sseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: NextRequest) {
  // ── Auth check ──
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = (await req.json()) as GenerateRequest;
  const { type, input, modification, params } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(sseData(obj)));
      }
      function log(message: string) {
        send({ type: "log", message });
      }

      try {
        // ── Step 0: Check credits ──
        const modelSlug = params.model || "veo3.1-fast";
        const [modelRow] = await db
          .select()
          .from(models)
          .where(eq(models.slug, modelSlug))
          .limit(1);
        const creditsPerGen = modelRow?.creditsPerGen ?? 10;
        const totalCost = creditsPerGen * Math.min(Math.max(params.count, 1), 10);

        if (user.credits < totalCost) {
          send({
            type: "error",
            code: "INSUFFICIENT_CREDITS",
            message: `积分不足。需要 ${totalCost} 积分，当前余额 ${user.credits}。`,
          });
          send({ type: "done" });
          controller.close();
          return;
        }

        log(`用户 ${user.email} | 余额 ${user.credits} | 本次消耗 ${totalCost} 积分`);

        // ── Step 1: Get user reference images ──
        let imageUrls: string[] = [];
        if (isUploadGatewayEnabled()) {
          const assets = await listAssets(user.id);
          imageUrls = assets
            .filter((a) => /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(a.url))
            .map((a) => a.url);
          log(`参考图 ${imageUrls.length} 张`);
        }
        if (imageUrls.length === 0) {
          send({
            type: "error",
            code: "REFERENCE_IMAGE_REQUIRED",
            message: "请先上传至少 1 张参考图片，再开始生成视频。",
          });
          send({ type: "done" });
          controller.close();
          return;
        }

        // ── Step 2: Resolve video source ──
        let videoBuffer: ArrayBuffer | undefined;
        let videoMime: string | undefined;

        if (type === "url") {
          send({ type: "stage", stage: "DOWNLOAD", message: "正在下载视频..." });
          if (!isTikHubEnabled()) {
            send({
              type: "error",
              code: "TIKHUB_NOT_CONFIGURED",
              message: "TIKHUB_API_KEY 未配置，无法解析视频链接。",
            });
            send({ type: "done" });
            controller.close();
            return;
          }
          const url = extractUrl(input);
          if (!url) {
            send({
              type: "error",
              code: "INVALID_URL",
              message: "未能从输入中提取有效的抖音/TikTok 链接。",
            });
            send({ type: "done" });
            controller.close();
            return;
          }
          const dl = await downloadVideoFromUrl(url, log);
          videoBuffer = dl.buffer;
          videoMime = dl.mimeType;
          log(`视频下载完成 (${dl.sizeMB.toFixed(1)} MB)`);
        } else if (type === "video_key") {
          send({ type: "stage", stage: "DOWNLOAD", message: "正在获取视频..." });
          const fetched = await fetchAssetBuffer(input);
          videoBuffer = fetched.buffer;
          videoMime = fetched.mimeType;
          const sizeMB = fetched.buffer.byteLength / (1024 * 1024);
          log(`视频获取完成 (${sizeMB.toFixed(1)} MB)`);
        }

        // ── Step 3: Gemini analysis ──
        send({ type: "stage", stage: "ANALYZE", message: "Gemini 分析中..." });

        const imageBuffers: { buffer: ArrayBuffer; mimeType: string }[] = [];
        for (const url of imageUrls.slice(0, 1)) {
          try {
            const fetched = await fetchAssetBuffer(url);
            imageBuffers.push({ buffer: fetched.buffer, mimeType: fetched.mimeType });
          } catch (e) {
            log(`获取参考图片失败: ${String(e).slice(0, 100)}`);
          }
        }

        const customPrompts = await loadUserPrompts(user.id);
        const isVideoMode = type === "url" || type === "video_key";
        let promptTemplate: string | undefined;
        if (isVideoMode) {
          promptTemplate = modification
            ? customPrompts.video_remix_with_modification
            : customPrompts.video_remix_base;
        } else {
          promptTemplate = customPrompts.theme_to_video;
        }
        if (promptTemplate) log("使用自定义 Prompt 模板");

        const scriptResult = await generateScript({
          type: isVideoMode ? "video" : "theme",
          videoBuffer: isVideoMode ? videoBuffer : undefined,
          mimeType: isVideoMode ? videoMime : undefined,
          theme: type === "theme" ? input : undefined,
          modification,
          imageBuffers,
          promptTemplate,
          platform: params.platform,
        });

        log(`Gemini 生成完成，共 ${scriptResult.shots?.length ?? 0} 个镜头`);

        // Custom copy regeneration
        if (customPrompts.copy_generation) {
          try {
            log("使用自定义文案 Prompt 重新生成文案...");
            const copy = await generateCopy(
              scriptResult.full_sora_prompt,
              customPrompts.copy_generation,
              params.platform,
            );
            scriptResult.copy = copy;
            log("自定义文案生成完成");
          } catch (e) {
            log(`自定义文案生成失败: ${String(e).slice(0, 100)}`);
          }
        }

        send({ type: "script", data: scriptResult });

        // ── Step 4: Sora task submission ──
        const soraPrompt =
          scriptResult.full_sora_prompt +
          " The product shown in the reference image must appear clearly and prominently in the video.";

        const count = Math.min(Math.max(params.count, 1), 10);
        const videoParams: VideoParams = {
          prompt: soraPrompt,
          imageUrls: imageUrls.slice(0, 1),
          orientation: params.orientation,
          duration: params.duration,
          count,
          model: params.model,
        };

        send({ type: "stage", stage: "GENERATE", message: "提交 Sora 任务..." });

        // Build per-model API overrides
        const apiOverrides: ApiOverrides = {
          apiKey: modelRow?.apiKey,
          baseUrl: modelRow?.baseUrl,
        };

        let providerTaskIds: string[];
        try {
          providerTaskIds = await createTasks(videoParams, apiOverrides);
          log(`任务已提交: ${providerTaskIds.join(", ")}`);
        } catch (e) {
          send({
            type: "error",
            code: "SORA_UNAVAILABLE",
            message: String(e).slice(0, 200),
            sora_prompt: scriptResult.full_sora_prompt,
          });
          send({ type: "done" });
          controller.close();
          return;
        }

        // ── Step 5: Save to database + deduct credits ──
        const taskType = type === "theme" ? "theme" : type === "url" ? "url" : "remix";
        const [task] = await db
          .insert(tasks)
          .values({
            userId: user.id,
            type: taskType as "theme" | "remix" | "url",
            status: "generating",
            modelId: modelRow?.id,
            inputText: taskType === "remix" ? (modification || "视频二创") : input,
            soraPrompt,
            scriptJson: scriptResult,
            creditsCost: totalCost,
            paramsJson: {
              orientation: params.orientation,
              duration: params.duration,
              count,
              platform: params.platform ?? "douyin",
              model: modelSlug,
            },
          })
          .returning();

        // Insert task items for each provider task
        for (const providerTaskId of providerTaskIds) {
          await db.insert(taskItems).values({
            taskId: task.id,
            providerTaskId,
            status: "PENDING",
          });
        }

        // Deduct credits atomically
        await db
          .update(users)
          .set({ credits: sql`${users.credits} - ${totalCost}` })
          .where(eq(users.id, user.id));

        // Record credit transaction
        await db.insert(creditTxns).values({
          userId: user.id,
          type: "consume",
          amount: -totalCost,
          reason: `视频生成 (${modelSlug} × ${count})`,
          modelId: modelRow?.id,
          taskId: task.id,
          balanceAfter: user.credits - totalCost,
        });

        // ── Step 6: Return task IDs ──
        send({
          type: "tasks",
          taskIds: providerTaskIds,
          dbTaskId: task.id,
          sora_prompt: soraPrompt,
        });

        send({ type: "done" });
        controller.close();
      } catch (e) {
        send({ type: "error", code: "INTERNAL", message: String(e).slice(0, 300) });
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
