import type {
  VideoModelRecord,
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from "@/lib/video/service";
import { delayStaggeredSubmission } from "@/lib/tasks/batch-queue";
import type { TaskStatusResult } from "@/lib/video/types";
import {
  classifyVideoProviderFailure,
  extractProviderErrorMessage,
  extractVideoUrlFromPayload,
  isRetryableOverload,
  toPortraitLandscapeAspectRatio,
} from "./shared";

const DEFAULT_BASE_URL = "https://api.bltcy.ai";
const CREATE_ENDPOINT = "/v2/videos/generations";
const STATUS_ENDPOINT = "/v2/videos/generations";
const SUCCESS_STATES = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED"]);
const FAILURE_STATES = new Set(["FAILURE", "FAILED", "ERROR", "CANCELLED"]);

export function normalizePlatoBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_BASE_URL;

  try {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.replace(
      /\/v2\/videos\/generations(?:\/[^/?#]+)?$/,
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
  return normalizePlatoBaseUrl(
    model.baseUrl ||
    process.env.VIDEO_BASE_URL ||
    process.env.PLATO_BASE_URL ||
    DEFAULT_BASE_URL,
  );
}

function getApiKey(model: VideoModelRecord): string {
  return (
    model.apiKey ||
    process.env.VIDEO_API_KEY ||
    process.env.PLATO_API_KEY ||
    ""
  ).trim();
}

function getHdEnabled(): boolean {
  const raw = process.env.VIDEO_HD;
  return raw === "1" || raw?.toLowerCase() === "true";
}

async function apiRequest(
  model: VideoModelRecord,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey(model);
  if (!apiKey) {
    throw new Error("VIDEO_API_KEY is not set");
  }

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

  throw lastError ?? new Error("Video provider request failed");
}

function normalizeStatus(value: unknown): string {
  return String(value || "UNKNOWN").toUpperCase();
}

function isSoraSlug(slug: string): boolean {
  return slug.toLowerCase().includes("sora");
}

function inferPlatoCapabilities(model: VideoModelRecord): VideoProviderCapabilities {
  const slug = model.slug.toLowerCase();
  if (slug.includes("veo")) {
    return {
      allowedDurations: [8],
      defaultDuration: 8,
    };
  }
  if (slug.includes("sora")) {
    return {
      allowedDurations: [10, 15],
      defaultDuration: 10,
    };
  }
  return {
    allowedDurations: [8, 10, 15],
    defaultDuration: 10,
  };
}

export const platoProvider: VideoProviderAdapter = {
  id: "plato",
  getCapabilities(model) {
    return inferPlatoCapabilities(model);
  },
  async createTasks({ model, params }) {
    const taskIds: string[] = [];
    const providerOptions = params.providerOptions ?? {};

    const sora = isSoraSlug(model.slug);
    const images = params.imageUrls ?? [];

    let payload: Record<string, unknown>;
    if (sora) {
      // Sora requires input_reference as an array of objects.
      // BLTCY's sora middleware only accepts the literal "portrait"/"landscape"
      // for aspect_ratio — passing "9:16"/"16:9" makes it inject an unknown
      // `metadata` parameter to upstream OpenAI and the request 400s.
      payload = {
        ...providerOptions,
        prompt: params.prompt,
        model: model.slug,
        aspect_ratio: params.orientation === "portrait" ? "portrait" : "landscape",
        duration: params.duration,
        ...(images.length > 0
          ? { input_reference: images.map((url) => ({ type: "image_url", image_url: url })) }
          : {}),
        watermark:
          typeof providerOptions.watermark === "boolean"
            ? providerOptions.watermark
            : true,
        private:
          typeof providerOptions.private === "boolean"
            ? providerOptions.private
            : false,
        ...(getHdEnabled() ? { hd: true } : {}),
      };
    } else {
      // Standard plato payload
      payload = {
        ...providerOptions,
        prompt: params.prompt,
        model: model.slug,
        images,
        aspect_ratio: toPortraitLandscapeAspectRatio(params.orientation),
        duration: params.duration,
        watermark:
          typeof providerOptions.watermark === "boolean"
            ? providerOptions.watermark
            : true,
        private:
          typeof providerOptions.private === "boolean"
            ? providerOptions.private
            : false,
        ...(getHdEnabled() ? { hd: true } : {}),
      };
    }

    for (let index = 0; index < params.count; index += 1) {
      await delayStaggeredSubmission(index);
      const result = await apiRequest(model, "POST", CREATE_ENDPOINT, payload);
      const taskId = String(result.task_id || result.id || "");
      if (!taskId) {
        throw new Error(
          `Video task creation failed: ${JSON.stringify(result).slice(0, 200)}`,
        );
      }
      taskIds.push(taskId);
    }

    return { providerTaskIds: taskIds };
  },
  async queryTaskStatus({ model, taskId }) {
    const result = await apiRequest(
      model,
      "GET",
      `${STATUS_ENDPOINT}/${taskId}`,
      undefined,
    );
    const status = normalizeStatus(result.status);
    const progress = String(result.progress || "0%");

    if (SUCCESS_STATES.has(status)) {
      return {
        taskId,
        status: "SUCCESS",
        progress: "100%",
        url: extractVideoUrlFromPayload(result),
      };
    }
    if (FAILURE_STATES.has(status)) {
      const failReason = String(
        result.fail_reason || result.message || "Video task failed",
      );
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
    return { taskId, status, progress };
  },
};
