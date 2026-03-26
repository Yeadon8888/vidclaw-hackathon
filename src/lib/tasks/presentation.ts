import type { TaskParamsSnapshot } from "@/lib/video/types";

const HASHTAG_LIMIT = 8;

export function getTaskSourceModeLabel(
  sourceMode?: TaskParamsSnapshot["sourceMode"],
): string {
  switch (sourceMode) {
    case "theme":
      return "主题原创";
    case "url":
      return "链接二创";
    case "upload":
      return "上传视频二创";
    case "batch":
      return "批量带货";
    default:
      return "未标记";
  }
}

export function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  return [...new Set(text.match(/#[\p{L}\p{N}_-]+/gu) ?? [])].slice(0, HASHTAG_LIMIT);
}

export function buildPublishHashtagText(text?: string | null): string {
  return extractHashtags(text).join(" ");
}
