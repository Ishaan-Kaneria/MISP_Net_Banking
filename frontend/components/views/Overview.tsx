"use client";

import { ArrowUpRight, ChevronRight, IndianRupee } from "lucide-react";
import type { Dashboard, View } from "../../lib/types";
import { money } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { Card } from "../ui";

export function Overview({
  data, copy, onDetails, onAddMoney, onNavigate,
}: {
  data: Dashboard; copy: TranslationCopy; onDetails: () => void; onAddMoney: () => void; onNavigate: (view: View) => void;
}) {
  return (
    <div className="animate-rise">
      <div className="mt-7 grid grid-cols-1 items-center gap-5 rounded-lg gradient-navy-diagonal p-6 text-white shadow-[0_8px_18px_rgba(8,31,64,.18)] md:grid-cols-[1.3fr_.7fr_auto]">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">{copy.balance}</span>
          <strong className="mt-2 block text-[34px] tracking-tight">{money(data.balance)}</strong>
          <p className="mt-2 flex items-center gap-2 text-[11px] text-[#b7cdec]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6fc06f]" /> {data.stress_flag ? copy.support : copy.stable}
          </p>
        </div>
        <div className="border-t border-white/20 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <span className="block text-[10px] text-[#a3bcdd]">PRIMARY SAVINGS</span>
          <strong className="my-1.5 block text-sm tracking-wide">•••• 0001</strong>
          <small className="block text-[10px] text-[#a3bcdd]">Last updated just now</small>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onAddMoney} className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#6fa6ea] px-3 py-2.5 text-[11px] text-white hover:bg-white/10">
            <IndianRupee size={16} /> Add money
          </button>
          <button onClick={() => onNavigate("Simulator")} className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#6fa6ea] px-3 py-2.5 text-[11px] text-white hover:bg-white/10">
            <ArrowUpRight size={16} /> {copy.simulator}
          </button>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: copy.savings, value: `${Math.round((data.features.savings_rate || 0) * 100)}%`, detail: copy.rhythm },
          { label: copy.spend, value: money(data.features.spend_30d || 0), detail: copy.essentials },
          { label: copy.payments, value: `${data.transactions.length}`, detail: copy.activity },
        ].map(metric => (
          <Card key={metric.label} className="p-[18px] shadow-none">
            <p className="m-0 text-xs text-muted">{metric.label}</p>
            <strong className="mt-3 block text-[25px]">{metric.value}</strong>
            <span className="text-[11px] text-muted">{metric.detail}</span>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5.5 p-[22px]">
        <div className="flex items-center justify-between">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-primary">Made for this moment</p>
            <h2 className="my-2 text-[28px] font-bold">{data.offers[0]?.product_code?.replaceAll("_", " ") || "Your next good move"}</h2>
            <p className="max-w-md text-muted">{data.offers[0]?.reason || "Keep exploring your account to discover useful support."}</p>
          </div>
          <span className="rounded-full bg-gold-light p-3.5 text-gold"><IndianRupee size={25} /></span>
        </div>
        <button onClick={onDetails} className="mt-3.5 border-0 border-b border-primary bg-transparent py-2.5 font-bold text-primary">
          {copy.details} <ChevronRight size={16} className="inline align-middle" />
        </button>
      </Card>
    </div>
  );
}
