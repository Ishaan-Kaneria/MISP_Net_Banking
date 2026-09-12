"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowUpRight, Bell, CheckCircle2, ChevronRight, CircleHelp, Clock3, IndianRupee, LayoutDashboard, MessageCircle, ShieldCheck, TrendingUp, X, Zap } from "lucide-react";
import { api } from "../lib/api";

type Dashboard = {
  user: { name: string; lang: string; kyc_status: string };
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
  en: { overview: 'Accounts overview', conversation: 'Conversation', explain: 'Explainability', simulator: 'Safety simulator', personal: 'Personal overview', morning: 'Good morning', summary: 'Your money at a glance, with decisions shaped around your journey.', balance: 'Total available balance', stable: 'Your account is in good standing', support: 'Support mode is active', savings: 'Savings rate', spend: 'Monthly spend', payments: 'Payments watched', rhythm: '30 day rhythm', essentials: 'Across essentials', activity: 'Recent activity', recommendations: 'Recommendations', alerts: 'Security alerts', noAlerts: 'No active alerts. Your account is clear.', details: 'See recommendations', accountHealth: 'Account health', lookingGood: 'Looking good', supportMode: 'Support mode', signOut: 'Sign out', secure: 'Secure session', assistant: 'Arth-AI assistant', clarity: 'A little clarity goes a long way.', placeholder: 'Ask about your money...', send: 'Send', personalized: 'Personalized support', recommendationText: 'Recommendations based on recent activity and safety rules.', request: 'Request support', paused: 'Unavailable right now', audit: 'Auditor view', why: 'Why Arth-AI chose this path', simulatorTitle: 'Test the safety engine', simulatorText: 'Inject a UPI-like debit and watch the safety decision.', runCheck: 'Run safety check' },
  hi: { overview: 'खाता सारांश', conversation: 'बातचीत', explain: 'स्पष्टीकरण', simulator: 'सुरक्षा सिम्युलेटर', personal: 'व्यक्तिगत सारांश', morning: 'सुप्रभात', summary: 'आपके सफर के अनुसार आपके पैसे का संक्षिप्त विवरण।', balance: 'कुल उपलब्ध बैलेंस', stable: 'आपका खाता अच्छी स्थिति में है', support: 'सहायता मोड सक्रिय है', savings: 'बचत दर', spend: 'मासिक खर्च', payments: 'देखे गए भुगतान', rhythm: '30 दिन की लय', essentials: 'आवश्यक खर्च', activity: 'हाल की गतिविधि', recommendations: 'सुझाव', alerts: 'सुरक्षा चेतावनी', noAlerts: 'कोई सक्रिय चेतावनी नहीं है।', details: 'सुझाव देखें', accountHealth: 'खाते की स्थिति', lookingGood: 'सब ठीक है', supportMode: 'सहायता मोड', signOut: 'साइन आउट', secure: 'सुरक्षित सत्र', assistant: 'अर्थ-AI सहायक', clarity: 'आइए आपके पैसों को थोड़ा आसान बनाते हैं।', placeholder: 'अपने पैसों के बारे में पूछें...', send: 'भेजें', personalized: 'व्यक्तिगत सहायता', recommendationText: 'हाल की गतिविधि और सुरक्षा नियमों पर आधारित सुझाव।', request: 'सहायता का अनुरोध', paused: 'अभी उपलब्ध नहीं', audit: 'ऑडिटर दृश्य', why: 'अर्थ-AI ने यह रास्ता क्यों चुना', simulatorTitle: 'सुरक्षा इंजन जांचें', simulatorText: 'UPI जैसा भुगतान डालकर सुरक्षा निर्णय देखें।', runCheck: 'सुरक्षा जांच चलाएं' },
  gu: { overview: 'ખાતા ઝાંખી', conversation: 'વાતચીત', explain: 'સમજૂતી', simulator: 'સુરક્ષા સિમ્યુલેટર', personal: 'વ્યક્તિગત ઝાંખી', morning: 'સુપ્રભાત', summary: 'તમારી નાણાકીય મુસાફરી મુજબ તમારા પૈસાની ઝાંખી.', balance: 'કુલ ઉપલબ્ધ બેલેન્સ', stable: 'તમારું ખાતું સારી સ્થિતિમાં છે', support: 'સહાય મોડ સક્રિય છે', savings: 'બચત દર', spend: 'માસિક ખર્ચ', payments: 'ચકાસેલા ચુકવણીઓ', rhythm: '30 દિવસની લય', essentials: 'જરૂરી ખર્ચ', activity: 'તાજેતરની પ્રવૃત્તિ', recommendations: 'ભલામણો', alerts: 'સુરક્ષા ચેતવણીઓ', noAlerts: 'કોઈ સક્રિય ચેતવણી નથી.', details: 'ભલામણો જુઓ', accountHealth: 'ખાતાની સ્થિતિ', lookingGood: 'બધું સારું છે', supportMode: 'સહાય મોડ', signOut: 'સાઇન આઉટ', secure: 'સુરક્ષિત સત્ર', assistant: 'અર્થ-AI સહાયક', clarity: 'ચાલો તમારા પૈસાને સમજવામાં સરળ બનાવીએ.', placeholder: 'તમારા પૈસા વિશે પૂછો...', send: 'મોકલો', personalized: 'વ્યક્તિગત સહાય', recommendationText: 'તાજેતરની પ્રવૃત્તિ અને સુરક્ષા નિયમો પર આધારિત ભલામણો.', request: 'સહાય માંગો', paused: 'હાલ ઉપલબ્ધ નથી', audit: 'ઓડિટર દૃશ્ય', why: 'અર્થ-AI એ આ માર્ગ કેમ પસંદ કર્યો', simulatorTitle: 'સુરક્ષા એન્જિન તપાસો', simulatorText: 'UPI જેવું ચુકવણી દાખલ કરીને સુરક્ષા નિર્ણય જુઓ.', runCheck: 'સુરક્ષા તપાસ ચલાવો' },
} as const;
type TranslationCopy = { [Key in keyof typeof translations.en]: string };

const inputStyle = { display: "block", width: "100%", marginTop: 8, padding: "13px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", color: "var(--ink)" } as const;
const primaryButton = { marginTop: 24, width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 8, background: "var(--teal)", color: "white", fontWeight: 700, cursor: "pointer" } as const;
const choiceButton = { flex: 1, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "white", color: "var(--muted)", cursor: "pointer" } as const;
const selectedChoice = { borderColor: "var(--teal)", color: "var(--teal)", background: "#e9f3ee", fontWeight: 700 } as const;

function Login({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState("9000000001");
  const [pin, setPin] = useState("1234");
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
      <section className="card fade-up" style={{ maxWidth: 460, width: '100%', padding: 34 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--teal)', fontWeight: 700 }}><ShieldCheck size={22} /> ARTH-AI</div>
        <h1 className="display" style={{ fontSize: 42, lineHeight: 1.05, margin: '34px 0 12px' }}>Money that<br /><span style={{ color: 'var(--teal)' }}>understands life.</span></h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>A calmer way to see your money, protect your payments, and find support when it matters.</p>

        <label style={{ display: 'block', marginTop: 28, fontSize: 13, fontWeight: 700 }}>Mobile number<input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 16, fontSize: 13, fontWeight: 700 }}>PIN<input value={pin} onChange={e => setPin(e.target.value)} type="password" style={inputStyle} /></label>
        {error && <p style={{ color: '#b34d4d', fontSize: 13 }}>{error}</p>}
        <button onClick={submit} disabled={submitting} style={{ ...primaryButton, opacity: submitting ? .65 : 1, cursor: submitting ? 'wait' : 'pointer' }}>{submitting ? 'Signing you in...' : 'Enter your account'} {!submitting && <ArrowUpRight size={18} />}</button>
        <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>Demo access: any seeded phone with PIN 1234</p>
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
        {error && <p style={{ color: '#b34d4d', fontSize: 13 }}>{error}</p>}
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
            <h2 className="display" style={{ fontSize: 28, margin: '8px 0' }}>{data.offers[0]?.product_code?.replace('_', ' ') || 'Your next good move'}</h2>
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
        <div className="card" key={alert.id} style={{ padding: 20, marginBottom: 12, borderLeft: `4px solid ${alert.type === 'fraud' ? '#b34d4d' : alert.type === 'stress' ? 'var(--gold)' : 'var(--teal)'}` }}>
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
      <span><strong>{offer.product_code.replace('_', ' ')}</strong><small>{offer.blocked_by_ethics ? 'Paused by safety rules' : offer.reason}</small></span>
      <ChevronRight size={15} />
    </div>) : <div className="rail-empty"><Clock3 size={17} /><span>Recommendations will appear as your account evolves.</span></div>}
  </section>;
}

function RailActivity({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return <section className="rail-section activity-rail"><div className="rail-heading"><span><Clock3 size={15} /> {copy.activity}</span></div>{data.transactions.slice(0, 5).map(txn => <div className="activity-row" key={txn.id}><span className={txn.status === 'blocked' ? 'activity-icon blocked' : 'activity-icon'}>{txn.direction === 'debit' ? '−' : '+'}</span><span className="activity-name"><strong>{txn.payee}</strong><small>{txn.category}</small></span><strong className="activity-amount">{txn.direction === 'debit' ? '-' : '+'}{money(txn.amount)}</strong></div>)}</section>;
}

function Conversation({ chat, reply, ask, language, setLanguage, copy }: { chat: string; reply: string; ask: (message: string) => void; language: string; setLanguage: (language: string) => void; copy: TranslationCopy }) {
  const [message, setMessage] = useState('');
  const suggestions = language === 'hi'
    ? ['मेरा बैलेंस क्या है?', 'मेरे ऑफर दिखाएं', 'मुझे ग्रेस चाहिए', 'मेरी हाल की गतिविधि', 'भुगतान सुरक्षित है?']
    : language === 'gu'
      ? ['મારું બેલેન્સ શું છે?', 'મારી ઓફર્સ બતાવો', 'મને ગ્રેસ જોઈએ', 'મારી તાજેતરની પ્રવૃત્તિ', 'ચુકવણી સુરક્ષિત છે?']
      : ['What is my balance?', 'Show my offers', 'I need grace', 'Recent activity', 'Is my payment safe?'];
  const send = () => { if (message.trim()) { ask(message.trim()); setMessage(''); } };
  return (
    <div className="fade-up" style={{ marginTop: 28 }}>
      <div className="card" style={{ padding: 24, minHeight: 280 }}>
        <p style={{ color: 'var(--teal)', fontWeight: 700 }}>{copy.assistant}</p>
        <h2 className="display" style={{ fontSize: 28 }}>{copy.clarity}</h2>
        <div style={{ display: 'flex', gap: 8, margin: '18px 0', flexWrap: 'wrap' }}>
          {([['en', 'English'], ['hi', 'हिंदी'], ['gu', 'ગુજરાતી']] as const).map(([code, label]) => <button key={code} onClick={() => setLanguage(code)} style={{ ...choiceButton, flex: 'none', padding: '8px 12px', ...(language === code ? selectedChoice : {}) }}>{label}</button>)}
        </div>
        {chat && <p style={{ textAlign: 'right', color: 'var(--teal)' }}>{chat}</p>}
        {reply && <p style={{ background: '#eef4ef', padding: 14, borderRadius: 8, lineHeight: 1.5 }}>{reply}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 30 }}>
          {suggestions.map(item => (
            <button key={item} onClick={() => ask(item)} style={{ border: '1px solid var(--line)', borderRadius: 999, background: 'white', padding: '9px 13px', color: 'var(--ink)', cursor: 'pointer' }}>{item}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <input value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') send(); }} placeholder={copy.placeholder} style={{ ...inputStyle, marginTop: 0 }} />
          <button onClick={send} style={{ ...primaryButton, width: 'auto', marginTop: 0, whiteSpace: 'nowrap' }}>{copy.send}</button>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}><strong style={{ fontSize: 18 }}>{offer.product_code.replace('_', ' ')}</strong><span style={{ color: offer.blocked_by_ethics ? '#b34d4d' : 'var(--teal)', fontSize: 12, fontWeight: 700 }}>{offer.blocked_by_ethics ? 'PAUSED BY ETHICS' : 'RECOMMENDED'}</span></div>
        <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{offer.reason}</p>
        <button disabled={offer.blocked_by_ethics || submitting === offer.id} onClick={() => void accept(offer.id)} style={{ border: '1px solid var(--teal)', borderRadius: 8, background: offer.blocked_by_ethics ? '#f1f1f1' : 'white', color: offer.blocked_by_ethics ? 'var(--muted)' : 'var(--teal)', padding: '9px 13px', cursor: offer.blocked_by_ethics ? 'not-allowed' : 'pointer' }}>{offer.blocked_by_ethics ? copy.paused : submitting === offer.id ? 'Recording...' : copy.request}</button>
      </div>) : <p style={{ color: 'var(--muted)' }}>No recommendations yet. Your next safe move will appear here.</p>}
      {accepted && <p role="status" style={{ color: 'var(--teal)', fontWeight: 700, marginTop: 18 }}>{accepted}</p>}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700, marginTop: 18 }}>{error}</p>}
    </div>
  </div>;
}

function Explain({ data }: { data: Dashboard }) {
  return (
    <div className="fade-up" style={{ marginTop: 28 }}>
      <div className="card" style={{ padding: 24 }}>
        <p style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>Auditor view</p>
        <h2 className="display" style={{ fontSize: 30 }}>Why Arth-AI chose this path</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>The system combines rolling behavior, transaction context, and hard safety rules. The assistant cannot override this gate.</p>
        <div style={{ marginTop: 24 }}>
          {[['Behavioral segment', data.segment], ['Stress flag', data.stress_flag ? 'Active: credit paused' : 'Clear'], ['Ethics decision', data.stress_flag ? 'Grace support only' : 'Relevant offers allowed']].map(([label, value]) => (
            <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>{String(label)}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
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
        {error && <p style={{ color: '#b34d4d', marginTop: 16 }}>{error}</p>}
        {result && <div className="card" style={{ marginTop: 18, padding: 16, background: '#eef5f1' }}><strong>Status:</strong> {result.status}<br /><strong>Fraud score:</strong> {result.fraud_score}<br /><strong>Category:</strong> {result.category}</div>}
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
      <aside className="bank-sidebar">
        <div className="sidebar-brand"><span className="brand-icon"><ShieldCheck size={17} /></span><span>ARTH<span>-</span>AI</span></div>
        <div className="profile-mini"><span className="profile-avatar">{dashboard.user.name.slice(0, 1)}</span><span><strong>{dashboard.user.name}</strong><small>{dashboard.segment.replace('_', ' ')}</small></span></div>
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
          {view === 'Overview' && <><div className="account-summary"><div className="summary-balance"><span className="balance-label">{copy.balance.toUpperCase()}</span><strong>{money(dashboard.balance)}</strong><p><span className="positive-dot" /> {dashboard.stress_flag ? copy.support : copy.stable}</p></div><div className="summary-account"><span>PRIMARY SAVINGS</span><strong>•••• 0001</strong><small>Last updated just now</small></div><div className="summary-action"><button onClick={() => navigate('Simulator')}><ArrowUpRight size={16} /> {copy.simulator}</button></div></div><div className="summary-metrics"><Metric label={copy.savings} value={`${Math.round((dashboard.features.savings_rate || 0) * 100)}%`} detail={copy.rhythm} /><Metric label={copy.spend} value={money(dashboard.features.spend_30d || 0)} detail={copy.essentials} /><Metric label={copy.payments} value={`${dashboard.transactions.length}`} detail={copy.activity} /></div></>}
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
