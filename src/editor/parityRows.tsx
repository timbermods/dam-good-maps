// The options rows of the objects the game's map editor places (PLAN §20 D337, D338, D339): a brush's Size, Density
// and Age; a water object's strength (a sink is a strength below 0) and its start delay behind More; an unstable
// core's radius and cycle, and the button that shows the map after it goes off; a reserve's good and how much of
// it. Plain fields over the core's plain options (`core/doc/objectOps.ts`): every value is checked there, in words.

import type { ComponentChildren } from "preact";
import { OFFICIAL_FLOW } from "../core/gen/calibrated";
import { CORE, FLUIDS, goodName, goodsFor, MAX_STRENGTH_PER_TILE, RESERVES, TIMED, type Timed } from "../core/data/parity";
import type { ObjectOptions } from "../core/doc/objectOps";
import type { PaintKind } from "../core/doc/paintParams";
import { MoreButton, Segmented, SizeControl, Toggle } from "./TopBar";
import type { ShelfItem, ShelfOptions } from "./shelfItems";

/** The strengths the slider and the list step through, up to what the object can emit: 8 for each of its tiles
 *  (a source 8, a seep 32, a badwater source 72). */
export function strengthSteps(template: string): readonly number[] {
  const base = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8];
  const cap = MAX_STRENGTH_PER_TILE * (FLUIDS[template]?.tiles?.length ?? 1);
  return [...base, ...[12, 16, 24, 32, 48, 72].filter((v) => v <= cap)];
}

/** A number field that takes its value when it is entered, and puts an out-of-range one back. */
function NumberField(p: { label: string; title: string; value: number; min?: number; max?: number; step: number; suffix?: string; onChange(v: number): void }) {
  return (
    <label class="number-field" title={p.title}>
      {p.label}
      <input
        type="number"
        aria-label={p.label}
        value={p.value}
        min={p.min}
        max={p.max}
        step={p.step}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) p.onChange(v);
          else (e.target as HTMLInputElement).value = String(p.value);
        }}
      />
      {p.suffix ? <span class="unit">{p.suffix}</span> : null}
    </label>
  );
}

/** A brush's own fields: Size (like the terrain brushes: the slider, F and [ ]), Density, and Age for the plants
 *  that grow. `children`: a kind's own option (a ruin's height for a click). */
export function BrushFields(p: { item: ShelfItem; o: ShelfOptions; sizeMax: number; onO(o: ShelfOptions): void; children?: ComponentChildren }) {
  const kind = p.item.brush as PaintKind;
  const d = p.o.density[kind];
  const aged = kind === "trees" || kind === "succulents" || kind === "woods";
  return (
    <>
      <SizeControl label="Size" title="The brush's size in tiles from its middle: 1 places exactly one ([ and ] step it; hold F and move the mouse to size it on the map)" value={p.o.size} min={1} max={p.sizeMax} step={0.5} words={p.o.size <= 1 ? "1 (one)" : String(p.o.size)} onChange={(size) => p.onO({ ...p.o, size })} />
      <label class="slider-field" title="How densely they land, from a sparse scatter to a dense grove; painting over what is there fills the gaps up to it">
        Density
        <input type="range" min={5} max={100} step={5} aria-label="Density" aria-valuetext={`${Math.round(d * 100)} percent`} value={Math.round(d * 100)} onInput={(e) => p.onO({ ...p.o, density: { ...p.o.density, [kind]: Number((e.target as HTMLInputElement).value) / 100 } })} />
        <output>{Math.round(d * 100)}%</output>
      </label>
      {aged ? (
        <Segmented
          label="Age"
          value={p.o.age}
          options={[
            ["grown", "Grown", "Grown trees: what the starting-logs floor counts"],
            ["mixed", "Mixed", "A natural blend of grown trees and saplings, as the generator plants them"],
          ]}
          onChange={(age) => p.onO({ ...p.o, age })}
        />
      ) : null}
      {p.children}
    </>
  );
}

/** A start delay: "Starts: At once" (the default), or later, from cycle N and then a countdown of some days,
 *  the game's own fields (its map editor's delayed activation: cycles from 1, days from 0). */
export function DelayFields(p: { timed: Timed; onTimed(t: Timed): void }) {
  const t = p.timed;
  return (
    <>
      <Segmented
        label="Starts"
        value={t.enabled ? "later" : "now"}
        options={[
          ["now", "At once", "It runs from the map's start"],
          ["later", "Later", "It starts after a countdown, as the game's map editor's delayed activation"],
        ]}
        onChange={(v) => p.onTimed({ ...t, enabled: v === "later" })}
      />
      {t.enabled ? (
        <>
          <NumberField label="from cycle" title="The cycle its countdown starts in, on that cycle's first day" value={t.cycles} min={TIMED.minCycles} step={1} onChange={(cycles) => p.onTimed({ ...t, cycles: Math.max(TIMED.minCycles, Math.round(cycles)) })} />
          <NumberField label="then" title="The days it counts down before it starts" value={t.days} min={TIMED.minDays} step={0.5} suffix="days" onChange={(days) => p.onTimed({ ...t, days: Math.max(TIMED.minDays, days) })} />
        </>
      ) : null}
    </>
  );
}

/** What sits behind More on a water object: Sink (a strength below zero drains the water that stands on it) and,
 *  for every water object but an aquifer, its start delay. */
export function FluidMore(p: { template: string; o: ObjectOptions; onO(o: ObjectOptions): void }) {
  const spec = FLUIDS[p.template];
  const strength = p.o.strength ?? 1;
  return (
    <>
      <Toggle label="Sink" title="Instead of giving water it drains the water that stands on it, as the game allows (a strength below 0)" on={strength < 0} onChange={(on) => p.onO({ ...p.o, strength: on ? -Math.abs(strength) : Math.abs(strength) })} />
      {spec?.timed ? <DelayFields timed={p.o.timed ?? { enabled: false, cycles: TIMED.cycles, days: TIMED.days }} onTimed={(timed) => p.onO({ ...p.o, timed })} /> : null}
    </>
  );
}

/** A water object's strength on the slider (its magnitude; the sign is Sink's), and More. */
export function FluidFields(p: { template: string; o: ObjectOptions; onO(o: ObjectOptions): void; more: boolean; onMore(open: boolean): void; label?: string }) {
  const steps = strengthSteps(p.template);
  const s = p.o.strength ?? 1;
  const mag = Math.abs(s);
  const k = steps.reduce((best, f, j) => (Math.abs(f - mag) < Math.abs(steps[best] - mag) ? j : best), 0);
  const sign = s < 0 ? -1 : 1;
  return (
    <>
      <label class="slider-field" title={`Blocks of water a second, at most ${MAX_STRENGTH_PER_TILE * (FLUIDS[p.template]?.tiles?.length ?? 1)} for this object`}>
        {p.label ?? "Strength"}
        <input type="range" min={0} max={steps.length - 1} step={1} value={k} aria-label={p.label ?? "Strength"} aria-valuetext={`${s} water per second`} onInput={(e) => p.onO({ ...p.o, strength: sign * steps[Number((e.target as HTMLInputElement).value)] })} />
        <output>{s < 0 ? `sink ${mag}` : s} water/s</output>
      </label>
      {mag > OFFICIAL_FLOW ? <span class="note">Stronger than any official map.</span> : null}
      <MoreButton open={p.more} onToggle={() => p.onMore(!p.more)} />
      {p.more ? <FluidMore template={p.template} o={p.o} onO={p.onO} /> : null}
    </>
  );
}

/** An unstable core's fields: the radius it clears (0 to 5) and the cycle it goes off in, at the game's ranges. */
export function CoreFields(p: { o: ObjectOptions; onO(o: ObjectOptions): void }) {
  const radius = p.o.radius ?? CORE.defaultRadius;
  const cycles = p.o.cycles ?? CORE.cycles;
  return (
    <>
      <label class="slider-field" title={`The sphere it clears is this radius plus ${CORE.innerRadius}: the ground and what stands in it go`}>
        Radius
        <input type="range" min={CORE.minRadius} max={CORE.maxRadius} step={1} aria-label="Radius" aria-valuetext={`${radius}: clears a sphere of ${radius + CORE.innerRadius}`} value={radius} onInput={(e) => p.onO({ ...p.o, radius: Number((e.target as HTMLInputElement).value) })} />
        <output>{radius}</output>
      </label>
      <NumberField label="Cycle" title={`It goes off in this cycle, ${CORE.days} days after the cycle's first day begins its countdown`} value={cycles} min={CORE.minCycles} step={1} onChange={(v) => p.onO({ ...p.o, cycles: Math.max(CORE.minCycles, Math.round(v)) })} />
    </>
  );
}

/** A reserve's fields: the good it holds (only its kind's) and how much, up to its capacity. */
export function ReserveFields(p: { template: string; o: ObjectOptions; onO(o: ObjectOptions): void }) {
  const r = RESERVES[p.template];
  const goods = goodsFor(p.template);
  const good = p.o.good ?? goods[0].id;
  const amount = p.o.amount ?? r.capacity;
  return (
    <>
      <label title={`What it holds: ${r.type === "Pileable" ? "pileable goods" : r.type === "Box" ? "boxed goods" : "liquids"}, the ones every faction has first`}>
        Holds
        <select aria-label="Holds" value={good} onChange={(e) => p.onO({ ...p.o, good: (e.target as HTMLSelectElement).value })}>
          {goods.map((g) => (
            <option key={g.id} value={g.id}>
              {goodName(g.id)}
              {g.common ? "" : " (one faction's)"}
            </option>
          ))}
        </select>
      </label>
      <NumberField label="Amount" title={`How much it holds, up to ${r.capacity}`} value={amount} min={0} max={r.capacity} step={1} onChange={(v) => p.onO({ ...p.o, amount: Math.max(0, Math.min(r.capacity, Math.round(v))) })} />
      <button type="button" class="linkish" title={`Fill it to its capacity, ${r.capacity}`} onClick={() => p.onO({ ...p.o, amount: r.capacity })}>
        Fill
      </button>
    </>
  );
}
