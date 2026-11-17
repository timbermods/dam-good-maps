import { it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS } from "../../src/core/forces/carve/run";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { namedInEditor } from "../fixtureEditor";

function farFromStart(s: MapSession): [number, number] {
  const b = s.built;
  const st = b.start!;
  let best: [number, number] = [0, 0];
  let far = -1;
  for (let y = 12; y < b.H - 12; y += 4)
    for (let x = 12; x < b.W - 12; x += 4) {
      const i = y * b.W + x;
      if (b.water[i] > 0) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i] * 2;
      if (d > far) { far = d; best = [x, y]; }
    }
  return best;
}

it("bench", async () => {
  const size = Number(process.env.BSIZE ?? 96);
  const seed = Number(process.env.BSEED ?? 22);
  if (size === 96 && seed === 22) namedInEditor("preview-highlands-96-22-carve.damgoodmaps");
  else { await runGenerate(makeSpec({ seed, theme: "highlands", size: { x: size, y: size } })); ed.refine(); }
  ed.settleWater();
  const s = MapSession.open(decodeProject(ed.project().bytes));
  const st = s.built.settle.stack;
  let roofed = 0;
  if (st) for (let i = 0; i < st.count.length; i++) for (let q = 0; q < st.count[i] - 1; q++) if (st.depth[q * st.count.length + i] > 0.05) roofed++;
  const origin = farFromStart(s);
  console.log(`MAP ${size} seed ${seed} stacked ${!!s.built.waterModel.stacked} roofed ${roofed} origin ${origin}`);
  const modes = (process.env.BMODES ?? "dev,branch").split(",");
  for (let rep = 0; rep < Number(process.env.BREPS ?? 6); rep++) {
    const mode = modes[rep % modes.length];
    (globalThis as any).__BENCHMODE = mode;
    ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70 }, origin, cut: null });
    let f = ed.forceAdvance(1)!;
    for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
    const t: number[] = [];
    while (!f.done) {
      const a = performance.now();
      f = ed.forceAdvance(1)!;
      ed.flowForceWater(6);
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    const mean = t.reduce((x, y) => x + y, 0) / t.length;
    console.log(`BENCH ${size} ${mode} frames ${t.length} mean ${mean.toFixed(2)} median ${t[t.length >> 1].toFixed(2)}`);
    const P = (globalThis as any).__P; console.log("PROF " + mode + " " + JSON.stringify(P, (k, v) => typeof v === "number" ? Math.round(v) : v)); (globalThis as any).__P = undefined;
    ed.forceCancel();
  }
});
