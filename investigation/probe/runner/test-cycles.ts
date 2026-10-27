// A long play's planning and judging without the game (`--cycles`, cycles.ts): npm --prefix investigation/probe test
// runs it after test.ts. Its own sandbox probe folder; nothing outside it is written.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const sandbox = mkdtempSync(join(tmpdir(), 'dgm-probe-cycles-'));
process.env.DGM_PROBE_HOME = join(sandbox, 'probe');

/* eslint-disable @typescript-eslint/no-require-imports */
const paths = require('./paths') as typeof import('./paths');
const catalogM = require('./catalog') as typeof import('./catalog');
const jobs = require('./jobs') as typeof import('./jobs');
const compare = require('./compare') as typeof import('./compare');
const cyclesM = require('./cycles') as typeof import('./cycles');
type MapResult = import('./job').MapResult;
type ModelRun = import('./model').ModelRun;

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  if (!ok) failures++;
};

try {
  // 1. the schedule: Normal's hardest roll, cycle by cycle
  const s = catalogM.longPlaySchedule(10, 'Normal');
  const want = [[3, 'drought'], [5, 'drought'], [6, 'drought'], [7, 'drought'], [1, 'badtide'], [8, 'drought'], [3, 'badtide'], [9, 'drought'], [9, 'drought'], [4, 'badtide']];
  check('schedule: Normal, 10 cycles of 13 temperate days and the longest hazards', s.length === 10 && s.every((c, i) => c.temperateDays === 13 && c.hazardDays === want[i][0] && c.hazard === want[i][1]), catalogM.describeSchedule(s));
  check('schedule: 185 days and a quarter after the last hazard', catalogM.scheduleDays(s) === 185.08, String(catalogM.scheduleDays(s)));

  // 2. the plan: both factions, the hazards' moments, screenshots only at each hazard's end
  const file = join(paths.REPO, 'out', 'm8', 'River Valley (4242) M8 preview.timber');
  const games = catalogM.catalog([file], { cycles: 10, factions: ['Folktails', 'IronTeeth'] }).filter((g) => g.longPlay);
  check('plan: one long play per faction', games.length === 2 && games[0].id === 'map-river-valley-4242-m8-preview' && games[1].id === 'map-river-valley-4242-m8-preview-it' && games[1].faction === 'IronTeeth', games.map((g) => g.id).join(', '));
  const prepared = jobs.prepare(games, 'test-cycles');
  const p = prepared[0];
  const ids = p.map.moments.map((m) => m.id);
  const hazards = s.map((c, i) => `${c.hazard}${i + 1}`);
  check('plan: every hazard has its start, first day and end, inside the game', hazards.every((h) => ['start', 'day1', 'end'].every((k) => ids.includes(`${h}-${k}`))) && p.map.moments.every((m) => m.day < p.map.endDay), ids.join(' '));
  check('plan: screenshots at the load, each hazard end and the end only', p.map.moments.filter((m) => m.shots.length).every((m) => m.id === 'start' || m.id.endsWith('-end') || m.id === 'end') && hazards.every((h) => p.map.moments.find((m) => m.id === `${h}-end`)!.shots.length > 0));
  const plan = jobs.summary(prepared, 'batch');
  check('plan: the weather is in the plan (and so in its code)', plan.maps.every((m) => m.weather === catalogM.describeSchedule(s)));

  // 3. judging: records that hold the file's water, then a model that does and one that does not
  const dir = join(sandbox, 'results');
  mkdirSync(dir, { recursive: true });
  const info = p.info;
  const snaps: string[] = [];
  for (const m of p.map.moments.filter((x) => x.snapshot)) {
    const f = `${p.game.id}-${m.id.replace(/[^A-Za-z0-9_-]/g, '_')}.snapshot.json.gz`;
    const snap = { momentId: m.id, day: m.day, tick: 0, realSeconds: (m.day - catalogM.D0) * 10, weather: 'temperate', width: info.W, height: info.H, depth: [...info.depth], contamination: [...info.contamination], floor: [...info.floor], moisture: [...info.moisture], soilContamination: [...info.soilContamination], terrain: [...info.heights], terrainColumns: new Array(info.W * info.H).fill(1), layered: [], plants: [], sources: [] };
    writeFileSync(join(dir, f), gzipSync(JSON.stringify(snap)));
    snaps.push(f);
  }
  const result = { runId: 't', mapId: p.game.id, title: 't', mapFile: '', status: 'done', log: [], notes: [], samples: [], snapshots: snaps, shots: [], entitiesAtStart: [], entitiesAtEnd: [], plantDeaths: [], loadingIssues: [], weather: s.map((c, i) => ({ cycle: i + 1, ...c })), weatherEvents: [], actions: [], start: { districtCenter: null, adults: 9, children: 4, bots: 0 } } as unknown as MapResult;
  const L = new compare.Loaded(dir, p, result);
  const cyc = p.checks.filter((c) => c.id.startsWith('cycles-'));
  const judge = (model: ModelRun | null) => {
    const t = cyclesM.cycleTable(L, model, null);
    const v = compare.evaluate({ L, others: new Map(), model, modelError: null, cycles: t }, cyc);
    return { t, get: (id: string) => v.find((x) => x.id === id)! };
  };
  const a = judge(null);
  check('judge: without the model, the start water is recorded through every hazard', a.get('cycles-start-water').verdict === 'recorded' && a.get('cycles-start-water').detail.includes('through every hazard'), a.get('cycles-start-water').detail.slice(0, 200));
  check('judge: without the model, the map check is not measurable', a.get('cycles-water').verdict === 'not measurable', a.get('cycles-water').detail);
  check('judge: the land is recorded with farmland at every checkpoint', a.get('cycles-land').verdict === 'recorded' && a.t.rows.every((r) => r.points.every((q) => q.game && q.game.farmland > 0)), a.get('cycles-land').detail.slice(0, 200));
  const minutes = a.t.rows.map((r) => r.realMinutes);
  check("judge: each cycle's real time from the records", Math.abs(minutes[1]! - ((s[1].temperateDays + s[1].hazardDays) * 10) / 60) < 1e-6, minutes.map((m) => m?.toFixed(2)).join(', '));
  const mapDays = p.map.moments.filter((m) => m.snapshot).map((m) => m.day);
  const fakeModel = (scale: (day: number) => number): ModelRun => ({
    samples: [], plants: [], W: info.W, H: info.H, cpuSeconds: 1, momentum: 'test',
    maps: mapDays.map((day) => ({ day, depth: info.depth.map((d) => d * scale(day)), contamination: Float32Array.from(info.contamination), moisture: Float32Array.from(info.moisture), soilContamination: Float32Array.from(info.soilContamination) })),
  });
  const b = judge(fakeModel(() => 1));
  check('judge: a model that agrees passes the map and the start water', b.get('cycles-water').verdict === 'passed' && b.get('cycles-start-water').verdict === 'passed', `${b.get('cycles-water').detail} | ${b.get('cycles-start-water').detail.slice(-120)}`);
  const late = p.map.moments.find((m) => m.id === 'drought8-end')!.day;
  const c = judge(fakeModel((day) => (Math.abs(day - late) < 0.01 ? 0.5 : 1)));
  check('judge: the model off by half at one checkpoint fails cycle 8', c.get('cycles-water').verdict === 'failed' && c.get('cycles-water').detail.includes('cycles 8') && c.get('cycles-start-water').verdict === 'failed', c.get('cycles-water').detail);
  const md = cyclesM.cycleMarkdown(p.game.title, b.t);
  check('summary: a row per cycle', md.filter((l) => /^\| \d+ \|/.test(l)).length === 10, md.slice(4, 6).join(' / '));
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
console.log(failures ? `${failures} failed` : 'all passed');
process.exitCode = failures ? 1 : 0;
