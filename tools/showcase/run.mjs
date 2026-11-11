// Runs a showcase script fast: the core is bundled once (.scratch/showcase/core.mjs; `--core` rebuilds it), the
// script itself each time (it imports "./core", which is left out of its bundle and pointed at the built one).
//   node tools/showcase/run.mjs four-lakes [--core] [args for the script…]
// The scripts also run as they are: npx tsx tools/showcase/four-lakes.ts
import { build } from "esbuild";
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(root, ".scratch/showcase");
mkdirSync(out, { recursive: true });
const [name, ...rest] = process.argv.slice(2);
const args = rest.filter((a) => a !== "--core");
const core = resolve(out, "core.mjs");
const common = { bundle: true, platform: "node", format: "esm", logLevel: "warning", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } };
if (rest.includes("--core") || !existsSync(core)) {
  const t = Date.now();
  await build({ ...common, entryPoints: [resolve(here, "core.ts")], outfile: core });
  console.error(`core bundled in ${Date.now() - t} ms`);
}
const outfile = resolve(out, `${name}.mjs`);
await build({
  ...common,
  entryPoints: [resolve(here, `${name}.ts`)],
  outfile,
  plugins: [{ name: "core", setup(b) { b.onResolve({ filter: /^\.\/core$/ }, () => ({ path: pathToFileURL(core).href, external: true })); } }],
});
const r = spawnSync(process.execPath, ["--max-old-space-size=8192", outfile, ...args], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
