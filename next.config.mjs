/** Security headers for every response. The phone iframe (Cloudflare tunnel) is
 *  embedded by OUR page, so frame-ancestors only restricts who can embed US. */
const headers = [{ key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }];
export default { async headers() { return [{ source: "/:path*", headers }]; } };
