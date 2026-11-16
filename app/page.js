import { cookies } from "next/headers";
import { COOKIE, tokenConfigured, dbConfiguredSafe } from "../lib/auth";
import Dashboard from "./dashboard";
import Login from "./login";
import crypto from "crypto";
async function currentUser() {
  const v = (await cookies()).get(COOKIE)?.value; if (!v) return null;
  try { const [b, s] = v.split("."); const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
    if (!crypto.timingSafeEqual(Buffer.from(crypto.createHmac("sha256", secret).update(b).digest("base64url")), Buffer.from(s))) return null;
    const d = JSON.parse(Buffer.from(b, "base64url").toString());
    return d.exp > Date.now() / 1000 && d.u ? { id: d.sub, username: d.u, role: d.role || "user", name: d.name || d.u } : null;
  } catch { return null; }
}
export default async function Home() {
  const user = await currentUser();
  if (!user) return <Login configured={dbConfiguredSafe()} />;
  return <Dashboard user={user} tokenReady={tokenConfigured()} />;
}
