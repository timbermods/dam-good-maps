// An oxbow lake's water (D199, D216). When a carve cuts off a bend, sediment seals both old mouths
// and the crescent between them is a basin no source feeds. The game's canonical settle, from the
// terrain and the sources alone, would start it dry; the lake instead keeps the water the game
// settles on the map just before its mouths closed (the pre-closure bed, with the carve's real
// source). That water is stored with the carve (sim/water.ts RetainedWater), and every settle of
// the map starts the lake from it, then runs the game's own rules: with nothing feeding it, it
// evaporates over time, as an unfed oxbow does in the game. No hidden source, no set lake level.
//
// Ported from investigation/carve/water.ts (PR #47): the same basin and the same two stages (the
// pre-closure settle, then the settle of the final map starting from it).

import { canonicalSettle } from "../../sim/prefill";
import type { RetainedWater } from "../../sim/water";
import { modelFor, type CarveRun } from "./run";

/** The connected low ground behind both mouth bars (below their level), in the order found; empty
 *  when there is none, or when it reaches the live river (the shortcut) or the carve's source. */
export function oxbowBasin(run: CarveRun): number[] {
  const cut = run.oxbows[0];
  if (!cut) return [];
  const m = run.map;
  const level = Math.min(...cut.bars.map((b) => b.level));
  const at = (p: { x: number; y: number }) => Math.round(p.y) * m.W + Math.round(p.x);
  const start = at(cut.pool[Math.floor(cut.pool.length / 2)]);
  const seen = new Set([start]);
  const queue = [start];
  if (m.heights[start] >= level) return [];
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % m.W;
    const y = Math.floor(i / m.W);
    for (const j of [y ? i - m.W : -1, x ? i - 1 : -1, x < m.W - 1 ? i + 1 : -1, y < m.H - 1 ? i + m.W : -1])
      if (j >= 0 && !seen.has(j) && m.heights[j] < level) {
        seen.add(j);
        queue.push(j);
      }
  }
  if (cut.neck.some((p) => seen.has(at(p))) || seen.has(run.intent.origin)) return [];
  return queue;
}

/** The water a carve's sealed oxbow keeps (null: no oxbow, a dry canyon, or a basin still open to
 *  the river): the pre-closure settle's water on the basin's tiles, with their floors now. */
export function oxbowLake(run: CarveRun): RetainedWater | null {
  const basin = run.closure && !run.settings.dry ? oxbowBasin(run) : [];
  if (!basin.length) return null;
  const first = canonicalSettle(modelFor(run.closure!));
  const floor = modelFor(run.map).floor;
  const tiles = basin.slice().sort((a, b) => a - b);
  return {
    tiles,
    floor: tiles.map((i) => floor[i]),
    depth: tiles.map((i) => first.depth[i]),
    contamination: tiles.map((i) => first.contamination[i]),
  };
}
