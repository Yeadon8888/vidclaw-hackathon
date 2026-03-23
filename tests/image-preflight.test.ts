import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectReferenceImageUpload,
  MAX_REFERENCE_IMAGE_UPLOAD_BYTES,
} from "../src/lib/assets/image-preflight";

test("small supported images can upload without compression", () => {
  const result = inspectReferenceImageUpload({
    type: "image/png",
    size: 512_000,
  });

  assert.deepEqual(result, {
    ok: true,
    needsCompression: false,
    maxBytes: MAX_REFERENCE_IMAGE_UPLOAD_BYTES,
  });
});

test("large supported images require compression before upload", () => {
  const result = inspectReferenceImageUpload({
    type: "image/jpeg",
    size: MAX_REFERENCE_IMAGE_UPLOAD_BYTES + 1,
  });

  assert.deepEqual(result, {
    ok: true,
    needsCompression: true,
    maxBytes: MAX_REFERENCE_IMAGE_UPLOAD_BYTES,
  });
});

test("unsupported image types are rejected early", () => {
  const result = inspectReferenceImageUpload({
    type: "image/svg+xml",
    size: 12_000,
  });

  assert.deepEqual(result, {
    ok: false,
    error: "不支持的图片格式。请上传 JPEG、PNG、GIF、WebP、BMP 或 TIFF。",
  });
});
