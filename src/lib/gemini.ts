/**
 * Gemini API — structured JSON output for video script generation.
 * Uses admin-configured `script_generation` model first, then falls back to env.
 */

import type { Model } from "@/lib/db/schema";
import { MODEL_CAPABILITIES } from "@/lib/models/capabilities";
import { getActiveModelByCapability } from "@/lib/models/repository";
import type { ScriptResult } from "@/lib/video/types";
import type { OutputLanguage } from "@/lib/video/languages";
import { getLanguage } from "@/lib/video/languages";
import { buildScriptInstruction } from "@/lib/video/prompt";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_BASE_URL = "https://yunwu.ai";

type ScriptGenerationModelRef = Pick<
  Model,
  "id" | "slug" | "apiKey" | "baseUrl"
>;

interface ScriptGenerationConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
  source: "admin_model" | "env";
}

export function resolveLanguageSpec(outputLanguage?: OutputLanguage): {
  spoken: string;
  content: string;
  instruction: string;
} {
  const lang = getLanguage(outputLanguage);
  if (!lang || !lang.spokenName) {
    return {
      spoken: "follow user request if specified; otherwise match target market",
      content: "follow user request if specified; otherwise match target market",
      instruction:
        "If the user explicitly specifies a language, all spoken dialogue, voiceover, title, caption, hashtags, and first_comment must use that language consistently. Do not silently switch to English.",
    };
  }
  return {
    spoken: lang.spokenName,
    content: lang.spokenName,
    instruction: `All spoken dialogue, voiceover, title, caption, hashtags, and first_comment must be in ${lang.spokenName}. Do not silently switch to English or any other language.`,
  };
}

/** Appended to custom prompts that don't include the JSON schema */
const JSON_OUTPUT_SUFFIX = `

输出要求：
必须且只能输出一个合法的 JSON 对象，格式如下：

{
  "creative_points": ["创意要点1", "创意要点2"],
  "hook": "一句话爆点",
  "plot_summary": "剧情梗概（2-3句话）",
  "shots": [
    {
      "id": 1,
      "scene_zh": "镜头1的中文场景描述",
      "sora_prompt": "English Sora prompt for shot 1 only",
      "duration_s": 3,
      "camera": "close-up"
    }
  ],
  "full_sora_prompt": "Complete English Sora prompt combining all shots for direct use",
  "copy": {
    "title": "视频标题（≤20字）",
    "caption": "正文文案，50-100字，末尾附带5-8个可直接发布的平台标签，标签使用空格分隔，不要Markdown格式",
    "first_comment": "首评，30-60字"
  }
}

！！！极端重要！！！
- camera 值只能是 close-up、wide、medium、overhead 之一
- 只输出 JSON，不要任何解释文字、代码块标记（不要 \`\`\`json）
- JSON 必须合法可解析
- caption 末尾的标签最多 8 个，使用纯文本格式，例如：#tag1 #tag2 #tag3
- 不要输出 Markdown、不要用 \`**\` 包裹标签、不要用逗号或列表格式输出标签
`;

function getFallbackApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.GEMINI_API_KEY ||
    env.YUNWU_GEMINI_API_KEY ||
    env.YUNWU_API_KEY ||
    ""
  ).trim();
}

function getFallbackBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.GEMINI_BASE_URL || DEFAULT_BASE_URL).trim();
}

function getFallbackModelSlug(env: NodeJS.ProcessEnv = process.env): string {
  return (env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
}

export function resolveScriptGenerationConfigFromModel(
  model?: ScriptGenerationModelRef | null,
  env: NodeJS.ProcessEnv = process.env,
): ScriptGenerationConfig {
  return {
    model: model?.slug?.trim() || getFallbackModelSlug(env),
    apiKey: model?.apiKey?.trim() || getFallbackApiKey(env),
    baseUrl: model?.baseUrl?.trim() || getFallbackBaseUrl(env),
    source: model ? "admin_model" : "env",
  };
}

async function resolveScriptGenerationConfig(): Promise<ScriptGenerationConfig> {
  try {
    const model = await getActiveModelByCapability({
      capability: MODEL_CAPABILITIES.scriptGeneration,
    });
    return resolveScriptGenerationConfigFromModel(model);
  } catch (error) {
    console.warn("[script-generation] fallback to env config", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return resolveScriptGenerationConfigFromModel(null);
  }
}

async function geminiRequest(payload: object): Promise<unknown> {
  const config = await resolveScriptGenerationConfig();
  if (!config.apiKey) {
    throw new Error("脚本分析模型未配置 API Key。");
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/v1beta/models/${config.model}:generateContent`;

  console.info("[script-generation] request", {
    model: config.model,
    source: config.source,
    baseUrl,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.error("[script-generation] request failed", {
        model: config.model,
        source: config.source,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
  throw new Error("Gemini request failed after 3 attempts");
}

/** Extract non-thought text from Gemini thinking model response */
function extractText(result: unknown): string {
  const r = result as {
    candidates?: {
      content?: { parts?: { thought?: boolean; text?: string }[] };
    }[];
  };
  const parts = r?.candidates?.[0]?.content?.parts ?? [];
  const answerParts = parts.filter((p) => !p.thought);
  const last = answerParts[answerParts.length - 1];
  return last?.text?.trim() ?? "";
}

/** Parse JSON from Gemini response, stripping code fences */
function parseJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    s = s.slice(start, end + 1);
  }
  return JSON.parse(s);
}

// ─── Public API ───

/**
 * Generate a video script via Gemini analysis.
 * Supports: video remix (with optional modification), theme expansion.
 */
export async function generateScript(params: {
  type: "video" | "theme";
  videoBuffer?: ArrayBuffer;
  mimeType?: string;
  theme?: string;
  modification?: string;
  creativeBrief?: string;
  imageBuffers?: { buffer: ArrayBuffer; mimeType: string }[];
  promptTemplate?: string;
  platform?: "douyin" | "tiktok";
  outputLanguage?: OutputLanguage;
}): Promise<ScriptResult> {
  const {
    type,
    videoBuffer,
    mimeType,
    theme,
    modification,
    creativeBrief,
    imageBuffers,
    promptTemplate,
    platform,
    outputLanguage,
  } = params;

  const languageSpec = resolveLanguageSpec(outputLanguage);
  const platformInstruction =
    platform === "tiktok"
      ? "\n\n**IMPORTANT: This video is for TikTok. Sora prompts remain in English, but visible copy and spoken language must follow the selected output language constraint below.**"
      : "";
  const languageInstruction = `\n\n语言强约束：\n- ${languageSpec.instruction}\n- Keep sora_prompt and full_sora_prompt in English for the video model.\n- In the JSON response, add language.spoken and language.content reflecting the resolved spoken/content language.`;

  // Build instruction
  let instruction: string;
  if (promptTemplate) {
    instruction = promptTemplate
      .replace(/\{\{THEME\}\}/g, theme ?? "")
      .replace(/\{\{MODIFICATION_PROMPT\}\}/g, modification ?? creativeBrief ?? "")
      .replace(/\{\{CREATIVE_BRIEF\}\}/g, creativeBrief ?? modification ?? "");
    if (!instruction.includes('"full_sora_prompt"')) {
      instruction += JSON_OUTPUT_SUFFIX;
    }
    instruction += platformInstruction + languageInstruction;
  } else {
    instruction =
      buildDefaultPrompt(type, theme, modification, creativeBrief) +
      platformInstruction +
      languageInstruction;
  }
  instruction = buildScriptInstruction({
    baseInstruction: instruction,
    referenceImageCount: imageBuffers?.length ?? 0,
    creativeBrief,
  });

  // Build content parts
  const parts: unknown[] = [];

  // Reference images as inline_data
  if (imageBuffers && imageBuffers.length > 0) {
    parts.push({
      text:
        imageBuffers.length > 1
          ? "以下是产品参考图片。它们代表同一商品的不同角度/细节，最终视频必须保留这组图片对应的商品身份与外观："
          : "以下是产品参考图片。最终视频必须保留这张图对应的商品身份与外观：",
    });
    for (const img of imageBuffers) {
      const b64 = Buffer.from(img.buffer).toString("base64");
      parts.push({ inline_data: { mime_type: img.mimeType, data: b64 } });
    }
  }

  // Video for remix mode
  if (type === "video" && mimeType && videoBuffer) {
    const b64 = Buffer.from(videoBuffer).toString("base64");
    parts.push({ inline_data: { mime_type: mimeType, data: b64 } });
  }

  parts.push({ text: instruction });

  const result = await geminiRequest({
    contents: [{ role: "user", parts }],
  });

  const raw = extractText(result);
  try {
    return parseJson(raw) as ScriptResult;
  } catch {
    throw new Error(`Gemini returned invalid JSON:\n${raw.slice(0, 500)}`);
  }
}

/**
 * Regenerate copy (title/caption/first_comment) using a custom copy prompt.
 * The template should contain {{SORA_PROMPT}} placeholder.
 */
export async function generateCopy(
  soraPrompt: string,
  copyPromptTemplate: string,
  platform?: "douyin" | "tiktok",
  outputLanguage?: OutputLanguage,
): Promise<{ title: string; caption: string; first_comment: string }> {
  const languageSpec = resolveLanguageSpec(outputLanguage);
  let instruction = copyPromptTemplate.replace(
    /\{\{SORA_PROMPT\}\}/g,
    soraPrompt,
  );
  instruction += `\n\n**IMPORTANT: Title, caption, hashtags inside caption, and first_comment MUST be in ${languageSpec.content}. Do not switch to English unless the selected output language is English.**`;
  if (platform === "tiktok") {
    instruction +=
      "\n\n**IMPORTANT: This copy is for TikTok, but the copy language must still follow the selected output language.**";
  }

  const result = await geminiRequest({
    contents: [{ role: "user", parts: [{ text: instruction }] }],
  });

  const raw = extractText(result);
  return parseJson(raw) as { title: string; caption: string; first_comment: string };
}

// ─── Default prompts ───

function buildDefaultPrompt(
  type: "video" | "theme",
  theme?: string,
  modification?: string,
  creativeBrief?: string,
): string {
  const jsonSchema = `{
  "creative_points": ["创意要点1", "创意要点2"],
  "hook": "一句话爆点",
  "plot_summary": "剧情梗概（2-3句话）",
  "shots": [
    {
      "id": 1,
      "scene_zh": "镜头1的中文场景描述",
      "sora_prompt": "English Sora prompt for shot 1 only",
      "duration_s": 3,
      "camera": "close-up"
    }
  ],
  "full_sora_prompt": "Complete English Sora prompt combining all shots for direct use",
  "copy": {
    "title": "视频标题（≤20字）",
    "caption": "正文文案，50-100字，末尾附带5-8个可直接发布的平台标签，标签使用空格分隔，不要Markdown格式",
    "first_comment": "首评，30-60字"
  },
  "language": {
    "spoken": "Language used by dialogue or voiceover in the final video",
    "content": "Language used by title, caption, hashtags, and first_comment"
  }
}`;

  const constraints = `要求：
- shots 数组每个镜头的 sora_prompt 用英文
- full_sora_prompt 是所有镜头描述合并的完整英文提示词，可以直接提交给 Sora
- camera 只能是 close-up、wide、medium、overhead 之一
- copy.title / caption / first_comment 必须是可直接发布的成品文案
- caption 末尾必须附带 5-8 个标签，使用空格分隔的纯文本格式，例如：#skincare #beauty #viral
- 标签不能带 Markdown、不能使用 ** 包裹、不能用逗号或顿号连接
- 只输出 JSON，不要任何额外文字、代码块标记`;

  if (type === "video") {
    const modSection = modification
      ? `\n修改要求：${modification}\n请在复刻的基础上严格执行以上修改。`
      : "";
    return `你是一位专业的短视频创作专家和 Sora 脚本生成师。\n${modSection}\n\n请分析这段视频（和参考图片，如有），输出一个 **严格合法的 JSON 对象**，格式如下：\n\n${jsonSchema}\n\n${constraints}`;
  }

  const briefSection = creativeBrief
    ? `\n补充要求：${creativeBrief}\n请把这些要求具体落实到分镜、画面和文案里。`
    : "";

  return `你是一位专业的短视频创作专家和 Sora 脚本生成师。\n\n主题：${theme}${briefSection}\n\n基于以上主题，输出一个 **严格合法的 JSON 对象**，格式如下：\n\n${jsonSchema}\n\n${constraints}`;
}
