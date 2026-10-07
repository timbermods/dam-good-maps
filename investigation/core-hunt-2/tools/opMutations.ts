// A kept force's operation, mutated field by field and applied straight to the core (MapSession.apply):
// each must be refused with one plain line, or applied and replayed exactly; never a throw, never a
// change to the log when refused, never a project that won't reopen (D342).
// Usage: npx tsx investigation/core-hunt-2/tools/opMutations.ts
import { decodeProject } from "../../../src/core/doc/document";
import { MapSession } from "../../../src/core/doc/session";
import type { EditOp } from "../../../src/core/doc/ops";
import { makeSpec } from "../../../src/core/spec/mapspec";
import { runGenerate } from "../../../src/worker/api";
import * as ed from "../../../src/worker/session";
import { RIFT_DEFAULTS } from "../../../src/core/forces/rift";
import { DEPOSIT_DEFAULTS } from "../../../src/core/forces/deposit";
import { CRATER_DEFAULTS } from "../../../src/core/forces/craterize";
import { DEFAULTS as CARVE } from "../../../src/core/forces/carve/run";
await runGenerate(makeSpec({ seed: 1, theme: "highlands", size: { x: 64, y: 64 } }));
ed.refine();
const keep = (req: ed.ForceRequest) => {
  const s = ed.forceStart(req);
  for (let k = 0; k < 9999; k++) { const f = ed.forceAdvance(50); if (!f || f.done) break; }
  ed.forceStop(s.gesture);
  const doc = decodeProject(ed.project().bytes);
  ed.undo();
  return doc.edits.at(-1)! as unknown as { op: "forceResult"; params: Record<string, any> };
};
const ops = [
  keep({ verb: "rift", settings: { ...RIFT_DEFAULTS, power: 60 }, path: [{ x: 20, y: 30 }, { x: 44, y: 34 }], cut: null, natural: true }),
  keep({ verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power: 60 }, path: [{ x: 30, y: 20 }, { x: 34, y: 40 }], cut: null, natural: true }),
  keep({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 40, size: null, walls: null, centre: null, debris: null, rays: null } as never, origin: [32, 32], cut: null, natural: true }),
  keep({ verb: "carve", settings: { ...CARVE, mode: "unleash", power: 50, width: null, wander: null, walls: null, depth: null, riverDepth: 2, banks: null, dry: false, seed: 4 } as never, origin: [32, 32], cut: null, natural: true }),
];
const base = () => MapSession.open(decodeProject(ed.project().bytes));
const muts: [string, (p: any) => void][] = [
  ["tiles off the map", (p) => (p.tiles[0] = 64 * 64 + 5)],
  ["a negative tile", (p) => (p.tiles[0] = -1)],
  ["a fractional tile", (p) => (p.tiles[0] = p.tiles[0] + 0.5)],
  ["heights past the ceiling", (p) => (p.heights[0] = 40)],
  ["a NaN height", (p) => (p.heights[0] = NaN)],
  ["heights shorter than tiles", (p) => p.heights.pop()],
  ["a tile twice", (p) => { p.tiles.push(p.tiles[0]); p.heights.push(p.heights[0]); }],
  ["tiles out of order", (p) => p.tiles.reverse()],
  ["no tiles", (p) => { p.tiles = []; p.heights = []; }],
  ["settings power 300", (p) => (p.settings.power = 300)],
  ["settings seed -1", (p) => (p.settings.seed = -1)],
  ["unknown verb", (p) => (p.verb = "meteor")],
  ["no settings", (p) => delete p.settings],
  ["a removed id that isn't there", (p) => (p.removed = [...(p.removed ?? []), "00000000-0000-4000-8000-000000000000"])],
  ["a moved object off the map", (p) => (p.moved = [{ id: "00000000-0000-4000-8000-000000000001", x: 900, y: 3 }])],
  ["rock bits on a tile it doesn't change", (p) => (p.rock = { tiles: [5], bits: [255] })],
  ["a source off the map", (p) => (p.sources = [{ id: "00000000-0000-4000-8000-000000000002", x: -3, y: 4, strength: 1 }])],
  ["a source strength NaN", (p) => (p.sources = [{ id: "00000000-0000-4000-8000-000000000003", x: 3, y: 4, strength: NaN }])],
  ["replaces a seq that isn't there", (p) => (p.replaces = 999)],
  ["steps -4", (p) => (p.steps = -4)],
  ["where.path NaN", (p) => (p.where = { ...(p.where ?? {}), path: [[NaN, 2], [3, 4]] })],
  ["lake with mismatched lengths", (p) => (p.lake = { tiles: [100, 101], floor: [3], depth: [1, 1], contamination: [0, 0] })],
];
let bad = 0;
for (const o of ops) for (const [name, m] of muts) {
  const s = base();
  const n0 = s.editCount;
  const p = structuredClone(o.params);
  try { m(p); } catch { continue; }
  let line: string;
  try {
    const r = s.apply({ op: "forceResult", params: p } as EditOp);
    if (!r.ok) {
      line = `refused: ${r.errors.join(" | ")}`;
      if (s.editCount !== n0) { line += "  !! LOG CHANGED"; bad++; }
      if (r.errors.length !== 1 || /\n/.test(r.errors[0])) { line += "  !! NOT ONE LINE"; bad++; }
    } else {
      // applied: it must save and reopen to the same map
      const again = MapSession.open(decodeProject(s.project()));
      line = `applied; reopens ${again.checkReplay() ? "the same" : "!! DIFFERENTLY"}`;
      if (line.includes("!!")) bad++;
    }
  } catch (e) {
    line = `!! THREW ${(e as Error).message.slice(0, 140)}`;
    bad++;
  }
  console.log(`${String(o.params.verb).padEnd(9)} ${name.padEnd(38)} ${line.slice(0, 220)}`);
}
console.log(`${bad} problems`);
process.exit(0);
