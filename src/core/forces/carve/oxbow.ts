// A cut-off bend (D199, high Wander): a long bend on one side of its shortcut, with a narrow neck
// the river can cut through. Only one cutoff per carve. Sediment settles in both old mouths, two
// bars across the bend, so the crescent between them holds its water as an oxbow lake (D216).
// Found and cut in Rust (run.ts); its shape is read here (the map's names, gen/names.ts).

export interface Point {
  x: number;
  y: number;
}

/** A sediment bar across an old mouth: its middle, the river's heading there, its half-width and
 *  the level its top holds. */
export interface MouthBar extends Point {
  dx: number;
  dy: number;
  width: number;
  level: number;
}

/** The cut-off: the stations of the course it spans, the step it was found at, the floor its bars
 *  hold, its neck and the old bend's pool. */
export interface Oxbow {
  start: number;
  end: number;
  step: number;
  floor: number;
  neck: Point[];
  pool: Point[];
  bars: [MouthBar, MouthBar];
}
