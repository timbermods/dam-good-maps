// Lake Basin's shaping only. The shared drainage, rasterizer, settle and checks are unchanged.
import type { Genome } from '../../src/core/land/genome';
import { makeSpec, type Settings, type Difficulty } from '../../src/core/spec/mapspec';
import { stream } from '../../src/core/math/rng';
import { DIRS8 } from '../../src/core/land/num';

/** Confine adoption to the measured default Normal square-map path, as the other prototypes do. */
export function shapeLakeBasin(g: Genome, s: Settings, W: number, H: number, seed: number,
  attempt: number, designedFor: Difficulty = 'normal'): void {
  if (g.theme !== 'lakeBasin' || designedFor !== 'normal' || W !== H || W < 96 || W > 256) return;
  const preset = makeSpec({ seed, theme: 'lakeBasin', size: { x: W, y: H } });
  if (JSON.stringify(s) !== JSON.stringify(preset.settings)) return;
  const rng = stream(seed, 'lake-basin-catchment', attempt);
  const side = Math.min(W, H);
  const focus: [number, number] = [rng.range(0.44, 0.56), rng.range(0.44, 0.56)];

  // Keep the existing valley basin's ragged bays and side valleys. One hollow grows with the map;
  // on large maps its smaller footprint leaves a substantial lake that fills sooner.
  g.parts = g.parts.filter(p => p.kind !== 'basin' && p.kind !== 'caldera');
  g.parts.unshift({ kind: 'basin', at: focus,
    size: side * rng.range(0.25, 0.29) * 1.1 * (side >= 192 ? 0.85 : 1),
    height: -rng.range(5.5, 7) * 1.15, turn: rng.float(),
    extra: rng.range(0.8, 1.4) * 0.5, soft: 0, shape: 'valley' });
  g.focus = focus;
  g.tiltKind = 'radial';
  g.tilt = Math.max(g.tilt, rng.range(3.8, 4.8)) * 1.6;
  g.noise.amp = Math.min(g.noise.amp, 1.5);
  g.regional.amp = Math.min(g.regional.amp, 1.25);
  g.hyps.eq = 0;
  g.base = Math.max(g.base, 5);
  g.relief = g.top - g.base;
  // These hills remain accents around the catchment instead of multiplying with map area.
  for (const p of g.parts) if (p.kind === 'knolls') p.extra = Math.min(p.extra, 16);
  g.erosion.iterations = Math.min(g.erosion.iterations, 8);
  if (side >= 192) {
    const [dx, dy] = DIRS8[g.flowDir];
    g.parts.push({ kind: 'trough', at: [focus[0] + dx * 0.23, focus[1] + dy * 0.23],
      size: side * 0.62, height: -3, turn: g.flowDir / 8, extra: side * 0.055, soft: 0 });
  }

  // The shared drainage chooses tributaries and the outlet. No river, outlet or shoreline is
  // stamped, and no operation runs after land is shown. Keep the lake's outlet load modest.
  if (!g.hydro.exactInflows) g.hydro.inflows = Math.max(2, g.hydro.inflows);
  g.hydro.springs = Math.min(4, Math.max(3, g.hydro.springs));
  g.hydro.flowMul = Math.min(g.hydro.flowMul, 1.1);
  g.hydro.split *= 0.25;
  g.hydro.delta = 0;
  g.hydro.incise = 0;
  g.hydro.floor = Math.min(g.hydro.floor, 0.5);
  g.hydro.reachSprings = false;
  g.hydro.lakeBudget = 0.36;
  g.hanging = 0;
  g.troughs = Math.min(g.troughs, 0.25);
  g.lakeSprings = Math.min(g.lakeSprings, 0.25);
  g.lakeSpringMax = 1;
}

/** Investigation adapter only: the adoption patch calls the pure shaping function directly. */
export function install(_mode: string): void {
  const genome = require('../../src/core/land/genome');
  const lean = genome.leanGenome;
  genome.leanGenome = (g: Genome, s: Settings, W: number, H: number, seed: number,
    attempt: number, designedFor: Difficulty) => {
    lean(g, s, W, H, seed, attempt, designedFor);
    shapeLakeBasin(g, s, W, H, seed, attempt, designedFor);
  };
}
