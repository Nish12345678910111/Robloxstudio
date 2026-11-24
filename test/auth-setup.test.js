import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/auth.js";

test("login reports missing session signing configuration instead of a misleading busy message", async () => {
  const request = new Request("https://nishcloudphone.test/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "not-used" }),
  });
  const response = await onRequestPost({ request, env: { AIVEN_DATABASE_URL: "postgres://example.invalid/db" } });
  const result = await response.json();
  assert.equal(response.status, 503);
  assert.match(result.error, /SESSION_SECRET/i);
  assert.doesNotMatch(result.error, /Many users/i);
});
