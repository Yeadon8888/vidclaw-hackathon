import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isUploadGatewayEnabled, uploadAsset } from "@/lib/storage/gateway";
import { db } from "@/lib/db";
import { userAssets } from "@/lib/db/schema";

/** POST /api/assets/upload — upload an image or video file */
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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Determine asset type from MIME
  const isVideo = file.type.startsWith("video/");
  const assetType = isVideo ? "video" as const : "image" as const;

  let r2Asset;
  try {
    const buffer = await file.arrayBuffer();
    r2Asset = await uploadAsset({
      userId: user.id,
      filename: file.name,
      data: buffer,
      contentType: file.type || "application/octet-stream",
    });
  } catch (err) {
    console.error("[upload] R2 upload failed:", err);
    return NextResponse.json(
      { error: `上传到存储服务失败: ${String(err).slice(0, 200)}` },
      { status: 502 },
    );
  }

  // Track in DB
  const [record] = await db
    .insert(userAssets)
    .values({
      userId: user.id,
      type: assetType,
      r2Key: r2Asset.key,
      url: r2Asset.url,
      filename: file.name,
      sizeBytes: r2Asset.size,
    })
    .returning();

  return NextResponse.json(record);
}
