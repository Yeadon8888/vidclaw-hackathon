import { NextRequest, NextResponse } from "next/server";
import { runTaskMaintenance } from "@/lib/tasks/runner";

// 300s is Vercel Pro's hard ceiling. Batch ticks need long enough to
// synchronously wait for grok2api's chat-completions image-to-video
// (60-90s per video, up to MAX_BATCH_GROUP_SUBMISSIONS_PER_TICK=2 inline).
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && bearer === cronSecret) return true;

  const tickSecret = process.env.INTERNAL_TICK_SECRET;
  if (tickSecret && bearer === tickSecret) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const executedAt = new Date().toISOString();

  try {
    const result = await runTaskMaintenance({
      scheduledLimit: 10,
      taskGroupLimit: 30,
      groupProcessLimit: 3,
      activeTaskLimit: 200,
      timeoutLimit: 50,
    });

    return NextResponse.json({ ok: true, ...result, executedAt });
  } catch (error) {
    // Swallow the throw so one broken sub-step does not take down the
    // whole cron loop. Return 200 with a failure summary so pg_cron's
    // `succeeded` flag stops lying about real health, and `net._http_response`
    // carries an actionable body for monitoring.
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 8).join("\n") : undefined;
    console.error("[tasks/tick] runTaskMaintenance failed:", error);
    return NextResponse.json(
      { ok: false, error: message, stack, executedAt },
      { status: 200 },
    );
  }
}
