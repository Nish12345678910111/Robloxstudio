import { NextResponse } from "next/server";
import { getUser } from "../../../lib/auth";
import { keyHealth } from "../../../lib/github";
import { dbConfigured, ensureSchema } from "../../../lib/db";
// Shows connection health only: which keys EXIST and whether each one answers.
// Key values are never returned, logged or hinted at.
export async function GET(req) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let db = false;
  if (dbConfigured()) { try { await ensureSchema(); db = true; } catch {} }
  const keys = await keyHealth().catch(() => []);
  return NextResponse.json({ db, keys });
}
