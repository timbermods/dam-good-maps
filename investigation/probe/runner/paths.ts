// Where the probe reads and writes on this machine. Nothing here is committed: the game's folders, the
// probe's own folder C:\dgm-probe (Kyler's decision #54: outside his Timberborn folders), and the
// repository's own inputs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** The repository root (this file is investigation/probe/runner/paths.ts). */
export const REPO = resolve(__dirname, '..', '..', '..');
export const PROBE_DIR = resolve(__dirname, '..');
/** Ignored working files of the runner inside the repository (generated maps, model cache). */
export const CACHE = join(PROBE_DIR, '.cache');

let documents: string | null = null;
/** The Documents folder as Windows resolves it (it can be redirected, for example to OneDrive). */
export function documentsDir(): string {
  if (process.env.DGM_PROBE_DOCUMENTS) return process.env.DGM_PROBE_DOCUMENTS;
  if (documents) return documents;
  try {
    documents = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('MyDocuments')"], { encoding: 'utf8' }).trim();
  } catch {
    documents = '';
  }
  if (!documents) documents = join(homedir(), 'Documents');
  return documents;
}

export const STEAM_APP_ID = '1062090';
export const GAME_DIR = process.env.DGM_PROBE_GAME_DIR ?? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Timberborn';
export const GAME_EXE = 'Timberborn.exe';
/** The game's process name (tests use a stand-in). */
export const GAME_PROCESS = process.env.DGM_PROBE_GAME_PROCESS ?? 'Timberborn';
/** Unity's PlayerPrefs for the game: its settings, including which mods are enabled. */
export const REGISTRY_KEY = process.env.DGM_PROBE_REGISTRY_KEY ?? 'HKCU\\Software\\Mechanistry\\Timberborn';

export function timberbornDocs(): string {
  return join(documentsDir(), 'Timberborn');
}
/** Where the probe works (decisions-pending #54, decided by Kyler 2026-09-25): outside Documents\Timberborn. */
export const DEFAULT_PROBE_HOME = 'C:\\dgm-probe';
/** The probe's own folder: job, heartbeat, results, screenshots, the maps played and the runner's backups.
 *  The game is told it with -dgmprobeHome, so it must be a path without spaces. */
export function probeHome(): string {
  const home = resolve(process.env.DGM_PROBE_HOME ?? DEFAULT_PROBE_HOME);
  if (/\s/.test(home)) throw new Error(`The probe's folder ${home} has a space in it; the game's launch argument cannot carry it.`);
  const docs = timberbornDocs().toLowerCase();
  if (home.toLowerCase() === docs || home.toLowerCase().startsWith(docs + '\\')) throw new Error(`The probe's folder ${home} is inside ${timberbornDocs()}, which the probe never writes into.`);
  return home;
}
/** The tall maps tools/probe-tall.ts writes (PLAN §20 D172), with their manifest tall.json. */
export function tallDir(): string {
  return resolve(process.env.DGM_PROBE_TALL ?? join(DEFAULT_PROBE_HOME, 'tall'));
}
/** The ceiling maps tools/probe-ceiling.ts writes (PLAN §20 D244), with their manifest ceiling.json. */
export function ceilingDir(): string {
  return resolve(process.env.DGM_PROBE_CEILING ?? join(DEFAULT_PROBE_HOME, 'ceiling'));
}
/** The parity maps tools/probe-parity.ts writes (PLAN §20 D337, D338, D339), with their manifest parity.json. */
export function parityDir(): string {
  return resolve(process.env.DGM_PROBE_PARITY ?? join(DEFAULT_PROBE_HOME, 'parity'));
}
export const probePaths = () => {
  const home = probeHome();
  return {
    home,
    job: join(home, 'job.json'),
    heartbeat: join(home, 'heartbeat.json'),
    results: join(home, 'results'),
    shots: join(home, 'shots'),
    maps: join(home, 'maps'),
    runner: join(home, 'runner'),
    backup: join(home, 'runner', 'backup'),
    sheet: join(home, 'sheet'),
  };
};
/** The game loads user mods only from Documents\Timberborn\Mods (UserFolderModsProvider, whose folder is
 *  UserDataFolder.Folder: MyDocuments\Timberborn, with no launch argument to change it), so DGM Probe sits
 *  there during a run only: installed just before the launch and removed right after it. */
export function modInstallDir(): string {
  return join(timberbornDocs(), 'Mods', 'DGMProbe');
}
/** Unity writes Player.log here and moves the previous one to Player-prev.log at each launch. */
export function unityLogDir(): string {
  if (process.env.DGM_PROBE_UNITY_LOGS) return process.env.DGM_PROBE_UNITY_LOGS;
  return join(homedir(), 'AppData', 'LocalLow', 'Mechanistry', 'Timberborn');
}
export function steamExe(): string {
  try {
    const out = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamExe'], { encoding: 'utf8' });
    const m = /SteamExe\s+REG_SZ\s+(.+)/.exec(out);
    if (m) return m[1].trim().replace(/\//g, '\\');
  } catch {
    // fall through to the default install
  }
  return 'C:\\Program Files (x86)\\Steam\\steam.exe';
}

/** True when `file` is the entry point run.cjs was given (require.main is run.cjs itself there). */
export function isEntry(file: string): boolean {
  const arg = process.argv[1];
  return !!arg && resolve(PROBE_DIR, arg).toLowerCase() === resolve(file).toLowerCase();
}

/** The game version the mod was built and checked against. */
export const CHECKED_GAME_VERSION = '1.1.2.4-52e959e-sw';

export function gameVersion(): string {
  try {
    return readFileSync(join(GAME_DIR, 'Timberborn_Data', 'StreamingAssets', 'Version.txt'), 'utf8').trim();
  } catch {
    return 'unknown';
  }
}
