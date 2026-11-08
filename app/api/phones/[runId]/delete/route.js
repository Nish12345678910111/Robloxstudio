import { NextResponse } from "next/server";
import { isAuthed } from "../../../../../lib/auth";
import { cancelRun, deleteRun, getRunStatus } from "../../../../../lib/github";
export const maxDuration = 60;
// GitHub will NOT delete a run that is still queued/in_progress, and a
// cancelled run needs a few seconds to reach "completed" first. So this
// endpoint is stage-based and idempotent - the dashboard keeps calling it
// until it returns {deleted:true} (verified: the run then 404s on GitHub).
export async function DELETE(req, { params }) {
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { runId } = await params;
  try {
    const status = await getRunStatus(runId);
    if (status === null) return NextResponse.json({ ok: true, deleted: true });
    if (status !== "completed") {
      try { await cancelRun(runId); } catch {}
      return NextResponse.json({ ok: true, deleted: false, state: "stopping", runStatus: status }, { status: 202 });
    }
    const del = await deleteRun(runId);
    const after = await getRunStatus(runId).catch(() => "unknown");
    if (after === null || del === 204) return NextResponse.json({ ok: true, deleted: true });
    return NextResponse.json({ ok: true, deleted: false, state: "deleting", githubStatus: del }, { status: 202 });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 502 }); }
}
