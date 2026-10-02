// The matrix, its run order, and what a resumed series skips. Pure; tested in tests/unit/smooth.test.ts.

export type BuildSide = "before" | "after";

/** Timberborn maps, the generator and the editor stop at 256², so the matrix has no 512². */
export const SIZES = [128, 256] as const;
export const LOOKS = ["standard", "high"] as const;
export const SCENARIOS = ["orbit", "brush", "force"] as const;
export const CONFIG_IDS = ["chromium", "chromium-4x", "igpu-4x", "firefox", "webkit"] as const;

export const CONFIG_LABELS = {
  chromium: "Chrome, native",
  "chromium-4x": "Chrome, CPU 4x slower",
  "igpu-4x": "Chrome, integrated GPU, CPU 4x slower",
  firefox: "Firefox",
  webkit: "WebKit",
} as const;

export type Look = (typeof LOOKS)[number];
export type Scenario = (typeof SCENARIOS)[number];
export type ConfigId = (typeof CONFIG_IDS)[number];

export interface Cell {
  config: ConfigId;
  size: number;
  look: Look;
  scenario: Scenario;
}

export interface RunSpec {
  cell: Cell;
  build: BuildSide;
  /** 1..repeats, counted per build. */
  repeat: number;
  key: string;
}

export const cellKey = (c: Cell): string => `${c.config}|${c.size}|${c.look}|${c.scenario}`;
export const runKey = (c: Cell, build: BuildSide, repeat: number): string => `${cellKey(c)}|${build}|${repeat}`;

/** ABBA across a cell's repeats: before, after, after, before, before, after ... so slow drift cancels. */
export function abbaOrder(repeats: number): BuildSide[] {
  const out: BuildSide[] = [];
  for (let k = 0; k < repeats; k++) out.push(...(k % 2 === 0 ? (["before", "after"] as const) : (["after", "before"] as const)));
  return out;
}

export interface Filters {
  sizes: number[];
  looks: Look[];
  configs: ConfigId[];
  scenarios: Scenario[];
  repeats: number;
}

/** Every run of the series, cells in order (configuration, size, look, scenario), each cell's runs in ABBA order. */
export function expand(f: Filters): RunSpec[] {
  const out: RunSpec[] = [];
  for (const config of f.configs)
    for (const size of f.sizes)
      for (const look of f.looks)
        for (const scenario of f.scenarios) {
          const cell: Cell = { config, size, look, scenario };
          const seen: Record<BuildSide, number> = { before: 0, after: 0 };
          for (const build of abbaOrder(f.repeats)) {
            const repeat = ++seen[build];
            out.push({ cell, build, repeat, key: runKey(cell, build, repeat) });
          }
        }
  return out;
}

export const remaining = (runs: readonly RunSpec[], done: ReadonlySet<string>): RunSpec[] => runs.filter((r) => !done.has(r.key));

function pick<T extends string>(arg: string | undefined, all: readonly T[], what: string): T[] {
  if (!arg) return [...all];
  const out = arg.split(",").map((s) => s.trim() as T);
  for (const v of out) if (!all.includes(v)) throw new Error(`unknown ${what} "${v}" (one of ${all.join(", ")})`);
  return out;
}

/** The filter flags (--sizes 128 --looks high ...), checked. Sizes beyond 256 are refused (see SIZES). */
export function parseFilters(a: Record<string, string | undefined>): Filters {
  const sizes = a.sizes ? a.sizes.split(",").map(Number) : [...SIZES];
  for (const s of sizes) if (!Number.isInteger(s) || s < 32 || s > 256) throw new Error(`size ${s}: maps run from 32 to 256 (the generator and the editor stop at 256)`);
  const repeats = a.repeats ? Number(a.repeats) : 5;
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`repeats ${a.repeats}: a whole number from 1`);
  return {
    sizes,
    looks: pick(a.looks, LOOKS, "look"),
    configs: pick(a.configs, CONFIG_IDS, "configuration"),
    scenarios: pick(a.scenarios, SCENARIOS, "scenario"),
    repeats,
  };
}
