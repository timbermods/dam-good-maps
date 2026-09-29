// npm --prefix investigation/erode run demo: serves the demo on a free local port and prints its
// address. It uses the repository's own packages (run `npm ci` at the repository root once).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
if (!existsSync(root + "node_modules/vite") || !existsSync(root + "node_modules/three")) {
  console.error("Run `npm ci` at the repository root first (the demo uses its three and vite).");
  process.exit(1);
}
process.chdir(here);
const { createServer } = await import("vite");
const server = await createServer({ configFile: here + "vite.config.ts" });
await server.listen();
console.log("Erode investigation (local only). Open in Chrome or Edge:");
server.printUrls();
