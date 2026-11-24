"use client";

export default function ErrorPage({ reset }) {
  return <main className="wrap"><div className="notFound"><div className="nfIcon">📱</div>
    <h1>Cloud phone</h1><p className="muted">The service hit a snag. Please try again.</p>
    <button className="primary" onClick={() => reset()}>Try again</button>
    <p><a href="/login">Back to login</a></p></div></main>;
}
