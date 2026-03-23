import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { queryTaskStatus, type ApiOverrides } from "@/lib/video/plato";
import { db } from "@/lib/db";
import { tasks, taskItems } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  finalizeTaskIfTerminal,
  getModelApiOverrides,
  resolveStatusPollScope,
} from "@/lib/tasks/reconciliation";

/**
 * GET /api/generate/status?taskIds=id1,id2
 * Poll Sora/VEO task status. Also updates DB task items.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const taskIdsParam = req.nextUrl.searchParams.get("taskIds") ?? "";
  const providerTaskIds = [...new Set(taskIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean))];

  if (providerTaskIds.length === 0) {
    return NextResponse.json({ error: "Missing taskIds" }, { status: 400 });
  }

  const matchedItems = await db
    .select()
    .from(taskItems)
    .innerJoin(tasks, eq(taskItems.taskId, tasks.id))
    .where(
      and(
        inArray(taskItems.providerTaskId, providerTaskIds),
        eq(tasks.userId, user.id),
      ),
    );

  const scope = resolveStatusPollScope(
    providerTaskIds,
    matchedItems.map((row) => ({
      providerTaskId: row.task_items.providerTaskId,
      taskId: row.task_items.taskId,
      modelId: row.tasks.modelId,
    })),
  );

  if (!scope) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const apiOverrides: ApiOverrides = await getModelApiOverrides(scope.modelId);

  const results = await Promise.all(
    providerTaskIds.map(async (taskId) => {
      try {
        const result = await queryTaskStatus(taskId, apiOverrides);

        // Update task item in DB
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
          .where(
            and(
              eq(taskItems.taskId, scope.taskId),
              eq(taskItems.providerTaskId, taskId),
            ),
          );

        return result;
      } catch {
        return { taskId, status: "UNKNOWN", progress: "0%" };
      }
    }),
  );

  const allDone = results.every(
    (r) => r.status === "SUCCESS" || r.status === "FAILED",
  );

  // If all tasks are done, update the parent task status
  if (allDone) {
    const [parentTask] = await db
      .select({ id: tasks.id, creditsCost: tasks.creditsCost })
      .from(tasks)
      .where(and(eq(tasks.id, scope.taskId), eq(tasks.userId, user.id)))
      .limit(1);

    if (parentTask) {
      const allItems = await db
        .select()
        .from(taskItems)
        .where(eq(taskItems.taskId, parentTask.id));

      await finalizeTaskIfTerminal({
        taskId: parentTask.id,
        userId: user.id,
        creditsCost: parentTask.creditsCost,
        items: allItems,
      });
    }
  }

  return NextResponse.json({ results, allDone });
}
