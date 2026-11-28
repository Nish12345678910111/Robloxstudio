import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../cloudflare-pages/src/shared/PublicHome.jsx");
const cloudflareRoutes = read("../cloudflare-pages/src/main.jsx");
const cloudflareRedirects = read("../cloudflare-pages/public/_redirects");
const rootPage = read("../app/page.js");
const rootLayout = read("../app/layout.js");
const login = read("../cloudflare-pages/src/shared/Login.jsx");
const dashboard = read("../cloudflare-pages/src/shared/Dashboard.jsx");
const phoneRoute = read("../cloudflare-pages/src/shared/PhoneRoute.jsx");
const cloudflareShell = read("../cloudflare-pages/index.html");
const cloudflareMiddleware = read("../functions/_middleware.js");
const cloudphoneLayout = read("../app/cloudphone/layout.js");
const vercelRobots = read("../app/robots.js");
const legalPage = read("../cloudflare-pages/src/shared/LegalRoute.jsx");
const vercelTerms = read("../app/terms/page.js");
const vercelPrivacy = read("../app/privacy/page.js");
const pageSources = [home, cloudflareRoutes, login, dashboard, phoneRoute, legalPage, vercelTerms, vercelPrivacy].join("\n");

test("public home leads with Cloud Phone and makes featured projects easy to discover", () => {
  assert.match(home, /id="np-hero-title"/);
  assert.match(home, /Android,<br \/>without the<br \/><em>extra device\.<\/em>/);
  assert.match(home, /Create a free account/);
  assert.match(home, /id="features"/);
  assert.match(home, /id="how-it-works"/);
  assert.match(home, /const FEATURED_PROJECTS = \[/);
  assert.match(home, /name: "Nish Cloud Phone"/);
  assert.match(home, /name: "Modern Chat"/);
  assert.equal((home.match(/featured: true/g) || []).length, 2);
  assert.match(home, /id="projects"/);
  assert.match(home, /THE PROJECT SHELF/);
  assert.match(home, /href="#projects"/);
  assert.match(home, /href="#featured-project-cards"/);
  assert.match(home, /Explore Cloud Phone/);
  assert.match(home, /Open Modern Chat/);
  assert.match(home, /nish12345678910111\.github\.io\/Nish12345678910111\.io/);
  assert.match(home, /noopener noreferrer/);
  assert.match(home, /map\(project => <ProjectCard key=\{project\.name\} project=\{project\} \/>\)/);
  assert.match(cloudflareShell, /Nish Cloud Phone — Android in your browser/);
  assert.match(read("../app/home/page.js"), /Nish Cloud Phone — Android in your browser/);
  assert.doesNotMatch(home, /Lua Script Library|https?:\/\/github\.com\/|source:/i);
  assert.match(home, /href="\/cloudphone\/signup"/);
});

test("site menu opens and closes accessibly with policy links", () => {
  assert.match(home, /aria-expanded=\{menuOpen\}/);
  assert.match(home, /aria-controls="np-site-menu"/);
  assert.match(home, /aria-modal="true"/);
  assert.match(home, /event\.key === "Escape"/);
  assert.match(home, /event\.shiftKey && index <= 0/);
  assert.match(home, /href="\/terms"/);
  assert.match(home, /href="\/privacy"/);
});

test("Terms of Service and Privacy Policy route on Cloudflare and Vercel", () => {
  assert.match(cloudflareRoutes, /path === "\/terms"\) return <LegalRoute \/>/);
  assert.match(cloudflareRoutes, /path === "\/privacy"\) return <LegalRoute privacy \/>/);
  assert.match(legalPage, /privacy \? "Privacy Policy" : "Terms of Service"/);
  assert.match(vercelTerms, /<LegalRoute \/>/);
  assert.match(vercelPrivacy, /<LegalRoute privacy \/>/);
  assert.doesNotMatch(pageSources, /https?:\/\/github\.com\/|href=["'][^"']*(?:\/repos\/|repository)/i);
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
  assert.match(rootLayout, /robots: \{ index: true, follow: true \}/);
  assert.match(cloudphoneLayout, /index: false, follow: false/);
  assert.match(vercelRobots, /disallow: \["\/api", "\/cloudphone"/);
});
