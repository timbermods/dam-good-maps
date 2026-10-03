// A route wound like a gully (D209: channels never run ruler-straight). A route found across a flat
// by the cheapest way is otherwise a straight line, since any sideways step only adds length: the
// badwater ditches (land/hazards.ts) and the outlets cut across a basin's flat (land/levels.ts
// `carveOutlets`) are wound by it.

import { PI, sinDet, TWO_PI } from "../math/detmath";
import type { Rng } from "../math/rng";
import * as portable from "../math/portable";

/** A route wound like a gully. The line of its tiles, smoothed, is moved sideways by a wave (up to
 *  2.5 tiles, 9–15 tiles long, none at either end) and drawn again as side-to-side steps; it ends
 *  at the first tile `isEnd` names. Kept only if every tile is allowed; otherwise the route as it
 *  was. */
export function windRoute(tiles: readonly number[], W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, rng: Rng): number[] {
  const n = tiles.length;
  if (n < 8) return tiles.slice();
  const wave = 9 + 6 * rng.float();
  const phase = TWO_PI * rng.float();
  const amp = Math.min(2.5, n / 6);
  // the wave as drawn, else the other way round, else half as wide
  for (const [a, p] of [[amp, phase], [amp, phase + PI], [amp / 2, phase], [amp / 2, phase + PI]]) {
    const out = windOnce(tiles, W, H, allowed, isEnd, wave, p, a);
    if (out) return out;
  }
  return tiles.slice();
}

function windOnce(tiles: readonly number[], W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, wave: number, phase: number, amp: number): number[] | null {
  const n = tiles.length;
  const px = tiles.map((i) => i % W);
  const py = tiles.map((i) => (i - (i % W)) / W);
  // the smoothed line: a moving average over 7 tiles
  const sx: number[] = [];
  const sy: number[] = [];
  for (let k = 0; k < n; k++) {
    let ax = 0;
    let ay = 0;
    let c = 0;
    for (let j = Math.max(0, k - 3); j <= Math.min(n - 1, k + 3); j++) {
      ax += px[j];
      ay += py[j];
      c++;
    }
    sx.push(ax / c);
    sy.push(ay / c);
  }
  const out: number[] = [tiles[0]];
  let cx = px[0];
  let cy = py[0];
  for (let k = 1; k < n; k++) {
    const k0 = Math.max(0, k - 2);
    const k1 = Math.min(n - 1, k + 2);
    const tx = sx[k1] - sx[k0];
    const ty = sy[k1] - sy[k0];
    const tl = portable.sqrt(tx * tx + ty * ty) || 1;
    const off = amp * sinDet((PI * k) / (n - 1)) * sinDet((TWO_PI * k) / wave + phase);
    // (M9b: where the wave would cross ground the ditch keeps off, it swings less there, down to
    // the route itself, rather than the whole ditch running straight)
    let walked: number[] | null = null;
    for (const f of k === n - 1 ? [0] : [1, 0.5, 0]) {
      const x = k === n - 1 ? px[k] : f === 0 ? px[k] : Math.round(sx[k] - (ty / tl) * off * f);
      const y = k === n - 1 ? py[k] : f === 0 ? py[k] : Math.round(sy[k] + (tx / tl) * off * f);
      const steps: number[] = [];
      let wx = cx;
      let wy = cy;
      let ok = true;
      while (wx !== x || wy !== y) {
        if (Math.abs(x - wx) >= Math.abs(y - wy)) wx += Math.sign(x - wx);
        else wy += Math.sign(y - wy);
        if (wx < 0 || wy < 0 || wx >= W || wy >= H || !allowed(wy * W + wx)) {
          ok = false;
          break;
        }
        steps.push(wy * W + wx);
      }
      if (ok) {
        walked = steps;
        cx = x;
        cy = y;
        break;
      }
    }
    if (!walked) return null;
    for (const i of walked) {
      // a loop is cut back to where it began
      const at = out.indexOf(i);
      if (at >= 0) out.length = at + 1;
      else out.push(i);
      if (isEnd(i)) return out;
    }
  }
  return out;
}

