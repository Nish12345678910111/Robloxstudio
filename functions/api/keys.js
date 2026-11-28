import { getUser } from "../_lib/auth.js";
import { dbHealth } from "../_lib/db.js";
import { cloudPhoneWorkflowEnv, keyHealth } from "../_lib/github.js";
import { json } from "../_lib/http.js";

let databaseCache = null;
let databaseCacheAt = 0;

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const ttl = databaseCache?.ok ? 20000 : 4000;
  if (!databaseCache || Date.now() - databaseCacheAt > ttl) {
    databaseCache = await dbHealth(env).catch(() => ({ ok: false, code: "error" }));
    databaseCacheAt = Date.now();
  }
  const keys = await keyHealth(cloudPhoneWorkflowEnv(env)).catch(() => []);
  return json({ db: databaseCache.ok, dbCode: databaseCache.ok ? null : databaseCache.code, keys });
}
