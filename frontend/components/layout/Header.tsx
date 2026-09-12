"use client";

import { Bell, ShieldCheck } from "lucide-react";
import type { Language, View } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";

export function Header({
  view, viewLabel, copy, language, setLanguage, hasAlerts, onShowNotifications,
}: {
  view: View; viewLabel: string; copy: TranslationCopy; language: Language; setLanguage: (language: Language) => void;
  hasAlerts: boolean; onShowNotifications: () => void;
}) {
  return (
    <header className="flex min-h-[72px] items-center justify-between border-b border-border bg-white px-5 md:px-8">
      <div className="flex flex-col text-sm">
        <span className="text-sm font-bold tracking-wide text-navy md:hidden">MISP BANK</span>
        <span className="hidden text-xs text-[#64778e] md:inline">{copy.personal} / {view === "Offers" ? copy.recommendations : viewLabel}</span>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <button aria-label="Show notifications" onClick={onShowNotifications} className="relative rounded p-1.5 text-[#5c7291] hover:text-ink">
          <Bell size={17} />
          {hasAlerts && <i className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full border border-white bg-danger" />}
        </button>
        <span className="hidden h-6 w-px bg-border md:block" />
        <span className="hidden items-center gap-1.5 text-xs font-medium text-primary md:flex"><ShieldCheck size={14} /> {copy.secure}</span>
        <div className="flex gap-0.5 rounded-md border border-border bg-paper p-0.5">
          {(["en", "hi", "gu"] as const).map(code => (
            <button key={code} onClick={() => setLanguage(code)}
              className={`rounded px-1.5 py-1 text-[10px] font-bold ${language === code ? "bg-primary text-white" : "text-[#5c7291]"}`}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
