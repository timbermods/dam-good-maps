// Intentions on a generated map (D138; land/intentions.ts holds the set, the draw, the nudges and the
// checks): what the settler knows when it prefers a place for a start intention, and the checks on
// the finished map, with one re-steer for the start's intentions and a drop, never a forced build,
// for the rest. Ported from the design version 2 prototype (investigation/generative/v2/generate.ts).

import { fallsOf, reachWalk } from "../analysis/vertical";
import type { BuildResult } from "../features/build";
import { checkIntention, START_SIDE, startPreference, type FinalCtx, type IntentionId, type SettlerView } from "../land/intentions";
import type { Hydro } from "../land/hydro";
import { distanceFrom } from "../math/grid";
import { droughtStorage } from "../sim/drought";
import { waterModel } from "../sim/model";

export interface IntentionResult {
  id: IntentionId;
  ok: boolean;
  note: string;
  /** "emerged" at the first check, "re-steered" after one re-steer, or "dropped". */
  outcome: "emerged" | "re-steered" | "dropped";
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** The land and water the settler scores places on, for the intentions' preferences. */
export function settlerView(h: Uint8Array, W: number, H: number, hy: Pick<Hydro, "rivers">, D: ArrayLike<number>, C: ArrayLike<number>, M: ArrayLike<number>): SettlerView & { prefer(id: IntentionId, x: number, y: number, L: number, walk: number): number } {
  const N = W * H;
  const joinT = new Uint8Array(N);
  for (const r of hy.rivers) {
    if (!("river" in r.params.exit)) continue;
    const p = r.params.path[r.params.path.length - 1];
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (x >= 0 && y >= 0 && x < W && y < H) joinT[y * W + x] = 1;
  }
  const fallT = new Uint8Array(N);
  for (const f of fallsOf(h, D, W, H, 1.5)) fallT[f.i] = 1;
  const sorted = Array.from(h).sort((a, b) => a - b);
  // clean bodies of 60+ tiles, their surface and what a 9-day drought leaves
  const kept = droughtStorage(waterModel(W, H, h, []), D, 9);
  const lab = new Int32Array(N).fill(-1);
  const lakes: SettlerView["lakes"] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || !(D[s0] >= 0.1) || !(C[s0] < 0.05)) continue;
    const q = [s0];
    lab[s0] = lakes.length;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lab[j] >= 0 || !(D[j] >= 0.1) || !(C[j] < 0.05)) continue;
        lab[j] = lakes.length;
        q.push(j);
      }
    }
    let surf = 0;
    let v = 0;
    let kv = 0;
    for (const i of q) {
      surf = Math.max(surf, h[i] + D[i]);
      v += D[i];
      kv += kept[i];
    }
    lakes.push({ tiles: q.length >= 60 ? q : [], surface: surf, keep9: v > 0 ? kv / v : 0 });
  }
  // farmland patches and gorges
  const farm = new Uint8Array(N);
  for (let i = 0; i < N; i++) farm[i] = M[i] > 0 && !(D[i] > 0.05) && C[i] < 0.05 ? 1 : 0;
  const flab = new Int32Array(N).fill(-1);
  const farms: SettlerView["farms"] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!farm[s0] || flab[s0] >= 0) continue;
    const q = [s0];
    flab[s0] = 1;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      cx += x;
      cy += y;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (flab[j] >= 0 || !farm[j] || Math.abs(h[j] - h[i]) > 1) continue;
        flab[j] = 1;
        q.push(j);
      }
    }
    if (q.length >= 400) farms.push({ size: q.length, cx: cx / q.length, cy: cy / q.length });
  }
  const gorge = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(D[i] >= 0.1)) continue;
      const s = h[i] + D[i];
      let sides = 0;
      for (const [dx, dy] of N4)
        for (let r = 1; r <= 3; r++) {
          const xx = x + dx * r;
          const yy = y + dy * r;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          if (h[yy * W + xx] >= s + 2) {
            sides++;
            break;
          }
        }
      if (sides >= 2) gorge[i] = 1;
    }
  const view: SettlerView = { W, H, h, dJoin: distanceFrom(joinT, W, H), dFall: distanceFrom(fallT, W, H), lakes, farms, gorge, p75: sorted[Math.floor(0.75 * (N - 1))] };
  return { ...view, prefer: (id, x, y, L, walk) => startPreference(id, view, x, y, L, walk) };
}

/** The finished map as the intention checks read it. */
export function finalCtx(b: BuildResult, hy: Pick<Hydro, "rivers">): FinalCtx {
  const { W, H } = b;
  const start = b.start ?? { x: 0, y: 0, z: 0 };
  const objs = b.entities.map((e) => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation }));
  const joins: number[] = [];
  for (const r of hy.rivers) {
    if (!("river" in r.params.exit)) continue;
    const p = r.params.path[r.params.path.length - 1];
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (x >= 0 && y >= 0 && x < W && y < H) joins.push(y * W + x);
  }
  return {
    W,
    H,
    h: b.heights,
    D: b.water,
    C: b.contamination,
    moist: b.moisture,
    start: { x: start.x, y: start.y, z: start.z },
    walk: reachWalk(b.heights, W, H, objs, start),
    kept9: droughtStorage(b.waterModel, b.water, 9),
    objects: objs,
    falls: fallsOf(b.heights, b.water, W, H, 1.5),
    joins,
    rivers: hy.rivers.map((r) => r.params.path.map((p) => [p[0], p[1]] as [number, number])),
  };
}

/**
 * Check each intention on the finished map. When a start intention is absent, `resteer` may offer
 * the map with the start chosen again on the finished land and water, the intentions weighted up
 * (the land is kept, so the settle is reused); it is taken when more intentions emerge there, and
 * `commit` makes it the map. Every absent intention is dropped, never forced (D138).
 */
export function finalChecks(ids: readonly IntentionId[], built: BuildResult, hy: Pick<Hydro, "rivers">, resteer: () => { built: BuildResult; commit: () => void } | null): IntentionResult[] {
  let res = ids.map((id) => ({ id, ...checkIntention(id, finalCtx(built, hy)) }));
  if (res.some((r) => !r.ok && START_SIDE.has(r.id))) {
    const alt = resteer();
    if (alt) {
      const ctx3 = finalCtx(alt.built, hy);
      const res3 = ids.map((id) => ({ id, ...checkIntention(id, ctx3) }));
      if (res3.filter((r) => r.ok).length > res.filter((r) => r.ok).length) {
        const before = new Set(res.filter((r) => r.ok).map((r) => r.id));
        alt.commit();
        return res3.map((r) => ({ id: r.id, ok: r.ok, note: r.note, outcome: r.ok ? (before.has(r.id) ? "emerged" : "re-steered") : "dropped" }));
      }
    }
  }
  return res.map((r) => ({ id: r.id, ok: r.ok, note: r.note, outcome: r.ok ? "emerged" : "dropped" }));
}
