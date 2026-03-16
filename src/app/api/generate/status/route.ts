import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { queryTaskStatus, type ApiOverrides } from "@/lib/video/plato";
import { db } from "@/lib/db";
import { tasks, taskItems, models, users, creditTxns } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

/**
 * GET /api/generate/status?taskIds=id1,id2
 * Poll Sora/VEO task status. Also updates DB task items.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const taskIdsParam = req.nextUrl.searchParams.get("taskIds") ?? "";
  const providerTaskIds = taskIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (providerTaskIds.length === 0) {
    return NextResponse.json({ error: "Missing taskIds" }, { status: 400 });
  }

  // Look up model API overrides from the task's associated model
  let apiOverrides: ApiOverrides = {};
  const [firstItem] = await db
    .select()
    .from(taskItems)
    .where(inArray(taskItems.providerTaskId, providerTaskIds))
    .limit(1);
  if (firstItem) {
    const [parentTask] = await db
      .select({ modelId: tasks.modelId })
      .from(tasks)
      .where(eq(tasks.id, firstItem.taskId))
      .limit(1);
    if (parentTask?.modelId) {
      const [modelRow] = await db
        .select({ apiKey: models.apiKey, baseUrl: models.baseUrl })
        .from(models)
        .where(eq(models.id, parentTask.modelId))
        .limit(1);
      if (modelRow) {
        apiOverrides = { apiKey: modelRow.apiKey, baseUrl: modelRow.baseUrl };
      }
    }
  }

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
          .where(eq(taskItems.providerTaskId, taskId));

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
    const [firstItem] = await db
      .select()
      .from(taskItems)
      .where(inArray(taskItems.providerTaskId, providerTaskIds))
      .limit(1);

    if (firstItem) {
      const allItems = await db
        .select()
        .from(taskItems)
        .where(eq(taskItems.taskId, firstItem.taskId));

      const hasAnySuccess = allItems.some((i) => i.status === "SUCCESS");
      const successUrls = allItems
        .filter((i) => i.status === "SUCCESS" && i.resultUrl)
        .map((i) => i.resultUrl!);

      await db
        .update(tasks)
        .set({
          status: hasAnySuccess ? "done" : "failed",
          resultUrls: successUrls,
          completedAt: new Date(),
          ...(!hasAnySuccess ? { errorMessage: "视频生成失败，积分已自动退还" } : {}),
        })
        .where(eq(tasks.id, firstItem.taskId));

      // Auto-refund if all tasks failed
      if (!hasAnySuccess) {
        const [parentTask] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, firstItem.taskId))
          .limit(1);
        if (parentTask && parentTask.creditsCost > 0) {
          await db
            .update(users)
            .set({ credits: sql`${users.credits} + ${parentTask.creditsCost}` })
            .where(eq(users.id, parentTask.userId));

          const [u] = await db
            .select({ credits: users.credits })
            .from(users)
            .where(eq(users.id, parentTask.userId))
            .limit(1);

          await db.insert(creditTxns).values({
            userId: parentTask.userId,
            type: "refund",
            amount: parentTask.creditsCost,
            reason: `生成失败自动退款`,
            taskId: parentTask.id,
            balanceAfter: u?.credits ?? 0,
          });
        }
      }
    }
  }

  return NextResponse.json({ results, allDone });
}
