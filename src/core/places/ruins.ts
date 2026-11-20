// A real place's ruin fields, laid along its land as the generator lays its own (D518's look round, D535):
// the survey stood its columns in ruled 5×5 squares; a place's fields now come from the generator's own laying
// (`resources/baseline.ts` `planRuinFields` with `follow`), each a ragged band along its level's rim (a contour, a
// bench's edge, a mesa's dry rim, a shore), with gaps, on the land's levels with its tile-scale speckle taken out
// (`fieldLevels`). Objects only, never the land (D331): the place's settled water and soil are read, never changed, and
// its columns are the place's own kind (RuinColumnH2, `place.ts`), each one a beaver can scavenge. The place keeps about
// the scrap it had: as many columns as before where its land has room (98 % over the 84 places), on its dry ground
// first and on its moist ground where the dry has no room. Never on water or within a tile of it, never on the start, its door or any object, and `RUINS_CLEAR` tiles from
// the start's middle, as the generator keeps them on Normal. Deterministic per place: seeded from its key (the tool's
// `seedKey`, as its beds and springs are).

import { density } from "../gen/calibrated";
import { hash32 } from "../math/hash";
import { distanceFrom } from "../math/grid";
import { stream } from "../math/rng";
import { planRuinFields, type BaselineGround } from "../resources/baseline";
import { decodeTiles, type PlaceData } from "./place";
import { startTiles } from "./start";

/** The scrap one of a place's columns gives (RuinColumnH2: 15 a storey). */
const SCRAP_PER_COLUMN = 30;
/** The least distance between a place's field centres (tiles): closer than the generator's (`RUINS.minFieldSpacing`,
 *  18), whose land is made with room for its fields. A real place's columns are the survey's amount on land nobody made
 *  for them: at 18, three places keep under 90 % of their columns (Glencoe 211 of 250); at 12, every place keeps 90 % or
 *  more, 98 % of all the places' columns. */
export const PLACE_FIELD_SPACING = 12;
/** How far the ruins keep from the start's middle (straight tiles): the generator's on Normal (`ruinsWithin` 15 + 7). */
export const RUINS_CLEAR = 22;

/** The settled ground a place's ruins are laid on: its water depth and soil, as its build settles them. */
export interface PlaceRuinGround {
  depth: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
}

/** The place's ruin tiles laid along its land (ascending): about `columns` of them, the survey's count (the last field
 *  is grown to the columns left, less its gaps), fewer where its ground has no room for them. The place's own ruins are
 *  ignored (they are what is laid again, so laying again on a laid place gives the same tiles); every other object, the
 *  start and its door are kept clear. */
export function placeRuins(p: PlaceData, heights: ArrayLike<number>, ground: PlaceRuinGround, key: string, columns: number): number[] {
  const { W, H } = p;
  const N = W * H;
  if (!columns) return [];
  // (the tiles something stands on: the sources, the start and its door, the plants)
  const occupied = new Uint8Array(N);
  for (const [x, y] of p.sources) occupied[y * W + x] = 1;
  for (const i of startTiles(W, p.start)) if (i >= 0 && i < N) occupied[i] = 1;
  for (const gaps of [p.bushes, p.pines, p.birches, p.oaks, p.deadPines, p.deadBirches, p.deadOaks]) for (const i of decodeTiles(gaps)) occupied[i] = 1;
  const taken = Uint8Array.from(occupied);
  const g: BaselineGround = { W, H, heights, water: ground.depth, moisture: ground.moisture, soilContamination: ground.soilContamination, taken };
  // (a field keeps to its level with the speckle taken out, and its columns to the tiles that stand at that level: a column
  // on a speckle would stand a level off its neighbours, where nobody scavenges it)
  const levels = fieldLevels(heights, W, H);
  for (let i = 0; i < N; i++) if (heights[i] !== levels[i]) taken[i] = 1;
  const middle = new Uint8Array(N);
  middle[(p.start[1] + 1) * W + p.start[0] + 1] = 1;
  const plan = planRuinFields(g, columns * SCRAP_PER_COLUMN, {
    rng: stream(hash32(key, "place-ruins")),
    follow: true,
    moistWhenShort: true,
    levels,
    startDist: distanceFrom(middle, W, H),
    minStart: RUINS_CLEAR,
    spacing: PLACE_FIELD_SPACING,
    fieldMedian: density("ruin_field_columns", N),
    // (a field's scrap is its columns a beaver can scavenge, which are all it keeps: the fields never touch, so each
    // field's are its own)
    scrapOf: (tiles) => scavenged(tiles).length * SCRAP_PER_COLUMN,
  });
  return plan.fields.flatMap((f) => scavenged(f.tiles)).sort((a, b) => a - b);

  /** A field's columns a beaver can scavenge, the rest gone (`ruins.access`: a dry neighbour of eight at the column's
   *  own height that nothing stands on, where its field's columns and the place's objects close it in). Taking one away
   *  only frees ground, so one pass leaves every column scavengeable. */
  function scavenged(tiles: readonly number[]): number[] {
    const field = new Set(tiles);
    const open = (j: number, z: number) => heights[j] === z && !field.has(j) && !occupied[j] && !(ground.depth[j] > 0);
    return tiles.filter((i) => {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && open((y + dy) * W + x + dx, heights[i])) return true;
      return false;
    });
  }
}

/** The window a place's field levels are read in: the tiles within this many of a tile, each way. */
const LEVEL_REACH = 2;

/** The levels a place's fields follow: each tile's the level most of the tiles within `LEVEL_REACH` of it stand at (its
 *  own where it is among the most, else the lowest of them). A real place's land is speckled a level up and down from
 *  tile to tile (on Godavari Delta 98 % of its dry tiles touch another level), so no tile of it lies a tile or more in
 *  from its level's rim and no field could follow it; the majority keeps a bench's edge and a cliff where they stand and
 *  takes the speckle out, so the fields follow the land's own contours. */
export function fieldLevels(heights: ArrayLike<number>, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const count = new Int32Array(256);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      count.fill(0);
      let best = 0;
      for (let yy = Math.max(0, y - LEVEL_REACH); yy <= Math.min(H - 1, y + LEVEL_REACH); yy++)
        for (let xx = Math.max(0, x - LEVEL_REACH); xx <= Math.min(W - 1, x + LEVEL_REACH); xx++) best = Math.max(best, ++count[heights[yy * W + xx]]);
      const own = heights[y * W + x];
      let level = own;
      if (count[own] < best) for (let k = 0; k < 256; k++) if (count[k] === best) {
        level = k;
        break;
      }
      out[y * W + x] = level;
    }
  return out;
}

/** The ruin fields ruled square (the measure D535 holds every place to): each group of ruin tiles joined side
 *  by side, `least` or more, that fills its bounding box exactly with both sides 3 tiles or more, as its box
 *  [x, y, width, height]. */
export function ruledRuinFields(tiles: readonly number[], W: number, least = 9): [number, number, number, number][] {
  const set = new Set(tiles);
  const seen = new Set<number>();
  const out: [number, number, number, number][] = [];
  for (const t of tiles) {
    if (seen.has(t)) continue;
    seen.add(t);
    const stack = [t];
    let n = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || !set.has(j) || seen.has(j)) continue;
        seen.add(j);
        stack.push(j);
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (n >= least && w >= 3 && h >= 3 && n === w * h) out.push([x0, y0, w, h]);
  }
  return out;
}
