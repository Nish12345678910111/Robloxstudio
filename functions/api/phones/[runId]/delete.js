import { getUser } from "../../../_lib/auth.js";
import { deletePhoneRow, getPhoneByRun, getPhoneRowById, markPhoneDeletedByRun, setPhoneStatus } from "../../../_lib/db.js";
import { cancelRun, deleteRun, findRunIdsByPhoneId, getRunStatus, listPhones } from "../../../_lib/github.js";
import { json, sameOrigin } from "../../../_lib/http.js";

const BUSY = "Many users are using free cloud phones, try again later.";

export async function onRequestDelete({ request, env, params }) {
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const param = String(params.runId || "");
  try {
    let row = /^\d+$/.test(param) ? await getPhoneByRun(Number(param), env).catch(() => null) : null;
    if (!row) row = await getPhoneRowById(param, env).catch(() => null);
    if (!row && /^\d+$/.test(param)) {
      const liveRun = (await listPhones(true, env)).find(phone => String(phone.runId) === param);
      if (liveRun?.phoneId && liveRun.phoneId !== "…") row = await getPhoneRowById(liveRun.phoneId, env).catch(() => null);
    }
    if (user.role !== "admin" && (!row || row.owner_id !== user.id)) {
      return json({ error: "That cloud phone belongs to another user." }, 403);
    }

    const runIds = new Set();
    if (/^\d+$/.test(param)) runIds.add(param);
    if (row?.run_id) runIds.add(String(row.run_id));
    if (row?.phone_id) {
      for (const id of await findRunIdsByPhoneId(row.phone_id, env)) runIds.add(String(id));
    }

    const finish = async () => {
      if (row?.phone_id) await deletePhoneRow(row.phone_id, env);
      else for (const id of runIds) await markPhoneDeletedByRun(id, env);
      if (row?.phone_id) {
        if (await getPhoneRowById(row.phone_id, env)) return json({ ok: true, deleted: false, state: "deleting" }, 202);
      } else {
        for (const id of runIds) if (await getPhoneByRun(id, env)) return json({ ok: true, deleted: false, state: "deleting" }, 202);
      }
      return json({ ok: true, deleted: true });
    };

    if (!runIds.size) {
      // A rejected dispatch is known not to have a run. A starting row is
      // retained briefly for GitHub's dispatch visibility delay; after ten
      // minutes the successful run-list lookup above has proved it absent.
      const age = row?.created_at ? Date.now() - new Date(row.created_at).getTime() : 0;
      if (row?.status === "busy" || age > 10 * 60 * 1000) return finish();
      return json({ ok: true, deleted: false, state: "starting" }, 202);
    }

    let pendingState = null;
    for (const runId of runIds) {
      const status = await getRunStatus(runId, env);
      if (status === null) continue;
      if (status !== "completed") {
        if (row?.phone_id) await setPhoneStatus(row.phone_id, "deleting", env).catch(() => {});
        await cancelRun(runId, env).catch(() => {});
        pendingState = "stopping";
        continue;
      }
      await deleteRun(runId, env).catch(() => null);
      // Do not remove the database row until GitHub confirms every matching
      // run has vanished, including any duplicate dispatches from the past.
      if (await getRunStatus(runId, env).catch(() => "unknown") !== null) pendingState ||= "deleting";
    }
    if (pendingState) return json({ ok: true, deleted: false, state: pendingState }, 202);
    return finish();
  } catch { return json({ error: BUSY }, 503); }
}
