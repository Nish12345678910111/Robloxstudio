import { Pool } from "pg";
import crypto from "crypto";

const url = () => process.env.AIVEN_DATABASE_URL || process.env.DATABASE_URL || "";
export const dbConfigured = () => Boolean(url());
let _pool = null, _ready = null;

function pool() {
  if (!_pool) {
    let cs = url();
    let ssl;
    try {
      const u = new URL(cs);
      const mode = u.searchParams.get("sslmode");
      if (mode && mode !== "disable") { ssl = { rejectUnauthorized: false }; u.searchParams.delete("sslmode"); cs = u.toString(); }
    } catch {}
    // max:1 - this runs on serverless where MANY instances can be warm at
    // once, each holding its own pool. The database has a small connection
    // budget; fat pools exhaust it and Postgres starts refusing everyone
    // ("too many clients already") at random-looking times.
    _pool = new Pool({ connectionString: cs, ssl, max: 1, idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000, query_timeout: 12000,
      // idle_session_timeout is enforced BY THE SERVER: if this client is
      // frozen/killed without closing (serverless freeze), Postgres kills
      // the session itself after 60s idle instead of leaking the slot.
      options: "-c idle_session_timeout=60s",
      keepAlive: true, keepAliveInitialDelayMillis: 10000, allowExitOnIdle: true });
    _pool.on("error", () => {});
  }
  return _pool;
}
// Serverless instances get frozen/thawed, which silently kills pooled TCP
// sockets; small databases also refuse connections when their slots fill.
// Both look like a "randomly disconnected database". Detect the whole
// connection class (incl. 53300 too-many-clients, 55P03 lock-not-available),
// rebuild the pool, and retry with growing backoff instead of giving up.
const CONN_CODES = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "ENOTFOUND",
  "57P01", "57P02", "57P03", "08000", "08003", "08006", "08001", "53300", "55P03"];
function isConnErr(e) {
  if (!e) return false;
  if (CONN_CODES.includes(e.code)) return true;
  const m = String(e.message || "").toLowerCase();
  return m.includes("connection terminated") || m.includes("connection timeout") ||
         m.includes("timeout exceeded when trying to connect") || m.includes("server closed the connection") ||
         m.includes("too many clients") || m.includes("remaining connection slots") ||
         m.includes("econnreset") || m.includes("socket hang up");
}
async function resetPool() {
  const p = _pool; _pool = null;
  if (p) { try { await p.end(); } catch {} }
}
const q = async (sql, params) => {
  let last;
  for (let i = 0; i < 4; i++) {
    try { return await pool().query(sql, params); }
    catch (e) {
      last = e;
      if (!isConnErr(e)) throw e;
      await resetPool();
      const full = e.code === "53300";
      await new Promise(r => setTimeout(r, (full ? 1500 : 300) * (i + 1) + Math.floor(Math.random() * 200)));
    }
  }
  throw last;
};
let _reapT = 0;
export async function reapZombies() {
  if (Date.now() - _reapT < 60000) return;
  _reapT = Date.now();
  try {
    await q(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
             WHERE pid <> pg_backend_pid() AND state = 'idle'
               AND now() - COALESCE(state_change, backend_start) > interval '90 seconds'`);
  } catch {} // needs same-user/superuser - best effort only
}
// Lightweight liveness probe for the health widget - SELECT 1 via the
// retrying q(). Returns { ok, code } so an admin can SEE the real reason
// (a Postgres/network error code, never anything secret) if it ever fails.
export async function dbHealth() {
  if (!dbConfigured()) return { ok: false, code: "no-env" };
  try { await q(`SELECT 1`); reapZombies().catch(() => {}); return { ok: true, code: null }; }
  catch (e) { return { ok: false, code: String(e.code || e.message || "error").slice(0, 40) }; }
}

const DDL = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS users_cloudphone (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login_at TIMESTAMPTZ)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_cloudphone_username_lower_idx ON users_cloudphone (lower(username))`,
  `CREATE TABLE IF NOT EXISTS phones_cloudphone (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), phone_id TEXT NOT NULL UNIQUE,
      run_id BIGINT, owner_id UUID NOT NULL REFERENCES users_cloudphone(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'starting', edition TEXT NOT NULL DEFAULT 'android11',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ)`,
  `CREATE INDEX IF NOT EXISTS phones_cloudphone_owner_idx ON phones_cloudphone(owner_id, deleted_at)`,
  // Small text only (a URL + 8-char password) - stored on the SAME phones
  // table the dashboard already created, never a separate credentials table.
  `ALTER TABLE phones_cloudphone ADD COLUMN IF NOT EXISTS viewer_url TEXT`,
  `ALTER TABLE phones_cloudphone ADD COLUMN IF NOT EXISTS tunnel_url TEXT`,
  `ALTER TABLE phones_cloudphone ADD COLUMN IF NOT EXISTS phone_password TEXT`,
  `ALTER TABLE users_cloudphone ADD COLUMN IF NOT EXISTS signup_ip TEXT`,
  `ALTER TABLE users_cloudphone ADD COLUMN IF NOT EXISTS last_ip TEXT`,
];
export function ensureSchema() {
  if (!_ready) _ready = (async () => {
    // A single client with a short lock timeout; each statement is
    // best-effort. Cold starts racing each other used to fail the whole
    // setup (and then every request) on a lock - now the worst case is
    // a statement is skipped and retried on the next call.
    const client = await pool().connect();
    try {
      await client.query(`SET lock_timeout = '4s'`).catch(() => {});
      for (const sql of DDL) { try { await client.query(sql); } catch {} }
    } finally { client.release(); }
    reapZombies().catch(() => {});
    try { await ensureAdmin(); } catch {}
    // Verify the tables really answer; only then cache the success.
    await q(`SELECT 1 FROM phones_cloudphone LIMIT 1`);
  })().catch(e => { _ready = null; throw e; });
  return _ready;
}

// ---- passwords: scrypt, per-user salt, timing-safe verify ------------------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [, salt, hash] = String(stored).split("$");
    const a = crypto.scryptSync(String(pw), salt, 64), b = Buffer.from(hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// ---- users ------------------------------------------------------------------
export async function createUser(name, username, password) {
  const { rows } = await q(
    `INSERT INTO users_cloudphone (name, username, password_hash) VALUES ($1,$2,$3)
     RETURNING id, name, username, role`, [name, username, hashPassword(password)]);
  return rows[0];
}
export async function findUser(username) {
  const { rows } = await q(`SELECT * FROM users_cloudphone WHERE lower(username)=lower($1) LIMIT 1`, [username]);
  return rows[0] || null;
}
export async function ensureAdmin() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return;
  const existing = await findUser("admin");
  if (!existing) await q(
    `INSERT INTO users_cloudphone (name, username, password_hash, role) VALUES ('Administrator','admin',$1,'admin')`,
    [hashPassword(pw)]);
}
export const touchLogin = id => q(`UPDATE users_cloudphone SET last_login_at=now() WHERE id=$1`, [id]);

// ---- phones (ownership) ------------------------------------------------------
export async function createPhoneRow(ownerId, phoneId, edition = "android11") {
  const { rows } = await q(
    `INSERT INTO phones_cloudphone (owner_id, phone_id, edition) VALUES ($1,$2,$3) RETURNING *`,
    [ownerId, phoneId, edition]);
  return rows[0];
}
export async function countActivePhones(ownerId) {
  const { rows } = await q(
    `SELECT count(*)::int c FROM phones_cloudphone WHERE owner_id=$1 AND deleted_at IS NULL AND status <> 'busy'`, [ownerId]);
  return rows[0].c;
}
export async function listPhoneRows(user) {
  const { rows } = user.role === "admin"
    ? await q(`SELECT p.*, u.username AS owner_username FROM phones_cloudphone p JOIN users_cloudphone u ON u.id=p.owner_id
               WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 100`)
    : await q(`SELECT p.*, u.username AS owner_username FROM phones_cloudphone p JOIN users_cloudphone u ON u.id=p.owner_id
               WHERE p.deleted_at IS NULL AND p.owner_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [user.id]);
  return rows;
}
export async function linkRun(phoneId, runId, status) {
  await q(`UPDATE phones_cloudphone SET run_id=COALESCE(run_id,$2), status=$3, updated_at=now() WHERE phone_id=$1 AND deleted_at IS NULL`,
    [phoneId, runId || null, status]);
}
export async function getPhoneRowById(phoneId) {
  const { rows } = await q(`SELECT * FROM phones_cloudphone WHERE phone_id=$1 LIMIT 1`, [phoneId]);
  return rows[0] || null;
}
export async function getPhoneByRun(runId) {
  const { rows } = await q(`SELECT * FROM phones_cloudphone WHERE run_id=$1 AND deleted_at IS NULL LIMIT 1`, [runId]);
  return rows[0] || null;
}
export async function markPhoneDeletedByRun(runId) {
  // Storage saving: a deleted phone is REMOVED from the database, not kept.
  await q(`DELETE FROM phones_cloudphone WHERE run_id=$1`, [runId]);
}
export async function purgePhones() {
  // Storage saving: rows marked for deletion are deleted for real, failed
  // starts older than a day are dropped, anything older than 1 day goes.
  await q(`DELETE FROM phones_cloudphone WHERE deleted_at IS NOT NULL OR status='deleted'
           OR (status='busy' AND created_at < now() - interval '1 day')
           OR created_at < now() - interval '1 day'`);
}
export async function deletePhoneRow(phoneId) {
  await q(`DELETE FROM phones_cloudphone WHERE phone_id=$1`, [phoneId]);
}
export async function getPhoneForUser(user, id) {
  const { rows } = await q(
    `SELECT p.*, u.username AS owner_username FROM phones_cloudphone p JOIN users_cloudphone u ON u.id=p.owner_id
     WHERE p.deleted_at IS NULL AND (p.phone_id=$1 OR p.run_id::text=$1)
       AND ($2 OR p.owner_id=$3) LIMIT 1`, [id, user.role === "admin", user.id]);
  return rows[0] || null;
}
export async function recentSignupFromIp(ip) {
  if (!ip) return null;
  const { rows } = await q(
    `SELECT username, created_at FROM users_cloudphone WHERE signup_ip=$1 AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 1`, [ip]);
  return rows[0] || null;
}
export const saveSignupIp = (id, ip) => q(`UPDATE users_cloudphone SET signup_ip=$2, last_ip=$2 WHERE id=$1`, [id, ip]);
export const saveLastIp = (id, ip) => q(`UPDATE users_cloudphone SET last_ip=$2 WHERE id=$1`, [id, ip]);
export async function deleteUserAccount(id) { await q(`DELETE FROM users_cloudphone WHERE id=$1`, [id]); }
export async function setPhoneStatus(phoneId, status) {
  await q(`UPDATE phones_cloudphone SET status=$2, updated_at=now() WHERE phone_id=$1`, [phoneId, status]);
}
