import { NextResponse } from "next/server";
import { isAuthed, tokenConfigured } from "../../../lib/auth";
import { listPhones, dispatchPhone } from "../../../lib/github";
export async function GET(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!tokenConfigured()) return NextResponse.json({ phones: [], setup: "GITHUB_TOKEN is not set in Vercel env vars yet - add it, then redeploy." });
  try { return NextResponse.json({ phones: await listPhones() }); }
  catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 502 }); }
}
export async function POST(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!tokenConfigured()) return NextResponse.json({ error: "GITHUB_TOKEN is not set in Vercel env vars yet." }, { status: 503 });
  const phoneId = "phone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  try { await dispatchPhone(phoneId); return NextResponse.json({ ok: true, phoneId }); }
  catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 502 }); }
}
