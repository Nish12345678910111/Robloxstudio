import "../cloudflare-pages/src/shared/globals.css";

export const metadata = {
  title: { default: "Nish Productions", template: "%s | Nish Productions" },
  description: "Explore Nish Productions: web tools, experiments, and projects made by nishgamerr.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
