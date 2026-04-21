import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, creditTxns, tasks } from "@/lib/db/schema";
import { insertTaskItemsFromSubmission } from "@/lib/tasks/items";
import {
  createVideoTasks,
  getActiveVideoModelBySlug,
} from "@/lib/video/service";

export const maxDuration = 300;

/** Try flash first (cheaper), fall back to standard */
const FACE_SWAP_SLUGS = ["wan2.6-r2v-flash", "wan2.6-r2v"];

/**
 * POST /api/face-swap — Create a face-swap video using wan2.6-r2v
 * Body: { faceImageUrl: string, prompt: string }
 *
 * Uses the standard video generation pipeline — wan2.6-r2v accepts
 * a reference face image and generates a video with that person.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = (await req.json()) as {
    faceImageUrl: string;
    prompt?: string;
  };

  if (!body.faceImageUrl?.trim()) {
    return NextResponse.json(
      { error: "请提供人脸参考图片。" },
      { status: 400 },
    );
  }

  let model = null;
  for (const slug of FACE_SWAP_SLUGS) {
    model = await getActiveVideoModelBySlug(slug);
    if (model) break;
  }
  if (!model) {
    return NextResponse.json(
      { error: "换人视频模型未配置。请在管理后台启用 wan2.6-r2v 并填写阿里百炼 API Key。" },
      { status: 503 },
    );
  }

  const creditsCost = model.creditsPerGen;
  if (user.credits < creditsCost) {
    return NextResponse.json(
      { error: `积分不足。需要 ${creditsCost} 积分，当前余额 ${user.credits}。` },
      { status: 400 },
    );
  }

  // Deduct credits + create task atomically
  const prompt = body.prompt?.trim() || "A natural video featuring this person, maintaining their exact facial features and identity";

  const txResult = await db.transaction(async (tx) => {
    const [deducted] = await tx
      .update(users)
      .set({ credits: sql`${users.credits} - ${creditsCost}` })
      .where(and(eq(users.id, user.id), sql`${users.credits} >= ${creditsCost}`))
      .returning({ credits: users.credits });

    if (!deducted) return null;

    const [task] = await tx
      .insert(tasks)
      .values({
        userId: user.id,
        type: "theme",
        status: "generating",
        modelId: model.id,
        inputText: prompt,
        soraPrompt: prompt,
        creditsCost,
        paramsJson: {
          orientation: "portrait" as const,
          duration: 5 as const,
          count: 1,
          platform: "tiktok" as const,
          model: model.slug,
          imageUrls: [body.faceImageUrl],
          sourceMode: "upload" as const,
        } satisfies import("@/lib/video/types").TaskParamsSnapshot,
      })
      .returning();

    await tx.insert(creditTxns).values({
      userId: user.id,
      type: "consume",
      amount: -creditsCost,
      reason: `换人视频 (${model.slug})`,
      modelId: model.id,
      taskId: task.id,
      balanceAfter: deducted.credits,
    });

    return { task, deducted };
  });

  if (!txResult) {
    return NextResponse.json({ error: "积分不足。" }, { status: 400 });
  }

  const { task } = txResult;

  try {
    const result = await createVideoTasks({
      model,
      request: {
        prompt,
        imageUrls: [body.faceImageUrl],
        orientation: "portrait",
        duration: 5,
        count: 1,
        model: model.slug,
      },
      userId: user.id,
    });

    // Record task items (synchronous providers may return immediateResults
    // so the rows go in already as SUCCESS).
    await insertTaskItemsFromSubmission({
      taskId: task.id,
      providerTaskIds: result.providerTaskIds,
      immediateResults: result.immediateResults,
    });

    return NextResponse.json({
      ok: true,
      taskId: task.id,
      providerTaskIds: result.providerTaskIds,
      creditsCost,
    });
  } catch (e) {
    // Refund on failure
    await db.transaction(async (tx) => {
      const [refunded] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${creditsCost}` })
        .where(eq(users.id, user.id))
        .returning({ credits: users.credits });

      await tx.insert(creditTxns).values({
        userId: user.id,
        type: "refund",
        amount: creditsCost,
        reason: "换人视频提交失败自动退款",
        taskId: task.id,
        balanceAfter: refunded?.credits ?? 0,
      });

      await tx
        .update(tasks)
        .set({ status: "failed", errorMessage: String(e).slice(0, 500) })
        .where(eq(tasks.id, task.id));
    });

    return NextResponse.json(
      { error: "视频提交失败，积分已退还。" },
      { status: 500 },
    );
  }
}
