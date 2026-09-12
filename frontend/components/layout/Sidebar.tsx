"use client";

import { ChevronRight, ShieldCheck, type LucideIcon } from "lucide-react";
import type { View } from "../../lib/types";

export function Sidebar({
  name, segment, view, nav, onNavigate, onSignOut,
}: {
  name: string; segment: string; view: View; onNavigate: (view: View) => void; onSignOut: () => void;
  nav: Array<{ label: View; text: string; icon: LucideIcon }>;
}) {
  return (
    <aside className="flex min-h-screen flex-col gradient-navy px-3.5 pb-5 pt-6 text-[#c7d6ea] max-md:min-h-0 max-md:px-4 max-md:py-3">
      <div className="flex items-center gap-2.5 px-2.5 pb-7 text-base font-bold tracking-wide text-white max-md:pb-0">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-white text-navy"><ShieldCheck size={17} /></span>
        <span>ARTH<span className="text-[#79b3ff]">-</span>AI</span>
      </div>

      <div className="flex items-center gap-2.5 border-y border-white/10 px-2.5 py-3.5 max-md:hidden">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d9e8ff] font-bold text-navy-deep">{name.slice(0, 1)}</span>
        <span className="min-w-0">
          <strong className="block truncate max-w-[135px] text-xs text-white">{name}</strong>
          <small className="mt-0.5 block truncate max-w-[135px] text-[10px] uppercase tracking-wide text-[#9fb4cd]">{segment.replaceAll("_", " ")}</small>
        </span>
      </div>

      <p className="mb-2 ml-2.5 mt-7 text-[9px] font-bold tracking-widest text-[#86a0bd] max-md:hidden">YOUR BANKING</p>
      <nav className="flex flex-col gap-1 max-md:mt-3 max-md:flex-row max-md:gap-1 max-md:overflow-x-auto">
        {nav.map(({ label, text, icon: Icon }) => (
          <button
            key={label} onClick={() => onNavigate(label)}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-xs transition-colors max-md:w-auto max-md:flex-none max-md:px-2.5 max-md:py-2 ${
              view === label ? "bg-white/10 text-white shadow-[inset_3px_0_0_#5b9bf5] max-md:shadow-[inset_0_-2px_0_#5b9bf5]" : "text-[#aec1da] hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={17} /> <span>{text}</span> {view === label && <ChevronRight size={14} className="ml-auto max-md:hidden" />}
          </button>
        ))}
      </nav>

      <p className="ml-2.5 mt-8 text-[9px] font-bold tracking-widest text-[#86a0bd] max-md:hidden">SECURITY</p>
      <div className="mx-2.5 flex items-start gap-2.5 py-2.5 text-[#6fb3ff] max-md:hidden">
        <ShieldCheck size={16} />
        <span><strong className="block text-[11px] text-[#dfe9f7]">Protected account</strong><small className="mt-0.5 block text-[10px] text-[#86a0bd]">Monitoring is active</small></span>
      </div>
      <button onClick={onSignOut} className="mt-auto w-full rounded-md px-2.5 py-2.5 text-left text-xs text-[#a6bad4] hover:bg-white/10 hover:text-white max-md:hidden">
        Sign out
      </button>
    </aside>
  );
}
