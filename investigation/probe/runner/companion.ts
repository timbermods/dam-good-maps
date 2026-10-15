// The companion mode (`batch -- --companion`): checks the companion mod (mods/companion) in the game, on the runner's
// safety (the settings, logs and saves recorded and put back, the leftovers check, DGM Probe and the companion
// installed for the run only, results in C:\dgm-probe\results\<run>\). One launch per variant of what the player
// had remembered; the runner drives the game while it runs.
//
// The game side is mods/companion/src/Game/InGameTest.cs, switched on by the launch argument
// `-dgmcompanionTest <folder>` (a normal launch never has it). The folder is <run>\companion\<variant>\, outside
// Documents\Timberborn, and stands in for the game's Maps folder (so the player's own maps are never read and a
// "no map" menu can be checked): its `maps\` holds what the entry reads, `home\` the companion's own settings.
// The test and the runner talk through files there: the test writes ask-N.json when it needs something done
// (`maps`: put the generated maps in; `resave`: save the map again as a -2 file) and waits for answer-N.json.
// The test writes result.json and quits the game; the runner reads it and judges.
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import { readTimber, writeTimber } from '../../../src/core/format/timber';
import type { ThemeId } from '../../../src/core/spec/mapspec';
import type { PlanSummary } from './consent';
import { generated } from './derived';
import { killGame, loadedMods, resultsDir } from './launch';
import { companionInstallDir, gameVersion, REPO, steamExe, STEAM_APP_ID, timberbornDocs, unityLogDir } from './paths';
import { isGameRunning } from './safety';

/** What the companion remembered before the launch, and what a click on the menu entry must then start with. */
export interface CompanionVariant {
  id: string;
  title: string;
  /** The companion's settings.json before the launch (null: none, a player who never started a game). */
  settings: unknown | null;
  expectFaction?: string;
  expectMode?: string;
}

export const COMPANION_VARIANTS: Record<string, CompanionVariant> = {
  named: { id: 'named', title: 'remembered Iron Teeth on Hard', settings: { faction: 'IronTeeth', mode: 'Hard' }, expectFaction: 'IronTeeth', expectMode: 'Hard' },
  custom: {
    id: 'custom',
    title: 'remembered Folktails on a customised difficulty',
    settings: { faction: 'Folktails', mode: null, customMode: { StartingAdults: 5, StartingChildren: 1, StartingFood: 40, StartingWater: 30, 'DroughtDuration.Min': 2, 'DroughtDuration.Max': 4 } },
    expectFaction: 'Folktails',
    expectMode: 'custom',
  },
  fresh: { id: 'fresh', title: 'nothing remembered', settings: null },
};

/** `--companion-variants named,custom,fresh` (or `all`); `named` alone by default. Unknown names refuse. */
export function variantsFrom(arg: string | undefined): CompanionVariant[] {
  const ids = !arg ? ['named'] : arg === 'all' ? Object.keys(COMPANION_VARIANTS) : arg.split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length) throw new Error('--companion-variants names no variant (named, custom, fresh, or all).');
  return ids.map((id) => {
    const v = COMPANION_VARIANTS[id];
    if (!v) throw new Error(`unknown companion variant ${id} (named, custom, fresh, or all)`);
    return v;
  });
}

/** The maps the test uses: ones the current generator makes (D483), named as the app names its files (D162, D345). */
export const NEWEST = { stem: 'dgm-river-valley-1', theme: 'riverValley' as ThemeId, seed: 1, size: 96, ageDays: 1, what: 'River Valley 96² seed 1' };
export const OLDER = { stem: 'dgm-lake-basin-3', theme: 'lakeBasin' as ThemeId, seed: 3, size: 96, ageDays: 3, what: 'Lake Basin 96² seed 3' };
/** The app saves the map again as a new file with the next free number (src/platform freeName). */
export const RESAVED = `${NEWEST.stem}-2`;
const LOOKALIKE = 'Somewhere Else';
const BROKEN = 'dgm-broken';

export interface CompanionFile {
  name: string;
  bytes: Uint8Array;
  /** Age at the moment it is written (0: now). */
  ageDays: number;
  size: [number, number];
  /** Put in the Maps folder with the folder (`first`), when the test asks for the maps (`maps`) or the save again (`resave`). */
  when: 'first' | 'maps' | 'resave';
}

let memo: CompanionFile[] | null = null;
/** Every file of the test, built once. The look-alike is a Dam Good Maps map with another name and description (so
 *  only the name and the description tell them apart), the broken file is a `dgm-` file the game cannot read. */
export function companionFiles(): CompanionFile[] {
  if (memo) return memo;
  const newest = generated(NEWEST.theme, NEWEST.seed, NEWEST.size);
  const older = generated(OLDER.theme, OLDER.seed, OLDER.size);
  const other = readTimber(newest);
  other.metadata = { ...other.metadata!, MapDescription: 'A map from somewhere else.' };
  delete (other.metadata as Record<string, unknown>).DamGoodMaps;
  const s: [number, number] = [NEWEST.size, NEWEST.size];
  memo = [
    { name: `${LOOKALIKE}.timber`, bytes: writeTimber(other), ageDays: 0.5, size: s, when: 'first' },
    { name: `${BROKEN}.timber`, bytes: Buffer.from('not a zip'), ageDays: 0, size: [0, 0], when: 'first' },
    { name: `${OLDER.stem}.timber`, bytes: older, ageDays: OLDER.ageDays, size: [OLDER.size, OLDER.size], when: 'maps' },
    { name: `${NEWEST.stem}.timber`, bytes: newest, ageDays: NEWEST.ageDays, size: s, when: 'maps' },
    { name: `${RESAVED}.timber`, bytes: newest, ageDays: 0, size: s, when: 'resave' },
  ];
  return memo;
}

export function variantDir(runId: string, variant: string): string {
  return join(resultsDir(runId), 'companion', variant);
}

const MINUTES_PER_LAUNCH = 6;

/** The plan the batch prints and the launch code covers: one line per launch, the maps written with their bytes. */
export function companionSummary(variants: CompanionVariant[], keepMods: boolean): PlanSummary {
  const files = companionFiles();
  const checks = [
    'menu: no entry with no Dam Good Maps map',
    'menu: entry present with maps',
    'click: the newest Dam Good Maps map, not a newer look-alike or broken dgm- file',
    'click: remembered faction and difficulty',
    'settlement name asked',
    'reload key: unchanged file',
    'reload key: a -2 re-save offered',
    'reload: new game on the -2 file, name asked again',
  ];
  return {
    kind: 'batch',
    keepMods,
    companion: true,
    estimateMinutes: variants.length * MINUTES_PER_LAUNCH + 2,
    maps: variants.map((v) => ({
      id: `companion-${v.id}`,
      title: `Companion mod in the game, ${v.title}; maps ${NEWEST.stem} (${NEWEST.what}), ${OLDER.stem} (${OLDER.what}), the re-save ${RESAVED}, a newer look-alike, a broken dgm- file`,
      checks,
      days: 0,
    })),
    written: [
      {
        group: 'Companion',
        dir: join(resultsDir('<run id>'), 'companion', '<variant>', 'maps'),
        files: files.map((f) => ({ file: f.name, size: f.size, bytes: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex'), status: 'written' as const })),
      },
    ],
  };
}

const companionProject = () => join(REPO, 'mods', 'companion');

/** Builds the companion against the local game and installs it into Documents\Timberborn\Mods for the run. */
export function installCompanion(): string {
  const build = join(companionProject(), 'scripts', 'build.mjs');
  if (!existsSync(build)) throw new Error('mods/companion is not in this checkout: the companion mode needs the companion mod (PR #431).');
  if (isGameRunning()) throw new Error('Timberborn is running: the companion is installed only while the game is closed.');
  const target = companionInstallDir();
  // (a copy of the player's own would be deleted with ours: never touch one)
  if (existsSync(target) && !existsSync(join(target, '.dgm-probe-installed'))) throw new Error(`${target} is already there and was not put there by the probe: nothing was installed, nothing was launched.`);
  execFileSync(process.execPath, [build], { stdio: 'inherit' });
  rmSync(target, { recursive: true, force: true });
  cpSync(join(companionProject(), 'dist', 'DGMCompanion'), target, { recursive: true });
  writeFileSync(join(target, '.dgm-probe-installed'), 'installed by the DGM Probe runner for one run; removed after it\n');
  return target;
}

export function companionInstalled(): boolean {
  return existsSync(join(companionInstallDir(), 'version-1.1', 'Scripts', 'DGMCompanion.dll'));
}

export function removeCompanion(): void {
  rmSync(companionInstallDir(), { recursive: true, force: true });
}

/** Writes a file with the age it should have. */
function put(dir: string, f: CompanionFile): void {
  const file = join(dir, f.name);
  writeFileSync(file, f.bytes);
  const t = new Date(Date.now() - f.ageDays * 86400000);
  utimesSync(file, t, t);
}

function setup(runId: string, v: CompanionVariant): string {
  const dir = variantDir(runId, v.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'maps'), { recursive: true });
  mkdirSync(join(dir, 'home'), { recursive: true });
  for (const f of companionFiles()) if (f.when === 'first') put(join(dir, 'maps'), f);
  if (v.settings) writeFileSync(join(dir, 'home', 'settings.json'), JSON.stringify(v.settings, null, 2));
  return dir;
}

/** The test's request `what`, done; the answer tells the test what to expect. */
function answerFor(dir: string, what: string): Record<string, unknown> {
  if (what === 'maps') {
    for (const f of companionFiles()) if (f.when === 'maps') put(join(dir, 'maps'), f);
    return { newest: NEWEST.stem, files: readdirSync(join(dir, 'maps')) };
  }
  if (what === 'resave') {
    for (const f of companionFiles()) if (f.when === 'resave') put(join(dir, 'maps'), f);
    return { resaved: RESAVED };
  }
  return { error: `the runner does not know the request ${what}` };
}

/** Answers the requests the test has made and the runner has not yet answered (`done` holds the numbers answered). */
function serve(dir: string, done: Set<number>, log: (s: string) => void): void {
  for (const name of readdirSync(dir)) {
    const m = /^ask-(\d+)\.json$/.exec(name);
    if (!m || done.has(Number(m[1]))) continue;
    let ask: { what?: string };
    try {
      ask = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch {
      continue; // (written whole and renamed, so this is not expected; look again next time)
    }
    const n = Number(m[1]);
    const answer = answerFor(dir, String(ask.what));
    const tmp = join(dir, `answer-${n}.json.tmp`);
    writeFileSync(tmp, JSON.stringify(answer));
    renameSync(tmp, join(dir, `answer-${n}.json`));
    done.add(n);
    log(`companion test asked for ${ask.what}: ${JSON.stringify(answer)}`);
  }
}

export interface CompanionLaunch {
  variant: string;
  startedAt: string;
  endedAt: string;
  outcome: 'finished' | 'exited' | 'timeout' | 'no-start';
  note: string;
  loadedMods: string[];
  otherMods: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CompanionWatch {
  /** Seconds from the launch to the game appearing. */
  startSeconds: number;
  /** Seconds a launch may take altogether. */
  launchSeconds: number;
  log: (s: string) => void;
}

/** The launch arguments: the mods the player has on, no mod manager, and the test folder. */
export function companionLaunchArgs(dir: string): string[] {
  return ['-skipModManager', '-dgmcompanionTest', dir];
}

/** Launches the game once per variant and drives it until it has written its result (or the time is up). */
export async function runCompanion(runId: string, variants: CompanionVariant[], o: CompanionWatch): Promise<CompanionLaunch[]> {
  const out: CompanionLaunch[] = [];
  for (const v of variants) {
    if (isGameRunning()) throw new Error('Timberborn is already running; the probe never launches a second copy.');
    const dir = setup(runId, v);
    const [cmd, ...args] = process.env.DGM_PROBE_LAUNCH ? [...(JSON.parse(process.env.DGM_PROBE_LAUNCH) as string[]), ...companionLaunchArgs(dir)] : [steamExe(), '-applaunch', STEAM_APP_ID, ...companionLaunchArgs(dir)];
    o.log(`companion launch (${v.id}): ${args.join(' ')}`);
    const started = Date.now();
    const entry: CompanionLaunch = { variant: v.id, startedAt: new Date().toISOString(), endedAt: '', outcome: 'exited', note: '', loadedMods: [], otherMods: [] };
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    const done = new Set<number>();
    let seen = false;
    for (;;) {
      await sleep(1000);
      const running = isGameRunning();
      if (running) seen = true;
      serve(dir, done, o.log);
      if (existsSync(join(dir, 'result.json'))) {
        entry.outcome = 'finished';
        // the test quits the game itself; give it a moment
        for (let k = 0; k < 30 && isGameRunning(); k++) await sleep(1000);
        break;
      }
      const since = (Date.now() - started) / 1000;
      if (seen && !running) {
        entry.note = 'the game exited before the test finished';
        break;
      }
      if (!seen && since > o.startSeconds) {
        entry.outcome = 'no-start';
        entry.note = 'the game did not start';
        break;
      }
      if (since > o.launchSeconds) {
        entry.outcome = 'timeout';
        entry.note = `no result after ${o.launchSeconds} s`;
        break;
      }
    }
    if (isGameRunning()) {
      killGame(o.log);
      await sleep(3000);
    }
    entry.endedAt = new Date().toISOString();
    const unityLog = join(unityLogDir(), 'Player.log');
    if (existsSync(unityLog) && statSync(unityLog).mtimeMs >= started - 5000) {
      const kept = join(dir, 'Player.log');
      copyFileSync(unityLog, kept);
      entry.loadedMods = loadedMods(readFileSync(kept, 'utf8'));
      entry.otherMods = entry.loadedMods.filter((m) => !/^DGM Probe\b/.test(m) && !/^Dam Good Maps Companion\b/.test(m));
      writeFileSync(join(dir, 'player-log-lines.txt'), readFileSync(kept, 'utf8').split(/\r?\n/).filter((l) => /DGMCompanion|Exception/.test(l)).join('\n'));
    }
    o.log(`companion launch (${v.id}) ${entry.outcome}${entry.note ? ': ' + entry.note : ''}`);
    out.push(entry);
    if (entry.outcome === 'no-start') break;
  }
  return out;
}

export interface CompanionVerdict {
  variant: string;
  title: string;
  outcome: string;
  passed: boolean;
  problems: string[];
  facts: Record<string, string>;
  loadedMods: string[];
  otherMods: string[];
}

interface TestResult {
  passed: boolean;
  failures: string[];
  facts: Record<string, string>;
}

/** Judges the results the game wrote (the test's own failures, then what only the runner knows: the folder, the map
 *  that was started, the faction and difficulty it was started with, the file the reload used, the settings written). */
export function judgeCompanion(runId: string, variants: CompanionVariant[], launches: CompanionLaunch[]): { passed: boolean; verdicts: CompanionVerdict[] } {
  const verdicts = variants.map((v): CompanionVerdict => {
    const dir = variantDir(runId, v.id);
    const launch = launches.find((l) => l.variant === v.id);
    const file = join(dir, 'result.json');
    const result: TestResult | null = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as TestResult) : null;
    const problems: string[] = [];
    const facts = result?.facts ?? {};
    if (!launch) problems.push('this variant was not launched');
    else if (launch.outcome !== 'finished') problems.push(`the game ${launch.outcome === 'no-start' ? 'did not start' : launch.outcome === 'timeout' ? 'did not finish in time' : 'stopped early'}${launch.note ? ` (${launch.note})` : ''}`);
    if (launch && !launch.loadedMods.some((m) => /^Dam Good Maps Companion\b/.test(m))) problems.push(`the game did not list the companion among its loaded mods (${launch.loadedMods.join(', ') || 'none listed'})`);
    if (!result) problems.push('the test wrote no result.json');
    else {
      problems.push(...result.failures);
      const docsMaps = join(timberbornDocs(), 'Maps');
      if ((facts.userMapsDirectory ?? '').toLowerCase().replace(/\//g, '\\') !== docsMaps.toLowerCase()) problems.push(`the game's own Maps folder is ${facts.userMapsDirectory}, not ${docsMaps}`);
      if (basename(facts.startedMap ?? '') !== `${NEWEST.stem}.timber`) problems.push(`the click started ${facts.startedMap}, expected ${NEWEST.stem}.timber`);
      if (v.expectMode && facts.startedMode !== v.expectMode) problems.push(`started mode ${facts.startedMode}, expected ${v.expectMode}`);
      if (v.expectFaction && facts.startedFaction !== v.expectFaction) problems.push(`started faction ${facts.startedFaction}, expected ${v.expectFaction} (the game offers ${facts.options})`);
      if (basename(facts['game2.map'] ?? '') !== `${RESAVED}.timber`) problems.push(`the reload started ${facts['game2.map']}, expected ${RESAVED}.timber`);
      const after = join(dir, 'home', 'settings.json');
      if (!existsSync(after)) problems.push('the companion remembered nothing after the new game');
      else {
        const s = JSON.parse(readFileSync(after, 'utf8')) as { faction?: string };
        if (s.faction !== facts['game1.faction']) problems.push(`the companion remembered faction ${s.faction}, the game was ${facts['game1.faction']}`);
      }
    }
    return { variant: v.id, title: v.title, outcome: launch?.outcome ?? 'not launched', passed: problems.length === 0, problems, facts, loadedMods: launch?.loadedMods ?? [], otherMods: launch?.otherMods ?? [] };
  });
  return { passed: verdicts.every((x) => x.passed), verdicts };
}

/** Writes `companion.json` and `summary.md` in the run's folder and returns the lines to print. */
export function writeCompanionReport(runId: string, variants: CompanionVariant[], launches: CompanionLaunch[], keepMods: boolean): { passed: boolean; lines: string[] } {
  const { passed, verdicts } = judgeCompanion(runId, variants, launches);
  const dir = resultsDir(runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'companion.json'), JSON.stringify({ runId, gameVersion: gameVersion(), passed, verdicts }, null, 1));
  const lines: string[] = [];
  for (const v of verdicts) {
    lines.push(`${v.variant} (${v.title}): ${v.passed ? 'PASSED' : 'FAILED'}`);
    for (const p of v.problems) lines.push(`  - ${p}`);
    if (!keepMods && v.otherMods.length) lines.push(`  - other mods loaded: ${v.otherMods.join(', ')} (not a clean run)`);
  }
  writeFileSync(join(dir, 'summary.md'), [`# Companion check ${runId}`, '', `Game ${gameVersion()}. ${passed ? 'All passed.' : 'Failed.'}`, '', ...lines.map((l) => (l.startsWith('  - ') ? l : `- ${l}`)), '', 'Each variant folder holds events.log, result.json, menu-tree.txt, menu.png and the game log.', ''].join('\n'));
  return { passed, lines };
}
