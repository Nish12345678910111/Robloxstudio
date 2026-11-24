// Resolve live GitHub workflow runs to the authoritative owner records saved
// before dispatch. A run_id is only a fallback when it points to one database
// row; ambiguous and legacy runs remain explicitly unassigned.
export function reconcilePhoneRuns(rows, live) {
  const rowsByRunId = new Map();
  for (const row of rows) {
    if (row.run_id == null) continue;
    const key = String(row.run_id);
    const matches = rowsByRunId.get(key) || [];
    matches.push(row);
    rowsByRunId.set(key, matches);
  }

  const liveByPhoneId = new Map();
  const liveByRunId = new Map();
  for (const phone of live) {
    if (phone.phoneId && phone.phoneId !== "…") liveByPhoneId.set(String(phone.phoneId), phone);
    if (phone.runId != null) liveByRunId.set(String(phone.runId), phone);
  }

  const matched = rows.map(row => {
    const byPhoneId = liveByPhoneId.get(String(row.phone_id));
    const byRunId = row.run_id == null || rowsByRunId.get(String(row.run_id))?.length !== 1
      ? null
      : liveByRunId.get(String(row.run_id));
    return { row, run: byPhoneId || byRunId || null };
  });

  const matchedPhoneIds = new Set(matched.filter(item => item.run).map(item => String(item.run.phoneId)));
  const matchedRunIds = new Set(matched.filter(item => item.run && item.run.runId != null).map(item => String(item.run.runId)));
  const unmatched = live.filter(phone => phone.phoneId && phone.phoneId !== "…"
    && !matchedPhoneIds.has(String(phone.phoneId))
    && (phone.runId == null || !matchedRunIds.has(String(phone.runId))));

  return { matched, unmatched };
}
