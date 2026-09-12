"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-white shadow-card ${className}`}>{children}</div>;
}

export function Button({
  children, onClick, disabled, variant = "primary", type = "button", className = "",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit";
  variant?: "primary" | "outline" | "ghost"; className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:brightness-100";
  const variants = {
    primary: "gradient-brand text-white shadow-glow hover:scale-[1.02] hover:brightness-105 active:scale-[0.99]",
    outline: "border-2 border-primary text-primary bg-white hover:bg-primary-light disabled:border-border disabled:text-subtle disabled:bg-transparent",
    ghost: "bg-transparent text-muted hover:bg-paper",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Input({
  label, value, onChange, type = "text", placeholder, min, max, inputMode, rightSlot,
}: {
  label?: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string;
  min?: number; max?: number; inputMode?: "numeric" | "text"; rightSlot?: ReactNode;
}) {
  const input = (
    <div className="relative">
      <input
        value={value} type={type} placeholder={placeholder} min={min} max={max} inputMode={inputMode}
        onChange={event => onChange(event.target.value)}
        className="block w-full rounded-xl border border-border bg-white px-3.5 py-3 text-sm text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        style={rightSlot ? { paddingRight: 44 } : undefined}
      />
      {rightSlot}
    </div>
  );
  return label ? <label className="block text-sm font-semibold text-ink">{label}<div className="mt-2">{input}</div></label> : input;
}

export function Badge({ tone = "muted", children }: { tone?: "success" | "danger" | "gold" | "violet" | "muted"; children: ReactNode }) {
  const tones = {
    success: "bg-success-light text-success",
    danger: "bg-danger-light text-danger",
    gold: "bg-gold-light text-gold",
    violet: "bg-primary-light text-primary",
    muted: "bg-paper text-muted",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function Modal({ onClose, children, maxWidth = 440 }: { onClose: () => void; children: ReactNode; maxWidth?: number }) {
  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      className="fixed inset-0 z-30 grid place-items-center bg-navy-deep/60 p-5 backdrop-blur-sm animate-pop-in"
    >
      <div onClick={event => event.stopPropagation()} className="w-full overflow-hidden rounded-2xl bg-white shadow-pop" style={{ maxWidth }}>
        <div className="gradient-brand h-1.5 w-full" />
        <div className="p-7">{children}</div>
      </div>
    </div>
  );
}

export function ModalHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="m-0 text-[11px] font-bold uppercase tracking-widest text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold text-navy">{title}</h2>
      </div>
      <button aria-label="Close" onClick={onClose} className="rounded p-1 text-muted hover:text-ink">
        <X size={20} />
      </button>
    </div>
  );
}
