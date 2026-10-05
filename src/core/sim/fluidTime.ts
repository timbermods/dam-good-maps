// Headless fluid activation for a weather timeline (D337, D342). Map-start water still uses waterModel.
import { FLUIDS, maxStrength } from "../data/parity";
import { timedOf } from "../format/entities";
import { waterModel, objectTile, specifiedStrength, type MapObject } from "./model";
import type { WaterModel } from "./water";

export interface FluidTime {
  cycle: number;
  /** Days since this cycle began. */
  day: number;
  /** Absolute day each begun cycle started, indexed from cycle 1. */
  cycleStartDays: readonly number[];
  weather: "temperate" | "drought" | "badtide";
}
export type FluidModelResult = { ok: true; model: WaterModel } | { ok: false; errors: string[] };

/** Re-evaluate source strengths at a timeline boundary without changing objects or their saved countdowns.
 * Aquifers stay unpowered in this map-editor model, even with a drill placed. */
export function fluidModelAt(W: number, H: number, surface: Uint8Array, objects: readonly MapObject[], time: FluidTime): FluidModelResult {
  const fail = (reason: string): FluidModelResult => ({ ok: false, errors: [reason] });
  if (!Number.isInteger(time.cycle) || time.cycle < 1) return fail("the current cycle is a whole number from 1");
  if (!Number.isFinite(time.day) || time.day < 0) return fail("the current day is 0 or more");
  if (!["temperate", "drought", "badtide"].includes(time.weather)) return fail("the weather is temperate, drought or badtide");
  if (time.cycleStartDays.length < time.cycle || time.cycleStartDays[0] !== 0) return fail("the timeline needs each begun cycle's start day, starting at 0");
  for (let k = 0; k < time.cycleStartDays.length; k++) {
    const v = time.cycleStartDays[k];
    if (!Number.isFinite(v) || v < 0 || (k && v <= time.cycleStartDays[k - 1])) return fail("cycle start days must be finite and increasing");
  }
  const model = waterModel(W, H, surface, objects);
  const now = time.cycleStartDays[time.cycle - 1] + time.day;
  let at = 0;
  for (const o of objects) {
    const spec = FLUIDS[o.template];
    if (!spec?.tiles || !spec.tiles.some(([x, y]) => { const [tx, ty] = objectTile(o, x, y); return tx >= 0 && ty >= 0 && tx < W && ty < H; })) continue;
    const e = model.emitters[at++];
    const t = timedOf(o.components);
    const activated = !t.enabled || (t.cycles <= time.cycle && now - time.cycleStartDays[t.cycles - 1] >= t.days);
    const running = activated && !spec.needsDrill && (!spec.activeIn || time.weather === "badtide") && !(time.weather === "drought" && spec.contamination === 0);
    e.strength = running ? Math.min(specifiedStrength(o.components), maxStrength(o.template)) : 0;
  }
  return { ok: true, model };
}
