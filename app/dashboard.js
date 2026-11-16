"use client";
import { useCallback, useEffect, useRef, useState } from "react";
const fmt = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
async function embedUrl(p) {
  if (!p.viewerUrl || !p.password) return p.viewerUrl;
  try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.password));
    return p.viewerUrl + "?t=" + [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  catch { return p.viewerUrl; }
}
function PhoneCard({ p, user, onStop, onDelete }) {
  const [frameUrl, setFrameUrl] = useState(null);
  useEffect(() => { let on = true; embedUrl(p).then(u => { if (on) setFrameUrl(u); }); return () => { on = false; }; }, [p.viewerUrl, p.password]);
  const screenUrl = frameUrl;
  const live = p.status === "in_progress" && screenUrl;
  const state = live ? "● LIVE" : p.status === "busy" ? "⏳ Busy — try again later" : (p.status === "starting" || p.status === "in_progress") ? "🚀 Starting…" : p.status === "queued" ? "Queued" : p.conclusion === "cancelled" ? "Stopped" : p.conclusion || p.status;
  const boxRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const [nowS, setNowS] = useState(() => Date.now());
  useEffect(() => { if (live) return; const i = setInterval(() => setNowS(Date.now()), 1000); return () => clearInterval(i); }, [live]);
  const elapsed = p.createdAt ? Math.max(0, Math.floor((nowS - new Date(p.createdAt).getTime()) / 1000)) : 0;
  const elapsedTxt = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  useEffect(() => {
    const on = () => setIsFs(document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  async function toggleFs() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boxRef.current?.requestFullscreen();
    } catch {}
  }
  return (<section className="card">
    <header className="cardHead"><div><h3>📱 Cloud Phone · Android 11</h3><span className="muted">{p.phoneId} · started {fmt(p.createdAt)}{p.owner && p.owner !== user.username ? ` · by ${p.owner}` : ""}</span></div>
      <span className={live ? "badge live" : "badge"}>{state}</span></header>
    <div className="credBox">
      <p><b>Url -</b> {p.viewerUrl ? <a href={p.viewerUrl} target="_blank" rel="noreferrer">{p.viewerUrl}</a> : "waiting for connection…"}</p>
      <p><b>Password -</b> {p.password ? <code>{p.password}</code> : "•••••••• (appears when initialized)"}</p>
    </div>
    <div className="phoneWrap" ref={boxRef}>
      <button className="fsBtn" onClick={toggleFs}>{isFs ? "✕ Exit full screen" : "⛶ Full screen"}</button>
      <div className="phoneBox">
        {live ? <iframe src={screenUrl} title={"Cloud Phone " + p.phoneId} allow="fullscreen; clipboard-read; clipboard-write" /> :
          <div className="phoneWait"><div className="spin" /><p>{p.status === "busy" ? "Many users are using free cloud phones, try again later." : "Cloud phone starting…\nYour screen will appear here"}</p>
          {p.status !== "busy" && <p className="eta">⏱ {elapsedTxt} elapsed<br />⚡ average start time: ~1:30</p>}</div>}
      </div>
    </div>
    <footer className="cardFoot">
      <span className="footLinks"><a href={`/cloudphone/${encodeURIComponent(p.phoneId)}`}>Open phone ↗</a></span>
      <span className="footBtns">
        {(p.status === "in_progress" || p.status === "queued") && <button className="stop" onClick={() => onStop(p.runId)}>⏹ Stop Cloud Phone</button>}
        <button className="del" onClick={() => onDelete(p)}>🗑 Delete Cloud Phone</button>
      </span>
    </footer>
  </section>);
}
export default function Dashboard({ user, tokenReady }) {
  const [phones, setPhones] = useState([]), [creating, setCreating] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const pushToast = useCallback((kind, text) => {
    if (!text) return;
    const id = ++toastId.current;
    setToasts(ts => [...ts.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 15000); // auto-remove after 15s
  }, []);
  const setMsg = useCallback(t => pushToast("ok", t), [pushToast]);
  const noticeRef = useRef(null);
  const setNotice = useCallback(t => { // same warning never spams twice in a row
    if (t && t !== noticeRef.current) pushToast("warn", t);
    noticeRef.current = t || null;
  }, [pushToast]);
  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("ncp_hidden") || "[]")); } catch { return new Set(); } });
  const load = useCallback(async () => { const r = await fetch("/api/phones"); if (r.ok) { const d = await r.json(); setPhones(d.phones || []); setNotice(d.notice || null); } }, []);
  useEffect(() => { load(); const i = setInterval(() => { if (!document.hidden) load(); }, 20000); return () => clearInterval(i); }, [load]);
  async function create() {
    if (creating) return;
    setCreating(true); setMsg("");
    const r = await fetch("/api/phones", { method: "POST" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      // Show the card instantly as "starting", don't wait for upstream.
      setPhones(ps => [{ phoneId: d.phoneId, runId: null, edition: "android11", owner: user.username,
        status: d.state === "busy" ? "busy" : "starting", createdAt: new Date().toISOString(),
        viewerUrl: null, password: null }, ...ps]);
      if (d.state === "busy") setNotice("Many users are using free cloud phones, try again later."); else setMsg("✅ Cloud phone created — it is starting, the screen will appear here.");
      load();
    } else setNotice(d.error || "Many users are using free cloud phones, try again later.");
    setCreating(false);
  }
  async function stop(id) { await fetch(`/api/phones/${id}/stop`, { method: "POST" }); setMsg("Stopping cloud phone…"); load(); }
  async function del(p) {
    if (!confirm(`Delete Cloud Phone ${p.phoneId}? A running phone will be stopped first.`)) return;
    // ALWAYS go through the server - even with no run id yet - so the
    // workflow run is deleted too, not just hidden from this screen.
    const key = p.runId || p.phoneId;
    setPhones(ps => ps.filter(x => String(x.runId) !== String(p.runId) && x.phoneId !== p.phoneId));
    setHidden(h => { const n = new Set([...h].map(String)); n.add(String(key)); if (p.runId) n.add(String(p.runId)); localStorage.setItem("ncp_hidden", JSON.stringify([...n])); return n; });
    // Keep asking the server until the phone is really gone (a running
    // phone must finish stopping first).
    setMsg(`Deleting ${p.phoneId}… stopping it first, this can take ~30s.`);
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`/api/phones/${encodeURIComponent(key)}/delete`, { method: "DELETE" });
        const d = await r.json();
        if (d.deleted) { setMsg("Cloud phone deleted."); load(); return; }
        if (!r.ok && r.status !== 202) { setNotice(d.error || "Many users are using free cloud phones, try again later."); load(); return; }
      } catch {}
      await new Promise(res => setTimeout(res, 4000));
    }
    setMsg("Delete is taking long - it will disappear once it finishes stopping."); load();
  }
  async function logout() { await fetch("/api/logout", { method: "POST" }); location.reload(); }
  const [view, setView] = useState("mine");
  const [sideOpen, setSideOpen] = useState(true);
  useEffect(() => { if (window.innerWidth <= 860) setSideOpen(false); }, []);
  const [health, setHealth] = useState(null);
  useEffect(() => { fetch("/api/keys").then(r => r.ok && r.json()).then(d => d && setHealth(d)).catch(() => {}); }, []);
  async function delAccount() {
    const pw = prompt("Delete your account forever? Type your password to confirm. Your cloud phones will also be deleted.");
    if (pw === null) return;
    const r = await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) location.href = "/login"; else alert(d.error || "Could not delete account.");
  }
  const visibleAll = phones.filter(p => !hidden.has(String(p.runId)) && !hidden.has(String(p.phoneId)));
  const visible = user.role === "admin" && view === "all" ? visibleAll : visibleAll.filter(p => p.owner === user.username);
  const liveCount = visible.filter(p => p.status === "in_progress" || p.status === "running").length;
  return (<div className="shell">
    {!sideOpen && <button className="sideFab" onClick={() => setSideOpen(true)} title="Open sidebar">☰</button>}
    <aside className={sideOpen ? "side" : "side closed"}>
      <div className="brandRow"><div className="brand">☁️📱<div><b>NishCloudPhone</b><span>free cloud phones</span></div></div>
        <button className="sideX" onClick={() => setSideOpen(false)} title="Close sidebar">✕</button></div>
      <div className="userChip"><div className="avatar">{(user.name || user.username || "?").slice(0, 1).toUpperCase()}</div>
        <div><b>{user.name || user.username}</b><span>@{user.username}{user.role === "admin" ? " · 👑 admin" : ""}</span></div></div>
      <nav>
        <button className={view === "mine" ? "nav on" : "nav"} onClick={() => setView("mine")}>📱 My Cloud Phones</button>
        {user.role === "admin" && <button className={view === "all" ? "nav on" : "nav"} onClick={() => setView("all")}>🌍 Everyone's Cloud Phones</button>}
      </nav>
      <button className="primary wide" onClick={create} disabled={creating || !tokenReady}>{creating ? "Creating…" : "＋ New Cloud Phone"}</button>
      <button className="ghost wide" onClick={logout}>Log out</button>
      <button className="danger wide" onClick={delAccount}>🗑 Delete my account</button>
      {health && <div className="health"><b>🔌 Connection</b>
        <span>Database: {health.db ? "🟢 connected" : "🔴 not connected"}</span>
        {(health.keys || []).filter(k => k.configured).map(k => <span key={k.name}>{k.name}: {k.active ? "🟢 you are connected here" : k.ok ? "🟢 working" : "🟠 full"}</span>)}
      </div>}
      <p className="sideNote">🔒 Your phones are private — only you can see them{user.role === "admin" ? ", except you as admin see everyone's" : ""}. Max 5 per account.</p>
    </aside>
    <main className="wrap">
    <header className="top"><button className="burger" onClick={() => setSideOpen(o => !o)} title="Open / close sidebar">{sideOpen ? "✕" : "☰"}</button><div><h1>{user.role === "admin" && view === "all" ? "🌍 Everyone's Cloud Phones" : "📱 My Cloud Phones"}</h1><p className="muted">Android 11 · auto WiFi · straight to home screen</p></div>
      </header>
    {!tokenReady && <p className="warn">⏳ Cloud phones are busy right now — Many users are using free cloud phones, try again later.</p>}
    <div className="toasts">{toasts.map(t => <div key={t.id} className={"toast " + t.kind} onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>{t.kind === "warn" ? "⚠️ " : ""}{t.text}</div>)}</div>
    <div className="stats"><div><b>{visible.length}</b><span>total phones</span></div><div><b>{liveCount}</b><span>running now</span></div><div><b>4 CPU · 12 GB</b><span>per phone (max)</span></div><div><b>~6 h</b><span>max session</span></div></div>
    {visible.length === 0 ? <p className="empty">No phones yet. Hit <b>＋ New Cloud Phone</b> — each click starts a separate cloud phone, so you can run many phones at once. When one initializes, its live screen appears right inside its phone box.</p>
      : <div className="grid">{visible.map(p => <PhoneCard key={p.phoneId || p.runId} p={p} user={user} onStop={stop} onDelete={del} />)}</div>}
    <button className="fab" onClick={create} disabled={creating || !tokenReady} title="New Cloud Phone">{creating ? "…" : "＋"}</button>
    </main></div>);
}
