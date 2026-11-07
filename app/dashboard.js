"use client";
import { useCallback, useEffect, useState } from "react";
const fmt = t => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
function PhoneCard({ p, onStop }) {
  const live = p.status === "in_progress" && p.novncUrl;
  const state = live ? "● LIVE" : p.status === "in_progress" ? "⏳ Initializing…" : p.status === "queued" ? "Queued" : p.conclusion === "cancelled" ? "Stopped" : p.conclusion || p.status;
  return (<section className="card">
    <header className="cardHead"><div><h3>📱 {p.phoneId}</h3><span className="muted">run #{p.runId} · started {fmt(p.createdAt)}</span></div>
      <span className={live ? "badge live" : "badge"}>{state}</span></header>
    {/* inside the card padding, above the phone box — exactly as requested */}
    <div className="credBox">
      <p><b>Url -</b> {p.novncUrl ? <a href={p.novncUrl} target="_blank" rel="noreferrer">{p.novncUrl}</a> : "waiting for Cloudflare tunnel…"}</p>
      <p><b>Password -</b> {p.password ? <code>{p.password}</code> : "•••••••• (appears when initialized)"}</p>
    </div>
    <div className="phoneBox">
      {live ? <iframe src={p.novncUrl} title={p.phoneId} allow="fullscreen" /> :
        <div className="phoneWait"><div className="spin" /><p>{p.status === "in_progress" ? "Phone is booting…\nQEMU + Android take 2–5 min" : state}</p></div>}
    </div>
    <footer className="cardFoot">
      <a href={p.runUrl} target="_blank" rel="noreferrer">GitHub run ↗</a>
      {(p.status === "in_progress" || p.status === "queued") && <button className="stop" onClick={() => onStop(p.runId)}>⏹ Stop phone</button>}
    </footer>
  </section>);
}
export default function Dashboard({ tokenReady }) {
  const [phones, setPhones] = useState([]), [msg, setMsg] = useState(""), [creating, setCreating] = useState(false);
  const load = useCallback(async () => { const r = await fetch("/api/phones"); if (r.ok) { const d = await r.json(); setPhones(d.phones || []); if (d.setup) setMsg(d.setup); } }, []);
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, [load]);
  async function create() { setCreating(true); setMsg("");
    const r = await fetch("/api/phones", { method: "POST" }); const d = await r.json();
    if (r.ok) { setMsg(`Creating ${d.phoneId} — max specs: 4 CPU · 12 GB RAM · 32 GB storage · ~340 min session.`); load(); }
    else setMsg("Error: " + (d.error || r.status)); setCreating(false); }
  async function stop(id) { await fetch(`/api/phones/${id}/stop`, { method: "POST" }); load(); }
  async function logout() { await fetch("/api/logout", { method: "POST" }); location.reload(); }
  const liveCount = phones.filter(p => p.status === "in_progress").length;
  return (<main className="wrap">
    <header className="top"><div><h1>☁️ NishCloudPhone</h1><p className="muted">Android phones in QEMU · GitHub Actions runners · Cloudflare tunnels · noVNC</p></div>
      <div className="topBtns"><button className="primary" onClick={create} disabled={creating || !tokenReady}>{creating ? "Launching…" : "＋ New Cloud Phone"}</button>
      <button className="ghost" onClick={logout}>Log out</button></div></header>
    {!tokenReady && <p className="warn">⚠ <b>GITHUB_TOKEN not set.</b> Add it in Vercel → nishcloudphone → Settings → Environment Variables (a GitHub fine-grained PAT with <b>Actions: read/write</b> on Nish12345678910111/Robloxstudio), then redeploy. Until then the New Cloud Phone button is disabled.</p>}
    {msg && <p className="msg">{msg}</p>}
    <div className="stats"><div><b>{phones.length}</b><span>total phones</span></div><div><b>{liveCount}</b><span>running now</span></div><div><b>4 CPU · 12 GB</b><span>per phone (max)</span></div><div><b>~6 h</b><span>max session (GitHub limit)</span></div></div>
    {phones.length === 0 ? <p className="empty">No phones yet. Hit <b>＋ New Cloud Phone</b> — each click starts a separate GitHub workflow run, so you can run many phones at once. When one initializes, its live screen appears right inside its phone box.</p>
      : <div className="grid">{phones.map(p => <PhoneCard key={p.runId} p={p} onStop={stop} />)}</div>}
    <p className="muted foot">GitHub kills every job at ~360 min — no workflow can run truly forever. When a phone dies, just create a new one. Passwords/URLs are fetched server-side from private Actions artifacts and are never stored in the repo.</p>
  </main>);
}
