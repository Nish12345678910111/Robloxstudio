import { NextResponse } from "next/server";
import { getUser, tokenConfigured } from "../../../lib/auth";
import { listPhones, dispatchPhone, deleteRun, getRunStatus } from "../../../lib/github";
import { dbConfigured, ensureSchema, createPhoneRow, countActivePhones, listPhoneRows, linkRun, purgePhones, deletePhoneRow } from "../../../lib/db";
import { clientIp, vpnBlocked, VPN_MSG } from "../../../lib/netguard";
export const maxDuration = 60;

// Friendly busy message - raw upstream errors are never shown to users.
const BUSY = "Many users are using free cloud phones, try again later.";
const MAX_FREE = 5;
const lastCreate = new Map(); // per-user cooldown, anti double-click spam

export async function GET(req) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await vpnBlocked(clientIp(req))) return NextResponse.json({ error: VPN_MSG, vpn: true, phones: [], totalPhones: 0 }, { status: 403 });
  if (!dbConfigured()) return NextResponse.json({ phones: [], totalPhones: 0, notice: "Database is not connected yet. Set AIVEN_DATABASE_URL in Vercel env vars, then redeploy." });
  let rows = [];
  try { await ensureSchema(); purgePhones().catch(() => {}); rows = await listPhoneRows(user); }
  catch { await new Promise(r => setTimeout(r, 400)); try { rows = await listPhoneRows(user); } catch { return NextResponse.json({ phones: [], totalPhones: 0, notice: BUSY }); } }

  // Merge saved phones (visible instantly, even before the run exists) with
  // live run data. Ordinary users only ever see their own saved phones;
  // the admin sees all. Nothing here exposes the repo to ordinary users.
  let live = [], liveOk = true;
  if (tokenConfigured()) {
    const withInfo = user.role === "admin" || rows.some(r => !r.viewer_url);
    try { live = await listPhones(false, withInfo); }
    catch { await new Promise(r => setTimeout(r, 600)); try { live = await listPhones(true, withInfo); } catch { liveOk = false; } }
  }
  const byId = new Map(live.map(p => [p.phoneId, p]));
  // AUTO-CLEAN (1-day rule): stopping a phone never deletes it. Only a
  // phone that is finished AND at least 1 day old is removed everywhere -
  // run deleted upstream and row deleted from the same phones table.
  if (liveOk) {
    let cleaned = 0;
    for (const r of [...rows]) {
      const gh = byId.get(r.phone_id);
      const ageMs = Date.now() - new Date(r.created_at).getTime();
      if (gh && gh.status === "completed" && ageMs > 24 * 3600 * 1000 && cleaned < 5) {
        cleaned++;
        try { await deleteRun(gh.runId); } catch {}
        await deletePhoneRow(r.phone_id).catch(() => {});
        rows.splice(rows.indexOf(r), 1);
      }
    }
  }
  const phones = [];
  for (const r of rows) {
    const gh = byId.get(r.phone_id);
    if (gh && r.run_id !== gh.runId) linkRun(r.phone_id, gh.runId, "running").catch(() => {});
    phones.push({
      phoneId: r.phone_id, runId: gh?.runId || r.run_id || null,
      edition: r.edition, owner: r.owner_username,
      status: gh?.status || (r.status === "busy" ? "busy" : "starting"),
      conclusion: gh?.conclusion || null, createdAt: gh?.createdAt || r.created_at,
      viewerUrl: r.viewer_url || gh?.viewerUrl || null,
      tunnelUrl: r.tunnel_url || gh?.tunnelUrl || null, password: r.phone_password || gh?.password || null
    });
  }
  // Admin also sees any live phones that somehow have no DB row yet.
  if (user.role === "admin") {
    const known = new Set(rows.map(r => r.phone_id));
    for (const p of live) if (!known.has(p.phoneId) && p.phoneId !== "…") phones.push({ ...p, owner: "unknown" });
  }
  return NextResponse.json({ phones, totalPhones: phones.filter(p => p.status !== "busy").length,
    notice: liveOk ? null : BUSY });
}

export async function POST(req) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await vpnBlocked(clientIp(req))) return NextResponse.json({ error: VPN_MSG, vpn: true }, { status: 403 });
  if (!dbConfigured()) return NextResponse.json({ error: "Database is not connected yet. Set AIVEN_DATABASE_URL in Vercel env vars, then redeploy." }, { status: 503 });
  if (!tokenConfigured()) return NextResponse.json({ error: BUSY }, { status: 503 });
  // cooldown: one tap cannot spawn duplicates
  const now = Date.now();
  if (now - (lastCreate.get(user.id) || 0) < 8000)
    return NextResponse.json({ error: "Your cloud phone is already starting - give it a few seconds." }, { status: 429 });
  lastCreate.set(user.id, now);
  try {
    await ensureSchema();
    await purgePhones().catch(() => {}); // deleting-queued / stale rows free up slots first
    if (user.role !== "admin" && (await countActivePhones(user.id)) >= MAX_FREE)
      return NextResponse.json({ error: "You already have 5 cloud phones. Delete some cloud phones to get a new one.", code: "LIMIT" }, { status: 409 });
    const phoneId = "phone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    // 1) Save FIRST - the phone card shows instantly as "starting".
    await createPhoneRow(user.id, phoneId, "android11");
    // 2) Then start it upstream.
    try { await dispatchPhone(phoneId); }
    catch {
      const { setPhoneStatus } = await import("../../../lib/db");
      await setPhoneStatus(phoneId, "busy").catch(() => {});
      return NextResponse.json({ ok: true, phoneId, state: "busy", message: BUSY });
    }
    return NextResponse.json({ ok: true, phoneId, state: "starting", message: "Cloud phone created" });
  } catch { return NextResponse.json({ error: BUSY }, { status: 503 }); }
}
