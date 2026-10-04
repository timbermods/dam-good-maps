// Islands stand clear of the shore (M9b, D350; the Islands theme's promise, D273 (2): land broken by
// water into islands). A sea layout's islands are parts of the field like any other, and where one
// stands near the sea's shore its flank meets the land's and it is no island, only a headland. At the
// land stage, before the land is shown, each island joined to the largest land mass by low ground
// (within two levels of the sea's spill level) gets a strait: that ground round the island's core,
// between three quarters of its radius and four tiles past it, goes a level under the sea's spill
// level, where that parts the island from the mainland; where it doesn't (a ridge joins them, or the
// island is the mainland's own), nothing changes.

import { edgeSpill } from "./drainage";
import * as portable from "../math/portable";
import { N4 } from "../math/grid";

/** Dry land (over `S`), labelled by 4-connected mass, and which masses touch the map's edge (the
 *  shore holding the sea; D432: on an open map the sea reaches the edge and the shore is several). */
function masses(h: Uint8Array, W: number, H: number, S: number): { lab: Int32Array; shore: Set<number> } {
  const N = W * H;
  const lab = new Int32Array(N).fill(-1);
  const shore = new Set<number>();
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || h[s0] <= S) continue;
    const q = [s0];
    lab[s0] = s0;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) shore.add(s0);
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
  }
  return { lab, shore };
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

/** Each island (centre and radius, tiles) joined to the shore by low ground is parted from it by a
 *  strait, when a cut of that ground does it. The islands are cut round together, so one joined to
 *  the shore only through its neighbours (an atoll's crescent, a chain) parts with them (D432); the
 *  ground round an island that stays joined whatever the cut (a ridge joins it, or it is the shore's
 *  own) goes back as it was. `keep` is left as it is. Returns how many were parted. */
export function standIslandsClear(h: Uint8Array, W: number, H: number, isles: readonly { x: number; y: number; r: number; aspect?: number; ux?: number; uy?: number }[], keep: Uint8Array | null, floor: number): number {
  const N = W * H;
  const S = seaLevel(h, W, H);
  if (S < 0) return 0;
  const cutTo = Math.max(floor, S - 1);
  const { lab, shore } = masses(h, W, H, S);
  // each island's core (its dry ground within three quarters of its radius) and the band round it
  const cores: number[][] = [];
  const bands: number[][] = [];
  for (const isle of isles) {
    const cx = Math.round(isle.x);
    const cy = Math.round(isle.y);
    const core: number[] = [];
    const band: number[] = [];
    if (cx >= 0 && cy >= 0 && cx < W && cy < H) {
      // (D417: a long island is an ellipse, `aspect` long along (ux, uy): the distances below are in
      // its radius, and the strait follows its coast; a round one as before)
      const asp = isle.aspect ?? 1;
      const ma = isle.r * portable.sqrt(asp);
      const mi = isle.r / portable.sqrt(asp);
      const ux = isle.ux ?? 1;
      const uy = isle.uy ?? 0;
      const far = (mi + 4) / mi;
      const R = ma + 4;
      for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
          const dx = x - cx;
          const dy = y - cy;
          const a = (dx * ux + dy * uy) / ma;
          const b = (-dx * uy + dy * ux) / mi;
          const d = portable.sqrt(a * a + b * b);
          const i = y * W + x;
          if (d <= 0.75) {
            if (h[i] > S) core.push(i);
          } else if (d <= far && shore.has(lab[i]) && !keep?.[i] && h[i] <= S + 2) band.push(i);
        }
    }
    // (an island with no dry core, or one not joined to the shore, has nothing to part)
    const joined = core.length > 0 && core.some((i) => shore.has(lab[i]));
    cores.push(joined ? core : []);
    bands.push(joined ? band : []);
  }
  // the cut, round every island at once
  const before = new Map<number, number>();
  for (const band of bands) for (const i of band) if (!before.has(i)) before.set(i, h[i]);
  for (const i of before.keys()) h[i] = cutTo;
  // (a cut that opened the sea a way out below its level, through the shore beside its sill or its
  // outlet, goes back: the sea keeps its level)
  {
    const spill = edgeSpill(h, W, H);
    for (const [i, v] of before) if (spill[i] < S) h[i] = v;
  }
  // islands still joined to the shore get their ground back, and the rest are checked again, until
  // every island cut round stands apart
  const stays = new Uint8Array(isles.length);
  for (;;) {
    const after = masses(h, W, H, S);
    let more = false;
    for (let k = 0; k < isles.length; k++) {
      if (stays[k] || !cores[k].length) continue;
      const apart = cores[k].some((i) => after.lab[i] >= 0 && !after.shore.has(after.lab[i]));
      if (!apart) {
        stays[k] = 1;
        more = true;
      }
    }
    if (!more) break;
    const cut = new Uint8Array(N);
    for (let k = 0; k < isles.length; k++) if (!stays[k]) for (const i of bands[k]) cut[i] = 1;
    for (const [i, v] of before) if (!cut[i]) h[i] = v;
  }
  let parted = 0;
  for (let k = 0; k < isles.length; k++) if (cores[k].length && !stays[k]) parted++;
  return parted;
}

/** An island to expand to (D429, D432, Kyler's check): the largest island on the land, in tiles,
 *  reachable from the shore across water as the game allows; 0 when there is none. Dry is land over
 *  the sea's level with no more than 0.05 of the water `D` on it; an island is a dry mass that
 *  touches no edge of the map; it is reached across at most `strait` tiles of water at a time (a
 *  bridge, levees or a dam), from the shore (the largest dry mass touching an edge, where the start
 *  stands) or from any island reached. */
export function islandToExpandTo(h: Uint8Array, D: ArrayLike<number>, W: number, H: number, strait = 8): number {
  const N = W * H;
  const S = seaLevel(h, W, H);
  const dry = (i: number) => !(D[i] > 0.05) && h[i] > S;
  const lab = new Int32Array(N).fill(-1);
  const size: number[] = [];
  const edge: boolean[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || !dry(s0)) continue;
    const id = size.length;
    const q = [s0];
    lab[s0] = id;
    let e = false;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) e = true;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lab[j] < 0 && dry(j)) {
          lab[j] = id;
          q.push(j);
        }
      }
    }
    size.push(q.length);
    edge.push(e);
  }
  // (from the largest shore mass, the start's likeliest land: a shore the sea splits in two may
  // reach an island from the side the start is not on)
  const reached = new Uint8Array(size.length);
  let shore = -1;
  for (let m = 0; m < size.length; m++) if (edge[m] && (shore < 0 || size[m] > size[shore])) shore = m;
  if (shore < 0) return 0;
  reached[shore] = 1;
  for (let grew = true; grew; ) {
    grew = false;
    const dist = new Int16Array(N).fill(-1);
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (lab[i] >= 0 && reached[lab[i]]) { dist[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      if (dist[c] > strait) continue;
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (dist[j] >= 0) continue;
        if (lab[j] >= 0) {
          if (!reached[lab[j]]) { reached[lab[j]] = 1; grew = true; }
          continue;
        }
        dist[j] = dist[c] + 1;
        q.push(j);
      }
    }
  }
  let best = 0;
  for (let m = 0; m < size.length; m++) if (!edge[m] && reached[m] && size[m] > best) best = size[m];
  return best;
}
