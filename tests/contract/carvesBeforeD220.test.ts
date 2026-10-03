// Carves saved before D220 open exactly (D158, D462 answer 2). Before the forces shared one operation,
// `forceResult`, a carve was kept as its own `carve` operation. A project holding one is converted to
// `forceResult` when it opens (doc/document.ts, the conversion the build always applied, forces/op.ts
// `forceOfCarve`), so Kyler's saved projects open with their land, objects and water as they were.
// The project (tests/fixtures/carves-before-d220.*) holds an aimed carve that sealed an oxbow lake, a
// river kept with its row of sources and every option set, a dry canyon stopped early, and a Try
// another path that replaced it; it was written by the code before the `carve` operation was retired,
// and its digests are of the map that code built. DGM_RECORD=1 writes the fixtures again (only ever
// from code that still has the `carve` operation).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { carveParams, forceMapOf } from "../../src/core/forces/carve/result";
import { CarveRun, DEFAULTS, type CarveSettings } from "../../src/core/forces/carve/run";
import type { ForceMap } from "../../src/core/forces/force";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const DIR = join(__dirname, "../fixtures");
const PROJECT = join(DIR, "carves-before-d220.damgoodmaps.json");
const DIGESTS = join(DIR, "carves-before-d220.json");
const W = 96;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const entitiesOf = (s: MapSession) => sha(new TextEncoder().encode(s.built.entities.map((e) => `${e.id}@${e.template},${e.x},${e.y},${e.z},${e.orientation}`).join("|")));

interface Digests {
  written: string;
  heights: string;
  entities: string;
  water: string;
  timber: string;
  /** The last carve (Try another path) undone: the dry canyon it replaced is back. */
  undone: string;
}

/** A carve run on `m` as the editor's worker ran it before D220, as the `carve` operation it kept. */
function carve(m: ForceMap, settings: Partial<CarveSettings>, origin: [number, number], n: number, opts: { end?: [number, number]; steps?: number; cut?: number; replaces?: number } = {}): EditOp {
  const set = { ...DEFAULTS, ...settings };
  const sourceId = "0c0ffee0-0000-4000-8000-" + String(n).padStart(12, "0");
  const r = new CarveRun(m, set, { origin: origin[1] * W + origin[0], ...(opts.end ? { end: opts.end[1] * W + opts.end[0] } : {}) }, { sourceId });
  for (let k = 0; k < (opts.steps ?? 1200) && !r.done; k++) r.step();
  const params = carveParams(m, r, { settings: set, origin, ...(opts.end ? { end: opts.end } : {}), cut: opts.cut ?? null, ...(opts.replaces !== undefined ? { replaces: opts.replaces } : {}) })!;
  return { op: "carve", params } as EditOp;
}

/** A dry tile far from the start, away from the first carve. */
function spot(s: MapSession, avoid: [number, number][]): [number, number] {
  const b = s.built;
  const st = b.start!;
  let best: [number, number] = [0, 0];
  let far = -1;
  for (let y = 12; y < W - 12; y += 4)
    for (let x = 12; x < W - 12; x += 4) {
      if (b.water[y * W + x] > 0) continue;
      const d = Math.min(Math.hypot(x - st.x, y - st.y), ...avoid.map(([ax, ay]) => Math.hypot(x - ax, y - ay))) + b.heights[y * W + x];
      if (d > far) {
        far = d;
        best = [x, y];
      }
    }
  return best;
}

describe("carves saved before D220 open exactly (D158)", () => {
  if (process.env.DGM_RECORD === "1")
    it("records them (code with the carve operation only)", () => {
      // (Highlands 96² seed 8: the aimed carve seals an oxbow lake, tests/contract/carve.test.ts)
      const r = generate(makeSpec({ seed: 8, theme: "highlands", size: { x: W, y: W } }));
      const s = MapSession.fromGenerated(r, r.file);
      s.setWaterMode("defer");
      const apply = (op: EditOp) => expect(s.apply(op, "user").errors).toEqual([]);
      const lake = carve(forceMapOf(s.built), { mode: "aim", power: 85, width: 6, wander: 100, seed: 4, defyGravity: true }, [48, 86], 1, { end: [48, 10] });
      expect((lake.params as { lake?: unknown }).lake).toBeDefined();
      apply(lake);
      const top = Math.max(...s.built.heights);
      const at = spot(s, [[48, 86]]);
      const river = carve(forceMapOf(s.built), { power: 60, width: 16, depth: 4, walls: "wide", wander: 50, seed: 7 }, at, 2, { cut: top });
      expect((river.params as { sources?: unknown[] }).sources?.length).toBeGreaterThan(0);
      apply(river);
      const there = spot(s, [[48, 86], at]);
      const before = forceMapOf(s.built);
      apply(carve(before, { power: 70, dry: true, seed: 0 }, there, 3, { steps: 25 }));
      const seq = s.history().at(-1)!.seq;
      const undone = sha(s.built.heights);
      apply(carve(before, { power: 70, dry: true, seed: 1 }, there, 4, { steps: 25, replaces: seq }));
      expect(s.logOps.filter((o) => o.op === "carve")).toHaveLength(4);
      writeFileSync(PROJECT, s.project());
      const heights = sha(s.built.heights);
      const entities = entitiesOf(s);
      s.settleCanonical();
      const d: Digests = { written: "the code before the carve operation was retired (D462)", heights, entities, water: sha(new Uint8Array(Float64Array.from(s.built.water).buffer)), timber: sha(s.exportTimber().bytes), undone };
      writeFileSync(DIGESTS, JSON.stringify(d, null, 1) + "\n");
    });

  it("the project saved with them opens to the same map, its objects, water and file, and undo brings back the carve Try another replaced", () => {
    const d = JSON.parse(readFileSync(DIGESTS, "utf8")) as Digests;
    const doc = decodeProject(new Uint8Array(readFileSync(PROJECT)));
    const s = MapSession.open(doc);
    expect(sha(s.built.heights)).toBe(d.heights);
    expect(entitiesOf(s)).toBe(d.entities);
    s.settleCanonical();
    expect(sha(new Uint8Array(Float64Array.from(s.built.water).buffer))).toBe(d.water);
    expect(sha(s.exportTimber().bytes)).toBe(d.timber);
    expect(s.undo()).toBe(true);
    expect(sha(s.built.heights)).toBe(d.undone);
    expect(s.redo()).toBe(true);
    expect(sha(s.built.heights)).toBe(d.heights);
  });
});
