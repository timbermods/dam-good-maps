// Reused verbatim from rust-water d18a6f4d; one source for both targets.
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
            let n = w * h;
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
                out: vec![0.0; 4 * n],
                ticks: 0,
                game,
                edge,
                seep: vec![],
                wall: vec![0; n],
                nb: vec![[0; 4]; n],
                f: vec![0.0; 4 * n],
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
        fn substep(&mut self, scale: f64) {
            for &i in &self.prev_wet {
                if self.d[i] > 0.0 {
                    continue;
                }
                self.f[4 * i..4 * i + 4].fill(0.0);
            }
            for &i in &self.wet {
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
            for &i in &self.active {
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
            (rest - rest_prev).abs() / max(vol, 1e-9) < 0.002
                && moved as f64 <= share * self.n as f64
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
    pub unsafe extern "C" fn water_execute(
        p: *const u8,
        len: usize,
        out_len: *mut usize,
    ) -> *mut u8 {
        let b = execute(std::slice::from_raw_parts(p, len)).into_boxed_slice();
        *out_len = b.len();
        Box::into_raw(b) as *mut u8
    }
}

use serde_json::{json, Value as V};
use std::collections::{HashMap, HashSet};
const PI: f64 = 3.141592653589793;
const HALF_PI: f64 = 1.5707963267948966;
const TWO_PI: f64 = 6.283185307179586;
const LN2: f64 = 0.6931471805599453;
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
fn sin(x: f64) -> f64 {
    let mut r = x - TWO_PI * (x / TWO_PI).floor();
    if r > PI {
        r -= TWO_PI;
    }
    if r > HALF_PI {
        r = PI - r;
    } else if r < -HALF_PI {
        r = -PI - r;
    }
    let r2 = r * r;
    let mut p = -2.8114572543455206e-15;
    p = p * r2 + 7.647163731819816e-13;
    p = p * r2 - 1.6059043836821613e-10;
    p = p * r2 + 2.505210838544172e-8;
    p = p * r2 - 2.7557319223985893e-6;
    p = p * r2 + 1.984126984126984e-4;
    p = p * r2 - 8.333333333333333e-3;
    p = p * r2 + 1.6666666666666666e-1;
    r - r * r2 * p
}
fn cos(x: f64) -> f64 {
    sin(x + HALF_PI)
}
fn exp(x: f64) -> f64 {
    let k = round(x / LN2);
    let r = x - k * LN2;
    let mut term = 1.0;
    let mut sum = 1.0;
    for i in 1..=20 {
        term = (term * r) / i as f64;
        sum += term;
    }
    let mut scale = 1.0;
    let mut base = if k >= 0.0 { 2.0 } else { 0.5 };
    let mut n = k.abs() as u32;
    while n > 0 {
        if n & 1 != 0 {
            scale *= base;
        }
        base *= base;
        n >>= 1;
    }
    sum * scale
}
fn log(x: f64) -> f64 {
    if x == 0.0 {
        return f64::NEG_INFINITY;
    }
    if !(x > 0.0) {
        return f64::NAN;
    }
    if x == f64::INFINITY {
        return x;
    }
    let mut m = x;
    let mut exponent = 0.0;
    while m >= 2.0 {
        m *= 0.5;
        exponent += 1.0;
    }
    while m < 1.0 {
        m *= 2.0;
        exponent -= 1.0;
    }
    let z = (m - 1.0) / (m + 1.0);
    let z2 = z * z;
    let mut term = z;
    let mut sum = z;
    for k in 1..=24 {
        term *= z2;
        sum += term / (2 * k + 1) as f64;
    }
    exponent * LN2 + 2.0 * sum
}
fn pow(x: f64, y: f64) -> f64 {
    if y == 0.0 {
        return 1.0;
    }
    if y.fract() == 0.0 && y.abs() <= 1024.0 {
        let mut n = y.abs() as u32;
        let mut b = x;
        let mut result = 1.0;
        while n > 0 {
            if n % 2 == 1 {
                result *= b;
            }
            n /= 2;
            if n > 0 {
                b *= b;
            }
        }
        return if y < 0.0 { 1.0 / result } else { result };
    }
    if x == 0.0 && y > 0.0 {
        return 0.0;
    }
    assert!(x > 0.0 && x.is_finite() && y.is_finite());
    let v = y * log(x);
    assert!(v.abs() < 700.0);
    exp(v)
}
fn hypot(x: f64, y: f64) -> f64 {
    let scale = max(x.abs(), y.abs());
    if scale == 0.0 || scale == f64::INFINITY {
        return scale;
    }
    let mut sum = 0.0;
    let r = x / scale;
    sum += r * r;
    let r = y / scale;
    sum += r * r;
    scale * sum.sqrt()
}
fn atan(x: f64) -> f64 {
    if !x.is_finite() {
        return if x.is_nan() {
            f64::NAN
        } else if x < 0.0 {
            -HALF_PI
        } else {
            HALF_PI
        };
    }
    if x == 0.0 {
        return x;
    }
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let mut a = x.abs();
    let mut offset = 0.0;
    let mut invert = false;
    if a > 1.0 {
        a = 1.0 / a;
        invert = true;
    }
    if a > 0.41421356237309503 {
        a = (a - 1.0) / (a + 1.0);
        offset = PI / 4.0;
    }
    let a2 = a * a;
    let mut term = a;
    let mut sum = a;
    for k in 1..=24 {
        term *= -a2;
        sum += term / (2 * k + 1) as f64;
    }
    let value = offset + sum;
    sign * if invert { HALF_PI - value } else { value }
}
fn atan2(y: f64, x: f64) -> f64 {
    if x.is_nan() || y.is_nan() {
        return f64::NAN;
    }
    let ny = y.is_sign_negative();
    let nx = x.is_sign_negative();
    if y == 0.0 {
        return if nx {
            if ny {
                -PI
            } else {
                PI
            }
        } else {
            y
        };
    }
    if x == 0.0 {
        return if y < 0.0 { -HALF_PI } else { HALF_PI };
    }
    if !x.is_finite() && !y.is_finite() {
        return (if ny { -1.0 } else { 1.0 }) * (if nx { (3.0 * PI) / 4.0 } else { PI / 4.0 });
    }
    let a = atan((y / x).abs());
    let b = if x < 0.0 { PI - a } else { a };
    if y < 0.0 {
        -b
    } else {
        b
    }
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
    let floor = (natural / size).sqrt();
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
fn n(v: &V, k: &str) -> f64 {
    v[k].as_f64().unwrap_or(f64::NAN)
}
fn num(v: &V) -> f64 {
    v.as_f64().unwrap_or(f64::NAN)
}
fn s<'a>(v: &'a V, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
fn boolean(v: &V, k: &str) -> bool {
    v[k].as_bool().unwrap_or(false)
}
fn arr(v: &V) -> &[V] {
    v.as_array().map_or(&[], |a| a.as_slice())
}
fn floats(v: &V) -> Vec<f64> {
    arr(v).iter().map(num).collect()
}
fn vals(a: &[f64]) -> V {
    json!(a)
}
fn setn(v: &mut V, k: &str, x: f64) {
    v[k] = json!(x);
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
    w: usize,
    h: usize,
    heights: Vec<u8>,
    lava: Vec<u32>,
    rock: Vec<f64>,
    entities: Vec<V>,
    fallen: Vec<V>,
    base: std::sync::Arc<V>,
    ceiling: f64,
    fp: std::sync::Arc<V>,
}
impl Map {
    fn from(v: &V, fp: &V) -> Self {
        Self {
            w: n(v, "W") as usize,
            h: n(v, "H") as usize,
            heights: arr(&v["heights"]).iter().map(|v| num(v) as u8).collect(),
            lava: arr(&v["lava"]).iter().map(|v| num(v) as u32).collect(),
            rock: floats(&v["rockLayers"]),
            entities: arr(&v["entities"]).to_vec(),
            fallen: arr(&v["fallen"]).to_vec(),
            base: std::sync::Arc::new(V::Object(
                v.as_object()
                    .unwrap()
                    .iter()
                    .filter(|(k, _)| {
                        !matches!(k.as_str(), "heights" | "lava" | "entities" | "fallen")
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            )),
            ceiling: n(v, "maxHeight"),
            fp: std::sync::Arc::new(fp.clone()),
        }
    }
    fn value(&self) -> V {
        let mut v = self.base.as_ref().clone();
        v["heights"] = json!(self.heights);
        v["lava"] = json!(self.lava);
        v["entities"] = json!(self.entities);
        v["fallen"] = json!(self.fallen);
        v
    }
    fn at(&self, x: f64, y: f64) -> usize {
        (clamp(round(y), 0.0, (self.h - 1) as f64) as usize) * self.w
            + clamp(round(x), 0.0, (self.w - 1) as f64) as usize
    }
    fn footprint(&self, e: &V, margin: i32) -> Vec<usize> {
        let fp = &self.fp[s(e, "template")];
        let sx = fp["size"][0].as_f64().unwrap_or(1.0) as i32;
        let sy = fp["size"][1].as_f64().unwrap_or(1.0) as i32;
        let mut out = vec![];
        for y in -margin..sy + margin {
            for lx in -margin..sx + margin {
                let x = if boolean(e, "flipped") && boolean(fp, "flippable") {
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
    fn dead(&mut self, e: &mut V, x: f64, y: f64) {
        let tile = n(e, "y") as usize * self.w + n(e, "x") as usize;
        let d = hypot(n(e, "x") - x, n(e, "y") - y);
        let d = if d == 0.0 { 1.0 } else { d };
        self.fallen.retain(|v| v["id"] != e["id"]);
        self.fallen.push(json!({"id":e["id"],"x":n(e,"x")+0.5,"y":n(e,"y")+0.5,"z":self.heights[tile],"dx":(n(e,"x")-x)/d,"dy":(n(e,"y")-y)/d,"length":if s(e,"template")=="Oak"{2.6}else{2.0}}));
        if !e["components"].is_object() {
            e["components"] = json!({});
        }
        e["components"]["LivingNaturalResource"] = json!({"IsDead":true});
        e.as_object_mut().unwrap().shift_remove("raw");
    }
    fn finalize(&mut self, before: &Map, settings: &V, keep: &[u8]) {
        let floor = clamp(
            round(
                settings["floor"]
                    .as_f64()
                    .filter(|x| x.is_finite())
                    .unwrap_or(1.0),
            ),
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
        let was: HashSet<_> = before
            .fallen
            .iter()
            .map(|v| s(v, "id").to_string())
            .collect();
        let at: HashMap<&str, &V> = self.entities.iter().map(|e| (s(e, "id"), e)).collect();
        let mut gone = HashSet::new();
        for f in &self.fallen {
            if was.contains(s(f, "id")) {
                continue;
            }
            if let Some(e) = at.get(s(f, "id")) {
                let i = n(e, "y") as usize * self.w + n(e, "x") as usize;
                if self.heights[i] != before.heights[i] {
                    gone.insert(s(e, "id").to_string());
                }
            }
        }
        self.entities.retain(|v| !gone.contains(s(v, "id")));
        self.fallen.retain(|v| !gone.contains(s(v, "id")));
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
                let mut m = serde_json::Map::new();
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
pub struct Job {
    before: Map,
    job: V,
    keep: Vec<u8>,
    output: Option<V>,
}
pub fn prepare(input: &[u8]) -> Job {
    let mut r = Reader { data: input, at: 0 };
    let mut job = r.value();
    assert_eq!(r.at, input.len());
    let before = Map::from(&job["map"], &job["footprints"]);
    let keep: Vec<u8> = arr(&job["keep"]).iter().map(|v| num(v) as u8).collect();
    for key in ["map", "footprints", "keep"] {
        job.as_object_mut().unwrap().shift_remove(key);
    }
    Job {
        before,
        job,
        keep,
        output: None,
    }
}
pub fn plan(task: &mut Job) {
    task.output = None;
    let before = &task.before;
    let job = &task.job;
    let keep = &task.keep;
    let mut out = match s(&job, "verb") {
        "footprint" => json!(before
            .entities
            .iter()
            .map(|e| before.footprint(e, job["margin"].as_f64().unwrap_or(0.0) as i32))
            .collect::<Vec<_>>()),
        "quake" => quake(&before, &job["settings"], &job["intent"], &keep),
        "erupt" => eruption(&before, &job["settings"], &job["intent"], &keep),
        "craterize" => crater(&before, &job["settings"], &job["intent"], &keep),
        _ => panic!("force not ported"),
    };
    if out.get("map").is_some() {
        let v = &out["map"];
        let after = Map {
            w: before.w,
            h: before.h,
            heights: arr(&v["heights"]).iter().map(|v| num(v) as u8).collect(),
            lava: arr(&v["lava"]).iter().map(|v| num(v) as u32).collect(),
            rock: before.rock.clone(),
            entities: arr(&v["entities"]).to_vec(),
            fallen: arr(&v["fallen"]).to_vec(),
            base: before.base.clone(),
            ceiling: before.ceiling,
            fp: before.fp.clone(),
        };
        out["literal"] = literal(before, &after);
    }
    task.output = Some(out);
}
pub fn pack(task: &Job) -> Vec<u8> {
    let mut bytes = vec![];
    write_value(&mut bytes, task.output.as_ref().expect("plan first"));
    bytes
}
pub fn execute(input: &[u8]) -> Vec<u8> {
    let mut task = prepare(input);
    plan(&mut task);
    pack(&task)
}
#[no_mangle]
pub unsafe extern "C" fn forces_prepare(p: *const u8, len: usize) -> *mut Job {
    Box::into_raw(Box::new(prepare(std::slice::from_raw_parts(p, len))))
}
#[no_mangle]
pub unsafe extern "C" fn forces_plan(job: *mut Job) {
    plan(&mut *job);
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
    fn new(m: &Map, s0: &V, intent: &V) -> Self {
        let origin = n(intent, "origin") as usize;
        let x = (origin % m.w) as f64;
        let y = (origin / m.w) as f64;
        let power = n(s0, "power");
        let seed = n(s0, "seed");
        let diameter = s0["size"].as_f64().unwrap_or_else(|| crater_size(power));
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
                * (crater_size(power) / diameter).sqrt()
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
    fn field(&self, s0: &V, x: f64, y: f64) -> (f64, f64, f64, f64, f64) {
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
fn crater(before: &Map, s0: &V, intent: &V, extra: &[u8]) -> V {
    let a = Crater::new(before, s0, intent);
    let k = strength(
        n(s0, "power"),
        s0["size"].as_f64(),
        crater_size(n(s0, "power")),
    );
    let mut m = before.clone();
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
        .filter(|e| a.field(s0, n(e, "x"), n(e, "y")).0 > 1.0)
        .cloned()
        .map(|mut e| {
            let i = n(&e, "y").floor() as usize * m.w + n(&e, "x").floor() as usize;
            setn(&mut e, "z", m.heights[i] as f64);
            e
        })
        .collect();
    let mut entities = vec![];
    for mut e in before.entities.clone() {
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
    let ids: HashSet<_> = m.entities.iter().map(|e| s(e, "id").to_string()).collect();
    m.fallen.retain(|f| ids.contains(s(f, "id")));
    let raw = m.value();
    let stats =
        json!({"cut":cut,"raised":raised,"changed":changed,"erased":erased,"flattened":flattened});
    m.finalize(before, s0, extra);
    let mut arrival = vec![0.0; m.w * m.h];
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
            }) as f32 as f64;
        }
    }
    json!({"raw":raw,"map":m.value(),"anatomy":a.value(),"stats":stats,"strength":k,"keep":keep,"arrival":arrival,"total":11})
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
fn points(v: &V) -> Vec<Point> {
    arr(v)
        .iter()
        .map(|v| Point {
            x: n(v, "x"),
            y: n(v, "y"),
        })
        .collect()
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
}
fn erupt_size(p: f64) -> f64 {
    2.0 * (7.0 + 36.0 * pow(p / 100.0, 1.15))
}
fn summit(s0: &V) -> &str {
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
fn vent_radius(s0: &V) -> f64 {
    s0["size"].as_f64().map(|v| v / 2.0).unwrap_or_else(|| {
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
fn natural_breadth(s0: &V) -> f64 {
    let mut v = s0.clone();
    v["size"] = V::Null;
    2.0 * vent_radius(&v)
}
fn profile(s0: &V, summit: &str, r: f64, fissure: bool) -> f64 {
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
fn apron(s0: &V) -> (f64, f64) {
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
fn rise_bound(s0: &V, a: &Volcano) -> f64 {
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
    fn proto(m: &Map, s0: &V, intent: &V) -> Self {
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
            let path = points(&intent["path"]);
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
        };
        if !fissure {
            a.lobes = lava_lobes(m, &a, n(s0, "seed"), s(s0, "flows") == "heavy");
        }
        a
    }
    fn field(&self, s0: &V, x: f64, y: f64) -> EField {
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
    fn raise(&self, m: &Map, s0: &V, flows: &[f32], f: EField, i: usize, h: f64, k: f64) -> f64 {
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
    fn fits(&self, m: &Map, s0: &V, keep: &[u8]) -> bool {
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
    fn new(m: &Map, s0: &V, intent: &V, keep: &[u8]) -> Self {
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
                    let bucket =
                        (((atan2(dy as f64, dx as f64) + PI) / (PI * 2.0)) * 12.0).floor() % 12.0;
                    let score = d * (1.0 + 0.3 * hash(n(s0, "seed"), 940.0 + bucket));
                    if score < best_score {
                        best_score = score;
                        best = Some(i);
                    }
                }
            }
            let at = best.expect("No room to rise here");
            let asked = Point { x: a.x, y: a.y };
            a = Self::proto(m, s0, &json!({"origin":at}));
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
        if s0["size"].is_null() {
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
                    min(1.25, 1.0 / k.sqrt()),
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
fn eruption(before: &Map, s0: &V, intent: &V, extra: &[u8]) -> V {
    let a = Volcano::new(before, s0, intent, extra);
    let mut m = before.clone();
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
    let strength = strength(n(s0, "power"), s0["size"].as_f64(), natural_breadth(s0));
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
        let tile = n(&e, "y") as usize * m.w + n(&e, "x") as usize;
        if keep[tile] != 0 || s(&e, "template") == "StartingLocation" {
            entities.push(e);
            continue;
        }
        let f = a.field(s0, n(&e, "x"), n(&e, "y"));
        let is_plant = plant(s(&e, "template"));
        if !emitter(s(&e, "template")) && f.vent_distance < max(1.5, a.radius * 0.065) {
            erased += 1;
            m.fallen.retain(|v| v["id"] != e["id"]);
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
            e.as_object_mut().unwrap().shift_remove("raw");
        }
        setn(&mut e, "z", z);
        entities.push(e);
    }
    m.entities = entities;
    let raw = m.value();
    let stats = json!({"raised":raised,"changed":changed,"flattened":flattened,"erased":erased,"hard":hard});
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
    json!({"raw":raw,"map":m.value(),"anatomy":a.value(),"stats":stats,"strength":strength,"keep":keep,"flows":flows.iter().map(|&v|v as f64).collect::<Vec<_>>(),"heat":heat,"total":30})
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
    settings: V,
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
    fn new(s0: &V, intent: &V) -> Self {
        let path = points(&intent["path"]);
        let reach = 14.0 + n(s0, "power") * 0.5;
        let lift = 1.0 + round(n(s0, "power") * 0.075);
        let slide = 2.0 + round(n(s0, "power") * 0.18);
        let mut raw = vec![];
        let mut length = 0.0;
        for k in 1..path.len() {
            let a = path[k - 1];
            let b = path[k];
            let l = (pow(b.x - a.x, 2.0) + pow(b.y - a.y, 2.0)).sqrt();
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
            let l = (pow(b.x - a.x, 2.0) + pow(b.y - a.y, 2.0)).sqrt();
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
fn quake(before: &Map, s0: &V, intent: &V, extra: &[u8]) -> V {
    let fault = Fault::new(s0, intent);
    let mut m = before.clone();
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
        let depths = floats(&before.base["water"]["depth"]);
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
                let fp = &m.fp[s(e, "template")];
                let sx = fp["size"][0].as_f64().unwrap_or(1.0);
                let sy = fp["size"][1].as_f64().unwrap_or(1.0);
                m.footprint(&moved, 0).len() == (sx * sy) as usize
            })
            .collect();
        order.sort_by_key(|&i| !inside[i]);
    }
    let mut fallen: Vec<V> = m.fallen.clone();
    for index in order {
        let e = &mut entities[index];
        let old = e.clone();
        let f = fault.movement(n(e, "x"), n(e, "y"));
        let fp = &m.fp[s(e, "template")];
        let sx = fp["size"][0].as_f64().unwrap_or(1.0);
        let sy = fp["size"][1].as_f64().unwrap_or(1.0);
        let mut xs = vec![];
        let mut ys = vec![];
        for (lx, ly) in [
            (0.0, 0.0),
            (sx - 1.0, 0.0),
            (0.0, sy - 1.0),
            (sx - 1.0, sy - 1.0),
        ] {
            let x = if boolean(e, "flipped") && boolean(fp, "flippable") {
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
            assert!(found, "No room for objects to move");
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
            e.as_object_mut().unwrap().shift_remove("raw");
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
            if !e["components"].is_object() {
                e["components"] = json!({});
            }
            e["components"]["LivingNaturalResource"] = json!({"IsDead":true});
            e.as_object_mut().unwrap().shift_remove("raw");
            let ff = json!({"id":e["id"],"x":n(e,"x")+0.5,"y":n(e,"y")+0.5,"z":e["z"],"dx":if f.dy==0.0{0.7}else{-f.dy},"dy":if f.dx==0.0{0.7}else{f.dx},"length":if s(e,"template")=="Oak"{2.6}else{2.0}});
            if let Some(i) = fallen.iter().position(|v| v["id"] == e["id"]) {
                fallen[i] = ff;
            } else {
                fallen.push(ff);
            }
            toppled += 1;
        } else if let Some(i) = fallen.iter().position(|v| v["id"] == e["id"]) {
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
    let stats = json!({"changed":changed,"raised":raised,"dropped":dropped,"moved":moved,"toppled":toppled,"channel":channel,"transported":transported,"fullOffset":full_offset});
    let raw = m.value();
    let floor = clamp(round(s0["floor"].as_f64().unwrap_or(1.0)), 1.0, 22.0);
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
    json!({"raw":raw,"map":m.value(),"fault":fault.value(),"stats":stats,"arrival":arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),"dx":dxs,"dy":dys,"source":source,"total":1.0+if slide{max(8.0,fault.slide+2.0)}else{8.0}})
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
    let kept = |e: &V| {
        keep.get(n(e, "y") as usize * before.w + n(e, "x") as usize)
            .copied()
            .unwrap_or(0)
            == 1
    };
    let now: HashSet<_> = after
        .entities
        .iter()
        .map(|e| s(e, "id").to_string())
        .collect();
    let mut out: Vec<_> = after
        .entities
        .iter()
        .filter(|e| {
            !kept(e)
                || before
                    .entities
                    .iter()
                    .any(|b| b["id"] == e["id"] && kept(b))
        })
        .cloned()
        .collect();
    for b in &before.entities {
        if kept(b) {
            if let Some(k) = out.iter().position(|e| e["id"] == b["id"]) {
                out[k] = b.clone();
            } else {
                out.push(b.clone());
            }
            any = true;
        }
    }
    if any || out.len() != now.len() {
        after.entities = out;
        let ids: HashSet<_> = after
            .entities
            .iter()
            .map(|e| s(e, "id").to_string())
            .collect();
        after.fallen.retain(|f| {
            ids.contains(s(f, "id")) && !kept(&json!({"x":n(f,"x").floor(),"y":n(f,"y").floor()}))
        });
        for f in &before.fallen {
            if kept(&json!({"x":n(f,"x").floor(),"y":n(f,"y").floor()}))
                && !after.fallen.iter().any(|g| g["id"] == f["id"])
            {
                after.fallen.push(f.clone());
            }
        }
    }
}
fn kept_object(e: &V) -> bool {
    let owner = s(e, "owner");
    s(e, "template") == "StartingLocation"
        || owner.starts_with("pinned:")
        || matches!(owner, "derived:slopes" | "derived:rim-slopes")
}
fn literal(before: &Map, after: &Map) -> V {
    let mut tiles = vec![];
    let mut heights = vec![];
    let mut rock_tiles = vec![];
    let mut bits = vec![];
    for i in 0..after.heights.len() {
        if after.heights[i] != before.heights[i] {
            tiles.push(i);
            heights.push(after.heights[i]);
        }
        if after.lava[i] != before.lava[i] {
            rock_tiles.push(i);
            bits.push(after.lava[i]);
        }
    }
    // Match literalOf's Map: constant-time ID lookup, last duplicate wins; emitted order
    // remains the before/fallen array order, never the hash-table's iteration order.
    let by_id: HashMap<&str, &V> = after.entities.iter().map(|e| (s(e, "id"), e)).collect();
    let now = |id: &V| by_id.get(id.as_str().unwrap_or("")).copied();
    let removed: Vec<_> = before
        .entities
        .iter()
        .filter(|e| now(&e["id"]).is_none() && !kept_object(e))
        .map(|e| e["id"].clone())
        .collect();
    let mut moved = vec![];
    for b in &before.entities {
        if let Some(e) = now(&b["id"]) {
            if !kept_object(b) && (n(e, "x") != n(b, "x") || n(e, "y") != n(b, "y")) {
                moved.push(json!({"id":b["id"],"x":e["x"],"y":e["y"]}));
            }
        }
    }
    let mut felled = vec![];
    let was: HashSet<&str> = before.fallen.iter().map(|f| s(f, "id")).collect();
    for f in &after.fallen {
        let Some(e) = now(&f["id"]) else {
            continue;
        };
        if kept_object(e) || was.contains(s(f, "id")) {
            continue;
        }
        let l = hypot(n(f, "dx"), n(f, "dy"));
        let l = if l == 0.0 { 1.0 } else { l };
        felled.push(json!({"id":f["id"],"dx":round((n(f,"dx")/l)*1e4)/1e4,"dy":round((n(f,"dy")/l)*1e4)/1e4}));
    }
    let mut out = json!({"tiles":tiles,"heights":heights,"removed":removed});
    if !rock_tiles.is_empty() {
        out["rock"] = json!({"tiles":rock_tiles,"bits":bits});
    }
    if !moved.is_empty() {
        out["moved"] = json!(moved);
    }
    if !felled.is_empty() {
        out["felled"] = json!(felled);
    }
    out
}
