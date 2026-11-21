// The bold family (docs/design/uplands.md, round 5): above 128², Highlands' and Canyon's rings bunch. The game's bold
// maps (Terraces, Oasis, Hollows, Canyon, Pressure) hold the same calm ring terraces as its gentle ones, but in places
// the rings close up into a wall four to six levels tall within a tile or two, round a form with a name: a mesa, a
// hollow, a gorge's two faces with a bench between. Each wall here is a steep band in a form's smooth profile, laid on
// the graded levels before the edge warp and the snap (`levels.ts` `snapLevels`), never noise, so its line runs as
// smooth as the rings round it; the warp then bends it as it bends them.
//
// - Highlands stands up (round 6, `STAND`): few forms with tall walls on a floor, as the game's Terraces. A valley sunk
//   in the map's middle (`standValley`: a lobed bowl and the channel the water takes through it, its floor two or more
//   levels under the floor round it, the field the water is planned on sunk with it, `lowerValley`), a gentle floor in
//   rings (`levels.ts`), and on it four to six mesas a 256² (`standMesas`), radius 24–46 (about 48–92 tiles across
//   before the stretch), each a wall of 4–6 levels over most of its rim and broken, stepped ground over the rest, where
//   the slopes find a way up. The field the water is planned on stands high under each, so no river is planned across
//   one. Their rims are kept from the walls' notches (`notchWalls`): their ways are their own. Round 6c: the bowl lies
//   off the map's middle, its way and distance stepping on from seed to seed, and the high ground is a massif on one
//   or two sides of it (`standMassif`), across the lake from the start's bench, its front bowed, bayed and cut by
//   ravines, its back two tables with knolls; the mesas stand on its side of the bowl, and every broad top steps
//   (`stepOf`), so the maps differ from one another and no top lies dead flat.
// - Canyon, the gorge (`boldGorge`): where the gorge's wall is steep, a bench is cut into the tableland's edge
//   `rise` levels over the floor, its width wandering along the gorge (none in places, where the wall stands whole),
//   so the gorge's side is two faces, the lower the taller; and one or two hollows off the gorge, a lobed bowl cut into
//   the tableland at its rim, its floor `over` levels over the gorge's, open to it.
// Exact arithmetic throughout: + − × ÷, `portable.sqrt`, the integer-hash noise.

import * as portable from "../math/portable";
import { stream } from "../math/rng";
import { fbm, warpedFbm } from "../math/noise";
import { clamp, smoothstep } from "../math/clamp";
import { hash32 } from "../math/hash";
import { sinDet, TWO_PI } from "../math/detmath";
import { formDist, pseudoAngle, type RingForm } from "./rings";
import { DIRS8 } from "./num";
import { distanceFrom } from "../math/grid";

/** The golden share of a turn, (√5 − 1) / 2: steps by it from one seed to the next never come back near one another. */
const GOLDEN = 0.6180339887498949;

/** The bold family's numbers. `bench`: its rise over the gorge's floor (levels), its width (tiles) and how far that
 *  wanders, over what cell, and how steep (levels a tile) the gorge's wall must be for one. `hollow`: how many (fewest,
 *  most), their radius (tiles), their floor over the gorge's (levels). */
export const BOLD = {
  bench: { rise: 4, width: 9, vary: 8, cell: 64, steep: 0.6 },
  hollow: { fewest: 1, most: 2, rMin: 13, rMax: 20, over: 2, tries: 60 },
} as const;

/** Highlands stands up (uplands round 6): a few mesas with walls on a gentle floor, the valley sunk in the map.
 *  `valley`: the bowl's radius (a share of the map's narrower side, least and most), how far its middle lies from the
 *  map's (round 6c: `offMin`–`offMax` of the side, near on odd seeds and far on even ones, `band` of that range each; its
 *  way the golden share of a turn on from the seed before, `spread` of a turn either way; kept `keep` radii and `edge`
 *  of the side from the map's edges; across the water's way no more than `lat` of the side), how wide its rim's fall is (tiles, least and most); the channel through it from the
 *  upstream edge to the downstream one, its half width (a share of the side, least and most), how far it wanders
 *  (a share of the side) over what cell (a share of the side), how wide its sides' fall (tiles); the valley's floor
 *  over the base (levels) where it leaves the map downstream and how much higher where it enters. `floor`: the floor's
 *  lowest level over the base and its relief (levels), its grade's roll (times the theme's). `mesa`: how many a 256²
 *  map draws (fewest, most), their radius at 256² (tiles), their wall (levels over the ground at their rim), the calm
 *  ground kept between two and between one and the valley (tiles past their radii), the wall's width (tiles), how
 *  far one stretches along its axis at the most, the share of its rim that is broken and stepped (least and most), the
 *  tiles a level there (least and most) and how far its broken edge eats into the top (tiles), the draws tried;
 *  round 6c: the least cosine of a mesa's way from the bowl against the massif's (`open`), and the last `buttes` drawn
 *  anywhere, `butte` of the radius; none within `benchCos` of the bench's way from the bowl and `benchFar` of its
 *  radius. `lake` (round 6b): the bowl's bench over the base and the lake's hollow under it
 *  (levels), the lake's share of the bowl and of the plan's lake budget at the most, its middle up the water's line from
 *  the bowl's rim and how far past the channel's run the sill's rock reaches (shares of the radius), the scale it is
 *  read at down the line, its shore's fall (tiles), the channel's run at the bench's level past the rim (tiles), and
 *  the main river's incision on such a land at the most; round 6b step 2: how far down the line the lake is read
 *  (`stretch`), its outline's lobes and the noise its shore is read with (`bays`, over `baysCell` of the radius);
 *  step 3: how far the lake's middle lies off the line, away from the bench (`shift`, a share of the radius), and the
 *  bench's shore: how far down the line it is read (`benchStretch`), its outline's lobes (`benchLobes`), and the
 *  turn from it to the far shore's lobes (where the direction from the lake's middle leans `benchCos` towards the
 *  bench, over `benchTurn`); round 6c: how far across the water's way the bowl must lie for the bench to take the side
 *  facing the map's middle (`benchLean`, a share of the side), and where beside the lake the line's wander is read to
 *  turn it away from the bench (`benchAt`, radii down the line from the bowl's middle); in front of the bench, within
 *  `plain` radii of the bowl, the floor lies at the bench's own level (`levels.ts` `snapLevels`). `springs`
 *  (step 2): the springs such a land draws at the most. `bench` (step 2): the rings the floor steps down to the bowl
 *  and the channel past the sill in, each `min`–`max` tiles broad over a noise of `cell` tiles, wobbling `wobble`
 *  tiles, `rings` of them, `step` levels each. `mesa.plinth` (step 2; step 4: under the stepped side only): the levels
 *  of the bench a mesa's stepped side ends on, `plinthMin`–`plinthMax` tiles broad; `mesa.first` the least share of
 *  the radii the first mesa is drawn from. Step 5: the badwater's ground kept off (`standBadKeep`): round the bowl (`badView`, a share of the side),
 *  beside the channel (`badBeside`, tiles) but within `badJoin` tiles of the water it joins, and round the plan's start
 *  (`badFar`, tiles: the opening view pulled back reaches about that far to each side, whatever the map's side,
 *  gen/generate.ts, which keeps it off that start's opening view too); the channel's bend outside the bowl (`valley.bend`, a share of the side: past the sill a meander
 *  `meander` of the side long at half that swing and a noise over `bendCell` of the side, from the sill's run on; up
 *  the flow the noise alone, from 1.5 radii out), so it winds where it ran straight as a chute (seed 3). Round 6c:
 *  `massif` (`standMassif`): its way's turn off the side across from the bench (a share of a turn; one way on odd seeds,
 *  the other on even), its front past the bowl's middle (`frontMin`–`frontMax` radii, drawn in no closer than
 *  `frontLeast`), the share of the map it holds (`least`–`most`), its flanks' bow (`bendMin`–`bendMax` over the side,
 *  at most `bendMost`), the least share of the map past the bowl a way must leave it (`room`), how fast its front
 *  draws back on the bench's side of the water's line (`benchPush`, tiles a tile), its front's sway and
 *  bays (shares of the side and tiles, over cells), its back `under` levels under the map's top and a second table
 *  `tier` higher, belts `belt` tiles deep bent by `beltBend` over `beltCell`, the lower table stepped `stepIn` of a
 *  belt's depth inside its walls, ravines every `ravineGap` tiles `ravineMin`–`ravineMax` deep, `ravineHalf` half wide,
 *  wandering `ravineWander` over `ravineCell`, its wall's width (tiles), the benches kept `benchFree` tiles off, the
 *  floor falling to its lowest level within `foot` tiles of its front, and the share of the floor's rise away from the
 *  valley kept across from it (`floorLo`, `levels.ts`); `steps` (`stepOf`): a top's steps, `run` tiles each,
 *  `rise` levels, bent `bend` over `cell`. */
export const STAND = {
  springs: 1,
  badView: 0.08,
  badFar: 60,
  badBeside: 6,
  badJoin: 6,
  valley: { rMin: 0.14, rMax: 0.18, offMin: 0.1, offMax: 0.26, spread: 0.05, band: 0.35, lat: 0.14, keep: 1.35, edge: 0.04, softMin: 1.2, softMax: 3.5, halfMin: 0.026, halfMax: 0.038, wander: 0.11, cell: 0.3, side: 1.5, over: 0, rise: 2, bend: 0.09, bendCell: 0.16, meander: 0.28 },
  lake: { sill: 2, deep: 2, share: 0.35, budget: 0.6, at: 0.7, sillPast: 0.2, soft: 1, sillRun: 4, incise: 1.4, stretch: 0.5, lobes: 2.6, bays: 0.12, baysCell: 0.35, shift: 0.12, benchStretch: 0.6, benchLobes: 1.5, benchCos: 0.35, benchTurn: 0.3, benchLean: 0.03, benchAt: 0.3, plain: 2.2 },
  bench: { min: 5, max: 13, cell: 40, wobble: 3, rings: 3, step: 2 },
  floor: { over: 4, relief: 4, roll: 0, riser: 0, drift: 0, away: 0.5, far: 0.5 },
  mesa: { fewest: 4, most: 6, rMin: 24, rMax: 46, hMin: 4, hMax: 6, gap: 8, edge: 0.6, wall: 0.5, stretch: 0.35, brokenMin: 0.12, brokenMax: 0.25, runMin: 1.8, runMax: 4.5, inset: 7, first: 0.85, tries: 200, plinth: 2, plinthMin: 4, plinthMax: 9, open: -0.25, butte: 0.6, buttes: 1, benchCos: 0.5, benchFar: 3 },
  massif: { turn: 0.11, frontMin: 0.75, frontMax: 1.05, frontLeast: 0.6, least: 0.14, most: 0.32, bendMin: -0.3, bendMax: 1.0, bendMost: 4, room: 0.22, benchPush: 1.5, sway: 0.1, swayCell: 0.3, bays: 20, baysCell: 44, under: 4, tier: 3, belt: 26, beltBend: 1, beltCell: 50, stepIn: 0.15, ravineGap: 52, ravineMin: 60, ravineMax: 160, ravineHalf: 3.5, ravineWander: 12, ravineCell: 28, wall: 0.5, benchFree: 3, floorLo: 0.25, foot: 26 },
  steps: { run: 24, rise: 2, bend: 1.1, cell: 48 },
} as const;

/** A form's outline for `formDist`: a mesa's or a hollow's, its lobes gentler than the ringed forms'. */
function outline(s: number, x: number, y: number, r: number, lobes = 1): RingForm {
  const o = stream(s, "outline");
  return { x, y, r, h: 0, kind: "mesa", s, k1: 2 + Math.floor(2 * o.float()), p1: o.float(), a1: (0.08 + 0.1 * o.float()) * lobes, k2: 4 + Math.floor(3 * o.float()), p2: o.float(), a2: (0.03 + 0.05 * o.float()) * lobes, ox: 0, oy: 0 };
}

function median(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

/** Whether a map's land stands up (round 6): Highlands above 128² (its narrower side), where the land is ringed. */
export function standsUp(theme: string, W: number, H: number): boolean {
  return theme === "highlands" && Math.min(W, H) > 128;
}

/** Highlands' valley (round 6): `m` how much of each tile is the valley (0 to 1), `floor` the valley's floor there
 *  (levels over the base), `share` the share of the map at least half valley, and the bowl's middle and radius. */
export interface StandValley {
  m: Float64Array;
  floor: Float64Array;
  /** How far each tile stands from the valley, 0 at its rim to 1 at `STAND.floor.far` of the side and beyond, eased. */
  away: Float64Array;
  share: number;
  cx: number;
  cy: number;
  r: number;
  /** How far each tile stands from the water's line, the channel's middle (tiles). */
  line: Float64Array;
  /** The bowl's tiles, 1, and the channel's past the sill, 2 (round 6b step 2: the benches step down to them,
   *  `benchValley`). */
  bowl: Uint8Array;
  /** The lake's sill (round 6b): the valley's tiles where the channel leaves the bowl, its rock (`Genome.rockSill`). */
  sill: Uint8Array;
  /** The way the massif stands from the bowl (round 6c, a unit vector): across the lake from the bench. */
  mx: number;
  my: number;
  /** The way the start's bench lies from the water's line (round 6c, a unit vector across the line). */
  bx: number;
  by: number;
}

/** The valley a land that stands up sinks in its middle: a lobed bowl near the map's middle, and a channel through it
 *  along the water's way (`flowDir`, the land's oriented one) from the upstream edge to the downstream one, wandering.
 *  The bowl's rim falls over one to four tiles as a slow noise has it, so it is a wall in places and a slope in
 *  others; the channel's sides fall gently. Drawn from the genome (its bench phase), so each land draws its own, the
 *  same for the field the water is planned on (`lowerValley`) and for the levels (`levels.ts` `snapLevels`).
 *
 *  The bowl holds a lake (round 6b): its floor is a level bench `lake.sill` levels over the base, the old floor the
 *  river filled as it came in, and against its downstream rim, where the channel leaves it, the floor lies `lake.deep`
 *  levels lower, a lobed hollow lying along the water's line (its middle `lake.at` of the radius up from the rim, read
 *  `lake.stretch` as far down the line as across it, so the bench lies beside the lake and the river reaches it at the
 *  bowl's upstream end; `lake.share` of the bowl, never more than `lake.budget` of the plan's lake budget, `lakeMost`
 *  tiles). The channel leaves the bowl at the bench's level and runs on at it for
 *  `lake.sillRun` tiles before it falls to the downstream edge: that stretch of the bowl's rim is the lake's sill. The
 *  water's plan finds the hollow on its river's way and fills it to the sill (`hydro.ts`, its lakes); nothing here
 *  lays water. Upstream the channel falls to the bench from `rise` levels over it. */
export function standValley(seed: number, variation: number, phase: number, flowDir: number, W: number, H: number, lakeMost = Infinity): StandValley {
  const V = STAND.valley;
  const K = STAND.lake;
  const N = W * H;
  const side = Math.min(W, H);
  const s = hash32(seed, "stand-valley", variation, Math.floor(phase * 1073741824));
  const rng = stream(s, "bowl");
  const r = (V.rMin + (V.rMax - V.rMin) * rng.float()) * side;
  // (round 6c: the bowl off the map's middle, toward an edge or a corner as the seed draws it, kept whole on the map:
  // in the middle on every seed, six maps read as one. Its way steps on by the golden share of a turn from one seed to
  // the next, `spread` of a turn either way as the seed draws it, and it lies near the middle on odd seeds and far out
  // on even ones, `band` of the range each, so the seeds a player tries in a row never lay the lake in one place: drawn
  // at random, seeds 3 and 4 laid it within a tenth of the map of each other, and on the golden way alone, seeds 2 and
  // 5, a third of a turn's difference eaten by the bowl kept whole on the map)
  // (round 6c, round 2: drawn from the seed and the variation alone, never the attempt, so a land drawn again keeps the
  // seed's composition and the built maps differ from one another as the first lands do: seeds 2 and 4 both took a
  // second land, and those lay 0.06 of the map apart)
  const cs = stream(hash32(seed, "stand-compose", variation), "bowl");
  const offA = (seed * GOLDEN + V.spread * (2 * cs.float() - 1)) % 1;
  const offD = (V.offMin + (V.offMax - V.offMin) * ((seed & 1 ? 0 : 1 - V.band) + V.band * cs.float())) * side;
  const keep = V.keep * r + V.edge * side;
  // (across the water's way no further than `lat` of the side, so both sides of the line keep room, the bench's and the
  // massif's: seeds 2 and 4 laid it against an edge across the flow, and the start took the narrow side or the river
  // went round the bowl; what that takes is laid along the way, up or down it as the way drawn leans, so the bowl
  // keeps its distance from the middle: kept across alone, seed 4's lake lay where seed 1's did)
  const [fx, fy] = DIRS8[flowDir];
  const ox0 = offD * sinDet(TWO_PI * offA + TWO_PI / 4);
  const oy0 = offD * sinDet(TWO_PI * offA);
  const across0 = -ox0 * fy + oy0 * fx;
  const along0 = ox0 * fx + oy0 * fy;
  const across = clamp(across0, -V.lat * side, V.lat * side);
  const along = (along0 > 0 || (along0 === 0 && seed & 1) ? 1 : -1) * portable.sqrt(Math.max(along0 * along0, offD * offD - across * across));
  const ox = along * fx - across * fy;
  const oy = along * fy + across * fx;
  const cx = clamp((W - 1) / 2 + ox, Math.min(keep, (W - 1) / 2), Math.max(W - 1 - keep, (W - 1) / 2));
  const cy = clamp((H - 1) / 2 + oy, Math.min(keep, (H - 1) / 2), Math.max(H - 1 - keep, (H - 1) / 2));
  // (round 6c, round 2: the start's bench first, on the open side: the side of the water's line facing the map's middle
  // where the bowl lies `benchLean` of the side or more across the way from it, else the side where the bowl is broader,
  // as before; the bench took the side with room after the lake was drawn, and seeds 4 and 6 lost room to it)
  const benchWant = across >= K.benchLean * side ? -1 : across <= -K.benchLean * side ? 1 : 0;
  const bowl = outline(hash32(s, "bowl-outline"), cx, cy, r, 1.4);
  const [ax, ay] = DIRS8[flowDir];
  const half = (V.halfMin + (V.halfMax - V.halfMin) * rng.float()) * side;
  const bowlAt = (x: number, y: number): number => {
    const tin = (1 - formDist(bowl, x, y, cx, cy, r)) * r;
    const soft = V.softMin + (V.softMax - V.softMin) * (fbm(s + 3, x, y, 0.25 * side, 2) + 1) / 2;
    return smoothstep(tin / soft + 0.5);
  };
  // (round 6b step 5: outside the bowl the line bends at a shorter wavelength too, `bend` of the side, so the channel
  // winds as a river's valley does: one that wandered only at the map's scale ran straight for 60 tiles past the sill,
  // a chute, Normal 256² seed 3)
  const wander0 = (along: number): number => V.wander * side * fbm(s + 5, along, 0, V.cell * side, 2);
  // (with the bench's side set first, the line wanders away from it beside the lake, so the bench keeps the bowl's
  // broader side, base's room)
  const wsgn = benchWant !== 0 && wander0(K.benchAt * r) * benchWant > 0 ? -1 : 1;
  const wanderAt = (along: number): number => wsgn * wander0(along);
  // (where the line leaves the bowl, down the flow and up it, read on the wander alone, the bend not yet laid)
  let aOut = 0;
  while (aOut < side && bowlAt(cx + aOut * ax - wanderAt(aOut) * ay, cy + aOut * ay + wanderAt(aOut) * ax) >= 0.5) aOut += 0.5;
  let aIn = 0;
  while (aIn > -side && bowlAt(cx + aIn * ax - wanderAt(aIn) * ay, cy + aIn * ay + wanderAt(aIn) * ax) >= 0.5) aIn -= 0.5;
  // (down the flow the bend grows over half a radius from the end of the sill's run, so the whole channel past the sill
  // winds, the bowl, its lake and its sill as before; there it is a meander, a wave `meander` of the side long, its
  // phase drifting with a slow noise, at half the bend's swing, and a noise over `bendCell` at its whole: the noise
  // alone lay nearly flat over seed 3's 70 tiles and left it straight again. Up the flow it is the noise alone from 1.5
  // radii out, as before: the meander there moved the main water's way in and left seed 1's first land with too little
  // land near water, 0.31 of it against the story's 0.35)
  const bendFrom = aOut + K.sillRun + 2;
  const wave0 = (hash32(s, "meander") % 1024) / 1024;
  const meander = (along: number): number => sinDet(TWO_PI * (along / (V.meander * side) + wave0 + 0.5 * fbm(s + 11, along, 0, V.meander * side, 1)));
  const offAt = (along: number): number => wanderAt(along) + V.bend * side * (along > 0 ? smoothstep((along - bendFrom) / (0.5 * r)) * (0.5 * meander(along) + fbm(s + 9, along, 0, V.bendCell * side, 2)) : smoothstep((-along - 1.5 * r) / (0.5 * r)) * fbm(s + 9, along, 0, V.bendCell * side, 2));
  // (the water's line: the channel's middle, `along` tiles down the flow from the bowl's middle)
  const lineX = (a: number): number => cx + a * ax - offAt(a) * ay;
  const lineY = (a: number): number => cy + a * ay + offAt(a) * ax;
  const onMap = (a: number): boolean => lineX(a) >= 0 && lineY(a) >= 0 && lineX(a) <= W - 1 && lineY(a) <= H - 1;
  let aEnd = aOut;
  while (aEnd < 2 * side && onMap(aEnd)) aEnd += 1;
  const m = new Float64Array(N);
  const mb = new Float64Array(N);
  const mcs = new Float64Array(N);
  const floor = new Float64Array(N);
  const alongOf = new Float64Array(N);
  const sill = new Uint8Array(N);
  const line = new Float64Array(N);
  const latOf = new Float64Array(N);
  let n = 0;
  let inBowl = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = bowlAt(x, y);
      const along = (x - cx) * ax + (y - cy) * ay;
      const lat = -(x - cx) * ay + (y - cy) * ax;
      const hw = half * (1 + 0.5 * fbm(s + 7, along, 0, 0.5 * V.cell * side, 2));
      latOf[i] = lat - offAt(along);
      line[i] = Math.abs(latOf[i]);
      const mc = smoothstep((hw - line[i]) / V.side + 0.5);
      const v = Math.max(b, mc);
      m[i] = v;
      mb[i] = b;
      mcs[i] = mc;
      alongOf[i] = along;
      if (v >= 0.5) n++;
      if (b >= 0.5) inBowl++;
    }
  // the lake: a lobed hollow on the water's line against the bowl's downstream rim, as much of the bowl as asked
  const aL = aOut - K.at * r;
  const want = Math.min(K.share * inBowl, K.budget * lakeMost);
  const { sd, side: bench } = lakeShore(s, W, H, r, aL, lineX(aL), lineY(aL), mb, alongOf, latOf, want, ax, ay, benchWant);
  // (round 6c: the massif stands across the lake from the bench, `standMassif`: the water's line's side away from the
  // bench, turned by up to `STAND.massif.turn` of a turn, so the lake lies against the high ground on one side and the
  // start's bench opens on the other)
  // (where that side leaves the massif too little of the map, the bowl against an edge there, it turns toward the side
  // with room, a quarter turn off that side at the most, so it stands beside the lake: seed 1's lay in a strip by the
  // edge)
  // (the turn one way on odd seeds and the other on even, so two seeds whose lakes lie near have their high ground on
  // different sides)
  const tq = (seed & 1 ? 1 : -1) * (0.3 + 0.7 * stream(hash32(seed, "stand-compose", variation), "massif-dir").float()) * STAND.massif.turn;
  const lx0 = -ay * -bench;
  const ly0 = ax * -bench;
  const roomAt = (dx: number, dy: number) => {
    let n = 0;
    let all = 0;
    for (let y = 0; y < H; y += 8)
      for (let x = 0; x < W; x += 8) {
        all++;
        if ((x - cx) * dx + (y - cy) * dy > r) n++;
      }
    return n / Math.max(1, all);
  };
  let mx = 0;
  let my = 0;
  let room = -1;
  // (the turns tried one way first on odd seeds and the other on even, as the turn drawn)
  for (const turn of seed & 1 ? [0, 0.125, -0.125, 0.25, -0.25] : [0, -0.125, 0.125, -0.25, 0.25]) {
    // (never more than a quarter turn off the side across from the bench, so it never stands over the bench: turned
    // further, seed 4's massif stood beside its start, room 338)
    const a = clamp(tq + turn, -0.25, 0.25);
    const ct = sinDet(TWO_PI * a + TWO_PI / 4);
    const st = sinDet(TWO_PI * a);
    const dx = lx0 * ct - ly0 * st;
    const dy = lx0 * st + ly0 * ct;
    const k = roomAt(dx, dy);
    if (k > room) {
      room = k;
      mx = dx;
      my = dy;
    }
    if (k >= STAND.massif.room) break;
  }
  for (let i = 0; i < N; i++) {
    if (m[i] <= 0) continue;
    const a = alongOf[i];
    // the channel: falling to the bench from upstream, at the bench's level through the bowl and over its sill, then
    // falling to the downstream edge
    const vChan = a < aIn ? K.sill + V.rise * clamp((aIn - a) / (0.45 * side), 0, 1) : a <= aOut + K.sillRun ? K.sill : K.sill - (K.sill - V.over) * clamp((a - aOut - K.sillRun) / Math.max(8, aEnd - aOut - K.sillRun), 0, 1);
    // the bowl: the bench, and the lake's hollow under it
    const lk = smoothstep(sd[i] / K.soft + 0.5);
    const vBowl = K.sill - K.deep * lk;
    // (round the bowl's rim, off the channel, the ground stands at the bench's level at least: no way round the sill)
    const wb = smoothstep((mb[i] - 0.5) / 0.2 + 0.5);
    floor[i] = wb * vBowl + (1 - wb) * (mcs[i] >= mb[i] ? vChan : Math.max(vChan, K.sill));
  }
  // (the sill, round 6b step 3: the ground from the lake's middle to the bowl's downstream rim and the channel's run
  // over it and a little past, as far to each side as the river may wander, so wherever the river leaves its lake it
  // leaves over rock: a sill that began past the lake's middle or ended at the run's end let a river that left by a
  // lobe, or past a spit, cut down and drain the lake two levels under the bench)
  for (let i = 0; i < N; i++) if (alongOf[i] >= aL && alongOf[i] <= aOut + K.sillRun + 2 + K.sillPast * r && line[i] <= 1.2 * r) sill[i] = 1;
  // how far each tile is from the valley (a chamfer distance, 1 and 1.4 a step), eased to 1 at `far` of the side
  const dist = new Float64Array(N).fill(1e9);
  for (let i = 0; i < N; i++) if (m[i] >= 0.5) dist[i] = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let k = 0; k < N; k++) {
      const i = pass ? N - 1 - k : k;
      const x = i % W;
      const y = (i - x) / W;
      const sy = pass ? 1 : -1;
      for (const [dx, dy, c] of [[-1, 0, 1], [0, sy, 1], [-1, sy, 1.4], [1, sy, 1.4], [1, 0, 1]] as const) {
        if ((pass === 0 && dx === 1 && dy === 0) || (pass === 1 && dx === -1 && dy === 0)) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const v = dist[yy * W + xx] + c;
        if (v < dist[i]) dist[i] = v;
      }
    }
  const away = new Float64Array(N);
  for (let i = 0; i < N; i++) away[i] = smoothstep(dist[i] / (STAND.floor.far * side));
  const inBowlT = new Uint8Array(N);
  // (round 6b step 5: the channel upstream of the bowl too, so its sides step down to it in rings, not one wall)
  for (let i = 0; i < N; i++) inBowlT[i] = mb[i] >= 0.5 && mb[i] >= mcs[i] ? 1 : 2 * (mb[i] < 0.5 && (alongOf[i] > aOut + K.sillRun + 2 || alongOf[i] < aIn - 2) ? 1 : 0);
  return { m, floor, away, share: n / N, cx, cy, r, line, sill, bowl: inBowlT, mx, my, bx: -ay * bench, by: ax * bench };
}

/** The lake's shore in the bowl (round 6b steps 2 and 3): found, not laid. The bowl's tiles nearest a lobed outline
 *  round the lake's middle near the water's line (`aL` tiles along it, at `lx`, `ly`), the `want` nearest are the lake.
 *  Step 3, the bench first: the bench lies on the side of the line where the bowl is broader beside the lake's middle
 *  (round 6c: or on the side `benchWant` names, set before the lake is drawn), and the lake's middle lies off the line away from it (`shift`). Facing the bench the shore is read from an outline
 *  of gentle lobes (`benchLobes`, read `benchStretch` as far down the line as across it), so beside the bench it wanders
 *  a tile or two and the bench keeps its level room; turning away from the bench (`benchCos`, `benchTurn`) it is read
 *  from one of deep lobes (`lobes`, `stretch`) with a slow warped noise (`bays`), so the bays, the spit and the narrow
 *  end lie on the far shore and at the ends, and no two lakes share an outline. Returns each tile's signed distance to
 *  the shore (tiles, positive in the lake) and the bench's side of the water's line (1 where `latOf` is positive). */
function lakeShore(s: number, W: number, H: number, r: number, aL: number, lx: number, ly: number, mb: Float64Array, alongOf: Float64Array, latOf: Float64Array, want: number, ax: number, ay: number, benchWant = 0): { sd: Float64Array; side: number } {
  const K = STAND.lake;
  const N = W * H;
  const lakeF = outline(hash32(s, "lake-outline"), lx, ly, r, K.lobes);
  const bs = hash32(s, "lake-bays");
  const benchF = outline(hash32(s, "lake-outline"), lx, ly, r, K.benchLobes);
  // the bench's side: the side of the water's line where the bowl is broader beside the lake's middle
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < N; i++)
    if (mb[i] >= 0.5 && Math.abs(alongOf[i] - aL) < r) {
      if (latOf[i] > 0) pos++;
      else if (latOf[i] < 0) neg++;
    }
  // (round 6c: the side set first, `standValley`'s `benchWant`, where the bowl lies off the middle across the way)
  const side = benchWant !== 0 ? benchWant : pos > neg ? 1 : pos < neg ? -1 : bs & 1 ? 1 : -1;
  const ds: number[] = [];
  const dl = new Float64Array(N).fill(Infinity);
  for (let i = 0; i < N; i++)
    if (mb[i] >= 0.5) {
      const x = i % W;
      const y = (i - x) / W;
      const u = (alongOf[i] - aL) * K.stretch;
      // (the lake's middle lies off the line, away from the bench)
      const v = latOf[i] + side * K.shift * r;
      const rho = portable.sqrt(u * u + v * v);
      // (1 facing the bench, 0 facing away from it)
      const g = smoothstep(((rho > 0 ? (side * v) / rho : 0) - K.benchCos) / K.benchTurn + 0.5);
      const bay = warpedFbm(bs, x, y, K.baysCell * r, 3, 0.2 * r);
      const far = g < 1 ? formDist(lakeF, lx + u * ax - v * ay, ly + u * ay + v * ax, lx, ly, r) + K.bays * bay : 0;
      const un = (alongOf[i] - aL) * K.benchStretch;
      const near = g > 0 ? formDist(benchF, lx + un * ax - v * ay, ly + un * ay + v * ax, lx, ly, r) : 0;
      dl[i] = g * near + (1 - g) * far;
      ds.push(dl[i]);
    }
  ds.sort((a, b) => a - b);
  const q = ds.length && want >= 1 ? ds[Math.min(ds.length - 1, Math.floor(want))] : -Infinity;
  const sd = new Float64Array(N);
  for (let i = 0; i < N; i++) sd[i] = Number.isFinite(dl[i]) ? (q - dl[i]) * r : -1e9;
  return { sd, side };
}

/** A chamfer distance (1 and 1.4 a step) to the nearest tile of `src`, and that tile, both ways over the map. */
function nearestOf(src: Uint8Array, W: number, H: number): { dist: Float64Array; from: Int32Array } {
  const N = W * H;
  const dist = new Float64Array(N).fill(1e9);
  const from = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++)
    if (src[i]) {
      dist[i] = 0;
      from[i] = i;
    }
  for (let pass = 0; pass < 2; pass++)
    for (let k = 0; k < N; k++) {
      const i = pass ? N - 1 - k : k;
      const x = i % W;
      const y = (i - x) / W;
      const sy = pass ? 1 : -1;
      const sx = pass ? 1 : -1;
      for (const [dx, dy, c] of [[sx, 0, 1], [0, sy, 1], [-1, sy, 1.4], [1, sy, 1.4]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (dist[j] + c < dist[i]) {
          dist[i] = dist[j] + c;
          from[i] = from[j];
        }
      }
    }
  return { dist, from };
}

/** The benches round the valley (round 6b step 2): the floor steps down to the valley one level at a time, in rings
 *  that follow its rim, each `STAND.bench.min`–`max` tiles broad as a slow noise has it, the first a level over the
 *  valley's floor beside it, so the bowl lies in nested terraces as the game's Terraces do, not behind one wall. The
 *  graded levels `level` (after the valley is sunk in them) are only lowered, never under a level over the valley's
 *  floor, so no way round the lake's sill opens. */
export function benchValley(level: Float64Array, v: StandValley, base: number, W: number, H: number, seed: number, bare: Uint8Array | null = null): void {
  const B = STAND.bench;
  const N = W * H;
  const inV = new Uint8Array(N);
  for (let i = 0; i < N; i++) inV[i] = v.m[i] >= 0.5 ? 1 : 0;
  // (round the bowl: the tiles whose nearest valley is the bowl's, not the channel's)
  const { dist, from } = nearestOf(inV, W, H);
  const s = hash32(seed, "stand-benches");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // (round 6c: not under the massif, whose wall stands over the lake and the channel, `standMassif`)
      if (inV[i] || from[i] < 0 || !v.bowl[from[i]] || bare?.[i]) continue;
      // (past the sill the channel falls to the edge: its sides step down to it as the bowl's do, so it leaves the map
      // in a terraced valley, not a chute)
      const run = B.min + (B.max - B.min) * (warpedFbm(s, x, y, B.cell, 2, 0.5 * B.cell) + 1) / 2;
      const d = dist[i] + B.wobble * fbm(s + 1, x, y, 0.5 * B.cell, 2);
      const ring = Math.floor(Math.max(0, d) / run);
      if (ring >= B.rings) continue;
      const cap = base + v.floor[from[i]] + B.step * (ring + 1);
      if (level[i] > cap) level[i] = cap;
    }
}

/** Where a land that stands up keeps its badwater off (round 6b step 5): the valley's bowl, where the start stands on its
 *  bench, and the ground round it within `STAND.badView` of the side, so no hollow, ditch or badwater shows from the
 *  start; and the valley's channel and the ground within `STAND.badBeside` of it, so no ditch runs down it beside the
 *  river (seeds 1 and 5, a badwater stream the length of the channel), but where the channel holds the water a ditch
 *  joins (`join`, the main water's lower reach, D476): there the tiles within `STAND.badJoin` of that water are open,
 *  so the ditch crosses the floor to it. `valley` is `Genome.standValley`; round 6c, round 2: and the ground the start's
 *  views take in round its bench (`benchView`, `Genome.benchView`). */
export function standBadKeep(valley: Uint8Array, join: Uint8Array | null, W: number, H: number, benchView: Uint8Array | null = null): Uint8Array {
  const N = W * H;
  const bowl = new Uint8Array(N);
  for (let i = 0; i < N; i++) bowl[i] = valley[i] === 1 ? 1 : 0;
  const db = distanceFrom(bowl, W, H);
  const view = STAND.badView * Math.min(W, H);
  const chan = new Uint8Array(N);
  for (let i = 0; i < N; i++) chan[i] = valley[i] === 2 ? 1 : 0;
  const dc = distanceFrom(chan, W, H);
  const dj = join ? distanceFrom(join, W, H) : null;
  const keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (db[i] < view || benchView?.[i] || (dc[i] <= STAND.badBeside && !(dj && dj[i] <= STAND.badJoin))) keep[i] = 1;
  return keep;
}

/** The field the water is planned on, sunk in the valley below all the land round it, falling along the channel
 *  toward the downstream edge and across it to the water's line, so the rivers the land plans run down the valley's
 *  middle and through the bowl's lake. */
export function lowerValley(E: Float64Array, v: StandValley, flowDir: number, W: number, H: number): void {
  const sorted = Float64Array.from(E).sort();
  const lo = sorted[Math.floor(0.02 * (sorted.length - 1))];
  const span = Math.max(1e-6, sorted[Math.floor(0.98 * (sorted.length - 1))] - lo);
  const [ax, ay] = DIRS8[flowDir];
  const side = Math.min(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = v.m[i];
      if (k <= 0) continue;
      const t = clamp(((x - v.cx) * ax + (y - v.cy) * ay) / (0.45 * side), -1, 1);
      // (falling to the water's line across the valley too, so the river keeps to its middle and through the lake)
      const target = lo - 0.05 * span - (0.12 * span * (1 + t)) / 2 - 0.04 * span * (1 - Math.min(1, v.line[i] / v.r));
      if (target < E[i]) E[i] += k * (target - E[i]);
    }
}

/** Highlands' massif on a land that stands up (round 6c), on the graded levels `level` (before the valley is sunk in
 *  them): high ground on one or two sides of the map, across the lake from the bench (`StandValley.mx`, `my`), not a
 *  ring round the bowl. Its front is a bowed line `frontMin`–`frontMax` of the bowl's radius past the bowl's middle,
 *  swaying along its length and eaten into by bays and spurs (`bays` tiles over `baysCell`), so no stretch of it runs
 *  straight, and pushed back or drawn in until the massif holds `least`–`most` of the map. Behind it the ground stands
 *  `under` levels under the map's top in one face (`wall`), its back a second table `tier` higher; the valley
 *  sunk after cuts the lake's far shore and the channel into it, and the benches leave it (`benchValley`'s `bare`), so
 *  the lake lies under its wall. The field the water is planned on stands high under it, and its top is dry ground.
 *  Returns the tiles within `benchFree` of it (`bare`) and its top (`tops`, 2 tiles in from its front), or null. */
export function standMassif(level: Float64Array, E: Float64Array, W: number, H: number, seed: number, variation: number, v: StandValley, floorLo: number, top: number, eHigh: number): { bare: Uint8Array; tops: Uint8Array; share: number } | null {
  const K = STAND.massif;
  const N = W * H;
  const side = Math.min(W, H);
  const sizeK = Math.min(1, side / 256);
  const s = hash32(seed, "stand-massif", variation, Math.floor(v.cx * 64), Math.floor(v.cy * 64));
  const rng = stream(s, "front");
  const lx = -v.my;
  const ly = v.mx;
  let bend = (K.bendMin + (K.bendMax - K.bendMin) * rng.float()) / side;
  let f = (K.frontMin + (K.frontMax - K.frontMin) * rng.float()) * v.r;
  // each tile's reach past the front (tiles; positive inside the massif, the front at `f`) and along it (`along`)
  const pOf = new Float64Array(N);
  const qOf = new Float64Array(N);
  const wob = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      pOf[i] = (x - v.cx) * v.mx + (y - v.cy) * v.my;
      qOf[i] = (x - v.cx) * lx + (y - v.cy) * ly;
      // (its front drawn back from the bench's side of the water's line, `benchPush` tiles a tile, so a massif turned
      // toward room bows away from the bench and never walls it: seed 2's flank stood 6 levels over its bench's edge,
      // and its start walked 2,243 tiles)
      const pb = (x - v.cx) * v.bx + (y - v.cy) * v.by;
      wob[i] = -K.sway * side * fbm(s + 1, qOf[i], 0, K.swayCell * side, 2) + K.bays * sizeK * warpedFbm(s + 2, x, y, K.baysCell * sizeK, 3, 0.5 * K.baysCell * sizeK) - K.benchPush * Math.max(0, pb);
    }
  const reach = (i: number) => pOf[i] - 0.5 * bend * qOf[i] * qOf[i] + wob[i] - f;
  const shareNow = () => {
    let n = 0;
    let all = 0;
    for (let y = 0; y < H; y += 4)
      for (let x = 0; x < W; x += 4) {
        all++;
        if (reach(y * W + x) > 0 && v.m[y * W + x] < 0.5) n++;
      }
    return n / Math.max(1, all);
  };
  // (too broad: its flanks bowed back first, so it keeps to the lake's far side as a spur of high ground, then its
  // front pushed back; too narrow, its front drawn in)
  let share = shareNow();
  for (let k = 0; k < 40 && share > K.most && bend * side < K.bendMost; k++) {
    bend += 0.1 / side;
    share = shareNow();
  }
  for (let k = 0; k < 60 && share > K.most; k++) {
    f += 3 * sizeK;
    share = shareNow();
  }
  for (let k = 0; k < 60 && share < K.least && f > K.frontLeast * v.r; k++) {
    f -= 3 * sizeK;
    share = shareNow();
  }
  if (share <= 0) return null;
  // the ravines: dry clefts from the front into the massif, `ravineGap` apart along it, each `ravineLen` deep
  const rr = stream(s, "ravines");
  const rav: { q: number; len: number; half: number }[] = [];
  for (let q = -side + rr.float() * K.ravineGap * sizeK; q < side; q += K.ravineGap * sizeK * (0.7 + 0.6 * rr.float()))
    rav.push({ q, len: (K.ravineMin + (K.ravineMax - K.ravineMin) * rr.float()) * sizeK, half: K.ravineHalf * (0.8 + 0.4 * rr.float()) });
  const T = top - K.under;
  const bare = new Uint8Array(N);
  const tops = new Uint8Array(N);
  const bs = hash32(s, "belt");
  for (let i = 0; i < N; i++) {
    const t = reach(i);
    if (t > -K.benchFree) bare[i] = 1;
    // (the floor falls to its lowest at the massif's foot over `foot` tiles, so its wall stands its whole height over
    // the floor beside it: the floor rising toward it left the wall two to four levels)
    if (t <= -K.wall) {
      if (t > -K.foot && level[i] > floorLo) level[i] = floorLo + (level[i] - floorLo) * smoothstep(-t / K.foot);
      continue;
    }
    const x = i % W;
    const y = (i - x) / W;
    const L = level[i];
    const w = smoothstep((t + K.wall / 2) / K.wall);
    // (two tables stacked: the front's belt, `belt` tiles deep as a noise has it, and behind it a second, `tier` levels
    // higher, its wall bent by the noise, never parallel to the front for long)
    const z = t / (K.belt * sizeK) + K.beltBend * warpedFbm(bs, x, y, K.beltCell * sizeK, 2, 0.5 * K.beltCell * sizeK);
    let Tq = Math.min(top, T + (Math.floor(z) % 2 === 1 ? K.tier : 0));
    // (the lower table's own relief: steps up across it, `stepOf`, inside the belt, off its walls by `stepIn` of its
    // depth so the walls keep their height and each step stands as a table of its own, its rim dropping all round:
    // seed 3's front table lay flat over 7 % of land, and knolls a level high cost the promise its plateaus)
    const fz = z - Math.floor(z);
    if (Math.floor(z) % 2 !== 1 && fz > K.stepIn && fz < 1 - K.stepIn) Tq = Math.min(top - 1, Tq + stepOf(x, y, lx, ly, bs + 7, side));
    // (and the upper table's: steps down across it from wall to wall, so each step's floor opens onto the lower table
    // at both ends and none is a closed hollow; where the belt's bend widened it, seed 12's lay flat over 6 % of land)
    else if (Math.floor(z) % 2 === 1) Tq -= stepOf(x, y, lx, ly, bs + 11, side);
    // (a ravine: a cleft a table deep, wandering, from the front back into the massif, so no table runs on unbroken;
    // it falls toward the front, so it holds no water and is never filled as a closed hollow)
    for (const c of rav) {
      if (t > c.len) continue;
      const qc = c.q + K.ravineWander * sizeK * fbm(s + 31 + Math.floor(c.q), t, 0, K.ravineCell * sizeK, 2);
      const half = c.half * (1 + 0.5 * smoothstep(1 - t / c.len)) * smoothstep((c.len - t) / 6);
      if (Math.abs(qOf[i] - qc) < half) {
        Tq = Math.max(floorLo + 1, Tq - K.tier);
        break;
      }
    }
    if (Tq > L) level[i] = L + w * (Tq - L);
    if (t > 2 && v.m[i] <= 0) tops[i] = 1;
    if (t > -1 && v.m[i] <= 0 && E[i] < eHigh) E[i] = eHigh;
  }
  return { bare, tops, share };
}

/** A broad top's own relief (round 6c): never a dead-flat top. Read along a way across the top (`ux`, `uy`: a mesa's
 *  own, along the massif's front, across the floor's top bench), every `STAND.steps.run` tiles the top steps `rise`
 *  levels up or down, the steps' lines bent by a slow noise (`bend` steps over `cell` tiles) so none runs straight and
 *  none rings the top: the top reads as tables side by side, each with a rim that drops all round (steps a level high
 *  left no plateau the promise reads). Every step's line runs from rim to rim, so no level is a closed hollow (the
 *  build fills those, `fillDryHollows`). Returns 0 or `rise`. */
export function stepOf(x: number, y: number, ux: number, uy: number, s: number, side: number): number {
  const P = STAND.steps;
  const k = Math.min(1, side / 256);
  const z = (x * ux + y * uy) / (P.run * k) + P.bend * warpedFbm(s, x, y, P.cell * k, 2, 0.5 * P.cell * k);
  return (Math.floor(z) & 1) * P.rise;
}

/** Highlands' mesas on a land that stands up (round 6), on the graded levels `level` (before the warp and the snap),
 *  under `top`: four to six a 256² (by area), radius `STAND.mesa.rMin`–`rMax` (24–46, about 48–92 tiles across before
 *  the stretch), lobed and stretched, clear of each other and of the
 *  valley. Each stands 4–6 levels over the ground round its rim, a wall over most of its rim; over one or two arcs of it
 *  (an eighth to a quarter of the rim, the first toward the valley) its side is broken and stepped, a level every few
 *  tiles, irregular, and its edge eaten in, so the slopes find a way up (never a ramp laid). Its top steps down two
 *  levels and up again across it (`stepOf`, round 6c; round 6 drew an inner ring). Round 6c: all but the last (`buttes`, a butte `butte` of the radius) stand on the massif's side of the bowl
 *  or beside it (`open`: no further round from the massif's way than that cosine). The field `E` the water is planned on is
 *  raised to `eHigh` under each, so no river is planned across one, and no spring is drawn on a top (`tops`, the
 *  genome's `dryTops`): the tops stay dry, for a dam or a channel to water. Returns the tiles about their rims (`skip`,
 *  for `notchWalls` to leave) and the tops, or null where none stands. */
export function standMesas(level: Float64Array, E: Float64Array, W: number, H: number, seed: number, variation: number, valley: StandValley, base: number, top: number, eHigh: number): { skip: Uint8Array; tops: Uint8Array } | null {
  const side = Math.min(W, H);
  const M = STAND.mesa;
  const sizeK = Math.min(1, side / 256);
  const area = (W * H) / (256 * 256);
  const rng = stream(seed, "stand-mesas", variation, Math.floor(valley.cx * 64), Math.floor(valley.cy * 64));
  const want = Math.max(1, Math.round((M.fewest + rng.int(0, M.most - M.fewest + 1)) * area));
  const at = (x: number, y: number) => level[Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
  const vat = (x: number, y: number) => valley.m[Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
  type Mesa = { f: RingForm; e: number; ca: number; sa: number; T: number; foot: number; arcs: [number, number][]; ux: number; uy: number };
  const mesas: Mesa[] = [];
  for (let k = 0; k < want; k++) {
    // of the draws that fit, the one whose wall stands 4–7 over most of the ground round its rim (the first the largest)
    let best: { x: number; y: number; r: number; e: number; turn: number; T: number; foot: number; t: number; share: number; plinth: number; p75: number } | null = null;
    // (round 6c: the last `buttes` a butte, smaller, anywhere; the others on the massif's side of the bowl or beside it,
    // never across the bench from it, so the high ground stands on one or two sides and the open side stays low)
    const butte = k >= want - M.buttes && want > M.buttes;
    for (let t = 0; t < M.tries; t++) {
      const u = rng.float();
      const r = (M.rMin + (M.rMax - M.rMin) * (k === 0 ? M.first + (1 - M.first) * u : u)) * sizeK * (butte ? M.butte : 1);
      const e = 1 + M.stretch * rng.float();
      const turn = rng.float();
      const reach = r * e;
      // (a mesa may stand partly off the map's edge, as the game's own do)
      const margin = M.edge * reach;
      const x = margin + (W - 1 - 2 * margin) * rng.float();
      const y = margin + (H - 1 - 2 * margin) * rng.float();
      // (walls of 5 and 6 the commoner)
      const h = M.hMin + Math.floor((M.hMax - M.hMin + 1) * portable.sqrt(rng.float()));
      if (W - 1 - 2 * margin <= 0 || H - 1 - 2 * margin <= 0) continue;
      const dd = portable.sqrt((x - valley.cx) * (x - valley.cx) + (y - valley.cy) * (y - valley.cy));
      if (!butte && dd > 0 && ((x - valley.cx) * valley.mx + (y - valley.cy) * valley.my) / dd < M.open) continue;
      // (and none, the butte too, in front of the start's bench within `benchFar` of the bowl's radius: seed 4's butte
      // stood on its bench's back, and the start took the narrow side, room 338)
      if (dd > 0 && dd < M.benchFar * valley.r && ((x - valley.cx) * valley.bx + (y - valley.cy) * valley.by) / dd > M.benchCos) continue;
      if (mesas.some((q) => {
        const need = q.f.r * q.e + reach + M.gap * sizeK;
        return (q.f.x - x) * (q.f.x - x) + (q.f.y - y) * (q.f.y - y) < need * need;
      })) continue;
      // clear of the valley, its walls standing at the valley's rim where they meet it
      let wet = false;
      for (let v = -reach; v <= reach && !wet; v += 3)
        for (let w = -reach; w <= reach; w += 3)
          if (w * w + v * v <= reach * reach && vat(x + w, y + v) > 0.05) {
            wet = true;
            break;
          }
      if (wet) continue;
      // the ground round its rim and under it, read on a coarse grid
      const rim: number[] = [];
      for (let a = 0; a < 24; a++) {
        const th = (TWO_PI * a) / 24;
        const ux = sinDet(th + TWO_PI / 4);
        const uy = sinDet(th);
        rim.push(at(x + 1.1 * r * (ux * (1 + (e - 1) * Math.abs(ux))), y + 1.1 * r * (uy * (1 + (e - 1) * Math.abs(uy)))));
      }
      let inMin = Infinity;
      let inMax = -Infinity;
      for (let v = -r; v <= r; v += 4)
        for (let w = -r; w <= r; w += 4) {
          if (w * w + v * v > 0.8 * r * r) continue;
          const L = at(x + w, y + v);
          if (L < inMin) inMin = L;
          if (L > inMax) inMax = L;
        }
      const sorted = rim.slice().sort((a, b) => a - b);
      // (round 6b step 4: the wall rises from the floor in one face; only the stepped side stands on a plinth)
      const p75 = Math.round(sorted[18]);
      const T = Math.min(p75 + h, top);
      const plinth = T - p75 - M.plinth >= M.plinth ? M.plinth : 0;
      if (inMax > T - 2.5 || inMin < base + 2) continue;
      let share = 0;
      for (const L of rim) if (T - L >= M.hMin - 0.5 && T - L <= M.hMax + 1.5) share++;
      share /= rim.length;
      if (share >= 0.6 && (!best || share > best.share + 0.05 || (k === 0 && share >= best.share - 0.05 && r > best.r))) best = { x, y, r, e, turn, T, foot: T - h, t, share, plinth, p75 };
    }
    if (!best) continue;
    const { x, y, r, e, turn, T, t, plinth } = best;
    // (the stepped side's foot: the plinth's level, where the steps end)
    const foot = best.p75 + plinth;
    const f = outline(hash32(seed, "stand-mesa", variation, k, t), x, y, r, 2);
    const o = stream(f.s, "mesa-parts");
    // the broken arcs: one or two, an eighth to a quarter of the rim, the first toward the valley
    const share = M.brokenMin + (M.brokenMax - M.brokenMin) * o.float();
    const two = o.float() < 0.5;
    const c0 = pseudoAngle(valley.cx - x, valley.cy - y) + 0.16 * (o.float() - 0.5);
    const arcs: [number, number][] = two ? [[c0, share * 0.6 / 2], [c0 + 0.35 + 0.3 * o.float(), share * 0.4 / 2]] : [[c0, share / 2]];
    // (round 6c: its top stepped along a way of its own, `stepOf`, where round 6 drew an inner ring on four in five)
    const way = o.float();
    mesas.push({ f, e, ca: sinDet(TWO_PI * turn + TWO_PI / 4), sa: sinDet(TWO_PI * turn), T, foot, arcs, ux: sinDet(TWO_PI * way + TWO_PI / 4), uy: sinDet(TWO_PI * way) });
  }
  if (!mesas.length) return null;
  const skip = new Uint8Array(W * H);
  const tops = new Uint8Array(W * H);
  const arcOf = (arcs: [number, number][], t: number) => {
    let a = 0;
    for (const [c, hw] of arcs) {
      let d = Math.abs(t - (c - Math.floor(c)));
      if (d > 0.5) d = 1 - d;
      a = Math.max(a, smoothstep((hw - d) / 0.03 + 0.5));
    }
    return a;
  };
  for (const q of mesas) {
    const { f, e, ca, sa, T, foot, arcs, ux, uy } = q;
    const R = (1.5 * f.r + 2) * e + M.runMax * (M.hMax + 2) + M.inset;
    const x0 = Math.max(0, Math.floor(f.x - R));
    const x1 = Math.min(W - 1, Math.ceil(f.x + R));
    const y0 = Math.max(0, Math.floor(f.y - R));
    const y1 = Math.min(H - 1, Math.ceil(f.y + R));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const L = level[i];
        // (stretched along its axis: the tile read back into the round outline)
        const du = (x - f.x) * ca + (y - f.y) * sa;
        const dv = -(x - f.x) * sa + (y - f.y) * ca;
        const xs = f.x + (du / e) * ca - dv * sa;
        const ys = f.y + (du / e) * sa + dv * ca;
        const d = formDist(f, xs, ys, f.x, f.y, f.r);
        const tin = (1 - d) * f.r;
        if (d > 0.7 && d < 1.5) skip[i] = 1;
        if (tin > 2) tops[i] = 1;
        // (its steps down from its top: every step's line crosses the top from rim to rim, so none is a closed hollow)
        const top0 = T - stepOf(x - f.x, y - f.y, ux, uy, f.s + 23, side);
        // the wall: a steep band at the rim, rising from the floor in one face (round 6b step 4)
        const w = smoothstep((tin + M.wall / 2) / M.wall);
        const vWall = L + w * (top0 - L);
        // the broken side: the edge eaten in, then a level every few tiles, irregular, down to a plinth that falls to
        // the floor a level a ring, each ring a few tiles, irregular (round 6b step 2; step 4: under this side only)
        const a = arcOf(arcs, pseudoAngle(x - f.x, y - f.y));
        let v = vWall;
        if (a > 0) {
          let Lp = L;
          if (foot > L && tin < 0 && valley.m[i] <= 0) {
            const run = M.plinthMin + (M.plinthMax - M.plinthMin) * (fbm(f.s + 19, x, y, 14, 2) + 1) / 2;
            const pl = foot - M.plinth * Math.floor(Math.max(0, -tin - M.wall / 2) / run);
            if (pl > L) Lp = pl;
          }
          const inset = M.inset * (fbm(f.s + 11, x, y, 9, 2) + 1) / 2;
          const run = M.runMin + (M.runMax - M.runMin) * (fbm(f.s + 13, x, y, 7, 2) + 1) / 2;
          const out = Math.max(0, inset - tin);
          // (down to the mesa's foot, the floor it stands on, and no lower: where the ground falls away past it, to
          // the valley, the floor's own fall is the way on)
          const vStep = T - out / run + 0.6 * fbm(f.s + 17, x, y, 6, 2) * smoothstep(out / 2);
          v = (1 - a) * vWall + a * (vStep >= foot - 0.5 ? clamp(vStep, Lp, top0) : Lp);
        }
        if (v > L) level[i] = v;
        if (tin > -1 && E[i] < eHigh) E[i] = eHigh;
      }
  }
  return { skip, tops };
}

/** Each top tile's nearest tile on the gorge's top side beside its floor (`src`) and the distance to it, over the top
 *  side only (a nearest-source sweep, both ways): Infinity and −1 off it or out of reach. */
function nearestRim(low: Uint8Array, W: number, H: number): { dist: Float64Array; src: Int32Array } {
  const N = W * H;
  const dist = new Float64Array(N).fill(Infinity);
  const src = new Int32Array(N).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (low[i]) continue;
      if ((x > 0 && low[i - 1]) || (x + 1 < W && low[i + 1]) || (y > 0 && low[i - W]) || (y + 1 < H && low[i + W])) {
        dist[i] = 0;
        src[i] = i;
      }
    }
  const take = (i: number, x: number, y: number, j: number) => {
    const s = src[j];
    if (s < 0) return;
    const sx = s % W;
    const sy = (s - sx) / W;
    const d = portable.sqrt((x - sx) * (x - sx) + (y - sy) * (y - sy));
    if (d < dist[i]) {
      dist[i] = d;
      src[i] = s;
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (low[i]) continue;
        if (x > 0) take(i, x, y, i - 1);
        if (y > 0) {
          take(i, x, y, i - W);
          if (x > 0) take(i, x, y, i - W - 1);
          if (x + 1 < W) take(i, x, y, i - W + 1);
        }
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (low[i]) continue;
        if (x + 1 < W) take(i, x, y, i + 1);
        if (y + 1 < H) {
          take(i, x, y, i + W);
          if (x + 1 < W) take(i, x, y, i + W + 1);
          if (x > 0) take(i, x, y, i + W - 1);
        }
      }
  }
  return { dist, src };
}

/** Canyon's gorge on the graded levels `level` (before the warp and the snap): its floor's band up to `floorTop`, its
 *  tableland's from `topLo`. A bench cut into the tableland's edge where the wall is steep, and the hollows. */
export function boldGorge(level: Float64Array, W: number, H: number, seed: number, variation: number, floorTop: number, topLo: number): void {
  const side = Math.min(W, H);
  if (side <= 128 || topLo - floorTop < 3) return;
  const N = W * H;
  const B = BOLD.bench;
  const sizeK = Math.min(1, side / 256);
  const mid = (floorTop + topLo) / 2;
  const low = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (level[i] < mid) low[i] = 1;
  const { dist, src } = nearestRim(low, W, H);
  // how steep the wall is where each rim tile stands (levels a tile)
  const steep = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    const gx = (level[y * W + Math.min(W - 1, x + 1)] - level[y * W + Math.max(0, x - 1)]) / 2;
    const gy = (level[Math.min(H - 1, y + 1) * W + x] - level[Math.max(0, y - 1) * W + x]) / 2;
    return Math.max(Math.abs(gx), Math.abs(gy));
  };
  const stp = new Float64Array(N).fill(-1);
  const Lb = floorTop + Math.min(B.rise, topLo - floorTop - 1.5);
  const bs = hash32(seed, "gorge-bench", variation);
  const was = level.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const s = src[i];
      if (s < 0) continue;
      const width = (B.width + B.vary * fbm(bs, x, y, B.cell * sizeK, 2)) * sizeK;
      const D = dist[i];
      if (width < 2.5 || D > width + 2) continue;
      if (stp[s] < 0) stp[s] = steep(s);
      const c = smoothstep((stp[s] - B.steep) / 0.4);
      const L = was[i];
      const P = Lb + (L - Lb) * smoothstep((D - width) / 1.2);
      if (c > 0 && L > P) level[i] = L - c * (L - P);
    }
  // the hollows: a lobed bowl cut into the tableland at the gorge's rim, open to the gorge
  const Hh = BOLD.hollow;
  const rng = stream(seed, "gorge-hollows", variation);
  const area = (W * H) / (256 * 256);
  const want = Math.max(1, Math.round((Hh.fewest + rng.int(0, Hh.most - Hh.fewest + 1)) * area));
  const floorH = floorTop + Hh.over;
  const placed: RingForm[] = [];
  for (let k = 0; k < want; k++) {
    for (let t = 0; t < Hh.tries; t++) {
      const r = (Hh.rMin + (Hh.rMax - Hh.rMin) * rng.float()) * sizeK;
      const x = Math.round(r + 4 + (W - 9 - 2 * r) * rng.float());
      const y = Math.round(r + 4 + (H - 9 - 2 * r) * rng.float());
      const i = y * W + x;
      // its middle on the tableland, a little more than half its radius in from the rim
      if (!(dist[i] >= 0.5 * r && dist[i] <= 0.8 * r)) continue;
      if (placed.some((q) => (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < (q.r + r + 12 * sizeK) * (q.r + r + 12 * sizeK))) continue;
      // the tableland round it stands 3 or more over its floor
      const rim: number[] = [];
      for (let a = 0; a < 16; a++) {
        const th = (TWO_PI * a) / 16;
        const xx = Math.round(clamp(x + 1.1 * r * sinDet(th + TWO_PI / 4), 0, W - 1));
        const yy = Math.round(clamp(y + 1.1 * r * sinDet(th), 0, H - 1));
        if (!low[yy * W + xx]) rim.push(level[yy * W + xx]);
      }
      if (rim.length < 8 || median(rim) < floorH + 3) continue;
      const f = outline(hash32(seed, "gorge-hollow", variation, k, t), x, y, r);
      placed.push(f);
      const R = 1.45 * f.r + 2;
      for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(H - 1, Math.ceil(y + R)); yy++)
        for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(W - 1, Math.ceil(x + R)); xx++) {
          const j = yy * W + xx;
          const tin = (1 - formDist(f, xx, yy, x, y, r)) * r;
          const w = smoothstep((tin + 0.6) / 1.2);
          const v = level[j] + w * (floorH - level[j]);
          if (v < level[j]) level[j] = v;
        }
      break;
    }
  }
}
