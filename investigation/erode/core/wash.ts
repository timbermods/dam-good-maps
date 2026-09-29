// Original dry-wash planner. A gesture makes the trunk; a least-excavation outlet continues it.
// A drainage tree levels the bed crosswise and can only lower it toward the outlet.
import type { ErodeInput, ErodePlan, ErodeSettings, Gesture } from "./erode";
import { clamp, hash, noise3 } from "./random";
import { support } from "./support";
import { LAYERS } from "./terrain";

export interface WashDetails { winding: number; sideGullies: number; dryFalls: number; undercutBanks: number }
export interface WashTrace { path: number[]; bedTiles: number[]; outlet: number; outletKind: "edge" | "water" }
export const DETAIL_LABELS: Record<keyof WashDetails, string> = {
  winding: "Winding", sideGullies: "Side gullies", dryFalls: "Dry falls", undercutBanks: "Undercut banks",
};
export function pickDetails(set: ErodeSettings, height: number): WashDetails {
  const keys = Object.keys(DETAIL_LABELS) as (keyof WashDetails)[];
  return Object.fromEntries(keys.map((k, i) => [k, clamp(set.details?.[k] ??
    Math.round(15 + 75 * hash(set.seed ^ (height * 101), i + 71)), 0, 100)])) as unknown as WashDetails;
}

export function planWash(input: ErodeInput, gesture: Gesture, set: ErodeSettings): ErodePlan {
  const started = performance.now(), before = input.terrain, t = before.clone(), { W, H, N } = t;
  const P = clamp(set.power / 100, 0, 1), S = clamp((set.size ?? 25 + 0.6 * set.power) / 100, 0, 1);
  const width = 1 + 8 * S * S, incision = 1 + Math.round(7 * P * P);
  // Small washes retain round 2's simple section. Broad, deep arroyos expose different beds.
  const large = clamp((Math.min(P, S) - 0.45) / 0.55, 0, 1);
  const points = gesture.points.map(p => ({ x: clamp(p.x, 1, W - 2), y: clamp(p.y, 1, H - 2) }));
  const tile = (x: number, y: number) => clamp(Math.floor(y), 0, H - 1) * W + clamp(Math.floor(x), 0, W - 1);
  const neighbours = (i: number) => [i % W > 0 ? i - 1 : -1, i % W < W - 1 ? i + 1 : -1,
    i >= W ? i - W : -1, i < N - W ? i + W : -1].filter(j => j >= 0 && !input.keep?.[j]);
  const edge = (i: number) => i % W === 0 || i % W === W - 1 || i < W || i >= N - W;
  const heights = before.heights();
  const start = tile(points[0].x, points[0].y);
  const details = pickDetails(set, heights[start]);

  // Dijkstra with a tiny binary heap: prefer nearby low ground, never strand the outlet in a
  // local hollow. Only the edge or existing water is terminal; kept source ground is avoided.
  const outletRoute = (origin: number, bed: number) => {
    const distance = new Float64Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1);
    const heap: [number, number][] = [];
    const push = (i: number, d: number) => {
      let k = heap.length; heap.push([i, d]);
      while (k) { const p = (k - 1) >> 1; if (heap[p][1] <= d) break; heap[k] = heap[p]; k = p; }
      heap[k] = [i, d];
    };
    const pop = () => {
      const out = heap[0], last = heap.pop()!;
      if (heap.length) {
        let k = 0;
        while (k * 2 + 1 < heap.length) {
          let c = k * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1][1] < heap[c][1]) c++;
          if (heap[c][1] >= last[1]) break;
          heap[k] = heap[c]; k = c;
        }
        heap[k] = last;
      }
      return out;
    };
    distance[origin] = 0; push(origin, 0);
    let end = origin;
    while (heap.length) {
      const [i, d] = pop();
      if (d !== distance[i]) continue;
      if (edge(i) || ((input.water?.[i] ?? 0) > 0.05 && heights[i] <= bed)) { end = i; break; }
      for (const j of neighbours(i)) {
        const grain = noise3(set.seed ^ 91, j % W, Math.floor(j / W), 0, 9);
        const cost = d + 1 + Math.max(0, heights[j] - bed) * 0.16 + grain * (2 + 6 * details.winding / 100);
        if (cost < distance[j]) { distance[j] = cost; parent[j] = i; push(j, cost); }
      }
    }
    const route = [end];
    while (route[route.length - 1] !== origin && parent[route[route.length - 1]] >= 0)
      route.push(parent[route[route.length - 1]]);
    return route.reverse();
  };
  if (points.length === 1) {
    const route = outletRoute(start, Math.max(0, heights[start] - incision));
    const end = route[Math.min(route.length - 1, Math.round(8 + 16 * P))];
    points.push({ x: end % W + 0.5, y: Math.floor(end / W) + 0.5 });
  }
  // Smooth meanders around the painted line; even zero Winding has a slight natural wander.
  const centre: number[] = [];
  const append = (i: number) => {
    if (!centre.length) { centre.push(i); return; }
    let prev = centre[centre.length - 1];
    while (prev !== i) {
      const dx = i % W - prev % W, dy = Math.floor(i / W) - Math.floor(prev / W);
      const next = Math.abs(dx) > Math.abs(dy) ? prev + Math.sign(dx) : prev + Math.sign(dy) * W;
      if (input.keep?.[next]) break;
      centre.push(next); prev = next;
    }
  };
  let length = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(L * 2));
    for (let j = 0; j <= n; j++) {
      const u = j / n, distance = length + L * u;
      const wave = Math.sin(distance / (4 + width * 0.6) + hash(set.seed, 41) * 6) *
        (0.9 + width * 0.8 * details.winding / 100) * Math.sin(Math.PI * u);
      append(tile(a.x + dx * u - dy / (L || 1) * wave, a.y + dy * u + dx / (L || 1) * wave));
    }
    length += L;
  }
  // A short click or a map-corner gesture always retains an actual centre cell.
  if (!centre.length) centre.push(start);
  const mainLength = centre.length;
  const fallHeight = 1 + Math.round(large);
  const fallCount = Math.min(Math.floor((incision - 1) / fallHeight), Math.round(details.dryFalls / 100 * (4 - 2 * large)));
  let bed = Math.max(0, heights[centre[0]] - incision + fallCount * fallHeight);
  const levels = centre.map((i, k) => {
    bed = Math.min(bed, Math.max(0, heights[i] - 1), Math.max(0, heights[centre[0]] - incision +
      (fallCount - Math.floor(k / Math.max(1, mainLength - 1) * fallCount)) * fallHeight));
    return bed;
  });
  const tail = outletRoute(centre[centre.length - 1], bed);
  for (const i of tail.slice(1)) {
    centre.push(i); bed = Math.min(bed, heights[i]); levels.push(bed);
  }
  const outlet = centre[centre.length - 1];
  const floor = new Int16Array(N).fill(-1), mask = new Uint8Array(N);
  const stamp = (i: number, level: number, radius: number, banks = false) => {
    const x = i % W, y = Math.floor(i / W);
    for (let yy = Math.max(0, Math.floor(y - radius - 1)); yy <= Math.min(H - 1, Math.ceil(y + radius + 1)); yy++)
      for (let xx = Math.max(0, Math.floor(x - radius - 1)); xx <= Math.min(W - 1, Math.ceil(x + radius + 1)); xx++) {
        const j = yy * W + xx;
        if (input.keep?.[j]) continue;
        const r = radius * (0.87 + 0.26 * noise3(set.seed, xx, yy, 0, 6));
        if (Math.hypot(xx - x, yy - y) > r) continue;
        let rise = 0;
        if (banks && large > 0) {
          const across = Math.hypot(xx - x, yy - y) / r;
          const bedrock = noise3(set.seed ^ 0x4d, xx, yy, 0, 8);
          const style = 0.5 + 0.5 * Math.sin(xx / 7 + yy / 11 + hash(set.seed, 26) * 6);
          const shoulder = clamp((across - (0.3 + bedrock * 0.2)) / 0.6, 0, 1);
          const relief = Math.max(0, heights[j] - level - 1);
          // A continuous apron in soft beds; two broad benches in layered beds; hard reaches
          // retain a sheer face. All rise toward the bank, so no isolated lumps fill the bed.
          if (style > 0.68) rise = Math.round(shoulder * relief * large);
          else if (style > 0.28) rise = Math.floor(shoulder * 2.5) * Math.max(1, Math.round(relief * large / 3));
        }
        const z = Math.min(heights[j], level + rise);
        floor[j] = floor[j] < 0 ? z : Math.min(floor[j], z); mask[j] = 1;
      }
  };
  centre.forEach((i, k) => stamp(i, levels[k], k < mainLength ? width : Math.max(1, width * 0.65), true));
  // Tributaries climb from their confluence into the plain, with narrow winding heads.
  const gullies = Math.round(details.sideGullies / 100 * (2 + 5 * S));
  for (let g = 0; g < gullies; g++) {
    const position = large > 0 ? 0.16 + (g + 0.25 + 0.5 * hash(set.seed, g + 700)) / gullies * 0.72 : 0.12 + 0.76 * hash(set.seed, g + 700);
    const k = Math.min(mainLength - 2, Math.max(1, Math.round(position * mainLength)));
    const i = centre[k], prev = centre[k - 1], next = centre[k + 1];
    const dx = next % W - prev % W, dy = Math.floor(next / W) - Math.floor(prev / W), L = Math.hypot(dx, dy) || 1;
    const side = g % 2 ? -1 : 1, reach = width * (1.8 + 1.4 * large + hash(set.seed, g + 800));
    for (let d = 0; d <= reach; d += 0.45) {
      const bend = Math.sin(d / 3 + g) * 1.2 * d / reach;
      const j = tile(i % W - dy / L * d * side + dx / L * bend, Math.floor(i / W) + dx / L * d * side + dy / L * bend);
      stamp(j, Math.min(heights[j], levels[k] + Math.floor(d / reach * Math.min(3 + 3 * large, incision - 1))), Math.max(0.8, width * 0.35 * (1 - d / reach) + 0.6));
    }
  }
  // Connect every bed tile to the outlet, then propagate only lowering along that tree and the
  // trunk. This also removes tiny pits where meanders, gullies or original low ground overlap.
  const parent = new Int32Array(N).fill(-1), order = [outlet]; parent[outlet] = outlet;
  // Feed broad shelves toward the trunk, not across other shelves on a shortest path to the
  // outlet. The old cross-bed shortcut was cutting long straight trenches through the benches.
  if (large > 0) for (let k = centre.length - 2; k >= 0; k--) {
    const i = centre[k];
    if (parent[i] < 0) { parent[i] = centre[k + 1]; order.push(i); }
  }
  for (let k = 0; k < order.length; k++) for (const j of neighbours(order[k]))
    if (mask[j] && parent[j] < 0) { parent[j] = order[k]; order.push(j); }
  const next = new Map<number, number[]>();
  for (let k = 0; k + 1 < centre.length; k++) next.set(centre[k], [...(next.get(centre[k]) ?? []), centre[k + 1]]);
  const lowering = order.slice();
  for (let k = 0; k < lowering.length; k++) {
    const i = lowering[k];
    for (const j of [parent[i], ...(next.get(i) ?? [])])
      if (j >= 0 && floor[j] > floor[i]) { floor[j] = floor[i]; lowering.push(j); }
  }
  for (const i of order) for (let z = floor[i]; z < LAYERS; z++) t.set(i, z, false);
  // Short cantilevers along pockets of the banks, with the same flat bed and up to five levels
  // of clearance. Their footprint is limited to three tiles; the support pass trims corners.
  if (details.undercutBanks > 0) {
    const depth = Math.min(3, Math.ceil(details.undercutBanks / 100 * 3 + large * 0.8));
    for (const i of order) {
      const x = i % W, y = Math.floor(i / W), z0 = floor[i];
      if (noise3(set.seed ^ 0x83, x, y, 0, 6) > details.undercutBanks / 140 + large * 0.25) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (mask[tile(x + dx, y + dy)]) continue;
        for (let d = 1; d <= depth; d++) {
          const xx = x + dx * d, yy = y + dy * d;
          if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) break;
          const j = yy * W + xx;
          if (input.keep?.[j] || mask[j] || heights[j] < z0 + 4) break;
          for (let z = z0; z < Math.min(heights[j] - 2, z0 + 5); z++) t.set(j, z, false);
        }
      }
    }
  }
  let fell = 0;
  for (;;) {
    const loose = support(t).unsupported;
    if (!loose.length) break;
    for (const v of loose) { t.set(v % N, Math.floor(v / N), false); fell++; }
  }
  const removed: number[] = [];
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < N; i++) if (before.cols[i] !== t.cols[i]) {
    x0 = Math.min(x0, i % W); x1 = Math.max(x1, i % W); y0 = Math.min(y0, Math.floor(i / W)); y1 = Math.max(y1, Math.floor(i / W));
    for (let z = LAYERS - 1; z >= 0; z--) if (before.at(i, z) && !t.at(i, z)) removed.push(z * N + i);
  }
  // Top-down wear keeps the original moment and its 24 buckets. Schedule any intermediate
  // loose rock in the bucket which opens it, just as the cliff planner does.
  removed.sort((a, b) => Math.floor(b / N) - Math.floor(a / N) || hash(set.seed, a) - hash(set.seed, b));
  const buckets = new Map(removed.map((v, k) => [v, Math.min(23, Math.floor(k / removed.length * 24))]));
  const show = before.clone(), pending = new Set(removed);
  for (let b = 0; b < 24; b++) {
    for (const v of removed) if (buckets.get(v) === b) { show.set(v % N, Math.floor(v / N), false); pending.delete(v); }
    for (;;) {
      const loose = support(show).unsupported;
      if (!loose.length) break;
      for (const v of loose) {
        if (!pending.has(v)) throw new Error("wash animation loses final support");
        show.set(v % N, Math.floor(v / N), false); pending.delete(v); buckets.set(v, b);
      }
    }
  }
  removed.sort((a, b) => buckets.get(a)! - buckets.get(b)!);
  return { final: t, removed: Int32Array.from(removed), bucket: Uint8Array.from(removed, v => buckets.get(v)!),
    buckets: 24, duration: 0.65, worn: removed.length, held: 0, fell,
    focus: { x: start % W + 0.5, y: Math.floor(start / W) + 0.5, z: heights[start] },
    box: { x0, y0, x1, y1 }, ms: performance.now() - started, details,
    wash: { path: centre, bedTiles: order, outlet, outletKind: edge(outlet) ? "edge" : "water" },
    ...(!removed.length ? { reason: "At the map's floor" } : {}) };
}
