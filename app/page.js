import { cookies } from "next/headers";
import { COOKIE, dashboardConfigured, tokenConfigured } from "../lib/auth";
import Dashboard from "./dashboard";
import Login from "./login";
// verify cookie server-side (same HMAC scheme as lib/auth.isAuthed)
import crypto from "crypto";
async function authed() {
  const v = (await cookies()).get(COOKIE)?.value; if (!v) return false;
  try { const [b, s] = v.split("."); const secret = process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD || "";
    return crypto.timingSafeEqual(Buffer.from(crypto.createHmac("sha256", secret).update(b).digest("base64url")), Buffer.from(s)) && JSON.parse(Buffer.from(b, "base64url").toString()).exp > Date.now() / 1000;
  } catch { return false; }
}
export default async function Home() {
  if (!(await authed())) return <Login configured={dashboardConfigured()} />;
  return <Dashboard tokenReady={tokenConfigured()} />;
}
