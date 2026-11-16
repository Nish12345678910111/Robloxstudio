// Keep the whole site out of search engines and AI crawlers.
export default function robots() {
  return { rules: [{ userAgent: "*", disallow: "/" }], sitemap: undefined };
}
