import { getUser, tokenConfigured } from "../_lib/auth.js";
import { createPhoneRow, dbConfigured, deletePhoneRow, ensureSchema, linkRun, listPhoneRows, setPhoneStatus } from "../_lib/db.js";
import { cancelRun, cloudPhoneWorkflowEnv, deleteRun, dispatchPhone, findRunsByPhoneIds, getRunStatus, listPhones } from "../_lib/github.js";
import { clientIp, json, sameOrigin } from "../_lib/http.js";
import { VPN_MSG, vpnBlocked } from "../_lib/netguard.js";
import { reconcilePhoneRuns } from "../_lib/phone-ownership.js";

const BUSY = "Many users are using free cloud phones, try again later.";
const MAX_FREE = 5;
const PHONE_EDITIONS = new Set(["android11", "android15", "android15-arm64"]);
const lastCreate = new Map();
const storedStatus = status => status === "running" ? "in_progress"
  : ["stopped", "deleted"].includes(status) ? "completed"
    : ["starting", "queued", "in_progress", "completed", "deleting", "busy"].includes(status) ? status : "starting";

// Reconcile stale quota rows against BOTH phone workflows before rejecting a
// new phone. A failed Actions run is no longer an active phone, even if an
// earlier request left its database row marked "starting".
async function reconcileQuotaRows(rows, env) {
  const activeRows = rows.filter(row =>
    !row.deleted_at && ["starting", "queued", "in_progress", "running", "deleting"].includes(row.status)
  );
  if (!activeRows.length) return;
  const phoneIds = activeRows.map(row => String(row.phone_id));
  const workflowEnvs = [
    cloudPhoneWorkflowEnv(env),
    { ...env, GITHUB_WORKFLOW: "cloud-phone.yml" },
  ];
  const runsByWorkflow = [];
  for (const workflowEnv of workflowEnvs) {
    try {
      runsByWorkflow.push(await findRunsByPhoneIds(phoneIds, workflowEnv));
    } catch {
      // Fail closed: never free a slot if GitHub history could not be checked.
      return;
    }
  }

  for (const row of activeRows) {
    const found = new Map();
    for (let i = 0; i < workflowEnvs.length; i++) {
      for (const runId of runsByWorkflow[i].get(String(row.phone_id)) || []) {
        found.set(String(runId), [workflowEnvs[i]]);
      }
    }
    if (row.run_id && !found.has(String(row.run_id))) {
      found.set(String(row.run_id), workflowEnvs);
    }

    if (found.size) {
      let allFinished = true;
      for (const [runId, candidates] of found) {
        let resolved = false;
        let missingFromEveryCandidate = true;
        for (const workflowEnv of candidates) {
          const status = await getRunStatus(runId, workflowEnv).catch(() => "unknown");
          if (status === "unknown") { allFinished = false; resolved = true; break; }
          if (status === null) continue; // Verified 404; try another workflow if needed.
          missingFromEveryCandidate = false;
          if (status !== "completed") allFinished = false;
          resolved = true;
          break;
        }
        if (!resolved && missingFromEveryCandidate) resolved = true;
        if (!resolved) allFinished = false;
        if (!allFinished) break;
      }
      if (allFinished) {
        await setPhoneStatus(row.phone_id, "completed", env).catch(() => {});
        row.status = "completed";
      }
      continue;
    }

    // A full scan of both workflow histories found no dispatch for this row.
    // Allow a short dispatch propagation window before releasing the orphan.
    if (Date.now() - new Date(row.created_at).getTime() >= 10 * 60 * 1000) {
      await setPhoneStatus(row.phone_id, "completed", env).catch(() => {});
      row.status = "completed";
    }
  }
}

export async function onRequestGet({ request, env }) {
  const workflowEnv = cloudPhoneWorkflowEnv(env);
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
    try { live = await listPhones(false, workflowEnv); }
    catch {
      await new Promise(resolve => setTimeout(resolve, 600));
      try { live = await listPhones(true, workflowEnv); } catch { liveOk = false; }
    }
  }
  const activeRowCount = rows.filter(row =>
    ["starting", "queued", "in_progress", "running", "deleting"].includes(row.status)
  ).length;
  if (activeRowCount >= MAX_FREE && liveOk && tokenConfigured(env)) {
    await reconcileQuotaRows(rows, env);
  }
  let reconciliation = reconcilePhoneRuns(rows, live);
  const matchesByPhoneId = () => new Map(reconciliation.matched.map(({ row, run }) => [String(row.phone_id), run]));
  if (liveOk) {
    const oldRows = rows.filter(row => Date.now() - new Date(row.created_at).getTime() >= 24 * 3600 * 1000).slice(0, 5);
    let runsByPhone = new Map(), scanOk = !oldRows.length;
    if (tokenConfigured(env) && oldRows.length) {
      try { runsByPhone = await findRunsByPhoneIds(oldRows.map(row => row.phone_id), workflowEnv); scanOk = true; }
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
        const status = await getRunStatus(runId, workflowEnv).catch(() => "unknown");
        if (status === null) continue;
        if (status !== "completed") { allGone = false; break; }
        await deleteRun(runId, workflowEnv).catch(() => null);
        // A 204 only acknowledges deletion; retain the row until GitHub
        // confirms every run for this phone is actually gone.
        if (await getRunStatus(runId, workflowEnv).catch(() => "unknown") !== null) { allGone = false; break; }
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
  const workflowEnv = cloudPhoneWorkflowEnv(env);
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await vpnBlocked(clientIp(request))) return json({ error: VPN_MSG, vpn: true }, 403);
  if (!dbConfigured(env)) return json({ error: "Service setup is in progress. Please try again shortly." }, 503);
  if (!tokenConfigured(env)) return json({ error: BUSY }, 503);

  const requestBody = await request.json().catch(() => ({}));
  // Every newly created cloud phone is ARM64, including requests from older clients.
  const edition = String(requestBody.edition || "android15-arm64");
  if (!PHONE_EDITIONS.has(edition)) return json({ error: "Unsupported Android edition." }, 400);

  const now = Date.now();
  if (now - (lastCreate.get(user.id) || 0) < 8000) return json({ error: "Your cloud phone is already starting - give it a few seconds." }, 429);
  lastCreate.set(user.id, now);
  try {
    await ensureSchema(env);
    const phoneId = "phone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    let row = await createPhoneRow(user.id, phoneId, edition, env, user.role === "admin" ? null : MAX_FREE);
    if (!row && user.role !== "admin") {
      // The transactional DB cap is authoritative. If it rejects the create,
      // reconcile completed/failed/orphaned runs and retry once before showing
      // the limit warning. Live or unverifiable runs continue to count.
      const currentRows = await listPhoneRows(user, env);
      await reconcileQuotaRows(currentRows, env);
      row = await createPhoneRow(user.id, phoneId, edition, env, MAX_FREE);
    }
    if (!row) return json({ error: "You already have 5 active cloud phones. Stop or delete an active phone before creating another.", code: "LIMIT" }, 409);
    try { await dispatchPhone(phoneId, workflowEnv, edition); }
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
