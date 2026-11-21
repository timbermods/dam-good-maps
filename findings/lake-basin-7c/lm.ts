// Land measures (C:/dgm-showcase/ref/official/numbers.md definitions) on heights + water depth, plus two of round 7's:
// the radial share (how much of the land's level the distance from the main water explains: a compass-drawn basin is
// near 1) and the shore spread (how far the level varies along one band of distance from the water).
export interface LandMeasures {
  [k: string]: number | string;
}

export function landMeasures(h: ArrayLike<number>, depth: ArrayLike<number>, W: number, H: number): LandMeasures {
  const N = W * H;
  const land = new Uint8Array(N);
  let nl = 0;
  for (let i = 0; i < N; i++) if (!(depth[i] >= 0.1)) { land[i] = 1; nl++; }
  const lv: number[] = [];
  for (let i = 0; i < N; i++) if (land[i]) lv.push(h[i]);
  lv.sort((a, b) => a - b);
  const pct = (a: number[], q: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
  const p5 = pct(lv, 0.05), p95 = pct(lv, 0.95);
  // regional relief: 16-blocks at least half land, mean level, p90 - p10
  const blockMeans = (B: number) => {
    const out: { m: number; n: number; v: number }[] = [];
    for (let by = 0; by + B <= H; by += B)
      for (let bx = 0; bx + B <= W; bx += B) {
        let s = 0, n = 0;
        for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { const i = y * W + x; if (land[i]) { s += h[i]; n++; } }
        if (n >= (B * B) / 2) out.push({ m: s / n, n, v: 0 });
      }
    return out;
  };
  const b16 = blockMeans(16).map((b) => b.m).sort((a, b) => a - b);
  const regional = b16.length ? pct(b16, 0.9) - pct(b16, 0.1) : 0;
  // form share: between-block share of variance, 32 blocks (all blocks with land)
  let mean = 0;
  for (const v of lv) mean += v;
  mean /= lv.length;
  let tot = 0;
  for (const v of lv) tot += (v - mean) ** 2;
  let between = 0;
  for (let by = 0; by < H; by += 32)
    for (let bx = 0; bx < W; bx += 32) {
      let s = 0, n = 0;
      for (let y = by; y < Math.min(H, by + 32); y++) for (let x = bx; x < Math.min(W, bx + 32); x++) { const i = y * W + x; if (land[i]) { s += h[i]; n++; } }
      if (n) between += n * (s / n - mean) ** 2;
    }
  const formShare = tot ? between / tot : 0;
  // beside drops, dead flat, one-level share
  let b2 = 0, b4 = 0, flat = 0, steps = 0, one = 0, edges = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!land[i]) continue;
      let m = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        m = Math.max(m, Math.abs(h[j] - h[i]));
        if (land[j] && j > i && h[j] !== h[i]) { steps++; edges++; if (Math.abs(h[j] - h[i]) === 1) one++; }
      }
      if (m >= 2) b2++;
      if (m >= 4) b4++;
      let f = true;
      for (let dy = -1; dy <= 1 && f; dy++) for (let dx = -1; dx <= 1 && f; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (h[yy * W + xx] !== h[i]) f = false;
      }
      if (f) flat++;
    }
  // commonest levels
  const cnt = new Map<number, number>();
  for (const v of lv) cnt.set(v, (cnt.get(v) ?? 0) + 1);
  const cs = [...cnt.values()].sort((a, b) => b - a);
  // fine relief 5x5
  const fine = (r: number) => {
    // summed area of land level and land count
    const S = new Float64Array((W + 1) * (H + 1)), C = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = (y + 1) * (W + 1) + x + 1;
      S[k] = (land[i] ? h[i] : 0) + S[k - 1] + S[k - W - 1] - S[k - W - 2];
      C[k] = (land[i] ? 1 : 0) + C[k - 1] + C[k - W - 1] - C[k - W - 2];
    }
    let e = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!land[i]) continue;
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W - 1, x + r), y1 = Math.min(H - 1, y + r);
      const a = (y1 + 1) * (W + 1) + x1 + 1, b = y0 * (W + 1) + x1 + 1, c = (y1 + 1) * (W + 1) + x0, d = y0 * (W + 1) + x0;
      const n = C[a] - C[b] - C[c] + C[d];
      const m = (S[a] - S[b] - S[c] + S[d]) / n;
      e += (h[i] - m) ** 2;
    }
    return tot ? (100 * e) / tot : 0;
  };
  // patches (4-connected land at one level): share of land in patches < 40
  const lab = new Int32Array(N).fill(-1);
  let small = 0;
  const q = new Int32Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (!land[s0] || lab[s0] >= 0) continue;
    let t = 0, hd = 0;
    q[t++] = s0; lab[s0] = s0;
    while (hd < t) {
      const c = q[hd++], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (land[j] && lab[j] < 0 && h[j] === h[c]) { lab[j] = s0; q[t++] = j; }
      }
    }
    if (t < 40) small += t;
  }
  // longest 3+ face: 8-connected dry tiles with a 4-neighbour 3+ lower; bounding box larger side, median drop
  const face = new Uint8Array(N), drop = new Int16Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!land[i]) continue;
    let d = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      d = Math.max(d, h[i] - h[yy * W + xx]);
    }
    if (d >= 3) { face[i] = 1; drop[i] = d; }
  }
  const fl = new Int32Array(N).fill(-1);
  let best = 0, bestDrop = 0;
  const comps: { len: number; drop: number; tiles: Int32Array | number[] }[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!face[s0] || fl[s0] >= 0) continue;
    let t = 0, hd = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    const ds: number[] = [];
    q[t++] = s0; fl[s0] = s0;
    while (hd < t) {
      const c = q[hd++], x = c % W, y = (c - x) / W;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      ds.push(drop[c]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (face[j] && fl[j] < 0) { fl[j] = s0; q[t++] = j; }
      }
    }
    const len = Math.max(x1 - x0, y1 - y0) + 1;
    { ds.sort((a, b) => a - b); comps.push({ len, drop: ds[ds.length >> 1], tiles: q.slice(0, t) }); }
    if (len > best) { best = len; ds.sort((a, b) => a - b); bestDrop = ds[ds.length >> 1]; }
  }
  // round 7: distance (chamfer) from the main water body (largest 4-connected wet component), and the radial share
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = land[i] ? 0 : 1;
  const wl = new Int32Array(N).fill(-1);
  let mainLab = -1, mainSize = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!wet[s0] || wl[s0] >= 0) continue;
    let t = 0, hd = 0;
    q[t++] = s0; wl[s0] = s0;
    while (hd < t) {
      const c = q[hd++], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (wet[j] && wl[j] < 0) { wl[j] = s0; q[t++] = j; }
      }
    }
    if (t > mainSize) { mainSize = t; mainLab = s0; }
  }
  const dist = new Float64Array(N).fill(1e9);
  for (let i = 0; i < N; i++) if (wl[i] === mainLab) dist[i] = 0;
  for (let pass = 0; pass < 2; pass++) {
    const ys = pass ? [...Array(H).keys()].reverse() : [...Array(H).keys()];
    const xs = pass ? [...Array(W).keys()].reverse() : [...Array(W).keys()];
    const sg = pass ? 1 : -1;
    for (const y of ys) for (const x of xs) {
      const i = y * W + x;
      let d = dist[i];
      for (const [dx, dy, w] of [[sg, 0, 1], [0, sg, 1], [sg, sg, 1.4142], [-sg, sg, 1.4142]] as const) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        d = Math.min(d, dist[yy * W + xx] + w);
      }
      dist[i] = d;
    }
  }
  let rim = "0"; { let bl = 0; for (const c of comps) if (c.drop >= 4 && c.len > bl) { let md = 1e9; for (const i of c.tiles) md = Math.min(md, dist[i]); bl = c.len; rim = `${c.len} (${c.drop}) @${Math.round(md)}`; } }
  // bins of 4 tiles of distance out to 100; eta² = between-bin variance of level / total, land within 100 tiles
  const binS = new Map<number, [number, number, number]>();
  let ln = 0, lm = 0;
  for (let i = 0; i < N; i++) if (land[i] && dist[i] <= 100) { ln++; lm += h[i]; }
  lm /= Math.max(1, ln);
  let lt = 0;
  for (let i = 0; i < N; i++) if (land[i] && dist[i] <= 100) {
    lt += (h[i] - lm) ** 2;
    const b = Math.floor(dist[i] / 4);
    const e = binS.get(b) ?? [0, 0, 0];
    e[0] += h[i]; e[1]++; e[2] += h[i] * h[i];
    binS.set(b, e);
  }
  let bt = 0, within = 0, wn = 0;
  for (const [s, n, s2] of binS.values()) { bt += n * (s / n - lm) ** 2; within += s2 - (s * s) / n; wn += n; }
  const radial = lt ? bt / lt : 0;
  const spread = Math.sqrt(within / Math.max(1, wn));
  return {
    reliefP5P95: `${p5}-${p95}`,
    regional: +regional.toFixed(2),
    formShare: +formShare.toFixed(2),
    face3: `${best} (${bestDrop})`,
    rim,
    beside2: +((100 * b2) / nl).toFixed(1),
    beside4: +((100 * b4) / nl).toFixed(1),
    deadFlat: +((100 * flat) / nl).toFixed(1),
    oneLevel: +((100 * one) / Math.max(1, steps)).toFixed(1),
    commonest: +((100 * cs[0]) / nl).toFixed(1),
    three: +((100 * (cs[0] + (cs[1] ?? 0) + (cs[2] ?? 0))) / nl).toFixed(1),
    water: +((100 * (N - nl)) / N).toFixed(1),
    fine5: +fine(2).toFixed(2),
    small40: +((100 * small) / nl).toFixed(1),
    stepEdge: +((100 * edges) / nl).toFixed(1),
    radial: +radial.toFixed(2),
    spread: +spread.toFixed(2),
  };
}
