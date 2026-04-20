import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env.local"));
  loadEnv(path.join(process.cwd(), ".env.vercel.production"));

  const databaseUrl = process.env.DATABASE_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }
  if (!cronSecret) {
    throw new Error("CRON_SECRET is missing.");
  }

  const tickUrl = "https://video.yeadon.top/api/internal/tasks/tick";
  const thumbBackfillUrl = "https://video.yeadon.top/api/internal/gallery/thumbnail-backfill";
  const assetTransformUrl = "https://video.yeadon.top/api/internal/assets/transforms/process";
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false });
  const escapedCronSecret = cronSecret.replace(/'/g, "''");

  function buildPostCommand(url: string): string {
    const escapedUrl = url.replace(/'/g, "''");
    return `
      select
        net.http_post(
          url := '${escapedUrl}',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ${escapedCronSecret}'
          ),
          body := '{}'::jsonb
        );
    `.trim();
  }

  const tickCommand = buildPostCommand(tickUrl);
  const thumbBackfillCommand = buildPostCommand(thumbBackfillUrl);
  const assetTransformCommand = buildPostCommand(assetTransformUrl);

  try {
    await sql`create extension if not exists pg_cron`;
    await sql`create extension if not exists pg_net`;

    await sql`select cron.unschedule(jobid) from cron.job where jobname in ('vidclaw-task-tick', 'vidclaw-timeout-fallback', 'vidclaw-gallery-thumbnail-backfill', 'vidclaw-asset-transform-drain')`;

    await sql.unsafe(`
      select cron.schedule(
        'vidclaw-task-tick',
        '* * * * *',
        $$${tickCommand}$$
      )
    `);

    await sql.unsafe(`
      select cron.schedule(
        'vidclaw-timeout-fallback',
        '15 * * * *',
        $$${tickCommand}$$
      )
    `);

    // Thumbnail backfill — every 5 minutes is enough; processes up to
    // DEFAULT_BATCH (5) gallery rows per run. Catches up within ~10 min
    // even after a publish burst.
    await sql.unsafe(`
      select cron.schedule(
        'vidclaw-gallery-thumbnail-backfill',
        '*/5 * * * *',
        $$${thumbBackfillCommand}$$
      )
    `);

    // Asset-transform (AI 抠图 / 9:16 白底) drain — every minute. The route
    // itself is self-draining (up to MAX_CONCURRENT rounds per Vercel
    // function invocation) but needs SOMEONE to ring the bell after users
    // leave the page. Without this the tail of a batch gets stranded in
    // `pending` forever because the only other trigger is user action.
    await sql.unsafe(`
      select cron.schedule(
        'vidclaw-asset-transform-drain',
        '* * * * *',
        $$${assetTransformCommand}$$
      )
    `);

    const jobs = await sql`
      select jobid, jobname, schedule, active
      from cron.job
      where jobname in ('vidclaw-task-tick', 'vidclaw-timeout-fallback', 'vidclaw-gallery-thumbnail-backfill', 'vidclaw-asset-transform-drain')
      order by jobname
    `;

    console.log(JSON.stringify(jobs, null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
