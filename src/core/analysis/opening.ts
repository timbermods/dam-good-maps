// The opening shot (D493): what the game's first camera shows of a new game, as a plain core question.
// When a new game starts, the game sets its camera on the district center (Timberborn.GameStartup.cs,
// `StartingBuildingInitializer.SetCamera`): looking down at 60°, turned to the start's orientation
// angle + 35°, zoomed to the start's level × 0.1, centered on the building. The camera stands
// `ZoomBase ^ ZoomLevel × BaseDistance` from its target (Timberborn.CameraSystem.cs, `CameraService`;
// the values are the game's `CameraService.blueprint.json`: ZoomBase 1.3, BaseDistance 32, the
// default zoom's widest 6), its rotation AngleAxis(H, up) × AngleAxis(V, right). The vertical field
// of view, 35°, is read from the game camera's prefab in `resources.assets` (near 0.01, far 600);
// the frame is the game's usual 16:9.
//
// At the opening zoom itself the frame covers only about 30 × 45 tiles round the start; the first
// thing a player does is pull back, which keeps the camera's turn and target. So "the opening frame"
// here is the opening camera at the default zoom's widest (`VISTA_ZOOM`), what the player sees of the
// land round the colony before turning the camera: `openingFrame` gives the tiles in it (any zoom),
// `openingShotScore` what it holds (a landmark first, else falls, a lake, relief). The settler turns
// the start to the best of these (gen/settler.ts), the landmark intention steers its form into it
// (land/intentions.ts), and Showcase mode's opening vista reads it.
//
// Exact arithmetic only (PLAN §2.1): the camera's sines are constants, the zoom's power is
// `math/portable.ts` `pow`, everything else + − × ÷.

import { coordinatesForMinCorner, ORIENTATIONS, startEntranceTile, type Orientation } from "../format/footprints";
import { N4 } from "../math/grid";
import { pow, sqrt } from "../math/portable";

/** The game's opening camera (Timberborn.GameStartup.cs; CameraService.blueprint.json). */
export const OPENING = {
  /** VerticalAngle: degrees below the horizon. */
  pitch: 60,
  /** HorizontalAngle = the start's Orientation.ToAngle() + this. */
  turn: 35,
  /** The camera's vertical field of view, degrees (the game camera's prefab). */
  fov: 35,
  /** The frame's width over its height. */
  aspect: 16 / 9,
  /** ZoomLevel = the start's z × this. */
  zoomPerLevel: 0.1,
  zoomBase: 1.3,
  baseDistance: 32,
} as const;

/** The default zoom's widest (CameraService.blueprint.json `DefaultZoomLimits.Max`): the opening
 *  camera pulled back, which the opening frame is judged at. */
export const VISTA_ZOOM = 6;
/** How far from the start a landmark stands in sight of the colony: past the colony's own ground,
 *  near enough to read (D488, D493). */
export const LANDMARK_NEAR = 25;
export const LANDMARK_FAR = 60;
/** A landmark's height over the ground round it (D488): 8 to 15 levels. */
export const LANDMARK_LEAST = 8;
export const LANDMARK_MOST = 15;

// sin and cos of 60°, and of 35°; tan of half the vertical and horizontal fields of view
const SIN_P = 0.8660254037844386;
const COS_P = 0.5;
const S35 = 0.573576436351046;
const C35 = 0.8191520442889918;
const TAN_V = 0.3152987888789835; // tan 17.5°
const TAN_H = (TAN_V * 16) / 9;

/** The camera's turn as grid directions, per orientation (H = the orientation's angle + 35°): its
 *  look across the ground (sin H, cos H) and the frame's right (cos H, −sin H), in tile x and y
 *  (the game's grid y is its world z). */
const TURNS: Record<Orientation, { fx: number; fy: number; rx: number; ry: number }> = {
  Cw0: { fx: S35, fy: C35, rx: C35, ry: -S35 },
  Cw90: { fx: C35, fy: -S35, rx: -S35, ry: -C35 },
  Cw180: { fx: -S35, fy: -C35, rx: -C35, ry: S35 },
  Cw270: { fx: -C35, fy: S35, rx: S35, ry: C35 },
};

/** A start as the opening shot reads it: its middle tile (the settler's x, y; the build's start), its
 *  level and its orientation. */
export interface OpeningStart {
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
}

export interface OpeningCamera {
  /** The point looked at: the district center's middle, a level over its ground. */
  target: [number, number, number];
  /** The camera's place (tile x, tile y, height in levels). */
  eye: [number, number, number];
  /** The look across the ground, and the frame's right, as unit grid directions. */
  look: [number, number];
  right: [number, number];
  distance: number;
  zoom: number;
}

/** The game's opening camera on a start; `zoom` defaults to the game's own (z × 0.1). */
export function openingCamera(start: OpeningStart, zoom = start.z * OPENING.zoomPerLevel): OpeningCamera {
  const t = TURNS[start.orientation];
  const distance = pow(OPENING.zoomBase, zoom) * OPENING.baseDistance;
  const tx = start.x + 0.5;
  const ty = start.y + 0.5;
  const tz = start.z + 1;
  const back = distance * COS_P;
  return { target: [tx, ty, tz], eye: [tx - t.fx * back, ty - t.fy * back, tz + distance * SIN_P], look: [t.fx, t.fy], right: [t.rx, t.ry], distance, zoom };
}

/** Where a point (tile x, tile y, height) falls in the camera's frame: u across (−1 left edge to 1
 *  right), v up (−1 bottom to 1 top); null behind the camera. */
export function frameAt(cam: OpeningCamera, x: number, y: number, z: number): { u: number; v: number } | null {
  const dx = x - cam.eye[0];
  const dy = y - cam.eye[1];
  const dz = z - cam.eye[2];
  const ahead = dx * cam.look[0] + dy * cam.look[1];
  // the camera's axes: forward (look × cos p, down sin p), up (look × sin p, cos p), right
  const zc = ahead * COS_P - dz * SIN_P;
  if (!(zc > 0)) return null;
  const xc = dx * cam.right[0] + dy * cam.right[1];
  const yc = ahead * SIN_P + dz * COS_P;
  return { u: xc / (zc * TAN_H), v: yc / (zc * TAN_V) };
}

const inFrame = (p: { u: number; v: number } | null): p is { u: number; v: number } => !!p && p.u >= -1 && p.u <= 1 && p.v >= -1 && p.v <= 1;

/** The tiles the opening camera shows: each tile's ground (its middle, at its height; at the start's
 *  level without heights) inside the frame. `zoom` defaults to `VISTA_ZOOM`, the opening camera
 *  pulled back; pass `start.z * 0.1` for the very first frame. */
export function openingFrame(start: OpeningStart, W: number, H: number, opts: { heights?: ArrayLike<number> | null; zoom?: number } = {}): { camera: OpeningCamera; tiles: number[]; mask: Uint8Array } {
  const camera = openingCamera(start, opts.zoom ?? VISTA_ZOOM);
  const mask = new Uint8Array(W * H);
  const tiles: number[] = [];
  const h = opts.heights ?? null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (inFrame(frameAt(camera, x + 0.5, y + 0.5, h ? h[i] : start.z))) {
        mask[i] = 1;
        tiles.push(i);
      }
    }
  return { camera, tiles, mask };
}

/** The orientations a start with its middle at (x, y) on level L may take: those whose door tile is on
 *  the map at the start's own level (the settler's hard rule). */
export function levelDoorTurns(h: ArrayLike<number>, W: number, H: number, x: number, y: number, L: number): { o: Orientation; door: number }[] {
  const out: { o: Orientation; door: number }[] = [];
  for (const o of ORIENTATIONS) {
    const [cx, cy] = coordinatesForMinCorner(3, 3, x - 1, y - 1, o);
    const [ex, ey] = startEntranceTile(cx, cy, o);
    if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
    const e = ey * W + ex;
    if (h[e] === L) out.push({ o, door: e });
  }
  return out;
}

// ------------------------------------------------------------------------------- standing forms

/** Sixteen points 7 tiles round a tile: the ground a standing form is measured over. */
const RING: [number, number][] = (() => {
  const a = [1, 0.92, 0.71, 0.38, 0, -0.38, -0.71, -0.92, -1, -0.92, -0.71, -0.38, 0, 0.38, 0.71, 0.92];
  const b = [0, 0.38, 0.71, 0.92, 1, 0.92, 0.71, 0.38, 0, -0.38, -0.71, -0.92, -1, -0.92, -0.71, -0.38];
  return a.map((v, k) => [Math.round(7 * v), Math.round(7 * b[k])] as [number, number]);
})();

/** A stack, butte, mesa or peak: its highest-standing tile and how far it stands over its ring. */
export interface StandingForm {
  /** The tile standing highest over the ground 7 tiles round it. */
  peak: number;
  /** Levels over that ground. */
  stand: number;
  /** The form's tiles (those standing 5+ levels over their ring, joined side by side). */
  size: number;
}

/** The standing forms (the landmark intention's, D138): tiles standing 5+ levels over the ground 7
 *  tiles round them, joined side by side, on at most 300 tiles. */
export function standingForms(h: ArrayLike<number>, W: number, H: number): StandingForm[] {
  const N = W * H;
  const lift = new Int16Array(N);
  const top = new Uint8Array(N);
  for (let y = 7; y < H - 7; y++)
    for (let x = 7; x < W - 7; x++) {
      const i = y * W + x;
      let lo = 99;
      for (const [dx, dy] of RING) lo = Math.min(lo, h[(y + dy) * W + x + dx]);
      lift[i] = h[i] - lo;
      if (lift[i] >= 5) top[i] = 1;
    }
  const out: StandingForm[] = [];
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (!top[s] || seen[s]) continue;
    const q = [s];
    seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const j = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || seen[j] || !top[j]) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (q.length > 300) continue;
    let peak = q[0];
    for (const i of q) if (lift[i] > lift[peak] || (lift[i] === lift[peak] && (h[i] > h[peak] || (h[i] === h[peak] && i < peak)))) peak = i;
    out.push({ peak, stand: lift[peak], size: q.length });
  }
  return out;
}

// ------------------------------------------------------------------------------- the shot's score

/** What the opening frame holds and how good a shot it makes. */
export interface OpeningShot {
  /** 0 to about 2: the landmark weighs most, then falls, open water and relief. */
  score: number;
  /** The landmark in view: a standing form 8+ levels over its ring, 25–60 tiles from the start, in
   *  the frame's upper half (u across, v up). */
  landmark: { tile: number; stand: number; dist: number; u: number; v: number } | null;
  /** Falls in view within 60 tiles (0–1), open water's share of the frame (0–1), relief (0–1). */
  falls: number;
  water: number;
  relief: number;
}

/** The land the shot is scored on, read once for many starts (`prepareOpening`). */
export interface OpeningLand {
  W: number;
  H: number;
  h: ArrayLike<number>;
  forms: StandingForm[];
  /** Falls grouped (tiles within 3 of each other): the tallest drop and its top. */
  falls: { x: number; y: number; z: number; drop: number }[];
  /** A coarse sample of the land (every 4th tile): its height and whether open water covers it. */
  samples: { x: number; y: number; z: number; wet: boolean }[];
}

/** The forms, falls and a coarse sample of the land, for scoring many starts' shots. `D` is the
 *  water's depth (none: no water, no falls). */
export function prepareOpening(h: ArrayLike<number>, W: number, H: number, D: ArrayLike<number> | null, falls: readonly { i: number; drop: number }[] = [], forms?: StandingForm[]): OpeningLand {
  const groups: { x: number; y: number; z: number; drop: number; n: number }[] = [];
  for (const f of falls) {
    if (f.drop < 3) continue;
    const x = f.i % W;
    const y = (f.i - x) / W;
    const z = h[f.i] + (D ? D[f.i] : 0);
    const g = groups.find((q) => Math.abs(q.x - x) <= 3 && Math.abs(q.y - y) <= 3);
    if (g) {
      if (f.drop > g.drop) Object.assign(g, { x, y, z, drop: f.drop });
    } else groups.push({ x, y, z, drop: f.drop, n: 1 });
  }
  const samples: OpeningLand["samples"] = [];
  for (let y = 2; y < H; y += 4)
    for (let x = 2; x < W; x += 4) {
      const i = y * W + x;
      samples.push({ x, y, z: h[i] + (D ? D[i] : 0), wet: !!D && D[i] >= 0.3 });
    }
  return { W, H, h, forms: forms ?? standingForms(h, W, H), falls: groups.map(({ x, y, z, drop }) => ({ x, y, z, drop })), samples };
}

/** The landmark the opening frame holds for a start, if any: the standing form 8+ levels over its
 *  ring, 25–60 tiles out, its top in the frame's upper half (beyond the colony: the shot's backdrop,
 *  not the foreground between the camera and the start), nearest the frame's middle line. */
export function landmarkInView(land: Pick<OpeningLand, "W" | "h" | "forms">, start: OpeningStart, cam = openingCamera(start, VISTA_ZOOM)): OpeningShot["landmark"] & { weight: number } | null {
  const { W, h } = land;
  let best: (OpeningShot["landmark"] & { weight: number }) | null = null;
  for (const f of land.forms) {
    if (f.stand < LANDMARK_LEAST) continue;
    const x = f.peak % W;
    const y = (f.peak - x) / W;
    const dx = x - start.x;
    const dy = y - start.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < LANDMARK_NEAR * LANDMARK_NEAR || d2 > LANDMARK_FAR * LANDMARK_FAR) continue;
    const p = frameAt(cam, x + 0.5, y + 0.5, h[f.peak]);
    if (!inFrame(p) || p.v < 0) continue;
    // nearest the middle line, 30–50 tiles out before the band's ends; a form taller than 15 levels
    // counts as 15 (the landmark's band, D488)
    const mid = d2 >= 900 && d2 <= 2500 ? 1 : 0.85;
    const weight = (1 - 0.5 * Math.abs(p.u)) * mid * (0.7 + (0.3 * (Math.min(f.stand, LANDMARK_MOST) - LANDMARK_LEAST)) / (LANDMARK_MOST - LANDMARK_LEAST));
    if (!best || weight > best.weight || (weight === best.weight && f.peak < best.tile)) {
      best = { tile: f.peak, stand: f.stand, dist: Math.round(sqrt(d2)), u: p.u, v: p.v, weight };
    }
  }
  return best;
}

/** The tallest fall of `least` levels or more within 60 tiles of the start, its top in the frame's
 *  upper half (beyond the colony, as `landmarkInView`'s). */
export function fallInView(land: Pick<OpeningLand, "falls">, start: OpeningStart, least: number, cam = openingCamera(start, VISTA_ZOOM)): { x: number; y: number; drop: number } | null {
  let best: { x: number; y: number; drop: number } | null = null;
  for (const f of land.falls) {
    if (f.drop < least || (best && f.drop <= best.drop)) continue;
    if ((f.x - start.x) * (f.x - start.x) + (f.y - start.y) * (f.y - start.y) > LANDMARK_FAR * LANDMARK_FAR) continue;
    const p = frameAt(cam, f.x + 0.5, f.y + 0.5, f.z);
    if (inFrame(p) && p.v >= 0) best = { x: f.x, y: f.y, drop: f.drop };
  }
  return best;
}

/** The best turn for a start among `turns` (its level-door orientations): the best opening shot,
 *  shots within a twentieth of each other tied, then the door nearest the water (`dWet`), then the
 *  orientations' order. */
export function bestTurn(land: OpeningLand, x: number, y: number, z: number, turns: readonly { o: Orientation; door: number }[], dWet: ArrayLike<number>): Orientation | null {
  let best: Orientation | null = null;
  let bestShot = -1;
  let bestWet = Infinity;
  for (const t of turns) {
    const shot = Math.round(openingShotScore(land, { x, y, z, orientation: t.o }).score * 20);
    const wet = dWet[t.door];
    if (shot > bestShot || (shot === bestShot && wet < bestWet)) {
      best = t.o;
      bestShot = shot;
      bestWet = wet;
    }
  }
  return best;
}

/** How good a shot the opening camera makes for a start (D493): the landmark in view weighs most,
 *  then the falls in view within 60 tiles, the share of the frame within 60 tiles under open water,
 *  and the relief there. */
export function openingShotScore(land: OpeningLand, start: OpeningStart): OpeningShot {
  const cam = openingCamera(start, VISTA_ZOOM);
  const near = (x: number, y: number) => (x - start.x) * (x - start.x) + (y - start.y) * (y - start.y) <= LANDMARK_FAR * LANDMARK_FAR;
  const lm = landmarkInView(land, start, cam);
  let falls = 0;
  for (const f of land.falls) {
    if (!near(f.x, f.y)) continue;
    const p = frameAt(cam, f.x + 0.5, f.y + 0.5, f.z);
    if (inFrame(p)) falls += (Math.min(f.drop, 6) / 6) * (1 - 0.5 * Math.abs(p.u));
  }
  let n = 0;
  let wet = 0;
  let lo = Infinity;
  let hi = -Infinity;
  const zs: number[] = [];
  for (const s of land.samples) {
    if (!near(s.x, s.y) || !inFrame(frameAt(cam, s.x + 0.5, s.y + 0.5, s.z))) continue;
    n++;
    if (s.wet) wet++;
    zs.push(s.z);
  }
  if (zs.length) {
    zs.sort((a, b) => a - b);
    lo = zs[Math.floor(0.1 * (zs.length - 1))];
    hi = zs[Math.floor(0.9 * (zs.length - 1))];
  }
  const water = n ? Math.min(1, wet / n / 0.15) : 0;
  const relief = zs.length ? Math.min(1, (hi - lo) / 8) : 0;
  const fallsFit = Math.min(1, falls);
  const score = (lm ? lm.weight : 0) + 0.5 * fallsFit + 0.3 * water + 0.3 * relief;
  return { score, landmark: lm ? { tile: lm.tile, stand: lm.stand, dist: lm.dist, u: lm.u, v: lm.v } : null, falls: fallsFit, water, relief };
}
