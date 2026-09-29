// Wear the solid run the pointer actually touched. Thin beds open; thick beds keep a span.
import { BUCKETS, erosionFloor, type ErodeInput, type ErodePlan, type ErodeSettings, type Gesture } from "./erode";
import { clamp, hash, noise3 } from "./random";
import { support } from "./support";
import { LAYERS, Terrain } from "./terrain";

type Roof = { i: number; x: number; y: number; bottom: number; top: number; ground: number; inside: boolean };
export function touchedRoof(t: Terrain, p: Gesture["points"][number]): Roof | undefined {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= t.W || y >= t.H || p.nz === 0) return;
  const i = y * t.W + x, runs = t.runs(i), z = p.z ?? t.surface(i) - 0.5;
  for (let k = 2; k < runs.length; k += 2) {
    const bottom = runs[k], top = runs[k + 1];
    const inside = p.nz === -1 || (p.nz === undefined && z < bottom + 1 && top - bottom > 1);
    if (z >= bottom && z < top && (inside ? z < bottom + 1 : z >= top - 1))
      return { i, x: x + 0.5, y: y + 0.5, bottom, top, ground: runs[k - 1], inside };
  }
}

export function planRoof(input: ErodeInput, gesture: Gesture, set: ErodeSettings, animate = true): ErodePlan | null {
  const started = performance.now(), before = input.terrain, { W, H, N } = before;
  const hits = gesture.points.map(p => touchedRoof(before, p)).filter((p): p is Roof => !!p);
  if (!hits.length) return null;
  const t = before.clone(), floor = erosionFloor(set), P = clamp(set.power / 100, 0, 1);
  const S = clamp((set.size ?? 25 + 0.6 * set.power) / 100, 0, 1);
  const radius = 1.4 + 6.5 * S, inside = hits.filter(h => h.inside).length > hits.length / 2;
  const neighbours = (i: number) => [i % W ? i - 1 : -1, i % W < W - 1 ? i + 1 : -1,
    i >= W ? i - W : -1, i < N - W ? i + W : -1].filter(j => j >= 0);
  // Retain the original support chains of source ground, even when the source sits on a roof.
  const protectedRock = new Uint32Array(N);
  const hold = (i: number, z: number): void => {
    if (z < 0 || !before.at(i, z) || (protectedRock[i] & (1 << z))) return;
    protectedRock[i] |= 1 << z;
    if (before.at(i, z - 1)) { hold(i, z - 1); return; }
    const q = [[i]], seen = new Set([i]);
    for (let k = 0; k < q.length; k++) {
      const path = q[k], j = path[path.length - 1];
      if (before.at(j, z - 1)) { for (const n of path.slice(1)) protectedRock[n] |= 1 << z; hold(j, z - 1); return; }
      if (path.length > 3) continue;
      for (const n of neighbours(j)) if (!seen.has(n) && before.at(n, z)) { seen.add(n); q.push([...path, n]); }
    }
  };
  for (let i = 0; i < N; i++) if (input.keep?.[i]) for (let z = 0; z < LAYERS; z++) hold(i, z);
  const erase = (i: number, z: number) => { if (z >= floor && !(protectedRock[i] & (1 << z))) t.set(i, z, false); };
  const patches = new Map<number, Roof & { distance: number }>();
  // Sample between pointer hits too, so a sweep has one continuous footprint.
  const samples = hits.slice();
  for (let k = 1; k < hits.length; k++) {
    const a = hits[k - 1], b = hits[k], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 1; j < n; j++) samples.push({ ...a, x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n });
  }
  for (const h of samples) for (let y = Math.max(0, Math.floor(h.y - radius)); y <= Math.min(H - 1, Math.ceil(h.y + radius)); y++)
    for (let x = Math.max(0, Math.floor(h.x - radius)); x <= Math.min(W - 1, Math.ceil(h.x + radius)); x++) {
      const i = y * W + x, distance = Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y);
      if (distance > radius || input.keep?.[i]) continue;
      const runs = before.runs(i);
      for (let k = 2; k < runs.length; k += 2) {
        const bottom = runs[k], top = runs[k + 1], ground = runs[k - 1];
        if (Math.abs(bottom - h.bottom) > 3 || ground >= h.bottom || top <= h.ground) continue;
        if (!patches.has(i) || distance < patches.get(i)!.distance)
          patches.set(i, { i, x: x + 0.5, y: y + 0.5, bottom, top, ground, inside, distance });
      }
    }
  const weak = [...patches.values()].sort((a, b) =>
    (a.top - a.bottom + a.distance * 0.45) - (b.top - b.bottom + b.distance * 0.45))[0];
  for (const r of patches.values()) {
    const grain = noise3(set.seed ^ 91, r.x, r.y, r.bottom, 2.6);
    const d = r.distance / (radius * (0.8 + 0.28 * grain));
    if (d >= 1) continue;
    const profile = Math.sqrt(1 - d * d), thickness = r.top - r.bottom;
    if (inside) {
      // A smooth upward vault; only a wafer too thin to remain opens to the sky.
      const rise = Math.max(1, Math.round((1 + 4 * P) * profile * (0.8 + grain * 0.35)));
      const end = thickness - rise <= 1 ? r.top : Math.min(r.top, r.bottom + rise);
      for (let z = r.bottom; z < end; z++) erase(r.i, z);
    } else {
      // Seepage finds the thinnest nearby bed. Power widens its collapse; thick ribs survive.
      const opening = Math.hypot(r.x - weak.x, r.y - weak.y) < (1.05 + radius * P) * (0.7 + grain * 0.5);
      const through = opening && thickness <= weak.top - weak.bottom + Math.round(P * 2);
      const depth = Math.max(1, Math.round((1 + 3 * P) * profile * (0.8 + grain * 0.35)));
      for (let z = through ? r.bottom : Math.max(r.bottom, r.top - depth); z < r.top; z++) erase(r.i, z);
    }
  }
  // Unheld edges join the fall now, never one frame later. Support only propagates upward.
  for (;;) {
    const loose = support(t).unsupported.filter(v => Math.floor(v / N) >= floor);
    if (!loose.length) break;
    for (const v of loose) {
      if (protectedRock[v % N] & (1 << Math.floor(v / N))) throw new Error("protected roof lost its support chain");
      erase(v % N, Math.floor(v / N));
    }
  }
  // Erase little detached roof flakes, retaining attached bridges and required roof legs.
  const visited = new Set<number>();
  for (const r of patches.values()) for (let z = Math.max(floor, r.bottom); z < r.top; z++) {
    const v = z * N + r.i;
    if (visited.has(v) || !t.at(r.i, z)) continue;
    const q = [v]; visited.add(v);
    let attached = false;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], j = c % N, level = Math.floor(c / N);
      if (level < before.run0Top(j) || level < floor || (protectedRock[j] & (1 << level))) { attached = true; continue; }
      for (const n of [...neighbours(j).map(i => level * N + i), c - N, c + N])
        if (n >= 0 && n < N * LAYERS && !visited.has(n) && t.at(n % N, Math.floor(n / N))) { visited.add(n); q.push(n); }
    }
    if (!attached && q.length <= 12) for (const c of q) erase(c % N, Math.floor(c / N));
  }
  const removed: number[] = [];
  for (let i = 0; i < N; i++) for (let z = floor; z < LAYERS; z++) if (before.at(i, z) && !t.at(i, z)) removed.push(z * N + i);
  const openings = [...patches.values()].filter(r => t.surface(r.i) <= r.ground);
  // Fallen rock settles in broad, low clusters. Most eroded material leaves as fines.
  const added: number[] = [], occupied = new Set<number>();
  let budget = Math.floor(removed.length * 0.35);
  for (const r of openings.sort((a, b) => hash(set.seed ^ 57, a.i) - hash(set.seed ^ 57, b.i))) {
    if (budget < 4 || added.length >= (P > 0.5 ? 32 : 8)) break;
    const base = [r.i, r.i + 1, r.i + W, r.i + W + 1];
    if (r.i % W >= W - 1 || r.i >= N - W || base.some(i => occupied.has(i) || input.keep?.[i] || t.run0Top(i) !== r.ground || t.surface(i) > r.ground)) continue;
    for (const i of base) { t.set(i, r.ground, true); added.push(r.ground * N + i); occupied.add(i); budget--; }
    if (P > 0.5 && budget >= 4 && r.bottom - r.ground >= 6) for (const i of base) { t.set(i, r.ground + 1, true); added.push((r.ground + 1) * N + i); budget--; }
    for (const i of base.flatMap(neighbours)) occupied.add(i);
  }
  // Stable 24-bucket removal, followed by supported rubble settling, on the existing .65 s clock.
  removed.sort((a, b) => (inside ? 1 : -1) * (Math.floor(a / N) - Math.floor(b / N)) || hash(set.seed, a) - hash(set.seed, b));
  const buckets = new Map(removed.map((v, k) => [v, Math.min(BUCKETS - 1, Math.floor(k / removed.length * BUCKETS))]));
  const shown = before.clone(), pending = new Set(removed);
  if (animate) for (let b = 0; b < BUCKETS; b++) {
    for (const v of removed) if (buckets.get(v) === b) { shown.set(v % N, Math.floor(v / N), false); pending.delete(v); }
    for (;;) {
      const loose = support(shown).unsupported;
      if (!loose.length) break;
      for (const v of loose) {
        if (!pending.has(v)) throw new Error("roof animation loses final support");
        shown.set(v % N, Math.floor(v / N), false); buckets.set(v, b); pending.delete(v);
      }
    }
  }
  removed.sort((a, b) => buckets.get(a)! - buckets.get(b)!);
  const tiles = [...removed, ...added].map(v => v % N), xs = tiles.map(i => i % W), ys = tiles.map(i => Math.floor(i / W));
  return { final: t, removed: Int32Array.from(removed), bucket: Uint8Array.from(removed, v => buckets.get(v)!),
    added: Int32Array.from(added), addBucket: Uint8Array.from(added, () => BUCKETS - 1), roof: inside ? "ceiling" : "roof",
    buckets: BUCKETS, duration: 0.65, worn: removed.length, held: 0, fell: openings.length ? removed.length : 0,
    focus: { x: hits[0].x, y: hits[0].y, z: hits[0].bottom },
    box: tiles.length ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } : { x0: 0, y0: 0, x1: -1, y1: -1 },
    ms: performance.now() - started, ...(!removed.length ? { reason: "At the Erode Floor or protected source ground" } : {}) };
}
