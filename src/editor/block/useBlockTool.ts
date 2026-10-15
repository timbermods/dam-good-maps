// The Block tool on the page (3D step 3, D335, D342): add blocks onto the face under the pointer, take them away,
// in a click or a drag in the plane of the first face. Hovering asks the core what a click would do
// (`blockFalls`, no build) and the renderer shows it; nothing is applied until the button comes up, and then it is
// one operation, `blocks`, one undo step. The gestures' arithmetic is in blockTool.ts; the tool's place on the bar,
// its settings and its key are the bar's (TopBar.tsx, useKeyboard.ts).

import { useEffect, useRef, useState } from "preact/hooks";
import type { PointerTool, TileHit } from "../../render3d";
import type { BlockFalls, BlocksParams } from "../../core/doc/blockTool";
import { plain } from "../words";
import { loadBlock, saveBlock } from "../prefs/blockPrefs";
import type { Ed } from "../ed";
import { blockAim, type BlockAim } from "../../render3d/pick";
import { blockLabel, blockParams, clampSize, modeFor, noteSpot, paramsKey, plantsWords, PlaneSweep, sizeFromPointer, type BlockSettings, type ScreenBox } from "./blockTool";
import { showBlocks } from "./view";

export interface BlockSlice {
  /** The Block tool is in hand. */
  block: boolean;
  blockRef: { current: boolean };
  blockSettings: BlockSettings;
  /** Shift is down: a click does the other of Add and Remove (the Action shows it). */
  blockFlip: boolean;
  /** Why the click under the pointer is refused, or the plants it would take or lift, beside the blocks it would
   *  change (kept apart from the size flash, so neither clears the other); x and y as the shape note's; `ok` when
   *  the click would be taken (the plants' words). */
  blockNote: { text: string; x: number; y: number; ok?: boolean } | null;
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
  const { api, info, renderer, ready, infoRef, run, pointerAt, notePointer, flashNote, feel, selectionTick } = ed;

  const [block, setBlock] = useState(false);
  const blockRef = useRef(false);
  blockRef.current = block;
  const [blockSettings, setSettingsState] = useState<BlockSettings>(loadBlock);
  const [blockFlip, setFlip] = useState(false);
  const [blockNote, setBlockNote] = useState<{ text: string; x: number; y: number; ok?: boolean } | null>(null);
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
  const last = useRef<{ hit: TileHit | null; shift: boolean; x: number; y: number }>({ hit: null, shift: false, x: 0, y: 0 });
  /** The layer cut now (null: none). */
  const cutNow = () => renderer.current?.slice ?? null;
  /** The face the pointer is on, for what a click would do with Shift as it is: under a layer cut, the cut's cap is the
   *  block just under it (Remove takes it; Add has nothing to fill there). */
  const aimOf = (hit: TileHit | null, shift: boolean) => blockAim(hit, cutNow(), modeFor(settingsRef.current, shift));
  /** The operation for these faces: the settings, the layer cut and the working area (the core refuses what is
   *  outside the area and leaves what is under the cut alone). */
  const paramsFor = (mode: "add" | "remove", side: BlocksParams["side"], at: readonly [number, number, number][]) => blockParams(settingsRef.current, mode, side, at, cutNow(), ed.workingArea());
  /** The question's identity: the operation. */
  const keyOf = paramsKey;
  /** The preview: the operation asked about last, the question on its way, the next to ask, the answer. */
  const pv = useRef<{ key: string; inFlight: boolean; queued: BlocksParams | null; result: { key: string; f: BlockFalls } | null; note: string | null }>({ key: "", inFlight: false, queued: null, result: null, note: null });
  const sizing = useRef<{ from: number; stop(): void } | null>(null);

  function clearShown() {
    showBlocks(renderer.current, null);
    pv.current.note = null;
    setBlockNote(null);
  }

  /** The tiles an answer touches. */
  const tilesOf = (f: BlockFalls) => [...f.added, ...f.removed].map((c) => c[1] * infoRef.current.W + c[0]);

  /** The screen box of the blocks an answer draws: the corners of the cuboid that holds them, projected. */
  function boxOf(f: BlockFalls): ScreenBox | null {
    const r = renderer.current;
    const cells = [...f.added, ...f.removed, ...f.falls];
    if (!r || !cells.length) return null;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const c of cells) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], c[k])), (hi[k] = Math.max(hi[k], c[k] + 1));
    let box: ScreenBox | null = null;
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
      const p = r.project(x, z, -y);
      box = box ? { x0: Math.min(box.x0, p.x), y0: Math.min(box.y0, p.y), x1: Math.max(box.x1, p.x), y1: Math.max(box.y1, p.y) } : { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }
    return box;
  }

  /** Say why a click is refused, or what it does to plants (`ok`), in a note clear of the blocks it describes (their
   *  screen box, if any are drawn). */
  function refuse(reason: string | null, box: ScreenBox | null, ok = false) {
    pv.current.note = reason ? plain(reason) : null;
    if (!reason) return setBlockNote(null);
    const c = renderer.current?.canvas;
    // (the note's own size, about: two lines at most; its left and top are what the page places it by, less 16px each;
    // below the pointer's own words, which show a size beside it for a moment)
    const at = { x: pointerAt.current.x, y: pointerAt.current.y + 32 };
    const spot = c ? noteSpot(box, at, { w: c.clientWidth, h: c.clientHeight }, { w: 300, h: 52 }) : { x: at.x + 16, y: at.y + 16 };
    setBlockNote({ text: plain(reason), x: spot.x - 16, y: spot.y - 16, ok });
  }

  /** Show an answer: the blocks on the map and, when the click would be refused, why. */
  function present(f: BlockFalls) {
    showBlocks(renderer.current, f.errors.length ? null : { added: f.added, removed: f.removed, falls: f.falls });
    // (a click that would be taken may still lift or take plants: said beside its blocks, never as a refusal)
    refuse(f.reason ?? plantsWords(f.plantsRemoved, f.plantsRiding), boxOf(f), !f.reason);
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
    const key = keyOf(p);
    if (key === s.key) return;
    s.key = key;
    s.result = null;
    s.queued = p;
    void pump();
  }
  async function pump() {
    const s = pv.current;
    if (s.inFlight || !s.queued) return;
    const p = s.queued;
    s.queued = null;
    s.inFlight = true;
    const key = keyOf(p);
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
    if (g) return ask(paramsFor(g.mode, g.sweep.aim.side, g.sweep.at));
    const l = last.current;
    const aim = blockRef.current ? aimOf(l.hit, l.shift) : null;
    if (!aim) return ask(null);
    ask(paramsFor(modeFor(s, l.shift), aim.side, [aim.at]));
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
      last.current.hit = null;
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
        const aim = aimOf(hit, ev.shiftKey);
        // (nothing to point at: the press turns the camera, as anywhere)
        if (!aim) return false;
        const s = settingsRef.current;
        notePointer(ev);
        last.current = { hit, shift: ev.shiftKey, x: ev.clientX, y: ev.clientY };
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
        last.current = { hit, shift: ev.shiftKey, x: ev.clientX, y: ev.clientY };
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
      setBlockNote(null);
    },
    [block],
  );

  /** The press is let go: one operation. */
  function commit(mode: "add" | "remove", sweep: PlaneSweep) {
    const params = paramsFor(mode, sweep.aim.side, sweep.at);
    const known = pv.current.result?.key === keyOf(params) ? pv.current.result.f : null;
    // (the core has already refused it in the preview: the note and its blocks stay as they were)
    if (known?.reason) {
      ed.setMessage({ kind: "error", text: plain(known.reason) });
      return;
    }
    // (the preview is cleared as the edit goes: the new blocks stand where it was)
    ask(null);
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
      l.hit = r.pickSeen(l.x, l.y);
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
      l.hit = r.pickSeen(l.x, l.y);
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

  // the working area changed (a selection made or cleared): the page's rules read it
  useEffect(() => {
    if (block && !drag.current) refresh();
  }, [selectionTick]);

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
    const aim = aimOf(last.current.hit, last.current.shift);
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

  return { block, blockRef, blockSettings, blockFlip, blockNote, setBlockSettings, pickBlock, blockStep, startBlockSize, endBlockSize, blockCancel, blockState };
}
