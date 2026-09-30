// From catalog games to the job file: the map files copied into the probe's own folder (never into the
// player's Maps folder), and each game's moments, samples, actions and poses.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CheckDef, D0, type GameDef, lookPoses, standardPoses } from './catalog';
import type { PlanSummary } from './consent';
import { readIngameLog } from './ingamelog';
import type { Job, JobMap, Moment, Pose } from './job';
import { readMapBytes, type MapInfo } from './mapfile';
import { probePaths } from './paths';

export interface Prepared {
  game: GameDef;
  map: JobMap;
  info: MapInfo;
  checks: CheckDef[];
}

/** Hazard starts and ends of a schedule, in game days (cycle 1 starts on day 1). */
export function weatherMoments(game: GameDef): { day: number; id: string }[] {
  const out: { day: number; id: string }[] = [];
  let start = 1;
  const end = D0 + game.days;
  game.cycles.forEach((c, i) => {
    const hazard = start + c.temperateDays;
    if (c.hazardDays > 0) {
      out.push({ day: hazard, id: `${c.hazard}${i + 1}-start` });
      out.push({ day: hazard + 1, id: `${c.hazard}${i + 1}-day1` });
      out.push({ day: hazard + c.hazardDays, id: `${c.hazard}${i + 1}-end` });
    }
    start = hazard + c.hazardDays;
  });
  return out.filter((m) => m.day < end);
}

/** Only the checks still pending in docs/ingame-log.md (and the probe's own checks, which are not in it). */
export function pendingChecks(game: GameDef): CheckDef[] {
  const rows = readIngameLog();
  const ids = new Set(rows.map((r) => r.id.split(',')[0].trim()));
  const pending = new Set(rows.filter((r) => r.pending).map((r) => r.id.split(',')[0].trim()));
  return game.checks.filter((c) => !ids.has(c.id) || pending.has(c.id));
}

export function prepare(games: GameDef[], runId: string): Prepared[] {
  const dir = join(probePaths().maps, runId);
  mkdirSync(dir, { recursive: true });
  return games.map((game) => {
    const bytes = game.bytes();
    const mapFile = join(dir, `${game.id}.timber`);
    writeFileSync(mapFile, bytes);
    const info = readMapBytes(bytes, mapFile);
    const poses: Pose[] = [...standardPoses(info), ...(game.poses?.(info) ?? []), ...(game.lookMap ? lookPoses(game.lookMap) : [])];
    const shotsNow = ['overview', 'water', 'start'].filter((id) => poses.some((p) => p.id === id));
    const moments: Moment[] = [{ id: 'start', day: D0, snapshot: true, shots: poses.map((p) => p.id) }];
    const add = (m: Moment) => {
      if (m.day >= D0 + game.days - 1e-6 || moments.some((x) => Math.abs(x.day - m.day) < 1e-6 && x.id === m.id)) return;
      moments.push(m);
    };
    for (const d of game.snapshotsAt ?? []) add({ id: `day+${d}`, day: D0 + d, snapshot: true, shots: [] });
    if (game.daily) for (let k = 1; k < game.days; k++) add({ id: `day+${k}`, day: D0 + k, snapshot: true, shots: [] });
    for (const w of weatherMoments(game)) add({ id: w.id, day: w.day, snapshot: true, shots: w.id.endsWith('-day1') ? [] : shotsNow });
    for (const a of game.actions?.(info) ?? []) {
      add({ id: `before-${a.kind}`, day: a.day - 0.01, snapshot: true, shots: [...shotsNow, ...poses.filter((p) => p.id === 'plug').map((p) => p.id)] });
    }
    // the last moment: just before the end
    moments.push({ id: 'end', day: D0 + game.days - 0.02, snapshot: true, shots: game.days >= 1 ? [...shotsNow, ...(game.poses?.(info) ?? []).map((p) => p.id)] : [] });
    moments.sort((a, b) => a.day - b.day);
    const map: JobMap = {
      id: game.id,
      title: game.title,
      mapFile,
      faction: game.faction,
      mode: game.mode,
      cycles: game.cycles,
      endDay: D0 + game.days,
      // generous: loading, the days at a slow speed for the map's size, and the screenshots
      timeoutSeconds: Math.round(300 + game.days * 150 * Math.max(1, (info.W * info.H) / (128 * 128)) + moments.reduce((n, m) => n + m.shots.length, 0) * 10),
      tiles: game.tiles(info),
      sampleHours: game.sampleHours,
      moments,
      actions: game.actions?.(info) ?? [],
      poses,
      ...(game.perf ? { perf: { startDay: D0 + game.perf.afterDays, rowSpacing: game.perf.rowSpacing, phases: game.perf.phases } } : {}),
    };
    // the frame-time phases' real seconds come on top of the map's own time
    map.timeoutSeconds += Math.round(perfSeconds(map));
    return { game, map, info, checks: pendingChecks(game) };
  });
}

/** The real seconds a map's frame-time phases take (0 without them). */
export function perfSeconds(map: Pick<JobMap, 'perf'>): number {
  return (map.perf?.phases ?? []).reduce((n, p) => n + p.seconds, 0);
}

/** Rough real time: loading, game days at the speed a map of this size runs, screenshots and frame-time phases. */
export function estimateMinutes(p: Prepared[]): number {
  let s = 0;
  for (const x of p) {
    const area = (x.info.W * x.info.H) / (128 * 128);
    const shots = x.map.moments.reduce((n, m) => n + m.shots.length, 0);
    s += 45 + x.game.days * 20 * Math.max(0.5, area) + shots * 1.5 + perfSeconds(x.map);
  }
  return Math.ceil(s / 60) + 2;
}

export function summary(p: Prepared[], kind: 'smoke' | 'batch', keepMods = false, written?: PlanSummary['written']): PlanSummary {
  return {
    kind,
    keepMods,
    ...(written?.length ? { written } : {}),
    estimateMinutes: estimateMinutes(p),
    maps: p.map((x) => ({ id: x.game.id, title: x.game.title, checks: x.checks.filter((c) => c.how !== 'none').map((c) => c.id), days: x.game.days })),
  };
}

export function makeJob(runId: string, prepared: Prepared[], speed: number): Job {
  return {
    version: 1,
    runId,
    createdAt: new Date().toISOString(),
    settings: { speed, lowGraphics: true, heartbeatSeconds: 2, mapTimeoutSeconds: 1500, quitWhenDone: true },
    maps: prepared.map((x) => x.map),
  };
}
