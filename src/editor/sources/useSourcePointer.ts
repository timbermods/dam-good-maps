// The pointer and the water sources: placing one, picking one up (or another object) to move it,
// and the wheel that sets a source's strength.

import { useRef, useState } from "preact/hooks";
import type { EditOp } from "../../core/doc/ops";
import { footprintTiles, type Orientation } from "../../core/format/footprints";
import { FLIPPED, ORIENTATION_NAMES } from "../../render3d/model";
import type { PointerTool, TileHit } from "../../render3d";
import type { EntityInfo } from "../../worker/session";
import { newId, sourceStrengths, sourceStrengthWords, strengthKey, strengthReader } from "../features";
import { isPickable, pickWinner } from "../../core/features/objects";
import { OFFICIAL_FLOW } from "../../core/gen/calibrated";
import { BADWATER_STRENGTHS, SOURCE_STRENGTHS, sourceRequest } from "../tools";
import type { EntityRequest } from "../../core/doc/placing";
import type { Ed } from "../ed";

export interface SourcePointerSlice {
  pointerAt: { current: { x: number; y: number } };
  notePointer: (ev: { clientX: number; clientY: number }) => void;
  sourceAtTile: (bad: boolean, x: number, y: number) => { tool: "entity" } & EntityRequest;
  placeSource: (bad: boolean, x: number, y: number) => void;
  sourceInfo: (x: number, y: number) => Promise<EntityInfo | null>;
  /** The objects on a tile (the page's own copy, else the worker's). */
  entitiesOn: (x: number, y: number) => Promise<EntityInfo[]>;
  sourceGrab: { current: { cancel(): void } | null };
  grabSource: (hit: TileHit | null, ev?: PointerEvent) => PointerTool | null;
  objectUnder: (x: number, y: number) => number | undefined;
  objectTiles: (k: number) => number[];
  grabObject: (hit: TileHit | null, pick?: boolean) => PointerTool | null;
  strengthTick: number;
  strengthOfEntity: (k: number) => number;
  liveStrength: (e: { x: number; y: number }, v: number | null) => void;
  entityIndexOf: (e: { template: string; x: number; y: number }) => number;
  wheelSource: (ev: WheelEvent, hit: TileHit | null) => boolean;
}

export function useSourcePointer(ed: Ed): SourcePointerSlice {
  const {
    api, mirror, renderer, selectingRef, selection, setSourceDrag, feel, firstDone, setPicked, setPickedObject,
    pickedRef, setShapeNote, infoRef, shelfRef, optionsRef, enqueue, run, brushToolRef, pickShelf, targetAt,
    sourceOnScreen
  } = ed;

  // ------------------------------------------------------------------------------ the pointer

  /** Where the pointer is, for the words beside it (flatten's level, a source's strength). */
  const pointerAt = useRef({ x: 0, y: 0 });

  /** Where the pointer is over the map, for the words beside it. */
  function notePointer(ev: { clientX: number; clientY: number }) {
    const box = renderer.current?.canvas.getBoundingClientRect();
    if (box) pointerAt.current = { x: ev.clientX - box.left, y: ev.clientY - box.top };
  }

  // ---------------------------------------------------------------------------- water sources

  /** The source the shelf's Water source or Badwater source places at tile (x, y), at the strength
   *  its options row sets. */
  const sourceAtTile = (bad: boolean, x: number, y: number) => sourceRequest({ ...optionsRef.current, sourceBad: bad }, x, y);
  /** A water or badwater source placed with a click from the shelf (D212): its water spreads at once
   *  (live editing), one undo step. Sources go anywhere in the editor (D184). */
  function placeSource(bad: boolean, x: number, y: number) {
    const req = sourceAtTile(bad, x, y);
    void run(
      () => api.applyTool(req, newId()),
      (u) => {
        if (!u.ok) return;
        feel("source", x, y, 1, false, bad ? "badwater" : undefined);
        firstDone("water");
      },
    );
  }

  /** The objects on a tile from the page's own copy (each carries its id, #200), found by their footprints as the
   *  worker's entitiesAt finds them, so selecting never waits on the worker; null where an object has no id (the
   *  worker answers then). */
  function entitiesHere(x: number, y: number): EntityInfo[] | null {
    const e = mirror.current.entities;
    const out: EntityInfo[] = [];
    for (const k of ed.coverAt().get(y * infoRef.current.W + x) ?? []) {
      const id = e.ids?.[k];
      if (!id) return null;
      const template = e.templates[e.template[k]];
      const source = template === "WaterSource" || template === "BadwaterSource";
      out.push({
        id,
        template,
        x: e.x[k],
        y: e.y[k],
        z: e.z[k],
        orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation,
        flipped: (e.flags[k] & FLIPPED) !== 0,
        from: "",
        components: source ? { WaterSource: { SpecifiedStrength: e.strength[k] } } : {},
      });
    }
    return out;
  }
  /** The objects on a tile: the page's own copy, else the worker's. */
  function entitiesOn(x: number, y: number): Promise<EntityInfo[]> {
    const here = entitiesHere(x, y);
    return here ? Promise.resolve(here) : enqueue(() => api.entitiesAt(x, y));
  }
  /** The source's own record (its id, place and strength). */
  function sourceInfo(x: number, y: number): Promise<EntityInfo | null> {
    return entitiesOn(x, y).then((list) => list.find((e) => e.template === "WaterSource" || e.template === "BadwaterSource") ?? null);
  }

  /** A source dragged somewhere else (D184): its footprint follows the pointer, and the drop is one
   *  undo step; a click without a drag selects it; Esc puts it back. Brushes paint over sources;
   *  with a source picked on the shelf, a press on a placed one still grabs it. */
  const sourceGrab = useRef<{ cancel(): void } | null>(null);
  function grabSource(hit: TileHit | null, ev?: PointerEvent): PointerTool | null {
    // (a force picked takes the map's clicks, a source's too: D257)
    if (!hit || brushToolRef.current || (shelfRef.current && !shelfRef.current.source) || ed.toolRef.current) return null;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    // with nothing picked, a source within about two tiles is the one pressed (D249); with the
    // shelf's source, a press on a placed one (a new one can go right beside it)
    const free = !shelfRef.current && !ed.toolRef.current;
    const spot = free ? targetAt(hit.x, hit.y) : null;
    const src = spot ? { x: spot.x, y: spot.y, bad: spot.bad, tiles: spot.tiles.map((i): [number, number] => [i % W, Math.floor(i / W)]) } : sourceOnScreen(hit, ev?.clientX ?? -1e6, ev?.clientY ?? -1e6);
    if (!src) return null;
    const from: [number, number] = [hit.x, hit.y];
    let to = from;
    let done = false;
    const record = sourceInfo(src.x, src.y);
    const canvas = renderer.current?.canvas;
    if (canvas) canvas.style.cursor = "grabbing";
    const end = () => {
      done = true;
      sourceGrab.current = null;
      setSourceDrag(null);
      if (canvas) canvas.style.cursor = "";
    };
    sourceGrab.current = { cancel: end };
    return {
      down: () => true,
      move(h) {
        if (!h || done) return;
        to = [h.x, h.y];
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        setSourceDrag(dx || dy ? src.tiles.map(([x, y]) => [x + dx, y + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x) : null);
      },
      up() {
        if (done) return;
        end();
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        if (!dx && !dy) {
          // a click selects it (its strength in the row); the shelf's source goes back
          if (shelfRef.current?.source) pickShelf(null);
          return ed.pickTile(src.x, src.y);
        }
        void record.then((e) => {
          if (!e) return;
          const name = e.template === "BadwaterSource" ? "badwater source" : "water source";
          // (a badwater source cuts its own spring pool where it lands on uneven ground, D290)
          void run(() => api.applyAll([{ op: "moveEntity", params: { id: e.id, x: e.x + dx, y: e.y + dy } }], `Move a ${name}`));
        });
      },
      cancel: end,
    };
  }

  /** An object pressed with the plain pointer (D345, B7): a click picks it (its name and Delete in the
   *  row), a drag moves it, the drop is one step with its ground levelled as a placement's is; Esc
   *  puts it back. Only with no tool out. */
  const objectGrab = useRef<{ cancel(): void } | null>(null);
  /** The object the plain pointer would pick on tile (x, y) (D360 a): of those standing there that can be
   *  picked, the bigger one wins over a tree or a bush. Its index in the page's objects. */
  function objectUnder(x: number, y: number): number | undefined {
    const e = mirror.current.entities;
    const here = (ed.coverAt().get(y * infoRef.current.W + x) ?? []).filter((j) => isPickable(e.templates[e.template[j]]));
    return here.length ? here[pickWinner(here.map((j) => e.templates[e.template[j]]))] : undefined;
  }
  /** An object's tiles. */
  function objectTiles(k: number): number[] {
    const e = mirror.current.entities;
    const W = infoRef.current.W;
    const template = e.templates[e.template[k]];
    return footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 })
      .filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < infoRef.current.H)
      .map(([x, y]) => y * W + x);
  }
  /** A press on an object. With Select in hand a drag on the land marks an area, so a press grabs only the
   *  object already picked (it moves it); `pick`: the press is Select's plain click, which picks it. */
  function grabObject(hit: TileHit | null, pick = false): PointerTool | null {
    if (!hit || brushToolRef.current || shelfRef.current || ed.toolRef.current || selection.current.count) return null;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const e = mirror.current.entities;
    const k = objectUnder(hit.x, hit.y);
    if (k === undefined) return null;
    const template = e.templates[e.template[k]];
    const at: [number, number] = [e.x[k], e.y[k]];
    const held = ed.pickedObjectRef.current;
    if (!pick && !(held && held.template === template && held.x === at[0] && held.y === at[1])) return null;
    const orientation = ORIENTATION_NAMES[e.orientation[k]] as Orientation;
    const flipped = (e.flags[k] & FLIPPED) !== 0;
    const record = entitiesOn(hit.x, hit.y).then((list) => list.find((x) => x.template === template && x.x === at[0] && x.y === at[1]) ?? null);
    const tilesAt = (dx: number, dy: number) =>
      footprintTiles(template, { template, x: at[0] + dx, y: at[1] + dy, z: 0, orientation, flipped })
        .filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H)
        .map(([x, y]) => y * W + x);
    const from: [number, number] = [hit.x, hit.y];
    let to = from;
    let done = false;
    const canvas = renderer.current?.canvas;
    if (canvas) canvas.style.cursor = "grabbing";
    const end = () => {
      done = true;
      objectGrab.current = null;
      setSourceDrag(null);
      if (canvas) canvas.style.cursor = "";
    };
    objectGrab.current = { cancel: end };
    return {
      down: () => true,
      move(h) {
        if (!h || done) return;
        to = [h.x, h.y];
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        setSourceDrag(dx || dy ? tilesAt(dx, dy) : null);
      },
      up() {
        if (done) return;
        end();
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        void record.then((rec) => {
          if (!rec) return;
          // a click picks it; a drag moves it
          if (!dx && !dy) {
            setPicked(null);
            return setPickedObject(rec);
          }
          void run(
            () => api.moveObjectBy(rec.id, dx, dy),
            (u) => {
              if (!u.ok) return;
              setPickedObject({ ...rec, x: rec.x + dx, y: rec.y + dy });
              feel("place", rec.x + dx, rec.y + dy, 1, false, rec.template);
            },
          );
        });
      },
      cancel: end,
    };
  }

  /** Ctrl+scroll over a source (D184, D196, D322): its strength a step up or down, the water answering
   *  at once, the new strength beside the pointer; one adjustment is one undo step. */
  const sourceWheel = useRef<{ key: string; record: Promise<EntityInfo | null>; value: number | null; sent: number | null; busy: boolean } | null>(null);
  const wheelNoteTimer = useRef(0);
  /** The strengths set on sources still on their way to the worker (D368 (4)), and a tick when they change. */
  const pendingStrength = useRef(new Map<string, number>());
  const [strengthTick, setStrengthTick] = useState(0);
  /** A source's strength, by its index in the page's objects: the one number its label, its row and the
   *  scroll's note all read (D368 (4)), the page's copy with the strengths still on their way on top. */
  const strengthOfEntity = (k: number) => strengthReader(mirror.current.entities, pendingStrength.current)(k);
  /** A source's strength set on the page at once (null: the worker has answered, its own number stands): the
   *  label, the row and the note all follow it, every notch (D368 (4)). */
  function liveStrength(e: { x: number; y: number }, v: number | null) {
    const key = strengthKey(e.x, e.y);
    if (v === null) {
      if (!pendingStrength.current.delete(key)) return;
    } else pendingStrength.current.set(key, v);
    ed.sourcesChanged();
    setStrengthTick((t) => t + 1);
  }
  /** A picked object's index in the page's objects (-1: none there). */
  function entityIndexOf(e: { template: string; x: number; y: number }): number {
    const v = mirror.current.entities;
    for (let k = 0; k < v.count; k++) if (v.x[k] === e.x && v.y[k] === e.y && v.templates[v.template[k]] === e.template) return k;
    return -1;
  }
  /** Ctrl+scroll over a source sets its strength (D196; D322 moved it off Shift+scroll, which sets a
   *  brush's target level). */
  function wheelSource(ev: WheelEvent, hit: TileHit | null): boolean {
    if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey) return false;
    const src = sourceOnScreen(hit, ev.clientX, ev.clientY);
    if (!src) return false;
    const key = `${src.x},${src.y}`;
    let w = sourceWheel.current;
    if (!w || w.key !== key) w = sourceWheel.current = { key, record: sourceInfo(src.x, src.y), value: null, sent: null, busy: false };
    const up = (ev.deltaY || ev.deltaX) < 0;
    const box = renderer.current?.canvas.getBoundingClientRect();
    const at = box ? { x: ev.clientX - box.left, y: ev.clientY - box.top } : pointerAt.current;
    const state = w;
    void state.record.then((e) => {
      if (!e || sourceWheel.current !== state) return;
      const steps = e.template === "BadwaterSource" ? BADWATER_STRENGTHS : SOURCE_STRENGTHS;
      const ek = entityIndexOf(e);
      const now = state.value ?? (ek >= 0 ? strengthOfEntity(ek) : ((e.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength ?? steps[0]));
      const k = steps.reduce((best, f, j) => (Math.abs(f - now) < Math.abs(steps[best] - now) ? j : best), 0);
      const value = steps[Math.max(0, Math.min(steps.length - 1, k + (up ? 1 : -1)))];
      state.value = value;
      const over = value > OFFICIAL_FLOW;
      // one number everywhere, at once (D361 (6), D368 (4)): the source's strength set on the page, which its
      // label, its row and these words all read; this source's and, in a row, the row's
      liveStrength(e, value);
      const s = ek >= 0 ? sourceStrengths(ed.groupsRef.current, strengthOfEntity, ek) : null;
      const words = s ? sourceStrengthWords(s) : `${value} ${e.template === "BadwaterSource" ? "badwater" : "water"}/s`;
      setShapeNote({ text: over ? `${words}: stronger than any official map` : words, ok: true, warn: over, ...at });
      clearTimeout(wheelNoteTimer.current);
      wheelNoteTimer.current = window.setTimeout(() => {
        setShapeNote(null);
        if (sourceWheel.current === state && !state.busy) sourceWheel.current = null;
      }, 1500);
      const send = () => {
        if (state.busy || state.value === state.sent || state.value === null) return;
        const v = state.value;
        state.busy = true;
        state.sent = v;
        const name = e.template === "BadwaterSource" ? "Badwater source" : "Water source";
        const op: EditOp = { op: "setEntityProps", params: { id: e.id, components: { WaterSource: { SpecifiedStrength: v, CurrentStrength: v } } } };
        let ok = false;
        void run(
          () => api.applyStep(op, `${name}: ${v} water/s`, `strength:${e.id}`),
          (u) => {
            ok = u.ok;
            const p = pickedRef.current;
            if (u.ok && p && p.list.some((x) => x.id === e.id)) ed.pickTile(p.x, p.y);
          },
        ).finally(() => {
          state.busy = false;
          // (the worker's answer is in the page's copy now: its number stands, unless another notch is on its
          // way; refused, the source keeps the strength it had)
          if (!ok) state.value = null;
          if (!ok || state.value === v) liveStrength(e, null);
          send();
        });
      };
      send();
    });
    return true;
  }

  return {
    pointerAt, notePointer, sourceAtTile, placeSource, sourceInfo, entitiesOn, sourceGrab, grabSource, objectUnder, objectTiles,
    grabObject, strengthTick, strengthOfEntity, liveStrength, entityIndexOf, wheelSource
  };
}
