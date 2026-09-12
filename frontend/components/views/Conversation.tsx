"use client";

import { useState } from "react";
import type { Language } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { Card } from "../ui";

const SUGGESTIONS: Record<Language, string[]> = {
  en: ["What is my balance?", "Show my offers", "I need grace", "Recent activity", "Is my payment safe?"],
  hi: ["मेरा बैलेंस क्या है?", "मेरे ऑफर दिखाएं", "मुझे ग्रेस चाहिए", "मेरी हाल की गतिविधि", "भुगतान सुरक्षित है?"],
  gu: ["મારું બેલેન્સ શું છે?", "મારી ઓફર્સ બતાવો", "મને ગ્રેસ જોઈએ", "મારી તાજેતરની પ્રવૃત્તિ", "ચુકવણી સુરક્ષિત છે?"],
};

export function Conversation({
  chat, reply, ask, language, setLanguage, copy,
}: {
  chat: string; reply: string; ask: (message: string) => Promise<void>; language: Language; setLanguage: (language: Language) => void; copy: TranslationCopy;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (nextMessage = message) => {
    if (!nextMessage.trim() || sending) return;
    setSending(true);
    try {
      await ask(nextMessage.trim());
      setMessage("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-7 animate-rise">
      <Card className="min-h-[280px] p-6">
        <p className="font-bold text-primary">{copy.assistant}</p>
        <h2 className="text-[28px] font-bold">{copy.clarity}</h2>
        <div className="my-4.5 flex flex-wrap gap-2">
          {([["en", "English"], ["hi", "हिंदी"], ["gu", "ગુજરાતી"]] as const).map(([code, label]) => (
            <button key={code} onClick={() => setLanguage(code)}
              className={`rounded-lg border px-3 py-2 text-sm ${language === code ? "border-primary bg-primary-light font-bold text-primary" : "border-border bg-white text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        {chat && <p className="text-right text-primary">{chat}</p>}
        {reply && <p className="rounded-lg bg-primary-light p-3.5 leading-relaxed">{reply}</p>}
        <div className="mt-7 flex flex-wrap gap-2">
          {SUGGESTIONS[language].map(item => (
            <button key={item} disabled={sending} onClick={() => void send(item)}
              className="rounded-full border border-border bg-white px-3.5 py-2.5 text-sm text-ink disabled:cursor-wait disabled:opacity-60">
              {item}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <input
            value={message} disabled={sending} onChange={event => setMessage(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") void send(); }} placeholder={copy.placeholder}
            className="block w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
          <button disabled={sending} onClick={() => void send()}
            className="whitespace-nowrap rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-65">
            {sending ? copy.thinking : copy.send}
          </button>
        </div>
      </Card>
    </div>
  );
}
