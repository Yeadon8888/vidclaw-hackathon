import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskGroups, taskItems, taskSlots, tasks } from "@/lib/db/schema";
import {
  ACTIVE_TASK_STATUSES,
  failTaskAndRefund,
  finalizeTaskIfTerminal,
} from "@/lib/tasks/reconciliation";
import { processPendingBatchTasks } from "@/lib/tasks/batch-processing";
import { getMaxBatchGroupSubmissionsPerTick } from "@/lib/tasks/batch-queue";
import { processDueScheduledTasks } from "@/lib/tasks/scheduled";
import { queryVideoTaskStatus } from "@/lib/video/service";
import {
  advanceSlotOnResult,
  expireDeadlineSlots,
  getActiveProviderTaskIds,
  maybeFinalizeFulfillmentTask,
  reconcileSuccessfulSlotItems,
  refillPendingSlotsIfCapacityAvailable,
} from "@/lib/tasks/fulfillment";
import { processTimedOutTasks } from "@/lib/tasks/timeout";
import { recoverStuckGrokBatchTasks } from "@/lib/tasks/grok-recovery";

export async function runTaskMaintenance(options?: {
  userId?: string;
  scheduledLimit?: number;
  taskGroupLimit?: number;
  groupProcessLimit?: number;
  activeTaskLimit?: number;
  timeoutLimit?: number;
}) {
  const scheduledResult = await processDueScheduledTasks({
    userId: options?.userId,
    limit: options?.scheduledLimit ?? 3,
  });

  const taskGroupConditions = options?.userId
    ? [eq(taskGroups.userId, options.userId)]
    : [];
  const activeTaskGroups = await db
    .select({
      id: taskGroups.id,
      status: taskGroups.status,
    })
    .from(taskGroups)
    .where(taskGroupConditions.length > 0 ? and(...taskGroupConditions) : undefined)
    .orderBy(desc(taskGroups.createdAt))
    .limit(options?.taskGroupLimit ?? 30);

  // Run each task_group's batch processor concurrently so that multiple
  // users submitting at the same time don't serialize behind each other.
  // Within a single group `processPendingBatchTasks` still throttles via
  // batch-queue (stagger + per-slot cap), which is the right place for
  // provider-side rate limiting. allSettled so one user's crash doesn't
  // poison the whole tick.
  const groupLimit = Math.min(
    options?.groupProcessLimit ?? getMaxBatchGroupSubmissionsPerTick(),
    getMaxBatchGroupSubmissionsPerTick(),
  );
  const eligibleGroups = activeTaskGroups.filter(
    (group) => group.status === "pending" || group.status === "generating",
  );
  const groupResults = await Promise.allSettled(
    eligibleGroups.map((group) =>
      processPendingBatchTasks({ taskGroupId: group.id, limit: groupLimit }),
    ),
  );
  for (const result of groupResults) {
    if (result.status === "rejected") {
      console.error("[tasks/runner] processPendingBatchTasks failed:", result.reason);
    }
  }
  const processedGroups = groupResults.filter((r) => r.status === "fulfilled").length;

  await recoverStuckGrokBatchTasks({
    userId: options?.userId,
    limit: options?.activeTaskLimit ?? 30,
  });

  const taskConditions = options?.userId
    ? [eq(tasks.userId, options.userId)]
    : [];
  const allTasks = await db
    .select()
    .from(tasks)
    .where(taskConditions.length > 0 ? and(...taskConditions) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(options?.activeTaskLimit ?? 200);

  const activeTasks = allTasks.filter((task) =>
    (ACTIVE_TASK_STATUSES as readonly string[]).includes(task.status),
  );

  let polledTasks = 0;

  for (const task of activeTasks) {
    if (task.fulfillmentMode === "backfill_until_target") {
      await reconcileSuccessfulSlotItems(task.id);
      await maybeFinalizeFulfillmentTask(task);

      if (task.deliveryDeadlineAt) {
        await expireDeadlineSlots(task.id, task.deliveryDeadlineAt);
      }

      const activeItems = await getActiveProviderTaskIds(task.id);
      for (const { providerTaskId, slotId, itemId } of activeItems) {
        try {
          const result = await queryVideoTaskStatus({
            modelId: task.modelId,
            taskId: providerTaskId,
          });

          await db
            .update(taskItems)
            .set({
              status: result.status,
              progress: result.progress,
              resultUrl: result.url,
              failReason: result.failReason,
              retryable: result.retryable,
              terminalClass: result.terminalClass,
              ...(result.status === "SUCCESS" || result.status === "FAILED"
                ? { completedAt: new Date() }
                : {}),
            })
            .where(eq(taskItems.id, itemId));

          if (result.status === "SUCCESS" || result.status === "FAILED") {
            const [slot] = await db
              .select()
              .from(taskSlots)
              .where(eq(taskSlots.id, slotId))
              .limit(1);

            if (slot) {
              await advanceSlotOnResult({
                task,
                slot,
                itemStatus: result.status as "SUCCESS" | "FAILED",
                resultUrl: result.url,
                failReason: result.failReason,
                retryable: result.retryable,
                terminalClass: result.terminalClass,
              });
            }
          }
        } catch {
          // Provider query failed — skip.
        }
      }

      if (activeItems.length === 0) {
        await refillPendingSlotsIfCapacityAvailable(task.id);
      }

      polledTasks++;
      continue;
    }

    const items = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    const pendingItems = items.filter(
      (item) => item.providerTaskId && item.status !== "SUCCESS" && item.status !== "FAILED",
    );
    if (items.length === 0) {
      // Batch sub-tasks (those belonging to a task_group) have their own
      // lifecycle managed by processPendingBatchTasks: it throttles
      // submissions (2 per cron tick) and resets stale `analyzing` rows.
      // If the runner's orphan scanner touches these, it races with batch
      // throttling and kills tasks that are legitimately still queued or
      // mid-Gemini. Trust batch-processing for the whole task_group lane.
      if (task.taskGroupId) {
        continue;
      }

      // Grace period for standalone tasks: don't fail anything created
      // within the last 2 minutes. Covers the race where runner fires
      // between `analyzing → generating` and the task_items insert that
      // follows provider submit.
      const taskAge = Date.now() - new Date(task.createdAt).getTime();
      if (taskAge < 2 * 60 * 1000) {
        continue;
      }

      const refunded = await failTaskAndRefund({
        taskId: task.id,
        userId: task.userId,
        refundAmount: task.creditsCost,
        errorMessage: "任务未成功提交到视频供应商，积分已自动退还",
        refundReason: "任务提交缺失自动退款",
        allowedStatuses: ACTIVE_TASK_STATUSES,
      });

      if (refunded) {
        polledTasks++;
      }
      continue;
    }

    for (const item of pendingItems) {
      try {
        const result = await queryVideoTaskStatus({
          modelId: task.modelId,
          taskId: item.providerTaskId!,
        });

        await db
          .update(taskItems)
          .set({
            status: result.status,
            progress: result.progress,
            resultUrl: result.url,
            failReason: result.failReason,
            retryable: result.retryable,
            terminalClass: result.terminalClass,
            ...(result.status === "SUCCESS" || result.status === "FAILED"
              ? { completedAt: new Date() }
              : {}),
          })
          .where(eq(taskItems.id, item.id));
      } catch {
        // Provider query failed — skip.
      }
    }

    const updatedItems = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    const allItemsDone = updatedItems.length > 0 && updatedItems.every(
      (item) => item.status === "SUCCESS" || item.status === "FAILED",
    );

    if (allItemsDone) {
      await finalizeTaskIfTerminal({
        taskId: task.id,
        userId: task.userId,
        creditsCost: task.creditsCost,
        items: updatedItems,
      });
    }

    polledTasks++;
  }

  const timeoutResult = await processTimedOutTasks({
    userId: options?.userId,
    limit: options?.timeoutLimit ?? 50,
  });

  return {
    scheduledProcessed: scheduledResult.processed,
    batchGroupsProcessed: processedGroups,
    activeTasksPolled: polledTasks,
    timedOutResolved: timeoutResult.resolved,
    timedOutRefunded: timeoutResult.refunded,
  };
}
