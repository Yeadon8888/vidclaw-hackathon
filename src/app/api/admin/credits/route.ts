import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, creditTxns } from "@/lib/db/schema";
import { eq, desc, sql, ilike, or } from "drizzle-orm";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * GET /api/admin/credits?userId=<uuid|email|name> — get credit history (admin only)
 *
 * 参数 `userId` 支持三种形式：
 *   - UUID：按 user.id 直接查
 *   - 其他字符串：先做 ilike 匹配 email / name，命中唯一用户后查其流水
 *
 * 为什么不强求 UUID：管理员自然想输"邮箱"或"昵称"来找用户，强求 UUID
 * 就会出现用户在输入框里打邮箱 → 后端把字符串当 UUID 塞给 PG → 抛
 * "invalid input syntax for type uuid" → 前端 catch 吞掉 → 页面空白。
 *
 * 返回里也带上实际用户信息（user.email / user.id）方便前端显示上下文。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const rawQuery = req.nextUrl.searchParams.get("userId")?.trim();
  if (!rawQuery) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // 定位目标用户
  let targetUser: { id: string; email: string; name: string | null; credits: number } | null = null;

  if (UUID_REGEX.test(rawQuery)) {
    const [row] = await db
      .select({ id: users.id, email: users.email, name: users.name, credits: users.credits })
      .from(users)
      .where(eq(users.id, rawQuery))
      .limit(1);
    targetUser = row ?? null;
  } else {
    // 转义 LIKE 通配符，避免管理员输 % 或 _ 搜出奇怪结果
    const escaped = rawQuery.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const matches = await db
      .select({ id: users.id, email: users.email, name: users.name, credits: users.credits })
      .from(users)
      .where(
        or(
          ilike(users.email, `%${escaped}%`),
          ilike(users.name, `%${escaped}%`),
        ),
      )
      .limit(2);

    if (matches.length === 0) {
      return NextResponse.json({
        error: `未找到匹配的用户: ${rawQuery}`,
        transactions: [],
      }, { status: 404 });
    }
    if (matches.length > 1) {
      return NextResponse.json({
        error: `匹配到多个用户，请输入更精确的关键字或完整邮箱`,
        transactions: [],
        matches: matches.map((u) => ({ id: u.id, email: u.email, name: u.name })),
      }, { status: 409 });
    }
    targetUser = matches[0];
  }

  if (!targetUser) {
    return NextResponse.json({
      error: `未找到用户`,
      transactions: [],
    }, { status: 404 });
  }

  const txns = await db
    .select()
    .from(creditTxns)
    .where(eq(creditTxns.userId, targetUser.id))
    .orderBy(desc(creditTxns.createdAt))
    .limit(100);

  return NextResponse.json({
    transactions: txns,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      credits: targetUser.credits,
    },
  });
}
