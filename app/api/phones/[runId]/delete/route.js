import { NextResponse } from "next/server";
import { isAuthed } from "../../../../../lib/auth";
import { cancelRun, deleteRun } from "../../../../../lib/github";
export async function DELETE(req, { params }) {
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { runId } = await params;
  try {
    let status = await deleteRun(runId);
    if (status === 422 || status === 403) {
      // Still running: stop it now; GitHub allows deleting the run afterwards,
      // and the dashboard also hides it immediately on the client.
      try { await cancelRun(runId); } catch {}
      status = await deleteRun(runId).catch(() => 0);
    }
    return NextResponse.json({ ok: true, githubStatus: status });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 502 }); }
}
