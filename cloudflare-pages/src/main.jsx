import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./shared/Dashboard.jsx";
import Login from "./shared/Login.jsx";
import "./shared/globals.css";

const BUSY = "The cloud phone service is temporarily unavailable. Please try again.";

function Loading({ text = "Loading your cloud phone…" }) {
  return <main className="wrap"><div className="notFound"><div className="spin" /><p className="muted">{text}</p></div></main>;
}

function Problem({ text = BUSY, action = "Try again", onAction = () => location.reload() }) {
  return <main className="wrap"><div className="notFound"><div className="nfIcon">📱</div><h1>Cloud phone</h1>
    <p className="muted">{text}</p><button className="primary" onClick={onAction}>{action}</button>
    <p><a href="/login">Back to login</a></p></div></main>;
}

function LoginRoute() {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!live) return;
        if (ok && data.user) { location.replace("/"); return; }
        setResult({ configured: data.configured !== false, vpn: data.vpn === true, error: data.error || "" });
      }).catch(() => { if (live) setResult({ configured: true, vpn: false, error: "" }); });
    return () => { live = false; };
  }, []);
  if (!result) return <Loading text="Preparing secure login…" />;
  if (result.vpn) return <Problem text="This page is disabled while a VPN or proxy is on. Turn it off and reload." action="Reload" />;
  return <Login configured={result.configured} />;
}

function DashboardRoute() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }))
      .then(({ status, data }) => {
        if (!live) return;
        if (status === 401) { location.replace("/login"); return; }
        if (data.vpn) { setState({ vpn: true }); return; }
        if (!data.user) { setState({ error: true }); return; }
        setState({ user: data.user, tokenReady: Boolean(data.tokenReady) });
      }).catch(() => { if (live) setState({ error: true }); });
    return () => { live = false; };
  }, []);
  if (state.loading) return <Loading />;
  if (state.vpn) return <Problem text="This page is disabled while a VPN or proxy is on. Turn it off and reload." action="Reload" />;
  if (state.error) return <Problem />;
  return <Dashboard user={state.user} tokenReady={state.tokenReady} />;
}

function PhoneRoute({ phoneId }) {
  const [state, setState] = useState({ loading: true });
  const [hash, setHash] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }))
      .then(async ({ status, data }) => {
        if (!live) return;
        if (status === 401) { location.replace("/login"); return; }
        if (data.vpn) { setState({ vpn: true }); return; }
        if (!data.user) { setState({ error: true }); return; }
        const r = await fetch("/api/phones/" + encodeURIComponent(phoneId), { cache: "no-store" });
        const phoneData = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.status === 404 || !r.ok || !phoneData.phone) { setState({ user: data.user, missing: true }); return; }
        setState({ user: data.user, phone: phoneData.phone });
      }).catch(() => { if (live) setState({ error: true }); });
    return () => { live = false; };
  }, [phoneId]);
  useEffect(() => {
    const password = state.phone?.phone_password;
    if (!password) { setHash(""); return; }
    let live = true;
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)).then(buf => {
      if (live) setHash([...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join(""));
    }).catch(() => { if (live) setHash(""); });
    return () => { live = false; };
  }, [state.phone?.phone_password]);
  if (state.loading) return <Loading />;
  if (state.vpn) return <Problem text="This page is disabled while a VPN or proxy is on. Turn it off and reload." action="Reload" />;
  if (state.error) return <Problem />;
  if (state.missing) return <main className="wrap"><div className="notFound"><div className="nfIcon">📱🔍</div><h1>Cloud phone not found</h1>
    <p className="muted">This phone is not in your account. It may have been deleted, or it belongs to someone else.</p><a className="btnLink" href="/">← My cloud phones</a></div></main>;
  const p = state.phone;
  const proxyScreen = p.viewer_url && hash
    ? `${p.viewer_url}/s/${hash}/vnc.html?autoconnect=true&resize=scale&host=&port=0&password=${encodeURIComponent(p.phone_password || "")}&t=${hash}&path=/s/${hash}/websockify`
    : p.viewer_url && p.phone_password
      ? `${p.viewer_url}/?password=${encodeURIComponent(p.phone_password)}`
      : p.viewer_url ? `${p.viewer_url}${hash ? `?t=${hash}` : ""}` : null;
  const screen = proxyScreen;
  const fallback = p.tunnel_url
    ? `${p.tunnel_url}/vnc.html?autoconnect=true&resize=scale&host=&port=0&password=${encodeURIComponent(p.phone_password || "")}`
    : proxyScreen;
  return <main className="wrap">
    <header className="top"><div><h1>📱 Cloud Phone</h1><p className="muted">{p.phone_id} · Android 11 · {p.status}</p></div><a className="btnLink" href="/">← My cloud phones</a></header>
    <div className="credBox"><p><b>Url -</b> {screen ? <a href={screen} target="_blank" rel="noreferrer">{screen}</a> : "starting…"}</p>
      <p><b>Password -</b> {p.phone_password ? <code>{p.phone_password}</code> : "•••••••• (appears when ready)"}</p></div>
    {fallback && <p className="footLinks" style={{ maxWidth: 430, margin: "0 auto 10px" }}><a href={fallback} target="_blank" rel="noreferrer">Fallback screen (noVNC) ↗</a></p>}
    <div className="phonePageBox">{screen
      ? <iframe src={screen} title="Cloud Phone" allow="fullscreen; clipboard-read; clipboard-write" />
      : <div className="phoneWait"><div className="spin" /><p>Cloud phone starting… refresh in a minute</p></div>}</div>
  </main>;
}

function LegalRoute({ privacy = false }) {
  const title = privacy ? "Privacy Policy" : "Terms of Service";
  return <main className="wrap legal">
    <div className="logo">☁️📱</div><h1>{title}</h1>
    <p className="muted">Last updated: November 2026 · NishCloudPhone — created by <b>nishgamerr</b></p>
    {privacy ? <>
      <h2>What we collect</h2><p>Only what the service needs to work: your name and username, your password (kept only in a securely encrypted, unreadable form — never as plain text), your IP address (used purely for security, abuse prevention and country/VPN checks), and your cloud phones with their connection details.</p>
      <h2>How your data is stored</h2><p>Your data is kept securely on our protected servers with strong, industry-standard security measures at every layer — accounts, connections and phones are all guarded so your information stays private and safe. We never sell your data, ever.</p>
      <h2>Who can see your cloud phones</h2><p>Your cloud phones are private: only you can open and use them. Our trusted administrators and moderators can view all cloud phones on the service for one reason only — to check that free cloud phones are being used safely and properly, and to protect the community from abuse.</p>
      <h2>Security checks</h2><p>To keep accounts safe we check things like login attempts and whether a connection comes through a VPN or proxy. VPN/proxy connections are not allowed, because they are used to bypass free-phone limits.</p>
      <h2>Cookies</h2><p>We use one secure login cookie so you stay signed in. Nothing is used to track you across other websites.</p>
      <h2>Deleting your data</h2><p>Delete a cloud phone and it is removed. Delete your account from the dashboard and your account together with all your cloud phones is permanently removed.</p>
      <h2>Keeping you safe</h2><p>Cloud phones run on our secure servers, isolated per user, with protected connections end to end. We work continuously to keep the service hardened against attacks so nobody can get into your account or your phones.</p>
      <p className="muted">Questions about your privacy? Reach out to the creator, <b>nishgamerr</b>, through the service.</p>
    </> : <>
      <h2>1. What NishCloudPhone is</h2><p>NishCloudPhone gives you a free personal cloud phone that runs on our secure servers and streams to your browser. Each phone is yours alone while it runs, for a limited session time.</p>
      <h2>2. Your account</h2><p>You are responsible for your username and password and for everything done with your account. One person, one account — creating extra accounts to bypass limits is not allowed. Each account can run up to 5 cloud phones at a time.</p>
      <h2>3. Fair and safe use</h2><p>Free cloud phones are a shared community resource. Do not use them for anything illegal, harmful, abusive, or that disrupts the service for others. Sessions are time-limited and phones may stop when their session ends.</p>
      <h2>4. Administrators &amp; moderators</h2><p>Our administrators and moderators are trusted members of the NishCloudPhone team. To keep the free service safe for everyone, they can view all cloud phones on the service to check that free cloud phones are being used properly and to stop abuse. This oversight exists only to protect users and the service — your trust is why it works.</p>
      <h2>5. Availability</h2><p>The service is provided free, on a best-effort basis. When many people are using free cloud phones at once, you may be asked to try again later. Phones, apps and data on a phone are temporary and can be removed when a phone ends or is deleted.</p>
      <h2>6. Ending access</h2><p>Accounts or phones that break these terms may be stopped or removed by the team at any time. You can delete your own account whenever you like from your dashboard.</p>
      <p className="muted">Questions about these terms? Reach out to the creator, <b>nishgamerr</b>, through the service.</p>
    </>}
    <p><a className="btnLink" href="/login">← Back to login</a> · <a href={privacy ? "/terms" : "/privacy"}>{privacy ? "Terms of Service" : "Privacy Policy"}</a></p>
  </main>;
}

function App() {
  const path = window.location.pathname;
  if (path === "/login" || path === "/login/") return <LoginRoute />;
  if (path === "/terms" || path === "/terms/") return <LegalRoute />;
  if (path === "/privacy" || path === "/privacy/") return <LegalRoute privacy />;
  if (path.startsWith("/cloudphone/")) {
    let id = "";
    try { id = decodeURIComponent(path.slice("/cloudphone/".length).replace(/\/$/, "")); } catch {}
    return id ? <PhoneRoute phoneId={id} /> : <Problem text="Cloud phone not found." />;
  }
  if (path === "/" || path === "") return <DashboardRoute />;
  return <main className="wrap"><div className="notFound"><div className="nfIcon">📱</div><h1>Page not found</h1><a className="btnLink" href="/">Back to my cloud phones</a></div></main>;
}

createRoot(document.getElementById("root")).render(<App />);
