// One command runs everything:
//   npm --prefix investigation/probe run batch -- [maps.timber ...] [--smoke] [--only id,id] [--group name]
//       [--confirmed-launch CODE] [--run-id ID] [--speed 99] [--no-wait]
//   npm --prefix investigation/probe run batch -- --compare-only RUN_ID
//   npm --prefix investigation/probe run batch -- --compare-only RUN_ID --compare-to NAME
//       (the run's results judged again, written to results\NAME and sheet\NAME.html; the run's own
//       folders untouched, and refused if this checkout builds other maps than the ones played)
//   npm --prefix investigation/probe run batch -- --restore-only
//   npm --prefix investigation/probe run batch -- --backup-settings   (a copy of the game's settings, kept by hand)
//   Steps, when the runner itself runs in a sandbox that cannot see the real settings:
//     --prepare-only (sandboxed) → --launch-only --reference <backup.reg> (outside the sandbox: launch and
//     restore, settings checked against the backup before and after) → --compare-only (sandboxed);
//     --verify-settings <backup.reg> reads the settings back (outside the sandbox).
// Without --confirmed-launch it only prints the plan (maps, checks, time, and that it launches Timberborn)
// and a one-time code; Kyler's yes is needed for every launch (runner/consent.ts).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildMod } from './build-mod';
import { catalog, type GameDef, gameIdsFor } from './catalog';
import { evaluate, type GameVerdicts, Loaded } from './compare';
import { askInTerminal, consumeConsent, describe, requestConsent } from './consent';
import type { MapResult } from './job';
import { makeJob, prepare, type Prepared, summary } from './jobs';
import { type LaunchLog, resultsDir, runJob } from './launch';
import { runModel, type ModelRun } from './model';
import { prefsValueName, probeOnly } from './mods';
import { CACHE, CHECKED_GAME_VERSION, gameVersion, isEntry, modInstallDir, probePaths, REGISTRY_KEY } from './paths';
import { waitQuiet } from './quiet';
import { backupSettings, compareWithBackup, handRestore, hasPendingRestore, isGameRunning, leftovers, marker, parseRegFile, registryValues, restore, type SettingsDiff, takeSnapshot } from './safety';
import { writeSheet } from './sheet';
import { writeSummary } from './summary';
import { groupsToWrite, writeGroups, writtenForPlan } from './writers';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

interface Plan {
  runId: string;
  kind: 'smoke' | 'batch';
  extraMaps: string[];
  gameIds: string[];
  speed: number;
  smokeDays?: number;
  /** Play with the installed mods (Kyler, 2026-09-25): no settings are changed or restored. */
  keepMods?: boolean;
  /** The maps the runner wrote for this plan with their groups' writers (writers.ts). */
  written?: ReturnType<typeof writtenForPlan>;
}

function selectGames(plan: Plan): GameDef[] {
  const all = catalog(plan.extraMaps);
  let games = plan.gameIds.length ? all.filter((g) => plan.gameIds.includes(g.id)) : all;
  if (plan.smokeDays) games = games.map((g) => ({ ...g, days: Math.min(g.days, plan.smokeDays!) }));
  return games;
}

function newRunId(kind: string): string {
  return `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})/, '$1-$2')}-${kind}`;
}

function planFromArgs(): Plan {
  const valued = new Set(['--only', '--group', '--confirmed-launch', '--run-id', '--speed', '--compare-only', '--compare-to', '--days']);
  // npm --prefix runs the script in investigation/probe; paths are meant from where the command was typed
  const extraMaps = argv.filter((a, i) => a.toLowerCase().endsWith('.timber') && !valued.has(argv[i - 1])).map((a) => resolve(process.env.INIT_CWD ?? process.cwd(), a));
  const smoke = flag('smoke');
  // (a named group or list that matches nothing refuses: never the whole catalog in its place)
  const valueOf = (n: string) => (argv.includes(`--${n}`) ? ((v) => (v === undefined || v.startsWith('--') ? '' : v))(opt(n)) : undefined);
  // a group made outside the repository gets its maps written first, by its own writer: never a stale map planned
  const written = writeGroups(groupsToWrite(valueOf('only'), valueOf('group')), log);
  const all = catalog(extraMaps);
  let ids = gameIdsFor(all, valueOf('only'), valueOf('group'));
  if (smoke && !ids.length) ids = ['m8-preview'];
  if (smoke) ids = ids.slice(0, 1);
  return { runId: opt('run-id') ?? newRunId(smoke ? 'smoke' : 'batch'), kind: smoke ? 'smoke' : 'batch', extraMaps, gameIds: ids, speed: Number(opt('speed') ?? 99), smokeDays: smoke ? Number(opt('days') ?? 1) : undefined, keepMods: flag('keep-mods'), ...(written.length ? { written: writtenForPlan(written) } : {}) };
}

/**
 * The launch and the restore: the only step that must see the real game settings (run it outside any
 * sandbox). `reference` is Kyler's settings backup: the launch happens only if the settings equal it now,
 * and after the restore they must equal it again, value by value, mod load order included.
 */
async function launch(plan: Plan, prepared: Prepared[], reference: string, build: boolean): Promise<boolean> {
  const keepMods = !!plan.keepMods;
  const p = probePaths();
  const dir = resultsDir(plan.runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  if (!existsSync(reference)) throw new Error(`The settings backup ${reference} does not exist: nothing was launched.`);
  log(`settings backup found: ${reference}`);
  const before = keepMods ? null : compareWithBackup(reference);
  if (before) writeFileSync(join(dir, 'settings-check-before.json'), JSON.stringify(before, null, 1));
  if (keepMods) log("with the installed mods: this step neither changes nor restores the game's settings; they are checked from outside it");
  else if (!before!.equal) {
    log(`The game's settings differ from the backup before the launch: ${describeDiff(before!)}`);
    for (const l of handRestore(reference)) log(l);
    throw new Error('Nothing was launched: the settings do not match the backup.');
  }
  else log('the settings match the backup exactly (mod load order included)');
  if (build) {
    log('building and installing DGM Probe');
    buildMod(true);
  } else if (!existsSync(join(modInstallDir(), 'version-1.1', 'Scripts', 'DGMProbe.dll'))) throw new Error('DGM Probe is not installed: run the prepare step first.');
  const snap = takeSnapshot();
  let viewIsGames = true;
  log(`recorded the game's settings, logs and saves (${Object.keys(snap.saves).length} save files)`);
  let restored = false;
  const doRestore = () => {
    if (restored) return;
    restored = true;
    const r = restore(join(dir, 'game-files'), { registry: !keepMods });
    writeFileSync(join(dir, 'restore.json'), JSON.stringify(r, null, 1));
    log(`restored: registry ${r.registryRestored ? `put back (${r.registryChanged.length} values had changed)` : 'unchanged'}; logs ${r.logsRestored.join(', ') || '-'}; player data ${r.playerDataRestored.join(', ') || 'unchanged'}; saves deleted ${r.savesDeleted.length}, saves changed ${r.savesChanged.length}; other new files and folders moved out ${r.docsMoved.length}; changed files put back ${r.docsRestored.join(', ') || 'none'}; changed and left (Steam's own, or too large to copy) ${r.docsChanged.join(', ') || 'none'}`);
  };
  const onSignal = () => {
    log('interrupted: stopping the game and restoring');
    try {
      if (isGameRunning()) execFileSync('taskkill.exe', ['/IM', 'Timberborn.exe', '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // already gone
    }
    setTimeout(() => {
      doRestore();
      process.exit(130);
    }, 4000);
  };
  process.once('SIGINT', onSignal);
  try {
    if (!keepMods) {
      const mods = probeOnly();
      log(`mods for the run: on ${mods.on.join(', ')}; off ${mods.off.length}`);
    }
    const job = makeJob(plan.runId, prepared, plan.speed);
    // a large map loads for longer without a heartbeat (the scene loads in one go): 240 s at 256², more above it
    const largest = Math.max(...prepared.map((x) => x.info.W * x.info.H));
    const launches = await runJob(job, { hangSeconds: Math.max(240, Math.round((240 * largest) / (256 * 256))), startSeconds: 300, mapSeconds: Math.max(...job.maps.map((m) => m.timeoutSeconds)) + 300, maxLaunches: Math.max(3, Math.ceil(prepared.length / 3) + 2), log });
    writeFileSync(join(dir, 'launches.json'), JSON.stringify(launches, null, 1));
    const others = [...new Set(launches.flatMap((l) => l.otherMods ?? []))];
    if (keepMods) log(`run with the installed mods: ${others.join(', ') || 'none besides DGM Probe'}`);
    else if (others.length) {
      // The game saw none of the runner's settings changes, so the restore below cannot reach them either
      // (for example when the runner runs in a sandbox with its own view of the registry).
      copyFileSync(snap.registryFile, join(dir, 'settings-before-the-run.reg'));
      log(`WARNING: other mods loaded (${others.join(', ')}): this was not a clean run, and the game did not see the runner's settings changes.`);
      log('Put the settings back by hand from outside the runner (close Timberborn first):');
      log(`  reg delete "${REGISTRY_KEY}" /f`);
      log(`  reg import "${join(dir, 'settings-before-the-run.reg')}"`);
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    // the restore waits for the game to be gone
    for (let i = 0; i < 30 && isGameRunning(); i++) await new Promise((r) => setTimeout(r, 1000));
    // Unity counts every launch in the settings. If this process does not see the count move, it is not
    // looking at the game's settings (a sandbox with its own copy of the registry, as on 2026-09-25): its
    // mod switches never reached the game, and neither its restore nor its checks can be trusted.
    const count = prefsValueName('unity.player_session_count');
    viewIsGames = keepMods || registryValues()[count] !== snap.registryValues[count];
    if (!viewIsGames) {
      writeFileSync(join(dir, 'settings-view-not-the-games.txt'), `The launch count ${count} did not change in this process's view of the registry.\n`);
      log("STOP: this process does not see the game's settings (the launch count did not move), so its mod switches did not reach the game and its restore cannot reach your settings.");
      for (const l of handRestore(reference)) log(l);
      restored = true; // nothing it restores would be real
      rmSync(marker(), { force: true });
    }
    doRestore();
    if (existsSync(p.job)) rmSync(p.job);
    // DGM Probe leaves the Mods folder after each run, so the player's own game never loads it
    rmSync(modInstallDir(), { recursive: true, force: true });
    log('DGM Probe removed from the Mods folder');
    // nothing the run created may stay in Kyler's Timberborn folder
    const left = leftovers(snap);
    writeFileSync(join(dir, 'leftovers.json'), JSON.stringify(left, null, 1));
    if (left.length) {
      log(`STOP: the run left ${left.length} new files or folders in Documents\\Timberborn: ${left.slice(0, 10).join(', ')}`);
      process.exitCode = 6;
    } else log('Documents\\Timberborn: nothing new left behind');
  }
  if (!viewIsGames) return false;
  if (keepMods) return true;
  const after = compareWithBackup(reference);
  writeFileSync(join(dir, 'settings-check-after.json'), JSON.stringify(after, null, 1));
  if (!after.equal) {
    log(`STOP: after the restore the game's settings differ from the backup: ${describeDiff(after)}`);
    for (const l of handRestore(reference)) log(l);
    return false;
  }
  log('after the restore the settings match the backup exactly (mod load order included)');
  return true;
}

function describeDiff(d: SettingsDiff): string {
  const clip = (a: string[]) => a.slice(0, 12).join(', ') + (a.length > 12 ? ` and ${a.length - 12} more` : '');
  return [d.missing.length ? `missing ${d.missing.length}: ${clip(d.missing)}` : '', d.extra.length ? `added ${d.extra.length}: ${clip(d.extra)}` : '', d.changed.length ? `changed ${d.changed.length}: ${clip(d.changed)}` : ''].filter(Boolean).join('; ');
}

/** Judges a run's results. With `compareTo`, the verdicts, summary and contact sheet go to that name's
 *  own folders (results\NAME, sheet\NAME.html) and the run's folders stay as they are; the maps are
 *  built into maps\NAME and must be the maps the run played, byte for byte, or nothing is judged. */
export function compareRun(plan: Plan, compareTo?: string): { verdicts: GameVerdicts[]; sheet: string } {
  const dir = resultsDir(plan.runId);
  const outDir = compareTo ? resultsDir(compareTo) : dir;
  if (compareTo && resolve(outDir) === resolve(dir)) throw new Error('--compare-to names the run itself');
  const games = selectGames(plan);
  const prepared = prepare(games, compareTo ?? plan.runId);
  if (compareTo) {
    const differ: string[] = [];
    for (const p of prepared) {
      const played = join(probePaths().maps, plan.runId, `${p.game.id}.timber`);
      if (!existsSync(played)) continue;
      if (!readFileSync(played).equals(readFileSync(p.map.mapFile))) differ.push(p.game.id);
      else p.map.mapFile = played;
    }
    if (differ.length) throw new Error(`this checkout builds other maps than run ${plan.runId} played (${differ.join(', ')}): compare at the commit that built them`);
    mkdirSync(outDir, { recursive: true });
  }
  const loaded = new Map<string, Loaded>();
  for (const p of prepared) {
    const f = join(dir, `${p.game.id}.json`);
    const r = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as MapResult) : null;
    loaded.set(p.game.id, new Loaded(dir, p, r));
  }
  const launchesFile = join(dir, 'launches.json');
  const otherMods = existsSync(launchesFile) ? [...new Set((JSON.parse(readFileSync(launchesFile, 'utf8')) as LaunchLog[]).flatMap((l) => l.otherMods ?? []))] : [];
  const verdicts: GameVerdicts[] = [];
  const models: Record<string, { cpuSeconds: number; momentum?: string; error?: string }> = {};
  for (const p of prepared) {
    const L = loaded.get(p.game.id)!;
    let model: ModelRun | null = null, modelError: string | null = null;
    if (p.game.model && L.result?.status === 'done') {
      try {
        const sampleDays = L.samples().map((s) => s.day);
        const mapDays = p.map.moments.filter((m) => m.snapshot).map((m) => m.day);
        model = runModel(new Uint8Array(readFileSync(p.map.mapFile)), `${p.game.id}.timber`, p.game.cycles, p.map.endDay, p.map.tiles, sampleDays, mapDays);
        models[p.game.id] = { cpuSeconds: model.cpuSeconds, momentum: model.momentum };
      } catch (e) {
        modelError = (e as Error).message;
        models[p.game.id] = { cpuSeconds: 0, error: modelError };
      }
    }
    const checks = evaluate({ L, others: loaded, model, modelError, otherMods: plan.keepMods ? [] : otherMods, installedMods: plan.keepMods ? otherMods : [] }, p.checks);
    verdicts.push({ game: p.game.id, title: p.game.title, group: p.game.group, status: L.result?.status ?? 'no result', checks });
    log(`${p.game.id}: ${checks.map((c) => `${c.id} ${c.verdict}`).join(', ')}`);
  }
  const title = compareTo ? `${plan.runId}, judged again as ${compareTo}` : plan.runId;
  writeFileSync(join(outDir, 'verdicts.json'), JSON.stringify({ runId: plan.runId, ...(compareTo ? { comparedAs: compareTo } : {}), models, verdicts }, null, 1));
  writeSummary(join(outDir, 'summary.md'), title, prepared, loaded, verdicts, otherMods, !!plan.keepMods);
  const sheet = writeSheet(probePaths().sheet, compareTo ?? plan.runId, probePaths().shots, prepared.filter((p) => loaded.get(p.game.id)?.result).map((p) => ({
    result: loaded.get(p.game.id)!.result!,
    poses: p.map.poses,
    verdicts: verdicts.find((v) => v.game === p.game.id)!.checks.map((c) => ({ id: c.id, verdict: c.verdict, detail: c.detail })),
  })));
  log(`verdicts: ${join(outDir, 'verdicts.json')}; summary: ${join(outDir, 'summary.md')}; contact sheet: ${sheet}`);
  // the maps built only to be checked against the played ones
  if (compareTo) rmSync(join(probePaths().maps, compareTo), { recursive: true, force: true });
  return { verdicts, sheet };
}

async function main(): Promise<void> {
  if (flag('backup-settings')) {
    const b = backupSettings();
    console.log(`Saved the game's settings (every value of the registry key) and the mods' on/off list:`);
    console.log(`  ${b.regFile}`);
    console.log(`  ${b.modsFile}`);
    console.log('To put the settings back by hand: close Timberborn, then run in PowerShell:');
    console.log(`  reg delete "${REGISTRY_KEY}" /f`);
    console.log(`  reg import "${b.regFile}"`);
    console.log('(Double-clicking the .reg file also restores every saved value, but keeps any value added since.)');
    return;
  }
  if (flag('restore-only')) {
    if (!hasPendingRestore()) return log('nothing to restore');
    const r = restore(join(probePaths().runner, 'restored-' + Date.now()));
    return log(`restored: ${JSON.stringify(r)}`);
  }
  if (hasPendingRestore()) {
    if (isGameRunning()) throw new Error('A probe run was not restored and Timberborn is running: close the game, then run the batch with --restore-only.');
    log('an earlier run was not restored: restoring first');
    restore(join(probePaths().runner, 'restored-' + Date.now()));
  }
  const exported = opt('compare-settings');
  if (exported) {
    // two .reg files, value by value: an export of the real settings (taken outside this process) and the backup
    const reference = opt('reference');
    if (!reference) throw new Error('--compare-settings needs --reference <backup .reg>');
    const a = parseRegFile(reference), b = parseRegFile(exported);
    const missing = [...a.keys()].filter((k) => !b.has(k)), extra = [...b.keys()].filter((k) => !a.has(k));
    const changed = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k));
    // Unity's own count of launches and its session ids change at every launch of the game, whoever starts it
    const bookkeeping = (k: string) => /^unity(\.player_session(id|_count)|_connect\.(mega_)?session_id)_h\d+$/.test(k);
    const all = [...missing, ...extra, ...changed];
    const d: SettingsDiff = { equal: all.length === 0, missing, extra, changed };
    console.log(d.equal ? `The exported settings match ${reference} exactly (every value, mod load order included).` : `The exported settings differ from ${reference}: ${describeDiff(d)}`);
    for (const k of changed) console.log(`  ${k}: ${a.get(k)} → ${b.get(k)}${bookkeeping(k) ? "   (Unity's own launch bookkeeping)" : ''}`);
    // Kyler, 2026-09-25: Unity's four per-launch values may differ after a run; everything else must match.
    const accepted = !d.equal && all.every(bookkeeping);
    if (accepted) console.log("Only Unity's own per-launch values changed (accepted): every other setting, mod load order included, matches exactly.");
    else if (!d.equal) for (const l of handRestore(reference)) console.log(l);
    process.exitCode = d.equal || accepted ? 0 : 5;
    return;
  }
  const verify = opt('verify-settings');
  if (verify) {
    // read-only: the game's settings now against a backup, value by value
    const d = compareWithBackup(verify);
    console.log(d.equal ? `The game's settings match ${verify} exactly (every value, mod load order included).` : `The game's settings differ from ${verify}: ${describeDiff(d)}`);
    if (!d.equal) for (const l of handRestore(verify)) console.log(l);
    process.exitCode = d.equal ? 0 : 5;
    return;
  }
  const compareOnly = opt('compare-only');
  if (compareOnly) {
    const plan = JSON.parse(readFileSync(join(resultsDir(compareOnly), 'plan.json'), 'utf8')) as Plan;
    compareRun(plan, opt('compare-to'));
    return;
  }
  const launchOnly = flag('launch-only');
  const plan = launchOnly ? (JSON.parse(readFileSync(join(resultsDir(opt('run-id') ?? ''), 'plan.json'), 'utf8')) as Plan) : planFromArgs();
  const prepared = prepare(selectGames(plan), plan.runId);
  const s = summary(prepared, plan.kind, !!plan.keepMods, plan.written);
  if (flag('prepare-only')) {
    // everything before the launch that needs no real game settings: the maps, the plan and the mod
    mkdirSync(resultsDir(plan.runId), { recursive: true });
    writeFileSync(join(resultsDir(plan.runId), 'plan.json'), JSON.stringify(plan, null, 1));
    log('building and installing DGM Probe');
    buildMod(true);
    console.log(describe(s));
    console.log(`\nPrepared run ${plan.runId}. The launch step (outside any sandbox, after Kyler's yes): --launch-only --run-id ${plan.runId} --confirmed-launch <code> --reference <settings backup .reg>`);
    return;
  }
  if (flag('job-only')) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(join(CACHE, 'job-preview.json'), JSON.stringify(makeJob(plan.runId, prepared, plan.speed), null, 1));
    console.log(describe(s));
    return;
  }
  const code = opt('confirmed-launch');
  if (!code) {
    if (await askInTerminal(s)) {
      // a yes typed in this terminal is this run's consent
    } else {
      const fresh = requestConsent(s);
      console.log(describe(s));
      console.log(`\nNothing was launched. After Kyler's yes for exactly this run, repeat the command with --confirmed-launch ${fresh}${argv.includes('--run-id') ? '' : ` --run-id ${plan.runId}`}`);
      process.exitCode = 3;
      return;
    }
  } else if (!consumeConsent(s, code)) {
    throw new Error('The confirmation code does not match this plan (or was already used): run without --confirmed-launch to get a new one, and ask again.');
  }
  if (isGameRunning()) throw new Error('Timberborn is already running (Kyler may be playing): nothing was launched.');
  // The mod reads the game's internals as they are in the version it was checked against; after a game
  // update only a smoke run may go first.
  const version = gameVersion();
  if (version !== CHECKED_GAME_VERSION && plan.kind === 'batch' && !flag('allow-new-version'))
    throw new Error(`The game is ${version}, not ${CHECKED_GAME_VERSION}: run a smoke run first, then the batch with --allow-new-version.`);
  if (plan.kind === 'batch' && !flag('no-wait')) {
    const quiet = await waitQuiet(log);
    if (!quiet) throw new Error('The machine did not become quiet in time: nothing was launched.');
  }
  const reference = opt('reference');
  if (!reference) throw new Error('A launch needs --reference <settings backup .reg> (make one with --backup-settings): nothing was launched.');
  const settingsOk = await launch(plan, prepared, reference, !launchOnly);
  if (!settingsOk) process.exitCode = 4;
  // the comparisons need no real settings: after a --launch-only step they run on their own (--compare-only)
  if (!launchOnly) compareRun(plan);
}

if (isEntry(__filename))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
