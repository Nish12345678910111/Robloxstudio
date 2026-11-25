# ☁️📱 NishCloudPhone

Free cloud phones that run in your browser — no downloads, no installs.
Just create an account, tap **＋ New Cloud Phone**, and your phone appears on screen.

* 📱 A real phone screen you can tap, type and swipe
* 🔒 Private by default — only you can see your phones
* 👑 Trusted admins & moderators keep the free service safe for everyone
* 📜 [Terms of Service](/terms) · [Privacy Policy](/privacy)

**Created by nishgamerr**

## Deploy to Cloudflare Pages (Cloudflare UI, Vercel API, Aiven Postgres)

1. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** and select this repository. Use the repository root as the project root and `main` as the production branch.
2. Set the build configuration:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `cloudflare-pages-dist`
   - Build environment variable: `NODE_VERSION=22.12.0` (the repo also has `.nvmrc`)
3. Keep the root `wrangler.jsonc` configuration file. It sets the Pages output directory and `nodejs_compat`; the `functions/` directory is detected automatically. Leave Placement off unless you have a separate reason to change it. **Do not add a Hyperdrive or D1 binding.** On the production `main` branch, Pages serves the UI and proxies `/api/*` requests over HTTPS to the production Vercel API, which connects to Aiven. This avoids the failing Cloudflare PostgreSQL TCP socket path. The HilltopAds loader remains only in the Cloudflare UI; Vercel serves API requests, not the Cloudflare pages or ad loader.

   Set `DATABASE_CONNECTION_KEY` as an encrypted **Production secret** in Cloudflare Pages and as a **sensitive Production environment variable** in Vercel. Use the exact same high-entropy value in both. Generate one locally with `openssl rand -hex 32`; do not commit it, expose it to browser code, place it in a URL/body, or paste it into chat. The Pages middleware sends it only in a server-to-server HTTPS header, and Vercel compares it before dispatching proxied API calls. If either value is missing or mismatched, the proxy fails closed.
4. Configure Vercel with Production secrets in **Settings → Variables and Secrets**:
   - `DATABASE_CONNECTION_KEY` — the same random value configured as the Cloudflare Pages Production secret; store it as sensitive.
   - `AIVEN_DATABASE_URL` — the Aiven PostgreSQL connection URI, e.g. `postgres://USER:PASSWORD@HOST:PORT/defaultdb?sslmode=require`.
   - `SESSION_SECRET` — a long random secret (for example, generate one with `openssl rand -hex 32`).
   - `ADMIN_PASSWORD` — the password used to seed the `admin` account on first startup.
   - `GITHUB_TOKEN` — a repository-scoped GitHub fine-grained token for this repo with **Actions: Read and write** permission. It is used to dispatch, list, cancel, and delete cloud-phone workflow runs.

   **Optional plain-text runtime variables** (the code has defaults, but setting them explicitly is fine):
   - `GITHUB_OWNER=Nish12345678910111`
   - `GITHUB_REPO=Robloxstudio`
   - `GITHUB_WORKFLOW=cloud-phone.yml`
   - `GITHUB_API_BASE=https://api.github.com`

   Optional fallback token secrets are `GITHUB_TOKEN_FALLBACK_1`, `GITHUB_TOKEN_FALLBACK_2`, and `GITHUB_TOKEN_FALLBACK_3`. Add them only if you have additional repository-scoped tokens.
5. In the GitHub repository, add the same `AIVEN_DATABASE_URL` as a repository **Actions secret** under **Settings → Secrets and variables → Actions**. The phone workflow needs it to save the viewer URL and password to the owner's database row.
6. Deploy the project. Cloudflare Pages previews on non-`main` branches continue to use the Pages Functions directly; set preview secrets only if previews should access the real database or dispatch real GitHub Actions workflows.

For local Pages development, `npm run dev` applies the compatibility date and `nodejs_compat` flag on the Wrangler CLI; non-production development uses the local Pages handlers. Never commit real credentials. Do not add the HilltopAds loader to Vercel.

## Optional Vercel deployment

Vercel uses `vercel.json` and `npm run vercel:build`. It hosts the shared API handlers and connects directly to the same Aiven database with `AIVEN_DATABASE_URL`; Cloudflare Pages continues to serve its own Vite-built UI. This keeps owner matching, login behavior, and the official noVNC viewer consistent while leaving ads Cloudflare-only.

Phone starts still need a GitHub-hosted runner to boot and initialize Android. The SDK cache reduces repeat startup work after its first successful preparation, but a cold runner cannot start literally instantly.
