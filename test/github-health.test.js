import test from "node:test";
import assert from "node:assert/strict";
import { keyHealth } from "../functions/_lib/github.js";

test("reports GitHub token health codes without returning token values", async () => {
  const originalFetch = globalThis.fetch;
  const seenAuthorization = [];
  globalThis.fetch = async (_url, options) => {
    const authorization = options.headers.Authorization;
    seenAuthorization.push(authorization);
    return new Response("{}", { status: authorization === "Bearer primary-secret" ? 401 : 200 });
  };

  try {
    const health = await keyHealth({
      GITHUB_TOKEN: "primary-secret",
      GITHUB_TOKEN_FALLBACK_1: "fallback-secret",
    });
    assert.deepEqual(health.map(({ name, ok, status }) => ({ name, ok, status })), [
      { name: "Primary server", ok: false, status: 401 },
      { name: "Server fallback 1", ok: true, status: 200 },
    ]);
    assert.deepEqual(seenAuthorization.sort(), ["Bearer fallback-secret", "Bearer primary-secret"]);
    assert.doesNotMatch(JSON.stringify(health), /primary-secret|fallback-secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
