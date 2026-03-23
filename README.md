# VidClaw v2

VidClaw v2 是一个基于 Next.js 16 的短视频生成 Web 应用，支持三种输入方式：

- 主题生成：输入一个主题，调用 Gemini 生成脚本与文案，再提交给视频模型生成视频
- 链接二创：输入抖音或 TikTok 链接，经 TikHub 解析下载原视频，再进入 Gemini 分析
- 本地视频二创：先上传本地视频到上传网关，再进入 Gemini 分析和后续生成

## 仓库边界

这个仓库的真实形态是一个 Web 应用，不是单文件 Python skill。

- 父目录里历史上存在一个 Python 版 skill，用于命令行调用 Gemini + Sora/VEO
- 当前仓库是在那套能力基础上重构出的 Web 应用
- 因此，父目录旧 skill 只能作为历史背景，不能作为当前仓库的实现说明或运行说明
- 当前仓库的事实来源应以 `src/`、`scripts/`、`drizzle/` 和本 README 为准

## Tech Stack

- Framework: Next.js 16 App Router + React 19
- Auth: Supabase Auth
- Database: Supabase PostgreSQL + Drizzle ORM
- State: Zustand
- UI: Tailwind CSS v4 + shadcn/ui
- AI Script: Gemini (`gemini-3.1-pro-preview`)
- Video Provider: BLTCY / Plato compatible API
- Source Video Parsing: TikHub
- Asset Storage: Cloudflare upload gateway + R2 style object storage
- Deploy: Vercel

## 核心能力

- 用户注册、登录、鉴权
- 主题生成、链接二创、本地视频二创
- 参考图上传与管理
- 可配置的视频模型与积分消耗
- 自定义 Prompt 模板保存与加载
- 任务列表、轮询刷新、失败退款
- 定时托管生成和超时清理
- 管理后台：模型、任务、积分、公告

## 核心架构

### 前端入口

- 主页与营销页：`src/app/page.tsx`
- 主工作台：`src/app/(dashboard)/layout.tsx`
- 生成页：`src/app/(dashboard)/generate/page.tsx`
- 任务页：`src/app/(dashboard)/tasks/page.tsx`
- 资源页：`src/app/(dashboard)/assets/page.tsx`
- 设置页：`src/app/(dashboard)/settings/page.tsx`
- 管理后台：`src/app/(dashboard)/admin/*`

### 服务端能力

- 生成主入口：`src/app/api/generate/route.ts`
- 生成状态轮询：`src/app/api/generate/status/route.ts`
- 任务刷新：`src/app/api/tasks/refresh/route.ts`
- 模型列表：`src/app/api/generate/models/route.ts`
- 资源上传令牌：`src/app/api/assets/upload-token/route.ts`
- 资源登记：`src/app/api/assets/register/route.ts`
- Prompt 保存与读取：`src/app/api/prompts/route.ts`
- 健康检查：`src/app/api/health/route.ts`
- 定时任务：`src/app/api/cron/scheduled/route.ts`
- 超时清理：`src/app/api/cron/timeout/route.ts`

### 领域模块

- 鉴权：`src/lib/auth.ts`
- 限流：`src/lib/rate-limit.ts`
- 数据库：`src/lib/db/index.ts`, `src/lib/db/schema.ts`
- Gemini：`src/lib/gemini.ts`
- 视频平台对接：`src/lib/video/plato.ts`
- TikHub：`src/lib/tikhub.ts`
- 上传网关：`src/lib/storage/gateway.ts`
- Supabase SSR：`src/lib/supabase/*`

## 生成链路

### 1. 用户发起生成

生成页 `src/app/(dashboard)/generate/page.tsx` 根据用户输入判断类型：

- 包含抖音或 TikTok 链接时，走 `url` 模式
- 上传本地视频后，走 `video_key` 模式
- 其他文本输入默认走 `theme` 模式

前端向 `POST /api/generate` 发起请求，并通过 SSE 接收日志、阶段更新、脚本结果和任务信息。

### 2. 服务端预检查

`src/app/api/generate/route.ts` 依次执行：

- IP 级限流
- 用户鉴权
- 根据所选模型计算积分消耗
- 检查余额是否足够
- 从数据库读取当前用户最近上传的参考图

当前实现中，生成前至少需要 1 张参考图，否则会直接报错。

### 3. 解析输入素材

- `url` 模式：通过 `src/lib/tikhub.ts` 提取并下载源视频
- `video_key` 模式：通过 `src/lib/storage/gateway.ts` 拉取用户已上传视频
- `theme` 模式：不需要视频素材

### 4. Gemini 生成脚本与文案

`src/lib/gemini.ts` 负责：

- 基于视频或主题生成结构化脚本 JSON
- 输出镜头列表、完整英文视频提示词和文案字段
- 针对 TikTok 平台切换英文文案要求
- 支持用户在设置页定义 Prompt 模板

### 5. 提交视频任务

`src/lib/video/plato.ts` 向视频供应商提交生成任务：

- 默认请求地址来自 `VIDEO_BASE_URL`，缺省时回退到 `https://api.bltcy.ai`
- 模型优先级是请求参数，其次环境变量 `VIDEO_MODEL`
- 单次最多可提交多个子任务

### 6. 轮询、落库与退款

状态更新涉及三条路径：

- 生成页实时轮询：`src/app/api/generate/status/route.ts`
- 任务页补偿轮询：`src/app/api/tasks/refresh/route.ts`
- 定时清理：`src/app/api/cron/timeout/route.ts`

相关信息会持久化到：

- `tasks`
- `task_items`
- `credit_txns`
- `user_assets`

## 数据模型

数据库结构定义在 `src/lib/db/schema.ts`，核心表包括：

- `users`
- `models`
- `tasks`
- `task_items`
- `credit_txns`
- `user_assets`
- `system_config`
- `announcements`

迁移文件位于 `drizzle/`，默认模型种子脚本位于 `scripts/seed.ts`。

## 环境变量

复制示例文件：

```bash
cp .env.local.example .env.local
```

关键变量分组如下。

### Supabase

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Database

```bash
DATABASE_URL=
```

### Gemini

```bash
GEMINI_API_KEY=
GEMINI_BASE_URL=https://yunwu.ai
```

代码也兼容以下回退变量：

```bash
YUNWU_GEMINI_API_KEY=
YUNWU_API_KEY=
```

### Video Provider

```bash
VIDEO_API_KEY=
VIDEO_BASE_URL=https://api.bltcy.ai
VIDEO_MODEL=
VIDEO_HD=
```

### TikHub

```bash
TIKHUB_API_KEY=
```

### Upload Gateway

```bash
UPLOAD_API_URL=
UPLOAD_API_KEY=
UPLOAD_PREFIX=vidclaw-assets
```

### Cron

```bash
CRON_SECRET=
```

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.local.example .env.local
```

至少需要先补齐：

- Supabase
- `DATABASE_URL`
- `GEMINI_API_KEY` 或其回退变量
- `VIDEO_API_KEY`

如果需要链接解析、上传资源、定时任务，还需要补齐：

- `TIKHUB_API_KEY`
- `UPLOAD_API_URL`
- `UPLOAD_API_KEY`
- `CRON_SECRET`

### 3. 初始化数据库

开发环境通常使用：

```bash
npm run db:push
npm run db:seed
```

如果你希望按迁移文件推进：

```bash
npm run db:migrate
```

### 4. 启动开发服务器

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:seed
```

## 部署与定时任务

Vercel 配置位于 `vercel.json`。

- `src/app/api/generate/route.ts` 允许较长执行时间
- `src/app/api/cron/scheduled/route.ts` 用于触发定时托管任务
- `src/app/api/cron/timeout/route.ts` 用于处理超时任务

当前 cron 配置：

- 每天 UTC 18:00 触发 `/api/cron/scheduled`
- 每天 UTC 00:00 触发 `/api/cron/timeout`

这些接口要求请求头中的 `Authorization: Bearer <CRON_SECRET>`。

## 重要约束与已知事实

- 当前仓库不是 Python skill，旧 skill 的运行命令不适用于这里
- 生成流程当前强依赖至少 1 张参考图
- 上传网关对正常 Web 使用基本是必需的，尤其是本地视频二创和资源管理
- 链接二创依赖 TikHub，没有 `TIKHUB_API_KEY` 时无法解析抖音或 TikTok 链接
- 自动退款与任务状态更新逻辑分散在多个 API 路径中，修改计费逻辑时需要整体审视
- `scripts/seed.ts` 默认写入的模型是 `veo3.1-fast`、`veo3.1-components`、`veo3.1-pro-4k`、`sora`
- `src/lib/video/plato.ts` 的环境变量回退默认模型是 `sora-2`，这和种子数据并不完全一致，修改前应确认预期行为

## 验证方式

这个仓库目前没有自动化测试套件。改动后建议至少执行：

```bash
npm run lint
npm run build
```

如果你在排查环境问题，还可以访问：

```text
/api/health
```

它会返回数据库、Supabase 和关键环境变量的诊断信息。

## 推荐阅读顺序

如果你第一次接手这个仓库，建议按这个顺序读：

1. `README.md`
2. `AGENTS.md`
3. `src/app/(dashboard)/generate/page.tsx`
4. `src/app/api/generate/route.ts`
5. `src/lib/gemini.ts`
6. `src/lib/video/plato.ts`
7. `src/lib/db/schema.ts`
