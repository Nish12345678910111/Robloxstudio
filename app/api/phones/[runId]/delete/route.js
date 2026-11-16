import { NextResponse } from "next/server";
import { getUser } from "../../../../../lib/auth";
import { getPhoneByRun, markPhoneDeletedByRun } from "../../../../../lib/db";
import { cancelRun, deleteRun, getRunStatus } from "../../../../../lib/github";
export const maxDuration = 60;
// GitHub will NOT delete a run that is still queued/in_progress, and a
// cancelled run needs a few seconds to reach "completed" first. So this
// endpoint is stage-based and idempotent - the dashboard keeps calling it
// until it returns {deleted:true} (verified: the run then 404s on GitHub).
export async function DELETE(req, { params }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { runId } = await params;
  try {
    const owned = await getPhoneByRun(Number(runId)).catch(() => null);
    if (user.role !== "admin" && (!owned || owned.owner_id !== user.id))
      return NextResponse.json({ error: "That cloud phone belongs to another user." }, { status: 403 });
    const status = await getRunStatus(runId);
    if (status === null) { await markPhoneDeletedByRun(Number(runId)).catch(() => {}); return NextResponse.json({ ok: true, deleted: true }); }
    if (status !== "completed") {
      try { await cancelRun(runId); } catch {}
      return NextResponse.json({ ok: true, deleted: false, state: "stopping", runStatus: status }, { status: 202 });
    }
    const del = await deleteRun(runId);
    const after = await getRunStatus(runId).catch(() => "unknown");
    if (after === null || del === 204) return NextResponse.json({ ok: true, deleted: true });
    return NextResponse.json({ ok: true, deleted: false, state: "deleting", githubStatus: del }, { status: 202 });
  } catch { return NextResponse.json({ error: "Many users are using free cloud phones, try again later." }, { status: 503 }); }
}
