// Juice (PLAN §20 D205 (2), D212, D220): small, satisfying feedback on every action, like Townscaper's
// and Dorfromantik's. The land's part is the renderer's (render3d/effects.ts, render3d/forces.ts): a
// puff of dust when ground is lowered, rings when a source starts, a pop and a wiggle when something
// is placed, the forces' moments; it leaves out with reduced motion. The sound's part is one engine
// for the editor's lifetime (juice/engine.ts, Codex's synthesised sounds, #58): earth lifting or
// crumbling under a brush for as long as the stroke lasts, a wooden pop for a tree, a gurgle for a
// source, a poof for Remove, a soft rewind for undo, and each force's own (a torrent for Carve, a
// whistle and an impact for Craterize, a rumble and a crack for Quake, grinding for its Slide, a
// rumble, a rising plume and a cooling hiss for Erupt). On by default and quiet, with a volume and an
// off switch the player keeps; water ambience is off unless turned on. Nothing waits on any of it.

import type { MapRenderer } from "../render3d";
import type { ForceCue } from "../core/forces/runs";
import { JuiceEngine } from "./juice/engine";
import type { SoundParams } from "./juice/synth";

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
export const DEFAULT_SOUND: SoundSettings = { on: true, volume: 0.5, ambience: false };

export function loadSound(): SoundSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SOUND_KEY) ?? "null") as Partial<SoundSettings> | null;
    if (!s) return DEFAULT_SOUND;
    return { on: s.on !== false, volume: typeof s.volume === "number" && Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : DEFAULT_SOUND.volume, ambience: s.ambience === true };
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

/** The engine's master volume for the player's: the default (0.5) is the engine's quiet 0.22. A
 *  player's saved volume keeps its meaning. */
export const engineVolume = (volume: number) => Math.max(0, Math.min(1, volume)) * 0.44;

/** A sound's size from a thing's width in tiles. */
export const soundSize = (tiles: number) => Math.max(0, Math.min(1, Math.log2(1 + Math.max(0, tiles)) / 6));

/** An accent of the same kind no sooner than this after the last one (ms). */
const GAP: Record<JuiceKind, number> = { raise: 140, lower: 160, shape: 220, place: 60, source: 200, remove: 80 };

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
  play(name: string, params?: Partial<SoundParams>, o?: { id?: string | number; phase?: string }): string | number | null;
  start(name: string, params?: Partial<SoundParams>, id?: string | number): string | number | null;
  update(id: string | number | null, params: Partial<SoundParams>): void;
  stop(id: string | number | null): void;
  stopAll(): void;
  setSettings(s: Partial<{ enabled: boolean; volume: number; ambience: boolean }>): void;
  pause(): void;
  dispose(): Promise<void> | void;
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
  }

  setSound(s: SoundSettings): void {
    this.settings = s;
    saveSound(s);
    this.engine.setSettings({ enabled: s.on, volume: engineVolume(s.volume), ambience: s.ambience === true });
  }

  /** Where tile (x, y) is from the camera, for a sound's distance and pan. */
  private place(x: number, y: number): Partial<SoundParams> {
    return this.renderer()?.soundPlace?.(x, y) ?? {};
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
    const p = { ...this.place(x, y), size: soundSize(size), strength, activity: 1 };
    if (this.stroke === null) this.stroke = this.engine.start(sound, p, "stroke");
    else this.engine.update(this.stroke, p);
  }

  /** The stroke ended (or was taken back, or the tool changed): its texture stops. */
  strokeEnd(): void {
    if (this.stroke !== null) this.engine.stop(this.stroke);
    this.stroke = null;
  }

  /** Undo: a soft rewind (once, after the undo happened). */
  undo(): void {
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
        once("incoming", () => this.engine.play("craterize", p, { id, phase: "incoming" }));
        if (cue.phase === "impact" || cue.phase === "done") once("impact", () => this.engine.play("craterize", p, { id, phase: "impact" }));
        break;
      case "quake":
        if (cue.phase !== "done") hold("quake", "rumble", p);
        if (cue.phase === "crack" || cue.phase === "slide") once("crack", () => this.engine.play("quake", p, { id, phase: "crack" }));
        if (cue.phase === "slide") hold("slide", "grind", { ...p, activity: 1 });
        break;
      case "erupt":
        if (cue.phase !== "done") hold("erupt", "rumble", p);
        if (cue.phase === "rise") once("plume", () => this.engine.play("erupt", p, { id, phase: "plume" }));
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
    if (!kept) this.engine.stop(`force-${f.run}`);
    else if (f.verb === "erupt" && last) this.engine.play("erupt", { ...this.place(last.x, last.y), size: soundSize(last.size), strength: 0.3 + (0.7 * last.power) / 100 }, { id: `force-${f.run}-cool`, phase: "cool" });
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
