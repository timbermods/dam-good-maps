// The options of the objects the game's map editor places beyond the sources (PLAN §20 D337, D338, D339), as
// plain operations and plain reasons (D342): the components a placement carries, the change an option makes
// (`setEntityProps`), and the check every such operation passes, in words, never a silent clamp.
//
// - Water objects (the two sources, the seeps, an aquifer, the badtide drain): a strength, which the game only caps
//   from above (8 for each tile the object emits into: 72 for a badwater source, 32 for a seep), so a negative
//   strength is a sink; and a start delay ("Starts: at once", or `days` days into cycle `cycles`), for every water
//   object but an aquifer.
// - An unstable core: its radius (0 to 5) and its cycle and countdown.
// - A reserve: the good it holds (one of its kind's) and how much (up to its capacity).

import { CORE, defaultStock, defaultStrength, FLUIDS, goodsFor, isReserve, MAX_STRENGTH_PER_TILE, maxStrength, NO_DELAY, RESERVES, TIMED, type Timed } from "../data/parity";
import { fluidObject, reserve, unstableCore, waterSource } from "../format/entities";
import { plainOf, type JsonObject, type JsonValue } from "../format/json";
import type { Orientation } from "../format/footprints";
import type { EditOp } from "./ops";

/** The options an object carries; what an object has none of is left out. */
export interface ObjectOptions {
  /** A water object's strength, in blocks a second (a sink below 0). */
  strength?: number;
  /** A water object's start delay. */
  timed?: Timed;
  /** An unstable core's radius, its cycle and its countdown in days. */
  radius?: number;
  cycles?: number;
  days?: number;
  /** A reserve's good and how much of it. */
  good?: string;
  amount?: number;
}

const stub = { id: "", owner: "placed", x: 0, y: 0, z: 0 };

/** Whether the template takes options at all. */
export const hasOptions = (template: string): boolean => (FLUIDS[template]?.tiles !== undefined) || template === "UnstableCore" || isReserve(template);

/** What a water object's strength means in words ("a Badwater Seep gives at most 32 water a second"). */
function nameOf(template: string): string {
  return template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** The default options of a template (the game's: PLAN §20 D337, D338, D339). */
export function defaultOptions(template: string): ObjectOptions {
  if (FLUIDS[template]?.tiles) return { strength: defaultStrength(template), ...(FLUIDS[template].timed ? { timed: { ...NO_DELAY } } : {}) };
  if (template === "UnstableCore") return { radius: CORE.defaultRadius, cycles: CORE.cycles, days: CORE.days };
  if (isReserve(template)) {
    const d = defaultStock(template);
    return { good: d.good, amount: d.amount };
  }
  return {};
}

/** The components a placement of this template carries, plain JSON in the game's order, for the options
 *  given (anything left out at the game's default); undefined for a template with nothing to say (the drill). */
export function placeComponents(template: string, o: ObjectOptions = {}): Record<string, unknown> | undefined {
  const d = { ...defaultOptions(template), ...o };
  if (FLUIDS[template]?.tiles) {
    const e = FLUIDS[template].needsDrill
      ? fluidObject({ ...stub, template, strength: d.strength })
      : template === "WaterSource" || template === "BadwaterSource"
        ? waterSource({ ...stub, strength: d.strength ?? defaultStrength(template), bad: template === "BadwaterSource", timed: d.timed })
        : fluidObject({ ...stub, template, strength: d.strength, timed: d.timed });
    return plainOf({ ...(e.before ?? {}), ...e.components } as JsonObject) as Record<string, unknown>;
  }
  if (template === "UnstableCore") return plainOf(unstableCore({ ...stub, orientation: "Cw0" as Orientation, radius: d.radius ?? CORE.defaultRadius, cycles: d.cycles ?? CORE.cycles, days: d.days }).components) as Record<string, unknown>;
  if (isReserve(template)) return plainOf(reserve({ ...stub, template, good: d.good!, amount: d.amount! }).components) as Record<string, unknown>;
  return undefined;
}

/** The patch that sets an object's options (a `setEntityProps`), from the object as it stands now. */
export function optionsPatch(template: string, currentIn: Record<string, unknown>, o: ObjectOptions): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  // (the object's components as the game's file has them, floats and all, or plain: either reads the same)
  const current = plainOf(currentIn as JsonValue) as Record<string, unknown>;
  const spec = FLUIDS[template];
  if (spec?.tiles) {
    const ws = current.WaterSource as { SpecifiedStrength?: number; CurrentStrength?: number } | undefined;
    const strength = o.strength ?? Number(ws?.SpecifiedStrength ?? defaultStrength(template));
    const timedNow = spec.timed ? (o.timed ?? timedFrom(current)) : NO_DELAY;
    // (what runs at once: not while it waits out a delay, and not an aquifer or a drain, which wait for a drill or a badtide)
    const running = !timedNow.enabled && !spec.needsDrill && !spec.activeIn;
    if (o.strength !== undefined || o.timed) patch.WaterSource = { SpecifiedStrength: strength, CurrentStrength: running ? strength : 0 };
    if (o.timed && spec.timed) patch.TimeActivatedComponent = { IsEnabled: o.timed.enabled, CyclesUntilCountdownActivation: o.timed.cycles, DaysUntilActivation: o.timed.days };
  } else if (template === "UnstableCore") {
    if (o.radius !== undefined) patch.UnstableCore = { ExplosionRadius: o.radius };
    if (o.cycles !== undefined || o.days !== undefined) patch.TimeActivatedComponent = { ...(o.cycles !== undefined ? { CyclesUntilCountdownActivation: o.cycles } : {}), ...(o.days !== undefined ? { DaysUntilActivation: o.days } : {}) };
  } else if (isReserve(template)) {
    const inv = current["Inventory:Stockpile"] as { Storage?: { Goods?: { Good: string; Amount: number }[] } } | undefined;
    const held = inv?.Storage?.Goods?.reduce((a, g) => a + g.Amount, 0) ?? 0;
    const good = o.good ?? String((current.FixedStockpile as { FixedGoodId?: string } | undefined)?.FixedGoodId ?? defaultStock(template).good);
    // (a new good keeps the amount, as the game's editor does: `FixedStockpileInventorySetter.SetGoodId`)
    const amount = o.amount ?? held;
    patch.FixedStockpile = { FixedGoodId: good };
    patch.SingleGoodAllower = { AllowedGood: good };
    patch["Inventory:Stockpile"] = { Storage: { Goods: amount > 0 ? [{ Good: good, Amount: amount }] : [] } };
    patch.StockpileVisualizers = { CurrentGood: good };
  }
  return patch;
}

/** An object's start delay from its components. */
function timedFrom(current: Record<string, unknown>): Timed {
  const ta = current.TimeActivatedComponent as Record<string, unknown> | undefined;
  if (!ta) return { ...NO_DELAY };
  return {
    enabled: ta.IsEnabled === true,
    cycles: typeof ta.CyclesUntilCountdownActivation === "number" ? ta.CyclesUntilCountdownActivation : TIMED.cycles,
    days: typeof ta.DaysUntilActivation === "number" ? ta.DaysUntilActivation : TIMED.days,
  };
}

/** The operation that sets an object's options. */
export function setOptionsOp(id: string, template: string, current: Record<string, unknown>, o: ObjectOptions): EditOp {
  return { op: "setEntityProps", params: { id, components: optionsPatch(template, current, o) } };
}

// ------------------------------------------------------------------------------------- the checks

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Why the components of a placed or changed object would not be right, or nothing: a strength above the
 *  game's ceiling, a delay the game's editor does not take, a radius outside 0 to 5, a good the reserve cannot
 *  hold. `components` is what the operation carries (a whole placement, or a patch). Never clamps: a refusal is a
 *  line of words. */
export function optionProblems(template: string, components: Record<string, unknown>): string[] {
  const out: string[] = [];
  const spec = FLUIDS[template];
  if (spec?.tiles) {
    const ws = components.WaterSource as Record<string, unknown> | undefined;
    if (ws) {
      const cap = maxStrength(template);
      for (const key of ["SpecifiedStrength", "CurrentStrength"] as const) {
        const v = ws[key];
        if (v === undefined) continue;
        if (!finite(v)) out.push(`a ${nameOf(template)}'s strength is a number of water a second`);
        else if (v > cap + 1e-9) out.push(`a ${nameOf(template)} gives at most ${cap} water a second (${MAX_STRENGTH_PER_TILE} for each of its ${spec.tiles.length} tile${spec.tiles.length > 1 ? "s" : ""}): ${v} is more`);
      }
    }
    if (components.TimeActivatedComponent !== undefined) {
      if (!spec.timed) out.push(`a ${nameOf(template)} has no start delay`);
      else out.push(...timedProblems(components.TimeActivatedComponent, false));
    }
  } else if (template === "UnstableCore") {
    const uc = components.UnstableCore as Record<string, unknown> | undefined;
    if (uc && uc.ExplosionRadius !== undefined) {
      const r = uc.ExplosionRadius;
      if (!finite(r) || !Number.isInteger(r) || r < CORE.minRadius || r > CORE.maxRadius) out.push(`an unstable core's radius is a whole number from ${CORE.minRadius} to ${CORE.maxRadius}: ${String(r)} is not`);
    }
    if (components.TimeActivatedComponent !== undefined) out.push(...timedProblems(components.TimeActivatedComponent, true));
  } else if (isReserve(template)) {
    const r = RESERVES[template];
    const goods = new Set(goodsFor(template).map((g) => g.id));
    const kind = { Pileable: "piles", Box: "boxes", Liquid: "liquids" }[r.type];
    const named = (v: unknown): v is string => typeof v === "string";
    for (const v of [(components.FixedStockpile as Record<string, unknown> | undefined)?.FixedGoodId, (components.SingleGoodAllower as Record<string, unknown> | undefined)?.AllowedGood, (components.StockpileVisualizers as Record<string, unknown> | undefined)?.CurrentGood]) {
      if (v === undefined) continue;
      if (!named(v) || !goods.has(v)) out.push(`a ${nameOf(template)} holds ${kind}: ${String(v)} is not one it can hold`);
    }
    const inv = components["Inventory:Stockpile"] as { Storage?: { Goods?: unknown } } | undefined;
    const list = inv?.Storage?.Goods;
    if (list !== undefined) {
      if (!Array.isArray(list)) out.push("a reserve's stock is a list of goods");
      else {
        let total = 0;
        for (const g of list as { Good?: unknown; Amount?: unknown }[]) {
          if (!named(g?.Good) || !goods.has(g.Good)) out.push(`a ${nameOf(template)} holds ${kind}: ${String(g?.Good)} is not one it can hold`);
          if (!finite(g?.Amount) || !Number.isInteger(g.Amount) || g.Amount < 0) out.push("a reserve's stock is a whole number of goods, 0 or more");
          else total += g.Amount;
        }
        if (total > r.capacity) out.push(`a ${nameOf(template)} holds at most ${r.capacity}: ${total} is more`);
      }
    }
  }
  return out;
}

/** A countdown's fields: cycles of 1 or more, days of 0 or more; a core's countdown is always on. */
function timedProblems(v: unknown, alwaysOn: boolean): string[] {
  const t = v as Record<string, unknown>;
  const out: string[] = [];
  if (t === null || typeof t !== "object") return ["a start delay is IsEnabled, a cycle and a number of days"];
  if (t.IsEnabled !== undefined && typeof t.IsEnabled !== "boolean") out.push("IsEnabled is true or false");
  if (alwaysOn && t.IsEnabled === false) out.push("an unstable core's countdown is always on: it cannot start at once");
  const c = t.CyclesUntilCountdownActivation;
  if (c !== undefined && (!finite(c) || !Number.isInteger(c) || c < TIMED.minCycles)) out.push(`the cycle it starts in is a whole number from ${TIMED.minCycles}: ${String(c)} is not`);
  const d = t.DaysUntilActivation;
  if (d !== undefined && (!finite(d) || d < TIMED.minDays)) out.push(`the days it counts down are ${TIMED.minDays} or more: ${String(d)} is not`);
  const p = t.DaysPassed;
  if (p !== undefined && (!finite(p) || p < 0)) out.push("the days passed are 0 or more");
  return out;
}

