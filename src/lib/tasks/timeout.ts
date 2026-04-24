import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskItems, taskSlots, tasks } from "@/lib/db/schema";
import {
  ACTIVE_TASK_STATUSES,
  failTaskAndRefund,
  finalizeTaskIfTerminal,
} from "@/lib/tasks/reconciliation";
import { queryVideoTaskStatus } from "@/lib/video/service";
import {
  advanceSlotOnResult,
  expireDeadlineSlots,
  getActiveProviderTaskIds,
  maybeFinalizeFulfillmentTask,
  reconcileSuccessfulSlotItems,
} from "@/lib/tasks/fulfillment";
import { recoverStuckGrokBatchTasks } from "@/lib/tasks/grok-recovery";

export const TIMEOUT_MINUTES = 60;

export async function processTimedOutTasks(options?: {
  userId?: string;
  limit?: number;
}) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - TIMEOUT_MINUTES * 60 * 1000);
  const limit = options?.limit ?? 50;

  await recoverStuckGrokBatchTasks({
    userId: options?.userId,
    limit,
    now,
    submitSlots: false,
  });

  // 用 started_at 优先判定"是否真的在跑了超过 TIMEOUT_MINUTES"；
  // 对于定时/延迟任务，created_at 可能远早于真正开始，避免误判。
  // started_at 为 null 时（还没被 claim）回退到 created_at。
  const cutoffIso = cutoff.toISOString();
  const standardConditions = [
    inArray(tasks.status, ["generating", "polling", "analyzing"]),
    eq(tasks.fulfillmentMode, "standard"),
    sql`COALESCE(${tasks.startedAt}, ${tasks.createdAt}) <= ${cutoffIso}::timestamptz`,
  ];
  const fulfillmentConditions = [
    inArray(tasks.status, ["generating", "polling", "analyzing"]),
    eq(tasks.fulfillmentMode, "backfill_until_target"),
    lte(tasks.deliveryDeadlineAt, now),
  ];

  if (options?.userId) {
    standardConditions.push(eq(tasks.userId, options.userId));
    fulfillmentConditions.push(eq(tasks.userId, options.userId));
  }

  const standardTasks = await db
    .select()
    .from(tasks)
    .where(and(...standardConditions))
    .limit(limit);

  const fulfillmentTasks = await db
    .select()
    .from(tasks)
    .where(and(...fulfillmentConditions))
    .limit(limit);

  let refunded = 0;
  let resolved = 0;

  for (const task of standardTasks) {
    const items = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    if (items.length === 0) {
      const refundedTask = await failTaskAndRefund({
        taskId: task.id,
        userId: task.userId,
        refundAmount: task.creditsCost,
        errorMessage: `超时未完成（>${TIMEOUT_MINUTES}分钟），积分已自动退还`,
        refundReason: `生成超时自动退款 (任务 ${task.id.slice(0, 8)}...)`,
        allowedStatuses: ACTIVE_TASK_STATUSES,
      });
      if (refundedTask) {
        resolved++;
        if (task.creditsCost > 0) refunded++;
      }
      continue;
    }

    for (const item of items) {
      if (!item.providerTaskId) continue;
      try {
        const result = await queryVideoTaskStatus({
          modelId: task.modelId,
          taskId: item.providerTaskId,
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
        // Skip terminal reconciliation on ambiguous provider failures.
      }
    }

    // 重查 provider 之后还留在非终态的 item，判定为超时：直接标 FAILED
    // 让 finalizeTaskIfTerminal 可以收口。之前这里只做查询不做强制，
    // 任务就会长期卡在 generating/polling，timeout 机制名存实亡。
    const queriedItems = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    const lingeringItemIds = queriedItems
      .filter(
        (item) => item.status !== "SUCCESS" && item.status !== "FAILED",
      )
      .map((item) => item.id);

    if (lingeringItemIds.length > 0) {
      await db
        .update(taskItems)
        .set({
          status: "FAILED",
          failReason: `超时未完成（>${TIMEOUT_MINUTES}分钟），已强制结束`,
          retryable: false,
          terminalClass: "timeout",
          completedAt: new Date(),
        })
        .where(inArray(taskItems.id, lingeringItemIds));
    }

    const updatedItems = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    const finalization = await finalizeTaskIfTerminal({
      taskId: task.id,
      userId: task.userId,
      creditsCost: task.creditsCost,
      items: updatedItems,
      allowedStatuses: ACTIVE_TASK_STATUSES,
      settlementMessages: {
        allFailed: `超时未完成（>${TIMEOUT_MINUTES}分钟），积分已自动退还`,
      },
      refundMessages: {
        allFailed: `生成超时自动退款 (任务 ${task.id.slice(0, 8)}...)`,
      },
    });

    if (finalization.updated) {
      resolved++;
      if ((finalization.settlement?.refundAmount ?? 0) > 0) {
        refunded++;
      }
    }
  }

  for (const task of fulfillmentTasks) {
    await reconcileSuccessfulSlotItems(task.id);

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
        // Ignore provider errors and let the deadline expire the slot below.
      }
    }

    if (task.deliveryDeadlineAt) {
      await reconcileSuccessfulSlotItems(task.id);
      await expireDeadlineSlots(task.id, task.deliveryDeadlineAt);
    }

    const finalized = await maybeFinalizeFulfillmentTask(task);
    if (finalized) {
      resolved++;

      const [latestTask] = await db
        .select({ creditsCost: tasks.creditsCost })
        .from(tasks)
        .where(eq(tasks.id, task.id))
        .limit(1);

      if ((latestTask?.creditsCost ?? task.creditsCost) === 0) {
        refunded++;
      }
    }
  }

  return {
    total: standardTasks.length + fulfillmentTasks.length,
    resolved,
    refunded,
  };
}
