// Delta-only course, embedded in land/hydro.ts by build.mjs.
// Keep the seeded apex and mouths; low ground chooses a path through broad independent turns.
function deltaCourse(from: Point, to: Point, E: Float64Array, W: number, H: number, gap: number, seed: number, protect: Uint8Array | null): Point[] {
  const end: Point = [clamp(to[0], 0, W - 1), clamp(to[1], 0, H - 1)];
  const start = Math.round(from[1]) * W + Math.round(from[0]);
  const goal = Math.round(end[1]) * W + Math.round(end[0]);
  const axis = to[0] < 0 || to[0] >= W ? 0 : 1, across = 1 - axis;
  const sign = end[axis] < from[axis] ? -1 : 1;
  const reach = Math.abs(end[axis] - from[axis]);
  if (reach < 8) return [from, to];
  const side = across === 0 ? W : H;
  const amp = Math.min(clamp(gap * 0.8, 8, 16), reach * 0.24);
  const phase = TWO_PI * ((hash32(seed, "fan-phase") >>> 0) / 4294967296);
  const turns = 0.65 + 0.6 * ((hash32(seed, "fan-turns") >>> 0) / 4294967296);
  const centreAt = (t: number) => clamp(from[across] + t * (end[across] - from[across])
    + amp * sinDet(TWO_PI * t / 2) * sinDet(phase + TWO_PI * turns * t), 3, side - 4);
  const room = clamp(gap * 0.15, 2.5, 4.5);
  const costs = new Float64Array(W * H).fill(Infinity);
  const parent = new Int32Array(W * H).fill(-1);
  const heap = new MinHeap();costs[start] = 0;heap.push(0, start);
  while (heap.size) {
    const i = heap.pop(), cost = heap.lastKey;
    if (cost !== costs[i]) continue;
    if (i === goal) break;
    const x = i % W, y = Math.floor(i / W);
    const forward = axis === 0 ? x : y;
    for (const [dx, dy] of DIRS8) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (protect?.[j]) continue;
      const next = axis === 0 ? xx : yy;
      const t = sign * (next - from[axis]) / reach;
      if (t < -0.02 || t > 1.02 || sign * (next - forward) < 0) continue;
      const u = clamp(t, 0, 1), off = (across === 0 ? xx : yy) - centreAt(u);
      const r = 2 + room * 4 * u * (1 - u);
      if (Math.abs(off) > r) continue;
      // The guide bends at the river's scale, instead of following an apex-to-mouth ray.
      // Within it, elevation and uphill work decide; independent noise breaks ties on flats.
      const rise = Math.max(0, E[j] - E[i]);
      const grade = E[start] + u * (E[goal] - E[start]);
      const terrain = Math.max(0, E[j] - grade);
      const step = (dx && dy ? portable.sqrt(2) : 1)
        * (1 + 2.5 * rise + 0.5 * terrain + 0.6 * (1 + fbm(seed, xx, yy, 11, 2)) + 1.4 * off * off / (r * r));
      const c = cost + step;
      if (c < costs[j]) {costs[j] = c;parent[j] = i;heap.push(c, j);}
    }
  }
  if (parent[goal] < 0) {
    const guide: Point[] = [from];
    for (let q = 1; q < 40; q++) {
      const t = q / 40, p: Point = [0, 0];
      p[axis] = from[axis] + sign * reach * t;p[across] = centreAt(t);
      guide.push(p);
    }
    guide.push(to);
    return smoothPath(guide, 2, 1);
  }
  const path: Point[] = [];
  for (let i = goal; i >= 0; i = parent[i]) {path.push([i % W, Math.floor(i / W)]);if (i === start) break;}
  path.reverse();path[0] = from;path.push(to);
  return smoothPath(path, 2, 1);
}
