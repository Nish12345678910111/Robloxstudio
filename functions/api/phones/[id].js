import { getUser } from "../../_lib/auth.js";
import { dbConfigured, ensureSchema, getPhoneForUser } from "../../_lib/db.js";
import { clientIp, json } from "../../_lib/http.js";
import { VPN_MSG, vpnBlocked } from "../../_lib/netguard.js";

export async function onRequestGet({ request, env, params }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await vpnBlocked(clientIp(request))) return json({ error: VPN_MSG, vpn: true }, 403);
  if (!dbConfigured(env)) return json({ error: "not found" }, 404);
  try {
    await ensureSchema(env);
    const phone = await getPhoneForUser(user, String(params.id || ""), env);
    return phone ? json({ phone }) : json({ error: "not found" }, 404);
  } catch { return json({ error: "not found" }, 404); }
}
