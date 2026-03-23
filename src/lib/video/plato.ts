import type { TaskResult, TaskStatusResult, VideoParams } from "./types";

const DEFAULT_BASE_URL = "https://api.bltcy.ai";
const CREATE_ENDPOINT = "/v2/videos/generations";
const STATUS_ENDPOINT = "/v2/videos/generations";
const SUCCESS_STATES = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED"]);
const FAILURE_STATES = new Set(["FAILURE", "FAILED", "ERROR", "CANCELLED"]);

/** Per-request API overrides from model config */
export interface ApiOverrides {
  apiKey?: string | null;
  baseUrl?: string | null;
}

function getBaseUrl(overrides?: ApiOverrides): string {
  return (
    overrides?.baseUrl ||
    process.env.VIDEO_BASE_URL ||
    process.env.PLATO_BASE_URL ||
    DEFAULT_BASE_URL
  ).trim().replace(/\/+$/, "");
}

function getApiKey(overrides?: ApiOverrides): string {
  return (
    overrides?.apiKey ||
    process.env.VIDEO_API_KEY ||
    process.env.PLATO_API_KEY ||
    ""
  ).trim();
}

function getModel(): string {
  return process.env.VIDEO_MODEL || "sora-2";
}

function getHdEnabled(): boolean {
  const raw = process.env.VIDEO_HD;
  return raw === "1" || raw?.toLowerCase() === "true";
}

function toAspectRatio(orientation: VideoParams["orientation"]): "9:16" | "16:9" {
  return orientation === "portrait" ? "9:16" : "16:9";
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

function isRetryableOverload(status: number, message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    status === 429 ||
    normalized.includes("负载已饱和") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("try again later")
  );
}

async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
  overrides?: ApiOverrides,
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey(overrides);
  if (!apiKey) {
    throw new Error("VIDEO_API_KEY is not set");
  }

  const url = `${getBaseUrl(overrides)}${path}`;
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
        const rawSnippet = text.trim().slice(0, 500);
        const detail = rawSnippet && rawSnippet !== message
          ? ` | body=${rawSnippet}`
          : "";
        if (attempt < 2 && isRetryableOverload(response.status, message)) {
          await new Promise((resolve) => setTimeout(resolve, 15_000 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${message}${detail}`);
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

  throw lastError ?? new Error("Video provider request failed");
}

// ─── Public API ───

export async function createTasks(params: VideoParams, overrides?: ApiOverrides): Promise<string[]> {
  const taskIds: string[] = [];
  const payload = {
    prompt: params.prompt,
    model: params.model || getModel(),
    images: params.imageUrls ?? [],
    aspect_ratio: toAspectRatio(params.orientation),
    duration: params.duration,
    watermark: true,
    private: false,
    ...(getHdEnabled() ? { hd: true } : {}),
  };

  for (let index = 0; index < params.count; index += 1) {
    const result = await apiRequest("POST", CREATE_ENDPOINT, payload, overrides);
    const taskId = String(result.task_id || result.id || "");
    if (!taskId) {
      throw new Error(
        `Video task creation failed: ${JSON.stringify(result).slice(0, 200)}`,
      );
    }
    taskIds.push(taskId);
  }

  return taskIds;
}

export async function queryTaskStatus(taskId: string, overrides?: ApiOverrides): Promise<TaskStatusResult> {
  const result = await apiRequest("GET", `${STATUS_ENDPOINT}/${taskId}`, undefined, overrides);
  const status = normalizeStatus(result.status);
  const progress = String(result.progress || "0%");

  if (SUCCESS_STATES.has(status)) {
    return { taskId, status: "SUCCESS", progress: "100%", url: extractVideoUrl(result) };
  }
  if (FAILURE_STATES.has(status)) {
    return {
      taskId,
      status: "FAILED",
      progress,
      failReason: String(result.fail_reason || result.message || "Video task failed"),
    };
  }
  return { taskId, status, progress };
}

export async function pollTasks(
  taskIds: string[],
  onProgress: (msg: string) => void,
  options?: { pollIntervalMs?: number; maxWaitMs?: number },
): Promise<Map<string, TaskResult>> {
  const pollIntervalMs = options?.pollIntervalMs ?? 15_000;
  const maxWaitMs = options?.maxWaitMs ?? 180_000;
  const pending = new Set(taskIds);
  const results = new Map<string, TaskResult>();
  let elapsedMs = 0;

  onProgress(`提交了 ${taskIds.length} 个视频任务`);

  while (pending.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    elapsedMs += pollIntervalMs;

    if (elapsedMs > maxWaitMs) {
      for (const taskId of pending) {
        results.set(taskId, {
          taskId,
          success: false,
          status: "TIMEOUT",
          failReason: "Polling timed out",
        });
      }
      break;
    }

    for (const taskId of [...pending]) {
      try {
        const s = await queryTaskStatus(taskId);
        onProgress(`[轮询] ${taskId.slice(0, 16)}... 状态=${s.status} 进度=${s.progress}`);

        if (s.status === "SUCCESS") {
          results.set(taskId, { taskId, success: true, status: s.status, url: s.url });
          pending.delete(taskId);
        } else if (s.status === "FAILED") {
          results.set(taskId, {
            taskId,
            success: false,
            status: s.status,
            failReason: s.failReason,
          });
          pending.delete(taskId);
        }
      } catch {
        onProgress(`查询 ${taskId.slice(0, 16)}... 失败，稍后重试`);
      }
    }
  }

  return results;
}

// ─── Helpers ───

function normalizeStatus(value: unknown): string {
  return String(value || "UNKNOWN").toUpperCase();
}

function extractVideoUrl(result: Record<string, unknown>): string | undefined {
  const data = result.data;
  if (data && typeof data === "object") {
    for (const key of ["output", "video_url", "url"]) {
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === "string" && value) return value;
    }
  }
  for (const key of ["output", "video_url", "url"]) {
    const value = result[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}
