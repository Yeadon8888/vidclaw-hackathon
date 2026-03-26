import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskItems, tasks } from "@/lib/db/schema";
import { failTaskAndRefund } from "@/lib/tasks/reconciliation";
import { createVideoTasksForModelId } from "@/lib/video/service";

export const SCHEDULED_BATCH_LIMIT = 20;

export async function processDueScheduledTasks(options?: {
  userId?: string;
  limit?: number;
}) {
  const now = new Date();
  const limit = options?.limit ?? SCHEDULED_BATCH_LIMIT;
  const filters = [eq(tasks.status, "scheduled"), lte(tasks.scheduledAt, now)];

  if (options?.userId) {
    filters.push(eq(tasks.userId, options.userId));
  }

  const scheduledTasks = await db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.scheduledAt), asc(tasks.createdAt))
    .limit(limit);

  let processed = 0;
  const errors: string[] = [];

  for (const task of scheduledTasks) {
    const [claimedTask] = await db
      .update(tasks)
      .set({ status: "generating", scheduledAt: null, errorMessage: null })
      .where(and(eq(tasks.id, task.id), eq(tasks.status, "scheduled")))
      .returning();

    if (!claimedTask) continue;

    try {
      const p = claimedTask.paramsJson as {
        orientation: string;
        duration: number;
        count: number;
        model: string;
        imageUrls?: string[];
      };

      const submitted = await createVideoTasksForModelId({
        modelId: claimedTask.modelId,
        request: {
          prompt: claimedTask.soraPrompt ?? "",
          imageUrls: p?.imageUrls ?? [],
          orientation: (p?.orientation as "portrait" | "landscape") ?? "portrait",
          duration: (p?.duration === 8 ? 8 : p?.duration === 10 ? 10 : 15) as 8 | 10 | 15,
          count: p?.count ?? 1,
          model: p?.model ?? "",
        },
      });

      for (const providerTaskId of submitted.providerTaskIds) {
        await db.insert(taskItems).values({
          taskId: claimedTask.id,
          providerTaskId,
          status: "PENDING",
        });
      }

      processed++;
    } catch (e) {
      errors.push(`Task ${claimedTask.id}: ${String(e).slice(0, 200)}`);
      await failTaskAndRefund({
        taskId: claimedTask.id,
        userId: claimedTask.userId,
        refundAmount: claimedTask.creditsCost,
        errorMessage: String(e).slice(0, 500),
        refundReason: "定时任务提交失败自动退款",
        allowedStatuses: ["generating"],
      });
    }
  }

  return {
    processed,
    total: scheduledTasks.length,
    errors,
  };
}
