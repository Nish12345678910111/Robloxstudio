# ☁️📱 NishCloudPhone

Free cloud phones that run in your browser — no downloads, no installs.
Just create an account, tap **＋ New Cloud Phone**, and your phone appears on screen.

* 📱 A real phone screen you can tap, type and swipe
* 🔒 Private by default — only you can see your phones
* 👑 Trusted admins & moderators keep the free service safe for everyone
* 📜 [Terms of Service](/terms) · [Privacy Policy](/privacy)

**Created by nishgamerr**

## Deploy to Cloudflare Pages (direct Aiven Postgres; no Hyperdrive)

1. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** and select this repository. Use the repository root as the project root and `main` as the production branch.
2. Set the build configuration:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `cloudflare-pages-dist`
   - Build environment variable: `NODE_VERSION=22.12.0` (the repo also has `.nvmrc`)
3. In **Settings → Runtime**, set the compatibility date to `2026-11-07` (or a newer date you have tested) and enable the `nodejs_compat` compatibility flag. Leave Placement off unless you have a separate reason to change it. The `functions/` directory is detected automatically. **Do not add a Hyperdrive, D1, or other database binding.** The app connects directly to Aiven with `AIVEN_DATABASE_URL`.
4. This repository intentionally has **no root Wrangler configuration file**. Cloudflare's dashboard notice means a Wrangler config would make regular runtime variables/configuration source-controlled and prevent adding plain-text variables in the dashboard. Keep runtime variables and secrets in **Settings → Variables and Secrets** instead. Add these as **Production secrets** (encrypted values):

   - `AIVEN_DATABASE_URL` — the Aiven PostgreSQL connection URI, e.g. `postgres://USER:PASSWORD@HOST:PORT/defaultdb?sslmode=require`. Keep Aiven public access/TLS enabled as required by your Aiven service.
   - `SESSION_SECRET` — a long random secret (for example, generate one with `openssl rand -hex 32`).
   - `ADMIN_PASSWORD` — the password used to seed the `admin` account on first startup.
   - `GITHUB_TOKEN` — a repository-scoped GitHub fine-grained token for this repo with **Actions: Read and write** permission. It is used to dispatch, list, cancel, and delete cloud-phone workflow runs.

   **Optional plain-text runtime variables** (the code has these defaults, but setting them explicitly is fine):
   - `GITHUB_OWNER=Nish12345678910111`
   - `GITHUB_REPO=Robloxstudio`
   - `GITHUB_WORKFLOW=cloud-phone.yml`
   - `GITHUB_API_BASE=https://api.github.com`

   Optional fallback token secrets are `GITHUB_TOKEN_FALLBACK_1`, `GITHUB_TOKEN_FALLBACK_2`, and `GITHUB_TOKEN_FALLBACK_3`. Add them only if you have additional repository-scoped tokens.

5. In the GitHub repository, add the same `AIVEN_DATABASE_URL` as a repository **Actions secret** under **Settings → Secrets and variables → Actions**. The phone workflow needs it to save the viewer URL and password to the owner's database row. The Pages `GITHUB_TOKEN` is separate; it does not need to be copied into the workflow secrets.
6. Deploy the project. If you use Preview deployments, configure their secrets separately only if you intend previews to access the real database or start real GitHub Actions phone workflows.

For local Pages development, `npm run dev` applies the same compatibility date and `nodejs_compat` flag on the Wrangler CLI. Never commit real credentials. This setup uses a direct PostgreSQL connection and has no Hyperdrive configuration. Live Aiven connectivity should be verified after deployment with a real phone lifecycle test.

## Optional Vercel deployment

The repository also includes a thin Next.js adapter for the same shared UI and API handlers. Vercel uses `vercel.json` and `npm run vercel:build`; Cloudflare Pages continues to use the Vite build above. Configure Vercel with the same direct `AIVEN_DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, and GitHub token secrets as appropriate. Do not add Hyperdrive or point Vercel at a different database. This keeps owner matching, login behavior, and the official noVNC viewer consistent between providers.

Phone starts still need a GitHub-hosted runner to boot and initialize Android. The SDK cache reduces repeat startup work after its first successful preparation, but a cold runner cannot start literally instantly.
