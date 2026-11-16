import { NextResponse } from "next/server";
import { getUser } from "../../../lib/auth";
import { keyHealth } from "../../../lib/github";
import { dbHealth } from "../../../lib/db";
// Shows connection health only: which keys EXIST and whether each one answers.
// Key values are never returned, logged or hinted at.
// Cached briefly so one dropped packet cannot flip the widget to red.
let _dbCache = null, _dbT = 0;
export async function GET(req) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!_dbCache || Date.now() - _dbT > 20000) {
    _dbCache = await dbHealth().catch(() => false);
    if (!_dbCache) _dbCache = await dbHealth().catch(() => false); // one retry before showing red
    _dbT = Date.now();
  }
  const keys = await keyHealth().catch(() => []);
  return NextResponse.json({ db: _dbCache, keys });
}
