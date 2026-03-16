import { db } from "@/lib/db";
import { creditTxns } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { PromptEditorButton } from "@/components/settings/PromptEditorButton";

export default async function SettingsPage() {
  const auth = await requireAuth();
  if (auth instanceof Response) return null;
  const user = auth.user;

  const recentTxns = await db
    .select()
    .from(creditTxns)
    .where(eq(creditTxns.userId, user.id))
    .orderBy(desc(creditTxns.createdAt))
    .limit(20);

  return (
    <div className="mx-auto max-w-2xl space-y-6 sm:space-y-8">
      <h1 className="text-lg font-bold text-white sm:text-xl">设置</h1>

      {/* 账户信息 */}
      <div className="vc-card space-y-4 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-300">账户信息</h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:gap-4">
          <div>
            <span className="text-[var(--vc-text-muted)]">邮箱</span>
            <p className="text-white">{user.email}</p>
          </div>
          <div>
            <span className="text-[var(--vc-text-muted)]">昵称</span>
            <p className="text-white">{user.name ?? "—"}</p>
          </div>
          <div>
            <span className="text-[var(--vc-text-muted)]">角色</span>
            <p className="text-white">
              {user.role === "admin" ? "管理员" : "普通用户"}
            </p>
          </div>
          <div>
            <span className="text-[var(--vc-text-muted)]">积分余额</span>
            <p className="text-lg font-bold tabular-nums text-purple-400">{user.credits}</p>
          </div>
        </div>
      </div>

      {/* Prompt 模板 */}
      <div className="vc-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300">Prompt 模板</h2>
          <p className="mt-1 text-xs text-[var(--vc-text-muted)]">
            自定义 Gemini 脚本生成和文案生成的 Prompt。留空使用系统默认。
          </p>
        </div>
        <PromptEditorButton />
      </div>

      {/* 积分流水 */}
      <div className="vc-card p-4 sm:p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-300 sm:mb-4">积分流水</h2>
        {recentTxns.length === 0 ? (
          <p className="text-sm text-[var(--vc-text-muted)]">暂无积分记录</p>
        ) : (
          <div className="space-y-2">
            {recentTxns.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)]/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-[var(--vc-radius-sm)] px-1.5 py-0.5 text-xs font-medium tabular-nums ${
                      txn.amount >= 0
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {txn.amount >= 0 ? "+" : ""}
                    {txn.amount}
                  </span>
                  <span className="text-sm text-[var(--vc-text-secondary)]">
                    {txn.reason ?? txn.type}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <span className="hidden text-xs tabular-nums text-[var(--vc-text-dim)] sm:inline">
                    余额: {txn.balanceAfter}
                  </span>
                  <span className="text-xs text-[var(--vc-text-dim)]">
                    {new Date(txn.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
