"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, User } from "lucide-react";
import type { ChatTurn, Language } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { LANGUAGES } from "../../lib/language";
import { Card } from "../ui";

const SUGGESTIONS: Record<Language, string[]> = {
  en: ["What is my balance?", "Show my offers", "I need grace", "Recent activity", "Is my payment safe?"],
  hi: ["मेरा बैलेंस क्या है?", "मेरे ऑफर दिखाएं", "मुझे ग्रेस चाहिए", "मेरी हाल की गतिविधि", "भुगतान सुरक्षित है?"],
  gu: ["મારું બેલેન્સ શું છે?", "મારી ઓફર્સ બતાવો", "મને ગ્રેસ જોઈએ", "મારી તાજેતરની પ્રવૃત્તિ", "ચુકવણી સુરક્ષિત છે?"],
};

/**
 * A conversation, rather than a single question and its answer.
 *
 * Every turn was already being written to the ChatMessage table, but the UI
 * held one `chat` string and one `reply` string and overwrote both on each
 * send — so the assistant this project calls a pillar could only ever show the
 * most recent exchange, and lost even that on a reload. The thread below is the
 * persisted history, so a customer can follow what they were actually told.
 */
export function Conversation({
  messages, ask, sending, language, setLanguage, copy,
}: {
  messages: ChatTurn[]; ask: (message: string) => Promise<void>; sending: boolean;
  language: Language; setLanguage: (language: Language) => void; copy: TranslationCopy;
}) {
  const [message, setMessage] = useState("");
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the newest turn in view as the thread grows, without fighting a
    // visitor who has asked for reduced motion.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    threadEnd.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }, [messages.length, sending]);

  const send = async (nextMessage = message) => {
    if (!nextMessage.trim() || sending) return;
    setMessage("");
    await ask(nextMessage.trim());
  };

  return (
    <div className="mt-7 animate-rise">
      <Card className="min-h-[280px] p-6">
        <p className="font-bold text-primary">{copy.assistant}</p>
        <h2 className="text-[28px] font-bold">{copy.clarity}</h2>
        <div className="my-4.5 flex flex-wrap gap-2">
          {LANGUAGES.map(([code, label]) => (
            <button key={code} onClick={() => setLanguage(code)} lang={code} aria-pressed={language === code}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${language === code ? "border-primary bg-primary-light font-bold text-primary" : "border-border bg-white text-muted hover:bg-paper"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto scrollbar-thin" role="log" aria-live="polite">
          {messages.map(turn => (
            <div key={turn.id} className={`flex items-start gap-2.5 ${turn.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${turn.role === "user" ? "bg-primary text-white" : "bg-primary-light text-primary"}`}>
                {turn.role === "user" ? <User size={14} /> : <Bot size={14} />}
              </span>
              <p className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${turn.role === "user" ? "bg-primary text-white" : "bg-paper text-ink"}`}>
                {turn.content}
              </p>
            </div>
          ))}
          {sending && (
            <div className="flex items-start gap-2.5">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-light text-primary"><Bot size={14} /></span>
              <p className="rounded-lg bg-paper px-3.5 py-2.5 text-sm text-muted">{copy.thinking}</p>
            </div>
          )}
          <div ref={threadEnd} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {SUGGESTIONS[language].map(item => (
            <button key={item} disabled={sending} onClick={() => void send(item)}
              className="rounded-full border border-border bg-white px-3.5 py-2.5 text-sm text-ink transition-colors hover:border-primary hover:bg-primary-light hover:text-primary disabled:cursor-wait disabled:opacity-60">
              {item}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <input
            value={message} disabled={sending} onChange={event => setMessage(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") void send(); }} placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            className="block w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
          <button disabled={sending} onClick={() => void send()}
            className="whitespace-nowrap rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-wait disabled:opacity-65">
            {sending ? copy.thinking : copy.send}
          </button>
        </div>
      </Card>
    </div>
  );
}
