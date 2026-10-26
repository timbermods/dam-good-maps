// The start: moving it, its footprint check and the reach it shows.

import { useRef, useState } from "preact/hooks";
import { cornerFor } from "../../core/doc/tools";
import { startEntranceTile } from "../../core/format/footprints";
import type { Point } from "../../core/features/schema";
import { ORIENTATION_NAMES } from "../../render3d/model";
import type { PointerTool, TileHit } from "../../render3d";
import { checkStartAt, roofStartCheck, sameStartCheck, startDragStatus, type StartCheck, type StartDrag } from "../features";
import { standingOfView, startFitExtras, startFitWarnings, type StartFitExtra } from "../../core/doc/startFit";
import { GHOST_OK } from "../tools";
import { quietWord } from "../shelfItems";
import type { Ed } from "../ed";
import { aimOf, startRoofed } from "../shelf/aim";

export interface StartSlice {
  startReach: { check: StartCheck; fading: boolean } | null;
  hoverStart: (on: boolean) => void;
  startGrab: { current: { cancel(): void } | null };
  grabObjectRef: { current: (hit: TileHit | null, pick?: boolean) => PointerTool | null };
  startCalls: { current: { grabStart: (hit: TileHit | null) => PointerTool | null } };
}

export function useStart(ed: Ed): StartSlice {
  const {
    api, info, mirror, renderer, setStartDrag, feel, indexed, infoRef, shelfRef, needs, run, brushToolRef, ctx,
    startHere, grabObject, startWorkerApi, toolRef
  } = ed;

  // ------------------------------------------------------------------------------ the start

  /** The start's footprint check at a move of (dx, dy) tiles. */
  /** The objects that keep a distance from the start, made once per map version (core/doc/startFit.ts). */
  const fitExtras = useRef<{ version: number; extras: StartFitExtra[] } | null>(null);
  function startPreview(dx: number, dy: number, level?: number): StartDrag | null {
    const s = startHere;
    if (!s) return null;
    const x = s.x + dx;
    const y = s.y + dy;
    const [cx, cy] = cornerFor(x, y, s.orientation);
    const door = startEntranceTile(cx, cy, s.orientation);
    const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
    let bench: { level: number; radius: number; bank?: Point } | null = null;
    const moved = dx !== 0 || dy !== 0;
    // (aimed at a level under a roof it has no bench: the core's check answers there, D342, D491)
    if (f && f.kind === "start" && level === undefined) {
      // a generated start's bench takes the ground's level there; where it stands, it keeps the
      // bench it has (a project saved before the water rule changed may run it to a bank)
      const level = moved ? Math.max(1, mirror.current.heights[y * info.W + x]) : f.params.benchLevel;
      const bank = moved ? undefined : f.params.bank;
      bench = { level, radius: f.params.benchRadius, ...(bank ? { bank } : {}) };
    }
    // (the page's own check and walks read the roof's top, not the floor aimed at: no figures, the core's line follows, below)
    const check = level !== undefined ? roofStartCheck(info.W, x, y, door, null) : checkStartAt(ctx(), x, y, door, bench, s.owner, needs);
    // (it fits but the checks would flag the spot: amber with the first warning, as the shelf's preview shows it)
    let warning: string | null = null;
    if (!check.problem) {
      if (fitExtras.current?.version !== info.version) fitExtras.current = { version: info.version, extras: startFitExtras(info.features, info.W, info.H, standingOfView(ctx().entities)) };
      warning = startFitWarnings(fitExtras.current.extras, info.W, info.H, x, y)[0] ?? null;
    }
    return { x, y, check, warning };
  }

  /** The start's reach (D184): its three requirements where it stands, shown while the pointer is on
   *  it (no tool out), then fading; the walks run in the start's own worker, once per version. */
  const [startReach, setStartReach] = useState<{ check: StartCheck; fading: boolean } | null>(null);
  const reachCache = useRef<{ version: number; check: Promise<StartCheck> } | null>(null);
  const reachFade = useRef(0);
  /** The pointer is on the start (its reach shows when the walks come back). */
  const reachWanted = useRef(false);
  function hoverStart(on: boolean) {
    reachWanted.current = on;
    if (!on) {
      if (!startReach || startReach.fading) return;
      setStartReach((r) => (r ? { ...r, fading: true } : r));
      reachFade.current = window.setTimeout(() => setStartReach(null), 700);
      return;
    }
    clearTimeout(reachFade.current);
    const s = startHere;
    const m = mirror.current;
    // (under a roof the core's verdict needs no water, the walks do)
    if (!s || (!m.water && s.z === undefined)) return;
    if (!reachCache.current || reachCache.current.version !== info.version) {
      const [cx, cy] = cornerFor(s.x, s.y, s.orientation);
      const door = startEntranceTile(cx, cy, s.orientation);
      const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
      const bench = f && f.kind === "start" ? { level: f.params.benchLevel, radius: f.params.benchRadius, ...(f.params.bank ? { bank: f.params.bank } : {}) } : null;
      // (under a roof the core's verdict alone, at its level, with no figures: D491)
      if (s.z !== undefined) {
        const z = s.z;
        reachCache.current = { version: info.version, check: api.footprintCheck({ tool: "entity", template: "StartingLocation", x: cx, y: cy, orientation: s.orientation, z }).then((fit) => roofStartCheck(info.W, s.x, s.y, door, fit.problem)) };
      } else {
        reachCache.current = { version: info.version, check: startWorkerApi().check({ W: info.W, H: info.H, heights: m.heights, water: m.water!, entities: m.entities, river: indexed?.river ?? null, x: s.x, y: s.y, door, bench, self: s.owner, needs }) };
      }
    }
    const v = info.version;
    void reachCache.current.check.then((check) => {
      // (the same answer again changes nothing: the placed start keeps its colour until something about it changes, D361)
      if (infoRef.current.version === v && reachWanted.current) setStartReach((r) => (r && !r.fading && sameStartCheck(r.check, check) ? r : { check, fading: false }));
    });
  }

  /** Why the core keeps the start off a cave or an overhang at (x, y) (D491: the start stays on open ground; `level`, a
   *  cave's floor aimed at), or null where its 3 × 3 tiles are open ground and the page's own check answers. */
  function roofProblem(x: number, y: number, level: number | undefined): Promise<string | null> | null {
    const s = startHere;
    if (!s) return null;
    if (level === undefined && !startRoofed(ed.columnsRef.current, info.W, info.H, x, y)) return null;
    const [cx, cy] = cornerFor(x, y, s.orientation);
    return api.footprintCheck({ tool: "entity", template: "StartingLocation", x: cx, y: cy, orientation: s.orientation, ...(level !== undefined ? { z: level } : {}) }).then((f) => f.problem);
  }

  /** The start dragged on the map (no tool out): its footprint and the start's requirements follow
   *  the pointer, the drop moves it (one step); Esc puts it back. It aims at the ground seen (a cave's
   *  floor too), where the core's rule answers. */
  const startGrab = useRef<{ cancel(): void } | null>(null);
  function grabStart(hit: TileHit | null): PointerTool | null {
    const s = startHere;
    // (a force picked takes the map's clicks, the start's ground too: D257)
    if (!hit || !s || brushToolRef.current || shelfRef.current || toolRef.current || ed.blockRef.current) return null;
    if (Math.max(Math.abs(hit.x - s.x), Math.abs(hit.y - s.y)) > 1) return null;
    const from: [number, number] = [hit.x, hit.y];
    let d: [number, number] = [0, 0];
    /** The level aimed at where it goes (a cave's floor; undefined, the tile's top). */
    let level: number | undefined;
    let done = false;
    const W = info.W;
    const H = info.H;
    const canvas = renderer.current?.canvas;
    if (canvas) canvas.style.cursor = "grabbing";
    // (the reach while it stood: the drag shows the reach where it goes)
    clearTimeout(reachFade.current);
    reachWanted.current = false;
    setStartReach(null);
    const end = () => {
      done = true;
      startGrab.current = null;
      setStartDrag(null);
      renderer.current?.setGhost(null);
      if (canvas) canvas.style.cursor = "";
    };
    startGrab.current = { cancel: end };
    return {
      down: () => true,
      move(h) {
        if (!h || done) return;
        const dx = Math.max(2 - s.x, Math.min(W - 3 - s.x, h.x - from[0]));
        const dy = Math.max(2 - s.y, Math.min(H - 3 - s.y, h.y - from[1]));
        const aimed = h.x - from[0] === dx && h.y - from[1] === dy ? aimOf(h, W, mirror.current.heights, ed.columnsRef.current) : undefined;
        if (dx === d[0] && dy === d[1] && aimed === level) return;
        d = [dx, dy];
        level = aimed;
        const p = startPreview(dx, dy, level);
        setStartDrag(p);
        if (p) {
          const [cx, cy] = cornerFor(p.x, p.y, s.orientation);
          const ghost = { template: "StartingLocation", x: cx, y: cy, z: level ?? mirror.current.heights[p.y * W + p.x], orientation: ORIENTATION_NAMES.indexOf(s.orientation) };
          renderer.current?.setGhost({ ...ghost, ok: GHOST_OK[startDragStatus(p)] });
          // (on a cave or an overhang, the core's one line: the start stays on open ground, D491)
          const at: [number, number] = [...d];
          const aimedAt = level;
          void roofProblem(p.x, p.y, level)?.then((problem) => {
            if (done || !problem || at[0] !== d[0] || at[1] !== d[1] || aimedAt !== level) return;
            setStartDrag({ ...p, check: { ...p.check, problem } });
            renderer.current?.setGhost({ ...ghost, ok: false });
          });
        }
      },
      up() {
        if (done) return;
        end();
        if (!d[0] && !d[1]) return;
        const [x, y] = [s.x + d[0], s.y + d[1]];
        const move = () =>
          void run(
            // (the level aimed at under a roof; else the tile's top, which also brings a start out from under one: D491)
            () => api.moveStartTo(x, y, undefined, level ?? mirror.current.heights[y * info.W + x]),
            (u) => {
              if (!u.ok) return;
              const [cx, cy] = cornerFor(x, y, s.orientation);
              feel("place", cx, cy);
            },
          );
        const roofed = roofProblem(x, y, level);
        if (!roofed) return move();
        void roofed.then((problem) => (problem ? ed.flashNote(quietWord(problem)) : move()));
      },
      cancel: end,
      voxel: true,
    };
  }
  const grabObjectRef = useRef(grabObject);
  grabObjectRef.current = grabObject;
  const startCalls = useRef({ grabStart });
  startCalls.current = { grabStart };

  return { startReach, hoverStart, startGrab, grabObjectRef, startCalls };
}
