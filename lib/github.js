import zlib from "zlib";
const OWNER = process.env.GITHUB_OWNER || "Nish12345678910111";
const REPO = process.env.GITHUB_REPO || "Robloxstudio";
const WORKFLOW = process.env.GITHUB_WORKFLOW || "cloud-phone.yml";
const token = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...opts, cache: "no-store",
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json();
}
export async function dispatchPhone(phoneId) {
  await gh(`/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs: { phone_id: phoneId, edition: "android11", session_minutes: "340", ram_mb: "12288", cpu_cores: "4", disk_gb: "32" } }) });
}
export async function cancelRun(runId) { return gh(`/actions/runs/${runId}/cancel`, { method: "POST" }); }
function unzipEntry(buf, name) { // minimal ZIP reader (store/deflate) for cloud-phone-info.json
  let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  let off = buf.readUInt32LE(eocd + 16); const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10), size = buf.readUInt32LE(off + 20), nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32), lh = buf.readUInt32LE(off + 42);
    const fname = buf.toString("utf8", off + 46, off + 46 + nl);
    if (fname.endsWith(name)) {
      const lnl = buf.readUInt16LE(lh + 26), lel = buf.readUInt16LE(lh + 28), data = buf.subarray(lh + 30 + lnl + lel);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    }
    off += 46 + nl + el + cl;
  } return null;
}
const cache = new Map();
async function phoneInfo(runId) {
  const c = cache.get(runId); if (c && Date.now() - c.t < 30000) return c.v;
  let v = null;
  try {
    const arts = await gh(`/actions/runs/${runId}/artifacts`);
    const a = (arts.artifacts || []).find(x => x.name.startsWith("cloud-phone-info"));
    if (a) {
      const r = await fetch(a.archive_download_url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
      if (r.ok) { const txt = unzipEntry(Buffer.from(await r.arrayBuffer()), "cloud-phone-info.json"); if (txt) v = JSON.parse(txt); }
    }
  } catch {}
  cache.set(runId, { t: Date.now(), v }); return v;
}
export async function listPhones() {
  const data = await gh(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=20`);
  return Promise.all((data.workflow_runs || []).map(async r => {
    const info = ["in_progress", "queued"].includes(r.status) || r.conclusion ? await phoneInfo(r.id) : null;
    return { runId: r.id, name: r.display_title || r.name, status: r.status, conclusion: r.conclusion, createdAt: r.created_at, updatedAt: r.updated_at, runUrl: r.html_url,
      phoneId: info?.phoneId || (r.display_title || "").replace("Cloud Phone ", "") || "…", edition: info?.edition || "android11", viewerUrl: info?.viewerUrl || null,
      tunnelUrl: info?.tunnelUrl || null, novncUrl: info?.novncUrl || null, password: info?.password || null };
  }));
}
export async function deleteRun(runId) {
  // GitHub only deletes COMPLETED runs; callers cancel running ones first.
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json" } });
  return r.status;
}
export async function getRunStatus(runId) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}`, { headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const d = await r.json();
  return d.status; // queued | in_progress | completed
}
