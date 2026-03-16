import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { models } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

/** GET /api/generate/models — list active video models for generation page */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const rows = await db
    .select({
      slug: models.slug,
      name: models.name,
      creditsPerGen: models.creditsPerGen,
    })
    .from(models)
    .where(eq(models.isActive, true))
    .orderBy(asc(models.sortOrder));

  return NextResponse.json({ models: rows });
}
