import { cookieValue } from "./http.js";
import { findUserById } from "./db.js";

export const COOKIE = "ncp_session";
const encoder = new TextEncoder();
const toBase64Url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const fromBase64Url = value => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));

function secret(env) { return String(env.SESSION_SECRET || env.ADMIN_PASSWORD || ""); }
async function hmacKey(value) {
  return crypto.subtle.importKey("raw", encoder.encode(value), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function tokenConfigured(env) {
  return Boolean(env.GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN_FALLBACK_1 || env.GITHUB_TOKEN_FALLBACK_2 || env.GITHUB_TOKEN_FALLBACK_3);
}
export function dbConfigured(env) {
  return Boolean(env.AIVEN_DATABASE_URL || env.DATABASE_URL);
}

export async function makeSession(user, env) {
  const keyText = secret(env);
  if (!keyText) throw new Error("Session secret is not configured");
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const body = toBase64Url(encoder.encode(JSON.stringify({ sub: user.id, u: user.username, role: user.role, name: user.name, exp })));
  const key = await hmacKey(keyText);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

export async function parseSession(raw, env) {
  try {
    const keyText = secret(env);
    if (!raw || !keyText || raw.length > 4096) return null;
    const dot = raw.indexOf(".");
    if (dot <= 0 || dot !== raw.lastIndexOf(".")) return null;
    const body = raw.slice(0, dot), sig = fromBase64Url(raw.slice(dot + 1));
    const key = await hmacKey(keyText);
    if (!await crypto.subtle.verify("HMAC", key, sig, encoder.encode(body))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!data.exp || data.exp < Date.now() / 1000 || !data.u || !data.sub) return null;
    return { id: data.sub, username: data.u, role: data.role || "user", name: data.name || data.u };
  } catch { return null; }
}

export async function getUser(request, env) {
  const session = await parseSession(cookieValue(request, COOKIE), env);
  if (!session) return null;
  // A signed cookie is not enough by itself: deleted accounts and revoked
  // roles must stop working immediately, including old admin sessions.
  try { return await findUserById(session.id, env); } catch { return null; }
}
