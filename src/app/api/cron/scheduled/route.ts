import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskItems } from "@/lib/db/schema";
import { eq, lte, and } from "drizzle-orm";
import { createTasks, type ApiOverrides } from "@/lib/video/plato";
import type { VideoParams } from "@/lib/video/types";
import {
  failTaskAndRefund,
  getModelApiOverrides,
} from "@/lib/tasks/reconciliation";

/**
 * GET /api/cron/scheduled — Execute scheduled tasks whose scheduledAt has arrived.
 * Protected by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const scheduledTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "scheduled"), lte(tasks.scheduledAt, now)))
    .limit(20);

  if (scheduledTasks.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const task of scheduledTasks) {
    const [claimedTask] = await db
      .update(tasks)
      .set({ status: "generating", scheduledAt: null, errorMessage: null })
      .where(
        and(
          eq(tasks.id, task.id),
          eq(tasks.status, "scheduled"),
        ),
      )
      .returning();

    if (!claimedTask) continue;

    try {
      const apiOverrides: ApiOverrides = await getModelApiOverrides(claimedTask.modelId);

      const p = claimedTask.paramsJson as { orientation: string; duration: number; count: number; model: string; imageUrls?: string[] };

      const videoParams: VideoParams = {
        prompt: claimedTask.soraPrompt ?? "",
        imageUrls: p?.imageUrls ?? [],
        orientation: (p?.orientation as "portrait" | "landscape") ?? "portrait",
        duration: (p?.duration === 8 ? 8 : p?.duration === 10 ? 10 : 15) as 8 | 10 | 15,
        count: p?.count ?? 1,
        model: p?.model,
      };

      // Submit to video provider
      const providerTaskIds = await createTasks(videoParams, apiOverrides);

      // Insert task items
      for (const providerTaskId of providerTaskIds) {
        await db.insert(taskItems).values({
          taskId: claimedTask.id,
          providerTaskId,
          status: "PENDING",
        });
      }

      processed++;
    } catch (e) {
      const msg = `Task ${claimedTask.id}: ${String(e).slice(0, 200)}`;
      errors.push(msg);
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

  return NextResponse.json({
    processed,
    total: scheduledTasks.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
