// The field, design version 2: version 1's uplift (a regional slope, warped noise and the parts),
// with a slow regional field beside the tilt, and the vertical processes Verticality drives:
// - caprock: hard rock in the upper part of the land, in patches (noise), that erosion and
//   weathering cut round instead of through;
// - stream-power erosion with that hardness (hard rock resists incision and diffusion keeps its
//   edges sharp);
// - weathering: soft high ground wastes down toward the ground round it, so caprock patches stand
//   up as stacks, buttes and mesas, and a mesa whose middle is soft keeps a rim round a hollow
//   (a summit lake when a spring feeds it).
// Nothing is placed: stacks stand where the caprock lies, and the caprock lies where the noise put
// it. Exact arithmetic throughout (integer-hash noise, square roots, the deterministic sine).

import { hash32 } from "../../../src/core/math/hash";
import { fbm } from "../../../src/core/math/noise";
import { stream } from "../../../src/core/math/rng";
import { drainage } from "../proto/erode";
import type { Part } from "../proto/genome";
import { bump, clamp, DIRS8, dist, polyDist, smoothstep, unit } from "../proto/num";
import type { GenomeV2 } from "./genome";

/** The seed the land's noise draws from: a variation (D143) gets land of its own. */
export function landSeed(seed: number, variation: number): number {
  return variation ? hash32(seed, "variation-land", variation) : seed;
}

function partLine(p: Part, W: number, H: number, seed: number, k: number): [number, number][] {
  const [ux, uy] = unit(p.turn);
  const cx = p.at[0] * (W - 1);
  const cy = p.at[1] * (H - 1);
  const rng = stream(seed, "part-line", k);
  const bend = (rng.float() * 2 - 1) * 0.25 * p.size;
  const half = p.size / 2;
  return [
    [cx - ux * half, cy - uy * half],
    [cx - uy * bend, cy + ux * bend],
    [cx + ux * half, cy + uy * half],
  ];
}

function blob(x: number, y: number, cx: number, cy: number, r: number, s: number, soft: number): number {
  const d = dist(x, y, cx, cy) / r;
  const n = fbm(s, x, y, Math.max(6, r * 0.8), 3);
  return smoothstep((1 - d + 0.45 * n) * (r / Math.max(0.5, soft)) + 0.5);
}

function pseudoAngle(dx: number, dy: number): number {
  const s = Math.abs(dx) + Math.abs(dy);
  if (s === 0) return 0;
  const p = dy / s;
  return clamp((dx < 0 ? 2 - p : p < 0 ? 4 + p : p) / 4, 0, 1);
}

/** Version 1's parts (proto/field.ts), unchanged in shape. */
function addPart(U: Float64Array, p: Part, seed: number, W: number, H: number, k: number): void {
  const cx = p.at[0] * (W - 1);
  const cy = p.at[1] * (H - 1);
  const s = hash32(seed, "part", k, p.kind);
  const each = (f: (x: number, y: number, i: number) => void) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f(x, y, y * W + x);
  };
  switch (p.kind) {
    case "ridge":
    case "trough": {
      const line = partLine(p, W, H, seed, k);
      each((x, y, i) => {
        const w = p.extra * (1 + 0.5 * fbm(s, x, y, 16, 2));
        U[i] += p.height * bump(polyDist(x, y, line) / w) * (1 + 0.5 * fbm(s + 1, x, y, 9, 2));
      });
      return;
    }
    case "basin": {
      // Kyler (2026-09-25): lakes mostly take the land's shape, not a bowl's. A large basin is a
      // valley-shaped hollow: long (1.6–3.4 times as long as wide), bent, with a ragged shore of bays
      // and one to three fingers reaching out as side valleys would. An island sea is broad, with
      // inlets. Only ponds (under 14 tiles across) and the round lakes an intention asks for stay
      // bowls; calderas and cone craters keep their own round shapes.
      const shape = p.shape ?? (p.size < 14 ? "round" : "valley");
      if (shape === "round") {
        each((x, y, i) => {
          const d = dist(x, y, cx, cy) / (p.size * (1 + 0.5 * fbm(s, x, y, Math.max(8, p.size * 0.7), 3)));
          U[i] += p.height * bump(d) + p.extra * (0.3 + 0.7 * (fbm(s + 3, x, y, 8, 2) + 1)) * bump(Math.abs(d - 1.05) / 0.45);
          if (p.soft > 0) U[i] += (-p.height + p.soft) * bump(dist(x, y, cx, cy) / (p.size * 0.3 * (1 + 0.4 * fbm(s + 5, x, y, 6, 2))));
        });
        return;
      }
      const sea = shape === "sea";
      const r = stream(s, "basin-shape");
      const [ux, uy] = unit(p.turn);
      const aspect = sea ? 1 + 0.4 * r.float() : 1.6 + 1.8 * r.float();
      const major = p.size * Math.sqrt(aspect);
      const minor = p.size / Math.sqrt(aspect);
      const bend = sea ? 0 : (r.float() * 2 - 1) * 0.6;
      const cell = Math.max(5, p.size * 0.32);
      const arms: { ax: number; ay: number; bx: number; by: number; w: number }[] = [];
      const nArms = sea ? 3 + Math.floor(3 * r.float()) : 1 + Math.floor(3 * r.float());
      for (let k = 0; k < nArms; k++) {
        const off = (r.float() * 2 - 1) * 0.6 * major;
        const ax = cx + ux * off;
        const ay = cy + uy * off;
        const [vx, vy] = unit(r.float());
        const len = sea ? (0.35 + 0.35 * r.float()) * p.size : minor * (1.2 + 1.2 * r.float());
        arms.push({ ax, ay, bx: ax + vx * len, by: ay + vy * len, w: (sea ? 0.14 : 0.3) * (0.8 + 0.4 * r.float()) * (sea ? p.size : minor) });
      }
      each((x, y, i) => {
        const dx = x - cx;
        const dy = y - cy;
        const a = dx * ux + dy * uy;
        const b = -dx * uy + dy * ux - (bend * a * a) / major;
        const n = 1 + 0.45 * fbm(s, x, y, cell, 3);
        let d = Math.sqrt((a / major) * (a / major) + (b / minor) * (b / minor)) / n;
        for (const arm of arms) {
          const vx = arm.bx - arm.ax;
          const vy = arm.by - arm.ay;
          const l2 = vx * vx + vy * vy;
          const t = l2 > 0 ? clamp(((x - arm.ax) * vx + (y - arm.ay) * vy) / l2, 0, 1) : 0;
          const e = dist(x, y, arm.ax + t * vx, arm.ay + t * vy) / (arm.w * (1 - 0.55 * t) * n);
          if (e < d) d = e;
        }
        // a sea keeps a broad floor with steep shores (thin sheets of water settle slowly); a valley
        // lake deepens toward its middle
        U[i] += p.height * (sea ? smoothstep((1.05 - d) / 0.18) : bump(d)) + (sea ? 0 : p.extra * (0.3 + 0.7 * (fbm(s + 3, x, y, 8, 2) + 1)) * bump(Math.abs(d - 1.05) / 0.45));
        if (p.soft > 0 && !sea) U[i] += (-p.height + p.soft) * bump(dist(x, y, cx, cy) / (minor * 0.45 * (1 + 0.4 * fbm(s + 5, x, y, 6, 2))));
      });
      return;
    }
    case "caldera": {
      each((x, y, i) => {
        const r = p.size * (1 + 0.15 * fbm(s, x, y, 14, 2));
        const d = dist(x, y, cx, cy);
        const ring = bump(Math.abs(d - r) / (p.soft * (3.2 + 1.0 * fbm(s + 2, x, y, 10, 2))));
        const inside = d < r ? smoothstep((r - d) / 5) : 0;
        U[i] += p.height * (0.65 + 0.35 * (fbm(s + 3, x, y, 8, 2) + 1)) * ring - (p.height + 1.5) * inside;
        if (p.extra > 0) U[i] += (p.height + 2) * bump(d / p.extra);
      });
      return;
    }
    case "mesa":
    case "plateau": {
      let top = -Infinity;
      each((x, y, i) => {
        if (dist(x, y, cx, cy) < p.size * 0.5) top = Math.max(top, U[i]);
      });
      top += p.height;
      each((x, y, i) => {
        const m = blob(x, y, cx, cy, p.size, s, p.soft);
        if (m <= 0) return;
        const lifted = Math.max(U[i], top - p.extra * 0.5 * (1 + fbm(s + 2, x, y, 10, 2)));
        U[i] = U[i] * (1 - m) + lifted * m;
      });
      return;
    }
    case "mesaField": {
      const rng = stream(seed, "mesa-field", k);
      const n = Math.max(2, Math.round(p.extra));
      for (let j = 0; j < n; j++) {
        const a = rng.float();
        const r = p.size * Math.sqrt(rng.float());
        const [ux, uy] = unit(a);
        const mx = cx + ux * r;
        const my = cy + uy * r;
        const rad = 3.5 + 4 * rng.float();
        const h = p.height * (0.6 + 0.8 * rng.float());
        const ms = hash32(seed, "mesa", k, j);
        let top = -Infinity;
        for (let y = Math.max(0, Math.floor(my - rad)); y <= Math.min(H - 1, Math.ceil(my + rad)); y++)
          for (let x = Math.max(0, Math.floor(mx - rad)); x <= Math.min(W - 1, Math.ceil(mx + rad)); x++) top = Math.max(top, U[y * W + x]);
        top += h;
        for (let y = Math.max(0, Math.floor(my - 2 * rad)); y <= Math.min(H - 1, Math.ceil(my + 2 * rad)); y++)
          for (let x = Math.max(0, Math.floor(mx - 2 * rad)); x <= Math.min(W - 1, Math.ceil(mx + 2 * rad)); x++) {
            const m = blob(x, y, mx, my, rad, ms, p.soft);
            const i = y * W + x;
            if (m > 0) U[i] = U[i] * (1 - m) + Math.max(U[i], top) * m;
          }
      }
      return;
    }
    case "escarpment": {
      // a long wobbling cliff line (version 2: it dies out along its length, `size` tiles long)
      const [ux, uy] = unit(p.turn);
      const half = Math.max(8, p.size / 2);
      each((x, y, i) => {
        const sd = (x - cx) * ux + (y - cy) * uy + p.extra * fbm(s, x, y, 26, 3);
        const along = (x - cx) * -uy + (y - cy) * ux + 0.3 * half * fbm(s + 4, x, y, 30, 2);
        const taper = along >= half ? 0 : along <= -half ? 0 : 1 - smoothstep((Math.abs(along) - 0.6 * half) / (0.4 * half));
        U[i] += p.height * (smoothstep(sd / p.soft + 0.5) - 0.5) * taper;
      });
      return;
    }
    case "cone": {
      each((x, y, i) => {
        const d = dist(x, y, cx, cy) / (p.size * (1 + 0.15 * fbm(s, x, y, 10, 2)));
        if (d < 1) U[i] += p.height * (1 - d);
        if (p.extra > 0) U[i] -= p.height * 0.55 * bump(dist(x, y, cx, cy) / p.extra);
      });
      return;
    }
    case "knolls": {
      const rng = stream(seed, "knolls", k);
      const n = Math.round(p.extra);
      for (let j = 0; j < n; j++) {
        const kx = 4 + (W - 8) * rng.float();
        const ky = 4 + (H - 8) * rng.float();
        const rad = 2.5 + 5 * rng.float();
        const h = p.height * (0.5 + rng.float());
        for (let y = Math.max(0, Math.floor(ky - rad)); y <= Math.min(H - 1, Math.ceil(ky + rad)); y++)
          for (let x = Math.max(0, Math.floor(kx - rad)); x <= Math.min(W - 1, Math.ceil(kx + rad)); x++) U[y * W + x] += h * bump(dist(x, y, kx, ky) / rad);
      }
      return;
    }
    case "spiral": {
      const turns = p.extra;
      each((x, y, i) => {
        const d = dist(x, y, cx, cy);
        if (d > p.size) return;
        const a = pseudoAngle(x - cx, y - cy);
        const lane = (d / p.size) * turns - a;
        const f = lane - Math.floor(lane);
        U[i] += p.height * (1 - d / p.size) + (f < 0.5 ? 0 : -1.2) * (1 - d / p.size);
      });
      return;
    }
  }
}

export interface Field {
  /** The eroded, weathered field (levels, floats). */
  E: Float64Array;
  /** Caprock hardness per tile (0 soft – 1 hard). */
  hard: Float64Array;
}

/** Uplift: the regional tilt, the slow regional field, warped noise and the parts. */
export function upliftV2(g: GenomeV2, seed: number, W: number, H: number): Float64Array {
  const ls = landSeed(seed, g.variation);
  const N = W * H;
  const U = new Float64Array(N);
  const [fx, fy] = DIRS8[g.flowDir];
  const sx = hash32(ls, "noise", g.theme);
  const wx = hash32(ls, "warp-x");
  const wy = hash32(ls, "warp-y");
  const rs = hash32(ls, "regional");
  const nz = g.noise;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1)) * 2 - 1;
      const v = (y / (H - 1)) * 2 - 1;
      const proj = (u * fx + v * fy) / (Math.abs(fx) + Math.abs(fy));
      let h = 0;
      if (g.tiltKind === "linear") h += g.tilt * -0.5 * proj;
      else {
        const du = x / (W - 1) - g.focus[0];
        const dv = y / (H - 1) - g.focus[1];
        h += g.tilt * (Math.sqrt(du * du + dv * dv) * 1.6 - 0.4) - 0.3 * g.tilt * proj;
      }
      // the slow regional field: broad highs and lows that are not one plane
      h += g.regional.amp * fbm(rs, x, y, g.regional.cell, 2);
      const px = x + nz.warp * fbm(wx, x, y, nz.warpCell, 2);
      const py = y + nz.warp * fbm(wy, x, y, nz.warpCell, 2);
      let n = fbm(sx, px, py, nz.cell, nz.octaves);
      if (nz.ridged > 0) n = (1 - nz.ridged) * n + nz.ridged * (1 - 2 * Math.abs(n)) * 0.8;
      h += nz.amp * n;
      U[y * W + x] = h;
    }
  const ps = ls;
  g.parts.forEach((p, k) => addPart(U, p, ps, W, H, k));
  return U;
}

function quantile(v: Float64Array, q: number): number {
  const s = Float64Array.from(v).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

/** Caprock: patches of hard rock in the upper part of the land (the stratum). */
export function caprock(U: Float64Array, g: GenomeV2, seed: number, W: number, H: number): { hard: Float64Array; stratum: Float64Array } {
  const N = W * H;
  const hard = new Float64Array(N);
  const stratum = new Float64Array(N);
  if (g.cap.share <= 0.01) return { hard, stratum };
  const cs = hash32(landSeed(seed, g.variation), "caprock");
  const lo = quantile(U, g.cap.level);
  const hi = quantile(U, Math.min(0.98, g.cap.level + 0.2));
  const band = Math.max(1e-6, hi - lo);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // patches: about `share` of the stratum, sharp-edged so stacks have walls
      const n = (fbm(cs, x, y, g.cap.cell, 2) + 1) / 2;
      const patch = smoothstep((n - (1 - g.cap.share)) * 8 + 0.5);
      stratum[i] = smoothstep((U[i] - lo) / band);
      hard[i] = patch * stratum[i];
    }
  return { hard, stratum };
}

/** Stream-power erosion (as ../proto/erode.ts) with hardness: hard rock resists incision, and
 *  diffusion keeps its edges. */
export function erodeHard(U: Float64Array, hard: Float64Array, W: number, H: number, iterations: number, k: number, diffusion: number): Float64Array {
  const h = U.slice();
  const N = W * H;
  const tmp = new Float64Array(N);
  for (let it = 0; it < iterations; it++) {
    const d = drainage(h, W, H, { epsilon: 1e-6 });
    for (let q = 0; q < d.order.length; q++) {
      const i = d.order[q];
      const r = d.rcv[i];
      if (r < 0) continue;
      if (!(h[i] > h[r])) continue;
      const dx = (i % W) - (r % W);
      const dy = Math.floor(i / W) - Math.floor(r / W);
      const len = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const F = (k * (1 - 0.85 * hard[i]) * Math.sqrt(d.area[i])) / len;
      h[i] = (h[i] + F * h[r]) / (1 + F);
    }
    if (diffusion > 0) {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const a = x > 0 ? h[i - 1] : h[i];
          const b = x + 1 < W ? h[i + 1] : h[i];
          const c = y > 0 ? h[i - W] : h[i];
          const e = y + 1 < H ? h[i + W] : h[i];
          tmp[i] = h[i] + diffusion * (1 - 0.8 * hard[i]) * ((a + b + c + e) / 4 - h[i]);
        }
      h.set(tmp);
    }
  }
  return h;
}

/** A square min filter of radius r (separable, exact). */
function minFilter(v: Float64Array, W: number, H: number, r: number): Float64Array {
  const tmp = new Float64Array(W * H);
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = Infinity;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < W && v[y * W + xx] < m) m = v[y * W + xx];
      }
      tmp[y * W + x] = m;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < H && tmp[yy * W + x] < m) m = tmp[yy * W + x];
      }
      out[y * W + x] = m;
    }
  return out;
}

/** Weathering: soft rock in the upper stratum wastes down toward the lowest ground near it; hard
 *  rock stays, and the lowlands keep their shape. */
export function weather(E: Float64Array, hard: Float64Array, stratum: Float64Array, W: number, H: number, strength: number): Float64Array {
  if (strength <= 0.01) return E;
  const r = Math.round(3 + 5 * strength);
  const lo = minFilter(E, W, H, r);
  const out = new Float64Array(E.length);
  for (let i = 0; i < E.length; i++) out[i] = E[i] - strength * stratum[i] * (1 - hard[i]) * 0.85 * Math.max(0, E[i] - lo[i]);
  return out;
}

export function fieldV2(g: GenomeV2, seed: number, W: number, H: number): Field {
  const U = upliftV2(g, seed, W, H);
  const { hard, stratum } = caprock(U, g, seed, W, H);
  let E = erodeHard(U, hard, W, H, g.erosion.iterations, g.erosion.k, g.erosion.diffusion);
  // weathering acts in the caprock's stratum: soft rock goes, hard rock stands
  if (g.cap.share > 0.01) E = weather(E, hard, stratum, W, H, g.weathering);
  return { E, hard };
}
