# Yeadon8888 short-video-gen 代码审查报告

## 执行摘要

本次审查以仓库 `Yeadon8888/short-video-gen` 当前 `main` 分支、仓库内源码、`README.md` 以及用户提供的 `REVIEW_CONTEXT.md` 为主要事实来源，重点核查了架构边界、代码质量、业务逻辑正确性与安全性四个维度。总体判断是：这个项目已经形成了比较清晰的业务分层，尤其是视频任务域、provider 适配层、图片编辑域、支付域的模块边界，比很多同类 Next.js 项目更有工程意识；但同时，**任务编排、支付异步事件、上传网关信任边界、密钥管理与数据库防线**上仍存在若干高风险缺口，其中有数项会直接影响用户资金、资产隔离或任务完成率。fileciteturn55file0 fileciteturn0file0

我认为当前最优先的风险有六类。其一，`/api/assets/upload-token` 把上传网关 `apiKey` 直接下发到浏览器，而仓库内同一个 key 同时被服务端用于列举、上传、删除对象，这会把“对象存储主密钥”暴露到用户端。其二，`/api/assets/register` 信任客户端上报的 `url`，而后续服务端又会据此发起下载，形成明显的 SSRF 和资源篡改风险。其三，`/api/health` 被中间件白名单公开放行，并回传数据库连接、Supabase 认证异常和 `DATABASE_URL` 前缀，存在不必要的信息泄露。其四，`scheduled.ts` 在恢复定时任务时把视频时长硬编码压缩为 `8 | 10 | 15`，会把仓库明确定义支持的 `4 | 5 | 6` 秒模型请求改坏。其五，`timeout.ts` 对“已有 task_items 但一直不终态”的标准任务只做查询，不做强制失败/退款，导致超时机制名义存在、实际失效。其六，Stripe 集成漏掉 `checkout.session.async_payment_succeeded`，对延迟支付方式会出现“用户已支付、积分不入账”的业务漏洞。fileciteturn42file0 fileciteturn24file0 fileciteturn41file0 fileciteturn56file0 fileciteturn35file0 fileciteturn49file0 fileciteturn58file0 fileciteturn29file0

此外，架构层面也有两个趋势性问题值得尽快治理。第一，任务维护入口已经出现“读接口驱动写路径”的隐藏耦合：`/api/tasks/refresh` 在用户刷新任务页时会直接执行 `runTaskMaintenance`，这会把浏览器流量变成任务调度流量。第二，`runner.ts` 把所有符合条件的 `task_group` 一次性并发推进，`groupProcessLimit` 只是**每组**限额而不是**全局**限额，再叠加 `batch-queue.ts` 的错峰实现与注释不一致，具备明显的放大流量与抢占运行预算的可能性。结合 `REVIEW_CONTEXT.md` 中对 `grok2api` 同步阻塞、`service.ts` 高频变更、`fulfillment.ts` 复杂度膨胀的描述，我建议把后续工作按“先补安全与资金完整性、再补编排与状态机结构”两波推进。fileciteturn26file0 fileciteturn63file0 fileciteturn18file0 fileciteturn21file0 fileciteturn20file0 fileciteturn0file0

## 审查范围与方法

本次审查优先学习了项目的自述文档与交接上下文，再进入代码主路径做自顶向下检查。`README.md` 给出了外部接口与核心链路，`REVIEW_CONTEXT.md` 给出了最近一个月的风险热点、任务域拆分方式与运维背景，这两份文档对于判断“设计初衷”和“当前真实痛点”都很重要。值得一提的是，`REVIEW_CONTEXT.md` 明确指出视频任务域被拆为 scheduled / batch / polling / timeout 四条流水线，并把 `grok2api` 视为现阶段性能瓶颈；这与代码中的当前实现是相互印证的。fileciteturn55file0 fileciteturn0file0

本报告的证据采集以以下文件为主。行号以当前 `main` HEAD 的 GitHub 内容为准；对于很长的文件，我在正文问题条目中给出了**最近函数块或关键语句附近**的行号，若后续提交发生漂移，应以函数名和语义块为准。

| 已检查文件 | 关注范围 | 审查目的 |
|---|---|---|
| `README.md` | 全文 | 建立系统边界、部署与接口全景 |
| `REVIEW_CONTEXT.md` | 第 15–90 行、第 149–281 行 | 校验任务域拆分、风险热点、技术债说明 |
| `src/app/api/generate/route.ts` | 全文 | 核查主链路、扣费、提交、SSE 返回 |
| `src/app/api/generate/batch/route.ts` | 全文 | 核查批量带货计费、任务组创建、after 触发 |
| `src/app/api/generate/status/route.ts` | 全文 | 核查状态轮询、标准模式与 slot 模式分叉 |
| `src/app/api/tasks/refresh/route.ts` | 全文 | 核查“刷新”接口是否含副作用 |
| `src/app/api/internal/tasks/tick/route.ts` | 全文 | 核查内部调度入口与鉴权 |
| `src/lib/tasks/runner.ts` | 全文 | 核查维护总控、并发策略、超时与轮询 |
| `src/lib/tasks/batch-processing.ts` | 全文 | 核查 batch 子任务创建、退款、并发控制 |
| `src/lib/tasks/batch-queue.ts` | 全文 | 核查错峰常量与节流实现 |
| `src/lib/tasks/fulfillment.ts` | 关键状态推进函数 | 核查 slot 状态机与目标补齐策略 |
| `src/lib/tasks/reconciliation.ts` | 全文 | 核查终态结算、退款与幂等防护 |
| `src/lib/tasks/timeout.ts` | 全文 | 核查超时逻辑与退款触发条件 |
| `src/lib/tasks/scheduled.ts` | 全文 | 核查定时任务恢复路径 |
| `src/lib/tasks/items.ts` | 全文 | 核查同步 provider 的 immediateResults 落库 |
| `src/lib/video/service.ts` | 全文 | 核查 provider 分发、默认参数归一化 |
| `src/lib/video/providers/grok2api.ts` | 全文 | 核查同步阻塞 provider 的行为与错误分类 |
| `src/lib/video/providers/plato.ts` | 全文 | 核查常规异步 provider 行为 |
| `src/lib/video/providers/shared.ts` | 全文 | 核查失败分类与重试语义 |
| `src/lib/video/types.ts` | 全文 | 核查时长、状态和请求结构的单一事实来源 |
| `src/lib/storage/gateway.ts` | 全文 | 核查上传网关能力边界和密钥用途 |
| `src/app/api/assets/upload-token/route.ts` | 全文 | 核查浏览器直传鉴权设计 |
| `src/app/api/assets/register/route.ts` | 全文 | 核查上传后登记与用户资产可信来源 |
| `src/lib/payments/orders.ts` | 全文 | 核查订单状态机、入账与 webhook 幂等 |
| `src/lib/payments/stripe.ts` | 全文 | 核查 Checkout Session 配置与签名校验 |
| `src/lib/payments/config.ts` | 全文 | 核查支付配置与密钥持久化 |
| `src/app/api/payments/stripe/webhook/route.ts` | 全文 | 核查 webhook 路由的错误语义 |
| `src/lib/db/schema.ts` | 全文 | 核查 secret/资金/任务表结构 |
| `drizzle/0000_green_starjammers.sql` 到 `0012_faulty_frightful_four.sql` | 关键建表与变更语句 | 核查 RLS / policy / 安全元数据是否存在 |
| `src/app/api/admin/models/route.ts` | 全文 | 核查模型 secret 是否透出 |
| `src/app/(dashboard)/admin/models/page.tsx` | 取数与编辑表单 | 核查 secret 是否进入浏览器 |
| `src/lib/auth.ts`、`src/lib/supabase/server.ts`、`src/lib/supabase/middleware.ts`、`src/middleware.ts` | 全文 | 核查鉴权、防护白名单与公开路由 |
| `src/app/api/health/route.ts` | 全文 | 核查诊断接口是否泄露内部信息 |

关于外部资料，本报告只补充了三类官方文档：Supabase RLS 与 API key 规则、Stripe Checkout 延迟支付事件、Vercel 函数时长限制。它们分别用于判断“RLS 是否完整”“漏掉哪些 Stripe 事件会导致业务错误”“仓库里对 300 秒预算的假设是否稳定”。Supabase 官方文档要求对公开 schema 的表启用 RLS，并明确指出 `service_role` / secret key 会绕过 RLS，绝不能暴露到浏览器；Stripe 官方文档明确要求 Checkout 既处理 `checkout.session.completed`，也处理 `checkout.session.async_payment_succeeded` 与 `checkout.session.async_payment_failed`；Vercel 官方文档说明函数最大时长依套餐与 Fluid Compute 配置而变化，因此仓库内“固定 300 秒”的假设只是一种**当前代码假设**，不是普遍真理。citeturn19search0turn21search0turn21search4turn20search0turn20search8turn19search1turn19search2

## 架构与状态机概览

从代码和交接文档看，项目的主干链路可以概括为：前端页面经 `POST /api/generate` 或 `POST /api/generate/batch` 发起生成，请求先做鉴权、余额检查和素材解析，然后调用 Gemini 生成脚本，再通过 `video/service.ts` 分发到具体 provider；生成结果通过标准轮询、任务页刷新或内部 tick 维护来推动终态结算。任务系统里同时存在“标准模式”和“slot 补齐模式”，后者又引入 `task_slots` 与 `task_items` 的二级状态机。这个设计是合理的，但它也带来了“同一任务域里存在多条状态推进路径”的复杂性。fileciteturn25file0 fileciteturn59file0 fileciteturn20file0 fileciteturn58file0 fileciteturn63file0 fileciteturn0file0

```mermaid
flowchart LR
    UI[生成页 / 批量页 / 任务页] --> G1[POST /api/generate]
    UI --> G2[POST /api/generate/batch]
    UI --> R1[GET /api/generate/status]
    UI --> R2[GET /api/tasks/refresh]

    G1 --> AUTH[requireAuth + users]
    G2 --> AUTH
    AUTH --> CREDIT[积分检查 / 扣费]
    CREDIT --> GEMINI[Gemini 脚本生成]
    GEMINI --> VSVC[video/service.ts]
    VSVC --> P1[plato]
    VSVC --> P2[yunwu]
    VSVC --> P3[dashscope]
    VSVC --> P4[grok2api]

    R2 --> RUNNER[runTaskMaintenance]
    TICK[/api/internal/tasks/tick] --> RUNNER
    CRON[/api/cron/scheduled / timeout] --> RUNNER

    RUNNER --> SCH[scheduled.ts]
    RUNNER --> BATCH[batch-processing.ts]
    RUNNER --> POLL[queryVideoTaskStatus]
    RUNNER --> TO[timeout.ts]

    POLL --> TASKS[(tasks)]
    BATCH --> TASKS
    SCH --> TASKS
    TO --> TASKS
```

视频任务状态机目前至少存在两层。一层是 `tasks.status`：`pending / analyzing / generating / polling / done / failed / scheduled`；另一层是 slot 模式下的 `task_slots.status`：`pending / submitted / success / failed`。代码和 `REVIEW_CONTEXT.md` 对此描述一致，但实际实现里又把“定时任务恢复”“标准任务轮询”“slot 补齐推进”“timeout 兜底”散落在不同文件中，所以**抽象边界是存在的，状态边界却没有真正集中**。这就是为什么 `runner.ts`、`timeout.ts`、`generate/status/route.ts` 都在做“查 provider → 更新 task_items → 看是否终态 → 处理余额/结果”的相似工作，隐藏耦合已经开始显性化。fileciteturn64file0 fileciteturn63file0 fileciteturn46file0 fileciteturn16file0 fileciteturn49file0 fileciteturn0file0

```mermaid
flowchart TD
    A[创建任务] --> B{scheduled?}
    B -- 是 --> C[status=scheduled]
    C --> D[/api/cron/scheduled]
    D --> E[createVideoTasksForModelId]
    E --> F[task_items 写入]

    B -- 否 --> G[扣费并创建 task]
    G --> H{fulfillment_mode}
    H -- standard --> I[createVideoTasks]
    H -- backfill_until_target --> J[initializeSlots + submitPendingSlots]

    I --> F
    J --> K[task_slots + task_items]

    F --> L[轮询 provider 状态]
    K --> L
    L --> M{全部终态?}
    M -- 否 --> N[继续轮询 / refill / timeout]
    M -- 是 --> O[finalizeTaskIfTerminal]
    O --> P[done 或 failed + refund]
```

在总体架构评价上，我的结论是：**分层意识是对的，执行入口和状态推进点太多**。`REVIEW_CONTEXT.md` 里把 `service.ts` 视为 God Object、把 `fulfillment.ts` 视为复杂度黑洞，这不是主观抱怨，而是代码现状的合理判断。`service.ts` 同时承担模型读取、默认参数归一化、provider 能力解析、provider 分发和 admin 表单兼容；`fulfillment.ts` 则在一个 500+ 行文件里同时做 slot 初始化、提交、失败分类、成功结算和过期处理。短期内它们还能工作，长期则会放大改动半径和回归风险。fileciteturn20file0 fileciteturn0file0

## 问题总览

从严重度与组件分布看，本次我建议优先处理六个 P1 问题和三个 P2 问题。P1 基本都落在“资金正确性、对象存储权限、信息泄露、任务正确完结”这些会立刻影响线上业务或安全边界的点上；P2 则主要是“隐藏耦合、结构性扩容障碍、防线不完整”。fileciteturn42file0 fileciteturn41file0 fileciteturn56file0 fileciteturn49file0 fileciteturn16file0 fileciteturn29file0

| 严重度 | 组件 | 主要问题 | 数量 |
|---|---|---|---|
| P1 | 资源上传与存储 | 浏览器拿到上传主密钥；客户端可伪造资产 URL | 2 |
| P1 | 运维与暴露面 | 公共健康检查泄露内部诊断信息 | 1 |
| P1 | 任务状态机 | scheduled 时长被改坏；timeout 机制对标准任务失效 | 2 |
| P1 | 支付计费 | Stripe 延迟支付成功事件未入账 | 1 |
| P1 | Secret 管理 | 模型/API/支付私钥被当普通配置存储与透传 | 1 |
| P2 | 任务编排 | refresh 路由触发写路径；runner 全局并发失控 | 1 |
| P2 | 节流实现 | 错峰实现与注释/预期不一致 | 1 |
| P2 | 数据库安全 | Supabase RLS / policy 检视结果不完整 | 1 |

如果按修复顺序排列，我会建议先做：上传网关密钥与 URL 信任边界、公共健康检查收口、scheduled 和 timeout 两个任务正确性 bug、Stripe webhook 补全。它们都属于“改动面不算大，但收益极高”的修复。第二批再做：secret 管理、refresh/runner 去耦、RLS 策略补齐与批量调度抽象化。这些更偏结构治理，适合单独发 PR。fileciteturn42file0 fileciteturn41file0 fileciteturn56file0 fileciteturn49file0 fileciteturn16file0 fileciteturn29file0

## 详细问题

**[FIXED 部分] 拆成两把 key：`UPLOAD_API_KEY` 供服务端 list/delete/upload 使用，`UPLOAD_CLIENT_KEY` 专供浏览器直传使用（需运维在网关侧新建只允许 `POST /upload` 的受限 key）。若未配置 `UPLOAD_CLIENT_KEY`，暂时回退到 `UPLOAD_API_KEY` 并每次打 warn 提醒。真正的彻底修法（网关签发签名 URL）需要改 Cloudflare Worker 侧代码，超出本仓库范围。**

**[严重度 P1] [src/app/api/assets/upload-token/route.ts:40] [问题] 浏览器直传接口把上传网关 `apiKey` 原样返回给客户端，导致上传主密钥暴露。**  
`POST /api/assets/upload-token` 在生成 `uploadUrl` 后，直接返回 `{ uploadUrl, apiKey, key }`。与此同时，服务端 `storage/gateway.ts` 也是用同一个 `config.apiKey` 调用 `/list`、`/upload`、`/files/:key` 删除等接口。这意味着只要浏览器拿到该 key，用户就不再只具备“上传自己的一个对象”的能力，而是可能具备网关支持的更大能力范围。由于网关实现仓库不在本项目内，真实权限边界是**未指明**的；但就本仓库的调用方式看，这个 key 至少不是一次性、不是 scope-limited、也不是只写 token。fileciteturn42file0 fileciteturn24file0

**[建议方案]**  
把“浏览器直传”改成“后端签发一次性 upload URL / policy”，浏览器只拿到短时、单 key、单方法、单内容类型受限的上传凭证，不拿到主密钥。如果现有上传网关不支持签名 URL，就应把上传流量改为**后端代理到网关**，或者改造网关增加 `POST /sign-upload` 能力。

**[修改示例]**
```ts
// src/app/api/assets/upload-token/route.ts
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const baseUrl = process.env.UPLOAD_API_URL?.trim().replace(/\/+$/, "") ?? "";
  const adminKey = process.env.UPLOAD_API_KEY?.trim() ?? "";
  const prefix = (process.env.UPLOAD_PREFIX?.trim() ?? "vidclaw-assets").replace(
    /^\/+|\/+$/g,
    "",
  );
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Upload gateway not configured" }, { status: 503 });
  }

  const { filename, contentType } = await req.json() as {
    filename?: string;
    contentType?: string;
  };

  const ext = getExtension(filename ?? "file.bin");
  const tag = contentType?.startsWith("video/") ? "vid" : "img";
  const key = `${prefix}/${user.id}/${tag}-${crypto.randomUUID()}.${ext}`;

  // 向网关申请一次性签名，而不是把 adminKey 发给浏览器
  const signRes = await fetch(`${baseUrl}/sign-upload`, {
    method: "POST",
    headers: {
      "x-upload-key": adminKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      contentType: contentType ?? "application/octet-stream",
      expiresInSeconds: 300,
      maxBytes: tag === "vid" ? 200 * 1024 * 1024 : 20 * 1024 * 1024,
    }),
  });

  if (!signRes.ok) {
    return NextResponse.json({ error: "签发上传链接失败" }, { status: 502 });
  }

  const signed = await signRes.json() as { uploadUrl: string; headers?: Record<string, string> };
  return NextResponse.json({
    uploadUrl: signed.uploadUrl,
    uploadHeaders: signed.headers ?? {},
    key,
  });
}
```

**[FIXED] 登记接口不再接收客户端 `url`，改为由服务端根据 `UPLOAD_API_URL + key` 派生可信 URL 写库。key 仍保持 `prefix/userId/` 前缀校验。**

**[严重度 P1] [src/app/api/assets/register/route.ts:42] [问题] 资产登记接口信任客户端上报的 `url`，后续服务端再据此下载，形成 SSRF 与资产篡改风险。**  
`/api/assets/register` 只校验 `key` 是否有 `${prefix}/${user.id}/` 前缀，然后把客户端传入的 `url` 原样写入 `user_assets.url`。而生成链路与图片预处理链路会在后续通过 `fetchAssetBuffer(url)` 去服务端抓取这些 URL。也就是说，一旦客户端在合法 key 的前提下上报一个伪造 URL，后续服务端就可能对任意可达地址发起请求；即便不构成内网 SSRF，也会让数据库中的“资产 URL”失去可信性。fileciteturn41file0 fileciteturn24file0 fileciteturn44file0 fileciteturn25file0

**[建议方案]**  
登记接口不应接受客户端提供的最终 URL。应由服务端根据 `key` 和可信的 `UPLOAD_API_URL` / 公网基址派生，或者向网关发一个 `HEAD /files/:key` / `GET /meta?key=...` 做确认后回写。最少也应校验 URL 主机名与 key 路径是否匹配。

**[修改示例]**
```ts
// src/app/api/assets/register/route.ts
function buildTrustedAssetUrl(baseUrl: string, key: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = await req.json() as {
    key?: string;
    size?: number;
    filename?: string;
    contentType?: string;
  };

  if (!body.key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const prefix = (process.env.UPLOAD_PREFIX?.trim() ?? "vidclaw-assets").replace(/^\/+|\/+$/g, "");
  const expectedPrefix = `${prefix}/${user.id}/`;
  if (!body.key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 403 });
  }

  const gatewayBase = process.env.UPLOAD_API_URL?.trim().replace(/\/+$/, "");
  if (!gatewayBase) {
    return NextResponse.json({ error: "Upload gateway not configured" }, { status: 503 });
  }

  const trustedUrl = buildTrustedAssetUrl(gatewayBase, body.key);
  const assetType = body.contentType?.startsWith("video/") ? "video" : "image";

  const [record] = await db.insert(userAssets).values({
    userId: user.id,
    type: assetType,
    r2Key: body.key,
    url: trustedUrl,
    filename: body.filename ?? null,
    sizeBytes: body.size ?? null,
  }).returning();

  return NextResponse.json(record);
}
```

**[FIXED] 收窄 /api/health 到最小 liveness：DB 连通 → `{ok:true}`，不连通 → 503 `{ok:false}`。不再返回任何环境变量存在性、错误细节、连接串前缀或认证异常。**

**[严重度 P1] [src/app/api/health/route.ts:12] [问题] 健康检查接口公开返回环境变量存在性、数据库错误细节与 `DATABASE_URL` 前缀，属于高价值运维信息泄露。**  
中间件把 `/api/health` 列为公开路由，而 `health` 路由会向任何访问者返回 `DATABASE_URL`/Supabase 关键环境变量是否存在、`supabase.auth.getUser()` 报错内容、数据库连接异常、异常 cause，甚至 `DATABASE_URL` 的前 40 个字符。对攻击者而言，这些字段足以用来探测部署状态、认证故障模式、数据库品牌/主机特征和配置缺口。健康检查的正确做法通常是“返回非常粗粒度的 liveness/readiness 信号”，而不是把内情展开给公网。fileciteturn56file0 fileciteturn35file0

**[建议方案]**  
把 `/api/health` 至少收口到 `requireAdmin()` 或内部 `CRON_SECRET`；若必须公开，只返回 `{ ok: true } / { ok: false }` 与静态版本号，绝不回传内部错误、前缀、依赖是否配置等细节。

**[修改示例]**
```ts
// src/app/api/health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    await db.execute(sql`select 1`);
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
```

**[FIXED] 用 `normalizeScheduledDuration()` + 运行时 `isVideoDuration()` 类型守卫替掉三选一硬编码，`4 | 5 | 6 | 8 | 10 | 15` 全部保持用户原选。**

**[严重度 P1] [src/lib/tasks/scheduled.ts:49] [问题] 定时任务恢复时把 `duration` 硬编码压缩为 `8 | 10 | 15`，会破坏仓库已支持的 `4 | 5 | 6` 秒模型。**  
`VideoDuration` 在类型定义里明确支持 `4 | 5 | 6 | 8 | 10 | 15`，但 `processDueScheduledTasks()` 在恢复定时任务时，把 `p.duration` 写成 `(8 ? 8 : 10 ? 10 : 15)`。这样一来，原本用户在创建任务时选择的 4 秒、5 秒、6 秒都会被错误改写，尤其会直接影响 `grok2api` 这类只允许 `6/10` 秒的 provider，导致行为不一致，严重时会出现“即时生成正常、定时生成异常”的用户可见 bug。fileciteturn58file0 fileciteturn49file0 fileciteturn21file0

**[建议方案]**  
把 `duration` 恢复逻辑改成显式的 `VideoDuration` 运行时校验函数，而不是局部三选一。理想情况下，scheduled 恢复应完全复用 `video/service.ts` 的参数归一化路径，避免出现“主路径支持、恢复路径不支持”的分叉。

**[修改示例]**
```ts
// src/lib/tasks/scheduled.ts
import type { VideoDuration } from "@/lib/video/types";

function isVideoDuration(value: unknown): value is VideoDuration {
  return value === 4 || value === 5 || value === 6 || value === 8 || value === 10 || value === 15;
}

function normalizeScheduledDuration(value: unknown): VideoDuration {
  if (!isVideoDuration(value)) return 10;
  return value;
}

const submitted = await createVideoTasksForModelId({
  modelId: claimedTask.modelId,
  request: {
    prompt: claimedTask.soraPrompt ?? "",
    imageUrls: p?.imageUrls ?? [],
    orientation: (p?.orientation as "portrait" | "landscape") ?? "portrait",
    duration: normalizeScheduledDuration(p?.duration),
    count: Math.max(1, Math.trunc(p?.count ?? 1)),
    model: p?.model ?? "",
  },
});
```

**[FIXED] 两处改动：(1) timeout 判定基准改为 `COALESCE(started_at, created_at)`，避免定时/延迟任务被 created_at 误判。(2) 重查 provider 后仍非终态的 items 一律标 FAILED（`terminalClass=timeout`、不可重试）再走 `finalizeTaskIfTerminal`，超时任务一定会被收口 + 退款。**

**[严重度 P1] [src/lib/tasks/timeout.ts:45] [问题] 标准任务一旦已经有 `task_items`，timeout 路径只会”查询一下”，不会真正把长期未完成任务判失败并退款，导致超时兜底名存实亡。**  
`processTimedOutTasks()` 对标准任务分两类处理：如果 `items.length === 0`，会直接 `failTaskAndRefund`；但如果已经有 `task_items`，逻辑只会查询 provider 状态、更新 item，然后调用 `finalizeTaskIfTerminal()`。如果 provider 一直不返回终态、或长期卡在非终态，这个函数**不会在 timeout 发生后给任务强制收口**，结果就是任务可以无限期停留在 `generating/polling`。此外，这个 timeout 入口对标准任务使用的是 `createdAt` 而不是 `startedAt`，会让“创建时间久但刚开始真正提交”的任务受到错误时间基准影响，尤其是定时/延迟恢复场景。fileciteturn16file0 fileciteturn63file0

**[建议方案]**  
timeout 逻辑应当明确区分“到时仍在运行但可继续保留”与“超时强制失败”。对于超过 SLA 的标准任务，如果经过一次 provider 重查后仍存在非终态项，应该把剩余未终态项统一标为超时失败，再对父任务执行 `failTaskAndRefund` 或 `finalizeTaskIfTerminal` 的“失败收敛”分支。时间基准也应优先取 `startedAt`，没有时再退回 `createdAt`。

**[修改示例]**
```ts
// src/lib/tasks/timeout.ts
function getTimeoutBase(task: { startedAt: Date | null; createdAt: Date }) {
  return task.startedAt ?? task.createdAt;
}

async function forceFailLingeringStandardTask(task: typeof tasks.$inferSelect) {
  const items = await db.select().from(taskItems).where(eq(taskItems.taskId, task.id));
  const pendingIds = items
    .filter((item) => item.status !== "SUCCESS" && item.status !== "FAILED")
    .map((item) => item.id);

  if (pendingIds.length > 0) {
    await db.update(taskItems).set({
      status: "FAILED",
      failReason: "超时自动终止",
      retryable: false,
      terminalClass: "timeout",
      completedAt: new Date(),
    }).where(inArray(taskItems.id, pendingIds));
  }

  await failTaskAndRefund({
    taskId: task.id,
    userId: task.userId,
    refundAmount: task.creditsCost,
    errorMessage: "任务超过超时窗口仍未完成，已自动退款",
    refundReason: "任务超时自动退款",
    allowedStatuses: ["analyzing", "generating", "polling"],
  });
}
```

**[FIXED] `HANDLED_STRIPE_EVENTS` 新增 `checkout.session.async_payment_succeeded`；抽出 `isStripeCheckoutSuccess()`，把"completed+paid"和"async_payment_succeeded"两条路径收敛为同一个入账判定，原同步只看 `payment_status==='paid'` 的逻辑被替换。**

**[严重度 P1] [src/lib/payments/orders.ts:270] [问题] Stripe webhook 只处理 `checkout.session.completed / async_payment_failed / expired`，漏掉 `checkout.session.async_payment_succeeded`，延迟支付方式会出现支付成功但积分不入账。**  
仓库里的 `HANDLED_STRIPE_EVENTS` 没有包含 `checkout.session.async_payment_succeeded`，而业务代码的成功路径又只在 `checkout.session.completed` 且 `payment_status === "paid"` 时给积分。Stripe 官方文档明确要求 Checkout 同时处理 `checkout.session.completed` 与 `checkout.session.async_payment_succeeded`，因为 ACH 等延迟支付方式在完成 Checkout 后，真正付款成功是后续异步事件。也就是说，对于延迟支付方法，当前实现可能会把订单永久留在 `pending`，用户已付款但积分不到账。fileciteturn29file0 fileciteturn30file0 citeturn20search0turn20search8turn20search9

**[建议方案]**  
把 `checkout.session.async_payment_succeeded` 纳入可处理事件，并把“支付成功入账”逻辑抽成一个共享函数，由 `completed` 和 `async_payment_succeeded` 共用。成功判定不要只依赖 `payment_status === "paid"` 的同步时机。

**[修改示例]**
```ts
// src/lib/payments/orders.ts
const HANDLED_STRIPE_EVENTS = new Set<string>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

function isStripeCheckoutSuccess(event: Stripe.Event, session: Stripe.Checkout.Session) {
  return (
    event.type === "checkout.session.async_payment_succeeded" ||
    (event.type === "checkout.session.completed" && session.payment_status === "paid")
  );
}

export async function markStripeOrderPaid(event: Stripe.Event): Promise<boolean> {
  // ... 事件去重保持不变

  const session = event.data.object as Stripe.Checkout.Session;

  if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
    // ... 失败 / 过期分支保持不变
  }

  if (!isStripeCheckoutSuccess(event, session)) {
    await markEventProcessed(event.id);
    return false;
  }

  // ... 后续 paid 入账逻辑复用
}
```

**[严重度 P2] [src/app/api/tasks/refresh/route.ts:17] [问题] “刷新任务列表”接口直接执行 `runTaskMaintenance()`，把读接口变成了带重副作用的编排入口，形成隐藏数据流耦合。**  
从名字看，`GET /api/tasks/refresh` 像一个读接口；但实现上它会执行 scheduled 推进、batch 提交、active task polling、timeout 处理，然后再返回任务列表。架构上，这相当于把“用户打开任务页/手动刷新”的动作变成了“调度器的一部分”。它的后果不是简单的性能差，而是**系统行为随页面访问频率变化**：同一用户多开页面、多次刷新、前端重试，都可能额外触发维护写路径。`REVIEW_CONTEXT.md` 把 tick 视为分钟级维护入口，但当前 refresh 路由实际上已经成了第二个入口。fileciteturn26file0 fileciteturn63file0 fileciteturn0file0

**[建议方案]**  
让 `/api/tasks/refresh` 只做“读取 + 必要的轻量状态聚合”，不要再承担调度职责；把维护逻辑收束到 `/api/internal/tasks/tick`、cron 或独立 worker。若确实需要“用户触发一次补偿轮询”，那也应单独提供一个写接口，并加入幂等键、节流及最小冷却时间。

**[修改示例]**
```ts
// src/app/api/tasks/refresh/route.ts
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  // 只读，不再触发 runTaskMaintenance()
  const userTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), isNull(tasks.taskGroupId)))
    .orderBy(desc(tasks.createdAt))
    .limit(50);

  const userTaskGroups = await db
    .select()
    .from(taskGroups)
    .where(eq(taskGroups.userId, user.id))
    .orderBy(desc(taskGroups.createdAt))
    .limit(30);

  return NextResponse.json({ tasks: userTasks, taskGroups: userTaskGroups });
}
```

**[严重度 P2] [src/lib/tasks/runner.ts:49] [问题] `runner.ts` 对所有 eligible group 一次性并发推进，而 `groupProcessLimit` 只是每组 limit；再叠加 `batch-queue.ts` 的错峰实现与注释不一致，容易在高并发下放大 provider / Gemini / DB 负载。**  
`runner.ts` 先取最多 30 个 `task_groups`，然后用 `Promise.allSettled` 把所有 eligible group 一次性丢给 `processPendingBatchTasks()`；这里的 `groupLimit` 仅限制“每个 group 本次最多推进多少子任务”，并不限制“本次 tick 总共推进多少 group”。因此最坏情况下，本次 tick 会形成“30 个 group × 每组 3 个子任务”的并发放大。更糟的是，批量错峰函数 `delayStaggeredSubmission(index)` 的注释写的是“按 `index * STAGGER_MS` 错开”，实现却只对 `index > 0` 固定等待 1 秒；在并发 map 场景下，第二个、第三个、第四个任务会在几乎同一时间窗口内同时启动。`REVIEW_CONTEXT.md` 已把 300 秒预算、grok2api 同步阻塞和 batch-queue 常量列为高敏感区，这个问题与那份上下文完全一致。fileciteturn63file0 fileciteturn18file0 fileciteturn0file0 citeturn19search1turn19search2

**[建议方案]**  
增加**全局并发阈值**而不是只做 per-group 阈值；runner 中对 group 推进使用 `p-limit` 或批次化 chunk；把 `BATCH_SUBMISSION_STAGGER_MS` 的语义改准确，确保实现和注释一致。若未来仍走 scan-based tick，至少要把 provider 类型与耗时模型引入调度层，而不是只在 adapter 层藏细节。

**[修改示例]**
```ts
// src/lib/tasks/batch-queue.ts
export async function delayStaggeredSubmission(index: number) {
  if (index <= 0) return;
  await new Promise((resolve) =>
    setTimeout(resolve, index * BATCH_SUBMISSION_STAGGER_MS),
  );
}

// src/lib/tasks/runner.ts
async function processGroupsWithGlobalCap(groupIds: string[], perGroupLimit: number) {
  const GLOBAL_GROUP_CONCURRENCY = 4;
  const queue = [...groupIds];
  const workers = Array.from({ length: GLOBAL_GROUP_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const groupId = queue.shift();
      if (!groupId) return;
      await processPendingBatchTasks({ taskGroupId: groupId, limit: perGroupLimit });
    }
  });
  await Promise.allSettled(workers);
}
```

**[FIXED 部分] admin models 三处（GET / POST / PATCH）的响应里 `apiKey` 字段一律改为脱敏串 `head••••tail` 并补 `apiKeyConfigured: boolean`。PATCH 收到脱敏占位串时视为无变化，不覆盖数据库真实值；空串 → 清除；真实新串 → 覆盖。数据库列**仍是明文存储**（没加 secret manager / 应用层加密），这部分属于基础设施级改动，本次不动。支付私钥落库那段也未动，同样需要单独 spec。**

**[严重度 P1] [src/app/api/admin/models/route.ts:19] [问题] provider API key 与支付私钥被当作普通配置处理：明文存库、管理端 GET 透出、客户端表单持有，secret 管理边界过宽。**  
模型管理接口的 `GET /api/admin/models` 直接返回整行 `models` 记录，其中包含 `apiKey`；admin 页面又是 `use client` 组件，会把这些原始密钥取回浏览器并写入本地状态，编辑时也会把旧值放回 form。与此同时，`schema.ts` 将 `models.apiKey` 定义为普通 `text` 字段，支付配置里 `saveAlipayConfig()` 也会把 `privateKey` 与 `alipayPublicKey` 一起放进 `system_config.value`。这并不意味着“未授权用户可直接读到 secret”，但从安全工程角度看，secret 生命周期已经被扩展到了浏览器、前端内存、抓包日志和数据库明文快照，风险面显著偏大。Supabase 官方文档对高权限 key 的要求非常明确：此类 key 只能留在受控后端，不能暴露到浏览器。fileciteturn32file0 fileciteturn33file0 fileciteturn64file0 fileciteturn31file0 citeturn21search0turn21search5turn21search7

**[建议方案]**  
将 provider 与支付私钥迁移到专门的 secret manager 或平台环境变量；数据库里最多只存“secret 引用名 / 是否已配置 / 掩码后预览”。管理端 GET 接口不应返回原始 secret，前端只允许“覆盖写入”，不允许“读回旧值”。如果暂时必须落库，至少要做应用层加密，并把解密权限限制在最少的后端路径中。

**[修改示例]**
```ts
// src/app/api/admin/models/route.ts
export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const rows = await db
    .select({
      id: models.id,
      name: models.name,
      slug: models.slug,
      provider: models.provider,
      capability: models.capability,
      creditsPerGen: models.creditsPerGen,
      isActive: models.isActive,
      baseUrl: models.baseUrl,
      sortOrder: models.sortOrder,
      defaultParams: models.defaultParams,
      apiKeyConfigured: sql<boolean>`(${models.apiKey} is not null and ${models.apiKey} <> '')`,
    })
    .from(models)
    .orderBy(asc(models.sortOrder));

  return NextResponse.json({ models: rows });
}

// PATCH/POST 只接受新 secret，不再把旧 secret 回显到前端
```

**[严重度 P2] [drizzle/0000_green_starjammers.sql:1] [问题] 已检查 migration 中未见 `ENABLE ROW LEVEL SECURITY` 与 `CREATE POLICY`，Supabase RLS 完整性不足，当前数据隔离主要依赖应用代码而非数据库防线。**  
从 `drizzle/0000` 到 `0012`，我检查到的是建表、类型与字段变更，但没有看到任何 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 或 `CREATE POLICY` 语句。与此同时，业务代码大多通过 `DATABASE_URL` 上的 Drizzle 直接读写数据库，而不是通过受 RLS 限制的前端查询路径。若当前部署从不把这些表暴露给 `anon/authenticated` API 角色，则这个问题主要表现为“缺少 defense in depth”；但一旦未来引入更多 Supabase 直连查询、外部工具、边缘函数或误暴露 API，数据库层将缺少最后一道按用户隔离的安全网。Supabase 官方文档建议对暴露 schema 的表启用 RLS，并说明 service/secret key 会绕过 RLS，不能把它当作“以后补也没关系”的装饰项。fileciteturn38file0 fileciteturn39file0 fileciteturn36file0 citeturn19search0turn21search0turn21search4turn21search10

**[建议方案]**  
明确区分“永不暴露给前台的内部表”和“未来可能被前台/工具访问的业务表”。对 `users / tasks / task_items / user_assets / credit_txns / payment_orders` 这类多租户表，至少补齐 `ENABLE RLS` 与基于 `auth.uid()` 的 owner policy；对纯内部表也应显式写注释说明“不依赖 RLS，只允许后端角色使用”，避免后续误用。

**[修改示例]**
```sql
-- 以 user_assets 为例
alter table public.user_assets enable row level security;

create policy "user_assets_select_own"
on public.user_assets
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "user_assets_insert_own"
on public.user_assets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "user_assets_delete_own"
on public.user_assets
for delete
to authenticated
using ((select auth.uid()) = user_id);
```

## 补充观察与假设

除上述明确问题外，还有几项“不是立即爆炸，但已出现明显漂移信号”的观察。第一，`video/service.ts` 已经呈现出典型的 God Object 形态；`REVIEW_CONTEXT.md` 把它列为过去 30 天改动最频繁文件，而源码也证明确实把模型查找、默认参数归一化、provider 能力解析、provider 路由和 admin 表单兼容揉在了一起。第二，`README.md` 声称“目前没有自动化测试套件”，但仓库里已经有 `vitest`、`tests/` 目录及部分测试文件，这说明文档与实现存在轻微漂移。第三，`REVIEW_CONTEXT.md` 对 `createServiceClient` 的描述，与我在当前主路径里看到的“`createServerClient + Drizzle` 为主”的实现也并不完全一致，这提示交接文档和代码之间已经出现版本偏差。fileciteturn20file0 fileciteturn8file0 fileciteturn17view0 fileciteturn65file0 fileciteturn12file0 fileciteturn0file0

关于部署与运行假设，我明确记录以下未指明项。其一，上传网关的真实权限模型不在本仓库内，因此“上传主密钥暴露”的最终影响范围，取决于网关是否支持 scoped token；本报告按**仓库内调用方式**将其视作高风险。其二，Vercel 套餐与是否启用 Fluid Compute 在仓库内没有被明确声明，因此代码与交接文档中的“300 秒硬上限”应视为**当前假设**而非平台恒定事实上限。其三，Supabase 暴露 schema 的真实配置未在仓库内看到，因此 RLS 缺失当前更像“防线不完整”而不是“已被公开绕过”；但这并不会降低其治理优先级。fileciteturn42file0 fileciteturn24file0 fileciteturn25file0 fileciteturn50file0 citeturn19search1turn19search2turn19search0turn21search0

综合来看，这个仓库最值得肯定的地方是：它已经不是“脚本堆砌式”的 AI Web 项目，而是具备清晰任务域、provider 适配层和支付域的工程化原型；最需要尽快修的地方则是：**安全边界与状态机闭环仍有多处口子**。如果只能选一周内必须完成的动作，我会优先要求合并以下修复：关闭 `/api/health` 泄露、下线浏览器拿主密钥的直传设计、修复 scheduled duration、补上 timeout 强制收口、补齐 Stripe 异步成功事件。这五项完成后，项目的安全性和业务正确性会立即抬一个台阶。fileciteturn56file0 fileciteturn42file0 fileciteturn49file0 fileciteturn16file0 fileciteturn29file0