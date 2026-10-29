// Light under roofs (3D terrain step 2, part 2; D126, D280 (2), D497): the sky and the sun in caves, under
// overhangs and arches, from Erode's light volume (investigation/erode/core/mesher.ts `lightVolume`,
// as investigation/3d-view adopted it). Four bytes a cell, W × H × LIGHT_LEVELS cells (x fastest, then
// y, then the level), a 3D texture the terrain shader reads half a cell along each face's normal.
// The game lights a roofed space as it lights any shade (D497: Unity's Trilight ambient by the face's normal,
// unoccluded, and the sun only where it reaches; decompiled `Timberborn.SkySystem` `Sun`, Sun.blueprint.json), so a
// cave's air carries its mouths' light in with no falloff:
// - R, the floors' sky. An open cell beside roofed air holds the sky the baked light gives ground at its height there
//   (light.ts: 0.55 + 0.45 × the sky visibility; on the ground the tile's own, higher up, over a drop, the sky seen
//   from that height); the map's edge is the whole sky. Each roofed space (air joined through roofed air) takes from
//   its openings: a cell beside one the brightest beside it, the rest the nearest such cell's, then evened out over
//   CAVE_EVEN passes, so between two mouths the light moves smoothly from one's to the other's and never rises above
//   the brighter or falls below the dimmer. A space with no opening (seen only through the cut) takes the whole sky.
//   Any other open cell 255, rock 0.
// - G, the sun: 255 where a ray toward the sun leaves the land without meeting rock, else 0, marched
//   from every roofed cell and every open cell beside one; 255 in any other open cell, 0 in rock.
// - B, the High look's occlusion of the sky (high/bake.ts `terrainAmbient`, the field the High look darkens open ground
//   by, its terrain term at the cell's height over the ground there), carried in as R is, so a roofed face in High
//   takes its mouth's occlusion all the way in (the field itself reads a roof's top there). A, unused.
// (A wall's or a ceiling's sky is the whole sky, as an open wall's baked light takes it: no channel.)
// The shader's rule (materials.ts `caveAt`, mirrored by `caveSample` for the tests): only a face whose
// own air is roofed takes this light; in open air, and so on every map without terrain above terrain,
// the baked light is used exactly as before (tests/unit/caveLight.test.ts).
//
// Only roofed air needs any work, and roofed air is only in the tiles that are not one plain run from
// z = 0 (`TerrainSource.columns`): a map without them has no volume at all (`CaveLight.build` gives
// null). After an edit only the edited box is redone, the open cells whose sky or occlusion it can change, every
// roofed space within reach of them (whole), and the sun's reach down-sun (`relight`): the same bytes as building the
// whole volume again. Pure TypeScript.

import { AMBIENT_REACH, terrainAmbient } from "./high/bake";
import { SKY_REACH, skyAt } from "./light";
import { columnMask, type TerrainSource } from "./mesh";
import { LAYERS } from "./model";
import { LIGHT } from "./palette";

/** Levels in the volume: the 23 layers and one of open sky over them. */
export const LIGHT_LEVELS = LAYERS + 1;

const OPEN = 255;
/** Bytes a cell: R the floors' sky, G the sun, B the High look's occlusion, A unused. */
export const CAVE_CELL = 4;
/** The passes that even a roofed space's light out between its mouths. */
export const CAVE_EVEN = 8;
/** The least of the High look's occlusion of the sky (high/shaders.ts `ambientVisibility`). */
export const AMBIENT_LEAST = 0.4;
const MARCH = 0.34;

/** Toward the sun in tile space (x east, y north, z up). */
export const SUN_TILE: readonly [number, number, number] = [
  LIGHT.sunAzimuth[0] * Math.cos(LIGHT.sunElevation),
  LIGHT.sunAzimuth[1] * Math.cos(LIGHT.sunElevation),
  Math.sin(LIGHT.sunElevation),
];

/** How far a change of heights reaches an open cell's sky or occlusion (tiles). */
const SEED_REACH = Math.max(SKY_REACH, AMBIENT_REACH) + 1;
/** How far a change reaches down-sun (tiles, east and south): the longest ray's run before it clears
 *  the top layer, and a step over. */
export const SUN_REACH = Math.ceil(((LAYERS - 0.5) / SUN_TILE[2] + MARCH) * Math.max(Math.abs(SUN_TILE[0]), Math.abs(SUN_TILE[1]))) + 1;

/** The sky the baked light gives open ground on a tile of sky visibility `sky` (0–255), as a byte
 *  (materials.ts: `mix(0.55, 1.0, sky)` on a top), below 255: an open cell holding it is one beside
 *  roofed air. */
export const openSky = (sky: number): number => Math.min(OPEN - 1, Math.round(255 * (0.55 + (0.45 * sky) / 255)));

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The High look's occlusion of the sky in open air at level z of tile i (0–255): its field's terrain term, lifted
 *  with the height over the ground there as the shader lifts it (high/shaders.ts `ambientVisibility`, the canopies
 *  left out). */
function ambientByte(W: number, H: number, heights: Uint8Array, x: number, y: number, z: number): number {
  const a = terrainAmbient(W, H, heights, x, y) / 255;
  const t = Math.min(1, Math.max(0, (z - heights[y * W + x] - 0.1) / 3.4));
  return Math.round(255 * Math.max(AMBIENT_LEAST, a + (1 - a) * t * t * (3 - 2 * t)));
}

export class CaveLight {
  readonly W: number;
  readonly H: number;
  readonly D = LIGHT_LEVELS;
  /** The bytes a cell (the texture's data). */
  readonly data: Uint8Array;
  /** Each tile's column mask (bit z: voxel z solid). */
  private readonly masks: Uint32Array;
  /** 1 on tiles that can hold roofed air (the columns that are not plain, which an edit of heights
   *  never changes), 2 on their neighbours, 0 elsewhere. */
  private readonly near: Uint8Array;
  /** On those tiles, the highest level an open cell beside roofed air can have (one over the highest
   *  roofed cell round it). */
  private readonly besideTop: Uint8Array;
  /** At least the highest top on the map, raised as edits raise the land (never lowered: it only bounds
   *  the rays): a ray toward the sun above it has left the land. The shader's march stops there too. */
  get highest(): number {
    return this.maxTop;
  }
  private maxTop = 0;
  /** Each roofed cell's source: the cell beside an opening whose light it takes before the evening out (the nearest,
   *  the lowest such cell among the nearest), -2 in a space with no opening, -1 anywhere else. It follows the roofed
   *  spaces' shapes only, never the light, so a change of the openings' light redoes only the cells it reaches. */
  private readonly source: Int32Array;
  /** Scratch, one a cell, left clear between uses: a mark, and a cell's place in a list (+1). */
  private readonly mark: Uint8Array;
  private readonly slot: Int32Array;
  private built = false;

  private constructor(src: TerrainSource) {
    const { W, H } = src;
    this.W = W;
    this.H = H;
    this.data = new Uint8Array(W * H * LIGHT_LEVELS * CAVE_CELL);
    this.masks = new Uint32Array(W * H);
    this.near = new Uint8Array(W * H);
    this.besideTop = new Uint8Array(W * H);
    this.source = new Int32Array(W * H * LIGHT_LEVELS).fill(-1);
    this.mark = new Uint8Array(W * H * LIGHT_LEVELS);
    this.slot = new Int32Array(W * H * LIGHT_LEVELS);
    for (const i of src.columns.keys()) {
      const m = columnMask(src, i);
      const top = 32 - Math.clz32(m);
      let roof = 0;
      for (let z = 0; z < top; z++) if (!((m >>> z) & 1)) roof = z + 1;
      const x = i % W;
      const y = (i - x) / W;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
          const j = yy * W + xx;
          if (!this.near[j]) this.near[j] = 2;
          if (roof > this.besideTop[j]) this.besideTop[j] = roof;
        }
    }
    for (const i of src.columns.keys()) this.near[i] = 1;
  }

  /** The volume of a terrain whose tiles see `sky` of the sky (light.ts `skyVisibility`), or null when
   *  it has no air under a roof (every column one plain run; `force`: build it anyway, for the tests). */
  static build(src: TerrainSource, sky: Uint8Array, force = false): CaveLight | null {
    if (!src.columns.size && !force) return null;
    const v = new CaveLight(src);
    v.relight(src, sky, { x0: 0, y0: 0, x1: src.W - 1, y1: src.H - 1 });
    return v;
  }

  /** The top of tile i's column (the first level over its highest rock). */
  top(i: number): number {
    return 32 - Math.clz32(this.masks[i]);
  }

  /** Whether cell (x, y, z) is air under a roof (in the map). */
  private roofed(x: number, y: number, z: number): boolean {
    const m = this.masks[y * this.W + x];
    return z < 32 - Math.clz32(m) && !((m >>> z) & 1);
  }

  /** The heights of the tiles in `rect` changed (and with them `sky`, the tiles' sky visibility, as far
   *  as light.ts SKY_REACH round them): redo the light they reach. Returns the tiles whose cells may
   *  have changed (every level), for the upload. */
  relight(src: TerrainSource, sky: Uint8Array, rect: Rect): Rect {
    const { W, H, D, data, masks, near } = this;
    const N = W * H;
    const x0 = Math.max(0, rect.x0);
    const y0 = Math.max(0, rect.y0);
    const x1 = Math.min(W - 1, rect.x1);
    const y1 = Math.min(H - 1, rect.y1);
    // 1. the changed tiles' cells: rock, open air, or roofed air (lit below). Whether the roofed spaces' shapes or their
    // openings changed: the roofed air in a changed tile, or its top across roofed air beside it
    let shaped = !this.built;
    this.built = true;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const was = masks[i];
        const m = (masks[i] = columnMask(src, i));
        const top = 32 - Math.clz32(m);
        if (top > this.maxTop) this.maxTop = top;
        // (a column that gained roofed air, a Block dig or an Erode cave: its tile and those round it join the ones the
        // light looks at; none ever leaves, which changes no byte)
        const air = ~m & ((1 << top) - 1);
        if (air) {
          const roof = 32 - Math.clz32(air);
          near[i] = 1;
          for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
            for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
              const j = yy * W + xx;
              if (!near[j]) near[j] = 2;
              if (roof > this.besideTop[j]) this.besideTop[j] = roof;
            }
        }
        if (!shaped && was !== m) {
          const wasTop = 32 - Math.clz32(was);
          if ((~was & ((1 << wasTop) - 1)) !== (~m & ((1 << top) - 1))) shaped = true;
          else
            for (let z = Math.min(top, wasTop); z < Math.max(top, wasTop) && !shaped; z++)
              for (let d = 0; d < 4 && !shaped; d++) {
                const xx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
                const yy = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
                if (xx >= 0 && yy >= 0 && xx < W && yy < H && this.roofed(xx, yy, z)) shaped = true;
              }
        }
        for (let z = 0; z < D; z++) {
          const o = (z * N + i) * CAVE_CELL;
          if (z < LAYERS && (m >>> z) & 1) (data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0), (this.source[z * N + i] = -1);
          else if (z >= top) (data[o] = data[o + 1] = data[o + 2] = data[o + 3] = OPEN), (this.source[z * N + i] = -1);
          // (roofed air keeps its light until it is redone below; new roofed air comes with a new shape)
          else if (data[o] === 0 || data[o + 3] === OPEN) (data[o] = data[o + 2] = OPEN), (data[o + 1] = data[o + 3] = 0);
        }
      }
    // what the change reaches: the open cells whose sky or occlusion it changed (S), every roofed space beside them,
    // and the sun's rays from down-sun (R)
    const S: Rect = { x0: Math.max(0, x0 - SEED_REACH), y0: Math.max(0, y0 - SEED_REACH), x1: Math.min(W - 1, x1 + SEED_REACH), y1: Math.min(H - 1, y1 + SEED_REACH) };
    const [sx, sy, sz] = SUN_TILE;
    const R: Rect = {
      x0: Math.max(0, Math.min(S.x0, sx > 0 ? x0 - SUN_REACH : x0)),
      x1: Math.min(W - 1, Math.max(S.x1, sx < 0 ? x1 + SUN_REACH : x1)),
      y0: Math.max(0, Math.min(S.y0, sy > 0 ? y0 - SUN_REACH : y0)),
      y1: Math.min(H - 1, Math.max(S.y1, sy < 0 ? y1 + SUN_REACH : y1)),
    };
    let any = false;
    for (let y = R.y0; y <= R.y1 && !any; y++) for (let x = R.x0; x <= R.x1 && !any; x++) any = near[y * W + x] > 0;
    if (!any) return { x0, y0, x1, y1 };
    // 2. the sky: open cells beside roofed air in S take their ground's sky and occlusion (those whose light changed
    // listed); then the roofed spaces whose shapes changed, whole, and the cells the changed openings light
    const relit: number[] = [];
    for (let y = S.y0; y <= S.y1; y++)
      for (let x = S.x0; x <= S.x1; x++) {
        const i = y * W + x;
        if (!near[i]) continue;
        const m = masks[i];
        const top = 32 - Math.clz32(m);
        const zTop = Math.min(D - 1, this.besideTop[i]);
        for (let z = top; z < D; z++) {
          const o = (z * N + i) * CAVE_CELL;
          const beside = z <= zTop && this.roofedBeside(x, y, z);
          const r = beside ? openSky(z === top ? sky[i] : skyAt(W, H, src.heights, x, y, z)) : OPEN;
          const b = beside ? ambientByte(W, H, src.heights, x, y, z) : OPEN;
          if (r !== data[o] || b !== data[o + 2]) {
            (data[o] = r), (data[o + 2] = b);
            if (beside) relit.push(z * N + i);
          }
        }
      }
    const box = { x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1 };
    const redone: number[] = [];
    if (shaped) {
      // the shapes changed: every roofed space with air in or beside the changed tiles (or anywhere, building), whole
      const c = shaped && x1 - x0 === W - 1 && y1 - y0 === H - 1 ? { x0: 0, y0: 0, x1: W - 1, y1: H - 1 } : { x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1), x1: Math.min(W - 1, x1 + 1), y1: Math.min(H - 1, y1 + 1) };
      for (let y = c.y0; y <= c.y1; y++)
        for (let x = c.x0; x <= c.x1; x++) {
          const i = y * W + x;
          if (near[i] !== 1) continue;
          const top = 32 - Math.clz32(masks[i]);
          for (let z = 0; z < top; z++) if (!((masks[i] >>> z) & 1) && !this.mark[z * N + i]) this.lightSpace(z * N + i, box, redone);
        }
    }
    // the openings whose light changed: the cells taking their sources' light, and the evening out round them
    const changedSources: number[] = [];
    for (const c of relit) {
      const z = Math.floor(c / N);
      const i = c - z * N;
      const x = i % W;
      const y = (i - x) / W;
      for (let d = 0; d < 4; d++) {
        const xx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const yy = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !this.roofed(xx, yy, z)) continue;
        const n = z * N + yy * W + xx;
        if (!this.mark[n] && this.source[n] === n) changedSources.push(n);
      }
    }
    if (changedSources.length) this.relightSources(changedSources, box);
    for (const c of redone) this.mark[c] = 0;
    // 3. the sun: march every roofed cell, and every open cell beside one (all 26 neighbours: the
    // filtering blends them), toward the sun; away from the changed tiles only the cells whose ray crosses them
    for (let y = R.y0; y <= R.y1; y++)
      for (let x = R.x0; x <= R.x1; x++) {
        const i = y * W + x;
        if (!near[i]) continue;
        // (the changed tiles and those beside them, whose open cells may have come to be beside roofed air)
        const changed = x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
        const top = this.top(i);
        const zTop = Math.min(D - 1, this.besideTop[i]);
        for (let z = 0; z <= zTop; z++) {
          const o = (z * N + i) * CAVE_CELL;
          if (data[o] === 0) continue;
          if (!changed) {
            // the tiles the ray's run can cross, a step over
            const run = Math.max(0, this.maxTop - z - 0.5) / sz + MARCH;
            const ex = Math.floor(x + 0.5 + sx * run);
            const ey = Math.floor(y + 0.5 + sy * run);
            if (Math.max(x, ex) < x0 || Math.min(x, ex) > x1 || Math.max(y, ey) < y0 || Math.min(y, ey) > y1) continue;
          }
          // (an open cell beside roofed air holds less than 255: step 2, or unchanged outside S)
          if (z >= top && data[o] === OPEN) data[o + 1] = OPEN;
          else data[o + 1] = this.sunlit(x, y, z) ? OPEN : 0;
        }
      }
    return box;
  }

  /** The roofed cells beside cell c (z · N + i), in one order. */
  private around(c: number, f: (n: number) => void): void {
    const { W, H } = this;
    const N = W * H;
    const z = Math.floor(c / N);
    const i = c - z * N;
    const x = i % W;
    const y = (i - x) / W;
    if (x > 0 && this.roofed(x - 1, y, z)) f(c - 1);
    if (x < W - 1 && this.roofed(x + 1, y, z)) f(c + 1);
    if (y > 0 && this.roofed(x, y - 1, z)) f(c - W);
    if (y < H - 1 && this.roofed(x, y + 1, z)) f(c + W);
    if (z > 0 && this.roofed(x, y, z - 1)) f(c - N);
    if (z < LAYERS - 1 && this.roofed(x, y, z + 1)) f(c + N);
  }

  /** Cell c's openings (the open cells on its four sides, or the map's edge): how many, their R and B summed, and the
   *  brightest's (by R, then B). */
  private openings(c: number): [number, number, number, number, number] {
    const { W, H, data, masks } = this;
    const N = W * H;
    const z = Math.floor(c / N);
    const i = c - z * N;
    const x = i % W;
    const y = (i - x) / W;
    let n = 0;
    let sumR = 0;
    let sumB = 0;
    let br = -1;
    let bb = -1;
    for (let d = 0; d < 4; d++) {
      const xx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
      const yy = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
      let vr: number;
      let vb: number;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) vr = vb = OPEN;
      else {
        if (z < 32 - Math.clz32(masks[yy * W + xx])) continue;
        const o = (z * N + yy * W + xx) * CAVE_CELL;
        vr = data[o];
        vb = data[o + 2];
      }
      n++;
      sumR += vr;
      sumB += vb;
      if (vr > br || (vr === br && vb > bb)) (br = vr), (bb = vb);
    }
    return [n, sumR, sumB, br, bb];
  }

  /** The evening out of `cells` (their light before it in r and b, by their place in the list), CAVE_EVEN passes, each
   *  cell the mean of itself, the roofed cells beside it and its openings; a cell at `reach[k]` steps from the cells
   *  redone takes CAVE_EVEN − reach passes' worth of neighbours, so the cells within the reach come out exactly as
   *  evening the whole space would (reach null: the whole space). */
  private even(cells: number[], r: Float64Array, b: Float64Array, reach: Int32Array | null): void {
    const count = cells.length;
    const { slot } = this;
    const opens = cells.map((c) => this.openings(c));
    let r0 = r.slice();
    let b0 = b.slice();
    let r1 = new Float64Array(count);
    let b1 = new Float64Array(count);
    for (let e = 1; e <= CAVE_EVEN; e++) {
      for (let k = 0; k < count; k++) {
        if (reach && reach[k] > 2 * CAVE_EVEN - e) continue;
        const o = opens[k];
        let n = 1 + o[0];
        let tr = r0[k] + o[1];
        let tb = b0[k] + o[2];
        this.around(cells[k], (j) => {
          const q = slot[j] - 1;
          n++;
          tr += r0[q];
          tb += b0[q];
        });
        r1[k] = tr / n;
        b1[k] = tb / n;
      }
      [r0, r1] = [r1, r0];
      [b0, b1] = [b1, b0];
    }
    r.set(r0);
    b.set(b0);
  }

  /** Light the roofed space holding cell `start` (z · N + i) from its openings (R and B), whole: its cells' sources (the
   *  nearest cell beside an opening, ring by ring, the lowest among the nearest), their light, evened out. Grows `box`
   *  over it and marks its cells (listed in `redone`). */
  private lightSpace(start: number, box: Rect, redone: number[]): void {
    const { W, H, data, mark, slot, source } = this;
    const N = W * H;
    const cells: number[] = [start];
    mark[start] = 1;
    for (let h = 0; h < cells.length; h++)
      this.around(cells[h], (n) => {
        if (mark[n]) return;
        mark[n] = 1;
        cells.push(n);
      });
    for (const c of cells) redone.push(c);
    const count = cells.length;
    for (let k = 0; k < count; k++) {
      slot[cells[k]] = k + 1;
      const i = cells[k] % N;
      const x = i % W;
      const y = (i - x) / W;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
    }
    let ring: number[] = [];
    for (const c of cells) {
      if (this.openings(c)[0]) (source[c] = c), ring.push(c);
      else source[c] = -1;
    }
    if (!ring.length) {
      // no opening: lit by the whole sky, as the game lights it (seen only through the cut)
      for (const c of cells) (data[c * CAVE_CELL] = OPEN), (data[c * CAVE_CELL + 2] = OPEN), (source[c] = -2), (slot[c] = 0);
      return;
    }
    while (ring.length) {
      const next: number[] = [];
      for (const c of ring)
        this.around(c, (n) => {
          if (source[n] === -1) (source[n] = -3), next.push(n);
        });
      // (the whole ring from the one before it, none of it from itself, whatever order it is in)
      const from = next.map((n) => {
        let best = -1;
        this.around(n, (q) => {
          if (source[q] >= 0 && (best < 0 || source[q] < best)) best = source[q];
        });
        return best;
      });
      next.forEach((n, t) => (source[n] = from[t]));
      ring = next;
    }
    const r = new Float64Array(count);
    const b = new Float64Array(count);
    const lit = new Map<number, [number, number]>();
    for (let k = 0; k < count; k++) {
      const v = this.sourceLight(source[cells[k]], lit);
      (r[k] = v[0]), (b[k] = v[1]);
    }
    this.even(cells, r, b, null);
    for (let k = 0; k < count; k++) {
      const c = cells[k];
      data[c * CAVE_CELL] = Math.max(1, Math.round(r[k]));
      data[c * CAVE_CELL + 2] = Math.round(b[k]);
      slot[c] = 0;
    }
  }

  /** The light a source cell gives the cells that take it: its brightest opening's (cached in `lit`). */
  private sourceLight(c: number, lit: Map<number, [number, number]>): [number, number] {
    let v = lit.get(c);
    if (!v) {
      const o = this.openings(c);
      v = [o[3], o[4]];
      lit.set(c, v);
    }
    return v;
  }

  /** The openings' light changed at `sources` (cells beside an opening): redo the cells that take their light, and the
   *  evening out as far as it carries it (CAVE_EVEN steps), from the sources' shapes as they stand. */
  private relightSources(sources: number[], box: Rect): void {
    const { W, H, data, mark, slot, source } = this;
    const N = W * H;
    // the cells taking their light (each source's cells are joined to it through cells taking it too)
    const cells: number[] = [];
    const dist: number[] = [];
    for (const s of sources) {
      if (mark[s]) continue;
      mark[s] = 1;
      cells.push(s);
      dist.push(0);
    }
    for (let h = 0; h < cells.length; h++)
      this.around(cells[h], (n) => {
        if (mark[n] || source[n] !== source[cells[h]]) return;
        mark[n] = 1;
        cells.push(n);
        dist.push(0);
      });
    // and every cell within twice the evening's reach of them: the passes need their neighbours' light that far out
    for (let h = 0; h < cells.length; h++) {
      if (dist[h] >= 2 * CAVE_EVEN) continue;
      this.around(cells[h], (n) => {
        if (mark[n]) return;
        mark[n] = 1;
        cells.push(n);
        dist.push(dist[h] + 1);
      });
    }
    const count = cells.length;
    const r = new Float64Array(count);
    const b = new Float64Array(count);
    const reach = Int32Array.from(dist);
    const lit = new Map<number, [number, number]>();
    for (let k = 0; k < count; k++) {
      slot[cells[k]] = k + 1;
      const v = this.sourceLight(source[cells[k]], lit);
      (r[k] = v[0]), (b[k] = v[1]);
    }
    this.even(cells, r, b, reach);
    for (let k = 0; k < count; k++) {
      const c = cells[k];
      if (reach[k] <= CAVE_EVEN) {
        data[c * CAVE_CELL] = Math.max(1, Math.round(r[k]));
        data[c * CAVE_CELL + 2] = Math.round(b[k]);
        const i = c % N;
        const x = i % W;
        const y = (i - x) / W;
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      }
      mark[c] = 0;
      slot[c] = 0;
    }
  }

  /** Whether any of the 26 cells round (x, y, z) is roofed air. */
  private roofedBeside(x: number, y: number, z: number): boolean {
    const { W, H, D } = this;
    for (let dz = -1; dz <= 1; dz++) {
      const zz = z + dz;
      if (zz < 0 || zz >= D) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          if (this.roofed(xx, yy, zz)) return true;
        }
      }
    }
    return false;
  }

  /** Whether a ray from the middle of cell (x, y, z) toward the sun leaves the land without meeting rock. */
  private sunlit(x: number, y: number, z: number): boolean {
    const { W, H, masks, maxTop } = this;
    const [sx, sy, sz] = SUN_TILE;
    let px = x + 0.5;
    let py = y + 0.5;
    let pz = z + 0.5;
    for (;;) {
      px += sx * MARCH;
      py += sy * MARCH;
      pz += sz * MARCH;
      if (pz >= maxTop || px < 0 || py < 0 || px >= W || py >= H) return true;
      if ((masks[Math.floor(py) * W + Math.floor(px)] >>> Math.floor(pz)) & 1) return false;
    }
  }
}

/** The light the terrain shader takes from the volume for a point on a face (materials.ts `caveAt`,
 *  in the same steps): null where the face's own air (half a cell along its normal) is open (at or
 *  over its tile's top), or rock, or outside the map, so the baked light stands; else the filtered floors'
 *  sky, the sun and the walls' sky (0–1). World space as the view's: X = x, Y = height, Z = −y. */
export function caveSample(v: CaveLight | null, world: readonly [number, number, number], normal: readonly [number, number, number]): [number, number, number] | null {
  if (!v) return null;
  const q = [world[0] + normal[0] * 0.5, -world[2] - normal[2] * 0.5, world[1] + normal[1] * 0.5];
  const size = [v.W, v.H, v.D];
  const c = q.map(Math.floor);
  if (c.some((k, a) => k < 0 || k >= size[a])) return null;
  const N = v.W * v.H;
  const at = (x: number, y: number, z: number, ch: number) => v.data[(z * N + y * v.W + x) * CAVE_CELL + ch];
  if (c[2] >= v.top(c[1] * v.W + c[0]) || at(c[0], c[1], c[2], 0) === 0) return null;
  // trilinear between the texel centres, clamped to the edge (the texture's LinearFilter)
  const f = q.map((k) => k - 0.5);
  const i0 = f.map(Math.floor);
  const t = f.map((k, a) => k - i0[a]);
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let s = 0;
    for (let k = 0; k < 8; k++) {
      const ix = Math.min(size[0] - 1, Math.max(0, i0[0] + (k & 1)));
      const iy = Math.min(size[1] - 1, Math.max(0, i0[1] + ((k >> 1) & 1)));
      const iz = Math.min(size[2] - 1, Math.max(0, i0[2] + ((k >> 2) & 1)));
      const w = (k & 1 ? t[0] : 1 - t[0]) * ((k >> 1) & 1 ? t[1] : 1 - t[1]) * ((k >> 2) & 1 ? t[2] : 1 - t[2]);
      s += w * at(ix, iy, iz, ch);
    }
    out[ch] = s / 255;
  }
  return out;
}
