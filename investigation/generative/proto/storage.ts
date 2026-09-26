// `water.storage_possible` (the workshop study's W1 rule, WORKSHOP-INTEGRATION.md §2), which
// replaces `water.reservoir` under Kyler's no-dam-ridge decision (2026-09-25). The prototype
// applies it in the `generate` profile after the real validators:
// 1. running water: the clean water the start's shore touches (the `start.water` tile) is part of a
//    body fed by clean sources of at least need ÷ (2 × 460) blocks per second, so it refills the
//    colony's drought need in two game days;
// 2. storage is possible near the start, by any one of:
//    a. a straight dam within 40 tiles whose reservoir holds need × reserve (the validator's own
//       dam sampling, `water.reservoir`'s first half);
//    b. natural water kept within 40 tiles through the drought (`water.reservoir`'s second half);
//    c. levees: water within 40 tiles of the start, raised by a crest of 1–3 levels (never above
//       the start's own level), floods ground within 60 tiles of the start, off the map edge, that
//       holds need × reserve, and the levee line (the low tiles where the fill would run on past
//       the 60-tile box or onto the edge ring) is at most a quarter of the flooded area's perimeter.
// The study's per-help clauses (a short dam must not exist at None) are not applied: Kyler's
// decision keeps natural dam sites as opportunities the terrain offers (docs/m9-design.md).

import type { BuildResult } from "../../../src/core/features/build";
import { RESERVE, reservoirNeeded } from "../../../src/core/gen/calibrated";
import type { MapSpec } from "../../../src/core/spec/mapspec";
import type { Validation } from "../../../src/core/validate/checks";
import type { CheckResult } from "../../../src/core/validate/report";

export const SECONDS_PER_DAY = 460;

export interface StorageDetail {
  running: number;
  runningNeed: number;
  dam: boolean;
  natural: boolean;
  levee: number;
  need: number;
}

export function storagePossible(h: Uint8Array, W: number, H: number, built: BuildResult, v: Validation, spec: MapSpec, startWater?: { ok: boolean; tile: [number, number] | null }): CheckResult & { detail?: StorageDetail } {
  const N = W * H;
  const need = reservoirNeeded(spec.designedFor);
  const total = need * RESERVE[spec.settings.water.droughtReserve];
  // the water the start drinks from: the validator's start.water, or (design version 2) the tile
  // Kyler's start water rule found
  const sw = startWater ?? v.report.checks.find((c) => c.id === "start.water");
  const tile = startWater ? startWater.tile : sw && "where" in sw ? sw.where?.tiles?.[0] : undefined;
  const res = v.report.checks.find((c) => c.id === "water.reservoir");
  const D = built.water;
  const C = built.contamination;
  const fail = (msg: string, detail?: StorageDetail) => ({ id: "water.storage_possible", class: "playability" as const, severity: "error" as const, ok: false, message: msg, detail });
  if (!sw?.ok || !tile) return fail("no clean water within the start's water rule");
  const t0 = tile[1] * W + tile[0];
  // 1. the body the start drinks from, and the clean sources feeding it
  const body = new Uint8Array(N);
  const q = [t0];
  body[t0] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (body[j] || !(D[j] > 0.001)) continue;
      body[j] = 1;
      q.push(j);
    }
  }
  let running = 0;
  for (const e of built.waterModel.emitters) {
    if (e.contamination > 0 || !(e.strength > 0)) continue;
    if (e.cells.some((c) => body[c])) running += e.strength;
  }
  const runningNeed = need / (2 * SECONDS_PER_DAY);
  // 2. storage
  const start = built.start!;
  const dam = !!(res && typeof res.value === "number" && v.analysis?.bestDam && v.analysis.bestDam.volume >= total);
  const natural = !!(v.analysis && v.analysis.naturalStorage >= total);
  let levee = 0;
  if (!dam && !natural) levee = leveeStorage(h, W, H, D, C, { x: start.x, y: start.y, z: start.z }, total);
  const detail = { running: Math.round(running * 100) / 100, runningNeed: Math.round(runningNeed * 1000) / 1000, dam, natural, levee: Math.round(levee), need: Math.round(total) };
  if (running < runningNeed) return fail(`the start's water is fed by ${detail.running} blocks/s of clean flow (at least ${detail.runningNeed})`, detail);
  const ok = dam || natural || levee >= total;
  return {
    id: "water.storage_possible",
    class: "playability",
    severity: ok ? "info" : "error",
    ok,
    value: dam ? "dam" : natural ? "natural" : Math.round(levee),
    limit: Math.round(total),
    message: ok
      ? `storage is possible near the start (${dam ? "a straight dam" : natural ? "natural pools" : `levees, ${Math.round(levee)} blocks`}), and ${detail.running} blocks/s of clean flow refill it`
      : `no dam, natural pool or levee line near the start can hold ${Math.round(total)} blocks`,
    detail,
  } as CheckResult & { detail: StorageDetail };
}

/** The most a dam and levees can hold near the start (rule c above), up to `enough`. */
export function leveeStorage(h: Uint8Array, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number>, start: { x: number; y: number; z: number }, enough: number): number {
  const N = W * H;
  let best = 0;
  const inBox = (x: number, y: number) => Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) <= 60 && x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const R = new Int32Array(N).fill(-1);
  let stamp = 0;
  const seeds: number[] = [];
  for (let y = Math.max(1, start.y - 40); y <= Math.min(H - 2, start.y + 40); y += 3)
    for (let x = Math.max(1, start.x - 40); x <= Math.min(W - 2, start.x + 40); x += 3) {
      const i = y * W + x;
      if (D[i] > 0.05 && C[i] < 0.05) seeds.push(i);
    }
  const tried = new Set<string>();
  for (const s0 of seeds) {
    for (let crest = 1; crest <= 3; crest++) {
      const lambda = h[s0] + crest;
      if (lambda > start.z) break;
      stamp++;
      if (R[s0] >= 0 && tried.has(`${R[s0]}:${lambda}`)) continue;
      const q = [s0];
      R[s0] = stamp;
      let cut = 0;
      let perim = 0;
      let vol = 0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        const x = i % W;
        const y = (i - x) / W;
        const sfc = h[i] + D[i];
        if (lambda > sfc) vol += lambda - sfc;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (R[j] === stamp) continue;
          if (h[j] >= lambda) {
            perim++;
            continue;
          }
          if (!inBox(xx, yy)) {
            cut++;
            perim++;
            continue;
          }
          R[j] = stamp;
          q.push(j);
        }
      }
      tried.add(`${stamp}:${lambda}`);
      if (cut <= 0.25 * perim && vol > best) best = vol;
      if (best >= enough) return best;
    }
  }
  return best;
}
