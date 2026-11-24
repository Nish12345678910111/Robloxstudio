import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/[[...path]]/route.js";

test("Vercel catch-all adapter forwards API paths to the shared Pages handler", async () => {
  const request = new Request("https://nishcloudphone.test/api/me", { method: "GET" });
  const response = await GET(request, { params: Promise.resolve({ path: ["me"] }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});
