import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskItems, models } from "@/lib/db/schema";
import { eq, lte, and } from "drizzle-orm";
import { createTasks, type ApiOverrides } from "@/lib/video/plato";
import type { VideoParams } from "@/lib/video/types";

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
    try {
      // Load model config for API overrides
      let apiOverrides: ApiOverrides = {};
      if (task.modelId) {
        const [modelRow] = await db
          .select()
          .from(models)
          .where(eq(models.id, task.modelId))
          .limit(1);
        if (modelRow) {
          apiOverrides = { apiKey: modelRow.apiKey, baseUrl: modelRow.baseUrl };
        }
      }

      const p = task.paramsJson as { orientation: string; duration: number; count: number; model: string; imageUrls?: string[] };

      const videoParams: VideoParams = {
        prompt: task.soraPrompt ?? "",
        imageUrls: p?.imageUrls ?? [],
        orientation: (p?.orientation as "portrait" | "landscape") ?? "portrait",
        duration: (p?.duration === 10 ? 10 : 15) as 10 | 15,
        count: p?.count ?? 1,
        model: p?.model,
      };

      // Submit to video provider
      const providerTaskIds = await createTasks(videoParams, apiOverrides);

      // Update task status
      await db
        .update(tasks)
        .set({ status: "generating", scheduledAt: null })
        .where(eq(tasks.id, task.id));

      // Insert task items
      for (const providerTaskId of providerTaskIds) {
        await db.insert(taskItems).values({
          taskId: task.id,
          providerTaskId,
          status: "PENDING",
        });
      }

      processed++;
    } catch (e) {
      const msg = `Task ${task.id}: ${String(e).slice(0, 200)}`;
      errors.push(msg);
      await db
        .update(tasks)
        .set({ status: "failed", errorMessage: String(e).slice(0, 500) })
        .where(eq(tasks.id, task.id));
    }
  }

  return NextResponse.json({
    processed,
    total: scheduledTasks.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
