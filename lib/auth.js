import crypto from "crypto";
export const COOKIE = "ncp_session";
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
export const tokenConfigured = () => Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);

function sign(body) { return crypto.createHmac("sha256", secret()).update(body).digest("base64url"); }
export function makeSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const body = Buffer.from(JSON.stringify({ sub: user.id, u: user.username, role: user.role, name: user.name, exp })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function parseSession(raw) {
  try {
    if (!raw || !secret()) return null;
    const [body, sig] = raw.split(".");
    if (!body || !sig) return null;
    const a = Buffer.from(sign(body)), b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data.exp || data.exp < Date.now() / 1000 || !data.u) return null;
    return { id: data.sub, username: data.u, role: data.role || "user", name: data.name || data.u };
  } catch { return null; }
}
export function getUser(req) {
  let raw = null;
  try { raw = req.cookies?.get?.(COOKIE)?.value; } catch {}
  if (!raw) { try { raw = (req.headers.get("cookie") || "").split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1); } catch {} }
  return parseSession(raw);
}
export const isAuthed = req => Boolean(getUser(req));
// old single-password flow is gone; kept as a stub so nothing imports a ghost
export const dashboardConfigured = () => Boolean(process.env.AIVEN_DATABASE_URL || process.env.DATABASE_URL);
export const dbConfiguredSafe = dashboardConfigured;
