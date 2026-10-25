// Where the district center may stand: the one fit rule (PLAN §20 D342; EDITOR_PLAN §4). Its 3×3 and the tile at
// its door must be on the map, clear of rivers and water and of every other object's whole footprint, the
// footprint and not only the tile an object is anchored on, which is what the checks read ("Start overlapping
// another object", "Start entrance blocked"). The core's `startProblem` (the shelf's move, the forces, the fixes)
// and the page's hover preview both call this, each handing it the objects' tiles from the map they hold, so
// the preview never says yes where the checks say no.

/** Objects a generated map's resources place and then make room for the start: the start takes their ground (D368 (10)). */
const MAKES_ROOM = /^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d)$/;

/** Whether an object of `template` is cleared from under the start rather than keeping it away: a generated plant or
 *  ruin column (`raw`: from an imported file, which keeps its own objects). The start itself never counts. */
export function makesRoomForStart(template: string, raw: boolean): boolean {
  return template === "StartingLocation" || (!raw && MAKES_ROOM.test(template));
}

/** What the rule reads of a map, tile by tile (index y·W + x). */
export interface StartFitGround {
  W: number;
  H: number;
  /** A river's channel is on the tile. */
  river(i: number): boolean;
  /** The water on the tile, blocks deep. */
  depth(i: number): number;
  /** Another object's footprint covers the tile (not the start's own, and not one that makes room for it). */
  taken(i: number): boolean;
}

/** Why the district center cannot stand with its middle at (x, y) and its door at `door`, or null when it can. Rivers,
 *  water, the map's edge and objects stop it; the ground never does (a bench or a cut footprint levels it, D328), unless
 *  `flat` asks for level ground (an imported map, which has no bench) or `extra` finds a reason of its own. */
export function startFitProblem(g: StartFitGround, x: number, y: number, door: readonly [number, number], opts: { flat?: (i: number) => boolean; extra?: (i: number) => string | null } = {}): string | null {
  const { W, H } = g;
  const tiles: [number, number][] = [[door[0], door[1]]];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([x + dx, y + dy]);
  for (const [tx, ty] of tiles) {
    if (tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2) return "too close to the map edge";
    const i = ty * W + tx;
    if (g.river(i)) return "in a river";
    if (g.depth(i) > 0.05) return "under water";
    if (opts.flat && !opts.flat(i)) return "not on level ground";
    if (g.taken(i)) return "on an object";
    const why = opts.extra?.(i);
    if (why) return why;
  }
  return null;
}
