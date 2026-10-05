// The editor's sounds (PLAN §20 D205, D212, D220, D226, D313): Codex's second round
// (investigation/juice-2 `palette.js`, PR #64), recorded CC0 foley with a crisp, musical reward. Each
// sound is a recipe of recorded layers (no oscillator, no generated noise): packed earth for Raise,
// loose stone for Lower, a mineral scrape for Flatten, that same scrape pitched up, softer and
// shorter for Smooth (a family with Flatten, D313), leaves for Naturalize, hollow wood and leaves for
// a tree, a splash and bubbles for a source, a reversed wooden catch for undo, a torrent for Carve, a
// crack, a boom and falling stone for Craterize, a grinding fault for Quake, a roaring plume and a
// cooling hiss for Erupt; a split, a deep drop and tumbling stone for Rift; muddy water and settling earth for
// Deposit (both from the same bank); for Glaciate, investigation/glaciate's recipe from the same bank (#69: a
// low grinding bed of stone and pitched wood as the ice advances, two slow cracks, falling meltwater
// as it retreats; its bank.json lists the same five recordings, byte for byte). Repeating an action
// climbs a small ladder (0, 2, 4, 7 semitones) and resets after a pause; a held stroke is a looping
// bed that rises gently to the fifth. Distance lowers the level and the brightness. Ported as it is otherwise: the recipes, the balance and the calibration
// are the round's; D313 amends Smooth's recipe and the default volume.

/** Fresh settings: on, a clearly audible 0.54 (a quarter lower than the round's original 0.72,
 *  D313; a saved volume is never touched), water ambience off. */
export const DEFAULTS = Object.freeze({ enabled: true, volume: 0.54, ambience: false });
/** A run of the same action climbs these semitones, then holds (a fifth at most). */
export const LADDER: readonly number[] = Object.freeze([0, 2, 4, 7]);

export interface SoundInfo {
  id: string;
  label: string;
  group: "Brushes" | "Objects" | "Forces" | "Utility" | "Ambience";
  detail: string;
}

export const SOUNDS: readonly SoundInfo[] = (
  [
    ["raise", "Raise", "Brushes", "Packed earth · weight with a clean edge"],
    ["lower", "Lower", "Brushes", "Loose stone · a little falling grit"],
    ["flatten", "Flatten", "Brushes", "Mineral scrape · smooth, firm contact"],
    ["smooth", "Smooth", "Brushes", "Brushed leaves · a soft travelling sweep"],
    ["naturalize", "Naturalize", "Brushes", "Dry leaves · irregular, delicate detail"],
    ["remove", "Remove", "Brushes", "Earth puff · a short, dry release"],
    ["tree", "Tree", "Objects", "Hollow wood · leaves · a tiny resonant reward"],
    ["berry", "Berry bush", "Objects", "Lighter wood · a close leafy flick"],
    ["ruin", "Ruin", "Objects", "Damped metal · stone beneath it"],
    ["mine", "Mine site", "Objects", "Heavy timber · a solid foundation"],
    ["start", "Start", "Objects", "Earth settles · a warm wooden finish"],
    ["water", "Water source", "Objects", "A fresh splash · bright little bubbles"],
    ["badwater", "Badwater source", "Objects", "Low, thick bubbles · a murky splash"],
    ["carve", "Carve", "Forces", "A rushing torrent carrying broken earth"],
    ["craterize", "Craterize", "Forces", "A sucked-in breath · crack · boom · falling stone"],
    ["quake", "Quake · lift", "Forces", "A fault opens · heavy crack · grinding earth"],
    ["slide", "Quake · slide", "Forces", "Splintering rock · a long, weighty grind"],
    ["erupt", "Erupt", "Forces", "Pressure builds · roaring plume · cooling hiss"],
    ["glaciate", "Glaciate", "Forces", "Grinding stone · a low wooden groan · slow cracks · meltwater"],
    ["rift", "Rift", "Forces", "The ground splits · a deep drop · falling stone"],
    ["deposit", "Deposit", "Forces", "Muddy water spreading · settling earth"],
    ["undo", "Undo", "Utility", "A short reversed wooden catch"],
    ["waterfall", "Waterfall", "Ambience", "Recorded falling water · a broad, quiet bed"],
    ["stream", "Stream", "Ambience", "A close trickle · a few gentle bubbles"],
  ] as const
).map(([id, label, group, detail]) => ({ id, label, group, detail }));

export const clamp = (n: number, min = 0, max = 1) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

/** A sound's inputs, all bounded: size and strength 0–1 (they grow the sound and lower it a little),
 *  distance 0–8 (from the view), pan −1–1, activity 0–1 (a held stroke's: 0 fades it). */
export interface SoundParams {
  size: number;
  strength: number;
  distance: number;
  pan: number;
  activity: number;
}

export function parameters(p: Partial<SoundParams> = {}): SoundParams {
  return {
    size: clamp(p.size ?? 0.45),
    strength: clamp(p.strength ?? 0.55),
    distance: clamp(p.distance ?? 0, 0, 8),
    pan: clamp(p.pan ?? 0, -1, 1),
    activity: clamp(p.activity ?? 1),
  };
}

/** A sound's level, brightness (its low-pass cutoff) and pan from its inputs and the view's own
 *  distance. */
export function spatial(p: SoundParams, camera = 0): { gain: number; cutoff: number; pan: number } {
  const d = clamp(p.distance + camera, 0, 8);
  return { gain: ((0.62 + 0.55 * p.size) * (0.68 + 0.52 * p.strength) * p.activity) / (1 + 2.8 * d), cutoff: Math.max(850, 18000 / (1 + 5 * d)), pan: p.pan };
}

/** The rising runs: the same action again within 0.85 s climbs a step, a pause starts over. */
export class RewardRuns {
  private runs = new Map<string, { at: number; index: number }>();
  next(name: string, seconds: number): number {
    const old = this.runs.get(name);
    const index = old && seconds - old.at < 0.85 ? Math.min(old.index + 1, LADDER.length - 1) : 0;
    this.runs.set(name, { at: seconds, index });
    return LADDER[index];
  }
  clear(): void {
    this.runs.clear();
  }
}

/** One recorded layer of a sound. */
export interface Layer {
  sample: string;
  gain: number;
  delay?: number;
  rate?: number;
  attack?: number;
  release?: number;
  duration?: number;
  offset?: number;
  lowpass?: number;
  highpass?: number;
  reverse?: boolean;
  pan?: number;
}

/** A sound's layers (all recorded material; calibration.ts has each recipe's measured trim). A force
 *  may play one phase of its recipe at a time, as it happens. */
export function recipe(name: string, params: Partial<SoundParams> = {}, { semitones = 0, random = Math.random, phase, span }: { semitones?: number; random?: () => number; phase?: string; span?: number } = {}): Layer[] {
  const p = parameters(params);
  const pick = (a: string, b: string) => (random() < 0.5 ? a : b);
  const r = 2 ** ((semitones + (random() - 0.5) * 0.22 - p.size * 0.6) / 12);
  const a: Layer[] = [];
  const add = (sample: string, gain = 1, delay = 0, options: Partial<Layer> = {}) =>
    a.push({ sample, gain, delay: delay ? delay + random() * 0.013 : 0, rate: r * (0.985 + random() * 0.03), attack: 0.001, release: 0.065, ...options });
  const earth = pick("earth-a", "earth-b");
  const wood = pick("wood-a", "wood-b");
  const leaf = pick("leaf-a", "leaf-b");
  const crack = pick("crack-a", "crack-b");
  const reward = (gain = 0.22, delay = 0.025) => add("resonance", gain, delay, { rate: r * 0.74, duration: 0.36, lowpass: 5200, release: 0.18 });
  const rubble = (count = 6, at = 0.3) => {
    for (let i = 0; i < count; i++)
      add(i % 2 ? "grit" : "stone", 0.33 * (1 - i / (count + 2)), at === 0 && i === 0 ? 0 : at + i * 0.13 + random() * 0.09, { rate: r * (0.85 + random() * 0.7), duration: 0.32, pan: (random() - 0.5) * 1.2 });
  };
  switch (name) {
    case "raise":
      add(earth, 1.8);
      add("stone", 0.38, 0.018);
      break;
    case "lower":
      add("grit", 1.0);
      add(earth, 0.65);
      rubble(3, 0.09);
      break;
    case "flatten":
      add("scrape", 1.1, 0, { duration: 0.48 });
      add(earth, 0.65);
      break;
    case "smooth":
      // a softer relative of Flatten's scrape (D313): the same recording, pitched up, a softer
      // attack, shorter, a gentler filter, so the two read as a family
      add("scrape", 0.8, 0, { rate: r * 1.6, duration: 0.26, attack: 0.05, release: 0.14, lowpass: 4200 });
      add(earth, 0.32, 0.012, { rate: r * 1.4, duration: 0.18, attack: 0.04, lowpass: 3400 });
      break;
    case "naturalize":
      // a clean dry-leaf rustle (qubodup's CC0 recording, D459), its crackle eased a little
      add("leaves", 1.3, 0, { lowpass: 9000, release: 0.12 });
      break;
    case "remove":
      add(earth, 1.1, 0, { rate: r * 1.25, duration: 0.24 });
      add(leaf, 0.45, 0.015, { duration: 0.22 });
      break;
    case "tree":
      add(wood, 1.55);
      add("wood-body", 0.5, 0.012);
      add(leaf, 0.42, 0.04);
      reward();
      break;
    case "berry":
      add(wood, 1.1, 0, { rate: r * 1.23 });
      add(leaf, 0.8, 0.024);
      reward(0.15);
      break;
    case "ruin":
      add("metal", 1, 0, { lowpass: 7000, duration: 0.5, release: 0.22 });
      add("stone", 0.7, 0.012);
      add("tin", 0.3, 0.025, { duration: 0.26 });
      break;
    case "mine":
      add("wood-heavy", 1.3, 0, { rate: r * 0.83 });
      add(earth, 0.8, 0.014);
      add("wood-body", 0.45, 0.05);
      break;
    case "start":
      add(earth, 1.3, 0, { rate: r * 0.8 });
      add("wood-body", 0.7, 0.035);
      reward(0.3, 0.065);
      break;
    case "water":
      add(pick("splash-a", "splash-b"), 1.05);
      add("bubbles", 0.7, 0.02, { duration: 0.7, offset: random() * 2, release: 0.2 });
      reward(0.12);
      break;
    case "badwater":
      add("splash-b", 0.7, 0, { rate: r * 0.7, lowpass: 4500 });
      add("bubbles", 1.4, 0.015, { duration: 0.9, offset: random() * 2, rate: r * 0.6, lowpass: 3300, release: 0.3 });
      break;
    case "carve":
      add("waterfall", 1.35, 0, { offset: random() * 2, duration: 2.4, attack: 0.035, release: 0.6 });
      add("earth-bed", 0.75, 0.04, { duration: 2, rate: 0.7, attack: 0.06, release: 0.6 });
      rubble(7, 0.08);
      break;
    case "craterize": {
      if (!phase || phase === "incoming") add(crack, 0.6, 0, { reverse: true, duration: 0.22, rate: 1.4, attack: 0.05, release: 0.006 });
      const t = phase ? 0 : 0.22;
      if (!phase || phase === "impact") {
        add(crack, 1.2, t);
        add("boom", 1.65, t + 0.007, { rate: 0.75 - 0.18 * p.strength, duration: 3.2, release: 1.1 });
        add(earth, 1.1, t + 0.018, { rate: 0.65 });
      }
      if (!phase || phase === "debris") rubble(10, phase ? 0 : 0.55);
      break;
    }
    case "quake":
      add(crack, 1.35);
      add("boom", 1, 0.02, { offset: 0.28, rate: 0.5, duration: 2.5, lowpass: 480, attack: 0.01, release: 0.8 });
      add("stone-bed", 0.9, 0.05, { duration: 2.2, rate: 0.65, release: 0.7 });
      rubble(5, 0.18);
      break;
    case "slide":
      add(crack, 0.95);
      add("stone-bed", 1.5, 0.04, { duration: 2.7, rate: 0.64, attack: 0.02, release: 0.75 });
      add("boom", 0.9, 0.02, { offset: 0.4, duration: 2.3, rate: 0.6, lowpass: 550, attack: 0.07, release: 0.8 });
      break;
    case "rift":
      // the ground splitting, a deep low drop as the block falls, stone tumbling off the new walls
      add(crack, 1.3);
      add("boom", 1.15, 0.03, { offset: 0.3, rate: 0.45, duration: 2.8, lowpass: 420, attack: 0.01, release: 0.9 });
      add("stone-bed", 1, 0.08, { duration: 2.4, rate: 0.55, release: 0.8 });
      rubble(8, 0.3);
      break;
    case "deposit":
      // muddy water spreading over the fan, earth settling under it, a few slow bubbles
      add("waterfall", 0.9, 0, { offset: random() * 2, duration: 2.6, rate: 0.75, lowpass: 2600, attack: 0.25, release: 0.9 });
      add("earth-bed", 1, 0.03, { duration: 2.4, rate: 0.6, attack: 0.2, release: 0.8 });
      add("bubbles", 0.5, 0.4, { duration: 1.6, rate: 0.7, lowpass: 2200, attack: 0.2, release: 0.6 });
      break;
    case "erupt": {
      if (!phase || phase === "rumble") add("boom", 1.1, 0, { offset: 0.18, duration: 2.1, rate: 0.52, lowpass: 520, attack: 0.1, release: 0.7 });
      if (!phase || phase === "plume") {
        const t = phase ? 0 : 0.85;
        add("boom", 0.85, t, { rate: 0.85, duration: 2.6, attack: 0.045, release: 0.9 });
        add("waterfall", 1.55, t, { offset: random() * 2, duration: 3, attack: 0.08, release: 0.8, rate: 0.85 });
        add("stone-bed", 0.75, t + 0.2, { duration: 2, rate: 0.8, attack: 0.1, release: 0.5 });
      }
      if (!phase || phase === "cool") {
        const t = phase ? 0 : 3.25;
        add("waterfall", 0.55, t, { offset: 3, duration: 2, highpass: 2100, attack: 0.15, release: 1.1 });
        add("bubbles", 0.75, t + 0.13, { duration: 1.8, attack: 0.12, release: 0.8 });
      }
      break;
    }
    case "glaciate": {
      // (investigation/glaciate `audio.ts`: its runtime edits, as bank.json records them). Played a
      // phase at a time, it fits the phase as it is shown (`span`, D344 A7: Fast's is shorter, Slow forces'
      // longer): the cracks within the advance, the meltwater ending as the land settles
      const k = phase && span !== undefined ? Math.max(0.1, span) / (phase === "advance" ? 3 : 2) : 1;
      if (!phase || phase === "advance") {
        add("crack-a", 0.45, 0, { rate: 0.55, duration: Math.min(2, 3 * k), lowpass: 1100, attack: 0.04, release: 0.15 });
        add("crack-b", 0.3, 1.75 * Math.min(1, k), { rate: 0.7, duration: Math.max(0.2, Math.min(1, 3 * k - 1.75 * Math.min(1, k))), lowpass: 7000, attack: 0.04, release: 0.15 });
      }
      if (!phase || phase === "retreat") add("waterfall", 0.8, phase ? 0 : 3, { rate: 1.05, duration: phase && span !== undefined ? Math.max(0.25, span) : 2.2, lowpass: 7000, offset: random() * 2, attack: 0.04, release: 0.15 });
      break;
    }
    case "undo":
      add(wood, 1.2, 0, { reverse: true, duration: 0.22, rate: r * 1.1, attack: 0.025, release: 0.025 });
      break;
    case "waterfall":
      add("waterfall", 0.48, 0, { duration: 3.5, offset: random(), attack: 0.3, release: 0.6 });
      break;
    case "stream":
      add("bubbles", 0.32, 0, { duration: 3.5, offset: random() * 0.4, attack: 0.3, release: 0.6, rate: 1.12 });
      add("waterfall", 0.15, 0, { duration: 3.5, attack: 0.3, release: 0.6, highpass: 800 });
      break;
  }
  return a;
}

/** A held sound's looping beds (a stroke's, a force's): recorded friction, pre-crossfaded. */
export function texture(name: string): Layer[] {
  const bed = (sample: string, gain: number, rate = 1, lowpass = 18000): Layer => ({ sample, gain, rate, lowpass });
  switch (name) {
    case "raise":
      return [bed("earth-bed", 1.4, 0.8), bed("stone-bed", 0.24, 0.65)];
    case "lower":
      return [bed("stone-bed", 1.1, 0.85), bed("earth-bed", 0.55)];
    case "flatten":
      return [bed("stone-bed", 1.2, 1.1)];
    case "smooth":
      // Flatten's own held bed (stone-bed), softer, higher and filtered gentler (D313)
      return [bed("stone-bed", 0.85, 1.5, 4200)];
    case "naturalize":
      return [bed("leaves-bed", 3.2, 1, 9000), bed("earth-bed", 0.2)];
    case "remove":
      return [bed("leaf-bed", 0.65, 0.85), bed("earth-bed", 0.8, 1.2)];
    case "carve":
      return [bed("waterfall", 1.2, 0.9), bed("earth-bed", 0.65, 0.75)];
    case "quake":
    case "slide":
      return [bed("stone-bed", 1.2, 0.65), bed("boom", 0.75, 0.5, 480)];
    case "erupt":
      return [bed("waterfall", 1.3, 0.8), bed("boom", 0.85, 0.5, 650)];
    case "rift":
      return [bed("stone-bed", 1.1, 0.55), bed("boom", 0.8, 0.45, 420)];
    case "deposit":
      return [bed("waterfall", 0.9, 0.7, 2600), bed("earth-bed", 0.9, 0.6)];
    case "glaciate":
      // the ice's grind while it advances: stone, and a low groan of pitched wood
      return [bed("stone-bed", 0.8, 0.42, 1100), bed("wood-body", 0.8, 0.28, 1100)];
    case "waterfall":
      return [bed("waterfall", 0.48)];
    case "stream":
      return [bed("bubbles", 0.35, 1.08), bed("waterfall", 0.16)];
    default:
      return [];
  }
}
