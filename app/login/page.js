import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, dbConfiguredSafe, parseSession } from "../../lib/auth";
import Login from "../login";
export default async function LoginPage() {
  if (parseSession((await cookies()).get(COOKIE)?.value)) redirect("/");
  return <Login configured={dbConfiguredSafe()} />;
}
