// Cloudflare Pages front door for the existing dynamic app.
// Pages serves the public pages.dev URL and forwards requests to the configured
// origin. The dynamic Next.js routes, database access, and secrets remain on
// that origin; do not treat this as a standalone static export of the app.
const DEFAULT_UPSTREAM = "https://nishcloudphone.vercel.app";
const HOP_BY_HOP = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
];

function failure() {
  return new Response("Cloud phone service is temporarily unavailable. Please reload.", {
    status: 502,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequest({ request, env }) {
  try {
    const incoming = new URL(request.url);
    const origin = String(env.CLOUD_PHONE_UPSTREAM || DEFAULT_UPSTREAM).replace(/\/$/, "");
    const base = new URL(origin);
    if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) return failure();

    const destination = new URL(incoming.pathname + incoming.search, base.origin);
    const headers = new Headers(request.headers);
    for (const name of HOP_BY_HOP) headers.delete(name);
    headers.delete("host");
    // Cloudflare supplies this value at the edge; do not trust a browser's
    // x-forwarded-for when the upstream checks the visitor IP.
    const clientIp = request.headers.get("cf-connecting-ip");
    headers.delete("x-forwarded-for");
    headers.delete("x-real-ip");
    if (clientIp) {
      headers.set("x-forwarded-for", clientIp);
      headers.set("x-real-ip", clientIp);
    }
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

    const init = { method: request.method, headers, redirect: "manual", signal: request.signal };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
    const upstream = await fetch(destination, init);
    const responseHeaders = new Headers(upstream.headers);

    // Keep redirects on the Pages hostname instead of exposing the origin URL.
    const location = responseHeaders.get("location");
    if (location) {
      try {
        const target = new URL(location, base.origin);
        if (target.origin === base.origin) {
          responseHeaders.set("location", incoming.origin + target.pathname + target.search + target.hash);
        }
      } catch {}
    }

    // Avoid returning provider-specific response headers to browsers.
    for (const name of [...responseHeaders.keys()]) {
      if (name.toLowerCase().startsWith("x-vercel-") || name.toLowerCase() === "x-powered-by") responseHeaders.delete(name);
    }
    for (const name of HOP_BY_HOP) responseHeaders.delete(name);
    if (request.method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
      return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    }
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return failure();
  }
}
