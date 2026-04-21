import { videoLanguageLabel } from "./languages";

function normalizePrompt(value: string): string {
  return value.trim();
}

export function buildGeminiReferenceInstruction(referenceImageCount: number): string {
  const imageScope =
    referenceImageCount > 1
      ? "如果提供了多张参考图片，请将它们视为同一商品的不同角度或细节补充。"
      : "如果提供了参考图片，请将它视为最终视频必须保留的商品主体。";

  return [
    "参考图强约束：",
    imageScope,
    "- 参考图中的商品身份、品类、包装、颜色、材质、外观关键特征必须保留，不能替换成别的商品。",
    "- 如果参考视频与参考图片冲突，以参考图片中的商品外观与商品身份为准；参考视频只用于学习镜头语言、节奏和叙事结构。",
    "- 生成的每个 shot 的 sora_prompt 以及 full_sora_prompt，都必须明确围绕参考图中的商品来设计镜头。",
    "- 最终视频必须让该商品清晰出现，并在关键镜头中作为主角被稳定展示，不能只复刻原视频风格却忽略商品。",
  ].join("\n");
}

export function buildScriptInstruction(params: {
  baseInstruction: string;
  referenceImageCount?: number;
  creativeBrief?: string;
}): string {
  const instruction = normalizePrompt(params.baseInstruction);
  const referenceImageCount = params.referenceImageCount ?? 0;
  const creativeBrief = params.creativeBrief?.trim();
  const sections = [instruction];

  if (creativeBrief) {
    sections.push(
      [
        "用户补充要求：",
        creativeBrief,
        "- 上面的补充要求必须真实体现在分镜、sora_prompt 和 full_sora_prompt 中。",
      ].join("\n"),
    );
  }

  if (referenceImageCount <= 0) {
    return sections.join("\n\n");
  }

  sections.push(buildGeminiReferenceInstruction(referenceImageCount));
  return sections.join("\n\n");
}

export function buildFinalVideoPrompt(params: {
  scriptPrompt: string;
  referenceImageCount?: number;
  outputLanguage?: unknown;
}): string {
  const basePrompt = normalizePrompt(params.scriptPrompt);
  const referenceImageCount = params.referenceImageCount ?? 0;
  const languageLabel = videoLanguageLabel(params.outputLanguage);

  const sections: string[] = [basePrompt];

  if (languageLabel) {
    sections.push(
      [
        `Spoken-language constraint:`,
        `- Every character on screen must speak in ${languageLabel}.`,
        `- Any voiceover, narration, or subtitles baked into the video must be in ${languageLabel}.`,
        `- Lip-sync, mouth shapes, and pronunciation must match ${languageLabel}, not English.`,
        `- Do not switch to English or any other language, even for product names or catchphrases, unless the user explicitly requested mixed language.`,
      ].join("\n"),
    );
  }

  if (referenceImageCount > 0) {
    const firstLine =
      referenceImageCount > 1
        ? "Reference image constraints: treat all uploaded reference images as the same exact product shown from different angles or detail views."
        : "Reference image constraints: treat the uploaded reference image as the exact product that must appear in the final video.";

    sections.push(
      [
        firstLine,
        "- Keep the same product identity, category, packaging, silhouette, materials, colors, label details, and other defining visual traits from the reference image(s).",
        "- If the reference video conflicts with the reference image(s), preserve the product from the reference image(s) and only borrow pacing, composition, or storytelling from the video.",
        "- The product from the reference image(s) must stay clearly visible and prominent in the hero shots and key scenes.",
        "- Do not replace the product with another product, package, logo, or brand variation.",
        "- Build the generated video around showcasing that exact product while following the requested creative direction.",
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}
