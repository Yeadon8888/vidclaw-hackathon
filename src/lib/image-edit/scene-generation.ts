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
  openaiImagesEditRequest,
} from "@/lib/image-edit/openai-images-edit";

export type SceneStyle =
  | "lifestyle"
  | "model"
  | "detail"
  | "flatlay"
  | "outdoor"
  | "studio";

export type SceneRegion =
  | "auto"
  | "western"
  | "east_asian_non_cn"
  | "southeast_asian"
  | "malaysian"
  | "mexican"
  | "middle_east";

export type ScenePromptLanguage = "zh" | "en";

const SCENE_PROMPTS_ZH: Record<SceneStyle, string> = {
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

const SCENE_PROMPTS_EN: Record<SceneStyle, string> = {
  lifestyle:
    "Using this product image, generate a lifestyle scene. Requirements: 1) Place the product naturally into an everyday-use context; 2) Give the background a lived-in feel (desk, living room, kitchen, etc.); 3) Soft, natural lighting; 4) Preserve every detail, color, and brand mark of the product; 5) Clean composition suitable for an e-commerce product page.",
  model:
    "Using this product image, generate a photo of a model using or showcasing the product. Requirements: 1) Add a suitable human model using or presenting the product in a natural setting; 2) Natural, confident pose; 3) Premium advertising feel; 4) Preserve the product's materials, colors, and branding exactly; 5) Suitable for social-media product seeding.",
  detail:
    "Using this product image, generate a close-up detail shot. Requirements: 1) Macro perspective emphasizing texture and craftsmanship; 2) Shallow depth of field blurring the background; 3) Lighting that reveals surface texture; 4) Preserve all brand marks and design elements; 5) Suitable for the details section of a product page.",
  flatlay:
    "Using this product image, generate a flat-lay composition. Requirements: 1) Top-down shot placing the product alongside complementary accessories or props; 2) Light-colored or marble-textured background; 3) Clean, orderly composition; 4) Preserve product appearance and branding; 5) Suitable for lifestyle-feed / Xiaohongshu posts.",
  outdoor:
    "Using this product image, generate an outdoor scene. Requirements: 1) Place the product in a naturally lit outdoor environment (park, street, café, etc.); 2) Bright, airy atmosphere; 3) Preserve every product detail and brand mark; 4) Suitable as a thumbnail for TikTok / short-video product drops.",
  studio:
    "Using this product image, generate a professional studio-style photo. Requirements: 1) Gradient or solid professional photo backdrop; 2) Three-point lighting accentuating the product's form; 3) Premium, polished feel; 4) Preserve materials, colors, and branding; 5) Suitable for a primary product listing image.",
};

const REGION_PHRASE_ZH: Record<Exclude<SceneRegion, "auto">, string> = {
  western: "欧美（北美/欧洲）人种外貌",
  east_asian_non_cn: "日韩东亚（非中国大陆）人种外貌",
  southeast_asian: "东南亚人种外貌",
  malaysian: "马来西亚当地人外貌",
  mexican: "墨西哥/拉美人种外貌",
  middle_east: "中东人种外貌",
};

const REGION_PHRASE_EN: Record<Exclude<SceneRegion, "auto">, string> = {
  western: "Western (North American / European) ethnicity",
  east_asian_non_cn: "East Asian (Japanese or Korean, not mainland-Chinese) ethnicity",
  southeast_asian: "Southeast Asian ethnicity",
  malaysian: "local Malaysian ethnicity",
  mexican: "Mexican / Latino ethnicity",
  middle_east: "Middle-Eastern ethnicity",
};

// Styles where a person may appear — region guidance only makes sense here.
const PEOPLE_STYLES: ReadonlySet<SceneStyle> = new Set([
  "lifestyle",
  "model",
  "outdoor",
]);

function buildScenePrompt(params: {
  style: SceneStyle;
  language: ScenePromptLanguage;
  region: SceneRegion;
  customPrompt?: string;
}): string {
  const base =
    params.language === "en"
      ? SCENE_PROMPTS_EN[params.style]
      : SCENE_PROMPTS_ZH[params.style];

  const parts: string[] = [base];

  if (params.region !== "auto" && PEOPLE_STYLES.has(params.style)) {
    if (params.language === "en") {
      const phrase = REGION_PHRASE_EN[params.region];
      parts.push(
        `If any human appears in the image, they must have ${phrase}. Do NOT default to a Chinese-looking model.`,
      );
    } else {
      const phrase = REGION_PHRASE_ZH[params.region];
      parts.push(
        `如果画面中出现人物，人物必须是${phrase}，不要默认生成中国人。`,
      );
    }
  }

  const custom = params.customPrompt?.trim();
  if (custom) {
    parts.push(
      params.language === "en"
        ? `Additional user requirement: ${custom}`
        : `用户补充要求：${custom}`,
    );
  }

  return parts.join("\n\n");
}

/**
 * Generate a single scene image for a product.
 */
export async function generateProductSceneImage(params: {
  assetUrl: string;
  style: SceneStyle;
  customPrompt?: string;
  region?: SceneRegion;
  language?: ScenePromptLanguage;
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

  const prompt = buildScenePrompt({
    style: params.style,
    language: params.language ?? "zh",
    region: params.region ?? "auto",
    customPrompt: params.customPrompt,
  });

  const imageUrl = isOpenAiImagesEditModel(model)
    ? await openaiImagesEditRequest({
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
