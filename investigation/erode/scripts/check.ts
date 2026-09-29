// The investigation's one critical check, and the numbers REPORT.md gives:
// 1. Every case, and a spread of random gestures on every map, drops 0 voxels under the game's
//    support rule, checked over every voxel of the final land with terrain3d's port of the rule
//    (proto/support.ts, the model GAME_RULES.md §2 describes).
// 2. Per case: blocks worn, blocks kept to hold a roof, the largest overhang's reach from support,
//    the deepest hollow, and the time to the final land at 128² (the planner alone, median of 5).
//
//   npm --prefix investigation/erode run check [-- --show]   (about a minute)
// Writes checks/results.json. --show prints each case's cross-sections.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { checkSupport } from "../../terrain3d/proto/support";
import { planErode, type ErodePlan } from "../core/erode";
import { fromJson, washMap, type ErodeMap } from "../core/map";
import { hash } from "../core/random";
import { support } from "../core/support";
import { LAYERS, Terrain } from "../core/terrain";
import { CASES } from "../demo/cases";
import { bottomCheck, drainageMetrics, round2Checks, washChecks } from "./round2";
import { round3Checks } from "./round3";
import { unevenMap } from "../demo/uneven";
import { round4Checks } from "./round4";
import { round5Checks } from "./round5";

const show = process.argv.includes("--show");
const only = process.argv.find((a) => a.startsWith("--case="))?.slice(7);
const maps = new Map<string, ErodeMap>();
const load = (id: string) => {
  if (id === "wash") return washMap();
  const uneven = unevenMap(id);
  if (uneven) return uneven;
  if (!maps.has(id)) maps.set(id, fromJson(JSON.parse(gunzipSync(readFileSync(new URL(`../maps/${id}.json.gz`, import.meta.url))).toString())));
  return maps.get(id)!;
};

/** The largest overhang's reach: the most tiles a block over air sits from the rock holding it
 *  (its support distance, which the game allows up to 3), and the deepest hollow: the most tiles an
 *  air cell under a roof lies from open sky, walking through air. */
function measure(before: Terrain, after: Terrain) {
  const sup = support(after);
  let reach = 0;
  let overAir = 0;
  for (const [, d] of sup.distance) {
    reach = Math.max(reach, d);
    overAir++;
  }
  const { W, H, N } = after;
  const depth = new Map<number, number>();
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    const top = after.surface(i);
    for (let z = 0; z < top; z++) if (!after.at(i, z) && before.at(i, z)) depth.set(z * N + i, -1);
  }
  // roofed air cells beside open air start at 1
  for (const [c] of depth) {
    const z = Math.floor(c / N), i = c - z * N, x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!after.at(j, z) && z >= after.surface(j)) {
        depth.set(c, 1);
        queue.push(c);
        break;
      }
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    const d = depth.get(c)!;
    const z = Math.floor(c / N), i = c - z * N, x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = z * N + (y + dy) * W + x + dx;
      if (depth.get(n) === -1) {
        depth.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  let deepest = 0;
  for (const d of depth.values()) deepest = Math.max(deepest, d);
  let roofed = 0;
  for (let i = 0; i < N; i++) if (!after.plain(i)) roofed++;
  return { reach, blocksOverAir: overAir, deepest, roofedTiles: roofed };
}

function section(before: Terrain, after: Terrain, rock: number[], y: number, x0: number, x1: number, z0: number, z1: number): string[] {
  const out: string[] = [`  y = ${y}, x ${x0}–${x1} (# rock, . worn, blank air; H hard bed)`];
  for (let z = z1; z >= z0; z--) {
    let row = String(z).padStart(4) + (rock[z] ? "H " : "  ");
    for (let x = x0; x <= x1; x++) row += after.solid(x, y, z) ? "#" : before.solid(x, y, z) ? "." : " ";
    out.push(row);
  }
  return out;
}

const results: Record<string, unknown>[] = [];
let failures = 0;
for (const c of CASES) {
  if (only && c.id !== only) continue;
  const m = load(c.map);
  const t = Terrain.fromHeights(m.W, m.H, m.heights);
  const input = { terrain: t, rock: m.rock, keep: m.keep, water: m.water };
  const settings = { power: c.power, size: c.size, seed: c.seed };
  let plan: ErodePlan = planErode(input, { points: c.points }, settings);
  const times: number[] = [];
  for (let k = 0; k < 5; k++) {
    plan = planErode(input, { points: c.points }, settings);
    times.push(plan.ms);
  }
  times.sort((a, b) => a - b);
  const chk = checkSupport(m.W, m.H, plan.final.voxels(), LAYERS);
  if (chk.unsupported.length) failures++;
  const meas = measure(t, plan.final);
  // Try another: three more personalities of the same gesture
  const others = [1, 2, 3].map((k) => {
    const p = planErode(input, { points: c.points }, { ...settings, seed: settings.seed + k });
    bottomCheck(t, p);
    const d = checkSupport(m.W, m.H, p.final.voxels(), LAYERS).unsupported.length;
    if (d) failures++;
    return { seed: settings.seed + k, worn: p.worn, held: p.held, dropped: d };
  });
  const r = { case: c.id, map: c.map, worn: plan.worn, held: plan.held, fell: plan.fell, droppedOnLoad: chk.unsupported.length, bottomVoxelsRemoved: bottomCheck(t, plan), ...meas, msToFinal: Math.round(times[2] * 10) / 10, seconds: plan.duration, tryAnother: others };
  results.push(r);
  console.log(JSON.stringify(r));
  if (show) {
    const b = plan.box;
    const cx = Math.round(c.points[Math.floor(c.points.length / 2)].x);
    const cy = Math.round(c.points[Math.floor(c.points.length / 2)].y);
    let top = 0;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) top = Math.max(top, t.surface(y * m.W + x));
    for (const y of [cy - 2, cy, cy + 2]) console.log(section(t, plan.final, m.rock, y, Math.max(0, cx - 14), Math.min(m.W - 1, cx + 14), 0, top).join("\n"));
    // and along x = cx
    const out: string[] = [`  x = ${cx}, y ${cy - 14}–${cy + 14}`];
    for (let z = top; z >= 0; z--) {
      let row = String(z).padStart(4) + (m.rock[z] ? "H " : "  ");
      for (let y = cy - 14; y <= cy + 14; y++) row += plan.final.solid(cx, y, z) ? "#" : t.solid(cx, y, z) ? "." : " ";
      out.push(row);
    }
    console.log(out.join("\n"));
  }
}

// random gestures on every map: clicks and strokes anywhere, any power, size and personality
const random: Record<string, unknown>[] = [];
if (!only)
  for (const id of ["highlands", "canyon", "crater", "tall"]) {
    const m = load(id);
    const t = Terrain.fromHeights(m.W, m.H, m.heights);
    let dropped = 0, acted = 0, worst = 0, maxReach = 0;
    const n = 40;
    for (let k = 0; k < n; k++) {
      const r = (a: number) => hash(9001 + k, a);
      const x = 4 + r(1) * (m.W - 8), y = 4 + r(2) * (m.H - 8);
      const i = Math.floor(y) * m.W + Math.floor(x);
      const pts = [{ x, y, z: t.surface(i) - 0.5 - r(3) * 6 }];
      if (r(4) < 0.5) {
        const a = r(5) * Math.PI * 2, L = 4 + r(6) * 16;
        pts.push({ x: x + Math.cos(a) * L, y: y + Math.sin(a) * L, z: pts[0].z });
      }
      const p = planErode({ terrain: t, rock: m.rock, keep: m.keep, water: m.water }, { points: pts }, { power: Math.round(r(7) * 100), size: r(8) < 0.4 ? null : Math.round(r(9) * 100), seed: k });
      if (!p.reason) acted++;
      bottomCheck(t, p);
      if (p.wash && !p.reason) drainageMetrics(t, p);
      const d = checkSupport(m.W, m.H, p.final.voxels(), LAYERS).unsupported.length;
      dropped += d;
      worst = Math.max(worst, p.ms);
      maxReach = Math.max(maxReach, measure(t, p.final).reach);
    }
    if (dropped) failures++;
    const row = { map: id, gestures: n, acted, droppedOnLoad: dropped, bottomVoxelsRemoved: 0, maxReach, slowestMs: Math.round(worst), result: dropped ? "FAIL" : "PASS" };
    random.push(row);
    console.log(JSON.stringify(row));
  }

if (!only) {
  mkdirSync(new URL("../checks/", import.meta.url), { recursive: true });
  const round2 = round2Checks(load);
  Object.assign(round2, { wash: washChecks(load) });
  const round3 = round3Checks(load);
  const round4 = round4Checks(load);
  const round5 = round5Checks();
  writeFileSync(new URL("../checks/results.json", import.meta.url), JSON.stringify({ note: "npm --prefix investigation/erode run check: dropped voxels by terrain3d/proto/support.ts over every voxel; all 160 gestures checked, including no-ops; ms is the planner alone at 128² (median of 5)", result: failures ? "FAIL" : "PASS", round5, round4, round3, round2, cases: results, random }, null, 1) + "\n");
}
console.log(failures ? `FAILED: ${failures} results drop voxels` : "Every result drops 0 voxels under the support rule.");
process.exit(failures ? 1 : 0);
