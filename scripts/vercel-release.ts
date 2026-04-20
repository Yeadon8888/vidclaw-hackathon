import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface LinkedProject {
  orgId: string;
  projectId: string;
  projectName?: string;
}

interface RemoteProject {
  name: string;
  rootDirectory: string | null;
}

interface MigrationJournal {
  entries: Array<{
    idx: number;
    when: number;
    tag: string;
  }>;
}

const REPO_ROOT = process.cwd();
const PROJECT_FILE = path.join(REPO_ROOT, ".vercel", "project.json");
const PRODUCTION_ENV_FILE = path.join(REPO_ROOT, ".env.vercel.production");
const SHOULD_FIX_ROOT_DIRECTORY = process.argv.includes("--fix-root-directory");
const SHOULD_DEPLOY = process.argv.includes("--deploy");
const SHOULD_MIGRATE = process.argv.includes("--migrate-production");
const ALLOW_DIRTY_TREE = process.argv.includes("--allow-dirty");

function readLinkedProject(): LinkedProject {
  if (!fs.existsSync(PROJECT_FILE)) {
    throw new Error(
      "缺少 .vercel/project.json。请先在仓库根目录执行 `vercel link`。",
    );
  }

  const linked = JSON.parse(
    fs.readFileSync(PROJECT_FILE, "utf8"),
  ) as LinkedProject;

  if (!linked.projectId || !linked.orgId) {
    throw new Error(".vercel/project.json 不完整，缺少 projectId 或 orgId。");
  }

  return linked;
}

function runVercelJson(args: string[], input?: string): string {
  try {
    return execFileSync("vercel", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: Buffer | string }).stderr || "").trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(message || `执行 vercel ${args.join(" ")} 失败。`);
  }
}

function runCommand(params: {
  command: string;
  args: string[];
  env?: Record<string, string>;
}) {
  const result = spawnSync(params.command, params.args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      ...params.env,
    },
  });

  if (result.status !== 0) {
    throw new Error(
      `执行 ${params.command} ${params.args.join(" ")} 失败，退出码 ${result.status ?? "unknown"}。`,
    );
  }
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function parseEnvFile(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;

  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = stripWrappingQuotes(line.slice(index + 1).trim());
    env[key] = value;
  }

  return env;
}

function readMigrationJournal(): MigrationJournal {
  return JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "drizzle", "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;
}

function readMigrationHash(tag: string): string {
  const sqlPath = path.join(REPO_ROOT, "drizzle", `${tag}.sql`);
  const content = fs.readFileSync(sqlPath, "utf8");
  return crypto.createHash("sha256").update(content).digest("hex");
}

function fetchRemoteProject(linked: LinkedProject): RemoteProject {
  const endpoint = `/v9/projects/${linked.projectId}?teamId=${linked.orgId}`;
  const raw = runVercelJson(["api", endpoint, "--raw"]);
  const remote = JSON.parse(raw) as RemoteProject;
  return {
    name: remote.name,
    rootDirectory: remote.rootDirectory ?? null,
  };
}

function patchRemoteRootDirectory(linked: LinkedProject): RemoteProject {
  const endpoint = `/v9/projects/${linked.projectId}?teamId=${linked.orgId}`;
  const raw = runVercelJson(
    ["api", endpoint, "-X", "PATCH", "--input", "-", "--raw"],
    JSON.stringify({ rootDirectory: null }),
  );
  const remote = JSON.parse(raw) as RemoteProject;
  return {
    name: remote.name,
    rootDirectory: remote.rootDirectory ?? null,
  };
}

function ensureRemoteRootDirectory(linked: LinkedProject) {
  const remote = fetchRemoteProject(linked);

  if (remote.rootDirectory === null || remote.rootDirectory === "") {
    console.log(`远端 Root Directory 已正确指向仓库根目录: ${remote.name}`);
    return;
  }

  if (!SHOULD_FIX_ROOT_DIRECTORY) {
    throw new Error(
      [
        `远端 Root Directory 当前为 "${remote.rootDirectory}"，这会导致部署时拼出错误路径。`,
        "请改为仓库根目录，或使用 `npm run deploy:vercel` 自动修正后再部署。",
      ].join("\n"),
    );
  }

  console.log(
    `检测到远端 Root Directory = "${remote.rootDirectory}"，正在自动修正为仓库根目录...`,
  );
  const updated = patchRemoteRootDirectory(linked);
  if (updated.rootDirectory !== null && updated.rootDirectory !== "") {
    throw new Error("Root Directory 自动修正失败，请到 Vercel 项目设置里手动检查。");
  }
  console.log("远端 Root Directory 已修正为仓库根目录。");
}

function pullProductionEnv() {
  console.log("拉取生产环境变量到 `.env.vercel.production` ...");
  runCommand({
    command: "vercel",
    args: ["env", "pull", ".env.vercel.production", "--environment=production"],
  });
}

function migrateProductionDatabase() {
  pullProductionEnv();
  const env = parseEnvFile(PRODUCTION_ENV_FILE);
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "生产环境变量中缺少 DATABASE_URL，无法执行生产迁移。",
    );
  }

  baselineLegacyProductionDatabase(databaseUrl);

  console.log("开始执行生产数据库迁移 `drizzle-kit migrate` ...");
  runCommand({
    command: "npx",
    args: ["drizzle-kit", "migrate"],
    env: {
      DATABASE_URL: databaseUrl,
    },
  });
}

function baselineLegacyProductionDatabase(databaseUrl: string) {
  const baselineScript = `
    import fs from "node:fs";
    import crypto from "node:crypto";
    import path from "node:path";
    import postgres from "postgres";

    const repoRoot = process.cwd();
    const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false });

    function loadJournal() {
      return JSON.parse(
        fs.readFileSync(path.join(repoRoot, "drizzle", "meta", "_journal.json"), "utf8"),
      );
    }

    function loadHash(tag) {
      const content = fs.readFileSync(path.join(repoRoot, "drizzle", tag + ".sql"), "utf8");
      return crypto.createHash("sha256").update(content).digest("hex");
    }

    try {
      const [{ count }] = await sql\`select count(*)::int as count from drizzle.__drizzle_migrations\`;
      if (count > 0) {
        console.log("drizzle 迁移账本已存在，跳过基线补齐。");
        process.exit(0);
      }

      const checks = {
        taskGroups: await sql\`select exists (select 1 from information_schema.tables where table_schema='public' and table_name='task_groups') as ok\`,
        taskSlots: await sql\`select exists (select 1 from information_schema.tables where table_schema='public' and table_name='task_slots') as ok\`,
        modelCapability: await sql\`select exists (select 1 from information_schema.columns where table_schema='public' and table_name='models' and column_name='capability') as ok\`,
        taskScheduled: await sql\`select exists (select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='scheduled_at') as ok\`,
        taskFulfillmentMode: await sql\`select exists (select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='fulfillment_mode') as ok\`,
      };

      const readyForBaseline = Object.values(checks).every((rows) => rows[0]?.ok === true);
      if (!readyForBaseline) {
        console.log("生产库不是历史全量库，跳过基线补齐，交给 drizzle 正常迁移。");
        process.exit(0);
      }

      const journal = loadJournal();
      for (const entry of journal.entries) {
        await sql\`insert into drizzle.__drizzle_migrations ("hash", "created_at") values (\${loadHash(entry.tag)}, \${entry.when})\`;
      }
      console.log(\`已为历史生产库补齐 drizzle 基线，共写入 \${journal.entries.length} 条迁移记录。\`);
    } finally {
      await sql.end();
    }
  `;

  runCommand({
    command: "node",
    args: ["--input-type=module", "-e", baselineScript],
    env: {
      DATABASE_URL: databaseUrl,
    },
  });
}

function captureGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: Buffer | string }).stderr || "").trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(message || `git ${args.join(" ")} 失败。`);
  }
}

function assertDeployableGitState() {
  // Block CLI uploads from silently shipping uncommitted code. When we hit
  // a prod bug it must be reproducible from a commit SHA, not from whatever
  // happened to be in someone's working tree at deploy time.
  const status = captureGit(["status", "--porcelain"]);
  if (status && !ALLOW_DIRTY_TREE) {
    throw new Error(
      [
        "工作区有未提交改动，禁止直接上传到生产：",
        status,
        "",
        "要么先 commit + push，要么在确实需要热修复时手动加 --allow-dirty。",
      ].join("\n"),
    );
  }

  const head = captureGit(["rev-parse", "HEAD"]);
  const branch = captureGit(["rev-parse", "--abbrev-ref", "HEAD"]);

  // Verify HEAD is reachable from origin — otherwise the deploy SHA Vercel
  // records is a local-only commit that no teammate can check out.
  let remoteHasHead = false;
  try {
    const containing = captureGit([
      "branch",
      "-r",
      "--contains",
      head,
    ]);
    remoteHasHead = containing.length > 0;
  } catch {
    remoteHasHead = false;
  }

  if (!remoteHasHead && !ALLOW_DIRTY_TREE) {
    throw new Error(
      [
        `当前 HEAD (${head.slice(0, 12)}, 分支 ${branch}) 尚未推到任何远端分支。`,
        "先 git push，让 Vercel 记到的 commit SHA 和实际代码对得上。",
      ].join("\n"),
    );
  }

  console.log(
    `Git 状态校验通过: HEAD=${head.slice(0, 12)} branch=${branch} dirty=${status ? "yes" : "no"} remoteHasHead=${remoteHasHead}`,
  );
}

function deployProduction() {
  assertDeployableGitState();
  console.log("开始执行 `vercel deploy --prod --yes` ...");
  runCommand({
    command: "vercel",
    args: ["deploy", "--prod", "--yes"],
  });
}

function main() {
  console.log(`仓库根目录: ${REPO_ROOT}`);
  const linked = readLinkedProject();
  console.log(
    `已链接 Vercel 项目: ${linked.projectName ?? linked.projectId} (${linked.projectId})`,
  );

  ensureRemoteRootDirectory(linked);

  if (SHOULD_MIGRATE) {
    migrateProductionDatabase();
  }

  if (!SHOULD_DEPLOY) {
    console.log("Vercel 发布前置校验通过。");
    return;
  }

  deployProduction();
}

main();
