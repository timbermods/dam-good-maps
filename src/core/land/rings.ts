// Ringed forms (docs/design/uplands.md, round 4: the land is drawn in rings). Above 128² the levels are snapped from a
// field with nothing finer than about 8 tiles in it (`levels.ts` `RINGS`), and on it stand the land's named forms: a
// hill, a ring mesa, a stepped hill of two tops, a terraced hill of treads behind two-level risers, each 30–80 tiles
// across and 3–6 levels tall, so the snap draws each as nested rings (`KINDS`: how often each theme draws each). Each
// stands clear of the next, with calm ground between, as the game's own maps' knolls, ring mesas and terraced hills
// do. A form is a genome draw like a part (`field.ts`): where it stands,
// its size, its height and its kind come from its own stream, its outline is lobed and warped so no form is a disc,
// and its height is what the land has room for under the top (a form on high ground stands lower, or not at all). On a
// planned land (a valley, a gorge) no form stands on the floor: the floor is the river's. Exact arithmetic throughout.

import * as portable from "../math/portable";
import { stream } from "../math/rng";
import { fbm } from "../math/noise";
import { clamp, smoothstep } from "../math/clamp";
import { sinDet, TWO_PI } from "../math/detmath";
import { hash32 } from "../math/hash";
import type { ThemeId } from "../spec/mapspec";

/** The forms' numbers: their radius (tiles) and height (levels) at the most and least, the calm ground kept between two
 *  (tiles, past their radii), how many each 128² of the map draws by theme, and the draws tried for each. Highlands
 *  draws few (1.25) since round 6: its mesas are `bold.ts` `standMesas`', and the ring forms only roll its floor. */
export const RING_FORMS = { rMin: 15, rMax: 40, hMin: 3.5, hMax: 6, gap: 6, tries: 30 } as const;
const PER_128: Partial<Record<ThemeId, number>> = { highlands: 1.25, canyon: 5, riverValley: 5, any: 2, lakeBasin: 1 };

/** The levels under the top a theme's land leaves its forms (the land itself spread over the rest; Highlands 3 since
 *  round 6, its forms standing over its floor, `bold.ts` `STAND.floor`, under the mesas' tops). */
const ROOM: Partial<Record<ThemeId, number>> = { highlands: 3, canyon: 3, riverValley: 2, any: 2, lakeBasin: 1.5 };
export function ringFormRoom(theme: ThemeId): number {
  return ROOM[theme] ?? 0;
}

export type RingKind = "hill" | "mesa" | "stepped" | "terraced";

/** How often a theme draws each kind (shares of hill, mesa, stepped, terraced; the rest of 1 terraced): Highlands' are
 *  mostly terraced hills and mesas, whose risers stand two levels (its promise's plateaus and cliffs, and the stacked
 *  ring terraces of the game's Terraces and Pressure); Canyon's tableland carries buttes; elsewhere hills. Round 5 (the bold
 *  family) moved Highlands and Canyon from hills to mesas: with hills 15 and 35 %, 75–81 % of Canyon's steps were one
 *  level, against 44–62 % on the game's bold maps. Round 6 (Highlands stands up) takes Highlands' mesas from the ring
 *  forms (its mesas are walled ones, `bold.ts`): hills and stepped hills roll the floor round them. */
const KINDS: Partial<Record<ThemeId, readonly [number, number, number]>> = { highlands: [0.4, 0, 0.3], canyon: [0.1, 0.5, 0.25], riverValley: [0.45, 0.25, 0.2] };
const KINDS_ANY = [0.4, 0.3, 0.3] as const;
/** A terraced hill's riser: two levels, over this share of a terrace's run. */
const RISER = { levels: 2, run: 0.03 } as const;

export interface RingForm {
  x: number;
  y: number;
  r: number;
  h: number;
  kind: RingKind;
  s: number;
  /** The outline's waves (two round it) and its inner top's offset (a stepped hill's), in radii. */
  k1: number;
  p1: number;
  a1: number;
  k2: number;
  p2: number;
  a2: number;
  ox: number;
  oy: number;
}

export function pseudoAngle(dx: number, dy: number): number {
  const s = Math.abs(dx) + Math.abs(dy);
  if (s === 0) return 0;
  const p = dy / s;
  return clamp((dx < 0 ? 2 - p : p < 0 ? 4 + p : p) / 4, 0, 1);
}

/** A tile's distance from a form's middle in its radii, through a slow warp and the outline's two waves (no disc). */
export function formDist(f: RingForm, x: number, y: number, cx: number, cy: number, r: number): number {
  const cell = Math.max(10, r * 1.2);
  const dx = x - cx + 0.22 * r * fbm(f.s + 1, x, y, cell, 2);
  const dy = y - cy + 0.22 * r * fbm(f.s + 2, x, y, cell, 2);
  const t = pseudoAngle(dx, dy);
  const lobes = 1 - 0.5 * f.a1 * sinDet(TWO_PI * (f.k1 * t + f.p1)) - 0.5 * f.a2 * sinDet(TWO_PI * (f.k2 * t + f.p2));
  return portable.sqrt(dx * dx + dy * dy) / (r * lobes);
}

/** A form's height at a tile, as a share of its own (0 outside it). */
function profile(f: RingForm, x: number, y: number): number {
  const d = formDist(f, x, y, f.x, f.y, f.r);
  if (d >= 1) return 0;
  const t = 1 - d;
  if (f.kind === "hill") return 0.55 * t + 0.45 * smoothstep(t);
  if (f.kind === "mesa") return smoothstep(t / 0.07);
  if (f.kind === "terraced") {
    // a hill's profile in terraces, each a level tread above a riser `RISER.levels` tall, the first at its rim
    const k = Math.round(f.h / RISER.levels);
    const u = (0.55 * t + 0.45 * smoothstep(t)) * k * (1 - 1e-9);
    const j = Math.floor(u);
    return (j + smoothstep((u - j) / RISER.run)) / k;
  }
  // stepped: a broad lower terrace and a top of its own, off the middle, each behind a wall
  const inner = formDist(f, x, y, f.x + f.ox * f.r, f.y + f.oy * f.r, 0.5 * f.r);
  return 0.5 * smoothstep(t / 0.12) + 0.5 * smoothstep((1 - inner) / 0.25);
}

/** The forms a map draws on its levels `level` (the snap's smoothed field): none at 128² and under. `floor` is a planned
 *  land's floor's highest level (no form stands below it a level), `top` the land's top. */
export function drawRingForms(theme: ThemeId, level: Float64Array, W: number, H: number, seed: number, variation: number, top: number, floor: number | null): RingForm[] {
  const side = Math.min(W, H);
  const per = PER_128[theme] ?? 0;
  if (side <= 128 || per <= 0) return [];
  const want = Math.round((per * W * H) / (128 * 128));
  const rng = stream(seed, "ring-forms", theme, variation);
  const forms: RingForm[] = [];
  const sizeK = Math.min(1, side / 256);
  const mix = KINDS[theme] ?? KINDS_ANY;
  for (let k = 0; k < want; k++) {
    for (let t = 0; t < RING_FORMS.tries; t++) {
      const r = (RING_FORMS.rMin + (RING_FORMS.rMax - RING_FORMS.rMin) * rng.float()) * sizeK;
      const x = 0.6 * r + (W - 1 - 1.2 * r) * rng.float();
      const y = 0.6 * r + (H - 1 - 1.2 * r) * rng.float();
      const hDraw = RING_FORMS.hMin + (RING_FORMS.hMax - RING_FORMS.hMin) * rng.float();
      const kr = rng.float();
      const kind: RingKind = kr < mix[0] ? "hill" : kr < mix[0] + mix[1] ? "mesa" : kr < mix[0] + mix[1] + mix[2] ? "stepped" : "terraced";
      const s = hash32(seed, "ring-form", variation, k, t);
      const o = stream(s, "outline");
      const f: RingForm = { x, y, r, h: 0, kind, s, k1: 2 + Math.floor(2 * o.float()), p1: o.float(), a1: 0.12 + 0.14 * o.float(), k2: 4 + Math.floor(3 * o.float()), p2: o.float(), a2: 0.05 + 0.06 * o.float(), ox: 0.4 * o.float() - 0.2, oy: 0.4 * o.float() - 0.2 };
      // clear of the others, with calm ground between
      let clear = true;
      for (const q of forms) {
        const dx = q.x - x;
        const dy = q.y - y;
        const need = q.r + r + RING_FORMS.gap * sizeK;
        if (dx * dx + dy * dy < need * need) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      // the ground it stands on: its highest and lowest under it, read on a coarse grid
      let mean = 0;
      let n = 0;
      let lo = Infinity;
      for (let v = -r; v <= r; v += 4)
        for (let u = -r; u <= r; u += 4) {
          if (u * u + v * v > r * r) continue;
          const xx = Math.round(clamp(x + u, 0, W - 1));
          const yy = Math.round(clamp(y + v, 0, H - 1));
          const L = level[yy * W + xx];
          mean += L;
          n++;
          if (L < lo) lo = L;
        }
      mean /= Math.max(1, n);
      if (floor !== null && lo < floor + 1) continue;
      let h = Math.min(hDraw, top - 0.6 - mean);
      if (h < RING_FORMS.hMin - 0.5) continue;
      // (a terraced hill stands a whole number of risers)
      if (kind === "terraced") h = RISER.levels * Math.floor(h / RISER.levels);
      f.h = h;
      forms.push(f);
      break;
    }
  }
  return forms;
}

/** The forms added to the levels. */
export function addRingForms(level: Float64Array, forms: readonly RingForm[], W: number, H: number): void {
  for (const f of forms) {
    const R = 1.45 * f.r + 2;
    const x0 = Math.max(0, Math.floor(f.x - R));
    const x1 = Math.min(W - 1, Math.ceil(f.x + R));
    const y0 = Math.max(0, Math.floor(f.y - R));
    const y1 = Math.min(H - 1, Math.ceil(f.y + R));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const p = profile(f, x, y);
        if (p > 0) level[y * W + x] += f.h * p;
      }
  }
}
