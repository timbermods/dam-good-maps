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

/** A drawn gesture as it shows on the land (D344, A3): a band `radius` tiles either side of the line
 *  (the force's own width: Carve's and Glaciate's, Quake's reach from its fault, a fissure's breadth),
 *  never a circle; the tiles whose middle is within `radius` of it (at least the line's own). */
export function bandTiles(points: readonly PathPoint[], radius: number, W: number, H: number): number[] {
  if (!points.length) return [];
  const r = Math.max(0.5, radius);
  // (a point every quarter of the radius is close enough: fewer, larger boxes)
  const gap = Math.max(1, r / 4);
  const pts: PathPoint[] = [points[0]];
  for (const p of points) if (Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) >= gap) pts.push(p);
  const last = points[points.length - 1];
  if (pts[pts.length - 1] !== last) pts.push(last);
  const mask = new Uint8Array(W * H);
  const out: number[] = [];
  const r2 = r * r;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[k];
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r - 1));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + r + 1));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r - 1));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + r + 1));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (mask[i]) continue;
        // (the path's points are tile coordinates: a tile's middle is where it is)
        const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
        const ex = x - (a.x + dx * t);
        const ey = y - (a.y + dy * t);
        if (ex * ex + ey * ey <= r2) {
          mask[i] = 1;
          out.push(i);
        }
      }
  }
  return out;
}
