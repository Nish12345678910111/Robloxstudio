import { getUser, tokenConfigured } from "../_lib/auth.js";
import { createPhoneRow, dbConfigured, deletePhoneRow, ensureSchema, linkRun, listPhoneRows, setPhoneStatus } from "../_lib/db.js";
import { cancelRun, deleteRun, dispatchPhone, findRunsByPhoneIds, getRunStatus, listPhones } from "../_lib/github.js";
import { clientIp, json, sameOrigin } from "../_lib/http.js";
import { VPN_MSG, vpnBlocked } from "../_lib/netguard.js";
import { reconcilePhoneRuns } from "../_lib/phone-ownership.js";

const BUSY = "Many users are using free cloud phones, try again later.";
const MAX_FREE = 5;
const lastCreate = new Map();
const storedStatus = status => status === "running" ? "in_progress"
  : ["stopped", "deleted"].includes(status) ? "completed"
    : ["starting", "queued", "in_progress", "completed", "deleting", "busy"].includes(status) ? status : "starting";

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await vpnBlocked(clientIp(request))) return json({ error: VPN_MSG, vpn: true, phones: [], totalPhones: 0 }, 403);
  if (!dbConfigured(env)) return json({ phones: [], totalPhones: 0, notice: "Service setup is in progress. Please try again shortly." });

  let rows = [];
  try { await ensureSchema(env); rows = await listPhoneRows(user, env); }
  catch {
    await new Promise(resolve => setTimeout(resolve, 400));
    try { rows = await listPhoneRows(user, env); }
    catch { return json({ phones: [], totalPhones: 0, notice: BUSY }); }
  }

  let live = [], liveOk = true;
  if (tokenConfigured(env)) {
    try { live = await listPhones(false, env); }
    catch {
      await new Promise(resolve => setTimeout(resolve, 600));
      try { live = await listPhones(true, env); } catch { liveOk = false; }
    }
  }
  let reconciliation = reconcilePhoneRuns(rows, live);
  const matchesByPhoneId = () => new Map(reconciliation.matched.map(({ row, run }) => [String(row.phone_id), run]));
  if (liveOk) {
    const oldRows = rows.filter(row => Date.now() - new Date(row.created_at).getTime() >= 24 * 3600 * 1000).slice(0, 5);
    let runsByPhone = new Map(), scanOk = !oldRows.length;
    if (tokenConfigured(env) && oldRows.length) {
      try { runsByPhone = await findRunsByPhoneIds(oldRows.map(row => row.phone_id), env); scanOk = true; }
      catch { scanOk = false; }
    }
    const rowRuns = matchesByPhoneId();
    let checked = 0;
    for (const row of oldRows) {
      if (checked >= 5) break;
      if (!scanOk) continue;
      const run = rowRuns.get(String(row.phone_id));
      const runIds = new Set([...(runsByPhone.get(row.phone_id) || []), ...(row.run_id ? [String(row.run_id)] : []), ...(run?.runId ? [String(run.runId)] : [])]);
      if (!runIds.size) {
        // This row is at least a day old and the complete GitHub history scan
        // found no dispatch for it, so it is safe to drop the orphaned DB row.
        await deletePhoneRow(row.phone_id, env).catch(() => {});
        rows.splice(rows.indexOf(row), 1);
        continue;
      }
      checked++;
      let allGone = true;
      for (const runId of runIds) {
        const status = await getRunStatus(runId, env).catch(() => "unknown");
        if (status === null) continue;
        if (status !== "completed") { allGone = false; break; }
        await deleteRun(runId, env).catch(() => null);
        // A 204 only acknowledges deletion; retain the row until GitHub
        // confirms every run for this phone is actually gone.
        if (await getRunStatus(runId, env).catch(() => "unknown") !== null) { allGone = false; break; }
      }
      if (!allGone) continue;
      await deletePhoneRow(row.phone_id, env).catch(() => {});
      rows.splice(rows.indexOf(row), 1);
    }
    reconciliation = reconcilePhoneRuns(rows, live);
  }

  const rowRuns = matchesByPhoneId();
  await Promise.all(rows.map(row => {
    const run = rowRuns.get(String(row.phone_id));
    const persistedStatus = row.status === "deleting" ? "deleting" : run?.status;
    if (run && (String(row.run_id || "") !== String(run.runId) || row.status !== persistedStatus)) {
      return linkRun(row.phone_id, run.runId, persistedStatus, env).catch(() => {});
    }
    return null;
  }));
  const phones = [];
  for (const { row, run } of reconciliation.matched) {
    const owner = row.owner_username || null;
    phones.push({
      phoneId: row.phone_id, runId: run?.runId || row.run_id || null,
      edition: row.edition, owner, ownerStatus: owner ? "verified" : "unavailable",
      status: run?.status || storedStatus(row.status),
      conclusion: run?.conclusion || null, createdAt: run?.createdAt || row.created_at,
      viewerUrl: row.viewer_url || run?.viewerUrl || null, updatedAt: run?.updatedAt || row.updated_at || null,
      tunnelUrl: row.tunnel_url || run?.tunnelUrl || null, password: row.phone_password || run?.password || null,
    });
  }
  if (user.role === "admin") {
    for (const phone of reconciliation.unmatched) {
      phones.push({ ...phone, owner: null, ownerStatus: "unavailable" });
    }
  }
  return json({ phones, totalPhones: phones.filter(phone => phone.status !== "busy").length, notice: liveOk ? null : BUSY });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await vpnBlocked(clientIp(request))) return json({ error: VPN_MSG, vpn: true }, 403);
  if (!dbConfigured(env)) return json({ error: "Service setup is in progress. Please try again shortly." }, 503);
  if (!tokenConfigured(env)) return json({ error: BUSY }, 503);

  const now = Date.now();
  if (now - (lastCreate.get(user.id) || 0) < 8000) return json({ error: "Your cloud phone is already starting - give it a few seconds." }, 429);
  lastCreate.set(user.id, now);
  try {
    await ensureSchema(env);
    const phoneId = "phone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    const row = await createPhoneRow(user.id, phoneId, "android11", env, user.role === "admin" ? null : MAX_FREE);
    if (!row) return json({ error: "You already have 5 cloud phones. Delete some cloud phones to get a new one.", code: "LIMIT" }, 409);
    try { await dispatchPhone(phoneId, env); }
    catch (error) {
      if (error?.code === "DISPATCH_UNKNOWN") {
        // The request may have reached GitHub before its response was lost.
        // Keep the row as starting and let polling discover the run; never
        // turn an ambiguous dispatch into a second run or a false busy state.
        return json({ ok: true, phoneId, state: "starting", message: "Cloud phone is starting." });
      }
      await setPhoneStatus(phoneId, "busy", env).catch(() => {});
      return json({ ok: true, phoneId, state: "busy", message: BUSY });
    }
    return json({ ok: true, phoneId, state: "starting", message: "Cloud phone created" });
  } catch { return json({ error: BUSY }, 503); }
}
