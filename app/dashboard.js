"use client";
import { useCallback, useEffect, useRef, useState } from "react";
const fmt = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
function PhoneCard({ p, onStop, onDelete }) {
  const screenUrl = p.viewerUrl || p.novncUrl;
  const live = p.status === "in_progress" && screenUrl;
  const state = live ? "● LIVE" : p.status === "in_progress" ? "⏳ Initializing…" : p.status === "queued" ? "Queued" : p.conclusion === "cancelled" ? "Stopped" : p.conclusion || p.status;
  const boxRef = useRef(null);
  const [isFs, setIsFs] = useState(false);
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
    <header className="cardHead"><div><h3>📱 Cloud Phone · {p.edition === "android9" ? "Android 9" : "Android 11"}</h3><span className="muted">{p.phoneId} · run #{p.runId} · started {fmt(p.createdAt)}</span></div>
      <span className={live ? "badge live" : "badge"}>{state}</span></header>
    <div className="credBox">
      <p><b>Url -</b> {screenUrl ? <a href={screenUrl} target="_blank" rel="noreferrer">{screenUrl}</a> : "waiting for Cloudflare tunnel…"}</p>
      <p><b>Password -</b> {p.password ? <code>{p.password}</code> : "•••••••• (appears when initialized)"}</p>
    </div>
    <div className="phoneWrap" ref={boxRef}>
      <button className="fsBtn" onClick={toggleFs}>{isFs ? "✕ Exit full screen" : "⛶ Full screen"}</button>
      <div className="phoneBox">
        {live ? <iframe src={screenUrl} title={"Cloud Phone " + p.phoneId} allow="fullscreen; clipboard-read; clipboard-write" /> :
          <div className="phoneWait"><div className="spin" /><p>{p.status === "in_progress" ? "Phone is booting straight to home screen…\nNo setup wizard — just wait 2–5 min" : state}</p></div>}
      </div>
    </div>
    <footer className="cardFoot">
      <span className="footLinks"><a href={p.runUrl} target="_blank" rel="noreferrer">GitHub run ↗</a>{p.novncUrl && p.viewerUrl ? <a href={p.novncUrl} target="_blank" rel="noreferrer">fallback screen ↗</a> : null}</span>
      <span className="footBtns">
        {(p.status === "in_progress" || p.status === "queued") && <button className="stop" onClick={() => onStop(p.runId)}>⏹ Stop Cloud Phone</button>}
        <button className="del" onClick={() => onDelete(p)}>🗑 Delete Cloud Phone</button>
      </span>
    </footer>
  </section>);
}
export default function Dashboard({ tokenReady }) {
  const [phones, setPhones] = useState([]), [msg, setMsg] = useState(""), [creating, setCreating] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("ncp_hidden") || "[]")); } catch { return new Set(); } });
  const load = useCallback(async () => { const r = await fetch("/api/phones"); if (r.ok) { const d = await r.json(); setPhones(d.phones || []); if (d.setup) setMsg(d.setup); } }, []);
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, [load]);
  async function create() { setCreating(true); setMsg("");
    const r = await fetch("/api/phones", { method: "POST" }); const d = await r.json();
    if (r.ok) { setMsg(`Creating ${d.phoneId} — max specs: 4 CPU · 12 GB RAM · 32 GB storage · ~340 min session.`); load(); }
    else setMsg("Error: " + (d.error || r.status)); setCreating(false); }
  async function stop(id) { await fetch(`/api/phones/${id}/stop`, { method: "POST" }); setMsg("Stopping cloud phone…"); load(); }
  async function del(p) {
    if (!confirm(`Delete Cloud Phone ${p.phoneId}? A running phone will be stopped first.`)) return;
    setPhones(ps => ps.filter(x => x.runId !== p.runId));
    setHidden(h => { const n = new Set(h); n.add(p.runId); localStorage.setItem("ncp_hidden", JSON.stringify([...n])); return n; });
    // Keep asking the server until GitHub confirms the workflow run is
    // really deleted (a running phone must finish cancelling first).
    setMsg(`Deleting ${p.phoneId}… stopping it on GitHub first, this can take ~30s.`);
    for (let i = 0; i < 25; i++) {
      try {
        const r = await fetch(`/api/phones/${p.runId}/delete`, { method: "DELETE" });
        const d = await r.json();
        if (d.deleted) { setMsg("Cloud phone deleted - workflow run removed from GitHub."); load(); return; }
        if (!r.ok && r.status !== 202) { setMsg("Delete failed: " + (d.error || r.status) + " (your GITHUB_TOKEN needs Actions: Read and write)"); load(); return; }
      } catch {}
      await new Promise(res => setTimeout(res, 4000));
    }
    setMsg("Delete is taking long - it will disappear once GitHub finishes stopping it."); load();
  }
  async function logout() { await fetch("/api/logout", { method: "POST" }); location.reload(); }
  const visible = phones.filter(p => !hidden.has(p.runId)); const liveCount = visible.filter(p => p.status === "in_progress").length;
  return (<main className="wrap">
    <header className="top"><div><h1>☁️ NishCloudPhone</h1><p className="muted">Android phones in QEMU · noVNC</p></div>
      <div className="topBtns"><button className="primary" onClick={create} disabled={creating || !tokenReady}>{creating ? "Launching…" : "＋ New Cloud Phone"}</button>
      <button className="ghost" onClick={logout}>Log out</button></div></header>
    {!tokenReady && <p className="warn">⚠ <b>GITHUB_TOKEN not set.</b> Add it in Vercel → nishcloudphone → Settings → Environment Variables (a GitHub fine-grained PAT with <b>Actions: read/write</b> on Nish12345678910111/Robloxstudio), then redeploy. Until then the New Cloud Phone button is disabled.</p>}
    {msg && <p className="msg">{msg}</p>}
    <div className="stats"><div><b>{visible.length}</b><span>total phones</span></div><div><b>{liveCount}</b><span>running now</span></div><div><b>4 CPU · 12 GB</b><span>per phone (max)</span></div><div><b>~6 h</b><span>max session</span></div></div>
    {visible.length === 0 ? <p className="empty">No phones yet. Hit <b>＋ New Cloud Phone</b> — each click starts a separate cloud phone, so you can run many phones at once. When one initializes, its live screen appears right inside its phone box.</p>
      : <div className="grid">{phones.filter(p => !hidden.has(p.runId)).map(p => <PhoneCard key={p.runId} p={p} onStop={stop} onDelete={del} />)}</div>}
  </main>);
}
