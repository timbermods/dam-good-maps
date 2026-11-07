// Bare land as the game draws it (D504): a dry land tile (no water on it) whose soil holds no moisture,
// so the game's desert texture covers its whole top (render3d/palette.ts `DESERT`), and that no plant
// stands on.

import type { BuildResult } from "../../src/core/features/build";
import { isPlant } from "../../src/core/forces/objects";
import { DESERT, GROUND, LIVING_TREE, groundColor, moistureByte } from "../../src/render3d/palette";

export interface Bare {
  /** Bare tiles over dry land tiles. */
  share: number;
  /** The bare share of the barest 64² block (whole blocks only; the whole map under 64²). */
  worstBlock: number;
  /** The side of the largest square of bare tiles. */
  largestSquare: number;
  /** Tiles under water over all tiles. */
  water: number;
  /** 1 per bare tile, 2 per moist or planted dry tile, 0 under water. */
  mask: Uint8Array;
}

export function bareTiles(b: Pick<BuildResult, "W" | "H" | "water" | "moisture" | "entities">): Bare {
  const { W, H } = b;
  const N = W * H;
  const planted = new Uint8Array(N);
  for (const e of b.entities) if (isPlant(e) && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H) planted[e.y * W + e.x] = 1;
  const mask = new Uint8Array(N);
  let land = 0;
  let bare = 0;
  for (let i = 0; i < N; i++) {
    if (b.water[i] > 0.05) continue;
    land++;
    const isBare = b.moisture[i] <= 0 && !planted[i];
    mask[i] = isBare ? 1 : 2;
    if (isBare) bare++;
  }
  const B = Math.min(64, W, H);
  let worstBlock = 0;
  for (let by = 0; by + B <= H; by += B)
    for (let bx = 0; bx + B <= W; bx += B) {
      let l = 0;
      let n = 0;
      for (let y = by; y < by + B; y++)
        for (let x = bx; x < bx + B; x++) {
          const m = mask[y * W + x];
          if (m) l++;
          if (m === 1) n++;
        }
      if (l > B * B * 0.25) worstBlock = Math.max(worstBlock, n / l);
    }
  // largest all-bare square: the classic dynamic programme
  const dp = new Uint16Array(N);
  let largestSquare = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i] !== 1) continue;
      dp[i] = x === 0 || y === 0 ? 1 : 1 + Math.min(dp[i - 1], dp[i - W], dp[i - W - 1]);
      if (dp[i] > largestSquare) largestSquare = dp[i];
    }
  return { share: land ? bare / land : 0, worstBlock, largestSquare, water: (N - land) / N, mask };
}

/** Colours `rgb` (3 bytes a tile, the map's rows, from `shadeTiles`) as the game shows the soil, over its dry
 *  tiles: dry ground brown, moist ground green by the game's desert share at its moisture level (palette.ts
 *  `DESERT`), living plants dark green; the light from the relief, as shade.ts lights it. */
export function soilShade(b: Pick<BuildResult, "W" | "H" | "heights" | "water" | "moisture" | "entities">, rgb: Uint8Array): void {
  const { W, H, heights: h } = b;
  const plant = new Uint8Array(W * H);
  for (const e of b.entities) if (isPlant(e) && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && b.moisture[e.y * W + e.x] > 0) plant[e.y * W + e.x] = 1;
  for (let i = 0; i < W * H; i++) {
    if (b.water[i] > 0.05) continue;
    const x = i % W;
    const y = (i - x) / W;
    const gx = (h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)]) / 2;
    const gy = (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) / 2;
    const light = Math.max(0.55, Math.min(1.25, 1 - 0.18 * (gx - gy)));
    const m = b.moisture[i];
    const grass = m <= 0 ? 0 : 1 - (m >= DESERT.threshold ? 0 : (1 - m / DESERT.threshold) * DESERT.max);
    const g = groundColor(moistureByte(m), 0, false);
    const c = plant[i] ? LIVING_TREE : [0, 1, 2].map((k) => GROUND.dry[k] + (g[k] - GROUND.dry[k]) * grass);
    for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.max(0, Math.min(255, Math.round(c[k] * 255 * light)));
  }
}
