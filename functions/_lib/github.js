const OWNER = env => env.GITHUB_OWNER || "Nish12345678910111";
const REPO = env => env.GITHUB_REPO || "Robloxstudio";
const WORKFLOW = env => env.GITHUB_WORKFLOW || "cloud-phone.yml";
const BASE = env => `${env.GITHUB_API_BASE || "https://api.github.com"}/repos/${OWNER(env)}/${REPO(env)}`;

export function apiSlots(env) {
  return [
    { name: "Primary server", tok: env.GITHUB_TOKEN || env.GH_TOKEN },
    { name: "Server fallback 1", tok: env.GITHUB_TOKEN_FALLBACK_1 },
    { name: "Server fallback 2", tok: env.GITHUB_TOKEN_FALLBACK_2 },
    { name: "Server fallback 3", tok: env.GITHUB_TOKEN_FALLBACK_3 },
  ].filter(slot => slot.tok);
}
export const apiTokens = env => apiSlots(env).map(slot => slot.tok);
let goodSlot = 0;
const cooledUntil = [0, 0, 0, 0, 0];
function ordered(tokens) {
  const indices = tokens.map((_, i) => i).sort((a, b) =>
    ((a - goodSlot + tokens.length) % tokens.length) - ((b - goodSlot + tokens.length) % tokens.length));
  const ready = indices.filter(i => cooledUntil[i] < Date.now());
  return (ready.length ? ready : indices).map(i => ({ token: tokens[i], index: i }));
}
async function raw(path, options, token, env) {
  return fetch(`${BASE(env)}${path}`, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
}
const retryable = status => status === 401 || status === 403 || status === 404 || status === 429 || status >= 500;
async function gh(path, options, env) {
  const tokens = apiTokens(env);
  if (!tokens.length) throw new Error("upstream busy");
  let last = null;
  for (const { token, index } of ordered(tokens)) {
    try {
      const response = await raw(path, options || {}, token, env);
      const remain = parseInt(response.headers.get("x-ratelimit-remaining") || "999", 10);
      if (!Number.isNaN(remain) && remain < 25) {
        const reset = parseInt(response.headers.get("x-ratelimit-reset") || "0", 10) * 1000;
        cooledUntil[index] = Math.min(Math.max(reset, Date.now() + 60000), Date.now() + 10 * 60000);
      }
      if (response.ok) { goodSlot = index; return response.status === 204 ? null : response.json(); }
      last = response.status;
      if (!retryable(response.status)) break;
      cooledUntil[index] = Date.now() + 5 * 60000;
      await response.text().catch(() => "");
    } catch { last = "net"; cooledUntil[index] = Date.now() + 60000; }
  }
  throw new Error(last ? "upstream busy" : "upstream busy");
}
async function ghOk(path, options, env) {
  const tokens = apiTokens(env);
  let last = null, notFound = false;
  for (const { token, index } of ordered(tokens)) {
    try {
      const response = await raw(path, options || {}, token, env);
      if (response.ok) { goodSlot = index; return response; }
      last = response.status;
      // A private GitHub resource may return 404 for a token without access.
      // Verify this token can list the workflow before trusting that 404.
      if (response.status === 404) {
        const probe = await raw(`/actions/workflows/${WORKFLOW(env)}/runs?event=workflow_dispatch&per_page=1`, {}, token, env).catch(() => null);
        if (probe?.ok) { goodSlot = index; await probe.text().catch(() => ""); return response; }
        await probe?.text().catch(() => "");
        await response.text().catch(() => "");
        notFound = true;
        continue;
      }
      if (!retryable(response.status)) return response;
      cooledUntil[index] = Date.now() + 5 * 60000;
    } catch { last = "net"; cooledUntil[index] = Date.now() + 60000; }
  }
  if (notFound) throw new Error("upstream busy");
  if (last) throw new Error("upstream busy");
  throw new Error("upstream busy");
}

export async function dispatchPhone(phoneId, env, edition = "android11") {
  if (!["android11", "android15", "android15-arm64"].includes(edition)) {
    const error = new Error("Unsupported Android edition.");
    error.code = "UNSUPPORTED_EDITION";
    throw error;
  }
  const selectedEdition = edition;
  const body = JSON.stringify({ ref: "main", inputs: {
    phone_id: phoneId, edition: selectedEdition, session_minutes: "340",
    ram_mb: "12288", cpu_cores: "4", disk_gb: "32",
  } });
  const tokens = apiTokens(env);
  if (!tokens.length) {
    const error = new Error("upstream busy");
    error.code = "DISPATCH_REJECTED";
    throw error;
  }
  for (const { token, index } of ordered(tokens)) {
    let response;
    try {
      response = await raw(`/actions/workflows/${WORKFLOW(env)}/dispatches`, { method: "POST", body }, token, env);
    } catch {
      cooledUntil[index] = Date.now() + 60000;
      const error = new Error("dispatch result unknown");
      error.code = "DISPATCH_UNKNOWN";
      throw error;
    }
    if (response.ok) { goodSlot = index; return; }
    const status = response.status;
    await response.text().catch(() => "");
    if (status >= 500) {
      // GitHub may have accepted a dispatch before returning a gateway error.
      // Never replay this non-idempotent POST using a fallback token.
      const error = new Error("dispatch result unknown");
      error.code = "DISPATCH_UNKNOWN";
      throw error;
    }
    cooledUntil[index] = Date.now() + 5 * 60000;
  }
  const error = new Error("upstream busy");
  error.code = "DISPATCH_REJECTED";
  throw error;
}
export async function cancelRun(runId, env) { return gh(`/actions/runs/${runId}/cancel`, { method: "POST" }, env); }

let listCache = null, listAt = 0;
export async function listPhones(fresh, env) {
  if (!fresh && listCache && Date.now() - listAt < 12000) return listCache;
  let data;
  try { data = await gh(`/actions/workflows/${WORKFLOW(env)}/runs?event=workflow_dispatch&per_page=20`, undefined, env); }
  catch (error) { if (listCache) return listCache; throw error; }
  const byPhoneId = new Map();
  for (const run of data.workflow_runs || []) {
    const title = run.display_title || run.name || "";
    const phoneId = title.startsWith("Cloud Phone ") ? title.slice("Cloud Phone ".length) : "…";
    const item = {
      runId: run.id, name: title, status: run.status, conclusion: run.conclusion,
      createdAt: run.created_at, updatedAt: run.updated_at,
      phoneId, edition: ["android15", "android15-arm64"].includes(run.inputs?.edition) ? run.inputs.edition : "android11",
      viewerUrl: null, tunnelUrl: null, password: null,
    };
    const key = phoneId === "…" ? `unknown:${run.id}` : phoneId;
    const old = byPhoneId.get(key);
    const active = ["in_progress", "queued"].includes(run.status);
    const oldActive = old && ["in_progress", "queued"].includes(old.status);
    if (!old || (active && !oldActive)) byPhoneId.set(key, item);
  }
  const result = [...byPhoneId.values()];
  listCache = result; listAt = Date.now();
  return result;
}
export async function findRunsByPhoneIds(phoneIds, env, maxPages = 10) {
  const wanted = new Set(phoneIds.map(String));
  const found = new Map([...wanted].map(id => [id, []]));
  if (!wanted.size) return found;
  const pageLimit = Math.min(10, Math.max(1, Math.floor(Number(maxPages) || 1)));
  let complete = false;
  for (let page = 1; page <= pageLimit; page++) {
    const data = await gh(`/actions/workflows/${WORKFLOW(env)}/runs?event=workflow_dispatch&per_page=100&page=${page}`, undefined, env);
    const runs = data.workflow_runs || [];
    const total = Number(data.total_count);
    const hasTotal = Number.isFinite(total);
    for (const run of runs) {
      const title = run.display_title || run.name || "";
      if (!title.startsWith("Cloud Phone ")) continue;
      const phoneId = title.slice("Cloud Phone ".length);
      if (wanted.has(phoneId)) found.get(phoneId).push(String(run.id));
    }
    if (runs.length < 100) {
      if (hasTotal && total > page * 100) throw new Error("upstream busy");
      complete = true;
      break;
    }
    if (page === pageLimit) {
      // Never mistake a truncated history scan for proof that a phone has
      // no other matching runs; callers use this result before destructive cleanup.
      if (!hasTotal || total !== page * 100) throw new Error("upstream busy");
      complete = true;
    }
  }
  if (!complete) throw new Error("upstream busy");
  return found;
}
export async function findRunIdsByPhoneId(phoneId, env) {
  return (await findRunsByPhoneIds([phoneId], env)).get(String(phoneId)) || [];
}
export async function deleteRun(runId, env) { return (await ghOk(`/actions/runs/${runId}`, { method: "DELETE" }, env)).status; }
export async function getRunStatus(runId, env) {
  const response = await ghOk(`/actions/runs/${runId}`, {}, env);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("upstream busy");
  return (await response.json()).status;
}

// Report connectivity only. Token values never leave the server or enter the
// response; each configured slot is tested independently and cached briefly.
let healthCache = null, healthCacheAt = 0;
export async function keyHealth(env) {
  if (healthCache && Date.now() - healthCacheAt < 60000) return healthCache;
  const slots = apiSlots(env);
  const checks = await Promise.all(slots.map(async (slot, index) => {
    let ok = false, status = null;
    try {
      const response = await raw(`/actions/workflows/${WORKFLOW(env)}/runs?event=workflow_dispatch&per_page=1`, {}, slot.tok, env);
      ok = response.ok;
      status = response.status;
      await response.text().catch(() => "");
    } catch {}
    return { name: slot.name, configured: true, ok, status, active: index === goodSlot };
  }));
  healthCache = checks;
  healthCacheAt = Date.now();
  return checks;
}
