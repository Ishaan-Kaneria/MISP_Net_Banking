"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, CircleHelp, LayoutDashboard, MessageCircle, X, Zap } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { copyFor } from "../lib/translations";
import { isView, type Dashboard, type Language, type View } from "../lib/types";
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
const AddMoneyModal = dynamic(() => import("../components/modals/AddMoneyModal").then(m => m.AddMoneyModal), { ssr: false });

function ViewSkeleton() {
  return <div className="mt-7 h-64 animate-pulse rounded-xl border border-border bg-white" />;
}

const NAV: Array<{ label: View; icon: typeof LayoutDashboard }> = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Conversation", icon: MessageCircle },
  { label: "Explain", icon: CircleHelp },
  { label: "Simulator", icon: Zap },
];

function App() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [view, setView] = useState<View>("Overview");
  const [chat, setChat] = useState("");
  const [reply, setReply] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [showAddMoney, setShowAddMoney] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError("");
      setData(await api<Dashboard>("/dashboard"));
    } catch (error) {
      localStorage.removeItem("arthai_token");
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
    const token = localStorage.getItem("arthai_token");
    setAuthToken(token);
    if (token) void load();
    else setLoading(false);
  }, []);

  useEffect(() => {
    if (data?.user.lang && ["en", "hi", "gu"].includes(data.user.lang)) setLanguage(data.user.lang as Language);
  }, [data?.user.lang]);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state || {}), arthaiView: "Overview" }, "");
    const handlePopState = (event: PopStateEvent) => setView(isView(event.state?.arthaiView) ? event.state.arthaiView : "Overview");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (nextView: View) => {
    if (nextView === view) return;
    window.history.pushState({ ...(window.history.state || {}), arthaiView: nextView }, "");
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showNotifications = () => {
    const alert = data?.alerts[0];
    setToast(alert
      ? { title: alert.type === "fraud" ? "Payment protection alert" : "Account support update", message: alert.message_en }
      : { title: "No new alerts", message: "Your account has no active security alerts." });
  };

  if (!authReady) return <main className="p-10">Preparing your account...</main>;
  if (!authToken && !data) return <Login onLogin={() => { setAuthToken(localStorage.getItem("arthai_token")); void load(); }} />;
  if (loading || !data) {
    return (
      <main className="grid min-h-screen place-items-center gap-2.5 bg-paper p-8 text-center text-navy">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#d7e3f6] border-t-primary" />
        <strong>{loadError ? "Your session needs attention" : "Loading your account..."}</strong>
        <p className="max-w-xs text-sm leading-relaxed text-muted">{loadError || "Connecting to your secure banking profile."}</p>
        {loadError && (
          <button
            onClick={() => { localStorage.removeItem("arthai_token"); setAuthToken(null); setLoadError(""); setLoading(false); }}
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
  if (dashboard.user.kyc_status !== "verified") return <Kyc onComplete={load} />;

  const navWithText = NAV.map(item => ({ ...item, text: item.label === "Overview" ? copy.overview : item.label === "Conversation" ? copy.conversation : item.label === "Explain" ? copy.explain : copy.simulator }));
  const viewLabel = navWithText.find(item => item.label === view)?.text ?? view;

  const ask = async (message: string) => {
    setChat(message);
    try {
      const result = await api<{ reply: string }>("/chat", { method: "POST", body: JSON.stringify({ message, lang: language }) });
      setReply(result.reply);
    } catch (err) {
      setReply(err instanceof ApiError ? err.message : "I could not reach the assistant. Please try again.");
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 bg-paper text-ink md:grid-cols-[224px_minmax(0,1fr)_292px]">
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
        onSignOut={() => { localStorage.removeItem("arthai_token"); location.reload(); }}
        nav={navWithText}
      />

      <section className="min-w-0 bg-paper">
        <Header
          view={view} viewLabel={viewLabel} copy={copy} language={language} setLanguage={setLanguage}
          hasAlerts={dashboard.alerts.length > 0} onShowNotifications={showNotifications}
        />
        <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              {view !== "Overview" && (
                <button onClick={() => navigate("Overview")} className="mb-3.5 inline-flex items-center gap-1.5 border-0 bg-transparent text-xs font-bold text-primary hover:underline">
                  <ArrowLeft size={15} /> Back to overview
                </button>
              )}
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{copy.personal.toUpperCase()}</p>
              <h1 className="mt-2 text-[clamp(28px,4vw,40px)] font-bold leading-tight text-navy">
                {view === "Overview" ? `${copy.morning}, ${dashboard.user.name.split(" ")[0]}` : viewLabel}
              </h1>
              <p className="max-w-xl leading-relaxed text-muted">
                {view === "Overview" ? copy.summary : "Use the navigation or your browser back button to return to your account overview."}
              </p>
            </div>
            <span className="hidden whitespace-nowrap text-xs text-muted sm:inline">12 September 2026</span>
          </div>

          {view === "Overview" && <Overview data={dashboard} copy={copy} onDetails={() => navigate("Offers")} onAddMoney={() => setShowAddMoney(true)} onNavigate={navigate} />}
          {view === "Offers" && <Offers data={dashboard} copy={copy} />}
          {view === "Conversation" && <Conversation chat={chat} reply={reply} ask={ask} language={language} setLanguage={setLanguage} copy={copy} />}
          {view === "Explain" && <Explain data={dashboard} />}
          {view === "Simulator" && <Simulator onComplete={refresh} />}
        </div>
      </section>

      <aside className="hidden flex-col gap-3.5 bg-paper px-5.5 pb-16 pt-10 lg:flex">
        <RailAccount data={dashboard} copy={copy} />
        <RailAlerts data={dashboard} copy={copy} />
        <RailOffers data={dashboard} copy={copy} />
        <RailActivity data={dashboard} copy={copy} />
      </aside>
    </main>
  );
}

export default function Page() {
  return <App />;
}
