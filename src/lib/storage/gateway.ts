/**
 * R2 Upload Gateway — manage user assets (images, videos, prompts).
 * v2 adaptation: uses userId instead of workspaceId for isolation.
 */

import type { StoredAsset, WorkspacePrompts } from "@/lib/video/types";

interface UploadGatewayConfig {
  baseUrl: string;
  apiKey: string;
  prefix: string;
}

function getConfig(): UploadGatewayConfig | null {
  const baseUrl =
    process.env.UPLOAD_API_URL?.trim().replace(/\/+$/, "") ?? "";
  const apiKey = process.env.UPLOAD_API_KEY?.trim() ?? "";
  const prefix = (process.env.UPLOAD_PREFIX?.trim() ?? "vidclaw-assets").replace(
    /^\/+|\/+$/g,
    "",
  );

  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, prefix };
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  const ext = parts.length > 1 ? parts.pop() : "bin";
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}

export function isUploadGatewayEnabled(): boolean {
  return getConfig() !== null;
}

function buildUserPrefix(
  config: UploadGatewayConfig,
  userId: string,
): string {
  return `${config.prefix}/${userId}`;
}

async function requestJson<T>(params: {
  method: "GET" | "POST" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: ArrayBuffer;
  timeoutSeconds?: number;
}): Promise<T> {
  const response = await fetch(params.url, {
    method: params.method,
    headers: params.headers,
    body: params.body,
    signal: AbortSignal.timeout((params.timeoutSeconds ?? 60) * 1000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

// ─── Public API ───

export async function listAssets(userId: string): Promise<StoredAsset[]> {
  const config = getConfig();
  if (!config) return [];

  const prefix = buildUserPrefix(config, userId);
  const data = await requestJson<{ assets?: StoredAsset[] }>({
    method: "GET",
    url: `${config.baseUrl}/list?prefix=${encodeURIComponent(prefix)}`,
    headers: {
      "x-upload-key": config.apiKey,
      Accept: "application/json",
    },
  });
  return data.assets ?? [];
}

export async function uploadAsset(params: {
  userId: string;
  filename: string;
  data: ArrayBuffer;
  contentType: string;
}): Promise<StoredAsset> {
  const config = getConfig();
  if (!config) throw new Error("UPLOAD_API_URL or UPLOAD_API_KEY is not set");

  const key = `${buildUserPrefix(config, params.userId)}/img-${crypto.randomUUID()}.${getExtension(params.filename)}`;
  const result = await requestJson<StoredAsset & { success?: boolean }>({
    method: "POST",
    url: `${config.baseUrl}/upload?key=${encodeURIComponent(key)}`,
    headers: {
      "x-upload-key": config.apiKey,
      "Content-Type": params.contentType || "application/octet-stream",
    },
    body: params.data,
    timeoutSeconds: 120,
  });
  return {
    key: result.key,
    url: result.url,
    size: result.size,
    uploadedAt: result.uploadedAt,
  };
}

export async function uploadVideo(params: {
  userId: string;
  filename: string;
  data: ArrayBuffer;
  contentType: string;
}): Promise<StoredAsset> {
  const config = getConfig();
  if (!config) throw new Error("UPLOAD_API_URL or UPLOAD_API_KEY is not set");

  const ext = getExtension(params.filename);
  const key = `${buildUserPrefix(config, params.userId)}/vid-${crypto.randomUUID()}.${ext}`;
  const result = await requestJson<StoredAsset & { success?: boolean }>({
    method: "POST",
    url: `${config.baseUrl}/upload?key=${encodeURIComponent(key)}`,
    headers: {
      "x-upload-key": config.apiKey,
      "Content-Type": params.contentType || "video/mp4",
    },
    body: params.data,
    timeoutSeconds: 180,
  });
  return {
    key: result.key,
    url: result.url,
    size: result.size,
    uploadedAt: result.uploadedAt,
  };
}

export async function deleteAsset(
  userId: string,
  key: string,
): Promise<boolean> {
  const config = getConfig();
  if (!config) throw new Error("UPLOAD_API_URL or UPLOAD_API_KEY is not set");

  const prefix = `${buildUserPrefix(config, userId)}/`;
  if (!key.startsWith(prefix)) {
    throw new Error("Asset key does not belong to this user");
  }

  await requestJson<{ ok?: boolean }>({
    method: "DELETE",
    url: `${config.baseUrl}/files/${encodeKey(key)}`,
    headers: {
      "x-upload-key": config.apiKey,
      Accept: "application/json",
    },
  });

  return true;
}

/**
 * Download an asset from its public URL and return the raw bytes.
 * Used to fetch videos/images for Gemini analysis.
 */
export async function fetchAssetBuffer(url: string): Promise<{
  buffer: ArrayBuffer;
  mimeType: string;
}> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch asset: HTTP ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  const ct = res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer, mimeType: ct.split(";")[0].trim() };
}

// ─── User-scoped custom prompts (stored as JSON on R2) ───

const PROMPTS_FILENAME = "prompts.json";

export async function loadUserPrompts(
  userId: string,
): Promise<WorkspacePrompts> {
  const config = getConfig();
  if (!config) return {};

  const key = `${buildUserPrefix(config, userId)}/${PROMPTS_FILENAME}`;
  const url = `${config.baseUrl}/files/${encodeKey(key)}`;

  try {
    const result = await fetchAssetBuffer(url);
    const text = new TextDecoder().decode(result.buffer);
    return JSON.parse(text) as WorkspacePrompts;
  } catch {
    return {};
  }
}

export async function saveUserPrompts(
  userId: string,
  prompts: WorkspacePrompts,
): Promise<void> {
  const config = getConfig();
  if (!config) throw new Error("Upload gateway not configured");

  const key = `${buildUserPrefix(config, userId)}/${PROMPTS_FILENAME}`;
  const body = new TextEncoder().encode(JSON.stringify(prompts, null, 2));

  await requestJson<{ success?: boolean }>({
    method: "POST",
    url: `${config.baseUrl}/upload?key=${encodeURIComponent(key)}`,
    headers: {
      "x-upload-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ),
    timeoutSeconds: 30,
  });
}
