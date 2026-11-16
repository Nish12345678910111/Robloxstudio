import { NextResponse } from "next/server";
import { getUser } from "../../../lib/auth";
import { keyHealth } from "../../../lib/github";
import { dbHealth } from "../../../lib/db";
// Shows connection health only: which keys EXIST and whether each one answers.
// Key values are never returned, logged or hinted at. dbCode is a short
// Postgres/network error code (never a credential) shown only when down.
let _dbCache = null, _dbT = 0;
export async function GET(req) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ttl = _dbCache && _dbCache.ok ? 20000 : 4000; // failures recheck sooner
  if (!_dbCache || Date.now() - _dbT > ttl) {
    _dbCache = await dbHealth().catch(() => ({ ok: false, code: "error" }));
    _dbT = Date.now();
  }
  const keys = await keyHealth().catch(() => []);
  return NextResponse.json({ db: _dbCache.ok, dbCode: _dbCache.ok ? null : _dbCache.code, keys });
}
