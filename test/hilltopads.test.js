import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:js|jsx|ts|tsx|css|mjs)$/.test(entry.name) ? [path] : [];
  });
}

test("HilltopAds Zone 7656109 is limited to Cloudflare login/signup and dashboard", () => {
  const ad = read("cloudflare-pages/src/shared/HilltopAd.jsx");
  const login = read("cloudflare-pages/src/shared/Login.jsx");
  const dashboard = read("cloudflare-pages/src/shared/Dashboard.jsx");
  const cloudflareEntry = read("cloudflare-pages/src/main.jsx");
  const vercelSources = sourceFiles(join(root, "app")).map(path => readFileSync(path, "utf8")).join("\n");

  assert.match(ad, /juvenilechoice\.com\/bzXoVXs\.dAGcld0nYvWpce/);
  assert.match(ad, /script\.settings\s*=\s*\{\}/);
  assert.match(ad, /script\.async\s*=\s*true/);
  assert.match(ad, /script\.referrerPolicy\s*=\s*["']no-referrer-when-downgrade["']/);
  assert.match(cloudflareEntry, /import HilltopAd from ["']\.\/shared\/HilltopAd\.jsx["']/);
  assert.equal((cloudflareEntry.match(/adSlot=\{<HilltopAd \/>\}/g) || []).length, 2);
  assert.match(login, /adSlot\s*=\s*null/);
  assert.match(login, /mode\s*===\s*["']register["']/);
  assert.match(dashboard, /adSlot\s*=\s*null/);
  assert.match(dashboard, /\{adSlot\}/);
  assert.doesNotMatch(vercelSources, /juvenilechoice\.com|HilltopAd\.jsx/);
  assert.doesNotMatch(login + dashboard, /import HilltopAd|juvenilechoice\.com/);
});
