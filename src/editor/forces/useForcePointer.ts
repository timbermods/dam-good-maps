// The forces' gestures: Carve, Craterize, Erupt, Quake and Glaciate take the map's clicks and drags
// while picked.

import { useEffect, useRef } from "preact/hooks";
import type { PointerTool, TileHit } from "../../render3d";
import { craterSettingsOf, eruptSettingsOf, quakeSettingsOf } from "../ForceRows";
import { eruptAnatomy } from "../../core/forces/erupt";
import { eruptNature } from "../../core/forces/nature";
import { glaciateSettingsOf } from "../ForceRows";
import { sizeOf as glacierSize } from "../../core/forces/glaciate/model";
import { FreehandPath } from "../freehand";
import { forceCeiling } from "../../core/forces/force";
import { FaultBrush, type Point as QuakePoint } from "../../core/forces/quake";
import { BRUSH_MAX_LEVEL } from "../../core/features/raster/brush";
import type { Ed } from "../ed";

export interface ForcePointerSlice {
  strokeTiles: (points: readonly { x: number; y: number }[]) => number[];
}

export function useForcePointer(ed: Ed): ForcePointerSlice {
  const {
    mirror, renderer, ready, tool, anchorRef, flipRef, repaintRef, forceEscRef, setForceStroke, setForceCursor,
    setForceRing, setShapeNote, infoRef, pointerAt, notePointer, craterUiRef, eruptUiRef, quakeUiRef, setQuakeUi,
    glaciateUiRef, forceCalls, forcer, startForce, steerTiles, pathFrame, showPath, gestureTiles, bandRadius,
    cursorFrame, showForceCursor, forceSizing, endForceSize
  } = ed;

  // (another tool picked: F's sizing ends, kept)
  useEffect(() => {
    if (forceSizing.current && forceSizing.current.verb !== tool) endForceSize(true);
  }, [tool]);

  // Carve takes the map's clicks and drags while it is picked (D258, D289; D321 item 41): a click
  // unleashes it where the cursor is; a drag draws its path freehand, the line showing as it is drawn,
  // and on release the river carves along it, from the path's higher end to its lower (whichever way
  // it was drawn), cutting through rises to keep flowing; its Wander meanders it round the line
  useEffect(() => {
    const r = renderer.current;
    if (!r || tool !== "carve") return;
    const g = new FreehandPath(infoRef.current.W, infoRef.current.H);
    const t: PointerTool = {
      surface: true,
      down: (hit, ev) => {
        if (ev.button !== 0 || !hit || forcer.current?.running) return false;
        g.down({ x: hit.x, y: hit.y }, ev.clientX, ev.clientY);
        showForceCursor(null);
        return true;
      },
      move: (hit, ev) => {
        notePointer(ev);
        const path = g.move(hit ? { x: hit.x, y: hit.y } : null, ev.clientX, ev.clientY);
        if (path) showPath(path, bandRadius());
      },
      up: (hit) => {
        const end = g.up(hit ? { x: hit.x, y: hit.y } : null);
        showPath(null);
        if (!end) return;
        if ("click" in end) return forceCalls.current!.carve([end.click.x, end.click.y]);
        // (drawn uphill, its water still runs downhill, but it is shown the way it was drawn: D344, A5)
        const tiles = steerTiles(end.path, true);
        if (tiles) forceCalls.current!.carve(tiles.origin, tiles.end, tiles.via, tiles.reversed);
      },
      hover: (hit, ev) => {
        notePointer(ev);
        if (forceSizing.current) return;
        showForceCursor(hit && !forcer.current?.running ? [hit.x, hit.y] : null);
      },
      cancel: () => {
        g.cancel();
        showPath(null);
      },
    };
    r.tool = t;
    forceEscRef.current = () => {
      if (!g.pressed) return false;
      g.cancel();
      showPath(null);
      return true;
    };
    return () => {
      if (r.tool === t) r.tool = null;
      forceEscRef.current = null;
      cancelAnimationFrame(cursorFrame.current);
      cancelAnimationFrame(pathFrame.current);
      setForceStroke(null);
      setForceCursor(null);
      setForceRing(null);
      setShapeNote(null);
    };
  }, [tool, ready]);

  /** The page's map's ceiling for the forces (the worker's rule), worked out once per map state. */
  const ceilingOf = useRef<{ heights: Uint8Array | null; top: number }>({ heights: null, top: BRUSH_MAX_LEVEL });

  /** Why a vent clicked at (x, y) would not erupt at all (D258: the one word Erupt shows: no room to
   *  rise, even on its flank), from the worker's own fit on the same ground; null when it will. */
  function eruptRefusal(x: number, y: number): string | null {
    const { W, H } = infoRef.current;
    const heights = mirror.current.heights;
    const c = ceilingOf.current;
    if (c.heights !== heights) {
      c.heights = heights;
      c.top = forceCeiling(heights);
    }
    try {
      eruptAnatomy({ W, H, heights, maxHeight: c.top }, eruptNature(eruptSettingsOf(eruptUiRef.current), { W, H, heights, at: y * W + x }), { origin: y * W + x });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** The tiles of a line through the points (the painted fault or fissure, drawn on the land). */
  function strokeTiles(points: readonly { x: number; y: number }[]): number[] {
    const { W, H } = infoRef.current;
    const out = new Set<number>();
    for (let k = 0; k < points.length; k++) {
      const a = points[Math.max(0, k - 1)];
      const b = points[k];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
      for (let t = 0; t <= n; t++) {
        const x = Math.round(a.x + ((b.x - a.x) * t) / n);
        const y = Math.round(a.y + ((b.y - a.y) * t) / n);
        if (x >= 0 && y >= 0 && x < W && y < H) out.add(y * W + x);
      }
    }
    return [...out];
  }

  // Craterize, Erupt and Quake take the map's clicks and drags while picked (D258: clean gestures):
  // a click strikes or erupts at once, where the cursor is; Craterize is click-only (D368 (7): a crater
  // is one impact), a press and drag striking once where the press began, no line drawn; a
  // fissure or a fault is drawn freehand with the same pen (D327), its line showing as it is drawn (the
  // gesture itself), and letting go starts it (a Lift shows its result as it is drawn, and is kept when
  // let go). Nothing predicts the result on the land; the only word is Erupt's when a vent can't rise
  // at all.
  useEffect(() => {
    const r = renderer.current;
    if (!r || !tool || tool === "carve" || tool === "glaciate") return;
    const verb = tool;
    let down: TileHit | null = null;
    let brush: FaultBrush | null = null;
    let lastMove = 0;
    let painting = false;
    let strokeFrame = 0;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const cut = () => renderer.current?.slice ?? null;
    const point = (hit: TileHit) => ({ x: Math.max(0, Math.min(W - 1, hit.x)), y: Math.max(0, Math.min(H - 1, hit.y)) });
    /** Quake is painted; Erupt's drag paints a fissure (a click vents, D289). */
    const painted = () => verb === "quake" || verb === "erupt";
    /** The drag has left the tile it began on (Craterize: it aims; Erupt: a fissure). */
    let dragged = false;
    const showStroke = (path: readonly QuakePoint[] | null) => {
      cancelAnimationFrame(strokeFrame);
      // (a fault's or a fissure's band)
      strokeFrame = requestAnimationFrame(() => setForceStroke(path ? gestureTiles(path, bandRadius()) : null));
    };
    /** Erupt's one word, once a frame at most (it reads the ground round the vent). */
    let wordFrame = 0;
    const eruptWord = (x: number, y: number) => {
      cancelAnimationFrame(wordFrame);
      wordFrame = requestAnimationFrame(() => {
        const why = eruptRefusal(x, y);
        setShapeNote(why ? { text: why, ok: false, warn: false, ...pointerAt.current } : null);
      });
    };
    const sendPaint = () => {
      if (!brush) return;
      const intent = brush.intent();
      showStroke(intent.path);
      if (!painting) {
        if (intent.path.length < 2 || Math.hypot(intent.path.at(-1)!.x - intent.path[0].x, intent.path.at(-1)!.y - intent.path[0].y) < 1) return;
        painting = true;
        startForce({ verb: "quake", settings: quakeSettingsOf(quakeUiRef.current), path: intent.path, side: intent.side, cut: cut(), painting: true }, true);
      } else forcer.current?.paint(intent.path, intent.side);
    };
    repaintRef.current = () => {
      if (brush && painting) sendPaint();
    };
    flipRef.current = () => {
      const side = quakeUiRef.current.side === 1 ? -1 : 1;
      setQuakeUi({ ...quakeUiRef.current, side });
      if (brush) {
        brush.side = side;
        if (quakeUiRef.current.mode === "lift") sendPaint();
      }
    };
    const t: PointerTool = {
      surface: true,
      down: (hit, ev) => {
        if (ev.button !== 0 || !hit || forcer.current?.running) return false;
        cancelAnimationFrame(wordFrame);
        down = hit;
        dragged = false;
        notePointer(ev);
        showForceCursor(null);
        setShapeNote(null);
        // (Craterize draws nothing: it strikes where the press began, D368 (7))
        if (painted()) {
          const p = point(hit);
          // Shift: a straight line on from where the last stroke ended
          const from = ev.shiftKey && anchorRef.current ? anchorRef.current : p;
          brush = new FaultBrush(from, W, H, quakeUiRef.current.side);
          brush.aim(p);
          if (ev.shiftKey && anchorRef.current) brush.advance(0, true);
          lastMove = performance.now();
          // (Erupt's stroke shows once the drag leaves its tile: until then it is a click, a vent)
          if (verb === "quake") showStroke(brush.intent().path);
        }
        return true;
      },
      move: (hit, ev) => {
        notePointer(ev);
        if (!hit || !down) return;
        const p = point(hit);
        if (!dragged && Math.hypot(p.x - down.x, p.y - down.y) >= 2) dragged = true;
        if (brush) {
          const now = performance.now();
          brush.aim(p);
          brush.advance((now - lastMove) / 1000);
          lastMove = now;
          if (verb === "quake" && quakeUiRef.current.mode === "lift") sendPaint();
          else if (verb === "quake" || dragged) showStroke(brush.intent().path);
        }
      },
      up: (hit) => {
        const d = down;
        down = null;
        if (!d) return;
        const p = hit ? point(hit) : null;
        if (brush) {
          const b = brush;
          brush = null;
          if (p) b.aim(p);
          b.advance(0, true);
          const intent = b.intent();
          anchorRef.current = intent.path.at(-1) ?? null;
          if (verb === "quake" && quakeUiRef.current.mode === "lift") {
            showStroke(null);
            if (painting) void forcer.current?.stop();
            // a click (nothing painted): a short natural fault there, as a Slide's click (D360 (1b))
            else startForce({ verb: "quake", settings: quakeSettingsOf(quakeUiRef.current), path: intent.path, side: intent.side, cut: cut() });
            painting = false;
            return;
          }
          let length = 0;
          for (let k = 1; k < intent.path.length; k++) length += Math.hypot(intent.path[k].x - intent.path[k - 1].x, intent.path[k].y - intent.path[k - 1].y);
          if (verb === "erupt") {
            showStroke(null);
            // a click (or a drag too short to be a fissure) vents where it began
            if (!dragged || length < 3) {
              anchorRef.current = null;
              return startForce({ verb: "erupt", settings: eruptSettingsOf(eruptUiRef.current), origin: [d.x, d.y], cut: cut() });
            }
            const o = intent.path[0];
            startForce({ verb: "erupt", settings: eruptSettingsOf(eruptUiRef.current, true), origin: [Math.round(o.x), Math.round(o.y)], path: intent.path, cut: cut() });
          } else startForce({ verb: "quake", settings: quakeSettingsOf(quakeUiRef.current), path: intent.path, side: intent.side, cut: cut() });
          return;
        }
        // Craterize: one impact where the press began, a click or a drag alike (D368 (7))
        startForce({ verb: "craterize", settings: craterSettingsOf(craterUiRef.current), origin: [d.x, d.y], cut: cut() });
      },
      hover: (hit, ev) => {
        notePointer(ev);
        if (forceSizing.current) return;
        if (!hit || forcer.current?.running || down) {
          if (!hit) showForceCursor(null);
          return;
        }
        // (Quake: only the small marker, never its reach, D368 (2))
        showForceCursor([hit.x, hit.y]);
        if (verb === "erupt") eruptWord(hit.x, hit.y);
      },
      cancel: () => {
        down = null;
        dragged = false;
        brush = null;
        if (painting) forcer.current?.cancel();
        painting = false;
        showStroke(null);
      },
    };
    r.tool = t;
    forceEscRef.current = () => {
      if (!down && !brush) return false;
      down = null;
      brush = null;
      painting = false;
      showStroke(null);
      setShapeNote(null);
      return true;
    };
    return () => {
      if (r.tool === t) r.tool = null;
      cancelAnimationFrame(strokeFrame);
      cancelAnimationFrame(wordFrame);
      cancelAnimationFrame(cursorFrame.current);
      flipRef.current = null;
      repaintRef.current = null;
      forceEscRef.current = null;
      if (painting) forcer.current?.cancel();
      setForceStroke(null);
      setForceCursor(null);
      setForceRing(null);
      setShapeNote(null);
    };
  }, [tool, ready]);

  // Glaciate takes the map's clicks and drags while picked (D258, D291; D321 item 41): the ice gathers
  // under the pointer the moment it is pressed; a click Flows (the glacier follows the valleys down from
  // there); a drag draws its path freehand, the line showing as it is drawn, and on release it grinds
  // along it, through the ridges. Nothing predicts its valley on the land; the camera never moves
  // (D265).
  useEffect(() => {
    const r = renderer.current;
    if (!r || tool !== "glaciate") return;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const g = new FreehandPath(W, H);
    const point = (hit: TileHit): [number, number] => [Math.max(0, Math.min(W - 1, hit.x)), Math.max(0, Math.min(H - 1, hit.y))];
    const gather = (at: [number, number] | null) => {
      if (!at) return renderer.current?.clearForce();
      const u = glaciateUiRef.current;
      const z = mirror.current.heights[at[1] * W + at[0]] ?? 0;
      renderer.current?.setForceMoment({ verb: "glaciate", phase: "gather", progress: 0, x: at[0], y: at[1], z, size: glacierSize(u), power: u.power, glaciate: { seconds: 0 } });
    };
    const t: PointerTool = {
      surface: true,
      down: (hit, ev) => {
        if (ev.button !== 0 || !hit || forcer.current?.running) return false;
        const at = point(hit);
        g.down({ x: at[0], y: at[1] }, ev.clientX, ev.clientY);
        notePointer(ev);
        showForceCursor(null);
        gather(at);
        return true;
      },
      move: (hit, ev) => {
        notePointer(ev);
        const was = g.drawing;
        const path = g.move(hit ? { x: point(hit)[0], y: point(hit)[1] } : null, ev.clientX, ev.clientY);
        if (path && !was) gather(null);
        if (path) showPath(path, bandRadius());
      },
      up: (hit) => {
        const end = g.up(hit ? { x: point(hit)[0], y: point(hit)[1] } : null);
        showPath(null);
        if (!end) return;
        if ("click" in end) return startForce({ verb: "glaciate", settings: glaciateSettingsOf(glaciateUiRef.current), origin: [end.click.x, end.click.y], cut: renderer.current?.slice ?? null });
        // (a path too short to steer by does nothing)
        const tiles = steerTiles(end.path, false);
        if (!tiles) return void gather(null);
        forceCalls.current!.glaciate(tiles.origin, tiles.end, tiles.via);
      },
      hover: (hit, ev) => {
        notePointer(ev);
        if (forceSizing.current) return;
        if (g.pressed) return;
        showForceCursor(hit && !forcer.current?.running ? [hit.x, hit.y] : null);
      },
      cancel: () => {
        if (g.pressed && !g.drawing && !forcer.current?.running) gather(null);
        g.cancel();
        showPath(null);
      },
    };
    r.tool = t;
    forceEscRef.current = () => {
      if (!g.pressed) return false;
      g.cancel();
      showPath(null);
      if (!forcer.current?.running) gather(null);
      return true;
    };
    return () => {
      if (r.tool === t) r.tool = null;
      forceEscRef.current = null;
      cancelAnimationFrame(cursorFrame.current);
      cancelAnimationFrame(pathFrame.current);
      if (g.pressed && !forcer.current?.running) renderer.current?.clearForce();
      setForceStroke(null);
      setForceCursor(null);
      setForceRing(null);
    };
  }, [tool, ready]);

  return { strokeTiles };
}
