import { NextResponse } from "next/server";
import { getUser } from "../../../../../lib/auth";
import { cancelRun } from "../../../../../lib/github";
export async function POST(req, { params }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { runId } = await params;
  try {
    const phone = await getPhoneByRun(Number(runId)).catch(() => null);
    if (user.role !== "admin" && (!phone || phone.owner_id !== user.id))
      return NextResponse.json({ error: "That cloud phone belongs to another user." }, { status: 403 });
    await cancelRun(runId); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Many users are using free cloud phones, try again later." }, { status: 503 }); }
}
