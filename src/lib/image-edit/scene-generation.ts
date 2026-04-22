/**
 * Product scene image generation.
 *
 * Reuses the shared `bltcyImageRequest` from bltcy.ts — same API,
 * same retry logic, same response parsing. Only the prompts differ.
 */

import { MODEL_CAPABILITIES } from "@/lib/models/capabilities";
import { getActiveModelByCapability } from "@/lib/models/repository";
import type { Model } from "@/lib/db/schema";
import { bltcyImageRequest } from "@/lib/image-edit/bltcy";
import {
  isOpenAiImagesEditModel,
  yunwuImagesEditRequest,
} from "@/lib/image-edit/yunwu-gpt-image";

export type SceneStyle =
  | "lifestyle"
  | "model"
  | "detail"
  | "flatlay"
  | "outdoor"
  | "studio";

const SCENE_PROMPTS: Record<SceneStyle, string> = {
  lifestyle:
    "请基于这张商品图生成一张生活场景展示图。要求：1. 将商品自然地融入日常使用场景中；2. 背景要有生活氛围感（如桌面、客厅、厨房等）；3. 光影自然柔和；4. 保留商品的所有细节、颜色和品牌标识；5. 构图美观，适合电商详情页展示。",
  model:
    "请基于这张商品图生成一张模特使用/展示图。要求：1. 添加一位合适的模特在自然场景中使用或展示该商品；2. 模特姿态自然得体；3. 画面有高端广告感；4. 完整保留商品的材质、颜色和品牌信息；5. 适合社交媒体种草推广。",
  detail:
    "请基于这张商品图生成一张细节特写图。要求：1. 用微距视角突出商品的质感和工艺细节；2. 浅景深虚化背景；3. 光线突出产品表面纹理；4. 保留所有品牌标识和设计元素；5. 适合电商详情页细节展示。",
  flatlay:
    "请基于这张商品图生成一张平铺摆拍图。要求：1. 俯拍视角，将商品与搭配的配饰或场景元素一起平铺展示；2. 背景用浅色或大理石纹理；3. 整体构图干净有序；4. 完整保留商品外观和品牌信息；5. 适合小红书种草图。",
  outdoor:
    "请基于这张商品图生成一张户外场景图。要求：1. 将商品放置在自然光线充足的户外环境中；2. 背景可以是公园、街道、咖啡馆等；3. 画面通透明亮；4. 保留商品所有细节和品牌信息；5. 适合 TikTok/抖音带货视频封面。",
  studio:
    "请基于这张商品图生成一张专业棚拍风格图。要求：1. 使用有渐变色或纯色的专业摄影背景；2. 三点布光突出产品立体感；3. 画面高级精致；4. 完整保留商品材质、颜色和品牌标识；5. 适合电商主图展示。",
};

/**
 * Generate a single scene image for a product.
 */
export async function generateProductSceneImage(params: {
  assetUrl: string;
  style: SceneStyle;
  customPrompt?: string;
  model?: Pick<Model, "id" | "slug" | "apiKey" | "baseUrl" | "creditsPerGen">;
}): Promise<{
  model: Pick<Model, "id" | "slug" | "apiKey" | "baseUrl" | "creditsPerGen">;
  imageUrl: string;
}> {
  const model =
    params.model ??
    (await getActiveModelByCapability({
      capability: MODEL_CAPABILITIES.imageEdit,
    }));

  const prompt =
    params.customPrompt?.trim() ||
    SCENE_PROMPTS[params.style] ||
    SCENE_PROMPTS.lifestyle;

  const imageUrl = isOpenAiImagesEditModel(model)
    ? await yunwuImagesEditRequest({
        assetUrl: params.assetUrl,
        prompt,
        model,
      })
    : await bltcyImageRequest({
        assetUrl: params.assetUrl,
        prompt,
        model,
      });

  return { model, imageUrl };
}

export const SCENE_STYLES: { value: SceneStyle; label: string }[] = [
  { value: "lifestyle", label: "生活场景" },
  { value: "model", label: "模特展示" },
  { value: "detail", label: "细节特写" },
  { value: "flatlay", label: "平铺摆拍" },
  { value: "outdoor", label: "户外场景" },
  { value: "studio", label: "棚拍风格" },
];
