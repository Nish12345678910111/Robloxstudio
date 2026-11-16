import { NextResponse } from "next/server";
import { getUser } from "../../../../../lib/auth";
import { getPhoneByRun, getPhoneRowById, markPhoneDeletedByRun, deletePhoneRow } from "../../../../../lib/db";
import { cancelRun, deleteRun, getRunStatus, findRunByPhoneId } from "../../../../../lib/github";
export const maxDuration = 60;
// Deleting a cloud phone MUST delete its workflow run too - in every case:
//  * param may be a run id OR a phone id (dashboard uses whichever it has)
//  * the DB row may not be linked to the run yet -> find the run by phone id
//  * a running run cannot be deleted upstream, so: cancel -> wait for
//    "completed" -> delete -> verify it 404s -> only then remove the DB row.
// Stage-based + idempotent: the dashboard keeps calling until {deleted:true}.
export async function DELETE(req, { params }) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { runId: param } = await params;
  try {
    // 1) Resolve the DB row (by run id first, then by phone id).
    let row = /^\d+$/.test(param) ? await getPhoneByRun(Number(param)).catch(() => null) : null;
    if (!row) row = await getPhoneRowById(param).catch(() => null);
    if (!row && /^\d+$/.test(param)) {
      // Row may exist but not be linked to this run yet - try via live runs.
      const found = await findRunByPhoneId(param).catch(() => null);
      if (found) row = await getPhoneRowById(param).catch(() => null);
    }
    if (user.role !== "admin" && (!row || row.owner_id !== user.id))
      return NextResponse.json({ error: "That cloud phone belongs to another user." }, { status: 403 });

    // 2) Resolve the run id: param, row link, or live lookup by phone id.
    let runId = /^\d+$/.test(param) ? param : null;
    if (!runId && row?.run_id) runId = String(row.run_id);
    if (!runId && row?.phone_id) runId = await findRunByPhoneId(row.phone_id).catch(() => null);

    const finish = async () => {
      // Run is confirmed gone (or never existed) - NOW remove the DB row.
      if (row?.phone_id) await deletePhoneRow(row.phone_id).catch(() => {});
      if (runId) await markPhoneDeletedByRun(Number(runId)).catch(() => {});
      return NextResponse.json({ ok: true, deleted: true });
    };

    if (!runId) return finish(); // phone never started upstream - row removal is enough

    const status = await getRunStatus(runId);
    if (status === null) return finish(); // already gone upstream
    if (status !== "completed") {
      try { await cancelRun(runId); } catch {}
      return NextResponse.json({ ok: true, deleted: false, state: "stopping", runStatus: status }, { status: 202 });
    }
    const del = await deleteRun(runId).catch(() => 0);
    const after = await getRunStatus(runId).catch(() => "unknown");
    if (after === null || del === 204 || del === 404) return finish();
    return NextResponse.json({ ok: true, deleted: false, state: "deleting", githubStatus: del }, { status: 202 });
  } catch { return NextResponse.json({ error: "Many users are using free cloud phones, try again later." }, { status: 503 }); }
}
