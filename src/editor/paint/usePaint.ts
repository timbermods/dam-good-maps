// The brushes: the picked brush and its settings, undo, redo and History's jumps (tickets in the edit queue,
// core/doc/editQueue.ts, #922), picking a tool or a shelf item, and what the worker says while it works.

import { proxy } from "comlink";
import { cacheAfterEditable } from "../../platform/isolation";
import { useEffect, useRef, useState } from "preact/hooks";
import type { EditOp } from "../../core/doc/ops";
import type { FixOp } from "../../core/validate/report";
import type { CheckProgress, EditorEvent } from "../../worker/session";
import { plain } from "../panels";
import type { ShelfItem } from "../shelfItems";
import type { Verb } from "../../core/forces/op";
import { FORCES, forceShown, type TopTool } from "../TopBar";
import { BrushPainter, type BrushSettings, type BrushTool } from "../brushes";
import type { BrushParams } from "../../core/features/raster/brush";
import { loadBrush, saveBrush } from "../prefs/brushPrefs";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

export interface PaintSlice {
  brushTool: BrushTool | null;
  brush: BrushSettings;
  brushRef: { current: BrushSettings };
  brushToolRef: { current: BrushTool | null };
  setBrush: (s: BrushSettings, save?: boolean) => void;
  /** The last stroke let go (the test hook reads it). */
  lastStroke: { current: BrushParams | null };
  painter: { current: BrushPainter | null };
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  /** History: stand at row `k` (−1: before the first step), the row's step `seq`. */
  jump: (k: number, seq?: number) => void | Promise<void>;
  pickTop: (t: TopTool | null) => void;
  putDown: () => void;
  pickBrush: (t: BrushTool | null) => void;
  pickShelf: (item: ShelfItem | null) => void;
  applyFix: (fix: FixOp[]) => Promise<void>;
}

export function usePaint(ed: Ed, props: EditorProps): PaintSlice {
  const {
    api, info, mirror, renderer, setTool, setShelf, setTurn, setPainted, setBusy, setMessage, setCheck, check,
    setProgress, setInfo, layer, setLayers, waterTick, selectingRef, selection, player, mounted, juice, weatherRef,
    setWeather, journey, setInstant, setFit, setPicked, setPickedObject, setShapeNote, infoRef, enqueue, run,
    draftWater, showWater, showSoil, edits, track
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
  const lastStroke = useRef<BrushParams | null>(null);
  const painter = useRef<BrushPainter | null>(null);
  // (the editor closes for a new or opened map, once every stroke let go has landed on the map it was painted on, U5:
  // a stroke the button still holds is forgotten, as Esc forgets one, so nothing of it reaches the next map's editor)
  useEffect(() => () => painter.current?.close(), []);

  /** A shared session's history is each player's own (worker/collabEdit.ts): its undo and redo are the session's, sent
   *  as they are; alone, a move names the step it means (I5). */
  const shared = () => !!ed.collab && ed.collab.phase !== "alone";

  /** A move's ticket: shown at once when the queue holds the step's land (a recent stroke), else when answered. The
   *  last step's note goes with it (a held stroke taken back leaves no line about tiles the map no longer holds), as
   *  it does with any other edit's; a note kept on purpose (a failed save) stays. */
  function moved(id: number | null, sound = true) {
    if (id === null) return;
    if (sound) juice.current?.undo();
    void track(id, (u) => u.ok && setMessage((m) => (m && !m.keep ? null : m)));
  }

  // (every stroke is a ticket from pointer-down, a Naturalize stroke's until its last land comes from its worker: an
  // undo, a redo or a jump pressed meanwhile names the step it means and waits behind it in the queue, so it takes that
  // stroke back as it would any other brush's, #880; one behind a stroke taken back does nothing, U1)
  const undo = () => {
    if (ed.forcer.current?.running) return ed.forcer.current.cancel();
    if (painter.current?.painting) return painter.current.cancel();
    if (ed.resizing.current) return;
    // (a force just kept: its tails stop at the key, not when the worker answers: its sound and its effects, which
    // would play on over land taken back, renderer.ts clearForce)
    juice.current?.takeBack();
    renderer.current?.clearForce();
    juice.current?.edited();
    moved(shared() ? edits.current.edit("undo", [], "Undo") : edits.current.undo());
  };
  const redo = () => {
    if (painter.current?.painting || ed.forcer.current?.running || ed.resizing.current) return;
    juice.current?.edited();
    moved(shared() ? edits.current.edit("redo", [], "Redo") : edits.current.redo(), false);
  };
  const jump = (k: number, seq?: number) => {
    if (painter.current?.painting || ed.forcer.current?.running || ed.resizing.current) return;
    juice.current?.edited();
    if (shared()) return moved(edits.current.edit("jump", [k, seq], "Jump"), false);
    const at = k < 0 ? null : (seq ?? infoRef.current.history[k]?.seq);
    if (at === undefined) return;
    moved(edits.current.jump(at === null ? null : { seq: at }), false);
  };

  /** The top bar: a brush, a force, or nothing; the shelf's object goes back. */
  function pickTop(t: TopTool | null) {
    if (ed.forcer.current?.running) return;
    // the Block tool (D335): the others go back as it is picked, and it goes back as another is
    if (t === "block") return ed.pickBlock(true);
    if (ed.blockRef.current) ed.pickBlock(false);
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
      if (ed.blockRef.current) ed.pickBlock(false);
      setTool(null);
      pickShelf(null);
      setPicked(null);
      // the brush takes the map's left button now, not a frame later: the very next press paints
      brushToolRef.current = t;
      const r = renderer.current;
      const p = painter.current;
      if (r && p) r.tool = p.tool;
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
    if (ed.blockRef.current) ed.pickBlock(false);
    ed.setStartHint(null);
    painter.current?.end();
    setBrushTool(null);
    setTool(null);
    setPicked(null);
  }
  const applyFix = (fix: FixOp[]) => run((w) => w.applyAll(fix.map(({ label: _l, ...op }) => op as EditOp), fix[0]?.label || "Fix", "fix"));

  // the map's health (export profile), checked in the background a moment after each change
  // (EDITOR_PLAN §6): the canonical settle runs in slices and replaces the preview's water, then
  // every check runs; a newer edit drops it. It is not queued, so edits never wait for it.
  useEffect(() => {
    setCheck((c) => (c && c.version === info.version ? c : null));
    setProgress(null);
    if (!ed.ready) return;
    let live = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    // Two frames give the fully drawn map and its installed handlers a chance to paint.
    let first = 0, second = 0;
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        void api.editorReady();
        cacheAfterEditable();
        t = setTimeout(() => {
          void api
            // (only the stage shows, in the dot: a new stage draws the editor again, not every step of one)
            .backgroundCheck(proxy((p: CheckProgress) => live && setProgress((was) => (was?.stage === p.stage ? was : p))))
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
              // Canonical water changes the saved project even without a new edit version.
              // Tell Your maps so a save made during the preview is refreshed with its stored map.
              infoRef.current = { ...infoRef.current, waterPending: r.info.waterPending };
              setInfo(infoRef.current);
              props.onChange(infoRef.current);
              setCheck(r.check);
              setProgress(null);
            })
            .catch(() => {
              // the check is advisory here: export runs it again
            });
        }, 700);
      });
    });
    return () => {
      live = false;
      clearTimeout(t);
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [info.version, ed.ready]);

  // the water layer on show: fetched again after every change of the map or its water
  useEffect(() => {
    if (layer === "none") return setLayers(null);
    let live = true;
    void enqueue(() => api.waterLayers(layer)).then((l) => live && setLayers(l));
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
          // (a force's own water, flowing as it works, shows as a stroke's does, D371)
          if (!(e.kind === "water" && e.draft)) return;
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
          if (e.kind === "settled" && e.version === infoRef.current.version) {
            infoRef.current = { ...infoRef.current, waterPending: e.info.waterPending };
            setInfo(infoRef.current);
            props.onChange(infoRef.current);
          }
          // (a held weather day: the journey isn't shown, so the settled water goes in place now and the day runs again
          // from it)
          if (e.kind === "settled" && weatherRef.current) player.current?.skip();
          // (the water has settled: both hazards' days are worked out once Kyler is idle)
          if (e.kind === "settled") ed.idlePrep();
        } else if (e.kind === "weather") {
          // a held weather day (Kyler, 2026-10-04): the days before it counted while they are simulated, the map as it
          // is meanwhile; then the day itself, its water and soil, and the readout reads it
          if (e.hazard !== weatherRef.current) return;
          // (the day box's fill: how far the day asked for is worked out)
          if (e.phase === "computing") return void ed.setWeatherCounting(Math.min(1, e.day / Math.max(1, e.days)));
          const want = ed.heldDay.current ?? e.days;
          if (e.day !== want || !e.water) return;
          ed.setWeatherCounting(null);
          // (the first dry day per tile of a drought, or the first bad day of a badtide, for the hover)
          const first = e.hazard === "drought" ? e.firstDry : e.firstBad;
          const through = e.hazard === "drought" ? e.firstDryThrough : e.firstBadThrough;
          ed.firstNews.current = first && through !== undefined ? { hazard: e.hazard, version: e.version, first, wet0: e.hazard === "drought" ? (e.firstDryWet0 ?? null) : null, through, days: e.days } : null;
          // (the day the start's water goes or turns bad, for the line under the day box)
          ed.setStartWater(e.startWaterDay !== undefined ? { hazard: e.hazard, version: e.version, day: e.startWaterDay } : null);
          ed.setWeatherDay(e.day);
          ed.setWeatherDays(e.days);
          ed.heldDay.current = e.day;
          showWater(e.water, false, true);
          if (e.soil) {
            mirror.current.daySoil = e.soil;
            showSoil(e.soil, e.withered, e.day);
          }
          ed.rehover();
        } else if (e.kind === "withered") {
          // the plants the held day has surely killed, worked out after the day was shown (the earlier days' soil)
          if (e.hazard === weatherRef.current && e.day === ed.heldDay.current) ed.showWithered(e.tiles);
        } else if (e.kind === "startWater") {
          // the day the start's water goes or turns bad, found after the held day was shown
          if (e.hazard === weatherRef.current) ed.setStartWater({ hazard: e.hazard, version: e.version, day: e.day });
        } else setInstant(e.instant.items.filter((c) => c.here && c.class === "load"));
      }),
    );
    return () => void api.listen(null);
  }, []);

  return {
    brushTool, brush, brushRef, brushToolRef, setBrush, lastStroke, painter, undo, redo, jump, pickTop, putDown, pickBrush,
    pickShelf, applyFix
  };
}
