import test from "node:test";
import assert from "node:assert/strict";
import { safeAuthErrorDetails } from "../functions/api/auth.js";

test("auth diagnostics preserve useful error details while redacting secrets", () => {
  const error = Object.assign(
    new Error("connect postgres://avnadmin:db-secret@db.example:5432/defaultdb?sslmode=require password=another-secret github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
    { code: "ECONNRESET", cause: new Error("TLS failed with token='cause-secret'") },
  );

  const details = safeAuthErrorDetails(error);
  assert.equal(details.name, "Error");
  assert.equal(details.code, "ECONNRESET");
  assert.match(details.message, /connect \[redacted database URL\]/);
  assert.match(details.message, /password=\[redacted\]/);
  assert.match(details.cause, /token=\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(details), /db-secret|another-secret|cause-secret|github_pat_/);
});
