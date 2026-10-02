// Sources a force places at the map's edge (PLAN §20 D321, item 27): a river that starts at the edge
// must flow into the map, never straight off it. The check here finds a placed source whose water has
// a way off the map beside or behind it (an edge tile within reach no higher than the ground it stands
// on); the fix is M9b's edge lip (`src/core/water/edgeLip.ts` on `feature/m9b`: the land beside and
// behind the sources at the boundary raised a level above the water, a natural lip, never a wall
// along the edge), which the forces call through `EDGE_LIP` once it reaches `dev` (batch 5, D325).
// Until then the hook is empty: the check runs and its result is kept with the force's run (its
// `edgeLeaks`), and nothing on the land changes. Pending: plug the lip in, in one place, here.

/** A source placed on the map: its tile. */
export interface PlacedSource {
  x: number;
  y: number;
}

/** The ground the check reads. */
export interface EdgeGround {
  W: number;
  H: number;
  heights: ArrayLike<number>;
}

/** How near the edge a source's water can run straight off it (tiles). */
export const EDGE_REACH = 2;

/** The sources whose water can leave the map at the edge beside or behind them, with the edge tiles it
 *  would leave by: within EDGE_REACH of the boundary, an edge tile in that reach no higher than the
 *  source's own ground (so the water spills off there before it runs into the map). */
export function edgeLeaks(g: EdgeGround, sources: readonly PlacedSource[]): { source: PlacedSource; edge: number[] }[] {
  const { W, H, heights } = g;
  const out: { source: PlacedSource; edge: number[] }[] = [];
  for (const s of sources) {
    if (Math.min(s.x, s.y, W - 1 - s.x, H - 1 - s.y) > EDGE_REACH) continue;
    const level = heights[s.y * W + s.x];
    const edge: number[] = [];
    for (let y = Math.max(0, s.y - EDGE_REACH); y <= Math.min(H - 1, s.y + EDGE_REACH); y++)
      for (let x = Math.max(0, s.x - EDGE_REACH); x <= Math.min(W - 1, s.x + EDGE_REACH); x++) {
        if (x !== 0 && y !== 0 && x !== W - 1 && y !== H - 1) continue;
        if (heights[y * W + x] <= level) edge.push(y * W + x);
      }
    if (edge.length) out.push({ source: s, edge });
  }
  return out;
}

/** M9b's edge lip, once callable (batch 5): raise the land round `sources` at the boundary so their water
 *  runs into the map; the tiles it changed. Null until it reaches `dev`. */
export type EdgeLip = (g: EdgeGround & { heights: Uint8Array }, sources: readonly PlacedSource[]) => number[];
export const EDGE_LIP: EdgeLip | null = null;

/** Keep a force's placed sources flowing into the map (item 27): the lip where it is callable, and in
 *  any case the sources still leaking afterwards (empty when every one flows inward). */
export function keepSourcesOnMap(g: EdgeGround & { heights: Uint8Array }, sources: readonly PlacedSource[]): { changed: number[]; leaks: { source: PlacedSource; edge: number[] }[] } {
  const leaks = edgeLeaks(g, sources);
  if (!leaks.length || !EDGE_LIP) return { changed: [], leaks };
  const changed = EDGE_LIP(g, leaks.map((l) => l.source));
  return { changed, leaks: edgeLeaks(g, sources) };
}
