import test from "node:test";
import assert from "node:assert/strict";
import { makeSession, parseSession, sessionSecretConfigured } from "../functions/_lib/auth.js";

const user = { id: "user-1", username: "admin", role: "admin", name: "Administrator" };

test("session configuration accepts the explicit secret or the admin password fallback", () => {
  assert.equal(sessionSecretConfigured({ SESSION_SECRET: "session-key" }), true);
  assert.equal(sessionSecretConfigured({ ADMIN_PASSWORD: "admin-key" }), true);
  assert.equal(sessionSecretConfigured({}), false);
});

test("session tokens round-trip with the configured signing secret", async () => {
  const env = { SESSION_SECRET: "test-session-secret" };
  const token = await makeSession(user, env);
  assert.deepEqual(await parseSession(token, env), user);
  assert.equal(await parseSession(token, { SESSION_SECRET: "different-secret" }), null);
});
