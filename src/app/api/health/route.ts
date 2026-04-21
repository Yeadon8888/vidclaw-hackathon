import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/health — 公开 liveness 探针。
 *
 * 只返回"能/不能连到 DB"，不暴露任何内部环境变量、连接字符串前缀、
 * 认证异常或依赖组件的配置状态。这些诊断信号以前直接返回给公网，
 * 攻击者可用来画部署画像和探测认证故障模式。
 *
 * 如果将来需要详细诊断，请在 requireAdmin() 后面单独起一个
 * `/api/admin/health/detailed` 路由。
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      ok: true,
      service: "short-video-gen",
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "short-video-gen",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
