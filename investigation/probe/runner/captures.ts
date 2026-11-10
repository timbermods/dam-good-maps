// The in-game capture kit (`batch -- <map> --captures`): a map played only to be seen. The game opens it and the probe
// saves, on day 1 and on the worst day of the first drought and of the first badtide (as long as Normal makes them),
// the game's first camera exactly as it opens the map, the whole map at the game's own angle, and three chosen angles
// (the largest water, the tallest fall or cliff and the start, or the angles given with `--angles`). Every shot
// records the camera it was rendered with (DGM Probe 0.3.4), so our renderer can be posed from it exactly
// (tools/capture-ingame.ts makes the contact sheet). The captures go to a local folder, never into git.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Cycle, GameDay, MapResult, Moment, Pose, ShotCamera } from './job';
import { NEW_GAME_DAY } from './job';
import { wetAreas, type MapInfo } from './mapfile';

/** The shots' size: the game's usual 16:9, so the first camera frames what a player's screen does. */
export const CAPTURE_SIZE = { width: 1600, height: 900 } as const;

/** The game's camera (src/core/analysis/opening.ts, D493): vertical field of view, the opening's pitch and turn, and
 *  the default zoom's widest distance (zoom 6: 32 × 1.3^6). */
export const GAME_CAMERA = { fov: 35, pitch: 60, turn: 35, widest: 32 * 1.3 ** 6 } as const;

/** The hour of a hazard's last day its worst moment is captured at: the last hour of the game's full daylight (the day
 *  turns to sunset from hour 13, tools/game-day-light.ts), as late in the hazard as the light allows. */
export const WORST_HOUR = 13;

const ORIENTATION_ANGLE: Record<string, number> = { Cw0: 0, Cw90: 90, Cw180: 180, Cw270: 270 };
const rad = (d: number) => (d * Math.PI) / 180;

/** A chosen angle: where it looks (tile x, y), its heading (degrees, the game's horizontal angle: 0 looks north, 90
 *  east), its pitch (degrees down) and its distance (tiles). */
export interface Angle {
  id: string;
  x: number;
  y: number;
  heading?: number;
  pitch?: number;
  distance?: number;
  /** Why it was picked (the auto angles). */
  why?: string;
}

/** `--angles "falls@64,40,180,30,40;bay@20,90"`: name@x,y[,heading[,pitch[,distance]]], separated by semicolons. */
export function parseAngles(text: string): Angle[] {
  return text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([a-z0-9-]+)@(.+)$/i.exec(s);
      if (!m) throw new Error(`--angles: "${s}" is not name@x,y[,heading[,pitch[,distance]]]`);
      const n = m[2].split(',').map((v) => Number(v.trim()));
      if (n.length < 2 || n.length > 5 || n.some((v) => !Number.isFinite(v))) throw new Error(`--angles: "${s}" needs 2 to 5 numbers after the @`);
      if (['first', 'widest', 'whole'].includes(m[1].toLowerCase())) throw new Error(`--angles: "${m[1]}" is a capture of its own; name the angle otherwise`);
      return { id: m[1].toLowerCase(), x: n[0], y: n[1], ...(n.length > 2 ? { heading: n[2] } : {}), ...(n.length > 3 ? { pitch: n[3] } : {}), ...(n.length > 4 ? { distance: n[4] } : {}) };
    });
}

/** The opening camera's heading on this map: the start's orientation angle + 35° (north-east when there is no start). */
export function openingHeading(m: MapInfo): number {
  return (ORIENTATION_ANGLE[m.start?.orientation ?? 'Cw0'] ?? 0) + GAME_CAMERA.turn;
}

const surfaceAt = (m: MapInfo, i: number) => (m.floor[i] >= 0 && m.depth[i] > 0.02 ? m.floor[i] + m.depth[i] : -1);

/** The three angles picked from the map: its largest water, its tallest fall (else its tallest cliff), and the start. */
export function autoAngles(m: MapInfo): Angle[] {
  const out: Angle[] = [];
  const heading = openingHeading(m);
  const water = wetAreas(m)[0];
  if (water) {
    // the wet tile nearest the area's centre (a river's centre can be dry ground), framed to the area's reach from it
    let best = water.tiles[0], bd = Infinity;
    for (const t of water.tiles) {
      const d = (t % m.W - water.cx) ** 2 + (((t / m.W) | 0) - water.cy) ** 2;
      if (d < bd) (bd = d), (best = t);
    }
    const bx = best % m.W, by = (best / m.W) | 0;
    let reach = 0;
    for (const t of water.tiles) reach = Math.max(reach, Math.hypot((t % m.W) - bx, ((t / m.W) | 0) - by));
    out.push({ id: 'water', x: bx, y: by, heading, pitch: 50, distance: Math.min(GAME_CAMERA.widest, Math.max(40, reach * 1.5)), why: `the largest water: ${water.tiles.length} wet tiles` });
  }
  // the tallest fall: the largest drop of the water's surface between two wet neighbours
  let fall = { drop: 0, hi: -1, lo: -1 };
  let cliff = { drop: 0, hi: -1, lo: -1 };
  for (let y = 0; y < m.H; y++)
    for (let x = 0; x < m.W; x++) {
      const i = y * m.W + x;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
        const n = ny * m.W + nx;
        const a = surfaceAt(m, i), b = surfaceAt(m, n);
        if (a >= 0 && b >= 0 && a - b > fall.drop) fall = { drop: a - b, hi: i, lo: n };
        if (m.heights[i] - m.heights[n] > cliff.drop) cliff = { drop: m.heights[i] - m.heights[n], hi: i, lo: n };
      }
    }
  const steep = fall.drop >= 2 ? { ...fall, kind: 'fall' } : cliff.drop > 0 ? { ...cliff, kind: 'cliff' } : null;
  if (steep) {
    const hx = steep.hi % m.W, hy = (steep.hi / m.W) | 0, lx = steep.lo % m.W, ly = (steep.lo / m.W) | 0;
    // seen from its foot, looking up at it
    const look = (Math.atan2(hx - lx, hy - ly) * 180) / Math.PI;
    out.push({ id: steep.kind === 'fall' ? 'falls' : 'cliff', x: (hx + lx) / 2, y: (hy + ly) / 2, heading: (look + 360) % 360, pitch: 28, distance: Math.max(32, steep.drop * 4), why: `the tallest ${steep.kind}: ${steep.drop.toFixed(1)} levels, (${hx}, ${hy}) over (${lx}, ${ly})` });
  }
  if (m.start) out.push({ id: 'start', x: m.start.x, y: m.start.y, heading, pitch: 35, distance: 60, why: 'the start in its land, lower than the first camera' });
  return out;
}

/** The ground or water surface at a tile, the height an angle looks at. */
function heightAt(m: MapInfo, x: number, y: number): number {
  const tx = Math.max(0, Math.min(m.W - 1, Math.floor(x))), ty = Math.max(0, Math.min(m.H - 1, Math.floor(y)));
  const i = ty * m.W + tx;
  const s = surfaceAt(m, i);
  return s >= 0 ? s : m.heights[i];
}

/** A pose for the game's own camera (kind `game`: the game's field of view kept), in our view's world (x east, y up,
 *  z = −north): `heading` the game's horizontal angle, `pitch` degrees down. */
function gamePose(id: string, target: [number, number, number], heading: number, pitch: number, distance: number): Pose {
  return { id, kind: 'game', target, yaw: rad(-heading), pitch: rad(pitch), distance, fovY: GAME_CAMERA.fov, width: CAPTURE_SIZE.width, height: CAPTURE_SIZE.height };
}

/** The distance the game's camera must stand from the map's middle, at this heading and pitch, for the whole map (its
 *  box, floor to top) to be in its frame. */
export function wholeDistance(m: MapInfo, heading: number, pitch: number, fov: number = GAME_CAMERA.fov, aspect = CAPTURE_SIZE.width / CAPTURE_SIZE.height): number {
  let lo = 255, hi = 0;
  for (const h of m.heights) (lo = Math.min(lo, h)), (hi = Math.max(hi, h));
  const target = [m.W / 2, (lo + hi) / 2, -m.H / 2];
  const yaw = rad(-heading), p = rad(pitch);
  const tanV = Math.tan(rad(fov / 2)), tanH = tanV * aspect;
  const corners: number[][] = [];
  for (const x of [0, m.W]) for (const y of [lo, hi]) for (const z of [0, -m.H]) corners.push([x, y, z]);
  const fits = (d: number) => {
    const zc = [Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p)];
    const eye = target.map((t, k) => t + zc[k] * d);
    const xc = [zc[2], 0, -zc[0]];
    const xl = Math.hypot(xc[0], xc[2]);
    xc[0] /= xl, xc[2] /= xl;
    const yc = [zc[1] * xc[2] - zc[2] * xc[1], zc[2] * xc[0] - zc[0] * xc[2], zc[0] * xc[1] - zc[1] * xc[0]];
    return corners.every((c) => {
      const v = c.map((q, k) => q - eye[k]);
      const z = -(v[0] * zc[0] + v[1] * zc[1] + v[2] * zc[2]);
      if (z <= 1) return false;
      const u = (v[0] * xc[0] + v[1] * xc[1] + v[2] * xc[2]) / (z * tanH);
      const w = (v[0] * yc[0] + v[1] * yc[1] + v[2] * yc[2]) / (z * tanV);
      return Math.abs(u) <= 0.97 && Math.abs(w) <= 0.97;
    });
  };
  let a = 4, b = 4000;
  for (let k = 0; k < 60; k++) {
    const mid = (a + b) / 2;
    if (fits(mid)) b = mid;
    else a = mid;
  }
  return Math.round(b * 10) / 10;
}

/** The capture poses: the first camera (`first`, the game's own), the farthest a player's zoom goes, centred on the map
 *  (`widest`), the whole map in frame (`whole`, which can be farther than a player reaches) and the angles. */
export function capturePoses(m: MapInfo, given: Angle[] | null): Pose[] {
  let lo = 255, hi = 0;
  for (const h of m.heights) (lo = Math.min(lo, h)), (hi = Math.max(hi, h));
  const heading = openingHeading(m);
  const poses: Pose[] = [
    { id: 'first', kind: 'current', target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0, fovY: 0, width: CAPTURE_SIZE.width, height: CAPTURE_SIZE.height },
    gamePose('widest', [m.W / 2, (lo + hi) / 2, -m.H / 2], heading, GAME_CAMERA.pitch, Math.round(GAME_CAMERA.widest * 10) / 10),
    gamePose('whole', [m.W / 2, (lo + hi) / 2, -m.H / 2], heading, GAME_CAMERA.pitch, wholeDistance(m, heading, GAME_CAMERA.pitch)),
  ];
  for (const a of given ?? autoAngles(m)) {
    const h = heightAt(m, a.x, a.y);
    poses.push(gamePose(a.id, [a.x + 0.5, h, -(a.y + 0.5)], a.heading ?? heading, a.pitch ?? 45, a.distance ?? 50));
  }
  return poses;
}

/** The weather a capture game plays: 3 temperate days (every map's sources ramp up within a day), Normal's first drought
 *  as long as the game makes it, 3 more temperate days and Normal's first badtide as long as the game makes it (the
 *  game brings no badtide before cycle 5; it is brought forward), then calm. */
export function captureCycles(firstDrought: number, firstBadtide: number, calm: Cycle): Cycle[] {
  return [{ temperateDays: 3, hazard: 'drought', hazardDays: firstDrought }, { temperateDays: 3, hazard: 'badtide', hazardDays: firstBadtide }, calm];
}

export interface CaptureMoment {
  /** `start` is day 1 (the game's own first moment); `drought` and `badtide` each hazard's worst. */
  id: 'start' | 'drought' | 'badtide';
  label: string;
  day: GameDay;
  hazard: 'drought' | 'badtide' | null;
}

/** Day 1 as the game opens the map, and each hazard's last day at `WORST_HOUR` (its driest or most poisoned light). */
export function captureMoments(cycles: Cycle[]): CaptureMoment[] {
  const out: CaptureMoment[] = [{ id: 'start', label: 'day 1, as the game opens the map', day: NEW_GAME_DAY, hazard: null }];
  let start = 1;
  for (const c of cycles) {
    const hazardStart = start + c.temperateDays;
    if (c.hazardDays > 0 && !out.some((m) => m.hazard === c.hazard)) {
      const lastDay = hazardStart + c.hazardDays - 1;
      out.push({ id: c.hazard, label: `the first ${c.hazard}'s worst: its day ${c.hazardDays} of ${c.hazardDays}, hour ${WORST_HOUR}`, day: lastDay + WORST_HOUR / 24, hazard: c.hazard });
    }
    start = hazardStart + c.hazardDays;
  }
  return out;
}

/** The game days a capture game runs: a little past its last capture. */
export function captureDays(moments: CaptureMoment[]): number {
  return Math.round((Math.max(...moments.map((m) => m.day)) + 0.1 - NEW_GAME_DAY) * 100) / 100;
}

/** The job's moments for a capture game: each capture with a whole-map record and every pose's shot; the record a day
 *  in (the generic checks' `water`) and the end's, without shots. */
export function captureJobMoments(moments: CaptureMoment[], poses: Pose[], days: number): Moment[] {
  const out: Moment[] = moments.map((m) => ({ id: m.id, day: m.day, snapshot: true, shots: poses.map((p) => p.id) }));
  out.push({ id: 'day+1', day: NEW_GAME_DAY + 1, snapshot: true, shots: [] });
  out.push({ id: 'end', day: NEW_GAME_DAY + days - 0.02, snapshot: true, shots: [] });
  return out.sort((a, b) => a.day - b.day);
}

/** One capture as the sheet reads it (captures.json). */
export interface CaptureRecord {
  moment: CaptureMoment['id'];
  label: string;
  hazard: CaptureMoment['hazard'];
  day: GameDay;
  /** The game's hour then (0–24). */
  hour: number;
  pose: string;
  /** What the pose is, in words. */
  what: string;
  /** The shot, in the captures folder. */
  file: string;
  /** The camera the game rendered it with (game world: x east, y up, z north); absent from mods before 0.3.4. */
  camera?: ShotCamera;
  /** The whole-map record of that moment (in the run's results folder). */
  snapshot?: string;
}

export interface CapturesFile {
  map: string;
  /** The .timber the game played (the run's own copy). */
  mapFile: string;
  sha256: string;
  runId: string;
  gameVersion: string;
  modVersion: string;
  status: string;
  weather: MapResult['weather'];
  /** The game's widest default zoom (tiles from its target): a pose farther than it is one a player cannot reach. */
  playerWidest: number;
  poses: (Pose & { what: string })[];
  captures: CaptureRecord[];
  notes: string[];
}

/** What each pose shows, in words. */
export function describePoses(m: MapInfo, poses: Pose[], given: Angle[] | null): Record<string, string> {
  const angles = given ?? autoAngles(m);
  const out: Record<string, string> = {};
  for (const p of poses) {
    if (p.id === 'first') out[p.id] = 'the first camera, exactly as the game opens the map';
    else if (p.id === 'widest') out[p.id] = `the farthest a player's zoom goes (zoom 6, ${p.distance.toFixed(0)} tiles), centred on the map at the first camera's heading and pitch`;
    else if (p.id === 'whole') out[p.id] = `the whole map: the first camera's heading and the game's 60° pitch, ${p.distance.toFixed(0)} tiles back${p.distance > GAME_CAMERA.widest ? ` (beyond the ${GAME_CAMERA.widest.toFixed(0)} a player's zoom reaches)` : ''}`;
    else {
      const a = angles.find((x) => x.id === p.id);
      out[p.id] = `${a?.why ?? `the angle given: (${a?.x}, ${a?.y})`}; heading ${(((-p.yaw * 180) / Math.PI + 360) % 360).toFixed(0)}°, ${((p.pitch * 180) / Math.PI).toFixed(0)}° down, ${p.distance.toFixed(0)} tiles back`;
    }
  }
  return out;
}

/** After the run: the shots copied into the captures folder as `<moment>-<pose>.jpg`, the played map beside them, and
 *  captures.json (each capture's moment, pose, camera and whole-map record). Returns the file written. */
export function writeCaptures(opts: {
  out: string;
  result: MapResult | null;
  resultsDir: string;
  shotsDir: string;
  info: MapInfo;
  poses: Pose[];
  moments: CaptureMoment[];
  given: Angle[] | null;
  runId: string;
}): string {
  const { out, result, info, poses, moments } = opts;
  mkdirSync(out, { recursive: true });
  const what = describePoses(info, poses, opts.given);
  const notes: string[] = [];
  const captures: CaptureRecord[] = [];
  const mapCopy = join(out, basename(info.path));
  if (!existsSync(mapCopy) || !readFileSync(mapCopy).equals(readFileSync(info.path))) copyFileSync(info.path, mapCopy);
  if (!result) notes.push('the game wrote no result for this map: no captures');
  for (const shot of result?.shots ?? []) {
    const m = moments.find((x) => x.id === shot.momentId);
    if (!m) continue;
    const src = join(opts.shotsDir, shot.file);
    const file = `${m.id === 'start' ? 'day1' : m.id}-${shot.pose}.jpg`;
    if (!existsSync(src)) {
      notes.push(`${file}: the game's shot ${src} is missing`);
      continue;
    }
    copyFileSync(src, join(out, file));
    const snap = result!.snapshots.find((s) => s.endsWith(`-${m.id}.snapshot.json.gz`));
    const cam = shot.camera;
    captures.push({ moment: m.id, label: m.label, hazard: m.hazard, day: shot.day, hour: Math.round((shot.day % 1) * 24 * 100) / 100, pose: shot.pose, what: what[shot.pose] ?? shot.pose, file, ...(cam ? { camera: cam } : {}), ...(snap ? { snapshot: join(opts.resultsDir, snap) } : {}) });
  }
  if (result && !captures.some((c) => c.camera)) notes.push(`DGM Probe ${result.modVersion} records no cameras (0.3.4 does): the sheet cannot pose our view`);
  for (const n of result?.notes ?? []) if (/shot|camera/i.test(n)) notes.push(`the game: ${n}`);
  const file: CapturesFile = {
    map: basename(info.path).replace(/\.timber$/i, ''),
    mapFile: mapCopy,
    sha256: info.sha256,
    runId: opts.runId,
    gameVersion: result?.gameVersion ?? '',
    modVersion: result?.modVersion ?? '',
    status: result?.status ?? 'no result',
    weather: result?.weather ?? [],
    playerWidest: Math.round(GAME_CAMERA.widest * 10) / 10,
    poses: poses.map((p) => ({ ...p, what: what[p.id] ?? p.id })),
    captures,
    notes,
  };
  const json = join(out, 'captures.json');
  writeFileSync(json, JSON.stringify(file, null, 1));
  return json;
}

/** The captures folder a map's captures go to by default: `ingame/` beside it. */
export function defaultCapturesDir(mapPath: string): string {
  return join(dirname(mapPath), 'ingame');
}
