// A stand-in for Timberborn with the probe mod, for the runner's tests: it reads the job, writes the
// heartbeat and a result per map, and can hang or crash on a chosen map once (FAKE_HANG / FAKE_CRASH),
// the way the real game might. It also leaves the traces a real game would (a save, an error report, a
// changed setting, a log) so the restore can be checked.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// the probe's folder comes with the launch, as for the real mod (-dgmprobe -dgmprobeHome <folder>)
const at = process.argv.indexOf('-dgmprobeHome');
if (!process.argv.includes('-dgmprobe') || at < 0) process.exit(4);
const home = process.argv[at + 1];
const job = JSON.parse(fs.readFileSync(path.join(home, 'job.json'), 'utf8'));
// a mod of the player's rewrites its own data file at launch (Late Game Performance does)
const modData = path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'SomeModData', 'markers.txt');
if (fs.existsSync(modData)) fs.writeFileSync(modData, `rewritten by the game ${process.pid}`);
// Steam Cloud rewrites its bookkeeping file at every launch
const vdf = path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'Saves', 'steam_autocloud.vdf');
if (fs.existsSync(vdf)) fs.writeFileSync(vdf, `steam ${process.pid}`);
const results = path.join(home, 'results', job.runId);
fs.mkdirSync(results, { recursive: true });
const once = (name) => {
  const f = path.join(home, `.fake-${name}`);
  if (fs.existsSync(f)) return false;
  fs.writeFileSync(f, '1');
  return true;
};
let phase = 'menu', mapId = null, mapIndex = -1;
const beat = () => fs.writeFileSync(path.join(home, 'heartbeat.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString(), phase, runId: job.runId, mapIndex, mapId, day: 1, tick: 0, speed: 99, fps: 30 }));
fs.writeFileSync(path.join(process.env.DGM_PROBE_UNITY_LOGS, 'Player.log'), `fake game log ${new Date().toISOString()}\n`);
// traces: a save, an error report, a setting
const save = path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'Saves', 'DGMProbe fake', 'fake.timber');
fs.mkdirSync(path.dirname(save), { recursive: true });
fs.writeFileSync(save, 'save');
fs.mkdirSync(path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'Error reports'), { recursive: true });
fs.writeFileSync(path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'Error reports', `report-${process.pid}.zip`), 'report');
// a stray DGMProbe folder (older runners kept their results there), and a player mod's own folder: a new
// file and a rewritten one
fs.mkdirSync(path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'DGMProbe', 'shots'), { recursive: true });
fs.writeFileSync(path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'DGMProbe', 'shots', `shot-${process.pid}.jpg`), 'shot');
fs.writeFileSync(path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'Mods', 'SomeMod', `session-${process.pid}.log`), 'session');
const modConfig = path.join(process.env.DGM_PROBE_DOCUMENTS, 'Timberborn', 'Mods', 'SomeMod', 'config.txt');
if (fs.existsSync(modConfig)) fs.writeFileSync(modConfig, `rewritten by the game ${process.pid}`);
execFileSync('reg.exe', ['add', process.env.DGM_PROBE_REGISTRY_KEY, '/v', 'FakeSetting_h1', '/t', 'REG_DWORD', '/d', String(process.pid), '/f'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < job.maps.length; i++) {
    const m = job.maps[i];
    if (fs.existsSync(path.join(results, `${m.id}.json`))) continue;
    mapIndex = i;
    mapId = m.id;
    phase = 'running';
    for (let k = 0; k < 3; k++) {
      beat();
      await sleep(300);
    }
    if (process.env.FAKE_HANG === m.id && once('hang')) {
      for (;;) await sleep(1000); // no more heartbeats: the runner must kill us
    }
    if (process.env.FAKE_CRASH === m.id && once('crash')) {
      phase = 'crashed';
      beat();
      process.exit(3);
    }
    // a map with frame-time phases gets them back, one per phase of the job, and a load time (mod 0.2.1)
    const perf = m.perf ? { loadSeconds: 12.5, workingSetAtLoadMb: 2100, perf: { camera: 'fake', phases: m.perf.phases.map((p) => ({ id: p.id, speed: p.speed || job.settings.speed, seconds: p.seconds - p.warmup, frames: 100, medianMs: 16.7, p95Ms: 21, p99Ms: 30, maxMs: 45, over50Ms: 0, over100Ms: 0, days: 0.1, speedReached: p.speed || job.settings.speed, workingSetMb: 2200 })) } } : {};
    fs.writeFileSync(path.join(results, `${m.id}.json`), JSON.stringify({ runId: job.runId, mapId: m.id, title: m.title, mapFile: m.mapFile, status: 'done', ticks: 100, realSeconds: 1, meanSpeed: 99, log: [], notes: [], samples: [], snapshots: [], shots: [], entitiesAtStart: [], entitiesAtEnd: [], plantDeaths: [], loadingIssues: [], weather: [], weatherEvents: [], actions: [], start: { districtCenter: null, adults: 0, children: 0, bots: 0 }, ...perf }));
    phase = 'menu';
    beat();
  }
  phase = 'done';
  fs.writeFileSync(path.join(results, 'done.json'), '{}');
  beat();
  process.exit(0);
})();
