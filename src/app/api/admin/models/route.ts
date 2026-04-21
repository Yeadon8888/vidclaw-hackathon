import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { models } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { normalizeModelDefaultParams } from "@/lib/video/service";
import {
  isModelCapability,
  MODEL_CAPABILITIES,
} from "@/lib/models/capabilities";

/**
 * GET /api/admin/models
 *
 * 列出所有模型。**绝不把 apiKey 原文返回给浏览器**——返回一个脱敏版本
 * （头尾各 4 位，中间打码），再额外返回 `apiKeyConfigured` 布尔方便前端
 * 判断"已配"状态。
 *
 * 脱敏规则和 PATCH 的占位识别（见 below）配合使用：前端显示 maskedKey，
 * 如果用户不改动，PATCH 原样回传，后端识别后不更新 apiKey 列。
 */
const API_KEY_MASK_HEAD = 4;
const API_KEY_MASK_TAIL = 4;
const API_KEY_MASK_MIDDLE = "••••";

function maskApiKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= API_KEY_MASK_HEAD + API_KEY_MASK_TAIL) {
    return API_KEY_MASK_MIDDLE;
  }
  const head = trimmed.slice(0, API_KEY_MASK_HEAD);
  const tail = trimmed.slice(-API_KEY_MASK_TAIL);
  return `${head}${API_KEY_MASK_MIDDLE}${tail}`;
}

/** 判断 PATCH 请求里传回的 apiKey 是否只是我们吐出去的脱敏串。 */
function isMaskedApiKey(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.includes(API_KEY_MASK_MIDDLE);
}

/** GET /api/admin/models — list all video models (admin only) */
export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const rows = await db
    .select()
    .from(models)
    .orderBy(asc(models.sortOrder));

  const sanitized = rows.map((row) => ({
    ...row,
    apiKey: maskApiKey(row.apiKey),
    apiKeyConfigured: Boolean(row.apiKey && row.apiKey.trim()),
  }));

  return NextResponse.json({ models: sanitized });
}

/** POST /api/admin/models — create a new model (admin only) */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    name: string;
    slug: string;
    provider: string;
    capability?: string;
    creditsPerGen?: number;
    isActive?: boolean;
    apiKey?: string;
    baseUrl?: string;
    defaultParams?: Record<string, unknown>;
    sortOrder?: number;
  };

  if (!body.name || !body.slug || !body.provider) {
    return NextResponse.json(
      { error: "name, slug, and provider are required" },
      { status: 400 },
    );
  }

  if (body.capability !== undefined && !isModelCapability(body.capability)) {
    return NextResponse.json({ error: "capability 无效" }, { status: 400 });
  }

  const [created] = await db
    .insert(models)
    .values({
      name: body.name,
      slug: body.slug,
      provider: body.provider,
      capability: body.capability ?? MODEL_CAPABILITIES.videoGeneration,
      creditsPerGen: body.creditsPerGen ?? 10,
      isActive: body.isActive ?? true,
      apiKey: body.apiKey || null,
      baseUrl: body.baseUrl || null,
      defaultParams: normalizeModelDefaultParams(body.defaultParams),
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return NextResponse.json(
    {
      ...created,
      apiKey: maskApiKey(created.apiKey),
      apiKeyConfigured: Boolean(created.apiKey && created.apiKey.trim()),
    },
    { status: 201 },
  );
}

/** PATCH /api/admin/models — update a model (admin only) */
export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    id: string;
    name?: string;
    slug?: string;
    provider?: string;
    capability?: string;
    creditsPerGen?: number;
    isActive?: boolean;
    apiKey?: string | null;
    baseUrl?: string | null;
    defaultParams?: Record<string, unknown>;
    sortOrder?: number;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (body.capability !== undefined && !isModelCapability(body.capability)) {
    return NextResponse.json({ error: "capability 无效" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.provider !== undefined) updates.provider = body.provider;
  if (body.capability !== undefined) updates.capability = body.capability;
  if (body.creditsPerGen !== undefined) updates.creditsPerGen = body.creditsPerGen;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.apiKey !== undefined) {
    // 若前端回传的是我们吐出去的脱敏串（说明用户没改），视为无变化，
    // 不要拿脱敏串覆盖数据库里真实的 key。只有空字符串 → 清除，真实新 key
    // → 覆盖。
    if (isMaskedApiKey(body.apiKey)) {
      // no-op
    } else if (body.apiKey === "" || body.apiKey === null) {
      updates.apiKey = null;
    } else {
      updates.apiKey = body.apiKey;
    }
  }
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl || null;
  if (body.defaultParams !== undefined) {
    updates.defaultParams = normalizeModelDefaultParams(body.defaultParams);
  }
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const [updated] = await db
    .update(models)
    .set(updates)
    .where(eq(models.id, body.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...updated,
    apiKey: maskApiKey(updated.apiKey),
    apiKeyConfigured: Boolean(updated.apiKey && updated.apiKey.trim()),
  });
}

/** DELETE /api/admin/models — delete a model (admin only) */
export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = (await req.json()) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(models)
    .where(eq(models.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
