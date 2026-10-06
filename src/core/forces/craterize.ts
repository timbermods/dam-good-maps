// Craterize, a force of nature (PLAN §20 D202, D216): a giant impact. Strike (a click) or Aim (a
// glancing drag, for an oval crater thrown forward); Power; Size (following Power, or set); Steep or
// Terraced walls; a centre (Auto, Bowl, Peak, Ring or Flat); Debris (Light or Heavy) with or without
// Rays; Try another (the next personality). A coherent crater field quantized once to whole game
// levels: a morphology model, not a shock-physics solver. The newest bowl replaces the relief it
// lands on (overlapping impacts overprint older ones); only its outer lip rejoins the ground round
// it. Trees inside the bowl are gone; round it they are knocked down, lying away from the blow (dead
// trees, their pose the editor's); water and badwater sources and seeps ride the ground, and Sources
// set to Clear takes those on ground it changed (clear.ts, D474); an aquifer keeps its ground; other
// objects whose ground changed go. It strikes wherever it is aimed, the start's ground too (the editor
// carries the start to level ground, D257), and never adds water.
//
// Planned in Rust (rust/forces, PLAN §20 D381; rust/bridge.ts): this file keeps its settings, its checks
// and its anatomy's shape; the TypeScript planner it replaced is tag `ts-forces-final`.

import type { SourcesRule } from "./clear";
import * as portable from "../math/portable";
import type { FullForceMap } from "./force";
import { planInRust } from "./rust/bridge";
import { forceSettingsProblem } from "./settings";

export interface CraterSettings {
  mode: "strike" | "aim";
  /** Sources (D474): they ride the ground, or the force clears them (clear.ts); absent, it clears. */
  sources?: SourcesRule;
  /** 0–100. */
  power: number;
  /** The crater's diameter in tiles, 4–180, or null: it follows Power. */
  size: number | null;
  walls: "steep" | "terraced";
  centre: "auto" | "bowl" | "peak" | "ring" | "flat";
  debris: "light" | "heavy";
  rays: boolean;
  /** The personality (Try another takes the next). */
  seed: number;
  /** The Floor (D321, item 40, floor.ts): nothing it does goes below this level; absent, 1. */
  floor?: number;
}

export interface CraterIntent {
  /** The impact's tile. */
  origin: number;
  /** Aim: the tile the impactor travels toward (a glancing blow). */
  end?: number;
}

export const CRATER_DEFAULTS: CraterSettings = { mode: "strike", power: 55, size: null, walls: "terraced", centre: "auto", debris: "heavy", rays: false, seed: 0 };

/** The diameter Power gives. */
export const naturalSize = (power: number) => Math.round(6 + 112 * portable.pow(power / 100, 1.4));
export const autoCentre = (diameter: number): CraterSettings["centre"] => (diameter < 28 ? "bowl" : diameter < 68 ? "peak" : "ring");

/** Throws why an impact can't start (its settings, settings.ts; its point and aim on the map). */
export function validateCrater(s: CraterSettings, m: { W: number; H: number }, i: CraterIntent): void {
  const why = forceSettingsProblem("craterize", s as unknown as Record<string, unknown>);
  if (why) throw Error(why);
  if (!Number.isInteger(i.origin) || i.origin < 0 || i.origin >= m.W * m.H) throw Error("Strike on the map");
  if (s.mode === "aim" && (!Number.isInteger(i.end) || i.end! < 0 || i.end! >= m.W * m.H)) throw Error("Drag across the map to aim");
}

export interface Ray {
  dx: number;
  dy: number;
  start: number;
  length: number;
  width: number;
  bend: number;
  phase: number;
  seed: number;
  pits: { x: number; y: number; r: number }[];
}

/** The crater as planned: where, how big and deep, its shape and its rays. */
export interface CraterAnatomy {
  x: number;
  y: number;
  W: number;
  H: number;
  edgeInset: number;
  radius: number;
  /** The ellipse's half-axes, along and across the travel. */
  a: number;
  b: number;
  angle: number;
  /** 0 (straight down) to 1 (a grazing blow). */
  glance: number;
  diameter: number;
  depth: number;
  rim: number;
  /** The ground level round the rim. */
  datum: number;
  floor: number;
  centre: CraterSettings["centre"];
  rays: Ray[];
}

/** A crater planned on its own copy of the map, in Rust, in one call. `keep` adds ground it leaves alone
 *  (the land above the layer showing, an imported map's caves); an aquifer's ground is kept too, while
 *  sources and seeps ride the crater's ground (D474). Throws why it can't start. */
export class ImpactPlan {
  readonly map: FullForceMap;
  readonly anatomy: CraterAnatomy;
  readonly keep: Uint8Array;
  readonly settings: CraterSettings;
  readonly intent: CraterIntent;
  readonly stats: { cut: number; raised: number; changed: number; erased: number; flattened: number };
  /** How strongly it acts (D361 (3): 1 unless its Size outgrows its Power). */
  readonly strength: number;
  /** When each tile takes its final level, 0–1 of its showing: the bowl at once, then the ejecta outward. */
  readonly arrival: Float32Array;

  constructor(
    readonly before: FullForceMap,
    settings: CraterSettings,
    intent: CraterIntent,
    extraKeep: Uint8Array | null = null,
  ) {
    this.settings = { ...settings };
    this.intent = { ...intent };
    validateCrater(settings, before, intent);
    const p = planInRust({ verb: "craterize", map: before, settings: this.settings, intent: this.intent, keep: extraKeep });
    this.map = p.raw;
    this.anatomy = p.anatomy;
    this.keep = p.keep;
    this.stats = p.stats;
    this.strength = p.strength;
    this.arrival = p.arrival;
  }
}

/** A whole impact at once (tests, Claude's step). */
export function impact(m: FullForceMap, s: CraterSettings, intent: CraterIntent, keep: Uint8Array | null = null): ImpactPlan {
  return new ImpactPlan(m, s, intent, keep);
}
