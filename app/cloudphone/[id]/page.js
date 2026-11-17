import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { COOKIE, parseSession } from "../../../lib/auth";
import { dbConfigured, ensureSchema, getPhoneForUser } from "../../../lib/db";
import crypto from "crypto";
export const dynamic = "force-dynamic";
export default async function CloudPhonePage({ params }) {
  const user = parseSession((await cookies()).get(COOKIE)?.value);
  if (!user) redirect("/login");
  const { id } = await params;
  let phone = null;
  if (dbConfigured()) { try { await ensureSchema(); phone = await getPhoneForUser(user, decodeURIComponent(id)); } catch {} }
  if (!phone) return (<main className="wrap"><div className="notFound">
    <div className="nfIcon">📱🔍</div><h1>Cloud phone not found</h1>
    <p className="muted">Cloud phone not found in your account. It may have been deleted, or it belongs to someone else.</p>
    <Link className="btnLink" href="/">← Back to my cloud phones</Link></div></main>);
  const viewer = phone.viewer_url && phone.phone_password
    ? phone.viewer_url + "?t=" + crypto.createHash("sha256").update(phone.phone_password).digest("hex") : phone.viewer_url;
  const screen = viewer;
  const fallback = phone.tunnel_url ? phone.tunnel_url + "/vnc.html?autoconnect=true&resize=scale" : phone.viewer_url ? phone.viewer_url + "/fallback" : null;
  return (<main className="wrap">
    <header className="top"><div><h1>📱 Cloud Phone</h1>
      <p className="muted">{phone.phone_id} · Android 9 · {phone.status}</p></div>
      <Link className="btnLink" href="/">← My cloud phones</Link></header>
    <div className="credBox"><p><b>Url -</b> {screen ? <a href={screen} target="_blank" rel="noreferrer">{screen}</a> : "starting…"}</p>
      <p><b>Password -</b> {phone.phone_password ? <code>{phone.phone_password}</code> : "•••••••• (appears when ready)"}</p></div>
    {fallback ? <p className="footLinks" style={{ maxWidth: 430, margin: "0 auto 10px" }}><a href={fallback} target="_blank" rel="noreferrer">Fallback screen ↗</a></p> : null}
    <div className="phonePageBox">{screen
      ? <iframe src={screen} title="Cloud Phone" allow="fullscreen; clipboard-read; clipboard-write" />
      : <div className="phoneWait"><div className="spin" /><p>Cloud phone starting… refresh in a minute</p></div>}</div>
  </main>);
}
