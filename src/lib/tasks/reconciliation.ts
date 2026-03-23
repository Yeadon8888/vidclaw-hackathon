import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditTxns, models, tasks, users } from "@/lib/db/schema";
import type { Task } from "@/lib/db/schema";
import type { ApiOverrides } from "@/lib/video/plato";

export const ACTIVE_TASK_STATUSES = [
  "pending",
  "analyzing",
  "generating",
  "polling",
] as const;

export interface SettlementTaskItem {
  status: string;
  resultUrl?: string | null;
}

export interface StatusPollScopeRow {
  providerTaskId: string | null;
  taskId: string;
  modelId: string | null;
}

export interface TaskSettlementSummary {
  totalCount: number;
  successCount: number;
  failedCount: number;
  hasAnySuccess: boolean;
  successUrls: string[];
  refundAmount: number;
  finalCreditsCost: number;
  finalStatus: "done" | "failed";
  errorMessage?: string;
}

interface SettlementMessages {
  allFailed?: string;
  partial?: (summary: TaskSettlementSummary) => string;
}

interface RefundMessages {
  allFailed?: string;
  partial?: (summary: TaskSettlementSummary) => string;
}

export function isTerminalTaskItemStatus(status: string): boolean {
  return status === "SUCCESS" || status === "FAILED";
}

export function summarizeTaskSettlement(
  items: SettlementTaskItem[],
  creditsCost: number,
  messages?: SettlementMessages,
): TaskSettlementSummary | null {
  if (items.length === 0) return null;
  if (!items.every((item) => isTerminalTaskItemStatus(item.status))) return null;

  const successUrls = items
    .filter((item) => item.status === "SUCCESS" && item.resultUrl)
    .map((item) => item.resultUrl!);

  const totalCount = items.length;
  const successCount = successUrls.length;
  const failedCount = items.filter((item) => item.status === "FAILED").length;
  const hasAnySuccess = successCount > 0;
  const perItemCost = totalCount > 0 ? Math.floor(creditsCost / totalCount) : 0;
  const refundAmount = hasAnySuccess
    ? failedCount * perItemCost
    : creditsCost;
  const finalCreditsCost = hasAnySuccess
    ? Math.max(creditsCost - refundAmount, 0)
    : 0;

  const summary: TaskSettlementSummary = {
    totalCount,
    successCount,
    failedCount,
    hasAnySuccess,
    successUrls,
    refundAmount,
    finalCreditsCost,
    finalStatus: hasAnySuccess ? "done" : "failed",
  };

  if (!hasAnySuccess) {
    summary.errorMessage =
      messages?.allFailed ?? "视频生成失败，积分已自动退还";
  } else if (failedCount > 0) {
    summary.errorMessage =
      messages?.partial?.(summary) ??
      `${successCount}/${totalCount} 成功，失败部分积分已退还`;
  }

  return summary;
}

export function resolveStatusPollScope(
  requestedProviderTaskIds: string[],
  rows: StatusPollScopeRow[],
): { taskId: string; modelId: string | null } | null {
  if (requestedProviderTaskIds.length === 0) return null;

  const requested = new Set(requestedProviderTaskIds);
  const matchedIds = new Set(
    rows
      .map((row) => row.providerTaskId)
      .filter((value): value is string => Boolean(value)),
  );

  if (requested.size !== matchedIds.size) return null;
  for (const taskId of requested) {
    if (!matchedIds.has(taskId)) return null;
  }

  const taskIds = new Set(rows.map((row) => row.taskId));
  if (taskIds.size !== 1) return null;

  return {
    taskId: rows[0].taskId,
    modelId: rows[0].modelId,
  };
}

export async function getModelApiOverrides(
  modelId: string | null | undefined,
): Promise<ApiOverrides> {
  if (!modelId) return {};

  const [modelRow] = await db
    .select({ apiKey: models.apiKey, baseUrl: models.baseUrl })
    .from(models)
    .where(eq(models.id, modelId))
    .limit(1);

  if (!modelRow) return {};
  return { apiKey: modelRow.apiKey, baseUrl: modelRow.baseUrl };
}

export async function finalizeTaskIfTerminal(params: {
  taskId: string;
  userId: string;
  creditsCost: number;
  items: SettlementTaskItem[];
  allowedStatuses?: readonly Task["status"][];
  settlementMessages?: SettlementMessages;
  refundMessages?: RefundMessages;
}): Promise<{
  updated: boolean;
  settlement: TaskSettlementSummary | null;
}> {
  const settlement = summarizeTaskSettlement(
    params.items,
    params.creditsCost,
    params.settlementMessages,
  );
  if (!settlement) {
    return { updated: false, settlement: null };
  }

  const allowedStatuses = params.allowedStatuses ?? ACTIVE_TASK_STATUSES;

  return db.transaction(async (tx) => {
    const [updatedTask] = await tx
      .update(tasks)
      .set({
        status: settlement.finalStatus,
        resultUrls: settlement.successUrls,
        creditsCost: settlement.finalCreditsCost,
        completedAt: new Date(),
        errorMessage: settlement.errorMessage ?? null,
      })
      .where(
        and(
          eq(tasks.id, params.taskId),
          inArray(tasks.status, [...allowedStatuses]),
        ),
      )
      .returning({ id: tasks.id });

    if (!updatedTask) {
      return { updated: false, settlement };
    }

    if (settlement.refundAmount > 0) {
      const [creditedUser] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${settlement.refundAmount}` })
        .where(eq(users.id, params.userId))
        .returning({ credits: users.credits });

      await tx.insert(creditTxns).values({
        userId: params.userId,
        type: "refund",
        amount: settlement.refundAmount,
        reason: settlement.hasAnySuccess
          ? params.refundMessages?.partial?.(settlement) ??
            `部分失败退款 (${settlement.failedCount}/${settlement.totalCount} 失败)`
          : params.refundMessages?.allFailed ?? "生成失败自动退款",
        taskId: params.taskId,
        balanceAfter: creditedUser?.credits ?? 0,
      });
    }

    return { updated: true, settlement };
  });
}

export async function failTaskAndRefund(params: {
  taskId: string;
  userId: string;
  refundAmount: number;
  errorMessage: string;
  refundReason: string;
  allowedStatuses?: readonly Task["status"][];
}): Promise<boolean> {
  const allowedStatuses = params.allowedStatuses ?? ACTIVE_TASK_STATUSES;

  return db.transaction(async (tx) => {
    const [updatedTask] = await tx
      .update(tasks)
      .set({
        status: "failed",
        creditsCost: 0,
        errorMessage: params.errorMessage,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, params.taskId),
          inArray(tasks.status, [...allowedStatuses]),
        ),
      )
      .returning({ id: tasks.id });

    if (!updatedTask) return false;

    if (params.refundAmount > 0) {
      const [creditedUser] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${params.refundAmount}` })
        .where(eq(users.id, params.userId))
        .returning({ credits: users.credits });

      await tx.insert(creditTxns).values({
        userId: params.userId,
        type: "refund",
        amount: params.refundAmount,
        reason: params.refundReason,
        taskId: params.taskId,
        balanceAfter: creditedUser?.credits ?? 0,
      });
    }

    return true;
  });
}
