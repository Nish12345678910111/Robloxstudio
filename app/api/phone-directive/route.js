import { NextResponse } from "next/server";
import crypto from "crypto";
import { dbConfigured, getPhoneRowById } from "../../../lib/db";

// Deletion queue for running phones. A phone's runner polls this with a
// per-phone secret (sha256 of the phone's own password - never stored
// here, never in any repo) and shuts itself down when told. Fail-open
// by design: anything unexpected answers "run", so a website hiccup
// can never kill a user's phone.
export async function GET(req) {
  const run = { action: "run" };
  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    const tok = req.headers.get("x-phone-token") || "";
    if (!dbConfigured() || !id) return NextResponse.json(run);
    const row = await getPhoneRowById(id).catch(() => null);
    if (!row) return NextResponse.json({ action: "stop" }); // deleted everywhere -> shut down
    if (!row.phone_password || !tok) return NextResponse.json(run);
    const want = crypto.createHash("sha256").update(row.phone_password).digest("hex");
    const a = Buffer.from(tok), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json(run);
    if (["deleting", "deleted"].includes(row.status)) return NextResponse.json({ action: "stop" });
    return NextResponse.json(run);
  } catch { return NextResponse.json(run); }
}
