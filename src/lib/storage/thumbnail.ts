/**
 * Generate a JPEG thumbnail from a video URL using a system ffmpeg binary.
 *
 * Used by the gallery publish flow so every shared video has a stable poster
 * image instead of relying on the browser to render the first frame on hover
 * (which is often pure black for AI-generated clips).
 *
 * Requires `ffmpeg` to be available on PATH. Vercel's default runtime does
 * not ship ffmpeg, so server-side callers must run on a node runtime that
 * has it installed (or provide a hosted ffmpeg binary via env override).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

// Resolution order:
//   1. FFMPEG_PATH env override (lets ops point at a custom binary)
//   2. @ffmpeg-installer/ffmpeg shipped binary (works on Vercel + dev)
//   3. plain "ffmpeg" on PATH (fallback for unusual environments)
const FFMPEG_BIN = process.env.FFMPEG_PATH || ffmpegInstaller.path || "ffmpeg";

export interface VideoThumbnailResult {
  buffer: Buffer;
  contentType: "image/jpeg";
}

/**
 * Pull bytes from `videoUrl`, run ffmpeg to extract a frame at `seekSec`,
 * return the JPEG bytes. Caller is responsible for uploading to storage.
 */
export async function generateVideoThumbnail(params: {
  videoUrl: string;
  /** Seek into the video to skip black intro frames. Default 0.5s. */
  seekSec?: number;
  /** JPEG quality 1 (best) – 31 (worst). Default 4. */
  quality?: number;
  /** Long-edge target width. Default 720. */
  width?: number;
}): Promise<VideoThumbnailResult> {
  const seekSec = params.seekSec ?? 0.5;
  const quality = params.quality ?? 4;
  const width = params.width ?? 720;

  const dir = await mkdtemp(join(tmpdir(), "vidclaw-thumb-"));
  const inputPath = join(dir, "in.mp4");
  const outputPath = join(dir, "thumb.jpg");

  try {
    const res = await fetch(params.videoUrl);
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }
    const data = Buffer.from(await res.arrayBuffer());
    await writeFile(inputPath, data);

    await runFfmpeg([
      "-y",
      "-ss", String(seekSec),
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", `scale='min(${width},iw)':-2`,
      "-q:v", String(quality),
      outputPath,
    ]);

    const buffer = await readFile(outputPath);
    return { buffer, contentType: "image/jpeg" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
