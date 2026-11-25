import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/_middleware.js";

const realFetch = globalThis.fetch;

test("production Pages API requests proxy to Vercel and preserve sessions", async () => {
  let upstreamRequest;
  globalThis.fetch = async request => {
    upstreamRequest = request;
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "ncp_session=first; HttpOnly; Secure; Path=/");
    headers.append("set-cookie", "ncp_csrf=second; Secure; Path=/");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  };

  try {
    const request = new Request("https://nishproductions.pages.dev/api/auth?source=pages", {
      method: "POST",
      headers: {
        host: "nishproductions.pages.dev",
        origin: "https://nishproductions.pages.dev",
        "content-type": "application/json",
        cookie: "ncp_session=existing",
        "cf-connecting-ip": "203.0.113.5",
      },
      body: JSON.stringify({ mode: "login", username: "sample", password: "not-a-real-password" }),
    });

    const response = await onRequest({
      request,
      env: { CF_PAGES_BRANCH: "main", DATABASE_CONNECTION_KEY: "test-only-key-not-a-secret" },
      next: async () => assert.fail("API should proxy"),
    });

    assert.equal(upstreamRequest.url, "https://nishcloudphone.vercel.app/api/auth?source=pages");
    assert.equal(upstreamRequest.method, "POST");
    assert.equal(upstreamRequest.headers.get("origin"), "https://nishcloudphone.vercel.app");
    assert.equal(upstreamRequest.headers.get("x-ncp-api-proxy"), "cloudflare-pages");
    assert.equal(upstreamRequest.headers.get("x-database-connection-key"), "test-only-key-not-a-secret");
    assert.equal(upstreamRequest.headers.get("host"), null);
    assert.equal(upstreamRequest.headers.get("cookie"), "ncp_session=existing");
    assert.equal(upstreamRequest.headers.get("cf-connecting-ip"), "203.0.113.5");
    assert.deepEqual(await upstreamRequest.json(), {
      mode: "login", username: "sample", password: "not-a-real-password",
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.deepEqual(response.headers.getSetCookie(), [
      "ncp_session=first; HttpOnly; Secure; Path=/",
      "ncp_csrf=second; Secure; Path=/",
    ]);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("production Pages proxy rejects a cross-origin API request before forwarding", async () => {
  let forwarded = false;
  globalThis.fetch = async () => { forwarded = true; throw new Error("must not forward"); };
  try {
    const request = new Request("https://nishproductions.pages.dev/api/auth", {
      method: "POST",
      headers: {
        host: "nishproductions.pages.dev",
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "login" }),
    });
    const response = await onRequest({ request, env: { CF_PAGES_BRANCH: "main" }, next: async () => assert.fail("API should not reach Pages handler") });
    assert.equal(response.status, 403);
    assert.equal(forwarded, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("preview and non-API requests keep their normal Pages handling", async () => {
  let forwarded = false;
  globalThis.fetch = async () => { forwarded = true; throw new Error("must not forward"); };
  try {
    const previewRequest = new Request("https://preview.nishproductions.pages.dev/api/auth", { method: "POST" });
    const previewResponse = await onRequest({
      request: previewRequest,
      env: { CF_PAGES_BRANCH: "arena/preview" },
      next: async () => new Response("preview handler"),
    });
    assert.equal(await previewResponse.text(), "preview handler");

    const assetRequest = new Request("https://nishproductions.pages.dev/login");
    const assetResponse = await onRequest({
      request: assetRequest,
      env: { CF_PAGES_BRANCH: "main" },
      next: async () => new Response("cloudflare page"),
    });
    assert.equal(await assetResponse.text(), "cloudflare page");
    assert.equal(assetResponse.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(forwarded, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("production Pages proxy fails closed when its shared key is missing", async () => {
  let forwarded = false;
  globalThis.fetch = async () => { forwarded = true; throw new Error("must not forward"); };
  try {
    const request = new Request("https://nishproductions.pages.dev/api/auth", {
      method: "POST",
      headers: {
        host: "nishproductions.pages.dev",
        origin: "https://nishproductions.pages.dev",
      },
      body: "{}",
    });
    const response = await onRequest({ request, env: { CF_PAGES_BRANCH: "main" }, next: async () => assert.fail("API should proxy") });
    assert.equal(response.status, 503);
    assert.equal(forwarded, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an upstream failure returns a secret-free 503", async () => {
  globalThis.fetch = async () => { throw new Error("upstream failed after request auth cookie=password-secret"); };
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    const request = new Request("https://nishproductions.pages.dev/api/auth", {
      method: "POST",
      headers: {
        host: "nishproductions.pages.dev",
        origin: "https://nishproductions.pages.dev",
      },
      body: "{}",
    });
    const response = await onRequest({
      request,
      env: { CF_PAGES_BRANCH: "main", DATABASE_CONNECTION_KEY: "test-only-key-not-a-secret" },
      next: async () => assert.fail("API should proxy"),
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(logs), /password-secret|test-only-key-not-a-secret/);
    assert.doesNotMatch(await response.text(), /test-only-key-not-a-secret/);
    assert.match(JSON.stringify(logs), /Error/);
  } finally {
    console.error = originalError;
    globalThis.fetch = realFetch;
  }
});
