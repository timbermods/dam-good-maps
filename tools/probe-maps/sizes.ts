// The DGM Probe's size maps (PLAN §20 D357 (9)): before custom map sizes are built, a probe batch loads maps beyond
// Timberborn's standard sizes and measures them (the group "Sizes"). The generator refuses these sizes today (its
// MapSpec allows 48–256 a side), so the land is built directly with the core's own modules, as a test: relief from
// `math/noise`, a river along the long axis with its sources, a lake with a spring and an outlet, a start, trees,
// bushes and ruins at the generator's densities, then the generator's own build steps (`assemble.ts`: the canonical
// water settle, soil, the file). 256×256 and 399×399 are the known-good references (the largest standard size; the
// largest the unmodded game is known to load, investigation/WORKSHOP.md).
//
// The runner writes these itself before it plans `--group Sizes` (tools/probe-maps/group.ts); `tools/probe-sizes.ts`
// runs the same writer by hand. The maps go to C:\dgm-probe\sizes, never the repository (D195).

import type { EntitySpec } from "../../src/core/format/entities";
import { bush, entityJson, ruin, RUIN_VARIANTS, startingLocation, tree, waterSource } from "../../src/core/format/entities";
import { FOOTPRINTS, startEntranceTile, worldBlocks } from "../../src/core/format/footprints";
import { mapMetadata, writeTimber } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { guidFrom, tileHash01 } from "../../src/core/math/hash";
import { fbm, fbmField } from "../../src/core/math/noise";
import { TIMESTAMP } from "../../src/core/gen/pack";
import { validateMap } from "../../src/core/validate/checks";
import { waterSteady } from "../../src/core/sim/water";
import { assemble, drop, type Built, type Draft } from "./assemble";
import type { BuiltMap, GroupWriter } from "./group";

const OWNER = "dgm-probe-sizes";
const SEED = 4242;

export interface SizeSpec {
  id: string;
  W: number;
  H: number;
  /** D357 (2)'s name for the shape, or why the size is here. */
  name: string;
  reference?: boolean;
}

/** In the order the batch plays them: the references first, the largest last. */
export const SIZES: SizeSpec[] = [
  { id: "sizes-256x256", W: 256, H: 256, name: "the largest standard size", reference: true },
  { id: "sizes-399x399", W: 399, H: 399, name: "the largest the unmodded game is known to load (Map Resizer maps, WORKSHOP.md)", reference: true },
  { id: "sizes-64x512", W: 64, H: 512, name: "Strip" },
  { id: "sizes-128x512", W: 128, H: 512, name: "Long river" },
  { id: "sizes-512x256", W: 512, H: 256, name: "Wide valley" },
  { id: "sizes-512x512", W: 512, H: 512, name: "the largest D357 allows" },
];

/** Objects per 10,000 tiles: a generated 256² map's own counts (Any seed 4: 3,434 trees, 298 bushes, 375 ruins). */
const PER_10K = { trees: 520, bushes: 45, ruins: 50 };
const TREES = ["Pine", "Pine", "Oak", "Birch"] as const;
/** Each river tile's source strength at the upstream edge (every channel tile has one: F2, river mouths). */
const RIVER_STRENGTH = 1;
const LAKE_STRENGTH = 1;

interface Plan {
  spec: SizeSpec;
  d: Draft;
  alongY: boolean;
  L: number;
  S: number;
  width: number;
  /** Tiles: 1 river channel, 2 valley floor, 3 lake, 4 lake outlet, 5 the start's pad. */
  kind: Uint8Array;
  riverSources: [number, number, number][];
  lake: { centre: [number, number]; radius: number; floor: number; source: [number, number, number] } | null;
  start: { x: number; y: number; z: number } | null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The land: relief, a river along the long axis stepping down 4 times, a valley floor beside it, a lake with a spring
 *  and an outlet to the river, and a flat pad for the start. */
function land(spec: SizeSpec): Plan {
  const { W, H } = spec;
  const alongY = H >= W;
  const L = alongY ? H : W, S = alongY ? W : H;
  const at = (u: number, v: number) => (alongY ? u * W + v : v * W + u);
  const seed = (SEED + W * 1000 + H) >>> 0;
  const relief = fbmField(seed, W, H, 40, 3);
  const width = clamp(Math.round(S * 0.05), 3, 8);
  const amp = Math.min(40, S * 0.12);
  const centre = (u: number) => clamp(S / 2 + amp * fbm(seed + 1, u, 0, Math.max(48, Math.round(L / 6)), 2), width + 8, S - width - 9);
  const bed = (u: number) => 6 - Math.floor((5 * u) / L);
  const valley = (u: number) => width / 2 + 3 + Math.round((fbm(seed + 2, u, 0, 32, 2) + 1) * 1.5);
  const heights = new Uint8Array(W * H);
  const kind = new Uint8Array(W * H);
  for (let u = 0; u < L; u++) {
    const c = centre(u), vh = valley(u), b = bed(u);
    for (let v = 0; v < S; v++) {
      const i = at(u, v);
      const dist = Math.abs(v + 0.5 - c);
      if (dist <= width / 2) (heights[i] = b), (kind[i] = 1);
      else if (dist <= vh) (heights[i] = b + 2), (kind[i] = 2);
      else {
        const away = clamp((dist - vh) / (S / 2), 0, 1);
        // (the land falls with the river, smoothly: its contours follow the relief, not the river's steps)
        heights[i] = clamp(Math.max(b + 3, Math.round(9 - (5 * u) / L + 2.5 * (relief[i] + 1) + 5 * away * away * (3 - 2 * away))), 1, 15);
      }
    }
  }
  // the lake: beside the river a third of the way down, on the side with more room, fed by a spring, its outlet a
  // channel to the valley floor one level above it
  let lake: Plan["lake"] = null;
  {
    const ul = Math.round(0.35 * L);
    const c = centre(ul), side = c < S / 2 ? 1 : -1;
    let r = clamp(Math.round(S / 9), 4, 16);
    let vl = 0;
    for (; r >= 3; r--) {
      vl = Math.round(c + side * (valley(ul) + r + 4));
      if (vl - r - 3 >= 2 && vl + r + 3 <= S - 3) break;
    }
    if (r >= 3) {
      const floor = bed(ul) + 1, rim = floor + 3, outlet = floor + 2;
      for (let u = ul - r - 2; u <= ul + r + 2; u++)
        for (let v = vl - r - 2; v <= vl + r + 2; v++) {
          const i = at(u, v), dd = (u - ul) * (u - ul) + (v - vl) * (v - vl);
          if (dd <= r * r) (heights[i] = floor), (kind[i] = 3);
          else if (dd <= (r + 2) * (r + 2) && kind[i] === 0) heights[i] = Math.max(heights[i], rim);
        }
      // the outlet: two tiles wide, from the lake's edge to the valley floor
      for (let v = vl - side * r; side > 0 ? v >= 0 : v < S; v -= side) {
        if (kind[at(ul, v)] === 2 || kind[at(ul, v)] === 1) break;
        for (const u of [ul, ul + 1]) if (kind[at(u, v)] !== 3) (heights[at(u, v)] = outlet), (kind[at(u, v)] = 4);
      }
      const [lx, ly] = alongY ? [vl, ul] : [ul, vl];
      lake = { centre: [lx, ly], radius: r, floor, source: [lx, ly, floor] };
    }
  }
  // the start's pad: 9 × 9 at the valley's level, beside the valley an eighth of the way down, away from the lake
  const us = Math.round(0.12 * L);
  const cs = centre(us);
  const lakeSide = lake ? Math.sign((alongY ? lake.centre[0] : lake.centre[1]) - centre(Math.round(0.35 * L))) : 1;
  const padSide = -lakeSide || 1;
  const padLevel = bed(us) + 2;
  const v0 = Math.round(cs + padSide * valley(us));
  const pad: number[] = [];
  for (let u = us - 4; u <= us + 4; u++)
    for (let k = 0; k < 10; k++) {
      const v = v0 + padSide * k;
      if (v < 2 || v > S - 3) continue;
      const i = at(u, v);
      if (kind[i] === 0) (heights[i] = padLevel), (kind[i] = 5), pad.push(i);
    }
  const d: Draft = { W, H, heights, entities: [], description: "", removed: {} };
  const id = (...k: (string | number)[]) => guidFrom(OWNER, spec.id, ...k);
  // the river's sources: every channel tile of the upstream edge
  const riverSources: [number, number, number][] = [];
  for (let v = 0; v < S; v++) {
    const i = at(0, v);
    if (kind[i] !== 1) continue;
    const [x, y] = alongY ? [v, 0] : [0, v];
    d.entities.push(waterSource({ id: id("river", x, y), owner: OWNER, x, y, z: heights[i], strength: RIVER_STRENGTH }));
    riverSources.push([x, y, heights[i]]);
  }
  if (lake) d.entities.push(waterSource({ id: id("lake"), owner: OWNER, x: lake.source[0], y: lake.source[1], z: lake.source[2], strength: LAKE_STRENGTH }));
  // the start: the pad's flat 3 × 3 nearest the valley whose entrance tile is on the pad too
  let start: Plan["start"] = null;
  const flat = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && kind[y * W + x] === 5;
  let best = Infinity;
  for (const i of pad) {
    const x = i % W, y = (i - x) / W;
    const s = { id: "", owner: "", x, y, z: padLevel, orientation: "Cw0" as const, flipped: false, template: "StartingLocation", components: {} };
    const cells = worldBlocks(FOOTPRINTS.StartingLocation, s).filter((b) => b.localZ === 0);
    const [ex, ey] = startEntranceTile(x, y, "Cw0");
    if (!cells.every((b) => flat(b.x, b.y)) || !flat(ex, ey)) continue;
    const dist = Math.abs((alongY ? x : y) - cs);
    if (dist < best) (best = dist), (start = { x, y, z: padLevel });
  }
  if (!start) throw new Error(`${spec.id}: no room for the start on its pad`);
  d.entities.push(startingLocation({ id: id("start"), owner: OWNER, x: start.x, y: start.y, z: start.z, orientation: "Cw0" }));
  return { spec, d, alongY, L, S, width, kind, riverSources, lake, start };
}

/** Trees, bushes and ruins on dry ground at the generator's densities: trees in woods (a noise field), bushes and ruins
 *  scattered, none on the river, the valley floor, the lake, its rim path or the start's pad. */
function objects(p: Plan): void {
  const { W, H } = p.spec;
  const { d, kind } = p;
  const seed = (SEED * 7 + W * 31 + H) >>> 0;
  const woods = fbmField(seed, W, H, 24, 3);
  const area = W * H;
  const want = { trees: Math.round((area * PER_10K.trees) / 1e4), bushes: Math.round((area * PER_10K.bushes) / 1e4), ruins: Math.round((area * PER_10K.ruins) / 1e4) };
  const id = (...k: (string | number)[]) => guidFrom(OWNER, p.spec.id, ...k);
  const taken = new Uint8Array(area);
  const start = p.start!;
  for (let dy = -3; dy <= 6; dy++) for (let dx = -3; dx <= 6; dx++) {
    const x = start.x + dx, y = start.y + dy;
    if (x >= 0 && y >= 0 && x < W && y < H) taken[y * W + x] = 1;
  }
  // candidate tiles in a fixed order (a hash per tile), so the same map always gets the same objects
  const ground: number[] = [];
  for (let i = 0; i < area; i++) {
    const x = i % W, y = (i - x) / W;
    if (kind[i] !== 0 || taken[i] || x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    ground.push(i);
  }
  const order = (salt: number) => ground.map((i) => [tileHash01((seed + salt) >>> 0, i % W, Math.floor(i / W)), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0;
  for (const [, i] of order(1)) {
    if (n >= want.trees) break;
    if (taken[i] || woods[i] < 0.05) continue;
    const x = i % W, y = (i - x) / W;
    d.entities.push(tree({ id: id("tree", x, y), owner: OWNER, x, y, z: d.heights[i], species: TREES[Math.floor(tileHash01(seed + 9, x, y) * TREES.length)] }));
    taken[i] = 1;
    n++;
  }
  n = 0;
  for (const [, i] of order(2)) {
    if (n >= want.bushes) break;
    if (taken[i]) continue;
    const x = i % W, y = (i - x) / W;
    d.entities.push(bush({ id: id("bush", x, y), owner: OWNER, x, y, z: d.heights[i], ripe: true }));
    taken[i] = 1;
    n++;
  }
  n = 0;
  for (const [, i] of order(3)) {
    if (n >= want.ruins) break;
    if (taken[i] || woods[i] > 0.05) continue;
    const x = i % W, y = (i - x) / W;
    const h = 1 + Math.floor(tileHash01(seed + 11, x, y) * 6);
    d.entities.push(ruin({ id: id("ruin", x, y), owner: OWNER, x, y, z: d.heights[i], height: h, variant: RUIN_VARIANTS[Math.floor(tileHash01(seed + 12, x, y) * RUIN_VARIANTS.length)], orientation: "Cw0" }));
    taken[i] = 1;
    n++;
  }
}

/** Drops the objects the load checks would refuse (their placement on the land), on the land alone: the water is
 *  settled once, after. */
function fit(d: Draft): void {
  const file = {
    metadata: mapMetadata(d.W, d.H, ""),
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: TIMESTAMP, sizeX: d.W, sizeY: d.H, layers: LAYERS, voxels: voxelsFromHeights(d.heights, d.W, d.H), singletons: emptySimulationSingletons(d.W, d.H, 1), entities: d.entities.map(entityJson) },
    extraFiles: [],
  };
  const v = validateMap(file, { profile: "export", loadOnly: true });
  const bad = new Set<string>();
  for (const c of v.report.checks) if (!c.ok && c.id === "entities.placement") for (const e of c.where?.entities ?? []) bad.add(e);
  drop(d, (e: EntitySpec) => !bad.has(e.id));
}

export interface SizeCounts {
  trees: number;
  bushes: number;
  ruins: number;
  sources: number;
  wetTiles: number;
  waterVolume: number;
  maxHeight: number;
}

function counts(b: Built): SizeCounts {
  const t = (re: RegExp) => b.file.world.entities.filter((e) => re.test(String(e.Template))).length;
  let wet = 0, vol = 0, max = 0;
  for (let i = 0; i < b.heights.length; i++) {
    if (b.settle.depth[i] > 0.05) wet++;
    vol += b.settle.depth[i];
    max = Math.max(max, b.heights[i]);
  }
  return { trees: t(/^(Pine|Birch|Oak)$/), bushes: t(/^BlueberryBush$/), ruins: t(/^RuinColumnH\d$/), sources: t(/Source$/), wetTiles: wet, waterVolume: Math.round(vol), maxHeight: max };
}

/** The load checks of our own validator, but for `file.size` (the limit under test: our code allows 4–256). */
export function loadChecks(b: Built): { passed: boolean; failed: string[]; size: string } {
  const v = validateMap(b.file, { profile: "export", loadOnly: true });
  const failed = v.report.checks.filter((c) => !c.ok && c.class === "load" && c.id !== "file.size").map((c) => `${c.id}: ${c.message}`);
  const size = v.report.checks.find((c) => c.id === "file.size");
  return { passed: failed.length === 0, failed, size: size ? `${size.ok ? "ok" : "refused, as expected above 256"}: ${size.message}` : "not reported" };
}

/** A few tiles of each body of water the probe samples through the day: river tiles down its length, lake tiles. */
function watched(p: Plan, b: Built): { flowTiles: [number, number][]; poolTiles: [number, number][] } {
  const { W } = p.spec;
  const flowTiles: [number, number][] = [];
  for (const f of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const u = Math.round(f * (p.L - 1));
    let best = -1, deep = 0;
    for (let v = 0; v < p.S; v++) {
      const i = p.alongY ? u * W + v : v * W + u;
      if (p.kind[i] === 1 && b.settle.depth[i] > deep) (deep = b.settle.depth[i]), (best = i);
    }
    if (best >= 0) flowTiles.push([best % W, Math.floor(best / W)]);
  }
  const poolTiles: [number, number][] = [];
  if (p.lake) {
    const [cx, cy] = p.lake.centre, r = p.lake.radius;
    for (const [dx, dy] of [[0, 0], [-(r >> 1), 0], [r >> 1, 0], [0, r >> 1]]) poolTiles.push([cx + dx, cy + dy]);
  }
  return { flowTiles, poolTiles };
}

export function buildSize(spec: SizeSpec): { built: Built; plan: Plan; map: BuiltMap } {
  const p = land(spec);
  objects(p);
  fit(p.d);
  const { W, H } = spec;
  p.d.description = `DGM Probe size test (not for play): ${W}×${H}, ${spec.name}. A river along the long axis stepping down four times, a lake with a spring, a start, and trees, bushes and ruins at a generated map's densities. Built for PLAN §20 D357 (9); Timberborn's own map editor cannot open maps above 256 a side.`;
  const built = assemble(p.d);
  const c = counts(built);
  const w = watched(p, built);
  const ts = loadChecks(built);
  if (!ts.passed) throw new Error(`${spec.id}: our load checks refuse it: ${ts.failed.join("; ")}`);
  if (!waterSteady(built.settle)) throw new Error(`${spec.id}: its water did not settle in the canonical settle's 4 days`);
  const bytes = writeTimber(built.file);
  const map: BuiltMap = {
    file: `${spec.id}.timber`,
    bytes,
    size: [W, H],
    entry: {
      id: spec.id,
      title: `Sizes · ${W}×${H}${spec.reference ? " (reference)" : ""}, ${spec.name}`,
      tests: `Loads at ${W}×${H} with its terrain, water and ${c.trees + c.bushes + c.ruins} objects; after a day its water against the file's settled water; frame times at normal speed, at the fastest and at the probe's speed with a camera pan over the whole map; the time to load.`,
      reference: !!spec.reference,
      name: spec.name,
      alongY: p.alongY,
      river: { width: p.width, sources: p.riverSources.length, strength: RIVER_STRENGTH },
      lake: p.lake,
      start: p.start,
      removed: p.d.removed,
      ...c,
      ...w,
      validators: { typescript: ts },
    },
  };
  return { built, plan: p, map };
}

export const SIZES_WRITER: GroupWriter = {
  group: "Sizes",
  ids: SIZES.map((s) => s.id),
  tool: "tools/probe-sizes.ts",
  folder: "sizes",
  env: "DGM_PROBE_SIZES",
  manifest: "sizes.json",
  build(log) {
    const maps: BuiltMap[] = [];
    for (const spec of SIZES) {
      const t0 = Date.now();
      const { map } = buildSize(spec);
      maps.push(map);
      const e = map.entry as Record<string, unknown> & SizeCounts;
      log?.(`${spec.id}: ${spec.W}×${spec.H}, ${e.trees} trees, ${e.bushes} bushes, ${e.ruins} ruins, ${e.sources} sources, ${e.wetTiles} wet tiles; ${(map.bytes.length / 1048576).toFixed(1)} MB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    return { maps, manifest: { format: 1, tool: "tools/probe-sizes.ts", decision: "PLAN §20 D357 (9)", gameVersion: GAME_VERSION } };
  },
};
