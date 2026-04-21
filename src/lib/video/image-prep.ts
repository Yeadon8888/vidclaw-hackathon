/**
 * Image preparation for video providers.
 *
 * Some upstream models require the reference (inpaint) image to exactly
 * match the output video dimensions.  This module downloads each image,
 * resizes / center-crops it to the target dimensions, re-uploads to R2,
 * and returns the new URLs.
 */

import sharp from "sharp";
import {
  fetchAssetBuffer,
  isUploadGatewayEnabled,
  uploadAsset,
} from "@/lib/storage/gateway";

// ─── Dimension mapping ────────────────────────────────────────────────────

type RatioStyle = "standard" | "compact";

/**
 * standard = 9:16 / 16:9  (most Plato models)
 * compact  = 2:3  / 3:2   (Yunwu)
 *
 * Note: grok2api skips this prep entirely (its adapter handles images itself
 * via the multimodal chat-completions path), so the historical "grok" branch
 * is gone. Add new entries here only when a provider actually reaches this code.
 */
function getRatioStyle(provider: string): RatioStyle {
  if (provider.toLowerCase() === "yunwu") return "compact";
  return "standard";
}

function computeTargetDimensions(params: {
  orientation: "portrait" | "landscape";
  ratioStyle: RatioStyle;
  resolution: string;
}): { width: number; height: number } {
  const shortSide = params.resolution.startsWith("1080") ? 1080 : 720;
  const longSide = Math.round(
    shortSide * (params.ratioStyle === "compact" ? 1.5 : 16 / 9),
  );

  return params.orientation === "portrait"
    ? { width: shortSide, height: longSide }
    : { width: longSide, height: shortSide };
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function prepareImagesForProvider(params: {
  imageUrls: string[];
  orientation: "portrait" | "landscape";
  provider: string;
  resolution?: string;
  userId: string;
}): Promise<string[]> {
  if (params.imageUrls.length === 0) return [];
  if (!isUploadGatewayEnabled()) return params.imageUrls;

  const { width, height } = computeTargetDimensions({
    orientation: params.orientation,
    ratioStyle: getRatioStyle(params.provider),
    resolution: params.resolution ?? "720P",
  });

  const results: string[] = [];

  for (const url of params.imageUrls) {
    try {
      const { buffer } = await fetchAssetBuffer(url);
      const img = sharp(Buffer.from(buffer));
      const meta = await img.metadata();

      // Skip if already the exact target size
      if (meta.width === width && meta.height === height) {
        results.push(url);
        continue;
      }

      const resized = await img
        .resize(width, height, { fit: "cover", position: "centre" })
        .webp({ quality: 90 })
        .toBuffer();

      const arrayBuffer = new ArrayBuffer(resized.byteLength);
      new Uint8Array(arrayBuffer).set(resized);
      const stored = await uploadAsset({
        userId: params.userId,
        filename: `prepped-${Date.now()}.webp`,
        data: arrayBuffer,
        contentType: "image/webp",
      });

      results.push(stored.url);
    } catch {
      // Resize failed — fall back to original URL
      results.push(url);
    }
  }

  return results;
}

