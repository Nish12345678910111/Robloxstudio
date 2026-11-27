import LegalRoute from "../../cloudflare-pages/src/shared/LegalRoute.jsx";

export const metadata = { robots: { index: false, follow: false, nocache: true } };

export default function TermsPage() {
  return <LegalRoute />;
}
