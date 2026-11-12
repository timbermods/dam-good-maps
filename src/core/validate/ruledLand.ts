// Ruled land (planning's order on #236, 2026-11-11: "land first, story second"): how much of a map's land reads as
// drawn with a ruler. One shared look check, `terrain.ruled_land`, in the one gate every map passes (checks.ts), for
// every path: themes, premises, hand maps. Three numbers, each a share or a rate, so map size does not move them:
//
// - straight: of all edge sides (a height step between two dry tiles, and every shoreline side between a wet and a
//   dry tile), the share lying in axis-parallel straight runs of `STRAIGHT_RUN`+ sides. A run is one contour along
//   one row or column: the same sign and the same upper level (the Workshop study's `stepRuns`, so the loved maps'
//   aggregate `straightShare8` reads on the same scale); a shoreline run keeps the water on one side.
// - bands: the share of the map's tiles in long strips of constant width: in each row (and each column), a run of
//   tiles of one class (dry land at one level, or water) bounded on both sides by another class is a slice; slices
//   of the same class and width in consecutive rows, shifted by at most one tile, chain, and the tiles of chains of
//   `BAND_RUN`+ rows count (a wall's crest, a level terrace, a trench, a canal: their two edges run parallel, along
//   the grid or at 45°).
// - corners: right-angled corners per 1,000 edge sides, where a row-wise and a column-wise run of the same contour
//   both `CORNER_ARM`+ sides long meet at one vertex.
// - channels: the share of the map's water lying in straight reaches of even width (a trench, a canal, a moat's side).
//   In each row (and each column) a run of wet tiles bounded by dry ground is a slice; a slice continues the slice in
//   the row before whose two ends are each within one tile of its own, so a chain follows one body of water. Along a
//   chain, a reach is a run of `CHANNEL_RUN`+ rows whose width varies by at most `CHANNEL_WIDTH` tiles and whose
//   centre line keeps to one straight line (along the grid or at 45°) within one tile. A river of even width that
//   winds passes: its centre line turns within fewer rows (planning on #236, 2026-11-12: what reads as ruled is even
//   width and straight reaches meeting at sharp bends). The water is all settled water: the settle holds a river as
//   level pools and a generated map's settle keeps no flow, so a river is told by its shape, not its flow.
// Game-forced straightness does not count: sides within `EDGE_MARGIN` tiles of the map's edge and parallel to it, and
// slices touching the edge, are left out. Integers throughout but the three shares (one division each).

/** Straight runs counted from this many sides (the Workshop study's straightShare8). */
export const STRAIGHT_RUN = 8;
/** A band: a constant-width slice chained over this many rows or columns. */
export const BAND_RUN = 12;
/** The widest slice a band is made of (a strip, not a field). */
export const BAND_WIDTH = 16;
/** A right-angled corner's arms: each run at least this long. */
export const CORNER_ARM = 6;
/** Channels: a straight reach is this many rows long, at least. */
export const CHANNEL_RUN = 12;
/** Channels: a reach's widths lie within this many tiles of each other. */
export const CHANNEL_WIDTH = 2;
/** Sides this close to the map's edge and parallel to it are the game's, not the land's. */
export const EDGE_MARGIN = 2;

/** The limits (calibrated: docs, "Ruled land"). A map fails when any number is over its limit. */
export const RULED_LIMITS = { straight: 0.17, bands: 0.03, corners: 3, channels: 0.2 } as const;
/** The aim (planning, 2026-11-12: the game's built-in maps' median): a map that passes with more of its edges
 *  straight than this is told so. */
export const RULED_AIM = { straight: 0.08 } as const;

export type RuledLimits = { straight: number; bands: number; corners: number; channels: number };

export interface RuledLand {
  /** Edge sides counted (height steps between dry tiles, and shoreline sides). */
  edges: number;
  /** Share of edge sides in straight runs of STRAIGHT_RUN+. */
  straight: number;
  /** Share of the map's tiles in constant-width bands of BAND_RUN+. */
  bands: number;
  /** Right-angled corners per 1,000 edge sides. */
  corners: number;
  /** The longest straight run: its length in sides and its middle tile. */
  longest: { length: number; x: number; y: number };
  /** Share of the map's water (its wet tiles) in channels. */
  channels: number;
  /** The largest channel: its tiles and its middle (null when there is none). */
  channel: { tiles: number; x: number; y: number } | null;
  ok: boolean;
}

/** Ruled land of a map from its top surface `h` (levels) and its settled water (`wet`: 1 on a wet tile). */
export function ruledLand(h: ArrayLike<number>, wet: ArrayLike<number>, W: number, H: number, limits: RuledLimits = RULED_LIMITS): RuledLand {
  // the key of the side between tiles a and b: 0 for no edge; ± (1 + upper level) for a step between dry tiles; ±1000
  // for a shoreline (the sign: which side is higher, or wet)
  const key = (a: number, b: number): number => {
    const wa = wet[a] ? 1 : 0;
    const wb = wet[b] ? 1 : 0;
    if (wa !== wb) return wa ? 1000 : -1000;
    if (wa) return 0;
    const ha = h[a];
    const hb = h[b];
    if (ha === hb) return 0;
    return hb > ha ? 1 + hb : -(1 + ha);
  };
  let edges = 0;
  let straightSides = 0;
  let longest = { length: 0, x: 0, y: 0 };
  // run ends at vertices, for the corners: vertex index → the key and length of a row-wise and a column-wise run
  const VW = W + 1;
  const endA = new Map<number, number[]>(); // runs along y (sides between x and x+1)
  const endB = new Map<number, number[]>(); // runs along x (sides between y and y+1)
  const push = (m: Map<number, number[]>, v: number, k: number, len: number) => {
    const l = m.get(v);
    if (l) l.push(k, len);
    else m.set(v, [k, len]);
  };
  const close = (along: "y" | "x", line: number, end: number, len: number, k: number) => {
    // `line`: the x (or y) of the side's lower tile; the run covers tiles end-len .. end-1 along the other axis
    if (along === "y" && (line + 1 < EDGE_MARGIN || line + 1 > W - EDGE_MARGIN)) return;
    if (along === "x" && (line + 1 < EDGE_MARGIN || line + 1 > H - EDGE_MARGIN)) return;
    edges += len;
    if (len >= STRAIGHT_RUN) straightSides += len;
    if (len > longest.length) {
      const mid = end - 1 - (len >> 1);
      longest = along === "y" ? { length: len, x: line, y: mid } : { length: len, x: mid, y: line };
    }
    if (len >= CORNER_ARM) {
      const c = k < 0 ? -k : k;
      if (along === "y") {
        push(endA, (end - len) * VW + line + 1, c, len);
        push(endA, end * VW + line + 1, c, len);
      } else {
        push(endB, (line + 1) * VW + end - len, c, len);
        push(endB, (line + 1) * VW + end, c, len);
      }
    }
  };
  for (let x = 0; x + 1 < W; x++) {
    let len = 0;
    let run = 0;
    for (let y = 0; y < H; y++) {
      const k = key(y * W + x, y * W + x + 1);
      if (k !== 0 && k === run) len++;
      else {
        if (len) close("y", x, y, len, run);
        len = k !== 0 ? 1 : 0;
      }
      run = k;
    }
    if (len) close("y", x, H, len, run);
  }
  for (let y = 0; y + 1 < H; y++) {
    let len = 0;
    let run = 0;
    for (let x = 0; x < W; x++) {
      const k = key(y * W + x, (y + 1) * W + x);
      if (k !== 0 && k === run) len++;
      else {
        if (len) close("x", y, x, len, run);
        len = k !== 0 ? 1 : 0;
      }
      run = k;
    }
    if (len) close("x", y, W, len, run);
  }
  let corners = 0;
  for (const [v, a] of endA) {
    const b = endB.get(v);
    if (!b) continue;
    let hit = false;
    for (let i = 0; i < a.length && !hit; i += 2) for (let j = 0; j < b.length && !hit; j += 2) if (a[i] === b[j]) hit = true;
    if (hit) corners++;
  }
  const bandTiles = bands(h, wet, W, H);
  const straight = edges ? straightSides / edges : 0;
  const bandShare = bandTiles / (W * H);
  const perK = edges ? (corners * 1000) / edges : 0;
  const ch = channels(wet, W, H);
  return { edges, straight, bands: bandShare, corners: perK, longest, channels: ch.share, channel: ch.worst, ok: straight <= limits.straight && bandShare <= limits.bands && perK <= limits.corners && ch.share <= limits.channels };
}

/** Tiles in constant-width bands, counted along rows (bands running along y) and along columns, each tile once. */
function bands(h: ArrayLike<number>, wet: ArrayLike<number>, W: number, H: number): number {
  const cls = new Int16Array(W * H);
  for (let i = 0; i < W * H; i++) cls[i] = wet[i] ? -1 : h[i];
  const mark = new Uint8Array(W * H);
  sweep(cls, W, H, mark, W, 1);
  sweep(cls, H, W, mark, 1, W);
  let n = 0;
  for (let i = 0; i < W * H; i++) n += mark[i];
  return n;
}

/** One direction: `rows` lines of `cols` tiles, tile (row, col) at `row * rs + col * cs`. */
function sweep(cls: Int16Array, cols: number, rows: number, mark: Uint8Array, rs: number, cs: number): void {
  // each row's slices: [start, width, class, chain length so far]
  const slices: Int32Array[] = [];
  const fwd: Int32Array[] = [];
  for (let r = 0; r < rows; r++) {
    const s: number[] = [];
    let c = 0;
    while (c < cols) {
      const k = cls[r * rs + c * cs];
      let e = c + 1;
      while (e < cols && cls[r * rs + e * cs] === k) e++;
      if (c > 0 && e < cols && e - c <= BAND_WIDTH) s.push(c, e - c, k);
      c = e;
    }
    slices.push(Int32Array.from(s));
  }
  // chain length up to each slice (forward), then from it on (backward); a slice links to the previous row's slice of
  // the same class and width shifted by at most one
  // (slices lie in a row in order, so a pointer walks the other row's: linear in the slices)
  let p = 0;
  const link = (from: Int32Array, i: number, to: Int32Array): number => {
    while (p < to.length && to[p] < from[i] - 1) p += 3;
    for (let j = p; j < to.length && to[j] <= from[i] + 1; j += 3) {
      if (to[j + 2] === from[i + 2] && to[j + 1] === from[i + 1]) return j / 3;
    }
    return -1;
  };
  for (let r = 0; r < rows; r++) {
    const s = slices[r];
    const f = new Int32Array(s.length / 3);
    p = 0;
    for (let i = 0; i < s.length; i += 3) {
      const j = r > 0 ? link(s, i, slices[r - 1]) : -1;
      f[i / 3] = j >= 0 ? fwd[r - 1][j] + 1 : 1;
    }
    fwd.push(f);
  }
  let next: Int32Array | null = null;
  for (let r = rows - 1; r >= 0; r--) {
    const s = slices[r];
    const b = new Int32Array(s.length / 3);
    p = 0;
    for (let i = 0; i < s.length; i += 3) {
      const j = r + 1 < rows && next ? link(s, i, slices[r + 1]) : -1;
      b[i / 3] = j >= 0 ? next![j] + 1 : 1;
      if (fwd[r][i / 3] + b[i / 3] - 1 >= BAND_RUN) for (let c = s[i]; c < s[i] + s[i + 1]; c++) mark[r * rs + c * cs] = 1;
    }
    next = b;
  }
}

/** The share of the water in channels, counted along rows and along columns, each tile once; and the largest. */
function channels(wet: ArrayLike<number>, W: number, H: number): { share: number; worst: { tiles: number; x: number; y: number } | null } {
  const N = W * H;
  const mark = new Uint8Array(N);
  let worst: { tiles: number; x: number; y: number } | null = null;
  for (const [cols, rows, rs, cs] of [[W, H, W, 1], [H, W, 1, W]] as const) {
    const w = channelSweep(wet, cols, rows, rs, cs, mark);
    if (w && (!worst || w.tiles > worst.tiles)) worst = rs === W ? { tiles: w.tiles, x: w.col, y: w.row } : { tiles: w.tiles, x: w.row, y: w.col };
  }
  let water = 0;
  let inChannels = 0;
  for (let i = 0; i < N; i++) {
    if (wet[i]) water++;
    inChannels += mark[i];
  }
  return { share: water ? inChannels / water : 0, worst };
}

/** One direction of the channels: marks the tiles of straight reaches of even width; returns the largest reach's
 *  tiles and middle (row, col). */
function channelSweep(wet: ArrayLike<number>, cols: number, rows: number, rs: number, cs: number, mark: Uint8Array): { tiles: number; row: number; col: number } | null {
  // each row's slices [start, width]; each slice's predecessor in the row before (its index, or -1), each taken once
  const slices: Int32Array[] = [];
  const pred: Int32Array[] = [];
  const succ: Uint8Array[] = [];
  for (let r = 0; r < rows; r++) {
    const a: number[] = [];
    let c = 0;
    while (c < cols) {
      const v = wet[r * rs + c * cs] ? 1 : 0;
      let e = c + 1;
      while (e < cols && (wet[r * rs + e * cs] ? 1 : 0) === v) e++;
      if (v && c > 0 && e < cols) a.push(c, e - c);
      c = e;
    }
    const s = Int32Array.from(a);
    const p = new Int32Array(s.length >> 1).fill(-1);
    if (r > 0) {
      const q = slices[r - 1];
      const taken = succ[r - 1];
      let from = 0;
      for (let i = 0; i < s.length; i += 2) {
        // (a row's slices lie in order: a pointer walks the row before)
        while (from < q.length && q[from] < s[i] - 1) from += 2;
        for (let j = from; j < q.length && q[j] <= s[i] + 1; j += 2) {
          const d1 = q[j] + q[j + 1] - s[i] - s[i + 1];
          if (!taken[j >> 1] && d1 <= 1 && -d1 <= 1) {
            p[i >> 1] = j;
            taken[j >> 1] = 1;
            break;
          }
        }
      }
    }
    slices.push(s);
    pred.push(p);
    succ.push(new Uint8Array(s.length >> 1));
  }
  let best = { tiles: 0, row: 0, col: 0 };
  const chainR: number[] = [];
  const chainI: number[] = [];
  const centre: number[] = [];
  const width: number[] = [];
  for (let r = rows - 1; r >= 0; r--) {
    const s = slices[r];
    for (let i = 0; i < s.length; i += 2) {
      if (succ[r][i >> 1]) continue;
      // a chain ends here: walk it back to its start
      chainR.length = 0;
      chainI.length = 0;
      for (let rr = r, ii = i; ii >= 0; rr--) {
        chainR.push(rr);
        chainI.push(ii);
        ii = pred[rr][ii >> 1];
      }
      const n = chainR.length;
      if (n < CHANNEL_RUN) continue;
      // each slope (centre moving -1, 0 or +1 tile a row), a window that keeps the centre (doubled, less the slope's
      // drift) within 2 and the widths within CHANNEL_WIDTH; every window of CHANNEL_RUN+ rows is a straight reach
      for (let k = -1; k <= 1; k++) {
        centre.length = 0;
        width.length = 0;
        for (let t = 0; t < n; t++) {
          const sl = slices[chainR[t]];
          centre.push(2 * sl[chainI[t]] + sl[chainI[t] + 1] - 2 * k * chainR[t]);
          width.push(sl[chainI[t] + 1]);
        }
        let lo = 0;
        let marked = -1;
        for (let hi = 0; hi < n; hi++) {
          for (;;) {
            let c0 = centre[hi];
            let c1 = c0;
            let w0 = width[hi];
            let w1 = w0;
            for (let t = lo; t < hi; t++) {
              c0 = Math.min(c0, centre[t]);
              c1 = Math.max(c1, centre[t]);
              w0 = Math.min(w0, width[t]);
              w1 = Math.max(w1, width[t]);
            }
            if (c1 - c0 <= 2 && w1 - w0 <= CHANNEL_WIDTH) break;
            lo++;
          }
          if (hi - lo + 1 < CHANNEL_RUN) continue;
          let tiles = 0;
          let sr = 0;
          let sc = 0;
          for (let t = lo; t <= hi; t++) {
            const sl = slices[chainR[t]];
            const st = sl[chainI[t]];
            const wd = sl[chainI[t] + 1];
            tiles += wd;
            sr += chainR[t] * wd;
            sc += st * wd + ((wd * (wd - 1)) >> 1);
            if (t > marked) for (let c = st; c < st + wd; c++) mark[chainR[t] * rs + c * cs] = 1;
          }
          marked = hi;
          if (tiles > best.tiles) best = { tiles, row: Math.round(sr / tiles), col: Math.round(sc / tiles) };
        }
      }
    }
  }
  return best.tiles ? best : null;
}

/** The check's one-line reason, in the gate's style. */
export function ruledLandMessage(r: RuledLand): string {
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const nums = `${pct(r.straight)} of edges straight, ${pct(r.bands)} of the land in even bands, ${Math.round(r.corners * 10) / 10} square corners per 1,000 edges, ${pct(r.channels)} of the water in straight even channels`;
  const where = `the longest straight edge is ${r.longest.length} tiles at X ${r.longest.x} · Y ${r.longest.y}${r.channel ? `; the largest channel is ${r.channel.tiles} tiles at X ${r.channel.x} · Y ${r.channel.y}` : ""}`;
  if (!r.ok) return `The land looks ruled: ${nums}; ${where}`;
  return r.straight > RULED_AIM.straight ? `The land is not ruled, but straighter than the aim of ${pct(RULED_AIM.straight)}: ${nums}; ${where}` : `The land is not ruled: ${nums}`;
}

/** Wet tiles of settled water, as the Workshop study read them (depth 0.1 or more). */
export function wetOf(depth: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(depth.length);
  for (let i = 0; i < depth.length; i++) out[i] = depth[i] >= 0.1 ? 1 : 0;
  return out;
}
