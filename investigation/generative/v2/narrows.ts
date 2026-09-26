// The natural-narrows builder (design version 2, task g; D111): the editor's Dam site tool, and a
// feature M12's Claude can steer to, rebuilt as land instead of a wall. Two hillside spurs close in
// on a river from its two banks, each a tongue of ground of uneven thickness that falls 1–2 levels
// from its root on the valley side to its tip by the channel, the two drawn apart (lengths, bends,
// heights, thicknesses) and offset along the river, so together they never read as one straight
// band. The channel keeps its gap; a dam across the gap is the player's to build. The generator
// never calls it (D111): it is an edit a player or Claude asks for.
//
// The build refuses a result the dam-wall check (lib/ridge.ts) flags, and says why; it then tries
// once more with the spurs drawn further apart before giving up.

import { hash32 } from "../../../src/core/math/hash";
import { fbm } from "../../../src/core/math/noise";
import { stream } from "../../../src/core/math/rng";
import type { Point } from "../../../src/core/features/schema";
import { damWalls } from "../lib/ridge";
import { smoothstep } from "../proto/num";

export interface NarrowsRequest {
  /** The river's path (flow order) and channel width. */
  path: Point[];
  width: number;
  /** Where along the river, 0–1 of its length. */
  at: number;
  /** How far each spur reaches toward the river, 0.5–1 of the way (default 0.8). */
  reach?: number;
  /** Levels the spurs stand above the channel's banks at their roots (1–4, default 2). */
  rise?: number;
  seed: number;
}

export interface NarrowsPlan {
  ok: boolean;
  /** The ground raised: tile → new level. */
  raise: Map<number, number>;
  /** The gap left for the river (tiles across the channel between the spur tips). */
  gap: number;
  report: string[];
  errors: string[];
}

function arc(p: Point[]): number {
  let l = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const dx = p[k + 1][0] - p[k][0];
    const dy = p[k + 1][1] - p[k][1];
    l += Math.sqrt(dx * dx + dy * dy);
  }
  return l;
}

function pointAt(p: Point[], s: number): { p: Point; t: Point } {
  let acc = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const dx = p[k + 1][0] - p[k][0];
    const dy = p[k + 1][1] - p[k][1];
    const l = Math.sqrt(dx * dx + dy * dy);
    if (acc + l >= s && l > 0) {
      const u = (s - acc) / l;
      return { p: [p[k][0] + u * dx, p[k][1] + u * dy], t: [dx / l, dy / l] };
    }
    acc += l;
  }
  const a = p[p.length - 2];
  const b = p[p.length - 1];
  const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) || 1;
  return { p: b, t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
}

export function planNarrows(h: Uint8Array, W: number, H: number, water: ArrayLike<number>, req: NarrowsRequest, tries = 2): NarrowsPlan {
  const errors: string[] = [];
  const report: string[] = [];
  const reach = Math.min(1, Math.max(0.5, req.reach ?? 0.8));
  const rise = Math.min(4, Math.max(1, Math.round(req.rise ?? 2)));
  const L = arc(req.path);
  if (L < 20) return { ok: false, raise: new Map(), gap: 0, report, errors: ["the river is too short here for a narrows (20 tiles at least)"] };
  for (let attempt = 0; attempt < tries; attempt++) {
    const rng = stream(req.seed, "narrows", attempt);
    const s0 = Math.min(L - 8, Math.max(8, req.at * L));
    const { p: [px, py], t: [tx, ty] } = pointAt(req.path, s0);
    const nx = -ty;
    const ny = tx;
    const ci = Math.round(py) * W + Math.round(px);
    const bed = h[ci];
    const bank = bed + 1;
    const raise = new Map<number, number>();
    const spur = (side: 1 | -1, k: number) => {
      // how far the valley side is: walk out along the normal until the ground stands at the crest
      // the root stands `rise` levels over the banks (a level more on one side, drawn), so the tips
      // still stand 1–2 levels over the banks: a dam across the gap meets them
      const crest = bank + rise + (rng.float() < 0.5 ? 1 : 0);
      let root = 0;
      for (let d = 1; d <= 30; d++) {
        const x = Math.round(px + side * nx * d);
        const y = Math.round(py + side * ny * d);
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) break;
        root = d;
        if (h[y * W + x] >= crest) break;
      }
      if (root < req.width / 2 + 3) return false;
      // the tongue: from the root to its tip, offset along the river and bent, of uneven thickness,
      // falling from the crest at the root to 1–3 levels lower at the tip
      const tip = req.width / 2 + 1 + (1 - reach) * root;
      const off = (rng.float() * 2 - 1) * (3 + 3 * attempt) + side * (1 + attempt) * 1.5;
      const bend = (rng.float() * 2 - 1) * (0.25 + 0.2 * attempt) * root;
      const thick = 2.2 + 2.2 * rng.float();
      const fall = 1 + Math.floor(rng.float() * 2);
      const ns = hash32(req.seed, "narrows-spur", attempt, k);
      const n = Math.ceil(root - tip) + 1;
      for (let j = 0; j <= n; j++) {
        const u = j / n; // 0 at the root, 1 at the tip
        const d = root - (root - tip) * u;
        const along = off + bend * 4 * u * (1 - u);
        const cx = px + side * nx * d + tx * along;
        const cy = py + side * ny * d + ty * along;
        const w = thick * (0.7 + 0.6 * (fbm(ns, cx, cy, 5, 2) + 1) / 2) * (1 - 0.35 * u);
        const level = Math.max(bank + 1, Math.round(crest - fall * smoothstep(u * 1.15)));
        const r = Math.ceil(w) + 1;
        for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
          for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
            if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
            const dd = Math.sqrt((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy));
            if (dd > w) continue;
            const i = yy * W + xx;
            if (water[i] > 0.05) continue;
            // the flanks fall a level toward the spur's edge (a hillside, not a wall)
            const lv = dd > 0.65 * w ? level - 1 : level;
            if (lv > h[i] && lv > (raise.get(i) ?? 0)) raise.set(i, lv);
          }
      }
      report.push(`the ${side > 0 ? "left" : "right"} spur reaches ${Math.round(root - tip)} tiles from the valley side, falling ${fall} level${fall > 1 ? "s" : ""} to its tip`);
      return true;
    };
    const a = spur(1, 0);
    const b = spur(-1, 1);
    if (!a || !b) {
      errors.push("the valley here is too narrow or too open for spurs on both banks");
      continue;
    }
    // the gap between the tips, across the channel
    let gap = 0;
    for (let d = -20; d <= 20; d++) {
      const x = Math.round(px + nx * d);
      const y = Math.round(py + ny * d);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (!raise.has(i) && (h[i] <= bank || water[i] > 0.05)) gap++;
    }
    // never a wall: the dam-wall check on the result
    const out = h.slice();
    for (const [i, lv] of raise) out[i] = lv;
    const walls = damWalls(out, W, H, water);
    if (walls.length) {
      errors.push(`the spurs read as a wall across the valley (attempt ${attempt + 1})`);
      report.length = 0;
      continue;
    }
    return { ok: true, raise, gap, report, errors: [] };
  }
  return { ok: false, raise: new Map(), gap: 0, report, errors };
}
