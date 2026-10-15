//! D448: #71's stacked water rules. Fixed direction/slot and sum order; portable max.
use crate::columns::{Columns, Refusal, OPEN};
use crate::sim::{BAL, DT, K, KEEP, SPILL};
use portable::max;
pub const PRESSURE: f64 = 8.0;
pub const SINK: i32 = -1;
#[derive(Clone, Debug)]
pub struct Emitter {
    pub cols: Vec<u32>,
    pub tiles: Vec<u32>,
    pub strength: f64,
    pub contamination: f64,
    pub limit: Option<(u32, f64, f64)>,
}
#[derive(Clone, Debug)]
pub struct Retained {
    pub tile: u32,
    pub floor: f64,
    pub depth: f64,
    pub contamination: f64,
}
#[derive(Clone, Debug)]
pub struct Model {
    pub cols: Columns,
    pub emitters: Vec<Emitter>,
    pub retained: Vec<Retained>,
    /// Current flat water's explicitly drained tiles (D387); default empty.
    pub drained: Vec<u32>,
}
#[derive(Clone, Debug)]
pub struct State {
    pub depth: Vec<f64>,
    pub overflow: Vec<f64>,
    pub contamination: Vec<f64>,
}
pub struct Stack {
    pub cols: Columns,
    pub emitters: Vec<Emitter>,
    pub game: bool,
    pub ticks: u64,
    pub d: Vec<f64>,
    pub o: Vec<f64>,
    pub c: Vec<f64>,
    pub dold: Vec<f64>,
    pub start: Vec<u32>,
    pub target: Vec<i32>,
    pub dir: Vec<u8>,
    pub rev: Vec<i32>,
    pub out: Vec<f64>,
    pub params: Vec<f64>,
    f: Vec<f64>,
    cnew: Vec<f64>,
    modv: Vec<f64>,
    wn: Vec<i32>,
    wet: Vec<usize>,
    prev_wet: Vec<usize>,
    active: Vec<usize>,
    source_cols: Vec<usize>,
    seep_on: Vec<bool>,
    /// Per edge, worked out once from the geometry: 1 when the flow rules let water take it
    /// (`dir_allowed`), 2 when its target's tile has a partial obstacle at some level (`height_limit`
    /// can then answer other than -1).
    edge_rule: Vec<u8>,
    /// `build_active`'s marks, a bit per column, all clear between calls.
    mark: Vec<u64>,
    /// `update_evap`'s bookkeeping: whether it must work the whole map out (at the start and after the
    /// water was written from outside), the wet columns and a bit per column wet (depth above 0) when it
    /// last ran, and its lists and marks per tile (clear between calls).
    evap_full: bool,
    evap_wet: Vec<usize>,
    pos: Vec<u64>,
    tile_mark: Vec<u8>,
    flipped: Vec<usize>,
    near: Vec<usize>,
    ring: Vec<usize>,
    /// 1 on every column that has been wet at the start or the end of any substep since this map was built
    /// (or its state written, `set_state`): with the active list's rule (the wet columns, their neighbours and
    /// the sources), where the run can have read or written. Read only; it changes no result. A settle's
    /// reach (stackWater.ts `StackSettle.reach`): an edit far from it leaves that settle as it was.
    pub wet_ever: Vec<u8>,
}
/// Finite and not below 0 (NaN is neither).
fn finite_amount(v: f64) -> bool {
    v >= 0.0 && v <= f64::MAX
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
pub(crate) fn validate_params(params: &[f64], count: usize) -> Result<(), Refusal> {
    if params.len() != 4 * count {
        return Err("Water emitter parameters are malformed.");
    }
    for p in params.chunks_exact(4) {
        if p.iter().any(|v| !v.is_finite())
            || !(-1_000_000.0..=1_000_000.0).contains(&p[0])
            || !(0.0..=1.0).contains(&p[1])
            || p[3] < 0.0
            || p[2] < p[3]
        {
            return Err("Water emitter parameters are malformed.");
        }
    }
    Ok(())
}
impl Stack {
    pub(crate) fn new(m: Model, game: bool) -> Self {
        let cols = m.cols;
        let n = cols.n;
        let size = n * cols.levels;
        let w = cols.w;
        let h = cols.h;
        let mut wall = vec![0u8; n];
        let mut seen = vec![false; size];
        let mut source_cols = Vec::new();
        let mut params = Vec::new();
        for e in &m.emitters {
            for &i in &e.tiles {
                let i = i as usize;
                let x = i % w;
                let y = i / w;
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
            }
            for &c in &e.cols {
                let c = c as usize;
                if !seen[c] {
                    seen[c] = true;
                    source_cols.push(c);
                }
            }
            let (_, off, on) = e.limit.unwrap_or((0, 0.0, 0.0));
            params.extend_from_slice(&[e.strength, e.contamination, off, on]);
        }
        let mut start = vec![0; size + 1];
        let mut target = Vec::new();
        let mut dir = Vec::new();
        for c in 0..size {
            start[c] = target.len() as u32;
            let i = c % n;
            if c / n >= cols.count[i] as usize {
                continue;
            }
            let x = i % w;
            let y = i / w;
            let fc = cols.floor[c];
            let cc = cols.ceil[c];
            let nb = [
                if y > 0 { Some(i - w) } else { None },
                if x > 0 { Some(i - 1) } else { None },
                if y < h - 1 { Some(i + w) } else { None },
                if x < w - 1 { Some(i + 1) } else { None },
            ];
            for (k, tile) in nb.iter().enumerate() {
                if let Some(t) = tile {
                    for s in 0..cols.count[*t] as usize {
                        let id = s * n + t;
                        if cols.ceil[id] <= fc {
                            continue;
                        }
                        if cols.floor[id] >= cc {
                            break;
                        }
                        target.push(id as i32);
                        dir.push(k as u8);
                    }
                } else if wall[i] & (1 << k) == 0 {
                    target.push(SINK);
                    dir.push(k as u8);
                }
            }
        }
        start[size] = target.len() as u32;
        let edges = target.len();
        let mut rev = vec![-1; edges];
        for c in 0..size {
            for e in start[c] as usize..start[c + 1] as usize {
                let t = target[e];
                if t < 0 {
                    continue;
                }
                let t = t as usize;
                let back = (dir[e] + 2) & 3;
                for r in start[t] as usize..start[t + 1] as usize {
                    if target[r] == c as i32 && dir[r] == back {
                        rev[e] = r as i32;
                        break;
                    }
                }
            }
        }
        let seep_on = vec![true; m.emitters.len()];
        let mut stack = Stack {
            cols,
            emitters: m.emitters,
            game,
            ticks: 0,
            d: vec![0.0; size],
            o: vec![0.0; size],
            c: vec![0.0; size],
            dold: vec![0.0; size],
            start,
            target,
            dir,
            rev,
            out: vec![0.0; edges],
            params,
            f: vec![0.0; edges],
            cnew: vec![0.0; size],
            modv: vec![1.0; size],
            wn: vec![0; size],
            wet: Vec::new(),
            prev_wet: Vec::new(),
            active: Vec::new(),
            source_cols,
            seep_on,
            edge_rule: Vec::new(),
            mark: vec![0; size.div_ceil(64)],
            evap_full: true,
            evap_wet: Vec::new(),
            pos: vec![0; size.div_ceil(64)],
            tile_mark: vec![0; n],
            flipped: Vec::new(),
            near: Vec::new(),
            ring: Vec::new(),
            wet_ever: vec![0; size],
        };
        let mut limited = vec![false; n];
        for &key in stack.cols.height_limit.keys() {
            limited[key % n] = true;
        }
        let mut rule = vec![0u8; edges];
        for c in 0..size {
            for e in stack.start[c] as usize..stack.start[c + 1] as usize {
                let t = stack.target[e];
                rule[e] = stack.dir_allowed(c, t, stack.dir[e]) as u8 | if t >= 0 && limited[t as usize % n] { 2 } else { 0 };
            }
        }
        stack.edge_rule = rule;
        stack
    }
    pub fn validate_state(&self) -> Result<(), Refusal> {
        let size = self.cols.n * self.cols.levels;
        if self.d.len() != size
            || self.o.len() != size
            || self.c.len() != size
            || self.dold.len() != size
            || self.out.len() != self.target.len()
        {
            return Err("Water state arrays are malformed.");
        }
        let n = self.cols.n;
        for s in 0..self.cols.levels {
            for i in 0..n {
                if !self.column_ok(s * n + i, s < self.cols.count[i] as usize) {
                    return Err("Water state is malformed.");
                }
            }
        }
        if !self.out.iter().chain(&self.dold).all(|&v| finite_amount(v)) {
            return Err("Water momentum is malformed.");
        }
        validate_params(&self.params, self.emitters.len())
    }
    /// Column `c`'s water is well formed: finite, not below 0, within its gap and its pressure's cap
    /// (`valid`: its tile has this slot), and none on a slot its tile does not have.
    fn column_ok(&self, c: usize, valid: bool) -> bool {
        self.column_ok_with(c, valid, self.d[c], self.o[c], self.c[c])
    }
    /// `column_ok` for the water `d`, `o`, `k` on column `c`.
    fn column_ok_with(&self, c: usize, valid: bool, d: f64, o: f64, k: f64) -> bool {
        if !(finite_amount(d) && finite_amount(o) && (0.0..=1.0).contains(&k)) {
            return false;
        }
        if valid {
            let cap = (self.cols.ceil[c] - self.cols.floor[c]) as f64;
            !(d > cap || o > (OPEN - self.cols.ceil[c]) as f64 / PRESSURE || (o > 0.0 && d != cap))
        } else {
            d == 0.0 && o == 0.0 && k == 0.0
        }
    }
    pub fn sync_state(&mut self) -> Result<(), Refusal> {
        self.validate_state()?;
        self.dold.copy_from_slice(&self.d);
        self.wet = (0..self.d.len()).filter(|&c| self.d[c] + self.o[c] > 0.0).collect();
        self.evap_full = true;
        Ok(())
    }
    /// The water of the tiles of rows `lo..hi` as a block another strip of the same map takes (`import_rows`):
    /// `[slots, rows, width]`, then depth, pressure, contamination and old depth (each slot by slot, the
    /// tiles in order), then the momentum of the flows, slot by slot and row by row, each row's count first.
    pub fn export_rows(&self, lo: usize, hi: usize, block: &mut Vec<f64>) -> Result<(), Refusal> {
        let n = self.cols.n;
        let w = self.cols.w;
        let levels = self.cols.levels;
        if lo > hi || hi > self.cols.h {
            return Err("Water rows are invalid.");
        }
        block.clear();
        block.extend_from_slice(&[levels as f64, (hi - lo) as f64, w as f64]);
        for v in [&self.d, &self.o, &self.c, &self.dold] {
            for s in 0..levels {
                block.extend_from_slice(&v[s * n + lo * w..s * n + hi * w]);
            }
        }
        for s in 0..levels {
            for r in lo..hi {
                let (a, z) = (self.start[s * n + r * w] as usize, self.start[s * n + (r + 1) * w] as usize);
                block.push((z - a) as f64);
                block.extend_from_slice(&self.out[a..z]);
            }
        }
        Ok(())
    }
    /// Takes another strip's block of rows `lo..hi` (`export_rows`) between ticks: its halo, from the strips
    /// beside it. The whole block is checked before any of it is written; the momentum of this strip's own top
    /// and bottom rows stays its own (their edges are not the map's). The wet columns of those rows are then
    /// brought up to date; the run's other bookkeeping follows by itself (the evaporation's from the wet
    /// columns, the flows' from the wet columns' water).
    pub fn import_rows(&mut self, lo: usize, hi: usize, block: &[f64]) -> Result<(), Refusal> {
        let n = self.cols.n;
        let w = self.cols.w;
        let h = self.cols.h;
        let unfit: Refusal = "Water rows do not fit this map.";
        if lo > hi || hi > h {
            return Err("Water rows are invalid.");
        }
        let k = (hi - lo) * w;
        let theirs = match block.first() {
            Some(&v) if v >= 1.0 && v <= 34.0 && v.trunc() == v => v as usize,
            _ => return Err(unfit),
        };
        if block.len() < 3 + 4 * theirs * k || block[1] != (hi - lo) as f64 || block[2] != w as f64 {
            return Err(unfit);
        }
        if (lo * w..hi * w).any(|i| self.cols.count[i] as usize > theirs) {
            return Err(unfit);
        }
        let state = |q: usize, s: usize, i: usize| block[3 + (q * theirs + s) * k + (i - lo * w)];
        // the check
        for s in 0..theirs {
            for i in lo * w..hi * w {
                let (d, o, c, old) = (state(0, s, i), state(1, s, i), state(2, s, i), state(3, s, i));
                if s >= self.cols.levels {
                    if d != 0.0 || o != 0.0 || c != 0.0 || old != 0.0 {
                        return Err(unfit);
                    }
                } else if !self.column_ok_with(s * n + i, s < self.cols.count[i] as usize, d, o, c) || !finite_amount(old) {
                    return Err("Water state is malformed.");
                }
            }
        }
        let mut at = 3 + 4 * theirs * k;
        let mut rows = Vec::with_capacity(theirs * (hi - lo));
        for s in 0..theirs {
            for r in lo..hi {
                let len = match block.get(at) {
                    Some(&v) if v >= 0.0 && v.trunc() == v => v as usize,
                    _ => return Err(unfit),
                };
                at += 1;
                let values = block.get(at..at + len).ok_or(unfit)?;
                at += len;
                if r == 0 || r == h - 1 {
                    continue;
                }
                let (a, z) = if s < self.cols.levels { (self.start[s * n + r * w] as usize, self.start[s * n + (r + 1) * w] as usize) } else { (0, 0) };
                if z - a != len {
                    return Err(unfit);
                }
                if !values.iter().all(|&v| finite_amount(v)) {
                    return Err("Water momentum is malformed.");
                }
                rows.push((a, at - len, len));
            }
        }
        if at != block.len() {
            return Err(unfit);
        }
        // the writing
        for s in 0..theirs.min(self.cols.levels) {
            for i in lo * w..hi * w {
                let c = s * n + i;
                self.d[c] = state(0, s, i);
                self.o[c] = state(1, s, i);
                self.c[c] = state(2, s, i);
                self.dold[c] = state(3, s, i);
            }
        }
        for (a, from, len) in rows {
            self.out[a..a + len].copy_from_slice(&block[from..from + len]);
        }
        let (i0, i1) = (lo * w, hi * w);
        self.wet.retain(|&c| !(i0..i1).contains(&(c % n)));
        for s in 0..self.cols.levels {
            for c in s * n + i0..s * n + i1 {
                if self.d[c] + self.o[c] > 0.0 {
                    self.wet.push(c);
                }
            }
        }
        Ok(())
    }
    /// The water after `ticks` more ticks run elsewhere (the multi-core settle's strips), written whole:
    /// checked, and the run's bookkeeping started again from it.
    ///
    /// Only depth, pressure and contamination are written: the momentum (`out`) and old depth (`dold`) stay
    /// as this engine last left them, stale. That is harmless today, since the strips stop exactly at a check
    /// and only depth, pressure, contamination and saturation are read afterwards; don't run this engine on
    /// after a settle on several threads without bringing them up to date first.
    pub fn accept_elsewhere(&mut self, ticks: u64) -> Result<(), Refusal> {
        self.validate_state()?;
        self.wet = (0..self.d.len()).filter(|&c| self.d[c] + self.o[c] > 0.0).collect();
        self.prev_wet.clear();
        self.f.fill(0.0);
        self.evap_full = true;
        self.ticks += ticks;
        Ok(())
    }
    pub(crate) fn set_state(&mut self, s: &State) -> Result<(), Refusal> {
        self.d.copy_from_slice(&s.depth);
        self.o.copy_from_slice(&s.overflow);
        self.c.copy_from_slice(&s.contamination);
        self.wet_ever.fill(0);
        self.sync_state()
    }
    pub fn read_params(&mut self) -> Result<(), Refusal> {
        validate_params(&self.params, self.emitters.len())?;
        for (e, p) in self.emitters.iter_mut().zip(self.params.chunks_exact(4)) {
            e.strength = p[0];
            e.contamination = p[1];
            if let Some((a, _, _)) = e.limit {
                e.limit = Some((a, p[2], p[3]));
            }
        }
        Ok(())
    }
    fn neighbour_wet(&self, c: usize, t: usize) -> bool {
        let fc = self.cols.floor[c];
        let cc = self.cols.ceil[c];
        if self.cols.floor[t] >= fc {
            return cc > self.cols.floor[t] && self.d[t] > 0.0;
        }
        for s in (0..self.cols.count[t] as usize).rev() {
            let id = s * self.cols.n + t;
            if self.cols.floor[id] < cc && self.cols.ceil[id] > fc && self.d[id] > 0.0 {
                return true;
            }
        }
        false
    }
    /// A wet column's count of wet tiles around it, itself included; 0 for a dry one.
    fn wn_at(&self, c: usize) -> i32 {
        if !(self.d[c] > 0.0) {
            return 0;
        }
        let w = self.cols.w;
        let h = self.cols.h;
        let i = c % self.cols.n;
        let x = (i % w) as i32;
        let y = (i / w) as i32;
        let mut n = 1;
        for dy in -1..=1 {
            let yy = y + dy;
            if yy < 0 || yy >= h as i32 {
                continue;
            }
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let xx = x + dx;
                if xx >= 0 && xx < w as i32 && self.neighbour_wet(c, yy as usize * w + xx as usize) {
                    n += 1;
                }
            }
        }
        n
    }
    fn compute_wn(&mut self) {
        for k in 0..self.wet.len() {
            let c = self.wet[k];
            self.wn[c] = self.wn_at(c);
        }
    }
    fn best_wn(&self, c: usize, t: usize) -> i32 {
        let mut best = 0;
        for s in 0..self.cols.count[t] as usize {
            let id = s * self.cols.n + t;
            if self.d[id] > 0.0 && self.wn[id] > best && self.cols.ceil[id] > self.cols.floor[c] && self.cols.floor[id] < self.cols.ceil[c]
            {
                best = self.wn[id];
            }
        }
        best
    }
    fn sat_at(&self, c: usize) -> i32 {
        let w = self.cols.w;
        let h = self.cols.h;
        let i = c % self.cols.n;
        let x = i % w;
        let y = i / w;
        let mut best = self.wn[c];
        for (t, ok) in [
            (i.wrapping_sub(w), y > 0),
            (i.wrapping_sub(1), x > 0),
            (i + w, y < h - 1),
            (i + 1, x < w - 1),
        ] {
            if ok {
                let b = self.best_wn(c, t);
                if b - 1 > best {
                    best = b - 1;
                }
            }
        }
        best.min(8)
    }
    pub fn saturation(&mut self) -> Vec<u8> {
        self.compute_wn();
        let mut sat = vec![0; self.d.len()];
        for &c in &self.wet {
            if self.d[c] > 0.0 {
                sat[c] = self.sat_at(c) as u8;
            }
        }
        sat
    }
    fn evap_at(&self, c: usize) -> f64 {
        let t = (10 - self.sat_at(c)) as f64;
        0.0595 * (t * t) + 0.101 * t + 0.72
    }
    /// Each wet column's evaporation modifier, from its cluster saturation; 1 on every other column. It
    /// depends only on which columns are wet within two tiles, so once it has been worked out over the
    /// whole map it is worked out again only around the columns that turned wet or dry since (the
    /// heightfield's `update_evap_mod` does the same, sim.rs); the values are the same either way.
    fn update_evap(&mut self) {
        let n = self.cols.n;
        let w = self.cols.w;
        let h = self.cols.h;
        let mut full = self.evap_full;
        if !full {
            // (a column that turned wet or dry is wet now or was at the last update)
            for k in 0..self.evap_wet.len() + self.wet.len() {
                let c = if k < self.evap_wet.len() { self.evap_wet[k] } else { self.wet[k - self.evap_wet.len()] };
                if (self.d[c] > 0.0) != (self.pos[c >> 6] >> (c & 63) & 1 == 1) {
                    let i = c % n;
                    if self.tile_mark[i] == 0 {
                        self.tile_mark[i] = 1;
                        self.flipped.push(i);
                    }
                }
            }
            for &i in &self.flipped {
                self.tile_mark[i] = 0;
            }
            // (past a share of the water, working it all out again is quicker)
            full = self.flipped.len() * 8 > self.wet.len();
        }
        if full {
            for &c in &self.evap_wet {
                self.modv[c] = 1.0;
                self.pos[c >> 6] &= !(1 << (c & 63));
            }
            self.compute_wn();
            for k in 0..self.wet.len() {
                let c = self.wet[k];
                if self.d[c] > 0.0 {
                    self.modv[c] = self.evap_at(c);
                    self.pos[c >> 6] |= 1 << (c & 63);
                }
            }
            self.evap_full = false;
        } else if !self.flipped.is_empty() {
            // the tiles within one of a change get their counts again, those within two their modifiers
            let mut near = core::mem::take(&mut self.near);
            let mut ring = core::mem::take(&mut self.ring);
            for &i in &self.flipped {
                let x = (i % w) as i64;
                let y = (i / w) as i64;
                for yy in (y - 2).max(0)..=(y + 2).min(h as i64 - 1) {
                    for xx in (x - 2).max(0)..=(x + 2).min(w as i64 - 1) {
                        let t = yy as usize * w + xx as usize;
                        let close = (yy - y).abs() <= 1 && (xx - x).abs() <= 1;
                        if self.tile_mark[t] & 1 == 0 {
                            self.tile_mark[t] |= 1;
                            ring.push(t);
                        }
                        if close && self.tile_mark[t] & 2 == 0 {
                            self.tile_mark[t] |= 2;
                            near.push(t);
                        }
                    }
                }
            }
            for &t in &near {
                for s in 0..self.cols.count[t] as usize {
                    let c = s * n + t;
                    self.wn[c] = self.wn_at(c);
                }
            }
            for &t in &ring {
                self.tile_mark[t] = 0;
                for s in 0..self.cols.count[t] as usize {
                    let c = s * n + t;
                    if self.d[c] > 0.0 {
                        self.modv[c] = self.evap_at(c);
                        self.pos[c >> 6] |= 1 << (c & 63);
                    } else {
                        self.modv[c] = 1.0;
                        self.pos[c >> 6] &= !(1 << (c & 63));
                    }
                }
            }
            near.clear();
            ring.clear();
            self.near = near;
            self.ring = ring;
        }
        self.flipped.clear();
        self.evap_wet.clear();
        self.evap_wet.extend_from_slice(&self.wet);
    }
    /// The wet columns, their neighbours and the source columns, once each, in index order: every step
    /// reads only the substep's start and writes only its own column, so the order changes no result, and
    /// walking memory in order is faster.
    fn build_active(&mut self) {
        let mark = &mut self.mark;
        for &c in &self.wet {
            mark[c >> 6] |= 1 << (c & 63);
            for e in self.start[c] as usize..self.start[c + 1] as usize {
                let t = self.target[e];
                if t >= 0 {
                    mark[t as usize >> 6] |= 1 << (t & 63);
                }
            }
        }
        for &c in &self.source_cols {
            mark[c >> 6] |= 1 << (c & 63);
        }
        self.active.clear();
        for (k, word) in mark.iter_mut().enumerate() {
            let mut b = *word;
            while b != 0 {
                self.active.push(k * 64 + b.trailing_zeros() as usize);
                b &= b - 1;
            }
            *word = 0;
        }
    }
    fn height_limit(&self, c: usize, t: usize, hc: f64) -> f64 {
        let n = self.cols.n;
        let tile = t % n;
        if !self.game {
            let ft = self.cols.floor[t];
            return if (ft as f64) < hc.ceil() {
                *self.cols.height_limit.get(&(ft as usize * n + tile)).unwrap_or(&-1.0)
            } else {
                -1.0
            };
        }
        let base = self.cols.floor[c].max(self.cols.floor[t]);
        for z in base..hc.ceil() as i16 {
            if let Some(&v) = self.cols.height_limit.get(&(z as usize * n + tile)) {
                return v;
            }
        }
        -1.0
    }
    fn dir_allowed(&self, c: usize, t: i32, k: u8) -> bool {
        if !self.game {
            return true;
        }
        let n = self.cols.n;
        if t >= 0 {
            let t = t as usize;
            if let Some(&lt) = self.cols.dir_limit.get(&(self.cols.floor[t] as usize * n + t % n)) {
                if lt != k {
                    return false;
                }
            }
        }
        if let Some(&lo) = self.cols.dir_limit.get(&(self.cols.floor[c] as usize * n + c % n)) {
            if lo != k && lo != ((k + 2) & 3) {
                return false;
            }
        }
        true
    }
    fn substep(&mut self, scale: f64) {
        // (the flows of the columns that are dry now are stale; every wet one's are written below)
        for &c in &self.prev_wet {
            if !(self.d[c] + self.o[c] > 0.0) {
                self.f[self.start[c] as usize..self.start[c + 1] as usize].fill(0.0);
            }
        }
        self.build_active();
        for &c in &self.wet {
            self.wet_ever[c] = 1;
        }
        for &c in &self.wet {
            let fc = self.cols.floor[c] as f64;
            let dc = self.d[c];
            let oc = self.o[c];
            let hc = fc + dc;
            let pc = oc * PRESSURE;
            let e0 = self.start[c] as usize;
            let e1 = self.start[c + 1] as usize;
            let mut sum = 0.0;
            for e in e0..e1 {
                let t = self.target[e];
                let sink = t == SINK;
                let ti = if sink { 0 } else { t as usize };
                let ft = if sink { 0.0 } else { self.cols.floor[ti] as f64 };
                let rule = self.edge_rule[e];
                if ft >= hc || rule & 1 == 0 {
                    self.f[e] = 0.0;
                    continue;
                }
                let dt = if sink { 0.0 } else { self.d[ti] };
                let ot = if sink { 0.0 } else { self.o[ti] };
                let ct = if sink { OPEN as f64 } else { self.cols.ceil[ti] as f64 };
                let ht = ft + dt;
                let pt = ot * PRESSURE;
                let d5 = hc + pc - (ht + pt);
                let mut ev;
                if d5 > 0.0 {
                    let n7 = d5 - (ct - ht);
                    let n8 = if d5 > pc { pc } else { d5 };
                    let n9 = if n8 > n7 { n8 } else { n7 };
                    ev = d5 - n9 + n9 / PRESSURE;
                } else {
                    let n12 = -d5;
                    let n13 = n12 - (self.cols.ceil[c] as f64 - hc);
                    let n14 = if n12 < pt { n12 } else { pt };
                    let n15 = if n14 > n13 { n14 } else { n13 };
                    ev = d5 + n15 - n15 / PRESSURE;
                }
                let prev = KEEP * self.out[e];
                let lim = if rule & 2 == 0 { -1.0 } else { self.height_limit(c, ti, hc) };
                let fk = if lim >= 0.0 {
                    let hd = hc + pc - ft;
                    if hd < lim {
                        let a = clamp(
                            clamp((lim - hd) / 0.1, 0.0, 1.0) * clamp(1.0 - 2.25 * (hc - (fc + self.dold[c])), 0.5, 2.0),
                            0.0,
                            1.0,
                        );
                        0.995 * prev - 0.02 * a
                    } else {
                        if hd - lim < 0.1 && ev > 0.0 {
                            ev = ev * ((hd - lim) / 0.1);
                        }
                        0.995 * prev + K * ev
                    }
                } else {
                    if (self.game || !sink) && dt + ot == 0.0 && ft == fc {
                        ev = ev - SPILL;
                    }
                    prev + K * ev
                };
                let v = if fk > 0.0 { fk } else { 0.0 };
                self.f[e] = v;
                sum += v;
            }
            let have = dc + oc;
            let sd = sum * DT;
            if self.game {
                if sum > 0.0 && have < sd {
                    let r = have / sd;
                    for e in e0..e1 {
                        self.f[e] *= r;
                    }
                }
            } else if sd > have {
                let r = have / max(sd, 1e-12);
                for e in e0..e1 {
                    self.f[e] *= r;
                }
            }
        }
        for &c in &self.active {
            let mut outsum = 0.0;
            let mut insum = 0.0;
            let mut cin = 0.0;
            for e in self.start[c] as usize..self.start[c + 1] as usize {
                let fe = self.f[e];
                let r = self.rev[e];
                let fin = if r >= 0 { self.f[r as usize] } else { 0.0 };
                outsum += fe;
                insum += fin;
                if fin != 0.0 {
                    cin += fin * self.c[self.target[e] as usize];
                }
                self.out[e] = max(0.0, fe - BAL * fin);
            }
            let dc = self.d[c];
            let vc = dc + self.o[c];
            let rem0 = vc - outsum * DT;
            let remaining = if rem0 > 0.0 { rem0 } else { 0.0 };
            self.dold[c] = dc;
            let mut net = insum - outsum;
            if self.game || dc > 0.0 {
                net = net - (if dc < 0.02 { 1e-3 } else { 1e-4 }) * self.modv[c];
            }
            let d1 = vc + net * DT;
            let tot = if d1 > 0.0 { d1 } else { 0.0 };
            let cap = (self.cols.ceil[c] - self.cols.floor[c]) as f64;
            let new_d;
            if tot > cap {
                new_d = cap;
                let max_o = (OPEN - self.cols.ceil[c]) as f64 / PRESSURE;
                let o = tot - cap;
                self.o[c] = if o > max_o { max_o } else { o };
            } else {
                new_d = tot;
                self.o[c] = 0.0;
            }
            let vol = new_d + self.o[c];
            let mass = self.c[c] * remaining + cin * DT;
            self.cnew[c] = if vol > 1e-9 { clamp(mass / max(vol, 1e-9), 0.0, 1.0) } else { 0.0 };
            self.d[c] = new_d;
        }
        for &c in &self.active {
            self.c[c] = self.cnew[c];
        }
        for e in 0..self.emitters.len() {
            let src = &self.emitters[e];
            if !self.seep_on[e] || src.cols.is_empty() {
                continue;
            }
            let add = (DT * src.strength * scale) / src.cols.len() as f64;
            if add < 0.0 {
                // A sink (a negative strength, D337): the game's one task for every column
                // (`UpdateWaterSourcesTask` with `WaterDepthSetter.SetWaterDepth`). The change comes off the
                // column's water and pressure together, floored at dry, and the badwater share follows
                // `UpdateContaminationFromWaterChange` on depth plus pressure × 8. In the open, with no
                // pressure, this is the heightfield rule (sim.rs), in its own arithmetic.
                for &c in &src.cols {
                    let c = c as usize;
                    let d0 = self.d[c];
                    let o0 = self.o[c];
                    if !(d0 > 0.0) && !(o0 > 0.0) {
                        continue;
                    }
                    if self.game {
                        self.dold[c] = d0;
                    }
                    let cap = (self.cols.ceil[c] - self.cols.floor[c]) as f64;
                    if o0 == 0.0 {
                        let d1 = d0 + add;
                        if d1 > 0.0 {
                            self.c[c] = clamp((self.c[c] * d0 + src.contamination * add) / d1, 0.0, 1.0);
                            self.d[c] = d1;
                        } else {
                            self.c[c] = 0.0;
                            self.d[c] = 0.0;
                        }
                        continue;
                    }
                    let before = d0 + o0 * PRESSURE;
                    let tot = d0 + o0 + add;
                    if tot < 0.0 {
                        self.d[c] = 0.0;
                        self.o[c] = 0.0;
                    } else if tot > cap {
                        self.d[c] = cap;
                        let max_o = (OPEN - self.cols.ceil[c]) as f64 / PRESSURE;
                        let o = tot - cap;
                        self.o[c] = if o > max_o { max_o } else { o };
                    } else {
                        self.d[c] = tot;
                        self.o[c] = 0.0;
                    }
                    let after = self.d[c] + self.o[c] * PRESSURE;
                    self.c[c] = if after != 0.0 { clamp((self.c[c] * before + src.contamination * (after - before)) / after, 0.0, 1.0) } else { 0.0 };
                }
                continue;
            }
            if !(add > 0.0) {
                continue;
            }
            for &c in &src.cols {
                let c = c as usize;
                let d0 = self.d[c];
                let v0 = d0 + self.o[c];
                if self.game {
                    self.dold[c] = d0;
                }
                self.c[c] = (self.c[c] * v0 + src.contamination * add) / (v0 + add);
                let tot = v0 + add;
                let cap = (self.cols.ceil[c] - self.cols.floor[c]) as f64;
                if tot > cap {
                    self.d[c] = cap;
                    let max_o = (OPEN - self.cols.ceil[c]) as f64 / PRESSURE;
                    let o = tot - cap;
                    self.o[c] = if o > max_o { max_o } else { o };
                } else {
                    self.d[c] = tot;
                    self.o[c] = 0.0;
                }
            }
        }
        core::mem::swap(&mut self.prev_wet, &mut self.wet);
        self.wet.clear();
        for &c in &self.active {
            if self.d[c] + self.o[c] > 0.0 {
                self.wet.push(c);
                self.wet_ever[c] = 1;
            }
        }
    }
    pub fn run(&mut self, ticks: u64, scale: f64) {
        for _ in 0..ticks {
            for (e, src) in self.emitters.iter().enumerate() {
                if let Some((a, off, on)) = src.limit {
                    let d = self.d[a as usize];
                    if d > off {
                        self.seep_on[e] = false;
                    } else if d < on {
                        self.seep_on[e] = true;
                    }
                }
            }
            self.update_evap();
            self.substep(scale);
            self.substep(scale);
            self.ticks += 1;
        }
    }
    pub fn volume(&self) -> f64 {
        let mut s = 0.0;
        for c in 0..self.d.len() {
            s += self.d[c] + self.o[c];
        }
        s
    }
    pub fn edge_outflow(&self) -> f64 {
        let mut s = 0.0;
        for e in 0..self.target.len() {
            if self.target[e] == SINK {
                s += self.f[e];
            }
        }
        s
    }
}

impl Model {
    pub fn validate(&self) -> Result<(), Refusal> {
        let c = &self.cols;
        let n =
            c.w.checked_mul(c.h)
                .filter(|&n| c.w > 0 && c.h > 0 && n <= 1_048_576)
                .ok_or("Water map dimensions are invalid.")?;
        if c.n != n || c.levels == 0 || c.levels > 34 || c.count.len() != n || c.floor.len() != n * c.levels || c.ceil.len() != n * c.levels
        {
            return Err("Water columns are malformed.");
        }
        for i in 0..n {
            if c.count[i] as usize > c.levels {
                return Err("Water columns are malformed.");
            }
            let mut top = 0;
            for s in 0..c.levels {
                let id = s * n + i;
                let (f, t) = (c.floor[id], c.ceil[id]);
                if s < c.count[i] as usize {
                    if f < top || f < 0 || f >= t || t > OPEN {
                        return Err("Water columns are malformed.");
                    }
                    top = t;
                } else if f != 0 || t != 0 {
                    return Err("Water columns are malformed.");
                }
            }
        }
        if c.height_limit
            .iter()
            .any(|(&k, &v)| k >= 34 * n || !v.is_finite() || !(0.0..1.0).contains(&v))
            || c.dir_limit.iter().any(|(&k, &v)| k >= 34 * n || v > 3)
        {
            return Err("Water obstacle limits are malformed.");
        }
        for e in &self.emitters {
            if !e.strength.is_finite()
                || !(-1_000_000.0..=1_000_000.0).contains(&e.strength)
                || !e.contamination.is_finite()
                || !(0.0..=1.0).contains(&e.contamination)
                || e.tiles.iter().any(|&i| i as usize >= n)
                || e.cols.iter().any(|&id| {
                    let id = id as usize;
                    id >= n * c.levels || id / n >= c.count[id % n] as usize || !e.tiles.contains(&((id % n) as u32))
                })
            {
                return Err("Water emitter is malformed.");
            }
            if let Some((a, off, on)) = e.limit {
                if !e.cols.contains(&a) || !off.is_finite() || !on.is_finite() || on < 0.0 || off < on {
                    return Err("Water seep limits are malformed.");
                }
            }
        }
        if self.drained.iter().any(|&i| i as usize >= n) {
            return Err("Drained water tiles are malformed.");
        }
        for r in &self.retained {
            if r.tile as usize >= n || c.count[r.tile as usize] == 0 {
                return Err("Retained water has no open column.");
            }
        }
        Ok(())
    }
}
