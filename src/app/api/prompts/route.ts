import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  loadUserPrompts,
  saveUserPrompts,
} from "@/lib/storage/gateway";
import type { WorkspacePrompts } from "@/lib/video/types";

/** GET /api/prompts — read custom prompts for the current user */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const prompts = await loadUserPrompts(user.id);
  return NextResponse.json(prompts);
}

/** PUT /api/prompts — save custom prompts for the current user */
export async function PUT(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = (await req.json()) as WorkspacePrompts;

  // Validate: only allow known keys
  const allowed = new Set([
    "video_remix_base",
    "video_remix_with_modification",
    "theme_to_video",
    "copy_generation",
  ]);
  const cleaned: WorkspacePrompts = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key) && typeof value === "string" && value.trim()) {
      (cleaned as Record<string, string>)[key] = value.trim();
    }
  }

  await saveUserPrompts(user.id, cleaned);
  return NextResponse.json({ ok: true });
}
