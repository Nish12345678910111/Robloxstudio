import test from "node:test";
import assert from "node:assert/strict";
import { hasValidDatabaseConnectionKey } from "../functions/_lib/connection-key.js";
import { POST as vercelApiPost } from "../app/api/[[...path]]/route.js";

test("database connection key comparison accepts only an exact non-empty key", () => {
  const key = "fake-test-key-7d9f3c0b";
  assert.equal(hasValidDatabaseConnectionKey(key, key), true);
  assert.equal(hasValidDatabaseConnectionKey("wrong-key", key), false);
  assert.equal(hasValidDatabaseConnectionKey("", key), false);
  assert.equal(hasValidDatabaseConnectionKey(key, ""), false);
  assert.equal(hasValidDatabaseConnectionKey(undefined, key), false);
  assert.equal(hasValidDatabaseConnectionKey(key, undefined), false);
});

test("Vercel rejects marked Pages-proxy requests without the shared key", async () => {
  const previous = process.env.DATABASE_CONNECTION_KEY;
  process.env.DATABASE_CONNECTION_KEY = "expected-test-only-key";
  try {
    for (const provided of [null, "wrong-test-key"]) {
      const headers = { "x-ncp-api-proxy": "cloudflare-pages" };
      if (provided) headers["x-database-connection-key"] = provided;
      const request = new Request("https://nishcloudphone.vercel.app/api/auth", {
        method: "POST",
        headers,
        body: "{}",
      });
      const response = await vercelApiPost(request, { params: Promise.resolve({ path: ["auth"] }) });
      assert.equal(response.status, 401);
      assert.doesNotMatch(await response.text(), /expected-test-only-key|wrong-test-key/);
    }

    const validMarker = new Request("https://nishcloudphone.vercel.app/api/not-a-real-route", {
      method: "POST",
      headers: {
        "x-ncp-api-proxy": "cloudflare-pages",
        "x-database-connection-key": "expected-test-only-key",
      },
      body: "{}",
    });
    const allowed = await vercelApiPost(validMarker, { params: Promise.resolve({ path: ["not-a-real-route"] }) });
    assert.equal(allowed.status, 404);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_CONNECTION_KEY;
    else process.env.DATABASE_CONNECTION_KEY = previous;
  }
});
