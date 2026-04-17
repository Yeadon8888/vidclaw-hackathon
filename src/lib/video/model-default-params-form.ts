const COMMON_KEYS = new Set([
  "orientation",
  "duration",
  "count",
  "allowedDurations",
  "watermark",
]);

const DURATION_OPTIONS = ["4", "6", "8", "10", "15"] as const;
type DurationOption = (typeof DURATION_OPTIONS)[number];
type OrientationOption = "" | "portrait" | "landscape";
type WatermarkOption = "inherit" | "true" | "false";

export interface ModelDefaultParamsEditorState {
  orientation: OrientationOption;
  duration: "" | DurationOption;
  count: string;
  allowedDurations: DurationOption[];
  watermark: WatermarkOption;
  extraParamsText: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDurationOption(value: unknown): DurationOption | "" {
  if (value === 4 || value === "4") return "4";
  if (value === 6 || value === "6") return "6";
  if (value === 8 || value === "8") return "8";
  if (value === 10 || value === "10") return "10";
  if (value === 15 || value === "15") return "15";
  return "";
}

function normalizeOrientation(value: unknown): OrientationOption {
  return value === "portrait" || value === "landscape" ? value : "";
}

function normalizeWatermark(value: unknown): WatermarkOption {
  if (value === true) return "true";
  if (value === false) return "false";
  return "inherit";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function normalizeAllowedDurations(value: unknown): DurationOption[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(normalizeDurationOption).filter(Boolean))] as DurationOption[];
}

function normalizeCount(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const normalized = Math.trunc(value);
  return normalized > 0 ? String(normalized) : "";
}

function extractExtraParams(value: Record<string, unknown>): Record<string, unknown> {
  const extraParams = { ...value };
  for (const key of COMMON_KEYS) {
    delete extraParams[key];
  }
  return extraParams;
}

function parseExtraParams(text: string): {
  ok: true;
  payload: Record<string, unknown>;
} | {
  ok: false;
  error: string;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, payload: {} };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isPlainObject(parsed)) {
      return { ok: false, error: "高级参数 JSON 必须是对象" };
    }

    const duplicateKeys = Object.keys(parsed).filter((key) => COMMON_KEYS.has(key));
    if (duplicateKeys.length > 0) {
      return {
        ok: false,
        error: `高级参数 JSON 请不要重复填写这些字段：${duplicateKeys.join(", ")}`,
      };
    }

    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, error: "高级参数 JSON 不是合法 JSON" };
  }
}

export function defaultParamsToEditorState(
  value: unknown,
): ModelDefaultParamsEditorState {
  if (!isPlainObject(value)) {
    return {
      orientation: "",
      duration: "",
      count: "",
      allowedDurations: [],
      watermark: "inherit",
      extraParamsText: "{}",
    };
  }

  return {
    orientation: normalizeOrientation(value.orientation),
    duration: normalizeDurationOption(value.duration),
    count: normalizeCount(value.count),
    allowedDurations: normalizeAllowedDurations(value.allowedDurations),
    watermark: normalizeWatermark(value.watermark),
    extraParamsText: formatJson(extractExtraParams(value)),
  };
}

export function editorStateToDefaultParams(
  state: ModelDefaultParamsEditorState,
): {
  ok: true;
  payload: Record<string, unknown>;
} | {
  ok: false;
  error: string;
} {
  const extraParamsResult = parseExtraParams(state.extraParamsText);
  if (!extraParamsResult.ok) {
    return extraParamsResult;
  }

  const countValue = state.count.trim();
  const count = countValue ? Number.parseInt(countValue, 10) : undefined;
  if (countValue && (count === undefined || Number.isNaN(count) || count < 1)) {
    return { ok: false, error: "默认数量必须是大于 0 的整数" };
  }

  if (
    state.duration &&
    state.allowedDurations.length > 0 &&
    !state.allowedDurations.includes(state.duration)
  ) {
    return { ok: false, error: "默认时长必须包含在允许时长中" };
  }

  const payload: Record<string, unknown> = {
    ...extraParamsResult.payload,
  };

  if (state.orientation) payload.orientation = state.orientation;
  if (state.duration) payload.duration = Number(state.duration);
  if (count) payload.count = count;
  if (state.allowedDurations.length > 0) {
    payload.allowedDurations = state.allowedDurations.map(Number);
  }
  if (state.watermark !== "inherit") {
    payload.watermark = state.watermark === "true";
  }

  return { ok: true, payload };
}

export function buildDefaultParamsPreview(
  state: ModelDefaultParamsEditorState,
): string {
  const result = editorStateToDefaultParams(state);
  if (!result.ok) return "";
  return formatJson(result.payload);
}

export function getModelDurationOptions(): readonly DurationOption[] {
  return DURATION_OPTIONS;
}
