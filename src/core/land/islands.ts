// Islands stand clear of the shore (M9b, D350; the Islands theme's promise, D273 (2): land broken by
// water into islands). A sea layout's islands are parts of the field like any other, and where one
// stands near the sea's shore its flank meets the land's and it is no island, only a headland. At the
// land stage, before the land is shown, each island joined to the largest land mass by low ground
// (within two levels of the sea's spill level) gets a strait: that ground round the island's core,
// between three quarters of its radius and four tiles past it, goes a level under the sea's spill
// level, where that parts the island from the mainland; where it doesn't (a ridge joins them, or the
// island is the mainland's own), nothing changes.

import { edgeSpill } from "./levels";
import * as portable from "../math/portable";

const N4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Dry land (over `S`), labelled by 4-connected mass; the label of the largest. */
function masses(h: Uint8Array, W: number, H: number, S: number): { lab: Int32Array; main: number } {
  const N = W * H;
  const lab = new Int32Array(N).fill(-1);
  let main = -1;
  let mainSize = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || h[s0] <= S) continue;
    const q = [s0];
    lab[s0] = s0;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lab[j] < 0 && h[j] > S) {
          lab[j] = s0;
          q.push(j);
        }
      }
    }
    if (q.length > mainSize) {
      mainSize = q.length;
      main = s0;
    }
  }
  return { lab, main };
}

/** The sea's level: the spill level of the largest basin below it (the priority flood from the map's
 *  edges), or -1 when that basin is under 5% of the map (D350; D417: the land over it is what an
 *  island start stands on). */
export function seaLevel(h: Uint8Array, W: number, H: number): number {
  const N = W * H;
  const spill = edgeSpill(h, W, H);
  const seen = new Uint8Array(N);
  let S = -1;
  let best = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || !(spill[s0] > h[s0])) continue;
    const q = [s0];
    seen[s0] = 1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!seen[j] && spill[j] > h[j] && spill[j] === spill[s0]) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    if (q.length > best) {
      best = q.length;
      S = spill[s0];
    }
  }
  return S < 0 || best < 0.05 * N ? -1 : S;
}

/** Each island (centre and radius, tiles) joined to the largest land mass by low ground is parted
 *  from it by a strait, when a cut of that ground does it. `keep` is left as it is. Returns how many
 *  were parted. */
export function standIslandsClear(h: Uint8Array, W: number, H: number, isles: readonly { x: number; y: number; r: number; aspect?: number; ux?: number; uy?: number }[], keep: Uint8Array | null, floor: number): number {
  const N = W * H;
  const S = seaLevel(h, W, H);
  if (S < 0) return 0;
  const cutTo = Math.max(floor, S - 1);
  let parted = 0;
  for (const isle of isles) {
    const { lab, main } = masses(h, W, H, S);
    const cx = Math.round(isle.x);
    const cy = Math.round(isle.y);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    // (D417: a long island is an ellipse, `aspect` long along (ux, uy): the distances below are in
    // its radius, and the strait follows its coast; a round one as before)
    const asp = isle.aspect ?? 1;
    const ma = isle.r * portable.sqrt(asp);
    const mi = isle.r / portable.sqrt(asp);
    const ux = isle.ux ?? 1;
    const uy = isle.uy ?? 0;
    const far = (mi + 4) / mi;
    const nd = (x: number, y: number): number => {
      const dx = x - cx;
      const dy = y - cy;
      const a = (dx * ux + dy * uy) / ma;
      const b = (-dx * uy + dy * ux) / mi;
      return portable.sqrt(a * a + b * b);
    };
    // the island's core: its dry ground within three quarters of its radius
    const core: number[] = [];
    const R = ma + 4;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
        if (nd(x, y) <= 0.75 && h[y * W + x] > S) core.push(y * W + x);
      }
    if (!core.length || !core.some((i) => lab[i] === main)) continue;
    // (the island is the mainland's own when most of the mainland lies within it: nothing to part)
    const before: [number, number][] = [];
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
        const i = y * W + x;
        const d = nd(x, y);
        if (d <= 0.75 || d > far || lab[i] !== main || keep?.[i] || h[i] > S + 2) continue;
        before.push([i, h[i]]);
        h[i] = cutTo;
      }
    if (!before.length) continue;
    const after = masses(h, W, H, S);
    const apart = core.some((i) => after.lab[i] >= 0 && after.lab[i] !== after.main && h[i] > S);
    if (apart) parted++;
    else for (const [i, v] of before) h[i] = v;
  }
  return parted;
}
