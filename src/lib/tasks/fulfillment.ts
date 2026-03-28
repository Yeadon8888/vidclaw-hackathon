/**
 * Fulfillment engine — manages slot lifecycle for backfill_until_target tasks.
 *
 * Responsibilities:
 *   - Initialize slots when a task is first created
 *   - Submit a provider attempt for a slot
 *   - Advance slot state when a provider result arrives
 *   - Trigger retry (new task_item) for failed-but-retryable slots
 *   - Finalize the parent task when all slots are terminal
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creditTxns,
  taskItems,
  taskSlots,
  tasks,
  users,
} from "@/lib/db/schema";
import type { TaskSlot, Task } from "@/lib/db/schema";
import type { TerminalClass } from "@/lib/video/types";
import { createVideoTasks, getVideoModelById } from "@/lib/video/service";
import {
  computeDeliveryDeadline,
  shouldRetrySlot,
} from "@/lib/tasks/retry-policy";
import { recomputeTaskGroupSummary } from "@/lib/tasks/groups";

// ─── Slot initialization ───────────────────────────────────────────────────

/**
 * Create N pending slots for a backfill task.
 * Called once, right after the task row is inserted.
 */
export async function initializeSlots(
  taskId: string,
  count: number,
): Promise<TaskSlot[]> {
  const values = Array.from({ length: count }, (_, i) => ({
    taskId,
    slotIndex: i,
  }));

  return db.insert(taskSlots).values(values).returning();
}

// ─── Submit attempt ────────────────────────────────────────────────────────

/**
 * Submit a provider attempt for a single slot.
 * Creates a task_item and marks the slot as "submitted".
 */
export async function submitSlotAttempt(params: {
  task: Pick<
    Task,
    "id" | "userId" | "modelId" | "soraPrompt" | "paramsJson"
  >;
  slot: TaskSlot;
}): Promise<{ providerTaskId: string; itemId: string } | null> {
  const { task, slot } = params;

  const p = task.paramsJson as {
    orientation: "portrait" | "landscape";
    duration: 8 | 10 | 15;
    count: number;
    platform: "douyin" | "tiktok";
    model: string;
    imageUrls?: string[];
  } | null;

  if (!p || !task.soraPrompt) return null;

  const model = await getVideoModelById(task.modelId);
  if (!model) return null;

  let providerTaskIds: string[];
  try {
    const submitted = await createVideoTasks({
      model,
      request: {
        prompt: task.soraPrompt,
        imageUrls: p.imageUrls ?? [],
        orientation: p.orientation,
        duration: p.duration,
        count: 1,
        model: p.model,
      },
    });
    providerTaskIds = submitted.providerTaskIds;
  } catch {
    return null;
  }

  if (providerTaskIds.length === 0) return null;
  const providerTaskId = providerTaskIds[0];

  const newAttemptNo = slot.attemptCount + 1;

  const [item] = await db
    .insert(taskItems)
    .values({
      taskId: task.id,
      slotId: slot.id,
      attemptNo: newAttemptNo,
      providerTaskId,
      status: "PENDING",
    })
    .returning({ id: taskItems.id });

  await db
    .update(taskSlots)
    .set({
      status: "submitted",
      attemptCount: newAttemptNo,
    })
    .where(eq(taskSlots.id, slot.id));

  return { providerTaskId, itemId: item.id };
}

// ─── Advance slot on result ────────────────────────────────────────────────

export interface SlotAdvanceResult {
  slotStatus: "success" | "failed" | "retrying" | "no_change";
  newProviderTaskId?: string;
}

/**
 * Called after a provider task_item reaches a terminal status.
 * Updates slot, optionally schedules a retry, then checks if the
 * parent task should be finalized.
 */
export async function advanceSlotOnResult(params: {
  task: Pick<
    Task,
    | "id"
    | "userId"
    | "modelId"
    | "soraPrompt"
    | "paramsJson"
    | "creditsCost"
    | "fulfillmentMode"
    | "requestedCount"
    | "successfulCount"
    | "deliveryDeadlineAt"
    | "taskGroupId"
  >;
  slot: TaskSlot;
  itemStatus: "SUCCESS" | "FAILED";
  resultUrl?: string;
  failReason?: string;
  retryable?: boolean;
  terminalClass?: TerminalClass;
}): Promise<SlotAdvanceResult> {
  const { task, slot, itemStatus, resultUrl, failReason, retryable, terminalClass } =
    params;

  // ── SUCCESS ──
  if (itemStatus === "SUCCESS" && resultUrl) {
    await db
      .update(taskSlots)
      .set({
        status: "success",
        resultUrl,
        completedAt: new Date(),
      })
      .where(eq(taskSlots.id, slot.id));

    const newSuccessCount = (task.successfulCount ?? 0) + 1;
    await db
      .update(tasks)
      .set({ successfulCount: newSuccessCount })
      .where(eq(tasks.id, task.id));

    await maybeFinalizeFulfillmentTask({
      ...task,
      successfulCount: newSuccessCount,
    });

    return { slotStatus: "success" };
  }

  // ── FAILED ──
  const effectiveRetryable = retryable ?? true;
  const effectiveTerminalClass = terminalClass ?? "unknown";
  const deadline = task.deliveryDeadlineAt ?? new Date(0);

  await db
    .update(taskSlots)
    .set({
      lastFailReason: failReason ?? "unknown",
      lastTerminalClass: effectiveTerminalClass,
    })
    .where(eq(taskSlots.id, slot.id));

  if (task.fulfillmentMode !== "backfill_until_target") {
    await db
      .update(taskSlots)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(taskSlots.id, slot.id));
    await maybeFinalizeFulfillmentTask(task);
    return { slotStatus: "failed" };
  }

  const decision = shouldRetrySlot({
    retryable: effectiveRetryable,
    terminalClass: effectiveTerminalClass,
    attemptCount: slot.attemptCount,
    deliveryDeadlineAt: deadline,
  });

  if (!decision.shouldRetry) {
    await db
      .update(taskSlots)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(taskSlots.id, slot.id));
    await maybeFinalizeFulfillmentTask(task);
    return { slotStatus: "failed" };
  }

  // Re-submit
  const updatedSlot = await db
    .select()
    .from(taskSlots)
    .where(eq(taskSlots.id, slot.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!updatedSlot) return { slotStatus: "no_change" };

  const attempt = await submitSlotAttempt({
    task,
    slot: updatedSlot,
  });

  if (!attempt) {
    await db
      .update(taskSlots)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(taskSlots.id, slot.id));
    await maybeFinalizeFulfillmentTask(task);
    return { slotStatus: "failed" };
  }

  return { slotStatus: "retrying", newProviderTaskId: attempt.providerTaskId };
}

// ─── Task finalization ─────────────────────────────────────────────────────

/**
 * Check whether all slots are terminal and finalize the parent task if so.
 * Handles refund for unfulfilled slots.
 */
export async function maybeFinalizeFulfillmentTask(
  task: Pick<
    Task,
    | "id"
    | "userId"
    | "creditsCost"
    | "fulfillmentMode"
    | "requestedCount"
    | "successfulCount"
    | "taskGroupId"
  >,
): Promise<boolean> {
  const allSlots = await db
    .select()
    .from(taskSlots)
    .where(eq(taskSlots.taskId, task.id));

  if (allSlots.length === 0) return false;

  const allTerminal = allSlots.every(
    (s) => s.status === "success" || s.status === "failed",
  );
  if (!allTerminal) return false;

  const successSlots = allSlots.filter((s) => s.status === "success");
  const successUrls = successSlots
    .map((s) => s.resultUrl)
    .filter((u): u is string => Boolean(u));

  const successCount = successSlots.length;
  const totalCount = allSlots.length;
  const failedCount = totalCount - successCount;
  const hasAnySuccess = successCount > 0;

  const perSlotCost =
    totalCount > 0 ? Math.floor((task.creditsCost ?? 0) / totalCount) : 0;
  const refundAmount = hasAnySuccess ? failedCount * perSlotCost : (task.creditsCost ?? 0);
  const finalCreditsCost = Math.max((task.creditsCost ?? 0) - refundAmount, 0);

  const finalStatus = hasAnySuccess ? ("done" as const) : ("failed" as const);
  const errorMessage = hasAnySuccess
    ? failedCount > 0
      ? `${successCount}/${totalCount} 成功，失败部分积分已退还`
      : null
    : "视频生成失败，积分已自动退还";

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({
        status: finalStatus,
        resultUrls: successUrls,
        creditsCost: finalCreditsCost,
        completedAt: new Date(),
        errorMessage,
      })
      .where(
        and(
          eq(tasks.id, task.id),
          inArray(tasks.status, ["pending", "analyzing", "generating", "polling"]),
        ),
      )
      .returning({ id: tasks.id });

    if (!updated) return;

    if (refundAmount > 0) {
      const [creditedUser] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${refundAmount}` })
        .where(eq(users.id, task.userId))
        .returning({ credits: users.credits });

      await tx.insert(creditTxns).values({
        userId: task.userId,
        type: "refund",
        amount: refundAmount,
        reason: hasAnySuccess
          ? `目标补齐部分失败退款 (${failedCount}/${totalCount} 失败)`
          : "目标补齐失败全额退款",
        taskId: task.id,
        balanceAfter: creditedUser?.credits ?? 0,
      });
    }
  });

  if (task.taskGroupId) {
    await recomputeTaskGroupSummary(task.taskGroupId);
  }

  return true;
}

// ─── Poll helpers ──────────────────────────────────────────────────────────

/**
 * For a fulfillment task, returns all active (non-terminal) provider task IDs
 * that are currently "submitted" across all slots.
 */
export async function getActiveProviderTaskIds(
  taskId: string,
): Promise<{ providerTaskId: string; slotId: string; itemId: string }[]> {
  const items = await db
    .select({
      id: taskItems.id,
      slotId: taskItems.slotId,
      providerTaskId: taskItems.providerTaskId,
    })
    .from(taskItems)
    .innerJoin(taskSlots, eq(taskItems.slotId, taskSlots.id))
    .where(
      and(
        eq(taskItems.taskId, taskId),
        eq(taskSlots.status, "submitted"),
        inArray(taskItems.status, [
          "PENDING",
          "NOT_START",
          "PROCESSING",
          "IN_PROGRESS",
          "QUEUED",
        ]),
      ),
    );

  return items
    .filter(
      (i): i is { id: string; slotId: string; providerTaskId: string } =>
        Boolean(i.providerTaskId && i.slotId),
    )
    .map((i) => ({ providerTaskId: i.providerTaskId, slotId: i.slotId, itemId: i.id }));
}

/**
 * Expire deadline-passed slots that are still submitted.
 * Called at the start of each poll to clean up stale slots.
 */
export async function expireDeadlineSlots(
  taskId: string,
  deliveryDeadlineAt: Date,
): Promise<number> {
  const now = new Date();
  if (now < deliveryDeadlineAt) return 0;

  const result = await db
    .update(taskSlots)
    .set({ status: "failed", lastFailReason: "delivery deadline expired", completedAt: now })
    .where(
      and(
        eq(taskSlots.taskId, taskId),
        inArray(taskSlots.status, ["pending", "submitted"]),
      ),
    )
    .returning({ id: taskSlots.id });

  return result.length;
}

/**
 * Submit pending (not-yet-started) slots.
 * Called right after task creation to kick off the first round.
 */
export async function submitPendingSlots(
  task: Pick<Task, "id" | "userId" | "modelId" | "soraPrompt" | "paramsJson">,
): Promise<string[]> {
  const pendingSlots = await db
    .select()
    .from(taskSlots)
    .where(and(eq(taskSlots.taskId, task.id), eq(taskSlots.status, "pending")));

  const providerTaskIds: string[] = [];
  for (const slot of pendingSlots) {
    const result = await submitSlotAttempt({ task, slot });
    if (result) providerTaskIds.push(result.providerTaskId);
  }
  return providerTaskIds;
}

// ─── Delivery progress summary ─────────────────────────────────────────────

export interface FulfillmentProgress {
  requestedCount: number;
  successfulCount: number;
  failedCount: number;
  pendingCount: number;
  isComplete: boolean;
  successUrls: string[];
}

export async function getFulfillmentProgress(
  taskId: string,
  requestedCount: number,
): Promise<FulfillmentProgress> {
  const slots = await db
    .select()
    .from(taskSlots)
    .where(eq(taskSlots.taskId, taskId));

  const successSlots = slots.filter((s) => s.status === "success");
  const failedSlots = slots.filter((s) => s.status === "failed");
  const pendingSlots = slots.filter(
    (s) => s.status === "pending" || s.status === "submitted",
  );

  return {
    requestedCount,
    successfulCount: successSlots.length,
    failedCount: failedSlots.length,
    pendingCount: pendingSlots.length,
    isComplete: pendingSlots.length === 0,
    successUrls: successSlots
      .map((s) => s.resultUrl)
      .filter((u): u is string => Boolean(u)),
  };
}
