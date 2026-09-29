// The freehand path (PLAN §20 D321, items 41 and 13; D327): the one way to steer a travelling force,
// lifted from Erode's sweep (investigation/erode, demo/app.ts). A press where the force begins; a drag
// of six pixels or more draws the path, the pen (core/forces/path.ts `PathBrush`) keeping a point each
// half tile the pointer passes; the line shows on the land as it is drawn (the player's own gesture,
// D258), and nothing predicts the result. Let go: a drag is the path, anything less a click, the
// force's own (Carve unleashes, Glaciate Flows, Craterize strikes). Carve and Glaciate steer along it,
// Craterize aims along it; Quake's fault and Erupt's fissure are drawn with the same pen. It replaces
// Aim's thin arrow and D312's Shift+click points. Pure: the page owns the pointer and calls in.

import { PathBrush, type PathPoint } from "../core/forces/path";

/** How far the pointer moves before a press becomes a drawn path (CSS pixels, as Erode's sweep). */
export const DRAW_PX = 6;

/** How a gesture ended: a click where it was pressed, or the path drawn from there. */
export type FreehandEnd = { click: PathPoint } | { path: PathPoint[] };

export class FreehandPath {
  private from: { at: PathPoint; x: number; y: number } | null = null;
  private pen: PathBrush | null = null;
  private last = 0;

  constructor(
    private readonly W: number,
    private readonly H: number,
  ) {}

  /** Pressed, and not yet let go. */
  get pressed(): boolean {
    return this.from !== null;
  }

  /** The press has become a drawn path. */
  get drawing(): boolean {
    return this.pen !== null;
  }

  /** Where it was pressed (a tile), or null. */
  get start(): PathPoint | null {
    return this.from ? { ...this.from.at } : null;
  }

  down(at: PathPoint, clientX: number, clientY: number): void {
    this.from = { at: { ...at }, x: clientX, y: clientY };
    this.pen = null;
  }

  /** The pointer moved (`at`: the tile under it, or null off the map): the line drawn so far once it
   *  is a drag, else null. */
  move(at: PathPoint | null, clientX: number, clientY: number, now = performance.now()): PathPoint[] | null {
    const f = this.from;
    if (!f) return null;
    if (!this.pen && Math.hypot(clientX - f.x, clientY - f.y) >= DRAW_PX) {
      this.pen = new PathBrush(f.at, this.W, this.H);
      this.last = now;
    }
    const pen = this.pen;
    if (!pen) return null;
    if (at) pen.aim(at);
    pen.advance((now - this.last) / 1000);
    this.last = now;
    return pen.path();
  }

  /** Let go (`at`: the tile under the pointer, or null off the map): how it ended, or null when it was
   *  never pressed. */
  up(at: PathPoint | null): FreehandEnd | null {
    const f = this.from;
    const pen = this.pen;
    this.from = null;
    this.pen = null;
    if (!f) return null;
    if (!pen) return { click: { ...f.at } };
    if (at) pen.aim(at);
    pen.advance(0, true);
    return { path: pen.path() };
  }

  /** Dropped (Esc, the tool put away, the pointer lost). */
  cancel(): void {
    this.from = null;
    this.pen = null;
  }
}
