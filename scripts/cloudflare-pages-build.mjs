import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Pages requires a build output directory even though the catch-all Pages
// Function forwards the application routes to the configured origin.
const out = resolve("cloudflare-pages-dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>NishCloudPhone</title></head>
<body><main>Cloud phone service is temporarily unavailable. Please reload.</main></body></html>\n`);
