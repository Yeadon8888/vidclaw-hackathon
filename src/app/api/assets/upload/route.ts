import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  isUploadGatewayEnabled,
  uploadAsset,
  uploadVideo,
} from "@/lib/storage/gateway";
import { db } from "@/lib/db";
import { userAssets } from "@/lib/db/schema";
import { inspectAssetUpload } from "@/lib/assets/upload";

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

  const inspection = inspectAssetUpload({
    type: file.type,
    size: file.size,
  });
  if (!inspection.ok) {
    return NextResponse.json(
      { error: inspection.error },
      { status: inspection.status },
    );
  }

  let r2Asset;
  try {
    const buffer = await file.arrayBuffer();
    r2Asset =
      inspection.assetType === "video"
        ? await uploadVideo({
            userId: user.id,
            filename: file.name,
            data: buffer,
            contentType: file.type || "application/octet-stream",
          })
        : await uploadAsset({
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
      type: inspection.assetType,
      r2Key: r2Asset.key,
      url: r2Asset.url,
      filename: file.name,
      sizeBytes: r2Asset.size,
    })
    .returning();

  return NextResponse.json(record);
}
