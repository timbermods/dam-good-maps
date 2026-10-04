// Unleash, on a source (PLAN §20 D239): a placed water or badwater source carves its own course with
// Carve's engine. The source stays the river's origin (no second source: the carve is a dry one, the
// source's own water runs down it); its strength sets the river's width (the width a Carve's Keep
// river would give that strength); from a pool or a lake, the river breaks out where the water would
// spill over, the lowest point of its rim, like a lake breaching, and carves on from there.

import * as portable from "../../math/portable";

/** How deep the water at a source must stand for it to be in a pool or a lake (levels): a pond, not
 *  the thin sheet a new source spreads over flat ground. */
export const POOL_DEPTH = 0.5;
/** A water surface this close to the source's belongs to its pool (levels): a lake is level. */
const LEVEL = 0.2;
/** The most tiles a pool is followed over (a very large lake is still breached at its lowest rim
 *  within this). */
const POOL_MAX = 40_000;

/** A carve's width for a source of `strength` (2–24 tiles): the width whose Keep river source has
 *  that strength (Carve's own `sourceStrength`, inverted), so a stronger source makes a wider river. */
export function unleashWidth(strength: number): number {
  const w = 2.8 + ((Math.max(0.5, strength) - 0.5) * 10) / 7.5;
  return Math.round(Math.max(2, Math.min(24, w)) * 10) / 10;
}

/** The tile a source's water rises from: a badwater source's is the middle of its 3 × 3. */
export function sourceTile(e: { template: string; x: number; y: number }, W: number): number {
  return e.template === "BadwaterSource" ? (e.y + 1) * W + (e.x + 1) : e.y * W + e.x;
}

export interface Breakout {
  /** Where the carve starts. */
  origin: number;
  /** The pool or lake the source stands in (its tiles), or null: it starts at the source. */
  pool: number[] | null;
  /** The pool's rim's lowest tile, where it spills over (the origin), or null. */
  spill: number | null;
}

/** Where a source's river starts: at the source; or, when it stands in a pool or a lake (water at
 *  least `POOL_DEPTH` deep, a level surface round it), at the lowest tile of that water's rim, where
 *  it would spill over (ties: the nearest to the source). Aimed at `toward`, it breaks out where the
 *  rim is nearest that point instead. `keep`: ground it leaves alone (the land above the layer showing,
 *  caves). */
export function breakout(W: number, H: number, heights: ArrayLike<number>, depth: ArrayLike<number>, source: number, keep: Uint8Array | null = null, toward: number | null = null): Breakout {
  const at = { origin: source, pool: null, spill: null };
  if (!(depth[source] >= POOL_DEPTH)) return at;
  const level = heights[source] + depth[source];
  const inPool = new Uint8Array(W * H);
  const pool: number[] = [source];
  inPool[source] = 1;
  for (let k = 0; k < pool.length && pool.length < POOL_MAX; k++) {
    const i = pool[k];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (inPool[j] || depth[j] < 0.02 || Math.abs(heights[j] + depth[j] - level) > LEVEL) continue;
      inPool[j] = 1;
      pool.push(j);
    }
  }
  // the rim: the ground round the water, where it would spill over (its lowest; the nearest of the
  // lowest to the source)
  const sx = toward === null ? source % W : toward % W;
  const sy = toward === null ? (source - (source % W)) / W : (toward - (toward % W)) / W;
  let spill = -1;
  let low = Infinity;
  let near = Infinity;
  for (const i of pool) {
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
      const j = yy * W + xx;
      if (inPool[j] || keep?.[j]) continue;
      // (aimed: the rim nearest where it is aimed; else the lowest, the nearest of them)
      const h = toward === null ? heights[j] : 0;
      const d = portable.hypot(xx - sx, yy - sy);
      if (h < low || (h === low && d < near)) {
        low = h;
        near = d;
        spill = j;
      }
    }
  }
  if (spill < 0 || pool.length < 4) return at;
  return { origin: spill, pool, spill };
}
