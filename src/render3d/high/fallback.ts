// Choosing the look (PLAN §20 D284): High by default on computers that run it smoothly, with an
// automatic fallback, as the 3D view has one (D232). A computer eligible for High starts in it (or
// in the tier it settled on last time, on the same GPU at about the same size); the governor then
// watches what each frame costs the GPU and steps down when frames stay too slow: first to the
// lower-cost tier (effects.ts), then to Standard. It never steps back up by itself in a session
// (no flicker); the player's own choice always wins. Pure logic, so tests drive it with made-up
// frame times (tests/unit/highLook.test.ts).

export type Tier = "high" | "lower" | "standard";

export interface GovernorLimits {
  /** A window's 95th-percentile frame cost (ms) above which High steps down to the lower tier. */
  lowerAt: number;
  /** ... above which the lower tier steps down to Standard. */
  standardAt: number;
  /** Frames a window. */
  window: number;
  /** Windows in a row over the limit before stepping down ("sustained", never one spike). */
  strikes: number;
  /** Milliseconds after a new map, a change of look or a resize before frames count (shaders
   *  compiling, uploads). */
  grace: number;
}

/** Where the fallback starts: measured on this machine's RTX 2070 SUPER (docs/progress/high-look.md,
 *  "The measurements"): High's dense 256² frames cost it well under these, and a GPU that needs more
 *  than twice as long falls back. */
export const LIMITS: GovernorLimits = { lowerAt: 22, standardAt: 30, window: 60, strikes: 2, grace: 2500 };

export function percentile(a: readonly number[], p: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export class LookGovernor {
  private samples: number[] = [];
  private strikes = 0;
  private from = 0;
  /** The last window's 95th percentile (ms), for the page and the tests. */
  lastP95 = 0;

  constructor(
    public tier: Tier = "high",
    readonly limits: GovernorLimits = LIMITS,
  ) {}

  /** Start the grace period again (a new map, a change of look, a resize). */
  hold(now: number): void {
    this.from = now + this.limits.grace;
    this.samples = [];
  }

  /** One frame's cost (ms), measured at `now`; returns the tier after it. */
  sample(ms: number, now: number): Tier {
    if (this.tier === "standard" || now < this.from || !(ms >= 0)) return this.tier;
    this.samples.push(ms);
    if (this.samples.length < this.limits.window) return this.tier;
    const p95 = percentile(this.samples, 0.95);
    this.lastP95 = p95;
    this.samples = [];
    const limit = this.tier === "high" ? this.limits.lowerAt : this.limits.standardAt;
    this.strikes = p95 > limit ? this.strikes + 1 : 0;
    if (this.strikes >= this.limits.strikes) {
      this.strikes = 0;
      this.tier = this.tier === "high" ? "lower" : "standard";
      this.hold(now);
    }
    return this.tier;
  }
}

// ------------------------------------------------------------------------------ remembered choices

/** The player's choice of look: automatic (the default), or High or Standard held. */
export type LookChoice = "auto" | "high" | "standard";

const CHOICE_KEY = "dgm.look";
const VERDICT_KEY = "dgm.look.auto";
const EFFECTS_KEY = "dgm.look.off";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // remembered for this page only
  }
}

export function savedChoice(): LookChoice {
  const v = read(CHOICE_KEY);
  return v === "high" || v === "standard" ? v : "auto";
}

export function saveChoice(c: LookChoice): void {
  write(CHOICE_KEY, c === "auto" ? null : c);
}

/** The High effects the player switched off. */
export function savedOff(): string[] {
  try {
    const v = JSON.parse(read(EFFECTS_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function saveOff(keys: readonly string[]): void {
  write(EFFECTS_KEY, keys.length ? JSON.stringify(keys) : null);
}

export interface Verdict {
  gpu: string;
  /** The drawing buffer's pixels when it was reached. */
  pixels: number;
  tier: Tier;
}

/** The tier the automatic choice settled on last time, if it was on this GPU at about this size
 *  (within 40% of the pixels: a much bigger or smaller window is checked again). */
export function startTier(gpu: string, pixels: number, saved: Verdict | null = savedVerdict()): Tier {
  if (!saved || saved.gpu !== gpu) return "high";
  const ratio = pixels / Math.max(1, saved.pixels);
  return ratio > 1 / 1.4 && ratio < 1.4 ? saved.tier : "high";
}

export function savedVerdict(): Verdict | null {
  try {
    const v = JSON.parse(read(VERDICT_KEY) ?? "null") as Verdict | null;
    return v && typeof v.gpu === "string" && typeof v.pixels === "number" && (v.tier === "high" || v.tier === "lower" || v.tier === "standard") ? v : null;
  } catch {
    return null;
  }
}

export function saveVerdict(v: Verdict | null): void {
  write(VERDICT_KEY, v ? JSON.stringify(v) : null);
}
