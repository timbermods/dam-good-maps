// The brushes: the picked brush and its settings, strokes painted on the page's copy of the land
// before the worker confirms them, undo and redo, picking a tool or a shelf item, and what the worker
// says while it works.

import { proxy } from "comlink";
import { useEffect, useRef, useState } from "preact/hooks";
import type { EditOp } from "../../core/doc/ops";
import type { FixOp } from "../../core/validate/report";
import type { CheckProgress, EditorEvent, SessionUpdate } from "../../worker/session";
import { plain } from "../panels";
import type { ShelfItem } from "../shelfItems";
import type { Verb } from "../../core/forces/op";
import { FORCES, forceShown, type TopTool } from "../TopBar";
import { BrushPainter, paste, type BrushSettings, type BrushTool, type Stroke } from "../brushes";
import type { TerrainState } from "../../core/features/raster/strokePreview";
import { loadBrush, saveBrush } from "../prefs/brushPrefs";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

export interface PaintSlice {
  brushTool: BrushTool | null;
  brush: BrushSettings;
  brushRef: { current: BrushSettings };
  brushToolRef: { current: BrushTool | null };
  setBrush: (s: BrushSettings, save?: boolean) => void;
  terrain: { current: TerrainState };
  pendingTerrain: { current: number };
  checkStroke: { current: boolean };
  strokeMismatches: { current: number };
  localUndo: { current: Stroke[] };
  localRedo: { current: Stroke[] };
  painter: { current: BrushPainter | null };
  sendTerrain: (fn: () => Promise<SessionUpdate>) => Promise<void>;
  undo: () => void | Promise<void>;
  redo: () => Promise<void> | undefined;
  pickTop: (t: TopTool | null) => void;
  putDown: () => void;
  pickBrush: (t: BrushTool | null) => void;
  pickShelf: (item: ShelfItem | null) => void;
  applyFix: (fix: FixOp[]) => Promise<void>;
}

export function usePaint(ed: Ed, props: EditorProps): PaintSlice {
  const {
    api, info, mirror, renderer, setTool, setShelf, setTurn, setPainted, setBusy, setMessage, setCheck, check,
    setProgress, layer, setLayers, waterTick, selectingRef, selection, player, mounted, juice, weatherRef,
    setWeather, journey, setInstant, setFit, setPicked, setPickedObject, setShapeNote, queue, infoRef, enqueue, run,
    draftWater, showWater, showSoil, applyUpdate
  } = ed;

  // ------------------------------------------------------------------------------ the brushes

  const [brushTool, setBrushTool] = useState<BrushTool | null>(null);
  const [brush, setBrushState] = useState<BrushSettings>(loadBrush);
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const brushToolRef = useRef(brushTool);
  brushToolRef.current = brushTool;
  const setBrush = (s: BrushSettings, save = true) => {
    // (at once: the ring and the next stroke read it before the page renders)
    brushRef.current = s;
    setBrushState(s);
    if (save) saveBrush(s);
  };
  /** The terrain the page paints strokes on (the build's, from the worker), and the strokes on
   *  their way to the worker. */
  const terrain = useRef<TerrainState>(props.opened.terrain);
  const pendingTerrain = useRef(0);
  const checkStroke = useRef(false);
  const strokeMismatches = useRef(0);
  /** Strokes at the top of the history, which the page undoes and redoes at once. */
  const localUndo = useRef<Stroke[]>([]);
  const localRedo = useRef<Stroke[]>([]);
  const painter = useRef<BrushPainter | null>(null);

  /** Put a stroke's terrain before or after it back on the map, at once. */
  function showStroke(s: Stroke, which: "before" | "after") {
    const r = renderer.current;
    const W = infoRef.current.W;
    const snap = s[which];
    paste(mirror.current.heights, snap.shown, s.rect, W);
    const pre = terrain.current.pre;
    paste(pre, snap.pre, s.rect, W);
    if (r) {
      r.updateTerrainRect(mirror.current.heights, s.rect);
      r.refreshShadows();
    }
  }

  /** Send the worker a stroke, an undo or a redo of one; the page has shown it already. */
  function sendTerrain(fn: () => Promise<SessionUpdate>): Promise<void> {
    pendingTerrain.current++;
    const next = queue.current.then(async () => {
      setBusy((b) => b + 1);
      try {
        const u = await fn();
        pendingTerrain.current--;
        if (pendingTerrain.current === 0) checkStroke.current = true;
        if (!u.ok) {
          // the worker refused it: the page takes the worker's terrain again
          localUndo.current = [];
          localRedo.current = [];
          if (u.errors.length) setMessage({ kind: "error", text: plain(u.errors[0]) });
          const now = await api.terrainNow();
          if (pendingTerrain.current === 0) {
            mirror.current.heights = now.heights;
            terrain.current = now.terrain;
            renderer.current?.updateTerrain(now.heights);
          }
        }
        applyUpdate(u);
      } catch (e) {
        pendingTerrain.current = Math.max(0, pendingTerrain.current - 1);
        setMessage({ kind: "error", text: String(e instanceof Error ? e.message : e) });
      } finally {
        setBusy((b) => b - 1);
      }
    });
    queue.current = next;
    return next;
  }

  const undo = () => {
    if (ed.forcer.current?.running) return ed.forcer.current.cancel();
    if (painter.current?.painting) return painter.current.cancel();
    const s = localUndo.current.pop();
    if (!s) return run(() => api.undo(), (u) => u.ok && juice.current?.undo());
    juice.current?.undo();
    showStroke(s, "before");
    localRedo.current.push(s);
    sendTerrain(() => api.undo());
  };
  const redo = () => {
    if (painter.current?.painting || ed.forcer.current?.running) return;
    const s = localRedo.current.pop();
    if (!s) return run(() => api.redo());
    showStroke(s, "after");
    localUndo.current.push(s);
    sendTerrain(() => api.redo());
  };

  /** The top bar: a brush, a force, or nothing; the shelf's object goes back. */
  function pickTop(t: TopTool | null) {
    if (ed.forcer.current?.running) return;
    // a force this build doesn't show can't be picked (release.ts, D219)
    const force = t && FORCES.some((f) => f.id === t) ? (t as Verb) : null;
    if (force && !forceShown(force)) return;
    if (force) {
      pickBrush(null);
      pickShelf(null);
      setTool(force);
      setPicked(null);
      return;
    }
    if (t === null) setTool(null);
    pickBrush(t as BrushTool | null);
  }

  /** X: everything held goes back, and the pointer is plain (D345, B7). */
  function putDown() {
    if (ed.forcer.current?.running) return;
    pickTop(null);
    pickShelf(null);
    if (selectingRef.current || selection.current.count) ed.closeSelect();
    setPicked(null);
    setPickedObject(null);
    setShapeNote(null);
  }

  function pickBrush(t: BrushTool | null) {
    painter.current?.end();
    setShapeNote(null);
    // (a target set by hand lasts until the tool changes, D322)
    if (t !== brushToolRef.current && brushRef.current.target !== null) setBrush({ ...brushRef.current, target: null }, false);
    setBrushTool(t);
    if (t) {
      setTool(null);
      pickShelf(null);
      setPicked(null);
    }
  }

  /** The shelf (D184): an object to place, its ghost under the pointer, or none. */
  function pickShelf(item: ShelfItem | null) {
    setShelf(item);
    setTurn(0);
    setFit(null);
    ed.fitWant.current = null;
    setPainted(null);
    setShapeNote(null);
    renderer.current?.setGhost(null);
    ed.ghostAt.current = null;
    if (!item) return;
    ed.setStartHint(null);
    painter.current?.end();
    setBrushTool(null);
    setTool(null);
    setPicked(null);
  }
  const applyFix = (fix: FixOp[]) => run(() => api.applyAll(fix.map(({ label: _l, ...op }) => op as EditOp), fix[0]?.label || "Fix", "fix"));

  // the map's health (export profile), checked in the background a moment after each change
  // (EDITOR_PLAN §6): the canonical settle runs in slices and replaces the preview's water, then
  // every check runs; a newer edit drops it. It is not queued, so edits never wait for it.
  useEffect(() => {
    setCheck((c) => (c && c.version === info.version ? c : null));
    setProgress(null);
    let live = true;
    const t = setTimeout(() => {
      void api
        .backgroundCheck(proxy((p: CheckProgress) => live && setProgress(p)))
        .then((r) => {
          if (!r || !mounted.current) return;
          // (a force at work shows its own water: the map's comes after it)
          if (ed.forcer.current?.running) {
            ed.deferred.current.push(r.view);
            return;
          }
          // the exact settle's water ends the journey in progress (eased into), or shows at once.
          // The worker put it in place and sends it once, so it shows even when the page moved on
          // while the check ran (the check started as an edit went in): only the report waits
          // (the worker says whether a settle still runs: when it does not, the journey ends here whether or
          // not this answer carries water, so the bar never waits for frames that will not come, D345 B14)
          journey.current?.check(r);
          if (!live || r.check.version !== infoRef.current.version) return;
          setCheck(r.check);
          setProgress(null);
        })
        .catch(() => {
          // the check is advisory here: export runs it again
        });
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [info.version]);

  // the water layer on show: fetched again after every change of the map or its water
  useEffect(() => {
    if (layer === "none") return setLayers(null);
    let live = true;
    void enqueue(() => api.waterLayers()).then((l) => live && setLayers(l));
    return () => {
      live = false;
    };
  }, [layer, info.version, waterTick, check?.version]);


  useEffect(() => props.onChange(info), []);

  // the worker's own news between its answers: the water as it flows after an edit, then the
  // settled water with the soil and plants on it (live editing: an edit never waits on the water)
  useEffect(() => {
    void api.listen(
      proxy((e: EditorEvent) => {
        // the water's journey keeps its own count of versions: news that comes before the page reaches its
        // version waits for it, older news is dropped (waterJourney.ts)
        const news = (e.kind === "water" && !e.draft) || e.kind === "settled";
        if (!news && e.version !== infoRef.current.version) return;
        // a force at work shows its own water; the map's settled view comes after it
        if (ed.forcer.current?.running) {
          if (e.kind === "settled" && e.version === infoRef.current.version) ed.deferred.current.push(e.view);
          return;
        }
        if (e.kind === "water" && e.draft) {
          // the water on a stroke being painted: shown as it comes (D197), the latest once a frame at
          // most (each is a whole map's water: frames that come faster than the page draws are
          // dropped, never queued behind the stroke)
          if (player.current?.hasJourney) {
            journey.current?.flush();
            player.current.clear();
          }
          const first = !draftWater.current;
          draftWater.current = e.water;
          if (first)
            requestAnimationFrame(() => {
              const w = draftWater.current;
              draftWater.current = null;
              if (w) showWater(w, true);
            });
        } else if (e.kind === "water" || e.kind === "settled") {
          // (a stroke's frame still waiting is older than the edit's water)
          draftWater.current = null;
          // an edit's water plays at a pace the eye can follow, and the settled water ends it
          journey.current?.news(e);
        } else if (e.kind === "weather") {
          const w = weatherRef.current;
          if (!w) return;
          const day = `day ${Math.max(1, Math.ceil(e.day))} of ${e.days}`;
          const words = e.phase === "drought" ? `Drought: ${day}` : e.phase === "badtide" ? `Badtide: ${day}` : e.phase === "return" ? (w === "badtide" ? "The water runs clean again" : "The water comes back") : undefined;
          const soil = e.soil;
          const show = soil ? () => showSoil(soil) : undefined;
          const final = e.phase === "end" ? () => (soil && showSoil(soil), setWeather(null)) : show;
          player.current?.push({ water: e.water, done: e.phase === "return" || e.phase === "end" ? 0.5 : e.day / e.days / 2, ...(words ? { words } : {}), ...(final ? { final } : {}) });
        } else setInstant(e.instant.items.filter((c) => c.here && c.class === "load"));
      }),
    );
    return () => void api.listen(null);
  }, []);

  return {
    brushTool, brush, brushRef, brushToolRef, setBrush, terrain, pendingTerrain, checkStroke, strokeMismatches,
    localUndo, localRedo, painter, sendTerrain, undo, redo, pickTop, putDown, pickBrush, pickShelf, applyFix
  };
}
