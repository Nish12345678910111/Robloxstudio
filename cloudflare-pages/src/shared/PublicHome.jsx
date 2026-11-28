"use client";

import { useEffect, useRef, useState } from "react";

const FEATURED_PROJECTS = [
  {
    name: "Nish Cloud Phone",
    category: "Browser tool · Android",
    description: "Start a private cloud Android session and control its screen right from your browser.",
    href: "/cloudphone",
    action: "Open Cloud Phone",
    mark: "☁",
    tone: "blue",
    status: "2 deployment targets",
    featured: true,
    deployments: [
      { provider: "Cloudflare Pages", host: "nishproductions.pages.dev", href: "https://nishproductions.pages.dev", badge: "CF", tone: "cloudflare" },
      { provider: "Vercel", host: "nishcloudphone.vercel.app", href: "https://nishcloudphone.vercel.app", badge: "V", tone: "vercel" },
    ],
  },
  {
    name: "Modern Chat",
    category: "Web app · Experiment",
    description: "A lightweight browser chat experiment by nishgamerr, built for quick conversations.",
    href: "https://nish12345678910111.github.io/Nish12345678910111.io/",
    action: "Open Modern Chat",
    mark: "✉",
    tone: "violet",
    status: "GitHub Pages",
    featured: true,
    deployments: [
      { provider: "GitHub Pages", host: "nish12345678910111.github.io/Nish12345678910111.io", href: "https://nish12345678910111.github.io/Nish12345678910111.io/", badge: "GH", tone: "github" },
    ],
  },
  {
    name: "Nishgamerr Lua Scripts",
    category: "Script viewer · Roblox",
    description: "Browse and search the Lua script collection through a lightweight web viewer.",
    href: "https://nish12345678910111.github.io/myscripts/",
    action: "Explore the viewer",
    mark: "{ }",
    tone: "mint",
    status: "GitHub Pages",
    featured: true,
    deployments: [
      { provider: "GitHub Pages", host: "nish12345678910111.github.io/myscripts", href: "https://nish12345678910111.github.io/myscripts/", badge: "GH", tone: "github" },
    ],
  },
];

const ALL_DEPLOYMENTS = FEATURED_PROJECTS.flatMap(project => project.deployments.map(deployment => ({
  ...deployment,
  project: project.name,
})));
const PLATFORM_COUNT = new Set(ALL_DEPLOYMENTS.map(deployment => deployment.provider)).size;

function ArrowIcon({ diagonal = false }) {
  return diagonal ? (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M6 14 14 6M6.5 6H14v7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4.25 10h11.5M10 4.25 15.75 10 10 15.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

function FeatureIcon({ kind }) {
  if (kind === "browser") return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 9h17M7 6.5h.01M10 6.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  if (kind === "account") return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" /><path d="M5 20c.7-3.1 3.2-5 7-5s6.3 1.9 7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="m17 8 1.5 1.5L21 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DeploymentPreview() {
  return (
    <div className="np-deploy-preview" aria-hidden="true">
      <div className="np-deploy-halo" />
      <div className="np-deploy-window">
        <div className="np-deploy-browser-bar">
          <span className="np-deploy-browser-dots"><i /><i /><i /></span>
          <span className="np-deploy-address"><i /> nishproductions / deployments</span>
          <span className="np-deploy-menu">···</span>
        </div>
        <div className="np-deploy-content">
          <div className="np-deploy-overview">
            <div><p>THE PROJECT CONTROL ROOM</p><h2>One home.<br /><em>Many places to go.</em></h2></div>
            <span className="np-deploy-total"><b>{ALL_DEPLOYMENTS.length}</b><small>deployment<br />targets</small></span>
          </div>
          <div className="np-deploy-list">
            {ALL_DEPLOYMENTS.map((deployment, index) => (
              <div className="np-deploy-row" key={`${deployment.provider}-${deployment.host}`} style={{ "--row-index": index }}>
                <span className={`np-deploy-badge np-deploy-badge-${deployment.tone}`}>{deployment.badge}</span>
                <span className="np-deploy-row-copy"><b>{deployment.project}</b><small>{deployment.provider} <i>·</i> {deployment.host}</small></span>
                <span className="np-deploy-state"><i /> PUBLISHED</span>
                <ArrowIcon diagonal />
              </div>
            ))}
          </div>
          <div className="np-deploy-footer"><span><i /> {FEATURED_PROJECTS.length} PROJECTS</span><span>{PLATFORM_COUNT} HOSTING PLATFORMS</span></div>
        </div>
      </div>
      <div className="np-deploy-float np-deploy-float-one"><span>CF</span> Cloudflare Pages</div>
      <div className="np-deploy-float np-deploy-float-two"><span>V</span> Vercel</div>
      <div className="np-deploy-caption"><span>DEPLOYMENT OVERVIEW</span><i /> Multiple projects, easy to reach</div>
      <span className="np-deploy-spark np-deploy-spark-one">✦</span>
      <span className="np-deploy-spark np-deploy-spark-two">✳</span>
    </div>
  );
}

function ProjectCard({ project, index }) {
  return (
    <article className={`np-project-card tone-${project.tone}${project.featured ? " is-featured" : ""}`} style={{ "--card-index": index }}>
      <div className="np-project-topline">
        <span className={`np-project-mark tone-${project.tone}`} aria-hidden="true">{project.mark}</span>
        <span className="np-project-status"><i />{project.status}</span>
      </div>
      <p className="np-project-type">{project.category}</p>
      <h3>{project.name}</h3>
      <p className="np-project-description">{project.description}</p>
      <div className="np-project-deployments" aria-label={`${project.name} deployment links`}>
        {project.deployments.map(deployment => (
          <a
            className="np-deploy-link"
            href={deployment.href}
            key={`${deployment.provider}-${deployment.host}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${project.name} on ${deployment.provider}: ${deployment.host} (opens in a new tab)`}
          >
            <span className={`np-deploy-link-badge np-deploy-link-badge-${deployment.tone}`}>{deployment.badge}</span>
            <span className="np-deploy-link-copy"><b>{deployment.provider}</b><small>{deployment.host}</small></span>
            <ArrowIcon diagonal />
          </a>
        ))}
      </div>
      <div className="np-project-bottom">
        <span className="np-project-featured-label">{project.deployments.length} {project.deployments.length === 1 ? "DEPLOYMENT" : "DEPLOYMENTS"}</span>
        <a className="np-project-link" href={project.href} target={project.href.startsWith("http") ? "_blank" : undefined} rel={project.href.startsWith("http") ? "noopener noreferrer" : undefined}>
          {project.action}<ArrowIcon diagonal={project.href.startsWith("http")} />
        </a>
      </div>
    </article>
  );
}

export default function PublicHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const focusable = () => drawerRef.current?.querySelectorAll("a[href], button:not([disabled])") || [];
    const first = focusable()[0];
    first?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); }
      if (event.key !== "Tab") return;
      const items = [...focusable()];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <div className="np-home">
      <div className="np-home-grid" aria-hidden="true" />
      <button className={`np-menu-scrim${menuOpen ? " is-open" : ""}`} type="button" aria-label="Close navigation menu" aria-hidden={!menuOpen} inert={!menuOpen} tabIndex={menuOpen ? 0 : -1} onClick={closeMenu} />
      <aside ref={drawerRef} id="np-site-menu" className={`np-nav-drawer${menuOpen ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="np-drawer-title" aria-hidden={!menuOpen} inert={!menuOpen}>
        <div className="np-drawer-top">
          <a className="np-drawer-brand" href="/home" onClick={closeMenu}><span className="np-brand-mark">n</span><span>Nish <b>Productions</b></span></a>
          <button className="np-drawer-close" type="button" aria-label="Close navigation menu" onClick={closeMenu}>×</button>
        </div>
        <p className="np-drawer-kicker">EXPLORE</p>
        <h2 id="np-drawer-title">One home.<br />Many places to go.</h2>
        <nav className="np-drawer-nav" aria-label="Site navigation">
          <a href="/home" onClick={closeMenu}><span>01</span> Home <b>↗</b></a>
          <a href="#deployments" onClick={closeMenu}><span>02</span> Check deployments <b>↗</b></a>
          <a href="#cloudphone" onClick={closeMenu}><span>03</span> About Cloud Phone <b>↗</b></a>
          <a href="#how-it-works" onClick={closeMenu}><span>04</span> How it works <b>↗</b></a>
          <a className="np-drawer-start" href="/cloudphone" onClick={closeMenu}>Open Cloud Phone <ArrowIcon /></a>
        </nav>
        <div className="np-drawer-divider" />
        <p className="np-drawer-kicker">GOOD TO KNOW</p>
        <nav className="np-drawer-legal" aria-label="Policies">
          <a href="/terms" onClick={closeMenu}>Terms of Service <ArrowIcon diagonal /></a>
          <a href="/privacy" onClick={closeMenu}>Privacy Policy <ArrowIcon diagonal /></a>
        </nav>
        <p className="np-drawer-note">Independent ideas, built for the web.<br /><b>Created by nishgamerr</b></p>
      </aside>

      <header className="np-site-header">
        <a className="np-brand" href="/home" aria-label="Nish Productions home">
          <span className="np-brand-mark" aria-hidden="true">n</span>
          <span className="np-brand-copy">Nish <b>Productions</b><small>INDEPENDENT DIGITAL PROJECTS</small></span>
        </a>
        <nav className="np-header-nav" aria-label="Page sections">
          <a href="#deployments">Deployments</a>
          <a href="#cloudphone">Cloud Phone</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <a className="np-header-cta" href="#deployments" aria-label="Check deployments"><span>Check deployments</span><ArrowIcon /></a>
        <button ref={menuButtonRef} className={`np-menu-button${menuOpen ? " is-open" : ""}`} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="np-site-menu" onClick={() => setMenuOpen(open => !open)}>
          <span className="np-menu-glyph" aria-hidden="true"><i /><i /><i /></span>
          <span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
      </header>

      <main>
        <section className="np-hero" aria-labelledby="np-hero-title">
          <div className="np-hero-copy">
            <p className="np-eyebrow"><span className="np-eyebrow-dot" /> NISH PRODUCTIONS <i /> MULTI-DEPLOYMENT PROJECT HUB</p>
            <h1 id="np-hero-title">One home.<br />Many things<br /><em>to explore.</em></h1>
            <p className="np-hero-lede">Browse tools, experiments, and live deployments by nishgamerr. Choose a project, pick its hosted home, and jump straight in.</p>
            <div className="np-hero-actions">
              <a className="np-button-primary" href="#deployments">Check deployments <ArrowIcon /></a>
              <a className="np-button-secondary" href="/cloudphone">Open Cloud Phone <b>↗</b></a>
            </div>
            <div className="np-hero-points" aria-label="Projects and deployments">
              <span><i>✓</i> {FEATURED_PROJECTS.length} featured projects</span>
              <span><i>✓</i> {ALL_DEPLOYMENTS.length} deployment endpoints</span>
              <span><i>✓</i> {PLATFORM_COUNT} hosting platforms</span>
            </div>
            <a className="np-scroll-cue" href="#deployments"><span>↓</span> Browse what's deployed</a>
          </div>
          <DeploymentPreview />
          <span className="np-hero-index" aria-hidden="true">01 <i /> 03</span>
        </section>

        <section className="np-proof-strip" aria-label="Deployment totals">
          <div><span className="np-proof-number">{String(FEATURED_PROJECTS.length).padStart(2, "0")}</span><span><b>Featured projects</b><small>Tools, apps, and experiments</small></span></div>
          <div><span className="np-proof-number">{String(ALL_DEPLOYMENTS.length).padStart(2, "0")}</span><span><b>Deployment endpoints</b><small>Choose the hosted version you need</small></span></div>
          <div><span className="np-proof-number">{String(PLATFORM_COUNT).padStart(2, "0")}</span><span><b>Hosting platforms</b><small>Cloudflare, Vercel, GitHub Pages</small></span></div>
        </section>

        <section className="np-projects" id="deployments" aria-labelledby="np-projects-title">
          <div className="np-projects-heading">
            <div><p className="np-section-kicker"><span /> THE DEPLOYMENT DIRECTORY</p><h2 id="np-projects-title">Pick a project.<br /><em>Choose where to open it.</em></h2><p>Not just a sign-up page: explore every featured project and its deployment links in one place.</p></div>
            <a className="np-projects-jump" href="#featured-project-cards">Browse all deployments <span aria-hidden="true">↓</span></a>
          </div>
          <div className="np-project-grid" id="featured-project-cards">{FEATURED_PROJECTS.map((project, index) => <ProjectCard key={project.name} project={project} index={index} />)}</div>
        </section>

        <section className="np-section np-features" id="cloudphone" aria-labelledby="np-features-title">
          <div className="np-section-intro">
            <p className="np-section-kicker"><span /> FEATURED PROJECT · NISH CLOUD PHONE</p>
            <h2 id="np-features-title">Android in a browser.<br /><em>One click away.</em></h2>
            <p>Cloud Phone is one project in the collection, with multiple hosted destinations and a simple browser-first experience.</p>
          </div>
          <div className="np-feature-grid">
            <article className="np-feature-card np-feature-card-large">
              <span className="np-feature-index">01 / ACCESS</span>
              <span className="np-feature-icon"><FeatureIcon kind="browser" /></span>
              <h3>Your Android, in a browser tab.</h3>
              <p>Open the phone screen from your dashboard and interact without installing an emulator on your own device.</p>
              <a href="/cloudphone" aria-label="Open Nish Cloud Phone">Open Cloud Phone <ArrowIcon /></a>
              <div className="np-feature-decoration" aria-hidden="true"><span>WEB</span><i /><b>↗</b></div>
            </article>
            <article className="np-feature-card">
              <span className="np-feature-index">02 / YOUR ACCOUNT</span>
              <span className="np-feature-icon"><FeatureIcon kind="account" /></span>
              <h3>One place to manage it.</h3>
              <p>Create, open, stop, and remove cloud phones from the account dashboard.</p>
              <span className="np-feature-footnote">YOUR DASHBOARD · YOUR CONTROLS</span>
            </article>
            <article className="np-feature-card">
              <span className="np-feature-index">03 / SESSION</span>
              <span className="np-feature-icon"><FeatureIcon kind="time" /></span>
              <h3>Designed for temporary sessions.</h3>
              <p>Phones run for a limited time. A phone and its on-device data may be removed when its session ends.</p>
              <span className="np-feature-footnote">CLEAR EXPECTATIONS · NO SURPRISES</span>
            </article>
          </div>
        </section>

        <section className="np-how" id="how-it-works" aria-labelledby="np-how-title">
          <div className="np-how-heading">
            <div><p className="np-section-kicker"><span /> START WITH CLOUD PHONE</p><h2 id="np-how-title">Three steps to <em>Android.</em></h2></div>
            <p>The other deployments open directly. For Cloud Phone, create an account to start a private, time-limited browser session.</p>
          </div>
          <div className="np-steps">
            <article className="np-step"><span className="np-step-number">01</span><div className="np-step-line" /><p>FIRST, JOIN</p><h3>Create your account</h3><span>Sign up for a free Nish Cloud Phone account.</span></article>
            <article className="np-step"><span className="np-step-number">02</span><div className="np-step-line" /><p>THEN, LAUNCH</p><h3>Start a phone</h3><span>Choose an Android profile and create a session from the dashboard.</span></article>
            <article className="np-step"><span className="np-step-number">03</span><div className="np-step-line" /><p>YOU'RE IN</p><h3>Use it in your browser</h3><span>Open the live screen and control your phone right from the page.</span></article>
          </div>
        </section>

        <section className="np-final-cta" aria-labelledby="np-final-title">
          <div className="np-cta-orb np-cta-orb-one" aria-hidden="true" /><div className="np-cta-orb np-cta-orb-two" aria-hidden="true" />
          <div className="np-final-copy">
            <p className="np-section-kicker"><span /> ALL PROJECTS, ONE STARTING POINT</p>
            <h2 id="np-final-title">Find your next<br /><em>thing to explore.</em></h2>
            <p>Jump into the deployments directory or start a Cloud Phone session whenever you're ready.</p>
            <div className="np-final-actions"><a className="np-button-primary" href="#deployments">Browse deployments <ArrowIcon /></a><a className="np-final-link" href="/cloudphone/signup">Create a Cloud Phone account</a></div>
          </div>
          <div className="np-cta-stamp" aria-hidden="true"><span>MADE FOR</span><b>the<br />curious</b><i>✦</i></div>
        </section>
      </main>

      <footer className="np-site-footer">
        <a className="np-brand np-footer-brand" href="/home"><span className="np-brand-mark" aria-hidden="true">n</span><span className="np-brand-copy">Nish <b>Productions</b><small>INDEPENDENT DIGITAL PROJECTS</small></span></a>
        <p>Made with curiosity.<br /><b>Created by nishgamerr</b></p>
        <nav aria-label="Footer policies"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></nav>
        <span className="np-copyright">© {new Date().getFullYear()} Nish Productions</span>
      </footer>
    </div>
  );
}
