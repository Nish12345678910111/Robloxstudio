import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(root, "..");

export default defineConfig({
  root,
  plugins: [react()],
  publicDir: path.join(root, "public"),
  server: { host: "0.0.0.0", fs: { allow: [repoRoot] } },
  build: {
    outDir: path.join(repoRoot, "cloudflare-pages-dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
