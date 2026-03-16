import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

// GET /api/announcements — public, returns latest 10
export async function GET() {
  const rows = await db
    .select({
      id: announcements.id,
      content: announcements.content,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(10);

  return NextResponse.json(rows);
}
