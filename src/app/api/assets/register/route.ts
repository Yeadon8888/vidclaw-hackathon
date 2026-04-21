import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userAssets } from "@/lib/db/schema";

/**
 * POST /api/assets/register
 *
 * 浏览器把文件直传到上传网关后，调用这个接口把 asset 登记到 DB。
 *
 * 安全要求：
 *   - `key` 必须以 `${UPLOAD_PREFIX}/${user.id}/` 开头，防止跨用户登记。
 *   - 登记到 DB 的 `url` **必须由服务端根据 key + UPLOAD_API_URL 拼出**，
 *     不再接受客户端上报的 `url`。这是防 SSRF / 资产篡改的关键一步。
 *     原实现把客户端 url 直接写库，后续 fetchAssetBuffer(url) 会拿着
 *     该 url 在服务端发起下载，等于把任意可达地址当成自己的资产源。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = (await req.json()) as {
    key?: string;
    size?: number;
    filename?: string;
    contentType?: string;
  };

  if (!body.key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const baseUrl = process.env.UPLOAD_API_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Upload gateway not configured" },
      { status: 503 },
    );
  }

  const prefix = (process.env.UPLOAD_PREFIX?.trim() ?? "vidclaw-assets").replace(
    /^\/+|\/+$/g,
    "",
  );
  const expectedPrefix = `${prefix}/${user.id}/`;
  if (!body.key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 403 });
  }

  const trustedUrl = buildTrustedAssetUrl(baseUrl, body.key);
  const isVideo =
    body.contentType?.startsWith("video/") ?? body.key.includes("/vid-");
  const assetType = isVideo ? ("video" as const) : ("image" as const);

  const [record] = await db
    .insert(userAssets)
    .values({
      userId: user.id,
      type: assetType,
      r2Key: body.key,
      url: trustedUrl,
      filename: body.filename ?? null,
      sizeBytes: body.size ?? null,
    })
    .returning();

  return NextResponse.json(record);
}

function buildTrustedAssetUrl(baseUrl: string, key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/files/${encodedKey}`;
}
