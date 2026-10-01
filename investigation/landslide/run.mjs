import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const entry = process.argv[2];
if (!/^[a-z-]+\.ts$/.test(entry ?? "")) throw Error("Supply a local TypeScript entry");
mkdirSync("local", { recursive: true });
const out = resolve("local", entry.replace(".ts", ".mjs"));
await build({ absWorkingDir: process.cwd(), entryPoints: [resolve(entry)], outfile: out, bundle: true, platform: "node", format: "esm",
  nodePaths: [resolve("node_modules")], external: ["@playwright/test", "gifenc", "pngjs"],
  define: { "import.meta.dirname": JSON.stringify(process.cwd()) } });
await import(pathToFileURL(out).href);
