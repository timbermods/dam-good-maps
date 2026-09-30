// Juice (PLAN §20 D205 (2), D212, D220, D226): small, satisfying feedback on every action, like
// Townscaper's and Dorfromantik's. The land's part is the renderer's (render3d/effects.ts,
// render3d/forces.ts): a puff of dust when ground is lowered, rings when a source starts, a pop and
// a wiggle when something is placed, the forces' moments; it leaves out with reduced motion. The
// sound's part is one engine for the editor's lifetime (juice/engine.ts: Codex's second round, #64,
// recorded CC0 foley with a crisp, musical reward): a brush's recorded bed for as long as its stroke
// changes the land (packed earth, loose stone, a mineral scrape, leaves), an accent for each thing
// placed by its material (hollow wood for a tree, damped metal for a ruin, a splash for a source),
// an earth puff for a delete, a reversed wooden catch for undo, and each force's own, phase by phase
// (a torrent for Carve; a breath, a crack, a boom and falling stone for Craterize; a fault's crack and
// grind for Quake; pressure, a roaring plume and a cooling hiss for Erupt; grinding ice, slow cracks
// and falling meltwater for Glaciate). Repeats climb a small
// musical ladder and reset after a pause. On by default at the mix's own clearly audible level
// (D226), limited and never harsh, with a volume and an off switch the player keeps; water ambience
// is off unless turned on. Nothing waits on any of it: the bank loads on the first click or key.

import type { MapRenderer } from "../render3d";
import type { ForceCue } from "../core/forces/runs";
import { JuiceEngine } from "./juice/engine";
import type { SoundParams } from "./juice/palette";
import { DEFAULTS as MIX_DEFAULTS } from "./juice/palette";

export type JuiceKind = "raise" | "lower" | "shape" | "place" | "source" | "remove";

/** A brush's own sound while it paints (Flatten, Smooth and Naturalize each have theirs). */
export type StrokeSound = "raise" | "lower" | "flatten" | "smooth" | "naturalize" | "remove" | "tree" | "berry";

export interface SoundSettings {
  on: boolean;
  /** 0–1. */
  volume: number;
  /** Water ambience (a waterfall or a stream near the view): off unless the player turns it on. */
  ambience?: boolean;
}

const SOUND_KEY = "dgm.sound";
/** On, at the round-two mix's own clearly audible level, a quarter lower than its first release
 *  (0.54: its everyday actions near −25.5 dBFS, its forces near −19; D226, D313), water ambience
 *  off. A saved volume is kept exactly; only a fresh player gets the new default. */
export const DEFAULT_SOUND: SoundSettings = { on: MIX_DEFAULTS.enabled, volume: MIX_DEFAULTS.volume, ambience: MIX_DEFAULTS.ambience };

const unit = (v: number) => Math.max(0, Math.min(1, v));

/** The player's choice as saved (on or off, the volume), kept as it is; a fresh player gets the
 *  default. */
export function loadSound(): SoundSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SOUND_KEY) ?? "null") as Partial<SoundSettings> | null;
    if (!s) return DEFAULT_SOUND;
    return { on: s.on !== false, volume: typeof s.volume === "number" && Number.isFinite(s.volume) ? unit(s.volume) : DEFAULT_SOUND.volume, ambience: s.ambience === true };
  } catch {
    return DEFAULT_SOUND;
  }
}

export function saveSound(s: SoundSettings): void {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(s));
  } catch {
    // kept for this visit only
  }
}

/** The engine's master volume for the player's (the same, 0–1). */
export const engineVolume = (volume: number) => unit(volume);

/** A sound's distance for the engine (0–8) from where it is in the view (0–1: on screen, near;
 *  far off it, 1): what is being edited plays at its full level at any zoom. */
export const engineDistance = (view: number) => unit(view) * 3;

/** A sound's size from a thing's width in tiles. */
export const soundSize = (tiles: number) => Math.max(0, Math.min(1, Math.log2(1 + Math.max(0, tiles)) / 6));

/** An accent of the same kind no sooner than this after the last one (ms). */
const GAP: Record<JuiceKind, number> = { raise: 140, lower: 160, shape: 220, place: 120, source: 200, remove: 80 };

/** The accent for a placed object. */
export function placeSound(template: string | undefined): "tree" | "berry" | "ruin" | "mine" | "start" {
  if (!template) return "tree";
  if (/^(Pine|Birch|Oak|Succulent|Maple|ChestnutTree|Mangrove|Coffee)/.test(template)) return "tree";
  if (/Bush|Berr/.test(template)) return "berry";
  if (template === "StartingLocation") return "start";
  if (template === "UndergroundRuins") return "mine";
  return "ruin";
}

/** The part of the engine the editor uses (the tests give a fake). */
export interface SoundEngine {
  unlock(): Promise<boolean>;
  play(name: string, params?: Partial<SoundParams>, o?: { id?: string | number; phase?: string; span?: number }): string | number | null;
  start(name: string, params?: Partial<SoundParams>, id?: string | number): string | number | null;
  update(id: string | number | null, params: Partial<SoundParams>): void;
  stop(id: string | number | null): void;
  stopAll(): void;
  setSettings(s: Partial<{ enabled: boolean; volume: number; ambience: boolean }>): void;
  /** Get ready as the editor opens (silent). */
  prepare?(): void;
  pause(): void;
  dispose(): Promise<void> | void;
  /** Decoded and running (tests). */
  readonly ready?: boolean;
  /** Recordings playing now (tests). */
  readonly playing?: number;
}

export class Juice {
  private last = new Map<string, number>();
  settings: SoundSettings;
  private readonly engine: SoundEngine;
  /** The brush stroke's texture, while it paints. */
  private stroke: string | number | null = null;
  /** The force at work's sounds: its run's number, its textures and the phases already played. */
  private force: { run: number; verb: string; ids: string[]; played: Set<string>; puffAt: number } | null = null;
  private runs = 0;
  private readonly unlock = () => void this.engine.unlock();
  private readonly blur = () => this.engine.pause();

  constructor(
    private readonly renderer: () => MapRenderer | null,
    settings: SoundSettings = loadSound(),
    engine?: SoundEngine,
  ) {
    this.settings = settings;
    this.engine = engine ?? new JuiceEngine({ enabled: settings.on, volume: engineVolume(settings.volume), ambience: settings.ambience === true });
    // the first click or key opens the sound (as browsers ask); leaving the page pauses it
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", this.unlock, true);
      window.addEventListener("keydown", this.unlock, true);
      window.addEventListener("blur", this.blur);
    }
    // the audio device opens while the editor opens (the page is busy loading then, and nothing can
    // be done yet), never on a gesture or in the middle of one: making a page's first audio context
    // blocks it for a few hundred milliseconds; it stays silent (suspended until a gesture)
    this.engine.prepare?.();
  }

  setSound(s: SoundSettings): void {
    this.settings = s;
    saveSound(s);
    this.engine.setSettings({ enabled: s.on, volume: engineVolume(s.volume), ambience: s.ambience === true });
  }

  /** Where tile (x, y) is in the view, for a sound's distance and pan. */
  private place(x: number, y: number): Partial<SoundParams> {
    const at = this.renderer()?.soundPlace?.(x, y);
    return at ? { distance: engineDistance(at.distance), pan: at.pan } : {};
  }

  /** Feedback for an action at tile (x, y), `size` tiles across: its sound and its effect on the
   *  land. `soft`: the same action going on (a stroke still painting). `what`: the object placed,
   *  or "badwater" for a badwater source. */
  play(kind: JuiceKind, x: number, y: number, size = 1, soft = false, what?: string): void {
    const now = performance.now();
    if (now - (this.last.get(kind) ?? -Infinity) < GAP[kind]) return;
    this.last.set(kind, now);
    // the land's part
    const r = this.renderer();
    if (r) {
      if (kind === "lower") r.puff(x, y, size);
      else if (kind === "source") r.ripple(x, y);
      else if (kind === "place") r.wiggle([y * (r.mapState()?.W ?? 0) + x]);
    }
    // the sound's part: an accent (a stroke's is its texture, `strokeSound`)
    const p = { ...this.place(x, y), size: soundSize(size) };
    if (kind === "place") this.engine.play(placeSound(what), p);
    else if (kind === "source") this.engine.play(what === "badwater" ? "badwater" : "water", p);
    else if (kind === "remove") this.engine.play("remove", p);
    else if (!soft && this.stroke === null) this.engine.play(kind === "shape" ? "flatten" : kind, p);
  }

  /** A brush stroke's texture: from its first change of the land, for as long as it paints
   *  (`strength` 0–1). */
  strokeSound(sound: StrokeSound, x: number, y: number, size: number, strength = 0.4): void {
    // (a grove or a patch painted: a quiet leaf bed while it paints, its accents one a batch)
    const foliage = sound === "tree" || sound === "berry";
    const p = { ...this.place(x, y), size: soundSize(size), strength: foliage ? 0.3 : strength, activity: 1 };
    if (this.stroke === null) this.stroke = this.engine.start(foliage ? "naturalize" : sound, p, "stroke");
    else this.engine.update(this.stroke, p);
  }

  /** The stroke ended (or was taken back, or the tool changed): its texture stops. */
  strokeEnd(): void {
    if (this.stroke !== null) this.engine.stop(this.stroke);
    this.stroke = null;
  }

  /** Undo: a soft rewind (once, after the undo happened; a stroke's bed stops first). */
  undo(): void {
    this.strokeEnd();
    this.engine.play("undo", { size: 0.3, strength: 0.4 });
  }

  /** A force's moment (its frame's cue): its sounds as it goes, each phase once. */
  forceMoment(cue: ForceCue, head?: { x: number; y: number; width: number; cut: number }): void {
    if (!this.force || this.force.verb !== cue.verb) this.force = { run: ++this.runs, verb: cue.verb, ids: [], played: new Set(), puffAt: 0 };
    const f = this.force;
    const id = `force-${f.run}`;
    const p = { ...this.place(cue.x, cue.y), size: soundSize(cue.size), strength: 0.3 + (0.7 * cue.power) / 100 };
    const once = (phase: string, act: () => void) => {
      if (f.played.has(phase)) return;
      f.played.add(phase);
      act();
    };
    const hold = (name: string, key: string, params: Partial<SoundParams>) => {
      const k = `${id}-${key}`;
      if (!f.ids.includes(k)) {
        if (this.engine.start(name, params, k) !== null) f.ids.push(k);
      } else this.engine.update(k, params);
    };
    switch (cue.verb) {
      case "carve": {
        const cutting = (head?.cut ?? 0) > 0;
        if (cue.phase !== "done") hold("carve", "torrent", { ...p, activity: cutting ? 1 : 0.35 });
        // a puff of dust at the head now and then while it cuts (not with reduced motion)
        const now = performance.now();
        if (cutting && head && now - f.puffAt > 380) {
          f.puffAt = now;
          this.renderer()?.puff(Math.round(head.x), Math.round(head.y), Math.min(4, head.width * 0.6));
        }
        break;
      }
      case "craterize":
        // the breath as it falls, the crack and the boom as it strikes, the stone as the debris lands
        once("incoming", () => this.engine.play("craterize", p, { id, phase: "incoming" }));
        if (cue.phase === "impact" || cue.phase === "done") once("impact", () => this.engine.play("craterize", p, { id, phase: "impact" }));
        if ((cue.phase === "impact" && cue.progress >= 0.25) || cue.phase === "done") once("debris", () => this.engine.play("craterize", p, { id, phase: "debris" }));
        break;
      case "quake":
        // a low bed while the fault is drawn and moves; the crack once as it opens; a Slide's grind
        if (cue.phase !== "done") hold("quake", "rumble", p);
        if (cue.phase === "crack" || cue.phase === "slide") once("crack", () => this.engine.play("quake", p, { id, phase: "crack" }));
        if (cue.phase === "slide") {
          once("slide", () => this.engine.play("slide", p, { id: `${id}-slide` }));
          hold("slide", "grind", { ...p, activity: 1 });
        }
        break;
      case "glaciate": {
        // the ice's grind held while it advances, its cracks once; the meltwater as it retreats, ending
        // as the land settles (D344, A7: each phase fitted to its showing, `cue.pace`)
        const seconds = cue.glaciate?.seconds ?? 0;
        const pace = cue.pace && cue.pace > 0 ? cue.pace : 1;
        if (cue.phase === "advance") {
          once("advance", () => this.engine.play("glaciate", p, { id, phase: "advance", span: Math.max(0, 3 - seconds) / pace }));
          hold("glaciate", "grind", { ...p, activity: 1 });
        }
        if (cue.phase === "retreat" || cue.phase === "done") {
          const k = `${id}-grind`;
          if (f.ids.includes(k)) {
            this.engine.stop(k);
            f.ids.splice(f.ids.indexOf(k), 1);
          }
          // (already at its end, the land settled: no meltwater after it)
          if (cue.phase === "retreat") once("retreat", () => this.engine.play("glaciate", p, { id, phase: "retreat", span: Math.max(0, 5 - seconds) / pace }));
        }
        break;
      }
      case "erupt":
        // pressure as the ground stirs; the plume as it rises, its roar held while the volcano
        // swells, released for the cooling hiss when it is kept
        once("rumble", () => this.engine.play("erupt", p, { id, phase: "rumble" }));
        if (cue.phase === "rise") {
          once("plume", () => this.engine.play("erupt", p, { id, phase: "plume" }));
          hold("erupt", "plume", { ...p, activity: 0.55 + 0.45 * cue.progress });
        }
        break;
    }
  }

  /** The force is over: kept (its tails: an eruption's cooling hiss) or dropped (every sound of it
   *  stops at once, and none of it plays later). */
  forceEnded(kept: boolean, last?: ForceCue): void {
    const f = this.force;
    this.force = null;
    if (!f) return;
    for (const k of f.ids) this.engine.stop(k);
    // (a glacier's sounds end as its land settles, D344 A7: kept at its end, or skipped to it)
    if (!kept || f.verb === "glaciate") {
      this.engine.stop(`force-${f.run}`);
      this.engine.stop(`force-${f.run}-slide`);
    } else if (f.verb === "erupt" && last) this.engine.play("erupt", { ...this.place(last.x, last.y), size: soundSize(last.size), strength: 0.3 + (0.7 * last.power) / 100 }, { id: `force-${f.run}`, phase: "cool" });
  }

  /** The sound as it is now (tests): the bank ready, and how many recordings are playing. */
  status(): { ready: boolean; playing: number } {
    return { ready: !!this.engine.ready, playing: this.engine.playing ?? 0 };
  }

  dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.unlock, true);
      window.removeEventListener("keydown", this.unlock, true);
      window.removeEventListener("blur", this.blur);
    }
    this.strokeEnd();
    void this.engine.dispose();
  }
}
