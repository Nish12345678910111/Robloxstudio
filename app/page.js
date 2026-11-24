import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "../cloudflare-pages/src/shared/Dashboard.jsx";
import { COOKIE, parseSession, tokenConfigured } from "../functions/_lib/auth.js";
import { findUserById } from "../functions/_lib/db.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  const env = process.env;
  const session = await parseSession((await cookies()).get(COOKIE)?.value, env);
  const user = session ? await findUserById(session.id, env).catch(() => null) : null;
  if (!user) redirect("/login");
  return <Dashboard user={user} tokenReady={tokenConfigured(env)} />;
}
