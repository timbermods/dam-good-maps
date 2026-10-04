// A force at work: its frames, the driver, Unleash on a source, starting a force, carving, the
// cursor's ring and sizing.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState, type Dispatch, type StateUpdater } from "preact/hooks";
import type { EntityView } from "../../render3d/model";
import type { EntityInfo, ForceFrame, ForceRequest, ViewUpdate } from "../../worker/session";
import { plain } from "../panels";
import { ForceDriver, paceOf } from "../forceDriver";
import { carveDetails, carveSettingsOf, DEFAULT_CARVE } from "../CarveRow";
import { craterDetails, craterSettingsOf, eruptDetails, eruptSettingsOf, quakeDetails } from "../ForceRows";
import { glaciateDetails, glaciateSettingsOf } from "../ForceRows";
import { sizeOf as glacierSize } from "../../core/forces/glaciate/model";
import { forceReach } from "../../core/forces/reach";
import { MAX_PATH_POINTS } from "../../core/forces/carve/run";
import { bandTiles, FreehandPath } from "../freehand";
import { downhillPath, pathLength, pathTiles, resamplePath, type PathPoint } from "../../core/forces/path";
import type { Verb } from "../../core/forces/op";
import type { ForceCue } from "../../core/forces/runs";
import { Words, type Group } from "../settings";
import { FLOOR_DEFAULT } from "../../core/forces/floor";
import { keyHabit, sized, sizeForReach, stepPower, stepSize, type SizedForce } from "../forceSize";
import { hasTarget, nextSize, sizeMax } from "../brushes";
import { tip } from "../../ui/Tooltip";
import type { Ed } from "../ed";

export interface ForceRunSlice {
  deferred: { current: ViewUpdate[] };
  forceCalls: { current: { keep(gesture: number, wanted: () => boolean): Promise<void>; drop(gesture: number): Promise<void>; show(f: ForceFrame): void; carve(origin: [number, number], end?: [number, number], via?: [number, number][], fromEnd?: boolean): void; glaciate(origin: [number, number], end: [number, number], via: [number, number][]): void } | null };
  forcer: { current: ForceDriver | null };
  lastUnleash: { current: string | null };
  unleashPower: number;
  setUnleashPower: Dispatch<StateUpdater<number>>;
  unleash: (e: EntityInfo, end?: [number, number], via?: [number, number][]) => void;
  unleashAgain: (e: EntityInfo) => void;
  unleashDown: (ev: PointerEvent, e: EntityInfo) => void;
  unleashRow: () => { label: string; groups: Group[] } | null;
  startForce: (req: ForceRequest, painting?: boolean) => void;
  steerTiles: (path: readonly PathPoint[], downhill: boolean) => { origin: [number, number]; end: [number, number]; via: [number, number][]; reversed: boolean } | null;
  pathFrame: { current: number };
  showPath: (path: readonly PathPoint[] | null, radius?: number) => void;
  strokeRadius: { current: number };
  gestureTiles: (path: readonly PathPoint[], radius: number) => number[];
  bandRadius: () => number;
  forceAgain: () => void;
  cursorFrame: { current: number };
  showForceCursor: (at: [number, number] | null, dot?: boolean) => void;
  forceSizing: { current: { verb: SizedForce; x: number; y: number; level: number; from: number | null; size: number; stop(): void } | null };
  fHeld: { current: boolean };
  stepHabit: (habit: { what: "size" | "strength"; dir: 1 | -1 }, ev?: MouseEvent) => boolean;
  wheelHabit: (ev: WheelEvent) => boolean;
  startForceSize: () => void;
  endForceSize: (keep: boolean) => void;
}

export function useForceRun(ed: Ed): ForceRunSlice {
  const {
    api, mirror, renderer, tool, repaintRef, setForceStroke, setForceCursor, setForceRing, gestureRef, setBusy,
    setMessage, player, mounted, juice, weatherRef, setWeather, journey, firstDoneRef, setPicked, setShapeNote,
    infoRef, enqueue, applyUpdate, applyView, brushRef, brushToolRef, setBrush, localUndo, localRedo, painter,
    notePointer, sourcesChanged, pointerWords, flashNote, carveUi, setCarveUi, carveUiRef, craterUi, setCraterUi,
    craterUiRef, eruptUi, setEruptUi, eruptUiRef, quakeUi, quakeUiRef, setQuakeUi, glaciateUi, setGlaciateUi,
    glaciateUiRef, watchRef, floorRef, setForceTick
  } = ed;

  /** The map's own views that came while a force was at work (the settled water, a check's): they
   *  go on the map just before the force's own answer. */
  const deferred = useRef<ViewUpdate[]>([]);
  /** The force to start next: which, how and where, and the layer showing (D207: only the land
   *  showing changes). */
  const forceReq = useRef<ForceRequest | null>(null);
  /** The last moment shown (an eruption's cooling hiss starts from it). */
  const lastCue = useRef<ForceCue | null>(null);

  /** A force's objects waiting for the next animation frame (the latest), so the land's change and
   *  its objects never land in one frame (each is a whole map's update). Its water stays as it was
   *  until the land is final (D321, item 30): the kept map's view brings it. */
  const forceView = useRef<{ entities: EntityView | null; frame: number }>({ entities: null, frame: 0 });

  function flushForceView(drop = false) {
    const v = forceView.current;
    if (v.frame) cancelAnimationFrame(v.frame);
    v.frame = 0;
    const e = v.entities;
    v.entities = null;
    if (drop || !e) return;
    const m = mirror.current;
    m.entities = e;
    m.entitiesAt = null;
    m.coverAt = null;
    renderer.current?.updateEntities(e);
    ed.reglow();
    sourcesChanged();
  }

  /** A frame of a force at work: the ground it changed, its objects. */
  function showForceFrame(f: ForceFrame) {
    const r = renderer.current;
    const m = mirror.current;
    if (f.heights && f.rect) {
      m.heights = f.heights;
      r?.updateTerrainRect(f.heights, f.rect);
    }
    const v = forceView.current;
    if (f.entities) v.entities = f.entities;
    if (f.entities && !v.frame) v.frame = requestAnimationFrame(() => flushForceView());
    if (f.heat) r?.setHeat(f.heat);
  }

  function flushDeferred() {
    const list = deferred.current;
    deferred.current = [];
    for (const v of list) applyView(v);
  }

  // (the driver lives as long as the editor; it calls the latest of these)
  const forceCalls = useRef<{ keep(gesture: number, wanted: () => boolean): Promise<void>; drop(gesture: number): Promise<void>; show(f: ForceFrame): void; carve(origin: [number, number], end?: [number, number], via?: [number, number][], fromEnd?: boolean): void; glaciate(origin: [number, number], end: [number, number], via: [number, number][]): void } | null>(null);
  forceCalls.current = {
    // Esc while it is kept (D341): a keep whose turn comes after Esc sends nothing, and one already
    // on its way is taken back by the drop behind it, so it is never shown
    keep: (gesture, wanted) =>
      enqueue(async () => {
        if (!wanted()) return;
        setBusy((b) => b + 1);
        try {
          const u = await api.forceStop(gesture);
          if (!wanted()) return;
          // (the kept map's own view replaces the force's last frames)
          flushForceView(true);
          flushDeferred();
          localUndo.current = [];
          localRedo.current = [];
          applyUpdate(u);
          renderer.current?.refreshShadows();
          if (!u.ok && u.errors.length) setMessage({ kind: "info", text: plain(u.errors[0]) });
          else if (u.ok) {
            setMessage(null);
            // (the first-run hint points at Carve: a force kept is shaping the land too, D352)
            firstDoneRef.current("paint");
          }
        } finally {
          setBusy((b) => b - 1);
        }
      }),
    drop: (gesture) =>
      enqueue(async () => {
        const v = await api.forceCancel(gesture);
        if (!mounted.current) return;
        flushForceView(true);
        flushDeferred();
        if (v.info) {
          // (kept already, and taken back as if never kept: the history changed too)
          localUndo.current = [];
          localRedo.current = [];
          applyUpdate({ ok: true, errors: [], info: v.info, view: v, ms: 0, ...(v.waterSettled !== undefined ? { waterSettled: v.waterSettled } : {}) });
        } else applyView(v);
        renderer.current?.refreshShadows();
      }),
    show: showForceFrame,
    carve: startCarve,
    glaciate: (origin, end, via) => startForce({ verb: "glaciate", settings: glaciateSettingsOf(glaciateUiRef.current), origin, end, ...(via.length ? { via } : {}), cut: renderer.current?.slice ?? null }),
  };
  const forcer = useRef<ForceDriver | null>(null);
  forcer.current ??= new ForceDriver({
    start: (again, gesture) =>
      enqueue(() => {
        const q = forceReq.current;
        if (again || !q) {
          // Try another: the row's current pins go with it (D309), so a detail still on Auto
          // re-rolls and one the player pinned keeps its value; Unleash (no More button of its own)
          // and any other caller outside the row send none, and every detail re-rolls, as before D309
          const verb = unleashRef.current ? null : infoRef.current.forceAgain;
          const pins =
            verb === "carve"
              ? carveDetails(carveUiRef.current)
              : verb === "craterize"
                ? craterDetails(craterUiRef.current)
                : verb === "erupt"
                  ? eruptDetails(eruptUiRef.current)
                  : verb === "quake"
                    ? quakeDetails(quakeUiRef.current)
                    : verb === "glaciate"
                      ? glaciateDetails(glaciateUiRef.current)
                      : undefined;
          // (and the row's Power and Size as they are now, D361 (1): Try another answers them)
          const now = verb === "carve" ? { power: carveUiRef.current.power, width: carveUiRef.current.width } : verb === "quake" ? { power: quakeUiRef.current.power } : verb ? { power: forcePowerOf(verb), size: forceSizeField(verb as SizedForce) } : {};
          return api.forceAgain(pins && { ...pins, ...now, floor: floorRef.current !== FLOOR_DEFAULT ? floorRef.current : undefined }, gesture);
        }
        return api.forceStart({ ...q, gesture });
      }),
    advance: (steps) => enqueue(() => api.forceAdvance(steps)),
    // (a painted Lift takes the row's Power as it is now: [ and ] change it while it is painted, D361 (1), D368 (1))
    paint: (path, side) => enqueue(() => api.forcePaint(path, side, quakeUiRef.current.power)),
    keep: (gesture, wanted) => forceCalls.current!.keep(gesture, wanted),
    drop: (gesture) => forceCalls.current!.drop(gesture),
    renderer: () => renderer.current,
    show: (f) => forceCalls.current!.show(f),
    changed: () => setForceTick((n) => n + 1),
    error: (text) => setMessage({ kind: "error", text: plain(text) }),
    moment: (f) => {
      // (the showing's pace, D344 A7: how many of the force's own seconds a second shows, so its
      // effects and sounds keep to its land in Fast and in Slow forces)
      const t = forcer.current?.timing;
      const cue = t && t.show > 0 && t.total > 0 ? { ...f.cue, pace: (t.total * paceOf(f.verb).ms) / t.show } : f.cue;
      lastCue.current = cue;
      renderer.current?.setForceMoment(cue);
      juice.current?.forceMoment(cue, f.head);
    },
    speed: () => (watchRef.current ? "watch" : "fast"),
    ended: (kept) => {
      if (kept) renderer.current?.forceDone();
      else renderer.current?.clearForce();
      juice.current?.forceEnded(kept, lastCue.current ?? undefined);
      lastCue.current = null;
      // an unleashed source (D239): picked again, with Try another once kept
      const u = unleashRef.current;
      if (u) {
        unleashRef.current = null;
        setUnleashing(false);
        if (kept) lastUnleash.current = u.id;
        ed.pickTile(u.x, u.y);
      }
    },
  });
  // (a force at work when the editor closes goes with it)
  useEffect(() => () => forcer.current?.cancel(), []);
  // Slow forces (D321, item 29): a click anywhere jumps the playing force straight to its final land, so
  // Slow forces never traps the player (the force's own row keeps its Pause and Revert)
  useEffect(() => {
    const down = (ev: PointerEvent) => {
      const st = forcer.current?.status;
      if (!st || st.speed !== "watch" || st.painting || st.stopping) return;
      if ((ev.target as HTMLElement | null)?.closest?.('[aria-label$=" at work"]')) return;
      void forcer.current!.jump();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  // ------------------------------------------------------------------------ Unleash, on a source

  /** The source being unleashed (D239): its id and its tile, while its carve works. */
  const unleashRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const [unleashing, setUnleashing] = useState(false);
  /** The source last unleashed and kept (its row offers Try another). */
  const lastUnleash = useRef<string | null>(null);
  const [unleashPower, setUnleashPower] = useState(DEFAULT_CARVE.power);
  const unleashPowerRef = useRef(unleashPower);
  unleashPowerRef.current = unleashPower;

  /** Unleash a placed source (D239): it carves its own course downhill with Carve's engine (from a
   *  pool, breaking out where it would spill over), or to `end`, aimed; its strength sets the width,
   *  Power how hard it cuts, the rest Carve's defaults; the source stays its origin. */
  function unleash(e: EntityInfo, end?: [number, number], via?: [number, number][]) {
    if (forcer.current?.running) return;
    const x = e.template === "BadwaterSource" ? e.x + 1 : e.x;
    const y = e.template === "BadwaterSource" ? e.y + 1 : e.y;
    unleashRef.current = { id: e.id, x, y };
    setUnleashing(true);
    const settings = { ...carveSettingsOf({ ...DEFAULT_CARVE, power: unleashPowerRef.current }, !!end), defyGravity: false };
    startForce({ verb: "carve", settings, origin: [x, y], ...(end ? { end } : {}), ...(end && via?.length ? { via } : {}), cut: renderer.current?.slice ?? null, source: e.id });
  }

  /** Try another for an unleashed source: another course from the same land, in its place. */
  function unleashAgain(e: EntityInfo) {
    if (forcer.current?.running) return;
    unleashRef.current = { id: e.id, x: e.template === "BadwaterSource" ? e.x + 1 : e.x, y: e.template === "BadwaterSource" ? e.y + 1 : e.y };
    setUnleashing(true);
    forceAgain();
  }

  /** Unleash's button: a click unleashes it downhill; pressed and dragged out onto the land, the
   *  source's river follows the line drawn from it (D321, item 41: the line shows as it is drawn;
   *  the source's own drag still moves it). */
  function unleashDown(ev: PointerEvent, e: EntityInfo) {
    if (ev.button !== 0 || forcer.current?.running) return;
    ev.preventDefault();
    const from: PathPoint = { x: e.template === "BadwaterSource" ? e.x + 1 : e.x, y: e.template === "BadwaterSource" ? e.y + 1 : e.y };
    const g = new FreehandPath(infoRef.current.W, infoRef.current.H);
    g.down(from, ev.clientX, ev.clientY);
    let aim: [number, number] | null = null;
    const move = (m: PointerEvent) => {
      const hit = renderer.current?.pickSurface(m.clientX, m.clientY) ?? null;
      const onMap = hit && document.elementFromPoint(m.clientX, m.clientY)?.tagName === "CANVAS";
      const path = g.move(onMap && hit ? { x: hit.x, y: hit.y } : null, m.clientX, m.clientY);
      if (!path) return;
      aim = onMap && hit && Math.hypot(hit.x - from.x, hit.y - from.y) >= 2 ? [hit.x, hit.y] : null;
      showPath(path);
    };
    // the window loses focus mid-drag: the release never comes, so the drag ends without unleashing (D361, item 5)
    const lost = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", lost);
      showPath(null);
      g.up(null);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", lost);
      showPath(null);
      const end = g.up(aim ? { x: aim[0], y: aim[1] } : null);
      // (a click starts it from the button's own click: starting it here would put the row's
      // controls under the pointer before the click lands)
      if (!aim || !end || !("path" in end)) return;
      const tiles = steerTiles(end.path, false);
      if (tiles) unleash(e, tiles.end, tiles.via);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("blur", lost);
  }

  /** The row while an unleashed source's carve works: Carve's own controls. */
  function unleashRow(): { label: string; groups: Group[] } | null {
    const st = forcer.current?.status ?? null;
    if (!unleashing || !st) return null;
    return {
      label: "Unleash at work",
      groups: [
        { key: "status", row: 1, at: 1, span: 7, rows: 2, centre: true, node: <Words status>{st.stopping ? "Keeping the river…" : st.paused ? "Paused" : "The source carves its way…"}</Words> },
        {
          key: "pause",
          row: 1,
          at: 8,
          span: 2,
          rows: 2,
          centre: true,
          node: (
            <button type="button" class="set-button" disabled={st.stopping} onClick={() => forcer.current?.pause(!forcer.current.status?.paused)} {...tip(st.paused ? "Carry on" : "Hold it here", "Space")}>
              {st.paused ? "Resume" : "Pause"}
            </button>
          ),
        },
        {
          key: "revert",
          row: 1,
          at: 10,
          span: 2,
          rows: 2,
          centre: true,
          node: (
            <button type="button" class="set-button" onClick={() => forcer.current?.cancel()} {...tip("Take all of it back", "Ctrl+Z", "Esc skips to its end")}>
              Revert
            </button>
          ),
        },
      ],
    };
  }

  /** The water's journey gives way to the force's own water (a held weather day stays on screen and runs again once
   *  the force's water has settled). */
  function clearForForce() {
    journey.current?.flush();
    player.current?.clear();
    setPicked(null);
    setShapeNote(null);
    setMessage(null);
  }

  /** Start the force picked with `req`. */
  function startForce(req: ForceRequest, painting = false) {
    // the working area (D254, D259): outside it the land is unbreakable rock to the force
    const area = ed.workingArea();
    if (area) req = { ...req, area };
    // the choices the row doesn't show come from the land and the seed (D289); the Floor is the
    // player's (D321, item 40)
    req = { ...req, natural: true, ...(floorRef.current !== FLOOR_DEFAULT ? { settings: { ...req.settings, floor: floorRef.current } } : {}) } as ForceRequest;
    forceReq.current = req;
    clearForForce();
    // (the drawn line goes as the force starts; a painted Lift keeps its stroke while it is painted)
    setForceCursor(null);
    if (!painting) setForceStroke(null);
    // (refused: the ice gathered under the pointer goes too)
    void forcer.current?.start(false, painting).then((ok) => {
      if (!ok) renderer.current?.clearForce();
    });
  }

  /** A drawn path as a travelling force takes it (D321, item 41): a tile every two along it (at most
   *  the force's own limit), `downhill` from its higher end to its lower (a river's water runs
   *  downhill, whichever way it was drawn); its origin, its end and the tiles between. Null when it is
   *  too short to steer by (under two tiles). */
  function steerTiles(path: readonly PathPoint[], downhill: boolean): { origin: [number, number]; end: [number, number]; via: [number, number][]; reversed: boolean } | null {
    const { W, H } = infoRef.current;
    if (pathLength(path) < 2) return null;
    let pts = resamplePath(path, 2, MAX_PATH_POINTS + 2);
    const drawn = pts[0];
    if (downhill) pts = downhillPath(pts, mirror.current.heights, W, H);
    const tiles = pathTiles(pts, W, H);
    // (a path that comes back to where it began ends a tile short of it)
    while (tiles.length > 2 && tiles.at(-1)![0] === tiles[0][0] && tiles.at(-1)![1] === tiles[0][1]) tiles.pop();
    if (tiles.length < 2) return null;
    // (`reversed`: drawn uphill, so its origin is where the line ended)
    return { origin: tiles[0], end: tiles.at(-1)!, via: tiles.slice(1, -1), reversed: pts[0] !== drawn };
  }

  /** The line a force is drawn with, on the land as it is drawn (null: none), at most once a frame. */
  const pathFrame = useRef(0);
  function showPath(path: readonly PathPoint[] | null, radius = 0) {
    cancelAnimationFrame(pathFrame.current);
    pathFrame.current = requestAnimationFrame(() => setForceStroke(path ? gestureTiles(path, radius) : null));
  }

  /** A drawn gesture on the land (D344, A3): a band of the force's width along the line (`radius`
   *  tiles either side), never a circle; a thin line where it has no width (an
   *  unleashed source's line). */
  const strokeRadius = useRef(0);
  /** A drawn fault's or fissure's band: its line, about as wide as a fault's crack (D361 (2)). */
  const STROKE_RADIUS = 1;
  function gestureTiles(path: readonly PathPoint[], radius: number): number[] {
    strokeRadius.current = radius;
    return radius > 0.5 ? bandTiles(path, radius, infoRef.current.W, infoRef.current.H) : ed.strokeTiles(path);
  }

  /** The band's half width for the force picked, as drawn (D344 A3, amended by D361 (2)): the preview
   *  is the player's stroke, never what the force decides. Carve's and Glaciate's width is their Size,
   *  the player's own; a fault or a fissure is its line, a narrow band about as wide as a fault's crack
   *  (its reach, a fissure's breadth and the ground inside a loop are the force's, never drawn). */
  function bandRadius(): number {
    const verb = ed.toolRef.current;
    if (verb === "quake" || verb === "erupt") return STROKE_RADIUS;
    return reachNow() ?? 0;
  }


  function startCarve(origin: [number, number], end?: [number, number], via?: [number, number][], fromEnd = false) {
    startForce({ verb: "carve", settings: carveSettingsOf(carveUiRef.current, !!end), origin, ...(end ? { end } : {}), ...(end && via?.length ? { via } : {}), ...(end && fromEnd ? { shownFrom: "end" as const } : {}), cut: renderer.current?.slice ?? null });
  }


  /** Try another: the last force again, from the same land, another way. */
  function forceAgain() {
    if (!forcer.current || forcer.current.running) return;
    clearForForce();
    void forcer.current.start(true);
  }

  /** The radius of the picked force's size at its Power and Size (D312), or null: Quake has none to
   *  show (its reach is its own decision, never drawn in advance, D368 (2)). */
  function reachNow(): number | null {
    switch (ed.toolRef.current) {
      case "carve":
        return forceReach({ verb: "carve", settings: carveSettingsOf(carveUiRef.current) });
      case "craterize":
        return forceReach({ verb: "craterize", settings: craterSettingsOf(craterUiRef.current) });
      case "erupt":
        return forceReach({ verb: "erupt", settings: eruptSettingsOf(eruptUiRef.current) });
      case "glaciate":
        // (its width: where it goes depends on the land)
        return glacierSize(glaciateUiRef.current) / 2;
      default:
        return null;
    }
  }

  /** The small cursor where a force's click would act (D258: the cursor, never a footprint), and the
   *  faint ring of its size round it (D312; `dot` false: the ring alone), at most once a frame. */
  const cursorFrame = useRef(0);
  function showForceCursor(at: [number, number] | null, dot = true) {
    // (F held: the ring stays where it was, its size following the pointer)
    if (forceSizing.current) return;
    cancelAnimationFrame(cursorFrame.current);
    cursorFrame.current = requestAnimationFrame(() => {
      const now = gestureRef.current.forceCursor;
      const want = dot ? at : null;
      if (!(now === want || (now && want && now[0] === want[0] && now[1] === want[1]))) setForceCursor(want);
      const r = at ? reachNow() : null;
      const ring = gestureRef.current.forceRing;
      const next = at && r !== null ? { x: at[0] + 0.5, y: at[1] + 0.5, r } : null;
      if (!(ring === next || (ring && next && ring.x === next.x && ring.y === next.y && ring.r === next.r))) setForceRing(next);
    });
  }
  // (Power or Size changed under a still pointer: the ring follows at once)
  useEffect(() => {
    const ring = gestureRef.current.forceRing;
    if (!ring) return;
    const r = reachNow();
    if (r === null) setForceRing(null);
    else if (r !== ring.r) setForceRing({ ...ring, r });
  }, [carveUi, craterUi, eruptUi, quakeUi, glaciateUi, tool]);

  // A force's Size and Power from the keys, exactly as a brush's (D344, A1; forceSize.ts): hold F and
  // move the mouse to size its ring on the map, its size beside the pointer (a click or letting go keeps
  // it, Esc or a right click puts it back); { and } step its Size, [ and ] its Power (D368 (1)). A Size set by hand
  // is off Auto.
  const forceSizing = useRef<{ verb: SizedForce; x: number; y: number; level: number; from: number | null; size: number; stop(): void } | null>(null);
  /** F is held (D368 (11): the wheel then sets the strength). */
  const fHeld = useRef(false);

  /** One key habit for every tool (D368 (1), (11)): a step of the Size or the strength of the tool
   *  out, beside the pointer (a force's Power; Smooth and Naturalize's strength; nothing on Raise,
   *  Lower and Flatten, whose target level is theirs); a force's Size set so is off Auto. False when no
   *  tool takes it. */
  function stepHabit(habit: { what: "size" | "strength"; dir: 1 | -1 }, ev?: MouseEvent): boolean {
    const forcePicked = ed.toolRef.current;
    const brushTool = brushToolRef.current;
    if (forcePicked && !brushTool) {
      if (habit.what === "strength") {
        const power = stepPower(forcePowerOf(forcePicked), habit.dir);
        setForcePower(forcePicked, power);
        if (forcePicked === "quake") repaintRef.current?.();
        flashNote(`power ${power}`, ev);
      } else if (sized(forcePicked)) {
        const now = forceSizeField(forcePicked) ?? 2 * (reachNow() ?? 0);
        const size = stepSize(forcePicked, now, habit.dir);
        setForceSize(forcePicked, size);
        flashNote(`size ${size}`, ev);
      }
      return true;
    }
    if (!brushTool) return false;
    if (habit.what === "size") {
      const size = nextSize(brushRef.current.size, habit.dir, sizeMax(infoRef.current.W, infoRef.current.H));
      setBrush({ ...brushRef.current, size });
      flashNote(`size ${size}`, ev);
    } else if (!hasTarget(brushTool)) {
      // (as Shift+scroll)
      const strength = Math.max(1, Math.min(10, brushRef.current.strength + habit.dir));
      setBrush({ ...brushRef.current, strength });
      flashNote(`strength ${strength}`, ev);
    }
    return true;
  }

  /** F held and the wheel (D368 (11)): the strength, never the zoom; F's sizing so far is kept. */
  function wheelHabit(ev: WheelEvent): boolean {
    const habit = keyHabit({ delta: ev.deltaY || ev.deltaX, f: fHeld.current, shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey, alt: ev.altKey });
    if (!habit || (!ed.toolRef.current && !brushToolRef.current)) return false;
    // (the wheel's number, not the size, beside the pointer from here)
    painter.current?.endResize(true);
    endForceSize(true);
    stepHabit(habit, ev);
    return true;
  }

  /** The Size field of a force's row: a number, or null on Auto. */
  function forceSizeField(verb: SizedForce): number | null {
    return verb === "carve" ? carveUiRef.current.width : verb === "craterize" ? craterUiRef.current.size : verb === "erupt" ? eruptUiRef.current.size : glaciateUiRef.current.size;
  }
  function setForceSize(verb: SizedForce, size: number | null) {
    if (verb === "carve") setCarveUi((carveUiRef.current = { ...carveUiRef.current, width: size }));
    else if (verb === "craterize") setCraterUi((craterUiRef.current = { ...craterUiRef.current, size }));
    else if (verb === "erupt") setEruptUi((eruptUiRef.current = { ...eruptUiRef.current, size }));
    else setGlaciateUi((glaciateUiRef.current = { ...glaciateUiRef.current, size }));
  }
  function forcePowerOf(verb: Verb): number {
    return verb === "carve" ? carveUiRef.current.power : verb === "craterize" ? craterUiRef.current.power : verb === "erupt" ? eruptUiRef.current.power : verb === "quake" ? quakeUiRef.current.power : glaciateUiRef.current.power;
  }
  function setForcePower(verb: Verb, power: number) {
    if (verb === "carve") setCarveUi((carveUiRef.current = { ...carveUiRef.current, power }));
    else if (verb === "craterize") setCraterUi((craterUiRef.current = { ...craterUiRef.current, power }));
    else if (verb === "erupt") setEruptUi((eruptUiRef.current = { ...eruptUiRef.current, power }));
    else if (verb === "quake") setQuakeUi({ ...quakeUiRef.current, power });
    else setGlaciateUi((glaciateUiRef.current = { ...glaciateUiRef.current, power }));
  }

  /** F went down with a sized force picked and its ring on the map: the ring stays where it is, and
   *  its size follows the pointer's distance from its middle. */
  function startForceSize() {
    const verb = ed.toolRef.current;
    const ring = gestureRef.current.forceRing;
    const r = renderer.current;
    if (!sized(verb) || !ring || !r || forceSizing.current || forcer.current?.running) return;
    cancelAnimationFrame(cursorFrame.current);
    const move = (ev: PointerEvent) => {
      const f = forceSizing.current;
      if (!f) return;
      const p = renderer.current?.pickAtLevel(ev.clientX, ev.clientY, f.level);
      notePointer(ev);
      if (!p) return;
      const size = sizeForReach(f.verb, Math.hypot(p.point[0] - f.x, -p.point[2] - f.y));
      if (size !== f.size) {
        f.size = size;
        setForceSize(f.verb, size);
        setForceRing({ x: f.x, y: f.y, r: size / 2 });
      }
      pointerWords.current!.sizing(`size ${size}`);
    };
    // (a click keeps it, a right click puts it back; neither reaches the map)
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      endForceSize(ev.button === 0);
    };
    const size = Math.round(ring.r * 2);
    forceSizing.current = {
      verb,
      x: ring.x,
      y: ring.y,
      level: r.heightAt(Math.floor(ring.x), Math.floor(ring.y)),
      from: forceSizeField(verb),
      size,
      stop: () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerdown", down, true);
      },
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerdown", down, true);
    pointerWords.current!.sizing(`size ${size}`);
  }

  /** The size is set (F let go, a click) or put back (Esc, a right click). */
  function endForceSize(keep: boolean) {
    const f = forceSizing.current;
    if (!f) return;
    f.stop();
    forceSizing.current = null;
    if (!keep) setForceSize(f.verb, f.from);
    pointerWords.current!.sizing(null);
  }
  useEffect(() => () => forceSizing.current?.stop(), []);

  return {
    deferred, forceCalls, forcer, lastUnleash, unleashPower, setUnleashPower, unleash, unleashAgain, unleashDown,
    unleashRow, startForce, steerTiles, pathFrame, showPath, strokeRadius, gestureTiles, bandRadius, forceAgain,
    cursorFrame, showForceCursor, forceSizing, fHeld, stepHabit, wheelHabit, startForceSize, endForceSize
  };
}
