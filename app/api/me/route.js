import { NextResponse } from "next/server";
import { getUser } from "../../../lib/auth";
export async function GET(req) {
  const u = getUser(req);
  return u ? NextResponse.json({ user: u }) : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
