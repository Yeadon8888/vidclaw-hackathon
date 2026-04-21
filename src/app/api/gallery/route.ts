import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { galleryItems, tasks, users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import type { ScriptResult } from "@/lib/video/types";
import {
  fetchAssetBuffer,
  uploadVideo,
  isUploadGatewayEnabled,
} from "@/lib/storage/gateway";

/**
 * GET /api/gallery — Public paginated gallery listing
 */
export async function GET(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
  const offset = (page - 1) * limit;

  const items = await db
    .select({
      id: galleryItems.id,
      title: galleryItems.title,
      videoUrl: galleryItems.videoUrl,
      thumbnailUrl: galleryItems.thumbnailUrl,
      prompt: galleryItems.prompt,
      modelSlug: galleryItems.modelSlug,
      tags: galleryItems.tags,
      viewCount: galleryItems.viewCount,
      likeCount: galleryItems.likeCount,
      createdAt: galleryItems.createdAt,
      authorName: users.name,
    })
    .from(galleryItems)
    .innerJoin(users, eq(galleryItems.userId, users.id))
    .where(eq(galleryItems.isApproved, true))
    .orderBy(desc(galleryItems.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items, page, limit });
}

/**
 * POST /api/gallery — Publish a task to the gallery (requires auth, task must be done)
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = (await req.json()) as { taskId: string; title?: string };
  const { taskId } = body;
  if (!taskId) {
    return NextResponse.json({ error: "缺少 taskId" }, { status: 400 });
  }

  // Verify task belongs to user and is done
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
    .limit(1);

  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  if (task.status !== "done" || !task.resultUrls?.length) {
    return NextResponse.json({ error: "只能分享已完成且有视频结果的任务" }, { status: 400 });
  }

  // Check if already published
  const [existing] = await db
    .select({ id: galleryItems.id })
    .from(galleryItems)
    .where(eq(galleryItems.taskId, taskId))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "该任务已分享到广场" }, { status: 409 });
  }

  const script = task.scriptJson as ScriptResult | null;
  const params = task.paramsJson as { model?: string } | null;
  const title =
    body.title?.trim() ||
    script?.copy?.title ||
    task.inputText?.slice(0, 100) ||
    "未命名作品";

  // Extract tags from script copy
  const tags: string[] = [];
  if (script?.copy?.caption) {
    const hashtagMatches = script.copy.caption.match(/#[\w\u4e00-\u9fff]+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.slice(0, 8));
    }
  }

  // ── Rehost the video to our own R2 so the gallery card doesn't depend on
  // upstream provider CDNs (which may expire signed URLs or block hotlink).
  // Thumbnail generation runs asynchronously via the cron backfill at
  // /api/internal/gallery/thumbnail-backfill — it needs ffmpeg, so we don't
  // block the publish path on it.
  const upstreamUrl = task.resultUrls[0];
  let finalVideoUrl = upstreamUrl;

  if (isUploadGatewayEnabled()) {
    try {
      const fetched = await fetchAssetBuffer(upstreamUrl);
      const stored = await uploadVideo({
        userId: user.id,
        filename: `gallery-${taskId.slice(0, 8)}.mp4`,
        data: fetched.buffer,
        contentType: fetched.mimeType.startsWith("video/") ? fetched.mimeType : "video/mp4",
      });
      finalVideoUrl = stored.url;
    } catch (e) {
      console.warn("[gallery] video rehost failed; falling back to upstream URL:", e instanceof Error ? e.message : e);
    }
  }

  const [item] = await db
    .insert(galleryItems)
    .values({
      taskId,
      userId: user.id,
      title,
      videoUrl: finalVideoUrl,
      prompt: task.soraPrompt,
      scriptJson: task.scriptJson,
      modelSlug: params?.model ?? null,
      tags,
    })
    .returning();

  return NextResponse.json({ ok: true, id: item.id });
}
