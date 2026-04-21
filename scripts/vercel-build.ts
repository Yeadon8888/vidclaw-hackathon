import { spawnSync } from "node:child_process";

/**
 * Vercel 的 `buildCommand` 入口。
 *
 * 职责：
 *   1. 若本次构建是 production 部署（VERCEL_ENV=production），先跑一次
 *      drizzle 迁移把生产库带到当前 schema，再进 next build。
 *   2. 否则（preview / development / 本地）跳过迁移，只跑 next build。
 *
 * 为什么 gate：Vercel 的 preview 构建通常沿用 production 环境变量里的
 *   DATABASE_URL（除非单独配置），如果不做 gate，任何 PR / 临时分支
 *   的构建都会改到生产库。只有确认是 production 构建才允许迁移。
 *
 * 为什么放在 buildCommand 而不是单独 CI：
 *   - 生产部署源和迁移是同一个 deploy 的原子事务——build 失败不会 alias，
 *     迁移失败会 build 失败，不会出现"代码新但库未迁"的错位窗口。
 *   - 避免再多一个 GitHub Action / Deploy Hook 带来的 secrets 管理负担。
 */

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    const code = result.status ?? result.signal ?? "unknown";
    throw new Error(`${command} ${args.join(" ")} 退出码 ${code}`);
  }
}

function main(): void {
  const vercelEnv = process.env.VERCEL_ENV;
  const shouldMigrate = vercelEnv === "production";

  if (shouldMigrate) {
    if (!process.env.DATABASE_URL) {
      throw new Error("VERCEL_ENV=production 但 DATABASE_URL 未设置，无法执行迁移。");
    }
    console.log("[vercel-build] 检测到 production 构建，执行 drizzle-kit migrate...");
    run("npx", ["drizzle-kit", "migrate"]);
  } else {
    console.log(`[vercel-build] 跳过迁移（VERCEL_ENV=${vercelEnv ?? "unset"}）`);
  }

  console.log("[vercel-build] 开始 next build...");
  run("npx", ["next", "build"]);
}

try {
  main();
} catch (error) {
  console.error("[vercel-build]", error instanceof Error ? error.message : error);
  process.exit(1);
}
