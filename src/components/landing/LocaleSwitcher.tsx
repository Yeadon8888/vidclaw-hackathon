"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Globe, Check, ChevronDown } from "lucide-react";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = {
  zh: "简体中文",
  en: "English",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function switchTo(next: string) {
    setOpen(false);
    if (next === locale) return;
    const segs = pathname.split("/");
    if (
      segs.length > 1 &&
      routing.locales.includes(segs[1] as (typeof routing.locales)[number])
    ) {
      segs[1] = next;
    } else {
      segs.splice(1, 0, next);
    }
    router.replace(segs.join("/") || `/${next}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="uppercase">{locale}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-40 overflow-hidden rounded-lg border border-white/10 bg-[#0d181b] shadow-xl shadow-black/40 ring-1 ring-white/5"
        >
          {routing.locales.map((loc) => {
            const active = locale === loc;
            return (
              <button
                key={loc}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => switchTo(loc)}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-[#0dccf2]/10 text-[#0dccf2]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{LABELS[loc] ?? loc.toUpperCase()}</span>
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
