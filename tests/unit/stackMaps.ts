// Small test maps for the stacked-column water and the 3D checks (tests/unit/stack*.test.ts).

import { expect } from "vitest";
import { heightMasks } from "../../src/core/sim/columns";
import type { StackSim } from "../../src/core/sim/stack";
import type { MapObject } from "../../src/core/sim/model";

export const object = (template: string, x: number, y: number, z: number, components: MapObject["components"] = {}): MapObject => ({ template, x, y, z, orientation: "Cw0", flipped: false, components });
export const source = (x: number, y: number, z: number, strength: number, template = "WaterSource") => object(template, x, y, z, { WaterSource: { SpecifiedStrength: strength } });

/** A small valley: a stream from the west, draining off the east edge. */
export function valley(W: number, H: number): Uint8Array {
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const across = Math.abs(y - H / 2);
      h[y * W + x] = Math.min(12, 3 + Math.floor(across / 2) + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) + (x < 4 ? 2 : 0) - (x > W - 6 ? 1 : 0));
    }
  return h;
}

/** The valley with a stone bridge over its stream (a roof at z 8–9 over every tile lower than 8
 *  from x 14 to 18), a sealed cave with a source in the valley's side (tiles 22–26 × 1–3, z 3–5),
 *  and a NaturalDam in the stream: every kind of column beside one-column tiles. */
export function caveValley(): { W: number; H: number; h: Uint8Array; mask: Uint32Array; objects: MapObject[] } {
  const W = 40;
  const H = 32;
  const h = valley(W, H);
  const { mask } = heightMasks(W, H, h);
  for (let y = 0; y < H; y++)
    for (let x = 14; x <= 18; x++) {
      const i = y * W + x;
      if (h[i] < 8) mask[i] = (mask[i] | (0b11 << 8)) >>> 0;
    }
  for (let y = 1; y <= 3; y++)
    for (let x = 22; x <= 26; x++) mask[y * W + x] = (mask[y * W + x] & ~(0b111 << 3)) >>> 0;
  const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3), source(24, 2, 3, 1), object("NaturalDam", 30, H / 2, h[(H / 2) * W + 30])];
  return { W, H, h, mask, objects };
}

/** Two runs of the same model agree on every bit: depth, overflow, contamination and momentum. */
export function sameBits(a: StackSim, b: StackSim): void {
  let differ = 0;
  for (let c = 0; c < a.M; c++) if (a.D[c] !== b.D[c] || a.O[c] !== b.O[c] || a.C[c] !== b.C[c]) differ++;
  for (let e = 0; e < a.out.length; e++) if (a.out[e] !== b.out[e]) differ++;
  expect(differ).toBe(0);
  expect(a.volume()).toBe(b.volume());
}
