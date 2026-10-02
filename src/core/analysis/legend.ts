// The map card's legend row (docs/UI-BRIEF.md §3, PLAN §20 D330): what's on a map, one kind at a time
// with its count, and the tiles each kind covers for the highlight on the land. A plain question
// over the map's objects (D342 (3)); the card only shows it.

import { footprintTiles, type Orientation } from "../format/footprints";

/** What the legend reads of an object on the map (the page's `PreviewEntity` and the core's
 *  `MapObject` both have these). */
export interface LegendEntity {
  template: string;
  x: number;
  y: number;
  orientation?: string;
  dead?: boolean;
}

export type LegendKey = "source" | "badSource" | "mine" | "ruin" | "berries" | "trees" | "deadTrees" | "relic" | "geothermal" | "core" | "thorns" | "blockage" | "slope";

const TREES = new Set(["Pine", "Birch", "Oak", "Succulent"]);

/** The legend's kinds, in the row's order: water and hazards first, then what the start lives on,
 *  then the rest. The start is left out: every map has one. */
export const LEGEND_KINDS: readonly { key: LegendKey; one: string; many: string; is(e: LegendEntity): boolean }[] = [
  { key: "source", one: "Water source", many: "Water sources", is: (e) => e.template === "WaterSource" },
  { key: "badSource", one: "Badwater source", many: "Badwater sources", is: (e) => e.template === "BadwaterSource" },
  { key: "mine", one: "Mine site", many: "Mine sites", is: (e) => e.template === "UndergroundRuins" },
  { key: "ruin", one: "Ruin", many: "Ruins", is: (e) => /^RuinColumnH\d+$/.test(e.template) },
  { key: "berries", one: "Berry bush", many: "Berry bushes", is: (e) => e.template === "BlueberryBush" && !e.dead },
  { key: "trees", one: "Tree", many: "Trees", is: (e) => TREES.has(e.template) && !e.dead },
  { key: "deadTrees", one: "Dead tree", many: "Dead trees", is: (e) => TREES.has(e.template) && !!e.dead },
  { key: "relic", one: "Relic", many: "Relics", is: (e) => /Relic$/.test(e.template) },
  { key: "geothermal", one: "Geothermal field", many: "Geothermal fields", is: (e) => e.template === "GeothermalField" },
  { key: "core", one: "Unstable core", many: "Unstable cores", is: (e) => e.template === "UnstableCore" },
  { key: "thorns", one: "Thorns", many: "Thorns", is: (e) => e.template === "Thorns" },
  { key: "blockage", one: "Blockage", many: "Blockages", is: (e) => e.template === "Blockage" },
  { key: "slope", one: "Slope", many: "Slopes", is: (e) => e.template === "Slope" },
];

export interface LegendItem {
  key: LegendKey;
  /** "Mine sites", or "Mine site" for one. */
  name: string;
  count: number;
}

/** The legend row: only what's on this map, each with its count. */
export function legendItems(entities: readonly LegendEntity[]): LegendItem[] {
  const counts = new Map<LegendKey, number>();
  for (const e of entities)
    for (const k of LEGEND_KINDS)
      if (k.is(e)) {
        counts.set(k.key, (counts.get(k.key) ?? 0) + 1);
        break;
      }
  return LEGEND_KINDS.filter((k) => counts.has(k.key)).map((k) => {
    const count = counts.get(k.key)!;
    return { key: k.key, name: count === 1 ? k.one : k.many, count };
  });
}

/** The tiles a legend item stands for (each object's footprint), for the highlight on the land.
 *  [x, y], y from the south edge as the map stores it. */
export function legendTiles(entities: readonly LegendEntity[], key: LegendKey, W: number, H: number): [number, number][] {
  const kind = LEGEND_KINDS.find((k) => k.key === key);
  if (!kind) return [];
  const out: [number, number][] = [];
  const seen = new Set<number>();
  for (const e of entities) {
    if (!kind.is(e)) continue;
    let shape: [number, number][];
    try {
      shape = footprintTiles(e.template, { template: e.template, x: 0, y: 0, z: 0, orientation: (e.orientation ?? "Cw0") as Orientation, flipped: false });
    } catch {
      shape = [];
    }
    if (!shape.length) shape = [[0, 0]];
    for (const [dx, dy] of shape) {
      const x = e.x + dx;
      const y = e.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H || seen.has(y * W + x)) continue;
      seen.add(y * W + x);
      out.push([x, y]);
    }
  }
  return out;
}
