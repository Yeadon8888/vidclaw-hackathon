export type VideoDuration = 4 | 5 | 6 | 8 | 10 | 15;

// ─── Video generation types ───

export interface VideoParams {
  prompt: string;
  imageUrls?: string[];
  orientation: "portrait" | "landscape";
  duration: VideoDuration;
  count: number;
  model?: string;
  providerOptions?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  status: string;
  url?: string;
  failReason?: string;
}

export type TerminalClass =
  | "content_policy"
  | "quota_exceeded"
  | "provider_error"
  | "timeout"
  | "unknown";

export interface TaskStatusResult {
  taskId: string;
  status: string;
  progress: string;
  url?: string;
  failReason?: string;
  /** Whether this failure is retryable (only set when status === "FAILED") */
  retryable?: boolean;
  /** Classified failure category (only set when status === "FAILED") */
  terminalClass?: TerminalClass;
}

// ─── Gemini / Script types ───

export interface Shot {
  id: number;
  scene_zh: string;
  sora_prompt: string;
  duration_s: number;
  camera: "close-up" | "wide" | "medium" | "overhead";
}

export interface ScriptResult {
  creative_points: string[];
  hook: string;
  plot_summary: string;
  shots: Shot[];
  full_sora_prompt: string;
  copy: {
    title: string;
    caption: string;
    first_comment: string;
  };
  language?: {
    spoken?: string;
    content?: string;
  };
}

// See src/lib/video/languages.ts for the full list + how to add new ones.
import type { OutputLanguage } from "./languages";
export type { OutputLanguage };

export type GenerateSourceMode = "theme" | "url" | "upload" | "batch";
export type ImageSelectionMode = "single" | "sequence";

export interface SelectedAssetSnapshot {
  id: string;
  url: string;
  filename?: string | null;
}

export interface GenerateInputSnapshot {
  sourceMode: GenerateSourceMode;
  primaryInput?: string;
  creativeBrief?: string;
  batchTheme?: string;
  batchUnitsPerProduct?: number;
  batchProductCount?: number;
  selectionMode?: ImageSelectionMode;
  selectedImageIds?: string[];
  selectedAssets?: SelectedAssetSnapshot[];
  assignedAssetId?: string;
  assignedAssetIndex?: number;
  batchRunId?: string;
  batchIndex?: number;
  batchTotal?: number;
}

export interface TaskParamsSnapshot {
  orientation: "portrait" | "landscape";
  duration: VideoDuration;
  count: number;
  platform: "douyin" | "tiktok";
  outputLanguage?: OutputLanguage;
  model: string;
  imageUrls?: string[];
  sourceMode?: GenerateSourceMode;
  creativeBrief?: string;
  batchTheme?: string;
  batchUnitsPerProduct?: number;
  batchProductCount?: number;
  selectionMode?: ImageSelectionMode;
  selectedImageIds?: string[];
  selectedAssets?: SelectedAssetSnapshot[];
  assignedAssetId?: string;
  assignedAssetIndex?: number;
  batchRunId?: string;
  batchIndex?: number;
  batchTotal?: number;
}

// ─── API request / SSE types ───

export type FulfillmentMode = "standard" | "backfill_until_target";

export interface GenerateRequest {
  type: "theme" | "video_key" | "url";
  input: string;
  modification?: string;
  creativeBrief?: string;
  sourceMode?: Exclude<GenerateSourceMode, "batch">;
  selectedImageIds?: string[];
  /** When true, task is saved as "scheduled" for later execution */
  scheduled?: boolean;
  /** Fulfillment mode — defaults to "standard" */
  fulfillmentMode?: FulfillmentMode;
  params: {
    orientation: "portrait" | "landscape";
    duration: VideoDuration;
    count: number;
    platform?: "douyin" | "tiktok";
    outputLanguage?: OutputLanguage;
    model?: string;
  };
}

export interface BatchGenerateRequest {
  sourceMode: "batch";
  batchTheme: string;
  selectedImageIds: string[];
  unitsPerProduct?: number;
  selectionMode: ImageSelectionMode;
  fulfillmentMode?: FulfillmentMode;
  params: {
    orientation: "portrait" | "landscape";
    duration: VideoDuration;
    count: number;
    platform?: "douyin" | "tiktok";
    outputLanguage?: OutputLanguage;
    model?: string;
  };
}

export type SSEEventType =
  | "log"
  | "stage"
  | "script"
  | "tasks"
  | "videos"
  | "error"
  | "done";

export interface SSEEvent {
  type: SSEEventType;
  [key: string]: unknown;
}

// ─── Storage types ───

export interface StoredAsset {
  key: string;
  url: string;
  size?: number;
  uploadedAt?: string;
}

export interface WorkspacePrompts {
  video_remix_base?: string;
  video_remix_with_modification?: string;
  theme_to_video?: string;
  copy_generation?: string;
}
