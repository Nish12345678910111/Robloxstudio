import { clearSessionCookie, json, sameOrigin } from "../_lib/http.js";
export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);
  return clearSessionCookie(json({ ok: true }));
}
