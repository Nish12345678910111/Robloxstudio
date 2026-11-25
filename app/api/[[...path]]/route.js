import { onRequestPost as authPost } from "../../../functions/api/auth.js";
import { onRequestPost as logoutPost } from "../../../functions/api/logout.js";
import { onRequestGet as meGet, onRequestDelete as meDelete } from "../../../functions/api/me.js";
import { onRequestGet as keysGet } from "../../../functions/api/keys.js";
import { onRequestGet as directiveGet } from "../../../functions/api/phone-directive.js";
import { onRequestGet as phonesGet, onRequestPost as phonesPost } from "../../../functions/api/phones.js";
import { onRequestGet as phoneGet } from "../../../functions/api/phones/[id].js";
import { onRequestPost as phoneStop } from "../../../functions/api/phones/[runId]/stop.js";
import { onRequestDelete as phoneDelete } from "../../../functions/api/phones/[runId]/delete.js";
import { json } from "../../../functions/_lib/http.js";
import { hasValidDatabaseConnectionKey } from "../../../functions/_lib/connection-key.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const env = process.env;
async function dispatch(request, context, method) {
  const proxyMarker = request.headers.get("x-ncp-api-proxy");
  if (proxyMarker !== null && (
    proxyMarker !== "cloudflare-pages" ||
    !hasValidDatabaseConnectionKey(request.headers.get("x-database-connection-key"), env.DATABASE_CONNECTION_KEY)
  )) {
    return json({ error: "unauthorized" }, 401);
  }

  const route = await context?.params || {};
  const parts = Array.isArray(route.path) ? route.path : [];
  if (parts.length === 1 && parts[0] === "auth" && method === "POST") {
    return authPost({ request, env });
  }
  if (parts.length === 1 && parts[0] === "logout" && method === "POST") {
    return logoutPost({ request, env });
  }
  if (parts.length === 1 && parts[0] === "me") {
    if (method === "GET") return meGet({ request, env });
    if (method === "DELETE") return meDelete({ request, env });
  }
  if (parts.length === 1 && parts[0] === "phone-directive" && method === "GET") {
    return directiveGet({ request, env });
  }
  if (parts.length === 1 && parts[0] === "keys" && method === "GET") {
    return keysGet({ request, env });
  }
  if (parts.length === 1 && parts[0] === "phones") {
    if (method === "GET") return phonesGet({ request, env });
    if (method === "POST") return phonesPost({ request, env });
  }
  if (parts.length === 2 && parts[0] === "phones" && method === "GET") {
    return phoneGet({ request, env, params: { id: parts[1] } });
  }
  if (parts.length === 3 && parts[0] === "phones" && parts[2] === "stop" && method === "POST") {
    return phoneStop({ request, env, params: { runId: parts[1] } });
  }
  if (parts.length === 3 && parts[0] === "phones" && parts[2] === "delete" && method === "DELETE") {
    return phoneDelete({ request, env, params: { runId: parts[1] } });
  }
  return json({ error: "not found" }, 404);
}

export const GET = (request, context) => dispatch(request, context, "GET");
export const POST = (request, context) => dispatch(request, context, "POST");
export const DELETE = (request, context) => dispatch(request, context, "DELETE");
