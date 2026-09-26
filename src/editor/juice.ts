// Juice (PLAN §20 D205 (2)): small, satisfying feedback on every action, like Townscaper's and
// Dorfromantik's. A soft thud as land rises, a puff of dust when it is lowered, a pop and a little
// wiggle when something is placed, a gentle splash when a source starts. The sounds are made here
// with Web Audio (never the game's), quiet, with a volume and an off switch the player keeps; the
// land's effects are the renderer's (render3d/effects.ts), and leave out with reduced motion.
// Everything is fire and forget: nothing waits on it, and a sound too soon after the same one is
// skipped rather than piled up.

import type { MapRenderer } from "../render3d";

export type JuiceKind = "raise" | "lower" | "shape" | "place" | "source" | "remove";

/** A force's own touch (Carve, Craterize, Quake, Erupt; D203, D206): it registers it here, on the
 *  shared core, and calls `juice.play(id, …)`. */
export type JuiceTouch = (ctx: { audio: AudioContext | null; out: GainNode | null; renderer: MapRenderer; x: number; y: number; size: number }) => void;

/** Carve's touch (D199): a low rumble of water and falling earth, louder for a wider river, and a
 *  puff of dust at its head (the surge itself is the renderer's). */
export const carveTouch: JuiceTouch = ({ audio: a, out, renderer, x, y, size }) => {
  renderer.puff(x, y, Math.min(4, size * 0.6));
  if (!a || !out) return;
  const t = a.currentTime + 0.005;
  const n = Math.floor(a.sampleRate * 0.5);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  let seed = (x * 73856093) ^ (y * 19349663);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    d[i] = (seed / 4294967296) * 2 - 1;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(320, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 0.45);
  const g = a.createGain();
  const peak = 0.25 + 0.45 * Math.min(1, size / 10);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.5);
};

export interface SoundSettings {
  on: boolean;
  /** 0–1. */
  volume: number;
}

const SOUND_KEY = "dgm.sound";
export const DEFAULT_SOUND: SoundSettings = { on: true, volume: 0.5 };

export function loadSound(): SoundSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SOUND_KEY) ?? "null") as Partial<SoundSettings> | null;
    if (!s) return DEFAULT_SOUND;
    return { on: s.on !== false, volume: typeof s.volume === "number" ? Math.max(0, Math.min(1, s.volume)) : DEFAULT_SOUND.volume };
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

/** The loudest a sound gets at full volume: quiet, under the page's own sounds. */
const LOUDNESS = 0.22;
/** A sound of a kind no sooner than this after the last one (ms). */
const GAP: Record<JuiceKind, number> = { raise: 140, lower: 160, shape: 220, place: 60, source: 200, remove: 80 };

export class Juice {
  private audio: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private touches = new Map<string, JuiceTouch>();
  private gaps = new Map<string, number>();
  settings: SoundSettings;

  constructor(
    private readonly renderer: () => MapRenderer | null,
    settings: SoundSettings = loadSound(),
  ) {
    this.settings = settings;
  }

  setSound(s: SoundSettings): void {
    this.settings = s;
    saveSound(s);
    if (this.out) this.out.gain.value = s.volume * LOUDNESS;
  }

  /** A force's touch, under its id (the forces call `play(id, …)`), no sooner than `gap` ms after
   *  the last. */
  register(id: string, touch: JuiceTouch, gap = 120): void {
    this.touches.set(id, touch);
    this.gaps.set(id, gap);
  }

  /** Feedback for an action at tile (x, y), `size` tiles across: its sound and its effect on the
   *  land. `soft`: the same action going on (a stroke still painting), a little quieter. */
  play(kind: JuiceKind | string, x: number, y: number, size = 1, soft = false): void {
    const now = performance.now();
    const gap = GAP[kind as JuiceKind] ?? this.gaps.get(kind) ?? 120;
    if (now - (this.last.get(kind) ?? -Infinity) < gap) return;
    this.last.set(kind, now);
    const r = this.renderer();
    const touch = this.touches.get(kind);
    if (touch) {
      if (r) touch({ audio: this.ctx(), out: this.out, renderer: r, x, y, size });
      return;
    }
    // the land's part
    if (r) {
      if (kind === "lower") r.puff(x, y, size);
      else if (kind === "source") r.ripple(x, y);
      else if (kind === "place") r.wiggle([y * (r.mapState()?.W ?? 0) + x]);
    }
    // the sound's part
    const a = this.ctx();
    if (!a || !this.out) return;
    const v = soft ? 0.55 : 1;
    const t = a.currentTime + 0.005;
    switch (kind) {
      case "raise":
        this.thud(a, t, v);
        break;
      case "lower":
        this.dust(a, t, v);
        break;
      case "shape":
        this.brush(a, t, v * 0.7);
        break;
      case "place":
        this.pop(a, t, v);
        break;
      case "source":
        this.splash(a, t, v);
        break;
      case "remove":
        this.whuff(a, t, v);
        break;
    }
  }

  /** The audio, made at the first sound (after the player's first click, as browsers ask). */
  private ctx(): AudioContext | null {
    if (!this.settings.on || this.settings.volume <= 0) return null;
    if (!this.audio) {
      const A = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
      if (!A) return null;
      try {
        this.audio = new A();
      } catch {
        return null;
      }
      this.out = this.audio.createGain();
      this.out.gain.value = this.settings.volume * LOUDNESS;
      this.out.connect(this.audio.destination);
      // white noise, a second of it, for the dust, the splash and the brush
      const n = this.audio.sampleRate;
      this.noise = this.audio.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        d[i] = (seed / 4294967296) * 2 - 1;
      }
    }
    if (this.audio.state === "suspended") void this.audio.resume();
    return this.audio;
  }

  /** An envelope: up in `attack` seconds to `peak`, then down over `decay`. */
  private env(a: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.out!);
    return g;
  }

  private noiseThrough(a: AudioContext, t: number, filter: BiquadFilterNode, g: GainNode, dur: number): void {
    const src = a.createBufferSource();
    src.buffer = this.noise;
    src.connect(filter);
    filter.connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
  }

  /** Land rising: a soft, low thud. */
  private thud(a: AudioContext, t: number, v: number): void {
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = this.env(a, t, 0.9 * v, 0.006, 0.24);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.3);
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    this.noiseThrough(a, t, f, this.env(a, t, 0.35 * v, 0.004, 0.09), 0.12);
  }

  /** Land lowered: a dry puff of dust. */
  private dust(a: AudioContext, t: number, v: number): void {
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    f.Q.value = 0.7;
    this.noiseThrough(a, t, f, this.env(a, t, 0.5 * v, 0.02, 0.26), 0.32);
  }

  /** Flatten, smooth, naturalize: the soft sweep of a brush over earth. */
  private brush(a: AudioContext, t: number, v: number): void {
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    this.noiseThrough(a, t, f, this.env(a, t, 0.4 * v, 0.03, 0.16), 0.22);
  }

  /** Something placed: a small, bright pop. */
  private pop(a: AudioContext, t: number, v: number): void {
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.06);
    const g = this.env(a, t, 0.55 * v, 0.004, 0.11);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.16);
  }

  /** A source starting: a gentle splash and a few drops. */
  private splash(a: AudioContext, t: number, v: number): void {
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    f.Q.value = 1.2;
    this.noiseThrough(a, t, f, this.env(a, t, 0.45 * v, 0.015, 0.4), 0.5);
    for (const [dt, hz] of [
      [0.09, 1250],
      [0.17, 1580],
      [0.26, 1100],
    ]) {
      const o = a.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(hz, t + dt);
      o.frequency.exponentialRampToValueAtTime(hz * 1.6, t + dt + 0.05);
      const g = this.env(a, t + dt, 0.18 * v, 0.003, 0.07);
      o.connect(g);
      o.start(t + dt);
      o.stop(t + dt + 0.1);
    }
  }

  /** Something removed: a soft, falling whuff. */
  private whuff(a: AudioContext, t: number, v: number): void {
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    this.noiseThrough(a, t, f, this.env(a, t, 0.4 * v, 0.01, 0.2), 0.25);
  }

  dispose(): void {
    void this.audio?.close();
    this.audio = null;
    this.out = null;
  }
}
