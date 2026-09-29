// The map card's view state and input (docs/UI-BRIEF.md §3, PLAN §20 D330): what the card shows is
// assembled here from the core's answers (the legend row: core/analysis/legend.ts; the numbers:
// core/analysis/levers.ts); the hover and pin of the legend are the card's own.

import type { LegendEntity, LegendKey } from "../../core/analysis/legend";
import type { Levers, WalkReach } from "../../core/analysis/levers";

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
  entities: readonly LegendEntity[];
  walkReach: WalkReach | null;
  levers: Levers | null;
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

/** The small line under the name: a generated map's size and seed; a real place's size. */
export function originText(o: CardOrigin): string {
  const size = `${o.W}×${o.H}`;
  return o.kind === "generated" ? `${size} · seed ${o.seed}` : size;
}

// ------------------------------------------------------------------------------ the card's input

/** A generated map's card, from the page's response for it (`GenerateResponse`: its name, premise,
 *  spec, size and objects) and M9b's numbers when they come with it. */
export function generatedCard(r: { name: string; premise: string; spec: { seed: number }; W: number; H: number; entities: readonly LegendEntity[]; walkReach?: WalkReach | null; levers?: Levers | null }): CardInput {
  return { name: r.name, plays: r.premise, origin: { kind: "generated", seed: r.spec.seed, W: r.W, H: r.H }, entities: r.entities, walkReach: r.walkReach ?? null, levers: r.levers ?? null };
}

/** A real place's card: its name, how it plays and its signature (the feature it is known for,
 *  D306; null until the place data carries one), and the elevation data's credit (the full notices
 *  stay with the Real places gallery, D136). */
export function placeCard(
  p: { name: string; plays: string; W: number; H: number; signature?: string | null },
  map: { entities: readonly LegendEntity[]; walkReach?: WalkReach | null; levers?: Levers | null },
  credit: { text: string; href?: string },
): CardInput {
  return { name: p.name, plays: p.plays, origin: { kind: "place", W: p.W, H: p.H, signature: p.signature ?? null, credits: credit }, entities: map.entities, walkReach: map.walkReach ?? null, levers: map.levers ?? null };
}
