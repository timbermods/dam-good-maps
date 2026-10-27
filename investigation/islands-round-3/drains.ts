// How often a planned sea drains (water under a fifth of the map on the planned land), over the first
// three lands of seeds a–b: a quick reading for a change to the sea's shape (needs the temporary line in
// REPORT.md, "Regenerating"). `DGM_WHY=1 npx tsx investigation/islands-round-3/drains.ts <size> <a> <b>`
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const [size, a, b] = process.argv.slice(2, 5).map(Number);
let lands = 0, drained = 0;
const ws: number[] = [];
const why: Record<string, number> = {};
const log = console.log;
// (the promise's parts on each planned land, read from the temporary log's "plan" line)
console.log = (...a: unknown[]) => {
  const m = typeof a[0] === "string" && a[0].trim() === "plan" ? JSON.parse(String(a[2])) : null;
  if (!m) return log(...a);
  if (m.water < 0.2) return;
  const k = [m.islands < 3 ? "islands" : "", m.apart < 0.05 ? "apart" : "", m.mainBody < 0.25 ? "sea" : ""].filter(Boolean).join("+") || "kept";
  why[k] = (why[k] ?? 0) + 1;
};
for (let seed = a; seed <= b; seed++)
  generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }), { maxAttempts: 3, onAttempt: () => {
    const p = (globalThis as any).__plan; (globalThis as any).__plan = null; if (!p) return;
    const w = Array.from(p.water as Float64Array).filter((v) => v > 0.05).length / p.water.length;
    lands++; ws.push(w); if (w < 0.2) drained++;
  } } as any);
ws.sort((p, q) => p - q);
log(JSON.stringify({ lands, drained, median: ws[Math.floor(ws.length / 2)], why }));
