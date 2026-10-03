//! The water simulation: an exact port of `WaterSim` as it stood in src/core/sim/water.ts on dev before M9b
//! (284f5d7e; PLAN §10, §20 D381; re-ported to M9b's water.ts before the switch). Every expression, every
//! per-tile sum's order, the source order and the two substeps per tick are the TypeScript's, so the bytes
//! are the same. Only + − × ÷, comparisons,
//! `ceil` and JavaScript's `Math.max` (`portable::max`, which keeps its signed zeros) are used.

use portable::max;

pub const DT: f64 = 0.3;
pub const K: f64 = 2.25 * DT;
pub const SPILL: f64 = 0.1;
pub const KEEP: f64 = 0.999;
pub const BAL: f64 = 0.8;
pub const TICKS_PER_DAY: u32 = 768;

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
    /// Every emitter's [strength, contamination, off, on], for the Wasm caller to write before a run
    /// (`read_params`): its cells and whether it is a seep never change.
    pub params: Vec<f64>,
    wall: Vec<u8>,
    f: Vec<f64>,
    cnew: Vec<f64>,
    modv: Vec<f64>,
    wn: Vec<i32>,
    mark: Vec<u32>,
    stamp: u32,
    wet: Vec<u32>,
    wet_count: usize,
    prev_wet: Vec<u32>,
    prev_wet_count: usize,
    active: Vec<u32>,
    active_count: usize,
    mod_set: Vec<u32>,
    mod_set_count: usize,
    source_cells: Vec<u32>,
    seep_on: Vec<u8>,
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
    /// `new WaterSim(model, initial)`: the starting depth and contamination (zero when absent) decide the
    /// first wet list.
    pub fn new(model: Model, depth: Option<&[f64]>, contamination: Option<&[f64]>) -> Sim {
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
        let mut wall = vec![0u8; n];
        let mut seen = vec![0u8; n];
        let mut cells = Vec::new();
        for e in &model.emitters {
            for &i in &e.cells {
                let i = i as usize;
                let x = i % w;
                let y = (i - x) / w;
                if y == 0 {
                    wall[i] |= 1;
                }
                if x == 0 {
                    wall[i] |= 2;
                }
                if y == h - 1 {
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
        let mut wet = vec![0u32; n];
        let mut wet_count = 0;
        for i in 0..n {
            if d[i] > 0.0 {
                wet[wet_count] = i as u32;
                wet_count += 1;
            }
        }
        let seep_on = vec![1u8; model.emitters.len()];
        let mut params = Vec::with_capacity(4 * model.emitters.len());
        for e in &model.emitters {
            let (off, on) = e.limit.map_or((0.0, 0.0), |(_, off, on)| (off, on));
            params.extend_from_slice(&[e.strength, e.contamination, off, on]);
        }
        Sim {
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
            params,
            wall,
            f: vec![0.0; 4 * n],
            cnew: vec![0.0; n],
            modv: vec![1.0; n],
            wn: vec![0; n],
            mark: vec![0; n],
            stamp: 0,
            wet,
            wet_count,
            prev_wet: vec![0; n],
            prev_wet_count: 0,
            active: vec![0; n],
            active_count: 0,
            mod_set: vec![0; n],
            mod_set_count: 0,
            source_cells: cells,
            seep_on,
        }
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

    /// Cluster saturation per wet tile (0 elsewhere).
    pub fn saturation(&mut self) -> Vec<u8> {
        let mut sat = vec![0u8; self.n];
        self.compute_wn();
        for k in 0..self.wet_count {
            let i = self.wet[k] as usize;
            sat[i] = self.sat_at(i) as u8;
        }
        sat
    }

    fn compute_wn(&mut self) {
        let (w, h) = (self.w, self.h);
        for k in 0..self.wet_count {
            let i = self.wet[k] as usize;
            let x = i % w;
            let y = (i - x) / w;
            let d = &self.d;
            let mut c = 1;
            if x > 0 && x < w - 1 && y > 0 && y < h - 1 {
                c += (d[i - w - 1] > 0.0) as i32
                    + (d[i - w] > 0.0) as i32
                    + (d[i - w + 1] > 0.0) as i32
                    + (d[i - 1] > 0.0) as i32
                    + (d[i + 1] > 0.0) as i32
                    + (d[i + w - 1] > 0.0) as i32
                    + (d[i + w] > 0.0) as i32
                    + (d[i + w + 1] > 0.0) as i32;
            } else {
                for dy in -1i64..=1 {
                    let yy = y as i64 + dy;
                    if yy < 0 || yy >= h as i64 {
                        continue;
                    }
                    for dx in -1i64..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let xx = x as i64 + dx;
                        if xx >= 0 && xx < w as i64 && d[yy as usize * w + xx as usize] > 0.0 {
                            c += 1;
                        }
                    }
                }
            }
            self.wn[i] = c;
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
        for k in 0..self.mod_set_count {
            let i = self.mod_set[k] as usize;
            self.modv[i] = 1.0;
        }
        self.mod_set_count = 0;
        self.compute_wn();
        for k in 0..self.wet_count {
            let i = self.wet[k] as usize;
            let t = (10 - self.sat_at(i)) as f64;
            self.modv[i] = 0.0595 * (t * t) + 0.101 * t + 0.72;
            self.mod_set[self.mod_set_count] = i as u32;
            self.mod_set_count += 1;
        }
    }

    fn build_active(&mut self) {
        let (w, h) = (self.w, self.h);
        self.stamp = self.stamp.wrapping_add(1);
        let s = self.stamp;
        let mut n = 0usize;
        let mark = &mut self.mark;
        let act = &mut self.active;
        let mut add = |i: usize| {
            if mark[i] != s {
                mark[i] = s;
                act[n] = i as u32;
                n += 1;
            }
        };
        for k in 0..self.wet_count {
            let i = self.wet[k] as usize;
            add(i);
            let x = i % w;
            let y = (i - x) / w;
            if y > 0 {
                add(i - w);
            }
            if x > 0 {
                add(i - 1);
            }
            if y < h - 1 {
                add(i + w);
            }
            if x < w - 1 {
                add(i + 1);
            }
        }
        for k in 0..self.source_cells.len() {
            add(self.source_cells[k] as usize);
        }
        self.active_count = n;
    }

    /// The outflow of wet tile `c` into a neighbour holding a partial obstacle of height `lim` on floor `fn_`.
    #[inline]
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
    fn outflow(&self, c: usize, n: Option<usize>, blocked: bool, fc: f64, hc: f64, out_k: f64) -> f64 {
        let inside = n.is_some();
        let fn_ = match n {
            Some(n) => self.floor[n],
            None => 0.0,
        };
        let dn = match n {
            Some(n) => self.d[n],
            None => 0.0,
        };
        let hn = if inside { fn_ + dn } else { 0.0 };
        if blocked || fn_ >= hc {
            return 0.0;
        }
        let mut e = hc - hn;
        let prev = KEEP * out_k;
        let lim = match (n, &self.dam) {
            (Some(n), Some(dam)) => dam[n],
            _ => -1.0,
        };
        let fk = if lim >= 0.0 && fn_ < hc.ceil() {
            self.dam_flow(c, fc, hc, fn_, lim, e, prev)
        } else {
            if inside && dn == 0.0 && fn_ == fc {
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
        let (w, h) = (self.w, self.h);
        for k in 0..self.prev_wet_count {
            let b = 4 * self.prev_wet[k] as usize;
            self.f[b] = 0.0;
            self.f[b + 1] = 0.0;
            self.f[b + 2] = 0.0;
            self.f[b + 3] = 0.0;
        }
        self.build_active();

        // 1. outflows of every wet tile, from the start-of-substep state
        for wi in 0..self.wet_count {
            let c = self.wet[wi] as usize;
            let x = c % w;
            let y = (c - x) / w;
            let fc = self.floor[c];
            let dc = self.d[c];
            let hc = fc + dc;
            let b = 4 * c;
            let wc = self.wall[c];
            let f0 = self.outflow(c, if y > 0 { Some(c - w) } else { None }, wc & 1 != 0, fc, hc, self.out[b]);
            self.f[b] = f0;
            let f1 = self.outflow(c, if x > 0 { Some(c - 1) } else { None }, wc & 2 != 0, fc, hc, self.out[b + 1]);
            self.f[b + 1] = f1;
            let f2 = self.outflow(c, if y < h - 1 { Some(c + w) } else { None }, wc & 4 != 0, fc, hc, self.out[b + 2]);
            self.f[b + 2] = f2;
            let f3 = self.outflow(c, if x < w - 1 { Some(c + 1) } else { None }, wc & 8 != 0, fc, hc, self.out[b + 3]);
            self.f[b + 3] = f3;
            // a tile never gives more than it has
            let s = self.f[b] + self.f[b + 1] + self.f[b + 2] + self.f[b + 3];
            if s * DT > dc {
                let r = dc / max(s * DT, 1e-12);
                self.f[b] *= r;
                self.f[b + 1] *= r;
                self.f[b + 2] *= r;
                self.f[b + 3] *= r;
            }
        }

        // 2. depth, contamination and stored momentum of every active tile
        for a in 0..self.active_count {
            let c = self.active[a] as usize;
            let x = c % w;
            let y = (c - x) / w;
            let b = 4 * c;
            let f = &self.f;
            let cc = &self.c;
            let (in0, c0) = if y > 0 { (f[4 * (c - w) + 2], cc[c - w]) } else { (0.0, 0.0) };
            let (in1, c1) = if x > 0 { (f[4 * (c - 1) + 3], cc[c - 1]) } else { (0.0, 0.0) };
            let (in2, c2) = if y < h - 1 { (f[4 * (c + w)], cc[c + w]) } else { (0.0, 0.0) };
            let (in3, c3) = if x < w - 1 { (f[4 * (c + 1) + 1], cc[c + 1]) } else { (0.0, 0.0) };
            let f0 = f[b];
            let f1 = f[b + 1];
            let f2 = f[b + 2];
            let f3 = f[b + 3];
            let outsum = f0 + f1 + f2 + f3;
            let insum = in0 + in1 + in2 + in3;
            let cin = 0.0 + in0 * c0 + in1 * c1 + in2 * c2 + in3 * c3;
            let dc = self.d[c];
            let rem0 = dc - outsum * DT;
            let remaining = if rem0 > 0.0 { rem0 } else { 0.0 };
            self.out[b] = max(0.0, f0 - BAL * in0);
            self.out[b + 1] = max(0.0, f1 - BAL * in1);
            self.out[b + 2] = max(0.0, f2 - BAL * in2);
            self.out[b + 3] = max(0.0, f3 - BAL * in3);
            self.dold[c] = dc;
            let mut net = insum - outsum;
            if dc > 0.0 {
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
            let add = (DT * src.strength * scale) / src.cells.len() as f64;
            if !(add > 0.0) {
                continue;
            }
            for &i in &src.cells {
                let i = i as usize;
                let d0 = self.d[i];
                self.c[i] = (self.c[i] * d0 + src.contamination * add) / (d0 + add);
                self.d[i] = d0 + add;
            }
        }

        // the wet list for the next substep: every wet tile is in the active list
        core::mem::swap(&mut self.prev_wet, &mut self.wet);
        self.prev_wet_count = self.wet_count;
        let mut n = 0;
        for a in 0..self.active_count {
            let c = self.active[a];
            if self.d[c as usize] > 0.0 {
                self.wet[n] = c;
                n += 1;
            }
        }
        self.wet_count = n;
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
            self.update_seeps();
            self.update_evap_mod();
            self.substep(scale);
            self.substep(scale);
            self.ticks += 1;
        }
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
