// The reserves (D178, D496): our own models of the game's (`ReservePile.Model`, `ReserveWarehouse.Model`,
// `ReserveTank.Model`, the one model for each, flipped as the game flips it), and their stock as the game's
// visualizers draw it (`Timberborn.StockpileVisualization`). Read from the game's models for their measures and colours
// alone (numbers; no mesh or texture of the game's is used), in their local frame (x east, y up, z the map's y; the
// 2 × 2 footprint 0…2, its entrance at its front, z 0, on its right half):
// - the pile: a pen of grey-green boards 0.48 high on an amber-brown frame 0.1 high round a floor of dirt, posts at its
//   corners, open at its entrance under an arch 1.01 high;
// - the warehouse: a floor of boards in the same frame, posts 0.69 high at three corners joined by sagging ropes, and
//   the arch;
// - the tank: a barrel of grey-green staves 1.54 across from 1.29 to 2.43 under a low cone to 2.81, banded, on a base
//   on four splayed legs, a pipe down its middle, braces between the legs, and a pump house with an arched door at its
//   entrance;
// - each with the pale shield of a sign at its entrance under its holder, and a pale threshold.
// Their stock (palette.ts `RESERVE`): the pile's dirt a heap that rises as it fills (`StockpilePlaneVisualizer`: the
// heap's model `MediumDirtPile` from 0.81 below its place to 0.04 below it, by the stock's share to the 0.8th power),
// its other goods stacked over each of its four tiles in layers of four, crossing layer by layer, the last layer's
// goods laid one by one (`StockpileGoodPileVisualizer`); the warehouse's boxes in 36 columns of boxes 0.232 a side,
// rising a box at a time (`StockpileGoodColumnVisualizer`, 144 boxes at most: 4 high); the tank shows none (it has no
// visualizer). The game picks at random which piles take the last layer's goods and which columns rise first, each
// time it loads; ours picks them in a fixed order.

import { RESERVE, type Rgb } from "./palette";
import { Parts, type V } from "./relicParts";

/** The reserves' templates. */
export const RESERVES = ["ReservePile", "ReserveWarehouse", "ReserveTank"] as const;

/** A model's triangles by colour (our frame: centred on its footprint's middle, x east, y up, z south). */
type Built = { points: number[]; colour: Rgb }[];

/** Parts in the game's frame, mirrored across the footprint (x to 2 − x) when the reserve is flipped. */
class Reserve extends Parts {
  constructor(private readonly flipped: boolean) {
    super([1, 1]);
  }
  override ours(p: V): V {
    return super.ours(this.flipped ? [2 - p[0], p[1], p[2]] : p);
  }
  /** A box from `lo` to `hi`, its faces out; its bottom left off unless `bottom`. */
  box(lo: V, hi: V, colour: Rgb, bottom = false): this {
    const mid: V = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], colour, mid);
    if (bottom) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], colour, mid);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], colour, mid);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], colour, mid);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], colour, mid);
    this.face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], colour, mid);
    return this;
  }
}

/** The sign at the entrance: a shield (its outline on the plane z 0) under its holder, `peak` its holder's top's
 *  peak (the tank's is gabled). */
function sign(m: Reserve, peak: number): void {
  const R = RESERVE;
  const shield: [number, number][] = [[1.309, 0.894], [1.691, 0.894], [1.691, 0.652], [1.622, 0.576], [1.5, 0.532], [1.377, 0.576], [1.309, 0.652]];
  m.face(shield.map(([x, y]) => [x, y, -0.003] as V), R.signOut, [1.5, 0.7, 1]);
  m.face(shield.map(([x, y]) => [x, y, 0.003] as V), R.signIn, [1.5, 0.7, -1]);
  // (its holder: a board round the arch's beam, or over the pump house's door)
  m.box([1.304, 0.89, -0.001], [1.697, 1.018, 0.138], R.holder);
  if (peak > 1.018) {
    const mid: V = [1.5, 0.95, 0.07];
    for (const z of [-0.001, 0.138]) m.face([[1.304, 1.018, z], [1.697, 1.018, z], [1.5, peak, z]], R.holder, mid);
    for (const x of [1.304, 1.697]) m.face([[x, 1.018, -0.001], [x, 1.018, 0.138], [1.5, peak, 0.138], [1.5, peak, -0.001]], R.holder, mid);
  }
}

/** The pile's and warehouse's frame round their floor (a gap at the entrance, its threshold in it), the arch over their
 *  entrance and the sign. */
function pen(m: Reserve, threshold: Rgb): void {
  const R = RESERVE;
  m.box([0, 0, 0], [1.12, 0.1, 0.14], R.frame);
  m.box([1.86, 0, 0], [2, 0.1, 0.14], R.frame);
  m.box([0, 0, 1.86], [2, 0.1, 2], R.frame);
  m.box([0, 0, 0.14], [0.14, 0.1, 1.86], R.frame);
  m.box([1.86, 0, 0.14], [2, 0.1, 1.86], R.frame);
  m.box([1.12, 0, 0], [1.86, 0.04, 0.14], threshold);
  // the arch: two posts and a beam over the entrance
  m.box([0.99, 0.1, 0.01], [1.11, 0.89, 0.12], R.frame);
  m.box([1.88, 0.1, 0.01], [2, 0.89, 0.12], R.frame);
  m.box([0.99, 0.89, 0.01], [2, 1.01, 0.12], R.frame);
  sign(m, 1.018);
}

/** A reserve pile: a pen of boards round a floor of dirt. */
function pile(m: Reserve): void {
  const R = RESERVE;
  pen(m, R.threshold.ReservePile);
  m.face([[0.1, 0.04, 0.1], [1.9, 0.04, 0.1], [1.9, 0.04, 1.9], [0.1, 0.04, 1.9]], R.dirtFloor, [1, -1, 1]);
  for (const [x, z] of [[0, 0], [0, 1.88], [1.88, 1.88]]) m.box([x, 0.1, z], [x + 0.12, 0.5, z + 0.12], R.post);
  // the walls: three boards high, each a little lighter or darker (its texture's grain)
  const rows = [0.1, 0.23, 0.35, 0.48];
  for (let r = 0; r < 3; r++) {
    const k = [0.96, 1.04, 1][r];
    const c: Rgb = [R.board[0] * k, R.board[1] * k, R.board[2] * k];
    const [y0, y1] = [rows[r], rows[r + 1]];
    m.box([0.02, y0, 0.01], [0.06, y1, 1.98], c);
    m.box([0.06, y0, 1.94], [1.99, y1, 1.98], c);
    m.box([1.95, y0, 0.01], [1.99, y1, 1.94], c);
    m.box([0.06, y0, 0.01], [1, y1, 0.05], c);
  }
}

/** A rope from `a` to `b`, sagging `sag` at its middle. */
function rope(m: Reserve, a: V, b: V, sag: number): void {
  const pts: V[] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  m.beam(pts, 0.04, RESERVE.rope);
}

/** A reserve warehouse: a floor of boards, posts at its corners joined by ropes. */
function warehouse(m: Reserve): void {
  const R = RESERVE;
  pen(m, R.threshold.ReserveWarehouse);
  m.face([[0.14, 0.05, 0.14], [1.86, 0.05, 0.14], [1.86, 0.05, 1.86], [0.14, 0.05, 1.86]], R.floor, [1, -1, 1]);
  for (const [x, z] of [[0.01, 0.01], [0.01, 1.87], [1.87, 1.87]]) m.box([x, 0.1, z], [x + 0.12, 0.69, z + 0.12], R.post);
  // the ropes, 0.56 high at the posts, sagging to 0.48 between them, tied round each post
  rope(m, [0.07, 0.56, 0.13], [0.07, 0.56, 1.87], 0.08);
  rope(m, [0.13, 0.56, 1.93], [1.87, 0.56, 1.93], 0.08);
  rope(m, [1.93, 0.56, 1.87], [1.93, 0.56, 0.13], 0.08);
  rope(m, [0.13, 0.56, 0.07], [0.99, 0.56, 0.07], 0.04);
  for (const [x, z] of [[0, 0], [0, 1.86], [1.86, 1.86], [0.98, 0], [1.86, 0]]) m.box([x, 0.54, z], [x + 0.14, 0.6, z + 0.14], R.tie, true);
}

/** A reserve tank: a barrel on legs over a pump house. */
function tank(m: Reserve): void {
  const R = RESERVE;
  const up: V = [0, 1, 0];
  const centre: V = [1, 0, 1];
  // the barrel: its base, its staves, its cone and its band (16 round, as the game's)
  m.revolve(centre, up, [1, 0, 0], [0, 0, 1], [[0.95, 0], [0.95, 0.7], [1.0, 0.84], [1.29, 0.84], [1.29, 0.77]], 16, R.frame);
  m.revolve(centre, up, [1, 0, 0], [0, 0, 1], [[1.29, 0.77], [2.43, 0.77], [2.8, 0.555], [2.81, 0.555], [2.81, 0]], 16, R.board);
  m.revolve(centre, up, [1, 0, 0], [0, 0, 1], [[2.32, 0.77], [2.32, 0.81], [2.45, 0.81], [2.45, 0.77]], 16, R.frame, [2.385, 0.79]);
  // the pipe down its middle
  m.revolve(centre, up, [1, 0, 0], [0, 0, 1], [[0, 0.17], [0.97, 0.17]], 8, R.pipe);
  // the legs: splayed to the knee under the base, then up its side; the fourth over the pump house
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1]]) {
    const at = (x: number, y: number, z: number): V => [1 + sx * (x - 1), y, 1 + sz * (z - 1)];
    m.beam([at(0.264, 0, 0.301), at(0.472, 1.033, 0.504), at(0.446, 2.48, 0.48)], 0.135, R.post);
  }
  m.beam([[1.526, 1.033, 0.5], [1.545, 2.48, 0.477]], 0.135, R.post);
  // the braces between the legs
  m.beam([[0.338, 0.263, 1.665], [1.656, 0.263, 1.665]], 0.1, R.post);
  m.beam([[0.405, 0.668, 0.42], [0.405, 0.668, 1.6]], 0.09, R.post);
  m.beam([[0.496, 0.959, 1.555], [1.61, 0.267, 1.68]], 0.06, R.post);
  m.beam([[0.4, 0.293, 1.662], [1.512, 0.938, 1.536]], 0.06, R.post);
  // the pump house: walls under an arched roof running back from the entrance
  m.box([1.06, 0, 0], [1.94, 0.61, 0.92], R.house);
  const roof: [number, number][] = [[1.06, 0.61], [1.15, 0.89], [1.31, 1.01], [1.5, 1.04], [1.69, 1.01], [1.85, 0.89], [1.94, 0.61]];
  const inside: V = [1.5, 0.7, 0.46];
  for (const z of [0, 0.92]) m.face(roof.map(([x, y]) => [x, y, z] as V), R.house, inside);
  for (let k = 0; k + 1 < roof.length; k++) m.face([[roof[k][0], roof[k][1], 0], [roof[k + 1][0], roof[k + 1][1], 0], [roof[k + 1][0], roof[k + 1][1], 0.92], [roof[k][0], roof[k][1], 0.92]], R.house, inside);
  // its door: a grey-green arched frame round a dark door
  const out: V = [1.5, 0.4, 1];
  m.face([[1.15, 0, -0.003], [1.85, 0, -0.003], [1.85, 0.42, -0.003], [1.78, 0.61, -0.003], [1.65, 0.76, -0.003], [1.5, 0.8, -0.003], [1.35, 0.76, -0.003], [1.22, 0.61, -0.003], [1.15, 0.42, -0.003]], R.doorFrame, out);
  m.face([[1.25, 0.01, -0.006], [1.75, 0.01, -0.006], [1.76, 0.22, -0.006], [1.72, 0.53, -0.006], [1.62, 0.69, -0.006], [1.38, 0.69, -0.006], [1.28, 0.53, -0.006], [1.24, 0.22, -0.006]], R.door, out);
  m.box([1.14, 0, -0.01], [1.86, 0.04, 0.12], R.threshold.ReserveTank);
  sign(m, 1.068);
}

/** The tank's shadow in Standard's bake (light.ts `objectCasters`, `PLANT_SHAPES`): upright discs over each of the four
 *  tiles of its footprint (bottom, top, radius; levels and tiles, before light.ts's inset), moved `shift` along each
 *  way from the tile's middle toward the footprint's (light.ts `CORNER`), from its barrel's base to its top: fitted as
 *  the shader draws them to the model's own shadow along the 45° sun at 8 headings, both where it falls and how large.
 *  The ground under the barrel, between its legs, is lit, as the game's. */
export const RESERVE_TANK_SHADOW: readonly (readonly [number, number, number])[] = [[0.95, 2.81, 0.6]];
export const RESERVE_TANK_CAST = { shift: 0.15, lit: 0, cap: Infinity };

/** A reserve's model (`template` one of `RESERVES`), flipped as the game flips it. */
export function reserveParts(template: string, flipped = false): Built {
  const m = new Reserve(flipped);
  if (template === "ReservePile") pile(m);
  else if (template === "ReserveWarehouse") warehouse(m);
  else tank(m);
  return m.parts();
}

// ------------------------------------------------------------------------------------------------ their stock

/** The goods a pile shows stacked (the game's `GoodPileVisualizations`), and dirt, heaped (`StockpilePlaneVisualizer`).
 *  Index + 1 is a reserve's `stockGood` in the entity view (0: any other good, or none). */
export const PILE_GOODS = ["Dirt", "Log", "Plank", "TreatedPlank", "ScrapMetal", "MetalBlock"] as const;

/** A pile's capacity and the warehouse's (`StockpileSpec.MaxCapacity`). */
const PILE_CAPACITY = 160;
const WAREHOUSE_CAPACITY = 200;

/** The dirt heap's height over each point of a 9 × 9 grid across ±0.95 of its middle (rows along the map's y, then
 *  east), read from the game's `MediumDirtPile` (its corner the game leaves lower, lower here). */
const HEAP = [
  [0.423, 0.423, 0.423, 0.377, 0.172, 0.17, 0.17, 0.17, 0.17],
  [0.424, 0.462, 0.445, 0.445, 0.369, 0.285, 0.269, 0.263, 0.333],
  [0.424, 0.5, 0.55, 0.559, 0.553, 0.548, 0.526, 0.491, 0.435],
  [0.424, 0.519, 0.629, 0.718, 0.745, 0.718, 0.636, 0.53, 0.435],
  [0.424, 0.52, 0.647, 0.756, 0.841, 0.757, 0.655, 0.53, 0.435],
  [0.424, 0.518, 0.628, 0.711, 0.737, 0.712, 0.634, 0.527, 0.435],
  [0.424, 0.511, 0.577, 0.604, 0.62, 0.605, 0.578, 0.516, 0.434],
  [0.424, 0.494, 0.5, 0.503, 0.506, 0.503, 0.5, 0.494, 0.433],
  [0.424, 0.428, 0.428, 0.428, 0.429, 0.428, 0.428, 0.428, 0.428],
];
/** The heap's foot (the game's model's lowest), and where the game moves it (`Dirt2x2`: 0.82 down, then 0.01 to 0.78
 *  up by the stock's share to the 0.8th power, its `NonLinearity` −0.2). */
const HEAP_FOOT = 0.014;

/** The dirt heap (lifted by `heapLift`). */
function heap(m: Reserve): void {
  const g = (i: number) => 1 - 0.95 + (1.9 * i) / 8;
  const at = (i: number, j: number): V => [g(i), HEAP[j][i], g(j)];
  const mid: V = [1, 0, 1];
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 8; i++) {
      m.face([at(i, j), at(i + 1, j), at(i + 1, j + 1)], RESERVE.dirt, mid);
      m.face([at(i, j), at(i + 1, j + 1), at(i, j + 1)], RESERVE.dirt, mid);
    }
  // its sides, down to its foot
  for (let k = 0; k < 8; k++)
    for (const [a, b] of [[at(k, 0), at(k + 1, 0)], [at(k, 8), at(k + 1, 8)], [at(0, k), at(0, k + 1)], [at(8, k), at(8, k + 1)]] as [V, V][])
      m.face([a, b, [b[0], HEAP_FOOT, b[2]], [a[0], HEAP_FOOT, a[2]]], RESERVE.dirt, mid);
}

/** How high the dirt heap stands over its place at `amount` (the game's `StockpilePlaneVisualizer`). */
export function heapLift(amount: number): number {
  const p = Math.min(1, Math.max(0, amount / PILE_CAPACITY));
  return -0.82 + 0.01 + (0.78 - 0.01) * Math.pow(p, 0.8);
}

/** Each pile good's model (`GoodVisualization`): its goods' length, height and width, how far apart they lie, and
 *  whether round (a log). */
const GOOD_SHAPES: Readonly<Record<string, { long: number; high: number; wide: number; step: number; round?: boolean }>> = {
  Log: { long: 0.9, high: 0.204, wide: 0.174, step: 0.1732, round: true },
  Plank: { long: 0.774, high: 0.17, wide: 0.154, step: 0.2 },
  TreatedPlank: { long: 0.774, high: 0.17, wide: 0.154, step: 0.2 },
  ScrapMetal: { long: 0.78, high: 0.171, wide: 0.136, step: 0.2 },
  MetalBlock: { long: 0.774, high: 0.17, wide: 0.154, step: 0.2 },
};
/** A layer's height (the goods' `Offset.z`), the layers a tile's pile holds (its share of the capacity, four a
 *  layer), and the goods a layer holds. */
const LAYER = 0.17;
const PILE_LAYERS = 10;
const PER_LAYER = 4;

/** One good lying at (x, z) with its top at `top`, along x or (`across`) along z. */
function good(m: Reserve, shape: (typeof GOOD_SHAPES)[string], colour: Rgb, x: number, z: number, top: number, across: boolean): void {
  const { long, high, wide, round } = shape;
  const [hx, hz] = across ? [wide / 2, long / 2] : [long / 2, wide / 2];
  if (!round) {
    m.box([x - hx, top - high, z - hz], [x + hx, top, z + hz], colour);
    return;
  }
  const along: V = across ? [0, 0, 1] : [1, 0, 0];
  const end = (s: number): V => [x + along[0] * s * long * 0.5, top - high / 2, z + along[2] * s * long * 0.5];
  m.bar(end(-1), end(1), [[0, 0], [0, high / 2], [1, high / 2], [1, 0]], 6, colour);
}

/** A pile's stack of `name` at `amount` (the game's `StockpileGoodPileVisualizer`): over each of its four tiles the
 *  full layers, crossing layer by layer, the last layer's goods one by one, given to the tiles in turn. */
function stack(m: Reserve, name: string, amount: number): void {
  const shape = GOOD_SHAPES[name];
  const colour = RESERVE.goods[name];
  const n = Math.min(Math.max(0, Math.floor(amount)), PILE_CAPACITY);
  const perLevel = PER_LAYER * 4;
  const levels = Math.floor(n / perLevel);
  const items = n % perLevel;
  const odd = levels % 2 !== 0;
  const top = levels * LAYER;
  const row = (k: number) => shape.step * (k - 1.5);
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([tx, ty], p) => {
    const [cx, cz] = [tx + 0.5, ty + 0.5];
    const layer = (y: number, across: boolean) => {
      for (let k = 0; k < PER_LAYER; k++) good(m, shape, colour, across ? cx + row(k) : cx, across ? cz : cz + row(k), y, across);
    };
    // (the game's levels down from the pile's place, those above the floor seen)
    for (let i = 0; i < PILE_LAYERS; i++) if (top - LAYER * i > 0.05) layer(top - LAYER * i, odd !== (i % 2 !== 0));
    const mine = Math.floor(items / 4) + (p < items % 4 ? 1 : 0);
    if (mine >= PER_LAYER) layer(top + LAYER, !odd);
    else for (let k = 0; k < mine; k++) good(m, shape, colour, odd ? cx + row(k) : cx, odd ? cz : cz + row(k), top + LAYER, odd);
  });
}

/** The columns' places in the warehouse (each tile's 3 × 3, 0.26 apart), the order the game's would rise in fixed
 *  (it picks at random). */
const COLUMNS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push([tx + 0.5 + 0.26 * i, ty + 0.5 + 0.26 * j]);
  // (spread round the floor: every 7th, 7 being prime to 36)
  return out.map((_, k) => out[(k * 7) % out.length]);
})();
/** A box's side (the game's `9BoxColumn`), the boxes a column holds at most (`Box4H`), and where the columns stand. */
const BOX = 0.232;
const BOX_LEVELS = 4;
const BOX_BASE = 0.04;

/** The warehouse's boxes at `amount` (the game's `StockpileGoodColumnVisualizer`: 144 boxes for its 200, every column
 *  a box higher for each 36, the rest a box higher than the others). */
function boxes(m: Reserve, amount: number): void {
  const most = COLUMNS.length * BOX_LEVELS;
  const n = Math.min(Math.ceil(Math.max(0, amount) * (most / WAREHOUSE_CAPACITY)), most);
  const levels = Math.floor(n / COLUMNS.length);
  const raised = n % COLUMNS.length;
  COLUMNS.forEach(([x, z], k) => {
    const top = BOX_BASE + (levels + (k < raised ? 1 : 0)) * BOX;
    if (top > 0.06) m.box([x - BOX / 2, 0.05, z - BOX / 2], [x + BOX / 2, top, z + BOX / 2], RESERVE.box);
  });
}

/** A reserve's stock as the game shows it: its model's key and parts, and how high it stands over the reserve's
 *  place (the dirt heap moves; the rest is built at its height), or null (none shown: the tank, an empty reserve, a
 *  good no visualizer shows). `good` is the good's index in `PILE_GOODS` + 1 (0: another good). */
export function stockOf(template: string, good: number, amount: number, flipped = false): { key: string; parts: () => Built; lift: number } | null {
  const f = flipped ? ".flipped" : "";
  if (template === "ReservePile") {
    const name = PILE_GOODS[good - 1];
    if (!name) return null;
    if (name === "Dirt") return amount <= 0 ? null : { key: `ReservePile.dirt${f}`, parts: () => { const m = new Reserve(flipped); heap(m); return m.parts(); }, lift: heapLift(amount) };
    const n = Math.min(Math.max(0, Math.floor(amount)), PILE_CAPACITY);
    if (n === 0) return null;
    return { key: `ReservePile.${name}.${n}${f}`, parts: () => { const m = new Reserve(flipped); stack(m, name, n); return m.parts(); }, lift: 0 };
  }
  if (template === "ReserveWarehouse") {
    const n = Math.min(Math.max(0, Math.ceil(amount * ((COLUMNS.length * BOX_LEVELS) / WAREHOUSE_CAPACITY))), COLUMNS.length * BOX_LEVELS);
    if (n === 0) return null;
    return { key: `ReserveWarehouse.boxes.${n}${f}`, parts: () => { const m = new Reserve(flipped); boxes(m, amount); return m.parts(); }, lift: 0 };
  }
  return null;
}
