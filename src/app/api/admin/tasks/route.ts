import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks, taskItems, users } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

/** GET /api/admin/tasks — list all tasks across all users (admin only) */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;
  const status = req.nextUrl.searchParams.get("status");
  const userId = req.nextUrl.searchParams.get("userId");

  const conditions = [];
  if (status) conditions.push(eq(tasks.status, status as typeof tasks.status.enumValues[number]));
  if (userId) conditions.push(eq(tasks.userId, userId));

  const where = conditions.length > 0
    ? sql`${sql.join(conditions, sql` AND `)}`
    : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(where);

  const rows = await db
    .select({
      task: tasks,
      userEmail: users.email,
      userName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.userId, users.id))
    .where(where)
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    tasks: rows.map((r) => ({
      ...r.task,
      userEmail: r.userEmail,
      userName: r.userName,
    })),
    total: Number(count),
    page,
    limit,
  });
}

/** GET /api/admin/tasks/[taskId] — task detail with items */
// Note: For Next.js App Router, this should be in a [taskId]/route.ts
// but for now, use query param: GET /api/admin/tasks?detail=taskId
