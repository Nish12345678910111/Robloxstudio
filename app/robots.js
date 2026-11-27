export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/home"],
      disallow: ["/api", "/cloudphone", "/login", "/terms", "/privacy"],
    },
  };
}
