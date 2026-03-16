"use client";

import { useState } from "react";
import { PromptEditor } from "./PromptEditor";

export function PromptEditorButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="vc-gradient-btn rounded-[var(--vc-radius-md)] px-4 py-2 text-sm font-medium"
      >
        自定义 Prompt
      </button>
      <PromptEditor isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
