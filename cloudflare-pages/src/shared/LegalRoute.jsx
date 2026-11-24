export default function LegalRoute({ privacy = false }) {
  const title = privacy ? "Privacy Policy" : "Terms of Service";
  return (<main className="wrap legal">
    <div className="logo">☁️📱</div><h1>{title}</h1>
    <p className="muted">Last updated: November 2026 · NishCloudPhone — created by <b>nishgamerr</b></p>
    {privacy ? <>
      <h2>What we collect</h2><p>Only what the service needs to work: your name and username, your password (kept only in a securely encrypted, unreadable form — never as plain text), your IP address (used purely for security, abuse prevention and country/VPN checks), and your cloud phones with their connection details.</p>
      <h2>How your data is stored</h2><p>Your data is kept securely on our protected servers with strong, industry-standard security measures at every layer — accounts, connections and phones are all guarded so your information stays private and safe. We never sell your data, ever.</p>
      <h2>Who can see your cloud phones</h2><p>Your cloud phones are private: only you can open and use them. Our trusted administrators and moderators can view all cloud phones on the service for one reason only — to check that free cloud phones are being used safely and properly, and to protect the community from abuse.</p>
      <h2>Security checks</h2><p>To keep accounts safe we check things like login attempts and whether a connection comes through a VPN or proxy. VPN/proxy connections are not allowed, because they are used to bypass free-phone limits.</p>
      <h2>Cookies</h2><p>We use one secure login cookie so you stay signed in. Nothing is used to track you across other websites.</p>
      <h2>Deleting your data</h2><p>Delete a cloud phone and it is removed. Delete your account from the dashboard and your account together with all your cloud phones is permanently removed.</p>
      <h2>Keeping you safe</h2><p>Cloud phones run on our secure servers, isolated per user, with protected connections end to end. We work continuously to keep the service hardened against attacks so nobody can get into your account or your phones.</p>
      <p className="muted">Questions about your privacy? Reach out to the creator, <b>nishgamerr</b>, through the service.</p>
    </> : <>
      <h2>1. What NishCloudPhone is</h2><p>NishCloudPhone gives you a free personal cloud phone that runs on our secure servers and streams to your browser. Each phone is yours alone while it runs, for a limited session time.</p>
      <h2>2. Your account</h2><p>You are responsible for your username and password and for everything done with your account. One person, one account — creating extra accounts to bypass limits is not allowed. Each account can run up to 5 cloud phones at a time.</p>
      <h2>3. Fair and safe use</h2><p>Free cloud phones are a shared community resource. Do not use them for anything illegal, harmful, abusive, or that disrupts the service for others. Sessions are time-limited and phones may stop when their session ends.</p>
      <h2>4. Administrators &amp; moderators</h2><p>Our administrators and moderators are trusted members of the NishCloudPhone team. To keep the free service safe for everyone, they can view all cloud phones on the service to check that free cloud phones are being used properly and to stop abuse. This oversight exists only to protect users and the service — your trust is why it works.</p>
      <h2>5. Availability</h2><p>The service is provided free, on a best-effort basis. When many people are using free cloud phones at once, you may be asked to try again later. Phones, apps and data on a phone are temporary and can be removed when a phone ends or is deleted.</p>
      <h2>6. Ending access</h2><p>Accounts or phones that break these terms may be stopped or removed by the team at any time. You can delete your own account whenever you like from your dashboard.</p>
      <p className="muted">Questions about these terms? Reach out to the creator, <b>nishgamerr</b>, through the service.</p>
    </>}
    <p><a className="btnLink" href="/login">← Back to login</a> · <a href={privacy ? "/terms" : "/privacy"}>{privacy ? "Terms of Service" : "Privacy Policy"}</a></p>
  </main>);
}
