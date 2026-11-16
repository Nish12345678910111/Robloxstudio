import { NextResponse } from "next/server";
import { makeSession, COOKIE } from "../../../lib/auth";
import { dbConfigured, ensureSchema, createUser, findUser, verifyPassword, touchLogin, recentSignupFromIp, saveSignupIp, saveLastIp } from "../../../lib/db";
import { clientIp, vpnBlocked, VPN_MSG } from "../../../lib/netguard";

const BUSY = "Many users are using free cloud phones, try again later.";
const clean = (v, max) => String(v || "").trim().slice(0, max);
const USER_RE = /^[A-Za-z0-9_.-]{3,32}$/;

// tiny in-memory login throttle (per username+ip), blunts brute force
const hits = new Map();
function throttled(key) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(key, arr);
  return arr.length > 12;
}

export async function POST(req) {
  if (!dbConfigured()) return NextResponse.json({ error: "Database is not connected yet. Set AIVEN_DATABASE_URL in Vercel env vars, then redeploy." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "register" ? "register" : "login";
  const ip = clientIp(req);
  if (await vpnBlocked(ip)) return NextResponse.json({ error: VPN_MSG, vpn: true }, { status: 403 });
  try { await ensureSchema(); } catch { return NextResponse.json({ error: BUSY }, { status: 503 }); }
  try {
    if (mode === "register") {
      const name = clean(body.name, 60), username = clean(body.username, 32), password = String(body.password || "");
      if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
      if (!USER_RE.test(username)) return NextResponse.json({ error: "Username must be 3-32 chars: letters, numbers, _ . -" }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
      if (username.toLowerCase() === "admin") return NextResponse.json({ error: "That username is reserved." }, { status: 400 });
      if (await findUser(username)) return NextResponse.json({ error: "That username is already taken. Try another one." }, { status: 409 });
      const recent = await recentSignupFromIp(ip).catch(() => null);
      if (recent) return NextResponse.json({ error: "An account was already created from this network in the last 30 days. Please login to that account instead." }, { status: 409 });
      const user = await createUser(name, username, password);
      saveSignupIp(user.id, ip).catch(() => {});
      return sessionResponse(user);
    }
    // login
    const username = clean(body.username, 32), password = String(body.password || "");
    if (throttled(username + "|" + ip)) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
    await new Promise(r => setTimeout(r, 350)); // timing blunt
    const user = await findUser(username);
    if (!user || !verifyPassword(password, user.password_hash))
      return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
    touchLogin(user.id).catch(() => {});
    saveLastIp(user.id, ip).catch(() => {});
    return sessionResponse(user);
  } catch { return NextResponse.json({ error: BUSY }, { status: 503 }); }
}
function sessionResponse(user) {
  const pub = { id: user.id, name: user.name, username: user.username, role: user.role };
  const res = NextResponse.json({ ok: true, user: pub });
  res.cookies.set(COOKIE, makeSession(pub), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 });
  return res;
}
