// The pre-built weir (PLAN §5.7; D72), found on the field the processes made: on half the maps a
// NaturalDam line across a river's channel holds its water about 0.65 above the bed upstream. It
// goes where the river's water per tile stays in its channel over the weir (0.65 + 0.35 × flow ÷
// tiles ≤ 0.93, the spill about 0.3·q deep, PLAN §9.2), on a level stretch of bed, where the line
// closes the channel wall to wall and the pool it holds stays between the channel's banks. It is an
// object on the bed: it cuts nothing and raises nothing.

import { bedAt, pathField, type PathField } from "../features/geometry";
import { featureId } from "../features/ids";
import { CARVED_HALF_SPREAD } from "../features/raster/terrain";
import type { MapObjectFeature, RiverFeature } from "../features/schema";
import type { Hydro } from "../land/hydro";
import { tilesToRuns } from "../math/grid";
import { stream } from "../math/rng";

/** Level bed upstream of the weir (its pool) and downstream (its spill). */
const POOL = 14;
const TAIL = 4;
/** How far upstream the pool is followed before it is taken as held. */
const POOL_REACH = 40;

export interface WeirPlan {
  feature: MapObjectFeature;
  /** The weir's tiles and the tiles its pool covers: the start and the badwater keep off them. */
  pool: number[];
}

/** A weir for this map, or null (half the maps try one; a map without a place for one has none). */
export function planWeir(h: Uint8Array, W: number, H: number, hy: Pick<Hydro, "rivers" | "water" | "arms">, seed: number, attempt: number, protect: Uint8Array | null): WeirPlan | null {
  const rng = stream(seed, "weir", 0, attempt);
  if (rng.float() >= 0.5) return null;
  const N = W * H;
  // the split and delta arms share their river's water: no weir near them
  const nearArm = new Uint8Array(N);
  for (const a of hy.arms) {
    const f = pathField(a.path, W, H);
    for (let i = 0; i < N; i++) if (f.d[i] < 8) nearArm[i] = 1;
  }
  const rivers = hy.rivers.slice().sort((a, c) => (c.role === "river/main" ? 1 : 0) - (a.role === "river/main" ? 1 : 0) || c.params.flow - a.params.flow || (a.id < c.id ? -1 : 1));
  for (const r of rivers) {
    const f = pathField(r.params.path, W, H);
    const joins = tributaries(r, hy.rivers, W, H, f);
    const L = f.length;
    // the tiles near the course, by arc position
    const reach = (r.params.width / 2) * CARVED_HALF_SPREAD + 0.5;
    const byS: number[][] = [];
    for (let i = 0; i < N; i++) {
      if (!(f.d[i] < reach)) continue;
      const k = Math.max(0, Math.floor(f.s[i]));
      (byS[k] ??= []).push(i);
    }
    const found: WeirPlan[] = [];
    for (let at = Math.round(0.25 * L); at <= Math.round(0.75 * L); at++) {
      const flow = r.params.flow + joins.filter((j) => j.at < at - POOL).reduce((a, j) => a + j.flow, 0);
      if (joins.some((j) => j.at >= at - POOL && j.at <= at + TAIL)) continue;
      const w = weirAt(h, W, H, hy.water, r, f, reach, byS, at, flow, nearArm, protect);
      if (w) found.push({ feature: weirFeature(seed, w.tiles, W), pool: w.pool });
    }
    if (found.length) return found[rng.int(0, found.length)];
  }
  return null;
}

/** The rivers that join `r`, each at its arc position on `r`, with the flow it brings. */
function tributaries(r: RiverFeature, all: readonly RiverFeature[], W: number, H: number, f: PathField): { at: number; flow: number }[] {
  const out: { at: number; flow: number }[] = [];
  for (const t of all) {
    const exit = t.params.exit;
    if (!("river" in exit) || exit.river !== r.id) continue;
    const [px, py] = t.params.path[t.params.path.length - 1];
    const x = Math.min(W - 1, Math.max(0, Math.round(px)));
    const y = Math.min(H - 1, Math.max(0, Math.round(py)));
    // the flow it brings includes its own tributaries'
    const inner = tributaries(t, all, W, H, pathField(t.params.path, W, H)).reduce((a, j) => a + j.flow, 0);
    out.push({ at: f.s[y * W + x], flow: t.params.flow + inner });
  }
  return out;
}

function weirAt(h: Uint8Array, W: number, H: number, water: Uint8Array, r: RiverFeature, f: PathField, reach: number, byS: readonly number[][], at: number, flow: number, nearArm: Uint8Array, protect: Uint8Array | null): { tiles: number[]; pool: number[] } | null {
  const p = r.params.bedProfile;
  const bed = bedAt(p, at);
  if (bedAt(p, at - POOL) !== bed || bedAt(p, at + TAIL) !== bed) return null;
  const N = W * H;
  const near = (lo: number, hi: number): number[] => {
    const out: number[] = [];
    for (let k = Math.max(0, Math.floor(lo)); k <= Math.floor(hi); k++) for (const i of byS[k] ?? []) out.push(i);
    return out.sort((a, c) => a - c);
  };
  // the line across: the bed tiles at `at`
  const tiles: number[] = [];
  const onLine = new Uint8Array(N);
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (const i of near(at - 0.5, at + 0.5)) {
    if (Math.abs(f.s[i] - at) > 0.5 || h[i] > bed) continue;
    if (h[i] !== bed || water[i] === 2 || nearArm[i] || protect?.[i]) return null;
    const x = i % W;
    const y = (i - x) / W;
    if (x < 3 || y < 3 || x > W - 4 || y > H - 4) return null;
    tiles.push(i);
    onLine[i] = 1;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (tiles.length < 2 || tiles.length > 16) return null;
  // the water spills over it about 0.3·q deep (q the flow per tile across it): it stays below the
  // banks a level above the bed
  if (0.65 + (0.35 * flow) / tiles.length > 0.93) return null;
  // the pool: from the bed just upstream, over every tile at or below the bed, round the line.
  // It must stay in the channel (never further out than its banks), never pass the line (the line
  // closes the channel wall to wall), and never reach a lake.
  const seen = new Uint8Array(N);
  const queue: number[] = [];
  for (const i of near(at - 3, at - 0.5)) {
    if (f.s[i] >= at - 3 && f.s[i] < at - 0.5 && h[i] <= bed && !onLine[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  if (!queue.length) return null;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    if (water[i] === 2 || nearArm[i] || protect?.[i]) return null;
    if (f.d[i] >= reach + 1) return null;
    if (f.s[i] > at + 0.5) return null;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return null;
    if (f.s[i] < at - POOL_REACH) continue;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (seen[j] || onLine[j] || h[j] > bed) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  // (the line is one tile thick across a channel of its own width: at most a few tiles past it)
  if (x1 - x0 > 16 || y1 - y0 > 16) return null;
  return { tiles, pool: [...tiles, ...queue] };
}

function weirFeature(seed: number, tiles: number[], W: number): MapObjectFeature {
  const role = "mapObject/weir/primary";
  return {
    id: featureId(seed, "mapObject", role),
    kind: "mapObject",
    origin: "generated",
    role,
    locked: false,
    params: { kind: "weir", placement: { area: tilesToRuns(tiles.slice().sort((a, c) => a - c), W) } },
  };
}
