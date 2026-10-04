// Edge walls (Kyler, 2026-09-25, D151: "no edge walls", extending D111's no built walls to the
// map's edges). A wall raised along a map edge to hold water is a stamped container: no official
// map has one. The check reads the terrain only: along each edge, the band of the two outermost tiles is
// compared with the land just inside it (the next three tiles). A tile of the edge is walled when
// its band stands at least `EDGE_RISE` levels above that land; an edge is walled when at least
// `EDGE_SHARE` of its tiles are. prototype/validate.py `edge_walls` is the same rule.
//
// The thresholds come from the data (docs/progress/start-edge-rules.md): on the 85 real places (a
// full-height wall one tile thick round each map) the most walled edge has 89–99% of its tiles
// walled; on the 19 official maps at most 38% (Canyon's rim), and on 180 generated maps at 128² at
// most 36%.

/** The outermost tiles of an edge that can form the wall: a wall one or two tiles thick. */
export const EDGE_BAND = 2;
/** The land just inside the band: its highest tile is what the band must stand above. */
export const EDGE_INSIDE = 3;
/** Levels the band must stand above that land for a tile of the edge to be walled. */
export const EDGE_RISE = 2;
/** The share of an edge's tiles that must be walled for the edge to be walled. */
export const EDGE_SHARE = 0.6;

export type EdgeName = "south" | "north" | "west" | "east";
/** Edges in report order: y = 0, y = H − 1, x = 0, x = W − 1. */
export const EDGE_NAMES: readonly EdgeName[] = ["south", "north", "west", "east"];

export interface EdgeWall {
  edge: EdgeName;
  /** The share of the edge's tiles that are walled. */
  share: number;
  /** The middle tile of the longest walled run along the edge, for `where`. */
  at: [number, number];
}

/** Whether the map is large enough for the rule: each side at least twice the band and the land
 *  inside it. */
export function edgeRuleApplies(W: number, H: number): boolean {
  const need = 2 * (EDGE_BAND + EDGE_INSIDE);
  return W >= need && H >= need;
}

/** The tile at position `p` along edge `e` (`EDGE_NAMES` order), `d` tiles in from it. */
export function edgeTile(e: number, W: number, H: number, p: number, d: number): [number, number] {
  return e === 0 ? [p, d] : e === 1 ? [p, H - 1 - d] : e === 2 ? [d, p] : [W - 1 - d, p];
}

/** At position `p` along edge `e`: the highest tile of its band (`EDGE_BAND`) and of the land just
 *  inside it (`EDGE_INSIDE`); the tile is walled when the band stands `EDGE_RISE`+ above that land. */
export function edgeRise(h: ArrayLike<number>, W: number, H: number, e: number, p: number): { band: number; inside: number } {
  let band = 0;
  for (let d = 0; d < EDGE_BAND; d++) {
    const [x, y] = edgeTile(e, W, H, p, d);
    if (h[y * W + x] > band) band = h[y * W + x];
  }
  let inside = 0;
  for (let d = EDGE_BAND; d < EDGE_BAND + EDGE_INSIDE; d++) {
    const [x, y] = edgeTile(e, W, H, p, d);
    if (h[y * W + x] > inside) inside = h[y * W + x];
  }
  return { band, inside };
}

/** The walled share of each edge, and where the longest walled run is, in `EDGE_NAMES` order. */
export function edgeWalls(h: ArrayLike<number>, W: number, H: number): EdgeWall[] {
  const out: EdgeWall[] = [];
  for (let e = 0; e < 4; e++) {
    const L = e < 2 ? W : H;
    let walled = 0;
    let run = 0;
    let best = 0;
    let bestEnd = -1;
    for (let p = 0; p < L; p++) {
      const { band, inside } = edgeRise(h, W, H, e, p);
      if (band - inside >= EDGE_RISE) {
        walled++;
        run++;
        if (run > best) {
          best = run;
          bestEnd = p;
        }
      } else run = 0;
    }
    const mid = bestEnd >= 0 ? bestEnd - (best >> 1) : L >> 1;
    out.push({ edge: EDGE_NAMES[e], share: walled / L, at: edgeTile(e, W, H, mid, 0) });
  }
  return out;
}
