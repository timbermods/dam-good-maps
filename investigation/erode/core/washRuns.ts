// Uneven washes follow existing downhill routes. No route may cut through a crest to escape.
export interface WashRun { path: number[]; outlet: number; outletKind: "edge" | "water" }
export interface CappedRun extends WashRun { painted: number; levels: number[] }

export function downhillRuns(centre: number[], heights: Uint8Array, depth: number, falls: number,
  neighbours: (i: number) => number[], terminal: (i: number) => "edge" | "water" | undefined): CappedRun[] {
  const parent = new Int32Array(heights.length).fill(-1), queue: number[] = [];
  for (let i = 0; i < heights.length; i++) if (terminal(i)) { parent[i] = i; queue.push(i); }
  // Reverse flow from real outlets. A closed basin is deliberately not excavated.
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    for (const j of neighbours(i)) if (parent[j] < 0 && heights[j] >= heights[i]) {
      parent[j] = i; queue.push(j);
    }
  }
  const bands: { first: number; last: number; h: number }[] = [];
  centre.forEach((i, k) => {
    const last = bands[bands.length - 1];
    if (last?.h === heights[i]) last.last = k;
    else bands.push({ first: k, last: k, h: heights[i] });
  });
  const cuts = [0];
  for (let k = 1; k + 1 < bands.length; k++) {
    const b = bands[k];
    if ((b.h - bands[k - 1].h) * (bands[k + 1].h - b.h) < 0) cuts.push(Math.floor((b.first + b.last) / 2));
  }
  cuts.push(centre.length - 1);
  const runs: CappedRun[] = [];
  const add = (paint: number[]) => {
    if (!paint.length) return;
    const path = paint.slice();
    let i = path[path.length - 1], painted = paint.length;
    while (parent[i] !== i) {
      i = parent[i];
      const loop = path.indexOf(i);
      if (loop >= 0) { path.length = loop + 1; painted = Math.min(painted, path.length); }
      else path.push(i);
    }
    const count = Math.min(depth - 1, Math.round(falls / 100 * 2));
    const levels = path.map((j, k) => Math.max(1, heights[j] - depth +
      (k < painted ? count - Math.floor(k / Math.max(1, painted - 1) * count) : 0)));
    // Raising a proposed upstream bed keeps incision capped, and never adds ground.
    for (let k = levels.length - 2; k >= 0; k--) levels[k] = Math.max(levels[k], levels[k + 1]);
    runs.push({ path, painted, levels, outlet: i, outletKind: terminal(i)! });
  };
  for (let k = 1; k < cuts.length; k++) {
    const segment = centre.slice(cuts[k - 1], cuts[k] + 1);
    if (heights[segment[0]] < heights[segment[segment.length - 1]]) segment.reverse();
    let paint: number[] = [];
    for (const i of segment) {
      if (parent[i] < 0) { add(paint); paint = []; }
      else paint.push(i);
    }
    add(paint);
  }
  return runs;
}

export function drainCappedBanks(runs: CappedRun[], floor: Int16Array, mask: Uint8Array, heights: Uint8Array,
  depth: number, neighbours: (i: number) => number[]): number[] {
  const trunk = new Set<number>(), upstream = new Map<number, number[]>();
  for (const run of runs) for (let k = 0; k < run.path.length; k++) {
    const i = run.path[k];
    if (!trunk.has(i)) floor[i] = run.levels[k];
    else floor[i] = Math.min(floor[i], run.levels[k]);
    trunk.add(i); mask[i] = 1;
    if (k) upstream.set(i, [...(upstream.get(i) ?? []), run.path[k - 1]]);
  }
  const raising = [...trunk];
  for (let k = 0; k < raising.length; k++) for (const i of upstream.get(raising[k]) ?? [])
    if (floor[i] < floor[raising[k]]) { floor[i] = floor[raising[k]]; raising.push(i); }
  const order = [...trunk].sort((a, b) => floor[a] - floor[b]), seen = new Set(order);
  for (let k = 0; k < order.length; k++) for (const j of neighbours(order[k])) {
    if (!mask[j] || seen.has(j) || heights[j] < floor[order[k]]) continue;
    floor[j] = Math.max(1, heights[j] - depth, floor[j], floor[order[k]]);
    seen.add(j); order.push(j);
  }
  return order;
}
