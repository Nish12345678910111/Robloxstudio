"use client";
import { useState } from "react";
export default function Login({ configured }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  async function go(e) { e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) location.reload(); else { setErr((await r.json()).error || "Wrong password"); setBusy(false); } }
  return (<main className="loginWrap"><form className="loginCard" onSubmit={go}>
    <div className="logo">☁️📱</div><h1>NishCloudPhone</h1>
    <p className="muted">Private dashboard — sign in to launch cloud phones.</p>
    {!configured && <p className="warn">Setup needed: set <b>DASHBOARD_PASSWORD</b> in Vercel → Project → Settings → Environment Variables, then redeploy.</p>}
    <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Dashboard password" autoFocus />
    {err && <p className="err">{err}</p>}
    <button disabled={busy}>{busy ? "Checking…" : "Unlock dashboard →"}</button>
  </form></main>);
}
