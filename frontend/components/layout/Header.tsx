"use client";

import { ShieldCheck } from "lucide-react";
import type { Dashboard, Language, View } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { NotificationBell } from "./NotificationBell";

export function Header({
  view, viewLabel, copy, language, setLanguage, alerts,
}: {
  view: View; viewLabel: string; copy: TranslationCopy; language: Language; setLanguage: (language: Language) => void;
  alerts: Dashboard["alerts"];
}) {
  return (
    <header className="flex min-h-[72px] items-center justify-between border-b border-border bg-white px-5 md:px-8">
      <div className="flex flex-col text-sm">
        <span className="text-sm font-bold tracking-wide text-navy md:hidden">MISP BANK</span>
        <span className="hidden text-xs text-[#64778e] md:inline">{copy.personal} / {view === "Offers" ? copy.recommendations : viewLabel}</span>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        {/* Informational status first, then controls, then the one icon a
            user actually acts on (notifications) last — the sidebar no
            longer repeats this "protected" messaging on its own, so this is
            the single place it lives. */}
        <span className="hidden items-center gap-1.5 text-xs font-medium text-primary md:flex"><ShieldCheck size={14} /> {copy.secure}</span>
        <span className="hidden h-6 w-px bg-border md:block" />
        <div className="flex gap-0.5 rounded-md border border-border bg-paper p-0.5">
          {(["en", "hi", "gu"] as const).map(code => (
            <button key={code} onClick={() => setLanguage(code)}
              className={`rounded px-1.5 py-1 text-[10px] font-bold ${language === code ? "bg-primary text-white" : "text-[#5c7291]"}`}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="h-6 w-px bg-border" />
        <NotificationBell alerts={alerts} copy={copy} language={language} />
      </div>
    </header>
  );
}
