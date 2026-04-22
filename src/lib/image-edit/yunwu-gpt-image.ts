/**
 * yunwu GPT-Image-{1,2} adapter.
 *
 * Uses OpenAI-native `POST /v1/images/edits` (multipart/form-data),
 * NOT the chat/completions transport that bltcy.ts uses. The response
 * ships the edited image as base64; we return a data URL so the
 * existing scene-generation upload pipeline can ingest it unchanged.
 */
import type { Model } from "@/lib/db/schema";
import { fetchWithRetry } from "@/lib/api/retry";
import { fetchAssetBuffer } from "@/lib/storage/gateway";

const DEFAULT_BASE_URL = "https://yunwu.ai";
const DEFAULT_SIZE = "1024x1536"; // 2:3 portrait, closest to 9:16 in supported sizes

function normalizeBaseUrl(baseUrl?: string | null) {
  return (baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

interface ImagesEditResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: { message?: string };
}

/**
 * Call yunwu's `/v1/images/edits` with a product image + prompt.
 * Returns an image URL (data URL for b64 responses, remote URL otherwise).
 */
export async function yunwuImagesEditRequest(params: {
  assetUrl: string;
  prompt: string;
  model: Pick<Model, "slug" | "apiKey" | "baseUrl">;
  size?: string;
}): Promise<string> {
  const apiKey = params.model.apiKey?.trim();
  if (!apiKey) {
    throw new Error("gpt-image 模型未配置 API Key。");
  }

  // Multipart requires binary data — always fetch the buffer.
  const source = await fetchAssetBuffer(params.assetUrl);
  let { buffer, mimeType } = source;

  // gpt-image-family accepts PNG/JPEG/WebP but WebP compatibility is
  // inconsistent across aggregators; convert to PNG for safety.
  if (mimeType === "image/webp") {
    const sharp = (await import("sharp")).default;
    const pngBuf = await sharp(Buffer.from(buffer)).png().toBuffer();
    const ab = new ArrayBuffer(pngBuf.byteLength);
    new Uint8Array(ab).set(pngBuf);
    buffer = ab;
    mimeType = "image/png";
  }

  const ext = (mimeType.split("/")[1] ?? "png").replace("jpeg", "jpg");
  const form = new FormData();
  form.append(
    "image",
    new Blob([buffer], { type: mimeType }),
    `input.${ext}`,
  );
  form.append("prompt", params.prompt);
  form.append("model", params.model.slug);
  form.append("n", "1");
  form.append("size", params.size ?? DEFAULT_SIZE);

  const baseUrl = normalizeBaseUrl(params.model.baseUrl);
  const response = await fetchWithRetry(() =>
    fetch(`${baseUrl}/v1/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: form,
      // Per-image 120s. gpt-image-1 typically returns in ~50s; if we hit
      // 120s the upstream is stuck (observed hanging indefinitely on
      // slugs like gpt-image-2-all). Fail fast so one stuck image doesn't
      // consume the scene route's whole 300s budget.
      signal: AbortSignal.timeout(120_000),
    }),
  );

  const json = (await response.json()) as ImagesEditResponse;

  if (json.error?.message) {
    throw new Error(`gpt-image: ${json.error.message}`);
  }

  const first = json.data?.[0];
  if (first?.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (first?.url) {
    return first.url;
  }

  throw new Error("gpt-image 模型未返回可解析的图片数据。");
}

/**
 * Returns true when the model should be dispatched to the
 * OpenAI-native /v1/images/edits transport instead of the
 * chat/completions transport used by Gemini-family models.
 */
export function isOpenAiImagesEditModel(
  model: Pick<Model, "slug">,
): boolean {
  const slug = model.slug?.toLowerCase() ?? "";
  return slug.startsWith("gpt-image") || slug.startsWith("dall-e");
}
