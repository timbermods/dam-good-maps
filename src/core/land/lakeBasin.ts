// Lake Basin's shaping only. The shared drainage, rasterizer, settle and checks are unchanged.
import type { Genome } from './genome';
import { THEME_PRESETS, type Settings, type Difficulty } from '../spec/mapspec';
import { stream } from '../math/rng';
import { DIRS8, unit } from './num';
import { clamp } from '../math/clamp';

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
  // Composition is drawn independently of candidate retries: retries can change the land, not
  // collapse the seed back to a central lake. Position, aspect, neighbours and relief combine
  // continuously instead of choosing a small catalogue of lake pictures.
  const composition = stream(seed, 'lake-basin-composition', g.variation);
  const turn = composition.float();
  const [ux, uy] = unit(turn);
  const [ox, oy] = unit(composition.float());
  const displacement = composition.range(0.12, 0.21);
  const focus: [number, number] = [0.5 + ox * displacement, 0.5 + oy * displacement];
  const paired = composition.float() < 0.32;
  const aspect = composition.range(1.2, 2.7);
  const size = side * composition.range(paired ? 0.22 : 0.23, paired ? 0.27 : 0.29)
    * (side >= 192 ? 0.85 : 1);

  g.parts = g.parts.filter(p => p.kind !== 'basin' && p.kind !== 'caldera');
  // Use the existing warped-footprint uplift with negative height: a broad hollow whose
  // boundary bends in two dimensions, without the valley basin's straight side-arm segments.
  // Append it AFTER the uplands. A later mesa's max-height operation used to erase the lake
  // hollow entirely; cutting the catchment last also restores the cited no-lake seeds.
  const hollows: Genome['parts'] = [{ kind: 'isle', at: focus, size,
    height: -rng.range(10.5, 12.5), turn, extra: aspect, soft: 0 }];
  if (paired) {
    const separation = composition.range(0.28, 0.38);
    const at: [number, number] = [clamp(focus[0] + ux * separation, 0.28, 0.72),
      clamp(focus[1] + uy * separation, 0.28, 0.72)];
    hollows.push({ kind: 'isle', at, size: size * composition.range(0.55, 0.75),
      height: -rng.range(9.5, 11), turn: turn + composition.range(-0.15, 0.15),
      extra: composition.range(1.2, 2.6), soft: 0 });
  }
  if (composition.float() < 0.35) {
    // A raised, winding flank meets one shore; the opposite shore remains broad lowland.
    const at: [number, number] = [focus[0] - uy * 0.20, focus[1] + ux * 0.20];
    g.parts.push({ kind: 'escarpment', at, size: side * composition.range(0.45, 0.65),
      height: composition.range(2.5, 4), turn: turn + 0.25,
      extra: side * 0.035, soft: side * 0.025 });
  }
  g.focus = focus;
  g.tiltKind = 'radial';
  g.tilt = Math.max(g.tilt, rng.range(3.8, 4.8)) * 1.6;
  g.noise.amp = Math.min(g.noise.amp, 1.5);
  g.regional.amp = Math.min(g.regional.amp, 1.25);
  g.regional.warped = true;
  // One-level shore steps and waviness, while the player's higher Terracing still leans
  // toward benches. River routes keep the existing meander process and a minimum wander.
  g.terrace.jitter = Math.max(g.terrace.jitter, 0.55);
  if (s.terrain.terracing === preset.terracing) g.terrace.step = 1;
  g.wander = Math.max(g.wander, 1.0);
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

  g.parts.push(...hollows);
  // A compact deeper reach inside the main hollow keeps elongated lakes broad enough to
  // dominate their tributaries. It changes the floor, not the drawn outer shoreline.
  g.parts.push({ kind: 'basin', shape: 'round', at: focus, size: side * rng.range(0.18, 0.21),
    height: -rng.range(3, 4), turn, extra: 0, soft: 0 });

  // Drowned valley relief, not a water outline: smaller hollows along bent valley axes
  // meet the main depression. Intervening spurs stand above parts of the same floor.
  // The shared erosion and drainage still decide what floods and where rivers enter.
  const valleys = stream(seed, 'lake-basin-valleys', g.variation);
  const branches = valleys.int(3, 6);
  const axes: number[] = [];
  for (let k = 0; k < branches; k++) {
    const bearing = valleys.float();
    axes.push(bearing);
    const [vx, vy] = unit(bearing);
    const reach = valleys.range(0.20, 0.34);
    const bend = valleys.range(-0.12, 0.12);
    for (let j = 0; j < 3; j++) {
      const t = (j + 1) / 3;
      const at: [number, number] = [clamp(focus[0] + vx * reach * t - vy * bend * t * t, 0.13, 0.87),
        clamp(focus[1] + vy * reach * t + vx * bend * t * t, 0.13, 0.87)];
      g.parts.push({ kind: 'isle', at, size: side * valleys.range(0.065, 0.09) * (1.1 - 0.3 * t),
        height: -valleys.range(3.5, 5.5), turn: bearing + bend * t,
        extra: valleys.range(1.1, 1.9), soft: 0 });
    }
  }
  axes.sort((a, b) => a - b);
  const spurs = valleys.int(2, branches + 1);
  for (let k = 0; k < spurs; k++) {
    const a = axes[k], b = axes[(k + 1) % branches] + (k + 1 === branches ? 1 : 0);
    const bearing = (a + b) / 2 + valleys.range(-0.04, 0.04);
    const [vx, vy] = unit(bearing);
    const reach = valleys.range(0.14, 0.24);
    const at: [number, number] = [clamp(focus[0] + vx * reach, 0.15, 0.85),
      clamp(focus[1] + vy * reach, 0.15, 0.85)];
    g.parts.push({ kind: 'ridge', at, size: side * valleys.range(0.18, 0.35),
      height: valleys.range(4, 6), turn: bearing + valleys.range(-0.12, 0.12),
      extra: side * valleys.range(0.035, 0.065), soft: 0 });
  }

  // The shared drainage chooses tributaries and the outlet. No river, outlet or shoreline is
  // stamped, and no operation runs after land is shown. Keep the lake's outlet load modest.
  if (!g.hydro.exactInflows && !g.hydro.noInflows) g.hydro.inflows = Math.max(2, g.hydro.inflows);
  g.hydro.springs = Math.min(4, Math.max(3, g.hydro.springs));
  // Modest flow through the bent inlet valleys keeps their shallow reaches readable.
  g.hydro.flowMul = clamp(g.hydro.flowMul, 1.1, 1.3);
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
