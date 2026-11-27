import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Login from "../../../cloudflare-pages/src/shared/Login.jsx";
import { COOKIE, parseSession } from "../../../functions/_lib/auth.js";
import { dbConfigured, findUserById } from "../../../functions/_lib/db.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CloudPhoneSignupPage() {
  const env = process.env;
  const session = await parseSession((await cookies()).get(COOKIE)?.value, env);
  if (session && await findUserById(session.id, env).catch(() => null)) redirect("/cloudphone");
  return <Login configured={dbConfigured(env)} initialMode="register" />;
}
