// The quiet note about water (collaborative editing; D362, D486; docs/COLLAB-BRIEF.md §4). Headless, plain
// data (D342).
//
// Water flows as the game would, across claims: an edit never stops for it. When one player's edit changes
// the water inside the other's claim (floods it, drains it), the other gets a quiet note naming who and
// where, with a way to see it. This is the whole question: given the settled water before and after an
// edit (the depth per tile as the session stores it, `built.water`) and the claims as they stood, which
// tiles of the other player's area flooded or drained by more than a small threshold, summarised as who
// edited, where (bounds and a centre) and how many. Nothing when nothing meaningful changed: water that
// differs by a trace, or by a tile or two, is the settle's noise, not an event.
//
// The caller publishes the note once the edit's water has settled (not the preview's waves), holding the
// claims as they stood when it ran.
//
// Adapted from investigation/collab-architecture (`architecture.ts` `waterNotices`).

import { ClaimsState, DEFAULT_NAMES, otherPlayer, type PlayerId, type PlayerNames } from "./claims";

/** The water an edit changed inside the other player's claim. */
export interface WaterNote {
  /** Who edited. */
  by: PlayerId;
  /** Whose area the water changed in. */
  owner: PlayerId;
  /** Tiles of that area that now hold more water, and fewer; (with contamination given) the ones fouled. */
  flooded: number;
  drained: number;
  fouled: number;
  /** All the tiles that changed (flooded + drained + the fouled that neither). */
  tiles: number;
  /** The rectangle that holds them (tiles, inclusive). */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** One of the changed tiles, near their middle: where "See it" takes the camera. */
  centre: { x: number; y: number };
  /** The changed tiles as [y, x0, x1] runs, for outlining them. */
  runs: [number, number, number][];
}

export interface WaterNoteOptions {
  /** The change in a tile's water depth (levels) that counts. Default 0.25. */
  threshold?: number;
  /** Fewer changed tiles than this are not worth a note. Default 3. */
  minTiles?: number;
  /** Contamination (0 to 1) before and after, to note badwater reaching the area; a change of at least
   *  `contaminationThreshold` (default 0.1) in a tile counts. */
  contamination?: { before: ArrayLike<number>; after: ArrayLike<number> };
  contaminationThreshold?: number;
}

/** The note for the water an edit by `by` changed in the other player's claim, or null when it changed
 *  none worth noting. `before` and `after` are the settled depth per tile (W · H), `claims` as they stood
 *  while the water settled. */
export function waterNote(before: ArrayLike<number>, after: ArrayLike<number>, claims: ClaimsState, by: PlayerId, options: WaterNoteOptions = {}): WaterNote | null {
  const { W, H } = claims;
  if (before.length !== W * H || after.length !== W * H) throw new Error("the water must be one depth per tile of the claims' map");
  const threshold = options.threshold ?? 0.25;
  const minTiles = options.minTiles ?? 3;
  const owner = otherPlayer(by);
  const code = ClaimsState.code(owner);
  const dirty = options.contamination;
  const cThreshold = options.contaminationThreshold ?? 0.1;
  let flooded = 0;
  let drained = 0;
  let fouled = 0;
  const tiles: number[] = [];
  for (let i = 0; i < claims.owner.length; i++) {
    if (claims.owner[i] !== code) continue;
    const d = after[i] - before[i];
    const wet = d >= threshold;
    const dry = d <= -threshold;
    const foul = !!dirty && dirty.after[i] - dirty.before[i] >= cThreshold;
    if (!wet && !dry && !foul) continue;
    tiles.push(i);
    if (wet) flooded++;
    if (dry) drained++;
    if (foul) fouled++;
  }
  if (tiles.length < minTiles) return null;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, sx = 0, sy = 0;
  const runs: [number, number, number][] = [];
  for (const i of tiles) {
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    sx += x;
    sy += y;
    const last = runs[runs.length - 1];
    if (last && last[0] === y && last[2] === x - 1) last[2] = x;
    else runs.push([y, x, x]);
  }
  // the changed tile nearest the middle of them (the middle itself may be dry land of the crescent)
  const mx = sx / tiles.length;
  const my = sy / tiles.length;
  let best = tiles[0];
  let bd = Infinity;
  for (const i of tiles) {
    const dx = (i % W) - mx;
    const dy = Math.floor(i / W) - my;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { by, owner, flooded, drained, fouled, tiles: tiles.length, bounds: { x0, y0, x1, y1 }, centre: { x: best % W, y: Math.floor(best / W) }, runs };
}

/** The note in words, for the one who receives it: short and quiet ("Emma's edit flooded 12 tiles of your area"). */
export function describeWaterNote(note: WaterNote, names: PlayerNames = DEFAULT_NAMES): string {
  const n = (k: number) => `${k} ${k === 1 ? "tile" : "tiles"}`;
  const parts: string[] = [];
  if (note.flooded) parts.push(`flooded ${n(note.flooded)}`);
  if (note.drained) parts.push(`drained ${n(note.drained)}`);
  if (note.fouled) parts.push(`fouled ${n(note.fouled)}`);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${names[note.by]}'s edit ${what} of your area`;
}
