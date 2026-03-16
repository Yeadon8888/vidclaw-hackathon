import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteAsset, isUploadGatewayEnabled } from "@/lib/storage/gateway";
import { db } from "@/lib/db";
import { userAssets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/** DELETE /api/assets/[assetId] — delete a user asset by DB id */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { assetId } = await params;

  // Find the asset in DB (only owner can delete)
  const [asset] = await db
    .select()
    .from(userAssets)
    .where(and(eq(userAssets.id, assetId), eq(userAssets.userId, user.id)))
    .limit(1);

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete from R2 if gateway is enabled
  if (isUploadGatewayEnabled()) {
    try {
      await deleteAsset(user.id, asset.r2Key);
    } catch {
      // R2 delete failure is non-fatal — still remove DB record
    }
  }

  // Remove from DB
  await db.delete(userAssets).where(eq(userAssets.id, assetId));

  return NextResponse.json({ ok: true });
}
