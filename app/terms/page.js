import Link from "next/link";
export const metadata = { title: "Terms of Service · NishCloudPhone" };
export default function Terms() {
  return (<main className="wrap legal">
    <div className="logo">☁️📱</div><h1>Terms of Service</h1>
    <p className="muted">Last updated: November 2026 · NishCloudPhone — created by <b>nishgamerr</b></p>
    <h2>1. What NishCloudPhone is</h2>
    <p>NishCloudPhone gives you a free personal cloud phone that runs on our secure servers and streams to your browser. Each phone is yours alone while it runs, for a limited session time.</p>
    <h2>2. Your account</h2>
    <p>You are responsible for your username and password and for everything done with your account. One person, one account — creating extra accounts to bypass limits is not allowed. Each account can run up to 5 cloud phones at a time.</p>
    <h2>3. Fair and safe use</h2>
    <p>Free cloud phones are a shared community resource. Do not use them for anything illegal, harmful, abusive, or that disrupts the service for others. Sessions are time-limited and phones may stop when their session ends.</p>
    <h2>4. Administrators &amp; moderators</h2>
    <p>Our administrators and moderators are trusted members of the NishCloudPhone team. To keep the free service safe for everyone, they can view all cloud phones on the service to check that free cloud phones are being used properly and to stop abuse. This oversight exists only to protect users and the service — your trust is why it works.</p>
    <h2>5. Availability</h2>
    <p>The service is provided free, on a best-effort basis. When many people are using free cloud phones at once, you may be asked to try again later. Phones, apps and data on a phone are temporary and can be removed when a phone ends or is deleted.</p>
    <h2>6. Ending access</h2>
    <p>Accounts or phones that break these terms may be stopped or removed by the team at any time. You can delete your own account whenever you like from your dashboard.</p>
    <p className="muted">Questions about these terms? Reach out to the creator, <b>nishgamerr</b>, through the service.</p>
    <p><Link className="btnLink" href="/login">← Back to login</Link> · <Link href="/privacy">Privacy Policy</Link></p>
  </main>);
}
