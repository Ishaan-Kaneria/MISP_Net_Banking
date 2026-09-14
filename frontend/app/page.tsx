"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, CircleHelp, LayoutDashboard, MessageCircle, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { copyFor } from "../lib/translations";
import { isLanguage, rememberLanguage, storedLanguage } from "../lib/language";
import { isView, type ChatTurn, type Dashboard, type Language, type View } from "../lib/types";
import { Login } from "../components/Login";
import { Kyc } from "../components/Kyc";
import { Sidebar } from "../components/layout/Sidebar";
import { Header } from "../components/layout/Header";
import { RailAccount, RailAlerts, RailOffers, RailActivity } from "../components/layout/Rail";
import { Overview } from "../components/views/Overview";

// Code-split the views that aren't shown on first paint: everyone lands on
// Overview, so Offers/Conversation/Explain/Simulator (and the Razorpay
// widget loader inside AddMoneyModal) only need to download once a visitor
// actually navigates to them, instead of blocking the first render of the
// whole app.
const Offers = dynamic(() => import("../components/views/Offers").then(m => m.Offers), { ssr: false, loading: () => <ViewSkeleton /> });
const Conversation = dynamic(() => import("../components/views/Conversation").then(m => m.Conversation), { ssr: false, loading: () => <ViewSkeleton /> });
const Explain = dynamic(() => import("../components/views/Explain").then(m => m.Explain), { ssr: false, loading: () => <ViewSkeleton /> });
const Simulator = dynamic(() => import("../components/views/Simulator").then(m => m.Simulator), { ssr: false, loading: () => <ViewSkeleton /> });
const Verification = dynamic(() => import("../components/views/Verification").then(m => m.Verification), { ssr: false, loading: () => <ViewSkeleton /> });
const AddMoneyModal = dynamic(() => import("../components/modals/AddMoneyModal").then(m => m.AddMoneyModal), { ssr: false });

function ViewSkeleton() {
  return <div className="mt-7 h-64 animate-pulse rounded-xl border border-border bg-white" />;
}

// Every view reachable from the sidebar. "Offers" was missing from this list
// while being present in VIEWS, so the personalization engine -- the first of
// the three pillars, and the answer to the hackathon's first ask -- had no
// navigation entry at all and could only be reached through a single button on
// the Overview card. "Verification" was worse: reachable exactly once, on the
// way in, and never again.
const NAV: Array<{ label: View; icon: typeof LayoutDashboard }> = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Offers", icon: Sparkles },
  { label: "Conversation", icon: MessageCircle },
  { label: "Explain", icon: CircleHelp },
  { label: "Simulator", icon: Zap },
  { label: "Verification", icon: ShieldCheck },
];

function App() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [view, setView] = useState<View>("Overview");
  // The whole thread, not just the latest exchange -- see components/views/Conversation.
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [sendingChat, setSendingChat] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [showAddMoney, setShowAddMoney] = useState(false);
  // Lets a verified customer re-open the KYC journey from the Verification
  // view. Banks re-confirm KYC periodically (RBI calls it periodic updation),
  // and without this the consent screen is reachable exactly once, on the way
  // in, and then never again for the life of the account.
  const [forceKyc, setForceKyc] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError("");
      setData(await api<Dashboard>("/dashboard"));
    } catch (error) {
      localStorage.removeItem("mispbank_token");
      setAuthToken(null);
      setData(null);
      setLoadError(error instanceof ApiError ? error.message : "Unable to load your account");
    } finally {
      setLoading(false);
    }
  };

  // A lighter-weight refetch for after an in-page action (a simulated
  // transaction, a wallet top-up) that keeps the current view mounted with
  // its own local state intact — reusing `load()` here would flip the
  // top-level `loading` flag, which swaps the *entire* dashboard tree for
  // the full-screen spinner below and unmounts whatever view triggered the
  // refresh, wiping out exactly the result it just produced (e.g. the
  // simulator's own "blocked/posted" summary disappearing right after it
  // appears). Falls back to a toast rather than nuking the view on failure.
  const refresh = async () => {
    try {
      setData(await api<Dashboard>("/dashboard"));
    } catch (error) {
      setToast({ title: "Could not refresh your account", message: error instanceof ApiError ? error.message : "Please try again." });
    }
  };

  useEffect(() => {
    setAuthReady(true);
    const token = localStorage.getItem("mispbank_token");
    setAuthToken(token);
    const chosen = storedLanguage();
    if (chosen) setLanguage(chosen);
    if (token) void load();
    else setLoading(false);
  }, []);

  useEffect(() => {
    // The account's stored language is only a default. A language the customer
    // picked themselves during onboarding is an explicit choice and must not be
    // overwritten here -- doing that unconditionally (as this used to) flipped
    // someone who deliberately chose Gujarati on the sign-in screen straight
    // back to their account's language the moment the dashboard loaded.
    if (storedLanguage()) return;
    if (data?.user.lang && isLanguage(data.user.lang)) setLanguage(data.user.lang);
  }, [data?.user.lang]);

  useEffect(() => {
    // Persisted conversation, so the thread survives a reload instead of the
    // assistant appearing to have never spoken to this customer before.
    if (!data) return;
    let cancelled = false;
    api<ChatTurn[]>("/chat/history")
      .then(history => { if (!cancelled) setMessages(current => (current.length ? current : history)); })
      .catch(() => { /* history is a convenience; a live chat still works without it */ });
    return () => { cancelled = true; };
  }, [data?.user.id]);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  // The toast had no timer and no auto-dismiss: it sat over the top-right of
  // the dashboard until the visitor found and clicked its small X, covering
  // the notification bell the whole time. It stays long enough to read, and
  // the X still dismisses it sooner.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state || {}), mispbankView: "Overview" }, "");
    const handlePopState = (event: PopStateEvent) => setView(isView(event.state?.mispbankView) ? event.state.mispbankView : "Overview");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (nextView: View) => {
    if (nextView === view) return;
    window.history.pushState({ ...(window.history.state || {}), mispbankView: nextView }, "");
    setView(nextView);
    // `scroll-behavior: auto !important` in globals.css cannot override a
    // behaviour passed explicitly here, so the preference has to be read.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  if (!authReady) return <main className="p-10">Preparing your account...</main>;
  if (!authToken && !data) return <Login language={language} setLanguage={setLanguage} onLogin={() => { setAuthToken(localStorage.getItem("mispbank_token")); void load(); }} />;
  if (loading || !data) {
    return (
      <main className="grid min-h-screen place-items-center gap-2.5 bg-paper p-8 text-center text-navy">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#d7e3f6] border-t-primary" />
        <strong>{loadError ? "Your session needs attention" : "Loading your account..."}</strong>
        <p className="max-w-xs text-sm leading-relaxed text-muted">{loadError || "Connecting to your secure banking profile."}</p>
        {loadError && (
          <button
            onClick={() => { localStorage.removeItem("mispbank_token"); setAuthToken(null); setLoadError(""); setLoading(false); }}
            className="mt-2 rounded border border-primary bg-white px-3.5 py-2.5 font-bold text-primary"
          >
            Return to sign in
          </button>
        )}
      </main>
    );
  }

  const dashboard = data;
  const copy = copyFor(language);
  // Any language switch the customer makes in-app is remembered the same way
  // the onboarding one is, so it survives a reload instead of snapping back to
  // their account default on the next visit.
  const chooseLanguage = (next: Language) => { setLanguage(next); rememberLanguage(next); };
  if (dashboard.user.kyc_status !== "verified" || forceKyc) return <Kyc language={language} setLanguage={chooseLanguage} onComplete={() => { setForceKyc(false); return load(); }} />;

  // Was a hardcoded "12 September 2026" that never advanced past the day
  // this screen was first built and never matched the visitor's own
  // language either -- a real date, formatted in the selected language's
  // Indian locale, instead of a frozen, English-only placeholder.
  const todayLabel = new Intl.DateTimeFormat(`${language}-IN`, { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const NAV_LABELS: Record<View, string> = {
    Overview: copy.overview, Offers: copy.recommendations, Conversation: copy.conversation,
    Explain: copy.explain, Simulator: copy.simulator, Verification: copy.verification,
  };
  const navWithText = NAV.map(item => ({ ...item, text: NAV_LABELS[item.label] }));
  const viewLabel = NAV_LABELS[view] ?? view;

  const ask = async (message: string) => {
    const localId = `local-${Date.now()}`;
    setMessages(current => [...current, { id: localId, role: "user", content: message, lang: language, ts: new Date().toISOString() }]);
    setSendingChat(true);
    try {
      const result = await api<{ reply: string }>("/chat", { method: "POST", body: JSON.stringify({ message, lang: language }) });
      setMessages(current => [...current, { id: `${localId}-reply`, role: "assistant", content: result.reply, lang: language, ts: new Date().toISOString() }]);
    } catch (err) {
      setMessages(current => [...current, {
        id: `${localId}-error`, role: "assistant", lang: language, ts: new Date().toISOString(),
        content: err instanceof ApiError ? err.message : "I could not reach the assistant. Please try again.",
      }]);
    } finally {
      setSendingChat(false);
    }
  };

  return (
    // The right rail only renders at lg and up, so the third grid track must
    // appear at lg too. Declaring all three columns at md reserved a 292px
    // strip for an element that was still `hidden`, leaving the dashboard
    // itself about 250px wide on every tablet-width viewport (768-1023px)
    // with a blank column beside it.
    <main className="grid min-h-screen grid-cols-1 bg-paper text-ink md:grid-cols-[224px_minmax(0,1fr)] lg:grid-cols-[224px_minmax(0,1fr)_292px]">
      {toast && (
        <div role="status" className="fixed right-6 top-5 z-20 flex w-[min(360px,calc(100vw-32px))] animate-pop-in items-start gap-2.5 rounded-lg border border-[#c4d6ef] border-l-4 border-l-primary bg-white p-3.5 shadow-pop">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-light text-primary"><Bell size={17} /></span>
          <span className="flex-1"><strong className="block text-xs text-navy">{toast.title}</strong><small className="mt-1 block text-[11px] leading-relaxed text-muted">{toast.message}</small></span>
          <button aria-label="Dismiss alert" onClick={() => setToast(null)} className="p-0.5 text-muted"><X size={16} /></button>
        </div>
      )}
      {showAddMoney && (
        <AddMoneyModal
          userName={dashboard.user.name}
          onClose={() => setShowAddMoney(false)}
          onSuccess={message => { setShowAddMoney(false); setToast({ title: "Money added", message }); void refresh(); }}
        />
      )}

      <Sidebar
        name={dashboard.user.name} segment={dashboard.segment} view={view} onNavigate={navigate}
        onSignOut={() => { localStorage.removeItem("mispbank_token"); location.reload(); }}
        nav={navWithText} copy={copy}
      />

      <section className="min-w-0 bg-paper">
        <Header
          view={view} viewLabel={viewLabel} copy={copy} language={language} setLanguage={chooseLanguage}
          alerts={dashboard.alerts}
        />
        <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              {view !== "Overview" && (
                <button onClick={() => navigate("Overview")} className="mb-3.5 inline-flex items-center gap-1.5 border-0 bg-transparent text-xs font-bold text-primary hover:underline">
                  <ArrowLeft size={15} /> {copy.backToOverview}
                </button>
              )}
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{copy.personal.toUpperCase()}</p>
              <h1 className="mt-2 text-[clamp(28px,4vw,40px)] font-bold leading-tight text-navy">
                {view === "Overview" ? `${copy.morning}, ${dashboard.user.name.split(" ")[0]}` : viewLabel}
              </h1>
              <p className="max-w-xl leading-relaxed text-muted">
                {view === "Overview" ? copy.summary : copy.overviewHint}
              </p>
            </div>
            <span className="hidden whitespace-nowrap text-xs text-muted sm:inline">{todayLabel}</span>
          </div>

          {view === "Overview" && <Overview data={dashboard} copy={copy} onDetails={() => navigate("Offers")} onAddMoney={() => setShowAddMoney(true)} onNavigate={navigate} />}
          {view === "Offers" && <Offers data={dashboard} copy={copy} />}
          {view === "Conversation" && <Conversation messages={messages} ask={ask} sending={sendingChat} language={language} setLanguage={chooseLanguage} copy={copy} />}
          {view === "Explain" && <Explain data={dashboard} copy={copy} language={language} />}
          {view === "Verification" && <Verification copy={copy} onStartKyc={() => setForceKyc(true)} />}
          {view === "Simulator" && <Simulator balance={dashboard.balance} deviceId={dashboard.user.device_id} copy={copy} onComplete={refresh} />}
        </div>
      </section>

      <aside className="hidden flex-col gap-3.5 bg-paper px-5.5 pb-16 pt-10 lg:flex">
        <RailAccount data={dashboard} copy={copy} />
        <RailAlerts data={dashboard} copy={copy} language={language} />
        <RailOffers data={dashboard} copy={copy} />
        <RailActivity data={dashboard} copy={copy} />
      </aside>
    </main>
  );
}

export default function Page() {
  return <App />;
}
