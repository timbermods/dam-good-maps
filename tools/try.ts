// Try the site as it is on this branch, on this machine: build it and serve it locally (the
// production build, so it runs as fast as the live site). Prints the address; Ctrl+C stops it. It
// shows what the preview shows, the forces too (src/editor/release.ts); --public builds it as the
// public site is built.
//
// Usage: npm run try [-- --port 4400] [-- --public]

import { createServer } from "node:net";
import { build, preview } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** The first free port from `from` up. */
async function freePort(from: number): Promise<number> {
  for (let p = from; p < from + 50; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(false));
      s.listen(p, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (ok) return p;
  }
  throw new Error(`no free port from ${from}`);
}

process.env.DGM_BASE = "/dam-good-maps/";
const OUT = ".scratch/try-dist";
console.log("building the site…");
const mode = process.argv.includes("--public") ? "production" : "try";
await build({ configFile: "vite.config.ts", mode, logLevel: "warn", build: { outDir: OUT, emptyOutDir: true } });
const port = await freePort(Number(arg("port") ?? 4400));
const server = await preview({ configFile: "vite.config.ts", build: { outDir: OUT }, preview: { port, strictPort: true, open: "/dam-good-maps/" }, logLevel: "warn" });
console.log(`\nDam Good Maps is at http://localhost:${port}/dam-good-maps/ (Ctrl+C stops it)`);
process.on("SIGINT", () => void server.close().then(() => process.exit(0)));
