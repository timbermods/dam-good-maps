// While a map is made (ROADMAP M9a: generating shows its progress and never feels stalled): the
// stage of the attempt under way, and the first look at its land, drawn as soon as the land and its
// planned water exist, before the water is settled. North is up. The first map that passes is the
// map, shown at once (D329); a version that meets every outcome is looked for in the background
// afterwards, never here.

import { useEffect, useRef } from "preact/hooks";
import type { GenProgress } from "../worker/api";

export interface Progress {
  attempt: number;
  stage: string;
  land: Extract<GenProgress, { kind: "land" }> | null;
  /** The map, once it passed (shown until the page takes it). */
  candidate?: Extract<GenProgress, { kind: "candidate" }> | null;
  /** Which of each stage's wordings it shows now (`sayStage`). */
  said?: Said;
}

/** Each stage's words, one for each layout that reaches it (Kyler, 2026-10-05: a failed layout starts again from the
 *  land, and the same line again read as stuck); past the last, the last. */
const STAGES: Record<string, readonly string[]> = {
  land: ["Raising the land", "Shaping new hills", "Lifting the ridges", "Folding the valleys"],
  water: ["Running the rivers", "Rerouting the rivers", "Filling the low ground", "Finding the water's way"],
  start: ["Settling the water and finding a start", "Letting the water settle", "Looking for a dry bank", "Picking a better start"],
  objects: ["Placing ruins, relics and other objects", "Scattering the ruins", "Burying old relics", "Moving the ruins"],
  resources: ["Growing forests and berries", "Planting the groves", "Ripening the berries", "Thickening the woods"],
  check: ["Checking the map", "Checking it again", "Another look", "One last check"],
};

/** For each stage, the layout that last showed it and which of its wordings it took. */
export type Said = Record<string, { attempt: number; n: number }>;

/** A stage reached by a layout: the first layout to reach it takes its first wording, each later one the next. */
export function sayStage(said: Said | undefined, stage: string, attempt: number): Said {
  const was = said?.[stage];
  if (was && was.attempt === attempt) return said!;
  return { ...said, [stage]: { attempt, n: was ? was.n + 1 : 0 } };
}

function stageWords(p: Progress): string {
  const words = STAGES[p.stage];
  if (!words) return "Generating";
  return words[Math.min(p.said?.[p.stage]?.n ?? 0, words.length - 1)];
}

/** What the generator is doing, in its own words, and nothing more ("Running the rivers…"). */
export function stageText(p: Progress | null): string {
  if (!p) return "Generating…";
  return p.candidate ? "Your map is ready…" : `${stageWords(p)}…`;
}

/** "Running the rivers", and which layout it is when the first did not pass. */
export function progressText(p: Progress | null): string {
  if (!p) return "Generating…";
  const what = stageWords(p);
  if (p.candidate) return "Your map is ready…";
  return p.attempt > 0 ? `${what} (layout ${p.attempt + 1})…` : `${what}…`;
}

/** The land shaded by height, the planned water blue. */
function draw(canvas: HTMLCanvasElement, l: { W: number; H: number; heights: Uint8Array; water: Uint8Array }): void {
  const { W, H, heights, water } = l;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  let lo = 255;
  let hi = 0;
  for (const v of heights) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = Math.max(1, hi - lo);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = ((H - 1 - y) * W + x) * 4;
      const t = (heights[i] - lo) / span;
      // light from the north-west: a tile above its south-east neighbour is brighter
      const se = y > 0 && x < W - 1 ? heights[(y - 1) * W + x + 1] : heights[i];
      const shade = Math.max(-0.25, Math.min(0.25, (heights[i] - se) * 0.08));
      const w = water[i] === 1 || water[i] === 2;
      const base = w ? [70, 120, 190] : [120 + 90 * t, 140 + 70 * t, 90 + 60 * t];
      img.data[d] = Math.round(base[0] * (1 + shade));
      img.data[d + 1] = Math.round(base[1] * (1 + shade));
      img.data[d + 2] = Math.round(base[2] * (1 + shade));
      img.data[d + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

export function FirstLook({ progress }: { progress: Progress | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = progress?.candidate ?? progress?.land ?? null;
  useEffect(() => {
    if (ref.current && shown) draw(ref.current, shown);
  }, [shown]);
  return (
    <div class="first-look">
      {shown ? <canvas ref={ref} class="first-look-map" aria-label={progress?.candidate ? "Your map, its water settled" : "The land so far, before its water is settled"} /> : null}
      <p role="status" class="first-look-stage">
        {progressText(progress)}
      </p>
    </div>
  );
}
