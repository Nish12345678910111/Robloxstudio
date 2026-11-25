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
  assert.equal(details.codeKind, "driver");
  assert.doesNotMatch(JSON.stringify(details), /db-secret|another-secret|cause-secret|github_pat_/);
});

test("database diagnostics use an actual nested socket code when the wrapper has none", () => {
  const error = Object.assign(new Error("Connection terminated unexpectedly"), {
    cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET", errno: -104, syscall: "read" }),
  });
  const details = safeAuthErrorDetails(error);
  assert.equal(details.code, "ECONNRESET");
  assert.equal(details.codeKind, "cause");
  assert.equal(details.classification, "PG_SOCKET_RESET");
  assert.equal(details.errno, "-104");
  assert.equal(details.syscall, "read");
});

test("database diagnostics classify a generic pg connection close without inventing a SQLSTATE", () => {
  const details = safeAuthErrorDetails(new Error("Connection terminated unexpectedly"));
  assert.equal(details.code, "PG_CONNECTION_TERMINATED");
  assert.equal(details.codeKind, "classification");
  assert.equal(details.driverCode, "not-provided");
  assert.equal(details.classification, "PG_CONNECTION_TERMINATED");
});

test("database diagnostics identify Cloudflare TCP proxy connect failures", () => {
  const details = safeAuthErrorDetails(new Error("proxy request failed, cannot connect to the specified address"));
  assert.equal(details.code, "PG_TCP_PROXY_CONNECT_FAILED");
  assert.equal(details.codeKind, "classification");
  assert.equal(details.driverCode, "not-provided");
});

test("database diagnostics preserve PostgreSQL SQLSTATE codes", () => {
  const details = safeAuthErrorDetails(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }));
  assert.equal(details.code, "57P01");
  assert.equal(details.codeKind, "sqlstate");
  assert.equal(details.sqlState, "57P01");
  assert.equal(details.classification, "PG_SERVER_SHUTDOWN");
});
