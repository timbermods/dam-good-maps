// Exact binary64 port of feature/m9b e292cefe src/core/sim/water.ts.
// No fast-math, reassociation, mul_add, approximate math, or parallel reductions.
use std::collections::VecDeque;
pub const DT: f64 = 0.3;
pub const K: f64 = 2.25 * DT;
const KEEP: f64 = 0.999;
const BAL: f64 = 0.8;
#[derive(Clone)]
pub struct Emitter {
    pub cells: Vec<usize>,
    pub strength: f64,
    pub contamination: f64,
    pub limit: Option<(usize, f64, f64)>,
}
pub struct Sim {
    pub w: usize,
    pub h: usize,
    pub n: usize,
    pub floor: Vec<f64>,
    pub dam: Option<Vec<f64>>,
    pub emitters: Vec<Emitter>,
    pub d: Vec<f64>,
    pub old: Vec<f64>,
    pub c: Vec<f64>,
    pub out: Vec<f64>,
    pub ticks: u64,
    pub game: bool,
    pub edge: bool,
    pub seep: Vec<u8>,
    wall: Vec<u8>,
    nb: Vec<[isize; 4]>,
    f: Vec<f64>,
    next_c: Vec<f64>,
    modifiers: Vec<f64>,
    evap: [f64; 9],
    dirty: Vec<usize>,
    dirty_mask: Vec<bool>,
    wn: Vec<i32>,
    wet_mask: Vec<bool>,
    wet: Vec<usize>,
    prev_wet: Vec<usize>,
    active: Vec<usize>,
    refs: Vec<i32>,
    pos: Vec<usize>,
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
// JavaScript Math.max semantics (NaN and signed zero), rather than Rust f64::max.
fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_positive() || b.is_sign_positive() {
            0.0
        } else {
            -0.0
        }
    } else if a > b {
        a
    } else {
        b
    }
}
impl Sim {
    fn validate_shape(&self) {
        let n = self.w.checked_mul(self.h).expect("water geometry overflow");
        assert_eq!(self.n, n);
        let n4 = n.checked_mul(4).expect("water flow size overflow");
        for len in [
            self.floor.len(),
            self.d.len(),
            self.c.len(),
            self.old.len(),
            self.nb.len(),
            self.wall.len(),
            self.modifiers.len(),
            self.next_c.len(),
        ] {
            assert_eq!(len, n, "water buffer shape");
        }
        assert_eq!(self.out.len(), n4);
        assert_eq!(self.f.len(), n4);
        if let Some(dam) = &self.dam {
            assert_eq!(dam.len(), n);
        }
        assert_eq!(self.seep.len(), self.emitters.len());
        for src in &self.emitters {
            for &i in &src.cells {
                assert!(i < n, "water source index");
            }
            if let Some((i, _, _)) = src.limit {
                assert!(i < n, "water anchor index");
            }
        }
        debug_assert!(self.wet.iter().chain(&self.active).all(|&i| i < n));
        debug_assert!(self
            .nb
            .iter()
            .flatten()
            .all(|&i| i == -1 || (i >= 0 && (i as usize) < n)));
    }

    pub fn new(
        w: usize,
        h: usize,
        floor: Vec<f64>,
        dam: Option<Vec<f64>>,
        emitters: Vec<Emitter>,
        d: Vec<f64>,
        c: Vec<f64>,
        game: bool,
        edge: bool,
    ) -> Self {
        let n = w.checked_mul(h).expect("water geometry overflow");
        let n4 = n.checked_mul(4).expect("water flow size overflow");
        let mut s = Self {
            w,
            h,
            n,
            floor,
            dam,
            emitters,
            d,
            c,
            old: vec![0.0; n],
            out: vec![0.0; n4],
            ticks: 0,
            game,
            edge,
            seep: vec![],
            wall: vec![0; n],
            nb: vec![[0; 4]; n],
            f: vec![0.0; n4],
            next_c: vec![0.0; n],
            modifiers: vec![1.0; n],
            evap: [0.0; 9],
            dirty: Vec::with_capacity(n),
            dirty_mask: vec![false; n],
            wn: vec![1; n],
            wet_mask: vec![false; n],
            wet: Vec::with_capacity(n),
            prev_wet: Vec::with_capacity(n),
            active: Vec::with_capacity(n),
            refs: vec![0; n],
            pos: vec![usize::MAX; n],
        };
        s.seep = vec![1; s.emitters.len()];
        s.validate_shape();
        for i in 0..n {
            let x = i % w;
            let y = i / w;
            s.nb[i] = [
                if y > 0 { (i - w) as isize } else { -1 },
                if x > 0 { (i - 1) as isize } else { -1 },
                if y < h - 1 { (i + w) as isize } else { -1 },
                if x < w - 1 { (i + 1) as isize } else { -1 },
            ];
        }
        for sat in 1..=8 {
            let t = (10 - sat) as f64;
            s.evap[sat] = 0.0595 * (t * t) + 0.101 * t + 0.72;
        }
        let mut source = vec![];
        let mut seen = vec![false; n];
        for e in &s.emitters {
            for &i in &e.cells {
                let x = i % w;
                let y = i / w;
                if y == 0 {
                    s.wall[i] |= 1;
                }
                if x == 0 {
                    s.wall[i] |= 2;
                }
                if y == h - 1 {
                    s.wall[i] |= 4;
                }
                if x == w - 1 {
                    s.wall[i] |= 8;
                }
                if !seen[i] {
                    seen[i] = true;
                    source.push(i);
                }
            }
        }
        for i in 0..n {
            if s.d[i] > 0.0 {
                s.wet.push(i);
                s.wet_mask[i] = true;
                s.count_wet(i, 1);
                s.mark_active(i, 1);
                s.dirty_mask[i] = true;
                s.dirty.push(i);
            }
        }
        for i in source {
            s.ref_active(i, 1);
        }
        s
    }
    fn count_wet(&mut self, i: usize, delta: i32) {
        let x = (i % self.w) as isize;
        let y = (i / self.w) as isize;
        for dy in -1..=1 {
            let yy = y + dy;
            if yy < 0 || yy >= self.h as isize {
                continue;
            }
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let xx = x + dx;
                if xx >= 0 && xx < self.w as isize {
                    self.wn[yy as usize * self.w + xx as usize] += delta;
                }
            }
        }
    }
    fn mark_dirty(&mut self, i: usize) {
        let x = i % self.w;
        let y = i / self.w;
        for yy in y.saturating_sub(2)..=(y + 2).min(self.h - 1) {
            for xx in x.saturating_sub(2)..=(x + 2).min(self.w - 1) {
                let j = yy * self.w + xx;
                if !self.dirty_mask[j] {
                    self.dirty_mask[j] = true;
                    self.dirty.push(j);
                }
            }
        }
    }
    fn ref_active(&mut self, i: usize, delta: i32) {
        let before = self.refs[i];
        self.refs[i] += delta;
        let after = self.refs[i];
        if before == 0 && after != 0 {
            self.pos[i] = self.active.len();
            self.active.push(i);
        } else if before != 0 && after == 0 {
            let p = self.pos[i];
            let last = self.active.pop().unwrap();
            if p < self.active.len() {
                self.active[p] = last;
            }
            self.pos[last] = p;
            self.pos[i] = usize::MAX;
        }
    }
    fn mark_active(&mut self, i: usize, delta: i32) {
        self.ref_active(i, delta);
        for j in self.nb[i] {
            if j >= 0 {
                self.ref_active(j as usize, delta);
            }
        }
    }
    fn sat_at(&self, i: usize) -> usize {
        let mut best = self.wn[i];
        for j in self.nb[i] {
            if j >= 0 {
                let j = j as usize;
                if self.d[j] > 0.0 && self.wn[j] - 1 > best {
                    best = self.wn[j] - 1;
                }
            }
        }
        best.min(8) as usize
    }
    pub fn saturation(&self) -> Vec<u8> {
        let mut sat = vec![0; self.n];
        for &i in &self.wet {
            sat[i] = self.sat_at(i) as u8;
        }
        sat
    }
    fn substep(&mut self, scale: f64) {
        for &i in &self.prev_wet {
            if self.d[i] > 0.0 {
                continue;
            }
            self.f[4 * i..4 * i + 4].fill(0.0);
        }
        // SAFETY: run/new check shapes once. Private wet/active/neighbour indices
        // are constructed only from 0..n or validated source cells. The numeric
        // buffers never resize during these phases; frame pointers never escape.
        let mut frame = unsafe { NumericFrame::new(self) };
        frame.flow_phase(&self.wet);
        frame.depth_phase(&self.active);

        for &i in &self.active {
            self.c[i] = self.next_c[i];
        }
        for (e, src) in self.emitters.iter().enumerate() {
            if self.seep[e] == 0 {
                continue;
            }
            let add = (DT * src.strength * scale) / src.cells.len() as f64;
            if !(add > 0.0) {
                continue;
            }
            for &i in &src.cells {
                let d0 = self.d[i];
                if self.game {
                    self.old[i] = d0;
                }
                self.c[i] = (self.c[i] * d0 + src.contamination * add) / (d0 + add);
                self.d[i] = d0 + add;
            }
        }
        std::mem::swap(&mut self.prev_wet, &mut self.wet);
        self.wet.clear();
        let mut turned = vec![];
        for a in 0..self.active.len() {
            let i = self.active[a];
            let wet = self.d[i] > 0.0;
            if wet != self.wet_mask[i] {
                self.wet_mask[i] = wet;
                self.count_wet(i, if wet { 1 } else { -1 });
                self.mark_dirty(i);
                turned.push(i);
            }
            if wet {
                self.wet.push(i);
            }
        }
        for i in turned {
            self.mark_active(i, if self.wet_mask[i] { 1 } else { -1 });
        }
    }
    pub fn run(&mut self, ticks: u64, scale: f64) {
        self.validate_shape();
        for _ in 0..ticks {
            if self.ticks % 64 == 0 {
                self.active.sort_unstable();
                for (p, &i) in self.active.iter().enumerate() {
                    self.pos[i] = p;
                }
            }
            for (e, src) in self.emitters.iter().enumerate() {
                if let Some((i, off, on)) = src.limit {
                    if self.d[i] > off {
                        self.seep[e] = 0;
                    } else if self.d[i] < on {
                        self.seep[e] = 1;
                    }
                }
            }
            for k in 0..self.dirty.len() {
                let i = self.dirty[k];
                self.modifiers[i] = if self.d[i] > 0.0 {
                    self.evap[self.sat_at(i)]
                } else {
                    1.0
                };
                self.dirty_mask[i] = false;
            }
            self.dirty.clear();
            self.substep(scale);
            self.substep(scale);
            self.ticks += 1;
        }
    }
    pub fn volume(&self) -> f64 {
        let mut sum = 0.0;
        for &d in &self.d {
            sum += d;
        }
        sum
    }
    pub fn steady_sealed(
        &self,
        prev: &[f64],
        vol: f64,
        sealed: &[usize],
        tol: f64,
        share: f64,
    ) -> bool {
        let mut feeds = vec![false; self.n];
        for e in &self.emitters {
            if e.strength > 0.0 {
                for &i in &e.cells {
                    feeds[i] = true;
                }
            }
        }
        let mut seen = vec![false; self.n];
        let mut drying = vec![false; self.n];
        for &s in sealed {
            if seen[s] || !(self.d[s] > 0.0 || prev[s] > 0.0) {
                continue;
            }
            seen[s] = true;
            let mut q = VecDeque::from([s]);
            let mut basin = vec![s];
            let mut open = false;
            while let Some(i) = q.pop_front() {
                let x = i % self.w;
                let y = i / self.w;
                if feeds[i] || x == 0 || y == 0 || x == self.w - 1 || y == self.h - 1 {
                    open = true;
                }
                for j in self.nb[i] {
                    if j >= 0 {
                        let j = j as usize;
                        if !seen[j] && (self.d[j] > 0.0 || prev[j] > 0.0) {
                            seen[j] = true;
                            q.push_back(j);
                            basin.push(j);
                        }
                    }
                }
            }
            if !open {
                for i in basin {
                    if !(self.d[i] > prev[i]) {
                        drying[i] = true;
                    }
                }
            }
        }
        let mut rest = 0.0;
        let mut rest_prev = 0.0;
        let mut moved = 0;
        for i in 0..self.n {
            if drying[i] {
                continue;
            }
            rest += self.d[i];
            rest_prev += prev[i];
            if (self.d[i] - prev[i]).abs() > tol {
                moved += 1;
            }
        }
        (rest - rest_prev).abs() / max(vol, 1e-9) < 0.002 && moved as f64 <= share * self.n as f64
    }
    pub fn settle(
        &mut self,
        days: f64,
        every: u64,
        tol: f64,
        share: f64,
        sealed: &[usize],
        until: bool,
    ) -> (bool, Option<u64>) {
        let checks = (days * 768.0 / every as f64).floor() as u64;
        let mut prev = self.d.clone();
        let mut vol = self.volume();
        let mut steady = None;
        for k in 0..checks {
            self.run(every, 1.0);
            let v = self.volume();
            let moved = self
                .d
                .iter()
                .zip(&prev)
                .filter(|(a, b)| (*a - *b).abs() > tol)
                .count();
            if (v - vol).abs() / max(v, 1e-9) < 0.002 && moved as f64 <= share * self.n as f64 {
                return (true, None);
            }
            if !sealed.is_empty()
                && steady.is_none()
                && self.steady_sealed(&prev, v, sealed, tol, share)
            {
                steady = Some(self.ticks);
                if until {
                    return (false, steady);
                }
            }
            if k + 1 < checks {
                prev.clone_from(&self.d);
                vol = v;
            }
        }
        (false, steady)
    }
}

// Little-endian, lossless protocol shared by Wasm and native. See PROTOCOL.md.

// A private, non-owning numeric frame. Index checks are paid once at run/new,
// instead of for every field of every tile/direction. Wasm's memory sandbox
// bounds checks remain enabled. Only private, invariant-preserving phases use it.
struct NumericBuffer<T>(*mut T);
impl<T> std::ops::Index<usize> for NumericBuffer<T> {
    type Output = T;
    fn index(&self, i: usize) -> &T {
        unsafe { &*self.0.add(i) }
    }
}
impl<T> std::ops::IndexMut<usize> for NumericBuffer<T> {
    fn index_mut(&mut self, i: usize) -> &mut T {
        unsafe { &mut *self.0.add(i) }
    }
}
impl<T> std::ops::Index<std::ops::Range<usize>> for NumericBuffer<T> {
    type Output = [T];
    fn index(&self, r: std::ops::Range<usize>) -> &[T] {
        unsafe { std::slice::from_raw_parts(self.0.add(r.start), r.end - r.start) }
    }
}
impl<T> std::ops::IndexMut<std::ops::Range<usize>> for NumericBuffer<T> {
    fn index_mut(&mut self, r: std::ops::Range<usize>) -> &mut [T] {
        unsafe { std::slice::from_raw_parts_mut(self.0.add(r.start), r.end - r.start) }
    }
}
struct NumericFrame {
    floor: NumericBuffer<f64>,
    d: NumericBuffer<f64>,
    c: NumericBuffer<f64>,
    old: NumericBuffer<f64>,
    out: NumericBuffer<f64>,
    f: NumericBuffer<f64>,
    next_c: NumericBuffer<f64>,
    modifiers: NumericBuffer<f64>,
    wall: NumericBuffer<u8>,
    nb: NumericBuffer<[isize; 4]>,
    dam: Option<NumericBuffer<f64>>,
    game: bool,
    edge: bool,
}
impl NumericFrame {
    // Caller must first validate_shape(), and keep all buffers alive and fixed.
    unsafe fn new(s: &mut Sim) -> Self {
        Self {
            floor: NumericBuffer(s.floor.as_mut_ptr()),
            d: NumericBuffer(s.d.as_mut_ptr()),
            c: NumericBuffer(s.c.as_mut_ptr()),
            old: NumericBuffer(s.old.as_mut_ptr()),
            out: NumericBuffer(s.out.as_mut_ptr()),
            f: NumericBuffer(s.f.as_mut_ptr()),
            next_c: NumericBuffer(s.next_c.as_mut_ptr()),
            modifiers: NumericBuffer(s.modifiers.as_mut_ptr()),
            wall: NumericBuffer(s.wall.as_mut_ptr()),
            nb: NumericBuffer(s.nb.as_mut_ptr()),
            dam: s.dam.as_mut().map(|d| NumericBuffer(d.as_mut_ptr())),
            game: s.game,
            edge: s.edge,
        }
    }
    fn dam_flow(
        &self,
        c: usize,
        fc: f64,
        hc: f64,
        fn_: f64,
        lim: f64,
        mut e: f64,
        prev: f64,
    ) -> f64 {
        let hd = hc - fn_;
        if hd < lim {
            let a = clamp(
                clamp((lim - hd) / 0.1, 0.0, 1.0)
                    * clamp(1.0 - 2.25 * (hc - (fc + self.old[c])), 0.5, 2.0),
                0.0,
                1.0,
            );
            return 0.995 * prev - 0.02 * a;
        }
        if hd - lim < 0.1 && e > 0.0 {
            e = e * ((hd - lim) / 0.1);
        }
        0.995 * prev + K * e
    }
    #[inline(always)]
    fn flow_phase(&mut self, wet: &[usize]) {
        for &i in wet {
            let fc = self.floor[i];
            let dc = self.d[i];
            let hc = fc + dc;
            let b = 4 * i;
            for k in 0..4 {
                let j = self.nb[i][k];
                let inside = j >= 0;
                let fn_ = if inside { self.floor[j as usize] } else { 0.0 };
                let dn = if inside { self.d[j as usize] } else { 0.0 };
                let hn = if inside { fn_ + dn } else { 0.0 };
                if self.wall[i] & (1 << k) != 0 || fn_ >= hc {
                    self.f[b + k] = 0.0;
                } else {
                    let mut e = hc - hn;
                    let prev = KEEP * self.out[b + k];
                    let lim = if inside {
                        self.dam.as_ref().map_or(-1.0, |d| d[j as usize])
                    } else {
                        -1.0
                    };
                    let fk = if lim >= 0.0 && fn_ < hc.ceil() && (!self.game || fc <= fn_) {
                        self.dam_flow(i, fc, hc, fn_, lim, e, prev)
                    } else {
                        if (inside || self.edge) && dn == 0.0 && fn_ == fc {
                            e = e - 0.1;
                        }
                        prev + K * e
                    };
                    self.f[b + k] = if fk > 0.0 { fk } else { 0.0 };
                }
            }
            let sum = self.f[b] + self.f[b + 1] + self.f[b + 2] + self.f[b + 3];
            if self.game {
                let sd = sum * DT;
                if sum > 0.0 && dc < sd {
                    let r = dc / sd;
                    for k in 0..4 {
                        self.f[b + k] *= r;
                    }
                }
            } else if sum * DT > dc {
                let r = dc / max(sum * DT, 1e-12);
                for k in 0..4 {
                    self.f[b + k] *= r;
                }
            }
        }
    }
    #[inline(always)]
    fn depth_phase(&mut self, active: &[usize]) {
        for &i in active {
            let b = 4 * i;
            let ns = self.nb[i];
            let mut inf = [0.0; 4];
            for k in 0..4 {
                if ns[k] >= 0 {
                    inf[k] = self.f[4 * ns[k] as usize + [2, 3, 0, 1][k]];
                }
            }
            if self.d[i] == 0.0 && inf.iter().all(|&v| v == 0.0) {
                self.old[i] = self.d[i];
                self.out[b..b + 4].fill(0.0);
                self.next_c[i] = 0.0;
                self.d[i] = 0.0;
                continue;
            }
            let fs = &self.f[b..b + 4];
            let outsum = fs[0] + fs[1] + fs[2] + fs[3];
            let insum = inf[0] + inf[1] + inf[2] + inf[3];
            let mut cin = 0.0;
            for k in 0..4 {
                cin += inf[k]
                    * if ns[k] >= 0 {
                        self.c[ns[k] as usize]
                    } else {
                        0.0
                    };
            }
            let dc = self.d[i];
            let rem0 = dc - outsum * DT;
            let remaining = if rem0 > 0.0 { rem0 } else { 0.0 };
            for k in 0..4 {
                self.out[b + k] = max(0.0, fs[k] - BAL * inf[k]);
            }
            self.old[i] = dc;
            let mut net = insum - outsum;
            if self.game || dc > 0.0 {
                net = net - (if dc < 0.02 { 1e-3 } else { 1e-4 }) * self.modifiers[i];
            }
            let d1 = dc + net * DT;
            let new_d = if d1 > 0.0 { d1 } else { 0.0 };
            let mass = self.c[i] * remaining + cin * DT;
            self.next_c[i] = if new_d > 1e-9 {
                clamp(mass / max(new_d, 1e-9), 0.0, 1.0)
            } else {
                0.0
            };
            self.d[i] = new_d;
        }
    }
}

pub struct Reader<'a> {
    pub data: &'a [u8],
    pub at: usize,
}
impl<'a> Reader<'a> {
    pub fn u32(&mut self) -> u32 {
        let v = u32::from_le_bytes(self.data[self.at..self.at + 4].try_into().unwrap());
        self.at += 4;
        v
    }
    pub fn f64(&mut self) -> f64 {
        let v = f64::from_le_bytes(self.data[self.at..self.at + 8].try_into().unwrap());
        self.at += 8;
        v
    }
    pub fn arr(&mut self, n: usize) -> Vec<f64> {
        (0..n).map(|_| self.f64()).collect()
    }
}
pub fn decode(r: &mut Reader) -> Sim {
    assert_eq!(r.u32(), 0x31575244);
    let w = r.u32() as usize;
    let h = r.u32() as usize;
    assert!(w > 0 && h > 0 && w <= 4096 && h <= 4096);
    let flags = r.u32();
    let ne = r.u32() as usize;
    let n = w * h;
    let floor = r.arr(n);
    let dam = if flags & 4 != 0 { Some(r.arr(n)) } else { None };
    let d = r.arr(n);
    let c = r.arr(n);
    let out = r.arr(4 * n);
    let mut emitters = vec![];
    for _ in 0..ne {
        let nc = r.u32() as usize;
        let cells = (0..nc)
            .map(|_| {
                let i = r.u32() as usize;
                assert!(i < n);
                i
            })
            .collect();
        let strength = r.f64();
        let contamination = r.f64();
        let anchor = r.u32();
        let off = r.f64();
        let on = r.f64();
        emitters.push(Emitter {
            cells,
            strength,
            contamination,
            limit: if anchor == u32::MAX {
                None
            } else {
                assert!((anchor as usize) < n);
                Some((anchor as usize, off, on))
            },
        });
    }
    let mut s = Sim::new(
        w,
        h,
        floor,
        dam,
        emitters,
        d,
        c,
        flags & 1 != 0,
        flags & 2 != 0,
    );
    s.out = out;
    s
}
fn put_u32(b: &mut Vec<u8>, v: u32) {
    b.extend(v.to_le_bytes());
}
fn put_f64(b: &mut Vec<u8>, v: f64) {
    b.extend(v.to_le_bytes());
}
pub fn snapshot(s: &Sim, settled: bool, steady: Option<u64>) -> Vec<u8> {
    let mut b = vec![];
    put_u32(&mut b, s.ticks as u32);
    put_u32(&mut b, settled as u32);
    put_u32(&mut b, steady.map_or(u32::MAX, |v| v as u32));
    put_u32(&mut b, s.n as u32);
    put_f64(&mut b, s.volume());
    for a in [&s.d, &s.c, &s.old, &s.out] {
        for &v in a {
            put_f64(&mut b, v);
        }
    }
    b.extend(s.saturation());
    b.extend(&s.seep);
    b
}
pub fn execute(input: &[u8]) -> Vec<u8> {
    let mut r = Reader { data: input, at: 0 };
    let mut s = decode(&mut r);
    let count = r.u32();
    let mut output = vec![];
    put_u32(&mut output, 0);
    let mut captured = 0u32;
    for _ in 0..count {
        let op = r.u32();
        let mut settled = false;
        let mut steady = None;
        if op == 0 || op == 2 {
            let ticks = r.u32();
            let scale = r.f64();
            for e in &mut s.emitters {
                e.strength = r.f64();
                e.contamination = r.f64();
                if let Some((_, ref mut off, ref mut on)) = e.limit {
                    *off = r.f64();
                    *on = r.f64();
                } else {
                    r.f64();
                    r.f64();
                }
            }
            let nf = r.u32();
            for _ in 0..nf {
                let i = r.u32() as usize;
                s.floor[i] = r.f64();
            }
            s.run(ticks as u64, scale);
        } else {
            assert_eq!(op, 1);
            let days = r.f64();
            let every = r.u32();
            let tol = r.f64();
            let share = r.f64();
            let until = r.u32() != 0;
            let ns = r.u32();
            let sealed = (0..ns).map(|_| r.u32() as usize).collect::<Vec<_>>();
            (settled, steady) = s.settle(days, every as u64, tol, share, &sealed, until);
        }
        if op != 2 {
            let snap = snapshot(&s, settled, steady);
            put_u32(&mut output, snap.len() as u32);
            output.extend(snap);
            captured += 1;
        }
    }
    assert_eq!(r.at, input.len());
    output[..4].copy_from_slice(&captured.to_le_bytes());
    output
}

#[no_mangle]
pub extern "C" fn water_alloc(len: usize) -> *mut u8 {
    let b = vec![0u8; len].into_boxed_slice();
    Box::into_raw(b) as *mut u8
}
#[no_mangle]
pub unsafe extern "C" fn water_dealloc(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}
#[no_mangle]
pub unsafe extern "C" fn water_new(ptr: *const u8, len: usize) -> *mut Sim {
    let mut r = Reader {
        data: std::slice::from_raw_parts(ptr, len),
        at: 0,
    };
    Box::into_raw(Box::new(decode(&mut r)))
}
#[no_mangle]
pub unsafe extern "C" fn water_free(s: *mut Sim) {
    drop(Box::from_raw(s));
}
#[no_mangle]
pub unsafe extern "C" fn water_run(s: *mut Sim, ticks: u32, scale: f64) {
    (&mut *s).run(ticks as u64, scale);
}
// Stable array pointers until water_free; Vec lengths are fixed after construction.
#[no_mangle]
pub unsafe extern "C" fn water_ptr(s: *mut Sim, which: u32) -> *mut f64 {
    let s = &mut *s;
    match which {
        0 => s.floor.as_mut_ptr(),
        1 => s.d.as_mut_ptr(),
        2 => s.c.as_mut_ptr(),
        3 => s.old.as_mut_ptr(),
        4 => s.out.as_mut_ptr(),
        5 => s
            .dam
            .as_mut()
            .map_or(std::ptr::null_mut(), |d| d.as_mut_ptr()),
        _ => std::ptr::null_mut(),
    }
}
#[no_mangle]
pub unsafe extern "C" fn water_emitter(
    s: *mut Sim,
    i: u32,
    strength: f64,
    c: f64,
    anchor: u32,
    off: f64,
    on: f64,
) {
    let e = &mut (&mut *s).emitters[i as usize];
    e.strength = strength;
    e.contamination = c;
    e.limit = if anchor == u32::MAX {
        None
    } else {
        Some((anchor as usize, off, on))
    };
}
#[no_mangle]
pub unsafe extern "C" fn water_sat(s: *const Sim, p: *mut u8) {
    let sat = (&*s).saturation();
    std::ptr::copy_nonoverlapping(sat.as_ptr(), p, sat.len());
}
#[no_mangle]
pub unsafe extern "C" fn water_seep(s: *const Sim, i: u32) -> u32 {
    (&*s).seep[i as usize] as u32
}
#[no_mangle]
pub unsafe extern "C" fn water_execute(p: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let b = execute(std::slice::from_raw_parts(p, len)).into_boxed_slice();
    *out_len = b.len();
    Box::into_raw(b) as *mut u8
}

#[cfg(test)]
mod frame_tests {
    use super::*;
    fn empty(w: usize, h: usize) -> Sim {
        let n = w * h;
        Sim::new(
            w,
            h,
            vec![0.0; n],
            None,
            vec![],
            vec![0.0; n],
            vec![0.0; n],
            true,
            false,
        )
    }
    #[test]
    fn empty_geometry_keeps_the_original_no_tile_behavior() {
        for (w, h) in [(0, 0), (0, 5), (5, 0)] {
            let mut s = empty(w, h);
            s.run(7, 1.0);
            assert_eq!(s.ticks, 7);
            assert_eq!(s.volume().to_bits(), 0.0f64.to_bits());
        }
    }
    #[test]
    fn changed_public_buffer_is_rejected_before_unsafe_phases() {
        let mut s = empty(3, 3);
        s.d[0] = 1.0;
        s.floor.truncate(1);
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| s.run(1, 1.0))).is_err());
        assert_eq!(s.ticks, 0);
    }
    #[test]
    fn invalid_source_and_anchor_are_rejected_before_pointer_access() {
        for (cells, limit) in [(vec![9], None), (vec![0], Some((9, 1.0, 0.5)))] {
            assert!(std::panic::catch_unwind(|| Sim::new(
                3,
                3,
                vec![0.0; 9],
                None,
                vec![Emitter {
                    cells,
                    strength: 1.0,
                    contamination: 0.3,
                    limit
                }],
                vec![0.0; 9],
                vec![0.0; 9],
                true,
                false
            ))
            .is_err());
        }
    }
}
