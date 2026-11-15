// The Lake (Lower's Brush choice): a drag draws an outline freehand, as Select's Freehand does, and the core's `lake`
// operation digs a basin inside it: a shelving bed, its rim made whole a level over the lake's Level and one notch at it
// (core/doc/lake.ts). A drag that closes the outline and goes on out of it puts the notch where it left. While it is
// dragged the tiles it would change show on the land, with the lake's level beside the pointer, or the core's one-line
// reason; the release digs the lake that was shown, one step in History. The row says whether water already there fills
// it. Esc lets the drag go.

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { PointerTool, TileHit } from "../../render3d";
import { LAKE_MAX_POINTS } from "../../core/doc/lakeLimits";
import type { Ed } from "../ed";
import { BAD, LOWERS } from "../tools";

/** An outline closes once the pointer comes back this near where it started (tiles), after this many points. */
const CLOSE = 2;
const CLOSE_AFTER = 8;

export interface LakeSlice {
  /** Lower is in hand with its Brush on Lake: a drag draws a lake's outline. */
  lakeOn: boolean;
  /** The outline drawn last touches water, which fills the lake. */
  lakeFed: boolean;
}

/** The drag's points as the core's outline and spill: a drag that came back near its start and went on out of the
 *  outline it closed spills where it ended; otherwise the whole drag is the outline. At most `LAKE_MAX_POINTS`. */
export function lakeGesture(points: readonly [number, number][]): { outline: [number, number][]; spill: [number, number] | null } {
  const thin = (p: [number, number][]) => (p.length <= LAKE_MAX_POINTS ? p : Array.from({ length: LAKE_MAX_POINTS }, (_, k) => p[Math.floor((k * p.length) / LAKE_MAX_POINTS)]));
  const [x0, y0] = points[0] ?? [0, 0];
  let closed = -1;
  for (let k = CLOSE_AFTER; k < points.length; k++) if (Math.max(Math.abs(points[k][0] - x0), Math.abs(points[k][1] - y0)) <= CLOSE) closed = k;
  const end = points[points.length - 1];
  if (closed > 0 && closed < points.length - 1) {
    const outline = points.slice(0, closed + 1) as [number, number][];
    if (!within(outline, end[0], end[1])) return { outline: thin(outline), spill: [end[0], end[1]] };
  }
  return { outline: thin(points.slice() as [number, number][]), spill: null };
}

/** Whether (x, y) lies inside the outline (even-odd) or on one of its points. */
function within(outline: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i];
    const [xj, yj] = outline[j];
    if (xi === x && yi === y) return true;
    if (yi > y !== yj > y && x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

export function useLake(ed: Ed): LakeSlice {
  const { api, renderer, painter, ready, brushTool, brush, brushRef, run, feel, setSelectPreview, setShapeNote, notePointer, pointerAt, flashNote } = ed;
  const on = brushTool === "lower" && brush.lake && !brush.canal;
  const [fed, setFed] = useState(false);
  const job = useRef(0);
  const shown = useRef<{ key: string; problem: string | null } | null>(null);
  const tool = useRef<PointerTool | null>(null);
  if (!tool.current) {
    let points: [number, number][] | null = null;
    const settings = () => ({ level: brushRef.current.lakeLevel, depth: brushRef.current.lakeDepth });
    const gesture = () => lakeGesture(points ?? []);
    const clear = () => {
      job.current++;
      shown.current = null;
      points = null;
      setSelectPreview(null);
      setShapeNote(null);
    };
    const show = (ev: PointerEvent) => {
      notePointer(ev);
      if (!points || points.length < 3) {
        setSelectPreview(null);
        return setShapeNote(null);
      }
      const { outline, spill } = gesture();
      const { level, depth } = settings();
      const key = JSON.stringify([outline, spill, level, depth]);
      if (shown.current?.key === key) return;
      const mine = ++job.current;
      void api
        .lakePlanAt(outline, level, depth, spill)
        .then((p) => {
          if (mine !== job.current) return;
          shown.current = { key, problem: p.reason };
          const W = ed.infoRef.current.W;
          // (refused: the outline as drawn, in the colour of a thing that can't be done; else the tiles it would change)
          setSelectPreview(p.reason ? { tiles: outline.map(([x, y]) => y * W + x), color: BAD } : { tiles: p.tiles, color: LOWERS });
          if (!p.reason) setFed(p.fed);
          setShapeNote({ text: p.reason ?? `a lake at level ${level}, ${p.basin.length} tiles`, ok: true, warn: !!p.reason, ...pointerAt.current });
        })
        .catch(() => undefined);
    };
    tool.current = {
      // (a finger draws the outline a little above itself, where it is seen; render3d/touch.ts)
      finger: "draw",
      down(hit: TileHit | null, ev: PointerEvent) {
        if (ev.button !== 0 || !hit) return false;
        points = [[hit.x, hit.y]];
        return true;
      },
      move(hit, ev) {
        if (!points || !hit) return;
        const last = points[points.length - 1];
        if (last[0] !== hit.x || last[1] !== hit.y) points.push([hit.x, hit.y]);
        show(ev);
      },
      up(hit) {
        if (!points) return;
        if (hit) {
          const last = points[points.length - 1];
          if (last[0] !== hit.x || last[1] !== hit.y) points.push([hit.x, hit.y]);
        }
        const enough = points.length >= 3;
        const { outline, spill } = gesture();
        const was = shown.current;
        const { level, depth } = settings();
        clear();
        // (a click draws nothing; an outline its preview refused says why again, beside the pointer)
        if (!enough) return;
        if (was?.key === JSON.stringify([outline, spill, level, depth]) && was.problem) return flashNote(was.problem);
        const [x, y] = outline[0];
        void run(
          () => api.lakeAt(outline, level, depth, spill),
          (u) => u.ok && feel("lower", x, y, 3),
        );
      },
      cancel() {
        clear();
      },
    };
  }
  // the lake takes the map's left button while it is chosen (as the Canal does: the brush's cursor is put away)
  useLayoutEffect(() => {
    const r = renderer.current;
    const p = painter.current;
    const t = tool.current!;
    if (!r) return;
    if (on) {
      r.tool = t;
      p?.hideCursor();
    } else if (r.tool === t) {
      t.cancel?.();
      r.tool = brushTool && p ? p.tool : null;
      if (brushTool) p?.showCursor();
    }
  }, [on, brushTool, brush, ready]);
  return { lakeOn: on, lakeFed: fed };
}
