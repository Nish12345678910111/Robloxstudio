"use client";
import { useEffect, useState } from "react";

const BUSY = "The cloud phone service is temporarily unavailable. Please try again.";

function Loading({ text = "Loading your cloud phone…" }) {
  return <main className="wrap"><div className="notFound"><div className="spin" /><p className="muted">{text}</p></div></main>;
}

function Problem({ text = BUSY, action = "Try again", onAction = () => location.reload() }) {
  return <main className="wrap"><div className="notFound"><div className="nfIcon">📱</div><h1>Cloud phone</h1>
    <p className="muted">{text}</p><button className="primary" onClick={onAction}>{action}</button>
    <p><a href="/login">Back to login</a></p></div></main>;
}

export default function PhoneRoute({ phoneId }) {
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

  const phone = state.phone;
  // The tunnel serves the official noVNC client at the token-gated /s/<hash>
  // path; the WebSocket uses the matching token-gated websockify route.
  const screen = phone.viewer_url && hash
    ? `${phone.viewer_url}/s/${hash}/vnc.html?autoconnect=true&resize=scale&host=&port=0&password=${encodeURIComponent(phone.phone_password || "")}&t=${hash}&path=/s/${hash}/websockify`
    : phone.viewer_url && phone.phone_password
      ? `${phone.viewer_url}/?password=${encodeURIComponent(phone.phone_password)}`
      : phone.viewer_url || null;
  const fallback = phone.tunnel_url
    ? `${phone.tunnel_url}/vnc.html?autoconnect=true&resize=scale&host=&port=0&password=${encodeURIComponent(phone.phone_password || "")}`
    : screen;

  return <main className="wrap">
    <header className="top"><div><h1>📱 Cloud Phone</h1><p className="muted">{phone.phone_id} · {phone.edition === "android15" ? "Android 15 compatibility test" : "Android 11"} · {phone.status}</p></div><a className="btnLink" href="/">← My cloud phones</a></header>
    <div className="credBox"><p><b>Url -</b> {screen ? <a href={screen} target="_blank" rel="noreferrer">{screen}</a> : "starting…"}</p>
      <p><b>Password -</b> {phone.phone_password ? <code>{phone.phone_password}</code> : "•••••••• (appears when ready)"}</p></div>
    {fallback && <p className="footLinks" style={{ maxWidth: 430, margin: "0 auto 10px" }}><a href={fallback} target="_blank" rel="noreferrer">Fallback screen (noVNC) ↗</a></p>}
    <div className="phonePageBox">{screen
      ? <iframe src={screen} title="Cloud Phone" allow="fullscreen; clipboard-read; clipboard-write" />
      : <div className="phoneWait"><div className="spin" /><p>Cloud phone starting… refresh in a minute</p></div>}</div>
  </main>;
}
