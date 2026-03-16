# VidClaw v2

AI 驱动的短视频自动生成平台，支持抖音/TikTok 二创与主题生产。

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19, Server Components)
- **Auth**: Supabase Auth (email/password, cookie-based SSR sessions)
- **Database**: Supabase PostgreSQL + Drizzle ORM
- **State**: Zustand 5
- **Styling**: Tailwind CSS v4 + shadcn/ui + custom design system (STYLE DNA)
- **APIs**: Gemini (script), Sora/VEO (video), TikHub (download), R2 (storage)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.local.example .env.local
# Edit .env.local with your actual keys

# 3. Run database migration
npm run db:push    # Push schema directly (dev)
# or
npm run db:migrate # Apply migration files (production)

# 4. Seed default models
npm run db:seed

# 5. Start dev server
npm run dev
```

## Database Commands

| Command | Description |
|---|---|
| `npm run db:generate` | Generate SQL migration files from schema |
| `npm run db:migrate` | Apply migration files to database |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Open Drizzle Studio GUI |
| `npm run db:seed` | Seed default video models |

## Environment Variables

See [.env.local.example](.env.local.example) for all required variables.

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set Root Directory to `vidclaw-v2`
4. Add all environment variables from `.env.local.example`
5. Deploy — migration runs automatically via `db:push` or manually via `db:migrate`

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
