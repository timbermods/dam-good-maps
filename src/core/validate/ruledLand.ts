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
// - channels: the share of the map's water lying in channels, bodies long for their width whose width hardly varies
//   (a trench, a canal, a moat). In each row (and each column) a run of wet tiles bounded by dry ground is a slice;
//   a slice continues the chain whose last slice, in one of the `CHANNEL_GAP` rows before, has both ends within
//   `CHANNEL_SHIFT` tiles of its own (so a side arm's junction does not cut the chain). A chain of `CHANNEL_RUN`+
//   rows, at least `CHANNEL_LENGTH` times its mean width long, whose widths vary by at most `CHANNEL_CV` (standard
//   deviation over mean), is a channel. Rivers pass by their shape, not by their flow: a river's width varies along
//   it and its bends break the chain (the settle holds a river as a chain of level pools, and a generated map's
//   settle keeps no flow, so standing water cannot be told from a river's reach by the water itself).
//
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
/** Channels: a slice's ends move at most this far from the chain's last slice. */
export const CHANNEL_SHIFT = 3;
/** Channels: a chain bridges up to this many rows of a junction. */
export const CHANNEL_GAP = 4;
/** Channels: a chain this many rows long, at least. */
export const CHANNEL_RUN = 12;
/** Channels: a chain at least this many times its mean width long. */
export const CHANNEL_LENGTH = 3;
/** Channels: the width's variation along the chain (standard deviation over mean) at most this: 3 / 20. */
export const CHANNEL_CV_NUM = 3;
export const CHANNEL_CV_DEN = 20;
/** Sides this close to the map's edge and parallel to it are the game's, not the land's. */
export const EDGE_MARGIN = 2;

/** The limits (calibrated: docs, "Ruled land"). A map fails when any number is over its limit. */
export const RULED_LIMITS = { straight: 0.15, bands: 0.03, corners: 3, channels: 0.25 } as const;
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

/** One direction of the channels: marks their tiles; returns the largest chain's tiles and middle (row, col). */
function channelSweep(wet: ArrayLike<number>, cols: number, rows: number, rs: number, cs: number, mark: Uint8Array): { tiles: number; row: number; col: number } | null {
  // each row's slices [start, width, chain]; each chain's rows, width sum and sum of squares, last slice (row, index),
  // and the sums of its tiles' rows and columns (its middle)
  const slices: Int32Array[] = [];
  const n: number[] = [];
  const sw: number[] = [];
  const sw2: number[] = [];
  const lastRow: number[] = [];
  const lastAt: number[] = [];
  const sr: number[] = [];
  const sc: number[] = [];
  for (let r = 0; r < rows; r++) {
    const a: number[] = [];
    let c = 0;
    while (c < cols) {
      const v = wet[r * rs + c * cs] ? 1 : 0;
      let e = c + 1;
      while (e < cols && (wet[r * rs + e * cs] ? 1 : 0) === v) e++;
      if (v && c > 0 && e < cols) a.push(c, e - c, -1);
      c = e;
    }
    for (let i = 0; i < a.length; i += 3) {
      let chain = -1;
      for (let g = 1; g <= CHANNEL_GAP && chain < 0 && r - g >= 0; g++) {
        const p = slices[r - g];
        // (a row's slices lie in order: none past a[i] + CHANNEL_SHIFT can match)
        for (let j = 0; j < p.length && p[j] - a[i] <= CHANNEL_SHIFT; j += 3) {
          if (a[i] - p[j] > CHANNEL_SHIFT) continue;
          const k = p[j + 2];
          if (lastRow[k] !== r - g || lastAt[k] !== j) continue;
          const d0 = p[j] - a[i];
          const d1 = p[j] + p[j + 1] - a[i] - a[i + 1];
          if (d0 <= CHANNEL_SHIFT && -d0 <= CHANNEL_SHIFT && d1 <= CHANNEL_SHIFT && -d1 <= CHANNEL_SHIFT) {
            chain = k;
            break;
          }
        }
      }
      if (chain < 0) {
        chain = n.length;
        n.push(0);
        sw.push(0);
        sw2.push(0);
        lastRow.push(0);
        lastAt.push(0);
        sr.push(0);
        sc.push(0);
      }
      const wd = a[i + 1];
      a[i + 2] = chain;
      n[chain]++;
      sw[chain] += wd;
      sw2[chain] += wd * wd;
      lastRow[chain] = r;
      lastAt[chain] = i;
      sr[chain] += r * wd;
      sc[chain] += a[i] * wd + ((wd * (wd - 1)) >> 1);
    }
    slices.push(Int32Array.from(a));
  }
  // a channel: CHANNEL_RUN+ rows, n ≥ CHANNEL_LENGTH × mean width (n² ≥ L·Σw), and sd ≤ (p/q) mean
  // (q²·(n·Σw² − (Σw)²) ≤ p²·(Σw)²)
  const P2 = CHANNEL_CV_NUM * CHANNEL_CV_NUM;
  const Q2 = CHANNEL_CV_DEN * CHANNEL_CV_DEN;
  const is = n.map((rowsIn, k) => rowsIn >= CHANNEL_RUN && rowsIn * rowsIn >= CHANNEL_LENGTH * sw[k] && Q2 * (rowsIn * sw2[k] - sw[k] * sw[k]) <= P2 * sw[k] * sw[k]);
  let worst = -1;
  for (let k = 0; k < n.length; k++) if (is[k] && (worst < 0 || sw[k] > sw[worst])) worst = k;
  for (let r = 0; r < rows; r++) {
    const a = slices[r];
    for (let i = 0; i < a.length; i += 3) if (is[a[i + 2]]) for (let c = a[i]; c < a[i] + a[i + 1]; c++) mark[r * rs + c * cs] = 1;
  }
  return worst < 0 ? null : { tiles: sw[worst], row: Math.round(sr[worst] / sw[worst]), col: Math.round(sc[worst] / sw[worst]) };
}

/** The check's one-line reason, in the gate's style. */
export function ruledLandMessage(r: RuledLand): string {
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const nums = `${pct(r.straight)} of edges straight, ${pct(r.bands)} of the land in even bands, ${Math.round(r.corners * 10) / 10} square corners per 1,000 edges, ${pct(r.channels)} of the water in even channels`;
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
