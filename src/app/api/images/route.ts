import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  deleteAsset,
  isUploadGatewayEnabled,
  listAssets,
  uploadAsset,
} from "@/lib/storage/gateway";
import { db } from "@/lib/db";
import { userAssets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/** GET /api/images — list user's reference images */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  if (!isUploadGatewayEnabled()) {
    return NextResponse.json({ urls: [], gateway_enabled: false });
  }

  try {
    const all = await listAssets(user.id);
    const urls = all.filter((a) =>
      /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(a.url),
    );
    return NextResponse.json({ urls, gateway_enabled: true });
  } catch (e) {
    return NextResponse.json(
      { urls: [], gateway_enabled: true, error: String(e) },
      { status: 502 },
    );
  }
}

/** POST /api/images — upload a reference image */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  if (!isUploadGatewayEnabled()) {
    return NextResponse.json(
      { error: "Upload gateway not configured" },
      { status: 503 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const asset = await uploadAsset({
      userId: user.id,
      filename: file.name,
      data: buffer,
      contentType: file.type || "application/octet-stream",
    });

    // Also track in DB
    await db.insert(userAssets).values({
      userId: user.id,
      type: "image",
      r2Key: asset.key,
      url: asset.url,
      filename: file.name,
      sizeBytes: asset.size,
    });

    return NextResponse.json(asset);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

/** DELETE /api/images — delete a reference image */
export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  if (!isUploadGatewayEnabled()) {
    return NextResponse.json(
      { error: "Upload gateway not configured" },
      { status: 503 },
    );
  }

  const { key } = (await req.json()) as { key?: string };
  if (!key) {
    return NextResponse.json({ error: "No key provided" }, { status: 400 });
  }

  await deleteAsset(user.id, key);

  // Remove from DB
  await db
    .delete(userAssets)
    .where(and(eq(userAssets.userId, user.id), eq(userAssets.r2Key, key)));

  return NextResponse.json({ ok: true });
}
