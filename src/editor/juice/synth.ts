// The editor's sounds (PLAN §20 D205, D212, D220), synthesised as they play: original procedural
// synthesis, no samples, recordings or media files. Ported from investigation/juice `synth.js` (PR
// #58). It runs unchanged in the AudioWorklet (worklet.ts) and in the tests: accents (a tree's pop,
// an impact) are a few layers of filtered noise and tones; sustained textures (a brush stroke, a
// carve's torrent, a quake's rumble) hold until stopped. Bounded: 64 voices, four sustained groups,
// twelve voices kept for textures, whole accents dropped rather than queued; a soft limiter keeps the
// output below full scale at any volume.

export interface SynthSettings {
  enabled: boolean;
  /** The master volume, 0–1. */
  volume: number;
  /** Water ambience (a nearby waterfall or stream): off unless the player turns it on. */
  ambience: boolean;
}

export const SYNTH_DEFAULTS: Readonly<SynthSettings> = Object.freeze({ enabled: true, volume: 0.22, ambience: false });
export const MAX_VOICES = 64;

/** Every sound: its name, its words, and its group. */
export const SOUNDS = Object.freeze([
  ["raise", "Raise", "Soft earth, lifting", "Brushes"],
  ["lower", "Lower", "A gentle crumble", "Brushes"],
  ["flatten", "Flatten", "A smooth earthen scrape", "Brushes"],
  ["smooth", "Smooth", "A soft sweep of air", "Brushes"],
  ["naturalize", "Naturalize", "Dry leaves and fine earth", "Brushes"],
  ["remove", "Remove", "A little disappearing poof", "Brushes"],
  ["tree", "Tree", "Wooden pop, leafy finish", "Objects"],
  ["berry", "Berry bush", "A small, leafy pluck", "Objects"],
  ["ruin", "Ruin", "A muted, weathered clank", "Objects"],
  ["mine", "Mine site", "A weighty wooden clunk", "Objects"],
  ["start", "Start", "A gentle settling thump", "Objects"],
  ["water", "Water source", "A clear bubbling gurgle", "Objects"],
  ["badwater", "Badwater source", "A darker, murkier gurgle", "Objects"],
  ["carve", "Carve", "Rushing water and crumbling banks", "Forces"],
  ["craterize", "Craterize", "Whistle, impact, falling debris", "Forces"],
  ["quake", "Quake · Lift", "Low rumble and a fault-line crack", "Forces"],
  ["slide", "Quake · Slide", "Rumble, crack and grinding earth", "Forces"],
  ["erupt", "Erupt", "Rumble, rising plume, cooling hiss", "Forces"],
  ["undo", "Undo", "A soft rewind", "Editing"],
  ["waterfall", "Waterfall", "A soft rush of falling water", "Ambience"],
  ["stream", "Stream", "A quiet trickle over stones", "Ambience"],
] as const);

export type SoundName = (typeof SOUNDS)[number][0];

const known = new Set<string>(SOUNDS.map((s) => s[0]));
const sustained = new Set<string>(["raise", "lower", "flatten", "smooth", "naturalize", "remove", "tree", "berry", "carve", "waterfall", "stream", "erupt", "quake", "slide"]);
const TAU = 2 * Math.PI;

export const clamp = (v: number | undefined, lo: number, hi: number, fallback = lo) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v!)) : fallback);

/** A sound's parameters, normalised: size, strength, distance and activity 0–1, pan −1–1. */
export interface SoundParams {
  size: number;
  strength: number;
  distance: number;
  pan: number;
  activity: number;
}

export function parameters(p: Partial<SoundParams> = {}): SoundParams {
  return {
    size: clamp(p.size, 0, 1, 0.35),
    strength: clamp(p.strength, 0, 1, 0.4),
    distance: clamp(p.distance, 0, 1, 0),
    pan: clamp(p.pan, -1, 1, 0),
    activity: clamp(p.activity, 0, 1, 1),
  };
}

export const distanceGain = (d: number) => 1 / (1 + 7 * d * d);

// type, delay, duration, level, start Hz, end Hz, lowpass Hz, attack seconds.
type Layer = [type: "noise" | "tone", delay: number, duration: number, level: number, f0: number, f1: number, cutoff: number, attack: number];
const noise = (at: number, len: number, level: number, hz: number, end = hz, attack = 0.025): Layer => ["noise", at, len, level, hz, end, hz, attack];
const tone = (at: number, len: number, level: number, hz: number, end = hz, attack = 0.008): Layer => ["tone", at, len, level, hz, end, 2800, attack];
const later = (l: Layer, dt: number): Layer => [l[0], l[1] + dt, l[2], l[3], l[4], l[5], l[6], l[7]];

function recipe(name: string, rng: () => number, phase?: string): Layer[] {
  const crumble = (at: number, count = 6) => Array.from({ length: count }, (_, i) => noise(at + i * 0.082 + rng() * 0.05, 0.09 + rng() * 0.12, 0.1 + rng() * 0.055, 450 + rng() * 1000, 180));
  switch (name) {
    case "raise":
      return [tone(0, 0.24, 0.25, 118, 58), noise(0.015, 0.34, 0.26, 700, 160)];
    case "lower":
      return [noise(0, 0.28, 0.34, 950, 220), ...crumble(0.04, 3)];
    case "flatten":
      return [noise(0, 0.45, 0.33, 1150, 420, 0.08), tone(0, 0.25, 0.025, 180, 140)];
    case "smooth":
      return [noise(0, 0.5, 0.35, 850, 330, 0.16)];
    case "naturalize":
      return [noise(0, 0.25, 0.19, 2000, 800, 0.04), ...crumble(0.09, 3)];
    case "remove":
      return [noise(0, 0.3, 0.36, 680, 130, 0.035), tone(0, 0.14, 0.065, 140, 65)];
    case "tree":
      return [tone(0, 0.14, 0.22, 270, 125), tone(0.009, 0.095, 0.065, 510, 310), noise(0.055, 0.37, 0.23, 1800, 550, 0.045)];
    case "berry":
      return [tone(0, 0.1, 0.14, 340, 210), noise(0.025, 0.28, 0.28, 2100, 700, 0.04)];
    case "ruin":
      return [tone(0, 0.35, 0.13, 331, 310), tone(0, 0.22, 0.07, 547, 519), noise(0, 0.18, 0.24, 980, 260)];
    case "mine":
      return [tone(0, 0.33, 0.28, 133, 67), tone(0.013, 0.2, 0.1, 277, 186), noise(0.02, 0.27, 0.31, 550, 170)];
    case "start":
      return [tone(0, 0.48, 0.29, 105, 51), noise(0.01, 0.5, 0.32, 450, 160), noise(0.16, 0.28, 0.18, 750, 210)];
    case "water":
    case "badwater": {
      const dark = name === "badwater" ? 0.55 : 1;
      return [
        noise(0, 0.62, 0.21, 750 * dark, 250),
        ...Array.from({ length: 5 }, (_, i) => {
          const hz = (180 + rng() * 160) * dark;
          return tone(i * 0.09 + rng() * 0.045, 0.11 + rng() * 0.06, 0.12, hz, hz * 1.7, 0.02);
        }),
      ];
    }
    case "carve":
      return [noise(0, 2.5, 0.6, 1000, 480, 0.28), tone(0, 1.6, 0.08, 70, 42, 0.15), ...crumble(0.3, 10)];
    case "craterize": {
      const incoming = [noise(0, 0.7, 0.15, 1800, 650, 0.26), tone(0.02, 0.65, 0.035, 870, 240, 0.23)];
      const impact = [tone(0, 1.3, 0.5, 86, 33, 0.012), noise(0, 0.9, 0.5, 800, 150), ...crumble(0.22, 12)];
      if (phase === "incoming") return incoming;
      if (phase === "impact") return impact;
      return [...incoming, ...impact.map((l) => later(l, 0.65))];
    }
    case "quake":
    case "slide": {
      const rumble = [noise(0, 1.9, 0.55, 240, 120, 0.18), tone(0, 1.8, 0.22, 57, 39, 0.15)];
      const crack = [noise(0, 0.17, 0.38, 2100, 340, 0.009), tone(0, 0.3, 0.18, 154, 63)];
      const grind = [noise(0, 1.7, 0.6, 750, 260, 0.13), ...crumble(0.12, 9)];
      if (phase === "rumble") return rumble;
      if (phase === "crack") return crack;
      if (phase === "slide") return grind;
      return [...rumble, ...crack.map((l) => later(l, 0.45)), ...(name === "slide" ? grind.map((l) => later(l, 0.6)) : [])];
    }
    case "erupt": {
      const rumble = [tone(0, 2.2, 0.3, 52, 39, 0.35), noise(0, 2.5, 0.55, 210, 340, 0.4)];
      const plume = [noise(0, 2.3, 0.65, 430, 1500, 0.52), tone(0, 1.4, 0.09, 75, 49, 0.2)];
      const cool = [noise(0, 2.4, 0.29, 2400, 550, 0.28), ...crumble(0.2, 5)];
      if (phase === "rumble") return rumble;
      if (phase === "plume") return plume;
      if (phase === "cool") return cool;
      return [...rumble, ...plume.map((l) => later(l, 1.1)), ...cool.map((l) => later(l, 3))];
    }
    case "undo":
      return [noise(0, 0.22, 0.17, 700, 1300, 0.08), tone(0, 0.18, 0.065, 170, 330, 0.06)];
    case "waterfall":
      return [noise(0, 3.5, 0.42, 1250, 1000, 0.55)];
    case "stream":
      return [noise(0, 3.5, 0.2, 1800, 1200, 0.4), tone(0.2, 0.15, 0.035, 320, 530, 0.025), tone(0.8, 0.19, 0.03, 230, 410, 0.03)];
    default:
      return [];
  }
}

/** A texture's noise cutoff, level and (for some) a low fundamental. */
const textures: Record<string, [number, number, number]> = {
  raise: [430, 0.42, 73],
  lower: [920, 0.49, 0],
  flatten: [1150, 0.37, 0],
  smooth: [620, 0.45, 0],
  naturalize: [1900, 0.3, 0],
  remove: [430, 0.37, 0],
  tree: [1500, 0.32, 0],
  berry: [1800, 0.25, 0],
  carve: [1050, 0.6, 59],
  waterfall: [1250, 0.34, 0],
  stream: [1800, 0.18, 0],
  erupt: [270, 0.58, 49],
  quake: [200, 0.53, 46],
  slide: [760, 0.58, 53],
};

interface Voice {
  active: boolean;
  id: string | number;
  type: "noise" | "tone";
  held: boolean;
  name: string;
  p: SoundParams;
  age: number;
  duration: number;
  attack: number;
  amp: number;
  f0: number;
  f1: number;
  phase: number;
  breath: number;
  modulation: number;
  cutoff: number;
  low: number;
  brown: number;
  filter: number;
  release: number;
  releaseLength: number;
  gain: number;
  targetGain: number;
  a: number;
  targetA: number;
  panL: number;
  panR: number;
}

export class JuiceSynth {
  readonly rate: number;
  private seed: number;
  private voices: Voice[];
  clock = 0;
  private volume: number;
  private targetVolume: number;
  private enabled = true;
  private camera = 0;
  dropped = 0;
  peak = 0;
  private dcL = 0;
  private dcR = 0;
  private prevL = 0;
  private prevR = 0;
  private readonly slew: number;
  private readonly dcPole: number;

  constructor(sampleRate = 48000, seed = 1) {
    this.rate = sampleRate;
    this.seed = seed >>> 0 || 1;
    this.voices = Array.from({ length: MAX_VOICES }, () => ({ active: false }) as Voice);
    this.volume = this.targetVolume = SYNTH_DEFAULTS.volume;
    this.slew = 1 - Math.exp(-1 / (sampleRate * 0.025));
    this.dcPole = Math.exp((-TAU * 25) / sampleRate);
  }

  random(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  get activeCount(): number {
    return this.voices.reduce((n, v) => n + Number(v.active), 0);
  }

  settings({ enabled = this.enabled, volume = this.targetVolume }: Partial<SynthSettings> = {}): void {
    this.enabled = !!enabled;
    this.targetVolume = clamp(volume, 0, 1, this.targetVolume);
    if (!this.enabled) this.stopAll();
  }

  /** An accent (a whole recipe, or one phase of a force's). False when it was dropped. */
  play(name: string, input: Partial<SoundParams> = {}, id: string | number = 0, phase?: string): boolean {
    if (!this.enabled || this.targetVolume === 0 || !known.has(name)) return false;
    const p = parameters(input);
    // Recipe size is bounded (at most 15 layers). Never accumulate a backlog.
    const layers = recipe(name, () => this.random(), phase);
    const free = this.voices.reduce((n, v) => n + Number(!v.active), 0);
    // Reserve 12 slots for sustained strokes/ambience. Drop whole accents cleanly.
    if (free < layers.length + 12) {
      this.dropped++;
      return false;
    }
    for (const layer of layers) this.add(layer, p, id, false);
    return true;
  }

  /** A sustained texture under `id` until stopped (starting it again only updates it). */
  start(name: string, input: Partial<SoundParams> = {}, id: string | number = "stroke"): boolean {
    if (!this.enabled || this.targetVolume === 0 || !sustained.has(name)) return false;
    // Repeated begin is an update, never a new thud or another looping texture.
    if (this.voices.some((v) => v.active && v.id === id && v.held && v.release < 0)) {
      this.update(id, input);
      return true;
    }
    const p = parameters(input);
    const [hz, amp, fundamental] = textures[name];
    const heldGroups = this.voices.filter((v) => v.active && v.held && v.type === "noise" && v.release < 0).length;
    const free = this.voices.reduce((n, v) => n + Number(!v.active), 0);
    if (heldGroups >= 4 || free < (fundamental ? 2 : 1)) {
      this.dropped++;
      return false;
    }
    this.add(noise(0, 1, amp, hz, hz, 0.09), p, id, true, name);
    if (fundamental) this.add(tone(0, 1, 0.055, fundamental, fundamental, 0.13), p, id, true, name);
    return true;
  }

  private add(layer: Layer, p: SoundParams, id: string | number, held: boolean, name = ""): void {
    const v = this.voices.find((w) => !w.active);
    if (!v) {
      this.dropped++;
      return;
    }
    const [type, delay, duration, amp, f0, f1, cutoff, attack] = layer;
    const pitch = (0.94 + this.random() * 0.12) * (1.17 - 0.34 * p.size);
    const time = 0.92 + this.random() * 0.16;
    const pan = clamp(p.pan + (this.random() - 0.5) * 0.14, -1, 1);
    Object.assign(v, {
      active: true,
      id,
      type,
      held,
      name,
      p,
      age: -Math.round(delay * time * this.rate),
      duration: duration * time * (0.8 + p.size * 0.4) * this.rate,
      attack: Math.max(0.006, attack * time) * this.rate,
      amp: amp * (0.91 + this.random() * 0.18),
      f0: f0 * pitch,
      f1: f1 * pitch,
      phase: this.random() * TAU,
      breath: this.random() * TAU,
      modulation: 0.6 + this.random() * 1.3,
      cutoff: Math.min(cutoff * pitch, this.rate * 0.35),
      low: 0,
      brown: 0,
      filter: 0,
      release: -1,
      releaseLength: 0.11 * this.rate,
      gain: 0,
      targetGain: 0,
      a: 0,
      targetA: 0,
      panL: Math.cos(((pan + 1) * Math.PI) / 4),
      panR: Math.sin(((pan + 1) * Math.PI) / 4),
    });
    this.targets(v);
  }

  private targets(v: Voice): void {
    const d = clamp(v.p.distance + this.camera, 0, 1);
    v.targetGain = (0.35 + 0.65 * v.p.size) * (0.22 + 0.78 * v.p.strength) * distanceGain(d) * v.p.activity;
    const hz = Math.max(100, v.cutoff * (1 - 0.83 * d));
    v.targetA = 1 - Math.exp((-TAU * hz) / this.rate);
  }

  update(id: string | number, input: Partial<SoundParams>): void {
    for (const v of this.voices)
      if (v.active && v.id === id) {
        v.p = parameters({ ...v.p, ...input });
        this.targets(v);
      }
  }

  setCamera(distance: number): void {
    this.camera = clamp(distance, 0, 1);
    for (const v of this.voices) if (v.active) this.targets(v);
  }

  stop(id: string | number): void {
    for (const v of this.voices)
      if (v.active && v.id === id) {
        if (v.age < 0) v.active = false;
        else if (v.release < 0) v.release = v.releaseLength;
      }
  }

  stopAll(): void {
    for (const v of this.voices) if (v.active) this.stop(v.id);
  }

  render(left: Float32Array, right: Float32Array): void {
    left.fill(0);
    right.fill(0);
    // No allocation, buffer creation, messages or DOM work in the sample loop.
    for (const v of this.voices) {
      if (!v.active) continue;
      const panL = Math.cos(((v.p.pan + 1) * Math.PI) / 4);
      const panR = Math.sin(((v.p.pan + 1) * Math.PI) / 4);
      for (let i = 0; i < left.length; i++) {
        if (++v.age < 0) continue;
        if ((!v.held && v.age >= v.duration) || v.release === 0) {
          v.active = false;
          break;
        }
        const t = v.age / this.rate;
        const progress = v.held ? 0 : v.age / v.duration;
        let env = Math.min(1, v.age / v.attack);
        // Rounded attack, soft release, no hard discontinuities.
        env *= env * (3 - 2 * env);
        if (!v.held) env *= Math.exp(-3.4 * progress) * Math.min(1, (v.duration - v.age) / (this.rate * 0.055));
        if (v.release > 0) env *= v.release-- / v.releaseLength;
        if (v.held) env *= 0.76 + 0.14 * Math.sin(t * v.modulation + v.breath) + 0.1 * Math.sin(t * 4.3 + v.breath * 2);
        v.gain += (v.targetGain - v.gain) * this.slew;
        const sweep = v.type === "noise" && !v.held ? Math.pow(v.f1 / v.f0, progress) : 1;
        v.a += (Math.min(0.95, v.targetA * sweep) - v.a) * this.slew;
        v.panL += (panL - v.panL) * this.slew;
        v.panR += (panR - v.panR) * this.slew;
        let sample: number;
        if (v.type === "noise") {
          const white = this.random() * 2 - 1;
          v.brown = 0.985 * v.brown + 0.015 * white;
          v.low += v.a * (white - v.low);
          // Filtered noise gives grain and water without a brittle high end.
          sample = v.low * 1.8 + v.brown * 2.5;
          if (v.name === "stream") sample *= 0.65 + 0.35 * Math.sin(t * 13.7 + Math.sin(t * 2.1));
        } else {
          const hz = v.f0 * Math.pow(v.f1 / v.f0, progress);
          v.phase += (TAU * hz) / this.rate;
          if (v.phase > TAU) v.phase -= TAU;
          sample = Math.sin(v.phase) + 0.1 * Math.sin(v.phase * 2.03);
        }
        // Distance softens tones as well as noise, and smooths all changes.
        v.filter += v.a * (sample - v.filter);
        const value = v.filter * env * v.amp * v.gain;
        left[i] += value * v.panL;
        right[i] += value * v.panR;
      }
    }
    const target = this.enabled ? this.targetVolume : 0;
    for (let i = 0; i < left.length; i++) {
      this.volume += (target - this.volume) * this.slew;
      const l = left[i];
      const r = right[i];
      this.dcL = l - this.prevL + this.dcPole * this.dcL;
      this.dcR = r - this.prevR + this.dcPole * this.dcR;
      this.prevL = l;
      this.prevR = r;
      // Gentle memoryless soft limiter, exact ceiling below full scale even at maximum
      // volume/polyphony. Linear near zero; no compressor attack overshoot.
      left[i] = 0.82 * Math.tanh((this.dcL * this.volume) / 0.82);
      right[i] = 0.82 * Math.tanh((this.dcR * this.volume) / 0.82);
      this.peak = Math.max(this.peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    this.clock += left.length;
  }
}
