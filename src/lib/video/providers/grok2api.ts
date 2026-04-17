import type {
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

/**
 * grok2api adapter.
 *
 * Target API: a self-hosted reverse-proxy for grok.com image-to-video
 * (https://grok2api-production-3630.up.railway.app).
 *
 * Endpoints:
 *   POST /v1/videos            multipart/form-data  — submit a task
 *   GET  /v1/videos/{taskId}   json                 — poll a task
 *
 * Constraints enforced upstream:
 *   - `seconds` must be 6 or 10
 *   - `input_reference[image_url]` is mandatory — this provider is
 *     image-to-video only; theme-only mode will be rejected
 *   - consecutive requests within the same Grok account can trigger
 *     429; callers should space them out (batch-queue already does)
 */

const DEFAULT_BASE_URL =
  "https://grok2api-production-3630.up.railway.app";
const CREATE_ENDPOINT = "/v1/videos";
const QUERY_ENDPOINT = "/v1/videos";

const ALLOWED_DURATIONS: VideoDuration[] = [6, 10];
const DEFAULT_DURATION: VideoDuration = 6;

const SUCCESS_STATES = new Set(["succeeded"]);
const FAILURE_STATES = new Set(["failed", "cancelled"]);
const ACTIVE_STATES = new Set(["queued", "processing", "pending"]);

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
  // Map anything else to the closest supported value.
  return value !== undefined && value > 7 ? 10 : DEFAULT_DURATION;
}

function pickSize(
  orientation: "portrait" | "landscape",
  resolutionName: GrokResolutionName,
): string {
  if (resolutionName === "480p") {
    // The doc only lists these three as "base" sizes; 480p maps there.
    return orientation === "portrait" ? "720x1280" : "1280x720";
  }
  // 720p recommended tier — use the upscaled sizes per doc section 3.1.
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

async function postCreateTask(params: {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  imageUrl: string;
  duration: VideoDuration;
  size: string;
  resolutionName: GrokResolutionName;
  preset: GrokPreset;
  modelName: string;
}): Promise<string> {
  const form = new FormData();
  form.append("model", params.modelName);
  form.append("prompt", params.prompt);
  form.append("input_reference[image_url]", params.imageUrl);
  form.append("seconds", String(params.duration));
  form.append("size", params.size);
  form.append("resolution_name", params.resolutionName);
  form.append("preset", params.preset);

  const response = await fetch(`${params.baseUrl}${CREATE_ENDPOINT}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.apiKey}` },
    body: form,
  });

  const rawBody = await response.text();
  let parsed: unknown = null;
  if (rawBody.length > 0) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // non-json response — surface as-is below
    }
  }

  if (!response.ok) {
    const message = extractProviderErrorMessage(parsed) || rawBody || "Unknown error";
    const err = new Error(
      `HTTP ${response.status}: ${message} | body=${rawBody.slice(0, 500)}`,
    );
    // Attach hints that callers (task runner) can use for retry policy.
    (err as Error & { retryable?: boolean }).retryable = isRetryableOverload(
      response.status,
      message,
    );
    throw err;
  }

  const obj = (parsed ?? {}) as { id?: unknown; error?: unknown };
  if (typeof obj.id !== "string" || obj.id.length === 0) {
    throw new Error(
      `grok2api did not return a task id | body=${rawBody.slice(0, 500)}`,
    );
  }
  return obj.id;
}

export const grok2apiProvider: VideoProviderAdapter = {
  id: "grok2api",

  getCapabilities(): VideoProviderCapabilities {
    return {
      allowedDurations: ALLOWED_DURATIONS,
      defaultDuration: DEFAULT_DURATION,
    };
  },

  async createTasks({ model, params }): Promise<string[]> {
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

    // One POST per video — the upstream does not support batching in a
    // single call. Use the first image as reference for every request
    // unless the caller supplied more.
    const total = params.count ?? 1;
    const taskIds: string[] = [];
    for (let i = 0; i < total; i++) {
      const imageUrl = imageUrls[i] ?? imageUrls[0];
      const id = await postCreateTask({
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
      taskIds.push(id);
    }
    return taskIds;
  },

  async queryTaskStatus({ model, taskId }): Promise<TaskStatusResult> {
    const baseUrl = normalizeBaseUrl(model.baseUrl);
    const apiKey = (model.apiKey ?? "").trim();

    const response = await fetch(`${baseUrl}${QUERY_ENDPOINT}/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const rawBody = await response.text();
    let parsed: unknown = null;
    if (rawBody.length > 0) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        // fall through
      }
    }

    if (!response.ok) {
      const message = extractProviderErrorMessage(parsed) || rawBody || "Unknown error";
      const { retryable, terminalClass } = classifyVideoProviderFailure(message);
      return {
        taskId,
        status: "FAILED",
        progress: "0%",
        failReason: `HTTP ${response.status}: ${message}`,
        retryable,
        terminalClass,
      };
    }

    const obj = (parsed ?? {}) as {
      status?: unknown;
      progress?: unknown;
      video?: { url?: unknown; duration?: unknown } | null;
      error?: { message?: unknown; code?: unknown } | null;
    };

    const statusStr = String(obj.status ?? "").toLowerCase();
    const progressNum =
      typeof obj.progress === "number" ? Math.max(0, Math.min(100, obj.progress)) : 0;
    const progressStr = `${progressNum}%`;

    if (SUCCESS_STATES.has(statusStr)) {
      const url = obj.video?.url;
      if (typeof url !== "string" || url.length === 0) {
        return {
          taskId,
          status: "FAILED",
          progress: "100%",
          failReason: "grok2api reported succeeded but video.url is empty",
          retryable: true,
          terminalClass: "provider_error",
        };
      }
      return {
        taskId,
        status: "SUCCESS",
        progress: "100%",
        url,
      };
    }

    if (FAILURE_STATES.has(statusStr)) {
      const message =
        (typeof obj.error?.message === "string" && obj.error.message) ||
        extractProviderErrorMessage(parsed) ||
        statusStr ||
        "unknown error";
      const { retryable, terminalClass } = classifyVideoProviderFailure(message);
      return {
        taskId,
        status: "FAILED",
        progress: progressStr,
        failReason: message,
        retryable,
        terminalClass,
      };
    }

    // Treat queued / processing / unknown as PROCESSING so the runner keeps polling.
    return {
      taskId,
      status: "PROCESSING",
      progress: progressStr,
    };
  },
};
