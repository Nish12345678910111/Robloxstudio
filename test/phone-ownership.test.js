import test from "node:test";
import assert from "node:assert/strict";
import { reconcilePhoneRuns } from "../functions/_lib/phone-ownership.js";

test("matches a live run by phone ID or one unambiguous saved run ID", () => {
  const rows = [
    { phone_id: "phone-alice", run_id: 101, owner_username: "alice" },
    { phone_id: "phone-bob", run_id: null, owner_username: "bob" },
  ];
  const live = [
    { phoneId: "renamed-phone", runId: 101, status: "in_progress" },
    { phoneId: "phone-bob", runId: 102, status: "queued" },
    { phoneId: "legacy-phone", runId: 103, actor: { login: "not-an-account-owner" } },
  ];

  const result = reconcilePhoneRuns(rows, live);
  assert.equal(result.matched[0].run.runId, 101);
  assert.equal(result.matched[1].run.runId, 102);
  assert.deepEqual(result.unmatched.map(phone => phone.phoneId), ["legacy-phone"]);
});

test("does not guess when multiple owner rows share a run ID", () => {
  const rows = [
    { phone_id: "phone-alice", run_id: 101, owner_username: "alice" },
    { phone_id: "phone-bob", run_id: 101, owner_username: "bob" },
  ];
  const live = [{ phoneId: "legacy-phone", runId: 101, actor: { login: "someone" } }];

  const result = reconcilePhoneRuns(rows, live);
  assert.equal(result.matched[0].run, null);
  assert.equal(result.matched[1].run, null);
  assert.deepEqual(result.unmatched.map(phone => phone.phoneId), ["legacy-phone"]);
});

test("skips workflow records without a usable phone identifier", () => {
  const result = reconcilePhoneRuns([], [
    { phoneId: "…", runId: 101 },
    { phoneId: "", runId: 102 },
  ]);
  assert.deepEqual(result.unmatched, []);
});
