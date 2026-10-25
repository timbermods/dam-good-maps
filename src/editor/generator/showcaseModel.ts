// Showcase mode's page side (D488 (2)): what the map generator's Showcase sheet shows, kept from the showcase worker's
// messages (worker/showcaseApi.ts) by one pure step (`showcaseStep`). The search itself runs in its own worker
// (platform/index.ts `createShowcase`); the page only starts it, hears it and opens a pick.
//
// A search after an earlier one on the same settings goes on from where that one stopped (its next variation), and
// the cards keep the best three of every search on them: the search is the same everywhere for a spec and the maps it
// made, so starting again from the same place would only make the same maps again.

import { sameLand } from "../../core/analysis/story";
import type { MapSpec } from "../../core/spec/mapspec";
import { BEATS, type ShowcaseMessage, type ShowcasePickView, type ShowcaseView } from "../../worker/showcaseApi";


/** The time a search may take, in minutes: a map takes about half a minute at 128², so the shortest makes a handful. */
export const SHOWCASE_MINUTES = [2, 5, 15] as const;
export const SHOWCASE_DEFAULT_MINUTES = 5;
/** The cards: the best three. */
export const SHOWCASE_CARDS = 3;

/** What platform/index.ts `createShowcase` says when the worker itself fails with no words of its own (it never
 *  loaded: after a deploy, its file is gone). */
export const WORKER_ENDED = "the showcase search stopped";

export type ShowcaseStatus = "idle" | "searching" | "stopping" | "done" | "error";

export interface ShowcaseState {
  status: ShowcaseStatus;
  /** The settings searched (their seed, theme, size and settings; the variation the first search began at). */
  base: MapSpec | null;
  /** The variation the next search on the same settings begins at. */
  next: number;
  /** Maps made in this search, and in every search on these settings. */
  tried: number;
  triedBefore: number;
  /** The time allowed this search, and the page's clock when it began (performance.now). */
  budgetMs: number;
  startedAt: number;
  /** The worker's time at its last message. */
  elapsedMs: number;
  /** The best three of earlier searches on these settings, each ready to open. */
  kept: ShowcasePickView[];
  /** This search's best three so far. */
  best: ShowcaseView[];
  /** The cards when a search ends: the best three of all, each ready to open. */
  picks: ShowcasePickView[] | null;
  /** A stop ended the last search early. */
  stopped: boolean;
  error: string | null;
  /** This search's maps' land, by variation, from their pictures (two variations on the same land share one card). */
  lands: Record<number, Uint8Array>;
}

export const SHOWCASE_IDLE: ShowcaseState = {
  status: "idle",
  base: null,
  next: 0,
  tried: 0,
  triedBefore: 0,
  budgetMs: 0,
  startedAt: 0,
  elapsedMs: 0,
  kept: [],
  best: [],
  picks: null,
  stopped: false,
  error: null,
  lands: {},
};

/** The settings a search is of, without the variation it starts at or the intentions a sibling was steered to. */
export function searchKey(s: MapSpec): string {
  return JSON.stringify({ seed: s.seed, theme: s.theme, size: s.size, designedFor: s.designedFor, settings: s.settings });
}

/** Whether a ranks before b: the higher score, then the earlier map. */
const before = (a: ShowcaseView, b: ShowcaseView) => a.score > b.score || (a.score === b.score && a.variation < b.variation);

/** The best three of several lists, best first, each map once and never two on the same land (`landOf`, where known:
 *  a later search on the same settings can make a map on an earlier one's land, as the core's own search never
 *  keeps). */
export function bestOf<T extends ShowcaseView>(lists: T[][], landOf: (v: T) => Uint8Array | undefined = () => undefined): T[] {
  const all = lists.flat().sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
  const out: T[] = [];
  for (const v of all) {
    const land = landOf(v);
    if (out.some((a) => a.variation === v.variation || (land && landOf(a) && sameLand(land, landOf(a)!)))) continue;
    out.push(v);
    if (out.length === SHOWCASE_CARDS) break;
  }
  return out;
}

/** A pick's land, from its response. */
const pickLand = (p: ShowcasePickView) => p.response.heights;

/** A search starts: on the same settings as the last it goes on from that one's next variation, keeping its picks;
 *  on other settings it starts afresh from `spec`. Returns the state and the spec the worker searches from. */
export function showcaseStart(st: ShowcaseState, spec: MapSpec, budgetMs: number, now: number): { state: ShowcaseState; from: MapSpec } {
  const same = !!st.base && searchKey(st.base) === searchKey(spec) && (st.status === "done" || (st.status === "error" && st.tried > 0));
  const base = same ? st.base! : spec;
  const variation = same ? st.next : (spec.variation ?? 0);
  const from: MapSpec = JSON.parse(JSON.stringify(base));
  delete from.accepted;
  if (variation) from.variation = variation;
  else delete from.variation;
  // (the same settings searched again keep their intentions; other settings start from the ones asked for)
  if (!same && spec.intentions?.length) from.intentions = [...spec.intentions];
  return {
    from,
    state: {
      ...SHOWCASE_IDLE,
      status: "searching",
      base: same ? base : from,
      next: variation,
      triedBefore: same ? st.triedBefore + st.tried : 0,
      budgetMs,
      startedAt: now,
      kept: same ? (st.picks ?? st.kept) : [],
    },
  };
}

/** A message from the worker. */
export function showcaseStep(st: ShowcaseState, m: ShowcaseMessage): ShowcaseState {
  if (st.status !== "searching" && st.status !== "stopping") return st;
  if (m.kind === "candidate") {
    const lands = m.preview ? { ...st.lands, [m.candidate.variation]: m.preview.heights } : st.lands;
    return { ...st, tried: m.tried, elapsedMs: m.elapsedMs, best: m.best, lands, next: Math.max(st.next, m.candidate.variation + 1) };
  }
  // (the search makes its variations in order from where it began: the next search begins past the last it made)
  if (m.kind === "done") return { ...st, status: "done", tried: m.tried, elapsedMs: m.elapsedMs, best: m.best, picks: bestOf([st.kept, m.best], pickLand), stopped: m.stopped, next: (st.base?.variation ?? 0) + st.triedBefore + m.tried };
  // (only what can still open stays: an earlier search's picks; this search's maps never came to the page whole)
  return { ...st, status: "error", error: m.message, picks: st.kept };
}

/** The cards as they stand: the best three so far (with earlier searches' picks), each with its pick once it can
 *  open. */
export function showcaseCards(st: ShowcaseState): { view: ShowcaseView; pick: ShowcasePickView | null }[] {
  if (st.picks) return st.picks.map((p) => ({ view: p, pick: p }));
  const landOf = (v: ShowcaseView) => ("response" in v ? (v as ShowcasePickView).response.heights : st.lands[v.variation]);
  return bestOf<ShowcaseView>([st.kept, st.best], landOf).map((v) => ({ view: v, pick: st.kept.find((p) => p.variation === v.variation) ?? null }));
}

/** The beats a map has, of six: the score as a player reads it. */
export function beatsMet(v: ShowcaseView): number {
  return v.arc ? BEATS.filter((id) => v.arc![id].met).length : 0;
}

/** What the map shows, in the core's words: the met beats' lines, the strongest first, each once. */
export function beatSays(v: ShowcaseView, most = 2): string[] {
  const arc = v.arc;
  if (!arc) return [];
  return BEATS.filter((id) => arc[id].met && arc[id].say)
    .sort((a, b) => arc[b].strength - arc[a].strength || BEATS.indexOf(a) - BEATS.indexOf(b))
    .map((id) => arc[id].say!)
    .filter((s, k, all) => all.indexOf(s) === k)
    .slice(0, most);
}

/** Minutes and seconds, "4:05". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "1 map", "12 maps". */
export const maps = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? "map" : "maps"}`;

/** Why a search stopped on an error, said by `who` ("The search" in the sheet, "The showcase search" in the note).
 *  A worker that never ran is most likely one a deploy took away (its file is gone until the page is loaded again). */
export function stoppedWords(st: ShowcaseState, who: string): string {
  return st.error === WORKER_ENDED ? `${who} stopped: its worker could not run. Reload the page to search again.` : `${who} stopped: ${st.error}`;
}

/** The progress line under the time choice. */
export function showcaseWords(st: ShowcaseState, now: number): string {
  const made = st.triedBefore + st.tried;
  switch (st.status) {
    case "idle":
      return "The best three will show here as the search finds them.";
    case "searching": {
      const left = st.budgetMs - (now - st.startedAt);
      return left > 0 ? `${maps(made)} made · ${clock(left)} left` : `${maps(made)} made · finishing the last map`;
    }
    case "stopping":
      return `${maps(made)} made · stopping after the map in hand`;
    case "done":
      if (!st.picks?.length) return `No map of ${maps(made)} passed every check.`;
      return st.stopped ? `Stopped after ${maps(made)}.` : `${capital(maps(made))} made in ${clock(st.elapsedMs)}.`;
    case "error":
      return stoppedWords(st, "The search");
  }
}

/** What the page gives the generator's Showcase sheet. */
export interface ShowcaseModel {
  state: ShowcaseState;
  minutes: number;
  onMinutes(m: number): void;
  /** The sheet is open over the settings. */
  open: boolean;
  onOpen(open: boolean): void;
  /** Start a search (on the same settings, it goes on from the last), or stop the one running. */
  onStart(): void;
  onStop(): void;
  /** Whether the next search goes on from the last (the same settings). */
  continues: boolean;
  /** Each card's picture (a PNG data URL) by its variation, once made. */
  pictures: Record<number, string>;
  /** Open a pick in the editor (the normal open path); the variation of the pick on show, if one is. */
  onOpenPick(p: ShowcasePickView): void;
  shownVariation: number | null;
}
