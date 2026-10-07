// The words beside the pointer, the footprint check, and the shelf: the ghost under the pointer,
// placing, dropping and painting the picked object.

import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { cornerFor } from "../../core/doc/tools";
import { footprintTiles, startEntranceTile, type Orientation } from "../../core/format/footprints";
import { ORIENTATION_NAMES } from "../../render3d/model";
import type { SessionUpdate, ToolRequest } from "../../worker/session";
import { startProblemAt, newId, startStatus } from "../features";
import { modalLevel } from "../../core/features/footprintLevel";
import { paintTiles, quietWord, SHELF, templateOf, type ShelfItem } from "../shelfItems";
import { shelfTool } from "../placeTools";
import { PointerWords } from "../pointerWords";
import { GHOST_OK, coordinatesAt } from "../tools";
import { NO_START_HERE, type StartHere } from "../start/startHere";
import type { Ed } from "../ed";

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
        .catch(() => setFit(null))
        .finally(() => {
          fitBusy.current = false;
          const want = fitWant.current;
          if (want && want !== k) next(JSON.parse(want) as ToolRequest, want);
        });
    };
    next(req, key);
  }
  useEffect(() => {
    fitWant.current = null;
    setFit(null);
  }, [shelf, shelfOptions, turn, info.version]);

  // ------------------------------------------------------------------------------ the shelf

  /** Where the ghost stands, and the tile the pointer was last over (R turns it there). */
  const ghostAt = useRef<{ template: string; x: number; y: number; z: number; orientation: number } | null>(null);
  const shelfTile = useRef<[number, number] | null>(null);
  /** The shelf's object over tile (x, y): its ghost there at once, then whether it fits (the
   *  worker's footprint check; the start's own check on the page), with the reason beside the
   *  pointer when it doesn't. */
  function shelfHover(x: number, y: number) {
    const item = shelfRef.current;
    const r = renderer.current;
    if (!item || !r) return;
    shelfTile.current = [x, y];
    const W = info.W;
    const h = mirror.current.heights;
    if (item.id === "start") {
      // (a map without a start, D323 item 44: the Start places one)
      const s = startHere ?? NO_START_HERE;
      const o = startTurned(s);
      const [cx, cy] = cornerFor(x, y, o);
      const door = startEntranceTile(cx, cy, o);
      const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
      const bench = f && f.kind === "start" ? { level: Math.max(1, h[y * W + x]), radius: f.params.benchRadius } : null;
      const problem = startProblemAt(ctx(), x, y, door, bench, s.owner);
      const tiles: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < info.H) tiles.push((y + dy) * W + x + dx);
      const own = [...tiles, ...(door[0] >= 0 && door[1] >= 0 && door[0] < W && door[1] < info.H ? [door[1] * W + door[0]] : [])];
      const job = ++shelfStartJob.current;
      setFit({ tiles: own, problem, status: problem ? "blocked" : "pending" });
      shelfWord(problem);
      if (!problem && mirror.current.water) {
        // (whether it meets the start requirements: the walks, in the start's own worker)
        const m = mirror.current;
        void startWorkerApi()
          .check({ W, H: info.H, heights: m.heights, water: m.water, entities: m.entities, river: indexed?.river ?? null, x, y, door, bench, self: s.owner, needs })
          .then((check) => {
            if (job !== shelfStartJob.current || !mounted.current || !shelfRef.current) return;
            setFit({ tiles: own, problem: check.problem, status: startStatus(check) });
            renderer.current?.setGhost({ ...ghostAt.current!, ok: GHOST_OK[startStatus(check)] });
          })
          .catch(() => undefined);
      }
      // (an opened map's start is levelled to the height most of its footprint stands at: D328)
      ghostAt.current = { template: "StartingLocation", x: cx, y: cy, z: bench ? bench.level : modalLevel(own.map((i) => h[i])), orientation: ORIENTATION_NAMES.indexOf(o) };
      r.setGhost({ ...ghostAt.current, ok: problem ? false : null });
      return;
    }
    const template = templateOf(item, shelfOptionsRef.current);
    const o = ORIENTATION_NAMES[turnRef.current] as Orientation;
    const [cx, cy] = coordinatesAt(template, x, y, o);
    // a source stands on the ground in its middle (a badwater source is 3 × 3); an object is levelled
    // to the height most of its footprint stands at (D290, D328)
    let z = item.source ? h[y * W + x] : cx >= 0 && cy >= 0 && cx < W && cy < info.H ? h[cy * W + cx] : h[y * W + x];
    if (!item.source) {
      const under: number[] = [];
      for (const [tx, ty] of footprintTiles(template, { template, x: cx, y: cy, z: 0, orientation: o, flipped: false })) if (tx >= 0 && ty >= 0 && tx < W && ty < info.H) under.push(h[ty * W + tx]);
      if (under.length) z = modalLevel(under);
    }
    const g = { template, x: cx, y: cy, z, orientation: turnRef.current };
    const same = ghostAt.current && ghostAt.current.template === template && ghostAt.current.x === cx && ghostAt.current.y === cy && ghostAt.current.orientation === g.orientation;
    ghostAt.current = g;
    if (!same) r.setGhost({ ...g, ok: null });
    checkFit(item.source ? sourceAtTile(item.source === "bad", x, y) : { tool: "entity", template, x: cx, y: cy, orientation: o }, (f) => {
      // (put away while the worker was checking: nothing shows)
      if (!shelfRef.current) return;
      setFit(f);
      shelfWord(f.problem);
      const now = ghostAt.current;
      // (the worker knows the level the ground will be made: water beside it can raise it, D345 B6)
      if (now && f.level !== undefined) now.z = f.level;
      if (now && now.template === template && now.x === cx && now.y === cy) renderer.current?.setGhost({ ...now, ok: !f.problem });
    });
  }
  /** The one label beside the pointer for the shelf's object (D323, item 32): the reason it can't
   *  stand there, or where it fits what the click does ("Move the start here", else "Place here").
   *  Nothing picked, no label. */
  function shelfWord(problem: string | null) {
    const item = shelfRef.current;
    if (!item) return setShapeNote(null);
    setShapeNote({ text: problem ? quietWord(problem) : item.id === "start" && startHereRef.current ? "Move the start here" : "Place here", ok: true, warn: !!problem, ...pointerAt.current });
  }
  /** The start's facing with the shelf's turns (R). */
  const startTurned = (s: StartHere): Orientation => ORIENTATION_NAMES[(ORIENTATION_NAMES.indexOf(s.orientation) + turnRef.current) % 4] as Orientation;
  /** A click with an object from the shelf: placed there, one step (the start moves there), with
   *  its pop; where it doesn't fit, the reason beside the pointer and nothing else. */
  function placeShelf(x: number, y: number) {
    const item = shelfRef.current;
    if (!item) return;
    // (refused: the reason is beside the pointer already, once; a check left from the object held before, not yet
    // cleared, is not this one's: the core checks the placement itself)
    const own = ghostAt.current?.template === (item.id === "start" ? "StartingLocation" : templateOf(item, shelfOptionsRef.current));
    const f = own ? ed.fitRef.current : null;
    if (f?.problem) return shelfWord(f.problem);
    if (item.id === "start") {
      // (a map without a start, D323 item 44: the Start places one)
      const s = startHere ?? NO_START_HERE;
      const o = startTurned(s);
      const [cx, cy] = cornerFor(x, y, o);
      void run(
        () => api.moveStartTo(x, y, o),
        (u) => {
          if (!u.ok) return;
          feel("place", cx, cy, 1, false, "StartingLocation");
          // there is one start: it goes back on the shelf
          pickShelf(null);
        },
      );
      return;
    }
    if (item.source) return placeSource(item.source === "bad", x, y);
    const template = templateOf(item, shelfOptionsRef.current);
    const o = ORIENTATION_NAMES[turnRef.current] as Orientation;
    const [cx, cy] = coordinatesAt(template, x, y, o);
    void run(
      () => api.applyTool({ tool: "entity", template, x: cx, y: cy, orientation: o }, newId()),
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
    const hit = cancelled ? null : (renderer.current?.hoverHit ?? null);
    if (!hit) return pickShelf(null);
    const at = shelfTile.current;
    const problem = at && at[0] === hit.x && at[1] === hit.y ? (ed.fitRef.current?.problem ?? null) : null;
    if (problem) {
      pickShelf(null);
      flashNote(quietWord(problem));
      return;
    }
    placeShelf(hit.x, hit.y);
    pickShelf(null);
  }
  /** Trees and bushes painted by a drag: planted where they can grow, one step, each with its pop. */
  function plantShelf(tiles: number[]) {
    const item = shelfRef.current;
    if (!item || !tiles.length) return;
    const template = templateOf(item, shelfOptionsRef.current);
    void run(
      () => api.plantAt(template, tiles),
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
        if (!hit) {
          r.setGhost(null);
          ghostAt.current = null;
          fitWant.current = null;
          setFit(null);
          setShapeNote(null);
          return;
        }
        shelfCalls.current.shelfHover(hit.x, hit.y);
      },
      place: (x, y) => shelfCalls.current.placeShelf(x, y),
      paintAround: (x, y) => {
        const it = shelfRef.current;
        return it?.fill ? paintTiles(x, y, 2, it.fill, paintSeed.current, W, H) : null;
      },
      painting: (tiles) => {
        setPainted(tiles);
        if (!tiles) paintSeed.current = (Math.random() * 0x7fffffff) | 0;
      },
      plant: (tiles) => shelfCalls.current.plantShelf(tiles),
    });
    r.tool = t;
    // (the pointer resting on the map: the ghost shows there at once)
    if (r.hoverHit) shelfCalls.current.shelfHover(r.hoverHit.x, r.hoverHit.y);
    return () => {
      if (r.tool === t) r.tool = null;
      r.setGhost(null);
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
  // the shelf's icons: each object drawn once by the view, when the page is idle
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    let live = true;
    const templates = [...new Set(SHELF.map((it) => it.template))];
    const draw = (k: number) => {
      if (!live || k >= templates.length) return;
      const url = r.thumbnail(templates[k]);
      if (url) setIcons((m) => ({ ...m, [templates[k]]: url }));
      const idle = typeof window.requestIdleCallback === "function" ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: 500 }) : (fn: () => void) => window.setTimeout(fn, 30);
      idle(() => draw(k + 1));
    };
    draw(0);
    return () => {
      live = false;
    };
  }, [ready]);

  return { pointerWords, flashNote, fitWant, ghostAt, shelfTile, shelfHover, dropShelf };
}
