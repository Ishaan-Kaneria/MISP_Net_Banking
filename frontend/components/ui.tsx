"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-white shadow-card ${className}`}>{children}</div>;
}

export function Button({
  children, onClick, disabled, variant = "primary", type = "button", className = "",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit";
  variant?: "primary" | "outline" | "ghost"; className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-dark",
    outline: "border border-primary text-primary bg-white hover:bg-primary-light disabled:border-border disabled:text-subtle disabled:bg-transparent",
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
        className="block w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        style={rightSlot ? { paddingRight: 44 } : undefined}
      />
      {rightSlot}
    </div>
  );
  return label ? <label className="block text-sm font-semibold text-ink">{label}<div className="mt-2">{input}</div></label> : input;
}

export function Badge({ tone = "muted", children }: { tone?: "success" | "danger" | "gold" | "muted"; children: ReactNode }) {
  const tones = {
    success: "bg-success-light text-success",
    danger: "bg-danger-light text-danger",
    gold: "bg-gold-light text-gold",
    muted: "bg-paper text-muted",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

/**
 * `role="dialog" aria-modal="true"` was already here, but nothing behind it:
 * Escape did not close the dialog, focus was free to wander into the page
 * underneath while assistive tech was being told the rest of the page was
 * inert, and the body kept scrolling behind the overlay. The step-up OTP and
 * Add Money dialogs are the two places in this app where a customer is asked
 * to authorise money movement, which is the worst place to leave a keyboard
 * user unable to back out.
 */
export function Modal({ onClose, children, maxWidth = 440 }: { onClose: () => void; children: ReactNode; maxWidth?: number }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const focusable = () => Array.from(
      panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? []
    );
    // Move focus into the dialog, unless something inside already claimed it
    // (the OTP field autofocuses its first box).
    if (!panel.current?.contains(document.activeElement)) focusable()[0]?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      // Wrap at both ends so Tab and Shift+Tab stay inside the dialog.
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      className="fixed inset-0 z-30 grid place-items-center bg-navy-deep/55 p-5 animate-pop-in"
    >
      <div ref={panel} onClick={event => event.stopPropagation()} className="max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-7 shadow-pop scrollbar-thin" style={{ maxWidth }}>
        {children}
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
      <button aria-label="Close" onClick={onClose} className="rounded p-1 text-muted transition-colors hover:bg-paper hover:text-ink">
        <X size={20} />
      </button>
    </div>
  );
}
