// Dam sites in the start's walk (planning's brief, 2026-11-21): for each map, the checks' dam sites
// (water.storage_possible's list, within 60 tiles of the start) with their walk from the start over walkable dry
// ground and slopes, and the start's other numbers (room, reach, the opening view's badwater, food, CPU).
//
//   npx tsx tools/damwalk.ts --theme riverValley --seeds 1-12 --size 256 [--easy] --out file.json

import { writeFileSync } from "node:fs";
import { generate } from "../src/core/gen/generate";
import { makeSpec, GENERATOR_VERSION, type ThemeId } from "../src/core/spec/mapspec";
import { groundOfFile } from "../tools/lib/resources";
import { walkWorld, walkDistance, reachAt } from "../src/core/analysis/walk";
import { startOfObjects } from "../src/core/analysis/easyStart";
import { validateMap } from "../src/core/validate/checks";
import { tilesInFrame } from "../src/core/analysis/opening";
import { shadeTiles } from "../src/core/render/shade";
import { encodePng } from "../tools/png";
import { mkdirSync } from "node:fs";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const theme = arg("theme", "riverValley") as ThemeId;
const size = Number(arg("size", "256"));
const easy = process.argv.includes("--easy");
const [a, b] = arg("seeds", "1-12").split("-").map(Number);
const seeds: number[] = [];
for (let s = a; s <= (b ?? a); s++) seeds.push(s);
const png = arg("png", "");
const out = arg("out", `.scratch/dw-${theme}-${easy ? "easy" : "normal"}.json`);

/** A dam a player would take: short, in the walk, holding a real share of the drought's need. */
export const TAKE = { length: 8, walk: 40, share: 0.5 };

const rows: unknown[] = [];
for (const seed of seeds) {
  const spec = makeSpec({ seed, theme, size: { x: size, y: size } });
  if (easy) spec.settings.start.easyStart = true;
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  const r = generate(spec);
  const cu = process.cpuUsage(c0);
  const cpu = (cu.user + cu.system) / 1e6;
  const wall = (performance.now() - t0) / 1000;
  const g = groundOfFile(r.file);
  const W = g.W;
  const H = g.H;
  const st = startOfObjects(g.objects, g.heights, W);
  const an = r.analysis;
  const val = (id: string) => {
    const c = r.report.checks.find((k) => k.id === id);
    return c ? Number(c.value) : NaN;
  };
  // Easy's rows on every map (the brief's bars read them; on Easy start they are the map's own)
  let ez: Record<string, { ok: boolean; value: number; limit: number }> = {};
  let badSeen = NaN;
  {
    const espec = structuredClone(r.spec);
    espec.settings.start.easyStart = true;
    try {
      const v = validateMap(r.file, { profile: "generate", spec: espec, features: r.features, easyStart: { relax: 1, badtide: false } });
      for (const c of v.report.checks) if (c.id.startsWith("start.easy_")) ez[c.id] = { ok: c.ok, value: Number(c.value), limit: Number(c.limit) };
      // badwater in the opening view (the settler's `badView` reading: water 0.1+ deep, contamination over 0.05)
      if (st && v.water) {
        const bad: number[] = [];
        for (let i = 0; i < W * H; i++) if (v.water.depth[i] >= 0.1 && v.water.contamination[i] > 0.05) bad.push(i);
        badSeen = tilesInFrame({ x: st.x, y: st.y, z: st.level, orientation: st.orientation }, W, g.heights, bad);
      }
    } catch (e) {
      ez = { error: { ok: false, value: NaN, limit: NaN } };
    }
  }
  const need = an?.storage?.need ?? NaN;
  const dams: { x: number; y: number; h: number; len: number; vol: number; walk: number; straight: number; share: number }[] = [];
  if (st && an) {
    const { blocked, links } = walkWorld(g.objects, W, H, { wet: g.depth });
    const d = walkDistance(g.heights, W, H, blocked, links, st, 200);
    for (const s of an.damSites) {
      const [dy, dx] = s.dir;
      const c = s.y * W + s.x;
      const crest = g.heights[c] + s.height;
      let best = reachAt(d, W, H, c);
      for (const sgn of [1, -1])
        for (let k = 1; k <= 11; k++) {
          const xx = s.x + sgn * k * dx;
          const yy = s.y + sgn * k * dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          const j = yy * W + xx;
          best = Math.min(best, reachAt(d, W, H, j));
          if (g.heights[j] >= crest) break;
        }
      dams.push({ x: s.x, y: s.y, h: s.height, len: s.length, vol: Math.round(s.volume), walk: Math.round(best * 10) / 10, straight: Math.round(Math.hypot(s.x - st.x, s.y - st.y)), share: Math.round((100 * s.volume) / need) / 100 });
    }
  }
  const taken = dams.filter((q) => q.len <= TAKE.length && q.walk <= TAKE.walk && q.share >= TAKE.share).sort((p, q) => q.vol - p.vol);
  const inWalk = dams.filter((q) => q.walk <= TAKE.walk).sort((p, q) => q.vol - p.vol);
  const row = {
    theme, seed, easy, size, version: GENERATOR_VERSION, passed: r.report.passed, attempts: r.attempts, cpu: Math.round(cpu * 10) / 10, wall: Math.round(wall * 10) / 10,
    start: st, need: Math.round(need), running: an?.storage?.running ?? null, runningNeed: an?.storage?.runningNeed ?? null, natural: Math.round(an?.storage?.natural ?? 0), bestDam: an?.bestDam ? { x: an.bestDam.x, y: an.bestDam.y, len: an.bestDam.length, h: an.bestDam.height, vol: Math.round(an.bestDam.volume) } : null,
    reach: val("start.reach"), food: val("start.food"), water: val("start.water"),
    room: ez["start.easy_room"]?.value ?? NaN, view: ez["start.easy_view"]?.value ?? NaN, badSeen, easyFood: ez["start.easy_food"]?.value ?? NaN,
    easyMissed: Object.entries(ez).filter(([, v]) => !v.ok).map(([k]) => k),
    take: taken[0] ?? null, takeCount: taken.length, bestInWalk: inWalk[0] ?? null, dams,
  };
  rows.push(row);
  if (png && seed <= 6) {
    // a whole map, north up: the start red, every dam site worth building white, the one taken magenta with a ring
    mkdirSync(png, { recursive: true });
    const rgb = shadeTiles(r.built.heights, W, H, r.built.water);
    const img = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
    const put = (x: number, y: number, c: number[]) => { if (x >= 0 && y >= 0 && x < W && y < H) img.set(c, ((H - 1 - y) * W + x) * 3); };
    const line = (q: { x: number; y: number }, c: number[], ring: boolean) => {
      const s0 = an!.damSites.find((d) => d.x === q.x && d.y === q.y)!;
      const [dy, dx] = s0.dir;
      for (let k = -s0.length; k <= s0.length; k++) {
        const x = q.x + k * dx, y = q.y + k * dy;
        if (Math.abs(k) <= (s0.length >> 1) + 1) for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) put(x + ox, y + oy, c);
      }
      if (ring) for (let a2 = 0; a2 < 360; a2 += 2) for (const rr of [9, 10]) put(Math.round(q.x + rr * Math.cos((a2 * Math.PI) / 180)), Math.round(q.y + rr * Math.sin((a2 * Math.PI) / 180)), c);
    };
    for (const q of taken.slice(1)) line(q, [255, 255, 255], false);
    if (taken[0]) line(taken[0], [255, 0, 220], true);
    if (st) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) put(st.x + dx, st.y + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 4 ? [255, 255, 255] : [220, 30, 30]);
    writeFileSync(`${png}/${theme}-${easy ? "easy" : "normal"}-${seed}.png`, encodePng(img, W, H));
    writeFileSync(`${png}/${theme}-${easy ? "easy" : "normal"}-${seed}.json`, JSON.stringify({ take: row.take, start: st, room: row.room, reach: row.reach, version: GENERATOR_VERSION }));
  }
  const t = row.take;
  console.log(`${theme}${easy ? " easy" : ""} ${seed}: ${row.passed ? "ok" : "FAIL"} att ${row.attempts} cpu ${row.cpu}s; need ${row.need} running ${Number(row.running).toFixed(2)}/${Number(row.runningNeed).toFixed(2)}; room ${row.room} reach ${row.reach} view ${row.view} food ${row.easyFood}; sites ${dams.length}, take ${row.takeCount}${t ? ` best len ${t.len} h ${t.h} vol ${t.vol} walk ${t.walk} share ${t.share}` : ""}; best in walk ${row.bestInWalk ? `len ${row.bestInWalk.len} vol ${row.bestInWalk.vol} walk ${row.bestInWalk.walk}` : "-"}`);
  writeFileSync(out, JSON.stringify(rows, null, 1));
}
