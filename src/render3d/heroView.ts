// What the map's picture (D488, `hero.ts`) draws, and from where: the game's own camera and light for a map's
// picture, as plain data (no three.js, no page), so it is tested headless.
//
// - **The camera** frames the map's sight where it has one (showcase gap 10, `sightCamera`: the landmark the start's
//   opening frame holds, seen from the colony's side, close enough to read at the picker's size, or one of the map's
//   rock arches, looked through, where its picture looks as good; D488 audit: no card showed one; an overhang or a
//   cave never: its opening is a dark band under a cliff face at the card's size). Otherwise it
//   frames the map (amended 2026-11-07, showcase craft's look gap 2: the game's opening camera, centred
//   on a start near an edge, showed the backdrop past the map in half its frame). It is the game's own map thumbnail
//   camera (`ThumbnailCameraDefaultPositionProvider`: 40° down, face-on, the game camera's 35° field of view), turned
//   to the start's orientation (the side the colony faces, where the landmark is steered, D502; north without a
//   start), centred across the land and pulled back only as far as the frame's corners still land on the map at the
//   ground's mean level: the map fills the picture, no backdrop past its edge (`heroCamera`). Along the map it slides,
//   within the room it has, to the place whose picture scores best by Showcase's looks score (core
//   `analysis/picture.ts` `looksScore`, D506: the measure fitted to the eye, cast from this camera; showcase craft's
//   twin falls, whose river runs near an edge), of `SLIDES` places; the map's middle where they score the same.
// - **The light** follows the camera, as the game's sun does (`Sun.GetCameraYAngle`: the sun's turn is the camera's
//   + `RotateWithCameraOffset`, 40°): the game's thumbnails are always lit from behind the camera's left shoulder. The
//   renderer's sun turns with its camera the same way (light.ts `sunOfYaw`), so the picture is the map as it is, from
//   that camera, under that sun (hero.ts bakes it at once: `MapRenderer.sunNow`).
// - **What shows** is what the game's thumbnail shows (`MapThumbnailCapturing`'s rendering listeners): the land,
//   the water, the objects; the starting location is hidden (`StartingLocationThumbnailRenderingListener`).

import { OPENING, openingSight, prepareOpening } from "../core/analysis/opening";
import { castPicture, looksScore, PIXEL, preparePicture, type OpeningPicture, type PictureCamera, type PictureLand, type PreparedPicture } from "../core/analysis/picture";
import { bestHeading, readsThrough, SEE_HEADINGS, seeThrough, underRock } from "../core/analysis/seeThrough";
import { fallsOf } from "../core/analysis/vertical";
import { ORIENTATIONS, startMiddleTile } from "../core/format/footprints";
import { columnMasks, type EntityView, type MapView } from "./model";

/** The picture's camera, in the renderer's terms (`MapRenderer.setView`; world X east, Y up, Z south), and its
 *  vertical field of view in degrees. */
export interface HeroCamera {
  yaw: number;
  pitch: number;
  distance: number;
  target: [number, number, number];
  fov: number;
}

/** The game's default thumbnail camera's pitch (`ThumbnailCameraDefaultPositionProvider.DefaultRotation`). */
const PITCH = 40;
const deg = (d: number) => (d * Math.PI) / 180;

/** The picture's camera on a W × H map (`heights` its ground), turned to `orientation` (0–3: the start's, a quarter
 *  turn each; 0 looks north): 40° down, face-on, centred across the map, pulled back as far as the frame's four corners
 *  still land on the map at the ground's mean level (16:9, `OPENING.fov` high), so the land fills the frame. Along the
 *  map, where the frame has room to slide with no backdrop showing, it takes the best of `SLIDES` places by the looks
 *  score of `land`'s picture from each (`pictureLand`), the map's middle where they score the same. In tile terms:
 *  `x`, `y` the point looked at (tile x, tile y), `level` its height. */
export function heroCamera(W: number, H: number, heights: ArrayLike<number>, orientation: number, land: PictureLand | PreparedPicture | null = null): { x: number; y: number; level: number; distance: number; pitch: number; yaw: number } {
  let sum = 0;
  for (let i = 0; i < W * H; i++) sum += heights[i];
  const level = W * H ? sum / (W * H) : 0;
  const o = orientation & 3;
  const p = deg(PITCH);
  const tanV = Math.tan(deg(OPENING.fov / 2));
  const tanH = tanV * OPENING.aspect;
  // a corner ray (b 1 the frame's top, −1 its bottom) meets the ground's plane at t × the distance along it; where it
  // lands, along the look and across it, per unit of distance
  const t = (b: number) => Math.sin(p) / (Math.sin(p) - b * tanV * Math.cos(p));
  const along = (b: number) => -Math.cos(p) + t(b) * (Math.cos(p) + b * tanV * Math.sin(p));
  const far = along(1);
  const near = along(-1);
  // the map's length along the look and its width across it
  const [len, wide] = o % 2 === 0 ? [H, W] : [W, H];
  const distance = Math.min(len / (far - near), wide / (2 * tanH * t(1)));
  // the frame's footprint centred along the map (s: the point looked at, from the map's edge nearest the camera), or
  // slid within the room it has to where it shows the most interest
  const middle = len / 2 - (distance * (far + near)) / 2;
  const s = land ? slide(land, o, level, distance, p, tanH, tanV, -distance * near, len - distance * far, middle) : middle;
  const [x, y] = lookedAt(W, H, o, s);
  return { x, y, level, distance, pitch: p, yaw: -deg(o * 90) };
}

/** How many places along the map the picture's frame is scored at (each a picture cast, about 40 ms at 160 × 90). */
export const SLIDES = 5;

/** The point looked at (tile x, tile y) for orientation `o`, `s` along the map from its edge nearest the camera. */
const lookedAt = (W: number, H: number, o: number, s: number): [number, number] => (o === 0 ? [W / 2, s] : o === 1 ? [s, H / 2] : o === 2 ? [W / 2, H - s] : [W - s, H / 2]);

/** Of `SLIDES` places along the map from `lo` to `hi` (and its middle), the one whose picture from the camera scores
 *  best by the looks score among those that show no more of the backdrop past the map than the middle does; ties keep
 *  the place nearest the middle. */
function slide(land: PictureLand | PreparedPicture, o: number, level: number, d: number, p: number, tanH: number, tanV: number, lo: number, hi: number, middle: number): number {
  if (!(hi - lo > 1)) return middle;
  const a = (o * Math.PI) / 2;
  const look: [number, number] = [Math.round(Math.sin(a)), Math.round(Math.cos(a))];
  const right: [number, number] = [look[1], -look[0]];
  const sinP = Math.sin(p);
  const cosP = Math.cos(p);
  const { W, H } = "prepared" in land ? land.land : land;
  const judge = (s: number) => {
    const [x, y] = lookedAt(W, H, o, s);
    const eye: [number, number, number] = [x - look[0] * d * cosP, y - look[1] * d * cosP, level + d * sinP];
    const pic = castPicture(land, { eye, look, right, sinP, cosP, tanH, tanV });
    let empty = 0;
    for (let k = 0; k < pic.kind.length; k++) if (pic.kind[k] === PIXEL.void) empty++;
    return { score: looksScore(pic).score, empty };
  };
  let best = middle;
  const here = judge(middle);
  let most = here.score;
  for (let k = 0; k < SLIDES; k++) {
    const s = lo + ((hi - lo) * k) / (SLIDES - 1);
    // (the middle, one of them where the room is even about it, is judged once)
    if (Math.abs(s - middle) < 1e-9) continue;
    const v = judge(s);
    // (never more of the backdrop than the middle shows: the room is worked out at the ground's mean level, so land
    // lower than that at its end can show a strip of it, which the looks score only weighs over 30%)
    if (v.empty > here.empty) continue;
    if (v.score > most + 1e-9 || (Math.abs(v.score - most) <= 1e-9 && Math.abs(s - middle) < Math.abs(best - middle))) {
      best = s;
      most = v.score;
    }
  }
  return best;
}

/** The map as the looks score reads it (core `analysis/picture.ts` `PictureLand`), from the view: its ground (every
 *  tile's voxels as a mask on a map with columns), its water on every column, its soil's moisture in the game's levels
 *  and its objects. */
export function pictureLand(view: MapView): PictureLand {
  const { W, H, heights, water } = view;
  const N = W * H;
  const listed = columnMasks(N, view.columns);
  let mask: Uint32Array | null = null;
  if (listed) {
    const listedAt = new Uint8Array(N);
    for (const t of view.columns.tiles) listedAt[t] = 1;
    mask = new Uint32Array(N);
    for (let i = 0; i < N; i++) mask[i] = listedAt[i] ? listed[i] : heights[i] >= 32 ? 0xffffffff : (1 << heights[i]) - 1;
  }
  // the water's columns, q × N + i for the q-th column of tile i
  const count = new Uint8Array(N);
  for (let k = 0; k < water.count; k++) count[water.tile[k]]++;
  let most = 0;
  for (let i = 0; i < N; i++) if (count[i] > most) most = count[i];
  const floor = new Float32Array(Math.max(1, most) * N);
  const depth = new Float32Array(Math.max(1, most) * N);
  const contamination = new Float32Array(Math.max(1, most) * N);
  const at = new Uint8Array(N);
  for (let k = 0; k < water.count; k++) {
    const i = water.tile[k];
    const c = at[i]++ * N + i;
    floor[c] = water.floor[k];
    depth[c] = water.depth[k];
    contamination[c] = water.contamination[k];
  }
  const moisture = new Float32Array(N);
  if (view.soil) for (let i = 0; i < N; i++) moisture[i] = view.soil.moisture[i] / 15;
  const e = view.entities;
  const entities = Array.from({ length: e.count }, (_, k) => ({ template: e.templates[e.template[k]], x: e.x[k], y: e.y[k] }));
  return { W, H, heights, mask, water: new Float32Array(N), contamination: new Float32Array(N), stack: { count, floor, depth, contamination }, moisture, entities };
}

/** The start (its corner tile, level and orientation 0–3), or null. */
function startOf(e: EntityView): { x: number; y: number; z: number; o: number } | null {
  for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") return { x: e.x[k], y: e.y[k], z: e.z[k], o: e.orientation[k] & 3 };
  return null;
}

/** The view without its starting location (the game's thumbnail hides it). */
function withoutStart(e: EntityView): EntityView {
  const keep: number[] = [];
  for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] !== "StartingLocation") keep.push(k);
  if (keep.length === e.count) return e;
  const typed = <A extends Int16Array | Uint16Array | Uint8Array | Float32Array>(a: A): A => {
    const out = new (a.constructor as new (n: number) => A)(keep.length);
    keep.forEach((k, j) => (out[j] = a[k]));
    return out;
  };
  return {
    count: keep.length,
    templates: e.templates,
    owners: e.owners,
    template: typed(e.template),
    x: typed(e.x),
    y: typed(e.y),
    z: typed(e.z),
    orientation: typed(e.orientation),
    flags: typed(e.flags),
    owner: typed(e.owner),
    variant: typed(e.variant),
    strength: typed(e.strength),
    ids: keep.map((k) => e.ids[k] ?? ""),
    ...(e.stockGood && e.stockAmount ? { stockGood: typed(e.stockGood), stockAmount: typed(e.stockAmount) } : {}),
  };
}

// ------------------------------------------------------------------------------ the map's sight

/** A sight camera, in tile terms (`heroCamera`'s). */
type SightCam = { x: number; y: number; level: number; distance: number; pitch: number; yaw: number };

/** The sight camera's pitches (degrees down: lower than the thumbnail camera's 40°, so a landmark's height shows),
 *  distances (tiles from the point looked at: the nearest frames about 50 tiles across, the landmark large at the
 *  picker's size) and steps back toward the start (tiles: the colony's ground in front of the sight). */
const SIGHT_PITCHES = [30, 40] as const;
const SIGHT_DISTANCES = [45, 65, 85] as const;
const SIGHT_BACKS = [0, 12] as const;
/** An arch's camera, nearer (a form is a few tiles across, a landmark tens): through it at the angles it was found to
 *  read through at (analysis/seeThrough.ts: 30° and 45°). */
const ARCH_PITCHES = [30, 45] as const;
const FORM_DISTANCES = [26, 36, 48] as const;
/** The frames are judged on pictures of a fifth of the full one's rays (`SCREEN`: a few dozen frames are tried, each
 *  cast through the map); the frame chosen is checked again on the full picture (`PICTURE_W` × `PICTURE_H`). */
const SCREEN = { w: 64, h: 36 };
/** The most of the frame a sight picture may show of the backdrop past the map's edge (the trees' crowns counted as
 *  letting it show: `OpeningPicture.veiled`). */
export const SIGHT_VOID = 0.05;
/** What the 3D forms a picture shows add to its looks score (`pictureValue`): its share of pixels seen beneath rock
 *  (`OpeningPicture.under`), in full from `UNDER_FULL` of the frame, and the share seen through an opening to the land
 *  beyond (an arch's window: the form that reads best at the picker's size, where a shelter's shade is a dark band), in
 *  full from `THROUGH_FULL`. A form's own frame counts only from `FORM_LEAST` beneath rock (less is a lip or a crack). */
export const FORM_VALUE = { under: 0.2, through: 0.6 } as const;
export const UNDER_FULL = 0.06;
export const THROUGH_FULL = 0.02;
export const FORM_LEAST = 0.015;
/** How much less a form's frame may score by the looks score alone (core `analysis/picture.ts` `looksScore`, the
 *  measure fitted to the eye, D506) than the landmark's and still take the card from it: a form is shown where the
 *  picture is no worse to the eye for it, never in place of a better one (Any 6's falls and river, D488 audit). */
export const LOOKS_GIVE = 0.1;
/** The forms looked at, the largest mouths first (each a few pictures cast). */
const FORMS_MOST = 6;
/** A form's mouth, at least: faces of air beneath rock open to the sky beside it. */
const MOUTH_LEAST = 3;
/** The most air cells of a form the sightlines through it are cast from (a larger one is sampled evenly). */
const SEE_CELLS = 160;

/** The share of a picture's pixels that show the backdrop past the map's edge as it is drawn: the void, and the void
 *  behind the trees' crowns. */
export function voidShare(pic: OpeningPicture): number {
  let n = 0;
  for (let k = 0; k < pic.kind.length; k++) if (pic.kind[k] === PIXEL.void || pic.veiled[k]) n++;
  return n / pic.kind.length;
}

/** What a picture is worth to the map's picture: its looks score, and the 3D forms it shows (`FORM_VALUE`); with the
 *  shares seen beneath rock and through it. */
export function pictureValue(pic: OpeningPicture): { value: number; looks: number; under: number; through: number } {
  let u = 0;
  let t = 0;
  for (let k = 0; k < pic.under.length; k++) {
    if (pic.under[k]) u++;
    if (pic.under[k] === 2) t++;
  }
  const under = u / pic.under.length;
  const through = t / pic.under.length;
  const looks = looksScore(pic).score;
  return { value: looks + FORM_VALUE.under * Math.min(1, under / UNDER_FULL) + FORM_VALUE.through * Math.min(1, through / THROUGH_FULL), looks, under, through };
}

/** A 3D form as the picture's land holds it (its voxels, `PictureLand.mask`): a group of tiles with air beneath rock.
 *  `arch`: an opening the game's camera sees through (analysis/seeThrough.ts `readsThrough`, the rule an arch is grown
 *  by), looked through along the way it reads best, at the middle of its air; else a cave or an overhang, looked into
 *  against its mouth's way out, at the middle of its mouth (the faces of that air open to the sky beside it). The point
 *  is tile x, tile y and height in levels, the look a unit grid direction; `mouth` the size of its mouth in faces. */
export interface FormSight {
  x: number;
  y: number;
  z: number;
  look: [number, number];
  arch: boolean;
  mouth: number;
}

const D4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The 3D forms of `land` (none without voxels), the largest mouths first, at most `FORMS_MOST`. */
export function formSights(land: PictureLand): FormSight[] {
  const { W, H } = land;
  if (!land.mask) return [];
  const N = W * H;
  const mask = land.mask instanceof Uint32Array ? land.mask : Uint32Array.from(land.mask);
  const top = new Uint8Array(N);
  const hollow = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const m = mask[i];
    top[i] = m ? 32 - Math.clz32(m) : 0;
    // (air below the tile's top voxel: rock over air)
    hollow[i] = (m & (m + 1)) !== 0 ? 1 : 0;
  }
  const seen = new Uint8Array(N);
  const groups: { tiles: number[]; mouth: number; way: number[]; at: number[][] }[] = [];
  for (let s = 0; s < N; s++) {
    if (!hollow[s] || seen[s]) continue;
    // the group: hollow tiles touching, corners included
    const tiles = [s];
    seen[s] = 1;
    for (let k = 0; k < tiles.length; k++) {
      const i = tiles[k];
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (hollow[j] && !seen[j]) {
            seen[j] = 1;
            tiles.push(j);
          }
        }
    }
    // its mouth: each face between air beneath its rock and air open to the sky beside it, by the way it faces
    let n = 0;
    const way = [0, 0, 0, 0];
    const at = [0, 0, 0, 0].map(() => [0, 0, 0]);
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      const m = mask[i];
      for (let z = 0; z + 1 < top[i]; z++) {
        if ((m >>> z) & 1) continue;
        for (let d = 0; d < 4; d++) {
          const xx = x + D4[d][0];
          const yy = y + D4[d][1];
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (top[yy * W + xx] > z) continue;
          n++;
          way[d]++;
          at[d][0] += x + 0.5 + D4[d][0] * 0.5;
          at[d][1] += y + 0.5 + D4[d][1] * 0.5;
          at[d][2] += z + 0.5;
        }
      }
    }
    if (n >= MOUTH_LEAST) groups.push({ tiles, mouth: n, way, at });
  }
  groups.sort((a, b) => b.mouth - a.mouth);
  const st = land.stack ?? null;
  const wet = (i: number, z: number): boolean => {
    if (!st) return z < land.heights[i] + land.water[i] && land.water[i] > 0.05;
    for (let q = 0; q < st.count[i]; q++) {
      const c = q * N + i;
      if (st.depth[c] > 0.05 && z >= st.floor[c] && z < st.floor[c] + st.depth[c]) return true;
    }
    return false;
  };
  const out: FormSight[] = [];
  for (const g of groups.slice(0, FORMS_MOST)) {
    const { way, at, mouth: n } = g;
    // an opening with mouths on two sides: does the game's camera see through it?
    if ((way[0] && way[1]) || (way[2] && way[3])) {
      let cells = underRock(mask, N, g.tiles);
      if (cells.length > SEE_CELLS) cells = cells.filter((_, k) => k % Math.ceil(cells.length / SEE_CELLS) === 0);
      const s = seeThrough({ W, H, mask, wet }, cells, true);
      if (readsThrough(s, [0, 1, 2, 3])) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (const c of cells) {
          const i = c % N;
          x += (i % W) + 0.5;
          y += Math.floor(i / W) + 0.5;
          z += (c - i) / N + 0.5;
        }
        const [hx, hy] = SEE_HEADINGS[bestHeading(s)];
        out.push({ x: x / cells.length, y: y / cells.length, z: z / cells.length, look: [hx, hy], arch: true, mouth: n });
        continue;
      }
    }
    // a cave or an overhang: looked into against the way out of it, every face of its mouth summed
    const ox = way[0] - way[1];
    const oy = way[2] - way[3];
    const len = Math.hypot(ox, oy);
    if (len >= 0.35 * n) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let d = 0; d < 4; d++) (x += at[d][0]), (y += at[d][1]), (z += at[d][2]);
      out.push({ x: x / n, y: y / n, z: z / n, look: [-ox / len, -oy / len], arch: false, mouth: n });
      continue;
    }
    // (mouths facing apart that it is not seen through: into the larger of them)
    let d = 0;
    for (let k = 1; k < 4; k++) if (way[k] > way[d]) d = k;
    out.push({ x: at[d][0] / way[d], y: at[d][1] / way[d], z: at[d][2] / way[d], look: [-D4[d][0], -D4[d][1]], arch: false, mouth: n });
  }
  return out;
}

/** Whether the line from `eye` to `to` (tile x, tile y, height) runs through air, to within a tile of `to` (a form's
 *  mouth or window is air beside rock): marched a quarter tile at a time, off the map counted as air. */
export function clearTo(land: PictureLand, eye: readonly [number, number, number], to: readonly [number, number, number]): boolean {
  const { W, H, mask, heights } = land;
  const d = Math.hypot(to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]);
  const n = Math.floor((d - 1) * 4);
  for (let k = 0; k <= n; k++) {
    const f = k / (4 * d);
    const x = Math.floor(eye[0] + (to[0] - eye[0]) * f);
    const y = Math.floor(eye[1] + (to[1] - eye[1]) * f);
    const z = Math.floor(eye[2] + (to[2] - eye[2]) * f);
    if (x < 0 || y < 0 || x >= W || y >= H || z >= 32) continue;
    if (z < 0) return false;
    const i = y * W + x;
    if (mask ? ((mask[i] >>> z) & 1) === 1 : z < heights[i]) return false;
  }
  return true;
}

/** A sight's frame: its camera, what it is worth (`pictureValue`, on the screening picture) and the least share
 *  beneath rock it takes. */
export interface SightFrame {
  value: number;
  looks: number;
  under: number;
  through: number;
  least: number;
  c: SightCam;
}

/** The best frame on the point `at` (tile x, tile y, height) looking along `look` (a unit grid direction), of
 *  `pitches` × `distances` × `backs` (tiles the point looked at steps back along the look): those `keep` lets by
 *  (where the sight shows in the frame) that show no more than `SIGHT_VOID` of the backdrop and something beneath rock
 *  over `least` of the frame or more; of them the nearest, the best by `pictureValue` among those as near. */
function bestFrame(prep: PreparedPicture, at: [number, number, number], look: [number, number], pitches: readonly number[], distances: readonly number[], backs: readonly number[], least: number, keep: (eye: [number, number, number], p: number) => boolean): SightFrame | null {
  const [lx, ly] = look;
  const right: [number, number] = [ly, -lx];
  const tanV = Math.tan(deg(OPENING.fov / 2));
  const tanH = tanV * OPENING.aspect;
  let best: SightFrame | null = null;
  for (const d of distances) {
    // (a nearer frame that passes wins: the sight reads at the picker's size)
    if (best) break;
    for (const pd of pitches)
      for (const back of backs) {
        const p = deg(pd);
        const sinP = Math.sin(p);
        const cosP = Math.cos(p);
        const tx = at[0] - lx * back;
        const ty = at[1] - ly * back;
        const eye: [number, number, number] = [tx - lx * d * cosP, ty - ly * d * cosP, at[2] + d * sinP];
        if (!keep(eye, p)) continue;
        const pic = castPicture(prep, { eye, look, right, sinP, cosP, tanH, tanV }, SCREEN);
        if (voidShare(pic) > SIGHT_VOID) continue;
        const v = pictureValue(pic);
        if (v.under < least) continue;
        if (!best || v.value > best.value + 1e-9) best = { ...v, least, c: { x: tx, y: ty, level: at[2], distance: d, pitch: p, yaw: Math.atan2(-lx, ly) } };
      }
  }
  return best;
}

/** Every sight's best frame (`sightCamera`): the landmark's first (null when it has none that passes), then each
 *  arch's that has one. Only an arch is framed: at the card's 26 to 48 tiles every form's opening is large (each
 *  clears the forms measure's 400 px² of an 800 × 450 frame many times over, and River Valley 2's overhang shows more
 *  of its opening than Highlands 12's arch), so its size cannot tell a form that reads from one that does not; an
 *  arch is seen through to the land beyond and reads as one, where an overhang's or a cave's opening is a dark band
 *  under a cliff face (planning, #236). Overhangs and caves never take the card. `prep`: `land` prepared once
 *  (`preparePicture`) for the many pictures cast. */
export function sightFrames(view: MapView, land: PictureLand, prep: PreparedPicture = preparePicture(land)): { landmark: SightFrame | null; forms: { form: FormSight; frame: SightFrame }[] } {
  const s = startOf(view.entities);
  if (!s) return { landmark: null, forms: [] };
  const forms: { form: FormSight; frame: SightFrame }[] = [];
  for (const f of formSights(land)) {
    if (!f.arch) continue;
    // (the form in sight of the eye: nothing between them but air, one ray before the picture's)
    const frame = bestFrame(prep, [f.x, f.y, f.z], f.look, ARCH_PITCHES, FORM_DISTANCES, [0], FORM_LEAST, (eye) => clearTo(land, eye, [f.x, f.y, f.z]));
    if (frame) forms.push({ form: f, frame });
  }
  return { landmark: landmarkFrame(view, land, prep, s), forms };
}

/** The picture's camera on the map's sight (showcase gap 10): the best by `pictureValue` (the looks score, and the
 *  arch the frame shows beneath its rock and through it) of
 *  - **the landmark** the opening frame holds, as the landmark intention reads it (core `analysis/opening.ts`
 *    `openingSight`: a standing form, else a fall of 6+), seen from the colony's side (the camera looks from the
 *    start's middle toward it), its middle height at the frame's middle, from `SIGHT_PITCHES` × `SIGHT_DISTANCES` ×
 *    `SIGHT_BACKS`, holding the sight's top;
 *  - **each rock arch** (`formSights`' arches, looked through; never an overhang or a cave: `sightFrames`), at the
 *    frame's middle, from `ARCH_PITCHES` × `FORM_DISTANCES`, seen beneath its rock over `FORM_LEAST` of the frame or
 *    more, and scoring by the looks score alone no more than `LOOKS_GIVE` under the landmark's frame, or, on a map with
 *    no landmark frame, under the whole map's (`heroCamera`, its picture cast at the arches' `SCREEN` size so the two
 *    are judged alike): an arch never takes the card from a picture that shows the map's theme better (Delta 8's
 *    channels and Islands 1's islands had given way to a slot in a cliff).
 *  Every frame shows no more than `SIGHT_VOID` of the backdrop; of one sight's frames the nearest wins (the sight
 *  largest), the best among those as near. Null when the map has no start, or no frame passes: the whole-map camera
 *  then. */
export function sightCamera(view: MapView, land: PictureLand, prep: PreparedPicture = preparePicture(land), whole: () => SightCam = () => wholeMap(view, prep)): SightCam | null {
  const { landmark, forms } = sightFrames(view, land, prep);
  // (a form's frame only where it looks as good as the landmark's, or the whole map's where there is no landmark,
  // within `LOOKS_GIVE`; the best first, the landmark before a form as good; each checked again on the full picture,
  // the next taken where that shows more of the backdrop, or less beneath rock, than the screening did)
  const least = landmark ? landmark.looks - LOOKS_GIVE : forms.length ? looksScore(castPicture(prep, sightCast(whole()), SCREEN)).score - LOOKS_GIVE : -Infinity;
  const all = [...(landmark ? [landmark] : []), ...forms.map((f) => f.frame).filter((f) => f.looks >= least)].map((f, k) => ({ f, k })).sort((a, b) => b.f.value - a.f.value || a.k - b.k);
  for (const { f } of all) if (framePasses(prep, f.c, f.least)) return f.c;
  return null;
}

/** Whether the full picture from `c` shows no more than `SIGHT_VOID` of the backdrop and `least` or more beneath
 *  rock. */
export function framePasses(land: PictureLand | PreparedPicture, c: SightCam, least: number): boolean {
  const pic = castPicture(land, sightCast(c));
  return voidShare(pic) <= SIGHT_VOID && pictureValue(pic).under >= least;
}

/** The picture's camera from a sight camera (tile terms). */
export function sightCast(c: SightCam): PictureCamera {
  const lx = -Math.sin(c.yaw);
  const ly = Math.cos(c.yaw);
  const sinP = Math.sin(c.pitch);
  const cosP = Math.cos(c.pitch);
  const tanV = Math.tan(deg(OPENING.fov / 2));
  return { eye: [c.x - lx * c.distance * cosP, c.y - ly * c.distance * cosP, c.level + c.distance * sinP], look: [lx, ly], right: [ly, -lx], sinP, cosP, tanH: tanV * OPENING.aspect, tanV };
}

/** The landmark's frame (`sightCamera`), or null. */
function landmarkFrame(view: MapView, land: PictureLand, prep: PreparedPicture, s: { x: number; y: number; z: number; o: number }): SightFrame | null {
  const { W, H, heights } = view;
  const orientation = ORIENTATIONS[s.o];
  const [sx, sy] = startMiddleTile({ x: s.x, y: s.y, z: s.z, orientation });
  // each tile's water over its ground (its top column standing on it), for the falls
  const N = W * H;
  const D = new Float32Array(N);
  const st = land.stack;
  if (st) for (let i = 0; i < N; i++) for (let q = 0; q < st.count[i]; q++) {
    const c = q * N + i;
    if (st.floor[c] === heights[i] && st.depth[c] > 0) D[i] = st.depth[c];
  }
  const sight = openingSight(prepareOpening(heights, W, H, D, fallsOf(heights, D, W, H, 1.5)), { x: sx, y: sy, z: s.z, orientation });
  if (!sight) return null;
  let lx = sight.x + 0.5 - (sx + 0.5);
  let ly = sight.y + 0.5 - (sy + 0.5);
  const len = Math.hypot(lx, ly);
  if (!(len > 1)) return null;
  lx /= len;
  ly /= len;
  const tanV = Math.tan(deg(OPENING.fov / 2));
  const tanH = tanV * OPENING.aspect;
  // the sight's top in the frame (its middle line kept clear of the frame's edges)
  const keep = (eye: [number, number, number], p: number) => {
    const sinP = Math.sin(p);
    const cosP = Math.cos(p);
    const dx = sight.x + 0.5 - eye[0];
    const dy = sight.y + 0.5 - eye[1];
    const dz = sight.z - eye[2];
    const ahead = dx * lx + dy * ly;
    const zc = ahead * cosP - dz * sinP;
    if (!(zc > 0)) return false;
    const u = (dx * ly - dy * lx) / (zc * tanH);
    const v = (ahead * sinP + dz * cosP) / (zc * tanV);
    return !(Math.abs(u) > 0.85 || v > 0.85 || v < -0.7);
  };
  return bestFrame(prep, [sight.x + 0.5, sight.y + 0.5, sight.z - sight.stand / 2], [lx, ly], SIGHT_PITCHES, SIGHT_DISTANCES, SIGHT_BACKS, 0, keep);
}

/** The whole map's camera (`heroCamera`), turned to the start's orientation. */
function wholeMap(view: MapView, prep: PreparedPicture): SightCam {
  const s = startOf(view.entities);
  return heroCamera(view.W, view.H, view.heights, s ? s.o : 0, prep);
}

/** What the picture draws (the map, its start hidden) and the camera it draws it from: on the map's sight where it
 *  has one (`sightCamera`), else the whole map from the game's thumbnail camera (`heroCamera`). */
export function heroScene(view: MapView): { view: MapView; camera: HeroCamera } {
  const land = pictureLand(view);
  // (the land's per-tile setup made once for every picture cast in choosing the frame; the whole map's camera found
  // once, where an arch is weighed against it or no sight frame passes)
  const prep = preparePicture(land);
  let found: SightCam | null = null;
  const whole = () => (found ??= wholeMap(view, prep));
  const c = sightCamera(view, land, prep, whole) ?? whole();
  const camera: HeroCamera = { yaw: c.yaw, pitch: c.pitch, distance: c.distance, target: [c.x, c.level, -c.y], fov: OPENING.fov };
  return { view: { ...view, entities: withoutStart(view.entities) }, camera };
}
