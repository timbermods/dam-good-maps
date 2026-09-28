// M9a's queries for Claude (docs/m9-design.md §16; ROADMAP M9a "Keep M12 ready", D134): what the
// generated field holds, read back ("what's on this map?"), and where the colony walks without
// stairs. Both are plain reads of the map as it stands: they change nothing.
//
// - landmarks: the rivers in flow order (their falls), the natural lakes, the falls, the standing
//   forms (spires, stacks and small mesas), the natural ramps, and the stairs-only uplands.
// - reach: the land on foot from the start (over the map's own ground and slopes), the stairs-only
//   land, and the levels reached without stairs.

import { walkRegions } from "../../../src/core/analysis/regions";
import type { MapSession } from "../../../src/core/doc/session";
import { pathField, pointAtArc, polygonMask } from "../../../src/core/features/geometry";
import type { LakeFeature, RiverFeature } from "../../../src/core/features/schema";
import { slopeHighSide } from "../../../src/core/format/footprints";
import { levelRegions } from "../../../src/core/math/grid";
import { WALK_BLOCKERS } from "../../../src/core/validate/playability";
import { entityTiles } from "../../../src/core/features/edits";

export const LANDMARK_KINDS = ["rivers", "lakes", "falls", "standing forms", "ramps", "stairs-only uplands"] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Walk labels from the start: same level, the map's own slopes, round the objects that block. */
function walk(s: MapSession): { labels: Int32Array; root: number } | null {
  const b = s.built;
  if (!b.start) return null;
  const { W, H } = b;
  const N = W * H;
  const blocked = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, blocked, links);
  return { labels, root: labels[b.start.y * W + b.start.x] };
}

function riverName(f: RiverFeature): string {
  if (f.role === "river/main") return "the main river";
  if ("edge" in f.params.entry) return `the river from the ${f.params.entry.edge} edge`;
  return f.origin === "generated" ? "a spring-fed river" : "a drawn river";
}

function fallsOf(f: RiverFeature): { at: number; drop: number; tile: [number, number] }[] {
  const out: { at: number; drop: number; tile: [number, number] }[] = [];
  for (const st of f.params.bedProfile.steps) {
    if (st.drop < 2) continue;
    const { p } = pointAtArc(f.params.path, st.at);
    out.push({ at: r1(st.at), drop: st.drop, tile: [Math.round(p[0]), Math.round(p[1])] });
  }
  return out;
}

export function landmarks(s: MapSession, kind?: LandmarkKind): Record<string, unknown> {
  const b = s.built;
  const { W, H } = b;
  const N = W * H;
  const out: Record<string, unknown> = {};
  const want = (k: LandmarkKind) => !kind || kind === k;
  const rivers = s.features.filter((f): f is RiverFeature => f.kind === "river");
  // rivers in flow order: the main river first, then by flow
  const ordered = rivers.slice().sort((a, c) => (c.role === "river/main" ? 1 : 0) - (a.role === "river/main" ? 1 : 0) || c.params.flow - a.params.flow);
  if (want("rivers"))
    out.rivers = ordered.map((f) => {
      const L = pathField(f.params.path, W, H).length;
      const into = "edge" in f.params.exit ? `the ${f.params.exit.edge} edge` : "river" in f.params.exit ? riverName(rivers.find((g) => g.id === (f.params.exit as { river: string }).river) ?? f) : "a lake";
      return { id: f.id, name: riverName(f), from: "edge" in f.params.entry ? `the ${f.params.entry.edge} edge` : "spring" in f.params.entry ? `a spring at (${f.params.entry.spring.map(Math.round).join(", ")})` : "a lake", into, length: Math.round(L), flow: f.params.flow, badwater: f.params.badwater, falls: fallsOf(f).length };
    });
  if (want("falls")) out.falls = ordered.flatMap((f) => fallsOf(f).map((x) => ({ river: riverName(f), ...x })));
  if (want("lakes"))
    out.lakes = s.features
      .filter((f): f is LakeFeature => f.kind === "lake")
      .map((f) => {
        const m = polygonMask(f.params.outline, W, H);
        let n = 0;
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < N; i++)
          if (m[i]) {
            n++;
            sx += i % W;
            sy += Math.floor(i / W);
          }
        return { id: f.id, natural: f.params.natural === true, tiles: n, centre: n ? [Math.round(sx / n), Math.round(sy / n)] : null, sill: f.params.outlet.sill };
      });
  if (want("standing forms") || want("stairs-only uplands")) {
    const reg = levelRegions(b.heights, W, H);
    const count = reg.size.length;
    // the lowest neighbour level round each region
    const around = new Int32Array(count).fill(1 << 20);
    const sumX = new Float64Array(count);
    const sumY = new Float64Array(count);
    for (let i = 0; i < N; i++) {
      const k = reg.labels[i];
      const x = i % W;
      const y = (i - x) / W;
      sumX[k] += x;
      sumY[k] += y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && reg.labels[j] !== k && b.heights[j] < around[k]) around[k] = b.heights[j];
    }
    const levelOf = new Int32Array(count);
    for (let i = 0; i < N; i++) levelOf[reg.labels[i]] = b.heights[i];
    if (want("standing forms")) {
      const forms: Record<string, unknown>[] = [];
      for (let k = 0; k < count; k++) {
        const stands = levelOf[k] - around[k];
        if (reg.size[k] > 60 || stands < 3 || around[k] === 1 << 20) continue;
        forms.push({ kind: reg.size[k] <= 12 ? "spire" : reg.size[k] <= 30 ? "stack" : "small mesa", at: [Math.round(sumX[k] / reg.size[k]), Math.round(sumY[k] / reg.size[k])], level: levelOf[k], stands, tiles: reg.size[k] });
      }
      out.standingForms = forms.sort((a, c) => Number(c.stands) - Number(a.stands)).slice(0, 30);
    }
    if (want("stairs-only uplands")) {
      const w = walk(s);
      const up: Record<string, unknown>[] = [];
      if (w)
        for (let k = 0; k < count; k++) {
          if (reg.size[k] < 50) continue;
          let first = -1;
          for (let i = 0; i < N && first < 0; i++) if (reg.labels[i] === k) first = i;
          if (w.labels[first] === w.root || b.water[first] > 0.05) continue;
          up.push({ at: [Math.round(sumX[k] / reg.size[k]), Math.round(sumY[k] / reg.size[k])], level: levelOf[k], tiles: reg.size[k], above: Math.max(0, levelOf[k] - (b.start ? b.start.z : 0)) });
        }
      out.stairsOnlyUplands = up.sort((a, c) => Number(c.tiles) - Number(a.tiles)).slice(0, 20);
    }
  }
  if (want("ramps")) {
    // (low tile, high tile pairs, flattened)
    const pairs = s.document.field?.ramps ?? [];
    const lows: [number, number][] = [];
    for (let k = 0; k + 1 < pairs.length; k += 2) lows.push([pairs[k] % W, Math.floor(pairs[k] / W)]);
    out.ramps = { steps: lows.length, where: lows.slice(0, 20) };
  }
  return out;
}

export function reach(s: MapSession): Record<string, unknown> {
  const b = s.built;
  const w = walk(s);
  if (!w) return { error: "the map has no start: reach is measured from the start" };
  const N = b.W * b.H;
  let foot = 0;
  let dry = 0;
  const levels = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (b.water[i] > 0.05) continue;
    dry++;
    if (w.labels[i] === w.root) {
      foot++;
      levels.add(b.heights[i]);
    }
  }
  return {
    onFoot: foot,
    stairsOnly: dry - foot,
    shareOnFoot: Math.round((100 * foot) / Math.max(1, dry)) / 100,
    levelsWithoutStairs: [...levels].sort((a, c) => a - c),
    note: "on foot: the dry land the colony walks to from the start over the map's own ground and slopes; stairs-only: the rest of the dry land, reached by building stairs",
  };
}

export function isLandmarkKind(k: unknown): k is LandmarkKind {
  return typeof k === "string" && (LANDMARK_KINDS as readonly string[]).includes(k);
}
