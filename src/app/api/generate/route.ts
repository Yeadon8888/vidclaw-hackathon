import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateLimiter } from "@/lib/rate-limit";
import { generateScript, generateCopy } from "@/lib/gemini";
import {
  fetchAssetBuffer,
  loadUserPrompts,
} from "@/lib/storage/gateway";
import type { VideoParams, GenerateRequest } from "@/lib/video/types";
import { buildFinalVideoPrompt } from "@/lib/video/prompt";
import { resolveSelectedImageAssets } from "@/lib/generate/assets";
import {
  isTikHubEnabled,
  extractUrl,
  downloadVideoFromUrl,
} from "@/lib/tikhub";
import { db } from "@/lib/db";
import { tasks, creditTxns, users } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { failTaskAndRefund } from "@/lib/tasks/reconciliation";
import { insertTaskItemsFromSubmission } from "@/lib/tasks/items";
import {
  createVideoTasks,
  resolveActiveVideoModel,
} from "@/lib/video/service";
import {
  initializeSlots,
  submitPendingSlots,
} from "@/lib/tasks/fulfillment";
import { computeDeliveryDeadline } from "@/lib/tasks/retry-policy";
import type { OutputLanguage } from "@/lib/video/types";

export const maxDuration = 300; // Vercel max
const MAX_REFERENCE_IMAGES = 4;

function sseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function formatShanghaiTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function resolveOutputLanguage(
  outputLanguage: OutputLanguage | undefined,
  platform: "douyin" | "tiktok" | undefined,
): OutputLanguage {
  if (outputLanguage && outputLanguage !== "auto") return outputLanguage;
  return platform === "douyin" ? "auto" : "en";
}

export async function POST(req: NextRequest) {
  // ── Rate limit check ──
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = generateLimiter.check(clientIp);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  // ── Auth check ──
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = (await req.json()) as GenerateRequest;
  const {
    type,
    input,
    modification,
    creativeBrief,
    sourceMode,
    selectedImageIds,
    params,
    scheduled,
    fulfillmentMode: rawFulfillmentMode,
  } = body;
  const fulfillmentMode = rawFulfillmentMode === "backfill_until_target"
    ? "backfill_until_target" as const
    : "standard" as const;
  const effectiveSourceMode =
    sourceMode ?? (type === "video_key" ? "upload" : type);
  const effectiveCreativeBrief = creativeBrief?.trim() || modification?.trim() || undefined;
  // Pass up to MAX_REFERENCE_IMAGES selections through; the provider adapter
  // narrows further if its model only supports one (e.g. grok-imagine-video).
  // Don't pre-truncate to 1 here — that silently dropped user-selected images.
  const normalizedSelectedImageIds = selectedImageIds?.slice(0, MAX_REFERENCE_IMAGES);
  const resolvedOutputLanguage = resolveOutputLanguage(
    params.outputLanguage,
    params.platform,
  );

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
        const modelRow = await resolveActiveVideoModel(params.model);
        const modelSlug = modelRow.slug;
        const creditsPerGen = modelRow.creditsPerGen;
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

        // ── Step 1: Get user reference images (from DB, newest first) ──
        // No explicit selection → fall back to the user's most recent
        // MAX_REFERENCE_IMAGES uploads. Provider adapters narrow further
        // if their model only supports one image (e.g. grok).
        const selectedAssets = await resolveSelectedImageAssets({
          userId: user.id,
          selectedImageIds: normalizedSelectedImageIds,
          fallbackLimit: MAX_REFERENCE_IMAGES,
        });
        const imageUrls = selectedAssets.map((asset) => asset.url);
        const referenceImageUrls = imageUrls.slice(0, MAX_REFERENCE_IMAGES);
        log(
          normalizedSelectedImageIds?.length
            ? `已选择产品图 ${selectedAssets.length} 张，本次使用 ${referenceImageUrls.length} 张`
            : `产品图 ${imageUrls.length} 张，本次使用 ${referenceImageUrls.length} 张`,
        );

        if (imageUrls.length === 0) {
          send({
            type: "error",
            code: "REFERENCE_IMAGE_REQUIRED",
            message: "请先上传至少 1 张产品图片，再开始生成视频。",
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
        for (const url of referenceImageUrls) {
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
          modification: isVideoMode ? effectiveCreativeBrief : undefined,
          creativeBrief: type === "theme" ? effectiveCreativeBrief : undefined,
          imageBuffers,
          promptTemplate,
          platform: params.platform,
          outputLanguage: resolvedOutputLanguage,
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
              resolvedOutputLanguage,
            );
            scriptResult.copy = copy;
            log("自定义文案生成完成");
          } catch (e) {
            log(`自定义文案生成失败: ${String(e).slice(0, 100)}`);
          }
        }

        const soraPrompt = buildFinalVideoPrompt({
          scriptPrompt: scriptResult.full_sora_prompt,
          referenceImageCount: referenceImageUrls.length,
          outputLanguage: resolvedOutputLanguage,
        });

        send({
          type: "script",
          data: {
            ...scriptResult,
            full_sora_prompt: soraPrompt,
          },
        });

        // ── Step 4: Check if scheduled (deferred) mode ──

        const count = Math.min(Math.max(params.count, 1), 10);

        if (scheduled) {
          // Compute next 2:00 AM UTC+8
          const now = new Date();
          const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
          const target = new Date(utc8);
          target.setHours(2, 0, 0, 0);
          if (target <= utc8) target.setDate(target.getDate() + 1);
          const scheduledAt = new Date(target.getTime() - 8 * 60 * 60 * 1000); // back to UTC

          const taskType = type === "theme" ? "theme" : type === "url" ? "url" : "remix";
          const scheduledResult = await db.transaction(async (tx) => {
            const [task] = await tx
              .insert(tasks)
              .values({
                userId: user.id,
                type: taskType as "theme" | "remix" | "url",
                status: "scheduled",
                modelId: modelRow?.id,
                inputText:
                  taskType === "remix"
                    ? (effectiveCreativeBrief || "视频二创")
                    : input,
                videoSourceUrl: type === "url" || type === "video_key" ? input : null,
                soraPrompt,
                scriptJson: scriptResult,
                creditsCost: totalCost,
                scheduledAt,
                paramsJson: {
                  orientation: params.orientation,
                  duration: params.duration,
                  count,
                  platform: params.platform ?? "tiktok",
                  outputLanguage: resolvedOutputLanguage,
                  model: modelSlug,
                  imageUrls: referenceImageUrls,
                  sourceMode: effectiveSourceMode,
                  creativeBrief: effectiveCreativeBrief,
                  selectedImageIds: selectedAssets.map((asset) => asset.id),
                  selectedAssets,
                },
              })
              .returning();

            const [deducted] = await tx
              .update(users)
              .set({ credits: sql`${users.credits} - ${totalCost}` })
              .where(and(eq(users.id, user.id), sql`${users.credits} >= ${totalCost}`))
              .returning({ credits: users.credits });

            if (!deducted) {
              await tx
                .update(tasks)
                .set({ status: "failed", errorMessage: "积分不足（并发扣费）" })
                .where(eq(tasks.id, task.id));

              return { task, deducted: null };
            }

            await tx.insert(creditTxns).values({
              userId: user.id,
              type: "consume",
              amount: -totalCost,
              reason: `定时生成 (${modelSlug} × ${count})`,
              modelId: modelRow?.id,
              taskId: task.id,
              balanceAfter: deducted.credits,
            });

            return { task, deducted };
          });

          if (!scheduledResult.deducted) {
            send({ type: "error", code: "INSUFFICIENT_CREDITS", message: "积分不足，请充值后重试。" });
            send({ type: "done" });
            controller.close();
            return;
          }

          log(`任务已加入定时托管，将在凌晨 2:00 执行`);
          log(`预计执行时间：${formatShanghaiTime(scheduledAt)}（北京时间）`);
          send({ type: "stage", stage: "DONE" });
          send({ type: "done" });
          controller.close();
          return;
        }

        // ── Step 4b: Deduct credits FIRST, then submit Sora task ──
        // This prevents the "submit task but fail to deduct" race condition.

        const taskType = type === "theme" ? "theme" : type === "url" ? "url" : "remix";
        const now = new Date();
        const startedAt = now;
        const deliveryDeadlineAt = computeDeliveryDeadline(startedAt);

        const immediateResult = await db.transaction(async (tx) => {
          const [deducted] = await tx
            .update(users)
            .set({ credits: sql`${users.credits} - ${totalCost}` })
            .where(and(eq(users.id, user.id), sql`${users.credits} >= ${totalCost}`))
            .returning({ credits: users.credits });

          if (!deducted) return null;

          const [task] = await tx
            .insert(tasks)
            .values({
              userId: user.id,
              type: taskType as "theme" | "remix" | "url",
              status: "generating",
              modelId: modelRow?.id,
              inputText:
                taskType === "remix"
                  ? (effectiveCreativeBrief || "视频二创")
                  : input,
              videoSourceUrl: type === "url" || type === "video_key" ? input : null,
              soraPrompt,
              scriptJson: scriptResult,
              creditsCost: totalCost,
              fulfillmentMode,
              requestedCount: fulfillmentMode === "backfill_until_target" ? count : null,
              successfulCount: 0,
              startedAt,
              deliveryDeadlineAt: fulfillmentMode === "backfill_until_target" ? deliveryDeadlineAt : null,
              paramsJson: {
                orientation: params.orientation,
                duration: params.duration,
                count,
                platform: params.platform ?? "tiktok",
                outputLanguage: resolvedOutputLanguage,
                model: modelSlug,
                imageUrls: referenceImageUrls,
                sourceMode: effectiveSourceMode,
                creativeBrief: effectiveCreativeBrief,
                selectedImageIds: selectedAssets.map((asset) => asset.id),
                selectedAssets,
              },
            })
            .returning();

          await tx.insert(creditTxns).values({
            userId: user.id,
            type: "consume",
            amount: -totalCost,
            reason: fulfillmentMode === "backfill_until_target"
              ? `目标补齐生成 (${modelSlug} × ${count})`
              : `视频生成 (${modelSlug} × ${count})`,
            modelId: modelRow?.id,
            taskId: task.id,
            balanceAfter: deducted.credits,
          });

          return { task };
        });

        if (!immediateResult) {
          send({ type: "error", code: "INSUFFICIENT_CREDITS", message: "积分不足，请充值后重试。" });
          send({ type: "done" });
          controller.close();
          return;
        }
        const { task } = immediateResult;

        send({ type: "stage", stage: "GENERATE", message: "提交视频任务..." });

        // ── Step 5: Submit tasks (backfill = slot-based, standard = direct) ──
        let providerTaskIds: string[];
        let immediateResults:
          | (import("@/lib/video/types").TaskStatusResult | null)[]
          | undefined;
        let resolvedVideoParams: VideoParams;

        if (fulfillmentMode === "backfill_until_target") {
          // Initialize slots, then submit one attempt per slot
          await initializeSlots(task.id, count);
          try {
            providerTaskIds = await submitPendingSlots(task);
            // resolvedVideoParams is not returned by slot path — reconstruct a minimal version
            resolvedVideoParams = {
              prompt: soraPrompt,
              imageUrls: referenceImageUrls,
              orientation: params.orientation,
              duration: params.duration,
              count,
              model: modelSlug,
            };
            log(`[目标补齐] 已提交 ${providerTaskIds.length}/${count} 个任务`);
            if (providerTaskIds.length === 0) {
              throw new Error("所有 slot 提交失败");
            }
          } catch (e) {
            await failTaskAndRefund({
              taskId: task.id,
              userId: user.id,
              refundAmount: totalCost,
              errorMessage: String(e).slice(0, 500),
              refundReason: "视频提交失败自动退款",
              allowedStatuses: ["generating"],
            });
            send({
              type: "error",
              code: "SORA_UNAVAILABLE",
              message: "视频生成服务暂时不可用，积分已自动退还。",
              sora_prompt: soraPrompt,
            });
            send({ type: "done" });
            controller.close();
            return;
          }
        } else {
          // Standard mode: submit all in one batch
          const videoRequest = {
            prompt: soraPrompt,
            imageUrls: referenceImageUrls,
            orientation: params.orientation,
            duration: params.duration,
            count,
            model: modelSlug,
          };

          try {
            const submitted = await createVideoTasks({
              model: modelRow,
              request: videoRequest,
              userId: user.id,
            });
            providerTaskIds = submitted.providerTaskIds;
            immediateResults = submitted.immediateResults;
            resolvedVideoParams = submitted.resolvedParams;
            log(`任务已提交: ${providerTaskIds.join(", ")}`);
          } catch (e) {
            console.error("[generate] Provider task creation failed", {
              taskId: task.id,
              userId: user.id,
              modelSlug,
              count,
              type,
              error: String(e),
            });

            await failTaskAndRefund({
              taskId: task.id,
              userId: user.id,
              refundAmount: totalCost,
              errorMessage: String(e).slice(0, 500),
              refundReason: "视频提交失败自动退款",
              allowedStatuses: ["generating"],
            });

            const errMsg = String(e);
            let userMessage = "视频生成服务暂时不可用，积分已自动退还。";
            if (errMsg.includes("PROMINENT_PEOPLE")) {
              userMessage = "参考图中可能包含名人面孔，视频平台不允许生成。请更换图片后重试，积分已自动退还。";
            }

            send({
              type: "error",
              code: "SORA_UNAVAILABLE",
              message: userMessage,
              sora_prompt: soraPrompt,
            });
            send({ type: "done" });
            controller.close();
            return;
          }

          // Insert task items (synchronous providers like grok2api may
          // return immediateResults so the rows go in already as SUCCESS).
          await insertTaskItemsFromSubmission({
            taskId: task.id,
            providerTaskIds,
            immediateResults,
          });
        }

        // ── Step 6: Return task IDs ──
        send({
          type: "tasks",
          taskIds: providerTaskIds,
          dbTaskId: task.id,
          fulfillmentMode,
          requestedCount: fulfillmentMode === "backfill_until_target" ? count : undefined,
          deliveryDeadlineAt: fulfillmentMode === "backfill_until_target"
            ? deliveryDeadlineAt.toISOString()
            : undefined,
          sora_prompt: soraPrompt,
          resolved_params: resolvedVideoParams!,
        });

        send({ type: "done" });
        controller.close();
      } catch (e) {
        console.error("[generate] Internal error:", e);
        send({ type: "error", code: "INTERNAL", message: "服务内部错误，请稍后重试。如果问题持续，请联系客服。" });
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
