import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../cloudflare-pages/src/shared/PublicHome.jsx");
const homeStyles = read("../cloudflare-pages/src/shared/globals.css");
const homeMetadata = read("../app/home/page.js");
const readmeLead = read("../README.md").split("\n").slice(0, 3).join("\n");
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

test("public home is a deployments directory with direct Cloud Phone access and no platform links", () => {
  assert.match(home, /id="np-hero-title"/);
  assert.match(home, /Your deployments\.<br \/><em>One click away\.<\/em>/);
  assert.match(home, /className="np-header-cta" href="\/cloudphone"/);
  assert.match(home, /href="#deployments">View my deployments/);
  assert.match(home, /href="\/cloudphone">Open Cloud Phone/);
  assert.match(home, /const FEATURED_PROJECTS = \[/);
  assert.equal((home.match(/name: "Nish Cloud Phone"/g) || []).length, 1);
  assert.equal((home.match(/featured: true/g) || []).length, 1);
  assert.match(home, /id="deployments"/);
  assert.match(home, /DEPLOYMENT DIRECTORY/);
  assert.match(home, /<CloudPhonePreview \/>/);
  assert.match(home, /map\(\(project, index\) => <ProjectCard key=\{project\.name\} project=\{project\} index=\{index\} \/>\)/);
  assert.doesNotMatch(home, /GitHub|github|Cloudflare|cloudflare|pages\.dev|Vercel|vercel\.app|https?:\/\//i);
  assert.doesNotMatch(homeStyles, /GitHub|github|Cloudflare|cloudflare|Vercel|vercel/i);
  assert.match(cloudflareShell, /Nish Cloud Phone — Android in your browser \| Nish Productions/);
  assert.match(homeMetadata, /Nish Cloud Phone — Android in your browser \| Nish Productions/);
  assert.match(homeMetadata, /description: "Launch and manage a private cloud Android session from your browser with Nish Cloud Phone\."/);
  assert.doesNotMatch(homeMetadata, /on Cloudflare Pages|GitHub|Vercel|pages\.dev/i);
  assert.doesNotMatch(cloudflareShell, /GitHub|Cloudflare|Vercel|pages\.dev/i);
  assert.doesNotMatch(readmeLead, /GitHub|Cloudflare|Vercel|pages\.dev/i);
  assert.doesNotMatch(legalPage, /GitHub|Cloudflare|Vercel|pages\.dev/i);
});

test("home page uses layered motion without burdening mobile or reduced-motion users", () => {
  assert.match(home, /<CloudPhonePreview \/>/);
  assert.match(home, /className="np-deploy-preview" aria-hidden="true"/);
  assert.match(homeStyles, /\.np-deploy-window \{[^}]*animation: np-panel-float 6\.8s ease-in-out infinite/);
  assert.match(homeStyles, /animation: np-ring-orbit 30s linear infinite, np-ring-glow 4\.2s/);
  assert.match(homeStyles, /animation: np-ring-orbit-reverse 38s linear infinite, np-ring-glow/);
  assert.match(homeStyles, /\.np-home::before,\.np-home::after \{/);
  assert.match(homeStyles, /animation: np-grid-breathe 18s ease-in-out infinite alternate, np-grid-slide 30s linear infinite/);
  assert.match(homeStyles, /\.np-header-cta::before[^}]*animation: np-button-sweep/);
  assert.match(homeStyles, /animation: np-gradient-flow 5\.2s ease-in-out infinite/);
  assert.match(homeStyles, /\.np-deploy-window::after[^}]*animation: np-window-scan/);
  assert.match(homeStyles, /\.np-deploy-row[^}]*animation: np-rise-in \.55s both, np-row-shimmer/);
  assert.match(homeStyles, /\.np-project-card\.is-featured[^}]*animation: np-rise-in \.55s backwards, np-card-glow/);
  assert.match(homeStyles, /\.np-hero-copy > \.np-eyebrow \{ animation: np-rise-in/);
  assert.match(homeStyles, /\.np-proof-strip > div:nth-child\(3\) \{ animation-delay: \.52s; \}/);
  assert.match(homeStyles, /\.np-deploy-float-one[^}]*animation: np-float-soft/);
  assert.match(homeStyles, /\.np-deploy-spark-one[^}]*animation: np-sparkle/);
  assert.match(homeStyles, /\.np-scroll-cue span[^}]*animation: np-scroll-bob/);
  assert.match(homeStyles, /\.np-nav-drawer\.is-open \.np-drawer-nav a \{ animation: np-drawer-item/);
  assert.match(homeStyles, /\.np-project-card:hover::before/);
  assert.match(homeStyles, /\.np-header-nav a:hover::after/);
  assert.match(homeStyles, /@media \(max-width: 620px\)/);
  assert.match(homeStyles, /\.np-project-grid \{ display: grid; grid-template-columns: minmax\(0, 560px\); justify-content: center;/);
  assert.match(homeStyles, /\.np-project-grid \{ grid-template-columns: 1fr; gap: 11px;/);
  assert.match(homeStyles, /\.np-home-grid,\.np-deploy-halo,\.np-deploy-preview::before,\.np-deploy-preview::after,\.np-deploy-window,\.np-deploy-float,\.np-deploy-spark/);
  assert.match(homeStyles, /\.np-home-grid \{ opacity: \.2; animation: np-grid-breathe-mobile 26s/);
  assert.match(homeStyles, /\.np-deploy-window \{ transform: none; animation: np-panel-float-flat 9s/);
  assert.match(homeStyles, /\.np-button-primary \{ animation-duration: 5\.2s; \}/);
  assert.match(homeStyles, /animation: none;/);
  assert.match(homeStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(homeStyles, /\.np-home,\.np-home::before,\.np-home::after/);
  assert.match(homeStyles, /\.np-home \*, \.np-home \*::before, \.np-home \*::after/);
  assert.match(homeStyles, /animation: none !important;/);
  assert.match(homeStyles, /transition: none !important;/);
  assert.doesNotMatch(homeStyles, /will-change\s*:/);
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
