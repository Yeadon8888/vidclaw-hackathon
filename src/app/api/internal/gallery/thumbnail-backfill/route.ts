/**
 * Background backfill: generates JPG thumbnails for any gallery_items rows
 * whose `thumbnail_url` is still NULL.
 *
 * Triggered by Supabase pg_cron (see scripts/deploy-supabase-cron.ts).
 * Bearer-token gated with CRON_SECRET, matching the existing internal cron
 * pattern in /api/internal/tasks/tick.
 *
 * Why a cron instead of inline in /api/gallery POST:
 *   ffmpeg is heavy (~50MB binary, 1-3s per frame extract). Doing it in the
 *   publish handler would slow user-perceived publish to 5-10s and bloat the
 *   serverless cold-start. The cron picks up missed thumbnails within a
 *   minute, which is fine for a gallery card.
 */
import { NextRequest, NextResponse } from "next/server";
import { isNull, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { galleryItems } from "@/lib/db/schema";
import { generateVideoThumbnail } from "@/lib/storage/thumbnail";
import { uploadThumbnail, isUploadGatewayEnabled } from "@/lib/storage/gateway";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && bearer === cronSecret);
}

const DEFAULT_BATCH = 5;
const MAX_BATCH = 20;

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUploadGatewayEnabled()) {
    return NextResponse.json({ error: "Upload gateway not configured" }, { status: 503 });
  }

  const limit = clamp(
    Number(req.nextUrl.searchParams.get("limit") ?? DEFAULT_BATCH),
    1,
    MAX_BATCH,
  );

  const candidates = await db
    .select({
      id: galleryItems.id,
      userId: galleryItems.userId,
      videoUrl: galleryItems.videoUrl,
    })
    .from(galleryItems)
    .where(isNull(galleryItems.thumbnailUrl))
    .orderBy(desc(galleryItems.createdAt))
    .limit(limit);

  let succeeded = 0;
  const failures: { id: string; error: string }[] = [];

  for (const item of candidates) {
    try {
      const thumb = await generateVideoThumbnail({ videoUrl: item.videoUrl });
      const stored = await uploadThumbnail({
        userId: item.userId,
        data: thumb.buffer,
        contentType: thumb.contentType,
      });
      await db
        .update(galleryItems)
        .set({ thumbnailUrl: stored.url })
        .where(eq(galleryItems.id, item.id));
      succeeded += 1;
    } catch (e) {
      failures.push({
        id: item.id,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      });
    }
  }

  return NextResponse.json({
    candidates: candidates.length,
    succeeded,
    failed: failures.length,
    failures,
  });
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
