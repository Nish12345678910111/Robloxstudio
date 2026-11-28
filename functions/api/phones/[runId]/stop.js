import { getUser } from "../../../_lib/auth.js";
import { getPhoneByRun, getPhoneRowById } from "../../../_lib/db.js";
import { cancelRun, cloudPhoneWorkflowEnv, findRunIdsByPhoneId, getRunStatus, listPhones } from "../../../_lib/github.js";
import { json, sameOrigin } from "../../../_lib/http.js";

const BUSY = "Many users are using free cloud phones, try again later.";

export async function onRequestPost({ request, env, params }) {
  const workflowEnv = cloudPhoneWorkflowEnv(env);
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);
  const user = await getUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const runId = String(params.runId || "");
  try {
    let phone = await getPhoneByRun(Number(runId), env).catch(() => null);
    if (!phone && /^\d+$/.test(runId)) {
      const liveRun = (await listPhones(true, workflowEnv)).find(item => String(item.runId) === runId);
      if (liveRun?.phoneId && liveRun.phoneId !== "…") {
        phone = await getPhoneRowById(liveRun.phoneId, env).catch(() => null);
      }
    }
    if (user.role !== "admin" && (!phone || phone.owner_id !== user.id)) {
      return json({ error: "That cloud phone belongs to another user." }, 403);
    }
    const runIds = new Set([runId]);
    if (phone?.phone_id) for (const id of await findRunIdsByPhoneId(phone.phone_id, workflowEnv)) runIds.add(String(id));
    for (const id of runIds) {
      const status = await getRunStatus(id, workflowEnv);
      if (status && status !== "completed") await cancelRun(id, workflowEnv);
    }
    return json({ ok: true });
  } catch { return json({ error: BUSY }, 503); }
}
