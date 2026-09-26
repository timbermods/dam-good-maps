// The terrain brushes on the page (live editing): raise, lower, flatten, smooth and naturalize,
// painted straight onto the map. The page paints each dab on its own copy of the terrain as the
// build would (core/features/raster/strokePreview.ts) and redraws only what changed, so the ground
// moves under the cursor in the same frame; when the button comes up, the stroke goes to the
// worker as one operation (`brush`), which replays it byte for byte and brings the slopes, the
// plants and the water. The worker is never waited on while painting.
//
// The brush kit (PLAN §20 D182, D184, D193), each off by default: a square brush; precise (hard
// edges, vertical walls, one level at a time, and held still it digs or builds a level more at a
// steady pace tied to the strength, down to a "stop at" level when one is set); straight lines (the
// stroke runs from where it started to the pointer, its length beside it); Flatten "in steps"
// (terraces) and its edges, a cliff or ramped (D204); Smooth "make walkable" (the game's natural
// slopes). Flatten's level is the ground where the stroke starts unless one was picked. A pen's
// pressure sets each dab's strength.
//
// Controls: left-drag paints; right- or middle-drag and the wheel move the camera; Shift inverts
// (raise ↔ lower); Ctrl+click picks flatten's level, or precise's stop level, from the ground (on
// water, its bed); Ctrl+drag selects (the Select tool); [ and ] change the size; Shift+wheel the
// strength; hold F and move the mouse to size the ring live, a click sets it (D205, from Blender);
// 1–5 pick a brush; Esc cancels a stroke in progress, or a resize.

import type { MapRenderer, PointerTool } from "../render3d";
import type { TileHit } from "../render3d/pick";
import type { BrushParams, BrushTool } from "../core/features/raster/brush";
import { StrokePreview, type TerrainState } from "../core/features/raster/strokePreview";
import { tilesToRuns } from "../core/math/grid";

export type { BrushTool };

export interface BrushSettings {
  tool: BrushTool;
  /** Radius in tiles. */
  size: number;
  /** 1–10. */
  strength: number;
  /** Flatten's level: picked with Ctrl+click, else the ground where a stroke starts. */
  level: number | null;
  /** The brush kit's toggles (off by default). */
  square: boolean;
  precise: boolean;
  straight: boolean;
  levelLines: boolean;
  /** Flatten in steps: benches every `steps` levels, or null. */
  steps: number | null;
  /** Smooth, make walkable. */
  walkable: boolean;
  /** Flatten's edges: ramped (a rim beavers can climb), or a cliff (the default). */
  ramped: boolean;
  /** Precise raise and lower: the level a hold stops at, or null (off). */
  stop: number | null;
}

export const DEFAULT_BRUSH: BrushSettings = { tool: "raise", size: 5, strength: 5, level: null, square: false, precise: false, straight: false, levelLines: false, steps: null, walkable: false, ramped: false, stop: null };

export const BRUSHES: { tool: BrushTool; name: string; key: string; hint: string }[] = [
  { tool: "raise", name: "Raise", key: "1", hint: "Raise the ground. Hold still to raise it more." },
  { tool: "lower", name: "Lower", key: "2", hint: "Lower the ground. Hold still to dig deeper. From water, it carves a bed the water follows." },
  { tool: "flatten", name: "Flatten", key: "3", hint: "Flatten to one level: the ground where you start, or Ctrl+click to pick a level." },
  { tool: "smooth", name: "Smooth", key: "4", hint: "Smooth steps and bumps toward the ground round them." },
  { tool: "naturalize", name: "Naturalize", key: "5", hint: "Wear cliffs into slopes and break straight edges, as weather would." },
];

export const BRUSH_NAMES: Record<BrushTool, string> = { raise: "Raise", lower: "Lower", flatten: "Flatten", smooth: "Smooth", naturalize: "Naturalize" };

export const SIZE_MIN = 1;
export const SIZE_MAX = 24;

/** Brush sizes the [ and ] keys step through. */
const SIZES = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 24];

export function nextSize(size: number, dir: 1 | -1): number {
  if (dir > 0) return SIZES.find((s) => s > size + 1e-9) ?? SIZE_MAX;
  return [...SIZES].reverse().find((s) => s < size - 1e-9) ?? SIZE_MIN;
}

/** Precise hold (D193): milliseconds per level at a strength (a steady, watchable pace). */
export function holdPace(strength: number): number {
  return Math.round(1600 / Math.max(1, Math.min(10, strength)));
}

/** A finished stroke: its operation, its history label, and the terrain before and after it (the
 *  page undoes and redoes a stroke at once, without waiting for the worker). */
export interface Stroke {
  params: BrushParams;
  label: string;
  rect: { x0: number; y0: number; x1: number; y1: number };
  before: { shown: Uint8Array; pre: Uint8Array };
  after: { shown: Uint8Array; pre: Uint8Array };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

export interface PainterHost {
  renderer: MapRenderer;
  W: number;
  H: number;
  /** The shown heights (changed in place while painting), and the terrain the build starts from. */
  heights(): Uint8Array;
  terrain(): TerrainState;
  settings(): BrushSettings;
  /** A stroke ended with changes: send it (the host updates its terrain to `pre` and `protect`). */
  commit(stroke: Stroke, pre: Uint8Array, protect: Uint8Array): void;
  /** Ctrl+click on flatten: the level picked; with precise's stop on, the stop level. */
  picked(level: number, what: "level" | "stop"): void;
  /** Shift+wheel: a new strength (the page shows it beside the pointer while it changes). */
  strength(value: number, ev?: WheelEvent): void;
  /** The land answered the stroke (D205's juice): raise, lower, or the other brushes' shaping, at
   *  tile (x, y); `soft` while the same stroke goes on. */
  feel?(kind: "raise" | "lower" | "shape", x: number, y: number, size: number, soft: boolean): void;
  /** F held: a new size as the pointer moves (`done` when it is set or put back). */
  resize?(size: number, ev: PointerEvent | null, done: boolean): void;
  /** A stroke started or ended. */
  painting(on: boolean): void;
  /** Words beside the pointer (flatten's level: "level 7"; a straight line's length), or null. */
  note?(text: string | null, ev: PointerEvent | null): void;
  /** Whether water stands on the tile. */
  wet?(x: number, y: number): boolean;
  /** The stroke's ground so far, a rectangle of the shown heights at a time: the water flows on it
   *  while painting (D197). */
  draft?(rect: Rect, heights: Uint8Array): void;
  /** The stroke was taken back: its water goes. */
  cancelDraft?(): void;
  /** Precise: the tiles a hold never digs out from under (the start, the objects standing there),
   *  as runs [y, x0, x1]. */
  keep?(): [number, number, number][];
  /** The tiles of each object that stands on more than one tile (a mine site, a relic, a badwater
   *  source, the start): a Flatten stroke's rim must not leave one on a step (D204). */
  footprints?(): number[][];
  /** Ctrl+drag hands the pointer to the Select tool: the drag's pointer tool from here on. */
  select?(hit: TileHit, ev: PointerEvent): PointerTool | null;
}

/** Quarter tiles, for a dab's centre on a map `size` tiles across. */
const q = (v: number, size: number) => Math.max(0, Math.min(4 * size - 1, Math.round(v * 4)));

interface StrokeState {
  preview: StrokePreview;
  settings: Omit<BrushParams, "dabs">;
  dabs: number[];
  /** A pen's pressure per dab (null: a mouse). */
  pressure: number[] | null;
  /** Precise: each dab's depth in levels. */
  levels: number[] | null;
  /** Flatten's level; the level the stroke follows the cursor on. */
  level: number;
  plane: number;
  /** Where the cursor is, where the last dab was, when. */
  last: [number, number];
  dabAt: [number, number];
  lastDab: number;
  raf: number;
  /** Ground changed since it last went to the water, and when it last went. */
  drafted: Rect | null;
  draftAt: number;
  /** When the button went down (precise's hold keeps time from it), and the level it has reached. */
  pressAt: number;
  depth: number;
  /** Straight lines: where the line starts. */
  anchor: [number, number] | null;
  /** The pen's pressure now (0–1), or null for a mouse. */
  pen: number | null;
  /** Precise with a stop level: the ground reached it (the ring pulsed). */
  reached: boolean;
  /** When the land last answered with its juice, and the hold's depth then. */
  feltAt: number;
  feltDepth: number;
}

/** Paints strokes with the brushes: the renderer's pointer tool while a brush is out. */
export class BrushPainter {
  private stroke: StrokeState | null = null;
  private cursorAt: [number, number] | null = null;
  /** A left-drag that began off the map: it paints from where it first reaches the map. */
  private waiting = false;
  /** Ctrl held on the button: a click samples a level, a drag selects. */
  private ctrl: { hit: TileHit; x: number; y: number; down: PointerEvent; handed: PointerTool | null } | null = null;
  private pulseTimer = 0;
  /** F held (D205): the ring stays where it was and follows the pointer's distance; a click sets it. */
  private resizing: { at: [number, number]; level: number; from: number } | null = null;
  readonly tool: PointerTool;

  constructor(private readonly host: PainterHost) {
    const self = this;
    this.tool = {
      // with a brush out the left button paints and never turns the camera, even when the drag
      // starts off the map
      down(hit, ev) {
        if (self.resizing) {
          // a click sets the size (a right click puts it back); it never paints
          self.endResize(ev.button === 0);
          self.swallow = true;
          return true;
        }
        if (ev.button !== 0) return false;
        if (!hit) {
          self.waiting = true;
          return true;
        }
        if (ev.ctrlKey || ev.metaKey) {
          self.ctrl = { hit, x: ev.clientX, y: ev.clientY, down: ev, handed: null };
          return true;
        }
        self.begin(hit.x + 0.5, hit.y + 0.5, ev);
        return true;
      },
      move(hit, ev) {
        if (self.swallow) return;
        const c = self.ctrl;
        if (c) {
          // Ctrl and a drag: the Select tool takes it
          if (!c.handed && Math.abs(ev.clientX - c.x) + Math.abs(ev.clientY - c.y) > 4) {
            c.handed = host.select?.(c.hit, ev) ?? null;
            // (the drag starts where the button went down)
            if (c.handed) c.handed.down(c.hit, c.down);
          }
          c.handed?.move(hit, ev);
          return;
        }
        if (self.waiting) {
          if (!hit) return;
          self.waiting = false;
          self.begin(hit.x + 0.5, hit.y + 0.5, ev);
          return;
        }
        self.moveTo(ev);
      },
      up(hit, ev) {
        if (self.swallow) {
          self.swallow = false;
          return;
        }
        const c = self.ctrl;
        if (c) {
          self.ctrl = null;
          if (c.handed) return c.handed.up(hit, ev);
          // Ctrl+click: a level from the ground (on water, its bed)
          const s = host.settings();
          const level = host.renderer.heightAt(c.hit.x, c.hit.y);
          if (s.precise && s.stop !== null && (s.tool === "raise" || s.tool === "lower")) host.picked(level, "stop");
          else if (s.tool === "flatten") host.picked(level, "level");
          else if (s.precise && (s.tool === "raise" || s.tool === "lower")) host.picked(level, "stop");
          self.showCursor();
          return;
        }
        self.waiting = false;
        self.end();
      },
      cancel() {
        const c = self.ctrl;
        self.ctrl = null;
        c?.handed?.cancel?.();
        self.waiting = false;
        self.cancel();
      },
      hover(hit, ev) {
        if (self.resizing) {
          self.resizeTo(ev);
          return;
        }
        if (!hit) {
          self.cursorAt = null;
          host.renderer.setBrushCursor(null);
          host.note?.(null, null);
          return;
        }
        // flatten says its level beside the pointer (the only words the tools show, D184); with
        // Ctrl, the level a click picks (on water, its bed: the ground under it); precise's stop
        // level likewise
        const s = host.settings();
        const here = host.renderer.heightAt(hit.x, hit.y);
        const picking = ev.ctrlKey || ev.metaKey;
        if (s.tool === "flatten") host.note?.(`level ${picking || s.level === null ? here : s.level}`, ev);
        else if (s.precise && (s.tool === "raise" || s.tool === "lower") && (picking || s.stop !== null)) host.note?.(`stop at level ${picking || s.stop === null ? here : s.stop}`, ev);
        else host.note?.(null, null);
        const p = host.renderer.pickAtLevel(ev.clientX, ev.clientY, here);
        self.cursorAt = p ? [p.point[0], -p.point[2]] : [hit.x + 0.5, hit.y + 0.5];
        self.showCursor();
      },
      // Shift+scroll: the strength (D196, as the game; browsers turn a Shift+wheel sideways)
      wheel(ev) {
        if (!ev.shiftKey) return false;
        const s = host.settings();
        host.strength(Math.max(1, Math.min(10, s.strength + ((ev.deltaY || ev.deltaX) < 0 ? 1 : -1))), ev);
        return true;
      },
    };
  }

  get painting(): boolean {
    return this.stroke !== null;
  }

  /** A click that set the size: its drag and release do nothing. */
  private swallow = false;

  /** F went down (D205): the ring stays where it is, and its size follows the pointer. False when
   *  there is no ring on the map to size (the pointer off the map, a stroke in progress). */
  startResize(): boolean {
    if (this.stroke || !this.cursorAt || this.resizing) return false;
    const at: [number, number] = [this.cursorAt[0], this.cursorAt[1]];
    this.resizing = { at, level: this.host.renderer.heightAt(Math.floor(at[0]), Math.floor(at[1])), from: this.host.settings().size };
    return true;
  }

  get sizing(): boolean {
    return this.resizing !== null;
  }

  /** The size is set (F let go, a click) or put back (Esc, a right click). */
  endResize(keep: boolean): void {
    const r = this.resizing;
    if (!r) return;
    this.resizing = null;
    const size = keep ? this.host.settings().size : r.from;
    this.host.resize?.(size, null, true);
    this.showCursor();
  }

  /** The ring's radius is the pointer's distance from its middle, on the ground at its level, in
   *  half tiles. */
  private resizeTo(ev: PointerEvent): void {
    const r = this.resizing!;
    const p = this.host.renderer.pickAtLevel(ev.clientX, ev.clientY, r.level);
    if (!p) return;
    const d = Math.hypot(p.point[0] - r.at[0], -p.point[2] - r.at[1]);
    const size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(d * 2) / 2));
    if (size !== this.host.settings().size) this.host.resize?.(size, ev, false);
    this.showCursor();
  }

  /** Redraw the brush under the cursor (after a change of size, tool or level). */
  showCursor(pulse = false): void {
    const at = this.stroke ? this.stroke.last : this.resizing ? this.resizing.at : this.cursorAt;
    if (!at) return;
    const s = this.host.settings();
    const tool = this.stroke ? (this.stroke.settings.tool as BrushTool) : s.tool;
    const precise = this.stroke ? !!this.stroke.settings.precise : s.precise;
    // the plane: flatten's level, or precise's stop level
    let level: number | null = null;
    if (tool === "flatten") level = this.stroke ? this.stroke.level : (s.level ?? this.host.renderer.heightAt(Math.floor(at[0]), Math.floor(at[1])));
    else if (precise && (tool === "raise" || tool === "lower") && s.stop !== null) level = s.stop;
    // smart Lower: blue where a stroke would carve a bed the water follows
    const water = this.stroke ? !!this.stroke.settings.channel : tool === "lower" && !precise && this.byWater(at[0], at[1]);
    this.host.renderer.setBrushCursor({ x: at[0], y: at[1], radius: s.size, tool, level, water, square: this.stroke ? this.stroke.settings.shape === "square" : s.square, ...(pulse ? { pulse: true } : {}) });
  }

  /** Whether water stands on the tile at (x, y) or beside it. */
  private byWater(x: number, y: number): boolean {
    const wet = this.host.wet;
    if (!wet) return false;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx >= 0 && ny >= 0 && nx < this.host.W && ny < this.host.H && wet(nx, ny)) return true;
      }
    return false;
  }

  hideCursor(): void {
    this.cursorAt = null;
    this.host.renderer.setBrushCursor(null);
  }

  private begin(x: number, y: number, ev: PointerEvent): void {
    const h = this.host;
    const s = h.settings();
    let tool = s.tool;
    // Shift inverts: raise ↔ lower
    if (ev.shiftKey && (tool === "raise" || tool === "lower")) tool = tool === "raise" ? "lower" : "raise";
    // the game's layers (D207): under a cut, the brush works the visible land only: the ground above
    // the cut stays as it is, and nothing rises past it
    const cut = h.renderer.slice;
    const level = Math.min(s.level ?? h.renderer.heightAt(Math.floor(x), Math.floor(y)), cut ?? 99);
    const precise = s.precise;
    const heaps = tool === "raise" || tool === "lower";
    const keep = [...(precise && heaps ? (h.keep?.() ?? []) : []), ...(cut !== null ? above(h.heights(), cut, h.W) : [])];
    const stop = tool === "raise" && cut !== null ? Math.min(16, cut, precise && s.stop !== null ? s.stop : cut) : precise && heaps && s.stop !== null ? s.stop : null;
    const settings: Omit<BrushParams, "dabs"> = {
      tool,
      size: s.size,
      strength: s.strength,
      ...(tool === "flatten" ? { level } : {}),
      ...(tool === "naturalize" ? { seed: (Math.random() * 0x7fffffff) | 0 } : {}),
      ...(s.square ? { shape: "square" as const } : {}),
      ...(precise ? { precise: true } : {}),
      ...(tool === "flatten" && s.steps ? { steps: s.steps } : {}),
      ...(tool === "smooth" && s.walkable ? { walkable: true } : {}),
      ...(tool === "flatten" && s.ramped ? { edges: "ramped" as const } : {}),
      ...(stop !== null ? { stop } : {}),
      ...(keep.length ? { keep } : {}),
      // smart Lower (D184): a stroke that starts in or beside water carves a bed it follows
      ...(tool === "lower" && !precise && this.byWater(x, y) ? { channel: true } : {}),
    };
    const preview = new StrokePreview(settings, h.terrain(), h.heights(), h.W, h.H);
    // the stroke follows the cursor on the level it started on, so the brush stays under the
    // pointer while the ground rises or sinks beneath it
    const plane = tool === "flatten" ? level : h.renderer.heightAt(Math.floor(x), Math.floor(y));
    const p = h.renderer.pickAtLevel(ev.clientX, ev.clientY, plane);
    const at: [number, number] = p ? [p.point[0], -p.point[2]] : [x, y];
    const pen = ev.pointerType === "pen" ? ev.pressure : null;
    this.stroke = {
      preview,
      settings,
      dabs: [],
      pressure: pen === null ? null : [],
      levels: precise && heaps ? [] : null,
      level,
      plane,
      last: at,
      dabAt: at,
      lastDab: performance.now(),
      raf: 0,
      drafted: null,
      draftAt: 0,
      pressAt: performance.now(),
      depth: 1,
      anchor: s.straight ? at : null,
      pen,
      reached: false,
      feltAt: 0,
      feltDepth: 0,
    };
    h.painting(true);
    this.dab([at]);
    this.loop();
  }

  /** The pointer moved while painting: dabs along the way, a fifth of the brush apart (or the whole
   *  straight line again). */
  private moveTo(ev: PointerEvent): void {
    const st = this.stroke;
    if (!st) return;
    if (st.pen !== null && ev.pointerType === "pen") st.pen = ev.pressure;
    const events = typeof ev.getCoalescedEvents === "function" ? ev.getCoalescedEvents() : [];
    const list = events.length ? events : [ev];
    const spacing = Math.max(0.25, Math.min(2, this.host.settings().size * 0.2));
    const points: [number, number][] = [];
    let [lx, ly] = st.dabAt;
    for (const e of list) {
      const p = this.host.renderer.pickAtLevel(e.clientX, e.clientY, st.plane);
      if (!p) continue;
      const x = Math.max(0, Math.min(this.host.W - 0.01, p.point[0]));
      const y = Math.max(0, Math.min(this.host.H - 0.01, -p.point[2]));
      st.last = [x, y];
      if (st.anchor) continue;
      const d = Math.hypot(x - lx, y - ly);
      if (d < spacing) continue;
      const n = Math.floor(d / spacing);
      for (let k = 1; k <= n; k++) points.push([lx + ((x - lx) * k * spacing) / d, ly + ((y - ly) * k * spacing) / d]);
      lx = points[points.length - 1][0];
      ly = points[points.length - 1][1];
    }
    if (st.anchor) {
      this.straight(ev);
      return;
    }
    if (points.length) this.dab(points);
    else this.showCursor();
  }

  /** Straight lines: the stroke again, from where it started to the pointer, its length beside
   *  the pointer (D183). */
  private straight(ev: PointerEvent): void {
    const st = this.stroke!;
    const h = this.host;
    const back = st.preview.restore();
    if (back) h.renderer.updateTerrainRect(h.heights(), back);
    st.preview = new StrokePreview(st.settings, h.terrain(), h.heights(), h.W, h.H);
    st.dabs = [];
    if (st.pressure) st.pressure = [];
    if (st.levels) st.levels = [];
    const [ax, ay] = st.anchor!;
    const [bx, by] = st.last;
    const len = Math.hypot(bx - ax, by - ay);
    const spacing = Math.max(0.25, Math.min(2, st.settings.size * 0.2));
    const n = Math.max(0, Math.floor(len / spacing));
    const points: [number, number][] = [[ax, ay]];
    for (let k = 1; k <= n; k++) points.push([ax + ((bx - ax) * k) / Math.max(1, n), ay + ((by - ay) * k) / Math.max(1, n)]);
    this.dab(points, back);
    h.note?.(`${Math.round(len)} tile${Math.round(len) === 1 ? "" : "s"}`, ev);
  }

  /** Press the brush at these points: the ground changes in this frame. */
  private dab(points: [number, number][], also: Rect | null = null): void {
    const st = this.stroke!;
    const h = this.host;
    const add: number[] = [];
    for (const [x, y] of points) add.push(q(x, h.W), q(y, h.H));
    st.dabs.push(...add);
    let pressure: number[] | undefined;
    if (st.pressure) {
      const v = Math.max(1, Math.min(255, Math.round((st.pen ?? 1) * 255)));
      pressure = points.map(() => v);
      st.pressure.push(...pressure);
    }
    let levels: number[] | undefined;
    if (st.levels) {
      // straight lines are one level; a hold digs a level more at a steady pace
      levels = points.map(() => (st.anchor ? 1 : st.depth));
      st.levels.push(...levels);
    }
    st.lastDab = performance.now();
    st.dabAt = points[points.length - 1];
    const r = st.preview.add(add, pressure, levels);
    const changed = r && also ? { x0: Math.min(r.x0, also.x0), y0: Math.min(r.y0, also.y0), x1: Math.max(r.x1, also.x1), y1: Math.max(r.y1, also.y1) } : (r ?? also);
    if (changed) {
      h.renderer.updateTerrainRect(h.heights(), changed);
      const d = st.drafted;
      st.drafted = d ? { x0: Math.min(d.x0, changed.x0), y0: Math.min(d.y0, changed.y0), x1: Math.max(d.x1, changed.x1), y1: Math.max(d.y1, changed.y1) } : { ...changed };
      this.sendDraft(false);
      this.feel();
    }
    this.checkStop();
    this.showCursor();
  }

  /** The land's answer (D205): at the stroke's first change, then now and then while it goes on, and
   *  with each level a precise hold digs or builds. */
  private feel(): void {
    const st = this.stroke!;
    const now = performance.now();
    const level = st.levels !== null && st.depth !== st.feltDepth;
    if (st.feltAt && !level && now - st.feltAt < 380) return;
    const tool = st.settings.tool;
    this.host.feel?.(tool === "raise" || tool === "lower" ? tool : "shape", Math.floor(st.last[0]), Math.floor(st.last[1]), st.settings.size, st.feltAt !== 0 && !level);
    st.feltAt = now;
    st.feltDepth = st.depth;
  }

  /** Precise with a stop level: the ring pulses once when the ground under the brush reaches it. */
  private checkStop(): void {
    const st = this.stroke!;
    const stop = st.settings.stop;
    if (stop === undefined || st.reached) return;
    const [x, y] = st.last;
    const h = this.host.heights()[Math.floor(y) * this.host.W + Math.floor(x)];
    if ((st.settings.tool === "lower" && h <= stop) || (st.settings.tool === "raise" && h >= stop)) {
      st.reached = true;
      this.showCursor(true);
      clearTimeout(this.pulseTimer);
      this.pulseTimer = window.setTimeout(() => this.showCursor(), 260);
    }
  }

  /** The ground the stroke changed since the last time, to the water (D197): at once for the first
   *  change, then at most once a frame. */
  private sendDraft(force: boolean): void {
    const st = this.stroke;
    const h = this.host;
    if (!st || !st.drafted || !h.draft) return;
    const now = performance.now();
    if (!force && st.draftAt && now - st.draftAt < 1000 / 60) return;
    st.draftAt = now;
    const r = st.drafted;
    st.drafted = null;
    h.draft(r, cut(h.heights(), r, h.W));
  }

  /** Holding still keeps pressing, thirty times a second; precise digs (or builds) a level more at
   *  a steady pace tied to the strength (D193). */
  private loop(): void {
    const st = this.stroke;
    if (!st) return;
    st.raf = requestAnimationFrame(() => {
      if (this.stroke !== st) return;
      if (st.levels && !st.anchor) {
        const depth = Math.min(16, 1 + Math.floor((performance.now() - st.pressAt) / holdPace(st.settings.strength)));
        if (depth > st.depth) {
          st.depth = depth;
          this.dab([st.last]);
        }
      } else if (!st.anchor && performance.now() - st.lastDab >= 1000 / 30) this.dab([st.last]);
      this.sendDraft(false);
      this.loop();
    });
  }

  /** Objects ride a Flatten stroke's ground (D204): one standing on more than one tile moves with
   *  it when the stroke takes its whole footprint to one level; where the stroke's rim would leave
   *  it on a step, the stroke leaves that footprint's ground as it was (its `keep`), so nothing is
   *  left floating or buried. The stroke is painted again without those tiles. */
  private rideObjects(st: StrokeState): void {
    const h = this.host;
    if (st.settings.tool !== "flatten" || !h.footprints) return;
    const now = h.heights();
    const was = st.preview.start;
    const b = st.preview.bounds;
    if (!b) return;
    const tiles: number[] = [];
    for (const g of h.footprints()) {
      const inBox = g.some((i) => {
        const x = i % h.W;
        const y = (i - x) / h.W;
        return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
      });
      if (!inBox) continue;
      const level = g.every((i) => was[i] === was[g[0]]);
      const onStep = g.some((i) => now[i] !== now[g[0]]);
      if (level && onStep) tiles.push(...g);
    }
    if (!tiles.length) return;
    const keep = tilesToRuns([...new Set(tiles)].sort((a, c) => a - c), h.W);
    const back = st.preview.restore();
    st.settings = { ...st.settings, keep: [...(st.settings.keep ?? []), ...keep] };
    st.preview = new StrokePreview(st.settings, h.terrain(), h.heights(), h.W, h.H);
    const r = st.preview.add(st.dabs, st.pressure ?? undefined, st.levels ?? undefined);
    const changed = r && back ? { x0: Math.min(r.x0, back.x0), y0: Math.min(r.y0, back.y0), x1: Math.max(r.x1, back.x1), y1: Math.max(r.y1, back.y1) } : (r ?? back);
    if (changed) h.renderer.updateTerrainRect(h.heights(), changed);
  }

  /** The button came up: the stroke becomes one operation. */
  end(): void {
    const st = this.stroke;
    if (!st) return;
    cancelAnimationFrame(st.raf);
    this.stroke = null;
    const h = this.host;
    this.rideObjects(st);
    h.painting(false);
    if (st.anchor) h.note?.(null, null);
    h.renderer.refreshShadows();
    const tiles = st.preview.changed();
    if (!tiles) return;
    const b = st.preview.bounds!;
    const rect = { x0: Math.max(0, b.x0 - 1), y0: Math.max(0, b.y0 - 1), x1: Math.min(h.W - 1, b.x1 + 1), y1: Math.min(h.H - 1, b.y1 + 1) };
    const before = h.terrain();
    const shown = h.heights();
    // (kept tiles out of the stroke's reach change nothing: the operation keeps only those in it)
    const settings = st.settings.keep ? { ...st.settings, keep: inReach(st.settings.keep, st.dabs, st.settings.size, h.W, h.H) } : st.settings;
    if (settings.keep && !settings.keep.length) delete settings.keep;
    const stroke: Stroke = {
      params: { ...settings, ...(st.pressure ? { pressure: st.pressure } : {}), ...(st.levels ? { levels: st.levels } : {}), dabs: st.dabs },
      label: `${BRUSH_NAMES[st.settings.tool as BrushTool]}, ${tiles} tile${tiles === 1 ? "" : "s"}`,
      rect,
      before: { shown: cut(st.preview.start, rect, h.W), pre: cut(before.pre, rect, h.W) },
      after: { shown: cut(shown, rect, h.W), pre: cut(st.preview.pre, rect, h.W) },
    };
    h.commit(stroke, st.preview.pre, st.preview.protect);
  }

  /** Esc: the stroke never happened. */
  cancel(): void {
    const st = this.stroke;
    if (!st) return;
    cancelAnimationFrame(st.raf);
    this.stroke = null;
    const r = st.preview.restore();
    if (r) this.host.renderer.updateTerrainRect(this.host.heights(), r);
    this.host.renderer.refreshShadows();
    this.host.cancelDraft?.();
    this.host.painting(false);
    if (st.anchor) this.host.note?.(null, null);
    this.showCursor();
  }
}

/** The tiles above a cut, as runs [y, x0, x1] (the brush leaves them as they are). */
function above(heights: Uint8Array, cut: number, W: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const H = heights.length / W;
  for (let y = 0; y < H; y++) {
    let x0 = -1;
    for (let x = 0; x <= W; x++) {
      const up = x < W && heights[y * W + x] > cut;
      if (up && x0 < 0) x0 = x;
      else if (!up && x0 >= 0) {
        out.push([y, x0, x - 1]);
        x0 = -1;
      }
    }
  }
  return out;
}

/** The kept runs a stroke's dabs can reach (a brush's radius and a tile round its dabs). */
function inReach(keep: readonly [number, number, number][], dabs: readonly number[], size: number, W: number, H: number): [number, number, number][] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k + 1 < dabs.length; k += 2) {
    x0 = Math.min(x0, dabs[k]);
    x1 = Math.max(x1, dabs[k]);
    y0 = Math.min(y0, dabs[k + 1]);
    y1 = Math.max(y1, dabs[k + 1]);
  }
  const r = Math.ceil(size) + 2;
  const tx0 = Math.max(0, Math.floor(x0 / 4) - r);
  const tx1 = Math.min(W - 1, Math.floor(x1 / 4) + r);
  const ty0 = Math.max(0, Math.floor(y0 / 4) - r);
  const ty1 = Math.min(H - 1, Math.floor(y1 / 4) + r);
  const out: [number, number, number][] = [];
  for (const [y, a, b] of keep) {
    if (y < ty0 || y > ty1 || b < tx0 || a > tx1) continue;
    out.push([y, Math.max(a, tx0), Math.min(b, tx1)]);
  }
  return out;
}

/** A rectangle's bytes out of a W-wide map. */
export function cut(a: Uint8Array, r: { x0: number; y0: number; x1: number; y1: number }, W: number): Uint8Array {
  const w = r.x1 - r.x0 + 1;
  const out = new Uint8Array(w * (r.y1 - r.y0 + 1));
  for (let y = r.y0; y <= r.y1; y++) out.set(a.subarray(y * W + r.x0, y * W + r.x1 + 1), (y - r.y0) * w);
  return out;
}

/** Put a rectangle's bytes back into a W-wide map. */
export function paste(a: Uint8Array, part: Uint8Array, r: { x0: number; y0: number; x1: number; y1: number }, W: number): void {
  const w = r.x1 - r.x0 + 1;
  for (let y = r.y0; y <= r.y1; y++) a.set(part.subarray((y - r.y0) * w, (y - r.y0 + 1) * w), y * W + r.x0);
}
