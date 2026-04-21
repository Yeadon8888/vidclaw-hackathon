import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/assets/upload-token
 *
 * 给浏览器直传到上传网关签发所需的凭证。直传是为了绕过 Vercel 的 4.5 MB
 * body-size 限制（视频/高清图经常超过）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 安全边界（读 code review 的人请看这里）
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 真正干净的做法是网关签发一次性签名 URL，浏览器只拿到短时、限 key、
 * 限方法、限大小的凭证；但本仓库对应的 Cloudflare Worker 当前没有
 * /sign-upload 能力，那条路要等网关侧先加完接口才能接。
 *
 * 作为过渡方案：分离两把 key。服务端自己的 list / delete / backfill 用
 * `UPLOAD_API_KEY`（admin）；只签发给浏览器的上传 key 从
 * `UPLOAD_CLIENT_KEY` 取（理应只具备 `POST /upload` 能力，由网关侧的
 * 权限配置限制）。如果只配置了 UPLOAD_API_KEY，临时回退到它，但每次
 * 签发都打 warn 让运维看见，促使尽快分离。
 *
 * 后续：把网关 /sign-upload 加上后，这个路由改成"调 /sign-upload 拿签名
 * URL 再返回"，把 UPLOAD_CLIENT_KEY 也砍掉。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const baseUrl = process.env.UPLOAD_API_URL?.trim().replace(/\/+$/, "") ?? "";
  const clientKey = process.env.UPLOAD_CLIENT_KEY?.trim() ?? "";
  const adminKey = process.env.UPLOAD_API_KEY?.trim() ?? "";
  const prefix = (process.env.UPLOAD_PREFIX?.trim() ?? "vidclaw-assets").replace(
    /^\/+|\/+$/g,
    "",
  );

  const exposedKey = clientKey || adminKey;
  if (!baseUrl || !exposedKey) {
    return NextResponse.json(
      { error: "Upload gateway not configured" },
      { status: 503 },
    );
  }

  if (!clientKey && adminKey) {
    console.warn(
      "[upload-token] UPLOAD_CLIENT_KEY 未配置，回退使用 UPLOAD_API_KEY。" +
        " 建议在上传网关侧新建一把只允许 POST /upload 的受限 key，通过" +
        " UPLOAD_CLIENT_KEY 单独注入，避免管理员密钥进入浏览器。",
    );
  }

  const { filename, contentType } = (await req.json()) as {
    filename?: string;
    contentType?: string;
  };

  const ext = getExtension(filename ?? "file.bin");
  const isVideo = contentType?.startsWith("video/");
  const tag = isVideo ? "vid" : "img";
  const key = `${prefix}/${user.id}/${tag}-${crypto.randomUUID()}.${ext}`;

  const uploadUrl = `${baseUrl}/upload?key=${encodeURIComponent(key)}`;

  return NextResponse.json({ uploadUrl, apiKey: exposedKey, key });
}

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  const ext = parts.length > 1 ? parts.pop() : "bin";
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}
