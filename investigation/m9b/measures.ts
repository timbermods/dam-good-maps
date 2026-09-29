// M9b's batch-5 measures (the forces-preview feedback's items 21, 26, 27, 36, 47; PLAN §20 D325), on
// many maps at once, before and after each change. Per map, one JSON line; per theme, a summary:
//
// - the height budget (item 47, 36): the deepest bed of any water, the lowest and highest ground, tiles
//   above 16, and small level regions (1–8 tiles: the choppy blocks and spikes at Verticality 100);
// - the trees (item 26): dead and living at load; with --cycle, living trees that die before the first
//   drought (the weather-cycle model the probe compares the game against);
// - the start (item 47): mine sites, and how many the colony walks to; living berry bushes within 20
//   tiles' walk; level buildable land by the start;
// - the water at a river's head (item 27): the settled water running off the map within 12 tiles of an
//   edge row of sources, as a share of their strength;
// - badwater (item 47): land its water and soil reach at load, and with --cycle just before the
//   badtide (after the drought's refill), and whether it reaches the start's water or farmland;
// - candidates (items 21, 22): attempts, the time to the first look, the first candidate and the map,
//   and each failed attempt's reason.
//
//   node investigation/probe/run.cjs ../m9b/measures.ts --themes any,canyon --seeds 1-10 --size 128
//        [--jobs 6] [--set vt=100] [--cycle] [--out investigation/m9b/local/measures/x.jsonl]
//
// It runs under the probe's runner (TypeScript to CommonJS in process), which the cycle model needs.
// Results go to investigation/m9b/local/ (ignored, D195).

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generate } from '../../src/core/gen/generate';
import { decodeSpecFragment, makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { AVAILABLE_THEMES } from '../../src/core/spec/mapspec';
import { levelRegions } from '../../src/core/math/grid';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function seedsOf(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(',')) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k);
    else out.push(Number(part));
  }
  return out;
}

const TREES = new Set(['Pine', 'Birch', 'Oak', 'Maple', 'ChestnutTree', 'Mangrove']);

export interface MapMeasure {
  theme: string;
  seed: number;
  size: number;
  ok: boolean;
  attempts: number;
  failures: string[];
  ms: { firstLook: number; firstCandidate: number; final: number };
  heights: { bedMin: number; landMin: number; max: number; above16: number; small: number };
  trees: { living: number; dead: number; succulent: number; diesEarly?: number };
  mines: { count: number; walked: number };
  bushesNear: number;
  walk: { trees: number; logs: number; farmland: number; level: number } | null;
  head: { rows: number; losing: number; worst: number };
  badwater: { land: number; landShare: number; cycleLand?: number; startWater?: boolean; farmland?: boolean };
}

function measureOne(theme: ThemeId, seed: number, size: number, set: string, cycle: boolean): MapMeasure {
  const base = makeSpec({ seed, theme, size: { x: size, y: size } });
  const spec = set ? decodeSpecFragment(`v=${base.generatorVersion}&s=${seed}&t=${theme}&z=${size}&${set}`)!.spec : base;
  const t0 = performance.now();
  let firstLook = -1;
  let firstCandidate = -1;
  const r = generate(spec, {
    onLand: () => {
      if (firstLook < 0) firstLook = performance.now() - t0;
    },
    onCandidate: () => {
      if (firstCandidate < 0) firstCandidate = performance.now() - t0;
    },
  });
  const final = performance.now() - t0;
  const b = r.built;
  const { W, H } = b;
  const N = W * H;
  // heights
  let bedMin = 99;
  let landMin = 99;
  let max = 0;
  let above16 = 0;
  for (let i = 0; i < N; i++) {
    const h = b.heights[i];
    if (h < landMin) landMin = h;
    if (h > max) max = h;
    if (h > 16) above16++;
    if (b.water[i] > 0.05 && h < bedMin) bedMin = h;
  }
  const reg = levelRegions(b.heights, W, H);
  let small = 0;
  for (const s of reg.size) if (s <= 8) small++;
  // trees
  let living = 0;
  let dead = 0;
  let succulent = 0;
  const deadTiles: number[] = [];
  for (const e of b.entities) {
    if (e.template === 'Succulent') succulent++;
    if (!TREES.has(e.template)) continue;
    const lnr = e.components.LivingNaturalResource as { IsDead?: boolean } | undefined;
    if (lnr?.IsDead) {
      dead++;
      deadTiles.push(e.y * W + e.x);
    } else living++;
  }
  // mine sites, and those the colony walks to (the check's own count)
  let mines = 0;
  for (const e of b.entities) if (e.template === 'UndergroundRuins') mines++;
  const mineCheck = r.report.checks.find((c) => c.id === 'resources.mine_site');
  const walked = typeof mineCheck?.value === 'number' ? mineCheck.value : 0;
  // water running off the map beside an edge row of clean sources
  const out = b.settle.out;
  const rows: { cells: number[]; strength: number }[] = [];
  for (const em of b.waterModel.emitters) {
    if (em.contamination > 0 || !(em.strength > 0)) continue;
    const onEdge = em.cells.filter((i) => {
      const x = i % W;
      const y = (i - x) / W;
      return x === 0 || y === 0 || x === W - 1 || y === H - 1;
    });
    if (!onEdge.length) continue;
    const near = rows.find((g) => g.cells.some((c) => onEdge.some((i) => Math.max(Math.abs((c % W) - (i % W)), Math.abs(Math.floor(c / W) - Math.floor(i / W))) <= 3)));
    if (near) {
      near.cells.push(...onEdge);
      near.strength += em.strength;
    } else rows.push({ cells: [...onEdge], strength: em.strength });
  }
  const walls = new Set<number>();
  for (const em of b.waterModel.emitters) for (const i of em.cells) walls.add(i);
  let losing = 0;
  let worst = 0;
  if (out)
    for (const g of rows) {
      // (an edge tile the head's water reaches, its floor under the row's water: what flows into it
      // from its neighbours drains off the map; the stored outflow off the edge is capped by the
      // tile's depth, not the flow)
      let bed = Infinity;
      for (const c of g.cells) bed = Math.min(bed, b.heights[c]);
      let lost = 0;
      for (let i = 0; i < N; i++) {
        const x = i % W;
        const y = (i - x) / W;
        if (!(x === 0 || y === 0 || x === W - 1 || y === H - 1) || walls.has(i) || b.heights[i] > bed + 1) continue;
        if (!g.cells.some((c) => Math.max(Math.abs((c % W) - x), Math.abs(Math.floor(c / W) - y)) <= 12)) continue;
        // flows into i: the neighbour's outflow toward it (0 −y, 1 −x, 2 +y, 3 +x)
        if (y > 0) lost += out[4 * (i - W) + 2];
        if (x > 0) lost += out[4 * (i - 1) + 3];
        if (y < H - 1) lost += out[4 * (i + W) + 0];
        if (x < W - 1) lost += out[4 * (i + 1) + 1];
      }
      const share = lost / g.strength;
      if (share > worst) worst = share;
      if (share > 0.05) losing++;
    }
  // badwater's land at load: dry tiles whose soil it contaminates, or under its water
  let bad = 0;
  let land = 0;
  for (let i = 0; i < N; i++) {
    if (!(b.water[i] > 0.05)) land++;
    if (b.soilContamination[i] > 0 || (b.water[i] > 0.05 && b.contamination[i] >= 0.1)) bad++;
  }
  const m: MapMeasure = {
    theme,
    seed,
    size,
    ok: r.report.passed,
    attempts: r.attempts,
    failures: r.failures.map((f) => f.failed.join(' + ')),
    ms: { firstLook: Math.round(firstLook), firstCandidate: Math.round(firstCandidate), final: Math.round(final) },
    heights: { bedMin, landMin, max, above16, small },
    trees: { living, dead, succulent },
    mines: { count: mines, walked },
    bushesNear: r.analysis?.bushesNear ?? 0,
    walk: r.analysis?.walkReach ?? null,
    head: { rows: rows.length, losing, worst: Math.round(worst * 1000) / 1000 },
    badwater: { land: bad, landShare: Math.round((1000 * bad) / Math.max(1, land)) / 1000 },
  };
  if (cycle && r.bytes.length) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { runModel } = require('../probe/runner/model');
    // the probe's weather: 3 temperate days, a 3-day drought, 3 temperate, a 3-day badtide; a new game
    // starts at day 1, 04:00, the drought on day 4, the badtide on day 10
    const cycles = [
      { temperateDays: 3, hazard: 'drought', hazardDays: 3 },
      { temperateDays: 3, hazard: 'badtide', hazardDays: 3 },
      { temperateDays: 60, hazard: 'drought', hazardDays: 0 },
    ];
    const before = 1 + 9 - 0.01;
    const run = runModel(r.bytes, `${theme}-${seed}`, cycles, before + 0.02, [], [], [before]);
    const [s1] = run.maps;
    let reached = 0;
    let startWater = false;
    let farmland = false;
    const sx = b.start?.x ?? -99;
    const sy = b.start?.y ?? -99;
    const sd = r.analysis?.startDistance;
    for (let i = 0; i < N; i++) {
      const badWater = s1.depth[i] > 0.05 && s1.contamination[i] >= 0.1;
      const hit = s1.soilContamination[i] > 0 || badWater;
      if (!hit) continue;
      if (!(b.water[i] > 0.05)) reached++;
      const d = sd ? sd[i] : Math.hypot((i % W) - sx, Math.floor(i / W) - sy);
      // the start's water (clean water within 12 tiles, turned bad) and first farmland (moist land
      // within 20, its soil stained)
      if (d <= 12 && badWater && b.water[i] > 0.05 && b.contamination[i] < 0.1) startWater = true;
      if (d <= 20 && !(b.water[i] > 0.05) && b.moisture[i] > 0 && !(b.soilContamination[i] > 0)) farmland = true;
    }
    m.badwater.cycleLand = reached;
    m.badwater.startWater = startWater;
    m.badwater.farmland = farmland;
    // living trees that die before the first drought (day 4)
    m.trees.diesEarly = run.plants.filter((p: { initialDead: boolean; diedDay: number | null; species: string }) => !p.initialDead && TREES.has(p.species) && p.diedDay !== null && p.diedDay < 4).length;
  }
  return m;
}

// ------------------------------------------------------------------------------------ the batch

const one = arg('one', '');
const size = Number(arg('size', '128'));
const set = arg('set', '');
const cycle = process.argv.includes('--cycle');
if (one) {
  // a worker: maps as theme:seed, one JSON line each
  for (const m of one.split(',')) {
    const [theme, s] = m.split(':');
    try {
      console.log(JSON.stringify(measureOne(theme as ThemeId, Number(s), size, set, cycle)));
    } catch (e) {
      console.log(JSON.stringify({ theme, seed: Number(s), size, error: String((e as Error).stack ?? e).slice(0, 400) }));
    }
  }
} else if (process.argv.includes('--summary')) {
  summarize(readFileSync(resolve(arg('summary', '')), 'utf8'));
} else {
  const themes = arg('themes', AVAILABLE_THEMES.join(',')).split(',');
  const seeds = seedsOf(arg('seeds', '1-10'));
  const jobs = Math.max(1, Number(arg('jobs', '6')));
  const outFile = resolve(arg('out', `investigation/m9b/local/measures/${Date.now()}.jsonl`));
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, '');
  const all = themes.flatMap((t) => seeds.map((s) => `${t}:${s}`));
  // (the longest maps first spread best: interleave by theme)
  const queue = all.slice();
  let running = 0;
  const t0 = Date.now();
  const lines: string[] = [];
  const next = () => {
    while (running < jobs && queue.length) {
      const m = queue.shift()!;
      running++;
      const argv = [resolve(__dirname, '..', 'probe', 'run.cjs'), '../m9b/measures.ts', '--one', m, '--size', String(size)];
      if (set) argv.push('--set', set);
      if (cycle) argv.push('--cycle');
      const p = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      p.stdout.on('data', (d) => (buf += String(d)));
      p.on('close', () => {
        for (const l of buf.split('\n')) if (l.startsWith('{')) {
          appendFileSync(outFile, l + '\n');
          lines.push(l);
        }
        running--;
        if (!queue.length && !running) {
          console.log(`${all.length} maps in ${Math.round((Date.now() - t0) / 1000)} s -> ${outFile}`);
          summarize(lines.join('\n'));
        } else next();
      });
    }
  };
  next();
}

function summarize(text: string): void {
  const ms: MapMeasure[] = text
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l))
    .filter((m) => !('error' in m));
  const errors = text.split('\n').filter((l) => l.includes('"error"'));
  const med = (v: number[]) => {
    const s = v.slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : NaN;
  };
  const p90 = (v: number[]) => {
    const s = v.slice().sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(0.9 * s.length))] : NaN;
  };
  const byTheme = new Map<string, MapMeasure[]>();
  for (const m of ms) byTheme.set(m.theme, [...(byTheme.get(m.theme) ?? []), m]);
  const rows: string[] = [];
  rows.push('| theme | maps | ok | bed min (min/med) | land min | max | >16 maps | small regions (med) | dead trees (sum/med) | living (med) | dies early | mines walked ≥2 | bushes near (min/med) | farmland 20 (min/med) | level 20 (min/med) | trees in reach (med) | head losing | badwater land (med share, max) | cycle land (med) | start water / farm hit | attempts (med) | first look / first cand / final s (med) | p90 final s |');
  rows.push('|' + '---|'.repeat(23));
  const f1 = (x: number) => (Math.round(x / 100) / 10).toFixed(1);
  for (const [t, a] of byTheme) {
    const cyc = a.filter((m) => m.badwater.cycleLand !== undefined);
    rows.push(
      `| ${t} | ${a.length} | ${a.filter((m) => m.ok).length} | ${Math.min(...a.map((m) => m.heights.bedMin))}/${med(a.map((m) => m.heights.bedMin))} | ${Math.min(...a.map((m) => m.heights.landMin))} | ${Math.max(...a.map((m) => m.heights.max))} | ${a.filter((m) => m.heights.above16 > 0).length} | ${med(a.map((m) => m.heights.small))} | ${a.reduce((s, m) => s + m.trees.dead, 0)}/${med(a.map((m) => m.trees.dead))} | ${med(a.map((m) => m.trees.living))} | ${cyc.length ? cyc.reduce((s, m) => s + (m.trees.diesEarly ?? 0), 0) : '-'} | ${a.filter((m) => m.mines.walked >= 2).length} | ${Math.min(...a.map((m) => m.bushesNear))}/${med(a.map((m) => m.bushesNear))} | ${Math.min(...a.map((m) => m.walk?.farmland ?? 0))}/${med(a.map((m) => m.walk?.farmland ?? 0))} | ${Math.min(...a.map((m) => m.walk?.level ?? 0))}/${med(a.map((m) => m.walk?.level ?? 0))} | ${med(a.map((m) => m.walk?.trees ?? 0))} | ${a.filter((m) => m.head.losing > 0).length} | ${med(a.map((m) => m.badwater.landShare))}, ${Math.max(...a.map((m) => m.badwater.landShare))} | ${cyc.length ? med(cyc.map((m) => m.badwater.cycleLand!)) : '-'} | ${cyc.length ? `${cyc.filter((m) => m.badwater.startWater).length} / ${cyc.filter((m) => m.badwater.farmland).length}` : '-'} | ${med(a.map((m) => m.attempts))} | ${f1(med(a.map((m) => m.ms.firstLook)))} / ${f1(med(a.map((m) => m.ms.firstCandidate)))} / ${f1(med(a.map((m) => m.ms.final)))} | ${f1(p90(a.map((m) => m.ms.final)))} |`,
    );
  }
  console.log(rows.join('\n'));
  // failure reasons across every attempt
  const reasons = new Map<string, number>();
  for (const m of ms) for (const f of m.failures) reasons.set(f.replace(/\d+/g, '#'), (reasons.get(f.replace(/\d+/g, '#')) ?? 0) + 1);
  const firstOk = ms.filter((m) => m.attempts === 1).length;
  console.log(`\nfirst attempt is the map: ${firstOk} of ${ms.length}; failed attempts by reason:`);
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${v}  ${k}`);
  if (errors.length) console.log(`\n${errors.length} errors:\n${errors.slice(0, 3).join('\n')}`);
}
