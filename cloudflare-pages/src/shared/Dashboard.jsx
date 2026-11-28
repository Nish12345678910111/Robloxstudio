"use client";
import { useCallback, useEffect, useRef, useState } from "react";
const fmt = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
async function embedUrl(p) {
  if (!p.viewerUrl || !p.password) return p.viewerUrl;
  try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.password));
    return p.viewerUrl + "?t=" + [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  catch { return p.viewerUrl; }
}
function PhoneCard({ p, user, onStop, onDelete, onToast }) {
  const [frameUrl, setFrameUrl] = useState(null);
  const tok = frameUrl && frameUrl.includes("?t=") ? frameUrl.split("?t=")[1] : null;
  useEffect(() => { let on = true; embedUrl(p).then(u => { if (on) setFrameUrl(u); }); return () => { on = false; }; }, [p.viewerUrl, p.password]);
  const proxyScreen = p.viewerUrl && tok
    ? p.viewerUrl + "/s/" + tok + "/vnc.html?autoconnect=true&resize=scale&host=&port=0&password=" + encodeURIComponent(p.password || "") + "&t=" + tok + "&path=/s/" + tok + "/websockify"
    : p.viewerUrl && p.password ? p.viewerUrl + "/?password=" + encodeURIComponent(p.password) : frameUrl;
  const screenUrl = p.viewerUrl && p.password ? proxyScreen : frameUrl;
  const live = p.status === "in_progress" && screenUrl;
  // A finished phone (its ~6h session ended, it errored, or it was stopped)
  // must say so - never sit on "starting…" with the timer counting forever.
  const finished = p.status === "completed" || !!p.conclusion;
  const failed = ["failure", "timed_out", "startup_failure", "action_required"].includes(p.conclusion);
  const ranMs = finished && p.createdAt && p.updatedAt ? new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime() : 0;
  const ranSixH = ranMs >= 5.5 * 3600 * 1000;
  const state = live ? "● LIVE" : p.status === "busy" ? "⏳ Busy — try again later" : finished ? (failed ? "⚠️ Error" : "⏹ Stopped") : (p.status === "starting" || p.status === "in_progress") ? "🚀 Starting…" : p.status === "queued" ? "Queued" : p.status;
  const boxRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const [nowS, setNowS] = useState(() => Date.now());
  useEffect(() => { if (live) return; const i = setInterval(() => setNowS(Date.now()), 1000); return () => clearInterval(i); }, [live]);
  const elapsed = p.createdAt ? Math.max(0, Math.floor((nowS - new Date(p.createdAt).getTime()) / 1000)) : 0;
  const elapsedTxt = elapsed >= 3600
    ? `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
    : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const startingTooLong = !finished && !live && elapsed > 600; // >10 min: something went wrong
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
  async function downloadCrashLog() {
    if (!p.viewerUrl) return;
    onToast?.("ok", "Reading Android crash log…");
    try {
      const url = new URL(p.viewerUrl.replace(/\/+$/, "") + "/crash-log");
      url.searchParams.set(tok ? "t" : "password", tok || p.password || "");
      const response = await fetch(url);
      const log = await response.text();
      if (!response.ok) {
        onToast?.("warn", log.slice(0, 180) || "Could not read the Android crash log.");
        return;
      }
      if (log.startsWith("No Android crash entries yet.")) {
        onToast?.("warn", "No crash entry yet. Reproduce the force-close, then try again.");
        return;
      }
      const objectUrl = URL.createObjectURL(new Blob([log], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      const phoneId = String(p.phoneId || "phone").replace(/[^a-z0-9_-]/gi, "-");
      link.href = objectUrl;
      link.download = `cloud-phone-${phoneId}-crash-log.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      onToast?.("ok", "Crash log downloaded. Attach it here so I can identify the cause.");
    } catch {
      onToast?.("warn", "Could not reach the phone to read its crash log.");
    }
  }
  return (<section className="card">
    <header className="cardHead"><div><h3>📱 Cloud Phone · {p.edition === "android15-arm64" ? "Android 15 ARM64 · QEMU TCG" : p.edition === "android15" ? "Android 15 x86_64" : "Android 11"}</h3><span className="muted">{p.phoneId} · started {fmt(p.createdAt)}{p.owner && p.owner !== user.username ? ` · by ${p.owner}` : !p.owner && user.role === "admin" && p.ownerStatus === "unavailable" ? " · owner unavailable (unlinked run)" : ""}</span></div>
      <span className={live ? "badge live" : "badge"}>{state}</span></header>
    <div className="credBox">
      <p><b>Url -</b> {p.viewerUrl ? <a href={frameUrl || p.viewerUrl} target="_blank" rel="noreferrer">{p.viewerUrl}</a> : "waiting for connection…"}</p>
      <p><b>Password -</b> {p.password ? <code>{p.password}</code> : "•••••••• (appears when initialized)"}</p>
    </div>
    <div className="phoneWrap" ref={boxRef}>
      <button className="fsBtn" onClick={toggleFs}>{isFs ? "✕ Exit full screen" : "⛶ Full screen"}</button>
      <div className="phoneBox">
        {live ? <iframe src={screenUrl} title={"Cloud Phone " + p.phoneId} allow="fullscreen; clipboard-read; clipboard-write" /> :
          finished ? <div className="phoneWait"><div style={{ fontSize: 42 }}>{failed ? "⚠️" : "⏹"}</div>
            <p>{failed ? "The cloud phone had an error." : "Cloud phone stopped"}</p>
            <p className="eta">{failed ? "Something went wrong with this cloud phone. Delete it and start a new one." : ranSixH ? "6 hours passed — the max session ended.\nDelete it and start a new cloud phone." : "This session has ended. Delete it and start a new cloud phone."}</p></div> :
          <div className="phoneWait"><div className="spin" /><p>{p.status === "busy" ? "Many users are using free cloud phones, try again later." : startingTooLong ? "The cloud phone had an error.\nIt is taking too long to start — delete it and start a new one." : "Cloud phone starting…\nYour screen will appear here"}</p>
          {p.status !== "busy" && <p className="eta">⏱ {elapsedTxt} elapsed<br />⚡ average start time: ~1:30</p>}</div>}
      </div>
    </div>
    <footer className="cardFoot">
      <span className="footLinks"><a href={`/cloudphone/${encodeURIComponent(p.phoneId)}`}>Open phone ↗</a>{p.tunnelUrl ? <a href={p.tunnelUrl + "/vnc.html?autoconnect=true&resize=scale&host=&port=0&password=" + encodeURIComponent(p.password || "")} target="_blank" rel="noreferrer">Fallback screen (noVNC) ↗</a> : p.viewerUrl ? <a href={proxyScreen || p.viewerUrl} target="_blank" rel="noreferrer">Fallback screen (noVNC) ↗</a> : null}</span>
      <span className="footBtns">
        {live ? <button type="button" title="Download the latest Android crash trace after reproducing the problem" onClick={downloadCrashLog}>📄 Crash log</button> : null}
        {live ? <label className="apkBtn">⬆ Install APK<input type="file" accept=".apk,application/vnd.android.package-archive" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; onToast?.("ok", "Installing " + f.name + " ..."); try { const r = await fetch(p.viewerUrl + "/install-apk?t=" + (tok || ""), { method: "POST", body: f }); const j = await r.json().catch(() => ({})); onToast?.(j.ok ? "ok" : "warn", j.message || "Install finished."); } catch { onToast?.("warn", "Could not reach the phone to install."); } }} /></label> : null}
        {(p.status === "in_progress" || p.status === "queued") && <button className="stop" onClick={() => onStop(p.runId)}>⏹ Stop Cloud Phone</button>}
        <button className="del" onClick={() => onDelete(p)}>🗑 Delete Cloud Phone</button>
      </span>
    </footer>
  </section>);
}
export default function Dashboard({ user, tokenReady, adSlot = null }) {
  const [phones, setPhones] = useState([]), [creating, setCreating] = useState(false);
  const [phoneEdition, setPhoneEdition] = useState("android15-arm64");
  const [health, setHealth] = useState(null);
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
  const setPhoneHidden = (p, isHidden) => setHidden(h => {
    const n = new Set(h);
    for (const id of [p.phoneId, p.runId]) {
      if (id == null) continue;
      if (isHidden) n.add(String(id)); else n.delete(String(id));
    }
    localStorage.setItem("ncp_hidden", JSON.stringify([...n]));
    return n;
  });
  const load = useCallback(async () => {
    const r = await fetch("/api/phones", { cache: "no-store" }).catch(() => null);
    if (!r) { setNotice("Many users are using free cloud phones, try again later."); return; }
    if (r.ok) { const d = await r.json().catch(() => ({})); setPhones(d.phones || []); setNotice(d.notice || null); }
    else if (r.status === 401) location.replace("/cloudphone/login");
    else { const d = await r.json().catch(() => ({})); setNotice(d.error || "Many users are using free cloud phones, try again later."); }
  }, [setNotice]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    const check = async () => {
      const response = await fetch("/api/keys", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json().catch(() => null);
      if (active && data) setHealth(data);
    };
    check();
    const interval = setInterval(() => { if (!document.hidden) check(); }, 45000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  // Poll fast (6s) while anything is starting/running so state changes -
  // especially errors - appear almost instantly; slow (20s) when idle.
  useEffect(() => { const active = phones.some(x => !x.conclusion && x.status !== "completed");
    const i = setInterval(() => { if (!document.hidden) load(); }, active ? 6000 : 20000); return () => clearInterval(i); }, [load, phones]);
  async function create() {
    if (creating) return;
    const edition = phoneEdition;
    setCreating(true); setMsg("");
    const r = await fetch("/api/phones", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edition }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      // Show the card instantly as "starting", don't wait for upstream.
      setPhones(ps => [{ phoneId: d.phoneId, runId: null, edition, owner: user.username,
        status: d.state === "busy" ? "busy" : "starting", createdAt: new Date().toISOString(),
        viewerUrl: null, password: null }, ...ps]);
      if (d.state === "busy") setNotice("Many users are using free cloud phones, try again later.");
      else setMsg(`✅ Android ${edition === "android15-arm64" ? "15 ARM64 (software emulation)" : edition === "android15" ? "15 x86_64 compatibility test" : "11"} phone created — it is starting.`);
      load();
    } else setNotice(d.error || "Many users are using free cloud phones, try again later.");
    setCreating(false);
  }
  async function stop(id) {
    const r = await fetch(`/api/phones/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => null);
    const d = await r?.json().catch(() => ({})) || {};
    if (r?.ok) { setMsg("Stopping cloud phone…"); load(); }
    else setNotice(d.error || "Many users are using free cloud phones, try again later.");
  }
  async function del(p) {
    if (!confirm(`Delete Cloud Phone ${p.phoneId}? A running phone will be stopped first.`)) return;
    // ALWAYS go through the server - even with no run id yet - so the
    // workflow run is deleted too, not just hidden from this screen.
    const key = p.runId || p.phoneId;
    setPhones(ps => ps.filter(x => String(x.runId) !== String(p.runId) && x.phoneId !== p.phoneId));
    setPhoneHidden(p, true);
    const restorePhone = () => setPhoneHidden(p, false);
    // Keep asking the server until the phone is really gone (a running
    // phone must finish stopping first).
    setMsg(`Deleting ${p.phoneId}… stopping it first, this can take ~30s.`);
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`/api/phones/${encodeURIComponent(key)}/delete`, { method: "DELETE" });
        const d = await r.json();
        if (d.deleted) { setMsg("Cloud phone deleted."); load(); return; }
        if (!r.ok && r.status !== 202) { restorePhone(); setNotice(d.error || "Many users are using free cloud phones, try again later."); load(); return; }
      } catch {}
      await new Promise(res => setTimeout(res, 4000));
    }
    restorePhone(); setMsg("Delete is taking long - try again in a moment if the phone is still listed."); load();
  }
  async function logout() { await fetch("/api/logout", { method: "POST" }); location.reload(); }
  const [view, setView] = useState("mine");
  const [sideOpen, setSideOpen] = useState(true);
  useEffect(() => { if (window.innerWidth <= 860) setSideOpen(false); }, []);
  async function delAccount() {
    const pw = prompt("Delete your account forever? Type your password to confirm. Your cloud phones will also be deleted.");
    if (pw === null) return;
    const r = await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) }).catch(() => null);
    const d = await r?.json().catch(() => ({})) || {};
    if (r?.ok && d.ok) location.href = "/cloudphone/login";
    else alert(d.error || "Could not delete account. Please try again.");
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
      <label className="editionPicker"><span>Android image</span>
        <select value={phoneEdition} onChange={e => setPhoneEdition(e.target.value)}>
          <option value="android11">Android 11 (recommended)</option>
          <option value="android15">Android 15 x86_64 (compatibility test)</option>
          <option value="android15-arm64">Android 15 ARM64 (QEMU software)</option>
        </select>
      </label>
      <aside className="safetyNotice" role="note" aria-label="Account safety">
        <b>Account safety</b>
        <span>Use official Roblox apps only. Emulator support can vary; executors, cheats, exploit tools, and modified clients may break app rules and risk a ban. We cannot bypass third-party enforcement.</span>
      </aside>
      <button className="primary wide" onClick={create} disabled={creating || !tokenReady}>{creating ? "Creating…" : "＋ New Cloud Phone"}</button>
      <button className="ghost wide" onClick={logout}>Log out</button>
      <button className="danger wide" onClick={delAccount}>🗑 Delete my account</button>
      {health && <div className="health"><b>🔌 Connection</b>
        <span>Database: {health.db ? "🟢 connected" : `🔴 not connected${health.dbCode ? ` (${health.dbCode})` : ""}`}</span>
        {(health.keys || []).filter(key => key.configured).map(key => <span key={key.name}>{key.name}: {key.ok ? (key.active ? "🟢 active" : "🟢 working") : `🔴 unavailable${key.status ? ` (HTTP ${key.status})` : ""}`}</span>)}
      </div>}
      <p className="sideNote">🔒 Your phones are private — only you can see them{user.role === "admin" ? ", except you as admin see everyone's" : ""}. Max 5 per account.</p>
    </aside>
    <main className="wrap">
    <header className="top"><button className="burger" onClick={() => setSideOpen(o => !o)} title="Open / close sidebar">{sideOpen ? "✕" : "☰"}</button><div><h1>{user.role === "admin" && view === "all" ? "🌍 Everyone's Cloud Phones" : "📱 My Cloud Phones"}</h1><p className="muted">Choose Android 11 or Android 15 · x86_64 / ARM64</p></div>
      </header>
    {adSlot}
    {!tokenReady && <p className="warn">⏳ Cloud phones are busy right now — Many users are using free cloud phones, try again later.</p>}
    <div className="toasts">{toasts.map(t => <div key={t.id} className={"toast " + t.kind} onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>{t.kind === "warn" ? "⚠️ " : ""}{t.text}</div>)}</div>
    <div className="stats"><div><b>{visible.length}</b><span>total phones</span></div><div><b>{liveCount}</b><span>running now</span></div><div><b>4 CPU · 12 GB</b><span>per phone (max)</span></div><div><b>~6 h</b><span>max session</span></div></div>
    {visible.length === 0 ? <p className="empty">No phones yet. Hit <b>＋ New Cloud Phone</b> — each click starts a separate cloud phone, so you can run many phones at once. When one initializes, its live screen appears right inside its phone box.</p>
      : <div className="grid">{visible.map(p => <PhoneCard key={p.phoneId || p.runId} p={p} user={user} onStop={stop} onDelete={del} onToast={pushToast} />)}</div>}
    <button className="fab" onClick={create} disabled={creating || !tokenReady} title="New Cloud Phone">{creating ? "…" : "＋"}</button>
    </main></div>);
}
