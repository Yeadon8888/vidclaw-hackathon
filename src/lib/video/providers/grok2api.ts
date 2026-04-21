import type {
  ProviderCreateResult,
  VideoModelRecord,
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from "@/lib/video/service";
import type { TaskStatusResult, VideoDuration } from "@/lib/video/types";
import {
  classifyVideoProviderFailure,
  extractProviderErrorMessage,
  isRetryableOverload,
} from "./shared";
import { isUploadGatewayEnabled, uploadSharedVideo } from "@/lib/storage/gateway";

/**
 * grok2api adapter — image-to-video via OpenAI-style chat completions.
 *
 * Backend: a self-hosted reverse proxy of Grok Imagine
 * (https://grok2api-production-3630.up.railway.app, source:
 * github.com/chenyme/grok2api).
 *
 * Why /v1/chat/completions and not /v1/videos:
 *   The form-data /v1/videos endpoint treats the reference image more like
 *   a "vibe / style hint" — empirically it freely reinvents the product's
 *   logo, colors, and packaging text. The OpenAI-compatible chat endpoint
 *   accepts the same image as a multimodal `image_url` content block and
 *   actually pins the video to that exact frame (verified: SCVCN sunglasses
 *   + black studio pedestal preserved pixel-near-identically).
 *
 * Lifecycle: synchronous. Unlike most async-poll providers, chat completions
 * blocks until the video is ready and returns the URL in
 * `choices[0].message.content`. createTasks() waits the full 60-90s, rehosts
 * the result to R2, and reports each slot as already SUCCESS via the
 * `immediateResults` parallel array. The runner skips polling for those rows.
 */

const DEFAULT_BASE_URL =
  "https://grok2api-production-3630.up.railway.app";
const CHAT_ENDPOINT = "/v1/chat/completions";

const ALLOWED_DURATIONS: VideoDuration[] = [6, 10];
const DEFAULT_DURATION: VideoDuration = 6;

type GrokPreset = "normal" | "fun" | "spicy";
type GrokResolutionName = "720p" | "480p";

const SUPPORTED_PRESETS: GrokPreset[] = ["normal", "fun", "spicy"];
const SUPPORTED_RESOLUTIONS: GrokResolutionName[] = ["720p", "480p"];

function normalizeBaseUrl(raw?: string | null): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return DEFAULT_BASE_URL;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function clampDuration(value: number | undefined): VideoDuration {
  if (value === 6 || value === 10) return value;
  return value !== undefined && value > 7 ? 10 : DEFAULT_DURATION;
}

function pickSize(
  orientation: "portrait" | "landscape",
  resolutionName: GrokResolutionName,
): string {
  if (resolutionName === "480p") {
    return orientation === "portrait" ? "720x1280" : "1280x720";
  }
  // 720p tier — upscaled per grok2api docs §3.1.
  return orientation === "portrait" ? "1024x1792" : "1792x1024";
}

function resolvePreset(raw: unknown): GrokPreset {
  const candidate = String(raw ?? "").trim().toLowerCase() as GrokPreset;
  return SUPPORTED_PRESETS.includes(candidate) ? candidate : "normal";
}

function resolveResolution(raw: unknown): GrokResolutionName {
  const candidate = String(raw ?? "").trim().toLowerCase() as GrokResolutionName;
  return SUPPORTED_RESOLUTIONS.includes(candidate) ? candidate : "720p";
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  error?: { message?: string; code?: string };
}

async function postChatCompletion(params: {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  imageUrl: string;
  duration: VideoDuration;
  size: string;
  resolutionName: GrokResolutionName;
  preset: GrokPreset;
  modelName: string;
}): Promise<{ chatCompletionId: string; videoUrl: string }> {
  const body = {
    model: params.modelName,
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: params.prompt },
          { type: "image_url", image_url: { url: params.imageUrl } },
        ],
      },
    ],
    video_config: {
      seconds: params.duration,
      size: params.size,
      resolution_name: params.resolutionName,
      preset: params.preset,
    },
  };

  const response = await fetch(`${params.baseUrl}${CHAT_ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Allow up to ~4 min — image-to-video typically completes in 60-90s
    // but allow headroom for queueing on the upstream Grok account.
    signal: AbortSignal.timeout(240_000),
  });

  const rawBody = await response.text();
  let parsed: ChatCompletionResponse | null = null;
  if (rawBody.length > 0) {
    try {
      parsed = JSON.parse(rawBody) as ChatCompletionResponse;
    } catch {
      // non-json response — surface as-is below
    }
  }

  if (!response.ok) {
    const message = extractProviderErrorMessage(parsed) || rawBody || "Unknown error";
    const err = new Error(
      `HTTP ${response.status}: ${message} | body=${rawBody.slice(0, 500)}`,
    );
    (err as Error & { retryable?: boolean }).retryable = isRetryableOverload(
      response.status,
      message,
    );
    throw err;
  }

  const content = parsed?.choices?.[0]?.message?.content?.trim();
  if (!content || !/^https?:\/\//.test(content)) {
    throw new Error(
      `grok2api chat returned no video URL | body=${rawBody.slice(0, 500)}`,
    );
  }
  // Use the chat completion id as the providerTaskId — short, unique, and
  // looks like a real upstream identifier instead of a synthetic prefix.
  // Fall back to a generated id if upstream omits it.
  const chatCompletionId =
    parsed?.id ?? `grok-chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { chatCompletionId, videoUrl: content };
}

/**
 * Pull the binary from grok2api (auth required) and re-host on our R2.
 * We do this inside createTasks because the chat path delivers a URL that
 * already requires the same Bearer token to access — handing that back to
 * the browser would leak the key.
 */
async function rehostToR2(params: {
  upstreamUrl: string;
  apiKey: string;
  fallbackName: string;
}): Promise<string> {
  if (!isUploadGatewayEnabled()) return params.upstreamUrl;
  try {
    const fileRes = await fetch(params.upstreamUrl, {
      headers: { Authorization: `Bearer ${params.apiKey}` },
    });
    if (!fileRes.ok) return params.upstreamUrl;
    const buffer = await fileRes.arrayBuffer();
    const stored = await uploadSharedVideo({
      bucket: "grok",
      filename: `${params.fallbackName}.mp4`,
      data: buffer,
      contentType: fileRes.headers.get("content-type") ?? "video/mp4",
    });
    return stored.url;
  } catch {
    return params.upstreamUrl;
  }
}

export const grok2apiProvider: VideoProviderAdapter = {
  id: "grok2api",
  // The chat-completions multimodal path adheres best to the user's original
  // image; any pre-resize hurts product fidelity (verified by 4-way ratio test).
  wantsImagePrep: false,

  getCapabilities(): VideoProviderCapabilities {
    return {
      allowedDurations: ALLOWED_DURATIONS,
      defaultDuration: DEFAULT_DURATION,
    };
  },

  async createTasks({ model, params }): Promise<ProviderCreateResult> {
    const baseUrl = normalizeBaseUrl(model.baseUrl);
    const apiKey = (model.apiKey ?? "").trim();
    if (!apiKey) {
      throw new Error(
        "grok2api model is missing apiKey — configure it in /admin/models",
      );
    }

    const imageUrls = params.imageUrls ?? [];
    if (imageUrls.length === 0) {
      throw new Error(
        "grok2api requires at least one reference image; choose a product image or switch to an image-capable model",
      );
    }

    const duration = clampDuration(params.duration);
    const providerOptions =
      (params.providerOptions as Record<string, unknown> | undefined) ?? {};
    const preset = resolvePreset(providerOptions.preset);
    const resolutionName = resolveResolution(providerOptions.resolutionName);
    const size = String(
      providerOptions.size ?? pickSize(params.orientation, resolutionName),
    );

    const total = params.count ?? 1;
    const providerTaskIds: string[] = [];
    const immediateResults: TaskStatusResult[] = [];
    for (let i = 0; i < total; i++) {
      const imageUrl = imageUrls[i] ?? imageUrls[0];

      // Synchronously block on the chat endpoint — it returns the finished
      // video URL in one shot. 60-90s typical, allow up to 240s in adapter.
      const { chatCompletionId, videoUrl } = await postChatCompletion({
        baseUrl,
        apiKey,
        prompt: params.prompt,
        imageUrl,
        duration,
        size,
        resolutionName,
        preset,
        modelName: model.slug,
      });

      // Rehost to R2 so the URL is bearer-token-free + persistent.
      const finalUrl = await rehostToR2({
        upstreamUrl: videoUrl,
        apiKey,
        fallbackName: `chat-${Date.now()}-${i}`,
      });

      providerTaskIds.push(chatCompletionId);
      immediateResults.push({
        taskId: chatCompletionId,
        status: "SUCCESS",
        progress: "100%",
        url: finalUrl,
      });
    }
    return { providerTaskIds, immediateResults };
  },

  async queryTaskStatus({ taskId }): Promise<TaskStatusResult> {
    // Should never get called: createTasks always returns immediateResults
    // for grok, so the inserter writes SUCCESS rows directly. If we reach
    // here it's an old row from before this refactor — treat as terminal
    // failure so the slot retries via the modern path.
    const message =
      "grok task no longer queryable (chat-completions path is synchronous, no async polling)";
    const { retryable, terminalClass } = classifyVideoProviderFailure(message);
    return {
      taskId,
      status: "FAILED",
      progress: "0%",
      failReason: message,
      retryable,
      terminalClass,
    };
  },
};
