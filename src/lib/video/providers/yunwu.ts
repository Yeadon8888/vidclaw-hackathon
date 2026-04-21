import { delayStaggeredSubmission } from "@/lib/tasks/batch-queue";
import type {
  VideoModelRecord,
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from "@/lib/video/service";
import type { VideoDuration } from "@/lib/video/types";
import {
  classifyVideoProviderFailure,
  extractProviderErrorMessage,
  isRetryableOverload,
  toGrokRatio,
} from "./shared";

const DEFAULT_BASE_URL = "https://yunwu.ai";
const CREATE_ENDPOINT = "/v1/video/create";
const QUERY_ENDPOINT = "/v1/video/query";
const SUCCESS_STATES = new Set(["COMPLETED", "SUCCESS", "SUCCEEDED"]);
const FAILURE_STATES = new Set(["FAILED", "FAILURE", "ERROR", "CANCELLED"]);
const ACTIVE_STATES = new Set(["PENDING", "PROCESSING", "QUEUED", "IN_PROGRESS"]);

function normalizeYunwuBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_BASE_URL;

  try {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.replace(
      /\/v1\/video\/(?:create|query)$/,
      "",
    );

    url.pathname = normalizedPath || "/";
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

function getBaseUrl(model: VideoModelRecord): string {
  return normalizeYunwuBaseUrl(
    model.baseUrl ||
    process.env.VIDEO_BASE_URL ||
    process.env.YUNWU_BASE_URL ||
    DEFAULT_BASE_URL,
  );
}

function getApiKey(model: VideoModelRecord): string {
  return (
    model.apiKey ||
    process.env.YUNWU_API_KEY ||
    process.env.VIDEO_API_KEY ||
    ""
  ).trim();
}

function normalizeStatus(value: unknown): string {
  return String(value || "UNKNOWN").trim().toUpperCase();
}

function inferYunwuCapabilities(model: VideoModelRecord): VideoProviderCapabilities {
  const defaults = model.defaultParams ?? {};
  const configuredDurations = Array.isArray(defaults.allowedDurations)
    ? defaults.allowedDurations.filter(
        (value): value is VideoDuration =>
          value === 4 || value === 6 || value === 8 || value === 10 || value === 15,
      )
    : [];
  const allowedDurations: VideoDuration[] = configuredDurations.length > 0
    ? Array.from(new Set(configuredDurations))
    : [4, 6, 8, 10];

  const defaultDuration =
    typeof defaults.duration === "number" && allowedDurations.includes(defaults.duration as VideoDuration)
      ? (defaults.duration as VideoDuration)
      : allowedDurations.includes(10)
        ? 10
        : allowedDurations[0];

  return {
    allowedDurations,
    defaultDuration,
  };
}

function extractFailReason(result: Record<string, unknown>): string {
  const candidate = result.error || result.message || result.status_message;
  return String(candidate || "Video task failed").trim();
}

function extractProgress(result: Record<string, unknown>): string {
  const raw = result.progress;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return `${Math.max(0, Math.min(100, Math.trunc(raw)))}%`;
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.includes("%") ? raw.trim() : `${raw.trim()}%`;
  }
  return "0%";
}

async function apiRequest(
  model: VideoModelRecord,
  method: "GET" | "POST",
  path: string,
  options?: {
    body?: unknown;
    query?: Record<string, string>;
  },
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey(model);
  if (!apiKey) {
    throw new Error("YUNWU_API_KEY is not set");
  }

  const url = new URL(`${getBaseUrl(model)}${path}`);
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    url.searchParams.set(key, value);
  }

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
        body: options?.body ? JSON.stringify(options.body) : undefined,
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
        const message = extractProviderErrorMessage(payload);
        const rawSnippet = text.trim().slice(0, 500);
        const detail = rawSnippet && rawSnippet !== message
          ? ` | body=${rawSnippet}`
          : "";
        if (attempt < 2 && isRetryableOverload(response.status, message)) {
          await new Promise((resolve) =>
            setTimeout(resolve, 15_000 * (attempt + 1)),
          );
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${message}${detail}`);
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 3_000 * (attempt + 1)),
        );
        continue;
      }
    }
  }

  throw lastError ?? new Error("Yunwu video provider request failed");
}

export const yunwuProvider: VideoProviderAdapter = {
  id: "yunwu",
  getCapabilities(model) {
    return inferYunwuCapabilities(model);
  },
  async createTasks({ model, params }) {
    const taskIds: string[] = [];
    const providerOptions = params.providerOptions ?? {};
    const images = params.imageUrls ?? [];
    const size =
      typeof providerOptions.size === "string" && providerOptions.size.trim()
        ? providerOptions.size.trim()
        : "720P";

    for (let index = 0; index < params.count; index += 1) {
      await delayStaggeredSubmission(index);

      const result = await apiRequest(model, "POST", CREATE_ENDPOINT, {
        body: {
          model: model.slug,
          prompt: params.prompt,
          aspect_ratio: toGrokRatio(params.orientation),
          duration: params.duration,
          size,
          images,
        },
      });

      const taskId = String(result.id || "");
      if (!taskId) {
        throw new Error(
          `Yunwu video task creation failed: ${JSON.stringify(result).slice(0, 200)}`,
        );
      }

      taskIds.push(taskId);
    }

    return { providerTaskIds: taskIds };
  },
  async queryTaskStatus({ model, taskId }) {
    const result = await apiRequest(model, "GET", QUERY_ENDPOINT, {
      query: { id: taskId },
    });

    const status = normalizeStatus(result.status);
    const progress = extractProgress(result);
    const videoUrl = typeof result.video_url === "string" && result.video_url
      ? result.video_url
      : undefined;

    if (SUCCESS_STATES.has(status) && videoUrl) {
      return {
        taskId,
        status: "SUCCESS",
        progress: "100%",
        url: videoUrl,
      };
    }

    if (FAILURE_STATES.has(status)) {
      const failReason = extractFailReason(result);
      const { retryable, terminalClass } =
        classifyVideoProviderFailure(failReason);
      return {
        taskId,
        status: "FAILED",
        progress,
        failReason,
        retryable,
        terminalClass,
      };
    }

    if (SUCCESS_STATES.has(status) && !videoUrl) {
      return {
        taskId,
        status: "PROCESSING",
        progress,
      };
    }

    if (ACTIVE_STATES.has(status)) {
      return {
        taskId,
        status,
        progress,
      };
    }

    return {
      taskId,
      status,
      progress,
    };
  },
};

export { normalizeYunwuBaseUrl };
