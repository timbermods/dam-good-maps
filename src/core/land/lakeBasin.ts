// Lake Basin's shaping only. The shared drainage, rasterizer, settle and checks are unchanged.
import type { Genome } from './genome';
import { THEME_PRESETS, type Settings, type Difficulty } from '../spec/mapspec';
import { stream } from '../math/rng';
import { DIRS8, unit } from './num';
import { clamp } from '../math/clamp';
import * as portable from '../math/portable';
import { mapShape } from './shape';

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
  // (D357, D488: a long map has layouts of its own, `longLakes`, chosen by the seed: drawn as the
  // square map's lake turned along its length, every seed made the same lake in the middle of the strip)
  if (mapShape(W, H).long) {
    longLakes(g, W, H, seed, attempt);
    leanCatchment(g, s, preset, stream(seed, 'lake-basin-long-tilt', attempt).range(3.8, 4.8));
    return;
  }
  const turn = composition.float();
  const [ux, uy] = unit(turn);
  const [ox, oy] = unit(composition.float());
  const displacement = composition.range(0.12, 0.21);
  const focus: [number, number] = [0.5 + ox * displacement, 0.5 + oy * displacement];
  const paired = composition.float() < 0.32;
  const aspect = composition.range(1.2, 2.7);
  const size = side * composition.range(paired ? 0.22 : 0.23, paired ? 0.27 : 0.29) * (side >= 192 ? 0.85 : 1);

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
  leanCatchment(g, s, preset, rng.range(3.8, 4.8));
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
}

/** The catchment every Lake Basin map stands in: a radial slope toward its lake (`g.focus`), calm
 *  noise, one-level shore steps, and water gathered in few, modest rivers. `tilt` is the slope drawn. */
function leanCatchment(g: Genome, s: Settings, preset: (typeof THEME_PRESETS)['lakeBasin'], tilt: number): void {
  g.tiltKind = 'radial';
  g.tilt = Math.max(g.tilt, tilt) * 1.6;
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

/** A long map's lake layouts (D488), chosen by the seed: one lake at an end, fed down the length; two
 *  or three lakes stepping down the length, a sill between each; a pair of like lakes along it, a neck
 *  between; or one finger lake anywhere along it. */
export const LONG_LAKE_LAYOUTS = ['end', 'steps', 'pair', 'finger'] as const;
export type LongLakeLayout = (typeof LONG_LAKE_LAYOUTS)[number];

/** The layout a long Lake Basin map draws: the seed's (and its variation's) on the first lands, so a
 *  land drawn again keeps it; from the fifth land on, one drawn afresh each time. */
export function longLakeLayout(seed: number, variation: number, attempt: number): LongLakeLayout {
  const r = (attempt < 4 ? stream(seed, 'lake-basin-long', variation) : stream(seed, 'lake-basin-long', variation, attempt)).float();
  return r < 0.3 ? 'end' : r < 0.58 ? 'steps' : r < 0.82 ? 'pair' : 'finger';
}

/** A long map's lakes: hollows along its length (as fractions along it, 0 at its upstream end, the
 *  water's way, `g.flowDir`, already along it), the slope gathering toward the lowest, the outlet
 *  leaving by the downstream end. Each lake keeps a deeper reach and a drowned side valley or two, as
 *  the square map's does; nothing is stamped, the drainage still chooses where the water goes. */
function longLakes(g: Genome, W: number, H: number, seed: number, attempt: number): void {
  const form = mapShape(W, H);
  const S = Math.min(W, H);
  const L = Math.max(W, H);
  const r = stream(seed, 'lake-basin-long-shape', g.variation, attempt);
  const layout = longLakeLayout(seed, g.variation, attempt);
  const [fx, fy] = DIRS8[g.flowDir];
  const down = (form.alongX ? fx : fy) >= 0;
  const axis = form.alongX ? 0 : 0.25;
  // (t along the length from the upstream end, c across it, as fractions of the map)
  const at = (t: number, c: number): [number, number] => {
    const a = down ? t : 1 - t;
    return form.alongX ? [a, c] : [c, a];
  };
  // a lake `hl` tiles half-long and `hw` half-wide, its footprint's (`field.ts`'s hollow reaches 1.15
  // of its ellipse, and its shore wanders a third of its size further)
  const lake = (t: number, c: number, hl: number, hw: number, depth: number, wobble: number) => {
    const size = portable.sqrt(hl * hw) / 1.15;
    g.parts.push({ kind: 'isle', at: at(t, c), size, height: -depth, turn: axis + wobble,
      extra: hl / hw, soft: 0 });
    // (its deeper reach: the floor, not the shore)
    g.parts.push({ kind: 'basin', shape: 'round', at: at(t, c), size: Math.min(S * r.range(0.17, 0.2), 0.8 * hw),
      height: -r.range(3, 4), turn: axis, extra: 0, soft: 0 });
    // (a drowned side valley or two, toward a long side and back up the length: small hollows along a
    // bent line from the shore)
    const n = r.int(1, 3);
    for (let k = 0; k < n; k++) {
      const side = r.float() < 0.5 ? -1 : 1;
      const back = r.range(-0.6, 0.9);
      for (let j = 1; j <= 3; j++) {
        const u = j / 3;
        const tt = clamp(t - (back * hl * u) / L, 0.04, 0.96);
        const cc = clamp(c + (side * (hw + 0.22 * S * u)) / S, 0.14, 0.86);
        g.parts.push({ kind: 'isle', at: at(tt, cc), size: S * r.range(0.06, 0.08) * (1.1 - 0.3 * u),
          height: -r.range(3.5, 5), turn: axis + side * r.range(0.08, 0.16), extra: r.range(1.1, 1.8), soft: 0 });
      }
    }
  };
  // a sill across the length between two lakes: a low ridge the water falls over or narrows through
  const sill = (t: number, height: number) => {
    g.parts.push({ kind: 'ridge', at: at(t, r.range(0.4, 0.6)), size: S * r.range(0.7, 0.95),
      height, turn: axis + 0.25 + r.range(-0.06, 0.06), extra: S * r.range(0.05, 0.07), soft: 0 });
  };
  g.parts = g.parts.filter(p => p.kind !== 'basin' && p.kind !== 'caldera');
  const margin = 0.22 * S;
  let focusT = 0.5;
  let focusC = 0.5;
  if (layout === 'end') {
    // one big lake by the downstream end, the river running the length to it down a shallow trough
    const hw = S * r.range(0.24, 0.31);
    const hl = Math.min(0.24 * L, S * r.range(0.75, 1.1));
    const t = (L - hl - margin) / L;
    const c = r.range(0.44, 0.56);
    lake(t, c, hl, hw, r.range(10.5, 12.5), r.range(-0.03, 0.03));
    const t0 = r.range(0.06, 0.12);
    const t1 = t - (0.6 * hl) / L;
    g.parts.push({ kind: 'trough', at: at((t0 + t1) / 2, r.range(0.42, 0.58)), size: (t1 - t0) * L, height: -r.range(2, 3),
      turn: axis + r.range(-0.02, 0.02), extra: S * r.range(0.07, 0.1), soft: 0 });
    focusT = t;
    focusC = c;
  } else if (layout === 'steps' || layout === 'pair') {
    // steps: two or three lakes, each a level or more under the last, a sill between; the slope falls
    // to the downstream end. A pair: two like lakes, nearly level, a low neck between, the slope
    // gathering just past the lower
    const n = layout === 'pair' ? 2 : form.ratio >= 3.5 && r.float() < 0.6 ? 3 : 2;
    const span = (L - 2 * margin) / L;
    const each = span / n;
    const ts: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = margin / L + each * (k + 0.5) + r.range(-0.12, 0.12) * each;
      const c = 0.5 + (k % 2 === 0 ? 1 : -1) * r.range(0, 0.07);
      const hw = S * (layout === 'pair' ? r.range(0.23, 0.3) : r.range(0.2, 0.27));
      const hl = Math.min((each * L) / 2 - 0.08 * S, hw * r.range(1.6, 3));
      lake(t, c, Math.max(hw * 1.1, hl), hw, r.range(10, 12), r.range(-0.04, 0.04));
      ts.push(t);
    }
    for (let k = 0; k + 1 < n; k++) sill((ts[k] + ts[k + 1]) / 2, layout === 'pair' ? r.range(1.5, 2.5) : r.range(2.5, 4));
    focusT = layout === 'pair' ? ts[n - 1] : Math.min(0.92, ts[n - 1] + 0.5 * each);
  } else {
    // one finger lake anywhere along the length
    const hw = S * r.range(0.2, 0.27);
    const hl = Math.min(0.3 * L, hw * r.range(2.4, 4));
    const t = clamp(r.range(0.3, 0.7), (hl + margin) / L, 1 - (hl + margin) / L);
    focusC = r.range(0.42, 0.58);
    lake(t, focusC, hl, hw, r.range(10.5, 12.5), r.range(-0.05, 0.05));
    focusT = t;
  }
  g.focus = at(focusT, focusC);
}
