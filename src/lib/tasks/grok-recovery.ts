import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskItems, taskSlots, tasks } from "@/lib/db/schema";
import type { TaskParamsSnapshot } from "@/lib/video/types";
import { resolveBatchUnitsPerProduct } from "@/lib/tasks/batch-math";
import { getVideoModelById } from "@/lib/video/service";
import { computeDeliveryDeadline } from "@/lib/tasks/retry-policy";
import {
  initializeSlots,
  reconcileSuccessfulSlotItems,
  submitPendingSlots,
} from "@/lib/tasks/fulfillment";
import {
  getMaxBatchSlotSubmissionsPerTick,
  resolveRemainingSubmissionCapacity,
} from "@/lib/tasks/batch-queue";

const GROK_BATCH_RECOVERY_GRACE_MS = 8 * 60 * 1000;

type RecoveryTask = {
  id: string;
  taskGroupId: string | null;
  status: string;
  fulfillmentMode: string;
  creditsCost: number;
  createdAt: Date | string;
  startedAt?: Date | string | null;
  soraPrompt?: string | null;
  paramsJson: TaskParamsSnapshot | null;
};

type RecoveryModel = {
  provider: string;
  creditsPerGen: number;
};

export function assessGrokBatchRecoveryCandidate(params: {
  task: RecoveryTask;
  model: RecoveryModel | null | undefined;
  itemCount: number;
  now?: Date;
}): { recoverable: true; requestedCount: number } | { recoverable: false } {
  const { task, model, itemCount } = params;
  const now = params.now ?? new Date();

  if (model?.provider !== "grok2api") return { recoverable: false };
  if (!task.taskGroupId) return { recoverable: false };
  if (task.status !== "generating" && task.status !== "polling") {
    return { recoverable: false };
  }
  if (task.fulfillmentMode !== "standard") return { recoverable: false };
  if (itemCount !== 0) return { recoverable: false };
  if (!task.soraPrompt) return { recoverable: false };
  if (!task.paramsJson) return { recoverable: false };

  const taskStartedAt = new Date(task.startedAt ?? task.createdAt).getTime();
  if (!Number.isFinite(taskStartedAt)) return { recoverable: false };
  if (now.getTime() - taskStartedAt < GROK_BATCH_RECOVERY_GRACE_MS) {
    return { recoverable: false };
  }

  const requestedCount = resolveBatchUnitsPerProduct(task.paramsJson);
  if (requestedCount <= 0) return { recoverable: false };
  if (model.creditsPerGen <= 0) return { recoverable: false };
  if (task.creditsCost !== model.creditsPerGen * requestedCount) {
    return { recoverable: false };
  }

  return { recoverable: true, requestedCount };
}

export async function recoverStuckGrokBatchTasks(options?: {
  userId?: string;
  limit?: number;
  now?: Date;
  submitSlots?: boolean;
}): Promise<{ recovered: number }> {
  const conditions = [
    inArray(tasks.status, ["generating", "polling"] as const),
    eq(tasks.fulfillmentMode, "standard"),
  ];
  if (options?.userId) conditions.push(eq(tasks.userId, options.userId));

  const candidates = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .limit(options?.limit ?? 30);

  let recovered = 0;

  for (const task of candidates) {
    if (!task.taskGroupId) continue;

    const model = await getVideoModelById(task.modelId);
    const items = await db
      .select({ id: taskItems.id })
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    const assessment = assessGrokBatchRecoveryCandidate({
      task: {
        id: task.id,
        taskGroupId: task.taskGroupId,
        status: task.status,
        fulfillmentMode: task.fulfillmentMode,
        creditsCost: task.creditsCost,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        soraPrompt: task.soraPrompt,
        paramsJson: task.paramsJson as TaskParamsSnapshot | null,
      },
      model,
      itemCount: items.length,
      now: options?.now,
    });

    if (!assessment.recoverable) continue;

    const startedAt = new Date();
    const deliveryDeadlineAt = computeDeliveryDeadline(startedAt);
    const [updated] = await db
      .update(tasks)
      .set({
        fulfillmentMode: "backfill_until_target",
        requestedCount: assessment.requestedCount,
        startedAt,
        deliveryDeadlineAt,
        errorMessage: null,
      })
      .where(
        and(
          eq(tasks.id, task.id),
          inArray(tasks.status, ["generating", "polling"] as const),
          eq(tasks.fulfillmentMode, "standard"),
        ),
      )
      .returning({ id: tasks.id });

    if (!updated) continue;

    await initializeSlots(task.id, assessment.requestedCount);
    await reconcileSuccessfulSlotItems(task.id);

    if (options?.submitSlots ?? true) {
      const activeSlots = await db
        .select({ id: taskSlots.id })
        .from(taskSlots)
        .where(and(eq(taskSlots.taskId, task.id), eq(taskSlots.status, "submitted")));

      const slotSubmissionLimit = resolveRemainingSubmissionCapacity({
        activeCount: activeSlots.length,
        maxConcurrent: getMaxBatchSlotSubmissionsPerTick(),
        requestedCount: assessment.requestedCount,
      });

      if (slotSubmissionLimit > 0) {
        await submitPendingSlots(
          {
            id: task.id,
            userId: task.userId,
            modelId: task.modelId,
            soraPrompt: task.soraPrompt,
            paramsJson: task.paramsJson,
          },
          { limit: slotSubmissionLimit },
        );
      }
    }

    recovered += 1;
  }

  return { recovered };
}
