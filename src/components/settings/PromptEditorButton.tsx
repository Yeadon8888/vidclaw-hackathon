"use client";

import { useState } from "react";
import { PromptEditor } from "./PromptEditor";

export function PromptEditorButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-[var(--vc-radius-md)] bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500"
      >
        自定义 Prompt
      </button>
      <PromptEditor isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
