import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { models } from "@/lib/db/schema";
import type { Model } from "@/lib/db/schema";
import type { TaskStatusResult, VideoParams } from "./types";
import { platoProvider } from "./providers/plato";

export interface VideoProviderCapabilities {
  allowedDurations: Array<8 | 10 | 15>;
  defaultDuration: 8 | 10 | 15;
}

export interface VideoModelDefaultParams {
  orientation?: "portrait" | "landscape";
  duration?: 8 | 10 | 15;
  count?: number;
  allowedDurations?: Array<8 | 10 | 15>;
  [key: string]: unknown;
}

export interface VideoModelRecord {
  id: Model["id"];
  name: Model["name"];
  slug: Model["slug"];
  provider: Model["provider"];
  creditsPerGen: Model["creditsPerGen"];
  isActive: Model["isActive"];
  apiKey: Model["apiKey"];
  baseUrl: Model["baseUrl"];
  defaultParams: VideoModelDefaultParams | null;
  sortOrder: Model["sortOrder"];
}

export interface VideoProviderAdapter {
  id: string;
  getCapabilities(model: VideoModelRecord): VideoProviderCapabilities;
  createTasks(args: {
    model: VideoModelRecord;
    params: VideoParams;
  }): Promise<string[]>;
  queryTaskStatus(args: {
    model: VideoModelRecord;
    taskId: string;
  }): Promise<TaskStatusResult>;
}

export interface VideoParamInput {
  prompt: string;
  imageUrls?: string[];
  orientation?: "portrait" | "landscape";
  duration?: 8 | 10 | 15;
  count?: number;
  model: string;
}

export interface VideoModelOption {
  slug: string;
  name: string;
  provider: string;
  creditsPerGen: number;
  defaultParams: VideoModelDefaultParams;
  allowedDurations: Array<8 | 10 | 15>;
  defaultDuration: 8 | 10 | 15;
}

const PROVIDERS: Record<string, VideoProviderAdapter> = {
  plato: platoProvider,
};

function isDuration(value: unknown): value is 8 | 10 | 15 {
  return value === 8 || value === 10 || value === 15;
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
    .where(eq(models.isActive, true))
    .orderBy(asc(models.sortOrder));

  return rows.map((row) => {
    const model = mapModelRow(row);
    const capabilities = getProviderCapabilities(model);
    return {
      slug: model.slug,
      name: model.name,
      provider: model.provider,
      creditsPerGen: model.creditsPerGen,
      defaultParams: model.defaultParams ?? {},
      allowedDurations: capabilities.allowedDurations,
      defaultDuration: capabilities.defaultDuration,
    };
  });
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
    .where(and(eq(models.slug, slug), eq(models.isActive, true)))
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
    .where(eq(models.isActive, true))
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
}): Promise<{
  providerTaskIds: string[];
  resolvedParams: VideoParams;
}> {
  const adapter = resolveVideoProvider(params.model.provider);
  const resolvedParams = mergeVideoParamsWithModelDefaults(
    params.model,
    params.request,
  );
  const providerTaskIds = await adapter.createTasks({
    model: params.model,
    params: resolvedParams,
  });
  return { providerTaskIds, resolvedParams };
}

export async function createVideoTasksForModelId(params: {
  modelId: string | null | undefined;
  request: VideoParamInput;
}): Promise<{
  model: VideoModelRecord;
  providerTaskIds: string[];
  resolvedParams: VideoParams;
}> {
  const model = await getVideoModelById(params.modelId);
  if (!model) {
    throw new Error("任务关联的视频模型不存在。");
  }

  const result = await createVideoTasks({
    model,
    request: params.request,
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
