// Carve's Keep river places a source group (PLAN §20 D314, core/water/sourceGroups.ts): a row across
// the flow at its origin, fewer where cramped, the strength shared; stored literally in its
// operation (the anchor `source`, the rest `sources`), so the project replays exactly; a carve kept
// before D314 (a single `source`) replays unchanged; Unleash places no source.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { CarveRun, DEFAULTS as CARVE_DEFAULTS, sourceStrength } from "../../src/core/forces/carve/run";
import { groupMemberId } from "../../src/core/water/sourceGroups";
import { fixture } from "./forceFixtures";
import type { ForceResultParams } from "../../src/core/forces/op";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const lastForce = (s: MapSession) => s.state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;

describe("Carve's source group (D314)", () => {
  it("a wide river's source is a row sharing its strength, kept in its operation; the project replays it; undo takes it all", async () => {
    // (seed 4 for 3, D148: after D447's bank rule seed 3's highest ground away from the start stands
    // where a row has no room, and the carve's source stays single)
    await runGenerate(makeSpec({ seed: 4, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const st = s0.built.start!;
    const n0 = s0.built.entities.filter((e) => e.template === "WaterSource").length;
    // high ground away from the start
    let at: [number, number] = [20, 20];
    let best = -1;
    for (let y = 12; y < W - 12; y += 2)
      for (let x = 12; x < W - 12; x += 2) {
        if (Math.hypot(x - st.x, y - st.y) < 30 || s0.built.water[y * W + x] > 0) continue;
        if (s0.built.heights[y * W + x] > best) {
          best = s0.built.heights[y * W + x];
          at = [x, y];
        }
      }
    const settings = { ...CARVE_DEFAULTS, power: 90, width: 16 };
    expect(ed.forceStart({ verb: "carve", settings, origin: at, cut: null }).errors).toEqual([]);
    for (let k = 0; k < 2000 && !ed.forceAdvance(8)!.done; k++);
    expect(ed.forceStop().errors).toEqual([]);
    const s1 = MapSession.open(decodeProject(ed.project().bytes));
    const p = lastForce(s1);
    expect(p.source).toBeTruthy();
    expect(p.sources?.length ?? 0).toBeGreaterThan(0);
    expect([p.source!.x, p.source!.y]).toEqual(at);
    const all = [p.source!, ...(p.sources ?? [])];
    expect(Math.round(all.reduce((a, q) => a + q.strength, 0) * 1000) / 1000).toBe(sourceStrength(90, 16));
    for (const q of all) expect(q.strength).toBeLessThanOrEqual(8);
    // a row: one line of tiles next to each other
    const xs = new Set(all.map((q) => q.x));
    const ys = new Set(all.map((q) => q.y));
    expect(xs.size === 1 || ys.size === 1).toBe(true);
    const ajv = new Ajv2020({ strict: false });
    expect(ajv.validate(opsSchema, { op: "forceResult", params: p }), JSON.stringify(ajv.errors?.slice(0, 2))).toBe(true);
    // each stands on the map, the ids unique
    const ids = new Set(s1.built.entities.map((e) => e.id));
    for (const q of all) expect(ids.has(q.id)).toBe(true);
    // (and the map's own sources on the ground it cut went, as any object there)
    const gone = s0.built.entities.filter((e) => e.template === "WaterSource" && p.removed.includes(e.id)).length;
    expect(s1.built.entities.filter((e) => e.template === "WaterSource").length).toBe(n0 - gone + all.length);
    // replayed: the same objects
    const again = MapSession.open(decodeProject(s1.project()));
    expect(again.built.entities.map((e) => `${e.id}@${e.x},${e.y},${e.z}`)).toEqual(s1.built.entities.map((e) => `${e.id}@${e.x},${e.y},${e.z}`));
    // one undo takes the carve and its whole row
    ed.undo();
    expect(MapSession.open(decodeProject(ed.project().bytes)).built.entities.filter((e) => e.template === "WaterSource").length).toBe(n0);
  }, 120_000);

  it("a carve kept before D314 (a single source) replays unchanged; Unleash places no source", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const n0 = s.built.entities.filter((e) => e.template === "WaterSource").length;
    const old: ForceResultParams = {
      version: 1,
      verb: "carve",
      settings: { mode: "unleash", power: 60, wander: 35, width: null, seed: 0, walls: "steep", defyGravity: false, dry: false },
      where: { origin: [40, 40] },
      steps: 10,
      reason: "done",
      tiles: [],
      heights: [],
      removed: [],
      source: { id: "d3140000-0000-4000-8000-000000000001", x: 40, y: 40, strength: 3 },
    };
    expect(s.apply({ op: "forceResult", params: old }, "user").errors).toEqual([]);
    expect(s.built.entities.filter((e) => e.template === "WaterSource").length).toBe(n0 + 1);
    const again = MapSession.open(decodeProject(s.project()));
    expect(again.built.entities.filter((e) => e.template === "WaterSource").length).toBe(n0 + 1);
    // Unleash on a placed source: the player's source is the origin, no new one
    const src = s.built.entities.find((e) => e.id === "d3140000-0000-4000-8000-000000000001")!;
    expect(src).toBeTruthy();
  });

  it("the Rust carve names its row's members by the one rule (sourceGroups.ts groupMemberId), passing over an id the document has used", () => {
    const m = fixture("plain", 64);
    const carve = (usedIds?: Set<string>) => new CarveRun({ ...m, ...(usedIds ? { usedIds } : {}) }, { ...CARVE_DEFAULTS, power: 100, width: 24 }, { origin: 30 * 64 + 30 }, { sourceId: "anchor-1" }).group;
    const row = carve();
    expect(row.length).toBeGreaterThan(2);
    expect(row[0].id).toBe("anchor-1");
    // each member's place along the row, by the rule
    const places = row.map((g) => [...Array(32).keys()].find((p) => groupMemberId("anchor-1", p) === g.id));
    expect(places.every((p) => p !== undefined)).toBe(true);
    // a member's id already used: it takes the rule's next for its place, the others keep theirs
    const used = new Set([row[1].id]);
    const again = carve(used);
    expect(again.map((g) => g.tile)).toEqual(row.map((g) => g.tile));
    again.forEach((g, k) => expect(g.id, `member ${k}`).toBe(groupMemberId("anchor-1", places[k]!, (id) => used.has(id))));
    expect(again[1].id).not.toBe(row[1].id);
  });
});
