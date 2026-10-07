//! The water simulation: an exact port of `WaterSim` as it stood in src/core/sim/water.ts when the Rust water
//! replaced it (tag `ts-water-final`; PLAN §10, §20 D293, D311, D359, D381): the game's rules or the port's,
//! the edge spill, and the faster settle's bookkeeping (the active list, wet counts and evaporation modifiers
//! kept up to date as tiles turn wet or dry). Every expression, every per-tile sum's order, the source order
//! and the two substeps per tick are the TypeScript's, so the bytes are the same. Only + − × ÷, comparisons,
//! `ceil` and JavaScript's `Math.max` (`portable::max`, which keeps its signed zeros) are used.

use portable::max;

pub const DT: f64 = 0.3;
pub const K: f64 = 2.25 * DT;
pub const SPILL: f64 = 0.1;
pub const KEEP: f64 = 0.999;
pub const BAL: f64 = 0.8;
pub const TICKS_PER_DAY: u32 = 768;
/// The game days the canonical settle may run (water.ts `SETTLE_DAYS`, D358).
pub const SETTLE_DAYS: f64 = 6.0;

/// A water emitter (water.ts `Emitter`). Its cells never change after construction; its strength,
/// contamination and depth limit may change between runs.
#[derive(Clone, Debug)]
pub struct Emitter {
    pub cells: Vec<u32>,
    pub strength: f64,
    pub contamination: f64,
    /// Seeps: (anchor, off, on); `None` for every other emitter.
    pub limit: Option<(u32, f64, f64)>,
}

/// The model the simulation runs on (water.ts `WaterModel`, without its stored water, which the canonical
/// settle reads).
#[derive(Clone, Debug)]
pub struct Model {
    pub w: usize,
    pub h: usize,
    pub floor: Vec<f64>,
    pub dam: Option<Vec<f64>>,
    pub emitters: Vec<Emitter>,
}

/// Which rules a simulation runs (water.ts `WaterSimOptions`, resolved): the game's or the port's, and the
/// spill threshold at the map's edge.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rules {
    pub game: bool,
    pub edge_spill: bool,
}

impl Default for Rules {
    /// The game's rules with the edge spill (water.ts `DEFAULT_WATER_RULES`).
    fn default() -> Self {
        Rules { game: true, edge_spill: true }
    }
}

const NONE: u32 = u32::MAX;

pub struct Sim {
    pub w: usize,
    pub h: usize,
    pub n: usize,
    pub floor: Vec<f64>,
    pub dam: Option<Vec<f64>>,
    pub emitters: Vec<Emitter>,
    pub d: Vec<f64>,
    pub dold: Vec<f64>,
    pub c: Vec<f64>,
    /// Stored outflow momentum, 4 per tile (index 4·i + k).
    pub out: Vec<f64>,
    pub ticks: u64,
    pub rules: Rules,
    /// Every emitter's [strength, contamination, off, on], for the Wasm caller to write before a run
    /// (`read_params`): its cells and whether it is a seep never change.
    pub params: Vec<f64>,
    wall: Vec<u8>,
    // Directions stay N/W/S/E, but one tile's four neighbours share a cache line.
    nb: Vec<[u32; 4]>,
    // A checked tile access proves all four direction accesses are in bounds.
    f: Vec<[f64; 4]>,
    cnew: Vec<f64>,
    modv: Vec<f64>,
    evap: [f64; 9],
    dirty: Vec<u32>,
    dirty_count: usize,
    dirty_mask: Vec<u8>,
    wn: Vec<i32>,
    wet_mask: Vec<u8>,
    wet: Vec<u32>,
    wet_count: usize,
    prev_wet: Vec<u32>,
    prev_wet_count: usize,
    active: Vec<u32>,
    active_count: usize,
    active_refs: Vec<u8>,
    active_pos: Vec<u32>,
    turned: Vec<u32>,
    source_cells: Vec<u32>,
    seep_on: Vec<u8>,
    /// Each emitter's tile count as a float, what its strength is spread over: its own cells' count, or on a
    /// strip of a larger map (`new_strip`) the whole emitter's.
    shares: Vec<f64>,
}

fn clamp01(v: f64) -> f64 {
    if v < 0.0 {
        0.0
    } else if v > 1.0 {
        1.0
    } else {
        v
    }
}

fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

impl Sim {
    /// `new WaterSim(model, initial, opts)`: the starting depth and contamination (zero when absent) decide
    /// the first wet list.
    pub fn new(model: Model, depth: Option<&[f64]>, contamination: Option<&[f64]>, rules: Rules) -> Sim {
        let h = model.h;
        let counts: Vec<usize> = model.emitters.iter().map(|e| e.cells.len()).collect();
        Sim::with_rows(model, depth, contamination, rules, 0, h, &counts)
    }

    /// A strip of a larger map for the multi-core water (src/core/sim/parallel.ts): `model` holds the strip's
    /// rows only, the map's rows `y0..y0 + model.h` of `gh`, and each emitter only its cells on them, with
    /// `counts` its whole tile count (what its strength is spread over). Its map edges are the map's: the
    /// strip's own first and last rows are open (their neighbours are another strip's), and the water near
    /// them is replaced by that strip's after every tick (`sync_rows`), so the rows a few away from them are
    /// exactly the whole map's.
    pub fn new_strip(model: Model, depth: &[f64], contamination: &[f64], rules: Rules, y0: usize, gh: usize, counts: &[usize]) -> Sim {
        Sim::with_rows(model, Some(depth), Some(contamination), rules, y0, gh, counts)
    }

    fn with_rows(model: Model, depth: Option<&[f64]>, contamination: Option<&[f64]>, rules: Rules, y0: usize, gh: usize, counts: &[usize]) -> Sim {
        let (w, h) = (model.w, model.h);
        let n = w * h;
        let mut d = vec![0.0; n];
        let mut c = vec![0.0; n];
        if let Some(src) = depth {
            d.copy_from_slice(&src[..n]);
        }
        if let Some(src) = contamination {
            c.copy_from_slice(&src[..n]);
        }
        let mut nb = vec![[NONE; 4]; n];
        for i in 0..n {
            let x = i % w;
            let y = (i - x) / w;
            if y > 0 {
                nb[i][0] = (i - w) as u32;
            }
            if x > 0 {
                nb[i][1] = (i - 1) as u32;
            }
            if y < h - 1 {
                nb[i][2] = (i + w) as u32;
            }
            if x < w - 1 {
                nb[i][3] = (i + 1) as u32;
            }
        }
        let mut evap = [0.0; 9];
        for (sat, e) in evap.iter_mut().enumerate().skip(1) {
            let t = (10 - sat as i32) as f64;
            *e = 0.0595 * (t * t) + 0.101 * t + 0.72;
        }
        let mut wall = vec![0u8; n];
        let mut seen = vec![0u8; n];
        let mut cells = Vec::new();
        for e in &model.emitters {
            for &i in &e.cells {
                let i = i as usize;
                let x = i % w;
                let y = (i - x) / w;
                if y0 + y == 0 {
                    wall[i] |= 1;
                }
                if x == 0 {
                    wall[i] |= 2;
                }
                if y0 + y == gh - 1 {
                    wall[i] |= 4;
                }
                if x == w - 1 {
                    wall[i] |= 8;
                }
                if seen[i] == 0 {
                    seen[i] = 1;
                    cells.push(i as u32);
                }
            }
        }
        let mut params = Vec::with_capacity(4 * model.emitters.len());
        for e in &model.emitters {
            let (off, on) = e.limit.map_or((0.0, 0.0), |(_, off, on)| (off, on));
            params.extend_from_slice(&[e.strength, e.contamination, off, on]);
        }
        // a seep starts off, as the game's does: it turns on at the first tick only below its restart depth
        let seep_on = model.emitters.iter().map(|e| if e.limit.is_some() { 0u8 } else { 1u8 }).collect();
        let mut sim = Sim {
            w,
            h,
            n,
            floor: model.floor,
            dam: model.dam,
            emitters: model.emitters,
            d,
            dold: vec![0.0; n],
            c,
            out: vec![0.0; 4 * n],
            ticks: 0,
            rules,
            params,
            wall,
            nb,
            f: vec![[0.0; 4]; n],
            cnew: vec![0.0; n],
            modv: vec![1.0; n],
            evap,
            dirty: vec![0; n],
            dirty_count: 0,
            dirty_mask: vec![0; n],
            wn: vec![1; n],
            wet_mask: vec![0; n],
            wet: vec![0; n],
            wet_count: 0,
            prev_wet: vec![0; n],
            prev_wet_count: 0,
            active: vec![0; n],
            active_count: 0,
            active_refs: vec![0; n],
            active_pos: vec![NONE; n],
            turned: vec![0; n],
            source_cells: cells,
            seep_on,
            shares: counts.iter().map(|&c| c as f64).collect(),
        };
        // the starting water: its wet tiles, their neighbour counts, the active list and the modifiers to
        // compute at the first tick
        for i in 0..n {
            if !(sim.d[i] > 0.0) {
                continue;
            }
            sim.wet[sim.wet_count] = i as u32;
            sim.wet_count += 1;
            sim.wet_mask[i] = 1;
            sim.count_wet(i, 1);
            sim.mark_active(i, 1);
            sim.dirty_mask[i] = 1;
            sim.dirty[sim.dirty_count] = i as u32;
            sim.dirty_count += 1;
        }
        for k in 0..sim.source_cells.len() {
            let i = sim.source_cells[k] as usize;
            sim.ref_active(i, 1);
        }
        sim
    }

    /// Takes the emitters' strength, contamination and seep limits from `params`.
    pub fn read_params(&mut self) {
        for (k, e) in self.emitters.iter_mut().enumerate() {
            let p = &self.params[4 * k..4 * k + 4];
            e.strength = p[0];
            e.contamination = p[1];
            if let Some((anchor, _, _)) = e.limit {
                e.limit = Some((anchor, p[2], p[3]));
            }
        }
    }

    /// Cluster saturation per wet tile (0 elsewhere), stored as a byte (TypeScript's Uint8Array wraps).
    pub fn saturation(&self) -> Vec<u8> {
        let mut sat = vec![0u8; self.n];
        for k in 0..self.wet_count {
            let i = self.wet[k] as usize;
            sat[i] = self.sat_at(i) as u8;
        }
        sat
    }

    fn count_wet(&mut self, i: usize, delta: i32) {
        let (w, h) = (self.w as i64, self.h as i64);
        let x = (i % self.w) as i64;
        let y = (i / self.w) as i64;
        for dy in -1..=1 {
            let yy = y + dy;
            if yy < 0 || yy >= h {
                continue;
            }
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let xx = x + dx;
                if xx >= 0 && xx < w {
                    self.wn[(yy * w + xx) as usize] += delta;
                }
            }
        }
    }

    fn mark_dirty(&mut self, i: usize) {
        let (w, h) = (self.w, self.h);
        let x = i % w;
        let y = (i - x) / w;
        let y1 = (h - 1).min(y + 2);
        let x1 = (w - 1).min(x + 2);
        for yy in y.saturating_sub(2)..=y1 {
            for xx in x.saturating_sub(2)..=x1 {
                let c = yy * w + xx;
                if self.dirty_mask[c] == 0 {
                    self.dirty_mask[c] = 1;
                    self.dirty[self.dirty_count] = c as u32;
                    self.dirty_count += 1;
                }
            }
        }
    }

    /// One more (`delta` 1) or one fewer (−1) reason for tile `i` to be active; the count is a byte, as
    /// TypeScript's Uint8Array holds it.
    fn ref_active(&mut self, i: usize, delta: i32) {
        let before = self.active_refs[i] as i32;
        let after = before + delta;
        self.active_refs[i] = after as u8;
        if before == 0 && after != 0 {
            self.active_pos[i] = self.active_count as u32;
            self.active[self.active_count] = i as u32;
            self.active_count += 1;
        } else if before != 0 && after == 0 {
            // the last tile in the list takes its place
            let pos = self.active_pos[i] as usize;
            self.active_count -= 1;
            let last = self.active[self.active_count];
            self.active[pos] = last;
            self.active_pos[last as usize] = pos as u32;
            self.active_pos[i] = NONE;
        }
    }

    fn mark_active(&mut self, i: usize, delta: i32) {
        self.ref_active(i, delta);
        for k in 0..4 {
            let nb = self.nb[i][k];
            if nb != NONE {
                self.ref_active(nb as usize, delta);
            }
        }
    }

    fn sat_at(&self, i: usize) -> i32 {
        let (w, h, d, wn) = (self.w, self.h, &self.d, &self.wn);
        let x = i % w;
        let y = (i - x) / w;
        let mut best = wn[i];
        if y > 0 && d[i - w] > 0.0 && wn[i - w] - 1 > best {
            best = wn[i - w] - 1;
        }
        if x > 0 && d[i - 1] > 0.0 && wn[i - 1] - 1 > best {
            best = wn[i - 1] - 1;
        }
        if y < h - 1 && d[i + w] > 0.0 && wn[i + w] - 1 > best {
            best = wn[i + w] - 1;
        }
        if x < w - 1 && d[i + 1] > 0.0 && wn[i + 1] - 1 > best {
            best = wn[i + 1] - 1;
        }
        if best < 8 {
            best
        } else {
            8
        }
    }

    fn update_evap_mod(&mut self) {
        for k in 0..self.dirty_count {
            let i = self.dirty[k] as usize;
            self.modv[i] = if self.d[i] > 0.0 { self.evap_at(self.sat_at(i)) } else { 1.0 };
            self.dirty_mask[i] = 0;
        }
        self.dirty_count = 0;
    }

    /// The modifier table's entry (TypeScript reads `undefined`, NaN, outside it; a wet tile's count is at
    /// least 1, so that never happens).
    fn evap_at(&self, sat: i32) -> f64 {
        if (0..9).contains(&sat) {
            self.evap[sat as usize]
        } else {
            f64::NAN
        }
    }

    #[inline]
    #[allow(clippy::too_many_arguments)]
    fn dam_flow(&self, c: usize, fc: f64, hc: f64, fn_: f64, lim: f64, e: f64, prev: f64) -> f64 {
        let hd = hc - fn_;
        if hd < lim {
            let a = clamp01(clamp01((lim - hd) / 0.1) * clamp(1.0 - 2.25 * (hc - (fc + self.dold[c])), 0.5, 2.0));
            return 0.995 * prev - 0.02 * a;
        }
        let mut e = e;
        if hd - lim < 0.1 && e > 0.0 {
            e = e * ((hd - lim) / 0.1);
        }
        0.995 * prev + K * e
    }

    /// One direction's outflow of wet tile `c` (water.ts writes the four out; each is these steps).
    #[inline]
    fn outflow(&self, c: usize, n: u32, blocked: bool, fc: f64, hc: f64, out_k: f64) -> f64 {
        let inside = n != NONE;
        let nu = n as usize;
        let fn_ = if inside { self.floor[nu] } else { 0.0 };
        let dn = if inside { self.d[nu] } else { 0.0 };
        let hn = if inside { fn_ + dn } else { 0.0 };
        if blocked || fn_ >= hc {
            return 0.0;
        }
        let mut e = hc - hn;
        let prev = KEEP * out_k;
        let lim = match (inside, &self.dam) {
            (true, Some(dam)) => dam[nu],
            _ => -1.0,
        };
        let fk = if lim >= 0.0 && fn_ < hc.ceil() && (!self.rules.game || fc <= fn_) {
            self.dam_flow(c, fc, hc, fn_, lim, e, prev)
        } else {
            if (inside || self.rules.edge_spill) && dn == 0.0 && fn_ == fc {
                e = e - SPILL;
            }
            prev + K * e
        };
        if fk > 0.0 {
            fk
        } else {
            0.0
        }
    }

    fn substep(&mut self, scale: f64) {
        let game = self.rules.game;
        // flows of the tiles that had water last substep and are dry now are stale: clear them
        for k in 0..self.prev_wet_count {
            let c = self.prev_wet[k] as usize;
            if self.d[c] > 0.0 {
                continue;
            }
            self.f[c] = [0.0; 4];
        }

        // 1. outflows of every wet tile, from the start-of-substep state
        for wi in 0..self.wet_count {
            let c = self.wet[wi] as usize;
            let fc = self.floor[c];
            let dc = self.d[c];
            let hc = fc + dc;
            let b = 4 * c;
            let wc = self.wall[c];
            let nb = self.nb[c];
            let out = &self.out[b..b + 4];
            let f0 = self.outflow(c, nb[0], wc & 1 != 0, fc, hc, out[0]);
            let f1 = self.outflow(c, nb[1], wc & 2 != 0, fc, hc, out[1]);
            let f2 = self.outflow(c, nb[2], wc & 4 != 0, fc, hc, out[2]);
            let f3 = self.outflow(c, nb[3], wc & 8 != 0, fc, hc, out[3]);
            let mut flows = [f0, f1, f2, f3];
            // The reduction is still left-to-right, never a SIMD horizontal sum.
            let s = f0 + f1 + f2 + f3;
            if game {
                let sd = s * DT;
                if s > 0.0 && dc < sd {
                    let r = dc / sd;
                    for f in &mut flows {
                        *f *= r;
                    }
                }
            } else if s * DT > dc {
                let r = dc / max(s * DT, 1e-12);
                for f in &mut flows {
                    *f *= r;
                }
            }
            self.f[c] = flows;
        }

        // 2. depth, contamination and stored momentum of every active tile
        for a in 0..self.active_count {
            let c = self.active[a] as usize;
            let b = 4 * c;
            let [n0, n1, n2, n3] = self.nb[c];
            let in0 = if n0 != NONE { self.f[n0 as usize][2] } else { 0.0 };
            let in1 = if n1 != NONE { self.f[n1 as usize][3] } else { 0.0 };
            let in2 = if n2 != NONE { self.f[n2 as usize][0] } else { 0.0 };
            let in3 = if n3 != NONE { self.f[n3 as usize][1] } else { 0.0 };
            // a dry tile that receives nothing stays dry
            if self.d[c] == 0.0 && in0 == 0.0 && in1 == 0.0 && in2 == 0.0 && in3 == 0.0 {
                self.dold[c] = self.d[c]; // keeps the zero's sign
                self.out[b..b + 4].fill(0.0);
                self.cnew[c] = 0.0;
                self.d[c] = 0.0;
                continue;
            }
            let [f0, f1, f2, f3] = self.f[c];
            let outsum = f0 + f1 + f2 + f3;
            let insum = in0 + in1 + in2 + in3;
            let c0 = if n0 != NONE { self.c[n0 as usize] } else { 0.0 };
            let c1 = if n1 != NONE { self.c[n1 as usize] } else { 0.0 };
            let c2 = if n2 != NONE { self.c[n2 as usize] } else { 0.0 };
            let c3 = if n3 != NONE { self.c[n3 as usize] } else { 0.0 };
            let cin = 0.0 + in0 * c0 + in1 * c1 + in2 * c2 + in3 * c3;
            let dc = self.d[c];
            let rem0 = dc - outsum * DT;
            let remaining = if rem0 > 0.0 { rem0 } else { 0.0 };
            self.out[b..b + 4].copy_from_slice(&[
                max(0.0, f0 - BAL * in0),
                max(0.0, f1 - BAL * in1),
                max(0.0, f2 - BAL * in2),
                max(0.0, f3 - BAL * in3),
            ]);
            self.dold[c] = dc;
            let mut net = insum - outsum;
            if game || dc > 0.0 {
                net = net - (if dc < 0.02 { 1e-3 } else { 1e-4 }) * self.modv[c];
            }
            let d1 = dc + net * DT;
            let new_d = if d1 > 0.0 { d1 } else { 0.0 };
            let mass = self.c[c] * remaining + cin * DT;
            self.cnew[c] = if new_d > 1e-9 { clamp01(mass / max(new_d, 1e-9)) } else { 0.0 };
            self.d[c] = new_d;
        }
        for a in 0..self.active_count {
            let c = self.active[a] as usize;
            self.c[c] = self.cnew[c];
        }

        // 3. sources add dt·S/N to each of their tiles
        for e in 0..self.emitters.len() {
            if self.seep_on[e] == 0 {
                continue;
            }
            let src = &self.emitters[e];
            let add = (DT * src.strength * scale) / self.shares[e];
            if add < 0.0 {
                // a sink (negative strength, D337) removes its own kind, floored at dry (the game's
                // UpdateContaminationFromWaterChange)
                for &i in &src.cells {
                    let i = i as usize;
                    let d0 = self.d[i];
                    if !(d0 > 0.0) {
                        continue;
                    }
                    if game {
                        self.dold[i] = d0;
                    }
                    let d1 = d0 + add;
                    if d1 > 0.0 {
                        self.c[i] = clamp01((self.c[i] * d0 + src.contamination * add) / d1);
                        self.d[i] = d1;
                    } else {
                        self.c[i] = 0.0;
                        self.d[i] = 0.0;
                    }
                }
                continue;
            }
            if !(add > 0.0) {
                continue;
            }
            for &i in &src.cells {
                let i = i as usize;
                let d0 = self.d[i];
                if game {
                    self.dold[i] = d0;
                }
                self.c[i] = (self.c[i] * d0 + src.contamination * add) / (d0 + add);
                self.d[i] = d0 + add;
            }
        }

        // the wet list for the next substep; tiles that turned wet or dry update the counts, the modifiers
        // round them and, after this scan, the active list
        core::mem::swap(&mut self.prev_wet, &mut self.wet);
        self.prev_wet_count = self.wet_count;
        let mut n = 0;
        let mut n_turned = 0;
        for a in 0..self.active_count {
            let c = self.active[a] as usize;
            let wet = if self.d[c] > 0.0 { 1 } else { 0 };
            if wet != self.wet_mask[c] {
                self.wet_mask[c] = wet;
                self.count_wet(c, if wet == 1 { 1 } else { -1 });
                self.mark_dirty(c);
                self.turned[n_turned] = c as u32;
                n_turned += 1;
            }
            if wet == 1 {
                self.wet[n] = c as u32;
                n += 1;
            }
        }
        self.wet_count = n;
        for k in 0..n_turned {
            let c = self.turned[k] as usize;
            let delta = if self.wet_mask[c] == 1 { 1 } else { -1 };
            self.mark_active(c, delta);
        }
    }

    /// Brings the bookkeeping up to date with water written over rows `lo..hi` from outside the run (the
    /// multi-core water's neighbouring strip, or the whole map when a simulation takes over another's water):
    /// a tile that turned wet or dry there updates the wet-neighbour counts, the modifiers round it (at the next
    /// tick) and the active list, and a tile that turned dry drops its flows, as the run's own turns do; then
    /// the wet list is rebuilt. Its order changes no result (every per-tile step reads only the substep's start).
    pub fn sync_rows(&mut self, lo: usize, hi: usize) {
        let mut n_turned = 0;
        for c in lo * self.w..hi * self.w {
            let wet = if self.d[c] > 0.0 { 1 } else { 0 };
            if wet == self.wet_mask[c] {
                continue;
            }
            self.wet_mask[c] = wet;
            self.count_wet(c, if wet == 1 { 1 } else { -1 });
            self.mark_dirty(c);
            if wet == 0 {
                self.f[c] = [0.0; 4];
            }
            self.turned[n_turned] = c as u32;
            n_turned += 1;
        }
        // If occupancy did not change, the active and wet memberships are already exact.
        // Depth/contamination/momentum were copied by the caller before this call;
        // their magnitudes cannot invalidate the occupancy-only bookkeeping.
        if n_turned == 0 {
            return;
        }
        for k in 0..n_turned {
            let c = self.turned[k] as usize;
            let delta = if self.wet_mask[c] == 1 { 1 } else { -1 };
            self.mark_active(c, delta);
        }
        let mut n = 0;
        for a in 0..self.active_count {
            let c = self.active[a] as usize;
            if self.d[c] > 0.0 {
                self.wet[n] = c as u32;
                n += 1;
            }
        }
        self.wet_count = n;
    }

    /// Whether emitter `k` is on (only a seep is ever off: its depth limit).
    pub fn seep_on(&self, k: usize) -> bool {
        self.seep_on[k] != 0
    }

    /// Switches emitter `k` on or off, as a simulation that takes over another's water carries its seeps on.
    pub fn set_seep_on(&mut self, k: usize, on: bool) {
        self.seep_on[k] = on as u8;
    }

    fn update_seeps(&mut self) {
        for e in 0..self.emitters.len() {
            if let Some((anchor, off, on)) = self.emitters[e].limit {
                let d = self.d[anchor as usize];
                if d > off {
                    self.seep_on[e] = 0;
                } else if d < on {
                    self.seep_on[e] = 1;
                }
            }
        }
    }

    /// Run `ticks` ticks (2 substeps each); `scale` scales every source (0 = drought).
    pub fn run(&mut self, ticks: u64, scale: f64) {
        for _ in 0..ticks {
            // sorting the active list now and then keeps its memory access in order (D359); the order
            // changes no result
            if self.ticks % 64 == 0 {
                self.active[..self.active_count].sort_unstable();
                for a in 0..self.active_count {
                    self.active_pos[self.active[a] as usize] = a as u32;
                }
            }
            self.update_seeps();
            self.update_evap_mod();
            self.substep(scale);
            self.substep(scale);
            self.ticks += 1;
        }
    }

    /// The bookkeeping kept up to date against the same rebuilt from the water as it stands (the active list,
    /// the wet list, every tile's wet-neighbour count and evaporation modifier; tests/unit/water-speedups.test.ts):
    /// 0 when they agree, else what differs × 2³² + the tile (1 the active list, 2 the wet list, 3 a count, 4 a
    /// modifier). It brings the modifiers up to date for the next tick first, as the run would.
    pub fn books_check(&mut self) -> u64 {
        let (w, h, n) = (self.w, self.h, self.n);
        let wrong = |what: u64, i: usize| (what << 32) | i as u64;
        let mut want = vec![0u8; n];
        for i in 0..n {
            if !(self.d[i] > 0.0) {
                continue;
            }
            want[i] = 1;
            for k in 0..4 {
                if self.nb[i][k] != NONE {
                    want[self.nb[i][k] as usize] = 1;
                }
            }
        }
        for &i in &self.source_cells {
            want[i as usize] = 1;
        }
        let mut got = vec![0u8; n];
        for a in 0..self.active_count {
            let i = self.active[a] as usize;
            if got[i] != 0 || self.active_pos[i] != a as u32 {
                return wrong(1, i);
            }
            got[i] = 1;
        }
        let mut wet_got = vec![0u8; n];
        for k in 0..self.wet_count {
            wet_got[self.wet[k] as usize] = 1;
        }
        self.update_evap_mod();
        let count = |i: usize, d: &[f64]| {
            let (x, y) = ((i % w) as i64, (i / w) as i64);
            let mut c = 1;
            for dy in -1..=1i64 {
                for dx in -1..=1i64 {
                    let (xx, yy) = (x + dx, y + dy);
                    if (dx != 0 || dy != 0) && xx >= 0 && xx < w as i64 && yy >= 0 && yy < h as i64 && d[(yy * w as i64 + xx) as usize] > 0.0 {
                        c += 1;
                    }
                }
            }
            c
        };
        for i in 0..n {
            if got[i] != want[i] {
                return wrong(1, i);
            }
            if wet_got[i] != (self.d[i] > 0.0) as u8 {
                return wrong(2, i);
            }
            let wn = count(i, &self.d);
            if self.wn[i] != wn {
                return wrong(3, i);
            }
            let mut m = 1.0;
            if self.d[i] > 0.0 {
                let (x, y) = (i % w, i / w);
                let mut sat = wn;
                for (nb, ok) in [(i.wrapping_sub(w), y > 0), (i.wrapping_sub(1), x > 0), (i + w, y < h - 1), (i + 1, x < w - 1)] {
                    if ok && self.d[nb] > 0.0 {
                        let c = count(nb, &self.d);
                        if c - 1 > sat {
                            sat = c - 1;
                        }
                    }
                }
                let t = (10 - sat.min(8)) as f64;
                m = 0.0595 * (t * t) + 0.101 * t + 0.72;
            }
            if self.modv[i].to_bits() != f64::to_bits(m) {
                return wrong(4, i);
            }
        }
        0
    }

    /// Total water, summed in index order.
    pub fn volume(&self) -> f64 {
        let mut s = 0.0;
        for i in 0..self.n {
            s += self.d[i];
        }
        s
    }
}
