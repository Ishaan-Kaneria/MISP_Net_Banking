"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bell, CheckCircle2 } from "lucide-react";
import type { Dashboard } from "../../lib/types";

const SEEN_KEY = "mispbank_seen_alerts";

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Private browsing / storage disabled — treat everything as unseen
    // rather than crash; the bell just always shows the full count.
    return new Set();
  }
}

/**
 * A real notification center, not a single toast that only ever showed the
 * first alert: the badge is an actual unread count (capped at "9+"), opening
 * the panel lists every current alert, and "seen" is tracked per-browser in
 * localStorage so the count only ever reflects alerts that are genuinely
 * new since you last opened it — the same behavior as a real app's
 * notification bell, not a static dot that's either on or off.
 */
export function NotificationBell({ alerts }: { alerts: Dashboard["alerts"] }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSeen(readSeen()); }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const unreadCount = alerts.filter(alert => !seen.has(alert.id)).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && alerts.length) {
      const merged = new Set(seen);
      alerts.forEach(alert => merged.add(alert.id));
      setSeen(merged);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...merged].slice(-200))); } catch { /* storage unavailable */ }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} onClick={toggle} className="relative rounded p-1.5 text-[#5c7291] hover:text-ink">
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-white bg-danger px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-32px)] animate-pop-in rounded-lg border border-border bg-white shadow-pop">
          <div className="border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">Notifications</div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {alerts.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted"><CheckCircle2 size={16} /> No active alerts. Your account is clear.</div>
            )}
            {alerts.map(alert => (
              <div key={alert.id} className="flex items-start gap-2.5 border-b border-border px-4 py-3 last:border-b-0">
                <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full ${alert.type === "fraud" ? "bg-danger-light text-danger" : "bg-gold-light text-gold"}`}>
                  <AlertCircle size={13} />
                </span>
                <div className="min-w-0">
                  <strong className="block text-xs text-navy">{alert.type === "fraud" ? "Payment protection" : "Cash-flow support"}</strong>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{alert.message_en}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
