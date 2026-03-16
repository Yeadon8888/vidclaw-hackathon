import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, creditTxns } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

/** POST /api/admin/credits — grant credits to a user (admin only) */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  const admin = authResult.user;

  const body = (await req.json()) as {
    userId: string;
    amount: number;
    reason?: string;
  };

  if (!body.userId || typeof body.amount !== "number" || body.amount === 0) {
    return NextResponse.json(
      { error: "Valid userId and non-zero amount required" },
      { status: 400 },
    );
  }

  // Get current user
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, body.userId))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const newBalance = targetUser.credits + body.amount;
  if (newBalance < 0) {
    return NextResponse.json(
      { error: `Cannot reduce below 0. Current: ${targetUser.credits}` },
      { status: 400 },
    );
  }

  // Update credits atomically
  await db
    .update(users)
    .set({
      credits: sql`${users.credits} + ${body.amount}`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, body.userId));

  // Record transaction
  const txnType = body.amount > 0 ? "grant" : "adjust";
  await db.insert(creditTxns).values({
    userId: body.userId,
    type: txnType as "grant" | "adjust",
    amount: body.amount,
    reason: body.reason || (body.amount > 0 ? "管理员充值" : "管理员扣减"),
    adminId: admin.id,
    balanceAfter: newBalance,
  });

  return NextResponse.json({
    ok: true,
    userId: body.userId,
    amount: body.amount,
    balanceAfter: newBalance,
  });
}

/** GET /api/admin/credits?userId=xxx — get credit history (admin only) */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const txns = await db
    .select()
    .from(creditTxns)
    .where(eq(creditTxns.userId, userId))
    .orderBy(desc(creditTxns.createdAt))
    .limit(100);

  return NextResponse.json({ transactions: txns });
}
