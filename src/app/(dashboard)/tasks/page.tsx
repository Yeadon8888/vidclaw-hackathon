import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { TaskList } from "./TaskList";

export default async function TasksPage() {
  const auth = await requireAuth();
  if (auth instanceof Response) return null; // 401
  const user = auth.user;

  const userTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, user.id))
    .orderBy(desc(tasks.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <h1 className="text-lg font-bold text-white sm:text-xl">任务历史</h1>
      <TaskList initialTasks={userTasks} />
    </div>
  );
}
