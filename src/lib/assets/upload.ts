const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export type AssetUploadInspection =
  | {
      ok: true;
      assetType: "image" | "video";
      maxSize: number;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export function inspectAssetUpload(file: {
  type: string;
  size: number;
}): AssetUploadInspection {
  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      error: "不支持的文件类型。仅支持常见图片和视频格式。",
      status: 400,
    };
  }

  const assetType = file.type.startsWith("video/") ? "video" : "image";
  const maxSize = assetType === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;

  if (file.size > maxSize) {
    return {
      ok: false,
      error: `文件过大，最大支持 ${assetType === "video" ? "50" : "10"}MB。`,
      status: 400,
    };
  }

  return {
    ok: true,
    assetType,
    maxSize,
  };
}
