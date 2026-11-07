import crypto from "crypto";
export const COOKIE = "ncp_session";
const secret = () => process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD || "";
export function dashboardConfigured() { return Boolean(process.env.DASHBOARD_PASSWORD); }
export function tokenConfigured() { return Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN); }
export function checkPassword(pw) {
  const want = process.env.DASHBOARD_PASSWORD || "";
  if (!want || typeof pw !== "string") return false;
  const a = crypto.createHash("sha256").update(pw).digest(), b = crypto.createHash("sha256").update(want).digest();
  return crypto.timingSafeEqual(a, b);
}
export function makeSession() {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const body = Buffer.from(JSON.stringify({ u: "owner", exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export function isAuthed(req) {
  try {
    const raw = req.cookies?.get?.(COOKIE)?.value || (req.headers.get("cookie") || "").split(";").map(s=>s.trim()).find(s=>s.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
    if (!raw || !secret()) return false;
    const [body, sig] = raw.split(".");
    const ok = crypto.timingSafeEqual(Buffer.from(crypto.createHmac("sha256", secret()).update(body).digest("base64url")), Buffer.from(sig || ""));
    return ok && JSON.parse(Buffer.from(body, "base64url").toString()).exp > Date.now() / 1000;
  } catch { return false; }
}
