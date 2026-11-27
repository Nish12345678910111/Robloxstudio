"use client";

import { useMemo, useState } from "react";

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
    source: "https://github.com/Nish12345678910111/Robloxstudio",
    featured: true,
  },
  {
    name: "Modern Chat",
    type: "Web experiment",
    status: "Live site",
    description: "A real-time chat space with usernames, online presence, and a responsive interface.",
    tags: ["Chat", "Realtime", "Web", "Community"],
    mark: "✳",
    tone: "violet",
    href: "https://Nish12345678910111.github.io",
    action: "Visit Modern Chat",
    source: "https://github.com/Nish12345678910111/Nish12345678910111.io",
  },
  {
    name: "Lua Script Library",
    type: "Public repository",
    status: "On GitHub",
    description: "A public Lua and Luau collection with scripts, assets, and a lightweight browser page.",
    tags: ["Lua", "Luau", "Roblox", "Scripts"],
    mark: "{ }",
    tone: "mint",
    href: "https://github.com/Nish12345678910111/myscripts",
    action: "Browse repository",
    source: null,
  },
];

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4.25 10h11.5M10 4.25 15.75 10 10 15.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.9" cy="8.9" r="5.65" stroke="currentColor" strokeWidth="1.6" /><path d="m13.1 13.1 3.7 3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function ProjectCard({ project }) {
  const external = /^https?:\/\//i.test(project.href);
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
        <a className="np-project-link" href={project.href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {project.action}<ArrowIcon />
        </a>
        {project.source && <a className="np-source-link" href={project.source} target="_blank" rel="noopener noreferrer" aria-label={`View ${project.name} source on GitHub`}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor"><path d="M10 .8a9.2 9.2 0 0 0-2.91 17.93c.46.08.63-.2.63-.45v-1.6c-2.56.56-3.1-1.09-3.1-1.09-.42-1.07-1.03-1.36-1.03-1.36-.84-.58.06-.57.06-.57.93.06 1.42.95 1.42.95.82 1.4 2.15 1 2.68.76.08-.59.32-1 .58-1.23-2.05-.23-4.2-1.03-4.2-4.57 0-1.01.36-1.84.95-2.49-.1-.23-.41-1.18.09-2.46 0 0 .77-.25 2.53.95A8.8 8.8 0 0 1 10 5.25c.78 0 1.56.1 2.29.31 1.76-1.2 2.52-.95 2.52-.95.5 1.28.19 2.23.1 2.46.59.65.94 1.48.94 2.49 0 3.55-2.16 4.34-4.22 4.57.33.28.62.84.62 1.7v2.45c0 .25.17.54.63.45A9.2 9.2 0 0 0 10 .8Z" /></svg>
        </a>}
      </div>
    </article>
  );
}

export default function PublicHome() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return DEVELOPMENTS;
    return DEVELOPMENTS.filter(project => [project.name, project.type, project.status, project.description, ...project.tags]
      .join(" ").toLowerCase().includes(term));
  }, [query]);

  return (
    <div className="np-home">
      <div className="np-home-grid-glow" aria-hidden="true" />
      <header className="np-home-header">
        <a className="np-home-brand" href="/home" aria-label="Nish Productions home">
          <span className="np-home-brand-mark" aria-hidden="true"><span>N</span><i /></span>
          <span className="np-home-brand-name">Nish <b>Productions</b></span>
        </a>
        <nav className="np-home-nav" aria-label="Main navigation">
          <a href="#developments">Developments</a>
          <a href="https://github.com/Nish12345678910111" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
        </nav>
        <a className="np-home-nav-cta" href="/cloudphone/signup" aria-label="Get a free Cloud Phone"><span aria-hidden="true">☁</span> Free Cloud Phone <ArrowIcon /></a>
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
              <div className="np-home-window-footer"><span><i /> BROWSER BASED</span><span>01&nbsp; / &nbsp;03</span></div>
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
              <h2 id="np-developments-title">Find your next <em>favorite.</em></h2>
              <p className="np-developments-intro">Explore the projects and experiments currently out in the world.</p>
            </div>
            <div className="np-search-wrap">
              <label className="np-visually-hidden" htmlFor="np-project-search">Search developments</label>
              <SearchIcon />
              <input id="np-project-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects, tags, topics…" autoComplete="off" />
              {query && <button type="button" className="np-search-clear" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
              <span className="np-search-count">{filtered.length} <span className="np-visually-hidden">matching </span>{filtered.length === 1 ? "project" : "projects"}</span>
            </div>
          </div>
          <p className="np-visually-hidden" aria-live="polite">Showing {filtered.length} of {DEVELOPMENTS.length} developments.</p>
          {filtered.length > 0 ? <div className="np-project-grid">{filtered.map(project => <ProjectCard key={project.name} project={project} />)}</div> : (
            <div className="np-search-empty"><span aria-hidden="true">⌕</span><h3>No matches just yet</h3><p>Try another keyword, such as “chat”, “Android”, or “Lua”.</p><button type="button" onClick={() => setQuery("")}>Show all developments</button></div>
          )}
        </section>
      </main>

      <footer className="np-home-footer">
        <a className="np-home-footer-brand" href="/home">Nish <b>Productions</b></a>
        <span>Built with curiosity by <b>nishgamerr</b>.</span>
        <a href="https://github.com/Nish12345678910111" target="_blank" rel="noopener noreferrer">Find me on GitHub <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  );
}
