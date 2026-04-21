/**
 * Alibaba DashScope (百炼) provider adapter.
 *
 * Handles wan2.6-r2v / wan2.6-r2v-flash reference-to-video models.
 * These models use DashScope's async task API, NOT the OpenAI-compatible format.
 *
 * Flow: POST create → get task_id → GET poll until SUCCEEDED → extract video_url
 *
 * Key difference from Plato/Yunwu: images are passed as `reference_urls` inside
 * an `input` object, and the prompt uses `character1`/`character2` to refer to
 * the people in the reference images.
 */

import type {
  VideoModelRecord,
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from "@/lib/video/service";
import type { TaskStatusResult } from "@/lib/video/types";
import { classifyVideoProviderFailure } from "./shared";
import { delayStaggeredSubmission } from "@/lib/tasks/batch-queue";
import { fetchWithRetry } from "@/lib/api/retry";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com";
const CREATE_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
const TASK_PATH = "/api/v1/tasks";

function getBaseUrl(model: VideoModelRecord): string {
  return (
    model.baseUrl?.trim().replace(/\/+$/, "") ||
    process.env.DASHSCOPE_BASE_URL ||
    DEFAULT_BASE_URL
  );
}

function getApiKey(model: VideoModelRecord): string {
  return (
    model.apiKey?.trim() ||
    process.env.DASHSCOPE_API_KEY ||
    ""
  );
}

/**
 * Map orientation to DashScope size string.
 * Default to 720P to keep costs low.
 */
function toSizeString(
  orientation: "portrait" | "landscape",
  resolution?: string,
): string {
  const is1080 = resolution?.includes("1080");
  if (orientation === "portrait") {
    return is1080 ? "1080*1920" : "720*1280";
  }
  return is1080 ? "1920*1080" : "1280*720";
}

/**
 * Inject `character1` into the prompt if the user didn't already include it.
 * wan2.6-r2v requires character references in the prompt to associate with
 * reference_urls.
 */
function ensureCharacterReference(prompt: string): string {
  if (/character\d/i.test(prompt)) return prompt;
  return `character1 ${prompt}`;
}

export const dashscopeProvider: VideoProviderAdapter = {
  id: "dashscope",

  getCapabilities(model) {
    const slug = model.slug.toLowerCase();
    // r2v models support 2-10 seconds
    if (slug.includes("r2v")) {
      return {
        allowedDurations: [5, 10],
        defaultDuration: 5,
      };
    }
    return {
      allowedDurations: [5, 10],
      defaultDuration: 5,
    };
  },

  async createTasks({ model, params }) {
    const apiKey = getApiKey(model);
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY 未配置。请在模型设置中填写阿里百炼 API Key。");
    }

    const baseUrl = getBaseUrl(model);
    const providerOptions = params.providerOptions ?? {};
    const resolution = (providerOptions.resolution as string) ?? "720P";
    const taskIds: string[] = [];

    for (let i = 0; i < params.count; i++) {
      await delayStaggeredSubmission(i);

      const body = {
        model: model.slug,
        input: {
          prompt: ensureCharacterReference(params.prompt),
          reference_urls: params.imageUrls ?? [],
        },
        parameters: {
          size: toSizeString(params.orientation, resolution),
          duration: params.duration,
          shot_type:
            (providerOptions.shot_type as string) ?? "single",
          ...(providerOptions.audio !== undefined
            ? { audio: Boolean(providerOptions.audio) }
            : {}),
          watermark: false,
        },
      };

      const response = await fetchWithRetry(() =>
        fetch(`${baseUrl}${CREATE_PATH}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        }),
      );

      const data = (await response.json()) as {
        output?: { task_id?: string; task_status?: string };
        code?: string;
        message?: string;
        request_id?: string;
      };

      const taskId = data.output?.task_id;
      if (!taskId) {
        const errMsg = data.message || data.code || "任务创建失败";
        throw new Error(`DashScope 任务创建失败: ${errMsg}`);
      }

      taskIds.push(taskId);
    }

    return { providerTaskIds: taskIds };
  },

  async queryTaskStatus({ model, taskId }) {
    const apiKey = getApiKey(model);
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY 未配置。");
    }

    const baseUrl = getBaseUrl(model);

    const response = await fetchWithRetry(() =>
      fetch(`${baseUrl}${TASK_PATH}/${taskId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(30_000),
      }),
    );

    const data = (await response.json()) as {
      output?: {
        task_id?: string;
        task_status?: string;
        video_url?: string;
        message?: string;
      };
      code?: string;
      message?: string;
      usage?: {
        duration?: number;
        output_video_duration?: number;
      };
    };

    const status = (data.output?.task_status ?? "UNKNOWN").toUpperCase();

    if (status === "SUCCEEDED") {
      return {
        taskId,
        status: "SUCCESS",
        progress: "100%",
        url: data.output?.video_url,
      };
    }

    if (status === "FAILED") {
      const failReason =
        data.output?.message || data.message || "视频生成失败";
      const { retryable, terminalClass } =
        classifyVideoProviderFailure(failReason);
      return {
        taskId,
        status: "FAILED",
        progress: "0%",
        failReason,
        retryable,
        terminalClass,
      };
    }

    if (status === "CANCELED") {
      return {
        taskId,
        status: "FAILED",
        progress: "0%",
        failReason: "任务已取消",
        retryable: false,
        terminalClass: "unknown" as const,
      };
    }

    // PENDING / RUNNING
    return {
      taskId,
      status,
      progress: status === "RUNNING" ? "50%" : "0%",
    };
  },
};
