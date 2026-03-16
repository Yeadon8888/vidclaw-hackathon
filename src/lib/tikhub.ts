/**
 * TikHub integration — resolve Douyin / TikTok share URLs and download
 * watermark-free video. Three-tier fallback strategy.
 */

const TIKHUB_BASE_URL = "https://api.tikhub.io";
const HYBRID_PATH = "/api/v1/hybrid/video_data";

function getApiKey(): string {
  return (process.env.TIKHUB_API_KEY ?? "").trim();
}

export function isTikHubEnabled(): boolean {
  return getApiKey().length > 0;
}

const URL_PATTERN =
  /https?:\/\/[^\s<>"']+(?:douyin|tiktok|v\.douyin)[^\s<>"']*/i;

/** Return true if text looks like a Douyin / TikTok share link. */
export function looksLikeVideoUrl(text: string): boolean {
  return URL_PATTERN.test(text);
}

/** Extract the first Douyin/TikTok URL from mixed share text. */
export function extractUrl(text: string): string | null {
  const m = text.match(URL_PATTERN);
  return m ? m[0].replace(/[.,，。）)】』"']+$/, "") : null;
}

// ─── Internal helpers ───

async function tikhubGet(path: string): Promise<Record<string, unknown>> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("TIKHUB_API_KEY is not set");

  const url = `${TIKHUB_BASE_URL}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
    }
  }
  throw lastError ?? new Error("TikHub request failed");
}

async function resolveShortUrl(url: string): Promise<string> {
  if (!/\/t\//.test(url)) return url;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      },
      signal: AbortSignal.timeout(10_000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function extractVideoUrl(data: Record<string, unknown>): string | null {
  // hybrid format
  for (const key of ["nwm_video_url_HQ", "nwm_video_url"]) {
    const val = data[key];
    if (typeof val === "string" && val.startsWith("http")) return val;
    if (val && typeof val === "object") {
      const urls = (val as Record<string, unknown>).url_list;
      if (Array.isArray(urls) && typeof urls[0] === "string") return urls[0];
    }
  }
  // aweme_detail format
  const video = (data as Record<string, Record<string, unknown>>).video;
  if (video && typeof video === "object") {
    for (const key of ["play_addr", "download_addr"]) {
      const addr = video[key];
      if (addr && typeof addr === "object") {
        const urls = (addr as Record<string, unknown>).url_list;
        if (Array.isArray(urls) && typeof urls[0] === "string") return urls[0];
      }
    }
  }
  return null;
}

// ─── Public API ───

export interface DownloadResult {
  buffer: ArrayBuffer;
  mimeType: string;
  sizeMB: number;
}

/**
 * Resolve a Douyin/TikTok share URL → download watermark-free video.
 * Three-tier fallback: hybrid API → aweme_id API → share_url API.
 */
export async function downloadVideoFromUrl(
  shareUrl: string,
  onProgress?: (msg: string) => void,
): Promise<DownloadResult> {
  const log = onProgress ?? (() => {});

  // Step 0: resolve short links
  const resolved = await resolveShortUrl(shareUrl);
  if (resolved !== shareUrl) log(`短链展开 → ${resolved}`);

  // Step 1a: hybrid API
  let videoUrl: string | null = null;
  const encoded = encodeURIComponent(resolved);

  try {
    const result = await tikhubGet(
      `${HYBRID_PATH}?url=${encoded}&minimal=true`,
    );
    const code =
      (result.code as number) ??
      ((result.detail as Record<string, unknown>)?.code as number);
    if (code === 200) {
      const vd =
        (result.data as Record<string, Record<string, unknown>>)?.video_data ??
        {};
      videoUrl = extractVideoUrl(vd);
    } else {
      log(`hybrid 接口返回 ${code}，尝试备用接口...`);
    }
  } catch (e) {
    log(`hybrid 接口失败: ${String(e).slice(0, 100)}，尝试备用接口...`);
  }

  // Step 1b: fallback — extract aweme_id → app v3
  if (!videoUrl) {
    const m = resolved.match(/\/video\/(\d+)/);
    if (m) {
      const awemeId = m[1];
      log(`使用 TikTok app v3 (aweme_id=${awemeId})...`);
      const result = await tikhubGet(
        `/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${awemeId}`,
      );
      if ((result.code as number) === 200) {
        const detail =
          (result.data as Record<string, Record<string, unknown>>)
            ?.aweme_detail ?? {};
        videoUrl = extractVideoUrl(detail);
      }
    }
  }

  // Step 1c: fallback — share_url API
  if (!videoUrl) {
    log("使用 share_url 接口...");
    const encodedShare = encodeURIComponent(resolved);
    const result = await tikhubGet(
      `/api/v1/tiktok/app/v3/fetch_one_video_by_share_url?share_url=${encodedShare}`,
    );
    if ((result.code as number) === 200) {
      const detail =
        (result.data as Record<string, Record<string, unknown>>)
          ?.aweme_detail ?? {};
      videoUrl = extractVideoUrl(detail);
    }
  }

  if (!videoUrl) {
    throw new Error("无法从 TikHub 响应中提取视频 URL");
  }

  // Step 2: download video
  log("开始下载视频...");
  const dlRes = await fetch(videoUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!dlRes.ok) {
    throw new Error(`视频下载失败: HTTP ${dlRes.status}`);
  }

  const buffer = await dlRes.arrayBuffer();
  const sizeMB = buffer.byteLength / (1024 * 1024);
  if (sizeMB < 0.1) {
    throw new Error(
      `下载文件过小 (${sizeMB.toFixed(2)} MB)，可能下载失败`,
    );
  }

  log(`视频下载完成 (${sizeMB.toFixed(1)} MB)`);

  const ct = dlRes.headers.get("content-type") ?? "video/mp4";
  return { buffer, mimeType: ct.split(";")[0].trim(), sizeMB };
}
