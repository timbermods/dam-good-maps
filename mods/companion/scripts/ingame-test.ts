// The companion's in-game check, in the DGM Probe's isolated pattern (investigation/probe/README.md, "Safety"):
// the game's settings, logs, player data, saves and every other file under Documents\Timberborn are recorded
// before the launch and put back after it; the companion is installed into Documents\Timberborn\Mods for the
// run only and removed right after; every other mod is switched off for the run (and back); the maps the
// test plays live in a scratch folder and Kyler's Maps folder is never read or written.
//
//   node investigation/probe/run.cjs ../../mods/companion/scripts/ingame-test.ts [--variant named|custom|fresh] [--no-launch]
//
// It launches Timberborn, so run it only on the dedicated machine (D218) and only while no game is running.
// `npm --prefix investigation/probe ci` first. Results go to C:\dgm-companion-test\last\.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readTimber, writeTimber } from '../../../src/core/format/timber';
import { REGISTRY_KEY, STEAM_APP_ID, steamExe, timberbornDocs, gameVersion } from '../../../investigation/probe/runner/paths';
import { enabledKey, installedMods, prefsValueName } from '../../../investigation/probe/runner/mods';
import { gameProcessIds, hasPendingRestore, isGameRunning, leftovers, restore, takeSnapshot } from '../../../investigation/probe/runner/safety';

// (set after the imports: the probe's paths read it when a function runs, not when the module loads)
process.env.DGM_PROBE_HOME ??= 'C:\\dgm-companion-test';

const HOME = process.env.DGM_PROBE_HOME;
const MOD_ID = 'timbermods.dgmcompanion';
const MOD_FOLDER = 'DGMCompanion';
const root = resolve(__dirname, '..');
const repo = resolve(root, '..', '..');
const argv = process.argv.slice(2);
const opt = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const variant = opt('variant', 'named');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (s: string) => console.log(`[companion test] ${s}`);

const TEST = join(HOME, 'run');
const OUT = join(HOME, 'last');
const SECONDS = 360;

/** What the test seeds into the companion's settings, and what it expects the click to start. */
const VARIANTS: Record<string, { settings: unknown | null; expectFaction?: string; expectMode?: string }> = {
  named: { settings: { faction: 'IronTeeth', mode: 'Hard' }, expectFaction: 'IronTeeth', expectMode: 'Hard' },
  custom: {
    settings: { faction: 'Folktails', mode: null, customMode: { StartingAdults: 5, StartingChildren: 1, StartingFood: 40, StartingWater: 30, 'DroughtDuration.Min': 2, 'DroughtDuration.Max': 4 } },
    expectFaction: 'Folktails',
    expectMode: 'custom',
  },
  fresh: { settings: null },
};

function makeMaps(): void {
  rmSync(TEST, { recursive: true, force: true });
  mkdirSync(join(TEST, 'maps'), { recursive: true });
  mkdirSync(join(TEST, 'home'), { recursive: true });
  const gen = join(HOME, 'gen');
  mkdirSync(gen, { recursive: true });
  if (!existsSync(join(gen, '96', 'dgm-river-valley-1.timber')) || !existsSync(join(gen, '96', 'dgm-river-valley-2.timber')))
    execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'tools', 'gen.ts'), '--seeds', '1-2', '--sizes', '96', '--out', gen, '--quiet'], { stdio: 'inherit', cwd: repo });
  const now = Date.now();
  const put = (name: string, bytes: Uint8Array | Buffer, ageDays: number) => {
    const f = join(TEST, 'maps', name);
    writeFileSync(f, bytes);
    const t = new Date(now - ageDays * 86400000);
    utimesSync(f, t, t);
  };
  // two maps from the generator: the older one, then the one the entry must offer
  put('dgm-river-valley-1.timber', readFileSync(join(gen, '96', 'dgm-river-valley-1.timber')), 3);
  put('dgm-river-valley-2.timber', readFileSync(join(gen, '96', 'dgm-river-valley-2.timber')), 1);
  // newer than both, but not from Dam Good Maps (the description and the name say otherwise)
  const other = readTimber(new Uint8Array(readFileSync(join(gen, '96', 'dgm-river-valley-1.timber'))));
  other.metadata = { ...other.metadata!, MapDescription: 'A map from somewhere else.' };
  put('Somewhere Else.timber', writeTimber(other), 0.5);
  // a file the game cannot read, newest of all
  put('dgm-broken.timber', Buffer.from('not a zip'), 0);
  const v = VARIANTS[variant];
  if (!v) throw new Error(`unknown variant ${variant}`);
  if (v.settings) writeFileSync(join(TEST, 'home', 'settings.json'), JSON.stringify(v.settings, null, 2));
}

function onlyCompanion(): void {
  let on = 0;
  for (const m of installedMods()) {
    const isOurs = m.source === 'Local' && m.folder === MOD_FOLDER && m.id === MOD_ID;
    execFileSync('reg.exe', ['add', REGISTRY_KEY, '/v', prefsValueName(enabledKey(m)), '/t', 'REG_DWORD', '/d', isOurs ? '1' : '0', '/f'], { stdio: 'ignore' });
    if (isOurs) on++;
  }
  if (!on) throw new Error('The companion is not installed where the game looks.');
}

async function main(): Promise<number> {
  if (hasPendingRestore()) throw new Error(`An earlier test run was not restored: run the restore first (marker in ${HOME}\\runner\\backup).`);
  if (isGameRunning()) throw new Error('Timberborn is running: nothing was launched.');
  log(`game ${gameVersion()}, variant ${variant}`);
  mkdirSync(HOME, { recursive: true });
  execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' });
  makeMaps();
  if (argv.includes('--no-launch')) return log('maps and mod built; nothing launched'), 0;

  const snap = takeSnapshot();
  const installed = join(timberbornDocs(), 'Mods', MOD_FOLDER);
  let result: { passed: boolean; failures: string[]; facts: Record<string, string> } | null = null;
  let outcome = 'did not start';
  try {
    rmSync(installed, { recursive: true, force: true });
    cpSync(join(root, 'dist', 'DGMCompanion'), installed, { recursive: true });
    onlyCompanion();
    const args = ['-applaunch', STEAM_APP_ID, '-skipModManager', '-dgmcompanionTest', TEST];
    log(`launching: steam ${args.join(' ')}`);
    spawn(steamExe(), args, { detached: true, stdio: 'ignore' }).unref();
    const started = Date.now();
    let seen = false;
    for (;;) {
      await sleep(2000);
      const running = isGameRunning();
      if (running) seen = true;
      if (existsSync(join(TEST, 'result.json'))) {
        outcome = 'finished';
        // the test quits the game itself; give it a moment before the cleanup
        for (let k = 0; k < 15 && isGameRunning(); k++) await sleep(2000);
        break;
      }
      const since = (Date.now() - started) / 1000;
      if (seen && !running) {
        outcome = 'the game exited before the test finished';
        break;
      }
      if (!seen && since > 90) {
        outcome = 'the game did not start';
        break;
      }
      if (since > SECONDS) {
        outcome = `no result after ${SECONDS} s`;
        break;
      }
    }
  } finally {
    for (const pid of gameProcessIds()) {
      try {
        execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
        log(`killed Timberborn (pid ${pid})`);
      } catch {
        // already gone
      }
    }
    for (let k = 0; k < 10 && isGameRunning(); k++) await sleep(1000);
    rmSync(installed, { recursive: true, force: true });
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    const report = restore(join(OUT, 'restored'));
    log(`restored: ${JSON.stringify(report)}`);
    const left = leftovers(snap);
    log(left.length ? `LEFTOVERS under Documents\\Timberborn: ${left.join(', ')}` : 'nothing left behind under Documents\\Timberborn');
    if (left.length) process.exitCode = 6;
  }
  for (const f of ['events.log', 'result.json', 'menu-tree.txt', 'menu.png']) if (existsSync(join(TEST, f))) copyFileSync(join(TEST, f), join(OUT, f));
  if (existsSync(join(TEST, 'home', 'settings.json'))) copyFileSync(join(TEST, 'home', 'settings.json'), join(OUT, 'settings-after.json'));
  if (existsSync(join(OUT, 'restored', 'Player.log'))) {
    const p = readFileSync(join(OUT, 'restored', 'Player.log'), 'utf8').split(/\r?\n/).filter((l) => /DGMCompanion|Exception|\[DGMCompanion\]/.test(l));
    writeFileSync(join(OUT, 'player-log-lines.txt'), p.join('\n'));
  }
  if (existsSync(join(TEST, 'result.json'))) result = JSON.parse(readFileSync(join(TEST, 'result.json'), 'utf8'));
  log(`outcome: ${outcome}`);
  if (!result) return 1;
  const v = VARIANTS[variant];
  const problems = [...result.failures];
  if (v.expectMode && result.facts.startedMode !== v.expectMode) problems.push(`started mode ${result.facts.startedMode}, expected ${v.expectMode}`);
  if (v.expectFaction && result.facts.startedFaction !== v.expectFaction) problems.push(`started faction ${result.facts.startedFaction}, expected ${v.expectFaction} (locked? ${result.facts.options})`);
  if (!/dgm-river-valley-2/.test(result.facts.startedMap ?? '')) problems.push(`started map ${result.facts.startedMap}, expected dgm-river-valley-2`);
  log(JSON.stringify(result.facts, null, 1));
  log(problems.length ? `FAILED: ${problems.join('; ')}` : 'PASSED');
  return problems.length ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = process.exitCode || code;
  },
  (e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  },
);
