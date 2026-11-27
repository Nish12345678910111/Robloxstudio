import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./shared/Dashboard.jsx";
import HilltopAd from "./shared/HilltopAd.jsx";
import Login from "./shared/Login.jsx";
import PhoneRoute from "./shared/PhoneRoute.jsx";
import LegalRoute from "./shared/LegalRoute.jsx";
import PublicHome from "./shared/PublicHome.jsx";
import "./shared/globals.css";

const BUSY = "The cloud phone service is temporarily unavailable. Please try again.";

function Loading({ text = "Loading your cloud phone…" }) {
  return <main className="wrap"><div className="notFound"><div className="spin" /><p className="muted">{text}</p></div></main>;
}

function RouteRedirect({ to, text = "Opening the requested page…" }) {
  useEffect(() => { location.replace(to); }, [to]);
  return <Loading text={text} />;
}

function Problem({ text = BUSY, action = "Try again", onAction = () => location.reload() }) {
  return <main className="wrap"><div className="notFound"><div className="nfIcon">📱</div><h1>Cloud phone</h1>
    <p className="muted">{text}</p><button className="primary" onClick={onAction}>{action}</button>
    <p><a href="/cloudphone/login">Back to login</a> · <a href="/home">Nish Productions</a></p></div></main>;
}

function LoginRoute({ initialMode = "login" }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!live) return;
        if (ok && data.user) { location.replace("/cloudphone"); return; }
        setResult({ configured: data.configured !== false, vpn: data.vpn === true, error: data.error || "" });
      }).catch(() => { if (live) setResult({ configured: true, vpn: false, error: "" }); });
    return () => { live = false; };
  }, []);
  if (!result) return <Loading text={initialMode === "register" ? "Preparing your free account…" : "Preparing secure login…"} />;
  if (result.vpn) return <Problem text="This page is disabled while a VPN or proxy is on. Turn it off and reload." action="Reload" />;
  return <Login configured={result.configured} initialMode={initialMode} adSlot={<HilltopAd />} />;
}

function DashboardRoute() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }))
      .then(({ status, data }) => {
        if (!live) return;
        if (status === 401) { location.replace("/cloudphone/login"); return; }
        if (data.vpn) { setState({ vpn: true }); return; }
        if (!data.user) { setState({ error: true }); return; }
        setState({ user: data.user, tokenReady: Boolean(data.tokenReady) });
      }).catch(() => { if (live) setState({ error: true }); });
    return () => { live = false; };
  }, []);
  if (state.loading) return <Loading />;
  if (state.vpn) return <Problem text="This page is disabled while a VPN or proxy is on. Turn it off and reload." action="Reload" />;
  if (state.error) return <Problem />;
  return <Dashboard user={state.user} tokenReady={state.tokenReady} adSlot={<HilltopAd />} />;
}

function App() {
  const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/") return <RouteRedirect to="/home" text="Taking you to Nish Productions…" />;
  if (path === "/login") return <RouteRedirect to="/cloudphone/login" text="Moving login into Cloud Phone…" />;
  if (path === "/home") return <PublicHome />;
  if (path === "/terms") return <LegalRoute />;
  if (path === "/privacy") return <LegalRoute privacy />;
  if (path === "/cloudphone") return <DashboardRoute />;
  if (path === "/cloudphone/login") return <LoginRoute initialMode="login" />;
  if (path === "/cloudphone/signup") return <LoginRoute initialMode="register" />;
  if (path.startsWith("/cloudphone/")) {
    let id = "";
    try { id = decodeURIComponent(path.slice("/cloudphone/".length)); } catch {}
    return id && !id.includes("/") ? <PhoneRoute phoneId={id} /> : <Problem text="Cloud phone not found." />;
  }
  return <main className="wrap"><div className="notFound"><div className="nfIcon">✦</div><h1>Page not found</h1><p className="muted">That link doesn’t lead to a Nish Productions development.</p><a className="btnLink" href="/home">Back to Nish Productions</a></div></main>;
}

createRoot(document.getElementById("root")).render(<App />);
