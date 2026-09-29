// The map card's content (docs/UI-BRIEF.md §3, PLAN §20 D330), in four parts, nothing in it needing
// a scrollbar or a second glance: (1) the name; (2) one "how it plays" line; (3) the legend as one
// row of small icons with counts, only for what's on this map; (4) the numbers on one line: trees
// within walking reach with their logs, and the five difficulty levers as small marks with detail on
// hover. A real place's card carries its name, signature and credits instead of a seed.
//
// The numbers are M9b's (PLAN §20 D325: computed in M9b, shown only here): `analysis.walkReach` and
// `analysis.levers` (src/core/validate/playability.ts on feature/m9b). They are not on dev yet, so
// their types are written out here to match; once M9b merges, `WalkReach` and `Levers` can become
// `NonNullable<PlayabilityAnalysis["walkReach"]>` and `...["levers"]`.

import { footprintTiles, type Orientation } from "../../core/format/footprints";
import { LOG_FLOOR_WALK } from "../../core/data/logFloor";

/** M9b's `analysis.walkReach`: the trees within the starting-logs floor's walk (40 tiles) and the
 *  logs their grown trees hold; the start's farmland and level building land within 20 tiles' walk. */
export interface WalkReach {
  trees: number;
  logs: number;
  farmland: number;
  level: number;
}

/** M9b's `analysis.levers` (item 47's five difficulty levers, information): the start's farmland and
 *  level building land within 20 tiles' walk; the tiles to the nearest metal and to the nearest
 *  badwater (null: none); the shortest dam within 40 tiles that stores the drought's need, in tiles
 *  (null: none does). */
export interface Levers {
  farmland: number;
  metal: number | null;
  badwater: number | null;
  shelter: number | null;
  buildable: number;
}

/** What the card needs of an object on the map (the page's `PreviewEntity` has these). */
export interface CardEntity {
  template: string;
  x: number;
  y: number;
  orientation?: string;
  dead?: boolean;
}

/** Where the map came from: a generated map shows its seed; a real place its place, signature and
 *  credits; an imported map neither. */
export type CardOrigin =
  | { kind: "generated"; seed: number; W: number; H: number }
  | { kind: "place"; W: number; H: number; signature: string | null; credits: { text: string; href?: string } }
  | { kind: "import"; W: number; H: number };

export interface CardInput {
  name: string;
  /** The one "how it plays" line (a generated map's description, a place's `plays`). */
  plays: string;
  origin: CardOrigin;
  entities: readonly CardEntity[];
  walkReach: WalkReach | null;
  levers: Levers | null;
}

// ---------------------------------------------------------------------------------- the legend

export type LegendKey = "source" | "badSource" | "mine" | "ruin" | "berries" | "trees" | "deadTrees" | "relic" | "geothermal" | "core" | "thorns" | "blockage" | "slope";

const TREES = new Set(["Pine", "Birch", "Oak", "Succulent"]);

/** The legend's kinds, in the row's order: water and hazards first, then what the start lives on,
 *  then the rest. The start is left out: every map has one. */
export const LEGEND_KINDS: readonly { key: LegendKey; one: string; many: string; is(e: CardEntity): boolean }[] = [
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
export function legendItems(entities: readonly CardEntity[]): LegendItem[] {
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
export function legendTiles(entities: readonly CardEntity[], key: LegendKey, W: number, H: number): [number, number][] {
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

/** Hovering an icon names it and highlights those things on the land; clicking pins the highlight
 *  (clicking it again, or another icon, moves or drops the pin). While another icon is hovered, it
 *  shows; leaving it returns to the pinned one. */
export interface LegendFocus {
  hover: LegendKey | null;
  pinned: LegendKey | null;
}

export type LegendEvent = { type: "enter"; key: LegendKey } | { type: "leave" } | { type: "click"; key: LegendKey } | { type: "clear" };

export function legendFocus(f: LegendFocus, ev: LegendEvent): LegendFocus {
  switch (ev.type) {
    case "enter":
      return { ...f, hover: ev.key };
    case "leave":
      return { ...f, hover: null };
    case "click":
      return { hover: ev.key, pinned: f.pinned === ev.key ? null : ev.key };
    case "clear":
      return { hover: null, pinned: null };
  }
}

/** What the land highlights: the hovered item, else the pinned one. */
export function highlighted(f: LegendFocus): LegendKey | null {
  return f.hover ?? f.pinned;
}

/** The highlight the card hands the workspace (which draws it on the land). */
export interface LegendHighlight {
  key: LegendKey;
  name: string;
  /** [x, y] tiles, y from the south edge. */
  tiles: [number, number][];
  pinned: boolean;
}

// --------------------------------------------------------------------------------- the numbers

/** "182 trees in reach, 640 logs": the trees within the starting-logs floor's walk. */
export function reachText(r: WalkReach): string {
  return `${r.trees.toLocaleString("en-US")} ${r.trees === 1 ? "tree" : "trees"} in reach, ${r.logs.toLocaleString("en-US")} logs`;
}

export const REACH_DETAIL = `Trees within ${LOG_FLOOR_WALK} tiles' walk of the start, and the logs their grown trees give.`;

export type LeverKey = keyof Levers;
/** A lever's mark: how much it eases or tightens the start. */
export type Grade = "easier" | "middling" | "harder";

/**
 * Where each lever's mark changes, in tiles (a default this step chose, for Kyler's audit and the
 * design pass to tune; recorded in docs/progress/page-editor.md). `more` levers are easier the
 * bigger they are (farmland, building land); `less` ones the smaller (metal, a dam); badwater is
 * easier the farther away. At or past `easy` the mark is "easier"; short of `hard` it is "harder".
 */
export const LEVER_BANDS: Record<LeverKey, { easier: "more" | "less"; easy: number; hard: number }> = {
  // item 47's floor is 100 tiles of farmland, the settler's ask 160
  farmland: { easier: "more", easy: 300, hard: 150 },
  // the tiles to the nearest mine site or ruin column
  metal: { easier: "less", easy: 25, hard: 60 },
  // the tiles to the nearest badwater: Normal's start rule is 15, Easy's 30
  badwater: { easier: "more", easy: 40, hard: 15 },
  // the shortest dam that stores the drought's need
  shelter: { easier: "less", easy: 8, hard: 16 },
  // level building land: item 47's floor is 79 to 180 by Start area
  buildable: { easier: "more", easy: 400, hard: 200 },
};

export const LEVER_NAMES: Record<LeverKey, string> = {
  farmland: "Farmland",
  metal: "Metal",
  badwater: "Badwater",
  shelter: "Shelter from a badtide",
  buildable: "Building land",
};

export const LEVER_ORDER: readonly LeverKey[] = ["farmland", "metal", "badwater", "shelter", "buildable"];

/** A lever's mark. A missing metal or dam is "harder"; missing badwater is "easier". */
export function leverGrade(key: LeverKey, v: number | null): Grade {
  const b = LEVER_BANDS[key];
  if (v === null) return key === "badwater" ? "easier" : "harder";
  if (b.easier === "more") return v >= b.easy ? "easier" : v >= b.hard ? "middling" : "harder";
  return v <= b.easy ? "easier" : v <= b.hard ? "middling" : "harder";
}

const GRADE_WORDS: Record<Grade, string> = { easier: "easier", middling: "middling", harder: "harder" };

/** The detail a lever's mark shows on hover. */
export function leverDetail(key: LeverKey, v: number | null): string {
  const n = (x: number) => Math.round(x).toLocaleString("en-US");
  const what = (() => {
    switch (key) {
      case "farmland":
        return `${n(v ?? 0)} tiles of moist farmland within 20 tiles' walk of the start`;
      case "metal":
        return v === null ? "No metal on the map" : `The nearest metal (a mine site or ruins) is ${n(v)} tiles from the start`;
      case "badwater":
        return v === null ? "No badwater on the map" : `The nearest badwater is ${n(v)} tiles from the start`;
      case "shelter":
        return v === null ? "No dam near the start holds the drought's water" : `A ${n(v)}-tile dam near the start holds the drought's water`;
      case "buildable":
        return `${n(v ?? 0)} tiles of level building land within 20 tiles' walk of the start`;
    }
  })();
  return `${LEVER_NAMES[key]}: ${GRADE_WORDS[leverGrade(key, v)]}. ${what}.`;
}

export interface LeverMark {
  key: LeverKey;
  name: string;
  grade: Grade;
  detail: string;
}

export function leverMarks(l: Levers): LeverMark[] {
  return LEVER_ORDER.map((key) => ({ key, name: LEVER_NAMES[key], grade: leverGrade(key, l[key]), detail: leverDetail(key, l[key]) }));
}

/** The small line under the name: a generated map's size and seed; a real place's size. */
export function originText(o: CardOrigin): string {
  const size = `${o.W}×${o.H}`;
  return o.kind === "generated" ? `${size} · seed ${o.seed}` : size;
}

// ------------------------------------------------------------------------------ the card's input

/** A generated map's card, from the page's response for it (`GenerateResponse`: its name, premise,
 *  spec, size and objects) and M9b's numbers when they come with it. */
export function generatedCard(r: { name: string; premise: string; spec: { seed: number }; W: number; H: number; entities: readonly CardEntity[]; walkReach?: WalkReach | null; levers?: Levers | null }): CardInput {
  return { name: r.name, plays: r.premise, origin: { kind: "generated", seed: r.spec.seed, W: r.W, H: r.H }, entities: r.entities, walkReach: r.walkReach ?? null, levers: r.levers ?? null };
}

/** A real place's card: its name, how it plays and its signature (the feature it is known for,
 *  D306; null until the place data carries one), and the elevation data's credit (the full notices
 *  stay with the Real places gallery, D136). */
export function placeCard(
  p: { name: string; plays: string; W: number; H: number; signature?: string | null },
  map: { entities: readonly CardEntity[]; walkReach?: WalkReach | null; levers?: Levers | null },
  credit: { text: string; href?: string },
): CardInput {
  return { name: p.name, plays: p.plays, origin: { kind: "place", W: p.W, H: p.H, signature: p.signature ?? null, credits: credit }, entities: map.entities, walkReach: map.walkReach ?? null, levers: map.levers ?? null };
}
