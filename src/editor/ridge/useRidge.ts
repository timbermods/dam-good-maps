// The Ridge (Raise's Brush choice): a drag draws a line and the core's `ridge` operation raises high ground along it,
// steep on one side and benched on the other (core/doc/ridge.ts). While it is dragged the tiles it would raise show on
// the land, with its top level and steep side beside the pointer, or the core's one-line reason; the release raises the
// ridge that was shown, one step in History. Each drag has its own seed, so the next ridge wanders its own way. Esc
// lets the drag go.

import { useLayoutEffect, useRef } from "preact/hooks";
import type { PointerTool, TileHit } from "../../render3d";
import type { Ed } from "../ed";
import { BAD, RAISES } from "../tools";

/** A point of the line is kept once the pointer is this many tiles from the last one kept. */
const STEP = 3;
/** The most points a drag keeps (the operation's limit). */
const MAX_POINTS = 512;

export interface RidgeSlice {
  /** Raise is in hand with its Brush on Ridge: a drag draws a ridge's line. */
  ridgeOn: boolean;
}

export function useRidge(ed: Ed): RidgeSlice {
  const { api, renderer, painter, ready, brushTool, brush, brushRef, run, feel, setSelectPreview, setShapeNote, notePointer, pointerAt, flashNote } = ed;
  const on = brushTool === "raise" && brush.ridge;
  const job = useRef(0);
  const shown = useRef<{ key: string; problem: string | null } | null>(null);
  const tool = useRef<PointerTool | null>(null);
  if (!tool.current) {
    let points: [number, number][] | null = null;
    let tip: [number, number] | null = null;
    let seed = 0;
    const settings = () => ({ height: brushRef.current.ridgeHeight, width: brushRef.current.ridgeWidth, steep: brushRef.current.ridgeSteep });
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
      const { height, width, steep } = settings();
      const key = JSON.stringify([line, height, width, steep, seed]);
      if (shown.current?.key === key) return;
      const mine = ++job.current;
      void api
        .ridgePlanAt(line, height, width, steep, seed)
        .then((p) => {
          if (mine !== job.current) return;
          shown.current = { key, problem: p.reason };
          // (refused: the line as drawn, in the colour of a thing that can't be done; else the tiles it would raise)
          setSelectPreview(p.reason ? { tiles: line.map(([x, y]) => y * ed.infoRef.current.W + x), color: BAD } : { tiles: p.tiles, color: RAISES });
          setShapeNote({ text: p.reason ?? `top at level ${p.top}, steep on the ${p.steep}`, ok: true, warn: !!p.reason, ...pointerAt.current });
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
        seed = (Math.random() * 0x7fffffff) | 0;
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
        const { height, width, steep } = settings();
        const key = JSON.stringify([line, height, width, steep, seed]);
        clear();
        // (a click draws nothing; a line its preview refused says why again, beside the pointer)
        if (line.length < 2) return;
        if (was?.key === key && was.problem) return flashNote(was.problem);
        const mid = line[line.length >> 1];
        void run(
          () => api.ridgeAt(line, height, width, steep, seed),
          (u) => u.ok && feel("raise", mid[0], mid[1], Math.max(1, width / 2)),
        );
      },
      cancel() {
        clear();
      },
    };
  }
  // the ridge takes the map's left button while it is chosen (after the brush's own effect, which this replaces; the
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
  return { ridgeOn: on };
}
