import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listModelsByCapability } from "@/lib/models/repository";
import { MODEL_CAPABILITIES } from "@/lib/models/capabilities";

/**
 * GET /api/models/image-edit — list active image-edit models for the
 * scene generator's model picker. Returns the fields the UI needs
 * (slug, name, creditsPerGen), NEVER apiKey / baseUrl.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const all = await listModelsByCapability(MODEL_CAPABILITIES.imageEdit);
  const models = all
    .filter((m) => m.isActive)
    .map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      creditsPerGen: m.creditsPerGen,
    }));
  return NextResponse.json({ models });
}
