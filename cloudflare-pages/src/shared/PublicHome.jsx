"use client";

import { useEffect, useRef, useState } from "react";

const FEATURED_PROJECTS = [
  {
    name: "Nish Cloud Phone",
    category: "Browser tool",
    description: "Start a private Android session and control its screen right from your browser.",
    href: "/cloudphone",
    action: "Explore Cloud Phone",
    mark: "☁",
    tone: "blue",
    status: "Ready to explore",
    featured: true,
  },
  {
    name: "Modern Chat",
    category: "Web app",
    description: "A lightweight browser chat experiment by nishgamerr, built for quick conversations.",
    href: "https://nish12345678910111.github.io/Nish12345678910111.io/",
    action: "Open Modern Chat",
    mark: "↗",
    tone: "violet",
    status: "Live experiment",
    featured: true,
    external: true,
  },
];

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

function ProjectCard({ project }) {
  return (
    <article className={`np-project-card tone-${project.tone}${project.featured ? " is-featured" : ""}`}>
      <div className="np-project-topline">
        <span className={`np-project-mark tone-${project.tone}`} aria-hidden="true">{project.mark}</span>
        <span className="np-project-status"><i />{project.status}</span>
      </div>
      <p className="np-project-type">{project.category}</p>
      <h3>{project.name}</h3>
      <p className="np-project-description">{project.description}</p>
      <div className="np-project-bottom">
        <span className="np-project-featured-label">{project.featured ? "FEATURED PROJECT" : "ABOUT"}</span>
        <a className="np-project-link" href={project.href} target={project.external ? "_blank" : undefined} rel={project.external ? "noopener noreferrer" : undefined}>{project.action}<ArrowIcon diagonal={project.external} /></a>
      </div>
    </article>
  );
}

function BrowserPreview() {
  return (
    <div className="np-preview-stage" aria-hidden="true">
      <div className="np-preview-halo" />
      <div className="np-preview-window">
        <div className="np-browser-bar">
          <span className="np-browser-dots"><i /><i /><i /></span>
          <span className="np-browser-address"><span className="np-lock-icon">⌑</span> nishcloudphone.app / dashboard</span>
          <span className="np-browser-menu">···</span>
        </div>
        <div className="np-preview-app">
          <aside className="np-preview-sidebar">
            <div className="np-preview-brand"><span>n</span><b>nishcloud</b></div>
            <p className="np-preview-side-label">WORKSPACE</p>
            <div className="np-preview-side-link is-current"><span>▣</span> My phones <i>1</i></div>
            <div className="np-preview-side-link"><span>＋</span> New phone</div>
            <div className="np-preview-user"><span className="np-preview-avatar">n</span><span><b>nishgamerr</b><small>Free account</small></span><i>⌄</i></div>
          </aside>
          <div className="np-preview-main">
            <div className="np-preview-toolbar"><span>MY CLOUD PHONES</span><span className="np-preview-status"><i /> SESSION PREVIEW</span></div>
            <div className="np-preview-heading"><div><p>YOUR WORKSPACE</p><h2>Android,<br /><em>within reach.</em></h2><span>One screen. Right here in your browser.</span></div><span className="np-preview-plus">＋</span></div>
            <div className="np-preview-device-area">
              <div className="np-preview-device-glow" />
              <div className="np-device">
                <span className="np-device-camera" />
                <div className="np-device-screen">
                  <div className="np-device-status"><span>9:41</span><span>● ● ▰</span></div>
                  <div className="np-device-date">MONDAY, OCTOBER 12</div>
                  <div className="np-device-clock">9:41</div>
                  <div className="np-device-weather"><span>☼</span><span>Clear skies <b>22°</b></span></div>
                  <div className="np-device-apps">
                    <span><i className="np-app-blue">W</i><small>Web</small></span>
                    <span><i className="np-app-pink">P</i><small>Photos</small></span>
                    <span><i className="np-app-violet">S</i><small>Settings</small></span>
                    <span><i className="np-app-green">M</i><small>Maps</small></span>
                  </div>
                  <div className="np-device-dock"><i>☎</i><i>◉</i><i>✉</i><i>◈</i></div>
                </div>
              </div>
              <div className="np-preview-callout"><span>↗</span><span><b>Browser controlled</b><small>No setup on your device</small></span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="np-preview-caption"><span>INTERFACE PREVIEW</span><i /> A cloud phone, in your browser</div>
      <span className="np-preview-spark np-preview-spark-a">✦</span>
      <span className="np-preview-spark np-preview-spark-b">✳</span>
    </div>
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
        <h2 id="np-drawer-title">Make yourself<br />at home.</h2>
        <nav className="np-drawer-nav" aria-label="Site navigation">
          <a href="/home" onClick={closeMenu}><span>01</span> Home <b>↗</b></a>
          <a href="#features" onClick={closeMenu}><span>02</span> Why Cloud Phone <b>↗</b></a>
          <a href="#how-it-works" onClick={closeMenu}><span>03</span> How it works <b>↗</b></a>
          <a href="#projects" onClick={closeMenu}><span>04</span> Featured projects <b>↗</b></a>
          <a className="np-drawer-start" href="/cloudphone/signup" onClick={closeMenu}>Create a free account <ArrowIcon /></a>
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
          <a href="#features">Why Cloud Phone</a>
          <a href="#how-it-works">How it works</a>
          <a href="#projects">Projects</a>
        </nav>
        <button ref={menuButtonRef} className={`np-menu-button${menuOpen ? " is-open" : ""}`} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="np-site-menu" onClick={() => setMenuOpen(open => !open)}>
          <span className="np-menu-glyph" aria-hidden="true"><i /><i /><i /></span>
          <span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
      </header>

      <main>
        <section className="np-hero" aria-labelledby="np-hero-title">
          <div className="np-hero-copy">
            <p className="np-eyebrow"><span className="np-eyebrow-dot" /> A SMALL IDEA WITH A BIG SCREEN <i /> NISH CLOUD PHONE</p>
            <h1 id="np-hero-title">Android,<br />without the<br /><em>extra device.</em></h1>
            <p className="np-hero-lede">Start a cloud Android phone and control its screen from your browser. No emulator to install on your own device.</p>
            <div className="np-hero-actions">
              <a className="np-button-primary" href="/cloudphone/signup">Create a free account <ArrowIcon /></a>
              <a className="np-button-secondary" href="/cloudphone/login">Already have an account? <b>Log in</b></a>
            </div>
            <div className="np-hero-points" aria-label="Cloud Phone details">
              <span><i>✓</i> Free to start</span>
              <span><i>✓</i> Browser-based</span>
              <span><i>✓</i> Temporary sessions</span>
            </div>
            <a className="np-scroll-cue" href="#how-it-works"><span>↓</span> Take a closer look</a>
          </div>
          <BrowserPreview />
          <span className="np-hero-index" aria-hidden="true">01 <i /> 03</span>
        </section>

        <section className="np-proof-strip" aria-label="Cloud Phone at a glance">
          <div><span className="np-proof-number">01</span><span><b>Made for the browser</b><small>Open your Android screen online</small></span></div>
          <div><span className="np-proof-number">02</span><span><b>Account-managed</b><small>Create and manage your sessions</small></span></div>
          <div><span className="np-proof-number">03</span><span><b>Nothing to install locally</b><small>Use the screen from your device</small></span></div>
        </section>

        <section className="np-section np-features" id="features" aria-labelledby="np-features-title">
          <div className="np-section-intro">
            <p className="np-section-kicker"><span /> WHY CLOUD PHONE</p>
            <h2 id="np-features-title">A pocket-sized idea.<br /><em>A whole new way to try it.</em></h2>
            <p>Keep the setup simple and the experience right where you need it: in your browser.</p>
          </div>
          <div className="np-feature-grid">
            <article className="np-feature-card np-feature-card-large">
              <span className="np-feature-index">01 / ACCESS</span>
              <span className="np-feature-icon"><FeatureIcon kind="browser" /></span>
              <h3>Your Android, in a browser tab.</h3>
              <p>Open the live phone screen from your dashboard and interact with it without installing an emulator on your own device.</p>
              <a href="/cloudphone/signup" aria-label="Create an account to use Cloud Phone">Explore Cloud Phone <ArrowIcon /></a>
              <div className="np-feature-decoration" aria-hidden="true"><span>WEB</span><i /><b>↗</b></div>
            </article>
            <article className="np-feature-card">
              <span className="np-feature-index">02 / YOUR ACCOUNT</span>
              <span className="np-feature-icon"><FeatureIcon kind="account" /></span>
              <h3>One place to manage it.</h3>
              <p>Create, open, stop, and remove your cloud phones from your account dashboard.</p>
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
            <div><p className="np-section-kicker"><span /> THREE SIMPLE STEPS</p><h2 id="np-how-title">From zero to <em>Android.</em></h2></div>
            <p>No setup guide, no local emulator, no complicated install. Start from your account and follow along.</p>
          </div>
          <div className="np-steps">
            <article className="np-step"><span className="np-step-number">01</span><div className="np-step-line" /><p>FIRST, JOIN</p><h3>Create your account</h3><span>Sign up for a free Nish Cloud Phone account.</span></article>
            <article className="np-step"><span className="np-step-number">02</span><div className="np-step-line" /><p>THEN, LAUNCH</p><h3>Start a phone</h3><span>Choose an Android profile and create a session from your dashboard.</span></article>
            <article className="np-step"><span className="np-step-number">03</span><div className="np-step-line" /><p>YOU'RE IN</p><h3>Use it in your browser</h3><span>Open the live screen and control your phone right from the page.</span></article>
          </div>
        </section>

        <section className="np-projects" id="projects" aria-labelledby="np-projects-title">
          <div className="np-projects-heading">
            <div><p className="np-section-kicker"><span /> THE PROJECT SHELF</p><h2 id="np-projects-title">Made to <em>explore.</em></h2><p>A growing collection of things we're working on. Pick a project and take a look.</p></div>
            <a className="np-projects-jump" href="#featured-project-cards">Browse projects <span aria-hidden="true">↓</span></a>
          </div>
          <div className="np-project-grid" id="featured-project-cards">{FEATURED_PROJECTS.map(project => <ProjectCard key={project.name} project={project} />)}</div>
        </section>

        <section className="np-final-cta" aria-labelledby="np-final-title">
          <div className="np-cta-orb np-cta-orb-one" aria-hidden="true" /><div className="np-cta-orb np-cta-orb-two" aria-hidden="true" />
          <div className="np-final-copy">
            <p className="np-section-kicker"><span /> YOUR NEXT SCREEN IS CLOSER THAN YOU THINK</p>
            <h2 id="np-final-title">Give your idea<br /><em>a phone of its own.</em></h2>
            <p>Create a free account and launch your first cloud phone when you're ready.</p>
            <a className="np-button-primary" href="/cloudphone/signup">Get started for free <ArrowIcon /></a>
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
