import { NextResponse } from "next/server";
import { checkPassword, makeSession, COOKIE, dashboardConfigured } from "../../../lib/auth";
export async function POST(req) {
  if (!dashboardConfigured()) return NextResponse.json({ error: "DASHBOARD_PASSWORD is not set in Vercel env vars yet." }, { status: 503 });
  const { password } = await req.json().catch(() => ({}));
  // small delay blunts brute force; password compare is timing-safe
  await new Promise(r => setTimeout(r, 400));
  if (!checkPassword(password || "")) return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeSession(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 });
  return res;
}
