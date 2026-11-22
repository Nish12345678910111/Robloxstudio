import { Pool } from "pg";
import { hashPassword } from "./passwords.js";

const root = globalThis;
const pools = root.__ncpPagesPools || (root.__ncpPagesPools = new Map());
const dbUrl = env => String(env.AIVEN_DATABASE_URL || env.DATABASE_URL || "");
export const dbConfigured = env => Boolean(dbUrl(env));

function pool(env) {
  const cs = dbUrl(env);
  if (!cs) throw new Error("Database is not configured");
  if (pools.has(cs)) return pools.get(cs);
  let connectionString = cs, ssl;
  try {
    const url = new URL(cs);
    const mode = url.searchParams.get("sslmode");
    if (mode) {
      url.searchParams.delete("sslmode");
      connectionString = url.toString();
      if (mode !== "disable") ssl = { rejectUnauthorized: !["require", "prefer", "allow"].includes(mode) };
    }
  } catch {}
  const p = new Pool({
    connectionString, ...(ssl ? { ssl } : {}),
    max: 1, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000,
    query_timeout: 12000, options: "-c idle_session_timeout=60s",
    application_name: "nishcloudphone-pages", allowExitOnIdle: true,
  });
  p.on("error", () => {});
  pools.set(cs, p);
  return p;
}

const CONNECTION_ERRORS = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "ENOTFOUND", "57P01", "57P02", "57P03", "08000", "08003", "08006", "08001", "53300"]);
function isConnectionError(error) {
  if (!error) return false;
  if (CONNECTION_ERRORS.has(error.code)) return true;
  const message = String(error.message || "").toLowerCase();
  return ["connection terminated", "connection timeout", "server closed the connection", "too many clients", "socket hang up", "econnreset"].some(part => message.includes(part));
}
async function resetPool(env) {
  const cs = dbUrl(env), old = pools.get(cs);
  pools.delete(cs);
  if (old) { old.__ncpSchemaReady = null; try { await old.end(); } catch {} }
}

// A connection can fail after PostgreSQL has committed a mutation but before
// the client receives its response. Retry only read-only statements; replaying
// INSERT/UPDATE/DELETE could duplicate or undo a successful operation.
const READ_ONLY_SQL = /^\s*(?:SELECT|SHOW|VALUES)\b/i;
async function query(env, sql, params = []) {
  const attempts = READ_ONLY_SQL.test(sql) ? 3 : 1;
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await pool(env).query(sql, params); }
    catch (error) {
      last = error;
      if (!isConnectionError(error)) throw error;
      await resetPool(env);
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw last;
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
  `CREATE INDEX IF NOT EXISTS phones_cloudphone_run_idx ON phones_cloudphone(run_id)`,
  `ALTER TABLE phones_cloudphone ADD COLUMN IF NOT EXISTS viewer_url TEXT`,
  `ALTER TABLE phones_cloudphone ADD COLUMN IF NOT EXISTS tunnel_url TEXT`,
  `ALTER TABLE phones_cloudphone ADD COLUMN IF NOT EXISTS phone_password TEXT`,
  `ALTER TABLE users_cloudphone ADD COLUMN IF NOT EXISTS signup_ip TEXT`,
  `ALTER TABLE users_cloudphone ADD COLUMN IF NOT EXISTS last_ip TEXT`,
];

export async function dbHealth(env) {
  if (!dbConfigured(env)) return { ok: false, code: "no-env" };
  try { await query(env, "SELECT 1"); return { ok: true, code: null }; }
  catch (e) { return { ok: false, code: String(e.code || "db-error").slice(0, 40) }; }
}

export async function ensureSchema(env) {
  const p = pool(env);
  if (p.__ncpSchemaReady) return p.__ncpSchemaReady;
  p.__ncpSchemaReady = (async () => {
    const client = await p.connect();
    let releaseError;
    try {
      await client.query("SET lock_timeout = '4s'");
      for (const sql of DDL) await client.query(sql);
    } catch (error) {
      if (isConnectionError(error)) releaseError = error;
      throw error;
    } finally { client.release(releaseError); }
    await ensureAdmin(env);
    await query(env, "SELECT 1 FROM phones_cloudphone LIMIT 1");
  })().catch(error => { p.__ncpSchemaReady = null; throw error; });
  return p.__ncpSchemaReady;
}

export async function ensureAdmin(env) {
  const password = String(env.ADMIN_PASSWORD || "");
  if (!password) return;
  const existing = await findUser("admin", env);
  if (existing) return;
  const passwordHash = await hashPassword(password);
  await query(env,
    `INSERT INTO users_cloudphone (name, username, password_hash, role) VALUES ('Administrator','admin',$1,'admin') ON CONFLICT (username) DO NOTHING`,
    [passwordHash]);
}

// Serialize registrations by IP inside Postgres so two concurrent requests
// cannot both pass the one-signup-per-IP/30-day rule.
export async function createUser(name, username, password, ip, env) {
  if (ip) {
    const { rows } = await query(env,
      `SELECT 1 FROM users_cloudphone WHERE signup_ip=$1 AND created_at > now()-interval '30 days' LIMIT 1`, [ip]);
    if (rows.length) return { blockedByIp: true };
  }
  const passwordHash = await hashPassword(password);
  const client = await pool(env).connect();
  let inTransaction = false, releaseError;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    if (ip) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`ncp-signup:${ip}`]);
      const { rows } = await client.query(
        `SELECT 1 FROM users_cloudphone WHERE signup_ip=$1 AND created_at > now()-interval '30 days' LIMIT 1`, [ip]);
      if (rows.length) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return { blockedByIp: true };
      }
    }
    let result;
    try {
      result = await client.query(
        `INSERT INTO users_cloudphone (name, username, password_hash, signup_ip, last_ip) VALUES ($1,$2,$3,$4,$4) RETURNING id,name,username,role`,
        [name, username, passwordHash, ip || null]);
    } catch (error) {
      if (error.code === "23505") {
        await client.query("ROLLBACK");
        inTransaction = false;
        return { usernameTaken: true };
      }
      throw error;
    }
    await client.query("COMMIT");
    inTransaction = false;
    return result.rows[0];
  } catch (error) {
    if (isConnectionError(error)) releaseError = error;
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(releaseError); }
}

export async function findUser(username, env) {
  const { rows } = await query(env, `SELECT * FROM users_cloudphone WHERE lower(username)=lower($1) LIMIT 1`, [username]);
  return rows[0] || null;
}
export async function findUserById(id, env) {
  const { rows } = await query(env, `SELECT id,name,username,role FROM users_cloudphone WHERE id=$1 LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function touchLogin(id, env) { return query(env, `UPDATE users_cloudphone SET last_login_at=now() WHERE id=$1`, [id]); }
export async function saveLastIp(id, ip, env) { return query(env, `UPDATE users_cloudphone SET last_ip=$2 WHERE id=$1`, [id, ip]); }
export async function deleteUserAccount(id, env) { return query(env, `DELETE FROM users_cloudphone WHERE id=$1`, [id]); }

// The user row lock makes the 5-phone cap atomic across concurrent requests.
export async function createPhoneRow(ownerId, phoneId, edition, env, maxActive = null) {
  const client = await pool(env).connect();
  let inTransaction = false, releaseError;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query(`SELECT id FROM users_cloudphone WHERE id=$1 FOR UPDATE`, [ownerId]);
    if (maxActive !== null) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS c FROM phones_cloudphone WHERE owner_id=$1 AND deleted_at IS NULL AND status <> 'busy'`, [ownerId]);
      if (rows[0].c >= maxActive) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return null;
      }
    }
    const { rows } = await client.query(
      `INSERT INTO phones_cloudphone (owner_id,phone_id,edition) VALUES ($1,$2,$3) RETURNING *`, [ownerId, phoneId, edition]);
    await client.query("COMMIT");
    inTransaction = false;
    return rows[0];
  } catch (error) {
    if (isConnectionError(error)) releaseError = error;
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(releaseError); }
}

export async function listPhoneRows(user, env) {
  const { rows } = user.role === "admin"
    ? await query(env, `SELECT p.*,u.username AS owner_username FROM phones_cloudphone p JOIN users_cloudphone u ON u.id=p.owner_id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`)
    : await query(env, `SELECT p.*,u.username AS owner_username FROM phones_cloudphone p JOIN users_cloudphone u ON u.id=p.owner_id WHERE p.deleted_at IS NULL AND p.owner_id=$1 ORDER BY p.created_at DESC`, [user.id]);
  return rows;
}
export async function listOwnerPhoneRows(ownerId, env) {
  const { rows } = await query(env,
    `SELECT p.*,u.username AS owner_username FROM phones_cloudphone p JOIN users_cloudphone u ON u.id=p.owner_id WHERE p.owner_id=$1 ORDER BY p.created_at DESC`, [ownerId]);
  return rows;
}
export async function linkRun(phoneId, runId, status, env) {
  return query(env, `UPDATE phones_cloudphone SET run_id=COALESCE(run_id,$2),status=$3,updated_at=now() WHERE phone_id=$1 AND deleted_at IS NULL`, [phoneId, runId || null, status]);
}
export async function getPhoneRowById(phoneId, env) {
  const { rows } = await query(env, `SELECT * FROM phones_cloudphone WHERE phone_id=$1 AND deleted_at IS NULL LIMIT 1`, [phoneId]);
  return rows[0] || null;
}
export async function getPhoneByRun(runId, env) {
  const { rows } = await query(env, `SELECT * FROM phones_cloudphone WHERE run_id=$1 AND deleted_at IS NULL LIMIT 1`, [runId]);
  return rows[0] || null;
}
export async function deletePhoneRow(phoneId, env) { return query(env, `DELETE FROM phones_cloudphone WHERE phone_id=$1`, [phoneId]); }
export async function markPhoneDeletedByRun(runId, env) { return query(env, `DELETE FROM phones_cloudphone WHERE run_id=$1`, [runId]); }
export async function getPhoneForUser(user, id, env) {
  const { rows } = await query(env,
    `SELECT p.*,u.username AS owner_username FROM phones_cloudphone p JOIN users_cloudphone u ON u.id=p.owner_id
     WHERE p.deleted_at IS NULL AND (p.phone_id=$1 OR p.run_id::text=$1) AND ($2 OR p.owner_id=$3) LIMIT 1`,
    [id, user.role === "admin", user.id]);
  return rows[0] || null;
}
export async function setPhoneStatus(phoneId, status, env) {
  return query(env, `UPDATE phones_cloudphone SET status=$2,updated_at=now() WHERE phone_id=$1`, [phoneId, status]);
}
