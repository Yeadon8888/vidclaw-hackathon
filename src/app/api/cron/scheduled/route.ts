import { NextRequest, NextResponse } from "next/server";
import { processDueScheduledTasks } from "@/lib/tasks/scheduled";

/**
 * GET /api/cron/scheduled — Execute scheduled tasks whose scheduledAt has arrived.
 * Protected by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDueScheduledTasks();
  return NextResponse.json({
    processed: result.processed,
    total: result.total,
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}
