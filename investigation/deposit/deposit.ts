// Investigation only. The pen, Floor, map copies, geology and water are the product's.
import { fullMap, snapshotMap, type ForceMap, type FullForceMap } from "../../src/core/forces/force";
import { floorProblem, forceFloor, holdAtFloor } from "../../src/core/forces/floor";
import { footprint, startProblem, isPlant } from "../../src/core/forces/objects";
import { hash, clamp, smooth } from "../../src/core/forces/random";
import { resamplePath, type PathPoint } from "../../src/core/forces/path";
import { trimRock } from "../../src/core/forces/rock";
import { PreviewJob, PREVIEW_CHECK, PREVIEW_MOVED, PREVIEW_TOL } from "../../src/core/sim/preview";
import { prefill, type CanonicalWater } from "../../src/core/sim/prefill";
import { SettleRun, sealedTiles } from "../../src/core/sim/water";
import { modelOf } from "../../src/core/forces/runs";
import { MinHeap } from "../../src/core/math/grid";

export interface Settings { power: number; size: number | null; channels: "auto" | "few" | "many"; floor: number; seed: number }
export interface Intent { path?: PathPoint[]; click?: PathPoint }
export const DEFAULTS: Settings = { power: 70, size: null, channels: "auto", floor: 1, seed: 1 };
export const widthOf = (s: Settings) => s.size ?? 14 + s.power * .34;
export interface Operation {
  version: 1; verb: "deposit"; settings: Settings; path: PathPoint[];
  tiles: number[]; heights: number[]; entities: FullForceMap["entities"]; lava: number[];
}
export interface Plan {
  before: FullForceMap; map: FullForceMap; arrival: Float32Array;
  mouth: PathPoint; direction: PathPoint; reach: number; branches: PathPoint[][]; channel: Uint8Array; channelStages: Uint8Array[];
  settings: Settings; operation: Operation; placement: "fan" | "slope" | "sheet" | "delta" | "hollow"; origin: PathPoint; donorRadius: number;
  previewWater?: { progress: number; water: FullForceMap["water"]; heights: Uint8Array }[];
  stats: { changed: number; eroded: number; deposited: number; balance: number; maximumCut: number; maximumDeposit: number; channels: number; wet: boolean; buried: number; carried: number; startCarried: boolean; levelTiles: number };
}
export function validate(m: ForceMap, s: Settings, intent: Intent): void {
  if (!Number.isFinite(s.power) || s.power < 0 || s.power > 100 ||
      (s.size !== null && (!Number.isFinite(s.size) || s.size < 4 || s.size > 64)) ||
      !["auto", "few", "many"].includes(s.channels) || floorProblem(s.floor, m.maxHeight) ||
      !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff) throw Error("Invalid Deposit settings");
  const path = intent.path ?? (intent.click ? [intent.click] : []);
  if (!path.length || path.length > 512 || path.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > m.W - 1 || p.y > m.H - 1)) throw Error("Draw on the map");
}
const index = (m: ForceMap, x: number, y: number) => Math.round(clamp(y, 0, m.H - 1)) * m.W + Math.round(clamp(x, 0, m.W - 1));
/** Keep a narrow thread of the existing wet outlet; deposit may split its broad bed, never dam
 *  it into a different catchment. Source cells and their edge neighbours are not outlets. */
function outletThread(m: FullForceMap, mouth: PathPoint, dir: PathPoint): Uint8Array {
  const mask = new Uint8Array(m.heights.length), parent = new Int32Array(mask.length).fill(-1), blocked = new Uint8Array(mask.length);
  for (const e of modelOf(m).emitters) for (const i of e.cells) {
    blocked[i] = 1; if (i > 0) blocked[i-1] = 1; if (i+1<mask.length) blocked[i+1] = 1;
    if (i>=m.W) blocked[i-m.W] = 1; if (i+m.W<mask.length) blocked[i+m.W] = 1;
  }
  let first = -1, nearest = Infinity;
  for (let y=Math.max(0,Math.floor(mouth.y-3)); y<=Math.min(m.H-1,Math.ceil(mouth.y+3)); y++) for (let x=Math.max(0,Math.floor(mouth.x-3)); x<=Math.min(m.W-1,Math.ceil(mouth.x+3)); x++) {
    const i=y*m.W+x,d=Math.hypot(x-mouth.x,y-mouth.y);
    if(m.water.depth[i]>.08 && d<nearest) { first=i; nearest=d; }
  }
  if(first<0) return mask;
  const heap=new MinHeap(),distance=new Float64Array(mask.length).fill(Infinity); distance[first]=0;heap.push(0,first);parent[first]=first;
  while(heap.size) {
    const i=heap.pop(),x=i%m.W,y=Math.floor(i/m.W); if(heap.lastKey!==distance[i])continue;
    if(!blocked[i] && (x-mouth.x)*dir.x+(y-mouth.y)*dir.y>6 && (x===0||y===0||x===m.W-1||y===m.H-1)) {
      let j=i; for(;;) { mask[j]=1; if(j===first)break; j=parent[j]; } return mask;
    }
    for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      const j=yy*m.W+xx; if(xx<0||yy<0||xx>=m.W||yy>=m.H||m.water.depth[j]<=.05) continue;
      const cost=distance[i]+1+m.heights[j]*32;
      if(cost<distance[j]) {distance[j]=cost;parent[j]=i;heap.push(cost,j);}
    }
  }
  return mask;
}
function noise(seed: number, t: number, key: number): number {
  const k = Math.floor(t), a = hash(seed, k + key), b = hash(seed, k + key + 1);
  return a + (b - a) * smooth(t - k);
}
/** A drag is a direction and reach. A click reads broad downhill sectors, not a random heading. */
function heading(m: FullForceMap, mouth: PathPoint, intent: Intent, reach: number): PathPoint {
  const last = intent.path?.at(-1), aimed = !!last && Math.hypot(last.x - mouth.x, last.y - mouth.y) > 1;
  const base = aimed ? Math.atan2(last!.y - mouth.y, last!.x - mouth.x) : 0;
  let best = Infinity, angle = base;
  for (let k = 0; k < (aimed ? 9 : 32); k++) {
    const a = aimed ? base + (k - 4) * .075 : k * Math.PI / 16;
    let score = 0;
    for (const d of [6, 12, 20]) for (const side of [-.22, 0, .22]) {
      const x = mouth.x + Math.cos(a + side) * Math.min(d, reach), y = mouth.y + Math.sin(a + side) * Math.min(d, reach);
      const i = index(m, x, y), back = index(m, mouth.x - Math.cos(a) * d, mouth.y - Math.sin(a) * d);
      score += m.heights[i] * 1.4 - m.heights[back] * .35;
      if (x < 0 || y < 0 || x >= m.W || y >= m.H) score += 8;
    }
    if (aimed) score += Math.abs(a - base) * 80;
    if (score < best) { best = score; angle = a; }
  }
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** A click on steep or capped ground sends sediment to a nearby receiving hollow. Search is
 * deterministic and bounded by the map; there is no rejected terrain category. A drag still
 * supplies its own direction. Flats receive a sheet, rather than a cone perched on a plateau. */
function receivingGround(m: FullForceMap, origin: PathPoint, intent: Intent, s: Settings): { mouth: PathPoint; placement: Plan["placement"] } {
  const h = m.heights[index(m, origin.x, origin.y)];
  let low = h, high = h;
  for (let y = -5; y <= 5; y += 2) for (let x = -5; x <= 5; x += 2) {
    const v = m.heights[index(m, origin.x + x, origin.y + y)]; low = Math.min(low, v); high = Math.max(high, v);
  }
  let units = 0;
  const cut = Math.ceil(.6 + Math.max(.025, s.power / 100) * 4.4), required = Math.round(48 + Math.max(.025, s.power / 100) * 160);
  for (let y = Math.max(0, Math.floor(origin.y - 48)); y <= Math.min(m.H - 1, Math.ceil(origin.y + 48)); y++)
    for (let x = Math.max(0, Math.floor(origin.x - 48)); x <= Math.min(m.W - 1, Math.ceil(origin.x + 48)); x++) {
      const v = m.heights[y * m.W + x];
      if (Math.hypot(x - origin.x, y - origin.y) <= 48 && v > h && v > s.floor) units += Math.min(cut, v - s.floor);
    }
  const higher = units >= required;
  if (higher && m.water.depth[index(m, origin.x, origin.y)] > .08) return { mouth: origin, placement: "delta" };
  if (higher && intent.path && intent.path.length > 1) return { mouth: origin, placement: high - low < 2 ? "sheet" : "fan" };
  if (higher && h - low < 3 && h < m.maxHeight - 1) return { mouth: origin, placement: high - low < 2 ? "sheet" : "fan" };
  // Choose a low landing within a sediment run's reach, favouring the nearest low foot.
  let best = Infinity, mouth = origin;
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const d = Math.hypot(x - origin.x, y - origin.y), v = m.heights[y * m.W + x];
    if (v > h - 2 || d > 48 || d < 3) continue;
    const score = d + v * 2.5;
    if (score < best) { best = score; mouth = { x, y }; }
  }
  return { mouth, placement: high <= h ? "hollow" : "slope" };
}

/** Yielding planner. Integer sediment units are cut only when there is room to deposit them. */
export function* planDeposit(input: ForceMap, settings: Settings, intent: Intent): Generator<void, Plan> {
  validate(input, settings, intent);
  const before = fullMap(input), map = snapshotMap(before), s = { ...settings };
  const path = resamplePath(intent.path ?? [intent.click!], 2, 128), origin = path[0];
  let { mouth, placement } = receivingGround(before, origin, intent, s);
  const end = path.at(-1)!;
  const drawn = path.length > 1 && Math.hypot(end.x - mouth.x, end.y - mouth.y) > 1;
  // Even Power zero buys the smallest visible apron. Power adds volume and footprint, never a
  // chance of doing nothing. No material is minted to meet that lower bound.
  const power = Math.max(.025, s.power / 100);
  const reach = drawn ? clamp(Math.hypot(end.x - mouth.x, end.y - mouth.y), 4, 112) : 9 + widthOf(s) * .80 * (.30 + .70 * power);
  const dir = heading(before, mouth, intent, reach), width = drawn ? Math.max(10, reach * .95) : widthOf(s) * (.35 + .65 * power);
  const floor = forceFloor(s, map.maxHeight), arrival = new Float32Array(map.heights.length).fill(2);
  const at = index(map, mouth.x, mouth.y), mouthH = before.heights[at];
  let wet = false;
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (before.water.depth[index(map, mouth.x + x, mouth.y + y)] > .08) wet = true;
  const datumH = Math.max(mouthH, wet ? Math.ceil(mouthH + before.water.depth[at]) : mouthH);
  const outlet = wet ? outletThread(before, mouth, dir) : new Uint8Array(map.heights.length);
  const spine: { x: number; y: number; along: number }[] = [];
  for(let i=0;i<outlet.length;i++) if(outlet[i]) {
    const x=i%map.W,y=Math.floor(i/map.W),along=(x-mouth.x)*dir.x+(y-mouth.y)*dir.y;
    if(along>=-1) spine.push({x,y,along});
  }
  const nChannels = s.channels === "few" ? 2 : s.channels === "many" ? 5 : (width > 38 ? 4 : 3);
  const branches: PathPoint[][] = [];
  const channel = new Uint8Array(map.heights.length);
  // Connected curving distributaries: each shares the feeder before diverging. They remain dry
  // drainage lines on a dry fan. Banks are one level; no extra water or sources are introduced.
  for (let b = 0; b < nChannels; b++) {
    const branch: PathPoint[] = [];
    for (let k = 0; k <= Math.ceil(reach * 2); k++) {
      const u = k / Math.ceil(reach * 2), d = u * reach;
      let spread = (b / (nChannels - 1) - .5) * width * .85 * smooth((u - .1) / .9);
      const wander = (noise(s.seed, d / 10, 400 + b * 51) - .5) * 3 * smooth(u * 8);
      let cx=mouth.x+dir.x*d,cy=mouth.y+dir.y*d;
      if(wet && spine.length) {
        let best=Infinity;
        for(const p of spine) { const score=Math.abs(p.along-d)*4+Math.hypot(p.x-cx,p.y-cy)*.1; if(score<best){best=score;cx=p.x;cy=p.y;} }
        // Low native ground sets the available branching room. The old Canyon bed is below
        // Floor 1; threading its bed avoids inventing a cut below that shared rule.
        let left=0,right=0;
        for(const side of [-1,1]) for(let v=.5;v<=width*.48;v+=.5) {
          const xx=cx-dir.y*v*side,yy=cy+dir.x*v*side;
          if(xx<0||yy<0||xx>=map.W||yy>=map.H||before.heights[index(map,xx,yy)]>mouthH) break;
          if(side<0)left=-v;else right=v;
        }
        const t=b/(nChannels-1),fork=smooth((u-.04)/.25);
        spread=(left+(right-left)*t)*.8*fork;
        spread=clamp(spread+wander*.18,left*.8,right*.8);
      }
      const x = cx - dir.y * (spread + (wet && spine.length ? 0 : wander)), y = cy + dir.x * (spread + (wet && spine.length ? 0 : wander));
      branch.push({ x, y });
      for (let yy = Math.floor(y - 1); yy <= Math.ceil(y + 1); yy++) for (let xx = Math.floor(x - 1); xx <= Math.ceil(x + 1); xx++)
        if (xx >= 0 && yy >= 0 && xx < map.W && yy < map.H && Math.hypot(xx - x, yy - y) <= (wet ? .85 : 1.15)) channel[yy * map.W + xx] = 1;
    }
    branches.push(branch);
  }
  const channelStages = [0, 1].map(stage => {
    const mask = new Uint8Array(channel.length);
    for (let b = 0; b < branches.length; b++) for (let k = 0; k < branches[b].length; k++) {
      const p = branches[b][k], u = k / (branches[b].length - 1);
      if (u > .16 && (stage === 0 ? b >= Math.ceil(branches.length / 2) : b < Math.floor(branches.length / 2))) continue;
      const shift = wet ? 0 : (noise(s.seed, u * 5, 2500 + stage * 100 + b * 17) - .5) * 4 * smooth(u * 5);
      for (const d of [-.5, 0, .5]) mask[index(map, p.x - dir.y * (shift + d), p.y + dir.x * (shift + d))] = 1;
    }
    return mask;
  });
  channelStages.push(channel);
  const channelDistance = new Uint16Array(channel.length).fill(65535), queue: number[] = [];
  for (let i = 0; i < channel.length; i++) if (channel[i]) { channelDistance[i] = 0; queue.push(i); }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % map.W, y = Math.floor(i / map.W);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (xx < 0 || yy < 0 || xx >= map.W || yy >= map.H) continue;
      const j = yy * map.W + xx;
      if (channelDistance[j] > channelDistance[i] + 1) { channelDistance[j] = channelDistance[i] + 1; queue.push(j); }
    }
  }
  const offers: { i: number; target: number; rank: number; u: number }[] = [];
  const donors: { i: number; target: number; rank: number }[] = [];
  let expectedSupply = 0;
  for (let y = 0; y < map.H; y++) {
    for (let x = 0; x < map.W; x++) {
      const i = y * map.W + x, h = before.heights[i], dx = x - mouth.x, dy = y - mouth.y;
      const along = dx * dir.x + dy * dir.y, cross = -dx * dir.y + dy * dir.x;
      const u = along / reach;
      // Wide, shallow lobes meet existing high ground instead of burying a whole hillside.
      const lobe = .72 + .38 * noise(s.seed, cross / 8, 900) + .12 * noise(s.seed, along / 12, 700);
      const half = 3 + power * 6 + width * .5 * Math.pow(clamp(u, 0, 1), .78) * lobe;
      const offset = (noise(s.seed, along / 12, 2100) - .5) * width * .18 * smooth(u * 4);
      const toe = reach * (.73 + .31 * noise(s.seed, cross / 7, 1100));
      if (along >= -3 && along <= toe && Math.abs(cross - offset) < half) {
      const edge = smooth((half - Math.abs(cross - offset)) / 6) * smooth((toe - along) / 6);
        const datum = datumH + 1.7 + power * (placement === "sheet" ? 3 : 7) - clamp(u, 0, 1) * (1.2 + power * (placement === "sheet" ? 2 : 5));
        // Overlapping level tongues have their own beds and toes, breaking concentric steps.
        const relief = (noise(s.seed, along / 17 + cross / 10, 1400) - .5) * 1.35;
        let target = Math.max(h, Math.min(map.maxHeight, Math.round(h + Math.max(0, datum + relief - h) * edge)));
        // The river's existing bed stays a connected low route. A slight upstream backwater
        // supplies the level-one branches even on the old Canyon's level-zero bed.
        if (channel[i]) target = wet ? Math.min(target, Math.max(h, mouthH)) : Math.max(h, target - 1);
        // Shallow levees ease into the cone's flanks. The feeder may remain incised in old
        // Canyon rock, but new sediment never creates a tall wall immediately beside it.
        if (wet && !channel[i]) target = Math.min(target, Math.max(h, mouthH + 1 + Math.floor(channelDistance[i] * .8)));
        if (outlet[i] || (wet && before.water.depth[i] > .08 && along < 3)) target = h;
        if (wet && before.water.depth[i] > .08 && (before.water.depth[i] < .8 || channel[i])) target = Math.min(target, h + 1);
        if (target > h) offers.push({ i, target, rank: u + Math.abs(cross) / Math.max(1, half) * .08 + hash(s.seed, i) * .045, u });
      }
      // Higher upstream banks supply a visibly deeper valley. If the corridor is short or
      // exhausted, nearest higher ground supplies it instead (flat-ground flash floods).
      const back = -along, upstream = reach * 1.5 + 12;
      const donorWidth = 4 + Math.min(15, width * .27) * smooth(back / 12);
      if (back > 2 && back < upstream && Math.abs(cross) < donorWidth && h > floor && h > mouthH) {
        const expected = .6 + power * 4.4 * (.65 + .35 * smooth((upstream - back) / 15));
        const cut = Math.min(h - floor, Math.ceil(expected));
        expectedSupply += Math.min(h - floor, expected);
        if (cut > 0) donors.push({ i, target: h - cut, rank: back / upstream + Math.abs(cross) / donorWidth * .18 + hash(s.seed, i + 70000) * .05 });
      }
    }
    if (y % 8 === 7) yield;
  }
  // Extend supply to higher shoulders near the gesture. Prefer upstream cuts, then distance;
  // each donor must be higher than the receiving foot and obey the shared Floor.
  const offered = new Set(offers.map(o => o.i));
  for (let k = donors.length - 1; k >= 0; k--) if (offered.has(donors[k].i)) donors.splice(k, 1);
  const used = new Set(donors.map(d => d.i));
  let donorRadius = 0;
  for (let i = 0; i < before.heights.length; i++) {
    const h = before.heights[i], x = i % map.W, y = Math.floor(i / map.W);
    const d = Math.hypot(x - mouth.x, y - mouth.y);
    if (used.has(i) || offered.has(i) || h <= Math.max(floor, mouthH) || d > Math.max(48, width)) continue;
    const cut = Math.min(h - floor, Math.ceil(.6 + power * 4.4));
    donors.push({ i, target: h - cut, rank: 1.5 + d / Math.max(48, width) + hash(s.seed, i) * .03 });
    used.add(i);
    expectedSupply += cut;
  }
  // A capped/uphill drag still deposits into the nearest hollow. Rebuild a compact receiving
  // sheet if its requested sector contains no room. This is also the safety net for map edges.
  if (!offers.length && donors.length) {
    let best = Infinity, center = -1;
    for (let i = 0; i < map.heights.length; i++) {
      const h = before.heights[i]; if (h >= mouthH || h >= map.maxHeight) continue;
      const d = Math.hypot(i % map.W - origin.x, Math.floor(i / map.W) - origin.y);
      if (d + h * 2 < best) { best = d + h * 2; center = i; }
    }
    if (center >= 0) {
      mouth = { x: center % map.W, y: Math.floor(center / map.W) }; placement = "hollow";
      const radius = 4 + power * 10, datum = before.heights[center] + 1 + power * 4;
      for (let i = 0; i < map.heights.length; i++) {
        if (used.has(i)) continue;
        const d = Math.hypot(i % map.W - mouth.x, Math.floor(i / map.W) - mouth.y);
        const target = Math.min(map.maxHeight, Math.round(datum - d / radius * (1 + power * 3)));
        if (d < radius && target > before.heights[i]) offers.push({ i, target, rank: d / radius, u: d / radius });
      }
    }
  }
  // A tiny sector at an edge or between channels must still read as an apron. Add a connected
  // shallow tongue around its foot, preferring dry banks; its volume still comes from donors.
  const minimum = Math.round(48 + power * 160);
  let room = offers.reduce((v, o) => v + o.target - before.heights[o.i], 0);
  const minimumArea = 16 + Math.round(power * 16);
  if (room < minimum || offers.length < minimumArea) {
    const existing = new Set(offers.map(o => o.i));
    const candidates = Array.from({ length: map.heights.length }, (_, i) => i).filter(i => !existing.has(i) && !outlet[i] && !channel[i]);
    candidates.sort((a, b) => {
      const distance = (i: number) => Math.hypot(i % map.W - mouth.x, Math.floor(i / map.W) - mouth.y);
      return distance(a) - distance(b) || a - b;
    });
    for (const i of candidates) {
      const d = Math.hypot(i % map.W - mouth.x, Math.floor(i / map.W) - mouth.y);
      if (d > Math.max(16, width * .6) || before.heights[i] >= map.maxHeight || before.heights[i] > mouthH + 3 + power * 2) continue;
      // Reserve nearby receiving space before cutting shoulders. Those tiles cannot be both
      // donors and recipients; other higher ground pays for the new apron.
      const donor = donors.findIndex(v => v.i === i);
      if (donor >= 0) { donors.splice(donor, 1); used.delete(i); }
      const base = Math.max(mouthH + 2, Math.ceil(before.heights[i] + before.water.depth[i]) + 1);
      const target = Math.min(map.maxHeight, Math.max(before.heights[i] + 1, base + Math.round(power * 2 - d * .1)));
      offers.push({ i, target, rank: d / Math.max(12, reach), u: d / Math.max(12, reach) });
      room += target - before.heights[i]; if (room >= minimum && offers.length >= minimumArea) break;
    }
  }
  // A narrow hollow can have too little shallow receiving area. Fill its contiguous apron
  // another level at a time, rather than quietly spending just a handful of blocks. Never
  // exceed the ceiling or dam the protected outlet; the eventual budget still caps all cuts.
  while (room < minimum) {
    let grew = false;
    for (const o of offers) {
      if (o.target >= Math.min(map.maxHeight, before.heights[o.i] + 3 + Math.round(power * 5)) || channel[o.i] || outlet[o.i]) continue;
      o.target++; room++; grew = true; if (room >= minimum) break;
    }
    if (!grew) break;
  }
  offers.sort((a, b) => a.rank - b.rank || a.i - b.i); donors.sort((a, b) => a.rank - b.rank || a.i - b.i);
  const capacity = offers.reduce((v, o) => v + o.target - before.heights[o.i], 0);
  // Fractional Power buys a contiguous shallow patch, rather than speckling the valley with
  // independent random cuts. One tile-level is the smallest honest parcel of sediment.
  const supply = Math.max(minimum, Math.round(expectedSupply));
  const donorCapacity = donors.reduce((v, d) => v + before.heights[d.i] - d.target, 0);
  const budget = Math.min(capacity, supply, donorCapacity); let remaining = budget;
  // Complete each shallow lobe before advancing the front; no sparse sprinkle of isolated blocks.
  for (const o of offers) {
    const add = Math.min(remaining, o.target - before.heights[o.i]);
    map.heights[o.i] += add; remaining -= add;
    if (add) {
      const x = o.i % map.W - mouth.x, y = Math.floor(o.i / map.W) - mouth.y;
      const side = (-x * dir.y + y * dir.x) / Math.max(1, width);
      // Alternating tongues advance instead of a uniform circular front. The beds switch
      // when one tongue overtakes its neighbour, and final channels remain seed-deterministic.
      arrival[o.i] = clamp(.08 + o.u * .66 + .16 * smooth(side * Math.sin(o.u * Math.PI * 3) * 4 + .5)
        + noise(s.seed, (o.i % map.W) / 9, 1800) * .035, .04, .88);
    }
  }
  remaining = budget;
  for (const d of donors) {
    const cut = Math.min(remaining, before.heights[d.i] - d.target);
    map.heights[d.i] -= cut; remaining -= cut;
    if (cut) { arrival[d.i] = .02 + d.rank * .055; donorRadius = Math.max(donorRadius, Math.hypot(d.i % map.W - mouth.x, Math.floor(d.i / map.W) - mouth.y)); }
  }
  for (let i = 0; i < channel.length; i++) if (channel[i] && arrival[i] > 1) {
    const along = (i % map.W - mouth.x) * dir.x + (Math.floor(i / map.W) - mouth.y) * dir.y;
    if (along >= 0 && along < reach) arrival[i] = clamp(.08 + along / reach * .75, .08, .88);
  }
  holdAtFloor(before.heights, map.heights, floor); trimRock(map);
  const stats = { changed: 0, eroded: 0, deposited: 0, balance: 0, maximumCut: 0, maximumDeposit: 0, channels: nChannels, wet, buried: 0, carried: 0, startCarried: false, levelTiles: 0 };
  map.entities = map.entities.filter(e => {
    const i = e.y * map.W + e.x, dz = map.heights[i] - before.heights[i];
    if (dz > 0 && !/Source|Seep|StartingLocation/.test(e.template) && dz >= (isPlant(e) ? (e.template === "BlueberryBush" ? 2 : 3) : 4)) { stats.buried++; return false; }
    if (dz) { e.z += dz; delete e.raw; stats.carried++; }
    return true;
  });
  if (budget) {
    // Carry against both present water and the shared drainage prediction. A level bank that
    // is about to become a river is not a safe home. The predictor never becomes visible water.
    const predicted = prefill(modelOf(map)), risk = before.water.depth.slice();
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      const i = y * map.W + x;
      if (predicted.depth[i] <= .01) continue;
      const surface = map.heights[i] + predicted.depth[i];
      for (let yy = Math.max(0, y-3); yy <= Math.min(map.H-1,y+3); yy++) for (let xx = Math.max(0,x-3); xx <= Math.min(map.W-1,x+3); xx++) {
        const j = yy * map.W + xx;
        if (map.heights[j] < surface + .65) risk[j] = Math.max(risk[j], .1);
      }
    }
    stats.startCarried = carryStart({ ...map, water: { depth: risk, contamination: before.water.contamination } }, before);
  } else stats.startCarried = carryStart(map, before);
  const tiles: number[] = [], heights: number[] = [];
  for (let i = 0; i < map.heights.length; i++) {
    const dz = map.heights[i] - before.heights[i];
    if (dz) { tiles.push(i); heights.push(map.heights[i]); stats.changed++; }
    if (dz > 0) { stats.deposited += dz; stats.maximumDeposit = Math.max(stats.maximumDeposit, dz); }
    else if (dz < 0) { stats.eroded -= dz; stats.maximumCut = Math.max(stats.maximumCut, -dz); }
    if (dz > 0 && i % map.W > 0 && i % map.W < map.W - 1 && i >= map.W && i < map.heights.length - map.W && [i-1,i+1,i-map.W,i+map.W].every(j => map.heights[j] === map.heights[i])) stats.levelTiles++;
  }
  stats.balance = stats.deposited - stats.eroded;
  return { before, map, arrival, mouth, origin, placement, donorRadius, direction: dir, reach, branches, channel, channelStages, settings: s, stats,
    operation: { version: 1, verb: "deposit", settings: s, path, tiles, heights, entities: structuredClone(map.entities), lava: tiles.map(i => map.lava[i]) } };
}
export function plan(input: ForceMap, s: Settings, intent: Intent): Plan {
  const g = planDeposit(input, s, intent); for (;;) { const r = g.next(); if (r.done) return r.value; }
}
/** Standalone adapter. The milestone uses the existing document carryStartOps transaction. */
export function carryStart(m: FullForceMap, before: FullForceMap): boolean {
  const start = m.entities.find(e => e.template === "StartingLocation");
  if (!start || !startProblem(m)) return false;
  const original = before.entities.find(e => e.id === start.id)!;
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let y = 2; y < m.H - 4; y++) for (let x = 2; x < m.W - 4; x++) candidates.push({ x, y, d: (x - original.x) ** 2 + (y - original.y) ** 2 });
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const occupied = new Set(m.entities.filter(e => e.id !== start.id && !isPlant(e) && e.template !== "Slope").flatMap(e => footprint(m, e)));
  for (const p of candidates) {
    const e = { ...start, x: p.x, y: p.y, z: m.heights[p.y * m.W + p.x] }, tiles = footprint(m, e, 1);
    if (tiles.some(i => m.heights[i] !== e.z || m.water.depth[i] > .05 || occupied.has(i))) continue;
    Object.assign(start, e); delete start.raw; return true;
  }
  throw Error("No level ground remains for the start");
}
export function replay(before: ForceMap, op: Operation): FullForceMap {
  const m = fullMap(before); op.tiles.forEach((i, k) => { m.heights[i] = op.heights[k]; m.lava[i] = op.lava[k]; }); m.entities = structuredClone(op.entities); return m;
}
export function reveal(p: Plan, progress: number): FullForceMap {
  if (progress >= 1) return snapshotMap(p.map);
  const out = snapshotMap(p.before);
  for (let i = 0; i < out.heights.length; i++) if (p.arrival[i] <= progress) { out.heights[i] = p.map.heights[i]; out.lava[i] = p.map.lava[i]; }
  // Old distributaries fill while a new lobe takes the sediment. These temporary beds are
  // presentation only, bounded by the same Floor and arrival; final land is literal and fixed.
  const stage = progress < .36 ? 0 : progress < .68 ? 1 : 2, active = p.channelStages[stage];
  if (stage < 2) for (let i = 0; i < out.heights.length; i++) {
    if (p.arrival[i] > progress || (!p.channel[i] && p.map.heights[i] <= p.before.heights[i])) continue;
    if (active[i] && !p.channel[i]) out.heights[i] = Math.max(p.before.heights[i], out.heights[i] - 1);
    else if (p.channel[i] && !active[i]) out.heights[i] = Math.min(p.map.maxHeight,
      Math.max(out.heights[i] + 1, Math.ceil(p.before.heights[i] + p.before.water.depth[i]) + 1));
  }
  const final = new Map(p.map.entities.map(e => [e.id, e]));
  out.entities = p.before.entities.flatMap(e => {
    if (!footprint(out, e).some(i => p.arrival[i] <= progress)) return [structuredClone(e)];
    const f = final.get(e.id); if (!f) return [];
    const result = structuredClone(f);
    if (result.x === e.x && result.y === e.y) { const i = e.y * out.W + e.x; result.z += out.heights[i] - p.map.heights[i]; }
    return [result];
  });
  for (let i = 0; i < out.heights.length; i++) if (p.arrival[i] <= progress)
    out.water.depth[i] = Math.max(0, p.before.heights[i] + p.before.water.depth[i] - out.heights[i]);
  const pose = p.previewWater?.filter(w => w.progress <= progress).at(-1);
  if (pose) for (let i = 0; i < out.heights.length; i++) {
    // A live shared-solver preview is presented only behind the arrived front. Untouched
    // upstream/outlet water stays as it was until final settlement can reach it.
    const reached = [i, i - 1, i + 1, i - out.W, i + out.W].some(j => j >= 0 && j < out.heights.length && p.arrival[j] <= progress);
    if (reached) { out.water.depth[i] = Math.max(0, pose.heights[i] + pose.water.depth[i] - out.heights[i]); out.water.contamination[i] = pose.water.contamination[i]; }
  }
  return out;
}
/** The same warm-start and convergence rule as the editor, never a fixed tick count called settled. */
export class DepositWater {
  private continuation: SettleRun | null = null;
  private final: CanonicalWater | null = null;
  constructor(private preview: PreviewJob) {}
  get sim() { return this.preview.sim; }
  get ticks() { return this.preview.ticks; }
  advance(ticks: number): CanonicalWater | null {
    if(this.final) return this.final;
    if(!this.continuation) {
      const r=this.preview.advance(ticks);
      if(!r)return null;
      if(r.settled || r.steadyTicks!==undefined) return this.final=r;
      // A slowly moving lake is not settled just because the editor's preview budget ended.
      // Continue the same shared solver and stopping rule, without blocking final land.
      this.continuation=new SettleRun(this.sim,{checkEvery:PREVIEW_CHECK,movedShare:PREVIEW_MOVED,tol:PREVIEW_TOL,maxDays:12,sealed:sealedTiles(this.preview.model),untilSteady:true});
      return null;
    }
    const r=this.continuation.advance(ticks);
    if(!r)return null;
    return this.final={...r,depth:this.sim.D.slice(),contamination:this.sim.C.slice(),sat:this.sim.saturation(),out:this.sim.out.slice(),preview:true};
  }
}
export function waterJob(p: Pick<Plan, "before" | "map">): DepositWater {
  const b = p.before;
  return new DepositWater(new PreviewJob({ model: modelOf(b), water: { ...b.water, settled: true, ticks: 0, sat: new Uint8Array(b.heights.length), out: new Float64Array(b.heights.length * 4) } }, modelOf(p.map)));
}
export function settle(p: Plan): { settled: boolean; ticks: number; steady: boolean } {
  const job = waterJob(p); let result; do { result = job.advance(64); } while (!result);
  p.map.water = { depth: result.depth, contamination: result.contamination };
  return { settled: result.settled, ticks: result.ticks, steady: result.steadyTicks !== undefined };
}
