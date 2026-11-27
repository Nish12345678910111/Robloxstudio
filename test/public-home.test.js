import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../cloudflare-pages/src/shared/PublicHome.jsx");
const cloudflareRoutes = read("../cloudflare-pages/src/main.jsx");
const cloudflareRedirects = read("../cloudflare-pages/public/_redirects");
const rootPage = read("../app/page.js");
const login = read("../cloudflare-pages/src/shared/Login.jsx");
const dashboard = read("../cloudflare-pages/src/shared/Dashboard.jsx");
const phoneRoute = read("../cloudflare-pages/src/shared/PhoneRoute.jsx");
const cloudflareShell = read("../cloudflare-pages/index.html");
const cloudflareMiddleware = read("../functions/_middleware.js");
const cloudphoneLayout = read("../app/cloudphone/layout.js");
const vercelRobots = read("../app/robots.js");

test("public home lists verified developments and supports live search", () => {
  assert.match(home, /name: "Nish Cloud Phone"/);
  assert.match(home, /name: "Modern Chat"/);
  assert.match(home, /name: "Lua Script Library"/);
  assert.match(home, /type="search"/);
  assert.match(home, /DEVELOPMENTS\.filter\(project/);
  assert.match(home, /project\.href/);
  assert.match(home, /\/cloudphone\/signup/);
});

test("site root leads to /home on Cloudflare Pages and Vercel", () => {
  assert.match(cloudflareRedirects, /^\/ \/home 301$/m);
  assert.match(cloudflareRoutes, /path === "\/"\) return <RouteRedirect to="\/home"/);
  assert.match(rootPage, /redirect\("\/home"\)/);
});

test("Cloud Phone dashboard, authentication, and phone IDs use the /cloudphone area", () => {
  assert.match(cloudflareRoutes, /path === "\/cloudphone"\) return <DashboardRoute/);
  assert.match(cloudflareRoutes, /path === "\/cloudphone\/login"\) return <LoginRoute/);
  assert.match(cloudflareRoutes, /path === "\/cloudphone\/signup"\) return <LoginRoute initialMode="register"/);
  assert.match(cloudflareRoutes, /path\.startsWith\("\/cloudphone\/"\)/);
  assert.match(login, /href="\/cloudphone\/signup"/);
  assert.match(login, /href="\/cloudphone\/login"/);
  assert.match(dashboard, /location\.replace\("\/cloudphone\/login"\)/);
  assert.match(dashboard, /location\.href = "\/cloudphone\/login"/);
  assert.match(phoneRoute, /location\.replace\("\/cloudphone\/login"\)/);
  assert.match(phoneRoute, /href="\/cloudphone">← My cloud phones/);
});

test("public home is indexable while Cloud Phone pages stay out of search results", () => {
  assert.match(cloudflareShell, /<meta name="robots" content="index, follow"/);
  assert.match(cloudflareMiddleware, /pathname === "\/home"[\s\S]*headers\.delete\("X-Robots-Tag"\)/);
  assert.match(cloudflareMiddleware, /headers\.set\("X-Robots-Tag", "noindex, nofollow, noarchive"\)/);
  assert.match(cloudphoneLayout, /index: false, follow: false/);
  assert.match(vercelRobots, /disallow: \["\/api", "\/cloudphone"/);
});
