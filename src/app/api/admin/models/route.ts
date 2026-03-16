import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { models } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

/** GET /api/admin/models — list all video models (admin only) */
export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const rows = await db
    .select()
    .from(models)
    .orderBy(asc(models.sortOrder));

  return NextResponse.json({ models: rows });
}

/** POST /api/admin/models — create a new model (admin only) */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    name: string;
    slug: string;
    provider: string;
    creditsPerGen?: number;
    isActive?: boolean;
    apiKey?: string;
    baseUrl?: string;
    defaultParams?: Record<string, unknown>;
    sortOrder?: number;
  };

  if (!body.name || !body.slug || !body.provider) {
    return NextResponse.json(
      { error: "name, slug, and provider are required" },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(models)
    .values({
      name: body.name,
      slug: body.slug,
      provider: body.provider,
      creditsPerGen: body.creditsPerGen ?? 10,
      isActive: body.isActive ?? true,
      apiKey: body.apiKey || null,
      baseUrl: body.baseUrl || null,
      defaultParams: body.defaultParams ?? {},
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

/** PATCH /api/admin/models — update a model (admin only) */
export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    id: string;
    name?: string;
    creditsPerGen?: number;
    isActive?: boolean;
    apiKey?: string | null;
    baseUrl?: string | null;
    defaultParams?: Record<string, unknown>;
    sortOrder?: number;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.creditsPerGen !== undefined) updates.creditsPerGen = body.creditsPerGen;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.apiKey !== undefined) updates.apiKey = body.apiKey || null;
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl || null;
  if (body.defaultParams !== undefined) updates.defaultParams = body.defaultParams;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(models)
    .set(updates)
    .where(eq(models.id, body.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

/** DELETE /api/admin/models — delete a model (admin only) */
export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = (await req.json()) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(models)
    .where(eq(models.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
