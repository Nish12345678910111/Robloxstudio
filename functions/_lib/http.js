export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return part.slice(i + 1).trim(); }
  }
  return null;
}

export function appendSessionCookie(response, value, maxAge = 7 * 24 * 3600) {
  response.headers.append("set-cookie", `ncp_session=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
  return response;
}

export function clearSessionCookie(response) {
  response.headers.append("set-cookie", "ncp_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return response;
}

export function clientIp(request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  return ip.split(",")[0].trim() || "local";
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients such as the phone runner
  try {
    const parsed = new URL(origin);
    const host = request.headers.get("host") || new URL(request.url).host;
    return parsed.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}
