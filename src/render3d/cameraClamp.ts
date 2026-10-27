// The camera keeps out of the rock (3D view): the orbit camera sits on an arm from the point it looks at, and where
// the arm's end would be inside solid ground (a cliff behind a low camera, a cave's wall behind a camera zoomed in,
// the rock round a mouth), it is drawn in along the arm to the nearest place in the air, toward what it looks at.
// Close to a point under a roof (a cave's floor, a tunnel, under an arch: within `CAVE_NEAR`), the camera stays in
// that point's air: drawn in to where the arm first meets rock, so turning round in a cave never puts the camera
// outside, behind its wall. Nothing is ever drawn from inside rock. Where the arm's end is in the air (and, under a
// roof, the arm too), nothing changes: the view is exactly what it was, so a map without terrain above terrain is
// drawn as before wherever the camera stayed above the ground. Only drawn: the view's own distance is kept (the camera
// springs back out once the rock no longer holds it). Pure TypeScript, a few voxel lookups a frame (a short walk along
// the arm under a roof, or while the rock holds the camera).
//
// World space: X = x, Y = height, Z = −y (as pick.ts). The voxels are the column masks (`mesh.ts` `columnMask`): bit z
// set when voxel z is solid. The map's floor (below level 0) is solid; beyond the map's edges and above its layers is air.

/** How near the camera may be to a point under a roof for it to stay in that point's air (tiles): a view into a cave,
 *  not one across the map whose middle passes under an arch (it is not drawn under the arch). */
export const CAVE_NEAR = 24;

/** How far the camera's eye keeps from solid ground, in tiles: more than the near plane's corners reach (0.5 ahead, a
 *  40° field of view, up to a 3:1 window), so the near plane never cuts into rock. */
export const CAMERA_CLEARANCE = 0.8;

/** Where nothing on the arm has that room (a camera turned into a cave's wall close to a target on its floor: the floor
 *  near the target and the wall leave none), the less it keeps, in turn: the renderer then brings the near plane in to
 *  match (`nearFor`), so it never cuts into the rock, rather than letting the camera leave the cave. */
export const CAMERA_ROOMS = [CAMERA_CLEARANCE, 0.25, 0.12] as const;

/** The camera's near plane for the room its eye has (the renderer's is 0.5 with the whole clearance): its corners, about
 *  1.4 times as far as the plane at the widest windows, stay inside the room. */
export function nearFor(room: number): number {
  return room >= CAMERA_CLEARANCE ? 0.5 : Math.max(0.07, room * 0.6);
}

/** The camera's eye on its arm: `distance` from `target`, turned `yaw` (0 looks north) and raised `pitch` above the
 *  horizon (as the renderer's `placeCamera`). */
export function orbitEye(target: readonly [number, number, number], yaw: number, pitch: number, distance: number): [number, number, number] {
  const cp = Math.cos(pitch);
  return [target[0] + Math.sin(yaw) * cp * distance, target[1] + Math.sin(pitch) * distance, target[2] + Math.cos(yaw) * cp * distance];
}

/** Whether a ball of radius `r` round the scene point `p` is clear of solid voxels (`maskAt(i)`: tile i = y·W + x). */
export function clearAt(p: readonly [number, number, number], W: number, H: number, maskAt: (i: number) => number, r = CAMERA_CLEARANCE): boolean {
  const gx = p[0];
  const gy = -p[2];
  const gz = p[1];
  // the map's floor
  if (gz < r) return false;
  const x0 = Math.max(0, Math.floor(gx - r));
  const x1 = Math.min(W - 1, Math.floor(gx + r));
  const y0 = Math.max(0, Math.floor(gy - r));
  const y1 = Math.min(H - 1, Math.floor(gy + r));
  const z0 = Math.max(0, Math.floor(gz - r));
  const z1 = Math.min(30, Math.floor(gz + r));
  if (x0 > x1 || y0 > y1 || z0 > z1) return true;
  const r2 = r * r;
  // (the squared distance from the point to a unit cell along one axis)
  const gap = (v: number, c: number) => (v < c ? c - v : v > c + 1 ? v - c - 1 : 0);
  for (let y = y0; y <= y1; y++) {
    const dy = gap(gy, y);
    for (let x = x0; x <= x1; x++) {
      const dx = gap(gx, x);
      const dxy = dx * dx + dy * dy;
      if (dxy >= r2) continue;
      const m = maskAt(y * W + x);
      if (!m) continue;
      for (let z = z0; z <= z1; z++) {
        if (!((m >>> z) & 1)) continue;
        const dz = gap(gz, z);
        if (dxy + dz * dz < r2) return false;
      }
    }
  }
  return true;
}

/** The steps the arm is walked in (tiles), before the boundary is found exactly. */
const ARM_STEP = 0.2;
/** The nearest the camera is drawn in to what it looks at. */
const ARM_LEAST = 0.3;

/** Whether a scene point is in the air under rock: its voxel air (on a top, the air above it) and a solid voxel above
 *  it in its column (a cave, a tunnel, under an arch or an overhang). Never on a map without terrain above terrain. */
export function roofed(p: readonly [number, number, number], W: number, H: number, maskAt: (i: number) => number): boolean {
  const x = Math.floor(p[0]);
  const y = Math.floor(-p[2]);
  const z = Math.max(0, Math.floor(p[1]));
  if (x < 0 || y < 0 || x >= W || y >= H || z >= 30) return false;
  const m = maskAt(y * W + x);
  return !((m >>> z) & 1) && m >>> (z + 1) !== 0;
}

/** Where along its arm the camera sits, and the room its eye has there. Near a target under a roof (`roofed`, within
 *  `CAVE_NEAR`): the farthest place up to `distance` in the air the arm runs through from the target, before it first
 *  meets rock, with the most room any place there has (`CAMERA_ROOMS`). Otherwise, or where that air has no room:
 *  `distance` where its eye is clear of the rock by the whole clearance; else the clear place on the arm nearest to it on the way in (toward the target: the rock's
 *  face the eye went into), with less room (`CAMERA_ROOMS`) where none has the whole; else, when the arm is rock all
 *  the way in (the target itself inside the ground), the nearest clear place beyond. Continuous as the eye moves into
 *  rock through a face: it stays on that face. */
export function armReach(
  target: readonly [number, number, number],
  yaw: number,
  pitch: number,
  distance: number,
  W: number,
  H: number,
  maskAt: (i: number) => number,
): { reach: number; room: number } {
  const clear = (s: number, room: number) => clearAt(orbitEye(target, yaw, pitch, s), W, H, maskAt, room);
  const whole = CAMERA_CLEARANCE;
  // (a clear place and a held one a step apart: the boundary between them, from the clear side)
  const edge = (ok: number, held: number, room: number) => {
    for (let k = 0; k < 14; k++) {
      const mid = (ok + held) / 2;
      if (clear(mid, room)) ok = mid;
      else held = mid;
    }
    return { reach: ok, room };
  };
  if (distance <= CAVE_NEAR && roofed(target, W, H, maskAt)) {
    // the air the arm runs through from the target, to where it first meets rock
    let end = distance;
    for (let s = ARM_LEAST; s < distance; s += ARM_STEP / 2) {
      const p = orbitEye(target, yaw, pitch, s);
      if (!clearAt(p, W, H, maskAt, 1e-6)) {
        end = s;
        break;
      }
    }
    for (const room of CAMERA_ROOMS) {
      if (end === distance && clear(distance, room)) return { reach: distance, room };
      let last = -1;
      for (let s = ARM_LEAST; s < end; s += ARM_STEP) if (clear(s, room)) last = s;
      if (last >= 0) return edge(last, Math.min(last + ARM_STEP, end), room);
    }
  }
  if (clear(distance, whole)) return { reach: distance, room: whole };
  for (const room of CAMERA_ROOMS) {
    let held = distance;
    for (let s = distance - ARM_STEP; s >= ARM_LEAST; s -= ARM_STEP) {
      if (clear(s, room)) return edge(s, held, room);
      held = s;
    }
    if (held > ARM_LEAST && clear(ARM_LEAST, room)) return edge(ARM_LEAST, held, room);
  }
  // the arm is rock all the way in: out along it, to where it leaves the rock (it rises: above the layers at the latest)
  let held = distance;
  const far = distance + Math.max(8, (40 - target[1]) / Math.max(0.05, Math.sin(pitch)));
  for (let s = distance + ARM_STEP; s <= far; s += ARM_STEP) {
    if (clear(s, whole)) return edge(s, held, whole);
    held = s;
  }
  return { reach: distance, room: whole };
}
