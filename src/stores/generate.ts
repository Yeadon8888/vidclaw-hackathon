import { create } from "zustand";

export interface ScriptResult {
  creative_points: string[];
  hook: string;
  plot_summary: string;
  shots: {
    id: number;
    scene_zh: string;
    sora_prompt: string;
    duration_s: number;
    camera: string;
  }[];
  full_sora_prompt: string;
  copy: {
    title: string;
    caption: string;
    first_comment: string;
  };
}

export interface GenerateParams {
  orientation: "portrait" | "landscape";
  duration: 10 | 15;
  count: number;
  platform: "douyin" | "tiktok";
  model: string;
}

export type GenerateStage =
  | "IDLE"
  | "DOWNLOAD"
  | "ANALYZE"
  | "GENERATE"
  | "POLL"
  | "DONE"
  | "ERROR";

export interface PollResult {
  taskId: string;
  status: string;
  progress: string;
  url?: string;
  failReason?: string;
}

interface GenerateState {
  stage: GenerateStage;
  logs: string[];
  script: ScriptResult | null;
  videoUrls: string[];
  errorMessage: string | null;
  errorCode: string | null;
  soraPrompt: string | null;
  pollResults: PollResult[];

  params: GenerateParams;

  setStage: (stage: GenerateStage) => void;
  addLog: (msg: string) => void;
  setScript: (script: ScriptResult) => void;
  setVideoUrls: (urls: string[]) => void;
  setError: (code: string, message: string, soraPrompt?: string) => void;
  setSoraPrompt: (prompt: string) => void;
  setPollResults: (results: PollResult[]) => void;
  setParams: (params: Partial<GenerateParams>) => void;
  reset: () => void;
}

const defaultParams: GenerateParams = {
  orientation: "portrait",
  duration: 15,
  count: 1,
  platform: "douyin",
  model: "veo3.1-fast",
};

export const useGenerateStore = create<GenerateState>((set) => ({
  stage: "IDLE",
  logs: [],
  script: null,
  videoUrls: [],
  errorMessage: null,
  errorCode: null,
  soraPrompt: null,
  pollResults: [],
  params: defaultParams,

  setStage: (stage) => set({ stage }),
  addLog: (msg) => set((s) => ({ logs: [...s.logs, msg] })),
  setScript: (script) => set({ script }),
  setVideoUrls: (urls) => set({ videoUrls: urls }),
  setError: (code, message, soraPrompt) =>
    set({ stage: "ERROR", errorCode: code, errorMessage: message, soraPrompt: soraPrompt ?? null }),
  setSoraPrompt: (prompt) => set({ soraPrompt: prompt }),
  setPollResults: (results) => set({ pollResults: results }),
  setParams: (partial) => set((s) => ({ params: { ...s.params, ...partial } })),
  reset: () =>
    set({
      stage: "IDLE",
      logs: [],
      script: null,
      videoUrls: [],
      errorMessage: null,
      errorCode: null,
      soraPrompt: null,
      pollResults: [],
    }),
}));
