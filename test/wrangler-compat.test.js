import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

test("Cloudflare Pages Functions bundling keeps Node.js compatibility enabled", () => {
  assert.equal(config.pages_build_output_dir, "./cloudflare-pages-dist");
  assert.ok(config.compatibility_flags.includes("nodejs_compat"));
});
