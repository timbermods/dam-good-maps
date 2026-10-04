// The forces of nature (PLAN §20 D381, #158): Carve, Craterize, Erupt, Quake and Glaciate, planned
// byte for byte as the TypeScript they replaced (tag `ts-forces-final`). AGPL-3.0-or-later.
use portable as portable_math;
#[macro_use]
mod json;
// Reused from rust-water 2ebeea87, including its validated pointer cache.
mod water {
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
        settle_closed: Option<Vec<bool>>,
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
                settle_closed: None,
            };
            // a seep starts off, as the game's does (rust/water sim.rs)
            s.seep = s.emitters.iter().map(|e| if e.limit.is_some() { 0 } else { 1 }).collect();
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
                if add < 0.0 {
                    // a sink (D337), as rust/water sim.rs
                    for &i in &src.cells {
                        let d0 = self.d[i];
                        if !(d0 > 0.0) {
                            continue;
                        }
                        if self.game {
                            self.old[i] = d0;
                        }
                        let d1 = d0 + add;
                        if d1 > 0.0 {
                            self.c[i] = clamp((self.c[i] * d0 + src.contamination * add) / d1, 0.0, 1.0);
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
        pub fn sealed_basins(&self, prev: &[f64], sealed: &[usize]) -> (Vec<bool>, Vec<bool>) {
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
            let mut closed = vec![false; self.n];
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
                        closed[i] = true;
                        if !(self.d[i] > prev[i]) {
                            drying[i] = true;
                        }
                    }
                }
            }
            (closed, drying)
        }
        pub fn closed_basins(&self) -> Option<&[bool]> {
            self.settle_closed.as_deref()
        }
        pub fn steady_sealed(&self, prev: &[f64], sealed: &[usize], tol: f64, share: f64) -> bool {
            let (_, drying) = self.sealed_basins(prev, sealed);
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
            (rest - rest_prev).abs() / max(rest, 1e-9) < 0.002
                && moved as f64 <= share * self.n as f64
        }
        pub fn settle(
            &mut self,
            days: f64,
            every: u64,
            tol: f64,
            share: f64,
            sealed: &[usize],
        ) -> (bool, Option<u64>) {
            let checks = (days * 768.0 / every as f64).floor() as u64;
            let mut prev = self.d.clone();
            let mut vol = self.volume();
            self.settle_closed = None;
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
                    if !sealed.is_empty() {
                        self.settle_closed = Some(self.sealed_basins(&prev, sealed).0);
                    }
                    return (true, None);
                }
                if !sealed.is_empty() && self.steady_sealed(&prev, sealed, tol, share) {
                    self.settle_closed = Some(self.sealed_basins(&prev, sealed).0);
                    return (false, Some(self.ticks));
                }
                if k + 1 < checks {
                    prev.clone_from(&self.d);
                    vol = v;
                }
            }
            if !sealed.is_empty() {
                self.settle_closed = Some(self.sealed_basins(&prev, sealed).0);
            }
            (false, None)
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
                let _legacy_reserved = r.u32();
                let ns = r.u32();
                let sealed = (0..ns).map(|_| r.u32() as usize).collect::<Vec<_>>();
                (settled, steady) = s.settle(days, every as u64, tol, share, &sealed);
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
    pub unsafe extern "C" fn water_execute(
        p: *const u8,
        len: usize,
        out_len: *mut usize,
    ) -> *mut u8 {
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
            assert!(
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| s.run(1, 1.0))).is_err()
            );
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
}

use json::V;
use std::collections::{HashMap, HashSet};
const PI: f64 = 3.141592653589793;
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
fn min(a: f64, b: f64) -> f64 {
    -max(-a, -b)
}
fn clamp(v: f64, a: f64, b: f64) -> f64 {
    max(a, min(b, v))
}
fn round(v: f64) -> f64 {
    let f = v.floor();
    let r = if v - f < 0.5 { f } else { f + 1.0 };
    if r == 0.0 && v.is_sign_negative() {
        -0.0
    } else {
        r
    }
}
fn smooth(v: f64) -> f64 {
    let v = clamp(v, 0.0, 1.0);
    v * v * (3.0 - 2.0 * v)
}
use portable_math::{atan, atan2, cos, exp, log, pow, sin};
fn hypot(x: f64, y: f64) -> f64 {
    portable_math::hypot(&[x, y])
}
fn hash(seed: f64, k: f64) -> f64 {
    let mut x = ((seed as u64 as u32)
        ^ ((k as i64 as u32).wrapping_add(1).wrapping_mul(0x9e3779b9)))
    .wrapping_mul(0x85ebca6b);
    x ^= x >> 13;
    x.wrapping_mul(0xc2b2ae35) as f64 / 4294967296.0
}
fn strength(power: f64, size: Option<f64>, natural: f64) -> f64 {
    let Some(size) = size else {
        return 1.0;
    };
    if !(size > natural) || natural <= 0.0 {
        return 1.0;
    }
    let floor = portable_math::sqrt(natural / size);
    floor + (1.0 - floor) * pow(clamp(power, 0.0, 100.0) / 100.0, 1.2)
}
fn tempered(before: f64, after: f64, k: f64) -> f64 {
    if k >= 1.0 {
        return after;
    }
    let d = after - before;
    if d.abs() < 0.5 {
        return before + d * k;
    }
    let scaled = d * k;
    before
        + if scaled.abs() >= 1.0 {
            scaled
        } else {
            d.signum()
        }
}
trait Fields {
    fn number(&self, k: &str) -> f64;
    fn text(&self, k: &str) -> &str;
    fn flag(&self, k: &str) -> bool;
    fn put(&mut self, k: &str, x: f64);
}
impl Fields for V {
    fn number(&self, k: &str) -> f64 {
        self[k].as_f64().unwrap_or(f64::NAN)
    }
    fn text(&self, k: &str) -> &str {
        self[k].as_str().unwrap_or("")
    }
    fn flag(&self, k: &str) -> bool {
        self[k].as_bool().unwrap_or(false)
    }
    fn put(&mut self, k: &str, x: f64) {
        self[k] = json!(x);
    }
}
#[inline]
fn n<T: Fields>(v: &T, k: &str) -> f64 {
    v.number(k)
}
fn num(v: &V) -> f64 {
    v.as_f64().unwrap_or(f64::NAN)
}
#[inline]
fn s<'a, T: Fields>(v: &'a T, k: &str) -> &'a str {
    v.text(k)
}
#[inline]
fn boolean<T: Fields>(v: &T, k: &str) -> bool {
    v.flag(k)
}
fn arr(v: &V) -> &[V] {
    v.as_array().map_or(&[], |a| a.as_slice())
}
fn floats(v: &V) -> Vec<f64> {
    arr(v).iter().map(num).collect()
}
#[inline]
fn setn<T: Fields>(v: &mut T, k: &str, x: f64) {
    v.put(k, x);
}
#[derive(Clone)]
struct Settings {
    power: f64,
    seed: f64,
    floor: Option<f64>,
    size: Option<f64>,
    walls: String,
    centre: String,
    debris: String,
    mode: String,
    shape: String,
    summit: String,
    flows: String,
    scarp: String,
    rays: bool,
    ridges: bool,
}
impl Settings {
    fn from(v: &V) -> Self {
        Self {
            power: n(v, "power"),
            seed: n(v, "seed"),
            floor: v["floor"].as_f64(),
            size: v["size"].as_f64(),
            walls: s(v, "walls").into(),
            centre: s(v, "centre").into(),
            debris: s(v, "debris").into(),
            mode: s(v, "mode").into(),
            shape: s(v, "shape").into(),
            summit: s(v, "summit").into(),
            flows: s(v, "flows").into(),
            scarp: s(v, "scarp").into(),
            rays: boolean(v, "rays"),
            ridges: boolean(v, "ridges"),
        }
    }
}
impl Fields for Settings {
    #[inline]
    fn number(&self, k: &str) -> f64 {
        match k {
            "power" => self.power,
            "seed" => self.seed,
            "floor" => self.floor.unwrap_or(f64::NAN),
            _ => f64::NAN,
        }
    }
    #[inline]
    fn text(&self, k: &str) -> &str {
        match k {
            "walls" => &self.walls,
            "centre" => &self.centre,
            "debris" => &self.debris,
            "mode" => &self.mode,
            "shape" => &self.shape,
            "summit" => &self.summit,
            "flows" => &self.flows,
            "scarp" => &self.scarp,
            _ => "",
        }
    }
    #[inline]
    fn flag(&self, k: &str) -> bool {
        match k {
            "rays" => self.rays,
            "ridges" => self.ridges,
            _ => false,
        }
    }
    fn put(&mut self, _: &str, _: f64) {
        unreachable!()
    }
}
#[derive(Clone)]
struct Entity {
    id_key: usize,
    slot: u32,
    id: std::sync::Arc<str>,
    template: std::sync::Arc<str>,
    owner: std::sync::Arc<str>,
    orientation: std::sync::Arc<str>,
    x: f64,
    y: f64,
    z: f64,
    sx: f64,
    sy: f64,
    flippable: bool,
    flipped: bool,
    dead: bool,
    raw_removed: bool,
    source_plain: f64,
    source_raw: f64,
    delayed_plain: bool,
    delayed_raw: bool,
    new_source: Option<f64>,
    has_raw: bool,
    source_normalized: bool,
    metadata: Option<std::sync::Arc<V>>,
    plain_metadata: Option<std::sync::Arc<V>>,
    plain: bool,
}
// Metadata components are read once at map import, including raw-vs-edited forms.
fn json_number(v: &V) -> f64 {
    if v.is_object() {
        num(&v["value"])
    } else {
        v.as_f64().unwrap_or(0.0)
    }
}
fn component_strength(v: &V) -> f64 {
    let a = &v["components"]["WaterSource"];
    let b = &v["before"]["WaterSource"];
    let c = if v["components"].get("WaterSource").is_some() {
        a
    } else {
        b
    };
    json_number(&c["SpecifiedStrength"])
}
fn component_delayed(v: &V) -> bool {
    let a = &v["components"]["TimeActivatedComponent"];
    let b = &v["before"]["TimeActivatedComponent"];
    let c = if v["components"].get("TimeActivatedComponent").is_some() {
        a
    } else {
        b
    };
    c["IsEnabled"] == V::Bool(true)
}
impl Entity {
    fn from(v: &V, fp: &V, slot: u32) -> Self {
        let f = &fp[s(v, "template")];
        Self {
            slot,
            id_key: slot as usize,
            id: s(v, "id").into(),
            template: s(v, "template").into(),
            owner: s(v, "owner").into(),
            orientation: s(v, "orientation").into(),
            x: n(v, "x"),
            y: n(v, "y"),
            z: n(v, "z"),
            sx: f["size"][0].as_f64().unwrap_or(1.0),
            sy: f["size"][1].as_f64().unwrap_or(1.0),
            flippable: boolean(f, "flippable"),
            flipped: boolean(v, "flipped"),
            dead: false,
            raw_removed: false,
            source_plain: component_strength(v),
            source_raw: component_strength(&json!({"components":v["raw"]["Components"]})),
            delayed_plain: component_delayed(v),
            delayed_raw: v["raw"]["Components"]["TimeActivatedComponent"]["IsEnabled"]
                == V::Bool(true),
            new_source: None,
            has_raw: v["raw"].is_object(),
            source_normalized: false,
            metadata: Some(std::sync::Arc::new(v.clone())),
            plain_metadata: Some(std::sync::Arc::new(v.clone())),
            plain: false,
        }
    }
    fn value(&self) -> V {
        let mut v = if let Some(strength) = self.new_source {
            json!({"id":self.id.as_ref(),"owner":"placed","template":"WaterSource","x":self.x,"y":self.y,"z":self.z,"orientation":"Cw0","flipped":false,
                "before":{"WaterSource":{"SpecifiedStrength":{"value":strength},"CurrentStrength":{"value":strength}}},
                "components":{"TimeActivatedComponent":{"IsEnabled":false,"CyclesUntilCountdownActivation":5,"DaysUntilActivation":{"value":10},"DaysPassed":{"value":0}}}})
        } else {
            (if self.plain {
                &self.plain_metadata
            } else {
                &self.metadata
            })
            .as_ref()
            .expect("imported entity metadata")
            .as_ref()
            .clone()
        };
        if self.new_source.is_some() {
            v["owner"] = json!(self.owner.as_ref());
            if self.source_normalized {
                v["before"]["WaterSource"]["SpecifiedStrength"] = json!(self.source_plain);
                v["before"]["WaterSource"]["CurrentStrength"] = json!(self.source_plain);
                v["components"]["TimeActivatedComponent"]["DaysUntilActivation"] = json!(10);
                v["components"]["TimeActivatedComponent"]["DaysPassed"] = json!(0);
            }
        }
        setn(&mut v, "x", self.x);
        setn(&mut v, "y", self.y);
        setn(&mut v, "z", self.z);
        if self.dead {
            if !v["components"].is_object() {
                v["components"] = json!({});
            }
            v["components"]["LivingNaturalResource"] = json!({"IsDead":true});
        }
        if self.raw_removed {
            v.as_object_mut().unwrap().shift_remove("raw");
        }
        v
    }
}
impl Fields for Entity {
    #[inline]
    fn number(&self, k: &str) -> f64 {
        match k {
            "x" => self.x,
            "y" => self.y,
            "z" => self.z,
            _ => f64::NAN,
        }
    }
    #[inline]
    fn text(&self, k: &str) -> &str {
        match k {
            "id" => &self.id,
            "template" => &self.template,
            "owner" => &self.owner,
            "orientation" => &self.orientation,
            _ => "",
        }
    }
    #[inline]
    fn flag(&self, k: &str) -> bool {
        k == "flipped" && self.flipped
    }
    #[inline]
    fn put(&mut self, k: &str, x: f64) {
        match k {
            "x" => self.x = x,
            "y" => self.y = x,
            "z" => self.z = x,
            _ => unreachable!(),
        }
    }
}
#[derive(Clone)]
struct Fallen {
    id_key: usize,
    slot: u32,
    id: std::sync::Arc<str>,
    x: f64,
    y: f64,
    z: f64,
    dx: f64,
    dy: f64,
    length: f64,
    metadata: Option<std::sync::Arc<V>>,
}
impl Fallen {
    fn from(v: &V) -> Self {
        Self {
            id: s(v, "id").into(),
            id_key: 0,
            slot: 0,
            x: n(v, "x"),
            y: n(v, "y"),
            z: n(v, "z"),
            dx: n(v, "dx"),
            dy: n(v, "dy"),
            length: n(v, "length"),
            metadata: Some(std::sync::Arc::new(v.clone())),
        }
    }
    fn value(&self) -> V {
        let mut v = self
            .metadata
            .as_ref()
            .map(|v| v.as_ref().clone())
            .unwrap_or_else(
                || json!({"id":self.id.as_ref(),"dx":self.dx,"dy":self.dy,"length":self.length}),
            );
        setn(&mut v, "x", self.x);
        setn(&mut v, "y", self.y);
        setn(&mut v, "z", self.z);
        v
    }
}
impl Fields for Fallen {
    #[inline]
    fn number(&self, k: &str) -> f64 {
        match k {
            "x" => self.x,
            "y" => self.y,
            "z" => self.z,
            "dx" => self.dx,
            "dy" => self.dy,
            _ => f64::NAN,
        }
    }
    #[inline]
    fn text(&self, k: &str) -> &str {
        if k == "id" {
            &self.id
        } else {
            ""
        }
    }
    fn flag(&self, _: &str) -> bool {
        false
    }
    #[inline]
    fn put(&mut self, k: &str, x: f64) {
        match k {
            "x" => self.x = x,
            "y" => self.y = x,
            "z" => self.z = x,
            _ => unreachable!(),
        }
    }
}
fn mask(h: u8) -> u32 {
    1u32.wrapping_shl(h as u32).wrapping_sub(1)
}
fn emitter(t: &str) -> bool {
    matches!(
        t,
        "WaterSource"
            | "BadwaterSource"
            | "WaterSeep"
            | "BadwaterSeep"
            | "Aquifer"
            | "BadtideDrain"
    )
}
fn plant(t: &str) -> bool {
    matches!(t, "Pine" | "Birch" | "Oak" | "Succulent" | "BlueberryBush")
}
#[derive(Clone)]
struct Map {
    error: u32,
    next_id: std::cell::Cell<usize>,
    next_slot: std::cell::Cell<u32>,
    id_names: std::cell::RefCell<Vec<std::sync::Arc<str>>>,
    w: usize,
    h: usize,
    heights: Vec<u8>,
    lava: Vec<u32>,
    rock: Vec<f64>,
    depth: Vec<f64>,
    contamination: Vec<f64>,
    entities: Vec<Entity>,
    fallen: Vec<Fallen>,
    base: std::sync::Arc<V>,
    ceiling: f64,
    initial_rock_len: usize,
    used_ids: std::collections::HashSet<std::sync::Arc<str>>,
}
impl Map {
    fn from(v: &V, fp: &V) -> Self {
        let mut m = Self {
            initial_rock_len: v["_rockLength"].as_f64().map_or(arr(&v["rockLayers"]).len(), |v| v as usize),
            used_ids: arr(&v["usedIds"]).iter().filter_map(|v| v.as_str().map(Into::into)).collect(),
            error: 0,
            next_id: std::cell::Cell::new(0),
            next_slot: std::cell::Cell::new(0),
            id_names: std::cell::RefCell::new(vec![]),
            w: n(v, "W") as usize,
            h: n(v, "H") as usize,
            heights: arr(&v["heights"]).iter().map(|v| num(v) as u8).collect(),
            lava: arr(&v["lava"]).iter().map(|v| num(v) as u32).collect(),
            rock: floats(&v["rockLayers"]),
            depth: floats(&v["water"]["depth"]),
            contamination: floats(&v["water"]["contamination"]),
            entities: arr(&v["entities"])
                .iter()
                .enumerate()
                .map(|(i, e)| Entity::from(e, fp, i as u32))
                .collect(),
            fallen: arr(&v["fallen"]).iter().map(Fallen::from).collect(),
            base: std::sync::Arc::new(V::Object(
                v.as_object()
                    .unwrap()
                    .iter()
                    .filter(|(k, _)| {
                        !matches!(
                            k.as_str(),
                            "heights" | "lava" | "entities" | "fallen" | "water" | "_plainEntities" | "_rockLength"
                        )
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            )),
            ceiling: n(v, "maxHeight"),
        };
        // Intern identifiers once on the cold import path. Planners use integer
        // keys and flat lookup arrays, preserving last-duplicate-wins semantics.
        let mut ids: HashMap<std::sync::Arc<str>, usize> = HashMap::new();
        for e in &mut m.entities {
            if let Some(plain) = v["_plainEntities"].get(e.slot as usize) {
                e.plain_metadata = Some(std::sync::Arc::new(plain.clone()));
            }
            let next = ids.len();
            e.id_key = *ids.entry(e.id.clone()).or_insert(next);
        }
        for f in &mut m.fallen {
            let next = ids.len();
            f.id_key = *ids.entry(f.id.clone()).or_insert(next);
        }
        m.next_id.set(ids.len());
        let mut names = vec![std::sync::Arc::<str>::from(""); ids.len()];
        for (id, key) in ids {
            names[key] = id;
        }
        m.id_names.replace(names);
        let mut next_slot = m.entities.len() as u32;
        let mut slots: HashMap<std::sync::Arc<str>, u32> = HashMap::new();
        for e in &m.entities {
            slots.entry(e.id.clone()).or_insert(e.slot);
        }
        for f in &mut m.fallen {
            f.slot = *slots.entry(f.id.clone()).or_insert_with(|| {
                let slot = next_slot;
                next_slot += 1;
                slot
            });
        }
        m.next_slot.set(next_slot);
        m
    }
    fn value(&self) -> V {
        let mut v = self.base.as_ref().clone();
        v["heights"] = json!(self.heights);
        v["lava"] = json!(self.lava);
        v["rockLayers"] = json!(self.rock);
        v["entities"] = json!(self.entities.iter().map(Entity::value).collect::<Vec<_>>());
        v["fallen"] = json!(self.fallen.iter().map(Fallen::value).collect::<Vec<_>>());
        v["water"] = json!({"depth":self.depth,"contamination":self.contamination});
        v
    }
    fn at(&self, x: f64, y: f64) -> usize {
        (clamp(round(y), 0.0, (self.h - 1) as f64) as usize) * self.w
            + clamp(round(x), 0.0, (self.w - 1) as f64) as usize
    }
    fn footprint(&self, e: &Entity, margin: i32) -> Vec<usize> {
        let sx = e.sx as i32;
        let sy = e.sy as i32;
        let mut out = vec![];
        for y in -margin..sy + margin {
            for lx in -margin..sx + margin {
                let x = if boolean(e, "flipped") && e.flippable {
                    sx - 1 - lx
                } else {
                    lx
                };
                let (dx, dy) = match s(e, "orientation") {
                    "Cw90" => (y, -x),
                    "Cw180" => (-x, -y),
                    "Cw270" => (-y, x),
                    _ => (x, y),
                };
                let xx = n(e, "x") + dx as f64;
                let yy = n(e, "y") + dy as f64;
                if xx >= 0.0 && yy >= 0.0 && xx < self.w as f64 && yy < self.h as f64 {
                    out.push(yy as usize * self.w + xx as usize);
                }
            }
        }
        out
    }
    fn dead(&mut self, e: &mut Entity, x: f64, y: f64) {
        let tile = n(e, "y") as usize * self.w + n(e, "x") as usize;
        let d = hypot(n(e, "x") - x, n(e, "y") - y);
        let d = if d == 0.0 { 1.0 } else { d };
        self.fallen.retain(|v| v.id_key != e.id_key);
        self.fallen.push(Fallen {
            id_key: e.id_key,
            slot: e.slot,
            id: e.id.clone(),
            x: e.x + 0.5,
            y: e.y + 0.5,
            z: self.heights[tile] as f64,
            dx: (e.x - x) / d,
            dy: (e.y - y) / d,
            length: if s(e, "template") == "Oak" { 2.6 } else { 2.0 },
            metadata: None,
        });
        e.dead = true;
        e.raw_removed = true;
    }
    fn finalize(&mut self, before: &Map, settings: &Settings, keep: &[u8]) {
        let floor = clamp(
            round(settings.floor.filter(|x| x.is_finite()).unwrap_or(1.0)),
            1.0,
            22.0,
        );
        for i in 0..self.heights.len() {
            if (self.heights[i] as f64) < floor && self.heights[i] < before.heights[i] {
                self.heights[i] = min(before.heights[i] as f64, floor) as u8;
            }
            self.lava[i] &= mask(self.heights[i]);
            if keep.get(i).copied().unwrap_or(0) != 0 {
                self.heights[i] = before.heights[i];
                self.lava[i] = before.lava[i];
            }
        }
        respect_keep(before, self, keep);
        let extent = id_extent(before, self);
        let mut was = vec![false; extent];
        for f in &before.fallen {
            was[f.id_key] = true;
        }
        let at = entity_index(self, extent);
        let mut gone = vec![false; extent];
        for f in &self.fallen {
            if was[f.id_key] {
                continue;
            }
            let slot = at[f.id_key];
            if slot != usize::MAX {
                let e = &self.entities[slot];
                let i = e.y as usize * self.w + e.x as usize;
                if self.heights[i] != before.heights[i] {
                    gone[e.id_key] = true;
                }
            }
        }
        self.entities.retain(|v| !gone[v.id_key]);
        self.fallen.retain(|v| !gone[v.id_key]);
    }
}
struct Reader<'a> {
    data: &'a [u8],
    at: usize,
}
impl Reader<'_> {
    fn take(&mut self, n: usize) -> &[u8] {
        let i = self.at;
        self.at += n;
        &self.data[i..i + n]
    }
    fn u32(&mut self) -> u32 {
        u32::from_le_bytes(self.take(4).try_into().unwrap())
    }
    fn text(&mut self) -> String {
        let n = self.u32() as usize;
        String::from_utf8(self.take(n).to_vec()).unwrap()
    }
    fn value(&mut self) -> V {
        let tag = self.take(1)[0];
        match tag {
            0 => V::Null,
            1 => json!(false),
            2 => json!(true),
            3 => json!(f64::from_le_bytes(self.take(8).try_into().unwrap())),
            4 => json!(self.text()),
            5 => {
                let n = self.u32();
                V::Array((0..n).map(|_| self.value()).collect())
            }
            6 => {
                let n = self.u32();
                let mut m = json::Map::new();
                for _ in 0..n {
                    let k = self.text();
                    m.insert(k, self.value());
                }
                V::Object(m)
            }
            _ => panic!("protocol tag"),
        }
    }
}
fn write_text(out: &mut Vec<u8>, s: &str) {
    out.extend((s.len() as u32).to_le_bytes());
    out.extend(s.as_bytes());
}
fn write_value(out: &mut Vec<u8>, v: &V) {
    match v {
        V::Null => out.push(0),
        V::Bool(x) => out.push(if *x { 2 } else { 1 }),
        V::Number(x) => {
            out.push(3);
            out.extend(x.as_f64().unwrap().to_le_bytes());
        }
        V::String(x) => {
            out.push(4);
            write_text(out, x);
        }
        V::Array(a) => {
            out.push(5);
            out.extend((a.len() as u32).to_le_bytes());
            for v in a {
                write_value(out, v);
            }
        }
        V::Object(m) => {
            out.push(6);
            out.extend((m.len() as u32).to_le_bytes());
            let mut keys: Vec<_> = m.keys().collect();
            keys.sort();
            for k in keys {
                write_text(out, k);
                write_value(out, &m[k]);
            }
        }
    }
}
enum Records {
    Glaciate(Box<GlacierPlan>),
    Carve(Box<CarveRecords>),
    Footprint {
        offsets: Vec<u32>,
        tiles: Vec<u32>,
    },
    Crater {
        anatomy: Crater,
        stats: [f64; 5],
        strength: f64,
        keep: Vec<u8>,
        arrival: Vec<f32>,
    },
    Erupt {
        anatomy: Volcano,
        stats: [f64; 5],
        strength: f64,
        keep: Vec<u8>,
        flows: Vec<f32>,
        heat: Vec<u8>,
    },
    Quake {
        fault: Fault,
        stats: [f64; 8],
        arrival: Vec<f32>,
        dx: Vec<i16>,
        dy: Vec<i16>,
        source: Vec<u32>,
        total: f64,
        extras: Vec<u32>,
        final_depth: Vec<f64>,
        final_contamination: Vec<f64>,
    },
}
struct Plan {
    before: Option<Map>,
    before_objects: Vec<f64>,
    before_fallen: Vec<f64>,
    map: Map,
    raw: Option<Map>,
    records: Records,
    literal: Literal,
    geometry: Vec<f64>,
    objects: Vec<u32>,
    fallen: Vec<f64>,
    raw_objects: Vec<f64>,
    raw_fallen: Vec<f64>,
    step_objects: Vec<f64>,
    closure_objects: Vec<f64>,
    closure_fallen: Vec<f64>,
    literal_objects: Vec<f64>,
}
impl Plan {
    // Cold, complete diagnostic serialization. Never called by forces_plan.
    fn value(&self) -> V {
        let mut out = match &self.records {
            Records::Glaciate(r) => r.value(),
            Records::Carve(r) => r.value(),
            Records::Footprint { offsets, tiles } => {
                return json!(offsets
                    .windows(2)
                    .map(|r| tiles[r[0] as usize..r[1] as usize].to_vec())
                    .collect::<Vec<_>>())
            }
            Records::Crater {
                anatomy,
                stats,
                strength,
                keep,
                arrival,
            } => {
                json!({"anatomy":anatomy.value(),"stats":{"cut":stats[0],"raised":stats[1],"changed":stats[2],"erased":stats[3],"flattened":stats[4]},"strength":strength,"keep":keep,"arrival":arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),"total":11})
            }
            Records::Erupt {
                anatomy,
                stats,
                strength,
                keep,
                flows,
                heat,
            } => {
                json!({"anatomy":anatomy.value(),"stats":{"raised":stats[0],"changed":stats[1],"flattened":stats[2],"erased":stats[3],"hard":stats[4]},"strength":strength,"keep":keep,"flows":flows.iter().map(|&v|v as f64).collect::<Vec<_>>(),"heat":heat,"total":30})
            }
            Records::Quake {
                fault,
                stats,
                arrival,
                dx,
                dy,
                source,
                total,
                extras,
                final_depth,
                final_contamination,
            } => {
                json!({"fault":fault.value(),"stats":{"changed":stats[0],"raised":stats[1],"dropped":stats[2],"moved":stats[3],"toppled":stats[4],"channel":stats[5],"transported":stats[6],"fullOffset":stats[7]},"arrival":arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),"dx":dx,"dy":dy,"source":source,"total":total,"extras":extras.chunks_exact(2).map(|v|json!({"i":v[0],"at":v[1]})).collect::<Vec<_>>(),"finalWater":{"depth":final_depth,"contamination":final_contamination}})
            }
        };
        out["raw"] = self.raw.as_ref().unwrap().value();
        out["map"] = self.map.value();
        out["literal"] = self.literal.value();
        out
    }
}

pub struct Job {
    error: u32,
    baseline: Map,
    live: Option<Map>,
    keep: Vec<u8>,
    output: Option<Plan>,
    command: Box<[f64; 44]>,
    carve_options: CarveOptions,
    command_bytes: Vec<u8>,
    path: Vec<f64>,
    object_x: Vec<f64>,
    object_y: Vec<f64>,
    object_z: Vec<f64>,
    object_flags: Vec<u32>,
    id_registry: Vec<std::sync::Arc<str>>,
    id_offsets: Vec<u32>,
    id_bytes: Vec<u8>,
    source_strength: Vec<f64>,
    source_kind: Vec<u8>,
    descriptor: Box<[usize; 136]>,
}
pub fn prepare(input: &[u8]) -> Job {
    let mut r = Reader { data: input, at: 0 };
    let mut job = r.value();
    assert_eq!(r.at, input.len());
    if job["plainEntities"].is_array() {
        job["map"]["_plainEntities"] = job["plainEntities"].clone();
    }
    let map = Map::from(&job["map"], &job["footprints"]);
    let keep = arr(&job["keep"]).iter().map(|v| num(v) as u8).collect();
    for key in ["map", "footprints", "keep"] {
        job.as_object_mut().unwrap().shift_remove(key);
    }
    let settings = Settings::from(&job["settings"]);
    let intent = Intent::from(&job["intent"]);
    let opcode = match s(&job, "verb") {
        "footprint" => 0.0,
        "craterize" => 1.0,
        "erupt" => 2.0,
        "quake" => 3.0,
        "carve" => 4.0,
        "glaciate" => 5.0,
        _ => panic!("force not ported"),
    };
    let index =
        |v: &str, choices: &[&str]| choices.iter().position(|&x| x == v).unwrap_or(0) as f64;
    let cs = CarveSettings::from(&job["settings"]);
    let mut command = Box::new([
        opcode,
        settings.power,
        settings.size.unwrap_or(f64::NAN),
        settings.seed,
        settings.floor.unwrap_or(f64::NAN),
        index(&settings.walls, &["steep", "terraced"]),
        index(&settings.centre, &["auto", "bowl", "peak", "ring", "flat"]),
        (settings.debris == "heavy") as u8 as f64,
        settings.rays as u8 as f64,
        matches!(settings.mode.as_str(), "aim" | "fissure" | "slide") as u8 as f64,
        (settings.shape == "steep") as u8 as f64,
        index(&settings.summit, &["auto", "peak", "crater", "caldera"]),
        (settings.flows == "heavy") as u8 as f64,
        settings.ridges as u8 as f64,
        (settings.scarp == "stepped") as u8 as f64,
        intent.origin,
        intent.end,
        intent.side,
        job["margin"].as_f64().unwrap_or(0.0),
        intent.path.len() as f64,
        0.0,
        0.0,
        0.0,
        0.0,
        cs.wander,
        cs.width.unwrap_or(f64::NAN),
        cs.depth.unwrap_or(f64::NAN),
        cs.banks,
        cs.river_depth.unwrap_or(f64::NAN),
        cs.wide as u8 as f64,
        cs.defy as u8 as f64,
        cs.dry as u8 as f64,
        cs.layers as u8 as f64,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
    ]);
    command[33] = map.w as f64;
    command[21] = (job["options"]["finish"].as_bool() == Some(false)) as u8 as f64;
    command[34] = boolean(&job["settings"], "meltwater") as u8 as f64;
    command[35] = index(
        job["settings"]["benches"].as_str().unwrap_or("some"),
        &["none", "some", "many"],
    );
    command[36] = index(
        job["settings"]["steps"].as_str().unwrap_or("some"),
        &["few", "some", "many"],
    );
    command[37] = job["settings"]["tarn"].as_bool().unwrap_or(true) as u8 as f64;
    command[38] = job["settings"]["scree"].as_bool().unwrap_or(true) as u8 as f64;
    let mut path = vec![0.0; 2048.max(intent.path.len() * 2)];
    for (i, p) in intent.path.iter().enumerate() {
        path[2 * i] = p.x;
        path[2 * i + 1] = p.y;
    }
    if opcode >= 4.0 {
        command[20] = job["intent"]["via"].is_array() as u8 as f64;
        command[19] = intent.via.len() as f64;
        for (i, &tile) in intent.via.iter().enumerate() {
            path[2 * i] = (tile % map.w) as f64;
            path[2 * i + 1] = (tile / map.w) as f64;
        }
    }
    let id_registry = map_ids(&map);
    let mut task = Job {
        error: 0,
        baseline: map.clone(),
        object_x: map.entities.iter().map(|e| e.x).collect(),
        object_y: map.entities.iter().map(|e| e.y).collect(),
        object_z: map.entities.iter().map(|e| e.z).collect(),
        object_flags: vec![0; map.entities.len()],
        id_offsets: vec![],
        id_bytes: vec![],
        id_registry,
        source_strength: vec![],
        source_kind: vec![],
        live: Some(map),
        keep,
        output: None,
        command,
        carve_options: CarveOptions {
            source_id: job["options"]["sourceId"].as_str().map(str::to_owned),
            unleashed: job["options"]["unleashed"].as_str().map(str::to_owned),
            bad: boolean(&job["options"], "bad"),
        },
        command_bytes: vec![0; 4096],
        path,
        descriptor: Box::new([0; 136]),
    };
    refresh_id_bytes(&mut task);
    describe(&mut task);
    task
}
// Test/benchmark fixture reset, explicitly OUTSIDE the timed operation. Adoption
// writes the retained live views instead; it never resets or serializes per gesture.
pub fn reset(task: &mut Job) {
    if let Some(p) = task.output.take() {
        task.live = Some(p.map);
    }
    let m = task.live.as_mut().unwrap();
    let b = &task.baseline;
    m.next_id.set(b.next_id.get());
    m.next_slot.set(b.next_slot.get());
    m.id_names.replace(b.id_names.borrow().clone());
    m.error = 0;
    task.error = 0;
    m.heights.copy_from_slice(&b.heights);
    m.lava.copy_from_slice(&b.lava);
    m.depth.copy_from_slice(&b.depth);
    m.contamination.copy_from_slice(&b.contamination);
    m.rock.copy_from_slice(&b.rock);
    m.entities.clone_from(&b.entities);
    m.fallen.clone_from(&b.fallen);
    for e in &m.entities {
        let i = e.slot as usize;
        task.object_x[i] = e.x;
        task.object_y[i] = e.y;
        task.object_z[i] = e.z;
        task.object_flags[i] = 0;
    }
    task.id_registry = map_ids(b);
    refresh_id_bytes(task);
    describe(task);
}
fn map_ids(m: &Map) -> Vec<std::sync::Arc<str>> {
    let mut ids = vec![std::sync::Arc::<str>::from(""); m.next_slot.get() as usize];
    for e in &m.entities {
        ids[e.slot as usize] = e.id.clone();
    }
    for f in &m.fallen {
        ids[f.slot as usize] = f.id.clone();
    }
    ids
}
fn refresh_id_bytes(task: &mut Job) {
    task.id_offsets.clear();
    task.id_bytes.clear();
    task.id_offsets.push(0);
    for id in &task.id_registry {
        task.id_bytes.extend_from_slice(id.as_bytes());
        task.id_offsets.push(task.id_bytes.len() as u32);
    }
}
const FORCE_ERRORS: [&str; 27] = [
    "",
    "Invalid impact settings",
    "Strike on the map",
    "Drag across the map to aim",
    "Invalid eruption settings",
    "Choose land on the map",
    "Draw a fissure on the land",
    "Draw a longer fissure",
    "Invalid quake settings",
    "Draw a fault on the land",
    "No room for objects to move",
    "Invalid carve settings",
    "Invalid character settings",
    "Choose a different end point",
    "A drawn path needs an aimed carve, on the map",
    "Choose a point on the land showing",
    "The end point is uphill of the start",
    "At the map floor: no ground left to carve",
    "a glacier's power is 0 to 100",
    "a glacier's size is 4 to 64 tiles, or null (it follows Power)",
    "a glacier's seed is a whole number from 0 to 4294967295",
    "the glacier's head is off the map",
    "an aimed glacier needs its end on the map",
    "only an aimed glacier follows a drawn path",
    "a glacier's path is up to 128 tiles on the map",
    "a glacier's path moves on from each of its tiles to the next",
    "No room to rise here",
];
fn operation_problem(m: &Map, c: &[f64; 44], path: &[f64], keep: &[u8]) -> u32 {
    let opcode = c[0] as u32;
    let bounded = |v: f64, lo: f64, hi: f64| v.is_finite() && v >= lo && v <= hi;
    let whole = |v: f64, lo: f64, hi: f64| bounded(v, lo, hi) && v == v.floor();
    let tile = |v: f64| whole(v, 0.0, (m.w * m.h - 1) as f64);
    let power = bounded(c[1], 0.0, 100.0);
    let seed = whole(c[3], 0.0, u32::MAX as f64);
    let points = c[19] as usize;
    let goodpath = points >= 2
        && points <= 512
        && points * 2 <= path.len()
        && path[..points * 2]
            .chunks_exact(2)
            .all(|p| bounded(p[0], 0.0, m.w as f64 - 1.0) && bounded(p[1], 0.0, m.h as f64 - 1.0));
    match opcode {
        0 => 0,
        1 => {
            if !power
                || !seed
                || !(c[2].is_nan() || bounded(c[2], 4.0, 180.0))
                || !whole(c[6], 0.0, 4.0)
            {
                1
            } else if !tile(c[15]) {
                2
            } else if c[9] != 0.0 && !tile(c[16]) {
                3
            } else {
                0
            }
        }
        2 => {
            if !power
                || !seed
                || !(c[2].is_nan() || bounded(c[2], 6.0, 140.0))
                || !whole(c[11], 0.0, 3.0)
            {
                4
            } else if !tile(c[15]) {
                5
            } else if c[9] != 0.0 && !goodpath {
                6
            } else if c[9] != 0.0
                && path[..points * 2]
                    .chunks_exact(2)
                    .collect::<Vec<_>>()
                    .windows(2)
                    .fold(0.0, |a, p| a + hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]))
                    < 3.0
            {
                7
            } else {
                0
            }
        }
        3 => {
            if !power || !seed {
                8
            } else if !goodpath || !(c[17] == 1.0 || c[17] == -1.0) {
                9
            } else {
                0
            }
        }
        4 => {
            if !power || !tile(c[15]) {
                return 11;
            }
            if !seed
                || !bounded(c[24], 0.0, 100.0)
                || !(c[25].is_nan() || bounded(c[25], 2.0, 24.0))
                || !(c[26].is_nan() || whole(c[26], 1.0, 12.0))
                || !(c[4].is_nan() || whole(c[4], 1.0, 22.0))
                || !(c[28].is_nan() || whole(c[28], 1.0, 22.0))
                || !bounded(c[27], 0.0, 10.0)
            {
                return 12;
            }
            if c[9] != 0.0 && (!tile(c[16]) || c[16] == c[15]) {
                return 13;
            }
            if points > 128
                || points * 2 > path.len()
                || (c[20] != 0.0 && c[9] == 0.0)
                || !path[..points * 2].chunks_exact(2).all(|p| {
                    whole(p[0], 0.0, m.w as f64 - 1.0) && whole(p[1], 0.0, m.h as f64 - 1.0)
                })
            {
                return 14;
            }
            if keep[c[15] as usize] != 0
                || (c[9] != 0.0 && keep[c[16] as usize] != 0)
                || path[..points * 2]
                    .chunks_exact(2)
                    .any(|p| keep[p[1] as usize * m.w + p[0] as usize] != 0)
            {
                return 15;
            }
            if c[9] != 0.0 && c[30] == 0.0 && m.heights[c[16] as usize] > m.heights[c[15] as usize]
            {
                return 16;
            }
            0
        }
        5 => {
            if !power {
                return 18;
            }
            if !(c[2].is_nan() || bounded(c[2], 4.0, 64.0)) {
                return 19;
            }
            if !seed {
                return 20;
            }
            if !tile(c[15]) {
                return 21;
            }
            if c[9] != 0.0 && (!tile(c[16]) || c[16] == c[15]) {
                return 22;
            }
            if c[20] != 0.0 && c[9] == 0.0 {
                return 23;
            }
            if points > 128
                || points * 2 > path.len()
                || !path[..points * 2].chunks_exact(2).all(|p| {
                    whole(p[0], 0.0, m.w as f64 - 1.0) && whole(p[1], 0.0, m.h as f64 - 1.0)
                })
            {
                return 24;
            }
            let mut previous = c[15] as usize;
            for p in path[..points * 2].chunks_exact(2) {
                let t = p[1] as usize * m.w + p[0] as usize;
                if t == previous {
                    return 25;
                }
                previous = t;
            }
            if points > 0 && previous == c[16] as usize {
                return 25;
            }
            0
        }
        _ => 11,
    }
}
pub fn plan(task: &mut Job) {
    let mut m = task
        .live
        .take()
        .unwrap_or_else(|| task.output.take().unwrap().map);
    for e in &mut m.entities {
        let i = e.slot as usize;
        e.x = task.object_x[i];
        e.y = task.object_y[i];
        e.z = task.object_z[i];
    }
    let c = &task.command;
    task.error = operation_problem(&m, c, &task.path, &task.keep);
    if task.error != 0 {
        task.live = Some(m);
        describe(task);
        return;
    }
    if c[0] == 0.0 {
        let mut offsets = vec![0];
        let mut tiles = vec![];
        for e in &m.entities {
            tiles.extend(m.footprint(e, c[18] as i32).into_iter().map(|i| i as u32));
            offsets.push(tiles.len() as u32);
        }
        task.output = Some(Plan {
            map: m,
            raw: None,
            records: Records::Footprint { offsets, tiles },
            literal: Literal::default(),
            geometry: vec![],
            objects: vec![],
            fallen: vec![],
            raw_objects: vec![],
            raw_fallen: vec![],
            step_objects: vec![],
            closure_objects: vec![],
            closure_fallen: vec![],
            literal_objects: vec![],
            before: None,
            before_objects: vec![],
            before_fallen: vec![],
        });
        output_views(task);
        describe(task);
        return;
    }
    let settings = Settings {
        power: c[1],
        size: if c[2].is_nan() { None } else { Some(c[2]) },
        seed: c[3],
        floor: if c[4].is_nan() { None } else { Some(c[4]) },
        walls: if c[5] == 1.0 { "terraced" } else { "steep" }.into(),
        centre: ["auto", "bowl", "peak", "ring", "flat"][c[6] as usize].into(),
        debris: if c[7] != 0.0 { "heavy" } else { "light" }.into(),
        rays: c[8] != 0.0,
        mode: match c[0] as u32 {
            1 => {
                if c[9] != 0.0 {
                    "aim"
                } else {
                    "strike"
                }
            }
            2 => {
                if c[9] != 0.0 {
                    "fissure"
                } else {
                    "vent"
                }
            }
            _ => {
                if c[9] != 0.0 {
                    "slide"
                } else {
                    "lift"
                }
            }
        }
        .into(),
        shape: if c[10] != 0.0 { "steep" } else { "broad" }.into(),
        summit: ["auto", "peak", "crater", "caldera"][c[11] as usize].into(),
        flows: if c[12] != 0.0 { "heavy" } else { "light" }.into(),
        ridges: c[13] != 0.0,
        scarp: if c[14] != 0.0 { "stepped" } else { "sheer" }.into(),
    };
    let count = c[19] as usize;
    assert!(count <= task.path.len() / 2);
    let intent = Intent {
        origin: c[15],
        end: c[16],
        side: c[17],
        path: task.path[..2 * count]
            .chunks_exact(2)
            .map(|p| Point { x: p[0], y: p[1] })
            .collect(),
        via: if c[0] >= 4.0 {
            task.path[..2 * count]
                .chunks_exact(2)
                .map(|p| p[1] as usize * m.w + p[0] as usize)
                .collect()
        } else {
            vec![]
        },
    };
    let before = m.clone();
    let mut p = match c[0] as u32 {
        1 => crater(&before, m, &settings, &intent, &task.keep),
        2 => eruption(&before, m, &settings, &intent, &task.keep),
        3 => quake(&before, m, &settings, &intent, &task.keep),
        4 => carve(
            &before,
            m,
            &CarveSettings {
                power: c[1],
                wander: c[24],
                width: if c[25].is_nan() { None } else { Some(c[25]) },
                depth: if c[26].is_nan() { None } else { Some(c[26]) },
                seed: c[3] as u32,
                aimed: c[9] != 0.0,
                wide: c[29] != 0.0,
                defy: c[30] != 0.0,
                dry: c[31] != 0.0,
                layers: c[32] != 0.0,
                floor: if c[4].is_nan() { 1.0 } else { c[4] },
                river_depth: if c[28].is_nan() { None } else { Some(c[28]) },
                banks: c[27],
            },
            &intent,
            &task.keep,
            if c[39] != 0.0 {
                let source = c[40] as usize;
                let unleashed = c[41] as usize;
                assert!(source + unleashed <= task.command_bytes.len());
                let text = |a, b| {
                    String::from_utf8(task.command_bytes[a..b].to_vec()).expect("UTF-8 command ID")
                };
                CarveOptions {
                    source_id: if c[43] as u32 & 1 != 0 {
                        Some(text(0, source))
                    } else {
                        None
                    },
                    unleashed: if c[43] as u32 & 2 != 0 {
                        Some(text(source, source + unleashed))
                    } else {
                        None
                    },
                    bad: c[42] != 0.0,
                }
            } else {
                task.carve_options.clone()
            },
        ),
        5 => glaciate(
            &before,
            m,
            &GlacierSettings {
                finish: true,
                power: c[1],
                size: if c[2].is_nan() { 30.0 } else { c[2] },
                seed: c[3] as u32,
                aimed: c[9] != 0.0,
                meltwater: c[34] != 0.0,
                benches: c[35] as u8,
                steps: c[36] as u8,
                tarn: c[37] != 0.0,
                scree: c[38] != 0.0,
                floor: if c[4].is_nan() { 1.0 } else { c[4] },
            },
            &intent,
            &task.keep,
        ),
        _ => panic!("force not ported"),
    };
    if p.map.error != 0 {
        task.error = p.map.error;
        let mut m = p.map;
        m.heights.copy_from_slice(&before.heights);
        m.lava.copy_from_slice(&before.lava);
        m.depth.copy_from_slice(&before.depth);
        m.contamination.copy_from_slice(&before.contamination);
        m.rock.copy_from_slice(&before.rock);
        m.entities = before.entities;
        m.fallen = before.fallen;
        m.next_id.set(before.next_id.get());
        m.next_slot.set(before.next_slot.get());
        m.id_names.replace(before.id_names.into_inner());
        m.error = 0;
        task.live = Some(m);
        describe(task);
        return;
    }
    p.literal = literal(&before, &p.map);
    p.before = Some(before);
    task.output = Some(p);
    output_views(task);
    describe(task);
}
fn entity_rows(es: &[Entity], ids: &mut Vec<std::sync::Arc<str>>, out: &mut Vec<f64>) {
    for e in es {
        let i = e.slot as usize;
        if ids.len() <= i {
            ids.resize(i + 1, "".into());
        }
        ids[i] = e.id.clone();
        out.extend([
            i as f64,
            e.x,
            e.y,
            e.z,
            (e.dead as u32 | ((e.raw_removed as u32) << 1) | ((e.plain as u32) << 3)) as f64,
            e.new_source.unwrap_or(0.0),
            if e.new_source.is_none() {
                0.0
            } else if e.source_normalized {
                if e.owner.as_ref() == "glaciate" {
                    2.0
                } else {
                    3.0
                }
            } else {
                1.0
            },
        ]);
    }
}
fn fallen_rows(fs: &[Fallen], ids: &mut Vec<std::sync::Arc<str>>, out: &mut Vec<f64>) {
    for f in fs {
        let i = f.slot as usize;
        if ids.len() <= i {
            ids.resize(i + 1, "".into());
        }
        ids[i] = f.id.clone();
        out.extend([i as f64, f.x, f.y, f.z, f.dx, f.dy, f.length]);
    }
}
fn output_views(task: &mut Job) {
    let p = task.output.as_mut().unwrap();
    if matches!(&p.records, Records::Footprint { .. }) {
        return;
    }
    let g = &mut p.geometry;
    match &p.records {
        Records::Glaciate(r) => {
            g.extend([
                50.0,
                r.path.len() as f64,
                r.reference.len() as f64,
                r.stream_path.len() as f64,
            ]);
            for q in &r.path {
                g.extend([q.x, q.y, q.s, q.r, q.floor, q.outlet]);
            }
            for q in &r.reference {
                g.extend([q.x, q.y]);
            }
            for q in &r.stream_path {
                g.extend([q.x, q.y]);
            }
            g.extend([
                r.retained.tiles.len() as f64,
                r.basins.len() as f64,
                r.hanging.len() as f64,
                r.joins.len() as f64,
                r.style.course as f64,
                r.style.skip as u8 as f64,
                r.visits as f64,
                r.reached as f64,
                r.floods as f64,
                r.flood_ticks as f64,
            ]);
            for k in 0..r.retained.tiles.len() {
                g.extend([
                    r.retained.tiles[k] as f64,
                    r.retained.floor[k],
                    r.retained.depth[k],
                    r.retained.contamination[k],
                ]);
            }
            for b in &r.basins {
                g.extend([
                    b.floor,
                    b.outlet,
                    b.depth,
                    b.fed as u8 as f64,
                    b.tiles.len() as f64,
                ]);
                g.extend(b.tiles.iter().map(|&v| v as f64));
            }
            for h in &r.hanging {
                g.extend([
                    h.mouth as f64,
                    h.landing as f64,
                    h.source.map_or(f64::NAN, |v| v as f64),
                    h.catchment as f64,
                    h.drop,
                    h.s,
                    h.wet as u8 as f64,
                    h.join_length,
                    h.channel.len() as f64,
                ]);
                g.extend(h.channel.iter().map(|&v| v as f64));
            }
            for j in &r.joins {
                g.extend([
                    GLACIER_JOIN_KINDS
                        .iter()
                        .position(|&v| v == j.kind)
                        .expect("join kind") as f64,
                    j.from as f64,
                    j.length,
                ]);
            }
        }
        Records::Carve(r) => {
            g.extend([r.total as f64, r.strength_depth.unwrap_or(f64::NAN)]);
        }
        Records::Footprint { .. } => {}
        Records::Crater {
            anatomy: a,
            strength,
            ..
        } => {
            let centre = ["auto", "bowl", "peak", "ring", "flat"]
                .iter()
                .position(|&x| x == a.centre)
                .unwrap() as f64;
            g.extend([
                a.x,
                a.y,
                a.w,
                a.h,
                a.inset,
                a.radius,
                a.a,
                a.b,
                a.angle,
                a.glance,
                a.diameter,
                a.depth,
                a.rim,
                a.datum,
                a.floor,
                centre,
                a.rays.len() as f64,
                *strength,
            ]);
            for r in &a.rays {
                g.extend([
                    r.dx,
                    r.dy,
                    r.start,
                    r.length,
                    r.width,
                    r.bend,
                    r.phase,
                    r.seed,
                    r.pits.len() as f64,
                ]);
                for &(x, y, r) in &r.pits {
                    g.extend([x, y, r]);
                }
            }
        }
        Records::Erupt {
            anatomy: a,
            strength,
            ..
        } => {
            let summit = ["auto", "peak", "crater", "caldera"]
                .iter()
                .position(|&x| x == a.summit)
                .unwrap() as f64;
            g.extend([
                a.x,
                a.y,
                a.datum,
                a.radius,
                a.height,
                summit,
                a.phase,
                a.length,
                a.scale,
                a.ceiling,
                a.vents.len() as f64,
                a.segments.len() as f64,
                a.lobes.len() as f64,
                *strength,
                a.asked.is_some() as u8 as f64,
                a.asked.map_or(0.0, |p| p.x),
                a.asked.map_or(0.0, |p| p.y),
            ]);
            for v in &a.vents {
                g.extend([v.x, v.y]);
            }
            for t in &a.segments {
                g.extend([t.a.x, t.a.y, t.b.x, t.b.y, t.length, t.along]);
            }
            for l in &a.lobes {
                g.extend([l.length, l.strength, l.points.len() as f64]);
                for q in &l.points {
                    g.extend([q.p.x, q.p.y, q.width]);
                }
            }
        }
        Records::Quake {
            fault: a, total, ..
        } => {
            g.extend([
                a.length,
                a.reach,
                a.lift,
                a.slide,
                a.heading.x,
                a.heading.y,
                *total,
                a.points.len() as f64,
                a.segments.len() as f64,
                a.directions.len() as f64,
            ]);
            for q in &a.points {
                g.extend([q.x, q.y]);
            }
            for q in &a.segments {
                g.extend([q.a.x, q.a.y, q.b.x, q.b.y, q.dx, q.dy, q.length, q.along]);
            }
            for q in &a.directions {
                g.extend([q.x, q.y]);
            }
        }
    }
    let count = p
        .map
        .entities
        .iter()
        .map(|e| e.slot as usize + 1)
        .max()
        .unwrap_or(0)
        .max(task.object_x.len());
    task.object_x.resize(count, 0.0);
    task.object_y.resize(count, 0.0);
    task.object_z.resize(count, 0.0);
    task.object_flags.resize(count, 0);
    task.object_flags.fill(4); // absent from the final object array
    let mut ids = &mut task.id_registry;
    if ids.len() < count {
        ids.resize(count, "".into());
    }
    task.source_strength.resize(count, 0.0);
    task.source_strength.fill(0.0);
    task.source_kind.resize(count, 0);
    task.source_kind.fill(0);
    for e in &p.map.entities {
        let i = e.slot as usize;
        task.object_x[i] = e.x;
        task.object_y[i] = e.y;
        task.object_z[i] = e.z;
        task.object_flags[i] =
            (e.dead as u32) | ((e.raw_removed as u32) << 1) | ((e.plain as u32) << 3);
        ids[i] = e.id.clone();
        if let Some(v) = e.new_source {
            task.source_strength[i] = v;
            task.source_kind[i] = if e.owner.as_ref() == "glaciate" {
                2
            } else if e.source_normalized {
                3
            } else {
                1
            };
        }
        p.objects.push(e.slot);
    }
    if let Some(raw) = &p.raw {
        entity_rows(&raw.entities, &mut ids, &mut p.raw_objects);
        fallen_rows(&raw.fallen, &mut ids, &mut p.raw_fallen);
    }
    if let Some(before) = &p.before {
        entity_rows(&before.entities, &mut ids, &mut p.before_objects);
        fallen_rows(&before.fallen, &mut ids, &mut p.before_fallen);
    }
    for f in &p.map.fallen {
        // Identity registry is the original object's slot. Detached fallen records
        // keep the same pose and imported metadata in the direct record interface.
        let slot = f.slot as f64;
        if ids.len() <= f.slot as usize {
            ids.resize(f.slot as usize + 1, "".into());
        }
        ids[f.slot as usize] = f.id.clone();
        p.fallen.extend([slot, f.x, f.y, f.z, f.dx, f.dy, f.length]);
    }
    if let Records::Carve(r) = &p.records {
        let g = &mut p.geometry;
        let mut id_slot = |id: &std::sync::Arc<str>| -> usize {
            ids.iter().position(|v| v == id).unwrap_or_else(|| {
                ids.push(id.clone());
                ids.len() - 1
            })
        };
        g.extend([
            CARVE_REASONS.iter().position(|&v| v == r.reason).unwrap() as f64,
            r.removed.len() as f64,
            r.spread.len() as f64,
            r.group.len() as f64,
            r.closure.is_some() as u8 as f64,
            r.oxbows.len() as f64,
            0.0, // Reserved ABI slot; the retired edge hook has no records.
            r.oxbow_basin.len() as f64,
            r.unleashed
                .as_ref()
                .map_or(f64::NAN, |v| id_slot(&v.as_str().into()) as f64),
            r.bad as u8 as f64,
            r.retained.is_some() as u8 as f64,
            r.retained.as_ref().map_or(0, |v| v.tiles.len()) as f64,
        ]);
        for (slot, step) in &r.removed {
            g.extend([*slot as f64, *step as f64]);
        }
        for (slot, step) in &r.spread {
            g.extend([*slot as f64, *step as f64]);
        }
        for w in &r.group {
            g.extend([w.slot as f64, w.tile as f64, w.strength]);
        }
        for o in &r.oxbows {
            g.extend([
                o.start as f64,
                o.end as f64,
                o.step as f64,
                o.floor,
                o.neck.len() as f64,
                o.pool.len() as f64,
            ]);
            for b in &o.bars {
                g.extend([b.x, b.y, b.dx, b.dy, b.width, b.level]);
            }
            for q in &o.neck {
                g.extend([q.x, q.y]);
            }
            for q in &o.pool {
                g.extend([
                    q.x,
                    q.y,
                    q.bed,
                    q.width,
                    q.dx,
                    q.dy,
                    q.bend,
                    q.lanes.len() as f64,
                ]);
                for l in &q.lanes {
                    g.extend([l.x, l.y, l.width]);
                }
            }
        }
        g.extend(r.oxbow_basin.iter().map(|&v| v as f64));
        if let Some(r) = &r.retained {
            for k in 0..r.tiles.len() {
                g.extend([
                    r.tiles[k] as f64,
                    r.floor[k],
                    r.depth[k],
                    r.contamination[k],
                ]);
            }
        }
        entity_rows(&r.initial_entities, &mut ids, &mut p.step_objects);
        if let Some(m) = &r.closure {
            entity_rows(&m.entities, &mut ids, &mut p.closure_objects);
            fallen_rows(&m.fallen, &mut ids, &mut p.closure_fallen);
        }
    }
    p.literal_objects.extend_from_slice(&p.literal.object_rows);
    // Imported IDs already live in the arena. Encode only newly generated IDs.
    for id in ids.iter().skip(task.id_offsets.len() - 1) {
        task.id_bytes.extend_from_slice(id.as_bytes());
        task.id_offsets.push(task.id_bytes.len() as u32);
    }
}
fn pair<T>(d: &mut [usize; 136], slot: usize, v: &[T]) {
    d[slot * 2] = v.as_ptr() as usize;
    d[slot * 2 + 1] = v.len();
}
fn describe(task: &mut Job) {
    let m = task
        .live
        .as_ref()
        .unwrap_or_else(|| &task.output.as_ref().unwrap().map);
    let d = &mut task.descriptor;
    d.fill(0);
    pair(d, 0, &m.heights);
    pair(d, 1, &m.lava);
    pair(d, 2, &m.depth);
    pair(d, 3, &m.contamination);
    pair(d, 4, &m.rock);
    pair(d, 5, &task.keep);
    pair(d, 16, task.command.as_ref());
    pair(d, 17, &task.path);
    pair(d, 62, &task.command_bytes);
    pair(d, 19, &task.object_x);
    pair(d, 20, &task.object_y);
    pair(d, 21, &task.object_z);
    pair(d, 22, &task.object_flags);
    pair(d, 27, &task.id_offsets);
    pair(d, 28, &task.id_bytes);
    pair(d, 29, &task.source_strength);
    pair(d, 30, &task.source_kind);
    if let Some(p) = &task.output {
        pair(d, 18, &p.geometry);
        pair(d, 23, &p.objects);
        pair(d, 24, &p.fallen);
        pair(d, 53, &p.literal_objects);
        if let Some(m) = &p.before {
            pair(d, 55, &m.heights);
            pair(d, 56, &m.lava);
            pair(d, 57, &m.depth);
            pair(d, 58, &m.contamination);
            pair(d, 59, &m.rock);
        }
        pair(d, 60, &p.before_objects);
        pair(d, 61, &p.before_fallen);
        if let Some(raw) = &p.raw {
            pair(d, 32, &raw.heights);
            pair(d, 33, &raw.lava);
            pair(d, 34, &raw.depth);
            pair(d, 35, &raw.contamination);
            pair(d, 36, &raw.rock);
        }
        pair(d, 37, &p.raw_objects);
        pair(d, 38, &p.raw_fallen);
        pair(d, 6, &p.literal.tiles);
        pair(d, 7, &p.literal.heights);
        pair(d, 8, &p.literal.rock_tiles);
        pair(d, 9, &p.literal.bits);
        match &p.records {
            Records::Glaciate(r) => {
                pair(d, 10, &r.arrival);
                pair(d, 11, &r.mask);
                pair(d, 12, &r.metrics);
                pair(d, 13, &r.floor);
                pair(d, 14, &r.nearest);
                pair(d, 15, &r.stream);
                pair(d, 25, &r.fan);
            }
            Records::Carve(r) => {
                pair(d, 10, &r.change_offsets);
                pair(d, 11, &r.changes);
                pair(d, 12, &r.metrics);
                pair(d, 13, &r.heads);
                pair(d, 14, &r.path);
                pair(d, 15, &r.lengths);
                pair(d, 25, &r.head_offsets);
                pair(d, 26, &r.path_offsets);
                pair(d, 39, &r.raw_offsets);
                pair(d, 40, &r.raw_changes);
                pair(d, 41, &r.step_metrics);
                pair(d, 45, &p.step_objects);
                pair(d, 54, &r.step_object_changes);
                pair(d, 63, &r.knobs);
                pair(d, 64, &r.rock);
                pair(d, 65, &r.sediment);
                pair(d, 66, &r.curve);
                if let Some(m) = &r.closure {
                    pair(d, 46, &m.heights);
                    pair(d, 47, &m.lava);
                    pair(d, 48, &m.depth);
                    pair(d, 49, &m.contamination);
                    pair(d, 50, &m.rock);
                    pair(d, 51, &p.closure_objects);
                    pair(d, 52, &p.closure_fallen);
                }
            }
            Records::Footprint { offsets, tiles } => {
                pair(d, 10, offsets);
                pair(d, 11, tiles);
            }
            Records::Crater {
                stats,
                keep,
                arrival,
                ..
            } => {
                pair(d, 10, arrival);
                pair(d, 11, keep);
                pair(d, 12, stats);
            }
            Records::Erupt {
                stats,
                keep,
                flows,
                heat,
                ..
            } => {
                pair(d, 10, flows);
                pair(d, 11, keep);
                pair(d, 12, stats);
                pair(d, 13, heat);
            }
            Records::Quake {
                stats,
                arrival,
                dx,
                dy,
                source,
                ..
            } => {
                pair(d, 10, arrival);
                pair(d, 12, stats);
                pair(d, 13, dx);
                pair(d, 14, dy);
                pair(d, 15, source);
                if let Records::Quake {
                    extras,
                    final_depth,
                    final_contamination,
                    ..
                } = &p.records
                {
                    pair(d, 42, extras);
                    pair(d, 43, final_depth);
                    pair(d, 44, final_contamination);
                }
            }
        }
    }
}
fn write_object_override(out: &mut Vec<u8>, v: &V, name: &str, replace: impl FnOnce(&mut Vec<u8>)) {
    let m = v.as_object().unwrap();
    out.push(6);
    out.extend((m.len() as u32).to_le_bytes());
    let mut keys: Vec<_> = m.keys().collect();
    keys.sort();
    let mut replace = Some(replace);
    for key in keys {
        write_text(out, key);
        if key == name {
            replace.take().unwrap()(out);
        } else {
            write_value(out, &m[key]);
        }
    }
}
pub fn pack(task: &Job) -> Vec<u8> {
    let mut bytes = vec![];
    if task.error != 0 {
        write_value(
            &mut bytes,
            &json!({"error":FORCE_ERRORS[task.error as usize]}),
        );
        return bytes;
    }
    let p = task.output.as_ref().expect("plan first");
    let value = p.value();
    if let Records::Quake { fault, .. } = &p.records {
        // Cold fixture codec preserves IEEE payloads that JSON cannot represent.
        // The typed planner and the production bridge never enter this path.
        write_object_override(&mut bytes, &value, "fault", |out| {
            write_object_override(out, &value["fault"], "segments", |out| {
                out.push(5);
                out.extend((fault.segments.len() as u32).to_le_bytes());
                for (seg, v) in fault
                    .segments
                    .iter()
                    .zip(value["fault"]["segments"].as_array().unwrap())
                {
                    let m = v.as_object().unwrap();
                    out.push(6);
                    out.extend((m.len() as u32).to_le_bytes());
                    let mut keys: Vec<_> = m.keys().collect();
                    keys.sort();
                    for key in keys {
                        write_text(out, key);
                        if key == "dx" || key == "dy" {
                            out.push(3);
                            out.extend((if key == "dx" { seg.dx } else { seg.dy }).to_le_bytes());
                        } else {
                            write_value(out, &m[key]);
                        }
                    }
                }
            });
        });
    } else {
        write_value(&mut bytes, &value);
    }
    bytes
}
// Native fixture export check only: preserve opaque component insertion order.
// The hot operation returns typed buffers; no planner calls this serializer.
#[cfg(not(target_arch = "wasm32"))]
fn write_ordered_value(out: &mut Vec<u8>, value: &V) {
    match value {
        V::Object(m) => {
            out.push(6);
            out.extend((m.len() as u32).to_le_bytes());
            for (key, value) in m {
                write_text(out, key);
                write_ordered_value(out, value);
            }
        }
        V::Array(a) => {
            out.push(5);
            out.extend((a.len() as u32).to_le_bytes());
            for value in a {
                write_ordered_value(out, value);
            }
        }
        _ => write_value(out, value),
    }
}
#[cfg(not(target_arch = "wasm32"))]
pub fn pack_export_entities(task: &Job) -> Vec<u8> {
    let mut bytes = vec![];
    let entities = task
        .output
        .as_ref()
        .map(|p| p.map.entities.iter().map(Entity::value).collect::<Vec<_>>())
        .unwrap_or_default();
    write_ordered_value(&mut bytes, &V::Array(entities));
    bytes
}
pub fn execute(input: &[u8]) -> Vec<u8> {
    let mut task = prepare(input);
    plan(&mut task);
    pack(&task)
}
#[no_mangle]
pub unsafe extern "C" fn forces_reserve_command_bytes(task: *mut Job, length: usize) {
    let task = &mut *task;
    if length > task.command_bytes.len() {
        task.command_bytes.resize(length, 0);
        describe(task);
    }
}
#[no_mangle]
pub unsafe extern "C" fn forces_prepare(p: *const u8, len: usize) -> *mut Job {
    Box::into_raw(Box::new(prepare(std::slice::from_raw_parts(p, len))))
}
// Cold map creation imports only object/settings metadata. Numeric map arrays are
// allocated here and populated directly through the descriptor's typed views.
#[no_mangle]
pub unsafe extern "C" fn forces_create(p: *const u8, len: usize) -> *mut Job {
    let mut task = prepare(std::slice::from_raw_parts(p, len));
    let m = task.live.as_mut().unwrap();
    let n = m.w * m.h;
    assert!(
        m.heights.is_empty()
            && m.lava.is_empty()
            && m.depth.is_empty()
            && m.contamination.is_empty()
            && m.rock.is_empty()
    );
    m.heights.resize(n, 0);
    m.lava.resize(n, 0);
    m.depth.resize(n, 0.0);
    m.contamination.resize(n, 0.0);
    m.rock.resize(m.initial_rock_len, 0.0);
    task.keep.resize(n, 0);
    describe(&mut task);
    Box::into_raw(Box::new(task))
}
#[no_mangle]
pub unsafe extern "C" fn forces_checkpoint(job: *mut Job) {
    let task = &mut *job;
    assert!(task.output.is_none());
    task.baseline = task.live.as_ref().unwrap().clone();
}
#[no_mangle]
pub unsafe extern "C" fn forces_descriptor(job: *const Job) -> *const usize {
    (*job).descriptor.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn forces_reset(job: *mut Job) {
    reset(&mut *job);
}
#[no_mangle]
pub unsafe extern "C" fn forces_plan(job: *mut Job) -> u32 {
    plan(&mut *job);
    (*job).error
}
#[no_mangle]
pub unsafe extern "C" fn forces_error(job: *const Job) -> u32 {
    (*job).error
}
#[no_mangle]
pub unsafe extern "C" fn forces_pack(job: *const Job, len: *mut usize) -> *mut u8 {
    let out = pack(&*job).into_boxed_slice();
    *len = out.len();
    Box::into_raw(out) as *mut u8
}
#[no_mangle]
pub unsafe extern "C" fn forces_free(job: *mut Job) {
    drop(Box::from_raw(job));
}
#[no_mangle]
pub unsafe extern "C" fn forces_execute(p: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let b = execute(std::slice::from_raw_parts(p, len)).into_boxed_slice();
    *out_len = b.len();
    Box::into_raw(b) as *mut u8
}

#[derive(Clone)]
struct Ray {
    dx: f64,
    dy: f64,
    start: f64,
    length: f64,
    width: f64,
    bend: f64,
    phase: f64,
    seed: f64,
    pits: Vec<(f64, f64, f64)>,
}
impl Ray {
    fn bend(&self, t: f64) -> f64 {
        self.bend * (sin(t * PI * 1.6 + self.phase) - sin(self.phase))
            + self.width * 0.3 * sin(t * PI * 4.0 + self.phase) * sin(t * PI)
    }
    fn width(&self, t: f64) -> f64 {
        self.width
            * (0.65 + 0.45 * sin(PI * min(1.0, t * 1.6)))
            * pow(1.0 - t, 0.65)
            * (0.8 + 0.2 * sin(t * 19.0 + self.phase))
    }
}
struct Crater {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    inset: f64,
    radius: f64,
    a: f64,
    b: f64,
    angle: f64,
    glance: f64,
    diameter: f64,
    depth: f64,
    rim: f64,
    datum: f64,
    floor: f64,
    centre: String,
    rays: Vec<Ray>,
}
fn crater_size(p: f64) -> f64 {
    round(6.0 + 112.0 * pow(p / 100.0, 1.4))
}
impl Crater {
    fn new(m: &Map, s0: &Settings, intent: &Intent) -> Self {
        let origin = n(intent, "origin") as usize;
        let x = (origin % m.w) as f64;
        let y = (origin / m.w) as f64;
        let power = n(s0, "power");
        let seed = n(s0, "seed");
        let diameter = s0.size.unwrap_or_else(|| crater_size(power));
        let radius = diameter / 2.0;
        let end = if s(s0, "mode") == "aim" {
            n(intent, "end") as usize
        } else {
            origin
        };
        let ex = (end % m.w) as f64;
        let ey = (end / m.w) as f64;
        let angle = atan2(ey - y, ex - x);
        let glance = clamp(hypot(ex - x, ey - y) / max(12.0, diameter), 0.0, 1.0);
        let a = radius * (1.0 + 0.65 * glance);
        let b = radius / (1.0 + 0.18 * glance);
        let depth = clamp(
            (1.0 + (12.0 * power) / 100.0)
                * portable_math::sqrt(crater_size(power) / diameter)
                * (1.0 - 0.28 * glance),
            1.0,
            20.0,
        );
        let rim = clamp(1.0 + depth * 0.23, 1.0, 5.0);
        let mut samples = vec![];
        for k in 0..48 {
            let t = (k as f64 * PI) / 24.0;
            let u = cos(t) * a;
            let v = sin(t) * b;
            let xx = round(x + u * cos(angle) - v * sin(angle));
            let yy = round(y + u * sin(angle) + v * cos(angle));
            if xx >= 0.0 && yy >= 0.0 && xx < m.w as f64 && yy < m.h as f64 {
                samples.push(m.heights[yy as usize * m.w + xx as usize]);
            }
        }
        samples.sort();
        let datum = if samples.is_empty() {
            m.heights[origin]
        } else {
            samples[samples.len() / 2]
        } as f64;
        let floor = max(0.0, datum - depth);
        let heavy = s(s0, "debris") == "heavy";
        let inset = if diameter < min(m.w as f64, m.h as f64) * 0.65 {
            max(8.0, min(m.w as f64, m.h as f64) * 0.0625)
        } else {
            0.0
        };
        let mut rays = vec![];
        if boolean(s0, "rays") {
            for k in 0..10 {
                let k = k as f64;
                let t = angle + (k / 10.0) * PI * 2.0 + (hash(seed, k) - 0.5) * 0.18;
                let down = (1.0 + cos(t - angle)) * 0.5;
                let dx = cos(t);
                let dy = sin(t);
                let base_width = 1.7 + radius * 0.11;
                let width = base_width * if heavy { 1.65 } else { 1.0 };
                let start = 1.12 / hypot(cos(t - angle) / a, sin(t - angle) / b);
                let mut length = start
                    + radius * (1.15 + hash(seed, k + 30.0) * 1.3) * (1.0 + glance * down * 0.5);
                if inset != 0.0 {
                    let margin = if heavy {
                        inset
                    } else {
                        max(8.0, min(m.w as f64, m.h as f64) * 0.08) + width * 2.0
                    };
                    let edge = min(
                        if dx > 0.0 {
                            (m.w as f64 - 1.0 - margin - x) / dx
                        } else if dx < 0.0 {
                            (margin - x) / dx
                        } else {
                            f64::INFINITY
                        },
                        if dy > 0.0 {
                            (m.h as f64 - 1.0 - margin - y) / dy
                        } else if dy < 0.0 {
                            (margin - y) / dy
                        } else {
                            f64::INFINITY
                        },
                    );
                    length = min(length, edge);
                }
                if length < start + 4.0 {
                    continue;
                }
                let mut ray = Ray {
                    dx,
                    dy,
                    start,
                    length,
                    width,
                    bend: base_width * (0.5 + hash(seed, k + 60.0)) * if heavy { 0.8 } else { 1.0 },
                    phase: hash(seed, k + 90.0) * PI * 2.0,
                    seed: seed + k * 101.0,
                    pits: vec![],
                };
                let mut d = start + 3.0;
                let mut j = 0.0;
                while d < length * 0.94 {
                    let f = (d - start) / (length - start);
                    let offset =
                        ray.bend(f) + (hash(ray.seed, j + 200.0) - 0.5) * ray.width(f) * 1.6;
                    ray.pits.push((
                        x + dx * d - dy * offset,
                        y + dy * d + dx * offset,
                        (0.8 + hash(ray.seed, j + 300.0) * 1.1)
                            * if heavy { 1.55 } else { 1.0 }
                            * (1.0 - f * 0.45),
                    ));
                    d += max(4.0, radius * if heavy { 0.12 } else { 0.15 })
                        * (1.0 + hash(ray.seed, j + 400.0));
                    j += 1.0;
                }
                rays.push(ray);
            }
        }
        let centre = if s(s0, "centre") == "auto" {
            if diameter < 28.0 {
                "bowl"
            } else if diameter < 68.0 {
                "peak"
            } else {
                "ring"
            }
        } else {
            s(s0, "centre")
        }
        .to_string();
        Self {
            x,
            y,
            w: m.w as f64,
            h: m.h as f64,
            inset,
            radius,
            a,
            b,
            angle,
            glance,
            diameter,
            depth,
            rim,
            datum,
            floor,
            centre,
            rays,
        }
    }
    fn field(&self, s0: &Settings, x: f64, y: f64) -> (f64, f64, f64, f64, f64) {
        let dx = x - self.x;
        let dy = y - self.y;
        let c = cos(self.angle);
        let sn = sin(self.angle);
        let u = (dx * c + dy * sn) / self.a;
        let v = (-dx * sn + dy * c) / self.b;
        let theta = atan2(v, u);
        let phase = hash(n(s0, "seed"), 71.0) * PI * 2.0;
        let edge = 1.0 + 0.035 * sin(theta * 3.0 + phase) + 0.022 * sin(theta * 5.0 - phase * 0.6);
        let r = hypot(u, v) / edge;
        let down = (1.0 + cos(theta)) * 0.5;
        let heavy = s(s0, "debris") == "heavy";
        let edge_fade = if heavy && self.inset != 0.0 {
            smooth((min(min(x, y), min(self.w - 1.0 - x, self.h - 1.0 - y)) - self.inset) / 12.0)
        } else {
            1.0
        };
        let mut ray_height = 0.0;
        let mut secondary = 0.0;
        if boolean(s0, "rays") && r > 1.15 {
            for ray in &self.rays {
                let along = dx * ray.dx + dy * ray.dy;
                let cross = -dx * ray.dy + dy * ray.dx;
                if along < ray.start || along >= ray.length || cross.abs() > ray.width * 4.0 {
                    continue;
                }
                let t = (along - ray.start) / (ray.length - ray.start);
                let offset = cross - ray.bend(t);
                let width = ray.width(t);
                if offset.abs() < width {
                    let feather = smooth(1.0 - offset.abs() / width);
                    let grain = hash(ray.seed, x + (y as i32).wrapping_mul(65537) as f64);
                    if heavy {
                        let wave = sin(t * 13.0 + ray.phase);
                        let lobes = smooth((wave + 0.8) / 1.25);
                        let gaps = smooth((wave + 0.96) / 0.28);
                        let fade = 1.0 - smooth((t - 0.45) / 0.55);
                        let height = (1.2 + (1.25 * n(s0, "power")) / 100.0)
                            * feather
                            * (0.7 + 0.3 * lobes)
                            * gaps
                            * fade
                            * edge_fade;
                        ray_height = max(ray_height, (height + 0.3 + grain * 0.4).floor());
                    } else {
                        let lobes = smooth((sin(t * 25.0 + ray.phase) + 0.65) / 1.25);
                        let density =
                            feather * (0.12 + 0.88 * lobes) * (1.0 - smooth((t - 0.2) / 0.8));
                        if density > 0.18 + grain * 0.66 {
                            ray_height = 1.0;
                        }
                    }
                }
                for &(px, py, pr) in &ray.pits {
                    let dist = pow(x - px, 2.0) + pow(y - py, 2.0);
                    if edge_fade > 0.5 && dist < pow(pr, 2.0) {
                        secondary = max(
                            secondary,
                            if dist < pow(pr, 2.0) * 0.35 { 2.0 } else { 1.0 },
                        );
                    }
                }
            }
        }
        (r, theta, down, ray_height, secondary)
    }
    fn value(&self) -> V {
        json!({"x":self.x,"y":self.y,"W":self.w,"H":self.h,"edgeInset":self.inset,"radius":self.radius,"a":self.a,"b":self.b,"angle":self.angle,"glance":self.glance,"diameter":self.diameter,"depth":self.depth,"rim":self.rim,"datum":self.datum,"floor":self.floor,"centre":self.centre,"rays":self.rays.iter().map(|r|json!({"dx":r.dx,"dy":r.dy,"start":r.start,"length":r.length,"width":r.width,"bend":r.bend,"phase":r.phase,"seed":r.seed,"pits":r.pits.iter().map(|&(x,y,r)|json!({"x":x,"y":y,"r":r})).collect::<Vec<_>>()})).collect::<Vec<_>>()})
    }
}
fn crater(before: &Map, mut m: Map, s0: &Settings, intent: &Intent, extra: &[u8]) -> Plan {
    let a = Crater::new(before, s0, intent);
    let k = strength(n(s0, "power"), s0.size, crater_size(n(s0, "power")));
    let mut keep = vec![0u8; m.w * m.h];
    for (i, &v) in extra.iter().enumerate() {
        if v != 0 {
            keep[i] = 1;
        }
    }
    for e in &before.entities {
        if emitter(s(e, "template")) {
            for i in m.footprint(e, 0) {
                keep[i] = 1;
            }
        }
    }
    let phase = hash(n(s0, "seed"), 80.0) * PI * 2.0;
    let mut cut = 0.0;
    let mut raised = 0.0;
    let mut changed = 0;
    let mut erased = 0;
    let mut flattened = 0;
    for y in 0..m.h {
        for x in 0..m.w {
            let i = y * m.w + x;
            if keep[i] != 0 {
                continue;
            }
            let (r, theta, down, ray, secondary) = a.field(s0, x as f64, y as f64);
            let h = before.heights[i] as f64;
            let mut target;
            if r < 1.0 {
                let mut wall = 0.0;
                if s(s0, "walls") == "steep" {
                    wall = smooth((r - 0.89) / 0.055);
                } else {
                    let shift = (hash(n(s0, "seed"), 7.0) - 0.5) * 0.025;
                    for step in 0..4 {
                        wall += smooth((r - (0.48 + step as f64 * 0.16 + shift)) / 0.025) / 4.0;
                    }
                }
                let curve = if s(s0, "walls") == "steep" {
                    0.23
                } else {
                    0.16
                };
                let t = if a.centre == "bowl" {
                    curve
                        * pow(
                            clamp(
                                r / if s(s0, "walls") == "steep" {
                                    0.89
                                } else {
                                    0.48
                                },
                                0.0,
                                1.0,
                            ),
                            2.0,
                        )
                        + (1.0 - curve) * wall
                } else {
                    wall
                };
                let mut inside = a.floor + (a.datum - a.floor + a.rim) * t;
                if a.centre == "peak" {
                    inside += a.depth * 0.69 * pow(max(0.0, 1.0 - r / 0.31), 1.25);
                }
                if a.centre == "ring" {
                    inside += a.depth
                        * 0.55
                        * exp(-pow((r - 0.38) / 0.1, 2.0))
                        * (1.0 + 0.18 * sin(theta * 7.0 + phase));
                }
                target = inside + (h - a.datum) * smooth((r - 0.84) / 0.16);
                if s(s0, "walls") == "terraced"
                    && r > 0.54
                    && r < 0.93
                    && before.rock[clamp(round(target), 0.0, 22.0) as usize] > 0.5
                {
                    target = target.ceil();
                }
            } else {
                let rim = a.rim * max(0.0, 1.0 - (r - 1.0) / 0.23);
                let heavy = s(s0, "debris") == "heavy";
                let reach = if heavy { 2.65 } else { 1.48 };
                let directional = 1.0 + a.glance * (down * 1.65 - 0.65);
                let hummock = 0.8
                    + 0.18 * sin(theta * 5.0 + phase + (r - 1.0) * 3.0)
                    + 0.13 * sin(theta * 3.0 - phase);
                let skirt = (if heavy { 2.1 + a.depth * 0.36 } else { 0.9 })
                    * exp(-(r - 1.0) * if heavy { 2.15 } else { 7.0 })
                    * smooth((reach - r) / 0.4)
                    * directional
                    * hummock;
                target = h + max(rim, skirt);
                if ray > 0.0 {
                    target = max(h + ray, round(target) + ray);
                }
                if secondary != 0.0 {
                    target = h - secondary;
                }
            }
            target = tempered(h, target, k);
            target = clamp(
                round(round(target * 4096.0) / 4096.0),
                0.0,
                min(22.0, m.ceiling),
            );
            m.heights[i] = target as u8;
            if target != h {
                changed += 1;
                cut += max(0.0, h - target);
                raised += max(0.0, target - h);
            }
        }
    }
    m.fallen = before
        .fallen
        .iter()
        .filter(|e| a.field(s0, e.x, e.y).0 > 1.0)
        .cloned()
        .map(|mut e| {
            let i = n(&e, "y").floor() as usize * m.w + n(&e, "x").floor() as usize;
            setn(&mut e, "z", m.heights[i] as f64);
            e
        })
        .collect();
    let mut entities = vec![];
    for mut e in before.entities.clone() {
        e.plain = true;
        if e.new_source.is_some() {
            e.source_normalized = true;
        }
        let tile = n(&e, "y") as usize * m.w + n(&e, "x") as usize;
        if keep[tile] != 0 {
            entities.push(e);
            continue;
        }
        let (r, _, _, ray, _) = a.field(s0, n(&e, "x"), n(&e, "y"));
        let is_plant = plant(s(&e, "template"));
        if is_plant
            && r < 0.93
            && (k >= 0.5 || (m.heights[tile] as f64 - before.heights[tile] as f64).abs() >= 2.0)
        {
            erased += 1;
            continue;
        }
        if is_plant
            && (r < if s(s0, "debris") == "heavy" {
                1.85
            } else {
                1.4
            } || ray > 0.0)
        {
            if s(&e, "template") == "BlueberryBush" {
                continue;
            }
            m.dead(&mut e, a.x, a.y);
            setn(&mut e, "z", m.heights[tile] as f64);
            flattened += 1;
            entities.push(e);
            continue;
        }
        if m.footprint(&e, 0)
            .iter()
            .any(|&i| m.heights[i] != before.heights[i])
        {
            continue;
        }
        entities.push(e);
    }
    m.entities = entities;
    let mut alive = vec![false; m.next_id.get()];
    for e in &m.entities {
        alive[e.id_key] = true;
    }
    m.fallen.retain(|f| alive[f.id_key]);
    let raw = Some(m.clone());
    let stats = [cut, raised, changed as f64, erased as f64, flattened as f64];
    m.finalize(before, s0, extra);
    let mut arrival = vec![0.0f32; m.w * m.h];
    let reach = (if s(s0, "debris") == "heavy" {
        2.65
    } else {
        1.48
    }) + if boolean(s0, "rays") { 1.4 } else { 0.0 };
    let c = cos(a.angle);
    let sn = sin(a.angle);
    for y in 0..m.h {
        for x in 0..m.w {
            let dx = x as f64 - a.x;
            let dy = y as f64 - a.y;
            let r = hypot((dx * c + dy * sn) / a.a, (-dx * sn + dy * c) / a.b);
            arrival[y * m.w + x] = (if r < 1.05 {
                0.0
            } else {
                clamp(
                    0.125 + ((r - 1.05) / max(0.5, reach - 1.05)) * 0.875,
                    0.125,
                    1.0,
                )
            }) as f32;
        }
    }
    Plan {
        map: m,
        raw,
        records: Records::Crater {
            anatomy: a,
            stats,
            strength: k,
            keep,
            arrival,
        },
        literal: Literal::default(),
        geometry: vec![],
        objects: vec![],
        fallen: vec![],
        raw_objects: vec![],
        raw_fallen: vec![],
        step_objects: vec![],
        closure_objects: vec![],
        closure_fallen: vec![],
        literal_objects: vec![],
        before: None,
        before_objects: vec![],
        before_fallen: vec![],
    }
}

#[derive(Clone, Copy)]
struct Point {
    x: f64,
    y: f64,
}
impl Point {
    fn value(&self) -> V {
        json!({"x":self.x,"y":self.y})
    }
}
#[derive(Default)]
struct Intent {
    origin: f64,
    end: f64,
    side: f64,
    path: Vec<Point>,
    via: Vec<usize>,
}
impl Intent {
    fn from(v: &V) -> Self {
        Self {
            origin: n(v, "origin"),
            end: n(v, "end"),
            side: n(v, "side"),
            path: points(&v["path"]),
            via: arr(&v["via"]).iter().map(|v| num(v) as usize).collect(),
        }
    }
}
impl Fields for Intent {
    #[inline]
    fn number(&self, k: &str) -> f64 {
        match k {
            "origin" => self.origin,
            "end" => self.end,
            "side" => self.side,
            _ => f64::NAN,
        }
    }
    fn text(&self, _: &str) -> &str {
        ""
    }
    fn flag(&self, _: &str) -> bool {
        false
    }
    fn put(&mut self, _: &str, _: f64) {
        unreachable!()
    }
}
fn points(v: &V) -> Vec<Point> {
    arr(v)
        .iter()
        .map(|v| Point {
            x: n(v, "x"),
            y: n(v, "y"),
        })
        .collect()
}

// Carve: distances, geology and drainage preserve the product's explicit order.
// These types contain only typed numbers/strings, never generic map values.
#[derive(Clone)]
struct CarveSettings {
    power: f64,
    wander: f64,
    width: Option<f64>,
    depth: Option<f64>,
    seed: u32,
    aimed: bool,
    wide: bool,
    defy: bool,
    dry: bool,
    layers: bool,
    floor: f64,
    river_depth: Option<f64>,
    banks: f64,
}
impl CarveSettings {
    fn from(v: &V) -> Self {
        Self {
            power: n(v, "power"),
            wander: v["wander"].as_f64().unwrap_or(35.0),
            width: v["width"].as_f64(),
            depth: v["depth"].as_f64(),
            seed: v["seed"].as_u64().unwrap_or(0) as u32,
            aimed: s(v, "mode") == "aim",
            wide: s(v, "walls") == "wide",
            defy: boolean(v, "defyGravity"),
            dry: boolean(v, "dry"),
            layers: boolean(v, "layers"),
            floor: v["floor"].as_f64().unwrap_or(1.0),
            river_depth: v["riverDepth"].as_f64(),
            banks: v["banks"].as_f64().unwrap_or(0.0),
        }
    }
    fn natural_width(&self) -> f64 {
        2.8 + self.power * 0.1
    }
}
fn carve_mix(mut n: u32) -> u32 {
    n = (n ^ (n >> 16)).wrapping_mul(0x21f0aaad);
    n = (n ^ (n >> 15)).wrapping_mul(0x735a2d97);
    n ^ (n >> 15)
}
fn map_seed(m: &Map) -> u32 {
    let mut s = 2166136261u32;
    for &h in &m.heights {
        s = (s ^ (h as u32)).wrapping_mul(16777619);
    }
    s ^ (m.w as u32) ^ (m.h as u32).wrapping_mul(97)
}
fn angle_delta(a: f64, b: f64) -> f64 {
    atan2(sin(a - b), cos(a - b))
}
#[derive(Clone, Copy)]
struct Lane {
    x: f64,
    y: f64,
    width: f64,
}
#[derive(Clone, Copy)]
struct Knob {
    x: f64,
    y: f64,
    radius: f64,
}
struct RiverCharacter {
    seed: u32,
    radius: f64,
    intensity: f64,
    wander: f64,
    phase: f64,
    phase2: f64,
    knobs: Vec<Knob>,
    rock: Vec<u8>,
}
impl RiverCharacter {
    fn new(m: &Map, s: &CarveSettings, geology: u32, i: &Intent) -> Self {
        let seed = carve_mix(
            geology
                ^ s.seed.wrapping_mul(0x9e3779b9)
                ^ (i.origin as u32)
                ^ ((if i.end.is_nan() { 0 } else { i.end as u32 }).wrapping_mul(97)),
        );
        let width = s.width.unwrap_or(s.natural_width());
        let mut c = Self {
            seed,
            radius: width / 2.0,
            intensity: portable_math::sqrt(s.natural_width() / width),
            wander: s.wander / 100.0,
            phase: (seed as f64 / 4294967296.0) * std::f64::consts::PI * 2.0,
            phase2: (carve_mix(seed) as f64 / 4294967296.0) * std::f64::consts::PI * 2.0,
            knobs: vec![],
            rock: vec![0; m.w * m.h],
        };
        if !s.layers || width < 5.0 {
            return c;
        }
        for gy in (12..m.h.saturating_sub(8)).step_by(24) {
            for gx in (12..m.w.saturating_sub(8)).step_by(24) {
                let h = carve_mix(
                    geology
                        ^ (gx as u32).wrapping_mul(73856093)
                        ^ (gy as u32).wrapping_mul(19349663),
                );
                if h % 100 > 48 {
                    continue;
                }
                let x = gx as f64 + ((h >> 8) % 9) as f64 - 4.0;
                let y = gy as f64 + ((h >> 16) % 9) as f64 - 4.0;
                let radius = 1.6 + ((h >> 24) % 6) as f64 * 0.2;
                let tile = y as usize * m.w + x as usize;
                let level = m.heights[tile] as usize;
                let hard = m.rock.get(level).copied().unwrap_or(
                    if (level + geology as usize % 4) % 4 == 0 {
                        1.0
                    } else {
                        0.0
                    },
                );
                if (hard == 0.0 && h % 3 != 0) || level < 3 || m.depth[tile] > 0.1 {
                    continue;
                }
                if hypot(
                    x - (i.origin as usize % m.w) as f64,
                    y - (i.origin as usize / m.w) as f64,
                ) < c.radius * 2.0 + radius + 7.0
                {
                    continue;
                }
                if !i.end.is_nan()
                    && hypot(
                        x - (i.end as usize % m.w) as f64,
                        y - (i.end as usize / m.w) as f64,
                    ) < c.radius + radius + 5.0
                {
                    continue;
                }
                c.knobs.push(Knob { x, y, radius });
                for yy in (y - radius).ceil() as i32..=(y + radius).floor() as i32 {
                    for xx in (x - radius).ceil() as i32..=(x + radius).floor() as i32 {
                        if xx >= 0
                            && yy >= 0
                            && xx < m.w as i32
                            && yy < m.h as i32
                            && hypot(xx as f64 - x, yy as f64 - y) <= radius
                        {
                            c.rock[yy as usize * m.w + xx as usize] = 1;
                        }
                    }
                }
            }
        }
        c
    }
    fn width(&self, d: f64) -> f64 {
        let reach = 0.99 + 0.24 * sin(d * 0.105 + self.phase) + 0.13 * sin(d * 0.037 + self.phase2);
        let throat = 1.0 - 0.17 * pow(max(0.0, sin(d * 0.19 + self.phase2)), 6.0);
        max(1.05, self.radius * reach * throat)
    }
    fn swing(&self, progress: f64, available: f64) -> f64 {
        let amplitude = min(
            0.7 + self.wander * (8.0 + self.radius * 5.0),
            available * 0.3,
        );
        let wavelength = 95.0 * (1.0 - self.wander) + self.wander * (25.0 + self.radius * 3.0);
        let k = (2.0 * std::f64::consts::PI) / wavelength;
        let phase = k * progress + self.phase;
        atan(amplitude * k * (cos(phase) + 0.12 * cos(phase * 0.5 + self.phase2)))
    }
    fn grade(&self, d: f64, power: f64) -> f64 {
        let first = 13 + self.seed % 13;
        let spacing = 15 + carve_mix(self.seed) % 14;
        if d < (first as f64) {
            return 0.0;
        }
        let reach = ((d - first as f64) / spacing as f64).floor() as u32;
        let mut drop = 0.0;
        for n in 0..=reach {
            drop +=
                if power > 40.0 && carve_mix(self.seed.wrapping_add(n.wrapping_mul(97))) % 4 == 0 {
                    2.0
                } else {
                    1.0
                };
        }
        drop
    }
    fn lanes(&self, x: f64, y: f64, dx: f64, dy: f64, width: f64) -> (Vec<Lane>, Option<usize>) {
        let length = width * 1.2 + 7.0;
        let mut selected = None;
        let mut best = f64::INFINITY;
        for (j, k) in self.knobs.iter().enumerate() {
            let vx = k.x - x;
            let vy = k.y - y;
            let along = vx * dx + vy * dy;
            let side = -vx * dy + vy * dx;
            if along.abs() > length || side.abs() > width + k.radius + 2.0 {
                continue;
            }
            let d = hypot(vx, vy);
            if d < best {
                best = d;
                selected = Some(j);
            }
        }
        let Some(j) = selected else {
            return (vec![Lane { x, y, width }], None);
        };
        let k = self.knobs[j];
        let along = (k.x - x) * dx + (k.y - y) * dy;
        let side = -(k.x - x) * dy + (k.y - y) * dx;
        let t = max(0.0, 1.0 - along.abs() / length);
        let ease = t * t * (3.0 - 2.0 * t);
        let branch = max(1.05, width * (1.0 - 0.56 * ease));
        let spread = (k.radius + branch + 0.9) * sin((t * std::f64::consts::PI) / 2.0);
        (
            [-1.0, 1.0]
                .iter()
                .map(|&sign| {
                    let offset = side * ease + spread * sign;
                    Lane {
                        x: x - dy * offset,
                        y: y + dx * offset,
                        width: branch,
                    }
                })
                .collect(),
            Some(j),
        )
    }
}
#[derive(Default)]
struct ForceHeap {
    data: Vec<(f64, usize)>,
}
impl ForceHeap {
    fn less(a: (f64, usize), b: (f64, usize)) -> bool {
        a.0 < b.0 || (a.0 == b.0 && a.1 <= b.1)
    }
    fn push(&mut self, key: f64, item: usize) {
        let mut i = self.data.len();
        self.data.push((key, item));
        while i > 0 {
            let p = (i - 1) >> 1;
            if Self::less(self.data[p], (key, item)) {
                break;
            }
            self.data[i] = self.data[p];
            i = p;
        }
        self.data[i] = (key, item);
    }
    fn pop(&mut self) -> Option<(f64, usize)> {
        if self.data.is_empty() {
            return None;
        }
        let top = self.data[0];
        let last = self.data.pop().unwrap();
        if !self.data.is_empty() {
            let mut i = 0;
            while i * 2 + 1 < self.data.len() {
                let mut c = i * 2 + 1;
                if c + 1 < self.data.len() && Self::less(self.data[c + 1], self.data[c]) {
                    c += 1;
                }
                if Self::less(last, self.data[c]) {
                    break;
                }
                self.data[i] = self.data[c];
                i = c;
            }
            self.data[i] = last;
        }
        Some(top)
    }
}
fn force_drainage(m: &Map, epsilon: f64) -> (Vec<f64>, Vec<i32>, Vec<usize>) {
    let n = m.w * m.h;
    let mut filled = vec![0.0; n];
    let mut rcv = vec![-2; n];
    let mut order = Vec::with_capacity(n);
    let mut heap = ForceHeap::default();
    for i in 0..n {
        let x = i % m.w;
        let y = i / m.w;
        if x == 0 || y == 0 || x == m.w - 1 || y == m.h - 1 {
            rcv[i] = -1;
            filled[i] = m.heights[i] as f64;
            heap.push(filled[i], i);
        }
    }
    while let Some((lv, c)) = heap.pop() {
        if lv > filled[c] {
            continue;
        }
        order.push(c);
        let x = (c % m.w) as i32;
        let y = (c / m.w) as i32;
        for (dx, dy) in [
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ] {
            let xx = x + dx;
            let yy = y + dy;
            if xx < 0 || yy < 0 || xx >= m.w as i32 || yy >= m.h as i32 {
                continue;
            }
            let j = yy as usize * m.w + xx as usize;
            if rcv[j] != -2 {
                continue;
            }
            rcv[j] = c as i32;
            let h = m.heights[j] as f64;
            let f = if h > lv + epsilon { h } else { lv + epsilon };
            filled[j] = f;
            heap.push(f, j);
        }
    }
    (filled, rcv, order)
}
struct PathCurve {
    x: Vec<f64>,
    y: Vec<f64>,
    s: Vec<f64>,
}
fn carve_curve(points: &[Point]) -> PathCurve {
    let mut c = PathCurve {
        x: vec![points[0].x],
        y: vec![points[0].y],
        s: vec![0.0],
    };
    let p = |k: isize| points[k.max(0).min(points.len() as isize - 1) as usize];
    for k in 0..points.len() - 1 {
        let a = p(k as isize - 1);
        let b = p(k as isize);
        let cc = p(k as isize + 1);
        let d = p(k as isize + 2);
        let n = max(2.0, (hypot(cc.x - b.x, cc.y - b.y) / 0.5).ceil()) as usize;
        for j in 1..=n {
            let t = j as f64 / n as f64;
            let t2 = t * t;
            let t3 = t2 * t;
            let f = |a: f64, b: f64, c: f64, d: f64| {
                0.5 * (2.0 * b
                    + (-a + c) * t
                    + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2
                    + (-a + 3.0 * b - 3.0 * c + d) * t3)
            };
            let x = f(a.x, b.x, cc.x, d.x);
            let y = f(a.y, b.y, cc.y, d.y);
            let z = c.s.last().unwrap() + hypot(x - c.x.last().unwrap(), y - c.y.last().unwrap());
            c.x.push(x);
            c.y.push(y);
            c.s.push(z);
        }
    }
    c
}
// (the TypeScript's record of each course point; only some of it is read)
#[allow(dead_code)]
#[derive(Clone, Copy)]
struct CoursePoint {
    x: f64,
    y: f64,
    cost: f64,
    bearing: f64,
    heading: f64,
    straight: bool,
}
struct CarveCourse {
    w: usize,
    h: usize,
    end: Option<Point>,
    potential: Vec<f64>,
    receivers: Vec<i32>,
    curve: Option<PathCurve>,
    along: usize,
    forward: f64,
    trace: Vec<CoursePoint>,
}
struct CarveNav {
    bearing: f64,
    cost: f64,
    straight: bool,
    deadline: f64,
    preferred: f64,
}
impl CarveCourse {
    fn new(m: &Map, s: &CarveSettings, i: &Intent) -> Self {
        let pt = |j: usize| Point {
            x: (j % m.w) as f64,
            y: (j / m.w) as f64,
        };
        let curve = if s.aimed && !i.via.is_empty() {
            let mut ps = vec![pt(i.origin as usize)];
            ps.extend(i.via.iter().map(|&j| pt(j)));
            ps.push(pt(i.end as usize));
            Some(carve_curve(&ps))
        } else {
            None
        };
        let (potential, receivers) = if !s.aimed {
            let (f, rcv, order) = force_drainage(m, 0.0001);
            let mut dist = vec![0.0; m.w * m.h];
            for j in order {
                let r = rcv[j];
                if r >= 0 {
                    let r = r as usize;
                    dist[j] = dist[r]
                        + hypot(
                            (j % m.w) as f64 - (r % m.w) as f64,
                            (j / m.w) as f64 - (r / m.w) as f64,
                        );
                }
            }
            (
                f.iter()
                    .enumerate()
                    .map(|(j, &v)| v * 16.0 + dist[j])
                    .collect(),
                rcv,
            )
        } else {
            (vec![], vec![])
        };
        let mut c = Self {
            w: m.w,
            h: m.h,
            end: if s.aimed {
                Some(pt(i.end as usize))
            } else {
                None
            },
            potential,
            receivers,
            curve,
            along: 0,
            forward: 0.0,
            trace: vec![],
        };
        let p = pt(i.origin as usize);
        let b = c.guide(p.x, p.y);
        c.trace.push(CoursePoint {
            x: p.x,
            y: p.y,
            cost: c.cost(p.x, p.y),
            bearing: b,
            heading: b,
            straight: false,
        });
        c
    }
    fn nearest(&self, x: f64, y: f64) -> usize {
        let c = self.curve.as_ref().unwrap();
        let mut best = self.along;
        let mut d = f64::INFINITY;
        for k in self.along..c.x.len().min(self.along + 60) {
            let e = pow(c.x[k] - x, 2.0) + pow(c.y[k] - y, 2.0);
            if e < d {
                d = e;
                best = k;
            }
        }
        best
    }
    fn near_end(&self) -> bool {
        self.curve
            .as_ref()
            .map_or(true, |c| c.s.last().unwrap() - c.s[self.along] < 3.0)
    }
    fn cost(&self, x: f64, y: f64) -> f64 {
        if let Some(c) = &self.curve {
            let k = self.nearest(x, y);
            return c.s.last().unwrap() - c.s[k] + hypot(c.x[k] - x, c.y[k] - y);
        }
        if let Some(e) = self.end {
            return hypot(e.x - x, e.y - y);
        }
        let xx = clamp(x, 0.0, (self.w - 1) as f64);
        let yy = clamp(y, 0.0, (self.h - 1) as f64);
        let x0 = xx.floor() as usize;
        let y0 = yy.floor() as usize;
        let x1 = (x0 + 1).min(self.w - 1);
        let y1 = (y0 + 1).min(self.h - 1);
        let u = xx - x0 as f64;
        let v = yy - y0 as f64;
        let p = &self.potential;
        (p[y0 * self.w + x0] * (1.0 - u) + p[y0 * self.w + x1] * u) * (1.0 - v)
            + (p[y1 * self.w + x0] * (1.0 - u) + p[y1 * self.w + x1] * u) * v
    }
    fn guide(&self, x: f64, y: f64) -> f64 {
        if let Some(c) = &self.curve {
            let k = self.nearest(x, y);
            let mut j = k;
            while j + 1 < c.x.len() && c.s[j] - c.s[k] < 5.0 {
                j += 1;
            }
            return atan2(c.y[j] - y, c.x[j] - x);
        }
        if let Some(e) = self.end {
            return atan2(e.y - y, e.x - x);
        }
        let mut i = clamp(round(y), 0.0, (self.h - 1) as f64) as usize * self.w
            + clamp(round(x), 0.0, (self.w - 1) as f64) as usize;
        for _ in 0..10 {
            if self.receivers[i] < 0 {
                break;
            }
            i = self.receivers[i] as usize;
        }
        atan2((i / self.w) as f64 - y, (i % self.w) as f64 - x)
    }
    fn plan(&self, x: f64, y: f64, ch: &RiverCharacter) -> CarveNav {
        let bearing = self.guide(x, y);
        let cost = self.cost(x, y);
        let n = self.trace.len();
        let straight = n >= 8 && cost >= self.trace[n - 8].cost - 0.25;
        let deadline = if n >= 16 {
            self.trace[n - 16].cost - 0.05
        } else {
            f64::INFINITY
        };
        let available = if self.end.is_some() {
            cost
        } else {
            f64::INFINITY
        };
        CarveNav {
            bearing,
            cost,
            straight,
            deadline,
            preferred: bearing
                + if straight {
                    0.0
                } else {
                    ch.swing(self.forward, available)
                },
        }
    }
    fn accept(&mut self, x: f64, y: f64, heading: f64, bearing: f64, straight: bool) {
        if self.curve.is_some() {
            self.along = self.nearest(x, y);
        }
        self.forward += 1.35 * max(0.05, cos(angle_delta(heading, bearing)));
        self.trace.push(CoursePoint {
            x,
            y,
            cost: self.cost(x, y),
            bearing,
            heading,
            straight,
        });
    }
}
fn carve_cross(a: Point, b: Point, c: Point, d: Point) -> bool {
    let cross =
        |p: Point, q: Point, r: Point| (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    let v = cross(a, b, c);
    let w = cross(a, b, d);
    let x = cross(c, d, a);
    let y = cross(c, d, b);
    v * w <= 0.0
        && x * y <= 0.0
        && max(a.x, b.x) >= min(c.x, d.x)
        && min(a.x, b.x) <= max(c.x, d.x)
        && max(a.y, b.y) >= min(c.y, d.y)
        && min(a.y, b.y) <= max(c.y, d.y)
}

fn force_murmur(bytes: &[u8], mut h: u32) -> u32 {
    let blocks = bytes.len() & !3;
    for chunk in bytes[..blocks].chunks_exact(4) {
        let mut k = u32::from_le_bytes(chunk.try_into().unwrap());
        k = k
            .wrapping_mul(0xcc9e2d51)
            .rotate_left(15)
            .wrapping_mul(0x1b873593);
        h ^= k;
        h = h.rotate_left(13).wrapping_mul(5).wrapping_add(0xe6546b64);
    }
    let mut k = 0u32;
    for (i, &b) in bytes[blocks..].iter().enumerate() {
        k ^= (b as u32) << (8 * i);
    }
    if blocks < bytes.len() {
        k = k
            .wrapping_mul(0xcc9e2d51)
            .rotate_left(15)
            .wrapping_mul(0x1b873593);
        h ^= k;
    }
    h ^= bytes.len() as u32;
    h = (h ^ (h >> 16)).wrapping_mul(0x85ebca6b);
    h = (h ^ (h >> 13)).wrapping_mul(0xc2b2ae35);
    h ^ (h >> 16)
}
fn force_hash(parts: &[String]) -> u32 {
    force_murmur(parts.join("\u{1f}").as_bytes(), 0x5eedda11)
}
fn force_guid(parts: &[String]) -> String {
    let b = parts.join("\u{1f}");
    let mut bytes = [0u8; 16];
    for (i, seed) in [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f]
        .iter()
        .enumerate()
    {
        bytes[4 * i..4 * i + 4].copy_from_slice(&force_murmur(b.as_bytes(), *seed).to_be_bytes());
    }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    let hex = bytes
        .iter()
        .map(|v| format!("{:02x}", v))
        .collect::<String>();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    )
}
struct ForceRng {
    a: u32,
    b: u32,
    c: u32,
    d: u32,
}
impl ForceRng {
    fn new(seed: u32) -> Self {
        let mut seed = seed;
        let mut sm = || {
            seed = seed.wrapping_add(0x9e3779b9);
            let mut z = seed;
            z = (z ^ (z >> 16)).wrapping_mul(0x85ebca6b);
            z = (z ^ (z >> 13)).wrapping_mul(0xc2b2ae35);
            z ^ (z >> 16)
        };
        let mut r = Self {
            a: sm(),
            b: sm(),
            c: sm(),
            d: sm(),
        };
        for _ in 0..12 {
            r.next();
        }
        r
    }
    fn next(&mut self) -> u32 {
        let t = self.a.wrapping_add(self.b).wrapping_add(self.d);
        self.d = self.d.wrapping_add(1);
        self.a = self.b ^ (self.b >> 9);
        self.b = self.c.wrapping_add(self.c << 3);
        self.c = self.c.rotate_left(21).wrapping_add(t);
        t
    }
    fn float(&mut self) -> f64 {
        self.next() as f64 / 4294967296.0
    }
}
#[derive(Clone)]
struct PlacedWater {
    id: std::sync::Arc<str>,
    id_key: usize,
    slot: u32,
    tile: usize,
    strength: f64,
}
#[derive(Clone)]
struct CarveStation {
    x: f64,
    y: f64,
    bed: f64,
    width: f64,
    dx: f64,
    dy: f64,
    bend: f64,
    lanes: Vec<Lane>,
}
#[derive(Clone)]
struct CarveHead {
    x: f64,
    y: f64,
    z: f64,
    dx: f64,
    dy: f64,
    width: f64,
    event: &'static str,
    cut: f64,
    lanes: Vec<Lane>,
}
#[derive(Clone, Copy)]
struct MouthBar {
    x: f64,
    y: f64,
    dx: f64,
    dy: f64,
    width: f64,
    level: f64,
}
#[derive(Clone)]
struct CarveOxbow {
    start: usize,
    end: usize,
    step: usize,
    floor: f64,
    neck: Vec<Point>,
    pool: Vec<CarveStation>,
    bars: [MouthBar; 2],
}
fn carve_neck(path: &[CarveStation], step: usize) -> Option<CarveOxbow> {
    let end = path.len().checked_sub(1)?;
    let b = &path[end];
    if b.bed < 2.0 || end < 25 {
        return None;
    }
    for start in 5.max(end.saturating_sub(100))..end - 20 {
        let a = &path[start];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = hypot(dx, dy);
        let radius = min(a.width, b.width);
        let arc = (end - start) as f64 * 1.35;
        if d < radius * 2.0 + 3.0 || d > radius * 4.0 + 10.0 || arc < d * 2.2 {
            continue;
        }
        let bow = &path[start..=end];
        let sides: Vec<_> = bow
            .iter()
            .map(|p| ((p.x - a.x) * dy - (p.y - a.y) * dx) / d)
            .collect();
        let mut swing = f64::NEG_INFINITY;
        let mut lo = f64::INFINITY;
        let mut hi = f64::NEG_INFINITY;
        for &s in &sides {
            swing = max(swing, s.abs());
            lo = min(lo, s);
            hi = max(hi, s);
        }
        if (lo < -0.25 && hi > 0.25) || swing < radius * 2.0 + 3.0 {
            continue;
        }
        let n = (d / 1.1).ceil() as usize;
        let neck = (0..=n)
            .map(|k| {
                let t = k as f64 / n as f64;
                Point {
                    x: a.x + dx * t,
                    y: a.y + dy * t,
                }
            })
            .collect();
        let far: Vec<_> = sides
            .iter()
            .enumerate()
            .filter(|(_, s)| s.abs() > radius * 1.8 + 3.0)
            .map(|(k, _)| k)
            .collect();
        if far.len() < 12 {
            continue;
        }
        let first = far[0];
        let last = *far.last().unwrap();
        let level = min(a.bed, b.bed + 2.0);
        let bar = |p: &CarveStation| MouthBar {
            x: p.x,
            y: p.y,
            dx: p.dx,
            dy: p.dy,
            width: p.width + 2.0,
            level,
        };
        return Some(CarveOxbow {
            start,
            end,
            step,
            floor: b.bed - 1.0,
            neck,
            pool: bow[first + 2..last - 1].to_vec(),
            bars: [bar(&bow[first]), bar(&bow[last])],
        });
    }
    None
}
fn carve_mouths(cut: &CarveOxbow, m: &Map) -> Vec<u8> {
    let mut floor = vec![0; m.w * m.h];
    for b in &cut.bars {
        let radius = b.width + 5.0;
        for y in max(0.0, (b.y - radius).floor()) as usize
            ..=min((m.h - 1) as f64, (b.y + radius).ceil()) as usize
        {
            for x in max(0.0, (b.x - radius).floor()) as usize
                ..=min((m.w - 1) as f64, (b.x + radius).ceil()) as usize
            {
                let along = (x as f64 - b.x) * b.dx + (y as f64 - b.y) * b.dy;
                let side = -(x as f64 - b.x) * b.dy + (y as f64 - b.y) * b.dx;
                if along.abs() > 2.0 || side.abs() > b.width + 3.0 {
                    continue;
                }
                let level = b.level + max(0.0, ((side.abs() - b.width) * 4.0).ceil());
                let i = y * m.w + x;
                floor[i] = max(floor[i] as f64, min(m.heights[i] as f64, level)) as u8;
            }
        }
    }
    floor
}
#[derive(Default)]
struct CarveMetrics {
    cut: f64,
    deposited: f64,
    exported: f64,
    suspended: f64,
    bank_cuts: f64,
    bend_cuts: f64,
    steps: usize,
    stable: bool,
    distance: f64,
    reason: &'static str,
    splits: f64,
    waterfalls: f64,
    rapids: f64,
    oxbows: f64,
}
#[derive(Default, Clone)]
struct CarveOptions {
    source_id: Option<String>,
    unleashed: Option<String>,
    bad: bool,
}
struct CarveState {
    map: Map,
    original: Vec<u8>,
    initial_water: Vec<f64>,
    keep: Vec<u8>,
    sediment: Vec<u8>,
    bar_floor: Vec<u8>,
    planned: Option<CarveOxbow>,
    sign: Vec<i8>,
    target: Vec<u8>,
    wear: Vec<f64>,
    character: RiverCharacter,
    course: CarveCourse,
    oxbows: Vec<CarveOxbow>,
    path: Vec<CarveStation>,
    seed: u32,
    intent: Intent,
    source_id: String,
    options: CarveOptions,
    settings: CarveSettings,
    metrics: CarveMetrics,
    head: CarveHead,
    closure: Option<Map>,
    group: Vec<PlacedWater>,
    removed: Vec<(usize, usize)>,
    occupants: Option<Vec<Vec<usize>>>,
    removed_keys: Vec<bool>,
    rider_tiles: Vec<usize>,
    unleashed_key: Option<usize>,
    cells: HashMap<i32, Vec<usize>>,
    cells_up_to: usize,
    active: Vec<usize>,
    active_mask: Vec<u8>,
    channel: Vec<u8>,
    visited: Vec<u16>,
    born: Vec<u16>,
    heading: f64,
    strength_depth: Option<f64>,
    depth: Option<f64>,
    bed: f64,
    energy: f64,
    split_seen: HashSet<usize>,
    ended: bool,
    tail: usize,
    quiet: usize,
    deposit_queue: Vec<usize>,
    deposit_done: bool,
    delta: Vec<i8>,
    planning: bool,
}
impl CarveState {
    fn new(
        before: &Map,
        map: Map,
        settings: &CarveSettings,
        intent: &Intent,
        keep: &[u8],
        options: CarveOptions,
        planning: bool,
    ) -> Self {
        let s = settings.clone();
        let n = map.w * map.h;
        let origin = intent.origin as usize;
        let k = strength(s.power, s.width, s.natural_width());
        let cap = if k < 1.0 {
            Some(max(2.0, round(12.0 * k)))
        } else {
            None
        };
        let depth = cap.map_or(s.depth, |c| Some(min(c, s.depth.unwrap_or(c))));
        let seed = map_seed(before);
        let character = RiverCharacter::new(before, &s, seed, intent);
        let course = CarveCourse::new(before, &s, intent);
        let mut source_id = options
            .source_id
            .clone()
            .unwrap_or_else(|| format!("carve-source-{}-{:x}", origin, seed));
        while before.entities.iter().any(|e| e.id.as_ref() == source_id) {
            source_id.push_str("-next");
        }
        let x = (origin % map.w) as f64;
        let y = (origin / map.w) as f64;
        let p = s.power / 100.0;
        let h = before.heights[origin] as f64;
        let bed = max(
            min(2.0, h),
            h - round(min(12.0, 1.0 + 6.0 * p * character.intensity)),
        );
        let energy = map.w.max(map.h) as f64 * (1.2 + 4.0 * p) * (1.0 + 0.6 * character.wander);
        let heading = course.guide(x, y);
        let head = CarveHead {
            x,
            y,
            z: h,
            dx: cos(heading),
            dy: sin(heading),
            width: character.width(0.0),
            event: "surge",
            cut: 0.0,
            lanes: vec![],
        };
        assert!(
            keep.get(origin).copied().unwrap_or(0) == 0,
            "Choose a point on the land showing"
        );
        if s.aimed {
            assert!(keep.get(intent.end as usize).copied().unwrap_or(0) == 0);
            assert!(
                s.defy || before.heights[intent.end as usize] <= before.heights[origin],
                "The end point is uphill of the start"
            );
        }
        let mut r = Self {
            map,
            original: before.heights.clone(),
            initial_water: before.depth.clone(),
            keep: if keep.is_empty() {
                vec![0; n]
            } else {
                keep.to_vec()
            },
            sediment: vec![0; n],
            bar_floor: vec![0; n],
            planned: None,
            sign: vec![0; n],
            target: before.heights.clone(),
            wear: vec![0.0; n],
            character,
            course,
            oxbows: vec![],
            path: vec![],
            seed,
            intent: Intent {
                origin: intent.origin,
                end: intent.end,
                side: intent.side,
                path: vec![],
                via: intent.via.clone(),
            },
            source_id,
            options,
            settings: s,
            metrics: CarveMetrics::default(),
            head,
            closure: None,
            group: vec![],
            removed: vec![],
            occupants: None,
            removed_keys: vec![],
            rider_tiles: vec![],
            unleashed_key: None,
            cells: HashMap::new(),
            cells_up_to: 0,
            active: vec![],
            active_mask: vec![0; n],
            channel: vec![0; n],
            visited: vec![0; n],
            born: vec![0; n],
            heading,
            strength_depth: cap,
            depth,
            bed,
            energy,
            split_seen: HashSet::new(),
            ended: false,
            tail: 0,
            quiet: 0,
            deposit_queue: vec![],
            deposit_done: false,
            delta: vec![0; n],
            planning,
        };
        r.stamp(x, y);
        if !planning && r.character.wander >= 0.85 && p * r.character.intensity >= 0.6 {
            let mut look = Self::new(
                before,
                before.clone(),
                settings,
                intent,
                keep,
                CarveOptions {
                    source_id: Some(r.source_id.clone()),
                    ..Default::default()
                },
                true,
            );
            while !look.ended && look.oxbows.is_empty() {
                look.metrics.steps += 2;
                look.advance();
            }
            r.planned = look.oxbows.first().cloned();
            if let Some(o) = &r.planned {
                r.bar_floor = carve_mouths(o, before);
            }
        }
        if !r.settings.dry {
            let strength = round(
                (0.5 + 7.5
                    * if let Some(w) = r.settings.width {
                        clamp((w - 2.8) / 10.0, 0.0, 1.0)
                    } else {
                        p
                    })
                    * 1e6,
            ) / 1e6;
            let mut occupied = vec![0; n];
            for e in &before.entities {
                for i in before.footprint(e, 0) {
                    occupied[i] = 1;
                }
            }
            let (row, wanted) = clean_source_row(
                before,
                x as usize,
                y as usize,
                strength,
                force_hash(&[seed.to_string(), origin.to_string()]),
                Point {
                    x: r.head.dx,
                    y: r.head.dy,
                },
                &occupied,
            );
            let row = if row.iter().any(|&(i, _)| i == origin) {
                row
            } else {
                vec![(origin, strength)]
            };
            let mut taken_ids = before.used_ids.clone();
            taken_ids.extend(before.entities.iter().map(|e| e.id.clone()));
            taken_ids.insert(r.source_id.clone().into());
            r.group = row
                .iter()
                .map(|&(tile, strength)| { let id = if tile == origin { r.source_id.clone().into() } else { group_member_id(&r.source_id, tile, origin, r.map.w, wanted.max(row.len()), &taken_ids) }; taken_ids.insert(id.clone()); PlacedWater {
                    id_key: usize::MAX,
                    slot: 0,
                    id,
                    tile,
                    strength,
                }})
                .collect();
            r.group.sort_by_key(|g| g.id.as_ref() != r.source_id);
            let mut slot = r
                .map
                .entities
                .iter()
                .map(|e| e.slot)
                .max()
                .map_or(0, |v| v + 1);
            let mut replacing = vec![false; r.map.next_id.get()];
            for g in &mut r.group {
                if let Some(key) = r.map.id_names.borrow().iter().position(|id| id == &g.id) {
                    g.id_key = key;
                    replacing[key] = true;
                }
            }
            r.map.entities.retain(|e| !replacing[e.id_key]);
            for g in &mut r.group {
                let e = new_water_entity(g.id.clone(), g.tile, g.strength, &r.map, slot);
                g.id_key = e.id_key;
                g.slot = e.slot;
                slot += 1;
                r.map.entities.push(e);
            }
        }
        r.removed_keys = vec![false; r.map.next_id.get()];
        r.rider_tiles = vec![usize::MAX; r.map.next_id.get()];
        for g in &r.group {
            r.rider_tiles[g.id_key] = g.tile;
        }
        for e in &r.map.entities {
            if r.options.unleashed.as_deref() == Some(e.id.as_ref()) {
                r.unleashed_key = Some(e.id_key);
            }
        }
        r
    }
    fn hard_at(&self, tile: usize, level: f64) -> bool {
        (self.map.lava[tile] & (1u32.wrapping_shl(max(0.0, level - 1.0) as u32))) != 0
    }
    fn hard(&self, level: f64, tile: usize) -> f64 {
        if !self.settings.layers {
            return 0.0;
        }
        if self.hard_at(tile, level) {
            return 1.0;
        }
        self.map.rock.get(level as usize).copied().unwrap_or(
            if portable_math::rem(level + portable_math::rem(self.seed as f64, 4.0), 4.0) == 0.0 {
                1.0
            } else {
                0.0
            },
        )
    }
    fn activate(&mut self, i: usize) {
        if self.active_mask[i] == 0 {
            self.active_mask[i] = 1;
            self.active.push(i);
        }
        if self.born[i] == 0 {
            self.born[i] = (self.metrics.steps + 1) as u16;
        }
    }
    fn stamp(&mut self, x: f64, y: f64) {
        let m = &self.map;
        let p = self.settings.power / 100.0;
        let raw = self.original[m.at(x, y)] as f64;
        let incision = round(min(12.0, 1.0 + 6.0 * p * self.character.intensity));
        let orig = self.original[self.intent.origin as usize] as f64;
        let source_bed = max(min(2.0, orig), orig - incision);
        let drop = self
            .character
            .grade(self.metrics.distance, self.settings.power);
        let old_bed = self.bed;
        let grade = max(0.0, source_bed - drop);
        self.bed = min(
            min(self.bed, grade),
            max(0.0, max(min(2.0, raw), raw - incision) - drop),
        );
        let reach = self.character.width(self.metrics.distance);
        let dx = cos(self.heading);
        let dy = sin(self.heading);
        let bend = self
            .path
            .get(self.path.len().saturating_sub(6))
            .map_or(0.0, |prior| {
                clamp(
                    angle_delta(self.heading, atan2(prior.dy, prior.dx)) / 0.9,
                    -1.0,
                    1.0,
                )
            });
        let width = reach * (1.0 - 0.22 * self.character.wander + 0.5 * bend.abs());
        let (mut lanes, knob) = self.character.lanes(x, y, dx, dy, width);
        let mut event = "surge";
        if old_bed - self.bed >= 2.0 {
            self.metrics.waterfalls += 1.0;
            event = "waterfall";
        } else if self.bed < old_bed || width < self.character.radius * 0.8 {
            self.metrics.rapids += 1.0;
            event = "rapids";
        }
        if let Some(k) = knob {
            if self.split_seen.insert(k) {
                self.metrics.splits += 1.0;
            }
            event = "split";
        }
        for lane in &mut lanes {
            lane.x += dy * reach * bend * 0.35;
            lane.y -= dx * reach * bend * 0.35;
        }
        self.path.push(CarveStation {
            x,
            y,
            bed: self.bed,
            width,
            dx,
            dy,
            bend,
            lanes: lanes.clone(),
        });
        if !self.planning {
            for lane in &lanes {
                let depth = max(1.0, raw - self.bed);
                let shoulder = if self.settings.wide {
                    depth * 0.9
                } else {
                    min(2.0, depth * 0.15)
                };
                let radius = lane.width + shoulder + 1.0;
                let w = self.map.w;
                let h = self.map.h;
                for yy in max(0.0, (lane.y - radius).floor()) as usize
                    ..=min((h - 1) as f64, (lane.y + radius).ceil()) as usize
                {
                    for xx in max(0.0, (lane.x - radius).floor()) as usize
                        ..=min((w - 1) as f64, (lane.x + radius).ceil()) as usize
                    {
                        let i = yy * w + xx;
                        if self.keep[i] != 0 || self.character.rock[i] != 0 || self.sign[i] > 0 {
                            continue;
                        }
                        let d = hypot(xx as f64 - lane.x, yy as f64 - lane.y);
                        let slope = if self.settings.wide { 1.0 } else { 4.0 };
                        let sign = if bend == 0.0 {
                            bend
                        } else if bend > 0.0 {
                            1.0
                        } else {
                            -1.0
                        };
                        let outside = ((xx as f64 - x) * dy - (yy as f64 - y) * dx) * sign;
                        let shelf = if bend.abs() > 0.3 && outside < -reach * 0.2 {
                            min(2.0, ((-outside / reach - 0.2) * bend.abs() * 2.0).ceil())
                        } else {
                            0.0
                        };
                        let scour = min(
                            2.0,
                            (max(0.0, outside / reach - 0.15) * bend.abs() * 3.0).floor(),
                        );
                        let mut t = max(0.0, self.bed - scour)
                            + shelf
                            + max(0.0, ((d - lane.width) * slope).ceil());
                        if d > lane.width && self.hard(t, i) > 0.5 {
                            t += 1.0;
                        }
                        let work = p * self.character.intensity;
                        if work < 0.45 {
                            t = max(
                                t,
                                self.original[i] as f64 - max(1.0, round(1.0 + 6.0 * work)),
                            );
                        }
                        if let Some(depth) = self.depth {
                            t = max(t, self.original[i] as f64 - depth);
                        }
                        t = max(t, self.settings.floor);
                        if t < self.target[i] as f64 {
                            self.target[i] = t as u8;
                            self.activate(i);
                        }
                        if d <= lane.width * 0.72 {
                            self.channel[i] = 1;
                        }
                    }
                }
            }
        }
        let i = self.map.at(x, y);
        self.visited[i] = self.visited[i].wrapping_add(1);
        self.head = CarveHead {
            x,
            y,
            z: self.map.heights[i] as f64 + 0.4,
            dx,
            dy,
            width,
            event,
            cut: 0.0,
            lanes,
        };
    }
    fn cut_at(&mut self, x: f64, y: f64, floor: f64, radius: f64) {
        let w = self.map.w;
        let h = self.map.h;
        for yy in max(0.0, (y - radius - 1.0).floor()) as usize
            ..=min((h - 1) as f64, (y + radius + 1.0).ceil()) as usize
        {
            for xx in max(0.0, (x - radius - 1.0).floor()) as usize
                ..=min((w - 1) as f64, (x + radius + 1.0).ceil()) as usize
            {
                let i = yy * w + xx;
                let d = hypot(xx as f64 - x, yy as f64 - y);
                let mut t = floor + (max(0.0, d - radius) * 4.0).ceil();
                if let Some(depth) = self.depth {
                    t = max(t, self.original[i] as f64 - depth);
                }
                t = max(t, self.settings.floor);
                if self.keep[i] != 0
                    || self.character.rock[i] != 0
                    || self.sign[i] > 0
                    || t >= self.target[i] as f64
                {
                    continue;
                }
                self.target[i] = max(0.0, t) as u8;
                self.activate(i);
                if d < radius * 0.8 {
                    self.channel[i] = 1;
                }
            }
        }
    }
    fn cutoff(&mut self) {
        if self.character.wander < 0.85
            || !self.oxbows.is_empty()
            || self.settings.power / 100.0 * self.character.intensity < 0.6
        {
            return;
        }
        let cut = if self.planning {
            carve_neck(&self.path, self.metrics.steps)
        } else {
            self.planned
                .as_ref()
                .filter(|o| o.end == self.path.len() - 1)
                .cloned()
        };
        let Some(cut) = cut else {
            return;
        };
        let width = min(self.path[cut.start].width, self.head.width);
        for p in &cut.neck {
            if p.x < width + 2.0
                || p.y < width + 2.0
                || p.x > self.map.w as f64 - width - 3.0
                || p.y > self.map.h as f64 - width - 3.0
            {
                return;
            }
            for dy in -(width.ceil() as i32)..=width.ceil() as i32 {
                for dx in -(width.ceil() as i32)..=width.ceil() as i32 {
                    let i = self.map.at(p.x + dx as f64, p.y + dy as f64);
                    if self.keep[i] != 0 || self.character.rock[i] != 0 {
                        return;
                    }
                }
            }
        }
        if !self.planning {
            let mut closure = self.map.clone();
            for i in 0..closure.heights.len() {
                closure.heights[i] = closure.heights[i].wrapping_sub(self.sediment[i]);
            }
            self.closure = Some(closure);
            for p in &cut.neck {
                self.cut_at(p.x, p.y, cut.floor, width * 0.75);
            }
            for p in &cut.pool {
                self.cut_at(p.x, p.y, max(0.0, cut.floor - 1.0), max(1.2, width * 0.72));
            }
            for b in &cut.bars {
                self.cut_at(b.x, b.y, cut.floor, 1.5);
            }
        }
        self.bed = min(self.bed, cut.floor);
        self.oxbows.push(cut);
        self.metrics.oxbows += 1.0;
        self.head.event = "oxbow";
    }
    fn crosses(&mut self, a: Point, b: Point) -> bool {
        while self.cells_up_to + 2 < self.path.len() {
            let k = self.cells_up_to;
            let c = &self.path[k];
            let d = &self.path[k + 1];
            for cy in (min(c.y, d.y) / 8.0).floor() as i32..=(max(c.y, d.y) / 8.0).floor() as i32 {
                for cx in
                    (min(c.x, d.x) / 8.0).floor() as i32..=(max(c.x, d.x) / 8.0).floor() as i32
                {
                    self.cells.entry(cy * 4096 + cx).or_default().push(k);
                }
            }
            self.cells_up_to += 1;
        }
        let mut seen = HashSet::new();
        for cy in (min(a.y, b.y) / 8.0).floor() as i32..=(max(a.y, b.y) / 8.0).floor() as i32 {
            for cx in (min(a.x, b.x) / 8.0).floor() as i32..=(max(a.x, b.x) / 8.0).floor() as i32 {
                for &k in self
                    .cells
                    .get(&(cy * 4096 + cx))
                    .map_or(&[][..], |v| v.as_slice())
                {
                    if !seen.insert(k) {
                        continue;
                    }
                    let c = &self.path[k];
                    let d = &self.path[k + 1];
                    if carve_cross(a, b, Point { x: c.x, y: c.y }, Point { x: d.x, y: d.y }) {
                        return true;
                    }
                }
            }
        }
        self.oxbows.iter().any(|o| {
            o.neck.windows(2).any(|p| {
                hypot(a.x - p[0].x, a.y - p[0].y) > 1e-6
                    && hypot(a.x - p[1].x, a.y - p[1].y) > 1e-6
                    && carve_cross(a, b, p[0], p[1])
            })
        })
    }
    fn end(&mut self, reason: &'static str) {
        self.ended = true;
        self.metrics.reason = reason;
    }
    fn advance(&mut self) {
        let x = self.head.x;
        let y = self.head.y;
        let w = self.map.w;
        let h = self.map.h;
        let p = self.settings.power / 100.0;
        if !self.settings.aimed
            && self.metrics.distance > 5.0
            && self.initial_water[self.map.at(x, y)] > 1.1
        {
            self.end("lake");
            return;
        }
        let goal = if self.settings.aimed {
            Some(Point {
                x: (self.intent.end as usize % w) as f64,
                y: (self.intent.end as usize / w) as f64,
            })
        } else {
            None
        };
        if let Some(goal) = goal {
            if hypot(goal.x - x, goal.y - y) < 1.8 && self.course.near_end() {
                if self.crosses(Point { x, y }, goal) {
                    self.end("power spent");
                    return;
                }
                self.heading = atan2(goal.y - y, goal.x - x);
                self.metrics.distance += hypot(goal.x - x, goal.y - y);
                self.course
                    .accept(goal.x, goal.y, self.heading, self.heading, false);
                self.stamp(goal.x, goal.y);
                self.end("destination");
                return;
            }
        }
        let nav = self.course.plan(x, y, &self.character);
        let mut best = f64::NEG_INFINITY;
        let mut best_a = nav.bearing;
        let mut best_x = x;
        let mut best_y = y;
        let mut angles = vec![nav.bearing, nav.preferred];
        angles.extend((-11..=11).map(|k| nav.bearing + k as f64 * 0.165));
        for a in angles {
            if angle_delta(a, nav.bearing).abs() > (110.0 * std::f64::consts::PI) / 180.0 {
                continue;
            }
            let dx = cos(a);
            let dy = sin(a);
            let nx = x + dx * 1.35;
            let ny = y + dy * 1.35;
            if nx < 0.0 || ny < 0.0 || nx > (w - 1) as f64 || ny > (h - 1) as f64 {
                if goal.is_none() && angle_delta(a, nav.bearing).abs() < 0.01 {
                    self.end("map edge");
                    return;
                }
                continue;
            }
            let i = self.map.at(nx, ny);
            let cost = self.course.cost(nx, ny);
            if self.keep[i] != 0
                || cost >= nav.deadline
                || (nav.straight && cost >= nav.cost - 0.005)
            {
                continue;
            }
            if self.crosses(Point { x, y }, Point { x: nx, y: ny }) {
                continue;
            }
            let far_tile = self.map.at(nx + dx * 5.0, ny + dy * 5.0);
            let far = self.original[far_tile] as f64;
            let here = self.original[self.map.at(x, y)] as f64;
            let resistance =
                max(0.0, far - here) * (1.0 + self.hard(far, far_tile) * 2.0) * (1.0 - p)
                    + if self.settings.layers && self.hard_at(far_tile, far) {
                        12.0 * (1.0 - p)
                    } else {
                        0.0
                    };
            let score = 12.0 * cos(angle_delta(a, nav.preferred))
                + 3.0 * cos(angle_delta(a, self.heading))
                + (here - far) * 0.35 * (1.0 - p)
                - resistance
                - self.visited[i] as f64 * 2.0;
            if score > best {
                best = score;
                best_a = a;
                best_x = nx;
                best_y = ny;
            }
        }
        if best == f64::NEG_INFINITY {
            self.end("power spent");
            return;
        }
        let ahead = self.map.at(best_x, best_y);
        let climb = max(
            0.0,
            self.original[ahead] as f64 - self.original[self.map.at(x, y)] as f64,
        );
        self.energy -= 1.0 + climb * (1.0 - p) * 8.0;
        if self.energy <= 0.0 || self.metrics.distance > 3.0 * (w + h) as f64 {
            self.end("power spent");
            return;
        }
        if p < 0.28
            && self.original[ahead] as f64 - self.bed > 4.0
            && self.hard(self.original[ahead] as f64, ahead) > 0.5
        {
            self.end("power spent");
            return;
        }
        let fall = self.original[self.map.at(x, y)] as f64 - self.original[ahead] as f64;
        let lake = self.initial_water[ahead] > 1.1;
        let turn = angle_delta(best_a, self.heading).abs();
        if turn > 0.15 {
            self.metrics.bend_cuts += 1.0;
        }
        self.heading = best_a;
        self.metrics.distance += 1.35;
        self.course
            .accept(best_x, best_y, best_a, nav.bearing, nav.straight);
        self.stamp(best_x, best_y);
        self.cutoff();
        if self.head.event == "surge" {
            self.head.event = if fall > 1.0 {
                "waterfall"
            } else if climb > 0.0 {
                "breakthrough"
            } else {
                "surge"
            };
        }
        if !self.settings.aimed && lake {
            self.end("lake");
        }
    }
}
fn clean_source_row(
    m: &Map,
    x: usize,
    y: usize,
    strength: f64,
    seed: u32,
    mut flow: Point,
    occupied: &[u8],
) -> (Vec<(usize, f64)>, usize) {
    // sourceGroups.flowAt: an explicit zero vector falls back to the edge,
    // then the surrounding ground. These force callers supply no outflow.
    if flow.x == 0.0 && flow.y == 0.0 {
        let on_x = x == 0 || x == m.w - 1;
        let on_y = y == 0 || y == m.h - 1;
        if on_x != on_y {
            flow = if on_x {
                Point { x: 1.0, y: 0.0 }
            } else {
                Point { x: 0.0, y: 1.0 }
            };
        } else if !on_x {
            let z = m.heights[y * m.w + x] as f64;
            for dy in -2..=2isize {
                for dx in -2..=2isize {
                    let xx = x as isize + dx;
                    let yy = y as isize + dy;
                    if xx < 0 || yy < 0 || xx >= m.w as isize || yy >= m.h as isize {
                        continue;
                    }
                    let d = z - m.heights[yy as usize * m.w + xx as usize] as f64;
                    flow.x += d * dx as f64;
                    flow.y += d * dy as f64;
                }
            }
        }
    }
    let mut rng = ForceRng::new(force_hash(&[
        seed.to_string(),
        "sourceGroup".into(),
        "water".into(),
        x.to_string(),
        y.to_string(),
    ]));
    let u = rng.float();
    let side = rng.float();
    let axis = rng.float();
    let band: &[(usize, f64)] = if strength < 1.25 {
        &[(2, 4.0), (3, 2.0), (4, 1.0)]
    } else if strength < 2.25 {
        &[(2, 1.0), (3, 8.0), (4, 2.0)]
    } else if strength < 3.25 {
        &[(2, 1.0), (3, 4.0), (4, 0.5), (5, 3.0)]
    } else {
        &[(3, 1.0), (4, 0.5), (5, 3.0)]
    };
    let mut sum = 0.0;
    for &(_, w) in band {
        sum += w;
    }
    let mut r = u * sum;
    let mut count = band.last().unwrap().0;
    for &(c, w) in band {
        r -= w;
        if r < 0.0 {
            count = c;
            break;
        }
    }
    let most = max(1.0, (strength / 0.25 + 1e-9).floor());
    let least = (strength / 8.0 - 1e-9).ceil();
    let wanted = min(16.0, max(least, min(count as f64, most))) as i32;
    let a = y * m.w + x;
    let z = m.heights[a];
    if occupied[a] != 0 {
        return (vec![], wanted as usize);
    }
    let axes = if flow.x.abs() > flow.y.abs() {
        vec![(0, 1)]
    } else if flow.y.abs() > flow.x.abs() {
        vec![(1, 0)]
    } else if axis < 0.5 {
        vec![(1, 0), (0, 1)]
    } else {
        vec![(0, 1), (1, 0)]
    };
    let fits = |xx: i32, yy: i32| {
        xx >= 0
            && yy >= 0
            && xx < m.w as i32
            && yy < m.h as i32
            && occupied[yy as usize * m.w + xx as usize] == 0
            && m.heights[yy as usize * m.w + xx as usize] == z
    };
    let mut best = None;
    for (ex, ey) in axes {
        let mut lo = 0;
        let mut hi = 0;
        let mut lop = true;
        let mut hip = true;
        while 1 + lo + hi < wanted && (lop || hip) {
            let tohi = hip && (!lop || hi < lo || (hi == lo && side < 0.5));
            if tohi {
                if fits(x as i32 + ex * (hi + 1), y as i32 + ey * (hi + 1)) {
                    hi += 1;
                } else {
                    hip = false;
                }
            } else if fits(x as i32 - ex * (lo + 1), y as i32 - ey * (lo + 1)) {
                lo += 1;
            } else {
                lop = false;
            }
        }
        if best.map_or(true, |(_, _, l, h)| lo + hi > l + h) {
            best = Some((ex, ey, lo, hi));
        }
    }
    let (ex, ey, lo, hi) = best.unwrap();
    let n = (1 + lo + hi) as usize;
    let t = round(min(strength, n as f64 * 8.0) * 1000.0);
    let base = (t / n as f64).floor();
    let mut rem = t - base * n as f64;
    let mut shares = vec![base; n];
    let low = (n - 1) / 2;
    let high = n / 2;
    for d in 0..n {
        if d <= low && rem > 0.0 {
            shares[low - d] += 1.0;
            rem -= 1.0;
        }
        if high + d < n && high + d != low.saturating_sub(d) && rem > 0.0 {
            shares[high + d] += 1.0;
            rem -= 1.0;
        }
    }
    let sources = (-lo..=hi)
        .enumerate()
        .map(|(j, k)| {
            (
                ((y as i32 + ey * k) as usize) * m.w + (x as i32 + ex * k) as usize,
                shares[j] / 1000.0,
            )
        })
        .collect();
    (sources, wanted as usize)
}
impl CarveState {
    fn plan_deposit(&mut self) {
        self.deposit_done = true;
        let h = &self.head;
        let mut seen = vec![false; self.original.len()];
        let surface = self.original[self.map.at(h.x, h.y)] as f64
            + max(1.0, self.initial_water[self.map.at(h.x, h.y)]);
        for d in 2..=(h.width * 3.0 + 6.0).floor() as i32 {
            for s in -((d as f64 * 0.7).ceil() as i32)..=(d as f64 * 0.7).ceil() as i32 {
                if (s as f64).abs() < h.width * 0.65 {
                    continue;
                }
                let xx = round(h.x + h.dx * d as f64 - h.dy * s as f64);
                let yy = round(h.y + h.dy * d as f64 + h.dx * s as f64);
                if xx < 0.0 || yy < 0.0 || xx >= self.map.w as f64 || yy >= self.map.h as f64 {
                    continue;
                }
                let i = yy as usize * self.map.w + xx as usize;
                if self.keep[i] != 0
                    || self.character.rock[i] != 0
                    || self.sign[i] < 0
                    || self.channel[i] != 0
                    || self.target[i] < self.original[i]
                    || self.map.heights[i] as f64 >= self.map.ceiling
                {
                    continue;
                }
                if (self.map.heights[i] as f64) < surface
                    && (s as f64).abs() > h.width * 0.65
                    && !seen[i]
                {
                    seen[i] = true;
                    self.deposit_queue.push(i);
                }
            }
        }
    }
    fn reject_isolated(&mut self, touched: &[usize]) {
        let w = self.map.w;
        let h = self.map.h;
        let n = w * h;
        let mut marked = vec![];
        let mut mask = vec![false; n];
        for &i in touched {
            if self.delta[i] == 0 {
                continue;
            }
            for j in [
                i as isize,
                i as isize - w as isize,
                i as isize - 1,
                i as isize + 1,
                i as isize + w as isize,
            ] {
                if j >= 0 && (j as usize) < n && !mask[j as usize] {
                    mask[j as usize] = true;
                    marked.push(j as usize);
                }
            }
        }
        let mut again = true;
        while again {
            again = false;
            for &i in &marked {
                if i % w == 0 || i % w == w - 1 || i < w || i >= w * (h - 1) {
                    continue;
                }
                let ns = [i - w, i - 1, i + 1, i + w];
                let v = self.map.heights[i] as i32 + self.delta[i] as i32;
                let mut lo = i32::MAX;
                let mut hi = i32::MIN;
                let mut oldlo = u8::MAX;
                let mut oldhi = 0u8;
                for &j in &ns {
                    let val = self.map.heights[j] as i32 + self.delta[j] as i32;
                    lo = lo.min(val);
                    hi = hi.max(val);
                    oldlo = oldlo.min(self.map.heights[j]);
                    oldhi = oldhi.max(self.map.heights[j]);
                }
                if (v < lo && self.map.heights[i] >= oldlo)
                    || (v > hi && self.map.heights[i] <= oldhi)
                {
                    if self.delta[i] != 0 {
                        self.delta[i] = 0;
                        again = true;
                    } else {
                        for &j in &ns {
                            if self.delta[j] != 0 {
                                self.delta[j] = 0;
                                again = true;
                            }
                        }
                    }
                }
            }
        }
    }
    fn drop_objects(&mut self, changed: &[usize]) {
        if self.occupants.is_none() {
            let mut o = vec![vec![]; self.original.len()];
            for e in &self.map.entities {
                for i in self.map.footprint(e, 0) {
                    o[i].push(e.id_key);
                }
            }
            self.occupants = Some(o);
        }
        let o = self.occupants.as_ref().unwrap();
        let mut hit = vec![false; self.removed_keys.len()];
        for &i in changed {
            for id in &o[i] {
                hit[*id] = true;
            }
        }
        if !hit
            .iter()
            .enumerate()
            .any(|(key, &hit)| hit && !self.removed_keys[key])
        {
            return;
        }
        let mut entities = std::mem::take(&mut self.map.entities);
        entities.retain(|e| {
            let rider =
                self.rider_tiles[e.id_key] != usize::MAX || self.unleashed_key == Some(e.id_key);
            if e.template.as_ref() == "StartingLocation" || rider || !hit[e.id_key] {
                true
            } else {
                if !self.removed_keys[e.id_key] {
                    self.removed.push((e.id_key, self.metrics.steps));
                    self.removed_keys[e.id_key] = true;
                }
                false
            }
        });
        for e in &mut entities {
            let tile = self.rider_tiles[e.id_key];
            if tile != usize::MAX {
                e.z = self.map.heights[tile] as f64;
            } else if self.unleashed_key == Some(e.id_key) {
                e.z = self.map.heights[e.y as usize * self.map.w + e.x as usize] as f64;
            }
        }
        self.map.entities = entities;
    }
    fn step(&mut self) -> Vec<usize> {
        if self.metrics.stable {
            return vec![];
        }
        self.metrics.steps += 1;
        let p = self.settings.power / 100.0;
        if !self.ended && self.metrics.steps % 2 == 0 {
            self.advance();
        }
        let mut touched = vec![];
        let mut infill = vec![];
        let mut active = std::mem::take(&mut self.active);
        active.retain(|&i| {
            let h = self.map.heights[i] as i32 - self.sediment[i] as i32;
            if h <= self.target[i] as i32 {
                self.active_mask[i] = 0;
                return false;
            }
            let age = self.metrics.steps as i32 - self.born[i] as i32;
            let bank = self.channel[i] == 0;
            if bank && age < 4 {
                return true;
            }
            let hard = self.hard(h as f64, i);
            let coefficient = if bank {
                1.0 - 0.8 * hard
            } else {
                1.0 - 0.85 * hard
            };
            self.wear[i] += (0.75 + 2.4 * p)
                * min(2.0, self.character.intensity)
                * coefficient
                * if bank { 0.65 } else { 1.0 };
            if self.wear[i] >= 1.0 {
                if self.bar_floor[i] != 0 && self.map.heights[i] <= self.bar_floor[i] {
                    infill.push(i);
                } else {
                    self.delta[i] = -1;
                    touched.push(i);
                }
            }
            true
        });
        self.active = active;
        if self.ended {
            self.tail += 1;
            if !self.deposit_done {
                self.plan_deposit();
            }
            let mut count = 0;
            for &i in &self.deposit_queue {
                if self.sign[i] == 0 && self.metrics.suspended > count as f64 && count < 32 {
                    if self.delta[i] == 0 {
                        touched.push(i);
                    }
                    self.delta[i] = 1;
                    count += 1;
                }
            }
        }
        touched.sort_unstable();
        self.reject_isolated(&touched);
        let mut changed = vec![];
        let mut front = 0.0;
        for &i in &touched {
            let d = self.delta[i];
            if d == 0 {
                continue;
            }
            self.map.heights[i] = self.map.heights[i].wrapping_add(d as u8);
            self.map.lava[i] &= mask(self.map.heights[i]);
            self.sign[i] = d;
            changed.push(i);
            if d < 0 {
                self.metrics.cut += 1.0;
                self.metrics.suspended += 1.0;
                self.wear[i] = max(0.0, self.wear[i] - 1.0);
                if self.channel[i] == 0 {
                    self.metrics.bank_cuts += 1.0;
                }
                if hypot(
                    (i % self.map.w) as f64 - self.head.x,
                    (i / self.map.w) as f64 - self.head.y,
                ) < self.head.width + 2.0
                {
                    front += 1.0;
                }
            } else {
                self.metrics.deposited += 1.0;
                self.metrics.suspended -= 1.0;
            }
        }
        for &i in &infill {
            self.sediment[i] = self.sediment[i].wrapping_add(1);
            self.metrics.cut += 1.0;
            self.metrics.deposited += 1.0;
            self.wear[i] = max(0.0, self.wear[i] - 1.0);
        }
        self.head.cut = front;
        let mut z = f64::INFINITY;
        for lane in &self.head.lanes {
            z = min(z, self.map.heights[self.map.at(lane.x, lane.y)] as f64);
        }
        self.head.z = z + 0.7;
        if front > 60.0 && self.head.event == "surge" {
            self.head.event = "breakthrough";
        } else if front == 0.0 && !self.active.is_empty() {
            self.head.event = "rock";
        }
        for &i in &touched {
            self.delta[i] = 0;
        }
        if !changed.is_empty() {
            self.drop_objects(&changed);
        }
        self.quiet = if !changed.is_empty() || !infill.is_empty() {
            0
        } else {
            self.quiet + 1
        };
        if self.ended && (self.active.is_empty() || self.quiet >= 24 || self.tail >= 220) {
            self.metrics.stable = true;
            let shaped = if self.planning {
                vec![]
            } else {
                self.shape_river()
            };
            if !shaped.is_empty() {
                for &i in &shaped {
                    self.map.lava[i] &= mask(self.map.heights[i]);
                }
                self.drop_objects(&shaped);
                changed.extend(shaped);
            }
            if self.metrics.reason == "map edge" {
                self.metrics.exported = self.metrics.suspended;
                self.metrics.suspended = 0.0;
            }
        }
        changed
    }
    fn oxbow_basin(&self) -> Vec<usize> {
        let Some(cut) = self.oxbows.first() else {
            return vec![];
        };
        let level = min(cut.bars[0].level, cut.bars[1].level);
        let at = |x: f64, y: f64| round(y) as usize * self.map.w + round(x) as usize;
        let p = &cut.pool[cut.pool.len() / 2];
        let start = at(p.x, p.y);
        if self.map.heights[start] as f64 >= level {
            return vec![];
        }
        let mut seen = vec![false; self.original.len()];
        seen[start] = true;
        let mut q = vec![start];
        let mut k = 0;
        while k < q.len() {
            let i = q[k];
            k += 1;
            let x = i % self.map.w;
            let y = i / self.map.w;
            for j in [
                if y > 0 {
                    i as isize - self.map.w as isize
                } else {
                    -1
                },
                if x > 0 { i as isize - 1 } else { -1 },
                if x < self.map.w - 1 {
                    (i + 1) as isize
                } else {
                    -1
                },
                if y < self.map.h - 1 {
                    (i + self.map.w) as isize
                } else {
                    -1
                },
            ] {
                if j >= 0 && !seen[j as usize] && (self.map.heights[j as usize] as f64) < level {
                    seen[j as usize] = true;
                    q.push(j as usize);
                }
            }
        }
        if cut.neck.iter().any(|p| seen[at(p.x, p.y)]) || seen[self.intent.origin as usize] {
            vec![]
        } else {
            q
        }
    }
    fn shape_set(&mut self, i: usize, level: f64, exempt: &[u8]) {
        if exempt[i] != 0 {
            return;
        }
        let h = self.map.heights[i] as f64;
        let carved = self.map.heights[i] < self.original[i];
        let mut v = if carved {
            min(self.original[i] as f64, level)
        } else {
            min(h, level)
        };
        v = max(v, min(h, self.settings.floor));
        if let Some(d) = self.strength_depth {
            v = max(v, min(h, self.original[i] as f64 - d));
        }
        self.map.heights[i] = v as u8;
    }
    fn shape_river(&mut self) -> Vec<usize> {
        if self.settings.dry && self.options.unleashed.is_none() {
            return vec![];
        }
        let depth = self.settings.river_depth;
        let banks = self.settings.banks;
        if depth.is_none() && banks == 0.0 {
            return vec![];
        }
        let before = self.map.heights.clone();
        let n = before.len();
        let w = self.map.w;
        let h = self.map.h;
        let mut exempt = vec![0; n];
        for i in self.oxbow_basin() {
            exempt[i] = 1;
        }
        for i in 0..n {
            if self.keep[i] != 0 || self.sediment[i] != 0 || self.character.rock[i] != 0 {
                exempt[i] = 1;
            }
        }
        if let Some(depth) = depth {
            let spill = force_spill(&force_water_model(&self.map));
            for i in 0..n {
                if self.map.heights[i] < self.original[i]
                    && spill[i] - self.map.heights[i] as f64 > depth - 1.0 + 0.01
                {
                    self.shape_set(i, (spill[i] - depth + 1.0 - 1e-6).ceil(), &exempt);
                }
            }
        }
        if banks > 0.0 && self.path.len() > 1 {
            let count = self.path.len();
            let mut bed = vec![0.0; count];
            for k in 0..count {
                let st = &self.path[k];
                bed[k] = min(
                    if k > 0 { bed[k - 1] } else { f64::INFINITY },
                    self.map.heights[self.map.at(st.x, st.y)] as f64,
                );
            }
            let mut dist = vec![f32::INFINITY; n];
            let mut near = vec![-1i32; n];
            let mut side = vec![0i8; n];
            let reach = banks * 1.8 + 14.0;
            for k in 0..count - 1 {
                let a = &self.path[k];
                let b = &self.path[k + 1];
                let radius = a.width * 0.72 + reach;
                for y in max(0.0, (min(a.y, b.y) - radius).floor()) as usize
                    ..=min((h - 1) as f64, (max(a.y, b.y) + radius).ceil()) as usize
                {
                    for x in max(0.0, (min(a.x, b.x) - radius).floor()) as usize
                        ..=min((w - 1) as f64, (max(a.x, b.x) + radius).ceil()) as usize
                    {
                        let i = y * w + x;
                        let ex = b.x - a.x;
                        let ey = b.y - a.y;
                        let l2 = ex * ex + ey * ey;
                        let raw = if l2 != 0.0 {
                            ((x as f64 - a.x) * ex + (y as f64 - a.y) * ey) / l2
                        } else {
                            0.0
                        };
                        if (k == 0 && raw < 0.0) || (k == count - 2 && raw > 1.0) {
                            continue;
                        }
                        let t = clamp(raw, 0.0, 1.0);
                        let px = a.x + ex * t;
                        let py = a.y + ey * t;
                        let d = hypot(x as f64 - px, y as f64 - py);
                        if d >= dist[i] as f64 {
                            continue;
                        }
                        dist[i] = d as f32;
                        near[i] = if t > 0.5 { k as i32 + 1 } else { k as i32 };
                        side[i] = if a.dx * (y as f64 - a.y) - a.dy * (x as f64 - a.x) >= 0.0 {
                            1
                        } else {
                            -1
                        };
                    }
                }
            }
            let seed = force_hash(&[
                self.seed.to_string(),
                (self.intent.origin as usize).to_string(),
                "18".into(),
            ]);
            let mut widths = vec![[0.0; 2]; count];
            for k in 0..count {
                for (j, sd) in [-1, 1].iter().enumerate() {
                    let u = k as f64 / 9.0;
                    let q = u.floor() as i32;
                    let f = u - q as f64;
                    let r = |q: i32| {
                        portable_math::rem(
                            force_hash(&[seed.to_string(), q.to_string(), sd.to_string()]) as f64,
                            1000.0,
                        ) / 1000.0
                    };
                    let e = f * f * (3.0 - 2.0 * f);
                    let swell = 0.75 + 0.5 * (r(q) * (1.0 - e) + r(q + 1) * e);
                    let st = &self.path[k];
                    let inside = st.bend * (*sd as f64) > 0.0;
                    let lean = 1.0 + 0.75 * st.bend.abs() * if inside { 1.0 } else { -1.0 };
                    widths[k][j] = clamp(banks * lean * swell, 0.0, banks * 1.8);
                }
            }
            let mut head = vec![0; n];
            for g in &self.group {
                let gx = g.tile % w;
                let gy = g.tile / w;
                for y in gy.saturating_sub(1)..=(gy + 1).min(h - 1) {
                    for x in gx.saturating_sub(1)..=(gx + 1).min(w - 1) {
                        head[y * w + x] = 1;
                    }
                }
            }
            let carved = self.map.heights.clone();
            let depth = max(2.0, depth.unwrap_or(2.0));
            for i in 0..n {
                if near[i] < 0 {
                    continue;
                }
                let k = near[i] as usize;
                let st = &self.path[k];
                let r = st.width * 0.72;
                let bw = widths[k][if side[i] > 0 { 1 } else { 0 }];
                let d = dist[i] as f64;
                let level = bed[k] + depth;
                if d <= r || head[i] != 0 {
                    self.shape_set(i, level - depth, &exempt);
                } else if d <= r + bw {
                    self.shape_set(i, level, &exempt);
                } else if d <= r + bw + 14.0 {
                    let x = i % w;
                    let y = i / w;
                    let f = (d - bw) / d;
                    let sx =
                        clamp(round(st.x + (x as f64 - st.x) * f), 0.0, (w - 1) as f64) as usize;
                    let sy =
                        clamp(round(st.y + (y as f64 - st.y) * f), 0.0, (h - 1) as f64) as usize;
                    let wall = max(level, carved[sy * w + sx] as f64);
                    if wall < (self.map.heights[i] as f64) || (self.map.heights[i] as f64) < level {
                        self.shape_set(i, wall, &exempt);
                    }
                }
            }
        }
        (0..n)
            .filter(|&i| self.map.heights[i] != before[i])
            .collect()
    }
}
const CARVE_REASONS: [&str; 5] = ["", "power spent", "destination", "map edge", "lake"];
fn carve_metrics_record(m: &CarveMetrics) -> [f64; 14] {
    [
        m.cut,
        m.deposited,
        m.exported,
        m.suspended,
        m.bank_cuts,
        m.bend_cuts,
        m.steps as f64,
        m.stable as u8 as f64,
        m.distance,
        m.splits,
        m.waterfalls,
        m.rapids,
        m.oxbows,
        CARVE_REASONS.iter().position(|&s| s == m.reason).unwrap() as f64,
    ]
}
struct CarveRecords {
    initial_entities: Vec<Entity>,
    raw_changes: Vec<i32>,
    raw_offsets: Vec<u32>,
    step_metrics: Vec<f64>,
    step_object_changes: Vec<f64>,
    oxbows: Vec<CarveOxbow>,
    oxbow_basin: Vec<usize>,
    retained: Option<RetainedWater>,
    unleashed: Option<String>,
    bad: bool,
    total: usize,
    metrics: [f64; 13],
    reason: &'static str,
    changes: Vec<i32>,
    change_offsets: Vec<u32>,
    heads: Vec<f64>,
    head_offsets: Vec<u32>,
    path: Vec<f64>,
    path_offsets: Vec<u32>,
    lengths: Vec<u32>,
    removed: Vec<(u32, usize)>,
    spread: Vec<(u32, usize)>,
    group: Vec<PlacedWater>,
    closure: Option<Map>,
    strength_depth: Option<f64>,
    // Read by the core's contract tests, never packed: the river's hard rock cores (x, y, radius each), the
    // map's rock under it, the sediment laid in each tile, and a drawn path's curve (x, y, s each).
    knobs: Vec<f64>,
    rock: Vec<u8>,
    sediment: Vec<u8>,
    curve: Vec<f64>,
}
const CARVE_EVENTS: [&str; 8] = [
    "surge",
    "waterfall",
    "rapids",
    "split",
    "oxbow",
    "breakthrough",
    "rock",
    "",
];
fn carve_head_record(h: &CarveHead, out: &mut Vec<f64>) {
    out.extend([
        h.x,
        h.y,
        h.z,
        h.dx,
        h.dy,
        h.width,
        CARVE_EVENTS.iter().position(|&v| v == h.event).unwrap() as f64,
        h.cut,
        h.lanes.len() as f64,
    ]);
    for l in &h.lanes {
        out.extend([l.x, l.y, l.width]);
    }
}
fn carve_head_value(r: &[f64]) -> V {
    let mut v = json!({"x":r[0],"y":r[1],"z":r[2],"dx":r[3],"dy":r[4],"width":r[5],"event":CARVE_EVENTS[r[6] as usize],"cut":r[7]});
    if r[8] > 0.0 {
        v["lanes"] = json!(r[9..]
            .chunks_exact(3)
            .map(|a| json!({"x":a[0],"y":a[1],"width":a[2]}))
            .collect::<Vec<_>>());
    }
    v
}
fn carve_metrics_value(m: &[f64]) -> V {
    json!({"cut":m[0],"deposited":m[1],"exported":m[2],"suspended":m[3],"bankCuts":m[4],"bendCuts":m[5],"steps":m[6],"stable":m[7]!=0.0,"distance":m[8],"reason":CARVE_REASONS[m[13] as usize],"splits":m[9],"waterfalls":m[10],"rapids":m[11],"oxbows":m[12]})
}
fn carve_oxbow_value(o: &CarveOxbow) -> V {
    json!({"start":o.start,"end":o.end,"step":o.step,"floor":o.floor,"neck":o.neck.iter().map(Point::value).collect::<Vec<_>>(),"pool":o.pool.iter().map(|p|json!({"x":p.x,"y":p.y,"bed":p.bed,"width":p.width,"dx":p.dx,"dy":p.dy,"bend":p.bend,"lanes":p.lanes.iter().map(|l|json!({"x":l.x,"y":l.y,"width":l.width})).collect::<Vec<_>>()})).collect::<Vec<_>>(),"bars":o.bars.iter().map(|b|json!({"x":b.x,"y":b.y,"dx":b.dx,"dy":b.dy,"width":b.width,"level":b.level})).collect::<Vec<_>>()})
}
impl CarveRecords {
    fn value(&self) -> V {
        let m = &self.metrics;
        let id = |slot: u32| {
            self.initial_entities
                .iter()
                .find(|e| e.slot == slot)
                .unwrap()
                .id
                .as_ref()
        };
        json!({"metrics":{"cut":m[0],"deposited":m[1],"exported":m[2],"suspended":m[3],"bankCuts":m[4],"bendCuts":m[5],"steps":m[6],"stable":m[7]!=0.0,"distance":m[8],"reason":self.reason,"splits":m[9],"waterfalls":m[10],"rapids":m[11],"oxbows":m[12]},"total":self.total,
        "changes":self.change_offsets.windows(2).map(|w|self.changes[w[0] as usize..w[1] as usize].to_vec()).collect::<Vec<_>>(),
        "heads":self.head_offsets.windows(2).map(|w|carve_head_value(&self.heads[w[0] as usize..w[1] as usize])).collect::<Vec<_>>(),"lengths":self.lengths,
        "path":self.path_offsets.windows(2).map(|w|{let r=&self.path[w[0] as usize..w[1] as usize];json!({"x":r[0],"y":r[1],"bed":r[2],"width":r[3],"dx":r[4],"dy":r[5],"bend":r[6],"lanes":r[8..].chunks_exact(3).map(|a|json!({"x":a[0],"y":a[1],"width":a[2]})).collect::<Vec<_>>()})}).collect::<Vec<_>>(),
        "initialEntities":self.initial_entities.iter().map(Entity::value).collect::<Vec<_>>(),
        "rawChanges":self.raw_offsets.windows(2).map(|w|self.raw_changes[w[0] as usize..w[1] as usize].to_vec()).collect::<Vec<_>>(),
        "stepMetrics":self.step_metrics.chunks_exact(14).map(carve_metrics_value).collect::<Vec<_>>(),
        "stepObjectChanges":self.step_object_changes.chunks_exact(5).map(|v|json!({"step":v[0],"id":self.initial_entities.iter().find(|e|e.slot==v[1] as u32).unwrap().id.as_ref(),"x":v[2],"y":v[3],"z":v[4]})).collect::<Vec<_>>(),
        "oxbows":self.oxbows.iter().map(carve_oxbow_value).collect::<Vec<_>>(),"oxbowBasin":self.oxbow_basin,"retained":self.retained.as_ref().map(|r|json!({"tiles":r.tiles,"floor":r.floor,"depth":r.depth,"contamination":r.contamination})),"unleashedId":self.unleashed,"badwater":self.bad,
        "removedAt":self.removed.iter().map(|(slot,s)|json!([id(*slot),s])).collect::<Vec<_>>(),"goneSpread":self.spread.iter().map(|(slot,s)|json!([id(*slot),s])).collect::<Vec<_>>(),"group":self.group.iter().map(|g|json!({"id":g.id.as_ref(),"tile":g.tile,"strength":g.strength})).collect::<Vec<_>>(),"closure":self.closure.as_ref().map(Map::value),"strengthDepth":self.strength_depth})
    }
}
fn carve(
    before: &Map,
    map: Map,
    s: &CarveSettings,
    i: &Intent,
    keep: &[u8],
    options: CarveOptions,
) -> Plan {
    let mut run = CarveState::new(before, map, s, i, keep, options, false);
    let objects = run.map.entities.clone();
    let mut raw_changes = vec![];
    let mut raw_offsets = vec![0, 0];
    let mut step_metrics = carve_metrics_record(&run.metrics).to_vec();
    let extent = objects
        .iter()
        .map(|e| e.slot as usize + 1)
        .max()
        .unwrap_or(0);
    let mut riders = vec![false; extent];
    let mut positions = vec![[0.0; 3]; extent];
    let mut first_by_key = vec![usize::MAX; run.map.next_id.get()];
    for (index, e) in objects.iter().enumerate() {
        if first_by_key[e.id_key] == usize::MAX {
            first_by_key[e.id_key] = index;
        }
        riders[e.slot as usize] =
            run.rider_tiles[e.id_key] != usize::MAX || run.unleashed_key == Some(e.id_key);
        positions[e.slot as usize] = [e.x, e.y, e.z];
    }
    let mut step_object_changes = vec![];
    let mut changes: Vec<Vec<i32>> = vec![vec![]];
    let mut heads = vec![];
    let mut head_offsets = vec![0];
    carve_head_record(&run.head, &mut heads);
    head_offsets.push(heads.len() as u32);
    let mut lengths = vec![run.path.len() as u32];
    while !run.metrics.stable {
        let changed = run.step();
        let mut c = Vec::with_capacity(changed.len() * 2);
        for i in changed {
            c.push(i as i32);
            c.push(run.map.heights[i] as i32);
        }
        raw_changes.extend_from_slice(&c);
        raw_offsets.push(raw_changes.len() as u32);
        step_metrics.extend(carve_metrics_record(&run.metrics));
        for e in &run.map.entities {
            let i = e.slot as usize;
            if riders[i] && positions[i] != [e.x, e.y, e.z] {
                step_object_changes.extend([run.metrics.steps as f64, i as f64, e.x, e.y, e.z]);
                positions[i] = [e.x, e.y, e.z];
            }
        }
        changes.push(c);
        carve_head_record(&run.head, &mut heads);
        head_offsets.push(heads.len() as u32);
        lengths.push(run.path.len() as u32);
    }
    let total = changes.len() - 1;
    let mut spread = vec![];
    if total >= 2 && !changes[total].is_empty() && run.path.len() >= 2 {
        let n = run.original.len();
        let mut earlier = vec![0; n];
        for step in 1..total {
            for c in changes[step].chunks_exact(2) {
                earlier[c[0] as usize] = step;
            }
        }
        let mut reached = vec![total; run.path.len()];
        let mut k = 0;
        for step in 1..=total {
            while k < (lengths[step] as usize).min(run.path.len()) {
                reached[k] = step;
                k += 1;
            }
        }
        let mut at = vec![-1i32; n];
        let mut by = vec![vec![]; total + 1];
        for c in changes[total].chunks_exact(2) {
            let i = c[0] as usize;
            let x = (i % run.map.w) as f64 + 0.5;
            let y = (i / run.map.w) as f64 + 0.5;
            let mut near = 0;
            let mut best = f64::INFINITY;
            for (k, p) in run.path.iter().enumerate() {
                let d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
                if d < best {
                    best = d;
                    near = k;
                }
            }
            let step = total.min(reached[(near + 6).min(run.path.len() - 1)].max(earlier[i] + 1));
            at[i] = step as i32;
            by[step].extend_from_slice(c);
        }
        for step in 1..=total {
            if step == total {
                changes[step] = std::mem::take(&mut by[step]);
            } else {
                changes[step].append(&mut by[step]);
            }
        }
        for (key, step) in &run.removed {
            if *step != total {
                continue;
            }
            let index = first_by_key[*key];
            if index != usize::MAX {
                let e = &objects[index];
                let t = at[e.y as usize * run.map.w + e.x as usize];
                if t > 0 {
                    spread.push((e.slot, t as usize));
                }
            }
        }
    }
    let mut change_offsets = vec![0];
    let mut flat_changes = vec![];
    for mut c in changes {
        flat_changes.append(&mut c);
        change_offsets.push(flat_changes.len() as u32);
    }
    let mut path = vec![];
    let mut path_offsets = vec![0];
    for p in &run.path {
        path.extend([
            p.x,
            p.y,
            p.bed,
            p.width,
            p.dx,
            p.dy,
            p.bend,
            p.lanes.len() as f64,
        ]);
        for l in &p.lanes {
            path.extend([l.x, l.y, l.width]);
        }
        path_offsets.push(path.len() as u32);
    }
    let m = &run.metrics;
    let metrics = [
        m.cut,
        m.deposited,
        m.exported,
        m.suspended,
        m.bank_cuts,
        m.bend_cuts,
        m.steps as f64,
        m.stable as u8 as f64,
        m.distance,
        m.splits,
        m.waterfalls,
        m.rapids,
        m.oxbows,
    ];
    let oxbow_basin = run.oxbow_basin();
    let retained = carve_oxbow_water(&run, &oxbow_basin);
    let removed = run
        .removed
        .iter()
        .map(|(key, step)| (objects[first_by_key[*key]].slot, *step))
        .collect();
    let knobs = run.character.knobs.iter().flat_map(|k| [k.x, k.y, k.radius]).collect();
    let curve = run.course.curve.as_ref().map_or(vec![], |c| (0..c.x.len()).flat_map(|i| [c.x[i], c.y[i], c.s[i]]).collect());
    let r = CarveRecords {
        knobs,
        rock: run.character.rock.clone(),
        sediment: run.sediment.clone(),
        curve,
        initial_entities: objects,
        raw_changes,
        raw_offsets,
        step_metrics,
        step_object_changes,
        oxbows: run.oxbows,
        oxbow_basin,
        retained,
        unleashed: run.options.unleashed,
        bad: run.options.bad,
        total,
        metrics,
        reason: m.reason,
        changes: flat_changes,
        change_offsets,
        heads,
        head_offsets,
        path,
        path_offsets,
        lengths,
        removed,
        spread,
        group: run.group,
        closure: run.closure,
        strength_depth: run.strength_depth,
    };
    Plan {
        raw: Some(run.map.clone()),
        map: run.map,
        records: Records::Carve(Box::new(r)),
        literal: Literal::default(),
        geometry: vec![],
        objects: vec![],
        fallen: vec![],
        raw_objects: vec![],
        raw_fallen: vec![],
        step_objects: vec![],
        closure_objects: vec![],
        closure_fallen: vec![],
        literal_objects: vec![],
        before: None,
        before_objects: vec![],
        before_fallen: vec![],
    }
}
fn carve_oxbow_water(run: &CarveState, basin: &[usize]) -> Option<RetainedWater> {
    if run.settings.dry || basin.is_empty() {
        return None;
    }
    let closure = run.closure.as_ref()?;
    let model = force_water_model(closure);
    let sim = force_canonical_settle(&model, None);
    let floor = force_water_model(&run.map).floor;
    let mut tiles = basin.to_vec();
    tiles.sort_unstable();
    Some(RetainedWater {
        floor: tiles.iter().map(|&i| floor[i]).collect(),
        depth: tiles.iter().map(|&i| sim.d[i]).collect(),
        contamination: tiles.iter().map(|&i| sim.c[i]).collect(),
        tiles,
    })
}
fn new_water_entity(
    id: std::sync::Arc<str>,
    tile: usize,
    strength: f64,
    m: &Map,
    slot: u32,
) -> Entity {
    let slot = slot.max(m.next_slot.get());
    m.next_slot.set(slot + 1);
    Entity {
        id_key: {
            let mut names = m.id_names.borrow_mut();
            if let Some(key) = names.iter().position(|name| name == &id) {
                key
            } else {
                let key = names.len();
                names.push(id.clone());
                m.next_id.set(key + 1);
                key
            }
        },
        slot,
        id,
        template: "WaterSource".into(),
        owner: "placed".into(),
        orientation: "Cw0".into(),
        x: (tile % m.w) as f64,
        y: (tile / m.w) as f64,
        z: m.heights[tile] as f64,
        sx: 1.0,
        sy: 1.0,
        flippable: false,
        flipped: false,
        dead: false,
        raw_removed: false,
        source_plain: strength,
        source_raw: 0.0,
        delayed_plain: false,
        delayed_raw: false,
        new_source: Some(strength),
        has_raw: false,
        source_normalized: false,
        metadata: None,
        plain_metadata: None,
        plain: false,
    }
}
struct ForceWaterModel {
    w: usize,
    h: usize,
    floor: Vec<f64>,
    dam: Option<Vec<f64>>,
    emitters: Vec<water::Emitter>,
}
// Current dev canonicalRun: remove unfed water once, re-settle, then keep sealed water.
// Sources and the optional retained lake are the only seeds; a force model has no drained edits.
fn force_canonical_settle(model: &ForceWaterModel, retained: Option<&RetainedWater>) -> water::Sim {
    let (start_d, start_c) = force_prefill(model, retained);
    let new_sim = |d, c| {
        water::Sim::new(
            model.w,
            model.h,
            model.floor.clone(),
            model.dam.clone(),
            model.emitters.clone(),
            d,
            c,
            true,
            true,
        )
    };
    let mut sim = new_sim(start_d.clone(), start_c.clone());
    let mut sealed = retained.map_or_else(Vec::new, |r| r.tiles.clone());
    sealed.sort_unstable();
    sealed.dedup();
    sim.settle(6.0, 128, 0.005, 0.005, &sealed);
    let n = model.w * model.h;
    let mut fed = vec![false; n];
    let mut queue = Vec::with_capacity(n);
    for e in &model.emitters {
        if !(e.strength > 0.0) {
            continue;
        }
        for &i in &e.cells {
            if !fed[i] {
                fed[i] = true;
                queue.push(i);
            }
        }
    }
    let mut seeds = vec![false; n];
    for &i in &sealed {
        seeds[i] = true;
    }
    for i in 0..n {
        if seeds[i] && !fed[i] && sim.d[i] > 0.0 {
            fed[i] = true;
            queue.push(i);
        }
    }
    let mut head = 0;
    while head < queue.len() {
        let i = queue[head];
        head += 1;
        if !(sim.d[i] > 0.0) {
            continue;
        }
        let surface = model.floor[i] + sim.d[i];
        let x = i % model.w;
        let y = i / model.w;
        let neighbors = [
            if y > 0 { Some(i - model.w) } else { None },
            if x > 0 { Some(i - 1) } else { None },
            if y + 1 < model.h {
                Some(i + model.w)
            } else {
                None
            },
            if x + 1 < model.w { Some(i + 1) } else { None },
        ];
        for j in neighbors.into_iter().flatten() {
            if fed[j] || !(sim.d[j] > 0.0) || !(model.floor[j] <= surface) {
                continue;
            }
            let limit = model.dam.as_ref().map_or(-1.0, |dam| dam[j]);
            if limit >= 0.0 && model.floor[j] < surface.ceil() && surface - model.floor[j] < limit {
                continue;
            }
            fed[j] = true;
            queue.push(j);
        }
    }
    let mut d = sim.d.clone();
    let mut c = sim.c.clone();
    let mut out = sim.out.clone();
    let mut any = false;
    for i in 0..n {
        if !(d[i] > 0.0) || fed[i] {
            continue;
        }
        d[i] = 0.0;
        c[i] = 0.0;
        out[4 * i..4 * i + 4].fill(0.0);
        any = true;
    }
    if any {
        let ticks = sim.ticks;
        sim = new_sim(d, c);
        sim.out = out;
        sim.ticks = ticks;
        sim.settle(4.0, 128, 0.005, 0.005, &sealed);
    }
    let closed = sim.closed_basins().map(<[bool]>::to_vec);
    force_keep_sealed(&mut sim, model, &seeds, closed.as_deref(), &start_d, &start_c);
    sim
}
fn force_water_model(m: &Map) -> ForceWaterModel {
    let mut model = ForceWaterModel {
        w: m.w,
        h: m.h,
        floor: m.heights.iter().map(|&v| v as f64).collect(),
        dam: None,
        emitters: vec![],
    };
    for e in &m.entities {
        let inside = |x: f64, y: f64| x >= 0.0 && y >= 0.0 && x < m.w as f64 && y < m.h as f64;
        let tile = |lx: i32, ly: i32| {
            let x = if e.flipped && e.flippable {
                e.sx as i32 - 1 - lx
            } else {
                lx
            };
            let (dx, dy) = match e.orientation.as_ref() {
                "Cw90" => (ly, -x),
                "Cw180" => (-x, -ly),
                "Cw270" => (-ly, x),
                _ => (x, ly),
            };
            Point {
                x: e.x + dx as f64,
                y: e.y + dy as f64,
            }
        };
        let (size, offset, bad, on, seep) = match e.template.as_ref() {
            "WaterSource" => (1, (0, 0), false, true, false),
            "BadwaterSource" => (3, (0, 0), true, true, false),
            "WaterSeep" => (2, (0, 0), false, true, true),
            "BadwaterSeep" => (2, (0, 0), true, true, true),
            "Aquifer" => (1, (1, 1), false, false, false),
            "BadtideDrain" => (1, (0, 1), true, false, false),
            _ => (0, (0, 0), false, false, false),
        };
        if size > 0 {
            let mut cells = vec![];
            for x in 0..size {
                for y in 0..size {
                    let p = tile(x + offset.0, y + offset.1);
                    if inside(p.x, p.y) {
                        cells.push(p.y as usize * m.w + p.x as usize);
                    }
                }
            }
            if !cells.is_empty() {
                let raw = e.has_raw && !e.raw_removed;
                let delayed = if raw { e.delayed_raw } else { e.delayed_plain };
                let mut strength = if on && !delayed {
                    if raw {
                        e.source_raw
                    } else {
                        e.source_plain
                    }
                } else {
                    0.0
                };
                if strength > 8.0 * (size * size) as f64 {
                    strength = 8.0 * (size * size) as f64;
                }
                if !(strength > 0.0) {
                    strength = 0.0;
                }
                let limit = if seep {
                    Some((cells[0], 0.8, 0.72))
                } else {
                    None
                };
                model.emitters.push(water::Emitter {
                    cells,
                    strength,
                    contamination: if bad { 1.0 } else { 0.0 },
                    limit,
                });
            }
        }
        if matches!(
            e.template.as_ref(),
            "Blockage" | "BadtideDrain" | "NaturalDam"
        ) {
            let p = tile(0, 0);
            if inside(p.x, p.y) {
                let j = p.y as usize * m.w + p.x as usize;
                if e.template.as_ref() == "NaturalDam" {
                    model.dam.get_or_insert_with(|| vec![-1.0; m.w * m.h])[j] = 0.65;
                } else if model.floor[j] < e.z + 1.0 {
                    model.floor[j] = e.z + 1.0;
                }
            }
        }
    }
    model
}
fn force_spill(m: &ForceWaterModel) -> Vec<f64> {
    let n = m.w * m.h;
    let mut filled: Vec<f64> = m
        .floor
        .iter()
        .enumerate()
        .map(|(i, &v)| {
            v + m
                .dam
                .as_ref()
                .map_or(0.0, |d| if d[i] >= 0.0 { d[i] } else { 0.0 })
        })
        .collect();
    let mut emitting = vec![0u8; n];
    for e in &m.emitters {
        for &i in &e.cells {
            emitting[i] = 1;
        }
    }
    let mut seen = vec![0u8; n];
    let mut heap = ForceHeap::default();
    for i in 0..n {
        let x = i % m.w;
        let y = i / m.w;
        if (x == 0 || y == 0 || x == m.w - 1 || y == m.h - 1) && emitting[i] == 0 {
            seen[i] = 1;
            heap.push(filled[i], i);
        }
    }
    while let Some((lv, c)) = heap.pop() {
        let x = c % m.w;
        let y = c / m.w;
        for j in [
            if y > 0 { c as isize - m.w as isize } else { -1 },
            if x > 0 { c as isize - 1 } else { -1 },
            if y < m.h - 1 { (c + m.w) as isize } else { -1 },
            if x < m.w - 1 { (c + 1) as isize } else { -1 },
        ] {
            if j < 0 || seen[j as usize] != 0 {
                continue;
            }
            let j = j as usize;
            seen[j] = 1;
            if filled[j] < lv {
                filled[j] = lv;
            }
            heap.push(filled[j], j);
        }
    }
    filled
}
fn force_prefill(m: &ForceWaterModel, retained: Option<&RetainedWater>) -> (Vec<f64>, Vec<f64>) {
    let n = m.w * m.h;
    let spill = force_spill(m);
    let mut q = vec![0.0; n];
    let mut bad = vec![0.0; n];
    let mut path = vec![0u8; n];
    let mut mark = vec![0u32; n];
    let mut stamp = 0;
    // a seep's water stands no higher than its anchor's floor plus its limit (prefill.ts `flowThrough`);
    // with no running seep every tile's water stands at its spill level
    let seeps = m.emitters.iter().any(|e| e.limit.is_some() && e.strength > 0.0);
    let mut level = if seeps { vec![f64::NEG_INFINITY; n] } else { spill.clone() };
    for e in &m.emitters {
        if !(e.strength > 0.0) {
            continue;
        }
        let cap = e.limit.map_or(f64::INFINITY, |(a, off, _)| m.floor[a] + off);
        stamp += 1;
        let mut queue = vec![];
        for &i in &e.cells {
            if mark[i] != stamp {
                mark[i] = stamp;
                queue.push(i);
            }
        }
        let mut head = 0;
        while head < queue.len() {
            let c = queue[head];
            head += 1;
            q[c] += e.strength;
            if e.contamination > 0.0 {
                bad[c] += e.strength * e.contamination;
            }
            path[c] = 1;
            if seeps {
                let lv = if spill[c] < cap { spill[c] } else { cap };
                if lv > level[c] {
                    level[c] = lv;
                }
            }
            let x = c % m.w;
            let y = c / m.w;
            for j in [
                if y > 0 { c as isize - m.w as isize } else { -1 },
                if x > 0 { c as isize - 1 } else { -1 },
                if y < m.h - 1 { (c + m.w) as isize } else { -1 },
                if x < m.w - 1 { (c + 1) as isize } else { -1 },
            ] {
                if j < 0 {
                    continue;
                }
                let j = j as usize;
                if mark[j] == stamp || spill[j] > spill[c] {
                    continue;
                }
                if cap != f64::INFINITY {
                    let d = m.dam.as_ref().map_or(0.0, |dam| if dam[j] >= 0.0 { dam[j] } else { 0.0 });
                    if m.floor[j] + d >= cap {
                        continue;
                    }
                }
                mark[j] = stamp;
                queue.push(j);
            }
        }
    }
    let open: Vec<bool> = (0..n)
        .map(|i| path[i] != 0 && !(level[i] > m.floor[i]))
        .collect();
    let mut rx = vec![0usize; n];
    let mut ry = vec![0usize; n];
    for y in 0..m.h {
        let mut x = 0;
        while x < m.w {
            if !open[y * m.w + x] {
                x += 1;
                continue;
            }
            let mut end = x;
            while end < m.w && open[y * m.w + end] {
                end += 1;
            }
            for k in x..end {
                rx[y * m.w + k] = end - x;
            }
            x = end;
        }
    }
    for x in 0..m.w {
        let mut y = 0;
        while y < m.h {
            if !open[y * m.w + x] {
                y += 1;
                continue;
            }
            let mut end = y;
            while end < m.h && open[end * m.w + x] {
                end += 1;
            }
            for k in y..end {
                ry[k * m.w + x] = end - y;
            }
            y = end;
        }
    }
    let mut depth = vec![0.0; n];
    let mut contamination = vec![0.0; n];
    for i in 0..n {
        if path[i] == 0 {
            continue;
        }
        let d = if level[i] > m.floor[i] {
            level[i] - m.floor[i]
        } else {
            min(1.0, (0.3 * q[i]) / rx[i].min(ry[i]) as f64)
        };
        depth[i] = d;
        contamination[i] = if d > 0.0 && q[i] > 0.0 {
            bad[i] / q[i]
        } else {
            0.0
        };
    }
    if let Some(r) = retained {
        for (k, &i) in r.tiles.iter().enumerate() {
            if m.floor[i] == r.floor[k] {
                depth[i] = r.depth[k];
                contamination[i] = r.contamination[k];
            } else {
                let d = r.floor[k] + r.depth[k] - m.floor[i];
                depth[i] = if d > 0.0 { d } else { 0.0 };
                contamination[i] = if d > 0.0 { r.contamination[k] } else { 0.0 };
            }
        }
    }
    (depth, contamination)
}
#[derive(Default)]
struct RetainedWater {
    tiles: Vec<usize>,
    floor: Vec<f64>,
    depth: Vec<f64>,
    contamination: Vec<f64>,
}
#[derive(Clone)]
struct GlacierSettings {
    finish: bool,
    power: f64,
    size: f64,
    seed: u32,
    aimed: bool,
    meltwater: bool,
    benches: u8,
    steps: u8,
    tarn: bool,
    scree: bool,
    floor: f64,
}
fn glacier_noise(seed: u32, i: u32) -> f64 {
    let mut v = (seed ^ i).wrapping_mul(0x45d9f3b);
    v = (v ^ (v >> 16)).wrapping_mul(0x45d9f3b);
    (v ^ (v >> 16)) as f64 / 4294967296.0
}
fn point_distance(a: Point, b: Point) -> f64 {
    hypot(a.x - b.x, a.y - b.y)
}
const FORCE_N8: [(i32, i32); 8] = [
    (1, 0),
    (-1, 0),
    (0, 1),
    (0, -1),
    (1, 1),
    (1, -1),
    (-1, 1),
    (-1, -1),
];
const GLACIER_N4: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
struct GlacierValley {
    parent: Vec<i32>,
    area: Vec<u32>,
}
impl GlacierValley {
    fn new(m: &Map) -> Self {
        let n = m.w * m.h;
        let mut cost = vec![f64::INFINITY; n];
        let mut parent = vec![-1; n];
        let mut area = vec![1u32; n];
        let mut heap = ForceHeap::default();
        let mut order = vec![];
        for i in 0..n {
            let x = i % m.w;
            let y = i / m.w;
            if x == 0 || y == 0 || x == m.w - 1 || y == m.h - 1 {
                cost[i] = m.heights[i] as f64;
                heap.push(cost[i], i);
            }
        }
        while let Some((c, i)) = heap.pop() {
            if c != cost[i] {
                continue;
            }
            order.push(i);
            let x = (i % m.w) as i32;
            let y = (i / m.w) as i32;
            for (dx, dy) in FORCE_N8 {
                let xx = x + dx;
                let yy = y + dy;
                if xx < 0 || yy < 0 || xx >= m.w as i32 || yy >= m.h as i32 {
                    continue;
                }
                let j = yy as usize * m.w + xx as usize;
                let nc = max(c, m.heights[j] as f64) + hypot(dx as f64, dy as f64) * 0.001;
                if nc < cost[j] {
                    cost[j] = nc;
                    parent[j] = i as i32;
                    heap.push(nc, j);
                }
            }
        }
        for i in order.into_iter().rev() {
            if parent[i] >= 0 {
                let r = parent[i] as usize;
                area[r] = area[r].wrapping_add(area[i]);
            }
        }
        Self { parent, area }
    }
    fn path(&self, m: &Map, origin: usize, reach: f64) -> Vec<Point> {
        let mut out = vec![];
        let mut i = origin as i32;
        let mut l = 0.0;
        while i >= 0 && out.len() < m.w * m.h {
            let p = Point {
                x: (i as usize % m.w) as f64 + 0.5,
                y: (i as usize / m.w) as f64 + 0.5,
            };
            if let Some(&last) = out.last() {
                l += point_distance(p, last);
            }
            out.push(p);
            if l >= reach
                || p.x < 3.0
                || p.y < 3.0
                || p.x > m.w as f64 - 3.0
                || p.y > m.h as f64 - 3.0
            {
                break;
            }
            i = self.parent[i as usize];
        }
        for _ in 0..3 {
            let before = out;
            out = before
                .iter()
                .enumerate()
                .map(|(k, &p)| {
                    if k < 2 || k > before.len().saturating_sub(3) {
                        return p;
                    }
                    let a = &before[k.saturating_sub(5)..before.len().min(k + 6)];
                    let mut x = 0.0;
                    let mut y = 0.0;
                    for p in a {
                        x += p.x;
                        y += p.y;
                    }
                    Point {
                        x: x / a.len() as f64,
                        y: y / a.len() as f64,
                    }
                })
                .collect();
        }
        out
    }
}
fn glacier_smooth7(out: &[Point]) -> Vec<Point> {
    out.iter()
        .enumerate()
        .map(|(k, &p)| {
            if k < 3 || k > out.len().saturating_sub(4) {
                return p;
            }
            let mut x = 0.0;
            let mut y = 0.0;
            for q in &out[k - 3..k + 4] {
                x += q.x;
                y += q.y;
            }
            Point {
                x: x / 7.0,
                y: y / 7.0,
            }
        })
        .collect()
}
fn glacier_route(m: &Map, s: &GlacierSettings, intent: &Intent, v: &GlacierValley) -> Vec<Point> {
    let pt = |i: usize| Point {
        x: (i % m.w) as f64 + 0.5,
        y: (i / m.w) as f64 + 0.5,
    };
    let origin = intent.origin as usize;
    let start = pt(origin);
    let reach = m.w as f64 * (0.22 + (0.85 * 60.0) / 100.0);
    if !s.aimed {
        let ordinary = v.path(m, origin, reach);
        let x = origin % m.w;
        let y = origin / m.w;
        let mut lo = u8::MAX;
        let mut hi = 0;
        for yy in y.saturating_sub(24)..=(y + 24).min(m.h - 1) {
            for xx in x.saturating_sub(24)..=(x + 24).min(m.w - 1) {
                let h = m.heights[yy * m.w + xx];
                lo = lo.min(h);
                hi = hi.max(h);
            }
        }
        if hi - lo > 1 && ordinary.len() >= 8 {
            return ordinary;
        }
        let mut targets = vec![];
        let h = m.heights[origin];
        for y in (1..m.h - 1).step_by(3) {
            for x in (1..m.w - 1).step_by(3) {
                if m.heights[y * m.w + x] < h {
                    targets.push(Point {
                        x: x as f64 + 0.5,
                        y: y as f64 + 0.5,
                    });
                }
            }
        }
        targets.extend([
            Point { x: 1.5, y: start.y },
            Point {
                x: m.w as f64 - 1.5,
                y: start.y,
            },
            Point { x: start.x, y: 1.5 },
            Point {
                x: start.x,
                y: m.h as f64 - 1.5,
            },
        ]);
        targets.retain(|&q| point_distance(q, start) >= 8.0);
        targets.sort_by(|&a, &b| {
            point_distance(a, start)
                .partial_cmp(&point_distance(b, start))
                .unwrap()
        });
        let nearest = targets.first().copied().unwrap_or(Point {
            x: m.w as f64 - start.x,
            y: m.h as f64 - start.y,
        });
        let near: Vec<_> = targets
            .iter()
            .copied()
            .filter(|&q| point_distance(q, start) <= point_distance(nearest, start) * 1.5 + 8.0)
            .collect();
        let end = near
            .get((glacier_noise(s.seed, 927) * near.len() as f64).floor() as usize)
            .copied()
            .unwrap_or(nearest);
        let len = min(reach, max(8.0, point_distance(start, end)));
        let d = point_distance(start, end);
        let d = if d == 0.0 { 1.0 } else { d };
        let dx = (end.x - start.x) / d;
        let dy = (end.y - start.y) / d;
        let n = len.ceil() as usize;
        return (0..=n)
            .map(|k| {
                let t = k as f64 / n as f64;
                let bend = sin(t * std::f64::consts::PI)
                    * min(4.0, len * 0.08)
                    * (glacier_noise(s.seed, 319) * 2.0 - 1.0);
                Point {
                    x: clamp(start.x + dx * len * t - dy * bend, 0.5, m.w as f64 - 0.5),
                    y: clamp(start.y + dy * len * t + dx * bend, 0.5, m.h as f64 - 0.5),
                }
            })
            .collect();
    }
    if !intent.via.is_empty() {
        let mut stops = vec![start];
        stops.extend(intent.via.iter().map(|&i| pt(i)));
        stops.push(pt(intent.end as usize));
        let mut out = vec![stops[0]];
        for k in 1..stops.len() {
            let a = stops[k - 1];
            let b = stops[k];
            let n = max(1.0, round(point_distance(a, b))) as usize;
            for j in 1..=n {
                out.push(Point {
                    x: a.x + ((b.x - a.x) * j as f64) / n as f64,
                    y: a.y + ((b.y - a.y) * j as f64) / n as f64,
                });
            }
        }
        for _ in 0..2 {
            out = glacier_smooth7(&out);
        }
        return out;
    }
    let goal = intent.end as usize;
    let end = pt(goal);
    let len = point_distance(start, end);
    let dx = (end.x - start.x) / len;
    let dy = (end.y - start.y) / len;
    let mut costs = vec![f64::INFINITY; m.w * m.h];
    let mut parent = vec![-1i32; m.w * m.h];
    let mut heap = ForceHeap::default();
    costs[origin] = 0.0;
    heap.push(0.0, origin);
    while let Some((c, i)) = heap.pop() {
        if c != costs[i] {
            continue;
        }
        if i == goal {
            break;
        }
        let x = (i % m.w) as i32;
        let y = (i / m.w) as i32;
        for (xx, yy) in FORCE_N8 {
            let nx = x + xx;
            let ny = y + yy;
            if nx < 1 || ny < 1 || nx >= m.w as i32 - 1 || ny >= m.h as i32 - 1 {
                continue;
            }
            let j = ny as usize * m.w + nx as usize;
            let across = ((nx as f64 - start.x) * dy - (ny as f64 - start.y) * dx).abs();
            let nc = c + hypot(xx as f64, yy as f64)
                * (1.0
                    + m.heights[j] as f64 * 0.12
                    + pow(across / max(6.0, len * 0.22), 2.0) * 0.7);
            if nc < costs[j] {
                costs[j] = nc;
                parent[j] = i as i32;
                heap.push(nc, j);
            }
        }
    }
    let mut out = vec![];
    let mut at = goal as i32;
    while at >= 0 {
        out.push(pt(at as usize));
        if at as usize == origin {
            break;
        }
        at = parent[at as usize];
    }
    out.reverse();
    glacier_smooth7(&out)
}
#[derive(Clone, Copy)]
struct GlacierStation {
    x: f64,
    y: f64,
    s: f64,
    r: f64,
    floor: f64,
    outlet: f64,
}
#[derive(Clone, Copy)]
struct GlacierVisit {
    k: usize,
    x: f64,
    y: f64,
    weight: f64,
}
#[derive(Clone, Copy)]
struct GlacierIncoming {
    lip: usize,
    landing: usize,
    k: usize,
    area: u32,
    old_wet: bool,
}
struct GlacierHanging {
    mouth: usize,
    landing: usize,
    source: Option<usize>,
    catchment: u32,
    drop: f64,
    s: f64,
    wet: bool,
    channel: Vec<usize>,
    join_length: f64,
}
const GLACIER_JOIN_KINDS: [&str; 3] = ["fall", "spill", "inflow"];
struct GlacierJoin {
    kind: &'static str,
    from: usize,
    length: f64,
}
struct GlacierBasin {
    tiles: Vec<usize>,
    floor: f64,
    outlet: f64,
    depth: f64,
    fed: bool,
}
#[derive(Clone, Copy)]
struct GlacierStyle {
    course: u8,
    skip: bool,
}
struct GlacierPlan {
    map: Map,
    path: Vec<GlacierStation>,
    reference: Vec<Point>,
    stream_path: Vec<Point>,
    arrival: Vec<f32>,
    mask: Vec<u8>,
    floor: Vec<u8>,
    nearest: Vec<i32>,
    stream: Vec<u8>,
    fan: Vec<u8>,
    retained: RetainedWater,
    basins: Vec<GlacierBasin>,
    hanging: Vec<GlacierHanging>,
    metrics: [f64; 14],
    style: GlacierStyle,
    visits: usize,
    reached: usize,
    floods: usize,
    flood_ticks: usize,
    joins: Vec<GlacierJoin>,
    draining: Vec<u8>,
    river_cells: Vec<u8>,
    river_heights: Vec<u8>,
    next_slot: u32,
}
fn glacier_tile(m: &Map, q: Point) -> usize {
    clamp(q.y.floor(), 0.0, (m.h - 1) as f64) as usize * m.w
        + clamp(q.x.floor(), 0.0, (m.w - 1) as f64) as usize
}
fn glacier_pt(m: &Map, i: usize) -> Point {
    Point {
        x: (i % m.w) as f64 + 0.5,
        y: (i / m.w) as f64 + 0.5,
    }
}
fn glacier_length(p: &[Point]) -> f64 {
    let mut s = 0.0;
    for (k, &q) in p.iter().enumerate() {
        s += if k > 0 {
            point_distance(q, p[k - 1])
        } else {
            0.0
        };
    }
    s
}
fn glacier_normal(path: &[GlacierStation], k: usize) -> Point {
    let a = path[k.saturating_sub(3)];
    let b = path[(k + 3).min(path.len() - 1)];
    let len = hypot(b.x - a.x, b.y - a.y);
    let len = if len == 0.0 { 1.0 } else { len };
    Point {
        x: -(b.y - a.y) / len,
        y: (b.x - a.x) / len,
    }
}
fn glacier_texture(seed: u32, x: f64, y: f64, scale: f64) -> f64 {
    let gx = (x / scale).floor();
    let gy = (y / scale).floor();
    let tx = x / scale - gx;
    let ty = y / scale - gy;
    let u = tx * tx * (3.0 - 2.0 * tx);
    let v = ty * ty * (3.0 - 2.0 * ty);
    let at = |x: f64, y: f64| {
        glacier_noise(
            seed,
            (x as i32 as u32).wrapping_mul(73856093) ^ (y as i32 as u32).wrapping_mul(19349663),
        ) * 2.0
            - 1.0
    };
    (at(gx, gy) * (1.0 - u) + at(gx + 1.0, gy) * u) * (1.0 - v)
        + (at(gx, gy + 1.0) * (1.0 - u) + at(gx + 1.0, gy + 1.0) * u) * v
}
fn glacier_quantile(mut a: Vec<f64>, q: f64) -> f64 {
    if a.is_empty() {
        return 0.0;
    }
    a.sort_by(|a, b| a.partial_cmp(b).unwrap());
    a[((a.len() - 1) as f64 * q).floor() as usize]
}
fn glacier_hard(m: &Map, i: usize, height: f64) -> bool {
    m.lava[i] & (1u32.wrapping_shl(max(0.0, height - 1.0) as u32)) != 0
}
fn glacier_course(
    path: &[GlacierStation],
    visits: &[GlacierVisit],
    length: f64,
    river_radius: f64,
    phase: f64,
    m: &Map,
    mask: &[u8],
) -> (Vec<Point>, Vec<GlacierVisit>) {
    let mut room = vec![];
    for (k, q) in path.iter().enumerate() {
        let n = glacier_normal(path, k);
        let edge = |side: f64| {
            let mut u = 0.0;
            while u < q.r * 1.4 {
                let x = (q.x + n.x * u * side).floor();
                let y = (q.y + n.y * u * side).floor();
                if x < 0.0
                    || y < 0.0
                    || x >= m.w as f64
                    || y >= m.h as f64
                    || mask[y as usize * m.w + x as usize] != 1
                {
                    break;
                }
                u += 0.5;
            }
            max(0.0, u - river_radius - 1.5)
        };
        room.push([edge(1.0), edge(-1.0)]);
    }
    let within = |k: usize, off: f64| clamp(off, -room[k][1], room[k][0]);
    let mut aims: Vec<_> = visits
        .iter()
        .map(|&v| {
            let q = path[v.k];
            let n = glacier_normal(path, v.k);
            let side = (v.x - q.x) * n.x + (v.y - q.y) * n.y;
            let reach = max(0.0, side.abs() - river_radius - 0.6 - 2.0);
            let sign = if side == 0.0 {
                side
            } else if side > 0.0 {
                1.0
            } else {
                -1.0
            };
            (v, q.s, within(v.k, sign * reach))
        })
        .collect();
    aims.sort_by(|a, b| {
        b.0.weight
            .partial_cmp(&a.0.weight)
            .unwrap()
            .then(a.0.k.cmp(&b.0.k))
    });
    let mut chosen: Vec<(GlacierVisit, f64, f64)> = vec![];
    for c in aims {
        let fits = [(0.0, 0.0), (1.0, 0.0)]
            .iter()
            .copied()
            .chain(chosen.iter().map(|a| (a.1, a.2)))
            .all(|(s, aim)| {
                let d = (c.1 - s).abs() * length;
                let across = (c.2 - aim).abs();
                d >= 5.0 && d >= across * 0.7
            });
        if fits {
            chosen.push(c);
        }
    }
    chosen.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
    let mut controls = vec![(0.0, 0.0)];
    controls.extend(chosen.iter().map(|a| (a.1, a.2)));
    controls.push((1.0, 0.0));
    let smooth = |v: f64| {
        let v = clamp(v, 0.0, 1.0);
        v * v * (3.0 - 2.0 * v)
    };
    let course = path
        .iter()
        .enumerate()
        .map(|(k, q)| {
            let mut j = 0;
            while j < controls.len() - 2 && controls[j + 1].0 <= q.s {
                j += 1;
            }
            let a = controls[j];
            let b = controls[j + 1];
            let t = if b.0 > a.0 {
                (q.s - a.0) / (b.0 - a.0)
            } else {
                0.0
            };
            let base = a.1 + (b.1 - a.1) * smooth(t);
            let gap = min((q.s - a.0) * length, (b.0 - q.s) * length);
            let meander = sin(q.s * 8.0 + phase)
                * q.r
                * 0.35
                * sin(std::f64::consts::PI * q.s)
                * smooth(gap / 14.0)
                * 0.6;
            let off = within(k, base + meander);
            let n = glacier_normal(path, k);
            Point {
                x: q.x + n.x * off,
                y: q.y + n.y * off,
            }
        })
        .collect();
    (course, chosen.into_iter().map(|c| c.0).collect())
}
impl GlacierPlan {
    fn paint(
        &mut self,
        x: i32,
        y: i32,
        bed: f64,
        at: f64,
        kind: u8,
        k: usize,
        exact: bool,
        record: &mut Vec<usize>,
    ) {
        if x < 0 || y < 0 || x >= self.map.w as i32 || y >= self.map.h as i32 {
            return;
        }
        let i = y as usize * self.map.w + x as usize;
        if (kind <= 2 && at < 1.0 && self.mask[i] != 1) || (kind == 3 && self.mask[i] == 1) {
            return;
        }
        let main = self.stream[i] == 1 && kind == 2;
        self.map.heights[i] = if main {
            self.map.heights[i]
        } else if exact {
            bed as u8
        } else {
            min(self.map.heights[i] as f64, bed) as u8
        };
        self.stream[i] = if main { 1 } else { kind };
        self.arrival[i] = if at >= 0.0 {
            at as f32
        } else {
            self.path[k.min(self.path.len() - 1)].s as f32
        };
        record.push(i);
    }
    fn channel(
        &mut self,
        points: &[Point],
        beds: &[f64],
        width: f64,
        at: f64,
        kind: u8,
        exact: bool,
    ) -> Vec<usize> {
        let mut record = vec![];
        for k in 0..points.len() {
            let a = points[k.saturating_sub(1)];
            let b = points[k];
            let steps = max(1.0, (point_distance(a, b) * 3.0).ceil()) as usize;
            let bed = min(beds[k.saturating_sub(1)], beds[k]);
            let mut previous = (a.x.floor() as i32, a.y.floor() as i32);
            for j in 0..=steps {
                let t = j as f64 / steps as f64;
                let x = a.x + (b.x - a.x) * t;
                let y = a.y + (b.y - a.y) * t;
                let cx = x.floor() as i32;
                let cy = y.floor() as i32;
                if cx != previous.0 && cy != previous.1 {
                    let mut choices = [(cx, previous.1), (previous.0, cy)];
                    let off = |q: (i32, i32)| {
                        ((q.0 as f64 + 0.5 - a.x) * (b.y - a.y)
                            - (q.1 as f64 + 0.5 - a.y) * (b.x - a.x))
                            .abs()
                    };
                    if off(choices[1]) < off(choices[0]) {
                        choices.swap(0, 1);
                    }
                    let bridge = choices
                        .iter()
                        .copied()
                        .find(|&(x, y)| {
                            kind > 2
                                || at >= 1.0
                                || (x >= 0
                                    && y >= 0
                                    && x < self.map.w as i32
                                    && y < self.map.h as i32
                                    && self.mask[y as usize * self.map.w + x as usize] == 1)
                        })
                        .unwrap_or(choices[0]);
                    self.paint(bridge.0, bridge.1, bed, at, kind, k, exact, &mut record);
                }
                self.paint(cx, cy, bed, at, kind, k, exact, &mut record);
                previous = (cx, cy);
                let endy = min(self.map.h as f64, y + width + 1.0).ceil() as usize;
                let endx = min(self.map.w as f64, x + width + 1.0).ceil() as usize;
                for yy in max(0.0, (y - width).floor()) as usize..endy {
                    for xx in max(0.0, (x - width).floor()) as usize..endx {
                        if hypot(xx as f64 + 0.5 - x, yy as f64 + 0.5 - y) <= width {
                            self.paint(xx as i32, yy as i32, bed, at, kind, k, exact, &mut record);
                        }
                    }
                }
            }
        }
        record
    }
    fn refresh_draining(&mut self) {
        self.draining.fill(0);
        let mut q = vec![];
        for i in 0..self.stream.len() {
            if self.stream[i] == 1 {
                self.draining[i] = 1;
                q.push(i);
            }
        }
        let mut k = 0;
        while k < q.len() {
            let i = q[k];
            k += 1;
            let x = (i % self.map.w) as i32;
            let y = (i / self.map.w) as i32;
            for (dx, dy) in GLACIER_N4 {
                let xx = x + dx;
                let yy = y + dy;
                if xx < 0 || yy < 0 || xx >= self.map.w as i32 || yy >= self.map.h as i32 {
                    continue;
                }
                let j = yy as usize * self.map.w + xx as usize;
                if self.draining[j] == 0
                    && self.stream[j] == 2
                    && self.map.heights[j] >= self.map.heights[i]
                {
                    self.draining[j] = 1;
                    q.push(j);
                }
            }
        }
    }
    fn join_river(
        &mut self,
        from: Point,
        at: f64,
        width: f64,
        any_water: bool,
    ) -> (f64, Vec<usize>) {
        self.refresh_draining();
        let n = self.stream.len();
        let w = self.map.w;
        let h = self.map.h;
        let origin = glacier_tile(&self.map, from);
        let datum = self.floor[origin] as f64;
        let mut cost = vec![f64::INFINITY; n];
        let mut parent = vec![-1i32; n];
        let mut heap = ForceHeap::default();
        cost[origin] = 0.0;
        heap.push(0.0, origin);
        let mut goal = origin;
        while let Some((d, i)) = heap.pop() {
            if d != cost[i] {
                continue;
            }
            if (self.stream[i] == 1
                || if self.style.course == 3 {
                    self.draining[i] != 0
                } else {
                    any_water && i != origin && self.stream[i] == 2 && self.draining[i] != 0
                })
                && self.map.heights[i] as f64 <= datum
            {
                goal = i;
                break;
            }
            let x = (i % w) as i32;
            let y = (i / w) as i32;
            for (dx, dy) in FORCE_N8 {
                let xx = x + dx;
                let yy = y + dy;
                if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                    continue;
                }
                let j = yy as usize * w + xx as usize;
                if self.mask[j] != 1 {
                    continue;
                }
                if dx != 0
                    && dy != 0
                    && self.mask[y as usize * w + xx as usize] != 1
                    && self.mask[yy as usize * w + x as usize] != 1
                {
                    continue;
                }
                let next = d + hypot(dx as f64, dy as f64)
                    * if self.style.course == 3 {
                        1.0 + max(0.0, self.floor[j] as f64 - datum) * 0.25
                    } else {
                        1.0
                    };
                if next < cost[j] {
                    cost[j] = next;
                    parent[j] = i as i32;
                    heap.push(next, j);
                }
            }
        }
        let mut indices = vec![];
        let mut i = goal as i32;
        while i >= 0 {
            indices.push(i as usize);
            if i as usize == origin {
                break;
            }
            i = parent[i as usize];
        }
        indices.reverse();
        let mut join: Vec<_> = indices.iter().map(|&i| glacier_pt(&self.map, i)).collect();
        if self.style.course != 3 && goal != origin {
            let a = glacier_pt(&self.map, origin);
            let b = *join.last().unwrap();
            let count = max(1.0, point_distance(b, a).ceil()) as usize;
            let line: Vec<_> = (0..=count)
                .map(|k| Point {
                    x: a.x + ((b.x - a.x) * k as f64) / count as f64,
                    y: a.y + ((b.y - a.y) * k as f64) / count as f64,
                })
                .collect();
            if line
                .iter()
                .all(|&q| self.mask[glacier_tile(&self.map, q)] == 1)
            {
                join = line;
            }
        }
        let near = *join.last().unwrap();
        let receiving = self.map.heights[glacier_tile(&self.map, near)] as f64;
        let mut bed = max(receiving, datum);
        let mut beds: Vec<_> = join
            .iter()
            .map(|&q| {
                bed = max(
                    receiving,
                    min(bed, self.floor[glacier_tile(&self.map, q)] as f64),
                );
                bed
            })
            .collect();
        *beds.last_mut().unwrap() = receiving;
        let prior = self.map.heights.clone();
        let main: Vec<_> = self.stream.iter().map(|&v| v == 1).collect();
        let cells = self.channel(&join, &beds, width, at, 2, true);
        for &i in &cells {
            if self.river_cells[i] != 0 || main[i] {
                self.stream[i] = 1;
                self.map.heights[i] = if self.river_cells[i] != 0 {
                    prior[i].min(self.river_heights[i])
                } else {
                    prior[i]
                };
            } else if self.draining[i] != 0 {
                self.map.heights[i] = self.map.heights[i].min(prior[i]);
            }
            self.draining[i] = 1;
        }
        (glacier_length(&join), cells)
    }
    fn floor_distance(&self) -> Vec<f64> {
        let w = self.map.w;
        let h = self.map.h;
        let mut dist = vec![f64::INFINITY; w * h];
        let mut heap = ForceHeap::default();
        for i in 0..w * h {
            if self.stream[i] == 1 {
                dist[i] = 0.0;
                heap.push(0.0, i);
            }
        }
        while let Some((d, i)) = heap.pop() {
            if d != dist[i] {
                continue;
            }
            let x = (i % w) as i32;
            let y = (i / w) as i32;
            for (dx, dy) in FORCE_N8 {
                let xx = x + dx;
                let yy = y + dy;
                if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                    continue;
                }
                let j = yy as usize * w + xx as usize;
                if self.mask[j] != 1 {
                    continue;
                }
                let next = d + if dx != 0 && dy != 0 {
                    std::f64::consts::SQRT_2
                } else {
                    1.0
                };
                if next < dist[j] {
                    dist[j] = next;
                    heap.push(next, j);
                }
            }
        }
        dist
    }
}
fn glacier_inflows(p: &GlacierPlan, before: &Map, surviving: &[f64]) -> Vec<Vec<(usize, usize)>> {
    let w = p.map.w;
    let h = p.map.h;
    let n = w * h;
    let mut wet_group = vec![-1i32; n];
    let mut entrances: Vec<Vec<(usize, usize)>> = vec![];
    let mut group = 0;
    for i in 0..n {
        if p.mask[i] == 1 || before.depth[i] <= 0.05 || surviving[i] <= 0.0 || wet_group[i] >= 0 {
            continue;
        }
        let mut queue = vec![i];
        wet_group[i] = group;
        let mut list = vec![];
        let mut k = 0;
        while k < queue.len() {
            let j = queue[k];
            k += 1;
            let x = (j % w) as i32;
            let y = (j / w) as i32;
            for (dx, dy) in GLACIER_N4 {
                let xx = x + dx;
                let yy = y + dy;
                if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                    continue;
                }
                let a = yy as usize * w + xx as usize;
                if p.mask[a] == 1 && before.heights[j] >= p.floor[a] {
                    list.push((a, j));
                } else if p.mask[a] != 1
                    && before.depth[a] > 0.05
                    && surviving[a] > 0.0
                    && wet_group[a] < 0
                {
                    wet_group[a] = group;
                    queue.push(a);
                }
            }
        }
        if !list.is_empty() {
            entrances.push(list);
        }
        group += 1;
    }
    entrances
}
fn glacier_entry(list: &[(usize, usize)], before: &Map) -> (usize, usize) {
    let mut a = list[0];
    for &b in &list[1..] {
        if !(before.depth[a.1] > before.depth[b.1]) {
            a = b;
        }
    }
    a
}
fn glacier_enough(c: usize, p: &GlacierPlan, before: &Map) -> bool {
    let w = p.map.w;
    let h = p.map.h;
    let x = (c % w) as i32;
    let y = (c / w) as i32;
    FORCE_N8.iter().any(|&(dx, dy)| {
        let xx = x + dx;
        let yy = y + dy;
        xx >= 0
            && yy >= 0
            && xx < w as i32
            && yy < h as i32
            && p.mask[yy as usize * w + xx as usize] != 1
            && before.heights[yy as usize * w + xx as usize] >= before.heights[c]
    })
}
fn glacier_absorb(
    p: &GlacierPlan,
    before: &Map,
    swept: &mut [bool],
    clean: &mut f64,
    bad: &mut f64,
) {
    for e in &before.entities {
        if !matches!(
            e.template.as_ref(),
            "WaterSource"
                | "BadwaterSource"
                | "WaterSeep"
                | "BadwaterSeep"
                | "Aquifer"
                | "BadtideDrain"
        ) || swept[e.id_key]
            || !before.footprint(e, 0).iter().any(|&i| {
                p.mask[i] == 1 || before.heights[i] != p.map.heights[i] || p.stream[i] != 0
            })
        {
            continue;
        }
        let mut single = before.clone();
        single.entities = vec![e.clone()];
        let model = force_water_model(&single);
        if model.emitters.is_empty() {
            continue;
        }
        swept[e.id_key] = true;
        for emitter in model.emitters {
            if emitter.contamination > 0.0 {
                *bad += emitter.strength;
            } else {
                *clean += emitter.strength;
            }
        }
    }
}
fn glacier_lift_floors(before: &Map, path: &mut [GlacierStation], power: f64) {
    let t = clamp(power, 0.0, 100.0) / 100.0;
    let mut prev = f64::INFINITY;
    for q in path {
        let mut low = f64::INFINITY;
        let mut wet = f64::INFINITY;
        for y in
            max(0.0, (q.y - q.r).floor()) as usize..min(before.h as f64, q.y + q.r).ceil() as usize
        {
            for x in max(0.0, (q.x - q.r).floor()) as usize
                ..min(before.w as f64, q.x + q.r).ceil() as usize
            {
                let i = y * before.w + x;
                let off = hypot(x as f64 + 0.5 - q.x, y as f64 + 0.5 - q.y);
                if off <= 2.5 {
                    low = min(low, before.heights[i] as f64);
                }
                if off <= 4.0 && before.depth[i] > 0.05 {
                    wet = max(
                        if wet == f64::INFINITY {
                            f64::NEG_INFINITY
                        } else {
                            wet
                        },
                        before.heights[i] as f64 + before.depth[i],
                    );
                }
            }
        }
        let full = q.floor;
        let scour = max(
            max(full, low - 1.0 - 1.0),
            if wet == f64::INFINITY {
                f64::NEG_INFINITY
            } else {
                wet.ceil()
            },
        );
        let lifted = min(prev, full + round((1.0 - t) * (scour - full)));
        prev = lifted;
        q.floor = max(full, lifted);
    }
}
fn glacier_once(
    before: &Map,
    s: &GlacierSettings,
    intent: &Intent,
    valley: &GlacierValley,
    style: GlacierStyle,
) -> GlacierPlan {
    let w = before.w;
    let h = before.h;
    let n = w * h;
    let top = before.ceiling;
    let cut_floor = clamp(round(s.floor), 1.0, top);
    let p = 60.0 / 100.0;
    let r = s.size / 2.0;
    let phase = glacier_noise(s.seed, 7) * std::f64::consts::PI * 2.0;
    let step_scale = if s.steps == 0 {
        1.8
    } else if s.steps == 2 {
        0.55
    } else {
        1.0
    };
    let sample = |x: f64, y: f64| before.heights[glacier_tile(before, Point { x, y })] as f64;
    let mut reference = glacier_route(before, s, intent, valley);
    let head = reference[0];
    let mut regional = vec![];
    let radius = max(16.0, min(w as f64 * 0.2, 30.0));
    let mut y = max(0.0, (head.y - radius).floor());
    while y < min(h as f64, head.y + radius) {
        let mut x = max(0.0, (head.x - radius).floor());
        while x < min(w as f64, head.x + radius) {
            regional.push(sample(x, y));
            x += 2.0;
        }
        y += 2.0;
    }
    let base = glacier_quantile(before.heights.iter().map(|&v| v as f64).collect(), 0.08);
    let relief = glacier_quantile(regional.clone(), 0.9)
        - min(base, glacier_quantile(regional.clone(), 0.15));
    let depth = max(3.0, round(relief * (0.28 + 0.48 * p)));
    let head_floor = max(
        0.0,
        min(
            sample(head.x, head.y) - 4.0,
            glacier_quantile(regional, 0.8) - depth - 1.0,
        ),
    );
    let mut arc = 0.0;
    let mut bar = (8.0 + glacier_noise(s.seed, 80) * 15.0) * step_scale;
    let mut level = head_floor;
    let mut bar_index = 0;
    let mut preliminary = vec![];
    for (k, q) in reference.iter().enumerate() {
        if k > 0 {
            arc += point_distance(*q, reference[k - 1]);
        }
        if arc >= bar && level > 0.0 {
            level -= 1.0;
            bar += (8.0 + glacier_noise(s.seed, 81 + bar_index) * 17.0) * step_scale;
            bar_index += 1;
        }
        let a = reference[k.saturating_sub(3)];
        let b = reference[(k + 3).min(reference.len() - 1)];
        let len = point_distance(b, a);
        let len = if len == 0.0 { 1.0 } else { len };
        let nx = -(b.y - a.y) / len;
        let ny = (b.x - a.x) / len;
        let rim = max(
            sample(q.x + nx * r * 1.15, q.y + ny * r * 1.15),
            sample(q.x - nx * r * 1.15, q.y - ny * r * 1.15),
        );
        let hard = if glacier_hard(before, glacier_tile(before, *q), round(rim)) {
            1.0
        } else {
            before.rock.get(round(rim) as usize).copied().unwrap_or(0.0)
        };
        let confluence = min(
            0.1,
            (log(1.0 + valley.area[glacier_tile(before, *q)] as f64) / std::f64::consts::LN_2)
                * 0.011,
        );
        let width = clamp(
            0.94 + 0.14 * sin(arc * 0.11 + phase) + 0.1 * sin(arc * 0.27 - phase) + confluence
                - hard * 0.1,
            0.7,
            1.3,
        );
        let cirque = 1.0 + 0.72 * exp(-pow(arc / (r * 0.95), 2.0));
        let edge = min(min(min(q.x, q.y), w as f64 - q.x), h as f64 - q.y);
        preliminary.push(GlacierStation {
            x: q.x,
            y: q.y,
            s: arc,
            r: max(2.0, min(r * width * cirque, max(2.0, edge - 1.0) * 0.9)),
            floor: level,
            outlet: rim,
        });
    }
    let mut low_run = 0;
    let mut end = preliminary.len();
    if !s.aimed {
        for (k, q) in preliminary.iter().enumerate() {
            low_run = if q.outlet < base + 1.0 + relief * 0.35 {
                low_run + 1
            } else {
                0
            };
            let edge = min(min(min(q.x, q.y), w as f64 - q.x), h as f64 - q.y);
            if q.s > max(16.0, s.size * 1.15) && (low_run >= 7 || edge < r * 0.5) {
                end = 8.max(k.saturating_sub(if low_run >= 7 { 5 } else { 0 }));
                break;
            }
        }
    }
    preliminary.truncate(end);
    reference.truncate(end);
    let mut path = preliminary;
    let length = glacier_length(&reference);
    let length = if length == 0.0 { 1.0 } else { length };
    for q in &mut path {
        q.s /= length;
    }
    let mut clearance = 0.0;
    for q in &path {
        for y in max(0.0, (q.y - q.r).floor()) as usize..min(h as f64, q.y + q.r).ceil() as usize {
            for x in
                max(0.0, (q.x - q.r).floor()) as usize..min(w as f64, q.x + q.r).ceil() as usize
            {
                let i = y * w + x;
                if before.depth[i] > 0.05
                    && hypot(x as f64 + 0.5 - q.x, y as f64 + 0.5 - q.y) <= q.r
                {
                    clearance = max(clearance, q.floor - before.heights[i] as f64);
                }
            }
        }
    }
    for q in &mut path {
        q.floor = max(cut_floor + 1.0, q.floor - clearance);
    }
    let gentle = clamp(s.power, 0.0, 100.0) / 100.0 < 1.0;
    let cap = if gentle {
        1.0 + round(10.0 * clamp(s.power, 0.0, 100.0) / 100.0)
    } else {
        f64::INFINITY
    };
    if gentle {
        glacier_lift_floors(before, &mut path, s.power);
    }
    let mut out = GlacierPlan {
        map: {
            let mut m = before.clone();
            m.used_ids.extend(before.entities.iter().map(|e| e.id.clone()));
            for e in &mut m.entities {
                e.plain = true;
                if e.new_source.is_some() {
                    e.source_normalized = true;
                }
            }
            m
        },
        path,
        reference,
        stream_path: vec![],
        arrival: vec![1.0; n],
        mask: vec![0; n],
        floor: vec![0; n],
        nearest: vec![-1; n],
        stream: vec![0; n],
        fan: vec![0; n],
        retained: RetainedWater::default(),
        basins: vec![],
        hanging: vec![],
        metrics: [0.0; 14],
        style,
        visits: 0,
        reached: 0,
        floods: 0,
        flood_ticks: 0,
        joins: vec![],
        draining: vec![0; n],
        river_cells: vec![0; n],
        river_heights: vec![0; n],
        next_slot: before
            .entities
            .iter()
            .map(|e| e.slot)
            .max()
            .map_or(0, |s| s + 1),
    };
    let mut closest = vec![f64::INFINITY; n];
    let mut dist = vec![f64::INFINITY; n];
    let mut coarse = vec![f64::NAN; n];
    let mut fine = vec![0.0; n];
    for (k, q) in out.path.iter().enumerate() {
        let rr = q.r + 7.0;
        for y in max(0.0, (q.y - rr).floor()) as usize..min(h as f64, q.y + rr).ceil() as usize {
            for x in max(0.0, (q.x - rr).floor()) as usize..min(w as f64, q.x + rr).ceil() as usize
            {
                let i = y * w + x;
                if coarse[i].is_nan() {
                    coarse[i] = 0.1 * glacier_texture(s.seed, x as f64, y as f64, 9.0);
                    fine[i] = 0.045 * glacier_texture(s.seed ^ 812, x as f64, y as f64, 3.0);
                }
                let angle = atan2(y as f64 + 0.5 - q.y, x as f64 + 0.5 - q.x);
                let rim = 1.0 + 0.045 * sin(angle * 3.0 + q.s * 11.0 + phase) + coarse[i] + fine[i];
                let physical = hypot(x as f64 + 0.5 - q.x, y as f64 + 0.5 - q.y);
                let d = physical / (q.r * rim);
                if d < dist[i] {
                    dist[i] = d;
                }
                if physical < closest[i] {
                    closest[i] = physical;
                    out.nearest[i] = k as i32;
                }
            }
        }
    }
    for i in 0..n {
        if out.nearest[i] < 0 {
            continue;
        }
        let k = out.nearest[i] as usize;
        let q = out.path[k];
        let d = dist[i];
        let shift = round(2.2 * sin((i % w) as f64 * 0.22 + (i / w) as f64 * 0.16 + phase));
        let f = out.path[clamp(k as f64 + shift, 0.0, (out.path.len() - 1) as f64) as usize].floor;
        out.floor[i] = f as u8;
        if d <= 1.0 && gentle && before.heights[i] as f64 - (f + 1.0) > cap {
            out.map.heights[i] = (before.heights[i] as f64 - cap) as u8;
            out.mask[i] = 1;
            out.arrival[i] = q.s as f32;
        } else if d <= 1.0 {
            out.map.heights[i] = if gentle {
                min(before.heights[i] as f64, f + 1.0) as u8
            } else {
                min(top, f + 1.0) as u8
            };
            out.mask[i] = 1;
            out.arrival[i] = q.s as f32;
        } else if d < 1.0 + 3.0 / q.r {
            let height = before.heights[i] as f64;
            let hard = if glacier_hard(&out.map, i, height) {
                1.0
            } else {
                before
                    .rock
                    .get(max(f + 1.0, ((f + height) / 2.0).floor()) as usize)
                    .copied()
                    .unwrap_or(0.0)
            };
            let mut near_water = false;
            if style.skip {
                let x = i % w;
                let y = i / w;
                for yy in y.saturating_sub(2)..=(y + 2).min(h - 1) {
                    for xx in x.saturating_sub(2)..=(x + 2).min(w - 1) {
                        if before.depth[yy * w + xx] > 0.01 {
                            near_water = true;
                        }
                    }
                }
            }
            if height - f >= 5.0
                && hard < 0.5
                && sin(q.s * 19.0 + phase) > if s.benches == 2 { -0.7 } else { 0.15 }
                && s.benches != 0
                && !near_water
            {
                out.map.heights[i] =
                    max(height - cap, min(height, f + round((height - f) * 0.58))) as u8;
                out.mask[i] = 2;
                out.arrival[i] = q.s as f32;
            }
        }
    }
    let mut incoming = vec![];
    for i in 0..n {
        if out.mask[i] == 1 || out.nearest[i] < 0 {
            continue;
        }
        let k = out.nearest[i] as usize;
        let q = out.path[k];
        if q.s < 0.12 || q.s > 0.88 {
            continue;
        }
        let x = (i % w) as i32;
        let y = (i / w) as i32;
        let inside: Vec<_> = GLACIER_N4
            .iter()
            .filter_map(|&(dx, dy)| {
                let xx = x + dx;
                let yy = y + dy;
                if xx >= 0 && yy >= 0 && xx < w as i32 && yy < h as i32 {
                    let j = yy as usize * w + xx as usize;
                    if out.mask[j] == 1 {
                        Some(j)
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();
        if inside.is_empty() || before.heights[i] as f64 - q.floor < 4.0 {
            continue;
        }
        let parent = valley.parent[i];
        let old_wet = before.depth[i] > 0.03 && before.contamination[i] < 0.01;
        if !old_wet && (parent < 0 || out.mask[parent as usize] != 1 || valley.area[i] < 10) {
            continue;
        }
        incoming.push(GlacierIncoming {
            lip: i,
            landing: inside[0],
            k,
            area: valley.area[i],
            old_wet,
        });
    }
    incoming.sort_by_key(|c| {
        (
            -(if c.old_wet { 100000i64 } else { 0 } + c.area as i64),
            c.lip,
        )
    });
    let mut mouths: Vec<GlacierIncoming> = vec![];
    for c in incoming {
        if !mouths.iter().any(|h| {
            hypot(
                (h.lip % w) as f64 - (c.lip % w) as f64,
                (h.lip / w) as f64 - (c.lip / w) as f64,
            ) < 7.0
        }) {
            mouths.push(c);
        }
    }
    let mut clean = 0.0;
    let mut bad = 0.0;
    let mut swept = vec![false; before.next_id.get()];
    glacier_absorb(&out, before, &mut swept, &mut clean, &mut bad);
    let mut surviving_map = before.clone();
    surviving_map.entities.retain(|e| !swept[e.id_key]);
    let (surviving, _) = force_prefill(&force_water_model(&surviving_map), None);
    drop(surviving_map);
    let mut receiving = vec![0u8; n];
    let mut queue = vec![];
    for i in 0..n {
        if out.mask[i] == 1 && before.depth[i] > 0.01 {
            receiving[i] = 1;
            queue.push(i);
        }
    }
    let mut k = 0;
    while k < queue.len() {
        let i = queue[k];
        k += 1;
        let x = (i % w) as i32;
        let y = (i / w) as i32;
        for (dx, dy) in GLACIER_N4 {
            let xx = x + dx;
            let yy = y + dy;
            if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                continue;
            }
            let j = yy as usize * w + xx as usize;
            if receiving[j] != 0 || before.depth[j] <= 0.01 {
                continue;
            }
            receiving[j] = 1;
            queue.push(j);
        }
    }
    let mut incoming_flow = 0.0;
    for e in force_water_model(before).emitters {
        incoming_flow += if e.cells.iter().any(|&i| receiving[i] != 0) {
            e.strength
        } else {
            0.0
        };
    }
    let river_radius = clamp(
        0.95 + s.size / 80.0 + max(0.0, clean - 2.0) * 0.16 + max(0.0, incoming_flow - 8.0) * 0.12,
        1.05,
        2.75,
    );
    let mut bends: Vec<GlacierIncoming> = vec![];
    for &c in &mouths {
        let eligible = if style.course == 1 {
            (s.meltwater && glacier_enough(c.lip, &out, before))
                || (c.old_wet && surviving[c.lip] > 0.0)
        } else {
            c.old_wet || c.area >= 20
        };
        let spacing = if style.course == 1 {
            10.0
        } else {
            max(14.0, r * 1.2)
        };
        if eligible
            && !bends
                .iter()
                .any(|b| (out.path[b.k].s - out.path[c.k].s).abs() * length < spacing)
        {
            bends.push(c);
        }
    }
    let mut visits = vec![];
    if style.course != 3 {
        for list in glacier_inflows(&out, before, &surviving) {
            let e = glacier_entry(&list, before);
            let pt = glacier_pt(before, e.0);
            visits.push(GlacierVisit {
                k: out.nearest[e.0] as usize,
                x: pt.x,
                y: pt.y,
                weight: 1e6 + before.depth[e.1],
            });
        }
        for c in &mouths {
            if (s.meltwater && glacier_enough(c.lip, &out, before))
                || (c.old_wet && surviving[c.lip] > 0.0)
            {
                let pt = glacier_pt(before, c.landing);
                visits.push(GlacierVisit {
                    k: c.k,
                    x: pt.x,
                    y: pt.y,
                    weight: if c.old_wet { 1e5 } else { 0.0 } + c.area as f64,
                });
            }
        }
    }
    let (stream_path, reached) = if style.course == 0 {
        glacier_course(
            &out.path,
            &visits,
            length,
            river_radius,
            phase,
            &out.map,
            &out.mask,
        )
    } else {
        (
            out.path
                .iter()
                .enumerate()
                .map(|(k, q)| {
                    let normal = glacier_normal(&out.path, k);
                    let mut off =
                        sin(q.s * 8.0 + phase) * q.r * 0.35 * sin(std::f64::consts::PI * q.s);
                    let mut weight = 0.0;
                    for c in &bends {
                        let d = (q.s - out.path[c.k].s) * length;
                        let ww = exp(-pow(d / max(10.0, r * 0.85), 2.0));
                        let target = ((c.landing % w) as f64 + 0.5 - q.x) * normal.x
                            + ((c.landing / w) as f64 + 0.5 - q.y) * normal.y;
                        off += clamp(target, -q.r * 0.82, q.r * 0.82) * ww;
                        weight += ww;
                    }
                    off = clamp(off / (1.0 + weight * 0.18), -q.r * 0.84, q.r * 0.84);
                    Point {
                        x: q.x + normal.x * off,
                        y: q.y + normal.y * off,
                    }
                })
                .collect(),
            vec![],
        )
    };
    out.visits = visits.len();
    out.reached = reached.len();
    let mut river_bed = out.path[0].floor;
    let river_beds: Vec<_> = stream_path
        .iter()
        .map(|&q| {
            river_bed = min(river_bed, out.floor[glacier_tile(before, q)] as f64);
            river_bed
        })
        .collect();
    out.channel(&stream_path, &river_beds, river_radius, -1.0, 1, true);
    out.river_cells = out
        .stream
        .iter()
        .map(|&v| if v == 1 { 1 } else { 0 })
        .collect();
    out.river_heights = out.map.heights.clone();
    {
        for i in 0..n {
            if out.river_cells[i] == 0 {
                continue;
            }
            let x = (i % w) as i32;
            let y = (i / w) as i32;
            for (dx, dy) in GLACIER_N4 {
                let xx = x + dx;
                let yy = y + dy;
                if xx >= 0 && yy >= 0 && xx < w as i32 && yy < h as i32 {
                    let j = yy as usize * w + xx as usize;
                    if out.mask[j] == 1 && out.river_cells[j] == 0 {
                        out.map.heights[j] = min(top, out.floor[j] as f64 + 1.0) as u8;
                    }
                }
            }
        }
    }
    let tarn = stream_path[3.min(out.path.len() - 1)];
    let mut lake_seeds = vec![];
    let tarn_x = min(3.5, 1.5 + length * 0.035);
    let tarn_y = min(2.6, 1.3 + length * 0.025);
    for y in max(0.0, (tarn.y - 3.0).floor()) as usize..min(h as f64, tarn.y + 3.0).ceil() as usize
    {
        for x in
            max(0.0, (tarn.x - 4.0).floor()) as usize..min(w as f64, tarn.x + 4.0).ceil() as usize
        {
            let i = y * w + x;
            if s.tarn
                && pow((x as f64 + 0.5 - tarn.x) / tarn_x, 2.0)
                    + pow((y as f64 + 0.5 - tarn.y) / tarn_y, 2.0)
                    < 1.0
                && out.mask[i] == 1
            {
                out.map.heights[i] = max(0.0, out.path[0].floor - 1.0) as u8;
                lake_seeds.push(i);
                out.stream[i] = 2;
                out.arrival[i] = 0.0;
            }
        }
    }
    out.stream_path = stream_path;
    glacier_finish_morphology(
        &mut out,
        before,
        s,
        intent,
        valley,
        &mouths,
        &surviving,
        &reached,
        &river_beds,
        river_radius,
        length,
        r,
        phase,
        tarn,
        &lake_seeds,
        &mut swept,
        &mut clean,
        &mut bad,
        incoming_flow,
        cap,
        gentle,
        cut_floor,
    );
    out
}
fn group_member_id(anchor: &str, tile: usize, origin: usize, w: usize, n: usize, taken: &std::collections::HashSet<std::sync::Arc<str>>) -> std::sync::Arc<str> {
    let along = tile as isize % w as isize - origin as isize % w as isize + tile as isize / w as isize - origin as isize / w as isize;
    let place = along.rem_euclid(n as isize);
    if place == 0 { return anchor.into(); }
    let mut args = vec![anchor.to_owned(), "sourceGroup".into(), place.to_string()];
    let mut id = force_guid(&args);
    let mut k = 1;
    while taken.contains(id.as_str()) { args.truncate(3); args.push(k.to_string()); id = force_guid(&args); k += 1; }
    id.into()
}
fn glacier_source_id(
    out: &GlacierPlan,
    s: &GlacierSettings,
    intent: &Intent,
    serial: &mut usize,
) -> std::sync::Arc<str> {
    loop {
        let id = force_guid(&[
            "glaciate".into(),
            s.seed.to_string(),
            (intent.origin as usize).to_string(),
            serial.to_string(),
        ]);
        *serial += 1;
        if !out.map.used_ids.contains(id.as_str()) && !out.map.entities.iter().any(|e| e.id.as_ref() == id) {
            return id.into();
        }
    }
}
impl GlacierPlan {
    fn value(&self) -> V {
        let m = &self.metrics;
        let style = ["visits", "bends", "meander", "round 4"][self.style.course as usize]
            .to_owned()
            + if self.style.skip || self.style.course == 3 {
                ""
            } else {
                ", benches by water"
            };
        let finished = if self.style.course == 3 {
            json!({"style":style,"visits":self.visits,"reached":self.reached})
        } else {
            json!({"style":style,"visits":self.visits,"reached":self.reached,"floods":self.floods,"floodTicks":self.flood_ticks})
        };
        json!({"total":50,
        "path":self.path.iter().map(|q|json!({"x":q.x,"y":q.y,"s":q.s,"r":q.r,"floor":q.floor,"outlet":q.outlet})).collect::<Vec<_>>(),"reference":self.reference.iter().map(Point::value).collect::<Vec<_>>(),"streamPath":self.stream_path.iter().map(Point::value).collect::<Vec<_>>(),"arrival":self.arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),"mask":self.mask,"floor":self.floor,"nearest":self.nearest,"stream":self.stream,"fan":self.fan,
        "retained":{"tiles":self.retained.tiles,"floor":self.retained.floor,"depth":self.retained.depth,"contamination":self.retained.contamination},"basins":self.basins.iter().map(|b|json!({"tiles":b.tiles,"floor":b.floor,"outlet":b.outlet,"depth":b.depth,"fed":b.fed})).collect::<Vec<_>>(),
        "hanging":self.hanging.iter().map(|h|json!({"mouth":h.mouth,"lip":h.mouth,"landing":h.landing,"source":h.source,"catchment":h.catchment,"drop":h.drop,"s":h.s,"wet":h.wet,"channel":h.channel,"joinLength":h.join_length})).collect::<Vec<_>>(),
        "metrics":{"cut":m[0],"deposited":m[1],"carriedAway":m[2],"treesRemoved":m[3],"objectsRemoved":m[4],"cleanAbsorbed":m[5],"badSwept":m[6],"maxPoolJoin":m[7],"length":m[8],"valleyLength":m[9],"centreline":m[10],"valley":m[11],"outwash":m[12],"requestedWidth":m[13]},"finished":finished,"joins":self.joins.iter().map(|j|json!({"kind":j.kind,"from":j.from,"length":j.length})).collect::<Vec<_>>()})
    }
}
fn glacier_floods(p: &GlacierPlan) -> (usize, usize) {
    let m = force_water_model(&p.map);
    let mut sim = water::Sim::new(
        m.w,
        m.h,
        m.floor,
        m.dam,
        m.emitters,
        p.map.depth.clone(),
        p.map.contamination.clone(),
        true,
        true,
    );
    let count = |s: &water::Sim| {
        (0..s.n)
            .filter(|&i| p.mask[i] == 1 && p.stream[i] == 0 && s.d[i] > 0.001)
            .count()
    };
    let allowed = max(
        12.0,
        round(p.mask.iter().filter(|&&v| v == 1).count() as f64 * 0.01),
    ) as usize;
    for t in (0..300).step_by(25) {
        sim.run(25, 1.0);
        if t % 100 == 75 {
            let n = count(&sim);
            if n > allowed * 4 {
                return (n, t + 25);
            }
        }
    }
    (count(&sim), 300)
}
fn glaciate(before: &Map, mut map: Map, s: &GlacierSettings, intent: &Intent, keep: &[u8]) -> Plan {
    let valley = GlacierValley::new(before);
    let mut best: Option<GlacierPlan> = None;
    if !s.finish {
        best = Some(glacier_once(
            before,
            s,
            intent,
            &valley,
            GlacierStyle {
                course: 3,
                skip: false,
            },
        ));
    }
    for course in 0..if s.finish { 3 } else { 0 } {
        let mut stop = false;
        for skip in [true, false] {
            let mut p = glacier_once(before, s, intent, &valley, GlacierStyle { course, skip });
            let (floods, ticks) = glacier_floods(&p);
            p.floods = floods;
            p.flood_ticks = ticks;
            let allowed = max(
                12.0,
                round(p.mask.iter().filter(|&&v| v == 1).count() as f64 * 0.01),
            ) as usize;
            if best.as_ref().map_or(true, |b| {
                ticks > b.flood_ticks || (ticks == b.flood_ticks && floods < b.floods)
            }) {
                best = Some(p);
            }
            if floods <= allowed {
                stop = true;
                break;
            }
        }
        if stop {
            break;
        }
    }
    let mut p = best.unwrap();
    let raw = p.map.clone();
    for i in 0..p.map.heights.len() {
        p.map.lava[i] &= mask(p.map.heights[i]);
    }
    respect_keep(before, &mut p.map, keep);
    let mut retained = RetainedWater::default();
    for (k, &i) in p.retained.tiles.iter().enumerate() {
        if p.map.heights[i] as f64 == p.retained.floor[k] {
            retained.tiles.push(i);
            retained.floor.push(p.retained.floor[k]);
            retained.depth.push(p.retained.depth[k]);
            retained.contamination.push(p.retained.contamination[k]);
        }
    }
    p.retained = retained;
    let (d, c) = force_prefill(&force_water_model(&p.map), Some(&p.retained));
    p.map.depth = d;
    p.map.contamination = c;
    map.error = p.map.error;
    map.next_id.set(p.map.next_id.get());
    map.next_slot.set(p.map.next_slot.get());
    map.id_names.replace(p.map.id_names.borrow().clone());
    map.heights.copy_from_slice(&p.map.heights);
    map.lava.copy_from_slice(&p.map.lava);
    map.depth.copy_from_slice(&p.map.depth);
    map.contamination.copy_from_slice(&p.map.contamination);
    map.entities.clone_from(&p.map.entities);
    map.fallen.clone_from(&p.map.fallen);
    Plan {
        map,
        raw: Some(raw),
        records: Records::Glaciate(Box::new(p)),
        literal: Literal::default(),
        geometry: vec![],
        objects: vec![],
        fallen: vec![],
        raw_objects: vec![],
        raw_fallen: vec![],
        step_objects: vec![],
        closure_objects: vec![],
        closure_fallen: vec![],
        literal_objects: vec![],
        before: None,
        before_objects: vec![],
        before_fallen: vec![],
    }
}
fn glacier_add_source(out: &mut GlacierPlan, i: usize, strength: f64, id: std::sync::Arc<str>) {
    let slot = out.next_slot;
    out.next_slot += 1;
    let mut e = new_water_entity(id, i, strength, &out.map, slot);
    e.owner = "glaciate".into();
    e.source_normalized = true;
    out.map.entities.push(e);
}
fn glacier_add_group(
    out: &mut GlacierPlan,
    i: usize,
    strength: f64,
    flow: Point,
    s: &GlacierSettings,
    intent: &Intent,
    taken: &mut [u8],
    serial: &mut usize,
) {
    let w = out.map.w;
    let (row, wanted) = clean_source_row(
        &out.map,
        i % w,
        i / w,
        strength,
        force_hash(&[
            s.seed.to_string(),
            (intent.origin as usize).to_string(),
            i.to_string(),
        ]),
        flow,
        taken,
    );
    if row.is_empty() {
        let id = glacier_source_id(out, s, intent, serial);
        glacier_add_source(out, i, strength, id);
        return;
    }
    let anchor = glacier_source_id(out, s, intent, serial);
    let n = wanted.max(row.len());
    let mut ids = out.map.used_ids.clone();
    ids.extend(out.map.entities.iter().map(|e| e.id.clone()));
    ids.insert(anchor.clone());
    for (at, strength) in row {
        let id = if at == i {
            anchor.clone()
        } else {
            group_member_id(&anchor, at, i, w, n, &ids)
        };
        ids.insert(id.clone());
        glacier_add_source(out, at, strength, id);
        taken[at] = 1;
    }
}
#[allow(clippy::too_many_arguments)]
fn glacier_finish_morphology(
    out: &mut GlacierPlan,
    before: &Map,
    s: &GlacierSettings,
    intent: &Intent,
    valley: &GlacierValley,
    mouths: &[GlacierIncoming],
    surviving: &[f64],
    reached: &[GlacierVisit],
    river_beds: &[f64],
    river_radius: f64,
    length: f64,
    r: f64,
    phase: f64,
    tarn: Point,
    lake_seeds: &[usize],
    swept: &mut [bool],
    clean: &mut f64,
    bad: &mut f64,
    incoming_flow: f64,
    cap: f64,
    gentle: bool,
    cut_floor: f64,
) {
    let w = out.map.w;
    let h = out.map.h;
    let n = w * h;
    let top = out.map.ceiling;
    let mut upstream = vec![vec![]; n];
    for i in 0..n {
        if valley.parent[i] >= 0 {
            upstream[valley.parent[i] as usize].push(i);
        }
    }
    out.draining = out.river_cells.clone();
    let finish = out.style.course != 3;
    let river_dist = if finish { out.floor_distance() } else { vec![] };
    let reached_at: HashSet<_> = reached
        .iter()
        .map(|v| v.y.floor() as usize * w + v.x.floor() as usize)
        .collect();
    for c in mouths {
        let mut chain = vec![c.lip];
        let mut at = c.lip;
        let mut k = 0;
        while (k as f64) < max(18.0, r * 2.5) {
            let options: Vec<_> = upstream[at]
                .iter()
                .copied()
                .filter(|&j| out.mask[j] != 1)
                .collect();
            if options.is_empty() {
                break;
            }
            at = options[0];
            for &b in &options[1..] {
                if !(valley.area[at] > valley.area[b]) {
                    at = b;
                }
            }
            chain.push(at);
            if k > 8 && before.heights[at] as i32 >= before.heights[c.lip] as i32 + 2 {
                break;
            }
            k += 1;
        }
        let gully = &chain[..chain.len().min(5)];
        let from = glacier_pt(before, c.landing);
        let feed = s.meltwater
            && glacier_enough(c.lip, out, before)
            && (!finish || reached_at.contains(&c.landing) || river_dist[c.landing] <= 6.0);
        let old_wet = c.old_wet && surviving[c.lip] > 0.0;
        let mut cells = vec![];
        if feed || old_wet {
            let mut bed = max(0.0, before.heights[c.lip] as f64 - 1.0);
            let mut beds: Vec<_> = gully
                .iter()
                .map(|&i| {
                    bed = max(bed, before.heights[i] as f64 - 1.0);
                    bed
                })
                .collect();
            beds.reverse();
            let points: Vec<_> = gully.iter().rev().map(|&i| glacier_pt(before, i)).collect();
            cells.extend(out.channel(&points, &beds, 0.76, out.path[c.k].s, 3, true));
        }
        out.map.heights[c.lip] =
            (before.heights[c.lip] as i32 - if feed || old_wet { 1 } else { 0 }) as u8;
        out.arrival[c.lip] = out.path[c.k].s as f32;
        let mut join_length = 0.0;
        if feed || old_wet {
            cells.extend(out.channel(
                &[from],
                &[out.floor[c.landing] as f64],
                1.25,
                out.path[c.k].s,
                2,
                true,
            ));
            let (l, cs) = out.join_river(from, out.path[c.k].s, 0.5, false);
            join_length = l;
            cells.extend(cs);
            out.joins.push(GlacierJoin {
                kind: "fall",
                from: c.landing,
                length: l,
            });
        }
        let mut seen = HashSet::new();
        cells.retain(|i| seen.insert(*i));
        out.hanging.push(GlacierHanging {
            mouth: c.lip,
            landing: c.landing,
            source: if feed { Some(c.lip) } else { None },
            catchment: c.area,
            drop: out.map.heights[c.lip] as f64 - out.map.heights[c.landing] as f64,
            s: out.path[c.k].s,
            wet: false,
            channel: cells,
            join_length,
        });
    }
    let mut landings = vec![];
    for i in 0..n {
        if out.stream[i] != 3 {
            continue;
        }
        let x = (i % w) as i32;
        let y = (i / w) as i32;
        for (dx, dy) in GLACIER_N4 {
            let xx = x + dx;
            let yy = y + dy;
            if xx >= 0 && yy >= 0 && xx < w as i32 && yy < h as i32 {
                let j = yy as usize * w + xx as usize;
                if out.mask[j] == 1 && out.stream[j] == 0 {
                    landings.push(j);
                }
            }
        }
    }
    for i in landings {
        if finish && out.stream[i] != 0 {
            continue;
        }
        let from = glacier_pt(before, i);
        if !finish {
            out.channel(
                &[from],
                &[out.floor[i] as f64],
                1.2,
                out.path[out.nearest[i] as usize].s,
                2,
                true,
            );
        }
        let (length, _) = out.join_river(from, out.path[out.nearest[i] as usize].s, 0.5, finish);
        out.joins.push(GlacierJoin {
            kind: "spill",
            from: i,
            length,
        });
    }
    let mut scree: Vec<_> = out
        .hanging
        .iter()
        .filter(|h| h.source.is_some() || before.depth[h.mouth] > 0.03)
        .map(|h| h.landing)
        .collect();
    for k in (6..out.path.len()).step_by(7) {
        if !s.scree || glacier_noise(s.seed, k as u32 + 550) <= 0.68 {
            continue;
        }
        let q = out.path[k];
        let a = out.path[k - 2];
        let b = out.path[(k + 2).min(out.path.len() - 1)];
        let len = hypot(b.x - a.x, b.y - a.y);
        let len = if len == 0.0 { 1.0 } else { len };
        let side = if glacier_noise(s.seed, k as u32 + 900) > 0.5 {
            1.0
        } else {
            -1.0
        };
        scree.push(glacier_tile(
            before,
            Point {
                x: q.x - ((b.y - a.y) / len) * q.r * 0.87 * side,
                y: q.y + ((b.x - a.x) / len) * q.r * 0.87 * side,
            },
        ));
    }
    for centre in scree {
        let cx = (centre % w) as f64 + 0.5;
        let cy = (centre / w) as f64 + 0.5;
        let rad = 2.5 + glacier_noise(s.seed, centre as u32) * 2.0;
        for y in max(0.0, (cy - rad).floor()) as usize..min(h as f64, cy + rad).ceil() as usize {
            for x in max(0.0, (cx - rad).floor()) as usize..min(w as f64, cx + rad).ceil() as usize
            {
                let i = y * w + x;
                let d = hypot(x as f64 + 0.5 - cx, y as f64 + 0.5 - cy);
                if out.mask[i] != 1 || out.stream[i] != 0 || d > rad {
                    continue;
                }
                out.map.heights[i] = max(
                    out.floor[i] as f64,
                    min(
                        before.heights[i] as f64,
                        out.floor[i] as f64 + ((1.0 - d / rad) * 3.0).floor(),
                    ),
                ) as u8;
            }
        }
    }
    let snout = *out.path.last().unwrap();
    let prior = out.path[out.path.len().saturating_sub(7)];
    let dl = hypot(snout.x - prior.x, snout.y - prior.y);
    let dl = if dl == 0.0 { 1.0 } else { dl };
    let sdx = (snout.x - prior.x) / dl;
    let sdy = (snout.y - prior.y) / dl;
    for i in 0..n {
        let ex = (i % w) as f64 + 0.5 - snout.x;
        let ey = (i / w) as f64 + 0.5 - snout.y;
        let along = ex * sdx + ey * sdy;
        let rad = hypot(ex, ey);
        let angle = atan2(ey, ex);
        if along > 0.0
            && (rad - snout.r * 0.92 * (1.0 + 0.1 * sin(angle * 3.0 + phase))).abs() < 1.6
            && out.stream[i] == 0
        {
            out.map.heights[i] = max(
                out.map.heights[i] as f64,
                min(
                    top,
                    snout.floor
                        + 1.0
                        + if glacier_noise(s.seed, i as u32) > 0.73 {
                            1.0
                        } else {
                            0.0
                        },
                ),
            ) as u8;
            out.mask[i] = 2;
            out.arrival[i] = 1.0;
        }
        let across = -ex * sdy + ey * sdx;
        let width = r * (0.75 + along / (r * 3.0));
        if along > snout.r
            && along < snout.r + r * 2.8
            && across.abs() < width * (1.0 + 0.1 * sin(along * 0.2 + phase))
            && (before.heights[i] as f64) < snout.floor
            && out.stream[i] == 0
        {
            let target = max(
                0.0,
                snout.floor
                    - ((along - snout.r) / (10.0 + glacier_noise(s.seed, 19) * 7.0)).floor(),
            );
            if target > before.heights[i] as f64 {
                out.map.heights[i] = target as u8;
                out.fan[i] = 1;
                out.arrival[i] = 1.0;
            }
        }
    }
    let snout_pt = Point {
        x: snout.x,
        y: snout.y,
    };
    let mut tail = valley.path(before, glacier_tile(before, snout_pt), n as f64);
    let mut tail_index = glacier_tile(before, *tail.last().unwrap());
    while valley.parent[tail_index] >= 0 {
        tail_index = valley.parent[tail_index] as usize;
        tail.push(glacier_pt(before, tail_index));
    }
    if let Some(exit) = tail
        .iter()
        .position(|&q| out.mask[glacier_tile(before, q)] != 1)
    {
        if exit > 0 {
            tail = tail[exit..].to_vec();
        }
    }
    if tail.iter().any(|&q| out.mask[glacier_tile(before, q)] == 1) {
        let origin = glacier_tile(before, snout_pt);
        let goal = glacier_tile(before, *tail.last().unwrap());
        let mut cost = vec![f64::INFINITY; n];
        let mut parent = vec![-1i32; n];
        let mut heap = ForceHeap::default();
        cost[origin] = 0.0;
        heap.push(0.0, origin);
        let allowed = |i: usize| out.mask[i] != 1 || out.nearest[i] >= out.path.len() as i32 - 7;
        while let Some((d, i)) = heap.pop() {
            if d != cost[i] {
                continue;
            }
            if i == goal {
                break;
            }
            let x = (i % w) as i32;
            let y = (i / w) as i32;
            for (xx, yy) in FORCE_N8 {
                let nx = x + xx;
                let ny = y + yy;
                if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                    continue;
                }
                let j = ny as usize * w + nx as usize;
                if !allowed(j) {
                    continue;
                }
                if xx != 0
                    && yy != 0
                    && !allowed(y as usize * w + nx as usize)
                    && !allowed(ny as usize * w + x as usize)
                {
                    continue;
                }
                let next = d + hypot(xx as f64, yy as f64)
                    * (1.0 + max(0.0, before.heights[j] as f64 - snout.floor) * 0.35);
                if next < cost[j] {
                    cost[j] = next;
                    parent[j] = i as i32;
                    heap.push(next, j);
                }
            }
        }
        if cost[goal].is_finite() {
            let mut indices = vec![];
            let mut i = goal as i32;
            while i >= 0 {
                indices.push(i as usize);
                if i as usize == origin {
                    break;
                }
                i = parent[i as usize];
            }
            indices.reverse();
            tail = indices.iter().map(|&i| glacier_pt(before, i)).collect();
        }
    }
    let outlet = if finish {
        min(snout.floor, *river_beds.last().unwrap())
    } else {
        snout.floor
    };
    let mut bed = outlet;
    let mut tail_arc = 14.0;
    let beds: Vec<_> = tail
        .iter()
        .enumerate()
        .map(|(k, &q)| {
            if k > 0 {
                tail_arc += point_distance(q, tail[k - 1]);
            }
            bed = max(
                0.0,
                min(
                    min(bed, before.heights[glacier_tile(before, q)] as f64),
                    outlet - (tail_arc / 14.0).floor(),
                ),
            );
            bed
        })
        .collect();
    let mut points = vec![*out.stream_path.last().unwrap()];
    points.extend(tail);
    let mut levels = vec![outlet];
    levels.extend(beds);
    out.channel(&points, &levels, river_radius, 1.0, 1, false);
    for list in glacier_inflows(out, before, surviving) {
        let entry = glacier_entry(&list, before);
        let centre = glacier_pt(before, entry.0);
        let far = |i: usize, stream: &[u8]| {
            stream[i] == 0
                && hypot(
                    (i % w) as f64 - (entry.0 % w) as f64,
                    (i / w) as f64 - (entry.0 / w) as f64,
                ) > 2.0
        };
        for &(i, outside) in &list {
            if far(i, &out.stream) {
                out.map.heights[i] = max(
                    out.map.heights[i] as f64,
                    min(
                        top,
                        (before.heights[outside] as f64 + before.depth[outside]).ceil(),
                    ),
                ) as u8;
            }
        }
        if finish {
            let mut wet = vec![];
            let mut seen = HashSet::new();
            for &(_, o) in &list {
                if seen.insert(o) {
                    wet.push(o);
                }
            }
            let mut shore = vec![];
            let mut seen = HashSet::new();
            for o in wet {
                for dy in -2..=2 {
                    for dx in -2..=2 {
                        let x = (o % w) as i32 + dx;
                        let y = (o / w) as i32 + dy;
                        if x >= 0 && y >= 0 && x < w as i32 && y < h as i32 {
                            let j = y as usize * w + x as usize;
                            if out.mask[j] != 1 && seen.insert(j) {
                                shore.push(j);
                            }
                        }
                    }
                }
            }
            for o in shore {
                for (dx, dy) in GLACIER_N4 {
                    let x = (o % w) as i32 + dx;
                    let y = (o / w) as i32 + dy;
                    if x >= 0 && y >= 0 && x < w as i32 && y < h as i32 {
                        let i = y as usize * w + x as usize;
                        if out.mask[i] == 1
                            && far(i, &out.stream)
                            && out.map.heights[i] <= out.map.heights[o]
                        {
                            out.map.heights[i] = min(top, out.map.heights[o] as f64 + 1.0) as u8;
                        }
                    }
                }
            }
        }
        let (length, _) = out.join_river(
            centre,
            out.path[out.nearest[entry.0] as usize].s,
            if finish {
                river_radius
            } else {
                min(river_radius, 0.99)
            },
            false,
        );
        out.joins.push(GlacierJoin {
            kind: "inflow",
            from: entry.0,
            length,
        });
    }
    let freeboard =
        if incoming_flow + *clean + 0.65 + if s.meltwater { river_radius * 0.7 } else { 0.0 } > 3.0
        {
            2.0
        } else {
            1.0
        };
    for _ in 0..2 {
        let mut receiving_map = out.map.clone();
        receiving_map.entities.retain(|e| {
            !out.map.footprint(e, 0).iter().any(|&i| {
                out.mask[i] == 1 || out.stream[i] != 0 || before.heights[i] != out.map.heights[i]
            })
        });
        let spill = force_spill(&force_water_model(&receiving_map));
        drop(receiving_map);
        for i in 0..n {
            if out.mask[i] != 1 || out.stream[i] != 0 {
                continue;
            }
            let mut bank = out.floor[i] as f64 + 1.0;
            let x = (i % w) as i32;
            let y = (i / w) as i32;
            for (dx, dy) in GLACIER_N4 {
                let xx = x + dx;
                let yy = y + dy;
                if xx >= 0 && yy >= 0 && xx < w as i32 && yy < h as i32 {
                    let j = yy as usize * w + xx as usize;
                    if out.stream[j] == 1 || out.stream[j] == 2 {
                        bank = max(
                            max(bank, out.map.heights[j] as f64 + freeboard),
                            spill[j] + if finish { freeboard } else { 1.0 },
                        );
                    }
                }
            }
            out.map.heights[i] = max(out.map.heights[i] as f64, min(top, bank)) as u8;
        }
    }
    glacier_absorb(out, before, swept, clean, bad);
    let mut trees = 0.0;
    let mut objects = 0.0;
    let mut entities = std::mem::take(&mut out.map.entities);
    entities.retain(|e| {
        if e.template.as_ref() == "StartingLocation" {
            return true;
        }
        if out.map.footprint(e, 0).iter().any(|&i| {
            out.mask[i] == 1 || out.stream[i] != 0 || before.heights[i] != out.map.heights[i]
        }) {
            if plant(e.template.as_ref()) {
                trees += 1.0;
            } else {
                objects += 1.0;
            }
            false
        } else {
            true
        }
    });
    out.map.entities = entities;
    let mut alive = vec![false; out.map.next_id.get()];
    for e in &out.map.entities {
        alive[e.id_key] = true;
    }
    out.map.fallen.retain(|f| alive[f.id_key]);
    for i in 0..n {
        out.map.lava[i] &= mask(out.map.heights[i]);
    }
    let mut serial = 0;
    let mut taken = vec![0; n];
    for e in &out.map.entities {
        for i in out.map.footprint(e, 0) {
            taken[i] = 1;
        }
    }
    if s.meltwater {
        let a = out.path[0];
        let b = out.path[6.min(out.path.len() - 1)];
        if finish {
            glacier_add_group(
                out,
                glacier_tile(before, tarn),
                0.65 + *clean,
                Point {
                    x: b.x - a.x,
                    y: b.y - a.y,
                },
                s,
                intent,
                &mut taken,
                &mut serial,
            );
        } else {
            let at = glacier_tile(before, tarn);
            let mut sites = vec![at];
            sites.extend(lake_seeds.iter().copied().filter(|&i| i != at));
            let mut strength = 0.65 + *clean;
            let mut index = 0;
            while strength > 0.0 {
                let amount = min(8.0, strength);
                let id = glacier_source_id(out, s, intent, &mut serial);
                glacier_add_source(out, sites[index % sites.len()], amount, id);
                index += 1;
                strength -= amount;
            }
        }
        let fed: Vec<_> = out
            .hanging
            .iter()
            .filter(|h| h.source.is_some())
            .map(|h| (h.source.unwrap(), h.mouth, h.landing, h.catchment))
            .collect();
        let weights: Vec<_> = fed
            .iter()
            .map(|&(_, mouth, _, catchment)| {
                (0.12 + min(0.32, catchment as f64 / 650.0))
                    * (0.65 + glacier_noise(s.seed, mouth as u32) * 0.7)
            })
            .collect();
        let mut total = 0.0;
        for &v in &weights {
            total += v;
        }
        let budget = max(0.25, river_radius * 0.7);
        let scale = min(1.0, budget / if total == 0.0 { 1.0 } else { total });
        for (k, &(source, mouth, landing, _)) in fed.iter().enumerate() {
            if finish {
                glacier_add_group(
                    out,
                    source,
                    weights[k] * scale,
                    Point {
                        x: (landing % w) as f64 - (mouth % w) as f64,
                        y: (landing / w) as f64 - (mouth / w) as f64,
                    },
                    s,
                    intent,
                    &mut taken,
                    &mut serial,
                );
            } else {
                let id = glacier_source_id(out, s, intent, &mut serial);
                glacier_add_source(out, source, weights[k] * scale, id);
            }
        }
    }
    let (potential, _) = force_prefill(&force_water_model(&out.map), None);
    for i in 0..n {
        if out.mask[i] != 1 || out.stream[i] != 0 {
            continue;
        }
        let x = (i % w) as i32;
        let y = (i / w) as i32;
        for (dx, dy) in GLACIER_N4 {
            let xx = x + dx;
            let yy = y + dy;
            if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                continue;
            }
            let j = yy as usize * w + xx as usize;
            if out.mask[j] == 1 || potential[j] <= 0.0 || out.map.heights[j] < out.floor[i] {
                continue;
            }
            let bank = min(
                top,
                out.map.heights[j] as f64 + max(freeboard, (potential[j] + 0.05).ceil()),
            );
            if bank > out.map.heights[i] as f64 {
                out.map.heights[i] = bank as u8;
            }
        }
    }
    let bank_spill = force_spill(&force_water_model(&out.map));
    for i in 0..n {
        if out.mask[i] == 1
            && out.stream[i] == 0
            && bank_spill[i] > out.map.heights[i] as f64
            && bank_spill[i] <= out.floor[i] as f64 + 2.0
        {
            out.map.heights[i] = bank_spill[i] as u8;
        }
    }
    let mut max_join = 0.0;
    for h in &out.hanging {
        max_join = max(max_join, h.join_length);
    }
    let centre_points: Vec<_> = out.path.iter().map(|q| Point { x: q.x, y: q.y }).collect();
    let centre_len = glacier_length(&centre_points);
    let centre_direct = point_distance(centre_points[0], *centre_points.last().unwrap());
    let ref_len = glacier_length(&out.reference);
    let ref_direct = point_distance(out.reference[0], *out.reference.last().unwrap());
    out.metrics = [
        0.0,
        0.0,
        0.0,
        trees,
        objects,
        *clean,
        *bad,
        max_join,
        length,
        ref_len,
        centre_len
            / if centre_direct == 0.0 {
                1.0
            } else {
                centre_direct
            },
        ref_len / if ref_direct == 0.0 { 1.0 } else { ref_direct },
        0.0,
        s.size,
    ];
    let mut removed = true;
    while removed {
        removed = false;
        let slopes: HashMap<_, _> = out
            .map
            .entities
            .iter()
            .filter(|e| e.template.as_ref() == "Slope")
            .map(|e| (e.y as usize * w + e.x as usize, e.z))
            .collect();
        out.map.entities.retain(|e| {
            if e.template.as_ref() != "Slope" {
                return true;
            }
            let (dx, dy) = match e.orientation.as_ref() {
                "Cw90" => (-1, 0),
                "Cw180" => (0, 1),
                "Cw270" => (1, 0),
                _ => (0, -1),
            };
            let hx = e.x as i32 + dx;
            let hy = e.y as i32 + dy;
            let lx = e.x as i32 - dx;
            let ly = e.y as i32 - dy;
            let valid = hx >= 0
                && hy >= 0
                && lx >= 0
                && ly >= 0
                && hx < w as i32
                && hy < h as i32
                && lx < w as i32
                && ly < h as i32
                && out.map.heights[hy as usize * w + hx as usize] as f64 == e.z + 1.0
                && (out.map.heights[ly as usize * w + lx as usize] as f64 == e.z
                    || slopes.get(&(ly as usize * w + lx as usize)).copied() == Some(e.z - 1.0));
            if !valid {
                removed = true;
                out.metrics[4] += 1.0;
            }
            valid
        });
    }
    if gentle {
        let most = cap + 2.0;
        let was = out.map.heights.clone();
        for i in 0..n {
            out.map.heights[i] = max(
                before.heights[i] as f64 - most,
                min(before.heights[i] as f64 + cap, out.map.heights[i] as f64),
            ) as u8;
        }
        for e in &mut out.map.entities {
            let i = e.y as usize * w + e.x as usize;
            if e.z == was[i] as f64 && was[i] != out.map.heights[i] {
                e.z = out.map.heights[i] as f64;
            }
        }
    }
    for i in 0..n {
        if (out.map.heights[i] as f64) < cut_floor && out.map.heights[i] < before.heights[i] {
            out.map.heights[i] = min(before.heights[i] as f64, cut_floor) as u8;
        }
        out.map.lava[i] &= mask(out.map.heights[i]);
    }
    let model = force_water_model(&out.map);
    let spill = force_spill(&model);
    let (feed, _) = force_prefill(&model, None);
    let mut seen = vec![false; n];
    for &i in lake_seeds {
        if seen[i] || spill[i] <= out.map.heights[i] as f64 {
            continue;
        }
        let level = spill[i];
        let mut queue = vec![i];
        seen[i] = true;
        let mut k = 0;
        while k < queue.len() {
            let j = queue[k];
            k += 1;
            let x = (j % w) as i32;
            let y = (j / w) as i32;
            for (dx, dy) in GLACIER_N4 {
                let xx = x + dx;
                let yy = y + dy;
                if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                    continue;
                }
                let a = yy as usize * w + xx as usize;
                if seen[a] || spill[a] != level || out.map.heights[a] as f64 >= level {
                    continue;
                }
                seen[a] = true;
                queue.push(a);
            }
        }
        if queue.len() < 3 {
            continue;
        }
        let bottom = queue.iter().map(|&j| out.map.heights[j]).min().unwrap() as f64;
        queue.sort_unstable();
        let fed = queue.iter().any(|&j| feed[j] > 0.01);
        out.basins.push(GlacierBasin {
            tiles: queue,
            floor: bottom,
            outlet: level,
            depth: level - bottom,
            fed,
        });
    }
    let mut retained_tiles: Vec<_> = out
        .basins
        .iter()
        .flat_map(|b| b.tiles.iter().copied())
        .collect();
    retained_tiles.sort_unstable();
    retained_tiles.dedup();
    for i in retained_tiles {
        out.retained.tiles.push(i);
        out.retained.floor.push(out.map.heights[i] as f64);
        out.retained.depth.push(if s.meltwater {
            max(0.0, spill[i] - out.map.heights[i] as f64 - 0.04)
        } else {
            0.0
        });
        out.retained.contamination.push(0.0);
    }
    let (d, c) = force_prefill(&model, Some(&out.retained));
    out.map.depth = d;
    out.map.contamination = c;
    let mut cut = 0.0;
    let mut deposited = 0.0;
    let mut outwash = 0.0;
    for i in 0..n {
        cut += max(0.0, before.heights[i] as f64 - out.map.heights[i] as f64);
        deposited += max(0.0, out.map.heights[i] as f64 - before.heights[i] as f64);
        if out.fan[i] != 0 {
            outwash += max(0.0, out.map.heights[i] as f64 - before.heights[i] as f64);
        }
    }
    if cut == 0.0 && deposited == 0.0 && out.map.entities.len() == before.entities.len() {
        out.map.error = 17;
    }
    out.metrics[0] = cut;
    out.metrics[1] = deposited;
    out.metrics[2] = cut - deposited;
    out.metrics[12] = outwash;
}
#[derive(Clone)]
struct Segment {
    a: Point,
    b: Point,
    length: f64,
    along: f64,
}
impl Segment {
    fn value(&self) -> V {
        json!({"a":self.a.value(),"b":self.b.value(),"length":self.length,"along":self.along})
    }
}
#[derive(Clone)]
struct LobePoint {
    p: Point,
    width: f64,
}
#[derive(Clone)]
struct Lobe {
    points: Vec<LobePoint>,
    length: f64,
    strength: f64,
}
impl Lobe {
    fn value(&self) -> V {
        json!({"points":self.points.iter().map(|p|json!({"x":p.p.x,"y":p.p.y,"width":p.width})).collect::<Vec<_>>(),"length":self.length,"strength":self.strength})
    }
}
#[derive(Clone)]
struct Volcano {
    x: f64,
    y: f64,
    datum: f64,
    radius: f64,
    height: f64,
    summit: String,
    phase: f64,
    segments: Vec<Segment>,
    vents: Vec<Point>,
    length: f64,
    lobes: Vec<Lobe>,
    scale: f64,
    ceiling: f64,
    asked: Option<Point>,
    /// No ground within reach has the room to rise (eruptAnatomy's NO_ROOM_REASON).
    no_room: bool,
}
fn erupt_size(p: f64) -> f64 {
    2.0 * (7.0 + 36.0 * pow(p / 100.0, 1.15))
}
fn summit(s0: &Settings) -> &str {
    if s(s0, "summit") == "auto" {
        if n(s0, "power") < 32.0 {
            "peak"
        } else if n(s0, "power") < 80.0 {
            "crater"
        } else {
            "caldera"
        }
    } else {
        s(s0, "summit")
    }
}
fn vent_radius(s0: &Settings) -> f64 {
    s0.size.map(|v| v / 2.0).unwrap_or_else(|| {
        erupt_size(n(s0, "power"))
            * 0.5
            * (if s(s0, "shape") == "broad" {
                1.6
            } else if s(s0, "mode") == "vent" && summit(s0) != "caldera" {
                0.74
            } else {
                1.0
            })
            * (if s(s0, "mode") == "fissure" {
                0.47
            } else {
                1.0
            })
    })
}
fn natural_breadth(s0: &Settings) -> f64 {
    let mut v = s0.clone();
    v.size = None;
    2.0 * vent_radius(&v)
}
fn profile(s0: &Settings, summit: &str, r: f64, fissure: bool) -> f64 {
    let e = if s(s0, "shape") == "steep" {
        if fissure {
            0.83
        } else {
            1.7
        }
    } else {
        1.65
    };
    if !fissure && summit == "caldera" {
        return if r < 0.43 {
            0.34
        } else if r < 0.6 {
            0.34 + 0.48 * smooth((r - 0.43) / 0.17)
        } else {
            0.82 * max(0.0, 1.0 - (r - 0.6) / 0.65)
        };
    }
    if !fissure && summit == "crater" && r < 0.19 {
        let rim = pow(1.0 - 0.19, e);
        return rim - 0.22 * (1.0 - smooth(r / 0.19));
    }
    pow(max(0.0, 1.0 - r), e)
}
fn apron(s0: &Settings) -> (f64, f64) {
    if s(s0, "flows") == "heavy" {
        (1.75, 2.0 + n(s0, "power") * 0.014)
    } else {
        (1.25, 0.8)
    }
}
fn lava_lobes(m: &Map, a: &Volcano, seed: f64, heavy: bool) -> Vec<Lobe> {
    let mut out = vec![];
    let count = (if heavy { 4.0 } else { 3.0 })
        + (hash(seed, 720.0) * (if heavy { 7.0 } else { 4.0 })).floor();
    let mut angles: Vec<f64> = vec![];
    let ground = |x: f64, y: f64| m.heights[m.at(x, y)] as f64;
    for k in 0..count as usize {
        let k = k as f64;
        let mut angle = hash(seed, 730.0 + k) * PI * 2.0;
        let mut attempt = 0.0;
        while attempt < 20.0
            && angles
                .iter()
                .any(|&t| atan2(sin(t - angle), cos(t - angle)).abs() < 0.29)
        {
            angle = hash(seed, 900.0 + k * 23.0 + attempt) * PI * 2.0;
            attempt += 1.0;
        }
        angles.push(angle);
        let start = if a.summit == "caldera" {
            0.64
        } else if a.summit == "crater" {
            0.19
        } else {
            0.12
        };
        let reach = (if heavy { 0.86 } else { 0.72 })
            + pow(hash(seed, 800.0 + k), 1.4) * (if heavy { 1.5 } else { 0.7 });
        let length = a.radius * (reach - start);
        let steps = max(12.0, (length / 0.65).ceil());
        let width = (0.85 + hash(seed, 820.0 + k) * 1.35) * max(0.7, a.radius / 22.0);
        let phase = hash(seed, 840.0 + k) * PI * 2.0;
        let mut points = vec![];
        let mut x = a.x + cos(angle) * a.radius * start;
        let mut y = a.y + sin(angle) * a.radius * start;
        for j in 0..=steps as usize {
            let u = j as f64 / steps;
            let r = a.radius * (start + (reach - start) * u);
            let theta = angle + 0.32 * sin(u * 5.8 + phase) + 0.19 * sin(u * 10.2 - phase);
            if j > 0 {
                let desired = atan2(a.y + sin(theta) * r - y, a.x + cos(theta) * r - x);
                let step = length / steps;
                let mut best = f64::INFINITY;
                let mut bx = x;
                let mut by = y;
                for turn in [0.0f64, -0.25, 0.25, -0.5, 0.5] {
                    let nx = x + cos(desired + turn) * step;
                    let ny = y + sin(desired + turn) * step;
                    if hypot(nx - a.x, ny - a.y) < hypot(x - a.x, y - a.y) {
                        continue;
                    }
                    let score = ground(nx, ny) * 0.7 + turn.abs() * 0.65;
                    if score < best {
                        best = score;
                        bx = nx;
                        by = ny;
                    }
                }
                if hypot(x - a.x, y - a.y) > a.radius && ground(bx, by) > ground(x, y) {
                    break;
                }
                x = bx;
                y = by;
            }
            let tongue = 1.0 + 1.2 * exp(-pow((u - 0.89) / 0.18, 2.0));
            points.push(LobePoint {
                p: Point { x, y },
                width: width * (0.38 + 0.62 * u) * tongue,
            });
        }
        if points.len() > 1 {
            out.push(Lobe {
                points,
                length,
                strength: 1.1 + hash(seed, 860.0 + k) * 1.4,
            });
        }
    }
    out
}
fn lobe_field(w: usize, h: usize, lobes: &[Lobe]) -> Vec<f32> {
    let mut field = vec![0.0f32; w * h];
    for lobe in lobes {
        for k in 1..lobe.points.len() {
            let a = &lobe.points[k - 1];
            let b = &lobe.points[k];
            let dx = b.p.x - a.p.x;
            let dy = b.p.y - a.p.y;
            let l2 = dx * dx + dy * dy;
            let width = max(a.width, b.width);
            let y0 = max(0.0, (min(a.p.y, b.p.y) - width).floor()) as i32;
            let y1 = min(h as f64 - 1.0, (max(a.p.y, b.p.y) + width).ceil()) as i32;
            let x0 = max(0.0, (min(a.p.x, b.p.x) - width).floor()) as i32;
            let x1 = min(w as f64 - 1.0, (max(a.p.x, b.p.x) + width).ceil()) as i32;
            for y in y0..=y1 {
                for x in x0..=x1 {
                    let t = clamp(
                        ((x as f64 - a.p.x) * dx + (y as f64 - a.p.y) * dy)
                            / (if l2 == 0.0 { 1.0 } else { l2 }),
                        0.0,
                        1.0,
                    );
                    let width = a.width + (b.width - a.width) * t;
                    let d = hypot(x as f64 - a.p.x - dx * t, y as f64 - a.p.y - dy * t) / width;
                    if d < 1.0 {
                        let v = pow(1.0 - d * d, 0.65) * lobe.strength;
                        let i = y as usize * w + x as usize;
                        field[i] = max(field[i] as f64, v) as f32;
                    }
                }
            }
        }
    }
    field
}
fn rise_bound(s0: &Settings, a: &Volcano) -> f64 {
    let fissure = s(s0, "mode") == "fissure";
    let strength = a.lobes.iter().fold(0.0, |v, l| max(v, l.strength));
    let mut top = 0.0;
    for k in 0..=260 {
        let r = k as f64 / 100.0;
        let p = profile(s0, &a.summit, r, fissure);
        let (reach, thick) = apron(s0);
        let apron = thick * pow(max(0.0, 1.0 - r / reach), 1.4);
        let ridge = if boolean(s0, "ridges") {
            if fissure {
                (1.0 - smooth((r - 1.05) / 0.85))
                    * smooth((r - 0.34) / 0.32)
                    * (0.8 + n(s0, "power") * 0.022)
            } else {
                strength
                    * (0.7 + n(s0, "power") * 0.013)
                    * smooth((r - if a.summit == "caldera" { 0.6 } else { 0.19 }) / 0.2)
            }
        } else {
            0.0
        };
        let basin = !fissure
            && r < if a.summit == "caldera" {
                0.6
            } else if a.summit == "crater" {
                0.19
            } else {
                0.0
            };
        let rise = if basin {
            a.height * p
        } else {
            max(a.height * p, apron) + ridge
        };
        if rise > top {
            top = rise;
        }
    }
    top
}
#[allow(dead_code)]
#[derive(Clone, Copy)]
struct EField {
    r: f64,
    theta: f64,
    ridge: f64,
    cx: f64,
    cy: f64,
    along: f64,
    vent: Point,
    vent_distance: f64,
}
impl Volcano {
    fn proto(m: &Map, s0: &Settings, intent: &Intent) -> Self {
        let origin = n(intent, "origin") as usize;
        let x = (origin % m.w) as f64;
        let y = (origin / m.w) as f64;
        let p = n(s0, "power") / 100.0;
        let summit = summit(s0).to_string();
        let radius = vent_radius(s0);
        let fissure = s(s0, "mode") == "fissure";
        let legacy = fissure || summit == "caldera";
        let height = (2.0 + 18.0 * p)
            * (if legacy {
                (if s(s0, "shape") == "broad" { 0.7 } else { 1.0 })
                    * (if fissure { 0.75 } else { 1.0 })
            } else if s(s0, "shape") == "broad" {
                0.55
            } else {
                1.42
            });
        let mut segments = vec![];
        let mut vents = vec![];
        let mut length = 0.0;
        if fissure {
            let path = intent.path.clone();
            for k in 1..path.len() {
                let a = path[k - 1];
                let b = path[k];
                let l = hypot(b.x - a.x, b.y - a.y);
                if l > 0.01 {
                    segments.push(Segment {
                        a,
                        b,
                        length: l,
                        along: length,
                    });
                    length += l;
                }
            }
            assert!(length >= 3.0, "Draw a longer fissure");
            let spacing = max(7.0, radius * 0.72);
            let count = max(2.0, (length / spacing).ceil());
            for k in 0..=count as usize {
                let d = (length * k as f64) / count;
                let seg = segments
                    .iter()
                    .find(|v| d <= v.along + v.length)
                    .unwrap_or(segments.last().unwrap());
                let t = (d - seg.along) / seg.length;
                vents.push(Point {
                    x: seg.a.x + (seg.b.x - seg.a.x) * t,
                    y: seg.a.y + (seg.b.y - seg.a.y) * t,
                });
            }
        } else {
            vents.push(Point { x, y });
        }
        let mut a = Self {
            x,
            y,
            radius,
            height,
            datum: m.heights[origin] as f64,
            summit,
            phase: hash(n(s0, "seed"), 71.0) * PI * 2.0,
            segments,
            vents,
            length,
            lobes: vec![],
            scale: 1.0,
            ceiling: 22.0,
            asked: None,
            no_room: false,
        };
        if !fissure {
            a.lobes = lava_lobes(m, &a, n(s0, "seed"), s(s0, "flows") == "heavy");
        }
        a
    }
    fn field(&self, s0: &Settings, x: f64, y: f64) -> EField {
        let mut cx = self.x;
        let mut cy = self.y;
        let mut along = 0.0;
        let mut distance = f64::INFINITY;
        for seg in &self.segments {
            let dx = seg.b.x - seg.a.x;
            let dy = seg.b.y - seg.a.y;
            let t = clamp(
                ((x - seg.a.x) * dx + (y - seg.a.y) * dy) / (seg.length * seg.length),
                0.0,
                1.0,
            );
            let xx = seg.a.x + dx * t;
            let yy = seg.a.y + dy * t;
            let d = hypot(x - xx, y - yy);
            if d < distance {
                distance = d;
                cx = xx;
                cy = yy;
                along = seg.along + t * seg.length;
            }
        }
        let theta = atan2(y - cy, x - cx);
        let edge =
            1.0 + 0.07 * sin(theta * 3.0 + self.phase) + 0.045 * sin(theta * 5.0 - self.phase);
        let r = hypot(x - cx, y - cy) / (self.radius * edge);
        let wave = if s(s0, "mode") == "vent" {
            theta * (6.0 + (hash(n(s0, "seed"), 20.0) * 4.0).floor()) + self.phase + r * 0.9
        } else {
            along / (3.0 + hash(n(s0, "seed"), 20.0) * 2.0) + self.phase + r * 0.8
        };
        let ridge = pow(max(0.0, cos(wave)), 8.0);
        let mut nearest = f64::INFINITY;
        let mut vent = self.vents[0];
        for &v in &self.vents {
            let d = hypot(x - v.x, y - v.y);
            if d < nearest {
                nearest = d;
                vent = v;
            }
        }
        EField {
            r,
            theta,
            ridge,
            cx,
            cy,
            along,
            vent,
            vent_distance: nearest,
        }
    }
    fn raise(
        &self,
        m: &Map,
        s0: &Settings,
        flows: &[f32],
        f: EField,
        i: usize,
        h: f64,
        k: f64,
    ) -> f64 {
        let r = f.r;
        let local = m.heights[round(f.cy) as usize * m.w + round(f.cx) as usize] as f64;
        let vent = s(s0, "mode") == "vent";
        let datum = if vent { self.datum } else { local };
        let mut p = profile(s0, &self.summit, r, !vent);
        if !vent {
            let bowl = 1.0 - smooth(f.vent_distance / max(2.4, self.radius * 0.19));
            p = max(
                0.0,
                p - bowl
                    * (if self.summit == "caldera" {
                        0.4
                    } else if self.summit == "peak" {
                        0.12
                    } else {
                        0.27
                    }),
            );
        }
        let shoulder = smooth((r - 0.48) / 0.7);
        let cone = datum
            + (if k == 1.0 || vent {
                self.height
            } else {
                self.height * k
            }) * p
            + (h - datum) * shoulder;
        let flows_here = if k == 1.0 && !vent {
            1.0
        } else if vent && (self.scale < 1.0 || self.asked.is_some()) && h > datum {
            0.0
        } else {
            1.0
        };
        let (reach, thick) = apron(s0);
        let lobed = if vent && !self.lobes.is_empty() {
            0.7 + 0.3 * min(1.0, flows[i] as f64 / 1.1)
        } else {
            1.0
        };
        let apron = thick
            * pow(max(0.0, 1.0 - r / reach), 1.4)
            * (0.86 + 0.14 * sin(f.theta * 4.0 + self.phase + r))
            * lobed
            * k
            * flows_here;
        let ridge = if boolean(s0, "ridges") {
            (if !vent {
                f.ridge
                    * (1.0 - smooth((r - 1.05) / 0.85))
                    * smooth((r - 0.34) / 0.32)
                    * (0.8 + n(s0, "power") * 0.022)
            } else {
                flows[i] as f64
                    * (0.7 + n(s0, "power") * 0.013)
                    * smooth((r - if self.summit == "caldera" { 0.6 } else { 0.19 }) / 0.2)
                    * (1.0 - smooth((r - reach * 0.7) / (reach * 0.3)))
            }) * k
                * flows_here
        } else {
            0.0
        };
        let mut target = max(max(h, cone), h + apron) + ridge;
        if vent
            && r < if self.summit == "caldera" {
                0.6
            } else if self.summit == "crater" {
                0.19
            } else {
                0.0
            }
        {
            target = max(h, cone);
        }
        target
    }
    fn core_box(&self, m: &Map) -> (i32, i32, i32, i32) {
        let reach = self.radius * 1.12;
        let mut x0 = (self.x - reach).floor();
        let mut x1 = (self.x + reach).ceil();
        let mut y0 = (self.y - reach).floor();
        let mut y1 = (self.y + reach).ceil();
        for seg in &self.segments {
            x0 = min(x0, (min(seg.a.x, seg.b.x) - reach).floor());
            x1 = max(x1, (max(seg.a.x, seg.b.x) + reach).ceil());
            y0 = min(y0, (min(seg.a.y, seg.b.y) - reach).floor());
            y1 = max(y1, (max(seg.a.y, seg.b.y) + reach).ceil());
        }
        (
            max(0.0, x0) as i32,
            max(0.0, y0) as i32,
            min(m.w as f64 - 1.0, x1) as i32,
            min(m.h as f64 - 1.0, y1) as i32,
        )
    }
    fn fits(&self, m: &Map, s0: &Settings, keep: &[u8]) -> bool {
        let over = |t: f64| round(round(t * 4096.0) / 4096.0) > self.ceiling;
        let vent = s(s0, "mode") == "vent";
        if vent {
            let basin = self.summit == "caldera" || self.summit == "crater";
            let peak = if self.summit == "caldera" {
                0.34
            } else if self.summit == "crater" {
                profile(s0, "crater", 0.0, false)
            } else {
                1.0
            };
            let apron = if basin { 0.0 } else { apron(s0).1 };
            if keep
                .get(self.y as usize * m.w + self.x as usize)
                .copied()
                .unwrap_or(0)
                == 0
                && over(self.datum + max(self.height * peak, apron))
            {
                return false;
            }
        }
        let (x0, y0, x1, y1) = self.core_box(m);
        let mut ground = if vent { self.datum } else { 0.0 };
        for y in y0..=y1 {
            for x in x0..=x1 {
                let h = m.heights[y as usize * m.w + x as usize] as f64;
                if h > ground {
                    ground = h;
                }
            }
        }
        let bound = rise_bound(s0, self) + 1e-9;
        if !over(ground + bound) {
            return true;
        }
        let flows = lobe_field(m.w, m.h, &self.lobes);
        let floor = if vent { self.datum } else { 0.0 };
        for y in y0..=y1 {
            for x in x0..=x1 {
                let i = y as usize * m.w + x as usize;
                if keep.get(i).copied().unwrap_or(0) != 0
                    || !over(max(m.heights[i] as f64, floor) + bound)
                {
                    continue;
                }
                let f = self.field(s0, x as f64, y as f64);
                if f.r > 1.0 {
                    continue;
                }
                if over(self.raise(m, s0, &flows, f, i, m.heights[i] as f64, 1.0)) {
                    return false;
                }
            }
        }
        true
    }
    fn new(m: &Map, s0: &Settings, intent: &Intent, keep: &[u8]) -> Self {
        let ceiling = min(22.0, m.ceiling);
        let mut a = Self::proto(m, s0, intent);
        a.ceiling = ceiling;
        if s(s0, "mode") == "fissure" || a.fits(m, s0, keep) {
            return a;
        }
        let mut room = ceiling - a.datum;
        let need = min(rise_bound(s0, &a), 4.0);
        if room < need {
            let reach = max(8.0, a.radius * 1.5);
            let r = reach.ceil() as i32;
            let mut best = None;
            let mut best_score = f64::INFINITY;
            for dy in -r..=r {
                for dx in -r..=r {
                    let xx = a.x + dx as f64;
                    let yy = a.y + dy as f64;
                    if xx < 2.0 || yy < 2.0 || xx > m.w as f64 - 3.0 || yy > m.h as f64 - 3.0 {
                        continue;
                    }
                    let i = yy as usize * m.w + xx as usize;
                    if ceiling - (m.heights[i] as f64) < need
                        || keep.get(i).copied().unwrap_or(0) != 0
                    {
                        continue;
                    }
                    let d = hypot(dx as f64, dy as f64);
                    if d > reach || d * 0.99 > best_score {
                        continue;
                    }
                    let bucket = portable_math::rem(
                        (((atan2(dy as f64, dx as f64) + PI) / (PI * 2.0)) * 12.0).floor(),
                        12.0,
                    );
                    let score = d * (1.0 + 0.3 * hash(n(s0, "seed"), 940.0 + bucket));
                    if score < best_score {
                        best_score = score;
                        best = Some(i);
                    }
                }
            }
            let Some(at) = best else {
                a.no_room = true;
                return a;
            };
            let asked = Point { x: a.x, y: a.y };
            a = Self::proto(
                m,
                s0,
                &Intent {
                    origin: at as f64,
                    ..Intent::default()
                },
            );
            a.ceiling = ceiling;
            a.asked = Some(asked);
            if a.fits(m, s0, keep) {
                return a;
            }
            room = ceiling - a.datum;
        }
        let mut k = min(1.0, room / rise_bound(s0, &a));
        if k >= 1.0 {
            return a;
        }
        if s(s0, "summit") == "auto" && a.summit != "peak" && k < 0.75 {
            a.summit = "peak".into();
            a.lobes = lava_lobes(m, &a, n(s0, "seed"), s(s0, "flows") == "heavy");
            k = min(1.0, room / rise_bound(s0, &a));
        }
        a.scale = k;
        a.height *= k;
        if s0.size.is_none() {
            let mut top = 0.0;
            for k in 0..=650 {
                top = max(top, profile(s0, &a.summit, k as f64 / 500.0, false));
            }
            let edge = top - 0.5 / max(0.5, a.height);
            let mut widest = 0.0;
            let mut from = -1.0;
            for k in 0..=650 {
                let r = k as f64 / 500.0;
                let at = profile(s0, &a.summit, r, false) >= edge;
                if at && from < 0.0 {
                    from = r;
                }
                if (!at || k == 650) && from >= 0.0 {
                    widest = max(widest, if from == 0.0 { r } else { r - from });
                    from = -1.0;
                }
            }
            let broad = max(
                0.6,
                min(
                    min(1.25, 1.0 / portable_math::sqrt(k)),
                    if widest > 0.0 {
                        3.0 / (a.radius * widest)
                    } else {
                        1.25
                    },
                ),
            );
            a.radius *= broad;
            a.lobes = lava_lobes(m, &a, n(s0, "seed"), s(s0, "flows") == "heavy");
        }
        a
    }
    fn value(&self) -> V {
        let mut v = json!({"x":self.x,"y":self.y,"datum":self.datum,"radius":self.radius,"height":self.height,"summit":self.summit,"phase":self.phase,"segments":self.segments.iter().map(Segment::value).collect::<Vec<_>>(),"vents":self.vents.iter().map(Point::value).collect::<Vec<_>>(),"length":self.length,"lobes":self.lobes.iter().map(Lobe::value).collect::<Vec<_>>(),"scale":self.scale,"ceiling":self.ceiling});
        if let Some(p) = self.asked {
            v["asked"] = p.value();
        }
        v
    }
}
fn eruption(before: &Map, mut m: Map, s0: &Settings, intent: &Intent, extra: &[u8]) -> Plan {
    let a = Volcano::new(before, s0, intent, extra);
    if a.no_room {
        m.error = 26;
    }
    let mut keep = vec![0u8; m.w * m.h];
    for (i, &v) in extra.iter().enumerate() {
        if v != 0 {
            keep[i] = 1;
        }
    }
    let flows = lobe_field(m.w, m.h, &a.lobes);
    let bound = if s(s0, "mode") == "fissure" && !a.fits(before, s0, &keep) {
        rise_bound(s0, &a)
    } else {
        0.0
    };
    let strength = strength(n(s0, "power"), s0.size, natural_breadth(s0));
    let mut raised = 0.0;
    let mut changed = 0;
    let mut flattened = 0;
    let mut erased = 0;
    let mut hard = 0;
    for y in 0..m.h {
        for x in 0..m.w {
            let i = y * m.w + x;
            let h = before.heights[i] as f64;
            if keep[i] != 0 {
                continue;
            }
            let f = a.field(s0, x as f64, y as f64);
            if f.r > 2.6 {
                continue;
            }
            let k = if bound != 0.0 {
                min(
                    1.0,
                    max(
                        0.0,
                        a.ceiling
                            - before.heights[round(f.cy) as usize * m.w + round(f.cx) as usize]
                                as f64,
                    ) / bound,
                )
            } else {
                a.scale
            };
            let mut target = a.raise(before, s0, &flows, f, i, h, k);
            target = tempered(h, target, strength);
            target = clamp(
                round(round(target * 4096.0) / 4096.0),
                0.0,
                min(22.0, m.ceiling),
            );
            m.heights[i] = target as u8;
            if target != h {
                changed += 1;
                raised += target - h;
                for z in h as u32..target as u32 {
                    m.lava[i] |= 1u32.wrapping_shl(z);
                }
                hard += 1;
            }
        }
    }
    for _pass in 0..2 {
        for y in 1..m.h - 1 {
            for x in 1..m.w - 1 {
                let i = y * m.w + x;
                if m.heights[i] == before.heights[i] || keep[i] != 0 {
                    continue;
                }
                if a.vents
                    .iter()
                    .any(|v| hypot(x as f64 - v.x, y as f64 - v.y) < max(2.5, a.radius * 0.15))
                {
                    continue;
                }
                let ns = [
                    m.heights[i - 1],
                    m.heights[i + 1],
                    m.heights[i - m.w],
                    m.heights[i + m.w],
                ];
                let lo = *ns.iter().min().unwrap();
                let hi = *ns.iter().max().unwrap();
                let mut v = m.heights[i];
                if v > hi {
                    v = hi;
                } else if v < lo && hypot(x as f64 - a.x, y as f64 - a.y) > a.radius * 0.19 * 1.2 {
                    v = lo;
                }
                if v == m.heights[i] {
                    continue;
                }
                v = v.max(before.heights[i]);
                m.heights[i] = v;
                m.lava[i] &= if v >= 31 { u32::MAX } else { mask(v) };
                for z in before.heights[i]..v {
                    m.lava[i] |= 1u32.wrapping_shl(z as u32);
                }
            }
        }
    }
    for f in &mut m.fallen {
        let i = clamp(n(f, "y").floor(), 0.0, m.h as f64 - 1.0) as usize * m.w
            + clamp(n(f, "x").floor(), 0.0, m.w as f64 - 1.0) as usize;
        setn(f, "z", m.heights[i] as f64);
    }
    let mut entities = vec![];
    for mut e in before.entities.clone() {
        e.plain = true;
        if e.new_source.is_some() {
            e.source_normalized = true;
        }
        let tile = n(&e, "y") as usize * m.w + n(&e, "x") as usize;
        if keep[tile] != 0 || s(&e, "template") == "StartingLocation" {
            entities.push(e);
            continue;
        }
        let f = a.field(s0, n(&e, "x"), n(&e, "y"));
        let is_plant = plant(s(&e, "template"));
        if !emitter(s(&e, "template")) && f.vent_distance < max(1.5, a.radius * 0.065) {
            erased += 1;
            m.fallen.retain(|v| v.id != e.id);
            continue;
        }
        if is_plant && f.vent_distance < a.radius * 0.72 {
            if matches!(s(&e, "template"), "BlueberryBush" | "Succulent") {
                erased += 1;
                continue;
            }
            m.dead(&mut e, f.vent.x, f.vent.y);
            flattened += 1;
        }
        let tiles = m.footprint(&e, 0);
        let height = tiles
            .iter()
            .fold(f64::NEG_INFINITY, |h, &i| max(h, m.heights[i] as f64));
        if tiles
            .iter()
            .any(|&i| keep[i] != 0 && m.heights[i] as f64 != height)
        {
            entities.push(e);
            continue;
        }
        if !is_plant {
            for i in tiles {
                let prior = m.heights[i];
                m.heights[i] = height as u8;
                for z in prior as u32..height as u32 {
                    m.lava[i] |= 1u32.wrapping_shl(z);
                }
            }
        }
        let z = if is_plant {
            m.heights[tile] as f64
        } else {
            height
        };
        if n(&e, "z") != z {
            e.raw_removed = true;
        }
        setn(&mut e, "z", z);
        entities.push(e);
    }
    m.entities = entities;
    let raw = Some(m.clone());
    let stats = [
        raised,
        changed as f64,
        flattened as f64,
        erased as f64,
        hard as f64,
    ];
    m.finalize(before, s0, extra);
    let mut heat = vec![0u8; m.w * m.h * 4];
    for y in 0..m.h {
        for x in 0..m.w {
            let i = y * m.w + x;
            let mut dist = hypot(x as f64 - a.x, y as f64 - a.y);
            let mut along = 0.0;
            if !a.segments.is_empty() {
                dist = f64::INFINITY;
                for seg in &a.segments {
                    let dx = seg.b.x - seg.a.x;
                    let dy = seg.b.y - seg.a.y;
                    let t = clamp(
                        ((x as f64 - seg.a.x) * dx + (y as f64 - seg.a.y) * dy)
                            / (seg.length * seg.length),
                        0.0,
                        1.0,
                    );
                    let d = hypot(x as f64 - seg.a.x - dx * t, y as f64 - seg.a.y - dy * t);
                    if d < dist {
                        dist = d;
                        along = (seg.along + t * seg.length) / a.length;
                    }
                }
            }
            let r = dist / a.radius;
            let vent = if !a.segments.is_empty() {
                1.0 - smooth(dist / 2.1)
            } else {
                1.0 - smooth(r / 0.22)
            };
            let hot = max(
                vent,
                if boolean(s0, "ridges") {
                    min(1.0, flows[i] as f64 / 1.7)
                } else {
                    max(0.0, 1.0 - r) * 0.14
                },
            );
            heat[i * 4] = round(255.0 * hot) as u8;
            heat[i * 4 + 1] = round(110.0 * (1.0 - smooth(r / 1.1))) as u8;
            heat[i * 4 + 2] = round(255.0 * (1.0 - smooth(r / 2.1))) as u8;
            heat[i * 4 + 3] = round(
                255.0
                    * (if !a.segments.is_empty() {
                        along
                    } else {
                        min(1.0, r / 1.8)
                    }),
            ) as u8;
        }
    }
    Plan {
        map: m,
        raw,
        records: Records::Erupt {
            anatomy: a,
            stats,
            strength,
            keep,
            flows,
            heat,
        },
        literal: Literal::default(),
        geometry: vec![],
        objects: vec![],
        fallen: vec![],
        raw_objects: vec![],
        raw_fallen: vec![],
        step_objects: vec![],
        closure_objects: vec![],
        closure_fallen: vec![],
        literal_objects: vec![],
        before: None,
        before_objects: vec![],
        before_fallen: vec![],
    }
}

#[derive(Clone)]
struct FSeg {
    a: Point,
    b: Point,
    dx: f64,
    dy: f64,
    length: f64,
    along: f64,
}
#[derive(Clone, Copy)]
struct Motion {
    d: f64,
    along: f64,
    dx: f64,
    dy: f64,
    end: f64,
    dz: f64,
}
struct Fault {
    settings: Settings,
    side: f64,
    points: Vec<Point>,
    segments: Vec<FSeg>,
    length: f64,
    reach: f64,
    lift: f64,
    slide: f64,
    heading: Point,
    directions: Vec<Point>,
}
impl Fault {
    fn new(s0: &Settings, intent: &Intent) -> Self {
        let path = intent.path.clone();
        let reach = 14.0 + n(s0, "power") * 0.5;
        let lift = 1.0 + round(n(s0, "power") * 0.075);
        let slide = 2.0 + round(n(s0, "power") * 0.18);
        let mut raw = vec![];
        let mut length = 0.0;
        for k in 1..path.len() {
            let a = path[k - 1];
            let b = path[k];
            let l = portable_math::sqrt(pow(b.x - a.x, 2.0) + pow(b.y - a.y, 2.0));
            if l < 0.01 {
                continue;
            }
            raw.push(FSeg {
                a,
                b,
                dx: (b.x - a.x) / l,
                dy: (b.y - a.y) / l,
                length: l,
                along: length,
            });
            length += l;
        }
        if length < 0.001 {
            let a = path[0];
            let b = Point {
                x: a.x + if a.x > 0.25 { -0.25 } else { 0.25 },
                y: a.y,
            };
            raw.push(FSeg {
                a,
                b,
                dx: if b.x > a.x { 1.0 } else { -1.0 },
                dy: 0.0,
                length: 0.25,
                along: 0.0,
            });
            length = 0.25;
        }
        let first = raw[0].a;
        let mut end = raw.last().unwrap().b;
        if hypot(end.x - first.x, end.y - first.y) < 0.1 {
            for seg in &raw {
                if hypot(seg.b.x - first.x, seg.b.y - first.y)
                    > hypot(end.x - first.x, end.y - first.y)
                {
                    end = seg.b;
                }
            }
        }
        let span = hypot(end.x - first.x, end.y - first.y);
        let span = if span == 0.0 { 1.0 } else { span };
        let heading = Point {
            x: (end.x - first.x) / span,
            y: (end.y - first.y) / span,
        };
        let wavelength = 7.0 + hash(n(s0, "seed"), 9.0) * 14.0;
        let rough = 0.35 + hash(n(s0, "seed"), 11.0) * 1.3;
        let mut pts = vec![];
        let mut d = 0.0;
        while d < length + 4.0 {
            let t = min(d, length);
            let r = raw
                .iter()
                .find(|s| t <= s.along + s.length)
                .unwrap_or(raw.last().unwrap());
            let f = t - r.along;
            let nn = t / wavelength;
            let k = nn.floor();
            let a = hash(n(s0, "seed"), k + 100.0) * 2.0 - 1.0;
            let b = hash(n(s0, "seed"), k + 101.0) * 2.0 - 1.0;
            let offset = (a + (b - a) * smooth(nn - k))
                * rough
                * smooth(t / 5.0)
                * smooth((length - t) / 5.0);
            pts.push(Point {
                x: r.a.x + r.dx * f - r.dy * offset,
                y: r.a.y + r.dy * f + r.dx * offset,
            });
            if t == length {
                break;
            }
            d += 4.0;
        }
        let mut segments = vec![];
        let mut len = 0.0;
        for k in 1..pts.len() {
            let a = pts[k - 1];
            let b = pts[k];
            let l = portable_math::sqrt(pow(b.x - a.x, 2.0) + pow(b.y - a.y, 2.0));
            segments.push(FSeg {
                a,
                b,
                dx: (b.x - a.x) / l,
                dy: (b.y - a.y) / l,
                length: l,
                along: len,
            });
            len += l;
        }
        let pos = |t: f64| {
            let d = clamp(t, 0.0, length);
            let r = raw
                .iter()
                .find(|s| d <= s.along + s.length)
                .unwrap_or(raw.last().unwrap());
            let f = d - r.along;
            Point {
                x: r.a.x + r.dx * f,
                y: r.a.y + r.dy * f,
            }
        };
        let straight = raw.iter().all(|r| {
            (r.dx * heading.y - r.dy * heading.x).abs() < 1e-9
                && r.dx * heading.x + r.dy * heading.y > 0.0
        });
        let mut directions = vec![];
        for t in 0..=length.ceil() as usize {
            if straight {
                directions.push(heading);
                continue;
            }
            let a = pos(t as f64 - 6.0);
            let b = pos(t as f64 + 6.0);
            let l = hypot(b.x - a.x, b.y - a.y);
            directions.push(if l > 0.5 {
                Point {
                    x: (b.x - a.x) / l,
                    y: (b.y - a.y) / l,
                }
            } else {
                heading
            });
        }
        Self {
            settings: s0.clone(),
            side: n(intent, "side"),
            points: pts,
            segments,
            length: len,
            reach,
            lift,
            slide,
            heading,
            directions,
        }
    }
    fn at(&self, x: f64, y: f64) -> Motion {
        let mut best = f64::INFINITY;
        let mut f = Motion {
            d: 0.0,
            along: 0.0,
            dx: 1.0,
            dy: 0.0,
            end: 0.0,
            dz: 0.0,
        };
        for s in &self.segments {
            let rx = x - s.a.x;
            let ry = y - s.a.y;
            let t = rx * s.dx + ry * s.dy;
            let u = clamp(t, 0.0, s.length);
            let ex = rx - s.dx * u;
            let ey = ry - s.dy * u;
            let d2 = ex * ex + ey * ey;
            if d2 < best {
                best = d2;
                f = Motion {
                    d: (s.dx * ry - s.dy * rx) * self.side,
                    along: s.along + u,
                    dx: s.dx,
                    dy: s.dy,
                    end: (t - u).abs(),
                    dz: 0.0,
                };
            }
        }
        f
    }
    fn movement(&self, x: f64, y: f64) -> Motion {
        let mut f = self.at(x, y);
        let s0 = &self.settings;
        let side = if f.d >= 0.0 { 1.0 } else { -1.0 };
        let dist = f.d.abs();
        if s(s0, "mode") == "slide" {
            let reach = max(max(self.reach, self.length * 1.3), self.slide + 12.0);
            let envelope = (1.0 - smooth((dist - reach) / 12.0))
                * (1.0 - smooth((f.end - self.slide - 8.0) / 12.0));
            let weight = if s(s0, "scarp") == "stepped" {
                (envelope * 3.0).ceil() / 3.0
            } else {
                envelope
            };
            let amount = (if f.d >= -0.01 { self.slide } else { 0.0 }) * weight;
            let nn = self.directions.len();
            let direction = self.directions[clamp(
                round((f.along / max(1e-9, self.length)) * (nn - 1) as f64),
                0.0,
                (nn - 1) as f64,
            ) as usize];
            let mut dx = round(direction.x * amount);
            let mut dy = round(direction.y * amount);
            if amount == self.slide && hypot(dx, dy) < self.slide {
                if direction.x.abs() >= direction.y.abs() {
                    dx += if direction.x == 0.0 {
                        direction.x
                    } else {
                        direction.x.signum()
                    };
                } else {
                    dy += if direction.y == 0.0 {
                        direction.y
                    } else {
                        direction.y.signum()
                    };
                }
            }
            f.dz = 0.0;
            f.dx = dx;
            f.dy = dy;
            return f;
        }
        let block_reach = max(self.reach, self.length * 1.3);
        let envelope = (1.0 - smooth((dist - block_reach * 0.8) / (block_reach * 0.2)))
            * (1.0 - smooth(f.end / max(8.0, self.reach * 0.6)));
        let step = if s(s0, "scarp") == "stepped" {
            min(1.0, ((dist / 3.0).floor() + 1.0) / 3.0)
        } else {
            1.0
        };
        let tilt = (hash(n(s0, "seed"), 6.0) * 2.0 - 1.0) * (f.along / self.length - 0.5) * 2.4
            + (hash(n(s0, "seed"), 7.0) * 2.0 - 1.0) * clamp(dist / self.reach, 0.0, 1.0) * 1.4;
        let mut dz = round(
            (if side > 0.0 {
                self.lift + tilt
            } else {
                -self.lift * 0.55
            }) * envelope
                * step,
        );
        let branch = (f.along / 22.0).floor();
        let u = f.along / 22.0 - branch;
        if dist < 2.2 && u > 0.3 && u < 0.62 && hash(n(s0, "seed"), branch + 200.0) > 0.48 {
            dz -= 1.0;
        }
        if side < 0.0
            && dist > 3.0
            && dist < 8.0
            && u > 0.38
            && u < 0.58
            && hash(n(s0, "seed"), branch + 230.0) > 0.65
        {
            dz -= 1.0;
        }
        f.dz = dz;
        f.dx = 0.0;
        f.dy = 0.0;
        f
    }
    fn value(&self) -> V {
        json!({"points":self.points.iter().map(Point::value).collect::<Vec<_>>(),"segments":self.segments.iter().map(|s|json!({"a":s.a.value(),"b":s.b.value(),"dx":s.dx,"dy":s.dy,"length":s.length,"along":s.along})).collect::<Vec<_>>(),"length":self.length,"reach":self.reach,"lift":self.lift,"slide":self.slide,"heading":self.heading.value(),"directions":self.directions.iter().map(Point::value).collect::<Vec<_>>()})
    }
}
fn quake(before: &Map, mut m: Map, s0: &Settings, intent: &Intent, extra: &[u8]) -> Plan {
    let fault = Fault::new(s0, intent);
    let nn = m.w * m.h;
    let slide = s(s0, "mode") == "slide";
    let mut arrival = vec![0.0f32; nn];
    let mut dxs = vec![0i16; nn];
    let mut dys = vec![0i16; nn];
    let mut source: Vec<usize> = (0..nn).collect();
    for y in 0..m.h {
        for x in 0..m.w {
            let i = y * m.w + x;
            let f = fault.movement(x as f64, y as f64);
            arrival[i] = clamp(
                (f.along / fault.length) * 0.82 + (f.d.abs() / fault.reach) * 0.12,
                0.0,
                0.94,
            ) as f32;
            dxs[i] = f.dx as i16;
            dys[i] = f.dy as i16;
            let src = clamp(y as f64 - f.dy, 0.0, m.h as f64 - 1.0) as usize * m.w
                + clamp(x as f64 - f.dx, 0.0, m.w as f64 - 1.0) as usize;
            source[i] = src;
            m.heights[i] =
                clamp(before.heights[src] as f64 + f.dz, 0.0, min(22.0, m.ceiling)) as u8;
        }
    }
    let mut channel = 0;
    let mut moved = 0;
    let mut toppled = 0;
    if slide {
        let mut priority = vec![-1.0f32; nn];
        for i in 0..nn {
            let x = (i % m.w) as i32 + dxs[i] as i32;
            let y = (i / m.w) as i32 + dys[i] as i32;
            if x < 0 || y < 0 || x >= m.w as i32 || y >= m.h as i32 {
                continue;
            }
            let j = y as usize * m.w + x as usize;
            let travel = hypot(dxs[i] as f64, dys[i] as f64);
            if travel < (priority[j] as f64) {
                continue;
            }
            priority[j] = travel as f32;
            source[j] = i;
            m.heights[j] = before.heights[i];
            arrival[j] = arrival[i];
        }
        let band = if s(s0, "scarp") == "stepped" {
            10.0
        } else {
            2.5
        };
        let depths = &before.depth;
        for i in 0..nn {
            if depths[i] <= 0.04 {
                continue;
            }
            let x = (i % m.w) as f64;
            let y = (i / m.w) as f64;
            let f = fault.at(x, y);
            if f.d.abs() > 1.25 || f.end > 1.0 {
                continue;
            }
            let nx = -f.dy;
            let ny = f.dx;
            let d = f.d * fault.side;
            let c = Point {
                x: x - nx * d,
                y: y - ny * d,
            };
            let a = Point {
                x: c.x + nx * band,
                y: c.y + ny * band,
            };
            let b = Point {
                x: c.x - nx * band,
                y: c.y - ny * band,
            };
            let da = fault.movement(a.x, a.y);
            let db = fault.movement(b.x, b.y);
            let path = [
                Point {
                    x: a.x + da.dx,
                    y: a.y + da.dy,
                },
                Point {
                    x: c.x + da.dx,
                    y: c.y + da.dy,
                },
                Point {
                    x: c.x + db.dx,
                    y: c.y + db.dy,
                },
                Point {
                    x: b.x + db.dx,
                    y: b.y + db.dy,
                },
            ];
            let bed = before.heights[i];
            for k in 1..path.len() {
                let p0 = path[k - 1];
                let p1 = path[k];
                let n = max(1.0, (hypot(p1.x - p0.x, p1.y - p0.y) * 2.0).ceil());
                for t in 0..=n as usize {
                    let px = p0.x + ((p1.x - p0.x) * t as f64) / n;
                    let py = p0.y + ((p1.y - p0.y) * t as f64) / n;
                    for yy in (py - 1.0).floor() as i32..=(py + 1.0).ceil() as i32 {
                        for xx in (px - 1.0).floor() as i32..=(px + 1.0).ceil() as i32 {
                            if xx < 0
                                || yy < 0
                                || xx >= m.w as i32
                                || yy >= m.h as i32
                                || pow(xx as f64 - px, 2.0) + pow(yy as f64 - py, 2.0) > 1.4
                            {
                                continue;
                            }
                            let j = yy as usize * m.w + xx as usize;
                            if m.heights[j] > bed {
                                m.heights[j] = bed;
                                channel += 1;
                            }
                            arrival[j] = min(arrival[j] as f64, arrival[i] as f64) as f32;
                        }
                    }
                }
            }
        }
    } else if m.heights == before.heights {
        let cap = min(22.0, m.ceiling);
        for p in &fault.points {
            for yy in -2..=2 {
                for xx in -2..=2 {
                    let x = clamp(round(p.x) + xx as f64, 0.0, m.w as f64 - 1.0);
                    let y = clamp(round(p.y) + yy as f64, 0.0, m.h as f64 - 1.0);
                    let i = y as usize * m.w + x as usize;
                    let f = fault.at(x, y);
                    let h = before.heights[i] as f64;
                    m.heights[i] = (if h == 0.0 {
                        1.0
                    } else if h == cap {
                        h - 1.0
                    } else {
                        clamp(h + if f.d >= 0.0 { 1.0 } else { -1.0 }, 0.0, cap)
                    }) as u8;
                }
            }
        }
    }
    let mut occupied = vec![0u8; nn];
    let mut entities = before.entities.clone();
    for e in &mut entities {
        e.plain = true;
        if e.new_source.is_some() {
            e.source_normalized = true;
        }
    }
    let mut order: Vec<usize> = (0..entities.len())
        .filter(|&i| s(&entities[i], "template") != "StartingLocation")
        .collect();
    if slide {
        let inside: Vec<_> = entities
            .iter()
            .map(|e| {
                let f = fault.movement(n(e, "x"), n(e, "y"));
                let mut moved = e.clone();
                setn(&mut moved, "x", n(e, "x") + f.dx);
                setn(&mut moved, "y", n(e, "y") + f.dy);
                let sx = e.sx;
                let sy = e.sy;
                m.footprint(&moved, 0).len() == (sx * sy) as usize
            })
            .collect();
        order.sort_by_key(|&i| !inside[i]);
    }
    let mut fallen: Vec<Fallen> = m.fallen.clone();
    for index in order {
        let e = &mut entities[index];
        let old = e.clone();
        let f = fault.movement(n(e, "x"), n(e, "y"));
        let sx = e.sx;
        let sy = e.sy;
        let mut xs = vec![];
        let mut ys = vec![];
        for (lx, ly) in [
            (0.0, 0.0),
            (sx - 1.0, 0.0),
            (0.0, sy - 1.0),
            (sx - 1.0, sy - 1.0),
        ] {
            let x = if boolean(e, "flipped") && e.flippable {
                sx - 1.0 - lx
            } else {
                lx
            };
            let (xx, yy) = match s(e, "orientation") {
                "Cw90" => (ly, -x),
                "Cw180" => (-x, -ly),
                "Cw270" => (-ly, x),
                _ => (x, ly),
            };
            xs.push(xx);
            ys.push(yy);
        }
        let minx = xs.iter().fold(f64::INFINITY, |a, &v| min(a, v));
        let maxx = xs.iter().fold(f64::NEG_INFINITY, |a, &v| max(a, v));
        let miny = ys.iter().fold(f64::INFINITY, |a, &v| min(a, v));
        let maxy = ys.iter().fold(f64::NEG_INFINITY, |a, &v| max(a, v));
        let px = clamp(n(e, "x") + f.dx, -minx, m.w as f64 - 1.0 - maxx);
        let py = clamp(n(e, "y") + f.dy, -miny, m.h as f64 - 1.0 - maxy);
        setn(e, "x", px);
        setn(e, "y", py);
        if f.dx != 0.0
            || f.dy != 0.0
            || (slide && m.footprint(e, 0).iter().any(|&i| occupied[i] != 0))
        {
            let mut found = false;
            'search: for radius in 0..=m.w.max(m.h) as i32 {
                for yy in -radius..=radius {
                    for xx in -radius..=radius {
                        if radius != 0 && xx.abs() != radius && yy.abs() != radius {
                            continue;
                        }
                        setn(e, "x", px + xx as f64);
                        setn(e, "y", py + yy as f64);
                        let tiles = m.footprint(e, 0);
                        if tiles.len() == (sx * sy) as usize
                            && tiles.iter().all(|&i| occupied[i] == 0)
                        {
                            found = true;
                            break 'search;
                        }
                    }
                }
            }
            if !found {
                m.error = 10;
                e.x = old.x;
                e.y = old.y;
            }
        }
        let old_tile = n(&old, "y") as usize * m.w + n(&old, "x") as usize;
        let tile = n(e, "y") as usize * m.w + n(e, "x") as usize;
        let changed = n(e, "x") != n(&old, "x")
            || n(e, "y") != n(&old, "y")
            || m.heights[tile] != before.heights[old_tile];
        if changed {
            setn(
                e,
                "z",
                clamp(
                    n(&old, "z") + m.heights[tile] as f64 - before.heights[old_tile] as f64,
                    0.0,
                    22.0,
                ),
            );
            e.raw_removed = true;
            moved += 1;
        }
        let support = m.footprint(e, 0);
        for &i in &support {
            occupied[i] = 1;
        }
        if sx * sy > 1.0 && (changed || support.iter().any(|&i| m.heights[i] as f64 != n(e, "z"))) {
            let arrival0 = arrival[old_tile];
            for i in m.footprint(&old, 0) {
                arrival[i] = arrival0;
            }
            for i in support {
                m.heights[i] = n(e, "z") as u8;
                arrival[i] = arrival0;
            }
        }
        if matches!(s(e, "template"), "Pine" | "Birch" | "Oak" | "Succulent")
            && f.d.abs() < 1.9
            && f.end < 2.0
        {
            e.dead = true;
            e.raw_removed = true;
            let ff = Fallen {
                id_key: e.id_key,
                slot: e.slot,
                id: e.id.clone(),
                x: e.x + 0.5,
                y: e.y + 0.5,
                z: e.z,
                dx: if f.dy == 0.0 { 0.7 } else { -f.dy },
                dy: if f.dx == 0.0 { 0.7 } else { f.dx },
                length: if s(e, "template") == "Oak" { 2.6 } else { 2.0 },
                metadata: None,
            };
            if let Some(i) = fallen.iter().position(|v| v.id_key == e.id_key) {
                fallen[i] = ff;
            } else {
                fallen.push(ff);
            }
            toppled += 1;
        } else if let Some(i) = fallen.iter().position(|v| v.id_key == e.id_key) {
            setn(&mut fallen[i], "x", n(e, "x") + 0.5);
            setn(&mut fallen[i], "y", n(e, "y") + 0.5);
            setn(&mut fallen[i], "z", n(e, "z"));
        }
    }
    m.entities = entities;
    m.fallen = fallen;
    let mut transported = 0;
    let mut full_offset = 0;
    if slide {
        for j in 0..nn {
            let i = source[j];
            let distance = hypot(
                (j % m.w) as f64 - (i % m.w) as f64,
                (j / m.w) as f64 - (i / m.w) as f64,
            );
            if distance > 0.0 && m.heights[j] == before.heights[i] {
                transported += 1;
            }
            if distance >= fault.slide && m.heights[j] == before.heights[i] {
                full_offset += 1;
            }
        }
    }
    let mut changed = 0;
    let mut raised = 0.0;
    let mut dropped = 0.0;
    for i in 0..nn {
        let d = m.heights[i] as f64 - before.heights[i] as f64;
        if d != 0.0 {
            changed += 1;
        }
        raised += max(0.0, d);
        dropped += max(0.0, -d);
    }
    let stats = [
        changed as f64,
        raised,
        dropped,
        moved as f64,
        toppled as f64,
        channel as f64,
        transported as f64,
        full_offset as f64,
    ];
    let raw = Some(m.clone());
    let floor = clamp(round(s0.floor.unwrap_or(1.0)), 1.0, 22.0);
    for j in 0..nn {
        if (m.heights[j] as f64) < floor && m.heights[j] < before.heights[j] {
            m.heights[j] = min(before.heights[j] as f64, floor) as u8;
        }
        let i = source[j];
        let dz = if slide {
            0
        } else {
            m.heights[j] as i32 - before.heights[i] as i32
        };
        let bits = before.lava[i];
        m.lava[j] = (if dz >= 0 {
            bits.wrapping_shl(dz as u32)
        } else {
            bits.wrapping_shr((-dz) as u32)
        }) & mask(m.heights[j]);
    }
    m.finalize(before, s0, extra);
    let total = 1.0
        + if slide {
            max(8.0, fault.slide + 2.0)
        } else {
            8.0
        };
    let mut extras = vec![];
    let mut final_depth = before.depth.clone();
    let mut final_contamination = before.contamination.clone();
    if slide {
        let mut moved = vec![0u8; nn];
        for j in 0..nn {
            let x = (j % m.w) as i32;
            let y = (j / m.w) as i32;
            let q = (y - dys[j] as i32).clamp(0, m.h as i32 - 1) as usize * m.w
                + (x - dxs[j] as i32).clamp(0, m.w as i32 - 1) as usize;
            moved[j] = before.heights[q];
        }
        let mut priority = vec![-1f32; nn];
        for i in 0..nn {
            if dxs[i] == 0 && dys[i] == 0 {
                continue;
            }
            let x = (i % m.w) as i32 + dxs[i] as i32;
            let y = (i / m.w) as i32 + dys[i] as i32;
            if x < 0 || y < 0 || x >= m.w as i32 || y >= m.h as i32 {
                continue;
            }
            let j = y as usize * m.w + x as usize;
            let travel = hypot(dxs[i] as f64, dys[i] as f64);
            if travel < priority[j] as f64 {
                continue;
            }
            priority[j] = travel as f32;
            moved[j] = before.heights[i];
        }
        let stages = total - 1.0;
        let first = (stages / 2.0).ceil();
        let span = max(1.0, stages - 1.0 - first);
        for i in 0..nn {
            if moved[i] == m.heights[i] {
                continue;
            }
            let x = (i % m.w) as f64 + 0.5;
            let y = (i / m.w) as f64 + 0.5;
            let mut near = 0;
            let mut best = f64::INFINITY;
            for (k, q) in fault.points.iter().enumerate() {
                let d = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y);
                if d < best {
                    best = d;
                    near = k;
                }
            }
            extras.extend([
                i as u32,
                (first + round(span * near as f64 / max(1.0, fault.points.len() as f64 - 1.0)))
                    as u32,
            ]);
        }
        // Last destination wins exactly as the TS where[] assignment does.
        let mut at = vec![-1i32; nn];
        for j in 0..nn {
            at[source[j]] = j as i32;
        }
        final_depth.fill(0.0);
        final_contamination.fill(0.0);
        for q in 0..nn {
            let d = before.depth[q];
            if d == 0.0 {
                continue;
            }
            let j = if at[q] >= 0 { at[q] as usize } else { q };
            final_depth[j] += d;
            final_contamination[j] += d * before.contamination[q];
        }
        for j in 0..nn {
            final_contamination[j] = if final_depth[j] != 0.0 {
                final_contamination[j] / final_depth[j]
            } else {
                0.0
            };
        }
    }
    Plan {
        map: m,
        raw,
        records: Records::Quake {
            extras,
            final_depth,
            final_contamination,
            fault,
            stats,
            arrival,
            dx: dxs,
            dy: dys,
            source: source.into_iter().map(|i| i as u32).collect(),
            total,
        },
        literal: Literal::default(),
        geometry: vec![],
        objects: vec![],
        fallen: vec![],
        raw_objects: vec![],
        raw_fallen: vec![],
        step_objects: vec![],
        closure_objects: vec![],
        closure_fallen: vec![],
        literal_objects: vec![],
        before: None,
        before_objects: vec![],
        before_fallen: vec![],
    }
}

fn id_extent(a: &Map, b: &Map) -> usize {
    a.entities
        .iter()
        .chain(&b.entities)
        .map(|e| e.id_key)
        .chain(a.fallen.iter().chain(&b.fallen).map(|f| f.id_key))
        .max()
        .map_or(0, |v| v + 1)
}
fn entity_index(m: &Map, extent: usize) -> Vec<usize> {
    let mut at = vec![usize::MAX; extent];
    for (i, e) in m.entities.iter().enumerate() {
        at[e.id_key] = i;
    }
    at
}
fn respect_keep(before: &Map, after: &mut Map, keep: &[u8]) {
    if keep.is_empty() {
        return;
    }
    let mut any = false;
    for i in 0..keep.len() {
        if keep[i] != 0
            && (after.heights[i] != before.heights[i] || after.lava[i] != before.lava[i])
        {
            after.heights[i] = before.heights[i];
            after.lava[i] = before.lava[i];
            any = true;
        }
    }
    let kept_xy = |x: f64, y: f64| {
        keep.get(y as usize * before.w + x as usize)
            .copied()
            .unwrap_or(0)
            == 1
    };
    let kept = |e: &Entity| kept_xy(e.x, e.y);
    let extent = id_extent(before, after);
    let mut now = vec![false; extent];
    let mut had_kept = vec![false; extent];
    for e in &after.entities {
        now[e.id_key] = true;
    }
    for e in &before.entities {
        if kept(e) {
            had_kept[e.id_key] = true;
        }
    }
    let unique_now = now.iter().filter(|&&v| v).count();
    let mut out: Vec<_> = after
        .entities
        .iter()
        .filter(|e| !kept(e) || had_kept[e.id_key])
        .cloned()
        .collect();
    // Replacement uses the first match, as Array.findIndex in respectKeep does.
    let mut first = vec![usize::MAX; extent];
    for (i, e) in out.iter().enumerate() {
        if first[e.id_key] == usize::MAX {
            first[e.id_key] = i;
        }
    }
    for b in &before.entities {
        if kept(b) {
            let k = first[b.id_key];
            if k != usize::MAX {
                out[k] = b.clone();
            } else {
                first[b.id_key] = out.len();
                out.push(b.clone());
            }
            any = true;
        }
    }
    if any || out.len() != unique_now {
        after.entities = out;
        now.fill(false);
        for e in &after.entities {
            now[e.id_key] = true;
        }
        after
            .fallen
            .retain(|f| now[f.id_key] && !kept_xy(f.x.floor(), f.y.floor()));
        let mut fallen_ids = vec![false; extent];
        for f in &after.fallen {
            fallen_ids[f.id_key] = true;
        }
        for f in &before.fallen {
            if kept_xy(f.x.floor(), f.y.floor()) && !fallen_ids[f.id_key] {
                after.fallen.push(f.clone());
                fallen_ids[f.id_key] = true;
            }
        }
    }
}
fn kept_object(e: &Entity) -> bool {
    let owner = s(e, "owner");
    s(e, "template") == "StartingLocation"
        || owner.starts_with("pinned:")
        || matches!(owner, "derived:slopes" | "derived:rim-slopes")
}
#[derive(Default)]
struct Literal {
    tiles: Vec<u32>,
    heights: Vec<u8>,
    rock_tiles: Vec<u32>,
    bits: Vec<u32>,
    removed: Vec<String>,
    moved: Vec<(String, f64, f64)>,
    felled: Vec<(String, f64, f64)>,
    object_rows: Vec<f64>,
}
impl Literal {
    fn value(&self) -> V {
        let mut out = json!({"tiles":self.tiles,"heights":self.heights,"removed":self.removed});
        if !self.rock_tiles.is_empty() {
            out["rock"] = json!({"tiles":self.rock_tiles,"bits":self.bits});
        }
        if !self.moved.is_empty() {
            out["moved"] = json!(self
                .moved
                .iter()
                .map(|(id, x, y)| json!({"id":id,"x":x,"y":y}))
                .collect::<Vec<_>>());
        }
        if !self.felled.is_empty() {
            out["felled"] = json!(self
                .felled
                .iter()
                .map(|(id, dx, dy)| json!({"id":id,"dx":dx,"dy":dy}))
                .collect::<Vec<_>>());
        }
        out
    }
}
fn literal(before: &Map, after: &Map) -> Literal {
    let mut tiles = vec![];
    let mut heights = vec![];
    let mut rock_tiles = vec![];
    let mut bits = vec![];
    for i in 0..after.heights.len() {
        if after.heights[i] != before.heights[i] {
            tiles.push(i as u32);
            heights.push(after.heights[i]);
        }
        if after.lava[i] != before.lava[i] {
            rock_tiles.push(i as u32);
            bits.push(after.lava[i]);
        }
    }
    // Flat interned keys: last duplicate wins, emission retains source order.
    let extent = id_extent(before, after);
    let by_id = entity_index(after, extent);
    let now = |key: usize| {
        let i = by_id[key];
        if i == usize::MAX {
            None
        } else {
            Some(&after.entities[i])
        }
    };
    let mut removed: Vec<_> = before
        .entities
        .iter()
        .filter(|e| now(e.id_key).is_none() && !kept_object(e))
        .map(|e| s(e, "id").to_string())
        .collect();
    let mut removed_slots = vec![];
    for e in &before.entities {
        if now(e.id_key).is_none() && !kept_object(e) {
            removed_slots.push(e.slot as f64);
        }
    }
    let mut held = vec![false; before.w * before.h];
    for b in &before.entities {
        if b.template.as_ref() == "StartingLocation" {
            for i in before.footprint(b, 0) {
                held[i] = true;
            }
        } else if kept_object(b) && b.template.as_ref() == "Slope" {
            let (dx, dy) = match b.orientation.as_ref() {
                "Cw90" => (-1.0, 0.0),
                "Cw180" => (0.0, 1.0),
                "Cw270" => (1.0, 0.0),
                _ => (0.0, -1.0),
            };
            let inside =
                |x: f64, y: f64| x >= 0.0 && y >= 0.0 && x < before.w as f64 && y < before.h as f64;
            if inside(b.x, b.y) && inside(b.x + dx, b.y + dy) && inside(b.x - dx, b.y - dy) {
                let tile = |x: f64, y: f64| y as usize * before.w + x as usize;
                let i = tile(b.x, b.y);
                if after.heights[tile(b.x + dx, b.y + dy)] as u16 == after.heights[i] as u16 + 1
                    && after.heights[tile(b.x - dx, b.y - dy)] == after.heights[i]
                {
                    held[i] = true;
                }
            }
        }
    }
    let mut moved = vec![];
    let mut moved_rows = vec![];
    for b in &before.entities {
        if let Some(e) = now(b.id_key) {
            if !kept_object(b) && (n(e, "x") != n(b, "x") || n(e, "y") != n(b, "y")) {
                if after.footprint(e, 0).iter().any(|&i| held[i]) {
                    removed.push(b.id.to_string());
                    removed_slots.push(b.slot as f64);
                } else {
                    moved.push((s(b, "id").to_string(), n(e, "x"), n(e, "y")));
                    moved_rows.extend([b.slot as f64, e.x, e.y]);
                }
            }
        }
    }
    let mut felled = vec![];
    let mut felled_rows = vec![];
    let mut was = vec![false; extent];
    for f in &before.fallen {
        was[f.id_key] = true;
    }
    for f in &after.fallen {
        let Some(e) = now(f.id_key) else {
            continue;
        };
        if kept_object(e) || was[f.id_key] {
            continue;
        }
        let l = hypot(n(f, "dx"), n(f, "dy"));
        let l = if l == 0.0 { 1.0 } else { l };
        felled.push((
            s(f, "id").to_string(),
            round((n(f, "dx") / l) * 1e4) / 1e4,
            round((n(f, "dy") / l) * 1e4) / 1e4,
        ));
        let (_, dx, dy) = felled.last().unwrap();
        felled_rows.extend([e.slot as f64, *dx, *dy]);
    }
    let mut object_rows = vec![
        removed.len() as f64,
        moved.len() as f64,
        felled.len() as f64,
    ];
    object_rows.extend(removed_slots);
    object_rows.extend(moved_rows);
    object_rows.extend(felled_rows);
    Literal {
        tiles,
        heights,
        rock_tiles,
        bits,
        removed,
        moved,
        felled,
        object_rows,
    }
}

const FORCE_REST: f64 = 0.01;
fn force_keep_sealed(sim: &mut water::Sim, model: &ForceWaterModel, lake: &[bool], closed: Option<&[bool]>, start_depth: &[f64], start_contamination: &[f64]) -> bool {
    let Some(closed) = closed else { return false };
    let (w, h, n) = (model.w, model.h, model.w * model.h);
    let floor = &model.floor;
    let mut seen = vec![0u8; n];
    let mut queue: Vec<usize> = Vec::with_capacity(n);
    let mut any = false;
    for s in 0..n {
        if !closed[s] || seen[s] != 0 {
            continue;
        }
        seen[s] = 1;
        queue.clear();
        queue.push(s);
        let mut head = 0;
        while head < queue.len() {
            let c = queue[head];
            head += 1;
            let x = c % w;
            let y = c / w;
            if y > 0 && closed[c - w] && seen[c - w] == 0 {
                seen[c - w] = 1;
                queue.push(c - w);
            }
            if x > 0 && closed[c - 1] && seen[c - 1] == 0 {
                seen[c - 1] = 1;
                queue.push(c - 1);
            }
            if y < h - 1 && closed[c + w] && seen[c + w] == 0 {
                seen[c + w] = 1;
                queue.push(c + w);
            }
            if x < w - 1 && closed[c + 1] && seen[c + 1] == 0 {
                seen[c + 1] = 1;
                queue.push(c + 1);
            }
        }
        let mut tiles = queue.clone();
        tiles.sort_unstable();
        let mut volume = 0.0;
        let mut bad = 0.0;
        let mut rests = true;
        let mut top = f64::NEG_INFINITY;
        let mut bottom = f64::INFINITY;
        for &i in &tiles {
            let d = if lake[i] { start_depth[i] } else { 0.0 };
            if !(d > 0.0) {
                continue;
            }
            volume += d;
            bad += d * start_contamination[i];
            let surface = floor[i] + d;
            if surface > top {
                top = surface;
            }
            if surface < bottom {
                bottom = surface;
            }
            let x = i % w;
            let y = i / w;
            for k in 0..4 {
                if !rests {
                    break;
                }
                let nb = match k {
                    0 => (y > 0).then(|| i - w),
                    1 => (x > 0).then(|| i - 1),
                    2 => (y < h - 1).then(|| i + w),
                    _ => (x < w - 1).then(|| i + 1),
                };
                let Some(nb) = nb else { continue };
                if lake[nb] && start_depth[nb] > 0.0 {
                    continue;
                }
                let moves = if floor[nb] == floor[i] { d > 0.1 } else { surface > floor[nb] + FORCE_REST };
                if moves {
                    rests = false;
                }
            }
        }
        if top - bottom > FORCE_REST {
            rests = false;
        }
        let level = if rests || !(volume > 0.0) {
            None
        } else {
            let seeds: Vec<usize> = tiles.iter().copied().filter(|&i| lake[i]).collect();
            Some(force_level_into(model, &seeds, volume))
        };
        for &i in &tiles {
            let d = if rests && lake[i] { start_depth[i] } else { 0.0 };
            sim.d[i] = d;
            sim.c[i] = if d > 0.0 { start_contamination[i] } else { 0.0 };
            for k in 0..4 {
                sim.out[4 * i + k] = 0.0;
            }
        }
        if let Some(level) = level {
            let share = if volume > 0.0 { bad / volume } else { 0.0 };
            for (i, d) in level {
                sim.d[i] = d;
                sim.c[i] = if lake[i] && start_depth[i] > 0.0 { start_contamination[i] } else { share };
                for k in 0..4 {
                    sim.out[4 * i + k] = 0.0;
                }
            }
        }
        any = true;
    }
    any
}


/// A heap entry ordered by key, then tile, smallest first (math/grid.ts `MinHeap`'s order).
#[derive(PartialEq)]
struct ForceLakeEntry(f64, usize);
impl Eq for ForceLakeEntry {}
impl PartialOrd for ForceLakeEntry {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for ForceLakeEntry {
    fn cmp(&self, o: &Self) -> std::cmp::Ordering {
        o.0.total_cmp(&self.0).then(o.1.cmp(&self.1))
    }
}

/// prefill.ts `levelInto`: `volume` poured into the hollow round `seeds`, levelled flat.
fn force_level_into(m: &ForceWaterModel, seeds: &[usize], volume: f64) -> Vec<(usize, f64)> {
    let (w, h) = (m.w, m.h);
    let n = w * h;
    let eff = |i: usize| m.floor[i] + m.dam.as_ref().map_or(0.0, |d| if d[i] >= 0.0 { d[i] } else { 0.0 });
    let mut queued = vec![0u8; n];
    let mut heap = std::collections::BinaryHeap::new();
    for &i in seeds {
        queued[i] = 1;
        heap.push(ForceLakeEntry(eff(i), i));
    }
    let mut added: Vec<usize> = Vec::new();
    let mut pass: Vec<f64> = Vec::new();
    let mut count = 0.0;
    let mut sum = 0.0;
    let mut at = f64::NEG_INFINITY;
    let mut level = f64::INFINITY;
    let mut edge = f64::INFINITY;
    while let Some(ForceLakeEntry(p, c)) = heap.pop() {
        if p > at {
            if edge < f64::INFINITY {
                level = edge;
                break;
            }
            if count > 0.0 && count * p - sum >= volume {
                level = (volume + sum) / count;
                break;
            }
            at = p;
        }
        let x = c % w;
        let y = c / w;
        if x == 0 || y == 0 || x == w - 1 || y == h - 1 {
            edge = p;
        }
        added.push(c);
        pass.push(p);
        count += 1.0;
        sum += eff(c);
        for k in 0..4 {
            let nb = match k {
                0 => (y > 0).then(|| c - w),
                1 => (x > 0).then(|| c - 1),
                2 => (y < h - 1).then(|| c + w),
                _ => (x < w - 1).then(|| c + 1),
            };
            let Some(nb) = nb else { continue };
            if queued[nb] != 0 {
                continue;
            }
            queued[nb] = 1;
            let e = eff(nb);
            heap.push(ForceLakeEntry(if e > p { e } else { p }, nb));
        }
    }
    if level == f64::INFINITY {
        level = if edge < f64::INFINITY { edge } else if count > 0.0 { (volume + sum) / count } else { 0.0 };
    }
    let mut out: Vec<(usize, f64)> = Vec::new();
    for k in 0..added.len() {
        let i = added[k];
        let d = level - eff(i);
        if pass[k] < level && d > 0.0 {
            out.push((i, d));
        }
    }
    out.sort_unstable_by_key(|e| e.0);
    out
}
