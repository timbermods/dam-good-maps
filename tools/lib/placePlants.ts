// A real place's plants on the ground the game keeps them alive on (#523). The survey planted its trees and
// bushes on ground its sealed border's pools kept moist; with the edges open (D151) and the unfed puddles gone
// (D385) much of that ground is dry, and `plants.survive` counts the plants there as dying. Objects only, never
// the land or the water (D245, D331): each living plant on soil that kills it (doc/plantSoil.ts `diesOnSoil`, the
// check's own rule) moves to the nearest free tile close by where it lives, or goes. The start's wood comes first:
// logs lost near the start come back as oaks on moist ground nearest it (`startOaks`, as the `start.wood` fix
// plants them), and where there is too little of that, the dying trees nearest the start stay (`keepNearest`),
// since a dead tree keeps its logs (data/logFloor.ts `DEAD_TREES_KEEP_LOGS`). tools/real-places.ts builds and
// checks each step. Pure and deterministic.

import { decodeTiles, type PlaceData } from "../../src/core/places/place";
import { encodeTiles } from "./placeData";
import { startTiles } from "../../src/core/places/start";
import { diesOnSoil, type PlantGround } from "../../src/core/doc/plantSoil";

/** The kinds of living plant a place stores, with the template the check sees. */
const LIVING = [
  ["bushes", "BlueberryBush"],
  ["pines", "Pine"],
  ["birches", "Birch"],
  ["oaks", "Oak"],
] as const;
type LivingKind = (typeof LIVING)[number][0];

/** Least chamfer distance from the start's 3×3 a plant is put at (the `start.food` and `start.wood` fixes' 3). */
const START_CLEAR = 3;

/** A plant taken off soil that kills it: its kind, the tile it stood on and the tile it moved to (-1: gone). */
export interface MovedPlant {
  kind: LivingKind;
  tile: number;
  to: number;
}

/** The tiles a place's objects stand on (its sources, the start's 3×3 and door, every plant and ruin). */
function takenTiles(p: PlaceData): Uint8Array {
  const taken = new Uint8Array(p.W * p.H);
  for (const [x, y] of p.sources) taken[y * p.W + x] = 1;
  for (const i of startTiles(p.W, p.start)) if (i >= 0 && i < taken.length) taken[i] = 1;
  for (const k of ["bushes", "pines", "birches", "oaks", "deadPines", "ruins"] as const) for (const i of decodeTiles(p[k])) taken[i] = 1;
  return taken;
}

/** Whether a living tree or bush put on tile `i` lives there and leaves the start room. */
function plantable(p: PlaceData, g: PlantGround, startDistance: ArrayLike<number> | null, taken: Uint8Array, i: number): boolean {
  const x = i % p.W;
  const y = (i - x) / p.W;
  if (x < 1 || y < 1 || x > p.W - 2 || y > p.H - 2 || taken[i]) return false;
  if (startDistance && !(startDistance[i] >= START_CLEAR)) return false;
  return !diesOnSoil("Oak", g, i);
}

/** Every living plant of `p` on soil that kills it, moved to the nearest tile within `reach` (in tiles, either
 *  way) where it lives, nearest by straight distance and then by tile, in tile order; the rest are dropped. */
export function settlePlants(
  p: PlaceData,
  g: PlantGround,
  startDistance: ArrayLike<number> | null,
  reach: number,
): { place: PlaceData; moves: MovedPlant[] } {
  const { W, H } = p;
  const taken = takenTiles(p);
  const tiles: Record<LivingKind, number[]> = { bushes: decodeTiles(p.bushes), pines: decodeTiles(p.pines), birches: decodeTiles(p.birches), oaks: decodeTiles(p.oaks) };
  const dying: { kind: LivingKind; tile: number }[] = [];
  for (const [kind, template] of LIVING) for (const i of tiles[kind]) if (diesOnSoil(template, g, i)) dying.push({ kind, tile: i });
  dying.sort((a, b) => a.tile - b.tile);
  // the ring of offsets within reach, nearest first
  const ring: [number, number][] = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (dx || dy) ring.push([dx, dy]);
  ring.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
  const gone = new Set<number>();
  const added: Record<LivingKind, number[]> = { bushes: [], pines: [], birches: [], oaks: [] };
  const moves: MovedPlant[] = [];
  for (const d of dying) {
    gone.add(d.tile);
    const x = d.tile % W;
    const y = (d.tile - x) / W;
    let to = -1;
    for (const [dx, dy] of ring) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (plantable(p, g, startDistance, taken, j)) {
        to = j;
        break;
      }
    }
    moves.push({ ...d, to });
    if (to < 0) continue;
    taken[to] = 1;
    added[d.kind].push(to);
  }
  const next = (k: LivingKind) => encodeTiles([...tiles[k].filter((i) => !gone.has(i)), ...added[k]]);
  return { place: { ...p, bushes: next("bushes"), pines: next("pines"), birches: next("birches"), oaks: next("oaks") }, moves };
}

/** Up to `count` oaks on the free tiles nearest the start by `walk` (the walk from the start, in tiles) within
 *  `within` tiles' walk, where they live, and how many there were room for. */
export function startOaks(p: PlaceData, g: PlantGround, startDistance: ArrayLike<number> | null, walk: ArrayLike<number>, count: number, within: number): { place: PlaceData; planted: number } {
  if (count <= 0) return { place: p, planted: 0 };
  const taken = takenTiles(p);
  const near: number[] = [];
  for (let i = 0; i < p.W * p.H; i++) if (walk[i] <= within && plantable(p, g, startDistance, taken, i)) near.push(i);
  near.sort((a, b) => walk[a] - walk[b] || a - b);
  const add = near.slice(0, count);
  return { place: { ...p, oaks: encodeTiles([...decodeTiles(p.oaks), ...add]) }, planted: add.length };
}

/** `p` with the dying trees nearest the start by `walk` (within `within` tiles' walk) back where they stood (off
 *  the tile they moved to, if they moved), until their logs (`logs`, by template) reach `want`; and the moves still
 *  made. Bushes stay off: a dying bush feeds no one, where a dead tree keeps its logs. */
export function keepNearest(
  p: PlaceData,
  moves: readonly MovedPlant[],
  walk: ArrayLike<number>,
  within: number,
  want: number,
  logs: Readonly<Record<string, number>>,
): { place: PlaceData; kept: number; moves: MovedPlant[] } {
  const template = Object.fromEntries(LIVING) as Record<LivingKind, string>;
  // (a tree that moved no farther from the start by the walk gives the start nothing by coming back)
  const order = moves.filter((d) => d.kind !== "bushes" && walk[d.tile] <= within && (d.to < 0 || !(walk[d.to] <= walk[d.tile]))).sort((a, b) => walk[a.tile] - walk[b.tile] || a.tile - b.tile);
  const back = new Set<MovedPlant>();
  let got = 0;
  for (const d of order) {
    if (got >= want) break;
    back.add(d);
    got += logs[template[d.kind]] ?? 0;
  }
  const out = { ...p };
  for (const k of ["pines", "birches", "oaks"] as const) {
    const mine = [...back].filter((d) => d.kind === k);
    if (!mine.length) continue;
    const off = new Set(mine.map((d) => d.to));
    out[k] = encodeTiles([...decodeTiles(p[k]).filter((i) => !off.has(i)), ...mine.map((d) => d.tile)]);
  }
  return { place: out, kept: back.size, moves: moves.filter((d) => !back.has(d)) };
}
