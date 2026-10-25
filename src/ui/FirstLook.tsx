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

/** One island's contour rings, the lowest (in the water's colour) first: they draw themselves one after another while the
 *  land's square waits for its picture (.first-look-empty in page.css). */
const CONTOURS = [
  "M96.6 50C97 58.1 93.1 68.9 87.5 75C81.9 81.2 71.6 84.6 63 86.9C54.5 89.2 44 91.2 36.3 88.7C28.7 86.3 22.3 78.4 17.1 72C11.9 65.5 6.1 58 5.2 50C4.2 42 6.4 31 11.5 24.3C16.6 17.6 27.4 11 35.8 9.8C44.2 8.5 53.5 14.1 61.7 16.8C70 19.6 79.4 20.9 85.3 26.4C91.1 32 96.3 41.9 96.6 50Z",
  "M87 49C87 55.7 83.6 64.2 79 69.2C74.4 74.2 66.2 76.9 59.3 78.8C52.4 80.7 43.8 82.7 37.6 80.7C31.4 78.7 26.3 72.3 21.9 67C17.4 61.7 11.6 55.5 10.9 49C10.2 42.5 13.1 33.4 17.5 28.1C21.9 22.8 30.8 18.2 37.6 17.2C44.4 16.2 51.4 20.2 58.3 22.1C65.2 24.1 74.1 24.4 78.9 28.9C83.7 33.4 87 42.3 87 49Z",
  "M77.7 48.4C77.5 53.7 74.8 60 71.3 63.8C67.7 67.7 61.6 69.9 56.3 71.4C51 73 44.4 74.5 39.5 73C34.6 71.6 30.6 66.6 27.1 62.5C23.5 58.4 18.4 53.4 17.9 48.4C17.5 43.4 20.6 36.3 24.2 32.4C27.9 28.4 34.5 25.4 39.8 24.6C45 23.7 50.2 26 55.7 27.3C61.1 28.5 68.8 28.6 72.5 32.2C76.2 35.7 77.9 43.1 77.7 48.4Z",
  "M67.8 48C67.5 51.6 65.7 55.6 63.3 58.2C61 60.9 57.1 62.6 53.5 63.7C50 64.7 45.5 65.7 42.1 64.7C38.7 63.7 35.9 60.6 33.4 57.8C30.9 55 27.3 51.4 27.1 48C26.9 44.6 29.5 40 32.1 37.4C34.6 34.8 39 33.1 42.5 32.4C46 31.7 49.5 32.5 53.2 33.2C57 33.9 62.5 34.2 65 36.7C67.4 39.1 68.1 44.4 67.8 48Z",
  "M58.2 47.7C58 49.6 57.1 51.6 55.9 53C54.7 54.4 52.8 55.4 50.9 56C49.1 56.6 46.7 57 44.9 56.5C43.1 56 41.4 54.4 40.1 53C38.8 51.5 37 49.5 37 47.7C36.9 45.9 38.5 43.6 39.8 42.2C41.2 40.9 43.3 40.2 45.2 39.7C47 39.3 48.9 39.2 50.9 39.6C52.9 39.9 55.8 40.3 57.1 41.6C58.3 43 58.4 45.8 58.2 47.7Z"
];

/** A small stretch of moving water for the "map being made" card (.making-water in page.css); it only moves while mounted. */
export function MakingWater() {
  return (
    <div class="making-water" aria-hidden="true">
      <span />
    </div>
  );
}

/** `quiet`: the land alone, its words said elsewhere (the progress dialog over the editor's frame). */
export function FirstLook({ progress, quiet = false }: { progress: Progress | null; quiet?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = progress?.candidate ?? progress?.land ?? null;
  useEffect(() => {
    if (ref.current && shown) draw(ref.current, shown);
  }, [shown]);
  return (
    <div class="first-look">
      {shown ? (
        <canvas ref={ref} class="first-look-map" aria-label={progress?.candidate ? "Your map, its water settled" : "The land so far, before its water is settled"} />
      ) : quiet ? (
        <div class="first-look-map first-look-empty" aria-hidden="true">
          <svg class="contours" viewBox="0 0 100 100">
            {CONTOURS.map((d) => (
              <path key={d} d={d} pathLength={1} />
            ))}
          </svg>
        </div>
      ) : null}
      {quiet ? null : (
        <p role="status" class="first-look-stage">
          {progressText(progress)}
        </p>
      )}
    </div>
  );
}
