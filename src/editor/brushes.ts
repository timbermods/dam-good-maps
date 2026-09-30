// The terrain brushes on the page (live editing): raise, lower, flatten, smooth and naturalize,
// painted straight onto the map. The page paints each dab on its own copy of the terrain as the
// build would (core/features/raster/strokePreview.ts) and redraws only what changed, so the ground
// moves under the cursor in the same frame; when the button comes up, the stroke goes to the
// worker as one operation (`brush`), which replays it byte for byte and brings the slopes, the
// plants and the water. The worker is never waited on while painting.
//
// The height brushes work as the game's own editor (PLAN §20 D322, item 37): Raise, Lower and Flatten
// have a target level, shown beside the pointer at all times. Raise lifts every tile under the brush
// below it to it (the game editor's relative raise), Lower cuts every tile above it down to it
// (relative lower), Flatten sets every tile to it (absolute height), exactly, with the brush's
// footprint and hard edges. Until the player sets it, the target follows the ground under the
// pointer (a level above it for Raise, a level below for Lower, the same for Flatten) and locks where
// a stroke starts; Shift+scroll or Ctrl+click on the land sets it, and it stays until the tool
// changes or Esc. Past either end of the range Raise and Lower are Free: they sculpt softly, building
// up as the player paints. Smooth and Naturalize are always soft. Every brush has a mode (item 2):
// Ground changes only dry tiles and never lowers a bank below its water's surface, Water only the
// wet tiles, Both everything; which tiles are wet is fixed when a stroke starts, from the map's own
// water. In Both, a Lower stroke that starts in water still carves a channel (smart Lower). Sources
// (item 31): Ride (they move with the ground, D249), Keep (they and their ground stay exactly), or
// Clear (they go with the stroke). Mode and Sources are remembered per brush.
//
// The kit (D182, D184), off by default: a square brush; straight lines (the stroke runs from where it
// started to the pointer, its length beside it); Flatten "in steps" (terraces). A walkable edge is
// the shelf's Slope (D247, D322). Level lines are a view switch beside Height colours (D248),
// whatever tool is picked; its state is kept here with the brush's. A pen's pressure sets each soft
// dab's strength.
//
// Controls: left-drag paints; right- or middle-drag and the wheel move the camera; Shift inverts
// (raise ↔ lower); Shift+scroll sets the target (Smooth and Naturalize: the strength); Ctrl+click
// takes the land's level as the target (on water, its bed); Ctrl+drag selects (the Select tool);
// [ and ] change the size; hold F and move the mouse to size the ring, its size beside it, and let go
// (a click sets it too, D205, from Blender); 1–5 pick a brush; Esc cancels a stroke in progress or a
// resize, then lets a set target follow the ground again.

import type { MapRenderer, PointerTool } from "../render3d";
import type { TileHit } from "../render3d/pick";
import { BRUSH_MAX_LEVEL, type BrushParams, type BrushTool } from "../core/features/raster/brush";
import { StrokePreview, type TerrainState } from "../core/features/raster/strokePreview";
import { tilesToRuns } from "../core/math/grid";

export type { BrushTool };

/** Which tiles a brush changes (D322, item 2). */
export type BrushMode = "ground" | "water" | "both";
/** What a stroke does to the sources it passes over (D322, item 31). */
export type SourcesChoice = "ride" | "keep" | "clear";

export interface BrushSettings {
  tool: BrushTool;
  /** Radius in tiles. */
  size: number;
  /** 1–10: how fast the soft brushes work. */
  strength: number;
  /** Raise, Lower and Flatten's target (D322): a level set with Shift+scroll or Ctrl+click, "free"
   *  (Raise and Lower sculpt softly), or null: it follows the ground under the pointer. */
  target: number | "free" | null;
  /** The brush kit's toggles (off by default). */
  square: boolean;
  straight: boolean;
  levelLines: boolean;
  /** Flatten in steps: benches every `steps` levels, or null. */
  steps: number | null;
  /** Each brush's mode and its sources choice, remembered per brush (D322). */
  modes: Record<BrushTool, BrushMode>;
  sources: Record<BrushTool, SourcesChoice>;
}

const EACH = <T,>(v: T): Record<BrushTool, T> => ({ raise: v, lower: v, flatten: v, smooth: v, naturalize: v });

export const DEFAULT_BRUSH: BrushSettings = { tool: "raise", size: 5, strength: 5, target: null, square: false, straight: false, levelLines: false, steps: null, modes: EACH<BrushMode>("both"), sources: EACH<SourcesChoice>("ride") };

export const BRUSHES: { tool: BrushTool; name: string; key: string; hint: string }[] = [
  { tool: "raise", name: "Raise", key: "1", hint: "raise the ground" },
  { tool: "lower", name: "Lower", key: "2", hint: "lower the ground" },
  { tool: "flatten", name: "Flatten", key: "3", hint: "level the ground" },
  { tool: "smooth", name: "Smooth", key: "4", hint: "smooth bumps and steps" },
  { tool: "naturalize", name: "Naturalize", key: "5", hint: "weather cliffs into slopes" },
];

export const BRUSH_NAMES: Record<BrushTool, string> = { raise: "Raise", lower: "Lower", flatten: "Flatten", smooth: "Smooth", naturalize: "Naturalize" };

/** The brushes with a target (D322). */
export const hasTarget = (t: BrushTool): t is "raise" | "lower" | "flatten" => t === "raise" || t === "lower" || t === "flatten";

export const SIZE_MIN = 1;
/** The largest radius a map takes (D322, item 42): half its width, so the largest brush paints the
 *  whole map in one stroke. */
export function sizeMax(W: number, H: number): number {
  return Math.max(24, Math.ceil(Math.max(W, H) / 2));
}

/** Brush sizes the [ and ] keys step through (up to the map's largest). */
const SIZES = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 24, 32, 40, 48, 64, 80, 96, 112, 128];

export function nextSize(size: number, dir: 1 | -1, max = 24): number {
  const steps = [...SIZES.filter((s) => s < max), max];
  if (dir > 0) return steps.find((s) => s > size + 1e-9) ?? max;
  return [...steps].reverse().find((s) => s < size - 1e-9) ?? SIZE_MIN;
}

/** The target that follows the ground at `level` (D322): a level above for Raise, a level below for
 *  Lower, the same for Flatten. */
export function followTarget(tool: "raise" | "lower" | "flatten", level: number): number {
  return Math.max(0, Math.min(BRUSH_MAX_LEVEL, level + (tool === "raise" ? 1 : tool === "lower" ? -1 : 0)));
}

/** The words beside the pointer for a target (D322). */
export function targetWords(tool: "raise" | "lower" | "flatten", t: number | "free"): string {
  if (t === "free") return "Free";
  return tool === "raise" ? `up to ${t}` : tool === "lower" ? `down to ${t}` : `level ${t}`;
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
  /** A stroke ended without changing the ground (a Flatten at the ground's own level, a Smooth over
   *  flat land): its operation, for what the stroke does besides the ground (the sources Clear takes,
   *  item 15). */
  unchanged?(params: BrushParams): void;
  /** Ctrl+click: the land's level, for the target (D322). */
  picked(level: number): void;
  /** Shift+wheel on Smooth or Naturalize: a new strength (the page shows it beside the pointer). */
  strength(value: number, ev?: WheelEvent): void;
  /** Shift+wheel on Raise, Lower or Flatten: a new target (D322), or "free". */
  target?(value: number | "free", ev: WheelEvent): void;
  /** The land answered the stroke (D205's juice): raise, lower, or the other brushes' shaping, at
   *  tile (x, y); `soft` while the same stroke goes on. */
  feel?(kind: "raise" | "lower" | "shape", x: number, y: number, size: number, soft: boolean): void;
  /** F held: a new size as the pointer moves (`done` when it is set or put back). */
  resize?(size: number, ev: PointerEvent | null, done: boolean): void;
  /** The largest size this map takes (D322, item 42). */
  maxSize?(): number;
  /** A stroke started or ended. */
  painting(on: boolean): void;
  /** Words beside the pointer (the target: "up to 7"; a straight line's length), or null. */
  note?(text: string | null, ev: PointerEvent | null): void;
  /** Whether water stands on the tile. */
  wet?(x: number, y: number): boolean;
  /** How deep the water on the tile is (smart Lower's new channel starts a level below its
   *  surface, D263). */
  depth?(x: number, y: number): number;
  /** The tiles drawn as water now, from the map's own water (never a drought's or a badtide's), and
   *  each one's surface (NaN where dry): a mode's wet tiles and banks (D322). */
  water?(): Float32Array | null;
  /** The stroke's ground so far, a rectangle of the shown heights at a time: the water flows on it
   *  while painting (D197). */
  draft?(rect: Rect, heights: Uint8Array): void;
  /** The stroke was taken back: its water goes. */
  cancelDraft?(): void;
  /** The tiles of each object that stands on more than one tile (a mine site, a relic, a badwater
   *  source, the start): a Flatten stroke's rim must not leave one on a step (D204). */
  footprints?(): number[][];
  /** Ctrl+drag hands the pointer to the Select tool: the drag's pointer tool from here on. */
  select?(hit: TileHit, ev: PointerEvent): PointerTool | null;
  /** The pieces that ride a stroke whole and level (D249: a 3 × 3 badwater source), as rectangles
   *  [x0, y0, x1, y1]; a stroke that changes one of their tiles takes the piece to its middle's
   *  level. */
  rides?(): [number, number, number, number][];
  /** The sources' own tiles, as runs [y, x0, x1]: Keep leaves them as they are (D322, item 31). */
  sourceGround?(): [number, number, number][];
  /** The working area (D254, D259: the Select tool's open selection) as runs [y, x0, x1], or null:
   *  a stroke changes only its tiles, feathered toward its edge. */
  area?(): [number, number, number][] | null;
  /** Where the ring is (null: off the map), and the stroke being painted with its dabs so far
   *  (Clear's red glow, D249). */
  ring?(at: [number, number] | null, stroke: { settings: Omit<BrushParams, "dabs">; dabs: readonly number[] } | null): void;
}

/** Quarter tiles, for a dab's centre on a map `size` tiles across. */
const q = (v: number, size: number) => Math.max(0, Math.min(4 * size - 1, Math.round(v * 4)));

interface StrokeState {
  preview: StrokePreview;
  settings: Omit<BrushParams, "dabs">;
  dabs: number[];
  /** A pen's pressure per dab (null: a mouse). */
  pressure: number[] | null;
  /** The level the target locked at (Raise, Lower, Flatten), or null for a soft stroke; the level the
   *  stroke follows the cursor on. */
  target: number | null;
  plane: number;
  /** Where the cursor is, where the last dab was, when. */
  last: [number, number];
  dabAt: [number, number];
  lastDab: number;
  raf: number;
  /** Ground changed since it last went to the water, and when it last went. */
  drafted: Rect | null;
  draftAt: number;
  /** Straight lines: where the line starts. */
  anchor: [number, number] | null;
  /** The pen's pressure now (0–1), or null for a mouse. */
  pen: number | null;
  /** Smart Lower (D263): the tiles wet when the stroke began, and the bed a new channel would start
   *  at; the stroke is a deepening pass while its dabs stay in that water. Null otherwise. */
  channel: { wet: Uint8Array; bed: number } | null;
  /** When the land last answered with its juice. */
  feltAt: number;
  /** Keep (D322): the sources' ground as the stroke began. */
  sourceRuns: [number, number, number][];
}

/** Paints strokes with the brushes: the renderer's pointer tool while a brush is out. */
export class BrushPainter {
  private stroke: StrokeState | null = null;
  private cursorAt: [number, number] | null = null;
  /** The ground's level under the pointer (under a layer cut: at most the cut). */
  private hereLevel = 0;
  /** Ctrl is held over the land: a click takes its level. */
  private picking = false;
  /** Which end of the range Free was reached from (D322): scrolling back returns to that end. */
  private freeEnd: 1 | -1 = -1;
  /** A left-drag that began off the map: it paints from where it first reaches the map. */
  private waiting = false;
  /** Ctrl held on the button: a click samples a level, a drag selects. */
  private ctrl: { hit: TileHit; x: number; y: number; down: PointerEvent; handed: PointerTool | null } | null = null;
  /** F held (D205): the ring stays where it was and follows the pointer's distance; letting go or a
   *  click sets it. */
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
          // Ctrl+click: the land's level is the target (on water, its bed)
          if (hasTarget(host.settings().tool)) host.picked(self.levelAt(c.hit.x, c.hit.y));
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
          host.ring?.(null, null);
          host.note?.(null, null);
          return;
        }
        self.hereLevel = self.levelAt(hit.x, hit.y);
        self.picking = ev.ctrlKey || ev.metaKey;
        const p = host.renderer.pickAtLevel(ev.clientX, ev.clientY, host.renderer.heightAt(hit.x, hit.y));
        self.cursorAt = p ? [p.point[0], -p.point[2]] : [hit.x + 0.5, hit.y + 0.5];
        self.showCursor();
        self.say(ev);
      },
      // Shift+scroll (browsers turn a Shift+wheel sideways): Raise, Lower and Flatten's target
      // (D322); Smooth and Naturalize's strength (D196)
      wheel(ev) {
        if (!ev.shiftKey) return false;
        const s = host.settings();
        const up = (ev.deltaY || ev.deltaX) < 0 ? 1 : -1;
        const t = s.tool;
        if (!hasTarget(t) || !host.target) {
          host.strength(Math.max(1, Math.min(10, s.strength + up)), ev);
          return true;
        }
        const now = self.shownTarget() ?? followTarget(t, self.hereLevel);
        let next: number | "free";
        if (now === "free") next = up === -self.freeEnd ? (self.freeEnd < 0 ? 0 : BRUSH_MAX_LEVEL) : "free";
        else {
          const v = now + up;
          if (v >= 0 && v <= BRUSH_MAX_LEVEL) next = v;
          else if (t === "flatten") next = now;
          else {
            self.freeEnd = up;
            next = "free";
          }
        }
        host.target(next, ev);
        return true;
      },
    };
  }

  get painting(): boolean {
    return this.stroke !== null;
  }

  /** A click that set the size: its drag and release do nothing. */
  private swallow = false;

  /** The level of tile (x, y) for the brushes: the ground (on water, its bed), under a layer cut at
   *  most the cut (D207). */
  private levelAt(x: number, y: number): number {
    const cut = this.host.renderer.slice;
    return Math.min(this.host.renderer.heightAt(x, y), cut ?? BRUSH_MAX_LEVEL);
  }

  /** The target the brush shows now: the one set, or the one following the ground under the pointer
   *  (a stroke's own while it is painted). Null for Smooth and Naturalize. */
  private shownTarget(): number | "free" | null {
    const s = this.host.settings();
    if (this.stroke) return this.stroke.target ?? (hasTarget(this.stroke.settings.tool) ? "free" : null);
    if (!hasTarget(s.tool)) return null;
    if (s.target === "free") return s.tool === "flatten" ? followTarget("flatten", this.hereLevel) : "free";
    return s.target ?? followTarget(s.tool, this.hereLevel);
  }

  /** Whether a stroke starting at (x, y) now would be smart Lower's (in Both, from water). */
  private smart(x: number, y: number): boolean {
    const s = this.host.settings();
    return s.tool === "lower" && s.modes.lower === "both" && this.byWater(x, y);
  }

  /** The words beside the pointer: the target (D322), the level Ctrl+click takes, or while F is held
   *  the size. */
  private say(ev: PointerEvent | null): void {
    const h = this.host;
    if (this.resizing) return;
    if (this.stroke?.anchor) return;
    const s = h.settings();
    const at = this.stroke ? this.stroke.last : this.cursorAt;
    if (!at || !hasTarget(s.tool)) return h.note?.(null, null);
    if (this.picking && !this.stroke) return h.note?.(`level ${this.hereLevel}`, ev);
    if (this.stroke ? !!this.stroke.settings.channel : this.smart(at[0], at[1])) return h.note?.("channel", ev);
    const t = this.shownTarget();
    const tool = (this.stroke?.settings.tool ?? s.tool) as "raise" | "lower" | "flatten";
    h.note?.(t === null ? null : targetWords(tool, t), ev);
  }

  /** F went down (D205): the ring stays where it is, and its size follows the pointer. False when
   *  there is no ring on the map to size (the pointer off the map, a stroke in progress). */
  startResize(): boolean {
    if (this.stroke || !this.cursorAt || this.resizing) return false;
    const at: [number, number] = [this.cursorAt[0], this.cursorAt[1]];
    this.resizing = { at, level: this.host.renderer.heightAt(Math.floor(at[0]), Math.floor(at[1])), from: this.host.settings().size };
    this.host.resize?.(this.host.settings().size, null, false);
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
    this.say(null);
  }

  /** The ring's radius is the pointer's distance from its middle, on the ground at its level, in
   *  half tiles, up to the map's largest (D322, item 42). */
  private resizeTo(ev: PointerEvent): void {
    const r = this.resizing!;
    const p = this.host.renderer.pickAtLevel(ev.clientX, ev.clientY, r.level);
    if (!p) return;
    const d = Math.hypot(p.point[0] - r.at[0], -p.point[2] - r.at[1]);
    const size = Math.max(SIZE_MIN, Math.min(this.host.maxSize?.() ?? 24, Math.round(d * 2) / 2));
    if (size !== this.host.settings().size) this.host.resize?.(size, ev, false);
    this.showCursor();
  }

  /** Redraw the brush under the cursor (after a change of size, tool or target). */
  showCursor(): void {
    const at = this.stroke ? this.stroke.last : this.resizing ? this.resizing.at : this.cursorAt;
    if (!at) return;
    const s = this.host.settings();
    const tool = this.stroke ? (this.stroke.settings.tool as BrushTool) : s.tool;
    // smart Lower: blue where a stroke would carve a bed the water follows
    const water = this.stroke ? !!this.stroke.settings.channel : this.smart(at[0], at[1]);
    // the target's plane (D322): the level it works to
    const t = water ? null : this.shownTarget();
    const level = typeof t === "number" ? t : null;
    const clear = s.sources[tool] === "clear";
    this.host.renderer.setBrushCursor({ x: at[0], y: at[1], radius: s.size, tool, level, water, square: this.stroke ? this.stroke.settings.shape === "square" : s.square, ...(level !== null ? { hard: true } : {}), ...(clear ? { mark: true } : {}) });
    this.host.ring?.(at, this.stroke ? { settings: this.stroke.settings, dabs: this.stroke.dabs } : null);
    if (!this.stroke) this.say(null);
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

  /** Smart Lower's start (D263): the tiles wet now, and the bed a new channel starts at: a level
   *  below the surface of the water round (x, y), never below that water's own bed (the lowest
   *  ground round the first dab, as the stroke reads it). */
  private channelStart(x: number, y: number): { wet: Uint8Array; bed: number } {
    const h = this.host;
    const { W, H } = h;
    const wet = new Uint8Array(W * H);
    if (h.wet) for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) if (h.wet(tx, ty)) wet[ty * W + tx] = 1;
    const pre = h.terrain().pre;
    const shown = h.heights();
    const cx = Math.max(0, Math.min(W - 1, Math.floor(x)));
    const cy = Math.max(0, Math.min(H - 1, Math.floor(y)));
    let low = 255;
    let surface = -1;
    for (let ty = Math.max(0, cy - 1); ty <= Math.min(H - 1, cy + 1); ty++)
      for (let tx = Math.max(0, cx - 1); tx <= Math.min(W - 1, cx + 1); tx++) {
        const i = ty * W + tx;
        low = Math.min(low, pre[i]);
        if (wet[i]) surface = Math.max(surface, shown[i] + (h.depth?.(tx, ty) ?? 0));
      }
    const bed = surface < 0 ? low : Math.max(low, Math.round(surface) - 1);
    return { wet, bed: Math.max(0, Math.min(BRUSH_MAX_LEVEL, bed)) };
  }

  /** A mode's tiles (D322, item 2), fixed as the stroke starts from the map's own water: the wet
   *  tiles, and for Ground the dry tiles beside the water with the level of that water's surface
   *  (never lowered below it, so nothing spills). */
  private modeTiles(mode: "ground" | "water"): { wet: [number, number, number][]; bank?: [number, number, number, number][] } {
    const { W, H } = this.host;
    const surface = this.host.water?.() ?? null;
    const wetTiles: number[] = [];
    const bank: [number, number, number, number][] = [];
    if (!surface) return { wet: [], ...(mode === "ground" ? { bank } : {}) };
    for (let i = 0; i < W * H; i++) if (surface[i] === surface[i]) wetTiles.push(i);
    if (mode === "ground") {
      const shown = this.host.heights();
      for (let y = 0; y < H; y++) {
        let run: [number, number, number, number] | null = null;
        for (let x = 0; x <= W; x++) {
          let level = -1;
          const i = y * W + x;
          if (x < W && !(surface[i] === surface[i])) {
            let top = -Infinity;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const v = surface[ny * W + nx];
                if (v === v && v > top) top = v;
              }
            // (a hair's water over a lip doesn't hold it up)
            if (top > -Infinity) level = Math.min(shown[i], Math.max(0, Math.ceil(top - 0.05)));
          }
          if (run && run[3] === level && level >= 0) {
            run[2] = x;
            continue;
          }
          if (run) bank.push(run);
          run = level >= 0 ? [y, x, x, level] : null;
        }
      }
    }
    return { wet: tilesToRuns(wetTiles, W), ...(mode === "ground" ? { bank } : {}) };
  }

  hideCursor(): void {
    this.cursorAt = null;
    this.host.renderer.setBrushCursor(null);
    this.host.ring?.(null, null);
    this.host.note?.(null, null);
  }

  private begin(x: number, y: number, ev: PointerEvent): void {
    const h = this.host;
    const s = h.settings();
    let tool = s.tool;
    // Shift inverts: raise ↔ lower
    const inverted = ev.shiftKey && (tool === "raise" || tool === "lower");
    if (inverted) tool = tool === "raise" ? "lower" : "raise";
    const mode = s.modes[s.tool];
    // the game's layers (D207): under a cut, the brush works the visible land only: the ground above
    // the cut stays as it is, and nothing rises past it
    const cut = h.renderer.slice;
    const here = this.levelAt(Math.floor(x), Math.floor(y));
    const area = h.area?.() ?? null;
    // smart Lower (D184): in Both, a stroke that starts in or beside water carves a bed it follows
    const smart = tool === "lower" && mode === "both" && this.byWater(x, y);
    // the target (D322): the one set, or the ground's where the stroke starts; "free" is soft
    let target: number | null = null;
    if (hasTarget(tool) && !smart) {
      const set = s.target;
      if (set === "free" && tool !== "flatten") target = null;
      else if (typeof set === "number") target = set;
      else target = followTarget(tool, here);
      if (target !== null && tool === "raise" && cut !== null) target = Math.min(target, cut);
    }
    const keep: [number, number, number][] = [...(cut !== null ? above(h.heights(), cut, h.W) : [])];
    // Keep (D322, item 31): the sources and their ground stay exactly as they are
    const keepSources = s.sources[s.tool] === "keep";
    const sourceRuns = keepSources ? (h.sourceGround?.() ?? []) : [];
    keep.push(...sourceRuns);
    const stop = target === null && tool === "raise" && cut !== null ? Math.min(BRUSH_MAX_LEVEL, cut) : null;
    const settings: Omit<BrushParams, "dabs"> = {
      tool,
      size: s.size,
      strength: s.strength,
      ...(target !== null ? { target } : {}),
      ...(tool === "naturalize" ? { seed: (Math.random() * 0x7fffffff) | 0 } : {}),
      ...(s.square ? { shape: "square" as const } : {}),
      ...(tool === "flatten" && s.steps ? { steps: s.steps } : {}),
      ...(stop !== null ? { stop } : {}),
      ...(keep.length ? { keep } : {}),
      ...(sourceRuns.length ? { sources: "keep" as const } : {}),
      ...(area ? { area } : {}),
      ...(mode !== "both" ? { mode, ...this.modeTiles(mode) } : {}),
      ...(smart ? { channel: true } : {}),
    };
    // (D263: a deepening pass while it stays in the water it starts in; a new channel, from a level
    // below that water's surface, once it leaves it)
    const channel = settings.channel ? this.channelStart(x, y) : null;
    if (channel) Object.assign(settings, channel.wet[Math.floor(y) * h.W + Math.floor(x)] ? { deepen: true } : { bed: channel.bed, dry: 0 });
    const preview = new StrokePreview(settings, h.terrain(), h.heights(), h.W, h.H);
    // the stroke follows the cursor on the level it started on (a target's, for Flatten), so the
    // brush stays under the pointer while the ground rises or sinks beneath it
    const plane = tool === "flatten" && target !== null ? target : h.renderer.heightAt(Math.floor(x), Math.floor(y));
    const p = h.renderer.pickAtLevel(ev.clientX, ev.clientY, plane);
    const at: [number, number] = p ? [p.point[0], -p.point[2]] : [x, y];
    const pen = ev.pointerType === "pen" && target === null ? ev.pressure : null;
    this.stroke = {
      preview,
      settings,
      dabs: [],
      pressure: pen === null ? null : [],
      target,
      plane,
      last: at,
      dabAt: at,
      lastDab: performance.now(),
      raf: 0,
      drafted: null,
      draftAt: 0,
      anchor: s.straight ? at : null,
      pen,
      channel,
      feltAt: 0,
      sourceRuns,
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
    this.say(ev);
  }

  /** Straight lines: the stroke again, from where it started to the pointer, its length beside
   *  the pointer (D183). */
  private straight(ev: PointerEvent): void {
    const st = this.stroke!;
    const h = this.host;
    const back = st.preview.restore();
    if (back) h.renderer.updateTerrainRect(h.heights(), back);
    // (smart Lower, D263: the line starts again as it began, a deepening pass from inside the water)
    if (st.channel && st.anchor) {
      const { deepen: _d, bed: _b, dry: _y, ...rest } = st.settings;
      st.settings = st.channel.wet[Math.floor(st.anchor[1]) * h.W + Math.floor(st.anchor[0])] ? { ...rest, deepen: true } : { ...rest, bed: st.channel.bed, dry: 0 };
    }
    st.preview = new StrokePreview(st.settings, h.terrain(), h.heights(), h.W, h.H);
    st.dabs = [];
    if (st.pressure) st.pressure = [];
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
    // smart Lower (D263): a deepening pass whose dab leaves the water it began in is a new channel
    // from here on: the whole stroke again, its bed a level below that water's surface
    let dry = -1;
    if (st.channel && st.settings.deepen)
      for (let k = 0; k + 1 < add.length && dry < 0; k += 2) if (!st.channel.wet[Math.floor(add[k + 1] / 4) * h.W + Math.floor(add[k] / 4)]) dry = st.dabs.length / 2 + k / 2;
    st.dabs.push(...add);
    let pressure: number[] | undefined;
    if (st.pressure) {
      const v = Math.max(1, Math.min(255, Math.round((st.pen ?? 1) * 255)));
      pressure = points.map(() => v);
      st.pressure.push(...pressure);
    }
    st.lastDab = performance.now();
    st.dabAt = points[points.length - 1];
    let r: Rect | null;
    if (dry >= 0) {
      const { deepen: _deepen, ...rest } = st.settings;
      st.settings = { ...rest, bed: st.channel!.bed, dry };
      const back = st.preview.restore();
      st.preview = new StrokePreview(st.settings, h.terrain(), h.heights(), h.W, h.H);
      const again = st.preview.add(st.dabs, st.pressure ?? undefined);
      r = again && back ? { x0: Math.min(again.x0, back.x0), y0: Math.min(again.y0, back.y0), x1: Math.max(again.x1, back.x1), y1: Math.max(again.y1, back.y1) } : (again ?? back);
    } else r = st.preview.add(add, pressure);
    const changed = r && also ? { x0: Math.min(r.x0, also.x0), y0: Math.min(r.y0, also.y0), x1: Math.max(r.x1, also.x1), y1: Math.max(r.y1, also.y1) } : (r ?? also);
    if (changed) {
      h.renderer.updateTerrainRect(h.heights(), changed);
      const d = st.drafted;
      st.drafted = d ? { x0: Math.min(d.x0, changed.x0), y0: Math.min(d.y0, changed.y0), x1: Math.max(d.x1, changed.x1), y1: Math.max(d.y1, changed.y1) } : { ...changed };
      this.sendDraft(false);
      this.feel();
    }
    this.showCursor();
  }

  /** The land's answer (D205): at the stroke's first change, then now and then while it goes on. */
  private feel(): void {
    const st = this.stroke!;
    const now = performance.now();
    if (st.feltAt && now - st.feltAt < 380) return;
    const tool = st.settings.tool;
    this.host.feel?.(tool === "raise" || tool === "lower" ? tool : "shape", Math.floor(st.last[0]), Math.floor(st.last[1]), st.settings.size, st.feltAt !== 0);
    st.feltAt = now;
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

  /** Holding still keeps pressing a soft brush, thirty times a second; a target's stroke has done
   *  all it does (D322). */
  private loop(): void {
    const st = this.stroke;
    if (!st) return;
    st.raf = requestAnimationFrame(() => {
      if (this.stroke !== st) return;
      if (st.target === null && !st.anchor && performance.now() - st.lastDab >= 1000 / 30) this.dab([st.last]);
      this.sendDraft(false);
      this.loop();
    });
  }

  /** Objects ride a Flatten stroke's ground (D204): one standing on more than one tile moves with
   *  it when the stroke takes its whole footprint to one level; where the stroke's edge would leave
   *  it on a step, the stroke leaves that footprint's ground as it was (its `keep`), so nothing is
   *  left floating or buried. The stroke is painted again without those tiles. (A target's Raise and
   *  Lower have hard edges too: the same.) */
  private rideObjects(st: StrokeState): void {
    const h = this.host;
    if ((st.settings.tool !== "flatten" && st.target === null) || !h.footprints) return;
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
    const r = st.preview.add(st.dabs, st.pressure ?? undefined);
    const changed = r && back ? { x0: Math.min(r.x0, back.x0), y0: Math.min(r.y0, back.y0), x1: Math.max(r.x1, back.x1), y1: Math.max(r.y1, back.y1) } : (r ?? back);
    if (changed) h.renderer.updateTerrainRect(h.heights(), changed);
  }

  /** The pieces that ride the stroke whole (D249): each one it changed a tile of takes the level
   *  of its middle tile, as the build does with the stroke's `rigid` rectangles. */
  private rideWhole(st: StrokeState): void {
    const h = this.host;
    const b = st.preview.bounds;
    if (!b || !h.rides) return;
    const now = h.heights();
    const was = st.preview.start;
    const rigid = h.rides().filter(([x0, y0, x1, y1]) => {
      if (x1 < b.x0 - 1 || x0 > b.x1 + 1 || y1 < b.y0 - 1 || y0 > b.y1 + 1) return false;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (now[y * h.W + x] !== was[y * h.W + x]) return true;
      return false;
    });
    if (!rigid.length) return;
    st.settings = { ...st.settings, rigid };
    const r = st.preview.finish(rigid);
    if (r) h.renderer.updateTerrainRect(now, r);
  }

  /** The stroke's settings as its operation keeps them: its runs only where its dabs reach (kept
   *  tiles, a mode's wet tiles and banks), and none it doesn't need. */
  private recorded(st: StrokeState): Omit<BrushParams, "dabs"> {
    const h = this.host;
    const out = { ...st.settings };
    if (out.keep) {
      out.keep = inReach(out.keep, st.dabs, out.size, h.W, h.H);
      if (!out.keep.length) delete out.keep;
    }
    // (Keep: only while a source's ground is in its reach)
    if (out.sources === "keep" && (!out.keep || !inReach(st.sourceRuns, st.dabs, out.size, h.W, h.H).length)) delete out.sources;
    if (out.wet) out.wet = inReach(out.wet, st.dabs, out.size, h.W, h.H);
    if (out.bank) out.bank = inReach(out.bank, st.dabs, out.size, h.W, h.H);
    return out;
  }

  /** The button came up: the stroke becomes one operation. */
  end(): void {
    const st = this.stroke;
    if (!st) return;
    cancelAnimationFrame(st.raf);
    this.stroke = null;
    const h = this.host;
    this.rideObjects(st);
    this.rideWhole(st);
    h.painting(false);
    if (st.anchor) h.note?.(null, null);
    h.renderer.refreshShadows();
    const settings = this.recorded(st);
    // Keep's ground was held out of the integrity pass all over the map while it was painted: again
    // with only the kept tiles it keeps, as the build makes it
    if (st.settings.sources === "keep") {
      const back = st.preview.restore();
      st.settings = settings;
      st.preview = new StrokePreview(settings, h.terrain(), h.heights(), h.W, h.H);
      const r = st.preview.add(st.dabs, st.pressure ?? undefined);
      const changed = r && back ? { x0: Math.min(r.x0, back.x0), y0: Math.min(r.y0, back.y0), x1: Math.max(r.x1, back.x1), y1: Math.max(r.y1, back.y1) } : (r ?? back);
      if (changed) h.renderer.updateTerrainRect(h.heights(), changed);
    }
    const params: BrushParams = { ...settings, ...(st.pressure ? { pressure: st.pressure } : {}), dabs: st.dabs };
    const tiles = st.preview.changed();
    if (!tiles) {
      h.unchanged?.(params);
      this.showCursor();
      return;
    }
    const b = st.preview.bounds!;
    // (and the pieces that rode it whole, with the tile round them the ground's check reads)
    const f = st.preview.finished;
    const rect = { x0: Math.max(0, Math.min(b.x0, f ? f.x0 : b.x0) - 1), y0: Math.max(0, Math.min(b.y0, f ? f.y0 : b.y0) - 1), x1: Math.min(h.W - 1, Math.max(b.x1, f ? f.x1 : b.x1) + 1), y1: Math.min(h.H - 1, Math.max(b.y1, f ? f.y1 : b.y1) + 1) };
    const before = h.terrain();
    const shown = h.heights();
    const stroke: Stroke = {
      params,
      label: `${BRUSH_NAMES[st.settings.tool as BrushTool]}, ${tiles} tile${tiles === 1 ? "" : "s"}`,
      rect,
      before: { shown: cut(st.preview.start, rect, h.W), pre: cut(before.pre, rect, h.W) },
      after: { shown: cut(shown, rect, h.W), pre: cut(st.preview.pre, rect, h.W) },
    };
    h.commit(stroke, st.preview.pre, st.preview.protect);
    this.showCursor();
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

/** The runs a stroke's dabs can reach (a brush's radius and a tile round its dabs), cut to that
 *  reach; a run's own extra values (a bank's level) go with it. */
function inReach<T extends [number, number, number, ...number[]]>(runs: readonly T[], dabs: readonly number[], size: number, W: number, H: number): T[] {
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
  const out: T[] = [];
  for (const run of runs) {
    const [y, a, b] = run;
    if (y < ty0 || y > ty1 || b < tx0 || a > tx1) continue;
    out.push([y, Math.max(a, tx0), Math.min(b, tx1), ...run.slice(3)] as unknown as T);
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

