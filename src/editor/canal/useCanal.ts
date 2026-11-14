// The Canal (Lower's Brush choice): a drag draws a line and the core's `canal` operation cuts a bed along it that falls
// steadily and raises its banks where the land beside it is lower than its water would stand (core/doc/canal.ts).
// While it is dragged the tiles it would change show on the land, with the bed's fall beside the pointer, or the core's
// one-line reason; the release makes the canal that was shown, one step in History. Esc lets the drag go.

import { useLayoutEffect, useRef } from "preact/hooks";
import type { PointerTool, TileHit } from "../../render3d";
import type { Ed } from "../ed";
import { BAD, LOWERS } from "../tools";

/** A point of the line is kept once the pointer is this many tiles from the last one kept (the core walks the tiles
 *  between them, so a shaky hand draws a clean line). */
const STEP = 3;
/** The most points a drag keeps (the operation's limit). */
const MAX_POINTS = 512;

export interface CanalSlice {
  /** Lower is in hand with its Brush on Canal: a drag draws a canal's line. */
  canalOn: boolean;
}

export function useCanal(ed: Ed): CanalSlice {
  const { api, renderer, painter, ready, brushTool, brush, brushRef, run, feel, setSelectPreview, setShapeNote, notePointer, pointerAt, flashNote } = ed;
  const on = brushTool === "lower" && brush.canal;
  const job = useRef(0);
  const shown = useRef<{ key: string; problem: string | null } | null>(null);
  const tool = useRef<PointerTool | null>(null);
  if (!tool.current) {
    let points: [number, number][] | null = null;
    let tip: [number, number] | null = null;
    const settings = () => ({ width: brushRef.current.canalWidth, depth: brushRef.current.canalDepth, open: brushRef.current.canalOpen });
    const path = (): [number, number][] => {
      const p = points ?? [];
      const last = p[p.length - 1];
      return tip && last && (tip[0] !== last[0] || tip[1] !== last[1]) ? [...p, tip] : p.slice();
    };
    const clear = () => {
      job.current++;
      shown.current = null;
      points = null;
      tip = null;
      setSelectPreview(null);
      setShapeNote(null);
    };
    const show = (ev: PointerEvent) => {
      notePointer(ev);
      const line = path();
      if (line.length < 2) {
        setSelectPreview(null);
        return setShapeNote(null);
      }
      const { width, depth, open } = settings();
      const key = JSON.stringify([line, width, depth, open]);
      if (shown.current?.key === key) return;
      const mine = ++job.current;
      void api
        .canalPlanAt(line, width, depth, open)
        .then((p) => {
          if (mine !== job.current) return;
          shown.current = { key, problem: p.reason };
          // (refused: the line as drawn, in the colour of a thing that can't be done; else the bed and banks it would make)
          setSelectPreview(p.reason ? { tiles: line.map(([x, y]) => y * ed.infoRef.current.W + x), color: BAD } : { tiles: p.tiles, color: LOWERS });
          const banks = p.banks.length ? `, ${p.banks.length} bank ${p.banks.length === 1 ? "tile" : "tiles"}` : "";
          setShapeNote({ text: p.reason ?? `bed from level ${p.from} to ${p.to}${banks}`, ok: true, warn: !!p.reason, ...pointerAt.current });
        })
        .catch(() => undefined);
    };
    tool.current = {
      // (a finger draws the line a little above itself, where it is seen; render3d/touch.ts)
      finger: "draw",
      down(hit: TileHit | null, ev: PointerEvent) {
        if (ev.button !== 0 || !hit) return false;
        points = [[hit.x, hit.y]];
        tip = null;
        return true;
      },
      move(hit, ev) {
        if (!points || !hit) return;
        const last = points[points.length - 1];
        tip = [hit.x, hit.y];
        if (Math.max(Math.abs(hit.x - last[0]), Math.abs(hit.y - last[1])) >= STEP && points.length < MAX_POINTS - 1) points.push([hit.x, hit.y]);
        show(ev);
      },
      up(hit) {
        if (!points) return;
        if (hit) tip = [hit.x, hit.y];
        const line = path();
        const was = shown.current;
        const { width, depth, open } = settings();
        clear();
        // (a click draws nothing; a line its preview refused says why again, beside the pointer)
        if (line.length < 2) return;
        if (was?.key === JSON.stringify([line, width, depth, open]) && was.problem) return flashNote(was.problem);
        const end = line[line.length - 1];
        void run(
          () => api.canalAt(line, width, depth, open),
          (u) => u.ok && feel("lower", end[0], end[1], Math.max(1, width)),
        );
      },
      cancel() {
        clear();
      },
    };
  }
  // the canal takes the map's left button while it is chosen (after the brush's own effect, which this replaces; the
  // brush's cursor is put away: a line is drawn, not a dab)
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
  return { canalOn: on };
}
