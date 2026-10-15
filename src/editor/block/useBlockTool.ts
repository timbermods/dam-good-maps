// The Block tool on the page (3D step 3, D335, D342): add blocks onto the face under the pointer, carve them away,
// in a click or a drag in the plane of the first face. Hovering asks the core what a click would do
// (`blockFalls`, no build) and the renderer shows it; nothing is applied until the button comes up, and then it is
// one operation, `blocks`, one undo step. The gestures' arithmetic is in blockTool.ts; the tool's place on the bar,
// its settings and its key are the bar's (TopBar.tsx, useKeyboard.ts).

import { useEffect, useRef, useState } from "preact/hooks";
import type { PointerTool } from "../../render3d";
import type { BlockFalls, BlocksParams } from "../../core/doc/blockTool";
import { plain } from "../words";
import { loadBlock, saveBlock } from "../prefs/blockPrefs";
import type { Ed } from "../ed";
import { blockAim, type BlockAim } from "../../render3d/pick";
import { blockLabel, blockParams, clampSize, modeFor, paramsKey, PlaneSweep, sizeFromPointer, type BlockSettings } from "./blockTool";
import { showBlocks } from "./view";

export interface BlockSlice {
  /** The Block tool is in hand. */
  block: boolean;
  blockRef: { current: boolean };
  blockSettings: BlockSettings;
  /** Shift is down: a click does the other of Add and Carve (the Action shows it). */
  blockFlip: boolean;
  setBlockSettings: (s: BlockSettings, save?: boolean) => void;
  /** Pick the tool up or put it away (every other tool goes back when it is picked). */
  pickBlock: (on: boolean) => void;
  /** { or }: the Size a block smaller or larger; true when the tool is out. */
  blockStep: (habit: { what: "size" | "strength"; dir: 1 | -1 }, ev?: MouseEvent) => boolean;
  /** F: hold and move the mouse to size the footprint; ended by letting go (kept) or Esc (put back). */
  startBlockSize: () => void;
  endBlockSize: (keep: boolean) => boolean;
  /** Esc in the middle of a drag: nothing is applied. True when there was one. */
  blockCancel: () => boolean;
  /** What the tool shows now (tests). */
  blockState: () => { held: boolean; dragging: boolean; settings: BlockSettings; preview: BlockFalls | null; note: string | null };
}

export function useBlockTool(ed: Ed): BlockSlice {
  const { api, info, renderer, ready, infoRef, run, setShapeNote, pointerAt, notePointer, flashNote, feel } = ed;

  const [block, setBlock] = useState(false);
  const blockRef = useRef(false);
  blockRef.current = block;
  const [blockSettings, setSettingsState] = useState<BlockSettings>(loadBlock);
  const [blockFlip, setFlip] = useState(false);
  const settingsRef = useRef(blockSettings);
  settingsRef.current = blockSettings;
  const setBlockSettings = (s: BlockSettings, save = true) => {
    // (at once: the next hover and the next press read it before the page renders)
    settingsRef.current = s;
    setSettingsState(s);
    if (save) saveBlock(s);
  };

  /** The drag in progress, and where the pointer last was (the face under it, Shift): what a settings change or a key
   *  asks the preview about again. */
  const drag = useRef<{ sweep: PlaneSweep; mode: "add" | "remove" } | null>(null);
  const last = useRef<{ aim: BlockAim | null; shift: boolean; x: number; y: number }>({ aim: null, shift: false, x: 0, y: 0 });
  /** The preview: the operation asked about last, the question on its way, the next to ask, the answer. */
  const pv = useRef<{ key: string; inFlight: boolean; queued: BlocksParams | null; result: { key: string; f: BlockFalls } | null; note: string | null }>({ key: "", inFlight: false, queued: null, result: null, note: null });
  const sizing = useRef<{ from: number; stop(): void } | null>(null);

  function clearShown() {
    showBlocks(renderer.current, null);
    pv.current.note = null;
    setShapeNote((n) => (n && !n.ok ? null : n));
  }

  /** The tiles an answer touches. */
  const tilesOf = (f: BlockFalls) => [...f.added, ...f.removed].map((c) => c[1] * infoRef.current.W + c[0]);

  /** Show an answer: the blocks on the map and, when the click would be refused, why, beside the pointer. */
  function present(f: BlockFalls) {
    const tiles = tilesOf(f);
    const outside = !f.errors.length && tiles.length > 0 && !ed.inArea(tiles);
    const reason = outside ? "that is outside the selected area" : f.reason;
    showBlocks(renderer.current, f.errors.length || outside ? null : { added: f.added, removed: f.removed, falls: f.falls });
    pv.current.note = reason ? plain(reason) : null;
    setShapeNote(reason ? { text: plain(reason), ok: false, warn: false, ...pointerAt.current } : null);
  }

  /** Ask the core what these parameters would do (one question at a time, the latest wins), unless it was just asked. */
  function ask(p: BlocksParams | null) {
    const s = pv.current;
    if (!p) {
      s.key = "";
      s.queued = null;
      s.result = null;
      clearShown();
      return;
    }
    const key = paramsKey(p);
    if (key === s.key) return;
    s.key = key;
    s.queued = p;
    void pump();
  }
  async function pump() {
    const s = pv.current;
    if (s.inFlight || !s.queued) return;
    const p = s.queued;
    s.queued = null;
    s.inFlight = true;
    const key = paramsKey(p);
    const version = infoRef.current.version;
    try {
      const f = await api.blockFalls(p);
      // (an answer for a question since changed, or a map since edited, is dropped)
      if (key === s.key && version === infoRef.current.version && blockRef.current) {
        s.result = { key, f };
        present(f);
      }
    } catch {
      // no map is open
    } finally {
      s.inFlight = false;
      if (s.queued) void pump();
    }
  }

  /** The preview for where the pointer is: the drag's sweep, or the face under it. */
  function refresh() {
    const g = drag.current;
    const s = settingsRef.current;
    if (g) return ask(blockParams(s, g.mode, g.sweep.aim.side, g.sweep.at));
    const l = last.current;
    if (!l.aim || !blockRef.current) return ask(null);
    ask(blockParams(s, modeFor(s, l.shift), l.aim.side, [l.aim.at]));
  }

  function pickBlock(on: boolean) {
    if (on === blockRef.current) return;
    if (on) {
      if (ed.forcer.current?.running) return;
      // the other tools go back, the brush's and the shelf's first
      ed.pickBrush(null);
      ed.pickShelf(null);
      ed.setTool(null);
      ed.setPicked(null);
      ed.setPickedObject(null);
    } else {
      endBlockSize(false);
      drag.current = null;
      last.current.aim = null;
      ask(null);
    }
    blockRef.current = on;
    setBlock(on);
  }

  function blockCancel(): boolean {
    if (!drag.current) return false;
    drag.current = null;
    refresh();
    return true;
  }

  // ------------------------------------------------------------------------------ the pointer

  useEffect(() => {
    const r = renderer.current;
    if (!r || !block) return;
    const t: PointerTool = {
      voxel: true,
      down: (hit, ev) => {
        if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ed.forcer.current?.running || sizing.current) return false;
        const aim = blockAim(hit);
        // (nothing to point at: the press turns the camera, as anywhere)
        if (!aim) return false;
        const s = settingsRef.current;
        notePointer(ev);
        last.current = { aim, shift: ev.shiftKey, x: ev.clientX, y: ev.clientY };
        drag.current = { sweep: new PlaneSweep(aim, infoRef.current.W, infoRef.current.H), mode: modeFor(s, ev.shiftKey) };
        refresh();
        return true;
      },
      move: (_hit, ev) => {
        const g = drag.current;
        if (!g) return;
        notePointer(ev);
        last.current.x = ev.clientX;
        last.current.y = ev.clientY;
        if (g.sweep.move(r.rayAt(ev.clientX, ev.clientY))) refresh();
      },
      up: (_hit, ev) => {
        const g = drag.current;
        drag.current = null;
        if (!g) return;
        last.current.shift = ev.shiftKey;
        commit(g.mode, g.sweep);
      },
      hover: (hit, ev) => {
        // (F sizing holds the face it began on)
        if (drag.current || sizing.current) return;
        notePointer(ev);
        last.current = { aim: blockAim(hit), shift: ev.shiftKey, x: ev.clientX, y: ev.clientY };
        setFlip(ev.shiftKey);
        // (the preview is the cursor: the tile's own light, which the view just lit for the face seen, goes)
        r.setHoverTile(null);
        refresh();
      },
      cancel: () => {
        drag.current = null;
        refresh();
      },
    };
    r.tool = t;
    return () => {
      if (r.tool === t) r.tool = null;
    };
  }, [block, ready]);

  // the tool put away (or the map gone): its preview goes with it
  useEffect(
    () => () => {
      showBlocks(renderer.current, null);
    },
    [block],
  );

  /** The press is let go: one operation. */
  function commit(mode: "add" | "remove", sweep: PlaneSweep) {
    const params = blockParams(settingsRef.current, mode, sweep.aim.side, sweep.at);
    const known = pv.current.result?.key === paramsKey(params) ? pv.current.result.f : null;
    // (the preview is cleared as the edit goes: the new blocks stand where it was)
    ask(null);
    if (known && !known.errors.length && tilesOf(known).length && !ed.inArea(tilesOf(known))) {
      ed.setMessage({ kind: "error", text: "That is outside the selected area" });
      return;
    }
    void run(
      () => api.apply({ op: "blocks", params }, "user", blockLabel(mode)),
      (u) => {
        if (!u.ok) return refresh();
        ed.firstDoneRef.current("paint");
        // the land's answer: dust and the thud of stone for blocks taken, a set-down for blocks added
        const list = known ? (mode === "add" ? known.added : known.removed) : [];
        const c = list[Math.floor(list.length / 2)] ?? sweep.at[0];
        feel(mode === "add" ? "raise" : "lower", c[0], c[1], params.size);
      },
    );
  }

  // the map changed (an edit, an undo, a redo): the face under the pointer is asked about again
  useEffect(() => {
    if (!block) return;
    pv.current.key = "";
    pv.current.result = null;
    const id = window.setTimeout(() => {
      const r = renderer.current;
      const l = last.current;
      if (!r || !blockRef.current || drag.current || sizing.current || !r.canvas.matches(":hover")) return;
      l.aim = blockAim(r.pickSeen(l.x, l.y));
      refresh();
    }, 90);
    return () => window.clearTimeout(id);
  }, [info.version, block]);

  // the camera moves under a still pointer (the wheel, the keys): the face under it is another, so the preview asks again
  useEffect(() => {
    const r = renderer.current;
    if (!r || !block) return;
    let frame = 0;
    let seen = "";
    const watch = () => {
      frame = requestAnimationFrame(watch);
      const v = r.getView();
      const key = `${v.yaw}|${v.pitch}|${v.distance}|${v.target.join()}|${r.slice}`;
      if (key === seen) return;
      const was = seen;
      seen = key;
      if (!was || drag.current || sizing.current || !r.canvas.matches(":hover")) return;
      const l = last.current;
      l.aim = blockAim(r.pickSeen(l.x, l.y));
      refresh();
    };
    watch();
    return () => cancelAnimationFrame(frame);
  }, [block, ready]);

  // Shift turns the hovered click into its opposite as it is pressed, before the pointer moves
  useEffect(() => {
    if (!block) return;
    const onShift = (ev: KeyboardEvent) => {
      if (ev.key !== "Shift") return;
      setFlip(ev.type === "keydown");
      if (drag.current) return;
      last.current.shift = ev.type === "keydown";
      refresh();
    };
    window.addEventListener("keydown", onShift);
    window.addEventListener("keyup", onShift);
    // (the window lost focus with Shift down: no keyup comes)
    const onBlur = () => {
      setFlip(false);
      last.current.shift = false;
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onShift);
      window.removeEventListener("keyup", onShift);
      window.removeEventListener("blur", onBlur);
      setFlip(false);
    };
  }, [block]);

  // a settings change (the row, a key) asks again about the same face
  useEffect(() => {
    if (block) refresh();
  }, [blockSettings]);

  // ------------------------------------------------------------------------------ Size from the keys

  function blockStep(habit: { what: "size" | "strength"; dir: 1 | -1 }, ev?: MouseEvent): boolean {
    if (!blockRef.current) return false;
    // (the Block tool has no strength: its footprint is its Size)
    if (habit.what !== "size") return true;
    const size = clampSize(settingsRef.current.size + habit.dir);
    setBlockSettings({ ...settingsRef.current, size });
    flashNote(`size ${size}`, ev);
    return true;
  }

  /** F went down with the Block tool out and a face under the pointer: the face stays, and the Size follows how far
   *  the pointer is from its middle. */
  function startBlockSize() {
    const r = renderer.current;
    const aim = last.current.aim;
    if (!r || !blockRef.current || !aim || sizing.current || drag.current) return;
    const move = (ev: PointerEvent) => {
      notePointer(ev);
      const size = sizeFromPointer(aim, r.rayAt(ev.clientX, ev.clientY), settingsRef.current.shape);
      if (size !== null && size !== settingsRef.current.size) setBlockSettings({ ...settingsRef.current, size }, false);
      ed.pointerWords.current!.sizing(`size ${settingsRef.current.size}`);
    };
    // (a click keeps it, a right click puts it back; neither reaches the map)
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      endBlockSize(ev.button === 0);
    };
    sizing.current = {
      from: settingsRef.current.size,
      stop: () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerdown", down, true);
      },
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerdown", down, true);
    ed.pointerWords.current!.sizing(`size ${settingsRef.current.size}`);
  }

  /** The Size is set (F let go, a click) or put back (Esc, a right click). */
  function endBlockSize(keep: boolean): boolean {
    const s = sizing.current;
    if (!s) return false;
    s.stop();
    sizing.current = null;
    if (keep) saveBlock(settingsRef.current);
    else setBlockSettings({ ...settingsRef.current, size: s.from });
    ed.pointerWords.current!.sizing(null);
    return true;
  }
  useEffect(() => () => sizing.current?.stop(), []);

  const blockState = () => ({ held: blockRef.current, dragging: !!drag.current, settings: settingsRef.current, preview: pv.current.result?.f ?? null, note: pv.current.note });

  return { block, blockRef, blockSettings, blockFlip, setBlockSettings, pickBlock, blockStep, startBlockSize, endBlockSize, blockCancel, blockState };
}
