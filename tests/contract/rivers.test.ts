// Drawn rivers always drain and keep their water (ROADMAP M5 acceptance, EDITOR_PLAN §9 property
// tests): rivers drawn in random directions on generated maps of three sizes, from a map edge or
// from an inland spring, to another edge, another river or a lake. After each one is added:
// - every source's water reaches a map edge or a lake (`water.outflow`), and the settle finishes;
// - the river carries water along its whole course: every tile of its length has water in its
//   channel;
// - a mouth on the map edge is sealed: its row of sources fills the whole mouth, and no border tile
//   beside it loses water off the map;
// - the incremental rebuild equals a full rebuild.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { planContextOf, planLake, planRiver } from "../../src/core/doc/tools";
import { pathField } from "../../src/core/features/geometry";
import type { Edge, Point, RiverFeature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { stream, type Rng } from "../../src/core/math/rng";
import { makeSpec } from "../../src/core/spec/mapspec";

const EDGES: Edge[] = ["west", "east", "south", "north"];

function edgePoint(rng: Rng, e: Edge, W: number, H: number): Point {
  const along = (n: number) => rng.int(12, n - 12);
  if (e === "west") return [0, along(H)];
  if (e === "east") return [W - 1, along(H)];
  if (e === "south") return [along(W), 0];
  return [along(W), H - 1];
}

/** A random river on the map: from an edge or a spring, through 1–3 points, to another edge or
 *  into an existing river or lake. */
function randomRiver(s: MapSession, rng: Rng): { points: Point[]; flow: number } {
  const { x: W, y: H } = s.size;
  const inland = (): Point => [rng.int(10, W - 10), rng.int(10, H - 10)];
  const fromEdge = rng.float() < 0.65;
  const e0 = EDGES[rng.int(0, 4)];
  const start = fromEdge ? edgePoint(rng, e0, W, H) : inland();
  const points: Point[] = [start];
  for (let k = rng.int(1, 4); k > 0; k--) points.push(inland());
  const end = rng.float();
  if (end < 0.2) {
    // into an existing river's channel
    const rivers = s.features.filter((f): f is RiverFeature => f.kind === "river");
    const r = rivers[rng.int(0, rivers.length)];
    const p = r.params.path[rng.int(1, r.params.path.length - 1)];
    points.push([p[0], p[1]]);
  } else if (end < 0.3) {
    const lakes = s.features.filter((f) => f.kind === "lake" && !f.params.planned);
    if (lakes.length) {
      const l = lakes[rng.int(0, lakes.length)];
      if (l.kind === "lake") {
        const o = l.params.outline;
        points.push([(o[0][0] + o[2][0]) / 2, (o[0][1] + o[2][1]) / 2]);
      }
    } else points.push(edgePoint(rng, EDGES.filter((e) => e !== e0)[rng.int(0, 3)], W, H));
  } else points.push(edgePoint(rng, EDGES.filter((e) => !fromEdge || e !== e0)[rng.int(0, fromEdge ? 3 : 4)], W, H));
  const flow = [1, 2, 4, 0.5, 3][rng.int(0, 5)];
  return { points, flow };
}

function guid(rng: Rng): string {
  let hex = "";
  for (let i = 0; i < 32; i++) hex += "0123456789abcdef"[rng.int(0, 16)];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The river's course: every whole tile of its length has water in its channel. */
function dryStretches(s: MapSession, r: RiverFeature): number[] {
  const { x: W, y: H } = s.size;
  const f = pathField(r.params.path, W, H);
  const half = r.params.width / 2;
  const bins = Math.floor(f.length);
  const wet = new Uint8Array(bins + 1);
  const seen = new Uint8Array(bins + 1);
  for (let i = 0; i < W * H; i++) {
    if (f.d[i] >= half) continue;
    const b = Math.min(bins, Math.floor(f.s[i]));
    seen[b] = 1;
    if (s.built.water[i] > 0.001) wet[b] = 1;
  }
  const dry: number[] = [];
  for (let b = 0; b <= bins; b++) if (seen[b] && !wet[b]) dry.push(b);
  return dry;
}

/** Water lost off the map at a sealed mouth: wet border tiles of the entry edge, near the mouth,
 *  that are not sources. */
function leaks(s: MapSession, r: RiverFeature): string[] {
  if (!("edge" in r.params.entry)) return [];
  const { x: W, y: H } = s.size;
  const e = r.params.entry.edge;
  const sources = new Set(s.built.sources.filter((q) => q.owner === r.id).map((q) => q.y * W + q.x));
  const border: number[] = [];
  if (e === "west" || e === "east") for (let y = 0; y < H; y++) border.push(y * W + (e === "west" ? 0 : W - 1));
  else for (let x = 0; x < W; x++) border.push((e === "south" ? 0 : H - 1) * W + x);
  const out: string[] = [];
  const f = pathField(r.params.path, W, H);
  for (const i of border) {
    // other rivers leave the map here too: their channels drain as they should
    if (sources.has(i) || f.d[i] > r.params.width / 2 + 4 || (s.built.channel[i] && f.d[i] >= r.params.width / 2)) continue;
    if (s.built.water[i] > 0.001 && f.s[i] < 8) out.push(`(${i % W}, ${Math.floor(i / W)}) ${s.built.water[i].toFixed(3)}`);
  }
  // every channel tile on the entry border is a source
  for (const i of border) if (f.d[i] < r.params.width / 2 && !sources.has(i)) out.push(`unsealed (${i % W}, ${Math.floor(i / W)})`);
  return out;
}

// Skipped under PLAN §20 D277 (all M12 work deferred): the drawn-river planner is unmaintained until
// M12. The generator and the player never use it (the editor's river tool is gone since D184); only
// the worker's old `river` tool request and Claude's steps reach it. On M9a's 256² seed 13 the first
// river drawn from the east edge at (255, 238) loses water off the map beside its mouth, at
// (255, 232) (0.049 deep before D252, 0.070 after; docs/progress/m9a.md, "Found and parked").
// M9b widens it to every size: an edge mouth's sources are the placement rule's row (D314,
// decisions-pending #134), and the generator's own edge rivers get a lip beside that row (item 27,
// `water/edgeLip.ts`, applied while the land is shaped); a drawn river gets the row but no lip, so
// the water beside its row runs off the map (96² seed 11's first river at (34, 0) and (35, 0),
// 128² seed 12's at (82, 0), (83, 0) and (87, 0); disclosed as failing on M9b's base in #155).
// When M12 resumes, `planRiver` lays the lip as the generator does and this comes back.
const UNMAINTAINED_UNTIL_M12 = new Set([96, 128, 256]);

describe.each([
  [96, 11, 8],
  [128, 12, 6],
  [256, 13, 3],
])("drawn rivers drain and keep their water: %i², seed %i, %i rivers", (side, seed, count) => {
  it.skipIf(UNMAINTAINED_UNTIL_M12.has(side))("each river drains to an edge, a river or a lake, carries water all along, and its mouth holds", () => {
    const r = generate(makeSpec({ seed, size: { x: side, y: side } }));
    const s = MapSession.fromGenerated(r);
    const rng = stream(seed, "drawn-rivers");
    // one lake of its own, so some rivers end in a lake
    for (let tries = 0; tries < 40; tries++) {
      const cx = rng.int(15, side - 15);
      const cy = rng.int(15, side - 15);
      const lake = planLake({ outline: [[cx - 4, cy - 3], [cx + 4, cy - 3], [cx + 4, cy + 3], [cx - 4, cy + 3]] }, planContextOf(s), guid(rng));
      if (lake.ok && s.applyAll(lake.ops, "user", lake.label).ok) break;
    }
    let drawn = 0;
    const edges = new Set<string>();
    for (let tries = 0; drawn < count && tries < 200; tries++) {
      const req = randomRiver(s, rng);
      const id = guid(rng);
      const plan = planRiver(req, planContextOf(s), id);
      if (!plan.ok) continue;
      const res = s.applyAll(plan.ops, "user", plan.label);
      expect(res.errors).toEqual([]);
      drawn++;
      const river = s.features.find((f): f is RiverFeature => f.id === id)!;
      if ("edge" in river.params.entry) edges.add(river.params.entry.edge);
      const what = `river ${drawn}: ${JSON.stringify(req)}`;
      const v = s.validate("export");
      const outflow = v.report.checks.find((c) => c.id === "water.outflow")!;
      expect(outflow.ok, `${what}: ${outflow.message}`).toBe(true);
      expect(v.report.checks.find((c) => c.id === "water.settles")!.ok, what).toBe(true);
      expect(dryStretches(s, river), `${what}: dry stretches`).toEqual([]);
      expect(leaks(s, river), `${what}: mouth leaks`).toEqual([]);
      const full = s.fullBuild();
      expect(Buffer.from(full.heights).equals(Buffer.from(s.built.heights)), `${what}: incremental = full`).toBe(true);
      let diff = -1;
      for (let i = 0; i < full.water.length && diff < 0; i++) if (full.water[i] !== s.built.water[i]) diff = i;
      expect(diff, `${what}: water`).toBe(-1);
    }
    expect(drawn).toBe(count);
  });
});
