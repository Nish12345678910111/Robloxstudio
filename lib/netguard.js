const cache = new Map();
export function clientIp(req) {
  const x = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  return x.split(",")[0].trim() || "local";
}
const priv = ip => !ip || ip === "local" || ip.startsWith("10.") || ip.startsWith("192.168.") ||
  ip.startsWith("127.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.includes(":");
export async function vpnBlocked(ip) {
  if (priv(ip)) return false;
  const c = cache.get(ip);
  if (c && Date.now() - c.t < 600000) return c.v;
  let v = false;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`, { signal: ctl.signal, cache: "no-store" });
    clearTimeout(to);
    const d = await r.json();
    v = d && d.status === "success" && d.proxy === true; // proxy/VPN exit node
  } catch { v = false; } // lookup down -> never lock real users out
  cache.set(ip, { t: Date.now(), v });
  return v;
}
export const VPN_MSG = "VPN detected. Please turn off your VPN / proxy and try again - cloud phones cannot be used through a VPN.";
