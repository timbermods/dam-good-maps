// Carve's Maturity (D355, #278) used the editor's way at random places: Mature and Auto, clicked and drawn,
// some inside a working area. Each kept carve: its last frame is the land kept (D368 (9)), it changes the
// land visibly (D356), it adds no object but its own river's sources (D368 (10)), Try another keeps its
// Maturity, and the project saved then reopens to the same map.
// Usage: npx tsx investigation/core-hunt-2/tools/maturity.ts <theme> [side=64] [uses=40]
import { decodeProject } from "../../../src/core/doc/document";
import { MapSession } from "../../../src/core/doc/session";
import { makeSpec } from "../../../src/core/spec/mapspec";
import { runGenerate } from "../../../src/worker/api";
import * as ed from "../../../src/worker/session";
import { DEFAULTS as CARVE } from "../../../src/core/forces/carve/run";
const theme = process.argv[2] as any;
const side = Number(process.argv[3] ?? 64);
const uses = Number(process.argv[4] ?? 40);
const tally: Record<string, number> = {};
const ex: string[] = [];
const note = (k: string, detail: string) => { tally[k] = (tally[k] ?? 0) + 1; if (ex.filter((e) => e.startsWith(k)).length < 2) ex.push(`${k}: ${detail}`); };
for (const seed of [1, 2]) {
  try { await runGenerate(makeSpec({ seed, theme, size: { x: side, y: side } })); ed.refine(); } catch { continue; }
  ed.settleWater();
  let a = seed * 7121;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let k = 0; k < uses / 2; k++) {
    const x = 3 + Math.floor(r() * (side - 6)), y = 3 + Math.floor(r() * (side - 6));
    const drag = r() < 0.5;
    const ang = r() * 6.283, len = 8 + r() * 30;
    const ex2 = Math.max(0, Math.min(side - 1, Math.round(x + Math.cos(ang) * len))), ey = Math.max(0, Math.min(side - 1, Math.round(y + Math.sin(ang) * len)));
    const maturity = r() < 0.6 ? "mature" : "auto";
    const power = [0, 40, 80, 100][k % 4];
    const area = r() < 0.25 ? Array.from({ length: 24 }, (_, j) => [Math.min(side - 1, Math.max(0, y - 12 + j)), Math.max(0, x - 12), Math.min(side - 1, x + 12)] as [number, number, number]) : undefined;
    const req = { verb: "carve", settings: { ...CARVE, mode: drag ? "aim" : "unleash", power, width: null, wander: null, walls: null, depth: null, riverDepth: 2, banks: null, dry: r() < 0.3, maturity, seed: k }, origin: [x, y], ...(drag ? { end: [ex2, ey], via: [] } : {}), cut: null, natural: true, ...(area ? { area } : {}) } as unknown as ed.ForceRequest;
    const where = `seed ${seed} ${JSON.stringify([x, y])}${drag ? "→" + JSON.stringify([ex2, ey]) : ""} power ${power} ${maturity}${area ? " area" : ""}`;
    const before = ed.terrainNow().heights.slice();
    const ids = new Set(MapSession.open(decodeProject(ed.project().bytes)).built.entities.map((e) => e.id));
    const s = ed.forceStart(req);
    if (!s.ok) { note(`refused "${s.errors[0]}"`, where); continue; }
    let shown = s.frame?.heights ?? before;
    for (let j = 0; j < 100000; j++) { const f = ed.forceAdvance(5); if (!f) break; if (f.heights) shown = f.heights; if (f.done) break; }
    const st = ed.forceStop(s.gesture);
    if (!st.kept) { note(`not kept "${st.errors[0]}"`, where); continue; }
    const kept = ed.terrainNow().heights.slice();
    let pop = 0, c = 0;
    for (let i = 0; i < kept.length; i++) { if (kept[i] !== shown[i]) pop++; if (Math.abs(kept[i] - before[i]) >= 1) c++; }
    // (the start carried to its bench is the only change after the last frame allowed)
    if (pop > 30) note("pops", `${pop} tiles, ${where}`);
    if (c < 9 && !area) note("invisible", `${c} tiles, ${where}`);
    ed.settleWater();
    const doc = decodeProject(ed.project().bytes);
    const again = MapSession.open(doc);
    if (!again.checkReplay()) note("replay differs", where);
    const force = doc.edits.find((o) => o.op === "forceResult" && o.seq === Math.max(...doc.edits.filter((e) => e.op === "forceResult").map((e) => e.seq))) as any;
    if (!force) note("no forceResult kept", where);
    else {
      const own = new Set([...(force.params.source ? [force.params.source.id] : []), ...(force.params.sources ?? []).map((q: any) => q.id)]);
      const added = again.built.entities.filter((e) => !ids.has(e.id) && !own.has(e.id) && e.owner !== "pinned:slopes");
      if (added.length) note("adds objects", `${added.map((e) => e.template).join(",")} ${where}`);
      if (maturity === "mature" && force.params.settings.maturity !== "mature") note("maturity not kept in the record", `${force.params.settings.maturity} ${where}`);
      if (maturity === "auto" && !["young", "mature"].includes(force.params.settings.maturity)) note("auto not resolved in the record", `${force.params.settings.maturity} ${where}`);
      // Try another keeps the row's Maturity
      if (k % 3 === 0) {
        const t = ed.forceAgain();
        if (t.ok) {
          for (let j = 0; j < 100000; j++) { const f = ed.forceAdvance(50); if (!f || f.done) break; }
          if (ed.forceStop(t.gesture).kept) {
            const d2 = decodeProject(ed.project().bytes);
            const f2 = d2.edits.filter((o) => o.op === "forceResult").at(-1) as any;
            if (maturity === "mature" && f2.params.settings.maturity !== "mature") note("Try another lost Mature", where);
            ed.undo();
          }
        } else note(`Try another refused "${t.errors[0]}"`, where);
      }
    }
    ed.undo();
    if (!Buffer.from(ed.terrainNow().heights).equals(Buffer.from(before))) note("undo leaves the land changed", where);
    tally.kept = (tally.kept ?? 0) + 1;
  }
}
console.log(`maturity ${theme} ${side}:`, JSON.stringify(tally));
for (const l of ex) console.log("  " + l);
process.exit(0);
