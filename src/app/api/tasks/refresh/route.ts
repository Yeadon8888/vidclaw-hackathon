import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { taskGroups, tasks } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

/**
 * GET /api/tasks/refresh
 *
 * 纯读接口：返回当前用户的任务和任务组。
 *
 * 历史上这里会同步调用 runTaskMaintenance()，把"用户刷新页面"当成
 * 调度器的一部分——这条路径会让浏览器访问频率 = 维护调度频率，
 * 多开标签 / 爬虫 / SEO 抓取都能放大 provider 调用和 DB 压力。
 *
 * 实际的任务推进靠 Supabase pg_cron 每分钟触发
 * /api/internal/tasks/tick（见 scripts/deploy-supabase-cron.ts）。
 * 这个路由只负责读当前 DB 状态。
 *
 * 如果将来真需要"用户主动戳一下"的能力，单独加 POST /api/tasks/:id/poll
 * 一类的写接口并加节流，不要把副作用塞回读路径。
 */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

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
