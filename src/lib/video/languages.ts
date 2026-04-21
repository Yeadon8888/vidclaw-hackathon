/**
 * Single source of truth for output language options.
 *
 * To add a new language (e.g. Japanese):
 *   1. Append one entry to LANGUAGES below.
 *   2. That's it — the UI picker, Gemini script generation, and the
 *      video prompt language constraint all read from this list.
 *
 * Fields:
 *   - code: stable wire value stored in DB / URL params (never translate)
 *   - label: zh-CN display name shown in the UI picker
 *   - spokenName: English-form name used in prompts to Gemini and to
 *     downstream video models (sora / veo / grok). Null means "no
 *     constraint" — used only by the "auto" option.
 */

export interface LanguageOption {
  code: string;
  label: string;
  spokenName: string | null;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: "auto",   label: "语言自动",       spokenName: null },
  { code: "en",     label: "英语",           spokenName: "English" },
  { code: "zh-cn",  label: "简体中文",       spokenName: "Simplified Chinese (Mandarin)" },
  { code: "es-mx",  label: "墨西哥西语",     spokenName: "Mexican Spanish" },
  { code: "es",     label: "西班牙语",       spokenName: "Spanish" },
  { code: "pt-br",  label: "巴西葡语",       spokenName: "Brazilian Portuguese" },
  { code: "ja",     label: "日语",           spokenName: "Japanese" },
  { code: "ko",     label: "韩语",           spokenName: "Korean" },
  { code: "ms",     label: "马来西亚语",     spokenName: "Malay (Malaysia)" },
  { code: "en-my",  label: "马来西亚英语",   spokenName: "Malaysian English" },
  { code: "id",     label: "印尼语",         spokenName: "Indonesian" },
  { code: "th",     label: "泰语",           spokenName: "Thai" },
  { code: "vi",     label: "越南语",         spokenName: "Vietnamese" },
  { code: "ar",     label: "阿拉伯语",       spokenName: "Arabic" },
  { code: "fr",     label: "法语",           spokenName: "French" },
  { code: "de",     label: "德语",           spokenName: "German" },
  { code: "ru",     label: "俄语",           spokenName: "Russian" },
] as const;

export type OutputLanguage = (typeof LANGUAGES)[number]["code"];

const BY_CODE = new Map(LANGUAGES.map((lang) => [lang.code, lang]));

export function getLanguage(code: unknown): LanguageOption | null {
  if (typeof code !== "string") return null;
  return BY_CODE.get(code) ?? null;
}

/** The natural-language label fed to video models for lip-sync / VO constraints. */
export function videoLanguageLabel(code: unknown): string | null {
  return getLanguage(code)?.spokenName ?? null;
}
