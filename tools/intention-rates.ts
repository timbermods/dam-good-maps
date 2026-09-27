// How often each intention emerges when a map is steered toward it (D138's second principle: one that
// almost never emerges leaves the set; M9b, D274). Each intention is forced on the same seeds and
// checked on the finished map.
//
//   npx tsx tools/intention-rates.ts [--ids oxbow,stepped-lakes] [--theme any] [--seeds 1-6] [--size 128] [--jobs 3]

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n: string, f: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};

async function main(): Promise<void> {
  const { ACTIVE } = await import("../src/core/land/intentions");
  const ids = arg("ids", ACTIVE.join(",")).split(",");
  const themes = arg("theme", "any").split(",");
  const [a, b] = arg("seeds", "1-6").split("-").map(Number);
  const size = Number(arg("size", "128"));
  const jobs: { id: string; theme: string; seed: number }[] = [];
  for (const id of ids) for (const theme of themes) for (let seed = a; seed <= (b ?? a); seed++) jobs.push({ id, theme, seed });
  const u = (p: string) => JSON.stringify(pathToFileURL(join(ROOT, p)).href);
  const file = join(ROOT, ".scratch", `.dgm-rates-${process.pid}.mjs`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `import { parentPort } from "node:worker_threads";
import { generate } from ${u("src/core/gen/generate.ts")};
import * as mapspec from ${u("src/core/spec/mapspec.ts")};
parentPort.on("message", (j) => {
  if (!j) process.exit(0);
  const t0 = performance.now();
  try {
    const r = generate(mapspec.makeSpec({ seed: j.seed, theme: j.theme, size: { x: ${size}, y: ${size} } }), { intentions: [j.id] });
    const x = r.intentions.find((q) => q.id === j.id);
    parentPort.postMessage({ ...j, ok: !!x?.ok, note: x?.note ?? "not checked", passed: r.report.passed, ms: Math.round(performance.now() - t0) });
  } catch (e) { parentPort.postMessage({ ...j, ok: false, note: "error: " + String(e && e.message || e), passed: false, ms: 0 }); }
});`,
  );
  const n = Math.max(1, Math.min(Number(arg("jobs", String(Math.max(1, Math.min(3, cpus().length - 2))))), jobs.length));
  const out: { id: string; theme: string; seed: number; ok: boolean; note: string; passed: boolean; ms: number }[] = [];
  let next = 0;
  try {
    await new Promise<void>((ok, fail) => {
      let live = n;
      for (let w = 0; w < n; w++) {
        const worker = new Worker(file);
        const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
        worker.on("message", (m) => {
          out.push(m);
          process.stdout.write(`\r${out.length}/${jobs.length}   `);
          feed();
        });
        worker.on("error", fail);
        worker.on("exit", () => {
          if (--live === 0) ok();
        });
        feed();
      }
    });
  } finally {
    rmSync(file, { force: true });
  }
  process.stdout.write("\n");
  for (const id of ids) {
    const r = out.filter((m) => m.id === id);
    const ok = r.filter((m) => m.ok);
    console.log(`${id.padEnd(20)} ${ok.length}/${r.length}  ${r.map((m) => `${m.theme[0]}${m.seed}${m.ok ? "+" : "-"}`).join(" ")}`);
    for (const m of r.filter((q) => !q.ok).slice(0, 2)) console.log(`${"".padEnd(22)}${m.theme} ${m.seed}: ${m.note}`);
  }
}

void main();
