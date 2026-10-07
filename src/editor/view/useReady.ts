// Sources: Clear's glow, and the renderer becoming ready (the painter and the pointer tools).

import { transfer } from "comlink";
import { useRef } from "preact/hooks";
import type { EditOp } from "../../core/doc/ops";
import type { Orientation } from "../../core/format/footprints";
import { groundUnderObjects } from "../../core/features/raster/objectGround";
import { FLIPPED, ORIENTATION_NAMES, surfaceWater } from "../../render3d/model";
import type { MapRenderer, ViewState } from "../../render3d";
import { Juice, type StrokeSound } from "../juice";
import { selectTool } from "../select";
import { BRUSH_NAMES, BrushPainter, hasTarget, sizeMax, targetWords } from "../brushes";
import { tilesToRuns } from "../../core/math/grid";
import { sourcesPressed } from "../sourceSpots";
import type { BrushParams } from "../../core/features/raster/brush";
import type { Ed } from "../ed";

export interface ReadySlice {
  glowCorners: { current: number[] };
  reglow: () => void;
  onReady: (r: MapRenderer) => void;
}

export function useReady(ed: Ed): ReadySlice {
  const {
    api, mirror, renderer, setReady, setMarkersOn, setSliceLevel, setSelecting, selection, sound, juice, feel,
    weatherRef, firstDoneRef, minimapRef, setViewTick, setPicked, setPickedObject, infoRef, run, brushRef,
    brushToolRef, setBrush, terrain, localUndo, localRedo, painter, sendTerrain, spots, targetAt, notePointer,
    grabSource, wheelSource, markerRef, setStartHint, hintRef, hintJob, lookForStartRef, pointerWords, flashNote,
    wheelHabit, pickTile
  } = ed;

  /** Sources: Clear (D249, D322): the sources under the ring glow red before the stroke reaches them,
   *  and those it has passed over stay red until it is let go. */
  const clearing = useRef<{ of: readonly number[]; dabs: number; taken: Set<number> } | null>(null);
  const glowing = useRef(false);
  const glowAt = useRef<[number, number] | null>(null);
  const glowCorners = useRef<number[]>([]);
  function clearGlow(at: [number, number] | null, stroke: { settings: Omit<BrushParams, "dabs">; dabs: readonly number[] } | null) {
    const r = renderer.current;
    if (!r) return;
    glowAt.current = stroke ? null : at;
    const b = brushRef.current;
    const bt = brushToolRef.current;
    if (!bt || b.sources[bt] !== "clear" || !at) {
      glowCorners.current = [];
      if (!stroke) clearing.current = null;
      if (glowing.current) r.highlightObjects(null);
      glowing.current = false;
      return;
    }
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const list = spots();
    const glow = new Set<number>();
    if (stroke) {
      let c = clearing.current;
      // (a straight line is painted again from its start each time)
      if (!c || c.of !== stroke.dabs || c.dabs > stroke.dabs.length) c = clearing.current = { of: stroke.dabs, dabs: 0, taken: new Set() };
      for (const sp of sourcesPressed(list, stroke.settings, stroke.dabs.slice(c.dabs), W)) if (ed.inArea(sp.tiles)) c.taken.add(sp.corner);
      c.dabs = stroke.dabs.length;
      for (const k of c.taken) glow.add(k);
    } else clearing.current = null;
    // (a target's brush presses with hard edges, D322)
    const shape = stroke ? stroke.settings : { size: b.size, ...(b.square ? { shape: "square" as const } : {}), ...(hasTarget(bt) && b.target !== "free" ? { target: 0 } : {}) };
    const q = (v: number, n: number) => Math.max(0, Math.min(4 * n - 1, Math.round(v * 4)));
    for (const sp of sourcesPressed(list, shape, [q(at[0], W), q(at[1], H)], W)) if (ed.inArea(sp.tiles)) glow.add(sp.corner);
    glowCorners.current = [...glow];
    if (!glow.size && !glowing.current) return;
    r.highlightObjects(glow.size ? [...glow] : null);
    glowing.current = glow.size > 0;
  }
  /** The brush out clears the sources it passes over (Sources: Clear, D322). */
  const clears = () => !!brushToolRef.current && brushRef.current.sources[brushToolRef.current] === "clear";
  function endClearGlow() {
    clearing.current = null;
    glowCorners.current = [];
    if (glowing.current) renderer.current?.highlightObjects(null);
    glowing.current = false;
  }
  /** The objects were drawn again (their highlight went with them): the ring's glow again. */
  function reglow() {
    if (glowAt.current && !painter.current?.painting) clearGlow(glowAt.current, null);
  }

  function onReady(r: MapRenderer) {
    renderer.current = r;
    setReady(r);
    juice.current ??= new Juice(() => renderer.current, sound);
    painter.current = new BrushPainter({
      renderer: r,
      W: infoRef.current.W,
      H: infoRef.current.H,
      heights: () => mirror.current.heights,
      terrain: () => terrain.current,
      settings: () => ({ ...brushRef.current, tool: brushToolRef.current ?? "raise" }),
      commit: (stroke, pre, protect) => {
        terrain.current = { ...terrain.current, pre, protect };
        localUndo.current.push(stroke);
        localRedo.current = [];
        firstDoneRef.current("paint");
        hintJob.current++;
        setStartHint(null);
        // Sources: Clear (D249, D322): the sources the brush pressed on go with the stroke, one step
        const clear = clears() ? sourcesPressed(spots(), stroke.params, stroke.params.dabs, infoRef.current.W).filter((c) => ed.inArea(c.tiles)) : [];
        endClearGlow();
        const op: EditOp = { op: "brush", params: stroke.params };
        const done = sendTerrain(() => (clear.length ? api.strokeClearing(op, stroke.label, clear.flatMap((c) => c.tiles)) : api.apply(op, "user", stroke.label)));
        if (clear.length) void done.then(() => feel("remove", clear[0].x, clear[0].y));
        // a Flatten stroke: where its level ground could take the start, once it is on the map
        if (stroke.params.tool === "flatten") void done.then(() => lookForStartRef.current(stroke.params));
      },
      // a stroke that changed no ground still takes the sources it pressed with Clear sources on
      // (item 15: a Flatten at the ground's own level or a Smooth over flat land left them), one step
      unchanged: (params) => {
        const clear = clears() ? sourcesPressed(spots(), params, params.dabs, infoRef.current.W).filter((c) => ed.inArea(c.tiles)) : [];
        endClearGlow();
        if (!clear.length) return;
        firstDoneRef.current("paint");
        void run(
          () => api.strokeClearing({ op: "brush", params }, BRUSH_NAMES[params.tool], clear.flatMap((c) => c.tiles)),
          (u) => u.ok && feel("remove", clear[0].x, clear[0].y),
        );
      },
      // Ctrl+click: the land's level is the target (D322), until the tool changes or Esc
      picked: (level) => {
        setBrush({ ...brushRef.current, target: level }, false);
        const t = brushToolRef.current;
        if (t && hasTarget(t)) flashNote(targetWords(t, level));
      },
      footprints: () => ed.objectFootprints(),
      // sources ride a stroke's ground (D249): a 3 × 3 one whole and level (with Keep they stay, with
      // Clear they go, D322)
      rides: () => (brushToolRef.current && brushRef.current.sources[brushToolRef.current] === "ride" ? spots().filter((c) => c.tiles.length > 1 && ed.inArea(c.tiles)).map((c) => c.rect) : []),
      // Keep (D322): every source's own tiles
      sourceGround: () => tilesToRuns([...new Set(spots().flatMap((c) => c.tiles))].sort((a, b) => a - b), infoRef.current.W),
      // Naturalize leaves the ground under every source and object as it is (D368 (8))
      objectGround: () => {
        const e = mirror.current.entities;
        const list = [];
        for (let k = 0; k < e.count; k++) list.push({ template: e.templates[e.template[k]], x: e.x[k], y: e.y[k], orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 });
        return groundUnderObjects(list);
      },
      maxSize: () => sizeMax(infoRef.current.W, infoRef.current.H),
      // a mode's water (D322): the map's own, never a drought's or a badtide's shown now
      water: () => (weatherRef.current ? surfaceWater(infoRef.current.W, infoRef.current.H, mirror.current.mapWater).surface : (mirror.current.water?.surface ?? null)),
      // the working area (D254, D259): the open selection
      area: () => ed.workingArea(),
      ring: (at, stroke) => clearGlow(at, stroke),
      select: (hit, ev) => {
        // Ctrl+drag: a rectangle (the Select tool opens with it)
        setSelecting((m) => m ?? "rect");
        void ev;
        void hit;
        return selectTool(selection.current, ed.selectHost(), "rect");
      },
      strength: (value, ev) => {
        setBrush({ ...brushRef.current, strength: value });
        if (ev) flashNote(`strength ${value}`, ev);
      },
      // Shift+scroll: the target (D322), shown beside the pointer as it always is
      target: (value) => setBrush({ ...brushRef.current, target: value }, false),
      feel: (kind, x, y, size, soft) => {
        feel(kind, x, y, size, soft);
        // the stroke's own texture while it paints (Flatten, Smooth and Naturalize each have theirs)
        const b = brushToolRef.current;
        const sound: StrokeSound = kind === "raise" || kind === "lower" ? kind : b === "smooth" ? "smooth" : b === "naturalize" ? "naturalize" : "flatten";
        juice.current?.strokeSound(sound, x, y, size, Math.min(1, brushRef.current.strength / 10));
      },
      // F held: the size follows the pointer, beside it while F is held, saved once it is set (D205,
      // D322)
      resize: (size, ev, done) => {
        setBrush({ ...brushRef.current, size }, done);
        if (ev) notePointer(ev);
        pointerWords.current!.sizing(done ? null : `size ${size}`);
      },
      // a new stroke puts away the last one's start hint (its water flows while it is painted, D197)
      painting: (on) => {
        if (!on) {
          juice.current?.strokeEnd();
          return;
        }
        hintJob.current++;
        setStartHint(null);
      },
      note: (text, ev) => {
        if (ev) notePointer(ev);
        pointerWords.current!.brush(text);
      },
      wet: (x, y) => (mirror.current.water?.depth[y * infoRef.current.W + x] ?? 0) > 0.05,
      depth: (x, y) => mirror.current.water?.depth[y * infoRef.current.W + x] ?? 0,
      // the water flows on the stroke while it is painted (D197)
      draft: (rect, heights) => void api.draftStroke(rect, transfer(heights, [heights.buffer as ArrayBuffer])),
      cancelDraft: () => void api.cancelDraft(),
      // a Naturalize stroke's land, worked out in the worker (D422)
      weather: {
        begin: (settings, ground) => api.weatherBegin(settings, ground.map((r) => [r[0], r[1], r[2]] as [number, number, number])),
        add: (dabs, pressure) => api.weatherAdd(dabs, pressure),
        finish: (rigid) => api.weatherFinish(rigid),
        end: () => api.weatherEnd(),
        cancel: () => void api.weatherCancel(),
      },
    });
    r.onSlice = (level) => setSliceLevel(level);
    r.onMarkers = (on) => setMarkersOn(on);
    setMarkersOn(r.markers);
    r.grab = (hit, ev) => grabSource(hit, ev) ?? ed.startCalls.current.grabStart(hit) ?? ed.grabObjectRef.current(hit);
    r.onWheel = (ev, hit) => wheelHabit(ev) || wheelSource(ev, hit);
    // a click with no tool out: a water or badwater source is picked, its strength and its water to
    // change (the water answers live); anything else puts it down
    r.onClick = (hit) => {
      const t = hit ? targetAt(hit.x, hit.y) : null;
      if (t) return pickTile(t.x, t.y);
      setPicked(null);
      setPickedObject(null);
    };
    const onView = r.onView;
    let pending = false;
    r.onView = (v: ViewState) => {
      onView?.(v);
      // the sources' markers and the start's hint follow the view; with none on the map, the page need
      // not redraw
      if (pending || (!markerRef.current && !hintRef.current && !minimapRef.current)) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        setViewTick((n) => n + 1);
      });
    };
    setViewTick((n) => n + 1);
  }

  return { glowCorners, reglow, onReady };
}
