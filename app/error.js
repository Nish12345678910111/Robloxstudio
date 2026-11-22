"use client";
import { useEffect } from "react";
export default function ErrorPage({ reset }) {
  useEffect(() => { const t = setTimeout(() => reset(), 4000); return () => clearTimeout(t); }, [reset]);
  return (<main className="wrap"><div className="notFound">
    <div className="nfIcon">📱</div><h1>Cloud phone</h1>
    <p className="muted">This page hit a snag. Reloading…</p>
    <button className="btnLink" onClick={() => reset()}>Reload now</button>
  </div></main>);
}
