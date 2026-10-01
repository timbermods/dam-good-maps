// Glaciate's measurements (ported from investigation/glaciate `morphology.ts` `measure`, round 4):
// information about a planned glacier on its settled water, never a gate on it (D257). The one Kyler
// asked to keep reporting (D292): the separate wet passages across the floor, the most disjoint wet
// runs on any cross-section (goal 1), with the trough's wet share, the river's widths and the falls.

import * as portable from "../../math/portable";
import type { WaterState } from "../../sim/water";
import type { FullForceMap } from "../force";
import { entityTiles } from "../force";
import { isPlant } from "../objects";
import { clamp } from "./model";
import { N4, type GlaciatePlan } from "./plan";

export interface GlaciateMeasure {
  troughTiles: number;
  /** Floor tiles wet deeper than 0.05, as a share of the floor. */
  wetShare: number;
  /** The most separate wet runs across any floor section (goal 1). */
  passages: number;
  riverWidthMin: number;
  riverWidthMax: number;
  falls: { lip: number; landing: number; drop: number }[];
  /** Floor tiles wet outside the planned channels. */
  offChannelWet: number;
  dryFloor: number;
  buildableGain: number;
  wallMedian: number;
  wallMax: number;
  longestWall: number;
  /** Each measured section's wet runs (for the report's pictures): the station and the runs' tiles. */
  sections: { k: number; runs: number[][] }[];
}

const quantile = (a: number[], q: number) => (a.length ? a.sort((x, y) => x - y)[Math.floor((a.length - 1) * q)] : 0);

/** Round 2's dry 2×2-pad buildable ground. */
export function buildable(m: Pick<FullForceMap, "W" | "H" | "heights" | "entities"> & { water: Pick<WaterState, "depth"> }): Uint8Array {
  const { W, H } = m;
  const blocked = new Uint8Array(W * H);
  const flat = new Uint8Array(W * H);
  for (const e of m.entities) if (!isPlant(e)) for (const i of entityTiles(W, H, e)) blocked[i] = 1;
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      const a = [i, i + 1, i + W, i + W + 1];
      if (a.every((j) => !blocked[j] && m.water.depth[j] <= 0.05 && m.heights[j] === m.heights[i])) for (const j of a) flat[j] = 1;
    }
  return flat;
}

/** The plan's measurements on `water` (its settled water: the canonical settle of its map). */
export function measureGlaciate(p: GlaciatePlan, water: Pick<WaterState, "depth">): GlaciateMeasure {
  const { before, mask, fan } = p;
  const m = { ...p.map, water: { depth: water.depth, contamination: p.map.water.contamination } };
  const { W, H } = m;
  const a = buildable(before);
  const b = buildable(m);
  const region = new Uint8Array(W * H);
  const mark = (i: number) => {
    const x = i % W;
    const y = Math.floor(i / W);
    for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) region[yy * W + xx] = 1;
  };
  for (let i = 0; i < W * H; i++) if (mask[i] || before.heights[i] !== m.heights[i] || before.water.depth[i] > 0.05 !== m.water.depth[i] > 0.05) mark(i);
  let troughTiles = 0;
  let wet = 0;
  let dryFloor = 0;
  let buildableBefore = 0;
  let buildableAfter = 0;
  for (let i = 0; i < W * H; i++) {
    if (mask[i] === 1) {
      troughTiles++;
      wet += Number(m.water.depth[i] > 0.05);
      dryFloor += b[i];
    }
    if (region[i]) {
      buildableBefore += a[i];
      buildableAfter += b[i];
    }
  }
  void fan;
  let longest = 0;
  for (let y = 0; y <= H; y++) {
    let run = 0;
    let last = 0;
    for (let x = 0; x < W; x++) {
      const side = (y > 0 && mask[(y - 1) * W + x] === 1 ? 1 : 0) - (y < H && mask[y * W + x] === 1 ? 1 : 0);
      run = side && side === last ? run + 1 : side ? 1 : 0;
      last = side;
      longest = Math.max(longest, run);
    }
  }
  for (let x = 0; x <= W; x++) {
    let run = 0;
    let last = 0;
    for (let y = 0; y < H; y++) {
      const side = (x > 0 && mask[y * W + x - 1] === 1 ? 1 : 0) - (x < W && mask[y * W + x] === 1 ? 1 : 0);
      run = side && side === last ? run + 1 : side ? 1 : 0;
      last = side;
      longest = Math.max(longest, run);
    }
  }
  const walls: number[] = [];
  for (let k = 3; k < p.path.length - 3; k += 3) {
    const pt = p.path[k];
    const aa = p.path[k - 3];
    const bb = p.path[k + 3];
    const len = portable.hypot(bb.x - aa.x, bb.y - aa.y) || 1;
    const nx = -(bb.y - aa.y) / len;
    const ny = (bb.x - aa.x) / len;
    for (const side of [-1, 1])
      for (let u = pt.r * 0.5; u < pt.r * 1.5; u += 0.5) {
        const x = clamp(Math.floor(pt.x + nx * u * side), 0, W - 1);
        const y = clamp(Math.floor(pt.y + ny * u * side), 0, H - 1);
        const i = y * W + x;
        if (mask[i] !== 1) {
          walls.push(Math.max(0, before.heights[i] - pt.floor - 1));
          break;
        }
      }
  }
  // the whole wet cliff boundary: adjacent wet edge pixels are one fall; the main river's cascades
  // inside the floor and the outgoing river are not hanging falls
  const edges: { lip: number; landing: number; drop: number }[] = [];
  for (let i = 0; i < W * H; i++)
    if (mask[i] !== 1 && m.water.depth[i] > 0.015)
      for (const [dx, dy] of N4) {
        const x = (i % W) + dx;
        const y = Math.floor(i / W) + dy;
        const j = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H || mask[j] !== 1 || m.water.depth[j] <= 0.01) continue;
        const drop = m.heights[i] - m.heights[j];
        if (drop >= 3) edges.push({ lip: i, landing: j, drop });
      }
  edges.sort((x, y) => y.drop - x.drop || x.lip - y.lip);
  const falls: typeof edges = [];
  for (const e of edges) if (!falls.some((f) => portable.hypot((f.lip % W) - (e.lip % W), Math.floor(f.lip / W) - Math.floor(e.lip / W)) < 5)) falls.push(e);
  const riverWidths: number[] = [];
  let passages = 0;
  const sections: GlaciateMeasure["sections"] = [];
  for (let k = 5; k < p.path.length - 5; k += 3) {
    const pt = p.streamPath[k];
    const aa = p.streamPath[k - 3];
    const bb = p.streamPath[k + 3];
    const len = portable.hypot(bb.x - aa.x, bb.y - aa.y) || 1;
    const nx = -(bb.y - aa.y) / len;
    const ny = (bb.x - aa.x) / len;
    let run: number[] = [];
    let main = false;
    const runs: number[][] = [];
    const seen = new Set<number>();
    const finish = () => {
      if (run.length) {
        runs.push(run);
        if (main) riverWidths.push(run.length);
      }
      run = [];
      main = false;
    };
    for (let u = -Math.ceil(p.path[k].r * 2); u <= p.path[k].r * 2; u++) {
      const x = Math.floor(pt.x + nx * u);
      const y = Math.floor(pt.y + ny * u);
      const i = y * W + x;
      if (x < 0 || y < 0 || x >= W || y >= H || seen.has(i)) continue;
      seen.add(i);
      if (mask[i] === 1 && m.water.depth[i] > 0.05) {
        run.push(i);
        main ||= p.stream[i] === 1;
      } else finish();
    }
    finish();
    passages = Math.max(passages, runs.length);
    sections.push({ k, runs });
  }
  let offChannelWet = 0;
  for (let i = 0; i < W * H; i++) if (mask[i] === 1 && !p.stream[i] && m.water.depth[i] > 0.05) offChannelWet++;
  return {
    troughTiles,
    wetShare: wet / (troughTiles || 1),
    passages,
    riverWidthMin: riverWidths.length ? Math.min(...riverWidths) : 0,
    riverWidthMax: riverWidths.length ? Math.max(...riverWidths) : 0,
    falls,
    offChannelWet,
    dryFloor,
    buildableGain: buildableAfter - buildableBefore,
    wallMedian: quantile(walls, 0.5),
    wallMax: walls.length ? Math.max(...walls) : 0,
    longestWall: longest,
    sections,
  };
}
