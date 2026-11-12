// One composer for a stroke's operation (the stroke pipeline's step 4, #922; EDITOR_PLAN "Architecture", "The edit
// queue"). Headless: the page, the edit queue's `StrokeFeed` and the session all build a stroke's operation here.
//
// - `completeStroke`: everything the session adds to a stroke when it applies, worked out from the map as the stroke
//   finds it: the ground it holds (D491; D280 (3), amended by #623), a weathering Naturalize stroke's rule, its ring,
//   where the water stood round it and how hard the strokes before it pressed (D399), and the ground under the sources
//   and objects it leaves (D368 (8)). Idempotent: a stroke complete already gains nothing. The page completes its
//   stroke before it sends it, so the operation the session logs is the one sent (#873) and the land the page shows is
//   the land it builds (I6, never guessed wrong); the session completes what still arrives without (a script, an old
//   client, a stroke whose map moved under it) with the same code.
// - `composeStroke`: the stroke's operation, its history label and the land it changes before and after (its overlay
//   in the edit queue), from what its preview drew: the protected tiles as the build leaves them, so the answer lays
//   no byte the page did not show.

import type { Overlay, Patch, Rect } from "../../doc/editQueue";
import { tileCount } from "../../doc/labels";
import { brushBounds, byDabRule, limitRuns, WEATHERING, waterLimits, weatherBox, weatherRim, wornRuns, type BrushParams } from "./brush";
import { weatherKeep, type StandingObject } from "./objectGround";
import { heldOf, type TerrainState } from "./strokePreview";
import { shoreOf, waterLevels } from "./weather";

/** The map as a stroke finds it, as the session reads it when the stroke applies (the page: its queue's land and
 *  terrain, `EditQueue.terrain()`). Read lazily: only what the stroke needs is asked for. */
export interface StrokeFacts {
  readonly W: number;
  readonly H: number;
  /** The land (the shown heights). */
  readonly heights: ArrayLike<number>;
  /** The terrain: `pre` (the heights before the integrity pass), the holds, the settled water's depth and moisture,
   *  how hard the weathering strokes pressed (`worn`). */
  readonly terrain: Pick<TerrainState, "pre" | "hold" | "rockHold" | "water" | "moisture" | "worn">;
  /** The objects standing, as `groundUnderObjects` reads them. */
  readonly entities: readonly StandingObject[];
}

/** A stroke's operation complete: what the session would add to it (`MapSession.apply`), added here; nothing when it
 *  holds it already. */
export function completeStroke(params: BrushParams, f: StrokeFacts): BrushParams {
  return holdStroke(recordStroke(params, f), f);
}

/** What a stroke records as it applies, worked out on the map as it stands (`MapSession.strokeRecord`). */
export function recordStroke(params: BrushParams, f: StrokeFacts): BrushParams {
  const { W, H } = f;
  // a new weathering Naturalize stroke weathers like nature, dab by dab (D399, rule 6): its rule is
  // recorded in it, so it replays the same, and strokes saved before keep their rule (rule 5, its
  // edges wandering again on every stroke; rule 4, the
  // top cut back whatever its foot took; rule 3, dab by dab with some scree slopes lost; rule 2,
  // the whole stroke at once, saved with where water would stand round it, `rim`)
  // (a rule painted on the page comes with its rule but never its ring: added here)
  let p = params;
  if (p.tool === "naturalize" && p.weathers && (p.weathering === undefined || (byDabRule(p.weathering) && p.rim === undefined))) {
    const pre = f.terrain.pre;
    const rim = weatherRim(p, pre, waterLevels(pre, W, H), W, H);
    p = { ...p, weathering: p.weathering ?? WEATHERING, ...(rim.length ? { rim } : {}) };
  }
  // and where the settled water stood round it (rule 3: and the moist ground), unless the page
  // recorded the water it showed
  if ((p.weathering === 2 || byDabRule(p.weathering)) && p.shore === undefined && p.pools === undefined && p.moist === undefined) {
    const box = weatherBox(p, W, H);
    if (box) {
      const water = f.terrain.water ?? new Float64Array(W * H);
      if (p.weathering === 2) {
        const { shore, pools } = shoreOf(box, f.heights, water, W);
        p = { ...p, shore, pools };
      } else p = { ...p, ...limitRuns(waterLimits(f.heights, water, f.terrain.moisture ?? null, W, H), box, W) };
    }
  }
  // and how hard the weathering strokes before it pressed there (rule 6), unless the page recorded what it read
  if (p.weathering === 6 && p.worn === undefined) {
    const box = weatherBox(p, W, H);
    p = { ...p, worn: box ? wornRuns(f.terrain.worn ?? null, box, W) : [] };
  }
  // a weathering Naturalize stroke leaves the ground under the sources and objects standing now: the
  // runs are recorded in it, so it replays the same whatever moves later (D368 (8), D342); those it records already
  // stay as they are
  const runs = weatherKeep(p, f.entities, W, H);
  if (runs.length) {
    const have = new Set((p.keep ?? []).map((r) => `${r[0]},${r[1]},${r[2]}`));
    const add = runs.filter((r) => !have.has(`${r[0]},${r[1]},${r[2]}`));
    if (add.length) p = { ...p, keep: [...(p.keep ?? []), ...add] };
  }
  return p;
}

/** A stroke with the ground it holds (`heldOf`: the ground holding objects set under a roof, D491, and the ground holding
 *  up a cave's or an overhang's rock, D280 (3), amended by #623): only the held tiles in its reach and one tile round
 *  it (the integrity pass reads each tile's neighbours), so a replay builds exactly what was shown (D455). */
export function holdStroke(p: BrushParams, f: StrokeFacts): BrushParams {
  if (p.hold) return p;
  const hold = heldIn(brushBounds(p, f.W, f.H), heldOf(f.terrain) ?? [], f.W);
  return hold.length ? { ...p, hold } : p;
}

/** The holds within a box and one tile round it, copied (a stroke's or a sculpt's, `MapSession.withHold`). */
export function heldIn(box: Rect | null, all: readonly (readonly [number, number, number])[], W: number): [number, number, number][] {
  if (!box) return [];
  const out: [number, number, number][] = [];
  for (const h of all) {
    const x = h[0] % W;
    const y = (h[0] - x) / W;
    if (x >= box.x0 - 1 && x <= box.x1 + 1 && y >= box.y0 - 1 && y <= box.y1 + 1) out.push([h[0], h[1], h[2]]);
  }
  return out;
}

/** What a stroke's preview drew, let go: the land as it began and as it stands, the preview's heights before the
 *  integrity pass and its protected tiles (whole maps), the rectangle its land changed (and the riding pieces',
 *  `finished`), and the terrain it was painted on (`before`: its `pre`, `protect` and `rockHold`). */
export interface Drawn {
  start: Uint8Array;
  shown: Uint8Array;
  pre: Uint8Array;
  protect: Uint8Array;
  bounds: Rect | null;
  finished?: Rect | null;
  before: Pick<TerrainState, "pre" | "protect" | "rockHold">;
}

/** A stroke composed: its operation (complete), its history label, and the land it changes before and after. */
export interface Composed {
  params: BrushParams;
  /** The tiles whose shown height it changed (0: none, and no operation of the ground). */
  tiles: number;
  label: string;
  overlay: Overlay;
}

/** The stroke's operation and the land it changes (its overlay in the edit queue), from its preview: `params` as the
 *  page recorded it, completed here (`completeStroke`) on the map it was painted on (`facts`). The overlay covers its
 *  land and the tile round it (the ground's check reads it), and the tiles it holds: there the build protects them
 *  (terrain.ts), and the preview's guard on the rock's ground elsewhere is the preview's alone. Null when its land
 *  changed nothing (`tiles` 0 with the params, for what it does besides the ground). */
export function composeStroke(params: BrushParams, name: string, d: Drawn, f: StrokeFacts): Composed {
  const { W, H } = f;
  const p = completeStroke(params, f);
  const tiles = changedTiles(d.start, d.shown, d.bounds, W);
  const b = d.bounds;
  const fin = d.finished ?? null;
  let rect: Rect = b
    ? { x0: Math.min(b.x0, fin ? fin.x0 : b.x0), y0: Math.min(b.y0, fin ? fin.y0 : b.y0), x1: Math.max(b.x1, fin ? fin.x1 : b.x1), y1: Math.max(b.y1, fin ? fin.y1 : b.y1) }
    : { x0: 0, y0: 0, x1: 0, y1: 0 };
  rect = { x0: Math.max(0, rect.x0 - 1), y0: Math.max(0, rect.y0 - 1), x1: Math.min(W - 1, rect.x1 + 1), y1: Math.min(H - 1, rect.y1 + 1) };
  // (the build protects the held tiles inside the stroke's reach, its region; those in the tile round it it reads only)
  const reach = brushBounds(p, W, H);
  const held = new Set<number>();
  for (const [i] of p.hold ?? []) {
    const hx = i % W;
    const hy = (i - hx) / W;
    if (!reach || hx < reach.x0 || hx > reach.x1 || hy < reach.y0 || hy > reach.y1) continue;
    held.add(i);
    const x = i % W;
    const y = (i - x) / W;
    rect = { x0: Math.min(rect.x0, x), y0: Math.min(rect.y0, y), x1: Math.max(rect.x1, x), y1: Math.max(rect.y1, y) };
  }
  const rock = new Set<number>();
  for (const [i] of d.before.rockHold ?? []) if (!held.has(i)) rock.add(i);
  const before: Patch = { heights: cut(d.start, rect, W), pre: cut(d.before.pre, rect, W), protect: cut(d.before.protect, rect, W) };
  const after: Patch = { heights: cut(d.shown, rect, W), pre: cut(d.pre, rect, W), protect: cut(d.protect, rect, W) };
  // (the build protects the held tiles it keeps, D491; the rock's ground the preview guards beyond them stays as it was)
  const bw = rect.x1 - rect.x0 + 1;
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = y * W + x;
      const j = (y - rect.y0) * bw + (x - rect.x0);
      if (held.has(i)) after.protect[j] = 1;
      else if (rock.has(i)) after.protect[j] = before.protect[j];
    }
  return { params: p, tiles, label: `${name} ${tileCount(tiles)}`, overlay: { rect, before, after } };
}

/** How many tiles of `b` differ between two maps. */
function changedTiles(a: ArrayLike<number>, b2: ArrayLike<number>, b: Rect | null, W: number): number {
  if (!b) return 0;
  let n = 0;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (a[y * W + x] !== b2[y * W + x]) n++;
  return n;
}

function cut(a: Uint8Array, r: Rect, W: number): Uint8Array {
  const bw = r.x1 - r.x0 + 1;
  const out = new Uint8Array(bw * (r.y1 - r.y0 + 1));
  for (let y = r.y0; y <= r.y1; y++) out.set(a.subarray(y * W + r.x0, y * W + r.x1 + 1), (y - r.y0) * bw);
  return out;
}
