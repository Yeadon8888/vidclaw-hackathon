/**
 * Grok video provider adapter.
 *
 * API differences from plato/standard:
 *   - ratio: "2:3" | "3:2" | "1:1"  (not aspect_ratio)
 *   - resolution: "720P" | "1080P"
 *   - duration: 6 | 10               (not 8/15)
 *   - images: string[]               (max 1 image)
 *   - no watermark / private / hd fields
 */

import type {
  VideoModelRecord,
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from "@/lib/video/service";
import type { TaskStatusResult, TerminalClass, VideoParams } from "@/lib/video/types";

const CREATE_ENDPOINT = "/v2/videos/generations";
const STATUS_ENDPOINT = "/v2/videos/generations";

const SUCCESS_STATES = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED"]);
const FAILURE_STATES = new Set(["FAILURE", "FAILED", "ERROR", "CANCELLED"]);

// ─── Helpers ───────────────────────────────────────────────────────────────

function getBaseUrl(model: VideoModelRecord): string {
  const raw = model.baseUrl || process.env.GROK_BASE_URL || process.env.VIDEO_BASE_URL || "";
  return raw.trim().replace(/\/+$/, "") || "https://api.bltcy.ai";
}

function getApiKey(model: VideoModelRecord): string {
  return (model.apiKey || process.env.GROK_API_KEY || process.env.VIDEO_API_KEY || "").trim();
}

/**
 * Map our internal orientation to Grok ratio.
 * portrait → "2:3", landscape → "3:2"
 * Falls back to model defaultParams.ratio if explicitly set there.
 */
function toGrokRatio(
  orientation: VideoParams["orientation"],
  providerOptions: Record<string, unknown>,
): "2:3" | "3:2" | "1:1" {
  if (
    providerOptions.ratio === "1:1" ||
    providerOptions.ratio === "2:3" ||
    providerOptions.ratio === "3:2"
  ) {
    return providerOptions.ratio as "2:3" | "3:2" | "1:1";
  }
  return orientation === "portrait" ? "2:3" : "3:2";
}

/**
 * Map our internal duration to the nearest Grok-supported value (6 or 10).
 */
function toGrokDuration(duration: number): 6 | 10 {
  return duration <= 6 ? 6 : 10;
}

function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const maybeError = obj.error;
    if (maybeError && typeof maybeError === "object") {
      const errorObj = maybeError as Record<string, unknown>;
      const message = String(errorObj.message || errorObj.code || "").trim();
      if (message) return message;
    }
    if ("message" in obj) {
      const message = String(obj.message || "").trim();
      if (message) return message;
    }
  }
  return "Unknown API error";
}

function classifyFailReason(failReason: string): {
  retryable: boolean;
  terminalClass: TerminalClass;
} {
  const msg = failReason.toLowerCase();

  if (
    msg.includes("content policy") ||
    msg.includes("safety") ||
    msg.includes("violation") ||
    msg.includes("违规") ||
    msg.includes("审核")
  ) {
    return { retryable: false, terminalClass: "content_policy" };
  }

  if (
    msg.includes("quota") ||
    msg.includes("limit exceeded") ||
    msg.includes("余额不足")
  ) {
    return { retryable: false, terminalClass: "quota_exceeded" };
  }

  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("超时")) {
    return { retryable: true, terminalClass: "timeout" };
  }

  if (
    msg.includes("server error") ||
    msg.includes("internal") ||
    msg.includes("500") ||
    msg.includes("服务器")
  ) {
    return { retryable: true, terminalClass: "provider_error" };
  }

  return { retryable: true, terminalClass: "unknown" };
}

async function apiRequest(
  model: VideoModelRecord,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey(model);
  if (!apiKey) throw new Error("Grok API key is not configured");

  const url = `${getBaseUrl(model)}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(180_000),
      });

      const text = await response.text();
      let payload: Record<string, unknown> = {};
      if (text) {
        try {
          payload = JSON.parse(text) as Record<string, unknown>;
        } catch {
          payload = { raw: text.slice(0, 500) };
        }
      }

      if (!response.ok) {
        const message = extractErrorMessage(payload);
        if (attempt < 2 && response.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 15_000 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${message}`);
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 3_000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Grok provider request failed");
}

function extractVideoUrl(result: Record<string, unknown>): string | undefined {
  // Grok response shape: { task_id, status, data: { video_url } }
  const data = result.data;
  if (data && typeof data === "object") {
    for (const key of ["video_url", "url", "output"]) {
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === "string" && value) return value;
    }
  }
  // Fallback: top-level fields
  for (const key of ["video_url", "url", "output"]) {
    const value = result[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export const grokProvider: VideoProviderAdapter = {
  id: "grok",

  getCapabilities(_model: VideoModelRecord): VideoProviderCapabilities {
    return {
      // Grok only supports 6s and 10s; map to our closest allowed values
      allowedDurations: [8, 10],
      defaultDuration: 10,
    };
  },

  async createTasks({ model, params }) {
    const providerOptions = params.providerOptions ?? {};
    const ratio = toGrokRatio(params.orientation, providerOptions);
    const duration = toGrokDuration(params.duration);

    // Grok supports at most 1 reference image
    const images =
      params.imageUrls && params.imageUrls.length > 0
        ? [params.imageUrls[0]]
        : undefined;

    const resolution =
      (providerOptions.resolution as string | undefined) ?? "720P";

    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      model: model.slug,
      ratio,
      resolution,
      duration,
      ...(images ? { images } : {}),
    };

    const taskIds: string[] = [];

    for (let i = 0; i < params.count; i += 1) {
      const result = await apiRequest(model, "POST", CREATE_ENDPOINT, payload);
      const taskId = String(result.task_id || result.id || "");
      if (!taskId) {
        throw new Error(
          `Grok task creation failed: ${JSON.stringify(result).slice(0, 200)}`,
        );
      }
      taskIds.push(taskId);
    }

    return taskIds;
  },

  async queryTaskStatus({ model, taskId }) {
    const result = await apiRequest(
      model,
      "GET",
      `${STATUS_ENDPOINT}/${taskId}`,
    );

    const raw = String(result.status || "UNKNOWN").toUpperCase();
    const progress = String(result.progress || "0%");

    if (SUCCESS_STATES.has(raw)) {
      return {
        taskId,
        status: "SUCCESS",
        progress: "100%",
        url: extractVideoUrl(result),
      };
    }

    if (FAILURE_STATES.has(raw)) {
      const failReason = String(
        result.fail_reason || result.message || "Grok video task failed",
      );
      const { retryable, terminalClass } = classifyFailReason(failReason);
      return {
        taskId,
        status: "FAILED",
        progress,
        failReason,
        retryable,
        terminalClass,
      };
    }

    // IN_PROGRESS / NOT_START → keep polling
    return { taskId, status: raw, progress };
  },
};
