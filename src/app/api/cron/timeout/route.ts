import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskItems } from "@/lib/db/schema";
import { eq, and, inArray, lte } from "drizzle-orm";
import { queryTaskStatus, type ApiOverrides } from "@/lib/video/plato";
import {
  ACTIVE_TASK_STATUSES,
  failTaskAndRefund,
  finalizeTaskIfTerminal,
  getModelApiOverrides,
} from "@/lib/tasks/reconciliation";

const TIMEOUT_MINUTES = 60;

/**
 * GET /api/cron/timeout — Check stuck tasks and auto-refund.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

  // Find tasks stuck in generating/polling/analyzing for > 60 minutes
  const stuckTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.status, ["generating", "polling", "analyzing"]),
        lte(tasks.createdAt, cutoff),
      ),
    )
    .limit(50);

  if (stuckTasks.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let refunded = 0;
  let resolved = 0;

  for (const task of stuckTasks) {
    // Check provider status for each task item
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

    const apiOverrides: ApiOverrides = await getModelApiOverrides(task.modelId);

    for (const item of items) {
      if (!item.providerTaskId) continue;
      try {
        const result = await queryTaskStatus(item.providerTaskId, apiOverrides);
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
        // Skip terminal reconciliation on ambiguous provider failures.
      }
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

  return NextResponse.json({
    total: stuckTasks.length,
    resolved,
    refunded,
  });
}
