# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server (Next 16 uses Turbopack by default)
npm run build        # Production build (plain next build; Vercel uses scripts/vercel-build.ts)
npm run lint         # ESLint

# Testing
npm run test                                        # Run all tests
node --import tsx --test tests/path/to/file.test.ts # Run a single test file

# Database
npm run db:generate  # Generate Drizzle migrations from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:push      # Push schema directly (dev only)
npm run db:seed      # Seed initial data
npm run db:studio    # Open Drizzle Studio GUI

# Deployment
npm run deploy:vercel:check   # Pre-release checks (remote Root Directory, git state)
npm run deploy:vercel         # Full manual release (check + prod DB migrate + deploy)
                              # Prefer GitHub auto-deploy in normal flow — see Deployment below.

# Ops
npm run supabase:cron:deploy  # Register/update Supabase pg_cron jobs
```

## Architecture

VidClaw v2 is a Next.js 16 (App Router) SaaS for AI video generation. Users submit generation tasks, the app dispatches them to external video providers, and polls for results. Credits are consumed on submission and refunded on failure.

### Core domain modules (`src/lib/`)

Each major domain has its own `CLAUDE.md` with detailed architecture notes:

- **`tasks/`** — Task lifecycle. `runner.ts` is the maintenance entry point and runs four sub-pipelines concurrently (`Promise.allSettled`): scheduled advance, batch submission, active-task polling, and timeout sweep. Separate modules handle settlement (`reconciliation.ts`), slot-based fulfillment (`fulfillment.ts`), ZIP downloads (`downloads.ts`), and 3-day expiry cleanup (`expiry.ts`). Batch submission throttling lives in `batch-queue.ts` — **per-index stagger** (`index × BATCH_SUBMISSION_STAGGER_MS = 1s`), windowed submit count per group per tick. See `src/lib/tasks/CLAUDE.md`.

- **`video/`** — Provider adapter pattern. `service.ts` resolves the model and dispatches to a provider adapter; all provider-specific protocol details (URLs, field names, status words) are isolated in adapters under `src/lib/video/providers/` (currently `plato.ts`, `yunwu.ts`, `dashscope.ts`, `grok2api.ts`). Failure classification lives in `providers/shared.ts`. **`grok2api` is synchronous-blocking** (60–90s per create) — this drives much of the 300s tick-budget tuning. See `src/lib/video/CLAUDE.md`.

- **`image-edit/`** — Async image transformation pipeline (product images → 9:16 white background). Independent worker + queue + its own pg_cron drain; never merges with the video `runner.ts` path. See `src/lib/image-edit/CLAUDE.md`.

- **`models/`** — DB-driven model registry with capabilities (`video_generation`, `image_edit`, `script_generation`). Models carry per-model API keys, default params, and credits-per-generation. See `src/lib/models/CLAUDE.md`.

- **`payments/`** — Stripe is the default channel (credit cards, USD). Alipay is kept for the legacy CNY path. `createCreditRechargeOrder` splits by `provider`. Order lifecycle: pending → paid → credits granted. Stripe webhook handles `checkout.session.completed` + `checkout.session.async_payment_succeeded` (for ACH/SEPA) + failure/expiry variants. Double-layer idempotency: `stripe_events` PK + `WHERE status='pending'` on the credit-grant update. See `src/lib/payments/CLAUDE.md`.

- **`generate/`** — Orchestrates task creation: validates input, deducts credits, inserts task rows, and enqueues for processing.

- **`db/schema.ts`** — Single source of truth for all tables and enums. Key tables: `users`, `models`, `tasks`, `taskGroups`, `taskSlots`, `taskItems`, `creditTxns`, `paymentOrders`, `stripeEvents`, `userAssets`, `assetTransformJobs`, `galleryItems`.

### Task state machine

```
pending → analyzing → generating → polling → done
                                           ↘ failed (triggers refund)
scheduled → (clock fires) → pending
```

`taskSlots` track per-video delivery promises within a task; `taskItems` track individual provider attempts per slot. Fulfilled slot = one successful video delivered.

### API routes (`src/app/api/`)

**User-facing**
- `/api/generate` — Create single task; `/api/generate/batch` — Create task group
- `/api/generate/status` — SSE / polling for a task's live status
- `/api/tasks/refresh` — **Read-only** listing for the tasks page (maintenance has been moved to `/api/internal/tasks/tick`)
- `/api/assets/upload-token` — Signs a direct upload to the gateway (returns `UPLOAD_CLIENT_KEY`, not admin key)
- `/api/assets/register` — Register an uploaded asset; the URL is server-derived from `UPLOAD_API_URL + key`, never accepted from the client
- `/api/payments/stripe/checkout` + `/webhook` — Stripe entry + idempotent webhook sink
- `/api/admin/*` — Admin-only management endpoints (users, credits, models, payments, tasks, announcements)

**Internal / cron-driven**
- `/api/internal/tasks/tick` — Video maintenance runner. Hit every minute by Supabase pg_cron. Requires `Authorization: Bearer $CRON_SECRET` (or `$INTERNAL_TICK_SECRET`).
- `/api/internal/assets/transforms/process` — Image-edit worker. Self-draining up to `DRAIN_BUDGET_MS = 260s` per invocation; hit every minute by Supabase pg_cron.
- `/api/internal/gallery/thumbnail-backfill` — Fills missing gallery thumbnails; hit every 5 minutes by Supabase pg_cron.
- `/api/cron/scheduled` — Daily at 18:00 via Vercel Cron (see `vercel.json`).
- `/api/cron/timeout` — Daily at 00:00 via Vercel Cron. (The runtime `/api/internal/tasks/tick` already handles timeouts every minute; the Vercel Cron entry is a pure safety net.)
- `/api/health` — Public liveness probe, returns `{ok, service, checkedAt}` on DB connectivity, 503 otherwise. Deliberately minimal — do not extend it to return env status or error details.

### Authentication & data isolation

Supabase Auth with SSR adapter. Middleware at `src/lib/supabase/middleware.ts` protects all `(dashboard)` routes. Server components use `createServerClient` for user-scoped reads; API routes use Drizzle with the `DATABASE_URL` connection — which runs as the Supabase `postgres` role (`rolbypassrls=true`), so RLS does not apply to server-side queries.

RLS is nevertheless enabled on all multi-tenant tables (migration `0013_enable_rls.sql`) as defense-in-depth: if anyone ever hits these tables via Supabase JS Client (frontend), Edge Functions, or an MCP running as `authenticated`, policies restrict each row to its owning user. `authenticated`-role policies use `(select auth.uid()) = (select auth_id from users where id = user_id)` for user-owned tables; service tables (`models`, `system_config`, `announcements`, `stripe_events`) have RLS on with no `authenticated` policies (invisible to that role).

### State management

Zustand store at `src/stores/generate.ts` holds the generation form state (model, params, mode, assets). The store feeds `src/app/(dashboard)/generate/page.tsx` and the `GenerateFormPanels` component tree.

## Database migrations

Migration SQL files live in `drizzle/`. See `drizzle/CLAUDE.md` for the migration strategy — notably: always `db:generate` after schema changes, never hand-edit migration files (exceptions for RLS / enum-value additions drizzle-kit cannot express; see 0012 and 0013 for the pattern).

## Deployment

**Production deploys via GitHub auto-deploy.** `git push origin main` triggers a Vercel build whose `buildCommand` is `npx tsx scripts/vercel-build.ts`. That script:
1. If `VERCEL_ENV === "production"`: runs `drizzle-kit migrate` against the production DB first.
2. Then runs `next build`. Migration failure fails the build, so "new code + unmigrated DB" is impossible.

**Don't use `vercel deploy --prod` directly.** `scripts/vercel-release.ts` wraps it with a git-clean guard that refuses dirty-tree deploys; `--allow-dirty` is emergency-only. Historically, CLI uploads of working trees have caused prod bugs whose commit SHA didn't match the actual code (see the 2026-04-20 Date-serialization incident).

Cron scheduling splits by criticality:
- **Supabase pg_cron** (every minute) → `/api/internal/tasks/tick`, `/api/internal/assets/transforms/process`; (every 5 min) → `/api/internal/gallery/thumbnail-backfill`. Configured in `scripts/deploy-supabase-cron.ts`.
- **Vercel Cron** (daily) → `/api/cron/scheduled`, `/api/cron/timeout`. Configured in `vercel.json`.

## Upload gateway (two-key model)

The upload gateway is a Cloudflare Worker hosted **outside this repo** (source under `workers/upload-gateway/` in the parent `自动带货短视频/` workspace).

- `UPLOAD_API_KEY` — admin, server-side only. Full access: list / upload / delete.
- `UPLOAD_CLIENT_KEY` — narrow, signed into `/api/assets/upload-token` and sent to the browser. The gateway's `authorize()` enforces that this key only permits `POST /upload`; list/delete return 403 even with valid auth.

If `UPLOAD_CLIENT_KEY` is unset the token route falls back to `UPLOAD_API_KEY` and prints a warn log every call — that's a visible regression, re-provision the narrow key.

## Tests

Tests use Node.js built-in `node:test` + `node:assert/strict`. No external test framework. Test files mirror the `src/lib/` structure under `tests/`.

## Key constraints

- Provider adapters must not leak into task domain or page layer — all vendor protocol details stay in `providers/`.
- Batch task submission must always go through the window throttle in `batch-queue.ts`; never submit a whole group at once from a route handler. Stagger is `index * 1s` — any change touches the 300s tick budget.
- Refund logic belongs only in reconciliation/timeout modules — not in download or expiry cleanup. Treat billing / refunds / task-state transitions as high risk.
- `runner.ts` is video-domain only; image-edit async jobs use a separate worker path.
- **Do not `git push` from the outer `/Users/yeadon_1/Desktop/MyProject/自动带货短视频/` workspace** — it shares this repo's GitHub remote, and a push from there will overwrite `main`. Touch workspace-level files from their own context only.
- `/api/health` is deliberately minimal (liveness only). Do not extend it to return env-var presence, connection-string hints, or error bodies — that was a past security finding.
- `postgres.js` + `Date` inside raw `sql\`\`` templates throws `ERR_INVALID_ARG_TYPE` in the Vercel runtime. Use `toISOString() + ::timestamptz` or drizzle operators (`lt(col, date)`) instead.
