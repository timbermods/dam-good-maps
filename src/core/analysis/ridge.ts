// The dam-wall check (D111, `terrain.dam_wall`): catch a ridge-like wall, a
// straight band of rock across a valley with a gap where the river runs through it — the stamped
// dam site of D25 — and fail on it. It reads only the surface and the water, so it runs on any map.
//
// A wall is found at a water tile (the gap) and one of 8 line orientations (every 22.5°) when, on
// BOTH sides of the gap along the line:
//   - at least 6 wall points follow the gap (the first within 8 steps of it, at most one miss);
//   - a wall point stands 2–6 levels above the ground 4–7 tiles away on both faces (a band, not a
//     slope; D25 builds the crest 2–6 above the floodplain), and each face drops at least 2 levels
//     in a single step from the band (a vertical face, as a stamped band has);
//   - the band is thin: 2–8 tiles thick where it stands within a level of its crest;
// and over both sides together:
//   - its crest is flat: the wall points' levels span at most 1 level;
//   - both faces rise from the same floor: the median ground 4–7 tiles out on each face differs by
//     at most 1 level;
//   - that floor is dry valley floor: for at least three quarters of the wall points, the ground
//     4–7 tiles out on at least one face holds no water (a wall across a valley stands on its dry
//     floor; a natural divide between two water bodies does not);
//   - its thickness is even: the thicknesses span at most 3 tiles.
// Gaps within 12 tiles of each other count as one wall. The rule was written from D25's geometry
// (a straight band 5 thick, crest flat, floor on both sides, the channel cut through it) before it
// was run on any map set (the M9 design prototype, investigation/generative/lib/ridge.ts; ported
// unchanged). prototype/validate.py `dam_walls` is the same rule; the oracle compares them.

const C22 = 0.9238795325112867; // cos 22.5°
const S22 = 0.3826834323650898; // sin 22.5°
const R2 = Math.SQRT1_2;
const LINES: readonly (readonly [number, number])[] = [
  [1, 0], [C22, S22], [R2, R2], [S22, C22], [0, 1], [-S22, C22], [-R2, R2], [-C22, S22],
];

export interface Wall {
  x: number;
  y: number;
  /** The line's direction (unit vector) and the wall points on each side. */
  line: readonly [number, number];
  points: number;
  crest: number;
  floor: number;
}

interface Probe {
  ok: boolean;
  crest: number;
  floorA: number;
  floorB: number;
  thick: number;
  dry: boolean;
}

export function damWalls(h: ArrayLike<number>, W: number, H: number, depth: ArrayLike<number>): Wall[] {
  const N = W * H;
  const at = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    return xi < 0 || yi < 0 || xi >= W || yi >= H ? -1 : yi * W + xi;
  };
  const probe = (px: number, py: number, nx: number, ny: number): Probe => {
    const c = at(px, py);
    const bad: Probe = { ok: false, crest: 0, floorA: 0, floorB: 0, thick: 0, dry: false };
    if (c < 0 || depth[c] > 0.05) return bad;
    const crest = h[c];
    const floors: number[] = [];
    let dry = false;
    let wetFace = false;
    for (const sgn of [1, -1]) {
      let f = Infinity;
      for (let m = 4; m <= 7; m++) {
        const j = at(px + sgn * m * nx, py + sgn * m * ny);
        if (j < 0) return bad;
        if (h[j] < f) f = h[j];
        if (depth[j] > 0.05) wetFace = true;
      }
      if (!wetFace) dry = true;
      wetFace = false;
      if (crest < f + 2 || crest > f + 6) return bad;
      // a vertical face: two levels or more down in one step from the band
      let face = false;
      for (let m = 0; m <= 5 && !face; m++) {
        const a = at(px + sgn * m * nx, py + sgn * m * ny);
        const b = at(px + sgn * (m + 1) * nx, py + sgn * (m + 1) * ny);
        if (a < 0 || b < 0) return bad;
        if (h[a] >= crest - 1 && h[a] - h[b] >= 2) face = true;
      }
      if (!face) return bad;
      floors.push(f);
    }
    let thick = 1;
    for (const sgn of [1, -1])
      for (let m = 1; m <= 8; m++) {
        const j = at(px + sgn * m * nx, py + sgn * m * ny);
        if (j < 0 || h[j] < crest - 1) break;
        thick++;
      }
    if (thick < 2 || thick > 8) return bad;
    return { ok: true, crest, floorA: floors[0], floorB: floors[1], thick, dry };
  };
  const found: Wall[] = [];
  for (let i = 0; i < N; i++) {
    if (!(depth[i] > 0.05)) continue;
    const cx = i % W;
    const cy = (i - cx) / W;
    if (found.some((w) => Math.abs(w.x - cx) + Math.abs(w.y - cy) <= 12)) continue;
    for (const [tx, ty] of LINES) {
      const nx = -ty;
      const ny = tx;
      const sides: Probe[][] = [];
      for (const sgn of [1, -1]) {
        const pts: Probe[] = [];
        let started = false;
        let miss = 0;
        for (let k = 1; k <= 40; k++) {
          const p = probe(cx + sgn * k * tx, cy + sgn * k * ty, nx, ny);
          if (p.ok) {
            started = true;
            miss = 0;
            pts.push(p);
          } else if (!started) {
            if (k > 8) break;
          } else if (++miss > 1) break;
        }
        sides.push(pts);
      }
      if (sides[0].length < 6 || sides[1].length < 6) continue;
      const all = [...sides[0], ...sides[1]];
      const crests = all.map((p) => p.crest);
      if (Math.max(...crests) - Math.min(...crests) > 1) continue;
      const med = (v: number[]) => v.slice().sort((a, b) => a - b)[v.length >> 1];
      const fa = med(all.map((p) => p.floorA));
      const fb = med(all.map((p) => p.floorB));
      if (Math.abs(fa - fb) > 1) continue;
      const th = all.map((p) => p.thick);
      if (Math.max(...th) - Math.min(...th) > 3) continue;
      if (all.filter((p) => p.dry).length < 0.75 * all.length) continue;
      found.push({ x: cx, y: cy, line: [tx, ty], points: all.length, crest: med(crests), floor: Math.min(fa, fb) });
      break;
    }
  }
  return found;
}
