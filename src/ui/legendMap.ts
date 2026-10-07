// The legend lists only what is on the map shown, and points to it: each line of the 3D view's
// legend (render3d/palette.ts) is matched to the tiles on the map it describes, from the map as the
// renderer holds it (its terrain, water, soil and objects). A line the map has no tile for is left
// out; clicking a line highlights its tiles.

import { footprintTiles, type Orientation } from "../core/format/footprints";
import { DEAD, ORIENTATION_NAMES, type EntityView, type SoilView, type SurfaceWater } from "../render3d/model";
import type { LegendEntry } from "../render3d/palette";

/** The map the legend reads: what the renderer draws. */
export interface LegendMap {
  W: number;
  H: number;
  heights: Uint8Array;
  surface: SurfaceWater;
  soil: SoilView | null;
  entities: EntityView;
}

/** Badwater's share that makes water "mixed" and "bad" (the water shader's steps). */
const MIXED = 0.05;
const BAD = 0.9;

const PLANTS = new Set(["Pine", "Birch", "Oak", "Succulent", "BlueberryBush"]);
/** Objects the legend names; anything else is "Other objects". */
const NAMED: [RegExp, string][] = [
  [/^StartingLocation$/, "start"],
  [/^Slope$/, "slope"],
  [/^RuinColumnH\d+$/, "ruin"],
  [/^UndergroundRuins$/, "mine"],
  [/^WaterSource$/, "source"],
  [/^BadwaterSource$/, "badSource"],
  [/^GeothermalField$/, "geothermal"],
  [/Relic$/, "relic"],
  [/^Thorns$/, "thorns"],
  [/^Blockage$/, "blockage"],
];

/** What each legend line stands for, by its name (the palette owns the names; a marker line shares the key of
 *  what it marks). Unknown lines are kept, with nothing to point to. */
const KEYS: Record<string, string> = {
  "Moist ground": "moist",
  "Dry ground": "dry",
  "Contaminated ground": "contaminated",
  "Contamination edge": "contaminated",
  "Ground height": "height",
  "Mixed water": "mixed",
  Water: "water",
  Badwater: "badwater",
  Walls: "walls",
  "Level lines": "walls",
  "Dead trees": "dead",
  "Trees and bushes": "plants",
  Start: "start",
  Slope: "slope",
  "Slope arrows": "slope",
  Ruins: "ruin",
  "Mine site": "mine",
  "Mine site outline": "mine",
  "Water source": "source",
  "Badwater source": "badSource",
  "Geothermal field": "geothermal",
  Relic: "relic",
  Thorns: "thorns",
  Blockage: "blockage",
  "Other objects": "other",
};

export function legendKey(label: string): string | null {
  return KEYS[label] ?? null;
}

/** The tiles of every key the map has (a key with no tiles is not on the map). */
export function legendTiles(m: LegendMap): Map<string, number[]> {
  const { W, H, heights, surface, soil, entities: e } = m;
  const N = W * H;
  const out = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    let a = out.get(k);
    if (!a) out.set(k, (a = []));
    a.push(i);
  };
  for (let i = 0; i < N; i++) {
    const wet = surface.surface[i] === surface.surface[i] && surface.depth[i] > 0.05 && !(surface.floor[i] < heights[i] - 0.01);
    if (wet) {
      const c = surface.contamination[i];
      add(c >= BAD ? "badwater" : c >= MIXED ? "mixed" : "water", i);
    } else {
      const moist = soil ? soil.moisture[i] : 0;
      const bad = soil ? soil.contamination[i] : 0;
      add(bad > 0 ? "contaminated" : moist > 0 ? "moist" : "dry", i);
    }
    const x = i % W;
    const h = heights[i];
    if ((x > 0 && heights[i - 1] < h) || (x < W - 1 && heights[i + 1] < h) || (i >= W && heights[i - W] < h) || (i < N - W && heights[i + W] < h)) add("walls", i);
  }
  // each template's key and footprint are worked out once (a map has thousands of trees)
  const keys = e.templates.map((t) => {
    if (PLANTS.has(t)) return null;
    for (const [re, name] of NAMED) if (re.test(t)) return name;
    return "other";
  });
  const shapes = new Map<number, [number, number][]>();
  for (let k = 0; k < e.count; k++) {
    const ti = e.template[k];
    const key = keys[ti] ?? (e.flags[k] & DEAD ? "dead" : "plants");
    const shapeKey = ti * 4 + e.orientation[k];
    let shape = shapes.get(shapeKey);
    if (!shape) {
      const t = e.templates[ti];
      const tiles = footprintTiles(t, { template: t, x: 0, y: 0, z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: false });
      shape = tiles.length ? tiles : [[0, 0]];
      shapes.set(shapeKey, shape);
    }
    for (const [dx, dy] of shape) {
      const x = e.x[k] + dx;
      const y = e.y[k] + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) add(key, y * W + x);
    }
  }
  out.set("height", []);
  return out;
}

/** A legend line with the tiles it points to on the map. */
export interface PresentEntry extends LegendEntry {
  key: string;
  tiles: number[];
}

/** The legend's lines that the map has, each with its tiles. Lines whose meaning the map cannot
 *  say (a page's own, like dam sites, bring their tiles) are kept. */
export function presentEntries(entries: readonly (LegendEntry & { tiles?: number[] })[], m: LegendMap | null): PresentEntry[] {
  const tiles = m ? legendTiles(m) : null;
  const out: PresentEntry[] = [];
  for (const en of entries) {
    if (en.tiles) {
      if (en.tiles.length) out.push({ ...en, key: en.label, tiles: en.tiles });
      continue;
    }
    const key = legendKey(en.label);
    if (!key || !tiles) {
      out.push({ ...en, key: key ?? en.label, tiles: [] });
      continue;
    }
    const t = tiles.get(key);
    if (t) out.push({ ...en, key, tiles: t });
  }
  return out;
}
