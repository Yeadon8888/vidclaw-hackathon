import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

/** GET /api/admin/announcements — list all (admin only) */
export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const rows = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(50);

  return NextResponse.json(rows);
}

/** POST /api/admin/announcements — create new announcement */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
  }

  const [row] = await db
    .insert(announcements)
    .values({ content, createdBy: authResult.user.id })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

/** DELETE /api/admin/announcements?id=xxx — delete announcement */
export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }

  await db.delete(announcements).where(eq(announcements.id, id));
  return NextResponse.json({ ok: true });
}
