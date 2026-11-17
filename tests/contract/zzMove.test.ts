import { it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { makeSpec } from "../../src/core/spec/mapspec";
import { StackLive } from "../../src/core/sim/stackLive";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { namedInEditor } from "../fixtureEditor";

it("move", async () => {
  const size = Number(process.env.BSIZE ?? 96);
  const seed = Number(process.env.BSEED ?? 22);
  if (size === 96 && seed === 22) namedInEditor("preview-highlands-96-22-carve.damgoodmaps");
  else { await runGenerate(makeSpec({ seed, theme: "highlands", size: { x: size, y: size } })); ed.refine(); }
  ed.settleWater();
  const s = MapSession.open(decodeProject(ed.project().bytes));
  const model = s.built.waterModel;
  const from = s.built.settle.stack!;
  const flows = s.lastSettled()?.water.stack ?? null;
  const live = new StackLive(model, from, flows);
  live.holdOwn(model.stacked!.objects);
  const m = (live as any).own.b.m;
  const d0 = m.copy(6) as Float64Array;
  let wet = 0; for (let c = 0; c < d0.length; c++) if (d0[c] > 0) wet++;
  const ever = new Uint8Array(d0.length);
  const lastChange = new Int32Array(d0.length).fill(-100000);
  let prev = d0.slice();
  const out: string[] = [];
  for (let t = 1; t <= Number(process.env.BT ?? 4096); t++) {
    m.op(1, 1, 1);
    const d = m.view(6) as Float64Array;
    for (let c = 0; c < d.length; c++) if (d[c] !== prev[c]) { ever[c] = 1; lastChange[c] = t; }
    prev = d.slice();
    if ((t & (t - 1)) === 0 || t % 512 === 0) { let n = 0, recent = 0, tiles = new Set<number>(); for (let c = 0; c < d.length; c++) { n += ever[c]; if (lastChange[c] >= t - 128) { recent++; tiles.add(c % (size * size)); } } out.push(`t${t}: ever ${n} moving-last128 ${recent}`); }
  }
  console.log(`MOVE ${size}/${seed} cols ${d0.length} wet ${wet} | ${out.join(" | ")}`);
});
