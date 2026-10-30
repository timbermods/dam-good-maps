// The words beside the pointer, the footprint check, and the shelf: the ghost under the pointer,
// placing, dropping and painting the picked object.

import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { cornerFor } from "../../core/doc/tools";
import { standingOfView, startFitExtras, startFitWarnings, type StartFitExtra } from "../../core/doc/startFit";
import { footprintTiles, startEntranceTile, type Orientation } from "../../core/format/footprints";
import { ORIENTATION_NAMES } from "../../render3d/model";
import type { SessionUpdate, ToolRequest } from "../../worker/session";
import { startProblemAt, newId, startStatus } from "../features";
import { modalLevel } from "../../core/features/footprintLevel";
import { tilesToRuns } from "../../core/math/grid";
import { dyingTiles } from "../../core/doc/plantSoil";
import type { PaintParams } from "../../core/doc/paintParams";
import { hasOptions, placeComponents } from "../../core/doc/objectOps";
import { FLUIDS } from "../../core/data/parity";
import { hasAge, objectOptionsOf, paintDisc, quietWord, SHELF, templateOf, type ShelfItem } from "../shelfItems";
import { shelfTool } from "../placeTools";
import { rememberShelfIcon, shelfIcons } from "./iconCache";
import { PointerWords } from "../pointerWords";
import { GHOST_OK, coordinatesAt } from "../tools";
import { NO_START_HERE, type StartHere } from "../start/startHere";
import type { Ed } from "../ed";
import type { TileHit } from "../../render3d";
import { aimOf, startRoofed } from "./aim";

export interface ShelfSlice {
  pointerWords: { current: PointerWords | null };
  flashNote: (text: string, ev?: MouseEvent) => void;
  fitWant: { current: string | null };
  ghostAt: { current: { template: string; x: number; y: number; z: number; orientation: number } | null };
  shelfTile: { current: [number, number] | null };
  shelfHover: (x: number, y: number) => void;
  dropShelf: (_item: ShelfItem, cancelled: boolean) => void;
}

export function useShelf(ed: Ed): ShelfSlice {
  const {
    api, info, mirror, renderer, ready, shelf, shelfOptions, turn, setPainted, setIcons, mounted, feel, firstDone,
    setFit, setShapeNote, indexed, infoRef, shelfRef, shelfOptionsRef, turnRef, needs, run, brushToolRef, pickShelf,
    ctx, startHereRef, startHere, pointerAt, notePointer, sourceAtTile, placeSource, startWorkerApi
  } = ed;

  /** The words beside the pointer (D322, pointerWords.ts): F's size first, then a word for a moment
   *  (a strength, a size), then the brush's own (its target). */
  const pointerWords = useRef<PointerWords | null>(null);
  pointerWords.current ??= new PointerWords(
    (text) => setShapeNote(text ? { text, ok: true, warn: false, ...pointerAt.current } : null),
    () => brushToolRef.current !== null,
  );
  /** A word beside the pointer for a moment (a strength, a size). */
  function flashNote(text: string, ev?: MouseEvent) {
    if (ev) {
      const box = renderer.current?.canvas.getBoundingClientRect();
      if (box) pointerAt.current = { x: ev.clientX - box.left, y: ev.clientY - box.top };
    }
    pointerWords.current!.flash(text);
  }

  // the footprint under the pointer: one check in flight, then the latest tile
  const shelfStartJob = useRef(0);
  /** The core's answer for the start on a cave or an overhang at a spot (D491), on the map's version then. */
  const startRoof = useRef<{ spot: string; version: number; problem: string | null } | null>(null);
  const fitWant = useRef<string | null>(null);
  const fitBusy = useRef(false);
  /** The worker's footprint check of an object at a spot, a request at a time (the latest wins). */
  function checkFit(req: ToolRequest, then: (f: { tiles: number[]; problem: string | null; level?: number }) => void) {
    const key = JSON.stringify(req);
    if (fitWant.current === key) return;
    fitWant.current = key;
    if (fitBusy.current) return;
    const next = (r: ToolRequest, k: string) => {
      fitBusy.current = true;
      void api
        .footprintCheck(r)
        .then((f) => {
          if (fitWant.current === k) then(f);
        })
        .catch(() => {
          shownFit.current = null;
          setFit(null);
        })
        .finally(() => {
          fitBusy.current = false;
          const want = fitWant.current;
          if (want && want !== k) next(JSON.parse(want) as ToolRequest, want);
        });
    };
    next(req, key);
  }
  /** The spot the fit on show belongs to and its problem, set with it: the page's copy of the fit
   *  (ed.fitRef) follows a render later, and the pointer's new tile has its own check in flight
   *  until the worker answers, so a click reads the problem only when it is the clicked spot's. */
  const shownFit = useRef<{ spot: string; problem: string | null } | null>(null);
  const spotOf = (item: ShelfItem, x: number, y: number, level?: number) => `${item.id}|${turnRef.current}|${x},${y}|${level ?? "top"}`;
  /** The problem of the shelf's object at (x, y) (at `level`: a cave's floor) as the latest check of that spot found,
   *  or null when no check of it is on show yet (the core checks the placement itself). */
  const problemAt = (item: ShelfItem, x: number, y: number, level?: number) => (shownFit.current?.spot === spotOf(item, x, y, level) ? shownFit.current.problem : null);
  /** The level the pointer aims at on its tile (D491): a cave's floor, the ground under a ledge; undefined on the
   *  tile's top. */
  const levelOf = (hit: TileHit | null) => aimOf(hit, info.W, mirror.current.heights, ed.columnsRef.current);
  useEffect(() => {
    fitWant.current = null;
    shownFit.current = null;
    setFit(null);
  }, [shelf, shelfOptions, turn, info.version]);

  // ------------------------------------------------------------------------------ the shelf

  /** Where the ghost stands, and the tile the pointer was last over (R turns it there). */
  const ghostAt = useRef<{ template: string; x: number; y: number; z: number; orientation: number } | null>(null);
  const shelfTile = useRef<[number, number] | null>(null);
  /** The generation's objects that keep a distance from the start, made once per map version, not per pointer move (core/doc/startFit.ts). */
  const fitExtras = useRef<{ version: number; extras: StartFitExtra[] } | null>(null);
  function startExtras(): StartFitExtra[] {
    if (fitExtras.current?.version !== info.version) fitExtras.current = { version: info.version, extras: startFitExtras(info.features, info.W, info.H, standingOfView(ctx().entities)) };
    return fitExtras.current.extras;
  }
  /** The level the pointer aimed at on that tile (D491: a cave's floor; undefined, the tile's top). */
  const shelfLevel = useRef<number | undefined>(undefined);
  /** The shelf's object over tile (x, y): its ghost there at once, then whether it fits (the
   *  worker's footprint check; the start's own check on the page), with the reason beside the
   *  pointer when it doesn't. `aim`: the level the pointer aims at (`levelOf`); without it, the
   *  level aimed at on that tile before (R turns it where it is). */
  function shelfHover(x: number, y: number, aim?: { level: number | undefined }) {
    const item = shelfRef.current;
    const r = renderer.current;
    if (!item || !r) return;
    // (what is painted is checked at the level aimed at too: the stroke plants on that floor, D491)
    const level = aim ? aim.level : shelfTile.current?.[0] === x && shelfTile.current[1] === y ? shelfLevel.current : undefined;
    const aimedBefore = shelfLevel.current;
    shelfTile.current = [x, y];
    shelfLevel.current = level;
    // (F held: the ring stays where it is, its size following the pointer)
    if (!ed.paintSizing.current) paintRing(x, y);
    const W = info.W;
    const h = mirror.current.heights;
    if (item.id === "start") {
      // (a map without a start, D323 item 44: the Start places one)
      const s = startHere ?? NO_START_HERE;
      const o = startTurned(s);
      const [cx, cy] = cornerFor(x, y, o);
      const door = startEntranceTile(cx, cy, o);
      const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
      // (aimed at a level under a roof the start has no bench, and the core's check answers alone: D342, D491)
      const bench = f && f.kind === "start" && level === undefined ? { level: Math.max(1, h[y * W + x]), radius: f.params.benchRadius } : null;
      const tiles = startTiles(x, y);
      const own = [...tiles, ...(door[0] >= 0 && door[1] >= 0 && door[0] < W && door[1] < info.H ? [door[1] * W + door[0]] : [])];
      const job = ++shelfStartJob.current;
      const spot = spotOf(item, x, y, level);
      // (on a cave or an overhang the core answers, once a spot: the start stays on open ground, D491)
      const roofed = level !== undefined || startRoofed(ed.columnsRef.current, W, info.H, x, y);
      const roof = roofed && startRoof.current?.spot === spot && startRoof.current.version === info.version ? startRoof.current.problem : null;
      const problem = level !== undefined ? roof : (startProblemAt(ctx(), x, y, door, bench, s.owner) ?? roof);
      shownFit.current = { spot, problem };
      // (it fits but the checks would flag it: amber with the first warning, and no "Move the start here", D361)
      const warning = problem ? null : (startFitWarnings(startExtras(), W, info.H, x, y)[0] ?? null);
      setFit({ tiles: own, problem, status: problem ? "blocked" : warning ? "warn" : "pending" });
      shelfWord(problem, warning);
      if (!problem && roofed) {
        const version = info.version;
        checkFit({ tool: "entity", template: "StartingLocation", x: cx, y: cy, orientation: o, ...(level !== undefined ? { z: level } : {}) }, (fit) => {
          startRoof.current = { spot, version, problem: fit.problem };
          // (the pointer still on this spot)
          const here = shelfTile.current;
          if (!mounted.current || shelfRef.current?.id !== "start" || !here || here[0] !== x || here[1] !== y || shelfLevel.current !== level) return;
          shownFit.current = { spot, problem: fit.problem };
          // (the core's answer is the whole check on a cave or an overhang: green as its ghost is)
          setFit({ tiles: own, problem: fit.problem, status: fit.problem ? "blocked" : warning ? "warn" : "ok" });
          shelfWord(fit.problem, warning);
          if (ghostAt.current) renderer.current?.setGhost({ ...ghostAt.current, ok: fit.problem ? false : warning ? "warn" : true });
        });
      } else if (!problem && mirror.current.water) {
        // (whether it meets the start requirements: the walks, in the start's own worker)
        const m = mirror.current;
        void startWorkerApi()
          .check({ W, H: info.H, heights: m.heights, water: m.water, entities: m.entities, river: indexed?.river ?? null, x, y, door, bench, self: s.owner, needs })
          .then((check) => {
            if (job !== shelfStartJob.current || !mounted.current || !shelfRef.current) return;
            shownFit.current = { spot, problem: check.problem };
            const status = check.problem || !warning ? startStatus(check) : "warn";
            setFit({ tiles: own, problem: check.problem, status });
            renderer.current?.setGhost({ ...ghostAt.current!, ok: GHOST_OK[status] });
          })
          .catch(() => undefined);
      }
      // (an opened map's start is levelled to the height most of its footprint stands at: D328)
      // (aimed at a cave's floor, it shows there)
      ghostAt.current = { template: "StartingLocation", x: cx, y: cy, z: level ?? (bench ? bench.level : modalLevel(own.map((i) => h[i]))), orientation: ORIENTATION_NAMES.indexOf(o) };
      r.setGhost({ ...ghostAt.current, ok: problem ? false : warning ? "warn" : null });
      return;
    }
    const template = templateOf(item, shelfOptionsRef.current);
    const o = ORIENTATION_NAMES[turnRef.current] as Orientation;
    const [cx, cy] = coordinatesAt(template, x, y, o);
    // a source stands on the ground in its middle (a badwater source is 3 × 3); an object is levelled
    // to the height most of its footprint stands at (D290, D328)
    // (aimed at a cave's floor or the ground under a ledge, it stands there, levelling nothing: D491)
    let z = level ?? (item.source ? h[y * W + x] : cx >= 0 && cy >= 0 && cx < W && cy < info.H ? h[cy * W + cx] : h[y * W + x]);
    if (!item.source && level === undefined) {
      const under: number[] = [];
      for (const [tx, ty] of footprintTiles(template, { template, x: cx, y: cy, z: 0, orientation: o, flipped: false })) if (tx >= 0 && ty >= 0 && tx < W && ty < info.H) under.push(h[ty * W + tx]);
      // (a water object is cut-only, D290: it stands at its lowest tile)
      if (under.length) z = FLUIDS[template]?.tiles ? Math.min(...under) : modalLevel(under);
    }
    const g = { template, x: cx, y: cy, z, orientation: turnRef.current };
    const same = ghostAt.current && ghostAt.current.template === template && ghostAt.current.x === cx && ghostAt.current.y === cy && ghostAt.current.orientation === g.orientation && aimedBefore === level;
    ghostAt.current = g;
    if (!same) r.setGhost({ ...g, ok: null });
    const at = level !== undefined ? { z: level } : {};
    checkFit(item.source ? { ...sourceAtTile(item.source === "bad", x, y), ...at } : { tool: "entity", template, x: cx, y: cy, orientation: o, ...at }, (f) => {
      // (put away while the worker was checking: nothing shows)
      if (!shelfRef.current) return;
      shownFit.current = { spot: spotOf(item, x, y, level), problem: f.problem };
      setFit(f);
      shelfWord(f.problem);
      const now = ghostAt.current;
      // (the worker knows the level the ground will be made: water beside it can raise it, D345 B6)
      if (now && f.level !== undefined) now.z = f.level;
      if (now && now.template === template && now.x === cx && now.y === cy && shelfLevel.current === level) renderer.current?.setGhost({ ...now, ok: !f.problem });
    });
  }
  /** The one label beside the pointer for the shelf's object (D323, item 32): the reason it can't
   *  stand there, or where it fits what the click does ("Move the start here", else "Place here").
   *  Nothing picked, no label. */
  function shelfWord(problem: string | null, warning: string | null = null) {
    const item = shelfRef.current;
    if (!item) return setShapeNote(null);
    // (a tree, bush or thorn has its ring: no "Place here" over it, only the reason it can't grow there)
    // (on ground where the plants would die: the ring is amber and says so, D235; still allowed)
    if (item.paint && !problem) return setShapeNote(dryRing.current ? { text: "dry ground: these will die", ok: true, warn: true, ...pointerAt.current } : null);
    if (!problem && warning) return setShapeNote({ text: warning, ok: true, warn: true, ...pointerAt.current });
    setShapeNote({ text: problem ? quietWord(problem) : item.id === "start" && startHereRef.current ? "Move the start here" : "Place here", ok: true, warn: !!problem, ...pointerAt.current });
  }
  /** The start's 3 × 3 tiles round its middle (x, y), on the map. */
  function startTiles(x: number, y: number): number[] {
    const tiles: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < info.W && y + dy < info.H) tiles.push((y + dy) * info.W + x + dx);
    return tiles;
  }
  /** The start's facing with the shelf's turns (R). */
  const startTurned = (s: StartHere): Orientation => ORIENTATION_NAMES[(ORIENTATION_NAMES.indexOf(s.orientation) + turnRef.current) % 4] as Orientation;
  /** A click with an object from the shelf: placed there, one step (the start moves there), with
   *  its pop; where it doesn't fit, the reason beside the pointer and nothing else. `level`: the
   *  level aimed at (a cave's floor, D491), which the placement names. */
  function placeShelf(x: number, y: number, aimed?: number) {
    const item = shelfRef.current;
    if (!item) return;
    const level = aimed;
    // (refused: the reason is beside the pointer already, once; a check of another spot (the tile the pointer was
    // over before, its own check still in flight) or left from the object held before is not this one's: the core
    // checks the placement itself)
    const own = ghostAt.current?.template === (item.id === "start" ? "StartingLocation" : templateOf(item, shelfOptionsRef.current));
    const problem = own ? problemAt(item, x, y, level) : null;
    if (problem) return shelfWord(problem);
    if (item.id === "start") {
      // (a map without a start, D323 item 44: the Start places one)
      const s = startHere ?? NO_START_HERE;
      const o = startTurned(s);
      const [cx, cy] = cornerFor(x, y, o);
      const move = () =>
        void run(
          // (the level aimed at under a roof; else the tile's top, which also brings a start out from under one: D491)
          () => api.moveStartTo(x, y, o, level ?? mirror.current.heights[y * info.W + x]),
          (u) => {
            if (!u.ok) return;
            feel("place", cx, cy, 1, false, "StartingLocation");
            // there is one start: it goes back on the shelf
            pickShelf(null);
          },
        );
      // (on a cave or an overhang the core's rule answers first, its check perhaps still on its way: the start stays
      // on open ground, D491)
      const roofed = level !== undefined || startRoofed(ed.columnsRef.current, info.W, info.H, x, y);
      if (!roofed) return move();
      void api.footprintCheck({ tool: "entity", template: "StartingLocation", x: cx, y: cy, orientation: o, ...(level !== undefined ? { z: level } : {}) }).then((f) => (f.problem ? shelfWord(f.problem) : move()));
      return;
    }
    if (item.source) return placeSource(item.source === "bad", x, y, level);
    // (Mixed woods has no object of its own: a click plants one of its mix there)
    if (item.paint === "woods") return plantShelf([y * info.W + x], 1, level);
    const template = templateOf(item, shelfOptionsRef.current);
    const o = ORIENTATION_NAMES[turnRef.current] as Orientation;
    const [cx, cy] = coordinatesAt(template, x, y, o);
    // (a water object, an unstable core or a reserve carries the options set in its window: the core writes them as the game does)
    const components = hasOptions(template) ? placeComponents(template, objectOptionsOf(shelfOptionsRef.current, template)) : undefined;
    void run(
      () => api.applyTool({ tool: "entity", template, x: cx, y: cy, orientation: o, ...(level !== undefined ? { z: level } : {}), ...(components ? { components } : {}) }, newId()),
      (u) => {
        if (!u.ok) return;
        feel("place", cx, cy, 1, false, template);
        firstDone("place");
      },
    );
  }
  /** An object dragged out of the shelf let go (D323, item 11): over the map it is placed where the
   *  pointer is, one step (its ghost showed where); anywhere else, or where it can't stand, nothing
   *  is placed, and either way placement is over: the reason for a moment where it was refused. */
  function dropShelf(_item: ShelfItem, cancelled: boolean) {
    // (Esc put it away during the drag: nothing to place)
    if (!shelfRef.current) return;
    // (the ground the shelf's ghost was on: the voxel pick's, a cave's floor too)
    const hit = cancelled ? null : (renderer.current?.hoverHit ? aimHit.current : null);
    if (!hit) return pickShelf(null);
    const level = levelOf(hit);
    const problem = problemAt(shelfRef.current, hit.x, hit.y, level);
    if (problem) {
      pickShelf(null);
      flashNote(quietWord(problem));
      return;
    }
    placeShelf(hit.x, hit.y, level);
    pickShelf(null);
  }
  /** Trees, bushes and thorns painted by a drag (D235): the core's stroke over the tiles the brush covered, at the
   *  object window's density (and a tree's age), planted where they can grow, one step, each with its pop. */
  function plantShelf(tiles: number[], density?: number, aimed?: number) {
    const item = shelfRef.current;
    if (!item?.paint || !tiles.length) return;
    const o = shelfOptionsRef.current;
    const kind = item.paint;
    const template = templateOf(item, o);
    const params: PaintParams = {
      kind,
      ...(kind === "thorns" || kind === "woods" ? {} : { template }),
      area: tilesToRuns(tiles, infoRef.current.W),
      density: density ?? o.paint[kind].density,
      ...(hasAge(kind) ? { age: o.treeAge } : {}),
      seed: paintSeed.current,
    };
    void run(
      // (a stroke begun on a cave's floor or under an overhang plants at that floor; the core refuses it where nothing fits: D491)
      () => api.paintAt(params, aimed),
      (u) => {
        const planted = (u as SessionUpdate & { planted?: number[] }).planted ?? [];
        if (!u.ok || !planted.length) return;
        const W = infoRef.current.W;
        feel("place", planted[0] % W, Math.floor(planted[0] / W), 1, false, template);
        renderer.current?.wiggle(planted);
        firstDone("place");
      },
    );
  }
  const paintSeed = useRef((Math.random() * 0x7fffffff) | 0);
  /** The brush's size as a ring round the pointer (the force ring's, the one calm ring), while a plant is held. */
  function paintRing(x: number, y: number) {
    const item = shelfRef.current;
    if (!item?.paint) return;
    const size = shelfOptionsRef.current.paint[item.paint].size;
    const warn = dryUnder(item, x, y, size / 2);
    renderer.current?.setForceRing({ x: x + 0.5, y: y + 0.5, r: Math.max(1, size / 2), ...(warn ? { warn } : {}) });
    // (the note follows the ring when it turns amber or back; a reason it can't grow there shows instead)
    if (warn !== dryRing.current) {
      dryRing.current = warn;
      if (!ed.paintSizing.current) shelfWord(problemAt(item, x, y, shelfLevel.current));
    }
  }
  /** Whether the held plant's ring is amber now: some tile it would plant on is soil it would die on. */
  const dryRing = useRef(false);
  /** Trees, bushes and mixed woods die on dry or contaminated ground (core/doc/plantSoil.ts); the soil the page shows,
   *  a held weather day's while one is on. */
  function dryUnder(item: ShelfItem, x: number, y: number, r: number): boolean {
    if (item.paint !== "trees" && item.paint !== "bushes" && item.paint !== "woods") return false;
    const m = mirror.current;
    const soil = m.daySoil ?? m.soil;
    if (!soil) return false;
    return dyingTiles(templateOf(item, shelfOptionsRef.current), paintDisc(x, y, r, info.W, info.H), { moisture: soil.moisture, contamination: soil.contamination, depth: m.water.depth }).length > 0;
  }
  // (the size changed in the object window: the ring takes it where the pointer last was)
  useEffect(() => {
    const at = ed.paintSizing.current?.tile ?? shelfTile.current;
    if (at) paintRing(at[0], at[1]);
  }, [shelfOptions]);
  /** The voxel pick's hit the shelf's tool last hovered (a drop from the shelf lands there). */
  const aimHit = useRef<TileHit | null>(null);
  const shelfCalls = useRef({ shelfHover, placeShelf, plantShelf });
  shelfCalls.current = { shelfHover, placeShelf, plantShelf };
  // the shelf's object takes the map's left button while it is picked (at once, when the pick is drawn: a click
  // straight after picking must not reach the tool held before)
  useLayoutEffect(() => {
    const r = renderer.current;
    if (!r || !shelf) return;
    const W = info.W;
    const H = info.H;
    const t = shelfTool({
      W,
      H,
      hover: (hit, ev) => {
        notePointer(ev);
        aimHit.current = hit;
        if (!hit) {
          r.setGhost(null);
          r.setForceRing(null);
          dryRing.current = false;
          ghostAt.current = null;
          fitWant.current = null;
          shownFit.current = null;
          setFit(null);
          setShapeNote(null);
          return;
        }
        shelfCalls.current.shelfHover(hit.x, hit.y, { level: levelOf(hit) });
      },
      place: (x, y, hit) => shelfCalls.current.placeShelf(x, y, hit && hit.x === x && hit.y === y ? levelOf(hit) : undefined),
      paintAround: (x, y) => {
        const it = shelfRef.current;
        return it?.paint ? paintDisc(x, y, shelfOptionsRef.current.paint[it.paint].size / 2, W, H) : null;
      },
      painting: (tiles) => {
        setPainted(tiles);
        if (!tiles) paintSeed.current = (Math.random() * 0x7fffffff) | 0;
      },
      plant: (tiles, hit) => shelfCalls.current.plantShelf(tiles, undefined, hit ? levelOf(hit) : undefined),
    });
    r.tool = t;
    // (the pointer resting on the map: the ghost shows there at once, on the tile's top until the pointer moves)
    aimHit.current = r.hoverHit;
    if (r.hoverHit) shelfCalls.current.shelfHover(r.hoverHit.x, r.hoverHit.y, { level: undefined });
    return () => {
      if (r.tool === t) r.tool = null;
      r.setGhost(null);
      r.setForceRing(null);
      dryRing.current = false;
      ghostAt.current = null;
    };
  }, [shelf, ready, info.W, info.H]);
  // a right-click on the map (not a right-drag: that is the camera) puts the picked object away (D323)
  useEffect(() => {
    const c = renderer.current?.canvas;
    if (!c) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = e.button === 2 ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (e.button !== 2 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 4) return;
      if (shelfRef.current) pickShelf(null);
    };
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointerup", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointerup", onUp);
    };
  }, [ready]);
  // the shelf's icons: those of the map before are shown at once, and each object is drawn again by the view, when the
  // page is idle (the pictures never go blank between maps)
  useLayoutEffect(() => {
    const kept = shelfIcons();
    if (Object.keys(kept).length) setIcons((m) => ({ ...kept, ...m }));
  }, []);
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    let live = true;
    const templates = [...new Set(SHELF.map((it) => it.template))];
    const draw = (k: number) => {
      if (!live || k >= templates.length) return;
      const url = r.thumbnail(templates[k]);
      if (url) {
        rememberShelfIcon(templates[k], url);
        setIcons((m) => ({ ...m, [templates[k]]: url }));
      }
      if (k + 1 === templates.length) void composePictures(r);
      const idle = typeof window.requestIdleCallback === "function" ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: 500 }) : (fn: () => void) => window.setTimeout(fn, 30);
      idle(() => draw(k + 1));
    };
    draw(0);
    return () => {
      live = false;
    };
  }, [ready]);

  /** The pictures made of other pictures (Mixed woods: a pine, a birch and an oak side by side), once theirs are drawn. */
  async function composePictures(r: NonNullable<typeof renderer.current>) {
    for (const it of SHELF) {
      if (!it.picture) continue;
      const urls = it.picture.map((t) => r.thumbnail(t));
      if (urls.some((u) => !u)) continue;
      const imgs = await Promise.all(urls.map((u) => new Promise<HTMLImageElement>((ok, no) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = no;
        im.src = u!;
      })));
      const c = document.createElement("canvas");
      c.width = 56;
      c.height = 56;
      const g = c.getContext("2d");
      if (!g) continue;
      // (each at 0.62 of its size, the middle one in front, so they read as one grove)
      const w = 56 * 0.62;
      const at = [0, (56 - w) / 2, 56 - w];
      const top = [56 - w - 2, 56 - w - 8, 56 - w - 2];
      [0, 2, 1].forEach((k) => g.drawImage(imgs[k], at[k], top[k], w, w));
      // (kept like the rest, so the next map's shelf shows it at once)
      const url = c.toDataURL("image/png");
      rememberShelfIcon(it.id, url);
      setIcons((m) => ({ ...m, [it.id]: url }));
    }
  }
  return { pointerWords, flashNote, fitWant, ghostAt, shelfTile, shelfHover, dropShelf };
}
