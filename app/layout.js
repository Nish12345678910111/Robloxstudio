import "../cloudflare-pages/src/shared/globals.css";

export const metadata = {
  title: "NishCloudPhone",
  description: "Free cloud phones in your browser. Created by nishgamerr.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
