import { NextResponse } from "next/server";
import { isAuthed } from "../../../../../lib/auth";
import { cancelRun } from "../../../../../lib/github";
export async function POST(req, { params }) {
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { await cancelRun((await params).runId); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 502 }); }
}
