// The ground's measures (docs/MAPCRAFT.md section 5; PREMISES §2.2 stage 2's `measureLand`): how much of a map is
// dead flat, how many of its height steps are one level, how much of it stands on its three commonest levels, and
// how much of its dry land is thin ledges: the stair treads and contour bands the game's widest view shows as
// hatching, where broad benches divided by bold scarps read as land.

/** A map's ground, each a share in [0, 1]. */
export interface GroundMeasures {
  /** Of the steps between 4-neighbours whose levels differ, those of one level. */
  s1: number;
  /** Of the tiles, those whose 8 neighbours (on the map) stand at their level. */
  flat: number;
  /** Of the tiles, those on the map's three commonest levels. */
  top3: number;
  /** Of the dry tiles, those on a thin ledge: across a row or a column through the tile, its level runs fewer
   *  than `THIN` tiles between two dry tiles at other levels, one lower and one higher (a tread of a stair), or
   *  both lower (a ridgelet). A run that ends at water or the map's edge is a bank or a border, not a ledge. */
  thin: number;
}

/** A ledge narrower than this, across its fall line, reads as a stair tread or a contour band. */
export const THIN = 5;

/** A thin ledge's kind, along a row (dx 1) or a column (dy 1) through tile (x, y) of `h`: 0 none, 1 a tread (the
 *  level's run there, fewer than `THIN` tiles, ends at a dry tile lower on one side and higher on the other), 2 a
 *  ridgelet (lower on both sides). A run that ends at water or the map's edge, or between two higher tiles (a
 *  gully), is no ledge. `ends` gets the levels at the run's two ends (the lower first), then the lower end's tile. */
export function ledgeAt(h: ArrayLike<number>, W: number, H: number, x: number, y: number, dx: number, dy: number, isWet: (i: number) => boolean, ends?: number[]): 0 | 1 | 2 {
  const L = h[y * W + x];
  let n = 1;
  let xa = x - dx;
  let ya = y - dy;
  while (xa >= 0 && ya >= 0 && h[ya * W + xa] === L && !isWet(ya * W + xa)) {
    if (++n >= THIN) return 0;
    xa -= dx;
    ya -= dy;
  }
  let xb = x + dx;
  let yb = y + dy;
  while (xb < W && yb < H && h[yb * W + xb] === L && !isWet(yb * W + xb)) {
    if (++n >= THIN) return 0;
    xb += dx;
    yb += dy;
  }
  if (xa < 0 || ya < 0 || xb >= W || yb >= H) return 0;
  const ia = ya * W + xa;
  const ib = yb * W + xb;
  if (isWet(ia) || isWet(ib)) return 0;
  const ha = h[ia];
  const hb = h[ib];
  if (ha > L && hb > L) return 0;
  if (ends) {
    ends[0] = Math.min(ha, hb);
    ends[1] = Math.max(ha, hb);
    ends[2] = ha < hb ? ia : ib;
  }
  return ha < L && hb < L ? 2 : 1;
}

/** The ground's measures on `heights` (W × H), `wet` the tiles holding water (null for none). */
export function measureGround(heights: ArrayLike<number>, W: number, H: number, wet: ((i: number) => boolean) | null = null): GroundMeasures {
  const N = W * H;
  const isWet = wet ?? (() => false);
  let steps = 0;
  let one = 0;
  let flat = 0;
  let dry = 0;
  let thin = 0;
  const count = new Map<number, number>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const h = heights[i];
      count.set(h, (count.get(h) ?? 0) + 1);
      if (x + 1 < W && heights[i + 1] !== h) {
        steps++;
        if (Math.abs(heights[i + 1] - h) === 1) one++;
      }
      if (y + 1 < H && heights[i + W] !== h) {
        steps++;
        if (Math.abs(heights[i + W] - h) === 1) one++;
      }
      let level = true;
      for (let dy = -1; dy <= 1 && level; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (heights[yy * W + xx] !== h) {
            level = false;
            break;
          }
        }
      if (level) flat++;
      if (isWet(i)) continue;
      dry++;
      if (ledgeAt(heights, W, H, x, y, 1, 0, isWet) || ledgeAt(heights, W, H, x, y, 0, 1, isWet)) thin++;
    }
  const top3 = [...count.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  return { s1: steps ? one / steps : 1, flat: flat / N, top3: top3 / N, thin: dry ? thin / dry : 0 };
}
