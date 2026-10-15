// Launching Timberborn through Steam with the probe's argument, watching the heartbeat, and killing and
// relaunching the game when it hangs or crashes, until every map of the job has a result.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Job, MapResult } from './job';
import { probeHome, probePaths, STEAM_APP_ID, steamExe, unityLogDir } from './paths';
import { gameProcessIds, isGameRunning } from './safety';

/**
 * The game's arguments: -skipModManager starts the game with the enabled mods without showing the mod
 * manager (ModManagerSceneUI.ShouldSkipModManager), -dgmprobe switches the probe on, and -dgmprobeHome
 * tells it where the job is and where its results go (C:\dgm-probe, never Documents\Timberborn).
 */
export function launchArgs(): string[] {
  return ['-skipModManager', '-dgmprobe', '-dgmprobeHome', probeHome()];
}

interface Heartbeat {
  pid: number;
  at: string;
  phase: string;
  runId: string;
  mapIndex: number;
  mapId: string | null;
  day: number;
  tick: number;
  speed: number;
  fps: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readHeartbeat(): Heartbeat | null {
  try {
    return JSON.parse(readFileSync(probePaths().heartbeat, 'utf8')) as Heartbeat;
  } catch {
    return null;
  }
}

export interface LaunchLog {
  launch: number;
  startedAt: string;
  endedAt: string;
  outcome: 'finished' | 'exited' | 'hung' | 'crashed' | 'no-start';
  lastPhase: string | null;
  lastMap: string | null;
  note: string;
  /** The mods the game says it loaded ("Modded: true" in its log). */
  loadedMods?: string[];
  otherMods?: string[];
}

/** The mod list the game writes after "Modded: true, official": one "- Name (vX)" line per mod. */
export function loadedMods(log: string): string[] {
  const lines = log.split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith('Modded: true'));
  if (at < 0) return [];
  const out: string[] = [];
  for (let i = at + 1; i < lines.length && lines[i].startsWith('- '); i++) out.push(lines[i].slice(2).trim());
  return out;
}

export interface WatchOptions {
  /** Seconds without a fresh heartbeat before the game counts as hung. */
  hangSeconds: number;
  /** Seconds from the launch to the first heartbeat. */
  startSeconds: number;
  /** Seconds the same map may run (beyond the mod's own timeout) before the game is killed. */
  mapSeconds: number;
  maxLaunches: number;
  log: (s: string) => void;
}

export function resultsDir(runId: string): string {
  return join(probePaths().results, runId);
}

export function mapsWithResults(job: Job): Set<string> {
  const done = new Set<string>();
  for (const m of job.maps) if (existsSync(join(resultsDir(job.runId), `${m.id}.json`))) done.add(m.id);
  return done;
}

export function killGame(log: (s: string) => void): void {
  for (const pid of gameProcessIds()) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      log(`killed Timberborn (pid ${pid})`);
    } catch {
      // already gone
    }
  }
}

function writeFailure(job: Job, mapId: string, why: string): void {
  const m = job.maps.find((x) => x.id === mapId);
  if (!m) return;
  const r: Partial<MapResult> = { runId: job.runId, mapId, title: m.title, mapFile: m.mapFile, status: 'failed', failure: why, endedAt: new Date().toISOString(), log: [], notes: [] };
  writeFileSync(join(resultsDir(job.runId), `${mapId}.json`), JSON.stringify(r));
}

/** Runs the job to the end: launches, watches, relaunches for the maps left. */
export async function runJob(job: Job, o: WatchOptions): Promise<LaunchLog[]> {
  const logs: LaunchLog[] = [];
  const p = probePaths();
  for (let launch = 1; launch <= o.maxLaunches; launch++) {
    const done = mapsWithResults(job);
    if (job.maps.every((m) => done.has(m.id))) break;
    if (isGameRunning()) throw new Error('Timberborn is already running; the probe never launches a second copy.');
    // The mod walks the job in order and skips maps that have a result, so the same job serves every launch.
    writeFileSync(p.job, JSON.stringify(job, null, 1));
    rmSync(p.heartbeat, { force: true });
    const started = Date.now();
    const entry: LaunchLog = { launch, startedAt: new Date().toISOString(), endedAt: '', outcome: 'exited', lastPhase: null, lastMap: null, note: '' };
    o.log(`launch ${launch}: ${job.maps.length - done.size} maps left`);
    // Steam starts the game (tests put a stand-in command in DGM_PROBE_LAUNCH, a JSON array).
    const [cmd, ...args] = process.env.DGM_PROBE_LAUNCH ? [...(JSON.parse(process.env.DGM_PROBE_LAUNCH) as string[]), ...launchArgs()] : [steamExe(), '-applaunch', STEAM_APP_ID, ...launchArgs()];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    let seenGame = false;
    let lastBeat: Heartbeat | null = null;
    let lastBeatAt = 0;
    let mapSince = Date.now();
    for (;;) {
      await sleep(2000);
      const running = isGameRunning();
      if (running) seenGame = true;
      const beat = readHeartbeat();
      if (beat && beat.at !== lastBeat?.at) {
        // a heartbeat of this launch also proves the game ran (it may have quit between two looks)
        seenGame = true;
        if (beat.mapId !== lastBeat?.mapId) mapSince = Date.now();
        lastBeat = beat;
        lastBeatAt = Date.now();
        entry.lastPhase = beat.phase;
        entry.lastMap = beat.mapId;
      }
      if (seenGame && !running) {
        entry.outcome = existsSync(join(resultsDir(job.runId), 'done.json')) ? 'finished' : lastBeat?.phase === 'crashed' ? 'crashed' : 'exited';
        break;
      }
      const since = (Date.now() - started) / 1000;
      if (!lastBeat && since > o.startSeconds) {
        entry.outcome = seenGame ? 'hung' : 'no-start';
        entry.note = seenGame ? `no heartbeat ${o.startSeconds} s after the launch` : 'the game did not start';
        break;
      }
      if (lastBeat && (Date.now() - lastBeatAt) / 1000 > o.hangSeconds) {
        entry.outcome = 'hung';
        entry.note = `no heartbeat for ${o.hangSeconds} s (phase ${lastBeat.phase})`;
        break;
      }
      if (lastBeat?.mapId && (Date.now() - mapSince) / 1000 > o.mapSeconds) {
        entry.outcome = 'hung';
        entry.note = `map ${lastBeat.mapId} ran over ${o.mapSeconds} s`;
        break;
      }
    }
    if (isGameRunning()) {
      killGame(o.log);
      await sleep(3000);
    }
    entry.endedAt = new Date().toISOString();
    // The Unity log of this launch (Unity moves it to Player-prev.log at the next launch).
    const unityLog = join(unityLogDir(), 'Player.log');
    if (existsSync(unityLog) && statSync(unityLog).mtimeMs >= started - 5000) {
      const kept = join(resultsDir(job.runId), `launch-${launch}.Player.log`);
      copyFileSync(unityLog, kept);
      // The game lists the mods it loaded; anything besides DGM Probe means the run did not measure the
      // unmodified game (and that the runner's settings changes never reached it).
      entry.loadedMods = loadedMods(readFileSync(kept, 'utf8'));
      entry.otherMods = entry.loadedMods.filter((m) => !/^DGM Probe\b/.test(m));
      if (entry.otherMods.length) o.log(`WARNING: other mods loaded in this launch: ${entry.otherMods.join(', ')}`);
    }
    // A map that was playing when the game stopped gets a failure, so the next launch moves past it.
    const after = mapsWithResults(job);
    if (entry.outcome !== 'finished' && lastBeat?.mapId && !after.has(lastBeat.mapId) && lastBeat.phase !== 'menu' && lastBeat.phase !== 'done') {
      writeFailure(job, lastBeat.mapId, `The game ${entry.outcome === 'hung' ? 'hung' : entry.outcome === 'crashed' ? 'crashed' : 'stopped'} on this map: ${entry.note || entry.outcome}.`);
    }
    o.log(`launch ${launch} ${entry.outcome}${entry.note ? ': ' + entry.note : ''}`);
    logs.push(entry);
    if (entry.outcome === 'no-start') break;
  }
  rmSync(p.job, { force: true });
  return logs;
}
