"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Bell, CheckCircle2, ChevronRight, CircleHelp, Clock3, IndianRupee, LayoutDashboard, MessageCircle, ShieldCheck, TrendingUp, WalletCards, X, Zap } from "lucide-react";
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

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

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

function Overview({ data }: { data: Dashboard }) {
  return (
    <div className="fade-up">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 28 }}>
        <Metric label="Savings rate" value={`${Math.round((data.features.savings_rate || 0) * 100)}%`} detail="30 day rhythm" />
        <Metric label="Spend this month" value={money(data.features.spend_30d || 0)} detail="Across your essentials" />
        <Metric label="Payments watched" value={`${data.transactions.length}`} detail="Recent activity" />
      </div>
      <div className="card" style={{ marginTop: 18, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'var(--teal)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Made for this moment</p>
            <h2 className="display" style={{ fontSize: 28, margin: '8px 0' }}>{data.offers[0]?.product_code?.replace('_', ' ') || 'Your next good move'}</h2>
            <p style={{ color: 'var(--muted)', maxWidth: 480 }}>{data.offers[0]?.reason || 'Keep exploring your account to discover useful support.'}</p>
          </div>
          <span style={{ padding: 14, color: 'var(--gold)', background: '#fbf2df', borderRadius: '50%' }}><IndianRupee size={25} /></span>
        </div>
        <button style={{ marginTop: 14, padding: '10px 0', border: 0, borderBottom: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)', fontWeight: 700 }}>See the details <ChevronRight size={16} style={{ verticalAlign: 'middle' }} /></button>
      </div>

      <h3 style={{ margin: '32px 0 12px', fontSize: 16 }}>Recent activity</h3>
      {data.transactions.slice(0, 5).map(txn => (
        <div key={txn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 8, background: txn.status === 'blocked' ? '#fbe8e6' : '#eef5f1', color: txn.status === 'blocked' ? '#b34d4d' : 'var(--teal)' }}>{txn.direction === 'debit' ? '↓' : '↑'}</span>
            <div>
              <strong>{txn.payee}</strong>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{txn.category}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong>{txn.direction === 'debit' ? '-' : '+'}{money(txn.amount)}</strong>
            <div style={{ color: txn.status === 'blocked' ? '#b34d4d' : 'var(--muted)', fontSize: 12 }}>{txn.status}</div>
          </div>
        </div>
      ))}
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

function RailAlerts({ data, onSelect }: { data: Dashboard; onSelect: (view: string) => void }) {
  return <section className="rail-section">
    <div className="rail-heading"><span><AlertCircle size={15} /> Security alerts</span><button onClick={() => onSelect('Alerts')}>View all</button></div>
    {data.alerts.length ? data.alerts.slice(0, 3).map(alert => <div className="rail-alert" key={alert.id}>
      <span className={`rail-alert-icon ${alert.type === 'fraud' ? 'danger' : 'notice'}`}><AlertCircle size={15} /></span>
      <div><strong>{alert.type === 'fraud' ? 'Payment protection' : 'Cash-flow support'}</strong><p>{alert.message_en}</p></div>
    </div>) : <div className="rail-empty"><CheckCircle2 size={17} /><span>No active alerts. Your account is clear.</span></div>}
  </section>;
}

function RailOffers({ data, onSelect }: { data: Dashboard; onSelect: (view: string) => void }) {
  return <section className="rail-section">
    <div className="rail-heading"><span><TrendingUp size={15} /> For you</span><button onClick={() => onSelect('Offers')}>See all</button></div>
    {data.offers.length ? data.offers.slice(0, 3).map(offer => <button className="rail-offer" key={offer.id} onClick={() => onSelect('Offers')}>
      <span className="offer-mark"><IndianRupee size={15} /></span>
      <span><strong>{offer.product_code.replace('_', ' ')}</strong><small>{offer.blocked_by_ethics ? 'Paused by safety rules' : offer.reason}</small></span>
      <ChevronRight size={15} />
    </button>) : <div className="rail-empty"><Clock3 size={17} /><span>Recommendations will appear as your account evolves.</span></div>}
  </section>;
}

function Conversation({ chat, reply, ask, language, setLanguage }: { chat: string; reply: string; ask: (message: string) => void; language: string; setLanguage: (language: string) => void }) {
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
        <p style={{ color: 'var(--teal)', fontWeight: 700 }}>Arth-AI assistant</p>
        <h2 className="display" style={{ fontSize: 28 }}>A little clarity goes a long way.</h2>
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
          <input value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') send(); }} placeholder="Ask about your money..." style={{ ...inputStyle, marginTop: 0 }} />
          <button onClick={send} style={{ ...primaryButton, width: 'auto', marginTop: 0, whiteSpace: 'nowrap' }}>Send</button>
        </div>
      </div>
    </div>
  );
}

function Offers({ data }: { data: Dashboard }) {
  const [accepted, setAccepted] = useState<string | null>(null);
  const accept = async (id: string) => {
    const result = await api<{ accepted: boolean; message?: string; reason?: string }>(`/offers/${id}/accept`, { method: 'POST' });
    setAccepted(result.accepted ? `${id}: request recorded` : result.reason || 'This offer is paused for your protection.');
  };
  return <div className="fade-up" style={{ marginTop: 28 }}>
    <div className="card" style={{ padding: 24 }}>
      <p style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>Personalized support</p>
      <h2 className="display" style={{ fontSize: 30 }}>Recommendations for your next move</h2>
      <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>These recommendations are based on your recent activity and safety rules. Credit is never pushed when your cash flow is under stress.</p>
      {data.offers.length ? data.offers.map(offer => <div key={offer.id} style={{ padding: '18px 0', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}><strong style={{ fontSize: 18 }}>{offer.product_code.replace('_', ' ')}</strong><span style={{ color: offer.blocked_by_ethics ? '#b34d4d' : 'var(--teal)', fontSize: 12, fontWeight: 700 }}>{offer.blocked_by_ethics ? 'PAUSED BY ETHICS' : 'RECOMMENDED'}</span></div>
        <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{offer.reason}</p>
        <button disabled={offer.blocked_by_ethics} onClick={() => void accept(offer.id)} style={{ border: '1px solid var(--teal)', borderRadius: 8, background: offer.blocked_by_ethics ? '#f1f1f1' : 'white', color: offer.blocked_by_ethics ? 'var(--muted)' : 'var(--teal)', padding: '9px 13px', cursor: offer.blocked_by_ethics ? 'not-allowed' : 'pointer' }}>{offer.blocked_by_ethics ? 'Unavailable right now' : 'Request support'}</button>
      </div>) : <p style={{ color: 'var(--muted)' }}>No recommendations yet. Your next safe move will appear here.</p>}
      {accepted && <p style={{ color: 'var(--teal)', fontWeight: 700, marginTop: 18 }}>{accepted}</p>}
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
  const [view, setView] = useState('Overview');
  const [chat, setChat] = useState('');
  const [reply, setReply] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  const load = async () => {
    try {
      setData(await api<Dashboard>('/dashboard'));
    } catch {
      localStorage.removeItem('arthai_token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAuthReady(true);
    if (localStorage.getItem('arthai_token')) void load();
    else setLoading(false);
  }, []);

  useEffect(() => {
    if (data?.alerts.length) {
      const alert = data.alerts[0];
      setToast({ title: alert.type === 'fraud' ? 'Payment protection alert' : 'Account support update', message: alert.message_en });
      const timer = window.setTimeout(() => setToast(null), 7000);
      return () => window.clearTimeout(timer);
    }
  }, [data?.alerts]);

  if (!authReady) return <main style={{ padding: 40 }}>Preparing your account...</main>;
  if (!localStorage.getItem('arthai_token') && !data) return <Login onLogin={load} />;
  if (loading || !data) return <main style={{ padding: 40 }}>Loading your account...</main>;

  const dashboard = data;
  if (dashboard.user.kyc_status !== 'verified') return <Kyc onComplete={load} />;

  const nav = [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Offers', icon: WalletCards }, { label: 'Alerts', icon: Bell }, { label: 'Conversation', icon: MessageCircle }, { label: 'Explain', icon: CircleHelp }, { label: 'Simulator', icon: Zap }];

  const ask = async (message: string) => {
    setChat(message);
    const result = await api<{ reply: string }>('/chat', { method: 'POST', body: JSON.stringify({ message, lang: language }) });
    setReply(result.reply);
  };

  return (
    <main className="app-grid">
      {toast && <div className="toast" role="status"><span className="toast-icon"><Bell size={17} /></span><span><strong>{toast.title}</strong><small>{toast.message}</small></span><button aria-label="Dismiss alert" onClick={() => setToast(null)}><X size={16} /></button></div>}
      <div className="shell">
        <header className="topbar">
          <div className="brand-lockup">
            <span className="brand-icon"><ShieldCheck size={17} /></span><span>ARTH-AI</span><span className="brand-divider" /> <span className="brand-context">Personal banking</span>
          </div>
          <div className="top-actions">
            <span className="secure-label"><ShieldCheck size={14} /> Secure session</span>
            <span className="nav-link">EN / HI / GU</span>
            <button className="signout" onClick={() => { localStorage.removeItem('arthai_token'); location.reload(); }}>Sign out</button>
          </div>
        </header>

        <div className="dashboard-grid">
          <section>
            <div className="welcome-row"><div><p className="eyebrow">PERSONAL OVERVIEW</p><h1 className="bank-title">Good morning, {dashboard.user.name.split(' ')[0]}</h1><p className="welcome-copy">Here is your financial picture for today, shaped around your {dashboard.segment.toLowerCase().replace('_', ' ')} journey.</p></div><span className="date-stamp">12 September 2026</span></div>

            <div className="balance-hero"><div><span className="balance-label">TOTAL AVAILABLE BALANCE</span><strong>{money(dashboard.balance)}</strong><p><span className="positive-dot" /> Your account is {dashboard.stress_flag ? 'under review for support' : 'in a stable position'}</p></div><div className="balance-meta"><span>Account ending</span><strong>•••• 0001</strong><span>Last updated just now</span></div></div>

            <nav className="dashboard-nav">
              {nav.map(({ label, icon: Icon }) => (
                <button key={label} onClick={() => setView(label)} style={{ whiteSpace: 'nowrap', padding: '0 0 14px', border: 0, borderBottom: view === label ? '2px solid var(--teal)' : '2px solid transparent', background: 'transparent', color: view === label ? 'var(--teal)' : 'var(--muted)', fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 7, alignItems: 'center' }}><Icon size={16} />{label}</button>
              ))}
            </nav>

            {view === 'Overview' && <Overview data={dashboard} />}
            {view === 'Offers' && <Offers data={dashboard} />}
            {view === 'Alerts' && <Alerts data={dashboard} />}
            {view === 'Conversation' && <Conversation chat={chat} reply={reply} ask={ask} language={language} setLanguage={setLanguage} />}
            {view === 'Explain' && <Explain data={dashboard} />}
            {view === 'Simulator' && <Simulator onComplete={load} />}
          </section>

          <aside className="right-rail">
            <div className="rail-account"><div className="rail-account-top"><span>ACCOUNT HEALTH</span><span className="health-dot" /></div><strong>{dashboard.stress_flag ? 'Support mode' : 'Looking good'}</strong><p>{dashboard.stress_flag ? 'We are keeping credit decisions paused while we protect your cash flow.' : 'Your spending and saving rhythm is currently stable.'}</p><div className="health-bar"><span style={{ width: dashboard.stress_flag ? '48%' : '78%' }} /></div></div>
            <RailAlerts data={dashboard} onSelect={setView} />
            <RailOffers data={dashboard} onSelect={setView} />
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return <App />;
}
