// Deposit used at random places, clicked and drawn, the editor's way: how often it is refused, and how
// often what it keeps has a lone spike (a tile raised 3 or more levels above all four neighbours).
// Usage: npx tsx investigation/core-hunt-2/tools/depositSweep.ts <theme> [side=64] [uses=120]
import { makeSpec } from "../../../src/core/spec/mapspec";
import { runGenerate } from "../../../src/worker/api";
import * as ed from "../../../src/worker/session";
import { DEPOSIT_DEFAULTS } from "../../../src/core/forces/deposit";
const theme = process.argv[2] as any;
const side = Number(process.argv[3] ?? 64);
const uses = Number(process.argv[4] ?? 120);
let refused = 0, spiky = 0, weak = 0, kept = 0;
const ex: string[] = [];
for (const seed of [1, 2, 3]) {
  try { await runGenerate(makeSpec({ seed, theme, size: { x: side, y: side } })); ed.refine(); } catch { continue; }
  let a = seed * 104729;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let k = 0; k < uses / 3; k++) {
    const x = 2 + Math.floor(r() * (side - 4)), y = 2 + Math.floor(r() * (side - 4));
    const ang = r() * 6.283, len = r() < 0.4 ? 0 : 4 + r() * 20;
    const path = [{ x, y }, { x: Math.max(0, Math.min(side - 1, Math.round(x + Math.cos(ang) * len))), y: Math.max(0, Math.min(side - 1, Math.round(y + Math.sin(ang) * len))) }];
    const power = [0, 35, 70, 100][k % 4];
    const req = { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power, seed: k }, path, cut: null, natural: true } as ed.ForceRequest;
    const before = ed.terrainNow().heights.slice();
    const s = ed.forceStart(req);
    if (!s.ok) { refused++; if (ex.length < 6) ex.push(`refused "${s.errors[0]}": seed ${seed} ${JSON.stringify(path)} power ${power}`); continue; }
    for (let j = 0; j < 999; j++) { const f = ed.forceAdvance(50); if (!f || f.done) break; }
    if (!ed.forceStop(s.gesture).kept) { refused++; continue; }
    kept++;
    const h = ed.terrainNow().heights.slice();
    ed.undo();
    let c = 0, spikes = 0;
    for (let i = 0; i < h.length; i++) {
      if (Math.abs(h[i] - before[i]) >= 1) c++;
      if (h[i] > before[i]) {
        const X = i % side, Y = (i / side) | 0;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (X + dx < 0 || Y + dy < 0 || X + dx >= side || Y + dy >= side ? 99 : h[(Y + dy) * side + X + dx]));
        if (n.every((v) => h[i] - v >= 3)) spikes++;
      }
    }
    if (c < 9) weak++;
    if (spikes) { spiky++; if (ex.length < 12) ex.push(`spike x${spikes} (${c} tiles): seed ${seed} ${JSON.stringify(path)} power ${power}`); }
  }
}
console.log(`deposit ${theme} ${side}: ${kept} kept, ${refused} refused, ${weak} under 9 tiles, ${spiky} with a lone spike`);
for (const l of ex) console.log("  " + l);
process.exit(0);
