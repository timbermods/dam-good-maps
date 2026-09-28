// Waypoints for an aimed force (PLAN §20 D312): the player's own gesture, drawn as they make it (D258
// allows it: small markers joined by a thin line, never a predicted route). Carve uses it; Glaciate
// takes the same piece on its branch.
//
// - Shift+click drops a waypoint (the first is where the force starts);
// - a click without Shift launches, the clicked tile its end; Enter launches, the last waypoint its end;
// - Backspace removes the last waypoint; Esc drops them all.
//
// The force then runs along a smooth curve through them (core/forces/carve/course.ts
// `waypointCurve`), finding its own way near the line. Pure: the page owns the pointer and the keys and
// calls in; the host draws and launches.

/** A tile, [x, y]. */
export type Waypoint = [number, number];

export interface WaypointHost {
  /** The waypoints changed: draw them (markers joined by a thin line), or nothing when empty. */
  changed(points: readonly Waypoint[]): void;
  /** Launch from `points[0]` through the ones between to the last (at least two points). */
  launch(points: readonly Waypoint[]): void;
}

export class Waypoints {
  private list: Waypoint[] = [];

  constructor(
    private readonly host: WaypointHost,
    /** The most waypoints (the force's own limit). */
    readonly max = 32,
  ) {}

  /** The waypoints so far. */
  get points(): readonly Waypoint[] {
    return this.list;
  }

  /** Waypoints are being dropped: a plain click launches instead of doing the tool's own. */
  get active(): boolean {
    return this.list.length > 0;
  }

  /** Shift+click: a waypoint at this tile (one on the same tile as the last is ignored). */
  add(p: Waypoint): void {
    const last = this.list[this.list.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) return;
    if (this.list.length >= this.max) return;
    this.list = [...this.list, [p[0], p[1]]];
    this.host.changed(this.list);
  }

  /** A click without Shift while waypoints are down: launch with it as the end. True when it did
   *  (false: no waypoints, the tool's own click). */
  click(p: Waypoint): boolean {
    if (!this.active) return false;
    const last = this.list[this.list.length - 1];
    const points = last[0] === p[0] && last[1] === p[1] ? this.list : [...this.list, [p[0], p[1]] as Waypoint];
    this.launchWith(points);
    return true;
  }

  /** Enter launches (the last waypoint the end), Backspace removes the last one, Esc drops them all.
   *  True when the key was the gesture's. */
  key(key: string): boolean {
    if (!this.active) return false;
    if (key === "Enter") {
      if (this.list.length >= 2) this.launchWith(this.list);
      return true;
    }
    if (key === "Backspace") {
      this.list = this.list.slice(0, -1);
      this.host.changed(this.list);
      return true;
    }
    if (key === "Escape") {
      this.clear();
      return true;
    }
    return false;
  }

  /** Drop them all (the tool put away, a new gesture). */
  clear(): void {
    if (!this.list.length) return;
    this.list = [];
    this.host.changed(this.list);
  }

  private launchWith(points: readonly Waypoint[]): void {
    this.list = [];
    this.host.changed(this.list);
    if (points.length >= 2) this.host.launch(points);
  }
}

/** The tiles to draw for the waypoints (the overlay): a small marker at each (the tile and its four
 *  neighbours) and a thin line joining them in order. */
export function waypointTiles(points: readonly Waypoint[], W: number, H: number): { markers: number[]; line: number[] } {
  const markers = new Set<number>();
  const line = new Set<number>();
  const put = (set: Set<number>, x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) set.add(y * W + x);
  };
  for (const [x, y] of points) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(markers, x + dx, y + dy);
  for (let k = 1; k < points.length; k++) {
    const [ax, ay] = points[k - 1];
    const [bx, by] = points[k];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let t = 0; t <= n; t++) put(line, Math.round(ax + ((bx - ax) * t) / n), Math.round(ay + ((by - ay) * t) / n));
  }
  for (const i of markers) line.delete(i);
  return { markers: [...markers], line: [...line] };
}
