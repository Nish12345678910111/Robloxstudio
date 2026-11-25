import { json, sameOrigin } from "./_lib/http.js";

const VERCEL_API_ORIGIN = "https://nishcloudphone.vercel.app";
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);

  // Preserve multiple Set-Cookie headers when the upstream runtime exposes them.
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) {
    headers.delete("set-cookie");
    for (const cookie of cookies) headers.append("set-cookie", cookie);
  }

  const body = [204, 205, 304].includes(response.status) ? null : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isProductionApiRequest(request, env) {
  if (env.CF_PAGES_BRANCH !== "main") return false;
  const { pathname } = new URL(request.url);
  return pathname === "/api" || pathname.startsWith("/api/");
}

async function proxyApiRequest(request) {
  if (!sameOrigin(request)) return json({ error: "Request blocked." }, 403);

  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, VERCEL_API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("transfer-encoding");

  // The Vercel API applies the same-origin check itself. Rewrite Origin to the
  // trusted upstream host after validating the browser's original request.
  if (headers.has("origin")) headers.set("origin", VERCEL_API_ORIGIN);

  const method = request.method.toUpperCase();
  const init = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") init.body = await request.arrayBuffer();
  return fetch(new Request(upstreamUrl, init));
}

export async function onRequest({ request, next, env }) {
  let response;
  if (isProductionApiRequest(request, env || {})) {
    try {
      response = await proxyApiRequest(request);
    } catch (error) {
      // Do not include request bodies, cookies, or database credentials in logs.
      console.error("[ncp api proxy] Vercel API request failed", {
        name: String(error?.name || "Error").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 60),
      });
      response = json({ error: "Service temporarily unavailable. Please try again shortly." }, 503);
    }
  } else {
    response = await next();
  }
  return withSecurityHeaders(response);
}
