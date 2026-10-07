// The Select tool: opening and closing it, its actions and previews, Delete's menu and its row.

import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { EditOp } from "../../core/doc/ops";
import { footprintTiles, type Orientation } from "../../core/format/footprints";
import { FLIPPED, ORIENTATION_NAMES } from "../../render3d/model";
import { deleteGroupOf, DELETE_GROUPS, DELETE_KINDS, depthLevels, SELECT_MODES, selectTool, sizeWords, type DeleteGroup, type SelectMode } from "../select";
import { ModeIcon, WholeMapIcon } from "../SelectIcons";
import { tilesToRuns } from "../../core/math/grid";
import { isSource } from "../sourceSpots";
import { BRUSH_MAX_LEVEL } from "../../core/features/raster/brush";
import { BAD, LOWERS, MOVING, RAISES } from "../tools";
import { tip } from "../../ui/Tooltip";
import { ButtonSetting, NumberSetting, SettingsGrid, Words, type Group } from "../settings";
import { ALL_KINDS } from "../remove/kinds";
import type { Ed } from "../ed";

export interface SelectSlice {
  selectHost: () => { W: number; H: number; heights: () => Uint8Array<ArrayBufferLike>; mode: () => SelectMode; changed: () => void; drawing: (tiles: number[] | null, words: string | null, ev: PointerEvent | null) => void; wet: (i: number) => boolean; brushSize: () => number; ring: (at: [number, number] | null, radius: number) => void; sample: (level: number) => void; dial: (step: 1 | -1, ev: WheelEvent) => void };
  openSelect: () => void;
  closeSelect: () => void;
  selectAll: () => void;
  workingArea: () => [number, number, number][] | null;
  inArea: (tiles: readonly number[]) => boolean;
  selectCalls: { current: { action: (what: "raise" | "lower" | "flatten" | "cut" | "fill" | "depth", level?: number) => void } };
  checkDepthRef: { current: () => void };
  selectChip: () => ComponentChildren;
  selectRow: () => JSX.Element | null;
  objectFootprints: () => number[][];
}

export function useSelect(ed: Ed): SelectSlice {
  const {
    api, info, mirror, renderer, ready, tool, setMessage, selecting, setSelecting, selectingRef, selection,
    setSelectionTick, selectionTick, setSelectDraw, setSelectPreview, deleteMenu, setDeleteMenu, setDeleteCounts,
    deleteCounts, feel, setShapeNote, infoRef, run, brushTool, brushRef, brushToolRef, pickTop, pickShelf, pointerAt,
    notePointer, flashNote, coverAt, deleteOn, deleteGround, shelf
  } = ed;

  // ------------------------------------------------------------------------------ the Select tool

  function selectHost() {
    return {
      W: infoRef.current.W,
      H: infoRef.current.H,
      heights: () => mirror.current.heights,
      mode: () => selectingRef.current ?? "rect",
      changed: () => {
        setFlattenTo(null);
        setSelectionTick((n) => n + 1);
      },
      drawing: (tiles: number[] | null, words: string | null, ev: PointerEvent | null) => {
        setSelectDraw(tiles);
        if (!words) return setShapeNote(null);
        if (ev) notePointer(ev);
        setShapeNote({ text: words, ok: true, warn: false, ...pointerAt.current });
      },
      // Wand on water (D261): the tiles the view draws as water, clean or bad
      wet: (i: number) => {
        const w = mirror.current.water;
        return !!w && w.surface[i] === w.surface[i];
      },
      brushSize: () => brushRef.current.size,
      ring: (at: [number, number] | null, radius: number) => {
        if (brushToolRef.current) return;
        renderer.current?.setBrushCursor(at ? { x: at[0], y: at[1], radius, tool: "flatten", level: null } : null);
      },
      // Ctrl+click on the land: the Level number (as Flatten's sampling)
      sample: (level: number) => {
        setFlattenTo(level);
        flashNote(`level ${level}`);
      },
      // Shift+scroll: the Level number a step at a time (as for the brushes' target, D345 B8)
      dial: (step: 1 | -1, ev: WheelEvent) => {
        const now = flattenRef.current ?? selectLowest();
        const level = Math.max(0, Math.min(BRUSH_MAX_LEVEL, now + step));
        setFlattenTo(level);
        notePointer(ev);
        flashNote(`level ${level}`);
      },
    };
  }
  // Up and Down raise and lower an open selection, so the camera leaves them alone then (D323 item 6)
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    // (and ← → while a weather day is held: they step the day, Kyler, 2026-10-04)
    r.claimKey = (ev) => ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && selection.current.count > 0 && !brushToolRef.current && !ed.toolRef.current) || ((ev.key === "ArrowLeft" || ev.key === "ArrowRight") && !!ed.weatherRef.current);
    return () => {
      if (r.claimKey) r.claimKey = null;
    };
  }, [ready]);
  // the Delete menu closes on a click anywhere else
  useEffect(() => {
    if (!deleteMenu) return;
    const off = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".select-menu, [aria-haspopup='menu']")) setDeleteMenu(false);
    };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [deleteMenu]);
  // while the menu is open, the core says what stands in the selection (D345, B5)
  useEffect(() => {
    if (!deleteMenu) return setDeleteCounts(null);
    let live = true;
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    void api.objectsInArea(tiles).then((r) => live && setDeleteCounts(r));
    return () => {
      live = false;
    };
  }, [deleteMenu, selectionTick, info.version]);
  // the Select tool takes the map's left button whenever nothing else is in hand (a press on a source, the start
  // or an object still picks it up: the view asks those first)
  useEffect(() => {
    const r = renderer.current;
    if (!r || !selecting || brushTool || tool || shelf) return;
    const t = selectTool(selection.current, selectHost());
    // Alt takes tiles away only from a selection; with none, Alt+click picks the tile's layer, as everywhere (D207)
    Object.defineProperty(t, "wantsAlt", { get: () => selection.current.count > 0, configurable: true });
    // Select is the resting tool. A press on a source or the start is left to the pointer, as before Select was
    // always in hand (a click picks a source, Ctrl+click adds one to a row; their drags move them); a drag that
    // starts on an object marks an area, and a plain click picks the object (a drag then moves it). With a
    // selection open, Select takes every press, as it always did.
    const down = t.down.bind(t);
    const up = t.up.bind(t);
    let press: { x: number; y: number } | null = null;
    t.down = (hit, ev) => {
      if (hit && !selection.current.count && (ed.targetAt(hit.x, hit.y) || (ed.startHere && Math.max(Math.abs(hit.x - ed.startHere.x), Math.abs(hit.y - ed.startHere.y)) <= 1))) return false;
      press = { x: ev.clientX, y: ev.clientY };
      return down(hit, ev);
    };
    t.up = (hit, ev) => {
      up(hit, ev);
      const p = press;
      press = null;
      if (!p || Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) >= 4 || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      // a plain click: on an object it picks it; on the land it does what the pointer's click does there
      const g = hit ? ed.grabObjectRef.current(hit, true) : null;
      if (g) {
        g.down(hit, ev);
        g.up(hit, ev);
      } else r.onClick?.(hit, ev);
    };
    r.tool = t;
    return () => {
      if (r.tool === t) r.tool = null;
      if (!brushToolRef.current) r.setBrushCursor(null);
    };
  }, [selecting, brushTool, tool, shelf, ready]);
  /** Open the Select tool (its button, M): the brush or force out goes back, the selection stays. */
  function openSelect() {
    pickTop(null);
    pickShelf(null);
    setSelecting((m) => m ?? "rect");
  }
  /** Esc, X: the selection goes; Select stays in hand. */
  function closeSelect() {
    setDeleteMenu(false);
    setSelectPreview(null);
    setFlattenTo(null);
    selection.current.clear();
    setSelecting((m) => m ?? "rect");
    setSelectDraw(null);
    setSelectionTick((n) => n + 1);
  }
  /** Ctrl+A (D264): the whole map, in the Select tool or with any brush out. */
  function selectAll() {
    const N = infoRef.current.W * infoRef.current.H;
    selection.current.apply(Array.from({ length: N }, (_, i) => i), "set");
    setFlattenTo(null);
    if (!brushToolRef.current && !ed.toolRef.current) setSelecting((m) => m ?? "rect");
    setSelectionTick((n) => n + 1);
  }
  /** The working area (D254, D259): the open selection as runs, or null. */
  function workingArea(): [number, number, number][] | null {
    return selection.current.count ? tilesToRuns(selection.current.tiles(), infoRef.current.W) : null;
  }
  /** Whether every tile of these lies in the working area (or there is none). */
  const inArea = (tiles: readonly number[]) => !selection.current.count || tiles.every((i) => selection.current.mask[i]);
  /** A water depth Max water depth's check waits for once the water settles (D264). */
  const depthCheck = useRef<{ tiles: number[]; depth: number } | null>(null);
  /** What the Select tool does to the selection: exact, one undo step each; the start is carried
   *  only if its own ground can no longer hold it (D264). */
  function selectAction(what: "raise" | "lower" | "flatten" | "cut" | "fill" | "depth", level?: number) {
    const h = mirror.current.heights;
    const W = info.W;
    // under a cut (D207), only the visible land: the ground above the cut stays as it is
    const cut = renderer.current?.slice ?? null;
    let tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (!tiles.length) return;
    const count = (n: number) => n.toLocaleString("en-GB");
    let ops: EditOp[];
    let label: string;
    if (what === "raise" || what === "lower") {
      // (raised under a cut: up to it, never past it)
      let top = 0;
      for (const i of tiles) top = Math.max(top, h[i]);
      const amount = what === "raise" && cut !== null ? Math.min(1, cut - top) : 1;
      if (amount <= 0) return flashNote("Nothing can rise under the cut: show a layer more");
      ops = [{ op: "sculpt", params: { mode: what, cells: tilesToRuns(tiles, W), amount } }];
      label = `${what === "raise" ? "Raise" : "Lower"} ${count(tiles.length)} tiles by ${amount}`;
    } else if (what === "depth") {
      // water no deeper than `level` (D264): the ground under deeper water rises so the water sits
      // that deep; shallower water, and the land, as they are; the water settles again after
      const w = mirror.current.water;
      const D = level!;
      if (!w) return;
      const by = depthLevels(tiles, h, w.depth, w.surface, D);
      const raised = [...by.values()].flat();
      if (!raised.length) return flashNote(`No water there is deeper than ${D}`);
      ops = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([to, list]) => ({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(list, W), level: to } }) as EditOp);
      label = `Water no deeper than ${D} on ${count(raised.length)} tiles`;
      depthCheck.current = { tiles: raised, depth: D };
      tiles = raised;
    } else {
      // Set (cut and fill), Cut down (only the ground above the level) or Fill up (only below it)
      const L = level!;
      if (what === "cut") tiles = tiles.filter((i) => h[i] > L);
      if (what === "fill") tiles = tiles.filter((i) => h[i] < L);
      if (!tiles.length) return flashNote(what === "cut" ? `No ground there is above level ${L}` : `No ground there is below level ${L}`);
      ops = [{ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(tiles, W), level: L } }];
      label = what === "cut" ? `Cut ${count(tiles.length)} tiles down to level ${L}` : what === "fill" ? `Fill ${count(tiles.length)} tiles up to level ${L}` : `Flatten ${count(tiles.length)} tiles to level ${L}`;
    }
    // the land's answer, at the selection's middle
    let sx = 0;
    let sy = 0;
    for (const i of tiles) {
      sx += i % W;
      sy += Math.floor(i / W);
    }
    const n = tiles.length;
    const mid: [number, number] = [Math.round(sx / n), Math.round(sy / n)];
    const size = Math.max(1, Math.sqrt(n) / 2);
    const lowers = what === "lower" || what === "cut";
    setSelectPreview(null);
    void run(
      () => api.applySelection(ops, label, tiles),
      (u) => u.ok && feel(what === "raise" || what === "fill" ? "raise" : lowers ? "lower" : "shape", mid[0], mid[1], size),
    );
  }
  const selectCalls = useRef({ action: selectAction });
  selectCalls.current = { action: selectAction };
  /** After Max water depth, once the water has settled again: a few words if any of it ended deeper
   *  than asked (a river's surface can rise a little, D264). */
  function checkDepth() {
    const c = depthCheck.current;
    const w = mirror.current.water;
    if (!c || !w) return;
    depthCheck.current = null;
    let deeper = 0;
    for (const i of c.tiles) if (w.depth[i] > c.depth + 0.25) deeper++;
    if (deeper) setMessage({ kind: "info", text: `The water rose a little: ${deeper.toLocaleString("en-GB")} tile${deeper > 1 ? "s are" : " is"} still deeper than ${c.depth}.` });
  }
  const checkDepthRef = useRef(checkDepth);
  checkDepthRef.current = checkDepth;
  /** The selection's lowest level (the level number starts there, D323 item 6). */
  function selectLowest(): number {
    const h = mirror.current.heights;
    let lo = Infinity;
    for (const i of selection.current.tiles()) lo = Math.min(lo, h[i]);
    return Number.isFinite(lo) ? lo : 0;
  }
  /** The level number: null until the player sets it (or Ctrl+clicks the land), then it starts at the
   *  selection's lowest again with each new selection. */
  const [flattenTo, setFlattenTo] = useState<number | null>(null);
  const flattenRef = useRef<number | null>(null);
  flattenRef.current = flattenTo;
  const [maxDepth, setMaxDepth] = useState(2);
  /** The deepest water in the selection (Max water depth's top). */
  function deepestIn(): number {
    const w = mirror.current.water;
    let d = 0;
    if (w) for (const i of selection.current.tiles()) if (w.depth[i] > d) d = w.depth[i];
    return Math.floor(d);
  }
  /** What hovering a Select action shows on the land inside the selection: the tiles it would change
   *  (D323 item 6), the same ones the action then changes. */
  function selectPreviewOf(what: "raise" | "lower" | "flatten" | "cut" | "fill", level: number): void {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    let tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (what === "raise") {
      let top = 0;
      for (const i of tiles) top = Math.max(top, h[i]);
      if (cut !== null && cut - top <= 0) tiles = [];
    }
    if (what === "lower") tiles = tiles.filter((i) => h[i] > 0);
    if (what === "cut") tiles = tiles.filter((i) => h[i] > level);
    if (what === "fill") tiles = tiles.filter((i) => h[i] < level);
    if (what === "flatten") tiles = tiles.filter((i) => h[i] !== level);
    setSelectPreview({ tiles, color: what === "raise" || what === "fill" ? RAISES : what === "flatten" ? MOVING : LOWERS });
  }
  /** The kinds of thing Delete can take in the selection, with how many of each stand there (the
   *  objects, not their tiles), and the ground (D323 item 1). */
  function deleteChoices(): { group: DeleteGroup | "ground"; name: string; count: number }[] {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    // (what stands there is the core's answer, the objects under water counted too: D345, B5)
    const counts = new Map<DeleteGroup, number>();
    for (const [template, n] of Object.entries(deleteCounts?.counts ?? {})) {
      const g = deleteGroupOf(template);
      if (g) counts.set(g, (counts.get(g) ?? 0) + n);
    }
    const out: { group: DeleteGroup | "ground"; name: string; count: number }[] = [];
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total) out.push({ group: "everything", name: "Everything", count: total });
    for (const [g, name] of DELETE_GROUPS) if (counts.get(g)) out.push({ group: g, name, count: counts.get(g)! });
    if (tiles.some((i) => h[i] > 0)) out.push({ group: "ground", name: "Ground (one level)", count: tiles.filter((i) => h[i] > 0).length });
    return out;
  }
  /** What a Delete menu choice does, in one line (D351). */
  function deleteTitle(group: DeleteGroup | "ground", name: string): string {
    if (group === "ground") return "Lower the ground one level";
    if (group === "everything") return "Delete every object here";
    if (group === "start") return "Delete the start";
    return `Delete the ${name.toLowerCase()}`;
  }
  /** Delete one kind of thing (or everything) in the selection, or its ground one level down. */
  function deleteChoice(group: DeleteGroup | "ground") {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    setDeleteMenu(false);
    setSelectPreview(null);
    if (!tiles.length) return;
    if (group === "ground") return deleteGround(tiles);
    deleteOn(tiles, false, group === "everything" ? ALL_KINDS : (DELETE_KINDS[group] ?? []), true);
  }
  /** The tiles the pointer's hover over a Delete menu choice would clear: the objects' footprints, or
   *  the ground tiles. */
  function deletePreview(group: DeleteGroup | "ground"): void {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (group === "ground") return setSelectPreview({ tiles: tiles.filter((i) => h[i] > 0), color: LOWERS });
    const e = mirror.current.entities;
    const at = coverAt();
    const out = new Set<number>();
    for (const i of tiles)
      for (const k of at.get(i) ?? []) {
        const g = deleteGroupOf(e.templates[e.template[k]]);
        if (g && (group === "everything" || g === group)) out.add(i);
      }
    setSelectPreview({ tiles: [...out], color: BAD });
  }
  /** With a brush or a force out, the Select row is a small chip (D259: one row at a time); a click
   *  on it opens the Select tool again. */
  function selectChip(): ComponentChildren {
    const z = selection.current.size();
    if (!z || (!brushTool && !tool)) return null;
    void selectionTick;
    return (
      <button type="button" class="select-chip" {...tip("Working inside this area: Select again", "1", "Esc clears it")} onClick={openSelect}>
        Working inside {z.w} × {z.h}
      </button>
    );
  }
  function selectRow() {
    if (!selecting && !selection.current.count) return null;
    // (with a brush, a force or an object out, only the chip; an object picked on the map shows no row above the bar:
    // its settings are in its own window, Kyler's sitting, 2026-10-03)
    if (brushTool || tool || shelf) return null;
    if (!selection.current.count && (ed.picked || ed.pickedObject)) return null;
    void selectionTick;
    const z = selection.current.size();
    const level = Math.max(0, Math.min(BRUSH_MAX_LEVEL, flattenTo ?? selectLowest()));
    const deepest = z ? deepestIn() : 0;
    const depth = Math.max(1, Math.min(maxDepth, Math.max(1, deepest)));
    const way = (what: "raise" | "lower" | "flatten" | "cut" | "fill") => ({
      onMouseEnter: () => selectPreviewOf(what, level),
      onFocus: () => selectPreviewOf(what, level),
      onMouseLeave: () => setSelectPreview(null),
      onBlur: () => setSelectPreview(null),
    });
    const choices = deleteMenu && z ? deleteChoices() : [];
    // Kyler's option B (2026-10-03): How to select's six shapes on the tools' six cells, icon above its name; keys only
    // in tooltips (Shift adds, Alt takes away, in the shapes').
    const shapes = (
      <span class="segmented shapes" role="group" aria-label="How to select">
        {SELECT_MODES.map(([v, name, hint]) => (
          <button type="button" class="icon-button" key={v} aria-label={name} aria-pressed={(selecting ?? "rect") === v} {...tip(`${name}: ${hint}`, "Shift adds", "Alt takes away")} onClick={() => setSelecting(v)}>
            <ModeIcon mode={v} />
            <span class="icon-word">{name}</span>
          </button>
        ))}
        <button type="button" class="icon-button" aria-label="Whole map" {...tip("Select the whole map", "Ctrl+A")} onClick={selectAll}>
          <WholeMapIcon />
          <span class="icon-word">Whole map</span>
        </button>
      </span>
    );
    // One layout with or without a selection (Kyler, 2026-10-04): row 1 the shapes and the size; row 2 Level, the
    // actions, Delete, Max water depth and Apply, greyed until there is a selection (Max water depth and Apply until it
    // holds water deeper than 1); selecting changes only what is enabled
    const deep = deepest >= 1;
    const act = (key: string, at: number, label: string, title: ReturnType<typeof tip>, what: "raise" | "lower" | "flatten" | "cut" | "fill", run: () => void): Group => ({
      key,
      row: 2,
      at,
      span: 1,
      node: (
        <div class="set">
          <button type="button" class="set-button" disabled={!z} {...title} {...way(what)} onClick={run}>
            {label}
          </button>
        </div>
      ),
    });
    const groups: Group[] = [
      { key: "shapes", row: 1, at: 1, span: 6, node: shapes },
      { key: "size", row: 1, at: 7, span: 5, centre: true, node: <Words status>{z ? sizeWords(z) : "Drag on the map to select"}</Words> },
      // Deselect (Kyler, 2026-10-04): always there, greyed with nothing selected; Esc and X do the same (touch screens
      // have neither)
      { key: "deselect", row: 1, at: 12, span: 2, node: <ButtonSetting label="Deselect" title="Clear the selection" keys={["Esc", "X"]} disabled={!z} onClick={closeSelect} /> },
      {
        key: "level",
        row: 2,
        at: 1,
        span: 2,
        node: <NumberSetting label="Level" title="The level" keys={["Ctrl+click", "Shift+scroll"]} value={level} min={0} max={BRUSH_MAX_LEVEL} step={1} disabled={!z} onChange={(v) => setFlattenTo(v)} />,
      },
      act("up", 3, "Up 1", tip("Raise the selection one level", "Up"), "raise", () => selectAction("raise")),
      act("down", 4, "Down 1", tip("Lower the selection one level", "Down"), "lower", () => selectAction("lower")),
      act("flatten", 5, "Flatten", tip("Set the area to this level"), "flatten", () => selectAction("flatten", level)),
      act("cut", 6, "Cut down", tip("Cut the ground above this level"), "cut", () => selectAction("cut", level)),
      act("fill", 7, "Fill up", tip("Fill the ground below this level"), "fill", () => selectAction("fill", level)),
      {
        key: "depth",
        row: 2,
        at: 9,
        span: 3,
        node: <NumberSetting label="Max water depth" title="The deepest the water may be" value={depth} min={1} max={Math.max(1, deepest)} step={1} disabled={!deep} onChange={(v) => setMaxDepth(v)} />,
      },
      { key: "apply", row: 2, at: 12, span: 2, node: <ButtonSetting label="Apply" title="Make the water no deeper than this" disabled={!deep} onClick={() => selectAction("depth", depth)} /> },
      {
        key: "delete",
        row: 2,
        at: 8,
        span: 1,
        node: (
          <div class="set">

            <span class="menu-wrap">
              <button type="button" class="set-button" disabled={!z} aria-haspopup="menu" aria-expanded={deleteMenu} {...tip("Delete what stands here", "Delete")} onClick={() => setDeleteMenu(!deleteMenu)}>
                Delete
              </button>
              {deleteMenu ? (
                <ul class="menu select-menu" role="menu" aria-label="Delete">
                  {!deleteCounts ? (
                    <li role="none">
                      <span class="muted">Counting…</span>
                    </li>
                  ) : choices.length ? (
                    choices.map((c) => (
                      <li role="none" key={c.group}>
                        <button
                          type="button"
                          role="menuitem"
                          title={deleteTitle(c.group, c.name)}
                          onClick={() => deleteChoice(c.group)}
                          onMouseEnter={() => deletePreview(c.group)}
                          onFocus={() => deletePreview(c.group)}
                          onMouseLeave={() => setSelectPreview(null)}
                          onBlur={() => setSelectPreview(null)}
                        >
                          {c.group === "ground" ? c.name : `${c.name} (${c.count.toLocaleString("en-GB")})`}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li role="none">
                      <span class="muted">Nothing to delete here</span>
                    </li>
                  )}
                </ul>
              ) : null}
            </span>
          </div>
        ),
      },
    ];
    return <SettingsGrid label="Selection" groups={groups} />;
  }

  /** The tiles of each object on more than one tile (a Flatten stroke keeps them level, D204). */
  function objectFootprints(): number[][] {
    const e = mirror.current.entities;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const out: number[][] = [];
    for (let k = 0; k < e.count; k++) {
      const template = e.templates[e.template[k]];
      // (a source rides a stroke whole instead: `rides`, D249)
      if (isSource(template)) continue;
      const tl = footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 });
      if (tl.length < 2) continue;
      const g = tl.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x);
      if (g.length > 1) out.push(g);
    }
    return out;
  }

  return {
    selectHost, openSelect, closeSelect, selectAll, workingArea, inArea, selectCalls, checkDepthRef, selectChip,
    selectRow, objectFootprints
  };
}
