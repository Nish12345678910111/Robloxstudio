import { getUser, tokenConfigured } from "../_lib/auth.js";
import { deletePhoneRow, deleteUserAccount, ensureSchema, findUser, listOwnerPhoneRows, saveLastIp, setPhoneStatus } from "../_lib/db.js";
import { cancelRun, deleteRun, findRunsByPhoneIds, getRunStatus } from "../_lib/github.js";
import { verifyPassword } from "../_lib/passwords.js";
import { clearSessionCookie, clientIp, json, sameOrigin } from "../_lib/http.js";
import { VPN_MSG, vpnBlocked } from "../_lib/netguard.js";

const BUSY = "Many users are using free cloud phones, try again later.";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestGet({ request, env }) {
  const ip = clientIp(request);
  if (await vpnBlocked(ip)) return json({ error: VPN_MSG, vpn: true, configured: Boolean(env.AIVEN_DATABASE_URL || env.DATABASE_URL), tokenReady: tokenConfigured(env) }, 403);
  const user = await getUser(request, env);
  if (user) {
    await saveLastIp(user.id, ip, env).catch(() => {});
    return json({ user, configured: Boolean(env.AIVEN_DATABASE_URL || env.DATABASE_URL), tokenReady: tokenConfigured(env) });
  }
  return json({ error: "unauthorized", configured: Boolean(env.AIVEN_DATABASE_URL || env.DATABASE_URL), tokenReady: tokenConfigured(env) }, 401);
}

export async function onRequestDelete({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);
  const ip = clientIp(request);
  if (await vpnBlocked(ip)) return json({ error: VPN_MSG, vpn: true }, 403);
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { password } = await request.json().catch(() => ({}));
  try {
    const full = await findUser(user.username, env);
    if (!full || !await verifyPassword(String(password || ""), full.password_hash)) {
      return json({ error: "Wrong password - account not deleted." }, 401);
    }

    await ensureSchema(env);
    const phones = await listOwnerPhoneRows(user.id, env);
    if (phones.length && !tokenConfigured(env)) return json({ error: BUSY }, 503);
    const runsByPhone = phones.length
      ? await findRunsByPhoneIds(phones.map(phone => phone.phone_id), env)
      : new Map();

    // Stop and remove every matching workflow run before deleting the account.
    // Keep the account and row if any run is still active or cannot be verified.
    for (const phone of phones) {
      const runIds = new Set([...(runsByPhone.get(phone.phone_id) || []), ...(phone.run_id ? [String(phone.run_id)] : [])]);
      if (!runIds.size && phone.status !== "busy" && Date.now() - new Date(phone.created_at).getTime() <= 10 * 60 * 1000) {
        // A just-dispatched run may not have appeared in the first list yet.
        for (let attempt = 0; attempt < 4 && !runIds.size; attempt++) {
          await wait(1000);
          const recent = await findRunsByPhoneIds([phone.phone_id], env, 1);
          for (const runId of recent.get(phone.phone_id) || []) runIds.add(runId);
        }
      }

      if (!runIds.size) {
        const age = Date.now() - new Date(phone.created_at).getTime();
        if (phone.status !== "busy" && age <= 10 * 60 * 1000) {
          return json({ error: "Your cloud phones are still starting. Please try deleting your account again shortly." }, 409);
        }
        // No matching run was found by the successful workflow listing.
        await deletePhoneRow(phone.phone_id, env);
        continue;
      }

      let pending = false;
      for (const runId of runIds) {
        const status = await getRunStatus(runId, env);
        if (status === null) continue;
        if (status !== "completed") {
          await setPhoneStatus(phone.phone_id, "deleting", env).catch(() => {});
          await cancelRun(runId, env).catch(() => {});
          pending = true;
          continue;
        }
        await deleteRun(runId, env).catch(() => null);
        // A successful DELETE response is not enough; verify each run is gone.
        if (await getRunStatus(runId, env).catch(() => "unknown") !== null) pending = true;
      }
      if (pending) return json({ error: "Your cloud phones are still stopping. Please try deleting your account again shortly." }, 409);
      await deletePhoneRow(phone.phone_id, env);
    }

    await deleteUserAccount(user.id, env);
    return clearSessionCookie(json({ ok: true }));
  } catch { return json({ error: BUSY }, 503); }
}
