import { NextResponse } from "next/server";
import { getUser, COOKIE } from "../../../lib/auth";
import { findUser, verifyPassword, deleteUserAccount, saveLastIp } from "../../../lib/db";
import { clientIp, vpnBlocked, VPN_MSG } from "../../../lib/netguard";
export async function GET(req) {
  const ip = clientIp(req);
  if (await vpnBlocked(ip)) return NextResponse.json({ error: VPN_MSG, vpn: true }, { status: 403 });
  const u = getUser(req);
  if (u) saveLastIp(u.id, ip).catch(() => {});
  return u ? NextResponse.json({ user: u, ip }) : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
export async function DELETE(req) {
  const u = getUser(req);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { password } = await req.json().catch(() => ({}));
  try {
    const full = await findUser(u.username);
    if (!full || !verifyPassword(String(password || ""), full.password_hash))
      return NextResponse.json({ error: "Wrong password - account not deleted." }, { status: 401 });
    await deleteUserAccount(u.id); // phones cascade-delete with the account
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  } catch { return NextResponse.json({ error: "Many users are using free cloud phones, try again later." }, { status: 503 }); }
}
