"use client";
import { useEffect, useState } from "react";
export default function Login({ configured }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState(""), [username, setUsername] = useState(""), [pw, setPw] = useState("");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [vpn, setVpn] = useState(false);
  const [agree, setAgree] = useState(false);
  useEffect(() => { fetch("/api/me").then(async r => { const d = await r.json().catch(() => ({}));
    if (d.vpn) { setVpn(true); setErr(d.error); } }).catch(() => {}); }, []);
  async function go(e) { e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "register" ? { mode, name, username, password: pw, agree } : { mode, username, password: pw }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) location.reload(); else { setErr(d.error || "Something went wrong"); setBusy(false); } }
  return (<main className="loginWrap"><form className="loginCard" onSubmit={go}>
    <div className="logo">☁️📱</div><h1>NishCloudPhone</h1>
    <p className="muted">{mode === "register" ? "Create your free account" : "Welcome back — login to your cloud phones"}</p>
    {!configured && <p className="warn">Service setup is in progress — please try again shortly.</p>}
    {mode === "register" && <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="name" />}
    <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" autoComplete="username" autoFocus={mode === "login"} />
    <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Password (min 8 characters)" autoComplete={mode === "register" ? "new-password" : "current-password"} />
    {mode === "register" && <label className="agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
      <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a></span></label>}
    {err && <p className="err">{err}</p>}{vpn && <p className="warn">🚫 This page is disabled while a VPN / proxy is on. Turn it off and reload.</p>}
    <button className="primary" disabled={busy || vpn || (mode === "register" && !agree)}>{busy ? "Please wait…" : mode === "register" ? "Create account →" : "Login →"}</button>
    <p className="switch">{mode === "register"
      ? <>Already have an account? <a href="#" onClick={e => { e.preventDefault(); setMode("login"); setErr(""); }}>Login</a></>
      : <>New here? <a href="#" onClick={e => { e.preventDefault(); setMode("register"); setErr(""); }}>Create account</a></>}</p>
    <p className="tiny">🔒 Passwords are stored only as secure hashes. Max 5 free cloud phones per account.</p>
    <p className="tiny"><a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Policy</a><br />Created by <b>nishgamerr</b></p>
  </form></main>);
}
