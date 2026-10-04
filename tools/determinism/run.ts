// The cross-engine determinism check (PLAN §2.1, §20 D366): the same cases (cases.ts) in Chromium,
// Firefox, WebKit and Node, compared checkpoint by checkpoint. Any mismatch, error, or force record
// that depends on how fast it was planned fails.
//
//   npx tsx tools/determinism/run.ts [--smoke] [--only <text,text>] [--out <name>] [--engines chromium,firefox,webkit,node]
//
// Pull requests run --smoke (every theme, brush and force setting; one generation seed, short
// sequences); the nightly runs the full list on each CPU of the matrix, and compare.ts compares
// the hosts. Results go to .scratch/determinism/<out>/ (summary.json and one manifest an engine).
// Needs Playwright's engines: `npx playwright install chromium firefox webkit` (PW_CHANNEL=chrome
// uses the installed Chrome for Chromium instead). DGM_DET_PLAYWRIGHT=<path to a playwright-core
// folder> uses another Playwright, for engines already installed on a machine that can't download.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "vite";
import { pathToFileURL } from "node:url";
import type { Browser, BrowserType, Page } from "@playwright/test";
import { cases as caseList, runCase, type Case, type Row } from "./cases";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const smoke = process.argv.includes("--smoke");
const serial = process.argv.includes("--serial");
// --only: case ids containing any of these comma-separated texts (plain text, never a pattern)
const only = arg("only") ? arg("only")!.split(",").filter(Boolean) : null;
const outName = arg("out") ?? (smoke ? "smoke" : "full");
if (!/^[a-z0-9-]+$/.test(outName)) throw Error("--out: lowercase letters, digits and dashes");
const engineNames = (arg("engines") ?? "chromium,firefox,webkit,node").split(",");
const root = resolve(import.meta.dirname, "../..");
const pw: Record<string, BrowserType> = process.env.DGM_DET_PLAYWRIGHT
  ? await import(pathToFileURL(join(process.env.DGM_DET_PLAYWRIGHT, "index.mjs")).href)
  : await import("@playwright/test");
const dir = arg("out-dir") ? resolve(arg("out-dir")!) : join(root, ".scratch/determinism", outName);
mkdirSync(dir, { recursive: true });

// the page: the cases bundled as the site bundles its core
await build({
  configFile: false,
  logLevel: "warn",
  root,
  build: {
    outDir: join(dir, "page"),
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    lib: { entry: join(root, "tools/determinism/page.ts"), formats: ["es"], fileName: () => "bundle.js" },
  },
});
const bundle = readFileSync(join(dir, "page/bundle.js"));
const server = http.createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.end(bundle);
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><meta charset="utf-8"><script type="module" src="/bundle.js"></script>');
  }
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function runEngines<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  if (!serial) return Promise.all(tasks.map(task => task()));
  const out: T[] = []; for (const task of tasks) out.push(await task()); return out;
}

interface Engine {
  version: string;
  userAgent: string;
  run: (c: Case) => Promise<Row[]>;
  rows: Row[];
  errors: { case: string; message: string }[];
}
const browsers: Browser[] = [];
const engines: Record<string, Engine> = {};
let failed = false;
try {
  for (const name of engineNames) {
    if (name === "node") {
      engines.node = { version: process.version, userAgent: `Node ${process.version}`, run: (c) => runCase(c), rows: [], errors: [] };
      continue;
    }
    const type = ["chromium", "firefox", "webkit"].includes(name) ? pw[name] : undefined;
    if (!type) throw Error(`unknown engine ${name}`);
    const channel = name === "chromium" ? process.env.PW_CHANNEL : undefined;
    const b = await type.launch({ headless: true, ...(channel ? { channel } : {}) });
    browsers.push(b);
    const p: Page = await b.newPage();
    p.setDefaultTimeout(1_800_000);
    p.on("pageerror", (e) => console.error(name, e));
    p.on("console", (m) => {
      if (m.text().startsWith("DETERMINISM_PROGRESS ")) console.log(`${name} ${m.text().slice(21)}`);
    });
    await p.goto(url);
    await p.waitForFunction(() => (window as unknown as { determinism?: unknown }).determinism);
    const run = (c: Case) => p.evaluate((c) => (window as unknown as { determinism: { runCase(c: Case): Promise<Row[]> } }).determinism.runCase(c), c);
    engines[name] = { version: b.version(), userAgent: await p.evaluate(() => navigator.userAgent), run, rows: [], errors: [] };
  }
  let list = caseList(smoke);
  if (only) list = list.filter((c) => only.some((t) => c.id.includes(t)));
  const mismatches: { case: string; label: string; engines: string[]; components: string[] }[] = [];
  const t0 = performance.now();
  const slowest: { case: string; seconds: number }[] = [];
  for (const [index, c] of list.entries()) {
    const tc = performance.now();
    const responses = await runEngines(
      Object.entries(engines).map(([name, e]) => async () => {
        try {
          const rows = await e.run(c);
          e.rows.push(...rows);
          if (rows.some((row) => row.schedule && !row.schedule.recordEqual)) e.errors.push({ case: c.id, message: "how fast it was planned changes the force's record" });
          return { name, rows };
        } catch (err) {
          const error = { case: c.id, message: String(err) };
          e.errors.push(error);
          return { name, rows: null, error };
        }
      }),
    );
    slowest.push({ case: c.id, seconds: Math.round((performance.now() - tc) / 100) / 10 });
    const reference = responses[0];
    for (const other of responses.slice(1)) {
      if (!other.rows || !reference.rows) continue;
      if (other.rows.length !== reference.rows.length) {
        mismatches.push({ case: c.id, label: "(checkpoint count)", engines: [reference.name, other.name], components: [] });
        continue;
      }
      for (let k = 0; k < reference.rows.length; k++) {
        const a = reference.rows[k];
        const b = other.rows[k];
        if (a.hash !== b.hash) mismatches.push({ case: c.id, label: a.label, engines: [reference.name, other.name], components: Object.keys(a.components).filter((key) => a.components[key] !== b.components[key]) });
      }
    }
    const bad = responses.some((r) => !r.rows) || mismatches.some((m) => m.case === c.id);
    if (index % 20 === 0 || bad)
      console.log(`${index + 1}/${list.length} ${c.id}: ${responses.map((r) => (r.rows ? `${r.name} ${r.rows.length}` : `${r.name} ERROR ${r.error?.message}`)).join(", ")}; mismatches ${mismatches.length}`);
  }
  const seconds = Math.round((performance.now() - t0) / 1000);
  const summary = {
    schema: 1,
    smoke,
    only: only?.join(",") ?? null,
    base: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    platform: { os: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model ?? "", node: process.version },
    cases: list.length,
    seconds,
    slowest: slowest.sort((a, b) => b.seconds - a.seconds).slice(0, 20),
    engines: Object.fromEntries(Object.entries(engines).map(([n, e]) => [n, { version: e.version, userAgent: e.userAgent, checkpoints: e.rows.length, errors: e.errors }])),
    mismatches,
  };
  for (const [name, e] of Object.entries(engines)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(e.rows));
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 1));
  const errors = Object.values(engines).flatMap((e) => e.errors);
  for (const m of mismatches.slice(0, 40)) console.error(`MISMATCH ${m.case} ${m.label} (${m.engines.join(" vs ")}): ${m.components.join(", ")}`);
  for (const e of errors.slice(0, 40)) console.error(`ERROR ${e.case}: ${e.message}`);
  console.log(`${list.length} cases, ${Object.entries(engines).map(([n, e]) => `${n} ${e.version}: ${e.rows.length} checkpoints`).join("; ")}; ${mismatches.length} mismatches, ${errors.length} errors, ${seconds} s`);
  failed = mismatches.length > 0 || errors.length > 0;
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  server.close();
}
process.exitCode = failed ? 1 : 0;
