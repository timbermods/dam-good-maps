// Lake Basin's shaping only. The shared drainage, rasterizer, settle and checks are unchanged.
import type { Genome } from './genome';
import { THEME_PRESETS, type Settings, type Difficulty } from '../spec/mapspec';
import { stream } from '../math/rng';
import { DIRS8 } from './num';

/** Every Lake Basin map, whatever its settings, intentions or siblings (Kyler, 2026-10-03; the
 *  release-gate generator hunt's finding 1: adoption was confined to the default Normal square-map
 *  path, so Another like this and every setting away from the preset lost the theme). The player's
 *  Rivers count (`exactInflows`) and a Lakes setting away from the preset's keep their lean. */
export function shapeLakeBasin(g: Genome, s: Settings, W: number, H: number, seed: number,
  attempt: number, _designedFor: Difficulty = 'normal'): void {
  if (g.theme !== 'lakeBasin') return;
  const preset = THEME_PRESETS.lakeBasin;
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
  if (s.water.lakes === preset.lakes) g.hydro.lakeBudget = 0.36;
  g.hanging = 0;
  g.troughs = Math.min(g.troughs, 0.25);
  g.lakeSprings = Math.min(g.lakeSprings, 0.25);
  g.lakeSpringMax = 1;
}
