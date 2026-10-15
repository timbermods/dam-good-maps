// Erode's moment (D281, D240): where its dust and falling stones start. Plain data in, plain data out
// (tests/unit/wear.test.ts): the voxels that went in a stage (z·N + tile, core/forces/erode.ts `cue`) and
// the map's columns as the renderer shows them give a few of those voxels, spread through the stage,
// each with the way its rock opened (toward the air that was already there: out of a cave's mouth,
// out from under an overhang, up from a scoured hollow), the level a stone from it lands on, and
// whether it is under a roof and how far out the roof ends (its dust stays in the rock's shade until
// it drifts past there).
// The columns may show the stage's voxels gone or not yet (either reads the same), or lag behind
// (the voxel then opens toward the gesture's focus). Nothing here allocates.

/** The map's voxels as shown: its size and a tile's column (bit z: the block from level z to z + 1). */
export interface Voxels {
  readonly W: number;
  readonly H: number;
  mask(i: number): number;
}

/** Floats a sample takes in `wearSamples`' output: the voxel's centre (x, y, z: map axes, x along a row,
 *  y down the rows, z up, in tiles and levels), the way it opened (dx, dy, dz, a unit vector), the level a
 *  stone from it lands on, 1 under a roof (rock above it in its column, the stage's voxels gone) else 0,
 *  and how far from its centre, across the land along the way it opened, the roof ends (0 in the open;
 *  ROOF_REACH at most). */
export const WEAR_STRIDE = 9;

/** How far out (tiles) `wearSamples` looks for a roof's end. */
export const ROOF_REACH = 8;

/** How far out a stone from the voxel lands, in tiles along the way it opened (the renderer's stones
 *  keep to it, so each lands on the ground this found). */
export const STONE_REACH = 0.75;

/** How many of a stage's `went` voxels its dust and stones start from: more where more went, at most `max`. */
export function wearCount(went: number, max: number): number {
  return went > 0 ? Math.min(max, Math.round(1 + Math.sqrt(went) * 1.3)) : 0;
}

/** The voxels of tile `i` among `went` (its bits). */
function wentAt(went: ArrayLike<number>, N: number, i: number): number {
  let bits = 0;
  for (let k = 0; k < went.length; k++) {
    const v = went[k];
    if (v % N === i) bits |= 1 << Math.floor(v / N);
  }
  return bits;
}

/** Solid at (x, y, z), before the stage (`before`) or after it: off the map is air, under level 0 rock. */
function solid(went: ArrayLike<number>, v: Voxels, x: number, y: number, z: number, before: boolean): boolean {
  if (z < 0) return true;
  if (z >= 31 || x < 0 || y < 0 || x >= v.W || y >= v.H) return false;
  const i = y * v.W + x;
  const w = wentAt(went, v.W * v.H, i);
  const m = before ? v.mask(i) | w : v.mask(i) & ~w;
  return ((m >>> z) & 1) === 1;
}

/** Rock above level `z` at (x, y), the stage's voxels gone (off the map: none). */
function roofed(went: ArrayLike<number>, v: Voxels, x: number, y: number, z: number): boolean {
  if (z >= 30 || x < 0 || y < 0 || x >= v.W || y >= v.H) return false;
  const i = y * v.W + x;
  return (v.mask(i) & ~wentAt(went, v.W * v.H, i)) >>> (z + 1) !== 0;
}

/** The level a stone falling from level `z` at (x, y) lands on, the stage's voxels gone. */
function floorBelow(went: ArrayLike<number>, v: Voxels, x: number, y: number, z: number): number {
  const i = y * v.W + x;
  const m = v.mask(i) & ~wentAt(went, v.W * v.H, i);
  for (let k = Math.min(z, 31) - 1; k >= 0; k--) if ((m >>> k) & 1) return k + 1;
  return 0;
}

const SIDES = [1, 0, -1, 0, 0, 1, 0, -1] as const;

/** `count` of the voxels that `went`, spread evenly through it, into `out` (WEAR_STRIDE floats each):
 *  each one's centre, the way its rock opened (toward the air beside it and above it before the stage,
 *  a little upward always; enclosed, toward the gesture's `focus`, or up at it), the level a stone
 *  from it lands on (the ground under where it falls out, STONE_REACH along the way it opened),
 *  whether it is under a roof and where that roof ends. Returns how many it wrote. */
export function wearSamples(went: ArrayLike<number>, v: Voxels, focus: { x: number; y: number }, count: number, out: Float32Array): number {
  const N = v.W * v.H;
  const n = Math.min(count, went.length, Math.floor(out.length / WEAR_STRIDE));
  for (let j = 0; j < n; j++) {
    const c = went[Math.floor(((j + 0.5) * went.length) / n)];
    const i = c % N;
    const z = Math.floor(c / N);
    const x = i % v.W;
    const y = (i - x) / v.W;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    for (let s = 0; s < 8; s += 2) {
      if (!solid(went, v, x + SIDES[s], y + SIDES[s + 1], z, true)) {
        dx += SIDES[s];
        dy += SIDES[s + 1];
      }
    }
    if (!solid(went, v, x, y, z + 1, true)) dz += 0.8;
    if (dx === 0 && dy === 0 && dz === 0) {
      // (enclosed as the columns show it: they lag the stage; the opening is toward where the gesture touched)
      const fx = focus.x - x;
      const fy = focus.y - y;
      const l = Math.hypot(fx, fy);
      if (l > 0.5) {
        dx = fx / l;
        dy = fy / l;
      } else dz = 1;
    }
    dz += 0.35;
    const l = Math.hypot(dx, dy, dz);
    dx /= l;
    dy /= l;
    dz /= l;
    // where a stone from it falls out: STONE_REACH along the way it opened, unless that is rock at its level
    const h = Math.hypot(dx, dy);
    let lx = x;
    let ly = y;
    if (h > 0.05) {
      const tx = Math.floor(x + 0.5 + (dx / h) * STONE_REACH);
      const ty = Math.floor(y + 0.5 + (dy / h) * STONE_REACH);
      if (tx >= 0 && ty >= 0 && tx < v.W && ty < v.H && !solid(went, v, tx, ty, z, false)) {
        lx = tx;
        ly = ty;
      }
    }
    const o = j * WEAR_STRIDE;
    out[o] = x + 0.5;
    out[o + 1] = y + 0.5;
    out[o + 2] = z + 0.5;
    out[o + 3] = dx;
    out[o + 4] = dy;
    out[o + 5] = dz;
    out[o + 6] = floorBelow(went, v, lx, ly, z);
    const under = roofed(went, v, x, y, z);
    out[o + 7] = under ? 1 : 0;
    // where the roof ends, out along the way it opened (straight up: it is open right there)
    let exit = 0;
    if (under && h > 0.05)
      for (exit = 0.25; exit < ROOF_REACH; exit += 0.25)
        if (!roofed(went, v, Math.floor(x + 0.5 + (dx / h) * exit), Math.floor(y + 0.5 + (dy / h) * exit), z)) break;
    out[o + 8] = exit;
  }
  return n;
}
