import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assetTransformJobs,
  creditTxns,
  userAssets,
  users,
  type AssetTransformJob,
  type UserAsset,
} from "@/lib/db/schema";
import { editProductImageToPortraitWhiteBg } from "@/lib/image-edit/bltcy";
import { getActiveModelByCapability } from "@/lib/models/repository";
import { MODEL_CAPABILITIES } from "@/lib/models/capabilities";
import {
  deleteAsset,
  isUploadGatewayEnabled,
  uploadAsset,
} from "@/lib/storage/gateway";
import { resolveImageBuffer } from "@/lib/image-edit/payload";
import { MAX_CONCURRENT_ASSET_TRANSFORMS, resolveAssetTransformAvailableSlots } from "@/lib/image-edit/queue";

export interface AssetTransformJobWithAssets extends AssetTransformJob {
  sourceAsset: Pick<UserAsset, "id" | "url" | "filename">;
  targetAsset: Pick<UserAsset, "id" | "url" | "filename"> | null;
}

const PROCESSING_STALE_MS = 6 * 60 * 1000;
const DEFAULT_ASSET_TRANSFORM_LIMIT = 1;

function isRetryableAssetTransformError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();

  return (
    message.includes("aborted due to timeout") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("system memory overloaded") ||
    message.includes("http 524") ||
    message.includes("http 502") ||
    message.includes("http 503") ||
    message.includes("http 504")
  );
}

export async function listAssetTransformJobs(params: {
  userId: string;
  assetIds?: string[];
  limit?: number;
}): Promise<AssetTransformJobWithAssets[]> {
  const conditions = [eq(assetTransformJobs.userId, params.userId)];
  if (params.assetIds && params.assetIds.length > 0) {
    conditions.push(inArray(assetTransformJobs.sourceAssetId, params.assetIds));
  }

  const jobs = await db
    .select()
    .from(assetTransformJobs)
    .where(and(...conditions))
    .orderBy(desc(assetTransformJobs.createdAt))
    .limit(Math.max(1, Math.min(params.limit ?? 200, 500)));

  const assetIdSet = new Set<string>();
  for (const job of jobs) {
    assetIdSet.add(job.sourceAssetId);
    if (job.targetAssetId) {
      assetIdSet.add(job.targetAssetId);
    }
  }

  const relatedAssets = assetIdSet.size > 0
    ? await db
        .select({
          id: userAssets.id,
          url: userAssets.url,
          filename: userAssets.filename,
        })
        .from(userAssets)
        .where(inArray(userAssets.id, Array.from(assetIdSet)))
    : [];

  const assetMap = new Map(relatedAssets.map((asset) => [asset.id, asset]));

  return jobs
    .map((job) => {
      const sourceAsset = assetMap.get(job.sourceAssetId);
      if (!sourceAsset) return null;

      return {
        ...job,
        sourceAsset,
        targetAsset: job.targetAssetId ? assetMap.get(job.targetAssetId) ?? null : null,
      };
    })
    .filter((job): job is AssetTransformJobWithAssets => job !== null);
}

export async function submitAssetTransformJobs(params: {
  userId: string;
  assetIds: string[];
}) {
  if (!isUploadGatewayEnabled()) {
    throw new Error("上传网关未配置，暂时无法处理图片转换。");
  }

  const normalizedIds = Array.from(new Set(params.assetIds.filter(Boolean)));
  if (normalizedIds.length === 0) {
    throw new Error("请先勾选至少一张产品图。");
  }

  const model = await getActiveModelByCapability({
    capability: MODEL_CAPABILITIES.imageEdit,
  });

  const [currentUser] = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!currentUser) {
    throw new Error("用户不存在。");
  }

  const assets = await db
    .select()
    .from(userAssets)
    .where(
      and(
        eq(userAssets.userId, params.userId),
        eq(userAssets.type, "image"),
        inArray(userAssets.id, normalizedIds),
      ),
    );

  if (assets.length !== normalizedIds.length) {
    throw new Error("部分产品图不存在或无权限操作。");
  }

  const existing = await db
    .select()
    .from(assetTransformJobs)
    .where(
      and(
        eq(assetTransformJobs.userId, params.userId),
        inArray(assetTransformJobs.sourceAssetId, normalizedIds),
        or(
          eq(assetTransformJobs.status, "pending"),
          eq(assetTransformJobs.status, "processing"),
        ),
      ),
    );

  const existingAssetIds = new Set(existing.map((job) => job.sourceAssetId));
  const toCreate = normalizedIds.filter((assetId) => !existingAssetIds.has(assetId));

  const requiredCredits = toCreate.length * model.creditsPerGen;
  if (requiredCredits > currentUser.credits) {
    throw new Error(
      `积分不足。当前可新建 ${toCreate.length} 个任务，需要 ${requiredCredits} 积分，当前余额 ${currentUser.credits}。`,
    );
  }

  if (toCreate.length > 0) {
    const pendingRows = toCreate.map((assetId) => ({
      userId: params.userId,
      sourceAssetId: assetId,
      modelId: model.id,
      creditsCost: model.creditsPerGen,
      status: "pending" as const,
    }));

    await db.insert(assetTransformJobs).values(pendingRows);
  }

  return {
    model,
    requestedCount: normalizedIds.length,
    createdCount: toCreate.length,
    skippedCount: normalizedIds.length - toCreate.length,
  };
}

// Leave a safety buffer under Vercel's 300s maxDuration so the function
// returns cleanly instead of being killed mid-transaction.
const DRAIN_BUDGET_MS = 260_000;

export async function processPendingAssetTransformJobs(params?: {
  userId?: string;
  limit?: number;
}) {
  await resetStaleAssetTransformJobs(params?.userId);

  let processed = 0;
  let failed = 0;
  let requeued = 0;
  const startedAt = Date.now();

  // Drain loop: keep picking up batches of up-to-3 until the queue is empty,
  // capacity is full from concurrent workers, or we're running out of runtime.
  // Without this loop, a client-side batch of N > MAX_CONCURRENT leaves the
  // tail of pendings stranded because nothing re-triggers the worker once the
  // initial round of Promise.all completes.
  while (Date.now() - startedAt < DRAIN_BUDGET_MS) {
    const [activeProcessingRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assetTransformJobs)
      .where(
        params?.userId
          ? and(
              eq(assetTransformJobs.userId, params.userId),
              eq(assetTransformJobs.status, "processing"),
            )
          : eq(assetTransformJobs.status, "processing"),
      );

    const batchLimit = resolveAssetTransformAvailableSlots({
      processingCount: activeProcessingRow?.count ?? 0,
      requestedCount: params?.limit ?? DEFAULT_ASSET_TRANSFORM_LIMIT,
    });

    if (batchLimit <= 0) break;

    const whereClause = params?.userId
      ? and(
          eq(assetTransformJobs.userId, params.userId),
          eq(assetTransformJobs.status, "pending"),
        )
      : eq(assetTransformJobs.status, "pending");

    const queuedJobs = await db
      .select()
      .from(assetTransformJobs)
      .where(whereClause)
      .orderBy(desc(assetTransformJobs.createdAt))
      .limit(batchLimit);

    if (queuedJobs.length === 0) break;

    const roundResults = await Promise.all(
      queuedJobs.map(async (queuedJob) => {
        const [claimedJob] = await db
          .update(assetTransformJobs)
          .set({
            status: "processing",
            errorMessage: null,
            startedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(assetTransformJobs.id, queuedJob.id),
              eq(assetTransformJobs.status, "pending"),
            ),
          )
          .returning();

        if (!claimedJob) return "skipped" as const;

        try {
          await runAssetTransformJob(claimedJob);
          return "processed" as const;
        } catch (error) {
          const message =
            error instanceof Error ? error.message.slice(0, 500) : "图片转换失败";

          if (isRetryableAssetTransformError(error)) {
            await db
              .update(assetTransformJobs)
              .set({
                status: "pending",
                errorMessage: `图片处理耗时过长，已自动重试。上次错误：${message}`.slice(0, 500),
                updatedAt: new Date(),
                startedAt: null,
                completedAt: null,
              })
              .where(eq(assetTransformJobs.id, claimedJob.id));
            return "requeued" as const;
          }

          await db
            .update(assetTransformJobs)
            .set({
              status: "failed",
              errorMessage: message,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(assetTransformJobs.id, claimedJob.id));
          return "failed" as const;
        }
      }),
    );

    let roundActivity = 0;
    for (const r of roundResults) {
      if (r === "processed") {
        processed += 1;
        roundActivity += 1;
      } else if (r === "failed") {
        failed += 1;
        roundActivity += 1;
      } else if (r === "requeued") {
        requeued += 1;
      }
    }

    // If every returned row was already claimed by a concurrent worker, bail
    // so we don't spin on an empty queue.
    if (roundActivity === 0 && requeued === 0) break;
  }

  return { processed, failed, requeued };
}

export function getMaxConcurrentAssetTransforms() {
  return MAX_CONCURRENT_ASSET_TRANSFORMS;
}

export async function countPendingAssetTransformJobs(params?: { userId?: string }) {
  const whereClause = params?.userId
    ? and(
        eq(assetTransformJobs.userId, params.userId),
        eq(assetTransformJobs.status, "pending"),
      )
    : eq(assetTransformJobs.status, "pending");

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assetTransformJobs)
    .where(whereClause);

  return row?.count ?? 0;
}

async function resetStaleAssetTransformJobs(userId?: string) {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS);
  const conditions = [
    eq(assetTransformJobs.status, "processing"),
    lt(assetTransformJobs.updatedAt, staleBefore),
  ];

  if (userId) {
    conditions.push(eq(assetTransformJobs.userId, userId));
  }

  await db
    .update(assetTransformJobs)
    .set({
      status: "pending",
      updatedAt: new Date(),
      errorMessage: "上次处理超过轮询窗口，已自动重新排队继续重试。",
      startedAt: null,
      completedAt: null,
    })
    .where(and(...conditions));
}

async function runAssetTransformJob(job: AssetTransformJob) {
  const [sourceAsset] = await db
    .select()
    .from(userAssets)
    .where(
      and(
        eq(userAssets.id, job.sourceAssetId),
        eq(userAssets.userId, job.userId),
        eq(userAssets.type, "image"),
      ),
    )
    .limit(1);

  if (!sourceAsset) {
    throw new Error("原始产品图不存在，无法继续转换。");
  }

  const model = await getActiveModelByCapability({
    capability: MODEL_CAPABILITIES.imageEdit,
  });

  const edited = await editProductImageToPortraitWhiteBg({
    assetUrl: sourceAsset.url,
    model,
  });

  const rendered = await resolveImageBuffer(edited.imageUrl);
  const filenameBase =
    (sourceAsset.filename?.replace(/\.[^.]+$/, "") ||
      `asset-${sourceAsset.id.slice(0, 8)}`) + "-9x16-white";

  const stored = await uploadAsset({
    userId: job.userId,
    filename: `${filenameBase}.png`,
    data: rendered.buffer,
    contentType: rendered.mimeType || "image/png",
  });

  try {
    await db.transaction(async (tx) => {
      const [deducted] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} - ${model.creditsPerGen}` })
        .where(
          and(
            eq(users.id, job.userId),
            sql`${users.credits} >= ${model.creditsPerGen}`,
          ),
        )
        .returning({ credits: users.credits });

      if (!deducted) {
        throw new Error(`积分不足。需要 ${model.creditsPerGen} 积分，请充值后重试。`);
      }

      const [createdAsset] = await tx
        .insert(userAssets)
        .values({
          userId: job.userId,
          type: "image",
          r2Key: stored.key,
          url: stored.url,
          filename: `${filenameBase}.png`,
          sizeBytes: stored.size,
        })
        .returning();

      await tx.insert(creditTxns).values({
        userId: job.userId,
        type: "consume",
        amount: -model.creditsPerGen,
        reason: `商品图转 9:16 白底图 (${model.slug})`,
        modelId: model.id,
        balanceAfter: deducted.credits,
      });

      await tx
        .update(assetTransformJobs)
        .set({
          status: "succeeded",
          modelId: model.id,
          creditsCost: model.creditsPerGen,
          targetAssetId: createdAsset.id,
          completedAt: new Date(),
          updatedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(assetTransformJobs.id, job.id));
    });
  } catch (error) {
    await deleteAsset(job.userId, stored.key).catch(() => undefined);
    throw error;
  }
}
