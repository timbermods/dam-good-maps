// Where on the map an action was, in the few plain words a refusal uses. `placeOf` names the feature that holds most of
// the tiles ("at the north lake", "by the start": the lake, river, start or landform whose footprint holds most of them,
// with a compass word only when the map has several of that kind) and otherwise gives a compass word ("in the
// north-east", `placeWords`). North is +y, as everywhere in the core (gen/names.ts). Worked out from the tiles an action
// wrote, or touched when it wrote none; a map-wide reach names no place.

import type { MapSession } from "../doc/session";
import type { Feature } from "../features/schema";
import { terrainFootprint } from "../features/raster/terrain";
import type { Mask } from "./mask";

/** The box of tiles [x0, y0, x1, y1] (inclusive). */
export type Box = [number, number, number, number];

/** The smallest box holding the tiles, or null when there are none or they are the whole map. */
export function boxOf(W: number, H: number, m: Mask): Box | null {
  const n = m.size;
  if (!n || n === W * H) return null;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (const i of m.tiles()) {
    const x = i % W;
    const y = Math.floor(i / W);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** "north-east", "west", "south" or "" (the middle) for a point given as fractions of the map. */
function compass(cx: number, cy: number): string {
  const col = cx < 1 / 3 ? "west" : cx > 2 / 3 ? "east" : "";
  const row = cy < 1 / 3 ? "south" : cy > 2 / 3 ? "north" : "";
  return row && col ? `${row}-${col}` : row || col;
}

export function placeWords(W: number, H: number, m: Mask): string {
  const b = boxOf(W, H, m);
  if (!b) return "";
  const [x0, y0, x1, y1] = b;
  if ((x1 - x0 + 1) / W >= 0.6 && (y1 - y0 + 1) / H >= 0.6) return "across the map";
  const name = compass((x0 + x1 + 1) / 2 / W, (y0 + y1 + 1) / 2 / H);
  return name ? `in the ${name}` : "in the middle";
}

const NAMED = { lake: "lake", river: "river", start: "start", landform: "landform" } as const;

/** The place of the tiles, in words: a feature when one holds most of them (the smallest that holds at least 60%), else a compass word. */
export function placeOf(session: MapSession, m: Mask): string {
  const { W, H } = session.built;
  const n = m.size;
  if (!n || n === W * H) return "";
  const features = session.features;
  const byId = new Map(features.map((f) => [f.id, f]));
  const target = { W, H, river: (id: string) => { const f = byId.get(id); return f && f.kind === "river" ? f : undefined; } };
  const tiles = m.tiles();
  let best: { f: Feature; cx: number; cy: number; area: number } | null = null;
  for (const f of features) {
    if (!(f.kind in NAMED)) continue;
    const r = terrainFootprint(f, target);
    if (!r || r === "all") continue;
    let inside = 0;
    for (const i of tiles) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) inside++;
    }
    if (inside * 10 < n * 6) continue;
    const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    if (!best || area < best.area || (area === best.area && f.id < best.f.id)) best = { f, cx: (r.x0 + r.x1 + 1) / 2 / W, cy: (r.y0 + r.y1 + 1) / 2 / H, area };
  }
  if (!best) return placeWords(W, H, m);
  const kind = best.f.kind as keyof typeof NAMED;
  if (kind === "start") return "by the start";
  const several = features.filter((f) => f.kind === kind).length > 1;
  const where = several ? compass(best.cx, best.cy) || "middle" : "";
  return `at the ${where ? `${where} ` : ""}${NAMED[kind]}`;
}
