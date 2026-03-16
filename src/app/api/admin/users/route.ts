import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, desc, ilike, or, sql } from "drizzle-orm";

/** GET /api/admin/users — list all users (admin only) */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const search = req.nextUrl.searchParams.get("search") ?? "";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const conditions = search
    ? or(
        ilike(users.email, `%${search}%`),
        ilike(users.name, `%${search}%`),
      )
    : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(conditions);

  const rows = await db
    .select()
    .from(users)
    .where(conditions)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    users: rows,
    total: Number(count),
    page,
    limit,
  });
}

/** PATCH /api/admin/users — update a user's role or status (admin only) */
export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    userId: string;
    role?: "admin" | "user";
    status?: "active" | "suspended";
    name?: string;
  };

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.role) updates.role = body.role;
  if (body.status) updates.status = body.status;
  if (body.name !== undefined) updates.name = body.name;
  updates.updatedAt = new Date();

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, body.userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
