export const MAX_REFERENCE_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

export type ReferenceImagePreflight =
  | {
      ok: true;
      needsCompression: boolean;
      maxBytes: number;
    }
  | {
      ok: false;
      error: string;
    };

export function inspectReferenceImageUpload(file: {
  type: string;
  size: number;
}): ReferenceImagePreflight {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return {
      ok: false,
      error: "不支持的图片格式。请上传 JPEG、PNG、GIF、WebP、BMP 或 TIFF。",
    };
  }

  return {
    ok: true,
    needsCompression: file.size > MAX_REFERENCE_IMAGE_UPLOAD_BYTES,
    maxBytes: MAX_REFERENCE_IMAGE_UPLOAD_BYTES,
  };
}
