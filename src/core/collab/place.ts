// Where on the map an action was, in the few plain words a refusal uses. `placeOf` names the feature that holds most of
// the tiles ("at the north lake", "by the start": the lake, river or start whose own ground holds most of them,
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

/** The words for the features a player knows by name (a landform is not one). */
const NAMED = { lake: "lake", river: "river", start: "start" } as const;

const dist2 = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
};

const nearPath = (px: number, py: number, path: readonly (readonly number[])[], reach: number, closed: boolean): boolean => {
  const n = path.length;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const [ax, ay] = path[k];
    const [bx, by] = path[(k + 1) % n];
    if (dist2(px, py, ax, ay, bx, by) <= reach * reach) return true;
  }
  return n === 1 && dist2(px, py, path[0][0], path[0][1], path[0][0], path[0][1]) <= reach * reach;
};

const inside = (px: number, py: number, poly: readonly (readonly number[])[]): boolean => {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) in_ = !in_;
  }
  return in_;
};

/** Whether a tile is the feature's own ground: a lake's tiles inside its outline, a river's within half its width plus its banks of its path, the start's bench. */
function ownGround(f: Feature, session: MapSession): (x: number, y: number) => boolean {
  const { W, H } = session.built;
  if (f.kind === "lake") {
    const poly = f.params.outline;
    return (x, y) => inside(x + 0.5, y + 0.5, poly) || nearPath(x + 0.5, y + 0.5, poly, 0.75, true);
  }
  if (f.kind === "river") {
    const reach = f.params.width / 2 + (f.params.banks ? 2 : 1);
    return (x, y) => nearPath(x + 0.5, y + 0.5, f.params.path, reach, false);
  }
  const r = terrainFootprint(f, { W, H, river: () => undefined });
  return (x, y) => !!r && r !== "all" && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

const PRIORITY = { start: 0, lake: 1, river: 2 } as const;

/** The place of the tiles, in words: the lake, river or start whose own ground holds at least 60% of them (the one holding most), else a compass word. */
export function placeOf(session: MapSession, m: Mask): string {
  const { W, H } = session.built;
  const n = m.size;
  if (!n || n === W * H) return "";
  const features = session.features;
  const tiles = m.tiles();
  let best: { f: Feature; held: number; cx: number; cy: number } | null = null;
  for (const f of features) {
    if (!(f.kind in NAMED)) continue;
    const own = ownGround(f, session);
    let held = 0;
    let sx = 0;
    let sy = 0;
    for (const i of tiles) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (own(x, y)) {
        held++;
        sx += x + 0.5;
        sy += y + 0.5;
      }
    }
    if (held * 10 < n * 6) continue;
    const better = !best || held > best.held || (held === best.held && (PRIORITY[f.kind as keyof typeof PRIORITY] < PRIORITY[best.f.kind as keyof typeof PRIORITY] || (f.kind === best.f.kind && f.id < best.f.id)));
    if (better) best = { f, held, cx: sx / held / W, cy: sy / held / H };
  }
  if (!best) return placeWords(W, H, m);
  const kind = best.f.kind as keyof typeof NAMED;
  if (kind === "start") return "by the start";
  const several = features.filter((f) => f.kind === kind).length > 1;
  const where = several ? compass(best.cx, best.cy) || "middle" : "";
  return `at the ${where ? `${where} ` : ""}${NAMED[kind]}`;
}
