// While a map is made (ROADMAP M9a: generating shows its progress and never feels stalled): the
// stage of the attempt under way, and the first look at its land, drawn as soon as the land and its
// planned water exist, before the water is settled. North is up.

import { useEffect, useRef } from "preact/hooks";
import type { GenProgress } from "../worker/api";

export interface Progress {
  attempt: number;
  stage: string;
  land: Extract<GenProgress, { kind: "land" }> | null;
}

const STAGES: Record<string, string> = {
  land: "Raising the land",
  water: "Running the rivers",
  start: "Settling the water and finding a start",
  objects: "Placing ruins, relics and other objects",
  resources: "Growing forests and berries",
  check: "Checking the map",
};

/** "Running the rivers", and which layout it is when the first did not pass. */
export function progressText(p: Progress | null): string {
  if (!p) return "Generating…";
  const what = STAGES[p.stage] ?? "Generating";
  return p.attempt > 0 ? `${what} (layout ${p.attempt + 1})…` : `${what}…`;
}

/** The land shaded by height, the planned water blue. */
function draw(canvas: HTMLCanvasElement, l: NonNullable<Progress["land"]>): void {
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
  const land = progress?.land ?? null;
  useEffect(() => {
    if (ref.current && land) draw(ref.current, land);
  }, [land]);
  return (
    <div class="first-look">
      {land ? <canvas ref={ref} class="first-look-map" aria-label="The land so far, before its water is settled" /> : null}
      <p role="status" class="first-look-stage">
        {progressText(progress)}
      </p>
    </div>
  );
}
