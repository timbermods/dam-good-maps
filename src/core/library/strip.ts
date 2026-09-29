// The candidates strip's state (docs/UI-BRIEF.md §5, PLAN §20 D329, D330; glossary "Candidates
// strip"): for generated maps only, and otherwise empty. The first candidate that passes is the map,
// shown at once and never swapped. If it missed an outcome that matters, M9b's background search
// looks on; the first version meeting all three goes into the strip, with a short notification only
// where the miss is relevant ("A version with its sea is ready"). More makes further siblings in the
// background; they appear as they finish. A click opens one; the shown map never swaps by itself.
//
// The input is M9b's candidate API (src/worker/api.ts and src/core/gen/versions.ts on
// feature/m9b): a generated map's `version` ({ misses, note } or null), `runFindVersion`'s result,
// and siblings made from `siblingSpec`. Their types are written out here to match, not imported.

import { encodeSpecFragment, type MapSpec } from "../spec/mapspec";

/** M9b's `Misses`: which of the three outcomes the map missed. */
export interface VersionMisses {
  promise: boolean;
  water: boolean;
  standout: boolean;
}

/** M9b's `GenerateResponse.version`: a background search is worth starting; its note, or null when
 *  the version found is kept quietly (D333 (5): for now only a missed theme promise notifies). */
export interface VersionOffer {
  misses: VersionMisses;
  note: string | null;
}

/** What the strip needs of a map (the page's `GenerateResponse` has these). */
export interface CandidateMap {
  spec: MapSpec;
  name: string;
  premise: string;
  W: number;
  H: number;
  heights: Uint8Array;
  /** Water depth per tile, for the thumbnail (`GenerateResponse.water`). */
  water: ArrayLike<number> | null;
}

export interface StripItem {
  /** The candidate's share fragment: its settings, seed and sibling variation. */
  id: string;
  /** The background search's version, or a sibling More made. */
  kind: "version" | "sibling";
  map: CandidateMap;
}

export interface StripState {
  /** The generated map the strip belongs to (its id), or null: the strip is hidden (a real place,
   *  an imported map, or one of Your maps that isn't a fresh generation). */
  forMap: string | null;
  /** The background search is running (quietly: nothing shows for it). */
  searching: boolean;
  items: StripItem[];
  /** Siblings More asked for that haven't finished. */
  pending: number;
  /** The strip item shown now (opened from the strip), if any. */
  current: string | null;
  /** The short notification, until it has been seen. */
  notice: string | null;
}

export const EMPTY_STRIP: StripState = { forMap: null, searching: false, items: [], pending: 0, current: null, notice: null };

/** A candidate's id: its share fragment, sibling variation included (on M9b the fragment carries
 *  it; the suffix keeps ids apart before then). */
export function candidateId(spec: MapSpec): string {
  const v = (spec as MapSpec & { variation?: number }).variation ?? 0;
  return `${encodeSpecFragment(spec)}|${v}`;
}

export type StripEvent =
  /** A new map is shown that did not come from the strip (Generate, a real place, Your maps, a
   *  file): the strip starts over. `offer` is the generated map's `version` (null: nothing to
   *  search for). */
  | { type: "shown"; map: { spec: MapSpec } | null; generated: boolean; offer: VersionOffer | null }
  /** The background search ended for `forMap`: the version found, or null. */
  | { type: "version"; forMap: string; map: CandidateMap | null; note: string | null }
  /** More was pressed: a sibling is on its way. */
  | { type: "more" }
  /** A sibling More asked for finished (or failed: null). */
  | { type: "sibling"; forMap: string; map: CandidateMap | null }
  /** A strip item was opened: it is the map shown now, and the strip stays as it was. */
  | { type: "open"; id: string }
  /** The notification has been shown long enough. */
  | { type: "noticeSeen" };

export function strip(s: StripState, ev: StripEvent): StripState {
  switch (ev.type) {
    case "shown":
      if (!ev.generated || !ev.map) return EMPTY_STRIP;
      return { ...EMPTY_STRIP, forMap: candidateId(ev.map.spec), searching: !!ev.offer };
    case "version": {
      if (ev.forMap !== s.forMap) return s; // a search for a map no longer shown
      if (!ev.map) return { ...s, searching: false };
      const id = candidateId(ev.map.spec);
      if (s.items.some((i) => i.id === id)) return { ...s, searching: false };
      // the version leads the strip; its note shows only where the miss matters
      return { ...s, searching: false, items: [{ id, kind: "version", map: ev.map }, ...s.items], notice: ev.note };
    }
    case "more":
      return s.forMap ? { ...s, pending: s.pending + 1 } : s;
    case "sibling": {
      if (ev.forMap !== s.forMap) return s;
      const pending = Math.max(0, s.pending - 1);
      if (!ev.map) return { ...s, pending };
      const id = candidateId(ev.map.spec);
      if (s.items.some((i) => i.id === id) || id === s.forMap) return { ...s, pending };
      return { ...s, pending, items: [...s.items, { id, kind: "sibling", map: ev.map }] };
    }
    case "open":
      return s.items.some((i) => i.id === ev.id) || ev.id === s.forMap ? { ...s, current: ev.id === s.forMap ? null : ev.id } : s;
    case "noticeSeen":
      return { ...s, notice: null };
  }
}

/** Whether the strip shows at all: for generated maps only. */
export function stripShown(s: StripState): boolean {
  return s.forMap !== null;
}

/** The next sibling's variation for More: past the map's own, the version's and every sibling's
 *  (M9b's `siblingSpec(spec, variation, intentions)` makes its spec). */
export function nextVariation(first: MapSpec, s: StripState): number {
  const v = (spec: MapSpec) => (spec as MapSpec & { variation?: number }).variation ?? 0;
  return Math.max(v(first), ...s.items.map((i) => v(i.map.spec))) + 1 + s.pending;
}
