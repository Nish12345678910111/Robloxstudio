"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DEVELOPMENTS = [
  {
    name: "Nish Cloud Phone",
    type: "Browser tool",
    status: "Open in browser",
    description: "Create a private Android cloud phone and control it right from your browser.",
    tags: ["Android", "Cloud", "Browser", "Free"],
    mark: "☁",
    tone: "blue",
    href: "/cloudphone",
    action: "Explore Cloud Phone",
    featured: true,
  },
];

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4.25 10h11.5M10 4.25 15.75 10 10 15.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.9" cy="8.9" r="5.65" stroke="currentColor" strokeWidth="1.6" /><path d="m13.1 13.1 3.7 3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function ProjectCard({ project }) {
  return (
    <article className={`np-project-card${project.featured ? " is-featured" : ""}`}>
      <div className="np-project-topline">
        <span className={`np-project-mark tone-${project.tone}`} aria-hidden="true">{project.mark}</span>
        <span className="np-project-status"><i />{project.status}</span>
      </div>
      <p className="np-project-type">{project.type}</p>
      <h3>{project.name}</h3>
      <p className="np-project-description">{project.description}</p>
      <ul className="np-project-tags" aria-label={`${project.name} topics`}>
        {project.tags.map(tag => <li key={tag}>{tag}</li>)}
      </ul>
      <div className="np-project-actions">
        <a className="np-project-link" href={project.href}>{project.action}<ArrowIcon /></a>
      </div>
    </article>
  );
}

export default function PublicHome() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return DEVELOPMENTS;
    return DEVELOPMENTS.filter(project => [project.name, project.type, project.status, project.description, ...project.tags]
      .join(" ").toLowerCase().includes(term));
  }, [query]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeButton = drawerRef.current?.querySelector(".np-drawer-close");
    closeButton?.focus({ preventScroll: true });

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll("a[href], button:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  return (
    <div className="np-home">
      <div className="np-home-grid-glow" aria-hidden="true" />
      <button className={`np-menu-scrim${menuOpen ? " is-open" : ""}`} type="button" aria-label="Close navigation menu" aria-hidden={!menuOpen} inert={!menuOpen} tabIndex={menuOpen ? 0 : -1} onClick={closeMenu} />
      <aside ref={drawerRef} id="np-site-menu" className={`np-nav-drawer${menuOpen ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="np-drawer-title" aria-hidden={!menuOpen} inert={!menuOpen}>
        <div className="np-drawer-top">
          <span className="np-drawer-kicker">NISH PRODUCTIONS</span>
          <button className="np-drawer-close" type="button" aria-label="Close navigation menu" onClick={closeMenu}>×</button>
        </div>
        <h2 id="np-drawer-title">Where to?</h2>
        <nav className="np-drawer-nav" aria-label="Site navigation">
          <a href="/home" onClick={closeMenu}><span>01</span> Home</a>
          <a href="#developments" onClick={closeMenu}><span>02</span> Developments</a>
        </nav>
        <div className="np-drawer-divider" />
        <p className="np-drawer-kicker">INFORMATION</p>
        <nav className="np-drawer-nav np-drawer-legal" aria-label="Policies">
          <a href="/terms" onClick={closeMenu}>Terms of Service <span aria-hidden="true">↗</span></a>
          <a href="/privacy" onClick={closeMenu}>Privacy Policy <span aria-hidden="true">↗</span></a>
        </nav>
        <p className="np-drawer-note">Made independently with curiosity.<br /><b>Created by nishgamerr</b></p>
      </aside>

      <header className="np-home-header">
        <a className="np-home-brand" href="/home" aria-label="Nish Productions home">
          <span className="np-home-brand-mark" aria-hidden="true"><span>N</span><i /></span>
          <span className="np-home-brand-name">Nish <b>Productions</b></span>
        </a>
        <button ref={menuButtonRef} className={`np-home-menu-button${menuOpen ? " is-open" : ""}`} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="np-site-menu" onClick={() => setMenuOpen(open => !open)}>
          <span className="np-home-menu-icon" aria-hidden="true"><i /><i /><i /></span>
          <span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
      </header>

      <main>
        <section className="np-home-hero" aria-labelledby="np-home-title">
          <div className="np-home-copy">
            <p className="np-home-eyebrow"><span /> Independent creator <i>·</i> Digital experiments</p>
            <h1 id="np-home-title">Curiosity,<br /><em>made clickable.</em></h1>
            <p className="np-home-lede">Welcome to Nish Productions — a home for tools, web experiments, and ideas built by <strong>nishgamerr</strong>.</p>
            <div className="np-home-actions">
              <a className="np-home-primary" href="/cloudphone/signup">Get a free Cloud Phone <ArrowIcon /></a>
              <a className="np-home-secondary" href="#developments">Explore developments <span aria-hidden="true">↓</span></a>
            </div>
            <div className="np-home-byline">
              <span className="np-home-avatar" aria-hidden="true">NG</span>
              <p>Made independently, shared with everyone.<br /><span>Pick a project and jump right in.</span></p>
            </div>
          </div>

          <div className="np-home-art" aria-hidden="true">
            <div className="np-home-orbit np-orbit-one" />
            <div className="np-home-orbit np-orbit-two" />
            <div className="np-home-art-glow" />
            <div className="np-home-window">
              <div className="np-home-window-bar"><span><i /><i /><i /></span><b>NISH / PROJECTS</b><span className="np-home-window-live"><i /> EXPLORING</span></div>
              <div className="np-home-window-content">
                <div className="np-home-window-copy"><span className="np-home-kicker">FEATURED DEVELOPMENT</span><h2>Cloud<br />Phone</h2><p>Your Android, in a browser.</p><span className="np-home-window-chip">ANDROID&nbsp; · &nbsp;CLOUD</span></div>
                <div className="np-home-device"><div className="np-home-device-notch" /><div className="np-home-device-screen"><span className="np-home-device-cloud">☁</span><b>Ready to explore</b><small>Tap into a new idea.</small><span className="np-home-device-button">Open phone <i>↗</i></span></div></div>
              </div>
              <div className="np-home-window-footer"><span><i /> BROWSER BASED</span><span>01&nbsp; / &nbsp;01</span></div>
            </div>
            <div className="np-home-float-card"><span className="np-home-float-icon">✦</span><span><b>Small ideas, live on the web</b><small>Tools · experiments · more</small></span></div>
            <span className="np-home-spark np-spark-one">✳</span><span className="np-home-spark np-spark-two">✦</span>
          </div>
        </section>

        <div className="np-home-highlights" aria-label="About the projects">
          <span><b>01</b> Made with curiosity</span><span><b>02</b> Built for the web</span><span><b>03</b> Ready to explore</span>
        </div>

        <section className="np-developments" id="developments" aria-labelledby="np-developments-title">
          <div className="np-developments-heading">
            <div>
              <p className="np-home-eyebrow"><span /> The project shelf</p>
              <h2 id="np-developments-title">Your project, <em>your way.</em></h2>
              <p className="np-developments-intro">Search and explore the development currently featured here.</p>
            </div>
            <div className="np-search-wrap">
              <label className="np-visually-hidden" htmlFor="np-project-search">Search developments</label>
              <SearchIcon />
              <input id="np-project-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search developments…" autoComplete="off" />
              {query && <button type="button" className="np-search-clear" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
              <span className="np-search-count">{filtered.length} <span className="np-visually-hidden">matching </span>{filtered.length === 1 ? "project" : "projects"}</span>
            </div>
          </div>
          <p className="np-visually-hidden" aria-live="polite">Showing {filtered.length} of {DEVELOPMENTS.length} developments.</p>
          {filtered.length > 0 ? <div className="np-project-grid">{filtered.map(project => <ProjectCard key={project.name} project={project} />)}</div> : (
            <div className="np-search-empty"><span aria-hidden="true">⌕</span><h3>No matches just yet</h3><p>Try searching for Cloud Phone, Android, or browser.</p><button type="button" onClick={() => setQuery("")}>Show all developments</button></div>
          )}
        </section>
      </main>

      <footer className="np-home-footer">
        <a className="np-home-footer-brand" href="/home">Nish <b>Productions</b></a>
        <span>Built with curiosity by <b>nishgamerr</b>.</span>
        <nav className="np-home-footer-links" aria-label="Footer navigation"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></nav>
      </footer>
    </div>
  );
}
