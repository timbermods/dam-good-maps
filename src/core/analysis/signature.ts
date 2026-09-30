// What makes each theme's promise (M9b, D273 outcome 2), read from a finished map: the measures
// behind each theme's signature. The signature itself is checked like an intention (D273): a
// candidate without it is not chosen (gen/outcomes.ts). The measures are information everywhere.
//
// - River Valley, a main river through a broad valley: the low ground either side of the main
//   river's water (within a level of its surface), across the valley, at the median of its course.
// - Canyon, a river cut deep between cliffs for a real stretch: the longest stretch of a river whose
//   ground within 5 tiles rises 3+ levels over its water on both sides.
// - Highlands, high, rugged ground with plateaus and valleys among it: the share of the dry land 4+
//   levels over the rivers, the cliffs, and the plateaus (broad level ground standing over the land
//   round it).
// - Lake Basin, big lakes that dominate the water: the share of the water standing in the natural
//   lakes the generator found, and the largest of them.
// - Delta, a river splitting into several channels as it reaches low ground: the main system's
//   separate mouths on the edge it leaves by.
// - Islands, land broken by water into islands: the water's share, the largest body, the land apart
//   from the largest land mass, and the islands of 30+ tiles (scaled with the map's area).

import type { Feature, RiverFeature } from "../features/schema";
import { wetSystems } from "./story";
import { polygonMask } from "../features/geometry";

export interface Signature {
  /** River Valley: the median width of the main river's valley floor, as a share of the side. */
  valley: number;
  /** Canyon: the longest stretch of a river between cliffs, in tiles and as a share of its course. */
  canyon: number;
  canyonShare: number;
  /** Highlands: dry land 4+ levels over the rivers' median surface (share), the cliff share, and
   *  the plateaus. */
  high: number;
  cliffs: number;
  plateaus: number;
  /** Lake Basin: the share of the wet tiles standing in lakes, and the largest lake's share of the
   *  map. */
  lakeShare: number;
  bigLake: number;
  /** Delta: the main system's mouths on its way out. */
  mouths: number;
  /** Islands: water's share of the map, the largest body's, the land apart from the largest land
   *  mass, and islands of 30+ tiles at 128². */
  water: number;
  mainBody: number;
  apart: number;
  islands: number;
}

const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** A river's course, a tile at a time inside the map, with the direction along it. */
function samples(r: RiverFeature, W: number, H: number): { x: number; y: number; dx: number; dy: number }[] {
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  const p = r.params.path;
  for (let k = 0; k + 1 < p.length; k++) {
    const [ax, ay] = p[k];
    const [bx, by] = p[k + 1];
    const L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    if (L <= 0) continue;
    const n = Math.max(1, Math.ceil(L));
    for (let t = 0; t < n; t++) {
      const x = ax + ((bx - ax) * t) / n;
      const y = ay + ((by - ay) * t) / n;
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2) continue;
      out.push({ x, y, dx: (bx - ax) / L, dy: (by - ay) / L });
    }
  }
  return out;
}

/** The water's surface near a point: the lowest wet surface within 2 tiles, else the ground. */
function surfaceNear(h: ArrayLike<number>, D: ArrayLike<number>, W: number, H: number, x: number, y: number): number {
  let s = Infinity;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const xx = cx + dx;
      const yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (D[i] >= 0.05 && h[i] + D[i] < s) s = h[i] + D[i];
    }
  return Number.isFinite(s) ? s : h[Math.min(H - 1, Math.max(0, cy)) * W + Math.min(W - 1, Math.max(0, cx))];
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

export function signatureOf(W: number, H: number, h: Uint8Array, D: ArrayLike<number>, features: readonly Feature[]): Signature {
  const N = W * H;
  const side = Math.min(W, H);
  const areaK = N / (128 * 128);
  const rivers = features.filter((f): f is RiverFeature => f.kind === "river" && !f.params.badwater && f.role !== "river/startSpring" && f.role !== "river/lakeSpring");
  const main = rivers.find((r) => r.role === "river/main") ?? rivers[0];
  const wet = (i: number) => D[i] >= 0.05;
  // ---- the main river's valley floor: across the course, the low ground either side of the water
  const widths: number[] = [];
  if (main) {
    const S = samples(main, W, H);
    for (let k = 0; k < S.length; k += 3) {
      const { x, y, dx, dy } = S[k];
      const surf = surfaceNear(h, D, W, H, x, y);
      let width = 0;
      for (const sgn of [-1, 1]) {
        for (let t = 1; t <= Math.round(0.3 * side); t++) {
          const xx = Math.round(x - sgn * dy * t);
          const yy = Math.round(y + sgn * dx * t);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          const i = yy * W + xx;
          if (!wet(i) && h[i] > surf + 1) break;
          width++;
        }
      }
      widths.push(width);
    }
  }
  // ---- canyons: the longest stretch of any river whose ground 3–5 tiles out rises 3+ levels over
  //      its water on both sides
  let canyon = 0;
  let canyonShare = 0;
  for (const r of rivers) {
    const S = samples(r, W, H);
    let run = 0;
    let best = 0;
    for (const { x, y, dx, dy } of S) {
      const surf = surfaceNear(h, D, W, H, x, y);
      let sides = 0;
      for (const sgn of [-1, 1]) {
        let top = -Infinity;
        for (let t = 2; t <= 6; t++) {
          const xx = Math.round(x - sgn * dy * t);
          const yy = Math.round(y + sgn * dx * t);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          if (h[yy * W + xx] > top) top = h[yy * W + xx];
        }
        if (top >= surf + 3) sides++;
      }
      run = sides === 2 ? run + 1 : 0;
      if (run > best) best = run;
    }
    if (best > canyon) {
      canyon = best;
      canyonShare = S.length ? best / S.length : 0;
    }
  }
  // ---- highlands: dry land well over the rivers, cliffs, plateaus
  const surfaces: number[] = [];
  for (let i = 0; i < N; i++) if (wet(i)) surfaces.push(h[i] + D[i]);
  const waterLevel = median(surfaces);
  let dry = 0;
  let high = 0;
  let cliff = 0;
  for (let i = 0; i < N; i++) {
    if (wet(i)) continue;
    dry++;
    if (h[i] >= waterLevel + 4) high++;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of D4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (h[i] - h[yy * W + xx] >= 2) {
        cliff++;
        break;
      }
    }
  }
  // plateaus: level ground of 120+ tiles (at 128²) whose rim mostly drops 2+ levels
  const seen = new Uint8Array(N);
  let plateaus = 0;
  const minPlateau = Math.round(120 * areaK);
  for (let s = 0; s < N; s++) {
    if (seen[s] || wet(s)) continue;
    const L = h[s];
    const q = [s];
    seen[s] = 1;
    let rim = 0;
    let drop = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (h[j] === L && !wet(j)) {
          if (!seen[j]) {
            seen[j] = 1;
            q.push(j);
          }
        } else if (h[j] !== L) {
          rim++;
          if (L - h[j] >= 2 || (wet(j) && L - h[j] >= 1)) drop++;
        }
      }
    }
    if (q.length >= minPlateau && L >= waterLevel + 3 && rim > 0 && drop >= 0.5 * rim) plateaus++;
  }
  // ---- lakes: the natural lakes the generator found (its read-back lake features), as far as they
  //      hold water; a wide slow river is level too, so the water's shape alone cannot tell them
  const sys = wetSystems(W, H, D);
  let inLakes = 0;
  let bigLake = 0;
  let wetTiles = 0;
  for (let i = 0; i < N; i++) if (wet(i)) wetTiles++;
  {
    const counted = new Uint8Array(N);
    for (const f of features) {
      if (f.kind !== "lake") continue;
      const m = polygonMask(f.params.outline, W, H);
      let n = 0;
      for (let i = 0; i < N; i++)
        if (m[i] && wet(i)) {
          n++;
          if (!counted[i]) {
            counted[i] = 1;
            inLakes++;
          }
        }
      if (n > bigLake) bigLake = n;
    }
  }
  // ---- the main system's mouths on the edge it leaves by
  let mouths = 0;
  if (main && "edge" in main.params.exit) {
    let mainSys = -1;
    let best = -1;
    sys.volume.forEach((v, k) => {
      if (v > best) {
        best = v;
        mainSys = k;
      }
    });
    const e = main.params.exit.edge;
    const L = e === "west" || e === "east" ? H : W;
    const at = (a: number) => (e === "west" ? a * W : e === "east" ? a * W + W - 1 : e === "south" ? a : (H - 1) * W + a);
    let run = false;
    let gap = 0;
    for (let a = 0; a < L; a++) {
      const i = at(a);
      const inMain = sys.labels[i] === mainSys;
      if (inMain) {
        if (!run && (mouths === 0 || gap >= 3)) mouths++;
        run = true;
        gap = 0;
      } else {
        run = false;
        gap++;
      }
    }
  }
  // ---- islands: land apart from the largest land mass, and islands of 30+ tiles (at 128²)
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = wet(i) ? 0 : 1;
  const landLab = new Int32Array(N).fill(-1);
  const landSizes: number[] = [];
  for (let s = 0; s < N; s++) {
    if (!land[s] || landLab[s] >= 0) continue;
    const id = landSizes.length;
    const q = [s];
    landLab[s] = id;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!land[j] || landLab[j] >= 0) continue;
        landLab[j] = id;
        q.push(j);
      }
    }
    landSizes.push(q.length);
  }
  let largestLand = 0;
  for (const n of landSizes) if (n > largestLand) largestLand = n;
  const islandMin = Math.round(30 * areaK);
  const islands = landSizes.filter((n) => n >= islandMin && n < largestLand).length;
  const mainBody = sys.tiles.length ? Math.max(...sys.tiles) : 0;
  return {
    valley: r3(median(widths) / side),
    canyon,
    canyonShare: r3(canyonShare),
    high: r3(dry ? high / dry : 0),
    cliffs: r3(dry ? cliff / dry : 0),
    plateaus,
    lakeShare: r3(wetTiles ? inLakes / wetTiles : 0),
    bigLake: r3(bigLake / N),
    mouths,
    water: r3(wetTiles / N),
    mainBody: r3(mainBody / N),
    apart: r3(dry ? (dry - largestLand) / dry : 0),
    islands,
  };
}

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
