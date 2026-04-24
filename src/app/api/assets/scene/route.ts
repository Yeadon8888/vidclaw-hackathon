import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userAssets, users, creditTxns, tasks } from "@/lib/db/schema";
import {
  generateProductSceneImage,
  type SceneStyle,
  type SceneRegion,
  type ScenePromptLanguage,
} from "@/lib/image-edit/scene-generation";
import { getActiveModelByCapability } from "@/lib/models/repository";
import { MODEL_CAPABILITIES } from "@/lib/models/capabilities";
import { uploadAsset } from "@/lib/storage/gateway";
import { resolveImageBuffer } from "@/lib/image-edit/payload";

export const maxDuration = 300;

const VALID_STYLES = new Set<SceneStyle>([
  "lifestyle",
  "model",
  "detail",
  "flatlay",
  "outdoor",
  "studio",
]);

const VALID_REGIONS = new Set<SceneRegion>([
  "auto",
  "western",
  "east_asian_non_cn",
  "southeast_asian",
  "malaysian",
  "mexican",
  "middle_east",
]);

const VALID_LANGUAGES = new Set<ScenePromptLanguage>(["zh", "en"]);

/**
 * POST /api/assets/scene — Generate scene images for a product
 * Body: { assetId: string, styles: SceneStyle[], customPrompt?: string }
 * Returns generated image URLs as SSE stream.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = (await req.json()) as {
    assetId: string;
    styles: SceneStyle[];
    customPrompt?: string;
    modelSlug?: string;
    region?: SceneRegion;
    language?: ScenePromptLanguage;
  };

  const { assetId, styles, customPrompt, modelSlug } = body;
  const region: SceneRegion = VALID_REGIONS.has(body.region as SceneRegion)
    ? (body.region as SceneRegion)
    : "auto";
  const language: ScenePromptLanguage = VALID_LANGUAGES.has(
    body.language as ScenePromptLanguage,
  )
    ? (body.language as ScenePromptLanguage)
    : "zh";

  if (!assetId) {
    return NextResponse.json({ error: "请选择一张产品图。" }, { status: 400 });
  }

  const validStyles = (styles ?? ["lifestyle"]).filter((s) =>
    VALID_STYLES.has(s),
  );
  if (validStyles.length === 0) {
    return NextResponse.json({ error: "请选择至少一种场景风格。" }, { status: 400 });
  }
  if (validStyles.length > 6) {
    return NextResponse.json({ error: "最多选择 6 种场景风格。" }, { status: 400 });
  }

  // Verify asset
  const [asset] = await db
    .select()
    .from(userAssets)
    .where(
      and(eq(userAssets.id, assetId), eq(userAssets.userId, user.id)),
    )
    .limit(1);

  if (!asset) {
    return NextResponse.json({ error: "产品图不存在。" }, { status: 404 });
  }

  // Get model & check credits (user-picked slug if provided, else default)
  const model = await getActiveModelByCapability({
    capability: MODEL_CAPABILITIES.imageEdit,
    slug: modelSlug?.trim() || null,
  });
  const totalCost = model.creditsPerGen * validStyles.length;

  if (user.credits < totalCost) {
    return NextResponse.json(
      {
        error: `积分不足。需要 ${totalCost} 积分（${validStyles.length} 张 × ${model.creditsPerGen} 积分），当前余额 ${user.credits}。`,
      },
      { status: 400 },
    );
  }

  // SSE stream — generate each scene image sequentially
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
        );
      }

      const generatedImages: { style: string; url: string; assetId: string }[] = [];
      const baseName =
        asset.filename?.replace(/\.[^.]+$/, "") ??
        `asset-${asset.id.slice(0, 8)}`;

      // Kick off all styles in parallel — each emits its own SSE events
      // independently. Sending from multiple concurrent tasks to the same
      // ReadableStream controller is safe because each enqueue is atomic.
      send({
        type: "progress",
        current: 0,
        total: validStyles.length,
        style: "",
        message: `并发生成 ${validStyles.length} 张图中...`,
      });

      async function processOne(style: SceneStyle, index: number) {
        try {
          const result = await generateProductSceneImage({
            assetUrl: asset.url,
            style,
            customPrompt,
            region,
            language,
            model,
          });

          // Re-host to our R2 with 45s cap; fall back to provider URL.
          let stored: { key: string; url: string; size?: number };
          try {
            const rendered = await Promise.race([
              resolveImageBuffer(result.imageUrl),
              new Promise<never>((_, rej) =>
                setTimeout(() => rej(new Error("rehost-timeout")), 45_000),
              ),
            ]);
            stored = await uploadAsset({
              userId: user.id,
              filename: `${baseName}-${style}.png`,
              data: rendered.buffer,
              contentType: rendered.mimeType || "image/png",
            });
          } catch (rehostErr) {
            console.warn(
              `[scene] re-host failed for ${style}, using provider URL:`,
              rehostErr,
            );
            stored = { key: "", url: result.imageUrl, size: 0 };
          }

          const created = await db.transaction(async (tx) => {
            const [assetRow] = await tx
              .insert(userAssets)
              .values({
                userId: user.id,
                type: "image",
                r2Key: stored.key,
                url: stored.url,
                filename: `${baseName}-${style}.png`,
                sizeBytes: stored.size,
              })
              .returning();

            const [deducted] = await tx
              .update(users)
              .set({ credits: sql`${users.credits} - ${model.creditsPerGen}` })
              .where(
                and(
                  eq(users.id, user.id),
                  sql`${users.credits} >= ${model.creditsPerGen}`,
                ),
              )
              .returning({ credits: users.credits });

            if (deducted) {
              await tx.insert(creditTxns).values({
                userId: user.id,
                type: "consume",
                amount: -model.creditsPerGen,
                reason: `商品组图-${style} (${model.slug})`,
                modelId: model.id,
                balanceAfter: deducted.credits,
              });
            }

            return assetRow;
          });

          generatedImages.push({
            style,
            url: stored.url,
            assetId: created.id,
          });

          send({
            type: "image",
            style,
            url: stored.url,
            assetId: created.id,
            index: index + 1,
          });
        } catch (e) {
          send({
            type: "error",
            style,
            message: `${style} 生成失败: ${e instanceof Error ? e.message.slice(0, 100) : "未知错误"}`,
          });
        }
      }

      await Promise.all(validStyles.map((style, i) => processOne(style, i)));

      // ── Save to tasks table for history ──
      let taskId: string | null = null;
      if (generatedImages.length > 0) {
        try {
          const totalCredited = generatedImages.length * model.creditsPerGen;
          const [task] = await db
            .insert(tasks)
            .values({
              userId: user.id,
              type: "scene_gen",
              status: "done",
              modelId: model.id,
              inputText: `商品组图 (${validStyles.join(", ")})`,
              resultUrls: generatedImages.map((img) => img.url),
              creditsCost: totalCredited,
              completedAt: new Date(),
              paramsJson: {
                orientation: "portrait" as const,
                duration: 8 as const,
                count: generatedImages.length,
                platform: "tiktok" as const,
                model: model.slug,
                sourceMode: "upload" as const,
                imageUrls: [asset.url],
              },
            })
            .returning({ id: tasks.id });
          taskId = task.id;
        } catch (e) {
          console.error("[scene] failed to save task:", e);
        }
      }

      send({
        type: "done",
        images: generatedImages,
        totalGenerated: generatedImages.length,
        taskId,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
