"use client";

import { useEffect, useRef, useState } from "react";

const FEATURED_PROJECTS = [
  {
    name: "Nish Cloud Phone",
    category: "Cloud Android · Browser",
    description: "Launch and manage a private cloud Android session right from your browser.",
    href: "/cloudphone",
    action: "Open Cloud Phone",
    mark: "☁",
    tone: "blue",
    status: "PUBLISHED",
    featured: true,
  },
];

function ArrowIcon({ diagonal = false }) {
  return diagonal ? (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M6 14 14 6M6.5 6H14v7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4.25 10h11.5M10 4.25 15.75 10 10 15.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

function CloudPhonePreview() {
  return (
    <div className="np-deploy-preview" aria-hidden="true">
      <div className="np-deploy-halo" />
      <div className="np-deploy-window">
        <div className="np-deploy-browser-bar">
          <span className="np-deploy-browser-dots"><i /><i /><i /></span>
          <span className="np-deploy-address"><i /> nish / deployments</span>
          <span className="np-deploy-menu">···</span>
        </div>
        <div className="np-deploy-content">
          <div className="np-deploy-overview">
            <div><p>YOUR DEPLOYMENT CONTROL ROOM</p><h2>Live projects.<br /><em>One click away.</em></h2></div>
            <span className="np-deploy-total"><b>01</b><small>active<br />deployment</small></span>
          </div>
          <div className="np-deploy-list">
            <div className="np-deploy-row">
              <span className="np-deploy-badge np-deploy-badge-cloudphone">CP</span>
              <span className="np-deploy-row-copy"><b>Nish Cloud Phone</b><small>Browser app <i>·</i> Android session</small></span>
              <span className="np-deploy-state"><i /> PUBLISHED</span>
              <ArrowIcon diagonal />
            </div>
          </div>
          <div className="np-deploy-footer"><span><i />01 PROJECT</span><span>CLOUD PHONE</span></div>
        </div>
      </div>
      <div className="np-deploy-float np-deploy-float-one"><span>LIVE</span> Cloud Phone</div>
      <div className="np-deploy-caption"><span>MY DEPLOYMENTS</span><i /> Open Cloud Phone directly</div>
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
      <div className="np-project-bottom">
        <span className="np-project-featured-label">BROWSER APP · ANDROID</span>
        <a className="np-project-link" href={project.href}>{project.action}<ArrowIcon /></a>
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
        <h2 id="np-drawer-title">Cloud Phone.<br />One place to start.</h2>
        <nav className="np-drawer-nav" aria-label="Site navigation">
          <a href="/home" onClick={closeMenu}><span>01</span> Home <b>↗</b></a>
          <a href="#deployments" onClick={closeMenu}><span>02</span> My deployments <b>↗</b></a>
          <a href="/cloudphone" onClick={closeMenu}><span>03</span> Open Cloud Phone <b>↗</b></a>
          <a className="np-drawer-start" href="/cloudphone" onClick={closeMenu}>Open Cloud Phone <ArrowIcon /></a>
        </nav>
        <div className="np-drawer-divider" />
        <p className="np-drawer-kicker">GOOD TO KNOW</p>
        <nav className="np-drawer-legal" aria-label="Policies">
          <a href="/terms" onClick={closeMenu}>Terms of Service <ArrowIcon diagonal /></a>
          <a href="/privacy" onClick={closeMenu}>Privacy Policy <ArrowIcon diagonal /></a>
        </nav>
        <p className="np-drawer-note">Cloud Android, right in your browser.<br /><b>Created by nishgamerr</b></p>
      </aside>

      <header className="np-site-header">
        <a className="np-brand" href="/home" aria-label="Nish Productions home">
          <span className="np-brand-mark" aria-hidden="true">n</span>
          <span className="np-brand-copy">Nish <b>Productions</b><small>CLOUD PHONE · BROWSER ANDROID</small></span>
        </a>
        <nav className="np-header-nav" aria-label="Page sections">
          <a href="#deployments">My deployments</a>
          <a href="/cloudphone">Cloud Phone</a>
        </nav>
        <a className="np-header-cta" href="/cloudphone" aria-label="Open Cloud Phone"><span>Open Cloud Phone</span><ArrowIcon /></a>
        <button ref={menuButtonRef} className={`np-menu-button${menuOpen ? " is-open" : ""}`} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="np-site-menu" onClick={() => setMenuOpen(open => !open)}>
          <span className="np-menu-glyph" aria-hidden="true"><i /><i /><i /></span>
          <span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
      </header>

      <main>
        <section className="np-hero" aria-labelledby="np-hero-title">
          <div className="np-hero-copy">
            <p className="np-eyebrow"><span className="np-eyebrow-dot" /> NISH PRODUCTIONS <i /> MY DEPLOYMENTS</p>
            <h1 id="np-hero-title">Your deployments.<br /><em>One click away.</em></h1>
            <p className="np-hero-lede">See your live projects at a glance, then open Cloud Phone directly from its deployment card.</p>
            <div className="np-hero-actions">
              <a className="np-button-primary" href="#deployments">View my deployments <ArrowIcon /></a>
              <a className="np-button-secondary" href="/cloudphone">Open Cloud Phone <b>↗</b></a>
            </div>
            <div className="np-hero-points" aria-label="Deployment overview">
              <span><i>✓</i> 1 active project</span>
              <span><i>✓</i> Direct app access</span>
              <span><i>✓</i> Browser-based Android</span>
            </div>
            <a className="np-scroll-cue" href="#deployments"><span>↓</span> View my deployments</a>
          </div>
          <CloudPhonePreview />
          <span className="np-hero-index" aria-hidden="true">01 <i /> 01</span>
        </section>

        <section className="np-proof-strip" aria-label="Deployment summary">
          <div><span className="np-proof-number">01</span><span><b>Active project</b><small>Nish Cloud Phone</small></span></div>
          <div><span className="np-proof-number">APP</span><span><b>Browser access</b><small>Open it directly</small></span></div>
          <div><span className="np-proof-number">LIVE</span><span><b>Private sessions</b><small>Managed from your dashboard</small></span></div>
        </section>

        <section className="np-projects" id="deployments" aria-labelledby="np-projects-title">
          <div className="np-projects-heading">
            <div><p className="np-section-kicker"><span /> DEPLOYMENT DIRECTORY</p><h2 id="np-projects-title">My deployments.<br /><em>Ready to open.</em></h2><p>Your current app, with a direct path into its Cloud Phone workspace.</p></div>
            <a className="np-projects-jump" href="/cloudphone">Open Cloud Phone <span aria-hidden="true">↗</span></a>
          </div>
          <div className="np-project-grid" id="featured-project-cards">{FEATURED_PROJECTS.map((project, index) => <ProjectCard key={project.name} project={project} index={index} />)}</div>
        </section>

      </main>

      <footer className="np-site-footer">
        <a className="np-brand np-footer-brand" href="/home"><span className="np-brand-mark" aria-hidden="true">n</span><span className="np-brand-copy">Nish <b>Productions</b><small>CLOUD PHONE · BROWSER ANDROID</small></span></a>
        <p>Made with curiosity.<br /><b>Created by nishgamerr</b></p>
        <nav aria-label="Footer policies"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></nav>
        <span className="np-copyright">© {new Date().getFullYear()} Nish Productions</span>
      </footer>
    </div>
  );
}
