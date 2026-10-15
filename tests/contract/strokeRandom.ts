// Random brush strokes for the tests of the brushes on runs (D280 (3)) and `tools/stroke-hashes.ts`:
// every brush, sizes from a tile to a large brush, soft and with a target, round, square and areas,
// from a seeded stream so a failure reproduces.

import type { BrushParams, BrushTool } from "../../src/core/features/raster/brush";

export const STROKE_TOOLS: BrushTool[] = ["raise", "lower", "flatten", "smooth", "naturalize"];

/** A random stroke on a W × H map, near (cx, cy) when given (a wandering path of dabs). */
export function randomBrush(rand: () => number, W: number, H: number, tool: BrushTool, near?: { x: number; y: number; r: number }): BrushParams {
  const size = [0.5, 1, 2, 3.5, 6, 9][Math.floor(rand() * 6)];
  const strength = 1 + Math.floor(rand() * 10);
  let x = near ? near.x + (rand() - 0.5) * 2 * near.r : 2 + rand() * (W - 4);
  let y = near ? near.y + (rand() - 0.5) * 2 * near.r : 2 + rand() * (H - 4);
  const clampX = (v: number) => Math.min(4 * W - 1, Math.max(0, Math.round(v * 4)));
  const clampY = (v: number) => Math.min(4 * H - 1, Math.max(0, Math.round(v * 4)));
  const exact = (tool === "raise" || tool === "lower" || tool === "flatten") && rand() < 0.35;
  const target = Math.floor(rand() * 17);
  if ((tool === "raise" || tool === "lower") && rand() < 0.15) {
    const w = 1 + Math.floor(rand() * 8);
    const h = 1 + Math.floor(rand() * 8);
    return { tool, size: 1, strength, shape: "area", ...(exact ? { target } : {}), dabs: [clampX(x), clampY(y), clampX(x + w), clampY(y + h)] };
  }
  const dabs: number[] = [];
  const n = 1 + Math.floor(rand() * 50);
  for (let k = 0; k < n; k++) {
    x = Math.min(W - 1, Math.max(0, x + (rand() - 0.5) * 3));
    y = Math.min(H - 1, Math.max(0, y + (rand() - 0.5) * 3));
    dabs.push(clampX(x), clampY(y));
  }
  return {
    tool,
    size,
    strength,
    ...(rand() < 0.25 ? { shape: "square" as const } : {}),
    ...(exact ? { target } : tool === "flatten" ? { level: target } : {}),
    ...(tool === "naturalize" ? { seed: Math.floor(rand() * 1e6), ...(rand() < 0.7 ? { weathers: true as const } : {}) } : {}),
    dabs,
  };
}
