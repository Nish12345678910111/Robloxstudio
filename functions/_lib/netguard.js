const cache = new Map();

export const VPN_MSG = "VPN detected. Please turn off your VPN or proxy and try again - cloud phones cannot be used through a VPN.";
function privateIp(ip) {
  if (!ip || ip === "local") return true;
  const value = ip.toLowerCase().split("%", 1)[0];
  if (!value.includes(":")) {
    const octets = value.split(".").map(Number);
    if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
  }
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("::ffff:")) {
    let embedded = value.slice(7);
    if (!embedded.includes(".")) {
      const parts = embedded.split(":");
      if (parts.length === 2 && parts.every(part => /^[0-9a-f]{1,4}$/.test(part))) {
        const a = parseInt(parts[0], 16), b = parseInt(parts[1], 16);
        embedded = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
      }
    }
    return privateIp(embedded);
  }
  const first = parseInt(value.split(":")[0] || "0", 16);
  return Number.isNaN(first) || (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

export async function vpnBlocked(ip) {
  if (privateIp(ip)) return false;
  const old = cache.get(ip);
  if (old && Date.now() - old.at < 10 * 60 * 1000) return old.blocked;
  let blocked = false;
  try {
    const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`, {
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    const data = await response.json();
    blocked = data?.status === "success" && data.proxy === true;
  } catch { blocked = false; } // a failed lookup never blocks a real user
  cache.set(ip, { at: Date.now(), blocked });
  return blocked;
}
