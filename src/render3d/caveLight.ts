// Light under roofs (3D terrain step 2, part 2; D126, D280 (2)): the sky and the sun in caves, under
// overhangs and arches, from Erode's light volume (investigation/erode/core/mesher.ts `lightVolume`,
// as investigation/3d-view adopted it). Four bytes a cell, W × H × LIGHT_LEVELS cells (x fastest, then
// y, then the level), a 3D texture the terrain shader reads half a cell along each face's normal:
// - R, the sky. Roofed air (below its column's top, not rock) walks it in from its openings: beside an
//   open cell, that cell's sky; beside the map's edge, 249; then CAVE_SKY_STEP less per step through
//   roofed air, never below the cave's least (`CAVE_SKY_FLOOR`; a cave's mouth as bright as the open
//   ground before it, never brighter, its depths murky but readable, never near-black; the shader holds
//   the same least). An open cell beside roofed
//   air holds the sky the baked light would give ground at its height there (light.ts: 0.55 + 0.45 × the
//   sky visibility; on the ground the tile's own, higher up, over a drop, the sky seen from that height),
//   so the texture's filtering blends a cave's mouth into the ground before it; any other open cell 255.
//   0 in rock. The floors' sky (a top's baked light carries its tile's sky visibility).
// - G, the sun: 255 where a ray toward the sun leaves the land without meeting rock, else 0, marched
//   from every roofed cell and every open cell beside one; 255 in any other open cell, 0 in rock.
// - B, the walls' and ceilings' sky: the same walk, from 255 at every opening (an open wall's baked light
//   takes the whole sky, whatever its tile's visibility), so a cave's wall carries on from the open cliff
//   beside its mouth with no step. A, 0.
// The shader's rule (materials.ts `caveAt`, mirrored by `caveSample` for the tests): only a face whose
// own air is roofed takes this light; in open air, and so on every map without terrain above terrain,
// the baked light is used exactly as before (tests/unit/caveLight.test.ts).
//
// Only roofed air needs any work, and roofed air is only in the tiles that are not one plain run from
// z = 0 (`TerrainSource.columns`): a map without them has no volume at all (`CaveLight.build` gives
// null). After an edit only the edited box is redone, plus the reach of its tiles' sky visibility and
// the sky walk round it and the sun's reach down-sun (`relight`): the same bytes as building the whole
// volume again. Pure TypeScript.

import { SKY_REACH, skyAt } from "./light";
import { columnMask, type TerrainSource } from "./mesh";
import { LAYERS } from "./model";
import { LIGHT } from "./palette";

/** Levels in the volume: the 23 layers and one of open sky over them. */
export const LIGHT_LEVELS = LAYERS + 1;

const OPEN = 255;
/** The least sky a cave's air takes, however deep (0–1; the shader's floor too, materials.ts `caveLightOf`):
 *  "cave interiors a little murky" (D280 (2)), dim but never near-black, so a cave's floor, walls and
 *  ceiling read while editing. */
export const CAVE_SKY_FLOOR = 0.55;
/** How much sky the walk in from an opening loses a cell (of 255). The game lights a roofed space as it lights any shade
 *  (Unity's ambient by the face's normal, unoccluded; the sun's shadow alone darkens it: decompiled `Sun`, its
 *  `AmbientMode.Trilight`, and Sun.blueprint.json), so a cave in the game is as bright a few cells in as at its mouth.
 *  Ours dims going in, slowly: a generated gallery (about six cells) keeps most of its mouth's light, a long tunnel
 *  reaches the least some 13 cells from its mouth. */
export const CAVE_SKY_STEP = 6;
const STEP = CAVE_SKY_STEP;
/** Bytes a cell: R the floors' sky, G the sun, B the walls' and ceilings' sky, A unused. */
export const CAVE_CELL = 4;
/** The least as a byte. */
export const CAVE_FLOOR_BYTE = Math.round(255 * CAVE_SKY_FLOOR);
const FLOOR = CAVE_FLOOR_BYTE;
const MARCH = 0.34;

/** Toward the sun in tile space (x east, y north, z up). */
export const SUN_TILE: readonly [number, number, number] = [
  LIGHT.sunAzimuth[0] * Math.cos(LIGHT.sunElevation),
  LIGHT.sunAzimuth[1] * Math.cos(LIGHT.sunElevation),
  Math.sin(LIGHT.sunElevation),
];

/** How far a change reaches through the sky walk (tiles): it lights at most this many steps. */
export const SKY_WALK = Math.ceil((OPEN - STEP - FLOOR) / STEP) + 1;
/** How far a change reaches down-sun (tiles, east and south): the longest ray's run before it clears
 *  the top layer, and a step over. */
export const SUN_REACH = Math.ceil(((LAYERS - 0.5) / SUN_TILE[2] + MARCH) * Math.max(Math.abs(SUN_TILE[0]), Math.abs(SUN_TILE[1]))) + 1;

/** The sky the baked light gives open ground on a tile of sky visibility `sky` (0–255), as a byte
 *  (materials.ts: `mix(0.55, 1.0, sky)` on a top), below 255: an open cell holding it is one beside
 *  roofed air. */
export const openSky = (sky: number): number => Math.min(OPEN - 1, Math.round(255 * (0.55 + (0.45 * sky) / 255)));

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export class CaveLight {
  readonly W: number;
  readonly H: number;
  readonly D = LIGHT_LEVELS;
  /** RG bytes per cell (the texture's data). */
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

  private constructor(src: TerrainSource) {
    const { W, H } = src;
    this.W = W;
    this.H = H;
    this.data = new Uint8Array(W * H * LIGHT_LEVELS * CAVE_CELL);
    this.masks = new Uint32Array(W * H);
    this.near = new Uint8Array(W * H);
    this.besideTop = new Uint8Array(W * H);
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
    // 1. the changed tiles' cells: rock, open air, or roofed air (lit below)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const m = (masks[i] = columnMask(src, i));
        const top = 32 - Math.clz32(m);
        if (top > this.maxTop) this.maxTop = top;
        for (let z = 0; z < D; z++) {
          const o = (z * N + i) * CAVE_CELL;
          if (z < LAYERS && (m >>> z) & 1) data[o] = data[o + 1] = data[o + 2] = 0;
          else if (z >= top) data[o] = data[o + 1] = data[o + 2] = OPEN;
          else (data[o] = data[o + 2] = FLOOR), (data[o + 1] = 0);
        }
      }
    // what the change reaches: the open cells whose tiles' sky changed and the sky walk from them all
    // round (S), and the sun's rays from down-sun (R)
    const reach = SKY_REACH + 1 + SKY_WALK;
    const S: Rect = { x0: Math.max(0, x0 - reach), y0: Math.max(0, y0 - reach), x1: Math.min(W - 1, x1 + reach), y1: Math.min(H - 1, y1 + reach) };
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
    // 2. the sky: open cells beside roofed air take their ground's sky; roofed air in S starts dim, then
    // lights from the open air and the map's edge beside it and from the lit roofed air just outside S
    // (unchanged: no step of the walk reaches it from the change), stepping through roofed air
    const inS = (x: number, y: number) => x >= S.x0 && x <= S.x1 && y >= S.y0 && y <= S.y1;
    for (let y = S.y0; y <= S.y1; y++)
      for (let x = S.x0; x <= S.x1; x++) {
        const i = y * W + x;
        if (!near[i]) continue;
        const m = masks[i];
        const top = 32 - Math.clz32(m);
        const zTop = Math.min(D - 1, this.besideTop[i]);
        for (let z = 0; z < D; z++) {
          const o = (z * N + i) * CAVE_CELL;
          if (z < top) {
            if (!((m >>> z) & 1)) data[o] = data[o + 2] = FLOOR;
          } else data[o] = z <= zTop && this.roofedBeside(x, y, z) ? openSky(z === top ? sky[i] : skyAt(W, H, src.heights, x, y, z)) : OPEN;
        }
      }
    // (R from each opening's own sky, B from the whole sky)
    for (const ch of [0, 2]) this.walk(ch, S, masks, inS);
    // 3. the sun: march every roofed cell, and every open cell beside one (all 26 neighbours: the
    // filtering blends them), toward the sun; outside the changed tiles only the cells whose ray
    // crosses them (whether air is roofed never changes with the heights)
    for (let y = R.y0; y <= R.y1; y++)
      for (let x = R.x0; x <= R.x1; x++) {
        const i = y * W + x;
        if (!near[i]) continue;
        const changed = x >= x0 && x <= x1 && y >= y0 && y <= y1;
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
    return R;
  }

  /** The sky walk of channel `ch` through the roofed air of S (step 2 of `relight`). */
  private walk(ch: number, S: Rect, masks: Uint32Array, inS: (x: number, y: number) => boolean): void {
    const { W, H, D, data, near } = this;
    const N = W * H;
    const queue: number[] = [];
    for (let y = S.y0; y <= S.y1; y++)
      for (let x = S.x0; x <= S.x1; x++) {
        const i = y * W + x;
        if (near[i] !== 1) continue;
        const m = masks[i];
        const top = 32 - Math.clz32(m);
        for (let z = 0; z < top; z++) {
          if ((m >>> z) & 1) continue;
          let best = FLOOR;
          for (let k = 0; k < 4; k++) {
            const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
            const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
            let v: number;
            // (beyond the map's edge is open air: the map stands in the sky, its sides cut through the rock;
            // beside open ground a mouth takes that ground's own sky, so the light carries on across the roof
            // line, and falls a step a cell from there)
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) v = OPEN - STEP;
            else {
              const j = yy * W + xx;
              v = data[(z * N + j) * CAVE_CELL + ch];
              if (!v) continue;
              if (z < 32 - Math.clz32(masks[j])) {
                if (inS(xx, yy)) continue;
                v -= STEP;
              }
            }
            if (v > best) best = v;
          }
          if (best > FLOOR) {
            data[(z * N + i) * CAVE_CELL + ch] = best;
            queue.push(z * N + i);
          }
        }
      }
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      const next = data[c * CAVE_CELL + ch] - STEP;
      if (next <= FLOOR) continue;
      const z = Math.floor(c / N);
      const i = c - z * N;
      const x = i % W;
      const y = (i - x) / W;
      for (let k = 0; k < 6; k++) {
        let n: number;
        let zz = z;
        if (k === 0) n = x > S.x0 ? c - 1 : -1;
        else if (k === 1) n = x < S.x1 ? c + 1 : -1;
        else if (k === 2) n = y > S.y0 ? c - W : -1;
        else if (k === 3) n = y < S.y1 ? c + W : -1;
        else if (k === 4) (n = z > 0 ? c - N : -1), (zz = z - 1);
        else (n = z < D - 1 ? c + N : -1), (zz = z + 1);
        if (n < 0) continue;
        const j = n - zz * N;
        const o = data[n * CAVE_CELL + ch];
        if (o === 0 || zz >= 32 - Math.clz32(masks[j]) || o >= next) continue;
        data[n * CAVE_CELL + ch] = next;
        queue.push(n);
      }
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
