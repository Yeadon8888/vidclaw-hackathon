import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks, taskItems, taskSlots } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  finalizeTaskIfTerminal,
  resolveStatusPollScope,
} from "@/lib/tasks/reconciliation";
import { queryVideoTaskStatus } from "@/lib/video/service";
import {
  advanceSlotOnResult,
  expireDeadlineSlots,
  getActiveProviderTaskIds,
  getFulfillmentProgress,
} from "@/lib/tasks/fulfillment";

/**
 * GET /api/generate/status
 *
 * Two modes depending on query params:
 *   - ?taskIds=id1,id2          — legacy / standard mode (poll by providerTaskId)
 *   - ?dbTaskId=uuid            — fulfillment mode (poll by db task id)
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const dbTaskIdParam = req.nextUrl.searchParams.get("dbTaskId");

  // ── Fulfillment mode: poll by db task ID ──
  if (dbTaskIdParam) {
    return handleFulfillmentPoll(dbTaskIdParam, user.id);
  }

  // ── Standard mode: poll by providerTaskIds ──
  const taskIdsParam = req.nextUrl.searchParams.get("taskIds") ?? "";
  const providerTaskIds = [...new Set(taskIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean))];

  if (providerTaskIds.length === 0) {
    return NextResponse.json({ error: "Missing taskIds or dbTaskId" }, { status: 400 });
  }

  return handleStandardPoll(providerTaskIds, user.id);
}

// ─── Standard poll (unchanged behavior) ───────────────────────────────────

async function handleStandardPoll(providerTaskIds: string[], userId: string) {
  const matchedItems = await db
    .select()
    .from(taskItems)
    .innerJoin(tasks, eq(taskItems.taskId, tasks.id))
    .where(
      and(
        inArray(taskItems.providerTaskId, providerTaskIds),
        eq(tasks.userId, userId),
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

  // Build a quick lookup of currently-stored row state so we can short-circuit
  // already-terminal items. Without this, synchronous providers like grok2api
  // (which write SUCCESS straight into task_items at submission time) would
  // get clobbered the next time the client polls — queryVideoTaskStatus would
  // return UNKNOWN/FAILED and we'd overwrite the good row.
  const itemRowByProviderId = new Map(
    matchedItems.map((row) => [
      row.task_items.providerTaskId,
      row.task_items,
    ]),
  );

  const results = await Promise.all(
    providerTaskIds.map(async (taskId) => {
      const existing = itemRowByProviderId.get(taskId);
      if (existing && (existing.status === "SUCCESS" || existing.status === "FAILED")) {
        return {
          taskId,
          status: existing.status,
          progress: existing.progress ?? "100%",
          url: existing.resultUrl ?? undefined,
          failReason: existing.failReason ?? undefined,
        };
      }
      try {
        const result = await queryVideoTaskStatus({
          modelId: scope.modelId,
          taskId,
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

  if (allDone) {
    const [parentTask] = await db
      .select({ id: tasks.id, creditsCost: tasks.creditsCost })
      .from(tasks)
      .where(and(eq(tasks.id, scope.taskId), eq(tasks.userId, userId)))
      .limit(1);

    if (parentTask) {
      const allItems = await db
        .select()
        .from(taskItems)
        .where(eq(taskItems.taskId, parentTask.id));

      await finalizeTaskIfTerminal({
        taskId: parentTask.id,
        userId,
        creditsCost: parentTask.creditsCost,
        items: allItems,
      });
    }
  }

  return NextResponse.json({ results, allDone });
}

// ─── Fulfillment poll ──────────────────────────────────────────────────────

async function handleFulfillmentPoll(dbTaskId: string, userId: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, dbTaskId), eq(tasks.userId, userId)))
    .limit(1);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Expire deadline-overdue slots first
  if (task.deliveryDeadlineAt) {
    await expireDeadlineSlots(dbTaskId, task.deliveryDeadlineAt);
  }

  // Get currently active provider task IDs
  const activeItems = await getActiveProviderTaskIds(dbTaskId);

  // Poll each active item from provider
  for (const { providerTaskId, slotId, itemId } of activeItems) {
    try {
      const result = await queryVideoTaskStatus({
        modelId: task.modelId,
        taskId: providerTaskId,
      });

      // Update task item
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

      // Advance slot if terminal
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
      // Provider query failed — skip
    }
  }

  // Compute current progress
  const requestedCount = task.requestedCount ?? (task.paramsJson as { count: number } | null)?.count ?? 0;
  const progress = await getFulfillmentProgress(dbTaskId, requestedCount);

  const allSlotsDone = progress.pendingCount === 0;

  return NextResponse.json({
    fulfillmentMode: task.fulfillmentMode,
    requestedCount: progress.requestedCount,
    successfulCount: progress.successfulCount,
    failedCount: progress.failedCount,
    pendingCount: progress.pendingCount,
    isComplete: allSlotsDone,
    successUrls: progress.successUrls,
    deliveryDeadlineAt: task.deliveryDeadlineAt?.toISOString() ?? null,
  });
}
