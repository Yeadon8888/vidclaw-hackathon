import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskGroups, taskItems, taskSlots, tasks } from "@/lib/db/schema";
import type { FulfillmentMode, TaskParamsSnapshot } from "@/lib/video/types";
import { fetchAssetBuffer, loadUserPrompts } from "@/lib/storage/gateway";
import { generateCopy, generateScript } from "@/lib/gemini";
import { buildFinalVideoPrompt } from "@/lib/video/prompt";
import { failTaskAndRefund } from "@/lib/tasks/reconciliation";
import { recomputeTaskGroupSummary } from "@/lib/tasks/groups";
import { resolveBatchUnitsPerProduct } from "@/lib/tasks/batch-math";
import { createVideoTasksForModelId, getVideoModelById } from "@/lib/video/service";
import { initializeSlots, submitPendingSlots } from "@/lib/tasks/fulfillment";
import { computeDeliveryDeadline } from "@/lib/tasks/retry-policy";
import { insertTaskItemsFromSubmission } from "@/lib/tasks/items";
import {
  delayStaggeredSubmission,
  getMaxBatchGroupSubmissionsPerTick,
  getMaxBatchSlotSubmissionsPerTick,
  resolveRemainingSubmissionCapacity,
} from "@/lib/tasks/batch-queue";

export function resolveBatchTaskVideoCount(taskParams: TaskParamsSnapshot): number {
  return resolveBatchUnitsPerProduct(taskParams);
}

export function resolveBatchTaskFulfillmentMode(
  task: { taskGroupId: string | null; fulfillmentMode: FulfillmentMode },
  model: { provider: string } | null | undefined,
): FulfillmentMode {
  if (task.taskGroupId && model?.provider === "grok2api") {
    return "backfill_until_target";
  }

  return task.fulfillmentMode;
}

export async function processPendingBatchTasks(params: {
  taskGroupId: string;
  limit?: number;
}): Promise<{ processed: number; failed: number }> {
  const requestedLimit = Math.max(
    1,
    Math.min(params.limit ?? getMaxBatchGroupSubmissionsPerTick(), 10),
  );

  const [group] = await db
    .select()
    .from(taskGroups)
    .where(eq(taskGroups.id, params.taskGroupId))
    .limit(1);

  if (!group) {
    return { processed: 0, failed: 0 };
  }

  await resetStaleAnalyzingTasks(group.id);

  const customPrompts = await loadUserPrompts(group.userId);
  const activeChildTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.taskGroupId, group.id),
        inArray(tasks.status, ["analyzing", "generating", "polling"]),
      ),
    );
  const limit = resolveRemainingSubmissionCapacity({
    activeCount: activeChildTasks.length,
    maxConcurrent: getMaxBatchGroupSubmissionsPerTick(),
    requestedCount: requestedLimit,
  });

  if (limit <= 0) {
    return { processed: 0, failed: 0 };
  }

  const queuedTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.taskGroupId, group.id), eq(tasks.status, "pending")))
    .orderBy(asc(tasks.createdAt))
    .limit(limit);

  // Process sub-tasks within this group concurrently. Previously this was a
  // serial for-loop with `await delayStaggeredSubmission(submissionIndex++)`
  // between each, which meant a tick could only push 1-2 sub-tasks through
  // before hitting the 300s Vercel ceiling (each sub-task blocks 60-90s on
  // grok2api's synchronous create per slot). The stagger is preserved by
  // offsetting each sub-task's *start time* by `index * STAGGER_MS` so we
  // still spread submissions out, but a slow sub-task no longer blocks the
  // next one from even starting. Provider-level rate limiting is already
  // enforced inside submitPendingSlots + the proxy's own account pool, so
  // bursting here does not overrun Grok — it just removes our artificial
  // head-of-line blocking.
  const results = await Promise.allSettled(
    queuedTasks.map(async (queuedTask, index) => {
      await delayStaggeredSubmission(index);

      // Claim the row atomically. Two concurrent tick runs racing on the
      // same pending row will both arrive here, but the WHERE status=pending
      // guard means only one update actually claims it.
      const [claimedTask] = await db
        .update(tasks)
        .set({ status: "analyzing", errorMessage: null, startedAt: new Date() })
        .where(and(eq(tasks.id, queuedTask.id), eq(tasks.status, "pending")))
        .returning();

      if (!claimedTask) return "skipped" as const;

      try {
        const taskParams = (claimedTask.paramsJson ?? {}) as TaskParamsSnapshot;
        const imageUrl = taskParams.imageUrls?.[0];
        if (!imageUrl) {
          throw new Error("批量任务缺少产品图 URL。");
        }

        const imageAsset = await fetchAssetBuffer(imageUrl);
        const scriptResult = await generateScript({
          type: "theme",
          theme: taskParams.batchTheme ?? claimedTask.inputText ?? "",
          imageBuffers: [imageAsset],
          promptTemplate: customPrompts.theme_to_video,
          platform: taskParams.platform,
          outputLanguage: taskParams.outputLanguage,
        });

        if (customPrompts.copy_generation) {
          try {
            scriptResult.copy = await generateCopy(
              scriptResult.full_sora_prompt,
              customPrompts.copy_generation,
              taskParams.platform,
              taskParams.outputLanguage,
            );
          } catch {
            // Fall back to the original Gemini copy if custom regeneration fails.
          }
        }

        const soraPrompt = buildFinalVideoPrompt({
          scriptPrompt: scriptResult.full_sora_prompt,
          referenceImageCount: 1,
          outputLanguage: taskParams.outputLanguage,
        });

        const model = await getVideoModelById(claimedTask.modelId);
        const effectiveFulfillmentMode = resolveBatchTaskFulfillmentMode(
          {
            taskGroupId: claimedTask.taskGroupId,
            fulfillmentMode: claimedTask.fulfillmentMode,
          },
          model,
        );
        const requestedCount = resolveBatchTaskVideoCount(taskParams);
        const deliveryDeadlineAt = claimedTask.deliveryDeadlineAt ?? computeDeliveryDeadline(new Date());

        await db
          .update(tasks)
          .set({
            status: "generating",
            soraPrompt,
            scriptJson: scriptResult,
            fulfillmentMode: effectiveFulfillmentMode,
            requestedCount:
              effectiveFulfillmentMode === "backfill_until_target"
                ? requestedCount
                : claimedTask.requestedCount,
            deliveryDeadlineAt:
              effectiveFulfillmentMode === "backfill_until_target"
                ? deliveryDeadlineAt
                : claimedTask.deliveryDeadlineAt,
          })
          .where(eq(tasks.id, claimedTask.id));

        if (effectiveFulfillmentMode === "backfill_until_target") {
          await initializeSlots(claimedTask.id, requestedCount);
          const activeSlots = await db
            .select({ id: taskSlots.id })
            .from(taskSlots)
            .where(
              and(
                eq(taskSlots.taskId, claimedTask.id),
                eq(taskSlots.status, "submitted"),
              ),
            );
          const slotSubmissionLimit = resolveRemainingSubmissionCapacity({
            activeCount: activeSlots.length,
            maxConcurrent: getMaxBatchSlotSubmissionsPerTick(),
            requestedCount,
          });
          await submitPendingSlots(
            {
              id: claimedTask.id,
              userId: claimedTask.userId,
              modelId: claimedTask.modelId,
              soraPrompt,
              paramsJson: claimedTask.paramsJson,
            },
            { limit: slotSubmissionLimit },
          );
        } else {
          const submitted = await createVideoTasksForModelId({
            modelId: claimedTask.modelId,
            request: {
              prompt: soraPrompt,
              imageUrls: [imageUrl],
              orientation: taskParams.orientation,
              duration: taskParams.duration,
              count: requestedCount,
              model: taskParams.model,
            },
            userId: claimedTask.userId,
          });

          await insertTaskItemsFromSubmission({
            taskId: claimedTask.id,
            providerTaskIds: submitted.providerTaskIds,
            immediateResults: submitted.immediateResults,
          });
        }

        return "processed" as const;
      } catch (error) {
        await failTaskAndRefund({
          taskId: claimedTask.id,
          userId: claimedTask.userId,
          refundAmount: claimedTask.creditsCost,
          errorMessage: String(error).slice(0, 500),
          refundReason: "批量任务处理失败自动退款",
          allowedStatuses: ["pending", "analyzing", "generating", "polling"],
        });
        return "failed" as const;
      }
    }),
  );

  let processed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value === "processed") processed += 1;
      else if (result.value === "failed") failed += 1;
    } else {
      // Unexpected throw outside the inner try/catch (e.g. claim-step DB
      // error). Count as failed so metrics stay honest.
      failed += 1;
      console.error("[batch-processing] sub-task rejected:", result.reason);
    }
  }

  await recomputeTaskGroupSummary(group.id);
  return { processed, failed };
}

/**
 * Tasks claimed to `analyzing` that never progress to `generating` within
 * STALE_ANALYZING_MS are retryable: typically the prior tick got
 * interrupted by Vercel's 60s function timeout mid-Gemini call, before
 * the catch block could refund. Roll them back to `pending` so the
 * next tick re-claims and retries.
 *
 * Only resets tasks that have zero task_items (anything with a provider
 * id is already live and shouldn't be rewound).
 */
const STALE_ANALYZING_MS = 5 * 60 * 1000;

async function resetStaleAnalyzingTasks(taskGroupId: string) {
  const cutoffIso = new Date(Date.now() - STALE_ANALYZING_MS).toISOString();
  // Pass the cutoff as an ISO string — postgres.js v3.4 in the Vercel
  // runtime throws ERR_INVALID_ARG_TYPE when a Date lands inside a raw
  // sql`` template param slot, so keep it stringified here.
  await db
    .update(tasks)
    .set({ status: "pending", errorMessage: null, startedAt: null })
    .where(
      and(
        eq(tasks.taskGroupId, taskGroupId),
        eq(tasks.status, "analyzing"),
        sql`COALESCE(${tasks.startedAt}, ${tasks.createdAt}) < ${cutoffIso}::timestamptz`,
        sql`NOT EXISTS (SELECT 1 FROM ${taskItems} WHERE ${taskItems.taskId} = ${tasks.id})`,
      ),
    );
}
