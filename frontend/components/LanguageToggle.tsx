"use client";

import { Languages } from "lucide-react";
import { LANGUAGES } from "../lib/language";
import type { Language } from "../lib/types";

/**
 * The language switcher used on the onboarding screens. It carries a label and
 * an icon rather than the header's bare EN/HI/GU chips: sign-in and KYC are
 * the first thing a first-time digital user sees, and the problem statement's
 * whole point is that those users drop off when a journey opens in a language
 * they don't read. Each option is written in its own script so it can be
 * recognised without knowing any English.
 */
export function LanguageToggle({
  language, setLanguage, label, tone = "light",
}: {
  language: Language; setLanguage: (language: Language) => void; label: string; tone?: "light" | "dark";
}) {
  const muted = tone === "dark" ? "text-[#b7cdec]" : "text-muted";
  const idle = tone === "dark"
    ? "border-white/25 text-white/80 hover:bg-white/10"
    : "border-border bg-white text-muted hover:bg-paper";
  const active = tone === "dark"
    ? "border-white bg-white/15 font-bold text-white"
    : "border-primary bg-primary-light font-bold text-primary";
  return (
    <div>
      <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${muted}`}>
        <Languages size={13} aria-hidden /> {label}
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {LANGUAGES.map(([code, name]) => (
          <button
            key={code} type="button" onClick={() => setLanguage(code)}
            aria-pressed={language === code} lang={code}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${language === code ? active : idle}`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
