import { makeSession, sessionSecretConfigured } from "../_lib/auth.js";
import { createUser, dbConfigured, ensureSchema, findUser, saveLastIp, touchLogin } from "../_lib/db.js";
import { verifyPassword } from "../_lib/passwords.js";
import { appendSessionCookie, clientIp, json, sameOrigin } from "../_lib/http.js";
import { VPN_MSG, vpnBlocked } from "../_lib/netguard.js";

const AUTH_BUSY = "Login is temporarily unavailable. Please try again shortly.";
const SESSION_SETUP = "Login setup is incomplete: configure SESSION_SECRET (or ADMIN_PASSWORD) in the hosting environment.";
const USER_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const hits = new Map();
function throttled(key, limit = 12) {
  const now = Date.now(), recent = (hits.get(key) || []).filter(time => now - time < 60000);
  recent.push(now); hits.set(key, recent);
  return recent.length > limit;
}
function clean(value, max) { return String(value || "").trim().slice(0, max); }
const safeLogText = value => String(value || "")
  .replace(/postgres(?:ql)?:\/\/[^\s\"'<>]+/gi, "[redacted database URL]")
  .replace(/\b(password|passwd|token|authorization)\s*[:=]\s*(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gi, "[redacted token]")
  .replace(/\s+/g, " ").trim().slice(0, 200);

export function safeAuthErrorDetails(error) {
  const safeField = (value, fallback) => String(value || fallback).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 40);
  const details = {
    name: safeField(error?.name, "Error"),
    code: safeField(error?.code, "unknown"),
    message: safeLogText(error?.message) || "No error message provided",
  };
  const cause = safeLogText(error?.cause?.message);
  if (cause) details.cause = cause;
  return details;
}

function logAuthFailure(stage, error) {
  // Include a bounded, redacted message/cause so an unclassified runtime
  // failure can be diagnosed without logging SQL values or connection secrets.
  console.error("[nishcloudphone auth]", stage, safeAuthErrorDetails(error));
}

async function sessionResponse(user, env) {
  const pub = { id: user.id, name: user.name, username: user.username, role: user.role };
  const token = await makeSession(pub, env);
  return appendSessionCookie(json({ ok: true, user: pub }, 200), token);
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);
  if (!dbConfigured(env)) return json({ error: "Service setup is in progress. Please try again shortly." }, 503);
  if (!sessionSecretConfigured(env)) return json({ error: SESSION_SETUP }, 503);
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "register" ? "register" : "login";
  const ip = clientIp(request);
  if (await vpnBlocked(ip)) return json({ error: VPN_MSG, vpn: true }, 403);
  if (mode === "register" && throttled(`register|${ip}`, 3)) return json({ error: "Too many sign-up attempts. Wait a minute and try again." }, 429);
  try { await ensureSchema(env); } catch (error) {
    logAuthFailure("schema initialization failed", error);
    return json({ error: AUTH_BUSY }, 503);
  }
  try {
    if (mode === "register") {
      const name = clean(body.name, 60), username = clean(body.username, 32), password = String(body.password || "");
      if (name.length < 2) return json({ error: "Please enter your name." }, 400);
      if (!USER_RE.test(username)) return json({ error: "Username must be 3-32 chars: letters, numbers, _ . -" }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
      if (body.agree !== true) return json({ error: "Please tick the box to agree to the Terms of Service and Privacy Policy." }, 400);
      if (username.toLowerCase() === "admin") return json({ error: "That username is reserved." }, 400);
      if (await findUser(username, env)) return json({ error: "That username is already taken. Try another one." }, 409);
      const user = await createUser(name, username, password, ip, env);
      if (user.blockedByIp) return json({ error: "An account was already created from this network in the last 30 days. Please login to that account instead." }, 409);
      if (user.usernameTaken) return json({ error: "That username is already taken. Try another one." }, 409);
      return sessionResponse(user, env);
    }

    const username = clean(body.username, 32), password = String(body.password || "");
    if (throttled(`${username}|${ip}`)) return json({ error: "Too many attempts. Wait a minute and try again." }, 429);
    await new Promise(resolve => setTimeout(resolve, 350));
    const user = await findUser(username, env);
    if (!user || !await verifyPassword(password, user.password_hash)) return json({ error: "Wrong username or password." }, 401);
    await Promise.all([touchLogin(user.id, env), saveLastIp(user.id, ip, env)]).catch(() => {});
    return sessionResponse(user, env);
  } catch (error) {
    logAuthFailure("login or session creation failed", error);
    return json({ error: AUTH_BUSY }, 503);
  }
}
