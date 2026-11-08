// Build the Dam Good Maps MCP server for players (D141, D501; mcp/README.md): one bundled file, so nobody needs the
// repository or its dependencies, packed two ways:
//   mcp/dist/dam-good-maps.mcpb      the Claude Desktop extension (a zip: manifest.json, server/index.mjs, LICENSE)
//   mcp/dist/dam-good-maps-mcp.tgz   the npm package `npx` runs (bin: dam-good-maps-mcp)
//
//   npm run mcp:build
//
// Both go on a GitHub release under these names, so the README's "latest" links stay right.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { SERVER_VERSION, TOOLS } from "../mcp/src/server";

const OUT = join("mcp", "dist");
const SERVER = join(OUT, "server", "index.mjs");

rmSync(OUT, { recursive: true, force: true });
await build({
  entryPoints: ["mcp/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: SERVER,
  minify: true,
  legalComments: "eof",
  // (the CommonJS inside the SDK's dependencies asks for `require`)
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __dgmRequire } from 'node:module'; const require = __dgmRequire(import.meta.url);" },
  logLevel: "warning",
});

const firstSentence = (s: string) => s.slice(0, s.indexOf(". ") + 1 || s.length);
const manifest = JSON.parse(readFileSync(join("mcp", "manifest.json"), "utf8"));
manifest.version = SERVER_VERSION;
manifest.tools = TOOLS.map((t) => ({ name: t.name, description: firstSentence(t.description ?? "") }));
const server = new Uint8Array(readFileSync(SERVER));
const license = new Uint8Array(readFileSync("LICENSE"));

// the Claude Desktop extension
const mcpb = join(OUT, "dam-good-maps.mcpb");
writeFileSync(mcpb, zipSync({ "manifest.json": new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`), "server/index.mjs": server, LICENSE: license }, { level: 9 }));

// the npm package
const pkgDir = join(OUT, "npm");
mkdirSync(join(pkgDir, "server"), { recursive: true });
copyFileSync(SERVER, join(pkgDir, "server", "index.mjs"));
copyFileSync("LICENSE", join(pkgDir, "LICENSE"));
copyFileSync(join("mcp", "README.md"), join(pkgDir, "README.md"));
writeFileSync(
  join(pkgDir, "package.json"),
  `${JSON.stringify(
    {
      name: "dam-good-maps-mcp",
      version: SERVER_VERSION,
      description: manifest.description,
      license: "AGPL-3.0-or-later",
      type: "module",
      bin: { "dam-good-maps-mcp": "server/index.mjs" },
      files: ["server", "README.md", "LICENSE"],
      engines: { node: ">=20" },
      repository: { type: "git", url: "https://github.com/timbermods/dam-good-maps" },
    },
    null,
    2,
  )}\n`,
);
const pack = spawnSync("npm", ["pack", "--silent"], { cwd: pkgDir, encoding: "utf8", shell: process.platform === "win32" });
if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr}`);
const tgz = join(OUT, "dam-good-maps-mcp.tgz");
renameSync(join(pkgDir, pack.stdout.trim().split(/\r?\n/).at(-1)!), tgz);

const kb = (p: string) => `${Math.round(statSync(p).size / 1024)} KB`;
console.log(`server ${kb(SERVER)}; ${mcpb} ${kb(mcpb)}; ${tgz} ${kb(tgz)}`);
