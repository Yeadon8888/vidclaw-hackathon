import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { taskGroups, taskItems, tasks } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  ACTIVE_TASK_STATUSES,
  finalizeTaskIfTerminal,
} from "@/lib/tasks/reconciliation";
import { processPendingBatchTasks } from "@/lib/tasks/batch-processing";
import { processDueScheduledTasks } from "@/lib/tasks/scheduled";
import { queryVideoTaskStatus } from "@/lib/video/service";

/**
 * GET /api/tasks/refresh
 *
 * Returns user tasks. For any task in an active status, polls the provider
 * for the latest status and updates the DB before responding.
 * This ensures the tasks page shows accurate state even when the user
 * didn't stay on the generate page to finish polling.
 */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  await processDueScheduledTasks({
    userId: user.id,
    limit: 3,
  });

  const activeTaskGroups = await db
    .select({
      id: taskGroups.id,
      status: taskGroups.status,
    })
    .from(taskGroups)
    .where(eq(taskGroups.userId, user.id))
    .orderBy(desc(taskGroups.createdAt))
    .limit(30);

  for (const group of activeTaskGroups) {
    if (group.status !== "pending" && group.status !== "generating") continue;
    await processPendingBatchTasks({
      taskGroupId: group.id,
      limit: 2,
    });
  }

  // Fetch all user tasks for provider polling, including tasks inside groups.
  const allUserTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, user.id))
    .orderBy(desc(tasks.createdAt))
    .limit(200);

  // Find tasks that are still active
  const activeTasks = allUserTasks.filter((t) =>
    (ACTIVE_TASK_STATUSES as readonly string[]).includes(t.status),
  );

  // For each active task, poll its sub-task items from the provider
  for (const task of activeTasks) {
    const items = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    // Skip tasks with no sub-items (e.g. still in analyzing stage)
    const pendingItems = items.filter(
      (i) => i.providerTaskId && i.status !== "SUCCESS" && i.status !== "FAILED",
    );
    if (pendingItems.length === 0 && items.length === 0) continue;

    // Poll each pending item
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
            ...(result.status === "SUCCESS" || result.status === "FAILED"
              ? { completedAt: new Date() }
              : {}),
          })
          .where(eq(taskItems.id, item.id));
      } catch {
        // Provider query failed — skip this item
      }
    }

    // Re-fetch items to check if all are done
    const updatedItems = await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, task.id));

    const allItemsDone = updatedItems.length > 0 && updatedItems.every(
      (i) => i.status === "SUCCESS" || i.status === "FAILED",
    );

    if (allItemsDone) {
      await finalizeTaskIfTerminal({
        taskId: task.id,
        userId: user.id,
        creditsCost: task.creditsCost,
        items: updatedItems,
      });
    }
  }

  // Re-fetch the final task list
  const userTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), isNull(tasks.taskGroupId)))
    .orderBy(desc(tasks.createdAt))
    .limit(50);

  const userTaskGroups = await db
    .select()
    .from(taskGroups)
    .where(eq(taskGroups.userId, user.id))
    .orderBy(desc(taskGroups.createdAt))
    .limit(30);

  return NextResponse.json({ tasks: userTasks, taskGroups: userTaskGroups });
}
