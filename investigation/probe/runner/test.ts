// The runner's checks without the game: npm --prefix investigation/probe test
// Everything runs in a sandbox: a temporary Documents folder and probe folder, a throwaway registry key
// (HKCU\Software\DGMProbeTest\Timberborn) and a stand-in game (a copy of node.exe named
// FakeTimberborn.exe running test/fake-game.cjs). Kyler's own settings, saves and game are never touched.
// The tall maps are read (never written) from C:\dgm-probe\tall when tools/probe-tall.ts has made them. The size maps
// are written by their writer into the sandbox, as the batch writes them before it plans (writers.ts).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'dgm-probe-test-'));
const TEST_KEY = 'HKCU\\Software\\DGMProbeTest\\Timberborn';
process.env.DGM_PROBE_HOME = join(sandbox, 'probe');
process.env.DGM_PROBE_DOCUMENTS = join(sandbox, 'Documents');
process.env.DGM_PROBE_REGISTRY_KEY = TEST_KEY;
process.env.DGM_PROBE_UNITY_LOGS = join(sandbox, 'LocalLow');
process.env.DGM_PROBE_GAME_PROCESS = 'FakeTimberborn';
process.env.DGM_PROBE_SIZES = join(sandbox, 'sizes');
process.env.DGM_PROBE_TERRAIN3D = join(sandbox, 'terrain3d');
const fakeExe = join(sandbox, 'FakeTimberborn.exe');
copyFileSync(process.execPath, fakeExe);
process.env.DGM_PROBE_LAUNCH = JSON.stringify([fakeExe, join(__dirname, 'test', 'fake-game.cjs')]);

/* eslint-disable @typescript-eslint/no-require-imports */
const paths = require('./paths') as typeof import('./paths');
const safety = require('./safety') as typeof import('./safety');
const consent = require('./consent') as typeof import('./consent');
const mods = require('./mods') as typeof import('./mods');
const launch = require('./launch') as typeof import('./launch');
const catalogM = require('./catalog') as typeof import('./catalog');
const jobs = require('./jobs') as typeof import('./jobs');
const compare = require('./compare') as typeof import('./compare');
const mapfile = require('./mapfile') as typeof import('./mapfile');
const writers = require('./writers') as typeof import('./writers');
const groupM = require('../../../tools/probe-maps/group') as typeof import('../../../tools/probe-maps/group');
const t3d = require('./terrain3d') as typeof import('./terrain3d');

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  if (!ok) failures++;
};

async function main(): Promise<void> {
  if (paths.REGISTRY_KEY !== TEST_KEY || !paths.timberbornDocs().startsWith(sandbox) || !paths.probeHome().startsWith(sandbox)) throw new Error('the sandbox is not in place; refusing to run');
  const docs = paths.timberbornDocs();
  const logs = paths.unityLogDir();
  for (const d of ['Saves/Kyler colony', 'Saves/Empty folder', 'PlayerData', 'Mods/SomeMod/version-1.1', 'Mods/DGMProbe/version-1.1', 'SomeModData', 'Kyler empty folder']) mkdirSync(join(docs, d), { recursive: true });
  mkdirSync(logs, { recursive: true });
  writeFileSync(join(docs, 'Saves/Kyler colony/Day 12.timber'), 'kyler save');
  writeFileSync(join(docs, 'Saves/steam_autocloud.vdf'), 'steam before');
  writeFileSync(join(docs, 'SomeModData/markers.txt'), 'kyler mod data');
  writeFileSync(join(docs, 'Mods/SomeMod/config.txt'), 'kyler mod config');
  writeFileSync(join(docs, 'PlayerData/player.data'), 'player data');

  // 0. the probe's folder: C:\dgm-probe by default, never inside Documents\Timberborn, and the launch carries it
  check('probe folder: the default is C:\\dgm-probe', paths.DEFAULT_PROBE_HOME === 'C:\\dgm-probe');
  const home = process.env.DGM_PROBE_HOME;
  process.env.DGM_PROBE_HOME = join(docs, 'DGMProbe');
  check('probe folder: refused inside Documents\\Timberborn', (() => {
    try {
      paths.probeHome();
      return false;
    } catch {
      return true;
    }
  })());
  process.env.DGM_PROBE_HOME = home;
  const args = launch.launchArgs();
  check('launch: -skipModManager -dgmprobe -dgmprobeHome <probe folder>', args.join(' ') === `-skipModManager -dgmprobe -dgmprobeHome ${paths.probeHome()}`, args.join(' '));
  writeFileSync(join(docs, 'Mods/SomeMod/version-1.1/manifest.json'), JSON.stringify({ Id: 'someone.somemod' }));
  writeFileSync(join(docs, 'Mods/DGMProbe/version-1.1/manifest.json'), JSON.stringify({ Id: mods.PROBE_MOD_ID }));
  writeFileSync(join(logs, 'Player.log'), 'kyler log');
  writeFileSync(join(logs, 'Player-prev.log'), 'kyler prev log');
  execFileSync('reg.exe', ['add', TEST_KEY, '/v', 'KylerSetting_h7', '/t', 'REG_DWORD', '/d', '5', '/f'], { stdio: 'ignore' });

  // 1. Unity's PlayerPrefs names
  check('prefs hash', mods.prefsValueName('ModEnabled.Local.MixedStorage.kyler.mixedstorage') === 'ModEnabled.Local.MixedStorage.kyler.mixedstorage_h637420546' && mods.prefsValueName('GraphicsQuality') === 'GraphicsQuality_h1581385789');

  // 1b. the game's own list of loaded mods, read from its log
  const sampleLog = 'Successfully connected to the Steam client.\nModded: true, official\n- DGM Probe (v0.1.0)\n- Harmony (v2.4.1)\n[DGMProbe] job x\n';
  check('loaded mods from the game log', JSON.stringify(launch.loadedMods(sampleLog)) === JSON.stringify(['DGM Probe (v0.1.0)', 'Harmony (v2.4.1)']) && launch.loadedMods('no mods').length === 0);

  // 2. consent: a code works once, for its own plan only
  const plan = { kind: 'smoke' as const, estimateMinutes: 3, maps: [{ id: 'a', title: 'A', checks: ['x'], days: 1 }] };
  const other = { ...plan, maps: [{ id: 'b', title: 'B', checks: ['x'], days: 1 }] };
  let code = consent.requestConsent(plan);
  check('consent: wrong plan refused', !consent.consumeConsent(other, code));
  code = consent.requestConsent(plan);
  check('consent: right plan accepted once', consent.consumeConsent(plan, code) && !consent.consumeConsent(plan, code));
  check('consent: the description says it launches Timberborn', /LAUNCHES TIMBERBORN/.test(consent.describe(plan)));
  // the water check on a map with no water (Sources: None, D330): dry in the file and the game holds
  const dry = { wetEither: 0, within01: 1, maxAbs: 0, meanAbs: 0, volumeFile: 0, volumeGame: 0, worst: '-' };
  check('water: dry in the file and in the game holds', compare.waterHolds(dry));
  check('water: water on one side only fails', !compare.waterHolds({ ...dry, volumeGame: 3, wetEither: 10, within01: 0 }) && !compare.waterHolds({ ...dry, volumeFile: 3, wetEither: 10, within01: 0 }));

  // 2b. a group made outside the repository has its maps written by its own writer before the plan (writers.ts;
  // Kyler, 2026-09-30): written, then found current by their hash, a stale one rewritten, a failure refused
  const fakeDir = join(sandbox, 'fake-group');
  process.env.DGM_PROBE_FAKE = fakeDir;
  const fakeBytes = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7])];
  let fakeFails = false;
  const fake: import('../../../tools/probe-maps/group').GroupWriter = {
    group: 'Fake', ids: ['fake-0', 'fake-1'], tool: 'tools/probe-fake.ts', folder: 'fake', env: 'DGM_PROBE_FAKE', manifest: 'fake.json',
    build: () => {
      if (fakeFails) throw new Error('fake-1: no room for the start');
      return { maps: fakeBytes.map((b, k) => ({ file: `fake-${k}.timber`, bytes: b, size: [8 + k, 8] as [number, number], entry: { id: `fake-${k}` } })), manifest: { format: 1 } };
    },
  };
  const fw = { Fake: () => fake };
  const fw1 = writers.writeGroups(['Fake'], () => {}, fw)[0];
  const fw2 = writers.writeGroups(['Fake'], () => {}, fw)[0];
  writeFileSync(join(fakeDir, 'fake-1.timber'), 'stale');
  const fw3 = writers.writeGroups(['Fake'], () => {}, fw)[0];
  check('writers: maps written, then found current by their hash; a stale one rewritten', fw1.dir === fakeDir && fw1.files.every((f) => f.status === 'written') && fw2.files.every((f) => f.status === 'current') && fw3.files[0].status === 'current' && fw3.files[1].status === 'written' && readFileSync(join(fakeDir, 'fake-1.timber')).equals(Buffer.from(fakeBytes[1])), [fw1, fw2, fw3].map((w) => w.files.map((f) => f.status).join('/')).join(', '));
  const fakeManifest = JSON.parse(readFileSync(join(fakeDir, 'fake.json'), 'utf8')) as { maps: { file: string; size: number[]; sha256: string }[] };
  check("writers: the manifest lists each map's file, size and sha256", fakeManifest.maps.length === 2 && fakeManifest.maps[1].sha256 === groupM.sha256(fakeBytes[1]) && fakeManifest.maps[1].size.join('x') === '9x8');
  fakeFails = true;
  try {
    writers.writeGroups(['Fake'], () => {}, fw);
    check('writers: a writer that fails refuses the plan with its reason', false);
  } catch (e) {
    check('writers: a writer that fails refuses the plan with its reason', /^the Fake maps could not be written: fake-1: no room for the start\. Nothing was planned\.$/.test((e as Error).message), (e as Error).message);
  }
  fakeFails = false;
  check('writers: --group names its group, --only the groups of its ids, others none', JSON.stringify(writers.groupsToWrite(undefined, 'Fake', fw)) === '["Fake"]' && writers.groupsToWrite(undefined, 'M8', fw).length === 0 && JSON.stringify(writers.groupsToWrite('m8-preview,fake-1', undefined, fw)) === '["Fake"]' && writers.groupsToWrite('m8-preview', undefined, fw).length === 0 && JSON.stringify(writers.groupsToWrite(undefined, 'Sizes')) === '["Sizes"]' && JSON.stringify(writers.groupsToWrite('sizes-64x512')) === '["Sizes"]' && JSON.stringify(writers.groupsToWrite(undefined, 'Tall maps')) === '["Tall maps"]');
  const planW = { ...plan, written: writers.writtenForPlan([fw3]) };
  const asCurrent = { ...planW, written: planW.written.map((g) => ({ ...g, files: g.files.map((f) => ({ ...f, status: 'current' as const })) })) };
  const otherBytes = { ...planW, written: planW.written.map((g) => ({ ...g, files: g.files.map((f, k) => ({ ...f, sha256: k ? '0'.repeat(64) : f.sha256 })) })) };
  const text = consent.describe(planW);
  check('plan: it lists the maps written, with their file, size and sha256', text.includes(`fake-1.timber  9×8`) && text.includes(groupM.sha256(fakeBytes[1])) && /Maps written for this plan by the Fake writer/.test(text), text.split('\n').slice(-4).join(' | '));
  check("plan: a launch code covers the maps' bytes, not who wrote them", consent.planHash(planW) === consent.planHash(asCurrent) && consent.planHash(planW) !== consent.planHash(otherBytes) && consent.planHash(planW) !== consent.planHash(plan));
  // the Sizes writer itself, into the sandbox (C:\dgm-probe\sizes on a real run)
  const ts0 = Date.now();
  const sizesW = writers.writeGroups(['Sizes'])[0];
  writers.writeGroups(['Terrain 3D']);
  const wantSizes = ['256x256', '399x399', '64x512', '128x512', '512x256', '512x512'];
  check('Sizes: the writer writes six maps at their sizes, each file the bytes its hash says', sizesW.dir === join(sandbox, 'sizes') && sizesW.files.map((f) => f.size.join('x')).join(',') === wantSizes.join(',') && sizesW.files.every((f) => groupM.sha256(new Uint8Array(readFileSync(join(sizesW.dir, f.file)))) === f.sha256), `${sizesW.files.map((f) => `${f.file} ${(f.bytes / 1024).toFixed(0)} KB`).join(', ')} in ${((Date.now() - ts0) / 1000).toFixed(0)} s`);

  // 3. the catalog builds every game's job offline (maps generated, poses, moments)
  const t0 = Date.now();
  const games = catalogM.catalog([join(paths.REPO, 'out', 'm8', 'River Valley (4242) M8 preview.timber')]);
  const prepared = jobs.prepare(games, 'test-run');
  const job = jobs.makeJob('test-run', prepared, 99);
  check('catalog: every game prepared', prepared.length === games.length, `${games.length} games in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  check('catalog: every map has a start moment with shots and an end', job.maps.every((m) => m.moments[0].id === 'start' && m.moments[0].shots.length > 0 && m.moments.some((x) => x.id === 'end')));
  check('catalog: moments inside each game', job.maps.every((m) => m.moments.every((x) => x.day >= catalogM.D0 - 1e-9 && x.day < m.endDay)));
  const high = prepared.filter((p) => p.game.group === 'High terrain');
  check('high terrain: three maps up to level 21, top layer empty', high.length === 3 && high.every((p) => p.info.maxHeight >= 17 && p.info.maxHeight <= 21), high.map((p) => `${p.game.id} max ${p.info.maxHeight}`).join(', '));
  const mesa = high.find((p) => p.game.id === 'high-highlands-mesa21');
  check('high terrain: the mesa carries objects above 16', !!mesa && mesa.info.entities.filter((e) => e.z > 16).length >= 7);
  const tall = prepared.filter((p) => p.game.group === 'Tall maps');
  if (catalogM.tallMaps().length) {
    check('tall maps: every map up to 22 with the top layer empty and one floor per tile', tall.length === catalogM.tallMaps().length && tall.every((p) => p.info.maxHeight === 22 && compare.fileColumns(p.info).count.every((n) => n === 1)), tall.map((p) => `${p.game.id} max ${p.info.maxHeight}`).join(', '));
    check('tall maps: a start above 16, sources above 16, water above 16 and objects above 16', tall.some((p) => (p.info.start?.z ?? 0) > 16) && tall.some((p) => p.info.entities.some((e) => /Source$/.test(e.template) && e.z > 16)) && tall.some((p) => p.game.tall!.flowTiles.length > 0) && tall.every((p) => p.info.entities.some((e) => e.z > 16)));
    check('tall maps: each has its checks, the tall poses and its water tiles sampled', tall.every((p) => p.checks.some((c) => c.id === 'tall-terrain') && p.map.poses.some((x) => x.id === 'tall-side') && p.map.tiles.length > 0));
    // the tall checks on a result that is the file itself, then with one tile of terrain changed
    const tp = tall.find((p) => p.game.tall!.flowTiles.length > 0)!;
    const tdir = join(sandbox, 'compare-tall');
    mkdirSync(tdir, { recursive: true });
    const cols = compare.fileColumns(tp.info);
    const tsnap = (id: string, day: number) => ({ momentId: id, day, tick: 0, weather: 'temperate', width: tp.info.W, height: tp.info.H, depth: [...tp.info.depth], contamination: [...tp.info.contamination], floor: [...tp.info.floor], moisture: [...tp.info.moisture], soilContamination: [...tp.info.soilContamination], terrain: [...cols.top], terrainColumns: [...cols.count], layered: [], plants: [], sources: tp.info.entities.filter((e) => /Source$/.test(e.template)).map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, source: { specified: Number((e.components.WaterSource as { SpecifiedStrength: { value: number } }).SpecifiedStrength.value), current: 1, contamination: 0 } })) });
    const tz = require('node:zlib') as typeof import('node:zlib');
    const tsnaps: string[] = [];
    for (const m of tp.map.moments.filter((x) => x.snapshot)) {
      const f = `${tp.game.id}-${m.id.replace(/[^A-Za-z0-9_-]/g, '_')}.snapshot.json.gz`;
      writeFileSync(join(tdir, f), tz.gzipSync(JSON.stringify(tsnap(m.id, m.day))));
      tsnaps.push(f);
    }
    const tents = tp.info.entities.filter((e) => e.template !== 'StartingLocation').map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation }));
    const samples = [0, 0.5, 1, 1.4].map((d) => ({ day: catalogM.D0 + d, tick: 0, weather: 'temperate', tiles: tp.map.tiles.map(([x, y]) => ({ x, y, columns: tp.info.depth[y * tp.info.W + x] > 0 ? [[tp.info.floor[y * tp.info.W + x], tp.info.depth[y * tp.info.W + x], 0]] : [], moisture: 0, soilContamination: 0 })) }));
    const s = tp.info.start;
    const tres = { runId: 't', mapId: tp.game.id, title: 't', mapFile: '', status: 'done', log: [], notes: [], samples, snapshots: tsnaps, shots: [{ momentId: 'start', pose: 'tall', file: 'x.jpg', day: catalogM.D0 }], entitiesAtStart: tents, entitiesAtEnd: tents, plantDeaths: [], loadingIssues: [], weather: [], weatherEvents: [], actions: [], start: { districtCenter: s ? { id: 'dc', template: 'DistrictCenter.Folktails', x: s.x, y: s.y, z: s.z, orientation: s.orientation } : null, adults: 9, children: 4, bots: 0 } } as unknown as import('./job').MapResult;
    const tv = compare.evaluate({ L: new compare.Loaded(tdir, tp, tres), others: new Map(), model: null, modelError: null }, tp.checks);
    const bad = tv.filter((x) => x.verdict !== 'passed' && !(x.id === 'tall-shots' && x.verdict === 'recorded'));
    check(`tall checks: the file itself passes every check (${tp.game.id})`, bad.length === 0, bad.map((x) => `${x.id} ${x.verdict}: ${x.detail}`).join(' | ') || tv.map((x) => x.id).join(', '));
    const end = tp.map.moments.find((x) => x.id === 'end')!;
    const broken = tsnap(end.id, end.day);
    const hi = broken.terrain.findIndex((h) => h === 22);
    broken.terrain[hi] = 21;
    writeFileSync(join(tdir, tsnaps.find((f) => f.endsWith('-end.snapshot.json.gz'))!), tz.gzipSync(JSON.stringify(broken)));
    const tv2 = compare.evaluate({ L: new compare.Loaded(tdir, tp, tres), others: new Map(), model: null, modelError: null }, [catalogM.TALL.terrain])[0];
    check('tall checks: a lost voxel at 22 fails the terrain check', tv2.verdict === 'failed', tv2.detail);
  } else console.log('skip tall maps: run npx tsx tools/probe-tall.ts first');
  const ceil = prepared.filter((p) => p.game.group === 'Ceiling');
  if (catalogM.ceilingMaps().length) {
    const raisedOk = (p: (typeof ceil)[number]) => p.game.ceiling!.raised.length > 0 && p.game.ceiling!.raised.every(([x, y]) => p.info.heights[y * p.info.W + x] > 16);
    check('ceiling maps: every map up to 22 with the top layer empty and one floor per tile, with land the editor raised above 16', ceil.length === catalogM.ceilingMaps().length && ceil.every((p) => p.info.maxHeight === 22 && compare.fileColumns(p.info).count.every((n) => n === 1) && raisedOk(p)), ceil.map((p) => `${p.game.id} max ${p.info.maxHeight}, raised ${p.game.ceiling!.raised.length}`).join(', '));
    check("ceiling maps: a 256² map, water above 16, and the editor's land at 22 on every map", ceil.some((p) => p.info.W === 256) && ceil.some((p) => p.game.ceiling!.wetAbove16 > 0) && ceil.every((p) => p.game.ceiling!.raisedAt22 > 0));
    check('ceiling maps: each has its checks, a drought and a badtide, the ceiling poses and its watched water sampled', ceil.every((p) => ['tall-terrain', 'tall-water', 'ceiling-hazards', 'ceiling-build'].every((id) => p.checks.some((c) => c.id === id)) && p.map.moments.some((m) => m.id === 'drought1-start') && p.map.moments.some((m) => m.id === 'badtide2-start') && p.map.poses.some((x) => x.id === 'ceiling-close') && [...p.game.ceiling!.flowTiles, ...p.game.ceiling!.poolTiles].every(([x, y]) => p.map.tiles.some(([a, b]) => a === x && b === y))));
    // the ceiling checks on a record that is the file itself, then with one raised voxel lost
    const cp = ceil.find((p) => p.game.ceiling!.flowTiles.length > 0) ?? ceil[0];
    const cdir = join(sandbox, 'compare-ceiling');
    mkdirSync(cdir, { recursive: true });
    const ccols = compare.fileColumns(cp.info);
    // a source's strength as the file writes it: a number, or an exact float kept with its text
    const strengthOf = (ws: unknown) => {
      const v = (ws as { SpecifiedStrength: unknown }).SpecifiedStrength;
      return typeof v === 'number' ? v : Number((v as { value: number }).value);
    };
    const csnap = (id: string, day: number) => ({ momentId: id, day, tick: 0, weather: 'temperate', width: cp.info.W, height: cp.info.H, depth: [...cp.info.depth], contamination: [...cp.info.contamination], floor: [...cp.info.floor], moisture: [...cp.info.moisture], soilContamination: [...cp.info.soilContamination], terrain: [...ccols.top], terrainColumns: [...ccols.count], layered: [], plants: [], sources: cp.info.entities.filter((e) => /Source$/.test(e.template)).map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, source: { specified: strengthOf(e.components.WaterSource), current: 1, contamination: 0 } })) });
    const cz = require('node:zlib') as typeof import('node:zlib');
    const csnaps: string[] = [];
    for (const m of cp.map.moments.filter((x) => x.snapshot)) {
      const f = `${cp.game.id}-${m.id.replace(/[^A-Za-z0-9_-]/g, '_')}.snapshot.json.gz`;
      writeFileSync(join(cdir, f), cz.gzipSync(JSON.stringify(csnap(m.id, m.day))));
      csnaps.push(f);
    }
    const cents = cp.info.entities.filter((e) => e.template !== 'StartingLocation').map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation }));
    const csamples = [0, 0.25, 0.5, 1, 1.5, 1.75].map((d) => ({ day: catalogM.D0 + d, tick: 0, weather: 'temperate', tiles: cp.map.tiles.map(([x, y]) => ({ x, y, columns: cp.info.depth[y * cp.info.W + x] > 0 ? [[cp.info.floor[y * cp.info.W + x], cp.info.depth[y * cp.info.W + x], 0]] : [], moisture: 0, soilContamination: 0 })) }));
    const cs = cp.info.start;
    const cres = { runId: 't', mapId: cp.game.id, title: 't', mapFile: '', status: 'done', log: [], notes: [], samples: csamples, snapshots: csnaps, shots: [{ momentId: 'start', pose: 'ceiling', file: 'x.jpg', day: catalogM.D0 }], entitiesAtStart: cents, entitiesAtEnd: cents, plantDeaths: [], loadingIssues: [], weather: [], weatherEvents: [], actions: [], start: { districtCenter: cs ? { id: 'dc', template: 'DistrictCenter.Folktails', x: cs.x, y: cs.y, z: cs.z, orientation: cs.orientation } : null, adults: 9, children: 4, bots: 0 } } as unknown as import('./job').MapResult;
    const cv = compare.evaluate({ L: new compare.Loaded(cdir, cp, cres), others: new Map(), model: null, modelError: null }, cp.checks);
    const cbad = cv.filter((x) => x.verdict !== 'passed' && !(x.id === 'tall-shots' && x.verdict === 'recorded') && !(x.id === 'ceiling-hazards' && x.verdict === 'not measurable'));
    check(`ceiling checks: the file itself passes every check but the model's (${cp.game.id})`, cbad.length === 0 && cv.some((x) => x.id === 'ceiling-build' && x.verdict === 'passed'), cbad.map((x) => `${x.id} ${x.verdict}: ${x.detail}`).join(' | ') || cv.map((x) => `${x.id} ${x.verdict}`).join(', '));
    const cend = cp.map.moments.find((x) => x.id === 'end')!;
    const clost = csnap(cend.id, cend.day);
    const [rx, ry] = cp.game.ceiling!.raised[0];
    clost.terrain[ry * cp.info.W + rx] -= 1;
    writeFileSync(join(cdir, csnaps.find((f) => f === `${cp.game.id}-end.snapshot.json.gz`)!), cz.gzipSync(JSON.stringify(clost)));
    const cv2 = compare.evaluate({ L: new compare.Loaded(cdir, cp, cres), others: new Map(), model: null, modelError: null }, [catalogM.CEILING.build])[0];
    check('ceiling checks: a lost voxel on the land the editor raised fails the upper-slopes check', cv2.verdict === 'failed', cv2.detail);
  } else console.log('skip ceiling maps: run npx tsx tools/probe-ceiling.ts first');
  // the size maps (PLAN §20 D357 (9)): each at its size, the frame-time phases after its first day, and its checks
  const sized = prepared.filter((p) => p.game.group === 'Sizes');
  check('Sizes: six games at their sizes, the frame-time phases after the day-1 record', sized.length === 6 && sized.every((p) => p.info.W === p.game.sizes!.size[0] && p.info.H === p.game.sizes!.size[1] && p.map.perf?.phases.length === 3 && Math.abs(p.map.perf.startDay - (catalogM.D0 + 1.01)) < 1e-9 && p.map.moments.some((m) => m.snapshot && Math.abs(m.day - catalogM.D0 - 1) < 1e-9)), sized.map((p) => `${p.game.id} ${p.info.W}×${p.info.H}`).join(', '));
  check('Sizes: the time the phases take is in each map\'s timeout and in the estimate', sized.every((p) => p.map.timeoutSeconds > jobs.perfSeconds(p.map) + 300) && jobs.estimateMinutes(sized) > jobs.estimateMinutes(sized.map((p) => ({ ...p, map: { ...p.map, perf: undefined } }))) + 9, `${jobs.estimateMinutes(sized)} minutes`);
  {
    const sp = sized.find((p) => p.game.id === 'sizes-64x512')!, ref = sized.find((p) => p.game.id === compare.SIZE_REFERENCE)!;
    const sdir = join(sandbox, 'compare-sizes');
    mkdirSync(sdir, { recursive: true });
    const sz = require('node:zlib') as typeof import('node:zlib');
    const cols = compare.fileColumns(sp.info);
    const snapOf = (id: string, day: number, width = sp.info.W) => ({ momentId: id, day, tick: 0, weather: 'temperate', width, height: sp.info.H, depth: [...sp.info.depth], contamination: [...sp.info.contamination], floor: [...sp.info.floor], moisture: [...sp.info.moisture], soilContamination: [...sp.info.soilContamination], terrain: [...cols.top], terrainColumns: [...cols.count], layered: [], plants: [], sources: [] });
    const write = (mutate: (id: string, s: ReturnType<typeof snapOf>) => void = () => {}) => {
      const files: string[] = [];
      for (const m of sp.map.moments.filter((x) => x.snapshot)) {
        const f = `${sp.game.id}-${m.id.replace(/[^A-Za-z0-9_-]/g, '_')}.snapshot.json.gz`;
        const s = snapOf(m.id, m.day);
        mutate(m.id, s);
        writeFileSync(join(sdir, f), sz.gzipSync(JSON.stringify(s)));
        files.push(f);
      }
      return files;
    };
    const ents = sp.info.entities.filter((e) => e.template !== 'StartingLocation').map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation }));
    const samplesOf = (dryTile?: [number, number]) => [0, 0.5, 1].map((d) => ({ day: catalogM.D0 + d, tick: 0, weather: 'temperate', tiles: sp.map.tiles.map(([x, y]) => ({ x, y, columns: sp.info.depth[y * sp.info.W + x] > 0 && !(dryTile && d === 0.5 && dryTile[0] === x && dryTile[1] === y) ? [[sp.info.floor[y * sp.info.W + x], sp.info.depth[y * sp.info.W + x], 0]] : [], moisture: 0, soilContamination: 0 })) }));
    const perfOf = (median: number) => ({ camera: 'test', phases: sp.map.perf!.phases.map((x) => ({ id: x.id, speed: x.speed || 99, seconds: x.seconds - x.warmup, frames: 500, medianMs: median, p95Ms: median * 1.5, p99Ms: median * 2, maxMs: median * 3, over50Ms: 0, over100Ms: 0, days: 0.1, speedReached: x.speed || 40, workingSetMb: 2000 })) });
    const s0 = sp.info.start!;
    const resultOf = (snaps: string[], samples: ReturnType<typeof samplesOf>, extra: Record<string, unknown> = {}) => ({ runId: 't', mapId: sp.game.id, title: 't', mapFile: '', status: 'done', modVersion: '0.2.1', log: [], notes: [], samples, snapshots: snaps, shots: [{ momentId: 'start', pose: 'overview', file: 'x.jpg', day: catalogM.D0 }], entitiesAtStart: ents, entitiesAtEnd: ents, plantDeaths: [], loadingIssues: [], weather: [], weatherEvents: [], actions: [], start: { districtCenter: { id: 'dc', template: 'DistrictCenter.Folktails', x: s0.x, y: s0.y, z: s0.z, orientation: s0.orientation }, adults: 9, children: 4, bots: 0 }, loadSeconds: 30, workingSetAtLoadMb: 2500, perf: perfOf(20), ...extra }) as unknown as import('./job').MapResult;
    const refL = new compare.Loaded(sdir, ref, { ...resultOf([], []), mapId: ref.game.id, loadSeconds: 12, perf: perfOf(10) } as unknown as import('./job').MapResult);
    const others = new Map([[ref.game.id, refL]]);
    const judge = (res: import('./job').MapResult, ids?: string[]) => compare.evaluate({ L: new compare.Loaded(sdir, sp, res), others, model: null, modelError: null }, sp.checks.filter((c) => !ids || ids.includes(c.id)));
    const sv = judge(resultOf(write(), samplesOf()));
    const bad = sv.filter((x) => !(x.verdict === 'passed' || (x.verdict === 'recorded' && ['size-smooth', 'size-load-time', 'size-shots'].includes(x.id))));
    check('size checks: the file itself passes; frame times and the load time are recorded against the 256² reference', bad.length === 0 && /\[256²: median 10\.0/.test(sv.find((x) => x.id === 'size-smooth')!.detail) && /256²: 12\.0 s/.test(sv.find((x) => x.id === 'size-load-time')!.detail), bad.map((x) => `${x.id} ${x.verdict}: ${x.detail}`).join(' | ') || sv.map((x) => `${x.id} ${x.verdict}`).join(', '));
    const wrong = judge(resultOf(write((id, s) => id === 'start' && (s.width = sp.info.W - 1)), samplesOf()), ['size-load'])[0];
    const dried = judge(resultOf(write(), samplesOf(sp.game.sizes!.flowTiles[2])), ['size-water'])[0];
    const noPerf = judge(resultOf(write(), samplesOf(), { perf: undefined, modVersion: '0.2.0' }), ['size-smooth'])[0];
    check('size checks: a map of another size fails the load; a river tile that dries fails the water; no frame times is not measurable', wrong.verdict === 'failed' && /NOT THE SAME/.test(wrong.detail) && dried.verdict === 'failed' && /dried/.test(dried.detail) && noPerf.verdict === 'not measurable', `${wrong.detail.slice(0, 80)} | ${dried.detail.slice(-120)} | ${noPerf.detail}`);
  }
  const t3dGames = prepared.filter((p) => p.game.group === 'Terrain 3D');
  if (t3d.terrain3dMaps().length) {
    check('terrain 3D: the maps T3–T7, each with its checks and focus poses', t3dGames.length === t3d.terrain3dMaps().length && ['t3-cave-water', 't4-soil', 't5-plants', 't6-heights', 't7-sink'].every((id) => t3dGames.some((p) => p.game.id === id)) && t3dGames.every((p) => p.checks.some((c) => c.id === 't3d-support') && p.map.poses.some((x) => x.id.startsWith('t3d-'))), t3dGames.map((p) => p.game.id).join(', '));
    // a result made from our own models passes every check; a lost voxel, and water where the engine
    // has none, fail theirs
    const tz = require('node:zlib') as typeof import('node:zlib');
    const { terrainColumns } = require('../../../src/core/sim/columns') as typeof import('../../../src/core/sim/columns');
    const { soil3d } = require('../../../src/core/sim/soil3d') as typeof import('../../../src/core/sim/soil3d');
    const fake = (p: (typeof t3dGames)[number], dir: string, tamper?: (s: import('./job').MapSnapshot) => void, tamperStart?: (s: import('./job').MapSnapshot) => void) => {
      mkdirSync(dir, { recursive: true });
      const m = t3d.modelOf(p.info);
      const { N, W, L } = m.cols;
      const runs = terrainColumns(m.kept);
      const snaps: string[] = [];
      for (const mo of p.map.moments.filter((x) => x.snapshot)) {
        const e = t3d.engineAt(p.info, mo.day - catalogM.D0);
        const soil = soil3d(m.kept, m.cols, e, m.objects);
        const s: import('./job').MapSnapshot = { momentId: mo.id, day: mo.day, tick: 0, weather: 'temperate', width: W, height: N / W, depth: [], contamination: [], floor: [], moisture: [], soilContamination: [], terrain: [], terrainColumns: [], layered: [], terrainLayered: [], plants: [], sources: [] };
        for (let i = 0; i < N; i++) {
          let top = -1;
          for (let k = m.cols.count[i] - 1; k >= 0 && top < 0; k--) if (e.depth[k * N + i] > 0) top = k * N + i;
          s.depth.push(top >= 0 ? e.depth[top] : 0);
          s.contamination.push(top >= 0 ? e.contamination[top] : 0);
          s.floor.push(top >= 0 ? m.cols.floor[top] : -1);
          if (m.cols.count[i] > 1) s.layered.push({ x: i % W, y: (i / W) | 0, columns: Array.from({ length: m.cols.count[i] }, (_, k) => [m.cols.floor[k * N + i], e.depth[k * N + i], e.contamination[k * N + i], e.overflow[k * N + i]] as [number, number, number, number]) });
          const n = runs.count[i];
          s.terrainColumns.push(n);
          s.terrain.push(runs.ceil[(n - 1) * N + i]);
          s.moisture.push(soil.moisture[(n - 1) * N + i]);
          s.soilContamination.push(soil.contamination[(n - 1) * N + i]);
          if (n > 1) s.terrainLayered!.push({ x: i % W, y: (i / W) | 0, runs: Array.from({ length: n }, (_, k) => [runs.floor[k * N + i], runs.ceil[k * N + i], soil.moisture[k * N + i], soil.contamination[k * N + i]] as [number, number, number, number]) });
        }
        if (mo.id === 'end') tamper?.(s);
        if (mo.id === 'start') tamperStart?.(s);
        const f = `${p.game.id}-${mo.id.replace(/[^A-Za-z0-9_-]/g, '_')}.snapshot.json.gz`;
        writeFileSync(join(dir, f), tz.gzipSync(JSON.stringify(s)));
        snaps.push(f);
      }
      void L;
      const t = p.game.terrain3d!;
      const removed = new Set(t.predicted.plantsRemoved.map((x) => x.id));
      const ents = p.info.entities.filter((e) => e.template !== 'StartingLocation' && !removed.has(e.id)).map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation }));
      const st = p.info.start;
      const res = { runId: 't', mapId: p.game.id, title: 't', mapFile: '', status: 'done', log: [], notes: [], samples: [], snapshots: snaps, shots: [{ momentId: 'start', pose: 't3d', file: 'x.jpg', day: catalogM.D0 }], entitiesAtStart: ents, entitiesAtEnd: ents, plantDeaths: [], loadingIssues: t.predicted.dropped || removed.size ? ['Terrain removed'] : [], weather: [], weatherEvents: [], actions: [], start: { districtCenter: st ? { id: 'dc', template: 'DistrictCenter.Folktails', x: st.x, y: st.y, z: st.z, orientation: st.orientation } : null, adults: 9, children: 4, bots: 0 } } as unknown as import('./job').MapResult;
      return compare.evaluate({ L: new compare.Loaded(dir, p, res), others: new Map(), model: null, modelError: null }, p.checks);
    };
    for (const id of ['t3-cave-water', 't5-plants', 't7-sink']) {
      const p = t3dGames.find((x) => x.game.id === id);
      if (!p) continue;
      const v = fake(p, join(sandbox, `compare-${id}`));
      const bad = v.filter((x) => !(x.verdict === 'passed' || (x.id === 't3d-shots' && x.verdict === 'recorded') || (x.verdict === 'not measurable' && ['t3d-walk', 't3d-pumps'].includes(x.id))));
      check(`terrain 3D: our own models pass every check (${id})`, bad.length === 0, bad.map((x) => `${x.id} ${x.verdict}: ${x.detail}`).join(' | ') || v.map((x) => x.id).join(', '));
    }
    const t1 = t3dGames.find((x) => x.game.id === 't1-support');
    if (t1) {
      const v = fake(t1, join(sandbox, 'compare-t1-lost'), (s) => {
        const i = s.terrain.findIndex((h) => h === 20);
        s.terrain[i] = 19;
      }).find((x) => x.id === 't3d-support')!;
      check('terrain 3D: a voxel the rule keeps but the game lost fails the support check', v.verdict === 'failed', v.detail);
      // at the load the probe's view can still show the file's terrain (run terrain3d-20260927): that passes;
      // a load record that is neither the file's terrain nor ours fails
      const fileRuns = terrainColumns(t3d.modelOf(t1.info).file);
      const asFile = (s: import('./job').MapSnapshot) => {
        const { N, W } = fileRuns;
        s.terrainLayered = [];
        for (let i = 0; i < N; i++) {
          const n = fileRuns.count[i];
          s.terrainColumns[i] = n;
          s.terrain[i] = fileRuns.ceil[(n - 1) * N + i];
          if (n > 1) s.terrainLayered.push({ x: i % W, y: (i / W) | 0, runs: Array.from({ length: n }, (_, k) => [fileRuns.floor[k * N + i], fileRuns.ceil[k * N + i], 0, 0] as [number, number, number, number]) });
        }
      };
      const v2 = fake(t1, join(sandbox, 'compare-t1-file-at-load'), undefined, asFile).find((x) => x.id === 't3d-support')!;
      check("terrain 3D: the file's terrain at the load, ours after, passes the support check", v2.verdict === 'passed' && /still show the file's terrain/.test(v2.detail), v2.detail);
      const v3 = fake(t1, join(sandbox, 'compare-t1-odd-at-load'), undefined, (s) => {
        asFile(s);
        s.terrain[s.terrain.findIndex((h) => h === 20)] = 18;
      }).find((x) => x.id === 't3d-support')!;
      check('terrain 3D: a load record that is neither the file nor ours fails the support check', v3.verdict === 'failed', v3.detail);
    }
    const t3 = t3dGames.find((x) => x.game.id === 't3-cave-water');
    if (t3) {
      const v = fake(t3, join(sandbox, 'compare-t3-wet'), (s) => {
        for (const l of s.layered) for (const c of l.columns) c[1] = c[1] > 0 ? 0 : 0.5;
      }).find((x) => x.id === 't3d-water')!;
      check('terrain 3D: cave water where the engine has none fails the water check', v.verdict === 'failed', v.detail);
    }
  } else check('terrain 3D: the group writer wrote its maps', false, 'no maps in the sandbox');
  const look = prepared.filter((p) => p.game.group === 'Map look');
  check('Map look: poses from the captures', look.filter((p) => p.map.poses.some((x) => x.lookCapture && existsSync(join(paths.REPO, x.lookCapture)))).length >= 7, look.map((p) => `${p.game.id} ${p.map.poses.filter((x) => x.lookCapture).length}`).join(', '));
  const cal = prepared.find((p) => p.game.id === 'cal-rv2')!;
  check('calibration: the drought and badtide moments', ['drought1-start', 'drought1-day1', 'badtide2-start', 'badtide2-day1'].every((id) => cal.map.moments.some((m) => m.id === id)));
  const e4 = prepared.find((p) => p.game.id === 'e4-no-start')!;
  check('E4: no StartingLocation, and it runs last', !e4.info.start && prepared[prepared.length - 1].game.id === 'e4-no-start');
  const pending = prepared.flatMap((p) => p.checks.map((c) => c.id));
  check('checks: ML-1 (received) is left out, ML-2 (pending) is in', !pending.includes('ML-1') && pending.includes('ML-2'));

  // 4. compare: a result that holds the file's own water passes the water check
  const m8 = prepared.find((p) => p.game.id === 'm8-preview')!;
  const resDir = join(sandbox, 'compare');
  mkdirSync(resDir, { recursive: true });
  const snap = (id: string, day: number) => ({ momentId: id, day, tick: 0, weather: 'temperate', width: m8.info.W, height: m8.info.H, depth: [...m8.info.depth], contamination: [...m8.info.contamination], floor: [...m8.info.floor], moisture: [...m8.info.moisture], soilContamination: [...m8.info.soilContamination], terrain: [...m8.info.heights], terrainColumns: new Array(m8.info.W * m8.info.H).fill(1), layered: [], plants: [], sources: [] });
  const zlib = require('node:zlib') as typeof import('node:zlib');
  const snaps: string[] = [];
  for (const m of m8.map.moments.filter((x) => x.snapshot)) {
    const f = `m8-preview-${m.id.replace(/[^A-Za-z0-9_-]/g, '_')}.snapshot.json.gz`;
    writeFileSync(join(resDir, f), zlib.gzipSync(JSON.stringify(snap(m.id, m.day))));
    snaps.push(f);
  }
  const entities = m8.info.entities.filter((e) => e.template !== 'StartingLocation').map((e) => ({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation }));
  const result = { runId: 't', mapId: 'm8-preview', title: 't', mapFile: '', status: 'done', log: [], notes: [], samples: [], snapshots: snaps, shots: [], entitiesAtStart: entities, entitiesAtEnd: entities, plantDeaths: [], loadingIssues: [], weather: [], weatherEvents: [], actions: [], start: { districtCenter: { id: 'dc', template: 'DistrictCenter.Folktails', x: 44, y: 54, z: 8, orientation: 'Cw0' }, adults: 9, children: 4, bots: 0 } } as unknown as import('./job').MapResult;
  const L = new compare.Loaded(resDir, m8, result);
  const v = compare.evaluate({ L, others: new Map(), model: null, modelError: null }, m8.checks);
  const get = (id: string) => v.find((x) => x.id === id)!;
  check('compare: water held → water passed', get('water').verdict === 'passed', get('water').detail);
  check('compare: terrain and objects passed', get('terrain').verdict === 'passed' && get('objects').verdict === 'passed', `${get('terrain').detail} | ${get('objects').detail}`);
  check('compare: M8-1a passed on the file itself', get('M8-1a').verdict === 'passed', get('M8-1a').detail);
  // a drained river fails
  const day1 = m8.map.moments.filter((x) => x.snapshot).sort((a, b) => Math.abs(a.day - catalogM.D0 - 1) - Math.abs(b.day - catalogM.D0 - 1))[0];
  const drained = snap(day1.id, day1.day);
  drained.depth = drained.depth.map((d, t) => (t % 3 === 0 ? 0 : d));
  writeFileSync(join(resDir, snaps.find((s) => s.endsWith(`-${day1.id.replace(/[^A-Za-z0-9_-]/g, '_')}.snapshot.json.gz`))!), zlib.gzipSync(JSON.stringify(drained)));
  const L2 = new compare.Loaded(resDir, m8, result);
  const w2 = compare.evaluate({ L: L2, others: new Map(), model: null, modelError: null }, [m8.checks.find((c) => c.id === 'water')!])[0];
  check('compare: a drained map fails the water check', w2.verdict === 'failed', w2.detail);
  // the wet-tile counts leave out tiles within 0.01 of the 0.05 line (D297, D302)
  const startDay = m8.map.moments.find((x) => x.id === 'start')!.day;
  const picked = [...m8.info.depth.keys()].filter((t) => m8.info.depth[t] > 0.2).slice(0, Math.ceil(0.2 * [...m8.info.depth].filter((d) => d > 0.05).length));
  const fakeModel = (to: number) => {
    const depth = Float32Array.from(m8.info.depth);
    for (const t of picked) depth[t] = to;
    const N = depth.length;
    return { samples: [], maps: [{ day: startDay, depth, contamination: new Float32Array(N), moisture: Float32Array.from(m8.info.moisture), soilContamination: new Float32Array(N) }], plants: [], W: m8.info.W, H: m8.info.H, cpuSeconds: 0, momentum: 'test' };
  };
  const tl = (to: number) => compare.evaluate({ L, others: new Map(), model: fakeModel(to), modelError: null }, [{ id: 'cal-timeline', title: 't', how: 'measure' }])[0];
  const onLine = tl(0.045), off = tl(0);
  check('cal-timeline: tiles within 0.01 of the wet line are left out of the wet counts (D297, D302)', /wet tiles 0\.0%/.test(onLine.detail) && Number(/wet tiles (\d+\.\d)%/.exec(off.detail)?.[1] ?? 0) >= 5 && off.verdict === 'failed', `${onLine.detail.slice(-160)} | ${off.detail.slice(-160)}`);

  // 4a. a group or list that matches nothing refuses, never the whole catalog in its place (probe parity-20260930)
  const refuses = (only: string | undefined, group: string | undefined, words: RegExp) => {
    try {
      catalogM.gameIdsFor(games, only, group);
      return false;
    } catch (e) {
      return words.test((e as Error).message);
    }
  };
  const inM8 = catalogM.gameIdsFor(games, undefined, 'M8');
  check('select: a group plays its own maps', inM8.length > 0 && inM8.every((id) => games.find((g) => g.id === id)!.group === 'M8'), inM8.join(', '));
  check('select: an unknown group refuses', refuses(undefined, 'Nonesuch', /^no maps in group Nonesuch: no game belongs to it/));
  check('select: an empty group or list refuses', refuses(undefined, '', /^no maps in group \(none\)/) && refuses('', undefined, /^no maps named/));
  check('select: an unknown id refuses; nothing named plays the whole catalog', refuses('m8-preview,nonesuch', undefined, /^unknown games: nonesuch/) && catalogM.gameIdsFor(games).length === 0);
  try {
    catalogM.gameIdsFor(games.filter((g) => g.group !== 'Sizes'), undefined, 'Sizes');
    check('select: --group Sizes with no Sizes maps refuses, naming its writer', false);
  } catch (e) {
    check('select: --group Sizes with no Sizes maps refuses, naming its writer', /^no maps in group Sizes: its maps have not been written \(the batch writes them before it plans; by hand: npx tsx tools\/probe-sizes\.ts\)/.test((e as Error).message), (e as Error).message);
  }

  // 4a'. the batch itself, without --confirmed-launch: it writes the Sizes maps (here all current already, then one made
  // stale), prints the plan with the maps written, and launches nothing (exit 3); an unknown group plans nothing (exit 1)
  const batchRun = (...a: string[]) => {
    const r = require('node:child_process').spawnSync(process.execPath, [join(paths.PROBE_DIR, 'run.cjs'), 'runner/batch.ts', ...a], { cwd: paths.PROBE_DIR, encoding: 'utf8', env: process.env, maxBuffer: 64 << 20 }) as { status: number; stdout: string; stderr: string };
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const b1 = batchRun('--group', 'Sizes', '--keep-mods', '--run-id', 'test-sizes-plan');
  writeFileSync(join(sandbox, 'sizes', 'sizes-64x512.timber'), 'stale');
  const b2 = batchRun('--group', 'Sizes', '--keep-mods', '--run-id', 'test-sizes-plan');
  const listsAll = (o: string) => sizesW.files.every((f) => o.includes(`${f.file}  ${f.size[0]}×${f.size[1]}`) && o.includes(f.sha256));
  check('batch --group Sizes: the plan lists the six maps written (file, size, sha256), launches nothing', b1.status === 3 && listsAll(b1.out) && /all already current/.test(b1.out) && /LAUNCHES TIMBERBORN/.test(b1.out) && /Nothing was launched/.test(b1.out) && !safety.isGameRunning(), b1.out.split('\n').filter((l) => /Maps written|sizes-64x512|Full batch|Nothing was/.test(l)).join(' | '));
  check('batch --group Sizes: a stale map on disk is rewritten before the plan', b2.status === 3 && /1 written now/.test(b2.out) && listsAll(b2.out) && groupM.sha256(new Uint8Array(readFileSync(join(sandbox, 'sizes', 'sizes-64x512.timber')))) === sizesW.files.find((f) => f.file === 'sizes-64x512.timber')!.sha256, b2.out.split('\n').filter((l) => /written now|sizes-64x512/.test(l)).join(' | '));
  const b3 = batchRun('--group', 'Nonesuch', '--keep-mods');
  check('batch --group Nonesuch: refuses and plans nothing', b3.status === 1 && /no maps in group Nonesuch/.test(b3.out) && !/LAUNCHES/.test(b3.out), b3.out.trim().split('\n').at(-1));

  // 4b. the model starts from what the game loads: the file's water and the outflows it stores
  const modelM = require('./model') as typeof import('./model');
  const m9a = prepared.filter((p) => p.game.group === 'M9a' && p.game.model);
  const canyon = m9a.find((p) => p.game.id === 'm9a-canyon-128')!;
  const cflows = mapfile.storedOutflows(canyon.info.file);
  check("outflows: an M9a map's stored outflows are read, every target the neighbour's", !!cflows && cflows.flowing > 100 && cflows.skipped === 0, cflows ? `${cflows.flowing} flowing, ${cflows.skipped} skipped` : 'none');
  const m8flows = mapfile.storedOutflows(m8.info.file);
  check('outflows: a file storing every outflow as 0 reads as at rest', !!m8flows && m8flows.flowing === 0);
  const momentum = (p: typeof canyon) => modelM.runModel(readFileSync(p.map.mapFile), `${p.game.id}.timber`, p.game.cycles, catalogM.D0 + 2 / 768, [], [], []).momentum;
  const cm = momentum(canyon), m8m = momentum(m8);
  check('model: starts from the stored outflows on an M9a map, at rest on a file without them', /^the file's outflows \(\d+ flowing\)$/.test(cm) && /^at rest/.test(m8m), `${cm} | ${m8m}`);

  // 4c. the start's water is the water the product's start.water counts (the nearest the same walk and tile)
  const { MapSession } = require('../../../src/core/doc/session') as typeof import('../../../src/core/doc/session');
  const agree: string[] = [];
  let differ = 0;
  for (const p of m9a) {
    const sw = catalogM.startWaterOf(p.info, p.game.mode);
    const v = MapSession.importMap(readFileSync(p.map.mapFile), `${p.game.id}.timber`).validate('export').report.checks.find((c) => c.id === 'start.water')!;
    const tile = v.where?.tiles?.[0];
    const nearest = sw.pump.filter((q) => q.walk === sw.pump[0]?.walk);
    const same = !!tile && Math.round((sw.pump[0]?.walk ?? NaN) * 10) / 10 === v.value && nearest.some((q) => q.x === tile[0] && q.y === tile[1]);
    if (!same) differ++;
    agree.push(`${p.game.id} ${same ? 'same' : `DIFFERS (probe ${sw.pump[0]?.walk.toFixed(1)} at (${sw.pump[0]?.x}, ${sw.pump[0]?.y}), product ${String(v.value)} at (${tile?.join(', ')}))`}`);
  }
  check("start water: the probe's nearest is start.water's own on every M9a map", m9a.length >= 13 && differ === 0, agree.join('; '));
  // Re-pinned under D148 (M9b, D333): the generator no longer leaves Canyon 128² seed 1 a sealed hole
  // by its start, so the hole is made here: a one-tile pool sunk beside the start, nearer than the
  // river. Both must count, the pool and the river, not only the nearest.
  const cw0 = catalogM.startWaterOf(canyon.info, canyon.game.mode);
  let pooled: { at: string; sw: ReturnType<typeof catalogM.startWaterOf> } | null = null;
  {
    const ci = canyon.info, CW = ci.W, st = ci.start!;
    for (let r = 2; r <= 5 && !pooled; r++) for (let dy = -r; dy <= r && !pooled; dy++) for (let dx = -r; dx <= r && !pooled; dx++) {
      const x = st.x + dx, y = st.y + dy, t = y * CW + x;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || x < 1 || y < 1 || x >= CW - 1 || y >= ci.H - 1 || ci.depth[t] > 0) continue;
      const heights = Uint8Array.from(ci.heights), depth = Float32Array.from(ci.depth), contamination = Float32Array.from(ci.contamination);
      heights[t] = ci.heights[t] - 1;
      depth[t] = 1;
      contamination[t] = 0;
      const sw = catalogM.startWaterOf({ ...ci, heights, depth, contamination } as typeof ci, canyon.game.mode);
      if (sw.pump[0] && sw.pump[0].x === x && sw.pump[0].y === y) pooled = { at: `(${x}, ${y})`, sw };
    }
  }
  const riverKept = !!pooled && cw0.bodies.every((b) => pooled!.sw.bodies.some((c) => c.length === b.length && c[0] === b[0]));
  check("start water: a sealed one-tile pool nearest the start counts with the river and pools, not instead of them", !!pooled && pooled.sw.bodies.length === cw0.bodies.length + 1 && riverKept, pooled ? `pool at ${pooled.at}: ${pooled.sw.bodies.length} bodies (${cw0.bodies.length} without it), ${pooled.sw.bodies.flat().length} tiles` : 'no tile beside the start took a pool');

  // 5a. the hand-kept settings backup: a .reg file of the whole key and the mods' values in text
  execFileSync('reg.exe', ['add', TEST_KEY, '/v', mods.prefsValueName('ModPriority.Local.SomeMod.someone.somemod'), '/t', 'REG_DWORD', '/d', '4294967295', '/f'], { stdio: 'ignore' });
  const b = safety.backupSettings();
  const reg = readFileSync(b.regFile, 'utf16le');
  const listed = readFileSync(b.modsFile, 'utf8');
  check('settings backup: the .reg file holds the key', reg.includes('DGMProbeTest\\Timberborn') && reg.includes('KylerSetting_h7'));
  check('settings backup: mod values in plain text', /ModPriority\.Local\.SomeMod\.someone\.somemod = -1/.test(listed), listed.split('\r\n').slice(3).join(' | '));

  // 5. snapshot and restore: settings, logs, player data, saves
  const small = jobs.makeJob('fake-run', [...prepared.slice(0, 3), sized.find((p) => p.game.id === 'sizes-64x512')!], 99);
  const snapInfo = safety.takeSnapshot();
  check('snapshot: refuses a second one before a restore', (() => {
    try {
      safety.takeSnapshot();
      return false;
    } catch {
      return true;
    }
  })());
  const set = mods.probeOnly();
  check('mods: only DGM Probe on for the run', set.on.length === 1 && set.off.some((s) => s.includes('someone.somemod')), `on ${set.on.join(', ')}; off ${set.off.length}`);

  // 6. the watchdog: a crash on map 2, a hang on map 3, and relaunches for the rest
  process.env.FAKE_CRASH = small.maps[1].id;
  process.env.FAKE_HANG = small.maps[2].id;
  const lines: string[] = [];
  const logsRun = await launch.runJob(small, { hangSeconds: 6, startSeconds: 20, mapSeconds: 60, maxLaunches: 5, log: (s) => lines.push(s) });
  const results = launch.mapsWithResults(small);
  check('watchdog: every map has a result', small.maps.every((m) => results.has(m.id)), logsRun.map((l) => `${l.launch} ${l.outcome}`).join(', '));
  check('watchdog: the crash and the hang were caught', logsRun.some((l) => l.outcome === 'crashed' || l.outcome === 'exited') && logsRun.some((l) => l.outcome === 'hung'));
  const failed = small.maps.filter((m) => JSON.parse(readFileSync(join(launch.resultsDir(small.runId), `${m.id}.json`), 'utf8')).status === 'failed').map((m) => m.id);
  check('watchdog: the hung map is recorded as failed', failed.includes(small.maps[2].id), failed.join(', '));
  check('watchdog: the game is gone and the job file removed', !safety.isGameRunning() && !existsSync(paths.probePaths().job));
  const sizedResult = JSON.parse(readFileSync(join(launch.resultsDir(small.runId), 'sizes-64x512.json'), 'utf8')) as import('./job').MapResult;
  check("frame times: the job's phases reach the game and come back in the result, with the load time", small.maps[3].perf?.phases.map((x) => x.id).join(',') === 'normal,fastest,probe' && sizedResult.perf?.phases.map((x) => x.id).join(',') === 'normal,fastest,probe' && sizedResult.loadSeconds === 12.5, JSON.stringify(sizedResult.perf?.phases.map((x) => [x.id, x.speed])));

  writeFileSync(join(docs, 'PlayerData/player.data'), 'changed by the game');
  const r = safety.restore(join(sandbox, 'kept'));
  const values = safety.registryValues();
  check('restore: settings back exactly', r.registryRestored && JSON.stringify(values) === JSON.stringify(snapInfo.registryValues), Object.keys(values).join(', '));
  check('restore: logs back', readFileSync(join(logs, 'Player.log'), 'utf8') === 'kyler log' && readFileSync(join(logs, 'Player-prev.log'), 'utf8') === 'kyler prev log');
  check('restore: player data back', readFileSync(join(docs, 'PlayerData/player.data'), 'utf8') === 'player data');
  check("restore: the probe's saves deleted, Kyler's kept", !existsSync(join(docs, 'Saves/DGMProbe fake')) && existsSync(join(docs, 'Saves/Kyler colony/Day 12.timber')) && existsSync(join(docs, 'Saves/Empty folder')), r.savesDeleted.join(', '));
  check('restore: error reports moved out, and the folder the game made for them removed', !existsSync(join(docs, 'Error reports')) && existsSync(join(docs, 'Kyler empty folder')), r.docsMoved.join(', '));
  check("restore: a mod's data file the game rewrote is put back, the rewritten one kept in the run's folder", readFileSync(join(docs, 'SomeModData/markers.txt'), 'utf8') === 'kyler mod data' && /rewritten by the game/.test(readFileSync(join(sandbox, 'kept', 'changed', 'SomeModData', 'markers.txt'), 'utf8')) && r.docsRestored.includes(join('SomeModData', 'markers.txt')), r.docsRestored.join(', '));
  check("restore: Steam's own bookkeeping file is reported, never put back", r.savesChanged.includes('steam_autocloud.vdf') && readFileSync(join(docs, 'Saves/steam_autocloud.vdf'), 'utf8') !== 'steam before', r.savesChanged.join(', '));
  check('restore: a DGMProbe folder the run wrote in Documents\\Timberborn is moved out and removed', !existsSync(join(docs, 'DGMProbe')) && existsSync(join(sandbox, 'kept', 'created', 'DGMProbe', 'shots')), r.docsMoved.filter((m) => m.startsWith('DGMProbe')).join(', '));
  const modFiles = readdirSync(join(docs, 'Mods/SomeMod'));
  check("restore: in a player mod's folder, a new file is moved out and a rewritten one put back", readFileSync(join(docs, 'Mods/SomeMod/config.txt'), 'utf8') === 'kyler mod config' && !modFiles.some((f) => f.startsWith('session-')) && modFiles.includes('version-1.1'), modFiles.join(', '));
  check("restore: DGM Probe's own mod folder is left to the runner, which removes it after", existsSync(join(docs, 'Mods/DGMProbe/version-1.1')));
  rmSync(join(docs, 'Mods/DGMProbe'), { recursive: true, force: true });
  const left = safety.leftovers(snapInfo);
  check('restore: nothing new is left in Documents\\Timberborn', left.length === 0, left.join(', '));
  mkdirSync(join(docs, 'Stray'), { recursive: true });
  writeFileSync(join(docs, 'Stray/left.txt'), 'left');
  const stray = safety.leftovers(snapInfo);
  check('leftovers: a file and folder a run left behind are caught', stray.includes(join('Stray', 'left.txt')) && stray.includes('Stray\\'), stray.join(', '));
  rmSync(join(docs, 'Stray'), { recursive: true, force: true });
  check('restore: the marker is gone', !safety.hasPendingRestore());

  // 7. the exact comparison with a settings backup, load order and long binary values included
  execFileSync('reg.exe', ['add', TEST_KEY, '/v', 'LongBinary_h9', '/t', 'REG_BINARY', '/d', '41'.repeat(120), '/f'], { stdio: 'ignore' });
  const ref = safety.backupSettings().regFile;
  const same = safety.compareWithBackup(ref);
  check('settings check: equal right after the backup', same.equal, JSON.stringify(same));
  const prio = mods.prefsValueName('ModPriority.Local.SomeMod.someone.somemod');
  execFileSync('reg.exe', ['add', TEST_KEY, '/v', prio, '/t', 'REG_DWORD', '/d', '0', '/f'], { stdio: 'ignore' });
  execFileSync('reg.exe', ['add', TEST_KEY, '/v', 'Added_h1', '/t', 'REG_DWORD', '/d', '1', '/f'], { stdio: 'ignore' });
  const diff = safety.compareWithBackup(ref);
  check('settings check: a changed load order and an added value are caught', !diff.equal && diff.changed.includes(prio) && diff.extra.includes('Added_h1'), JSON.stringify(diff));
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => {
    try {
      execFileSync('reg.exe', ['delete', 'HKCU\\Software\\DGMProbeTest', '/f'], { stdio: 'ignore' });
    } catch {
      // not there
    }
    for (const pid of safety.gameProcessIds()) execFileSync('taskkill.exe', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {
      // a file still held
    }
    console.log(failures ? `${failures} FAILED` : 'all passed');
    process.exitCode = failures ? 1 : 0;
  });
void mapfile;
