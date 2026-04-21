import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { models } from "@/lib/db/schema";
import type { Model } from "@/lib/db/schema";
import { MODEL_CAPABILITIES } from "@/lib/models/capabilities";
import type { TaskStatusResult, VideoDuration, VideoParams } from "./types";
import { platoProvider } from "./providers/plato";
import { yunwuProvider } from "./providers/yunwu";
import { dashscopeProvider } from "./providers/dashscope";
import { grok2apiProvider } from "./providers/grok2api";
import { prepareImagesForProvider } from "./image-prep";

export interface VideoProviderCapabilities {
  allowedDurations: VideoDuration[];
  defaultDuration: VideoDuration;
}

export interface VideoModelDefaultParams {
  orientation?: "portrait" | "landscape";
  duration?: VideoDuration;
  count?: number;
  allowedDurations?: VideoDuration[];
  [key: string]: unknown;
}

export interface VideoModelRecord {
  id: Model["id"];
  name: Model["name"];
  slug: Model["slug"];
  provider: Model["provider"];
  capability: Model["capability"];
  creditsPerGen: Model["creditsPerGen"];
  isActive: Model["isActive"];
  apiKey: Model["apiKey"];
  baseUrl: Model["baseUrl"];
  defaultParams: VideoModelDefaultParams | null;
  sortOrder: Model["sortOrder"];
}

/**
 * What an adapter returns from createTasks. The `immediateResults` parallel
 * array lets synchronous providers (e.g. grok2api's chat-completions path)
 * declare a slot as already SUCCESS at submission time — the inserter then
 * writes the final URL straight to task_items, no polling required.
 */
export interface ProviderCreateResult {
  providerTaskIds: string[];
  /** Same length as providerTaskIds when set; null entries fall back to polling. */
  immediateResults?: (TaskStatusResult | null)[];
}

export interface VideoProviderAdapter {
  id: string;
  /**
   * Set to false if the adapter wants the original user-uploaded reference
   * image URLs handed through unchanged, with no resize/recompress in
   * `image-prep`. Defaults to true. grok2api uses false because its
   * multimodal chat path adheres better to the user's original image.
   */
  wantsImagePrep?: boolean;
  getCapabilities(model: VideoModelRecord): VideoProviderCapabilities;
  createTasks(args: {
    model: VideoModelRecord;
    params: VideoParams;
  }): Promise<ProviderCreateResult>;
  queryTaskStatus(args: {
    model: VideoModelRecord;
    taskId: string;
  }): Promise<TaskStatusResult>;
}

export interface VideoParamInput {
  prompt: string;
  imageUrls?: string[];
  orientation?: "portrait" | "landscape";
  duration?: VideoDuration;
  count?: number;
  model: string;
}

export interface VideoModelOption {
  slug: string;
  name: string;
  provider: string;
  creditsPerGen: number;
  defaultParams: VideoModelDefaultParams;
  allowedDurations: VideoDuration[];
  defaultDuration: VideoDuration;
}

const PROVIDERS: Record<string, VideoProviderAdapter> = {
  plato: platoProvider,
  yunwu: yunwuProvider,
  dashscope: dashscopeProvider,
  grok2api: grok2apiProvider,
};

function isDuration(value: unknown): value is VideoDuration {
  return value === 4 || value === 5 || value === 6 || value === 8 || value === 10 || value === 15;
}

function isOrientation(value: unknown): value is "portrait" | "landscape" {
  return value === "portrait" || value === "landscape";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  if (normalized < 1) return undefined;
  return Math.min(normalized, 10);
}

function extractProviderOptions(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const providerOptions = { ...value };
  delete providerOptions.orientation;
  delete providerOptions.duration;
  delete providerOptions.count;
  delete providerOptions.allowedDurations;
  return providerOptions;
}

export function normalizeModelDefaultParams(
  value: unknown,
): VideoModelDefaultParams {
  if (!isPlainObject(value)) return {};

  const allowedDurations = Array.isArray(value.allowedDurations)
    ? [...new Set(value.allowedDurations.filter(isDuration))]
    : undefined;
  const count = toCount(value.count);

  const providerOptions = extractProviderOptions(value);

  return {
    ...providerOptions,
    ...(isOrientation(value.orientation)
      ? { orientation: value.orientation }
      : {}),
    ...(isDuration(value.duration) ? { duration: value.duration } : {}),
    ...(count ? { count } : {}),
    ...(allowedDurations && allowedDurations.length > 0
      ? { allowedDurations }
      : {}),
  };
}

export function resolveVideoProvider(provider: string): VideoProviderAdapter {
  const normalized = provider.trim().toLowerCase();
  const adapter = PROVIDERS[normalized];
  if (!adapter) {
    throw new Error(`Unsupported video provider: ${provider}`);
  }
  return adapter;
}

export function getProviderCapabilities(model: {
  provider: string;
  slug?: string;
  defaultParams?: unknown;
}): VideoProviderCapabilities {
  const adapter = resolveVideoProvider(model.provider);
  const defaults = normalizeModelDefaultParams(model.defaultParams);
  const virtualModel: VideoModelRecord = {
    id: "virtual-model",
    name: model.slug ?? "virtual-model",
    slug: model.slug ?? "virtual-model",
    provider: model.provider,
    capability: MODEL_CAPABILITIES.videoGeneration,
    creditsPerGen: 0,
    isActive: true,
    apiKey: null,
    baseUrl: null,
    defaultParams: defaults,
    sortOrder: 0,
  };
  const baseCapabilities = adapter.getCapabilities(virtualModel);

  const allowedDurations =
    defaults.allowedDurations && defaults.allowedDurations.length > 0
      ? defaults.allowedDurations
      : baseCapabilities.allowedDurations;
  const defaultDuration =
    defaults.duration && allowedDurations.includes(defaults.duration)
      ? defaults.duration
      : allowedDurations.includes(baseCapabilities.defaultDuration)
        ? baseCapabilities.defaultDuration
        : allowedDurations[0];

  return {
    allowedDurations,
    defaultDuration,
  };
}

export function mergeVideoParamsWithModelDefaults(
  model: { provider?: string; defaultParams?: unknown; slug?: string },
  request: VideoParamInput,
): VideoParams {
  const defaults = normalizeModelDefaultParams(model.defaultParams);
  const capabilities = getProviderCapabilities({
    provider: model.provider ?? "plato",
    slug: model.slug,
    defaultParams: defaults,
  });

  const durationCandidate = request.duration ?? defaults.duration;
  const duration =
    durationCandidate && capabilities.allowedDurations.includes(durationCandidate)
      ? durationCandidate
      : capabilities.defaultDuration;
  const providerOptions = extractProviderOptions(defaults);

  return {
    prompt: request.prompt,
    imageUrls: request.imageUrls ?? [],
    orientation: request.orientation ?? defaults.orientation ?? "portrait",
    duration,
    count: request.count ?? defaults.count ?? 1,
    model: request.model,
    ...(Object.keys(providerOptions).length > 0
      ? { providerOptions }
      : {}),
  };
}

function mapModelRow(row: Model): VideoModelRecord {
  return {
    ...row,
    defaultParams: normalizeModelDefaultParams(row.defaultParams),
  };
}

export async function listActiveVideoModels(): Promise<VideoModelOption[]> {
  const rows = await db
    .select()
    .from(models)
    .where(
      and(
        eq(models.isActive, true),
        eq(models.capability, MODEL_CAPABILITIES.videoGeneration),
      ),
    )
    .orderBy(asc(models.sortOrder));

  const options: VideoModelOption[] = [];
  for (const row of rows) {
    const model = mapModelRow(row);
    try {
      const capabilities = getProviderCapabilities(model);
      options.push({
        slug: model.slug,
        name: model.name,
        provider: model.provider,
        creditsPerGen: model.creditsPerGen,
        defaultParams: model.defaultParams ?? {},
        allowedDurations: capabilities.allowedDurations,
        defaultDuration: capabilities.defaultDuration,
      });
    } catch (err) {
      // Skip models whose provider adapter is no longer registered.
      // A stale DB row (e.g. a grok model row left after the provider
      // was removed) should not take the whole catalog offline.
      console.warn(
        `[video] skipping model ${model.slug} (${model.provider}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return options;
}

export async function getVideoModelById(
  modelId: string | null | undefined,
): Promise<VideoModelRecord | null> {
  if (!modelId) return null;

  const [row] = await db
    .select()
    .from(models)
    .where(eq(models.id, modelId))
    .limit(1);

  return row ? mapModelRow(row) : null;
}

export async function getActiveVideoModelBySlug(
  slug: string,
): Promise<VideoModelRecord | null> {
  const [row] = await db
    .select()
    .from(models)
    .where(
      and(
        eq(models.slug, slug),
        eq(models.isActive, true),
        eq(models.capability, MODEL_CAPABILITIES.videoGeneration),
      ),
    )
    .limit(1);

  return row ? mapModelRow(row) : null;
}

export async function resolveActiveVideoModel(
  slug?: string | null,
): Promise<VideoModelRecord> {
  if (slug) {
    const model = await getActiveVideoModelBySlug(slug);
    if (model) return model;
    throw new Error(`模型不可用或不存在: ${slug}`);
  }

  const [row] = await db
    .select()
    .from(models)
    .where(
      and(
        eq(models.isActive, true),
        eq(models.capability, MODEL_CAPABILITIES.videoGeneration),
      ),
    )
    .orderBy(asc(models.sortOrder))
    .limit(1);

  if (!row) {
    throw new Error("没有可用的视频模型，请先在管理后台启用模型。");
  }

  return mapModelRow(row);
}

export async function createVideoTasks(params: {
  model: VideoModelRecord;
  request: VideoParamInput;
  userId?: string;
}): Promise<{
  providerTaskIds: string[];
  immediateResults?: (TaskStatusResult | null)[];
  resolvedParams: VideoParams;
}> {
  const adapter = resolveVideoProvider(params.model.provider);
  const resolvedParams = mergeVideoParamsWithModelDefaults(
    params.model,
    params.request,
  );

  // Resize reference images so they match the provider's expected output
  // dimensions — opt-out via `adapter.wantsImagePrep = false` for providers
  // (e.g. grok2api) that adhere better to the user's original image.
  const wantsPrep = adapter.wantsImagePrep ?? true;
  if (
    wantsPrep &&
    params.userId &&
    resolvedParams.imageUrls &&
    resolvedParams.imageUrls.length > 0
  ) {
    const resolution =
      (resolvedParams.providerOptions?.resolution as string) ??
      (resolvedParams.providerOptions?.size as string) ??
      "720P";
    resolvedParams.imageUrls = await prepareImagesForProvider({
      imageUrls: resolvedParams.imageUrls,
      orientation: resolvedParams.orientation,
      provider: params.model.provider,
      resolution,
      userId: params.userId,
    });
  }

  const submitted = await adapter.createTasks({
    model: params.model,
    params: resolvedParams,
  });
  return {
    providerTaskIds: submitted.providerTaskIds,
    immediateResults: submitted.immediateResults,
    resolvedParams,
  };
}

export async function createVideoTasksForModelId(params: {
  modelId: string | null | undefined;
  request: VideoParamInput;
  userId?: string;
}): Promise<{
  model: VideoModelRecord;
  providerTaskIds: string[];
  immediateResults?: (TaskStatusResult | null)[];
  resolvedParams: VideoParams;
}> {
  const model = await getVideoModelById(params.modelId);
  if (!model) {
    throw new Error("任务关联的视频模型不存在。");
  }

  const result = await createVideoTasks({
    model,
    request: params.request,
    userId: params.userId,
  });
  return { model, ...result };
}

export async function queryVideoTaskStatus(params: {
  modelId: string | null | undefined;
  taskId: string;
}): Promise<TaskStatusResult> {
  const model = await getVideoModelById(params.modelId);
  if (!model) {
    throw new Error("任务关联的视频模型不存在。");
  }

  const adapter = resolveVideoProvider(model.provider);
  return adapter.queryTaskStatus({
    model,
    taskId: params.taskId,
  });
}
