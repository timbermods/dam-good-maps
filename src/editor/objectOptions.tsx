// The settings of the objects beyond the sources (PLAN §20 D337, D338, D339), as the object window's groups: a water
// object's strength and start delay, an unstable core's radius and cycle, a reserve's good and amount. The one set of
// controls serves the object held from the shelf (what the next one gets) and an object picked on the map (what it has
// now); what each means, and what the game allows, is the core's (core/doc/objectOps.ts, core/data/parity.ts).

import { CORE, FLUIDS, goodName, goodsFor, isReserve, MAX_STRENGTH_PER_TILE, maxStrength, NO_DELAY, RESERVES, TIMED } from "../core/data/parity";
import type { ObjectOptions } from "../core/doc/objectOps";
import { tip } from "../ui/Tooltip";
import { ObjectChoice, ObjectSlider, type ObjectGroup } from "./ObjectWindow";

/** The cycles a start delay or a countdown can be set to (the game takes 1 and up; the slider reaches a long game). */
const CYCLES_MAX = 15;

/** A water object's strength in words: "1 water/s", "3 badwater/s", or "sink 2" for a negative one. */
export function strengthWords(template: string, v: number): string {
  if (v < 0) return `sink ${-v}`;
  return `${v} ${FLUIDS[template]?.contamination ? "badwater" : "water"}/s`;
}

/** The groups of the object window for an object of `template` with options `o`; `set` changes some of them. Nothing for a
 *  template without any (an Ancient aquifer drill says only where it stands). */
export function objectGroups(template: string, o: ObjectOptions, set: (c: Partial<ObjectOptions>) => void): ObjectGroup[] {
  const spec = FLUIDS[template];
  const out: ObjectGroup[] = [];
  if (spec?.tiles) {
    const strength = o.strength ?? spec.defaultStrength ?? 1;
    out.push({
      key: "strength",
      label: "Strength",
      value: strengthWords(template, strength),
      node: (
        <ObjectSlider
          label="Strength"
          min={-MAX_STRENGTH_PER_TILE}
          max={maxStrength(template)}
          step={0.5}
          value={strength}
          words={strengthWords(template, strength)}
          tipText="How much it gives each second; below 0 it drains"
          onInput={(v) => set({ strength: v })}
        />
      ),
    });
    if (spec.timed) {
      const timed = o.timed ?? NO_DELAY;
      out.push({
        key: "starts",
        label: "Starts",
        node: (
          <ObjectChoice
            label="Starts"
            value={timed.enabled ? "later" : "now"}
            options={[
              ["now", "At once", "It runs from the start"],
              ["later", "Later", "It starts after some cycles"],
            ]}
            onPick={(v) => set({ timed: { ...timed, enabled: v === "later" } })}
          />
        ),
      });
      if (timed.enabled)
        out.push({
          key: "cycle",
          label: "Cycle",
          value: `${timed.cycles}`,
          node: (
            <ObjectSlider
              label="Cycle"
              min={TIMED.minCycles}
              max={CYCLES_MAX}
              step={1}
              value={timed.cycles}
              words={`cycle ${timed.cycles}`}
              tipText="The cycle it starts in"
              onInput={(v) => set({ timed: { ...timed, cycles: v } })}
            />
          ),
        });
    }
  } else if (template === "AncientAquiferDrill") {
    out.push({ key: "stands", node: <span class="bar-status note">Stand it on an aquifer</span> });
  } else if (template === "UnstableCore") {
    const radius = o.radius ?? CORE.defaultRadius;
    const cycles = o.cycles ?? CORE.cycles;
    out.push(
      {
        key: "radius",
        label: "Radius",
        value: `${radius}`,
        node: <ObjectSlider label="Radius" min={CORE.minRadius} max={CORE.maxRadius} step={1} value={radius} words={`${radius} tiles`} tipText="How far the blast reaches" onInput={(v) => set({ radius: v })} />,
      },
      {
        key: "cycle",
        label: "Goes off in cycle",
        value: `${cycles}`,
        node: <ObjectSlider label="Goes off in cycle" min={CORE.minCycles} max={CYCLES_MAX} step={1} value={cycles} words={`cycle ${cycles}`} tipText="The cycle it goes off in" onInput={(v) => set({ cycles: v })} />,
      },
    );
  } else if (isReserve(template)) {
    const r = RESERVES[template];
    const goods = goodsFor(template);
    const good = o.good ?? goods[0]?.id ?? "";
    const amount = o.amount ?? r.capacity;
    out.push(
      {
        key: "good",
        label: "Holds",
        node: (
          <select aria-label="Holds" value={good} {...tip("What it holds")} onChange={(e) => set({ good: (e.target as HTMLSelectElement).value })}>
            <optgroup label="Every faction">
              {goods.filter((g) => g.common).map((g) => (
                <option key={g.id} value={g.id}>
                  {goodName(g.id)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other goods">
              {goods.filter((g) => !g.common).map((g) => (
                <option key={g.id} value={g.id}>
                  {goodName(g.id)}
                </option>
              ))}
            </optgroup>
          </select>
        ),
      },
      {
        key: "amount",
        label: "Amount",
        value: `${amount} of ${r.capacity}`,
        node: <ObjectSlider label="Amount" min={0} max={r.capacity} step={10} value={amount} words={`${amount} of ${r.capacity}`} tipText="How much it holds" onInput={(v) => set({ amount: v })} />,
      },
    );
  }
  return out;
}
