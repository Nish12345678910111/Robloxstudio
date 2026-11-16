import Link from "next/link";
export const metadata = { title: "Privacy Policy · NishCloudPhone" };
export default function Privacy() {
  return (<main className="wrap legal">
    <div className="logo">☁️📱</div><h1>Privacy Policy</h1>
    <p className="muted">Last updated: November 2026 · NishCloudPhone — created by <b>nishgamerr</b></p>
    <h2>What we collect</h2>
    <p>Only what the service needs to work: your name and username, your password (kept only in a securely encrypted, unreadable form — never as plain text), your IP address (used purely for security, abuse prevention and country/VPN checks), and your cloud phones with their connection details.</p>
    <h2>How your data is stored</h2>
    <p>Your data is kept securely on our protected servers with strong, industry-standard security measures at every layer — accounts, connections and phones are all guarded so your information stays private and safe. We never sell your data, ever.</p>
    <h2>Who can see your cloud phones</h2>
    <p>Your cloud phones are private: only you can open and use them. Our trusted administrators and moderators can view all cloud phones on the service for one reason only — to check that free cloud phones are being used safely and properly, and to protect the community from abuse.</p>
    <h2>Security checks</h2>
    <p>To keep accounts safe we check things like login attempts and whether a connection comes through a VPN or proxy. VPN/proxy connections are not allowed, because they are used to bypass free-phone limits.</p>
    <h2>Cookies</h2>
    <p>We use one secure login cookie so you stay signed in. Nothing is used to track you across other websites.</p>
    <h2>Deleting your data</h2>
    <p>Delete a cloud phone and it is removed. Delete your account from the dashboard and your account together with all your cloud phones is permanently removed.</p>
    <h2>Keeping you safe</h2>
    <p>Cloud phones run on our secure servers, isolated per user, with protected connections end to end. We work continuously to keep the service hardened against attacks so nobody can get into your account or your phones.</p>
    <p className="muted">Questions about your privacy? Reach out to the creator, <b>nishgamerr</b>, through the service.</p>
    <p><Link className="btnLink" href="/login">← Back to login</Link> · <Link href="/terms">Terms of Service</Link></p>
  </main>);
}
