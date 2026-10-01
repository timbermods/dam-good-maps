// D314: how Timberborn's own maps arrange their water and badwater sources (PLAN.md §20, D314).
// Reads the official .timber maps already sitting in `.scratch/official/` (the main clone;
// gitignored, not redistributed here) with the repository's own format readers, and measures each
// water-source and badwater-source group: size, shape (row or cluster), spacing, the row's bearing
// against the settled water's own flow, each source's strength and where the group sits.
//
// Run: `npx tsx investigation/source-groups/measure.ts [officialDir]` (defaults to
// `C:/Users/krams/code/DamGoodMaps/.scratch/official`, the main clone's copy). Prints a full
// measurement table as JSON to stdout; REPORT.md's tables are drawn from that output (see the
// report for how to regenerate `local/measurements.json`, kept out of git as a bulk result).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readTimber } from "../../src/core/format/timber";
import { surfaceOf } from "../../src/core/format/world";
import { placementOf } from "../../src/core/format/entities";
import { isObject, num, type JsonObject } from "../../src/core/format/json";
import { EMITTERS, objectTile, specifiedStrength, type MapObject } from "../../src/core/sim/model";

const OFFICIAL_DIR = process.argv[2] ?? "C:/Users/krams/code/DamGoodMaps/.scratch/official";

// How close two same-kind sources' footprints must be (Chebyshev distance between their nearest
// occupied tiles) to count as one group. `--gaps` prints every official map's nearest-neighbour
// gap per kind; each kind's own gaps fall in two clean bands with one clear jump between them, so
// the threshold is the midpoint of that jump (any value inside it groups the same way):
// - WaterSource: 1-9 tiles within a head's cluster, then a jump straight to 18+ (a different
//   spring or the map's other river) - midpoint 13.
// - BadwaterSource: 1-3 tiles within a cluster, then a jump to 10+ - midpoint 6.
const GROUP_GAP: Record<"WaterSource" | "BadwaterSource", number> = { WaterSource: 13, BadwaterSource: 6 };

interface SourceInfo {
  id: string;
  template: "WaterSource" | "BadwaterSource";
  tiles: [number, number][];
  cx: number;
  cy: number;
  strength: number;
  surface: number;
}

interface GroupInfo {
  members: SourceInfo[];
  shape: "singleton" | "row" | "cluster";
  /** Row axis unit vector (x, y); undefined for a singleton. */
  axis?: [number, number];
  /** Along-axis spacing between consecutive members, tile centres (row groups only). */
  spacing: number[];
  /** Perpendicular deviation of members from the fitted line (tiles), max and mean. */
  straightness: { max: number; mean: number };
  totalStrength: number;
  strengthsEqual: boolean;
  strengths: number[];
  /** Net flow vector at the group's own tiles, from the map's shipped ColumnOutflows (x, y), and
   *  its magnitude; null when the group's tiles carry no net outflow (a still pool). */
  flow: { x: number; y: number; mag: number } | null;
  /** How the row's axis relates to the flow: "across" (near-perpendicular), "along" (near-parallel),
   *  "neither", or "n/a" (not a row, or no flow to compare against). */
  rowVsFlow: "across" | "along" | "neither" | "n/a";
  /** Where the group sits. */
  place: {
    onEdge: boolean;
    edgeSide: string | null;
    reliefDelta: number; // group's mean surface minus the surrounding ring's mean surface
    relief: "high ground" | "hollow" | "level";
  };
}

interface MapMeasurement {
  file: string;
  name: string;
  W: number;
  H: number;
  water: { sources: number; groups: GroupInfo[] };
  badwater: { sources: number; groups: GroupInfo[] };
}

// ---------------------------------------------------------------- outflow decode (inverse of
// world.ts's outflowToken: "0" or "Bottom:Left:Top:Right", each "0" or "targetIndex|flow"; the four
// slots are -y, -x, +y, +x, in that order, matching world.ts's own comment and encoder).
function decodeOutflowsSlot0(wm: JsonObject | undefined, W: number, H: number): Float64Array {
  const plane = W * H;
  const out = new Float64Array(plane * 4);
  if (!isObject(wm) || !isObject(wm.ColumnOutflows)) return out;
  const tokens = String(wm.ColumnOutflows.Array).split(" ");
  if (tokens.length < plane) return out;
  for (let i = 0; i < plane; i++) {
    const t = tokens[i];
    if (t === "0") continue;
    const parts = t.split(":");
    if (parts.length !== 4) continue;
    for (let d = 0; d < 4; d++) {
      const p = parts[d];
      if (p === "0") continue;
      const bar = p.indexOf("|");
      if (bar < 0) continue;
      out[i * 4 + d] = Number(p.slice(bar + 1)) || 0;
    }
  }
  return out;
}

function loadMap(path: string): MapMeasurement {
  const bytes = readFileSync(path);
  const tf = readTimber(bytes);
  const w = tf.world;
  const { sizeX: W, sizeY: H } = w;
  const surface = surfaceOf(w);
  const outflows = decodeOutflowsSlot0(w.singletons.WaterMapNew as JsonObject, W, H);

  const sources: SourceInfo[] = [];
  for (const e of w.entities) {
    const template = String(e.Template);
    if (template !== "WaterSource" && template !== "BadwaterSource") continue;
    const p = placementOf(e);
    if (!p) continue;
    const rule = EMITTERS[template];
    const comps = isObject(e.Components) ? (e.Components as JsonObject) : {};
    const tiles: [number, number][] = rule.tiles
      .map(([lx, ly]) => objectTile(p, lx, ly))
      .filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H) as [number, number][];
    if (!tiles.length) continue;
    const cx = tiles.reduce((s, [x]) => s + x, 0) / tiles.length;
    const cy = tiles.reduce((s, [, y]) => s + y, 0) / tiles.length;
    const surfHere = tiles.reduce((s, [x, y]) => s + surface[y * W + x], 0) / tiles.length;
    sources.push({ id: String(e.Id), template, tiles, cx, cy, strength: specifiedStrength(comps), surface: surfHere });
  }

  const groupByKind = (kind: "WaterSource" | "BadwaterSource"): GroupInfo[] => {
    const list = sources.filter((s) => s.template === kind);
    const n = list.length;
    const parent = list.map((_, i) => i);
    const find = (a: number): number => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    };
    const minChebyshev = (a: SourceInfo, b: SourceInfo): number => {
      let best = Infinity;
      for (const [ax, ay] of a.tiles)
        for (const [bx, by] of b.tiles) {
          const d = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
          if (d < best) best = d;
        }
      return best;
    };
    const gap = GROUP_GAP[kind];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) if (minChebyshev(list[i], list[j]) <= gap) union(i, j);
    const byRoot = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const g = byRoot.get(r);
      if (g) g.push(i);
      else byRoot.set(r, [i]);
    }
    return [...byRoot.values()].map((idxs) => buildGroup(idxs.map((i) => list[i]), W, H, surface, outflows));
  };

  return {
    file: path,
    name: "",
    W,
    H,
    water: { sources: sources.filter((s) => s.template === "WaterSource").length, groups: groupByKind("WaterSource") },
    badwater: { sources: sources.filter((s) => s.template === "BadwaterSource").length, groups: groupByKind("BadwaterSource") },
  };
}

function buildGroup(members: SourceInfo[], W: number, H: number, surface: Uint8Array, outflows: Float64Array): GroupInfo {
  members.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  const strengths = members.map((m) => m.strength);
  const totalStrength = strengths.reduce((s, v) => s + v, 0);
  const strengthsEqual = strengths.every((v) => Math.abs(v - strengths[0]) < 1e-6);

  // shape: PCA of the members' centres (2x2 covariance, closed-form eigen-decomposition)
  let shape: GroupInfo["shape"] = "singleton";
  let axis: [number, number] | undefined;
  const spacing: number[] = [];
  let straightness = { max: 0, mean: 0 };
  if (members.length >= 2) {
    const mx = members.reduce((s, m) => s + m.cx, 0) / members.length;
    const my = members.reduce((s, m) => s + m.cy, 0) / members.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const m of members) {
      const dx = m.cx - mx, dy = m.cy - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    sxx /= members.length; syy /= members.length; sxy /= members.length;
    // eigenvalues of [[sxx,sxy],[sxy,syy]]
    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const disc = Math.max(0, tr * tr / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc); // major
    const l2 = tr / 2 - Math.sqrt(disc); // minor
    // major-axis eigenvector
    let ax: number, ay: number;
    if (Math.abs(sxy) > 1e-9) {
      ax = l1 - syy; ay = sxy;
    } else if (sxx >= syy) {
      ax = 1; ay = 0;
    } else {
      ax = 0; ay = 1;
    }
    const alen = Math.hypot(ax, ay) || 1;
    ax /= alen; ay /= alen;
    axis = [ax, ay];
    // perpendicular deviations from the line through the centroid along the axis
    const perp = members.map((m) => {
      const dx = m.cx - mx, dy = m.cy - my;
      return Math.abs(dx * -ay + dy * ax);
    });
    straightness = { max: Math.max(...perp), mean: perp.reduce((s, v) => s + v, 0) / perp.length };
    // along-axis positions, for spacing between consecutive members
    const along = members.map((m) => (m.cx - mx) * ax + (m.cy - my) * ay).sort((a, b) => a - b);
    for (let i = 1; i < along.length; i++) spacing.push(along[i] - along[i - 1]);
    // row: elongated (major variance well over minor) and tight around the line (small perpendicular
    // spread); cluster otherwise (roughly as wide as it is long, or scattered off the line).
    const elongated = l2 < 1e-6 || l1 / Math.max(l2, 1e-6) >= 4;
    shape = elongated && straightness.max <= 0.75 ? "row" : "cluster";
  }

  // flow: net outflow vector summed over the group's own tiles
  let fx = 0, fy = 0;
  for (const m of members)
    for (const [x, y] of m.tiles) {
      const i = y * W + x;
      fy += outflows[i * 4 + 2] - outflows[i * 4 + 0]; // +y(Top) - -y(Bottom)
      fx += outflows[i * 4 + 3] - outflows[i * 4 + 1]; // +x(Right) - -x(Left)
    }
  const mag = Math.hypot(fx, fy);
  const flow = mag > 1e-6 ? { x: fx / mag, y: fy / mag, mag } : null;

  let rowVsFlow: GroupInfo["rowVsFlow"] = "n/a";
  if (shape === "row" && axis && flow) {
    const dot = Math.abs(axis[0] * flow.x + axis[1] * flow.y); // 0 = perpendicular, 1 = parallel
    if (dot <= Math.cos((60 * Math.PI) / 180)) rowVsFlow = "across";
    else if (dot >= Math.cos((30 * Math.PI) / 180)) rowVsFlow = "along";
    else rowVsFlow = "neither";
  }

  // place: on a map edge, and relief relative to a surrounding ring
  const onEdgeTiles = members.some((m) => m.tiles.some(([x, y]) => x === 0 || y === 0 || x === W - 1 || y === H - 1));
  let edgeSide: string | null = null;
  if (onEdgeTiles) {
    const sides = new Set<string>();
    for (const m of members)
      for (const [x, y] of m.tiles) {
        if (x === 0) sides.add("west");
        if (x === W - 1) sides.add("east");
        if (y === 0) sides.add("south");
        if (y === H - 1) sides.add("north");
      }
    edgeSide = [...sides].sort().join("+");
  }
  const groupTiles = new Set(members.flatMap((m) => m.tiles.map(([x, y]) => y * W + x)));
  const ownSurface = members.reduce((s, m) => s + m.surface * m.tiles.length, 0) / members.reduce((s, m) => s + m.tiles.length, 0);
  const R = 10;
  let ringSum = 0, ringN = 0;
  const cx = Math.round(members.reduce((s, m) => s + m.cx, 0) / members.length);
  const cy = Math.round(members.reduce((s, m) => s + m.cy, 0) / members.length);
  for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d < R - 2 || d > R || groupTiles.has(y * W + x)) continue;
      ringSum += surface[y * W + x];
      ringN++;
    }
  const ringMean = ringN ? ringSum / ringN : ownSurface;
  const reliefDelta = ownSurface - ringMean;
  const relief: GroupInfo["place"]["relief"] = reliefDelta >= 1 ? "high ground" : reliefDelta <= -1 ? "hollow" : "level";

  return {
    members,
    shape,
    axis,
    spacing,
    straightness,
    totalStrength,
    strengthsEqual,
    strengths,
    flow,
    rowVsFlow,
    place: { onEdge: onEdgeTiles, edgeSide, reliefDelta, relief },
  };
}

function main() {
  const files = readdirSync(OFFICIAL_DIR).filter((f) => f.endsWith(".timber")).sort();
  const results: MapMeasurement[] = [];
  for (const f of files) {
    const path = join(OFFICIAL_DIR, f);
    try {
      const m = loadMap(path);
      m.name = f;
      results.push(m);
    } catch (err) {
      console.error(`skip ${f}: ${(err as Error).message}`);
    }
  }

  if (process.argv.includes("--gaps")) {
    // diagnostic: nearest-neighbour Chebyshev gap between same-kind sources, to justify GROUP_GAP
    for (const kind of ["WaterSource", "BadwaterSource"] as const) {
      const gaps: number[] = [];
      for (const f of files) {
        const path = join(OFFICIAL_DIR, f);
        const bytes = readFileSync(path);
        const w = readTimber(bytes).world;
        const list: SourceInfo[] = [];
        for (const e of w.entities) {
          if (String(e.Template) !== kind) continue;
          const p = placementOf(e);
          if (!p) continue;
          const rule = EMITTERS[kind];
          const tiles = rule.tiles.map(([lx, ly]) => objectTile(p, lx, ly)) as [number, number][];
          list.push({ id: String(e.Id), template: kind, tiles, cx: 0, cy: 0, strength: 0, surface: 0 });
        }
        for (let i = 0; i < list.length; i++) {
          let best = Infinity;
          for (let j = 0; j < list.length; j++) {
            if (i === j) continue;
            for (const [ax, ay] of list[i].tiles)
              for (const [bx, by] of list[j].tiles) best = Math.min(best, Math.max(Math.abs(ax - bx), Math.abs(ay - by)));
          }
          if (Number.isFinite(best)) gaps.push(best);
        }
      }
      gaps.sort((a, b) => a - b);
      console.error(`${kind} nearest-neighbour Chebyshev distances: ${gaps.join(", ")}`);
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
