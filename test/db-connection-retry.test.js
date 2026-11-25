import test from "node:test";
import assert from "node:assert/strict";
import { retryConnectionOnce } from "../functions/_lib/db.js";

test("idempotent schema work retries once after an unexpected connection close", async () => {
  let attempts = 0;
  let resets = 0;
  const result = await retryConnectionOnce(async () => {
    attempts++;
    if (attempts === 1) throw new Error("Connection terminated unexpectedly");
    return "ready";
  }, async () => { resets++; });

  assert.equal(result, "ready");
  assert.equal(attempts, 2);
  assert.equal(resets, 1);
});

test("schema setup retries a Cloudflare TCP proxy address failure once", async () => {
  let attempts = 0;
  let resets = 0;
  const result = await retryConnectionOnce(async () => {
    attempts++;
    if (attempts === 1) throw new Error("proxy request failed, cannot connect to the specified address");
    return "ready";
  }, async () => { resets++; });

  assert.equal(result, "ready");
  assert.equal(attempts, 2);
  assert.equal(resets, 1);
});

test("schema retry does not replay non-connection errors", async () => {
  let attempts = 0;
  let resets = 0;
  await assert.rejects(retryConnectionOnce(async () => {
    attempts++;
    throw Object.assign(new Error("permission denied"), { code: "42501" });
  }, async () => { resets++; }), /permission denied/);

  assert.equal(attempts, 1);
  assert.equal(resets, 0);
});
