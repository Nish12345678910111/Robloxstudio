import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, tokenConfigured, parseSession } from "../lib/auth";
import Dashboard from "./dashboard";
export default async function Home() {
  const user = parseSession((await cookies()).get(COOKIE)?.value);
  if (!user) redirect("/login"); // every page sends logged-out users to /login
  return <Dashboard user={user} tokenReady={tokenConfigured()} />;
}
