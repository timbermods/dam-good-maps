// A large gesture meets several kinds of land. Resolve local patches on the ORIGINAL map,
// union their wear (overlaps never multiply Power), then schedule one supported animation.
import { BUCKETS, HEADROOM, erosionFloor, params, planLocal, type ErodeInput, type ErodePlan, type ErodeSettings, type Gesture } from "./erode";
import { planRoof, touchedRoof } from "./roof";
import { planWash } from "./wash";
import { clamp, hash } from "./random";
import { support } from "./support";
import { LAYERS } from "./terrain";

type Point = Gesture["points"][number];
type Patch = { kind: "gallery" | "wash" | "roof"; floor: number; points: Point[] };

export function planSweep(input: ErodeInput, gesture: Gesture, set: ErodeSettings): ErodePlan | null {
  const start = performance.now(), before = input.terrain, { W, H, N } = before;
  if (gesture.points.length < 2) return null;
  const radius = params(set, false).radius;
  const points = gesture.points.map(p => ({ ...p, x: clamp(p.x, 0, W - .01), y: clamp(p.y, 0, H - .01) }));
  // A gesture contained in one opening keeps the established click/local-sweep behaviour.
  const extent = Math.hypot(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)));
  if (extent <= radius * 2.5) return null;
  const neighbours = (i: number) => [i % W ? i - 1 : -1, i % W < W - 1 ? i + 1 : -1,
    i >= W ? i - W : -1, i < N - W ? i + W : -1].filter(j => j >= 0);
  const faces = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const x = i % W, y = Math.floor(i / W);
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2 || input.keep?.[i]) continue;
    const floors = new Set<number>();
    for (const j of neighbours(i)) for (let f = 1; f <= before.surface(i) - HEADROOM; f++)
      if (before.at(j, f - 1) && !before.at(j, f) && before.at(i, f)) floors.add(f);
    if (floors.size) faces.set(i, [...floors]);
  }
  const samples: Point[] = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k], count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
    const top = (p: Point) => p.nz === 1 || (p.nz !== -1 && p.nz !== 0 &&
      (p.z === undefined || p.z >= before.surface(Math.floor(p.y) * W + Math.floor(p.x)) - 1));
    for (let j = k === 1 ? 0 : 1; j <= count; j++) {
      const u = j / count, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
      const surface = top(a) && top(b), i = Math.floor(y) * W + Math.floor(x);
      samples.push({ x, y, z: surface ? before.surface(i) - .5 : a.z === undefined ? b.z : a.z + ((b.z ?? a.z) - a.z) * u,
        nz: surface ? 1 : a.nz });
    }
  }
  const patches: Patch[] = [];
  let active: Patch | undefined, open: Patch | undefined, surfaceAboveFace = false;
  const classifications = new Set<string>();
  for (const p of samples) {
    const roof = touchedRoof(before, p);
    let face: Point | undefined, floor = -1, distance = radius + 1.5;
    if (!roof) for (let y = Math.max(2, Math.floor(p.y - distance)); y <= Math.min(H - 3, Math.ceil(p.y + radius + 1.5)); y++)
      for (let x = Math.max(2, Math.floor(p.x - radius - 1.5)); x <= Math.min(W - 3, Math.ceil(p.x + radius + 1.5)); x++) {
        const fs = faces.get(y * W + x), d = Math.hypot(x + .5 - p.x, y + .5 - p.y);
        if (fs && d < distance) { distance = d; floor = Math.min(...fs); face = { x: x + .5, y: y + .5, z: floor + .5, nz: 0 }; }
      }
    const kind = roof ? "roof" : face ? "gallery" : "wash";
    if (face && p.nz === 1 && p.z! >= floor + 1) surfaceAboveFace = true;
    classifications.add(`${kind}:${floor}`);
    if (kind === "wash") active = undefined;
    else {
      if (active?.kind !== kind || active.floor !== floor) { active = { kind, floor, points: [] }; patches.push(active); }
      active.points.push(face ?? p);
    }
    // Surface strokes also wear the intervening tops/floors. A roof is handed only to its
    // own planner, and a wall/inside stroke never excavates a wash on the top above it.
    if (!roof && (p.nz === 1 || kind === "wash")) {
      if (!open) { open = { kind: "wash", floor: -1, points: [] }; patches.push(open); }
      open.points.push(p);
    } else open = undefined;
  }
  if (classifications.size <= 1 && !surfaceAboveFace) return null;
  const washKeep = input.keep?.slice() ?? new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!before.plain(i)) washKeep[i] = 1;
  const children = patches.map(p => p.kind === "roof" ? planRoof(input, { points: p.points }, set, false)! :
    p.kind === "gallery" ? planLocal(input, { points: p.points }, set, false) :
      planWash({ ...input, keep: washKeep }, { points: p.points }, set, false, true));
  const final = before.clone(), cutFloor = erosionFloor(set), falling = new Set<number>();
  for (const child of children) for (const v of child.removed) {
    final.set(v % N, Math.floor(v / N), false);
    if (child.roof) falling.add(v);
  }
  // A union may cut the support another patch retained. Keep original source support chains;
  // all other unheld edges join the wear in this same operation.
  const protectedRock = new Uint32Array(N);
  const hold = (i: number, z: number): void => {
    if (z < 0 || !before.at(i, z) || (protectedRock[i] & (1 << z))) return;
    protectedRock[i] |= 1 << z; final.set(i, z, true);
    if (before.at(i, z - 1)) { hold(i, z - 1); return; }
    const q = [[i]], seen = new Set([i]);
    for (let k = 0; k < q.length; k++) {
      const path = q[k], j = path[path.length - 1];
      if (before.at(j, z - 1)) { for (const n of path.slice(1)) { protectedRock[n] |= 1 << z; final.set(n, z, true); } hold(j, z - 1); return; }
      if (path.length > 3) continue;
      for (const n of neighbours(j)) if (!seen.has(n) && before.at(n, z)) { seen.add(n); q.push([...path, n]); }
    }
  };
  for (let i = 0; i < N; i++) if (input.keep?.[i]) for (let z = 0; z < LAYERS; z++) hold(i, z);
  for (;;) {
    const loose = support(final).unsupported;
    if (!loose.length) break;
    for (const v of loose) {
      const z = Math.floor(v / N), i = v % N;
      if (z < cutFloor || (protectedRock[i] & (1 << z))) throw new Error("sweep lost protected support");
      final.set(i, z, false); falling.add(v);
    }
  }
  // Overlapping openings can leave a one-voxel nub on a floor. Remove it only if no rock
  // depends on it; original untouched rock away from the gesture is outside this cleanup.
  const touched = new Set<number>();
  for (let i = 0; i < N; i++) if (final.cols[i] !== before.cols[i]) for (const j of [i, ...neighbours(i)]) touched.add(j);
  let cleaned = true;
  while (cleaned) {
    cleaned = false;
    for (const i of touched) for (let z = LAYERS - 2; z >= cutFloor; z--) {
      if (!final.at(i, z) || final.at(i, z + 1) || neighbours(i).some(j => final.at(j, z)) || (protectedRock[i] & (1 << z))) continue;
      final.set(i, z, false);
      if (support(final).unsupported.length) final.set(i, z, true);
      else cleaned = true;
    }
  }
  // Keep roof rubble in supported clusters, settling onto the combined (possibly washed) floor.
  const added: number[] = [], claimed = new Set<number>();
  for (const child of children) for (const v of child.added ?? []) {
    const i = v % N;
    if (claimed.has(i) || input.keep?.[i]) continue;
    const x = i % W, y = Math.floor(i / W), base = [i, i + 1, i + W, i + W + 1], z = final.run0Top(i);
    if (x >= W - 1 || y >= H - 1 || base.some(j => claimed.has(j) || input.keep?.[j] || final.run0Top(j) !== z || final.at(j, z) || before.at(j, z))) continue;
    for (const j of base) { final.set(j, z, true); added.push(z * N + j); claimed.add(j); }
    for (const j of base.flatMap(neighbours)) claimed.add(j);
  }
  const removed: number[] = [];
  for (let i = 0; i < N; i++) for (let z = cutFloor; z < LAYERS; z++) if (before.at(i, z) && !final.at(i, z)) removed.push(z * N + i);
  removed.sort((a, b) => Math.floor(b / N) - Math.floor(a / N) || hash(set.seed, a) - hash(set.seed, b));
  const buckets = new Map(removed.map((v, k) => [v, Math.min(BUCKETS - 1, Math.floor(k / removed.length * BUCKETS))]));
  const shown = before.clone(), pending = new Set(removed);
  for (let b = 0; b < BUCKETS; b++) {
    for (const v of removed) if (buckets.get(v) === b) { shown.set(v % N, Math.floor(v / N), false); pending.delete(v); }
    for (;;) {
      const loose = support(shown).unsupported;
      if (!loose.length) break;
      for (const v of loose) {
        if (!pending.has(v)) throw new Error("sweep animation loses final support");
        shown.set(v % N, Math.floor(v / N), false); buckets.set(v, b); pending.delete(v);
      }
    }
  }
  removed.sort((a, b) => buckets.get(a)! - buckets.get(b)!);
  const tiles = [...removed, ...added].map(v => v % N);
  return { final, removed: Int32Array.from(removed), bucket: Uint8Array.from(removed, v => buckets.get(v)!),
    falling: Uint8Array.from(removed, v => +falling.has(v)), added: Int32Array.from(added), addBucket: Uint8Array.from(added, () => BUCKETS - 1),
    sweep: { parts: patches.length, galleries: patches.filter(p => p.kind === "gallery").length,
      washes: patches.filter(p => p.kind === "wash").length, roofs: patches.filter(p => p.kind === "roof").length },
    buckets: BUCKETS, duration: .65, worn: removed.length, held: children.reduce((s, p) => s + p.held, 0), fell: falling.size,
    focus: children.find(p => p.worn)?.focus ?? null,
    box: tiles.length ? { x0: Math.min(...tiles.map(i => i % W)), y0: Math.min(...tiles.map(i => Math.floor(i / W))),
      x1: Math.max(...tiles.map(i => i % W)), y1: Math.max(...tiles.map(i => Math.floor(i / W))) } : { x0: 0, y0: 0, x1: -1, y1: -1 },
    details: children.find(p => p.details)?.details,
    ms: performance.now() - start, ...(!removed.length ? { reason: "At the Erode Floor or protected source ground" } : {}) };
}
