// Answers the size of the edit (the stroke pipeline's step 4, #922): what an edit changed of the land and the terrain
// the page paints on, sent as the rectangle it changed instead of the whole map. A 12 × 3-tile stroke's answer at 256²
// carried 1.75 MB, 1.4 MB of it the whole terrain (its settled water and moisture as dense float64 alone 1 MB), though
// an edit changes the terrain only round itself (its `pre`, `worn`, and the water and moisture beside it). Headless:
// the map's worker diffs (`diffLand`), the page lays (`layLand`, the edit queue's `base`, I1), byte for byte the same.
//
// Each patch names the land it lays on (`from`) and the land it makes (`seq`): the worker numbers every land it sends
// (a whole one too), and the page lays a patch only on the land it was made against. Any other (an answer it dropped,
// whole land from elsewhere) asks the worker for the whole land again (`landNow`), so the two never drift apart; one it
// holds already is passed over. Two chains, each numbered on its own and each on one channel, so each stays in order:
// the land (the heights and every tile map but the water's) with the answers, and the settled water's depth and
// moisture (`wet`) with the water's news, which come on another channel and may overtake an answer.

import type { TerrainState } from "../features/raster/strokePreview";

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The terrain's tile maps, one value a tile: sent as their rectangle when they change. */
const DENSE = ["pre", "protect", "channel", "base", "locked", "floor", "field", "water", "moisture", "worn"] as const;
/** The tile maps of the `wet` chain: the settled water's. */
export const WET = ["water", "moisture"] as const;

/** Which chain a patch is of. */
export type Chain = "land" | "wet";
type Dense = (typeof DENSE)[number];
type TileMap = Uint8Array | Float64Array;

/** What an edit changed of the land, over one rectangle. */
export interface LandPatch {
  chain: Chain;
  /** The land it lays on, and the land it makes (the worker's numbering of its chain). */
  from: number;
  seq: number;
  rect: Rect;
  /** The shown heights over `rect`, when they changed. */
  heights?: Uint8Array;
  /** The terrain's tile maps that changed, over `rect`. */
  dense: Partial<Record<Dense, TileMap>>;
  /** The terrain's other parts that changed, whole (the holds, a cave's masks, the starts; a tile map that came or went). */
  whole: Partial<TerrainState>;
}

export interface Land {
  heights: Uint8Array;
  terrain: TerrainState;
}

/** The patch that makes `next` of `prev` (both W wide), or null when nothing changed. */
export function diffLand(prev: Land, next: Land, W: number, from: number, seq: number, also: Rect | null = null, chain: Chain = "land"): LandPatch | null {
  let rect: Rect | null = also ? { ...also } : null;
  const grow = (r: Rect | null) => {
    if (r) rect = rect ? { x0: Math.min(rect.x0, r.x0), y0: Math.min(rect.y0, r.y0), x1: Math.max(rect.x1, r.x1), y1: Math.max(rect.y1, r.y1) } : r;
  };
  const hr = diffRect(prev.heights, next.heights, W);
  grow(hr);
  const dense: Dense[] = [];
  const whole: Partial<TerrainState> = {};
  const p = prev.terrain as unknown as Record<string, unknown>;
  const n = next.terrain as unknown as Record<string, unknown>;
  for (const k of DENSE) {
    const a = p[k] as TileMap | null | undefined;
    const b = n[k] as TileMap | null | undefined;
    if (!a && !b) continue;
    if (!a || !b || a.length !== b.length || a.constructor !== b.constructor) {
      (whole as Record<string, unknown>)[k] = b ?? null;
      continue;
    }
    const r = diffRect(a, b, W);
    if (r) {
      dense.push(k);
      grow(r);
    }
  }
  for (const k of new Set([...Object.keys(p), ...Object.keys(n)])) {
    if ((DENSE as readonly string[]).includes(k)) continue;
    if (!same(p[k], n[k])) (whole as Record<string, unknown>)[k] = n[k] ?? null;
  }
  const r = rect as Rect | null;
  if (!r && !Object.keys(whole).length) return null;
  const box = r ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
  const out: LandPatch = { chain, from, seq, rect: box, dense: {}, whole };
  if (r && (hr || also)) out.heights = cutOf(next.heights, box, W);
  if (r) for (const k of dense) out.dense[k] = cutOf(n[k] as TileMap, box, W);
  return out;
}

/** `land` with the patch laid on (fresh arrays where it changed, the rest shared): the land the patch was made of. */
export function layLand(land: Land, patch: LandPatch, W: number): Land {
  const r = patch.rect;
  const heights = patch.heights ? paste(land.heights.slice(), patch.heights, r, W) : land.heights;
  const terrain = { ...land.terrain, ...patch.whole } as TerrainState;
  const t = terrain as unknown as Record<string, unknown>;
  for (const [k, part] of Object.entries(patch.dense) as [Dense, TileMap][]) t[k] = paste((t[k] as TileMap).slice(), part, r, W);
  return { heights, terrain };
}

/** The rectangle where two tile maps differ, or null. */
function diffRect(a: ArrayLike<number>, b: ArrayLike<number>, W: number): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i] || (a[i] !== a[i] && b[i] !== b[i])) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function cutOf<T extends TileMap>(a: T, r: Rect, W: number): T {
  const bw = r.x1 - r.x0 + 1;
  const out = new (a.constructor as { new (n: number): T })(bw * (r.y1 - r.y0 + 1));
  for (let y = r.y0; y <= r.y1; y++) out.set(a.subarray(y * W + r.x0, y * W + r.x1 + 1) as never, (y - r.y0) * bw);
  return out;
}

function paste<T extends TileMap>(a: T, part: TileMap, r: Rect, W: number): T {
  const bw = r.x1 - r.x0 + 1;
  for (let y = r.y0; y <= r.y1; y++) a.set(part.subarray((y - r.y0) * bw, (y - r.y0 + 1) * bw) as never, y * W + r.x0);
  return a;
}

/** Whether two parts of a terrain are the same, value for value. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const x = a as unknown as ArrayLike<number>;
    const y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length || a.constructor !== b.constructor) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The shown heights after a view of the land: its whole heights, or `prev` with its patch's laid on, or `prev`. */
export function heightsAfter(prev: Uint8Array, v: { heights?: Uint8Array; land?: LandPatch }, W: number): Uint8Array {
  if (v.heights) return v.heights;
  const p = v.land;
  return p?.heights ? paste(prev.slice(), p.heights, p.rect, W) : prev;
}
