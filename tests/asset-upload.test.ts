import test from "node:test";
import assert from "node:assert/strict";
import { inspectAssetUpload } from "../src/lib/assets/upload";

test("accepts supported image uploads up to 10MB", () => {
  const result = inspectAssetUpload({
    type: "image/png",
    size: 10 * 1024 * 1024,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected image upload to be accepted");
  }

  assert.equal(result.assetType, "image");
});

test("accepts supported video uploads up to 50MB", () => {
  const result = inspectAssetUpload({
    type: "video/mp4",
    size: 50 * 1024 * 1024,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected video upload to be accepted");
  }

  assert.equal(result.assetType, "video");
});

test("rejects unsupported file types", () => {
  const result = inspectAssetUpload({
    type: "application/pdf",
    size: 1024,
  });

  assert.deepEqual(result, {
    ok: false,
    error: "不支持的文件类型。仅支持常见图片和视频格式。",
    status: 400,
  });
});

test("rejects images larger than 10MB", () => {
  const result = inspectAssetUpload({
    type: "image/jpeg",
    size: 10 * 1024 * 1024 + 1,
  });

  assert.deepEqual(result, {
    ok: false,
    error: "文件过大，最大支持 10MB。",
    status: 400,
  });
});

test("rejects videos larger than 50MB", () => {
  const result = inspectAssetUpload({
    type: "video/webm",
    size: 50 * 1024 * 1024 + 1,
  });

  assert.deepEqual(result, {
    ok: false,
    error: "文件过大，最大支持 50MB。",
    status: 400,
  });
});
