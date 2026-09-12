"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowUpRight, Bell, CheckCircle2, ChevronRight, CircleHelp, Clock3, IndianRupee, LayoutDashboard, MessageCircle, ShieldCheck, TrendingUp, X, Zap } from "lucide-react";
import { api } from "../lib/api";

type Dashboard = {
  user: { id: string; name: string; lang: string; kyc_status: string };
  balance: number;
  segment: string;
  stress_flag: boolean;
  features: Record<string, number>;
  transactions: Array<{ id: string; amount: number; direction: string; payee: string; category: string; status: string; fraud_score: number; ts: string }>;
  offers: Array<{ id: string; product_code: string; reason: string; blocked_by_ethics: boolean }>;
  alerts: Array<{ id: string; type: string; message_en: string; message_hi: string }>;
};

type View = 'Overview' | 'Offers' | 'Conversation' | 'Explain' | 'Simulator';
const isView = (value: unknown): value is View => ['Overview', 'Offers', 'Conversation', 'Explain', 'Simulator'].includes(String(value));

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

const translations = {
  en: { overview: 'Accounts overview', conversation: 'Conversation', explain: 'Explainability', simulator: 'Safety simulator', personal: 'Personal overview', morning: 'Good morning', summary: 'Your money at a glance, with decisions shaped around your journey.', balance: 'Total available balance', stable: 'Your account is in good standing', support: 'Support mode is active', savings: 'Savings rate', spend: 'Monthly spend', payments: 'Payments watched', rhythm: '30 day rhythm', essentials: 'Across essentials', activity: 'Recent activity', recommendations: 'Recommendations', alerts: 'Security alerts', noAlerts: 'No active alerts. Your account is clear.', details: 'See recommendations', accountHealth: 'Account health', lookingGood: 'Looking good', supportMode: 'Support mode', signOut: 'Sign out', secure: 'Secure session', assistant: 'Arth-AI assistant', clarity: 'A little clarity goes a long way.', placeholder: 'Ask about your money...', send: 'Send', thinking: 'Thinking...', personalized: 'Personalized support', recommendationText: 'Recommendations based on recent activity and safety rules.', request: 'Request support', paused: 'Unavailable right now', audit: 'Auditor view', why: 'Why Arth-AI chose this path', simulatorTitle: 'Test the safety engine', simulatorText: 'Inject a UPI-like debit and watch the safety decision.', runCheck: 'Run safety check' },
  hi: { overview: 'खाता सारांश', conversation: 'बातचीत', explain: 'स्पष्टीकरण', simulator: 'सुरक्षा सिम्युलेटर', personal: 'व्यक्तिगत सारांश', morning: 'सुप्रभात', summary: 'आपके सफर के अनुसार आपके पैसे का संक्षिप्त विवरण।', balance: 'कुल उपलब्ध बैलेंस', stable: 'आपका खाता अच्छी स्थिति में है', support: 'सहायता मोड सक्रिय है', savings: 'बचत दर', spend: 'मासिक खर्च', payments: 'देखे गए भुगतान', rhythm: '30 दिन की लय', essentials: 'आवश्यक खर्च', activity: 'हाल की गतिविधि', recommendations: 'सुझाव', alerts: 'सुरक्षा चेतावनी', noAlerts: 'कोई सक्रिय चेतावनी नहीं है।', details: 'सुझाव देखें', accountHealth: 'खाते की स्थिति', lookingGood: 'सब ठीक है', supportMode: 'सहायता मोड', signOut: 'साइन आउट', secure: 'सुरक्षित सत्र', assistant: 'अर्थ-AI सहायक', clarity: 'आइए आपके पैसों को थोड़ा आसान बनाते हैं।', placeholder: 'अपने पैसों के बारे में पूछें...', send: 'भेजें', thinking: 'सोच रहा हूं...', personalized: 'व्यक्तिगत सहायता', recommendationText: 'हाल की गतिविधि और सुरक्षा नियमों पर आधारित सुझाव।', request: 'सहायता का अनुरोध', paused: 'अभी उपलब्ध नहीं', audit: 'ऑडिटर दृश्य', why: 'अर्थ-AI ने यह रास्ता क्यों चुना', simulatorTitle: 'सुरक्षा इंजन जांचें', simulatorText: 'UPI जैसा भुगतान डालकर सुरक्षा निर्णय देखें।', runCheck: 'सुरक्षा जांच चलाएं' },
  gu: { overview: 'ખાતા ઝાંખી', conversation: 'વાતચીત', explain: 'સમજૂતી', simulator: 'સુરક્ષા સિમ્યુલેટર', personal: 'વ્યક્તિગત ઝાંખી', morning: 'સુપ્રભાત', summary: 'તમારી નાણાકીય મુસાફરી મુજબ તમારા પૈસાની ઝાંખી.', balance: 'કુલ ઉપલબ્ધ બેલેન્સ', stable: 'તમારું ખાતું સારી સ્થિતિમાં છે', support: 'સહાય મોડ સક્રિય છે', savings: 'બચત દર', spend: 'માસિક ખર્ચ', payments: 'ચકાસેલા ચુકવણીઓ', rhythm: '30 દિવસની લય', essentials: 'જરૂરી ખર્ચ', activity: 'તાજેતરની પ્રવૃત્તિ', recommendations: 'ભલામણો', alerts: 'સુરક્ષા ચેતવણીઓ', noAlerts: 'કોઈ સક્રિય ચેતવણી નથી.', details: 'ભલામણો જુઓ', accountHealth: 'ખાતાની સ્થિતિ', lookingGood: 'બધું સારું છે', supportMode: 'સહાય મોડ', signOut: 'સાઇન આઉટ', secure: 'સુરક્ષિત સત્ર', assistant: 'અર્થ-AI સહાયક', clarity: 'ચાલો તમારા પૈસાને સમજવામાં સરળ બનાવીએ.', placeholder: 'તમારા પૈસા વિશે પૂછો...', send: 'મોકલો', thinking: 'વિચારી રહ્યા છીએ...', personalized: 'વ્યક્તિગત સહાય', recommendationText: 'તાજેતરની પ્રવૃત્તિ અને સુરક્ષા નિયમો પર આધારિત ભલામણો.', request: 'સહાય માંગો', paused: 'હાલ ઉપલબ્ધ નથી', audit: 'ઓડિટર દૃશ્ય', why: 'અર્થ-AI એ આ માર્ગ કેમ પસંદ કર્યો', simulatorTitle: 'સુરક્ષા એન્જિન તપાસો', simulatorText: 'UPI જેવું ચુકવણી દાખલ કરીને સુરક્ષા નિર્ણય જુઓ.', runCheck: 'સુરક્ષા તપાસ ચલાવો' },
} as const;
type TranslationCopy = { [Key in keyof typeof translations.en]: string };

const inputStyle = { display: "block", width: "100%", marginTop: 8, padding: "13px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", color: "var(--ink)" } as const;
const primaryButton = { marginTop: 24, width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 8, background: "var(--teal)", color: "white", fontWeight: 700, cursor: "pointer" } as const;
const choiceButton = { flex: 1, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "white", color: "var(--muted)", cursor: "pointer" } as const;
const selectedChoice = { borderColor: "var(--teal)", color: "var(--teal)", background: "#e6eefc", fontWeight: 700 } as const;

function Login({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState("9000000001");
  const [pin, setPin] = useState("1234");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    try {
      setSubmitting(true);
      setError('');
      const result = await api<{ access_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ phone, pin }) });
      localStorage.setItem('arthai_token', result.access_token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-grid" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 22 }}>
      <section className="card fade-up login-card" style={{ maxWidth: 880, width: '100%', padding: 0, overflow: 'hidden' }}>
        <div className="login-hero" style={{ padding: 40, color: 'white', background: 'linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, letterSpacing: '.06em' }}><ShieldCheck size={22} color="#79b3ff" /> ARTH-AI NET BANKING</div>
          <h1 className="display" style={{ fontSize: 34, lineHeight: 1.12, margin: '30px 0 14px' }}>Money that<br /><span style={{ color: '#79b3ff' }}>understands life.</span></h1>
          <p style={{ color: '#c3d4ec', lineHeight: 1.6, maxWidth: 340 }}>A calmer way to see your money, protect your payments, and find support when it matters.</p>
          <div style={{ marginTop: 'auto', paddingTop: 30, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {['256-bit encrypted session', 'RBI-guideline aligned fraud checks', 'Consent-based KYC, nothing stored beyond a mock reference'].map(line => (
              <div key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12, color: '#b7cdec' }}><CheckCircle2 size={15} style={{ flex: '0 0 auto', marginTop: 1, color: '#79b3ff' }} /> {line}</div>
            ))}
          </div>
        </div>
        <div style={{ padding: 40 }}>
          <p className="eyebrow" style={{ margin: 0 }}>SECURE LOGIN</p>
          <h2 className="display" style={{ fontSize: 24, margin: '10px 0 24px', color: 'var(--navy)' }}>Sign in to your account</h2>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>Mobile number
            <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', border: '1px solid var(--line)', borderRight: 0, borderRadius: '8px 0 0 8px', background: 'var(--paper)', color: 'var(--muted)', fontWeight: 700, fontSize: 13 }}>+91</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="numeric" style={{ ...inputStyle, marginTop: 0, borderRadius: '0 8px 8px 0' }} />
            </div>
          </label>
          <label style={{ display: 'block', marginTop: 16, fontSize: 13, fontWeight: 700 }}>PIN
            <div style={{ position: 'relative' }}>
              <input value={pin} onChange={e => setPin(e.target.value)} type={showPin ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: 44 }} />
              <button type="button" aria-label={showPin ? 'Hide PIN' : 'Show PIN'} onClick={() => setShowPin(current => !current)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 8 }}>{showPin ? 'Hide' : 'Show'}</button>
            </div>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <span style={{ color: 'var(--teal)', fontSize: 12, fontWeight: 700 }}>Forgot PIN?</span>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          <button onClick={submit} disabled={submitting} style={{ ...primaryButton, opacity: submitting ? .65 : 1, cursor: submitting ? 'wait' : 'pointer' }}>{submitting ? 'Signing you in...' : 'Enter your account'} {!submitting && <ArrowUpRight size={18} />}</button>
          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>Demo access: any seeded phone with PIN 1234</p>
        </div>
      </section>
    </main>
  );
}

function Kyc({ onComplete }: { onComplete: () => void }) {
  const [docType, setDocType] = useState<'aadhaar' | 'pan'>('pan');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      await api('/kyc/verify', { method: 'POST', body: JSON.stringify({ doc_type: docType, consent, locale: 'en' }) });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  return (
    <main className="app-grid" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 22 }}>
      <section className="card fade-up" style={{ maxWidth: 520, width: '100%', padding: 34 }}>
        <div style={{ color: 'var(--teal)', fontWeight: 700, letterSpacing: '.04em' }}>SECURE ONBOARDING</div>
        <h1 className="display" style={{ fontSize: 38, lineHeight: 1.1, margin: '28px 0 12px' }}>Let&apos;s verify<br /><span style={{ color: 'var(--teal)' }}>your identity.</span></h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>This is a mock DigiLocker check for the demo. We retain only the verification reference and your consent record, never an identity document image.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
          <button onClick={() => setDocType('pan')} style={{ ...choiceButton, ...(docType === 'pan' ? selectedChoice : {}) }}>PAN card</button>
          <button onClick={() => setDocType('aadhaar')} style={{ ...choiceButton, ...(docType === 'aadhaar' ? selectedChoice : {}) }}>Aadhaar</button>
        </div>
        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 28, color: 'var(--ink)', lineHeight: 1.5, fontSize: 14 }}>
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} style={{ marginTop: 4, accentColor: 'var(--teal)' }} />
          I consent to Arth-AI verifying this document for account onboarding and storing a timestamped consent record.
        </label>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        <button disabled={!consent} onClick={submit} style={{ ...primaryButton, opacity: consent ? 1 : .45, cursor: consent ? 'pointer' : 'not-allowed' }}>Continue securely <ArrowUpRight size={18} /></button>
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>{label}</p>
      <strong className="display" style={{ display: 'block', fontSize: 25, marginTop: 12 }}>{value}</strong>
      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{detail}</span>
    </div>
  );
}

function Overview({ data, copy, onDetails }: { data: Dashboard; copy: TranslationCopy; onDetails: () => void }) {
  return (
    <div className="fade-up">
      <div className="card" style={{ marginTop: 18, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'var(--teal)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Made for this moment</p>
            <h2 className="display" style={{ fontSize: 28, margin: '8px 0' }}>{data.offers[0]?.product_code?.replaceAll('_', ' ') || 'Your next good move'}</h2>
            <p style={{ color: 'var(--muted)', maxWidth: 480 }}>{data.offers[0]?.reason || 'Keep exploring your account to discover useful support.'}</p>
          </div>
          <span style={{ padding: 14, color: 'var(--gold)', background: '#fbf2df', borderRadius: '50%' }}><IndianRupee size={25} /></span>
        </div>
        <button onClick={onDetails} style={{ marginTop: 14, padding: '10px 0', border: 0, borderBottom: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)', fontWeight: 700, cursor: 'pointer' }}>{copy.details} <ChevronRight size={16} style={{ verticalAlign: 'middle' }} /></button>
      </div>
    </div>
  );
}

function Alerts({ data }: { data: Dashboard }) {
  return (
    <div className="fade-up" style={{ marginTop: 28 }}>
      {data.alerts.length ? data.alerts.map(alert => (
        <div className="card" key={alert.id} style={{ padding: 20, marginBottom: 12, borderLeft: `4px solid ${alert.type === 'fraud' ? 'var(--danger)' : alert.type === 'stress' ? 'var(--gold)' : 'var(--teal)'}` }}>
          <strong>{alert.type.toUpperCase()}</strong>
          <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{alert.message_en}</p>
        </div>
      )) : <p style={{ color: 'var(--muted)' }}>All clear. We will surface anything important here.</p>}
    </div>
  );
}

function RailAlerts({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return <section className="rail-section">
    <div className="rail-heading"><span><AlertCircle size={15} /> {copy.alerts}</span></div>
    {data.alerts.length ? data.alerts.slice(0, 3).map(alert => <div className="rail-alert" key={alert.id}>
      <span className={`rail-alert-icon ${alert.type === 'fraud' ? 'danger' : 'notice'}`}><AlertCircle size={15} /></span>
      <div><strong>{alert.type === 'fraud' ? 'Payment protection' : 'Cash-flow support'}</strong><p>{alert.message_en}</p></div>
    </div>) : <div className="rail-empty"><CheckCircle2 size={17} /><span>{copy.noAlerts}</span></div>}
  </section>;
}

function RailOffers({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return <section className="rail-section">
    <div className="rail-heading"><span><TrendingUp size={15} /> {copy.recommendations}</span></div>
    {data.offers.length ? data.offers.slice(0, 3).map(offer => <div className="rail-offer" key={offer.id}>
      <span className="offer-mark"><IndianRupee size={15} /></span>
      <span><strong>{offer.product_code.replaceAll('_', ' ')}</strong><small>{offer.blocked_by_ethics ? 'Paused by safety rules' : offer.reason}</small></span>
      <ChevronRight size={15} />
    </div>) : <div className="rail-empty"><Clock3 size={17} /><span>Recommendations will appear as your account evolves.</span></div>}
  </section>;
}

function RailActivity({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return <section className="rail-section activity-rail"><div className="rail-heading"><span><Clock3 size={15} /> {copy.activity}</span></div>{data.transactions.slice(0, 5).map(txn => <div className="activity-row" key={txn.id}><span className={txn.status === 'blocked' ? 'activity-icon blocked' : 'activity-icon'}>{txn.direction === 'debit' ? '−' : '+'}</span><span className="activity-name"><strong>{txn.payee}</strong><small>{txn.category}</small></span><strong className="activity-amount">{txn.direction === 'debit' ? '-' : '+'}{money(txn.amount)}</strong></div>)}</section>;
}

function Conversation({ chat, reply, ask, language, setLanguage, copy }: { chat: string; reply: string; ask: (message: string) => Promise<void>; language: string; setLanguage: (language: string) => void; copy: TranslationCopy }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const suggestions = language === 'hi'
    ? ['मेरा बैलेंस क्या है?', 'मेरे ऑफर दिखाएं', 'मुझे ग्रेस चाहिए', 'मेरी हाल की गतिविधि', 'भुगतान सुरक्षित है?']
    : language === 'gu'
      ? ['મારું બેલેન્સ શું છે?', 'મારી ઓફર્સ બતાવો', 'મને ગ્રેસ જોઈએ', 'મારી તાજેતરની પ્રવૃત્તિ', 'ચુકવણી સુરક્ષિત છે?']
      : ['What is my balance?', 'Show my offers', 'I need grace', 'Recent activity', 'Is my payment safe?'];
  const send = async (nextMessage = message) => {
    if (!nextMessage.trim() || sending) return;
    setSending(true);
    try {
      await ask(nextMessage.trim());
      setMessage('');
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="fade-up" style={{ marginTop: 28 }}>
      <div className="card" style={{ padding: 24, minHeight: 280 }}>
        <p style={{ color: 'var(--teal)', fontWeight: 700 }}>{copy.assistant}</p>
        <h2 className="display" style={{ fontSize: 28 }}>{copy.clarity}</h2>
        <div style={{ display: 'flex', gap: 8, margin: '18px 0', flexWrap: 'wrap' }}>
          {([['en', 'English'], ['hi', 'हिंदी'], ['gu', 'ગુજરાતી']] as const).map(([code, label]) => <button key={code} onClick={() => setLanguage(code)} style={{ ...choiceButton, flex: 'none', padding: '8px 12px', ...(language === code ? selectedChoice : {}) }}>{label}</button>)}
        </div>
        {chat && <p style={{ textAlign: 'right', color: 'var(--teal)' }}>{chat}</p>}
        {reply && <p style={{ background: '#e6eefc', padding: 14, borderRadius: 8, lineHeight: 1.5 }}>{reply}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 30 }}>
          {suggestions.map(item => (
            <button key={item} disabled={sending} onClick={() => void send(item)} style={{ border: '1px solid var(--line)', borderRadius: 999, background: 'white', padding: '9px 13px', color: 'var(--ink)', cursor: sending ? 'wait' : 'pointer', opacity: sending ? .6 : 1 }}>{item}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <input value={message} disabled={sending} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void send(); }} placeholder={copy.placeholder} style={{ ...inputStyle, marginTop: 0 }} />
          <button disabled={sending} onClick={() => void send()} style={{ ...primaryButton, width: 'auto', marginTop: 0, whiteSpace: 'nowrap', opacity: sending ? .65 : 1, cursor: sending ? 'wait' : 'pointer' }}>{sending ? copy.thinking : copy.send}</button>
        </div>
      </div>
    </div>
  );
}

function Offers({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  const [accepted, setAccepted] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const accept = async (id: string) => {
    try {
      setError('');
      setSubmitting(id);
      const result = await api<{ accepted: boolean; message?: string; reason?: string }>(`/offers/${id}/accept`, { method: 'POST' });
      setAccepted(result.accepted ? result.message || 'Your support request has been recorded.' : result.reason || 'This offer is paused for your protection.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not record your request. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };
  return <div className="fade-up" style={{ marginTop: 28 }}>
    <div className="card" style={{ padding: 24 }}>
      <p style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>{copy.personalized}</p>
      <h2 className="display" style={{ fontSize: 30 }}>{copy.recommendations}</h2>
      <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{copy.recommendationText}</p>
      {data.offers.length ? data.offers.map(offer => <div key={offer.id} style={{ padding: '18px 0', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}><strong style={{ fontSize: 18 }}>{offer.product_code.replaceAll('_', ' ')}</strong><span style={{ color: offer.blocked_by_ethics ? 'var(--danger)' : 'var(--teal)', fontSize: 12, fontWeight: 700 }}>{offer.blocked_by_ethics ? 'PAUSED BY ETHICS' : 'RECOMMENDED'}</span></div>
        <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{offer.reason}</p>
        <button disabled={offer.blocked_by_ethics || submitting === offer.id} onClick={() => void accept(offer.id)} style={{ border: '1px solid var(--teal)', borderRadius: 8, background: offer.blocked_by_ethics ? '#f1f1f1' : 'white', color: offer.blocked_by_ethics ? 'var(--muted)' : 'var(--teal)', padding: '9px 13px', cursor: offer.blocked_by_ethics ? 'not-allowed' : 'pointer' }}>{offer.blocked_by_ethics ? copy.paused : submitting === offer.id ? 'Recording...' : copy.request}</button>
      </div>) : <p style={{ color: 'var(--muted)' }}>No recommendations yet. Your next safe move will appear here.</p>}
      {accepted && <p role="status" style={{ color: 'var(--teal)', fontWeight: 700, marginTop: 18 }}>{accepted}</p>}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700, marginTop: 18 }}>{error}</p>}
    </div>
  </div>;
}

type UserExplanation = { user_id: string; segment: string; stress_flag: boolean; ethics_explanation: string };
type TxnExplanation = { id: string; status: string; fraud_score: number; features: Record<string, unknown>; fired_rules: string[]; explanation_en: string; explanation_hi: string };

function Explain({ data }: { data: Dashboard }) {
  const [userExplain, setUserExplain] = useState<UserExplanation | null>(null);
  const [userError, setUserError] = useState('');
  const [openTxnId, setOpenTxnId] = useState<string | null>(null);
  const [txnExplain, setTxnExplain] = useState<TxnExplanation | null>(null);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnError, setTxnError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<UserExplanation>(`/explain/user/${data.user.id}`)
      .then(result => { if (!cancelled) setUserExplain(result); })
      .catch(err => { if (!cancelled) setUserError(err instanceof Error ? err.message : 'Could not load the audit trail'); });
    return () => { cancelled = true; };
  }, [data.user.id]);

  const toggleTxn = async (id: string) => {
    if (openTxnId === id) { setOpenTxnId(null); setTxnExplain(null); return; }
    setOpenTxnId(id);
    setTxnExplain(null);
    setTxnError('');
    setTxnLoading(true);
    try {
      const result = await api<TxnExplanation>(`/explain/txn/${id}`);
      setTxnExplain(result);
    } catch (err) {
      setTxnError(err instanceof Error ? err.message : 'Could not load this transaction’s explanation');
    } finally {
      setTxnLoading(false);
    }
  };

  return (
    <div className="fade-up" style={{ marginTop: 28 }}>
      <div className="card" style={{ padding: 24 }}>
        <p style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>Auditor view</p>
        <h2 className="display" style={{ fontSize: 30 }}>Why Arth-AI chose this path</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>The system combines rolling behavior, transaction context, and hard safety rules. The assistant cannot override this gate.</p>
        {userError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{userError}</p>}
        <div style={{ marginTop: 24 }}>
          {[['Behavioral segment', (userExplain ?? data).segment], ['Stress flag', (userExplain ?? data).stress_flag ? 'Active: credit paused' : 'Clear'], ['Ethics decision', userExplain?.ethics_explanation ?? (data.stress_flag ? 'Grace support only' : 'Relevant offers allowed')]].map(([label, value]) => (
            <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>{String(label)}</span>
              <strong style={{ textAlign: 'right', maxWidth: 320 }}>{String(value)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <h3 className="display" style={{ fontSize: 20, margin: 0 }}>Per-transaction explanation</h3>
        <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>Pick a recent transaction to see the exact fired rules and feature values behind its fraud score.</p>
        {data.transactions.length === 0 && <p style={{ color: 'var(--muted)' }}>No transactions yet.</p>}
        {data.transactions.map(txn => (
          <div key={txn.id} style={{ borderBottom: '1px solid var(--line)' }}>
            <button onClick={() => void toggleTxn(txn.id)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '14px 0', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <span><strong>{txn.payee}</strong><br /><small style={{ color: 'var(--muted)' }}>{txn.category} · {txn.status} · score {txn.fraud_score}</small></span>
              <ChevronRight size={16} style={{ transform: openTxnId === txn.id ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {openTxnId === txn.id && (
              <div style={{ paddingBottom: 16 }}>
                {txnLoading && <p style={{ color: 'var(--muted)' }}>Loading explanation...</p>}
                {txnError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{txnError}</p>}
                {txnExplain && (
                  <div style={{ background: '#f7f9f8', borderRadius: 8, padding: 14 }}>
                    <p style={{ margin: 0 }}>{txnExplain.explanation_en}</p>
                    <p style={{ margin: '10px 0 4px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>Fired rules</p>
                    <p style={{ margin: 0 }}>{txnExplain.fired_rules.length ? txnExplain.fired_rules.join(', ') : 'None — no hard rule triggered'}</p>
                    <p style={{ margin: '10px 0 4px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>Features</p>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(txnExplain.features, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type TopupConfig = { enabled: boolean; key_id: string | null; max_amount: number };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the payment widget. Check your connection and try again.'));
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

function AddMoneyModal({ userName, onClose, onSuccess }: { userName: string; onClose: () => void; onSuccess: (message: string) => void }) {
  const [config, setConfig] = useState<TopupConfig | null>(null);
  const [amount, setAmount] = useState('2000');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<TopupConfig>('/wallet/topup/config').then(result => { if (!cancelled) setConfig(result); }).catch(() => { if (!cancelled) setConfig({ enabled: false, key_id: null, max_amount: 0 }); });
    return () => { cancelled = true; };
  }, []);

  const payWithRazorpay = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError('Enter a valid amount.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const order = await api<{ order_id: string; amount: number; currency: string; key_id: string }>('/wallet/topup/order', { method: 'POST', body: JSON.stringify({ amount: value }) });
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment widget failed to load.');
      const razorpay = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Arth-AI',
        description: 'Add money to your account',
        prefill: { name: userName },
        theme: { color: '#0b57b0' },
        handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          void (async () => {
            try {
              await api('/wallet/topup/verify', { method: 'POST', body: JSON.stringify(response) });
              onSuccess(`₹${value.toLocaleString('en-IN')} added to your account.`);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Payment succeeded but could not be confirmed. Contact support.');
            } finally {
              setSubmitting(false);
            }
          })();
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="card modal-card" onClick={event => event.stopPropagation()} style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>ADD MONEY</p>
            <h2 className="display" style={{ fontSize: 22, margin: '8px 0 0', color: 'var(--navy)' }}>Top up via Razorpay</h2>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
        </div>

        {config === null && <p style={{ color: 'var(--muted)', marginTop: 20 }}>Checking availability...</p>}

        {config && !config.enabled && (
          <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginTop: 20 }}>Add Money isn&apos;t configured in this environment yet — it needs a Razorpay key on the server. Once that&apos;s added, this will let you top up your balance with a real (test-mode) payment.</p>
        )}

        {config && config.enabled && (
          <>
            <label style={{ display: 'block', marginTop: 20, fontSize: 13, fontWeight: 700 }}>Amount (INR)
              <input value={amount} onChange={event => setAmount(event.target.value)} type="number" min={1} max={config.max_amount} style={inputStyle} />
            </label>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Maximum ₹{config.max_amount.toLocaleString('en-IN')} per top-up.</p>
            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
            <button onClick={() => void payWithRazorpay()} disabled={submitting} style={{ ...primaryButton, opacity: submitting ? .65 : 1, cursor: submitting ? 'wait' : 'pointer' }}>{submitting ? 'Opening secure checkout...' : `Pay ₹${amount || 0} with Razorpay`} {!submitting && <ArrowUpRight size={18} />}</button>
          </>
        )}
      </div>
    </div>
  );
}

function Simulator({ onComplete }: { onComplete: () => void }) {
  const [form, setForm] = useState({ amount: '48000', payee: 'New city transfer', lat: '28.61', lng: '77.20', device_id: 'new-device', ts: '' });
  const [result, setResult] = useState<{ status: string; fraud_score: number; category: string } | null>(null);
  const [error, setError] = useState('');

  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      setError('');
      const response = await api<{ status: string; fraud_score: number; category: string }>('/admin/simulate-txn', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(form.amount),
          direction: 'debit',
          payee: form.payee,
          lat: Number(form.lat),
          lng: Number(form.lng),
          device_id: form.device_id,
          ...(form.ts ? { ts: new Date(form.ts).toISOString() } : {}),
        }),
      });
      setResult(response);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    }
  };

  return (
    <div className="fade-up" style={{ marginTop: 28 }}>
      <div className="card" style={{ padding: 24 }}>
        <p style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>Live demo injector</p>
        <h2 className="display" style={{ fontSize: 30 }}>Test the safety engine</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>Inject a UPI-like debit and watch the server explain whether it posts or blocks.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 22 }}>
          {([['amount', 'Amount (INR)'], ['payee', 'Payee'], ['lat', 'Latitude'], ['lng', 'Longitude'], ['device_id', 'Device ID'], ['ts', 'Time (optional)']] as const).map(([key, label]) => (
            <label key={key} style={{ fontSize: 12, fontWeight: 700 }}>{label}
              <input
                type={key === 'ts' ? 'datetime-local' : key === 'amount' || key === 'lat' || key === 'lng' ? 'number' : 'text'}
                value={form[key]}
                onChange={event => update(key, event.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}
              />
            </label>
          ))}
        </div>
        {error && <p style={{ color: 'var(--danger)', marginTop: 16 }}>{error}</p>}
        {result && <div className="card" style={{ marginTop: 18, padding: 16, background: '#e6eefc' }}><strong>Status:</strong> {result.status}<br /><strong>Fraud score:</strong> {result.fraud_score}<br /><strong>Category:</strong> {result.category}</div>}
        <button onClick={submit} style={{ ...primaryButton, marginTop: 20 }}>Run safety check <ArrowUpRight size={18} /></button>
      </div>
    </div>
  );
}

function App() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [view, setView] = useState<View>('Overview');
  const [chat, setChat] = useState('');
  const [reply, setReply] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [showAddMoney, setShowAddMoney] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError('');
      setData(await api<Dashboard>('/dashboard'));
    } catch (error) {
      localStorage.removeItem('arthai_token');
      setAuthToken(null);
      setData(null);
      setLoadError(error instanceof Error ? error.message : 'Unable to load your account');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAuthReady(true);
    const token = localStorage.getItem('arthai_token');
    setAuthToken(token);
    if (token) void load();
    else setLoading(false);
  }, []);

  useEffect(() => {
    if (data?.user.lang && ['en', 'hi', 'gu'].includes(data.user.lang)) setLanguage(data.user.lang);
  }, [data?.user.lang]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state || {}), arthaiView: 'Overview' }, '');
    const handlePopState = (event: PopStateEvent) => setView(isView(event.state?.arthaiView) ? event.state.arthaiView : 'Overview');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextView: View) => {
    if (nextView === view) return;
    window.history.pushState({ ...(window.history.state || {}), arthaiView: nextView }, '');
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showNotifications = () => {
    const alert = data?.alerts[0];
    setToast(alert
      ? { title: alert.type === 'fraud' ? 'Payment protection alert' : 'Account support update', message: alert.message_en }
      : { title: 'No new alerts', message: 'Your account has no active security alerts.' });
  };

  if (!authReady) return <main style={{ padding: 40 }}>Preparing your account...</main>;
  if (!authToken && !data) return <Login onLogin={() => { setAuthToken(localStorage.getItem('arthai_token')); void load(); }} />;
  if (loading || !data) return <main className="loading-state"><div className="loading-spinner" /><strong>{loadError ? 'Your session needs attention' : 'Loading your account...'}</strong><p>{loadError || 'Connecting to your secure banking profile.'}</p>{loadError && <button onClick={() => { localStorage.removeItem('arthai_token'); setAuthToken(null); setLoadError(''); setLoading(false); }}>Return to sign in</button>}</main>;

  const dashboard = data;
  const copy = translations[language as keyof typeof translations] || translations.en;
  if (dashboard.user.kyc_status !== 'verified') return <Kyc onComplete={load} />;

  const nav: Array<{ label: View; text: string; icon: typeof LayoutDashboard }> = [{ label: 'Overview', text: copy.overview, icon: LayoutDashboard }, { label: 'Conversation', text: copy.conversation, icon: MessageCircle }, { label: 'Explain', text: copy.explain, icon: CircleHelp }, { label: 'Simulator', text: copy.simulator, icon: Zap }];

  const ask = async (message: string) => {
    setChat(message);
    try {
      const result = await api<{ reply: string }>('/chat', { method: 'POST', body: JSON.stringify({ message, lang: language }) });
      setReply(result.reply);
    } catch (err) {
      setReply(err instanceof Error ? err.message : 'I could not reach the assistant. Please try again.');
    }
  };

  return (
    <main className="bank-portal">
      {toast && <div className="toast" role="status"><span className="toast-icon"><Bell size={17} /></span><span><strong>{toast.title}</strong><small>{toast.message}</small></span><button aria-label="Dismiss alert" onClick={() => setToast(null)}><X size={16} /></button></div>}
      {showAddMoney && <AddMoneyModal userName={dashboard.user.name} onClose={() => setShowAddMoney(false)} onSuccess={message => { setShowAddMoney(false); setToast({ title: 'Money added', message }); void load(); }} />}
      <aside className="bank-sidebar">
        <div className="sidebar-brand"><span className="brand-icon"><ShieldCheck size={17} /></span><span>ARTH<span>-</span>AI</span></div>
        <div className="profile-mini"><span className="profile-avatar">{dashboard.user.name.slice(0, 1)}</span><span><strong>{dashboard.user.name}</strong><small>{dashboard.segment.replaceAll('_', ' ')}</small></span></div>
        <p className="side-label">YOUR BANKING</p>
        <nav className="side-nav">
          {nav.map(({ label, text, icon: Icon }) => <button className={view === label ? 'active' : ''} key={label} onClick={() => navigate(label)}><Icon size={17} /><span>{text}</span>{view === label && <ChevronRight size={14} />}</button>)}
        </nav>
        <p className="side-label side-label-lower">SECURITY</p>
        <div className="side-security"><ShieldCheck size={16} /><span><strong>Protected account</strong><small>Monitoring is active</small></span></div>
        <button className="side-signout" onClick={() => { localStorage.removeItem('arthai_token'); location.reload(); }}>Sign out</button>
      </aside>
      <section className="bank-content">
        <header className="bank-header"><div className="header-title"><span className="mobile-brand">ARTH-AI</span><span className="header-context">{copy.personal} / {view === 'Offers' ? copy.recommendations : nav.find(item => item.label === view)?.text}</span></div><div className="header-actions"><button className="header-icon" aria-label="Show notifications" onClick={showNotifications}><Bell size={17} />{dashboard.alerts.length > 0 && <i />}</button><span className="header-divider" /><span className="secure-label"><ShieldCheck size={14} /> {copy.secure}</span><div className="language-switcher">{(['en', 'hi', 'gu'] as const).map(code => <button className={language === code ? 'selected' : ''} key={code} onClick={() => setLanguage(code)}>{code.toUpperCase()}</button>)}</div></div></header>
        <div className="content-inner">
          <div className="portal-heading"><div>{view !== 'Overview' && <button className="back-button" onClick={() => navigate('Overview')}><ArrowLeft size={15} /> Back to overview</button>}<p className="eyebrow">{copy.personal.toUpperCase()}</p><h1 className="bank-title">{view === 'Overview' ? `${copy.morning}, ${dashboard.user.name.split(' ')[0]}` : view === 'Offers' ? copy.recommendations : nav.find(item => item.label === view)?.text}</h1><p className="welcome-copy">{view === 'Overview' ? copy.summary : 'Use the navigation or your browser back button to return to your account overview.'}</p></div><span className="date-stamp">12 September 2026</span></div>
          {view === 'Overview' && <><div className="account-summary"><div className="summary-balance"><span className="balance-label">{copy.balance.toUpperCase()}</span><strong>{money(dashboard.balance)}</strong><p><span className="positive-dot" /> {dashboard.stress_flag ? copy.support : copy.stable}</p></div><div className="summary-account"><span>PRIMARY SAVINGS</span><strong>•••• 0001</strong><small>Last updated just now</small></div><div className="summary-action"><button onClick={() => setShowAddMoney(true)}><IndianRupee size={16} /> Add money</button><button onClick={() => navigate('Simulator')}><ArrowUpRight size={16} /> {copy.simulator}</button></div></div><div className="summary-metrics"><Metric label={copy.savings} value={`${Math.round((dashboard.features.savings_rate || 0) * 100)}%`} detail={copy.rhythm} /><Metric label={copy.spend} value={money(dashboard.features.spend_30d || 0)} detail={copy.essentials} /><Metric label={copy.payments} value={`${dashboard.transactions.length}`} detail={copy.activity} /></div></>}
          <div className="workspace-view">
            {view === 'Overview' && <Overview data={dashboard} copy={copy} onDetails={() => navigate('Offers')} />}
            {view === 'Offers' && <Offers data={dashboard} copy={copy} />}
            {view === 'Conversation' && <Conversation chat={chat} reply={reply} ask={ask} language={language} setLanguage={setLanguage} copy={copy} />}
            {view === 'Explain' && <Explain data={dashboard} />}
            {view === 'Simulator' && <Simulator onComplete={load} />}
          </div>
        </div>
      </section>
      <aside className="bank-rail"><div className="rail-account"><div className="rail-account-top"><span>{copy.accountHealth.toUpperCase()}</span><span className="health-dot" /></div><strong>{dashboard.stress_flag ? copy.supportMode : copy.lookingGood}</strong><p>{dashboard.stress_flag ? copy.support : copy.stable}</p><div className="health-bar"><span style={{ width: dashboard.stress_flag ? '48%' : '78%' }} /></div></div><RailAlerts data={dashboard} copy={copy} /><RailOffers data={dashboard} copy={copy} /><RailActivity data={dashboard} copy={copy} /></aside>
    </main>
  );
}

export default function Page() {
  return <App />;
}
