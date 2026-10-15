//! D448: #71's priority flood, prefill and sliced settle. No wall-clock stopping.
use crate::{
    columns::OPEN,
    settle::SettleResult,
    sim::TICKS_PER_DAY,
    stack::{Retained, Stack, State, PRESSURE},
};
use portable::max;
use std::{cmp::Ordering, collections::BinaryHeap};
#[derive(PartialEq)]
struct Entry(f64, usize);
impl Eq for Entry {}
impl Ord for Entry {
    fn cmp(&self, b: &Self) -> Ordering {
        b.0.total_cmp(&self.0).then_with(|| b.1.cmp(&self.1))
    }
}
impl PartialOrd for Entry {
    fn partial_cmp(&self, b: &Self) -> Option<Ordering> {
        Some(self.cmp(b))
    }
}
pub fn spill_levels(s: &Stack) -> Vec<f64> {
    let n = s.cols.n;
    let size = s.d.len();
    let mut filled = vec![0.0; size];
    for (c, v) in filled.iter_mut().enumerate() {
        let i = c % n;
        if c / n >= s.cols.count[i] as usize {
            continue;
        }
        let f = s.cols.floor[c];
        *v = f as f64 + *s.cols.height_limit.get(&(f as usize * n + i)).unwrap_or(&0.0);
    }
    let mut seen = vec![false; size];
    let mut heap = BinaryHeap::new();
    for c in 0..size {
        let i = c % n;
        if c / n >= s.cols.count[i] as usize {
            continue;
        }
        if (s.start[c] as usize..s.start[c + 1] as usize).any(|e| s.target[e] < 0) {
            seen[c] = true;
            heap.push(Entry(filled[c], c));
        }
    }
    while let Some(Entry(lv, c)) = heap.pop() {
        for e in s.start[c] as usize..s.start[c + 1] as usize {
            let t = s.target[e];
            if t < 0 || seen[t as usize] {
                continue;
            }
            let t = t as usize;
            seen[t] = true;
            if filled[t] < lv {
                filled[t] = lv;
            }
            heap.push(Entry(filled[t], t));
        }
    }
    filled
}
/// A seep stops while more than its limit stands over it, so its water never stands higher than its anchor
/// column's floor plus that limit: out of a pit that spills lower it runs on like a source's, but a pit that
/// holds it starts filled only to that level, and its water reaches only the ground lower than that
/// (src/core/sim/prefill.ts `flowThrough`, the heightfield's rule; the probe's parity-20260930).
pub fn prefill(s: &Stack, retained: &[Retained]) -> State {
    let size = s.d.len();
    let n = s.cols.n;
    let spill = spill_levels(s);
    // (the ground a column's water stands on: its floor, raised by a partial obstacle there)
    let ground = |c: usize| -> f64 {
        let f = s.cols.floor[c];
        f as f64 + *s.cols.height_limit.get(&(f as usize * n + c % n)).unwrap_or(&0.0)
    };
    // (with no running seep, every column's water stands at its spill level)
    let seeps = s.emitters.iter().any(|e| e.limit.is_some() && e.strength > 0.0);
    let mut level = if seeps { vec![f64::NEG_INFINITY; size] } else { spill.clone() };
    let mut q = vec![0.0; size];
    let mut bad = vec![0.0; size];
    let mut path = vec![false; size];
    let mut mark = vec![0usize; size];
    let mut queue = Vec::new();
    for (idx, em) in s.emitters.iter().enumerate() {
        if !(em.strength > 0.0) {
            continue;
        }
        let stamp = idx + 1;
        // the highest a seep's water stands: its anchor's floor plus its limit
        let cap = match em.limit {
            Some((a, off, _)) => s.cols.floor[a as usize] as f64 + off,
            None => f64::INFINITY,
        };
        queue.clear();
        for &c in &em.cols {
            let c = c as usize;
            if mark[c] != stamp {
                mark[c] = stamp;
                queue.push(c);
            }
        }
        let mut head = 0;
        while head < queue.len() {
            let c = queue[head];
            head += 1;
            q[c] += em.strength;
            if em.contamination > 0.0 {
                bad[c] += em.strength * em.contamination;
            }
            path[c] = true;
            if seeps {
                let lv = if spill[c] < cap { spill[c] } else { cap };
                if lv > level[c] {
                    level[c] = lv;
                }
            }
            for e in s.start[c] as usize..s.start[c + 1] as usize {
                let t = s.target[e];
                if t < 0 {
                    continue;
                }
                let t = t as usize;
                if mark[t] == stamp || spill[t] > spill[c] {
                    continue;
                }
                // (a seep's water stands no higher than its cap: ground at or above it stays dry)
                if cap != f64::INFINITY && ground(t) >= cap {
                    continue;
                }
                mark[t] = stamp;
                queue.push(t);
            }
        }
    }
    let open: Vec<bool> = (0..size).map(|c| path[c] && !(level[c] > s.cols.floor[c] as f64)).collect();
    let next = |c: usize, k: u8| -> Option<usize> {
        (s.start[c] as usize..s.start[c + 1] as usize).find_map(|e| {
            let t = s.target[e];
            (s.dir[e] == k && t >= 0 && open[t as usize]).then_some(t as usize)
        })
    };
    let mut chain = [vec![-1i32; size], vec![-1; size], vec![-1; size], vec![-1; size]];
    let mut chain_len = |c0: usize, k: usize| -> i32 {
        let memo = &mut chain[k];
        let mut c = c0;
        let mut stack = Vec::new();
        while memo[c] < 0 {
            if let Some(t) = next(c, k as u8) {
                stack.push(c);
                c = t;
            } else {
                memo[c] = 0;
                break;
            }
        }
        let mut n = memo[c];
        while let Some(c) = stack.pop() {
            n += 1;
            memo[c] = n;
        }
        memo[c0]
    };
    let mut state = State {
        depth: vec![0.0; size],
        overflow: vec![0.0; size],
        contamination: vec![0.0; size],
    };
    for c in 0..size {
        if !path[c] {
            continue;
        }
        let fl = s.cols.floor[c] as f64;
        let ce = s.cols.ceil[c] as f64;
        let cap = ce - fl;
        let mut d;
        if level[c] > fl {
            d = level[c] - fl;
            if d > cap {
                if ce < (OPEN as f64) {
                    let o = (level[c] - ce) / PRESSURE;
                    let max_o = (OPEN as f64 - ce) / PRESSURE;
                    state.overflow[c] = if o > max_o { max_o } else { o };
                }
                d = cap;
            }
        } else {
            let rx = 1 + chain_len(c, 1) + chain_len(c, 3);
            let ry = 1 + chain_len(c, 0) + chain_len(c, 2);
            let w = rx.min(ry);
            d = (0.3 * q[c]) / w as f64;
            if d > 1.0 {
                d = 1.0;
            }
            if d > cap {
                d = cap;
            }
        }
        state.depth[c] = d;
        state.contamination[c] = if d > 0.0 && q[c] > 0.0 { bad[c] / q[c] } else { 0.0 };
    }
    for r in retained {
        let c = retained_column(s, r);
        let f = s.cols.floor[c] as f64;
        if f == r.floor {
            // (a lake standing above its column's roof fills it, under the pressure of the water over the roof,
            // as the walk's water above does; in the open, a lake is its depth)
            let ce = s.cols.ceil[c] as f64;
            let mut d = r.depth;
            state.overflow[c] = 0.0;
            if d > ce - f {
                let o = (r.floor + r.depth - ce) / PRESSURE;
                let max_o = (OPEN as f64 - ce) / PRESSURE;
                state.overflow[c] = if o > max_o { max_o } else { o };
                d = ce - f;
            }
            state.depth[c] = d;
            state.contamination[c] = r.contamination;
        } else {
            let mut d = r.floor + r.depth - f;
            let cap = (s.cols.ceil[c] - s.cols.floor[c]) as f64;
            if d > cap {
                d = cap;
            }
            state.depth[c] = if d > 0.0 { d } else { 0.0 };
            state.contamination[c] = if d > 0.0 { r.contamination } else { 0.0 };
        }
    }
    state
}
/// The column a stored lake's entry stands in: its tile's column whose floor is the entry's (a lake in a cave,
/// under a roof), else the tile's top column (the water from above, as the lake was stored on ground that has
/// changed since).
pub fn retained_column(s: &Stack, r: &Retained) -> usize {
    let n = s.cols.n;
    let i = r.tile as usize;
    let count = s.cols.count[i] as usize;
    for q in 0..count {
        if s.cols.floor[q * n + i] as f64 == r.floor {
            return q * n + i;
        }
    }
    (count - 1) * n + i
}
pub fn sealed_columns(s: &Stack, retained: &[Retained]) -> Vec<usize> {
    let mut v: Vec<usize> = retained.iter().map(|r| retained_column(s, r)).collect();
    v.sort_unstable();
    v.dedup();
    v
}
pub fn steady_apart_from_sealed(s: &Stack, prev_d: &[f64], prev_o: &[f64], vol: f64, sealed: &[usize], tol: f64, share: f64) -> bool {
    let size = s.d.len();
    let mut feeds = vec![false; size];
    for em in &s.emitters {
        if em.strength > 0.0 {
            for &c in &em.cols {
                feeds[c as usize] = true;
            }
        }
    }
    let wet = |c: usize| s.d[c] > 0.0 || prev_d[c] > 0.0;
    let mut drying = vec![false; size];
    let mut seen = vec![false; size];
    let mut queue = Vec::new();
    for &seed in sealed {
        if seen[seed] || !wet(seed) {
            continue;
        }
        seen[seed] = true;
        queue.clear();
        queue.push(seed);
        let mut open = false;
        let mut head = 0;
        while head < queue.len() {
            let c = queue[head];
            head += 1;
            let i = c % s.cols.n;
            let x = i % s.cols.w;
            let y = i / s.cols.w;
            if feeds[c] || x == 0 || y == 0 || x == s.cols.w - 1 || y == s.cols.h - 1 {
                open = true;
            }
            for e in s.start[c] as usize..s.start[c + 1] as usize {
                let t = s.target[e];
                if t < 0 {
                    continue;
                }
                let t = t as usize;
                if seen[t] || !wet(t) {
                    continue;
                }
                seen[t] = true;
                queue.push(t);
            }
        }
        if !open {
            for &c in &queue {
                if !(s.d[c] > prev_d[c]) {
                    drying[c] = true;
                }
            }
        }
    }
    let mut rest = 0.0;
    let mut prev = 0.0;
    let mut moved = 0;
    for c in 0..size {
        if drying[c] {
            continue;
        }
        rest += s.d[c] + s.o[c];
        prev += prev_d[c] + prev_o[c];
        if (s.d[c] - prev_d[c]).abs() > tol {
            moved += 1;
        }
    }
    (rest - prev).abs() / max(vol, 1e-9) < 0.002 && moved as f64 <= share * s.cols.n as f64
}
pub struct SettleRun {
    pub every: u64,
    pub checks: u64,
    pub result: Option<SettleResult>,
    prev_d: Vec<f64>,
    prev_o: Vec<f64>,
    prev_vol: f64,
    k: u64,
    since: u64,
    sealed: Vec<usize>,
    steady: Option<u64>,
    /// Stop at the first check where only the sealed basins still change (D222, D413): set when there are any.
    pub until_steady: bool,
    /// The water as the settle began, with sealed basins: a basin that only dried is stored as it began.
    start: Option<State>,
}
impl SettleRun {
    pub fn new(s: &Stack, max_days: f64, sealed: Vec<usize>) -> Self {
        let checks = ((max_days * TICKS_PER_DAY as f64) / 128.0).floor() as u64;
        Self {
            every: 128,
            checks,
            result: if checks == 0 {
                Some(SettleResult {
                    settled: false,
                    ticks: s.ticks,
                    steady_ticks: None,
                })
            } else {
                None
            },
            prev_d: s.d.clone(),
            prev_o: s.o.clone(),
            prev_vol: s.volume(),
            k: 0,
            since: 0,
            until_steady: !sealed.is_empty(),
            start: (!sealed.is_empty()).then(|| State {
                depth: s.d.clone(),
                overflow: s.o.clone(),
                contamination: s.c.clone(),
            }),
            sealed,
            steady: None,
        }
    }
    pub fn advance(&mut self, s: &mut Stack, ticks: u64) -> Option<SettleResult> {
        let mut left = ticks;
        while self.result.is_none() && left > 0 {
            let n = left.min(self.every - self.since);
            s.run(n, 1.0);
            left -= n;
            self.after(s, n);
        }
        self.result
    }
    /// Ticks since the last check.
    pub fn since(&self) -> u64 {
        self.since
    }
    /// `s` has run `n` more ticks (at most to the next check): the check, when one is due.
    pub fn after(&mut self, s: &mut Stack, n: u64) -> Option<SettleResult> {
        if self.result.is_none() {
            self.since += n;
            if self.since >= self.every {
                self.since = 0;
                self.check(s);
                if self.result.is_some() {
                    self.keep_sealed(s);
                }
            }
        }
        self.result
    }
    /// A sealed basin only evaporating is stored as it began (D413, as the heightfield's settle stores it,
    /// src/core/sim/prefill.ts `keepSealed`): the wet columns joined to a stored lake that no running source
    /// feeds and that do not reach the map's edge, when none of them gained water since the settle began
    /// (none flowed in, none moved to ground the lake did not hold), go back to the water they began with, so
    /// a Fill is written at exactly its level. A basin whose water moved stays as the settle left it, at rest.
    fn keep_sealed(&self, s: &mut Stack) {
        let Some(start) = &self.start else { return };
        let size = s.d.len();
        let mut feeds = vec![false; size];
        for em in &s.emitters {
            if em.strength > 0.0 {
                for &c in &em.cols {
                    feeds[c as usize] = true;
                }
            }
        }
        let wet = |c: usize| s.d[c] > 0.0 || start.depth[c] > 0.0;
        let mut seen = vec![false; size];
        let mut keep = Vec::new();
        let mut queue = Vec::new();
        for &seed in &self.sealed {
            if seen[seed] || !wet(seed) {
                continue;
            }
            seen[seed] = true;
            queue.clear();
            queue.push(seed);
            let mut rests = true;
            let mut head = 0;
            while head < queue.len() {
                let c = queue[head];
                head += 1;
                let i = c % s.cols.n;
                let x = i % s.cols.w;
                let y = i / s.cols.w;
                if feeds[c] || x == 0 || y == 0 || x == s.cols.w - 1 || y == s.cols.h - 1 {
                    rests = false;
                }
                if s.d[c] > start.depth[c] + 0.005 || s.o[c] > start.overflow[c] + 0.005 / PRESSURE {
                    rests = false;
                }
                for e in s.start[c] as usize..s.start[c + 1] as usize {
                    let t = s.target[e];
                    if t < 0 {
                        continue;
                    }
                    let t = t as usize;
                    if seen[t] || !wet(t) {
                        continue;
                    }
                    seen[t] = true;
                    queue.push(t);
                }
            }
            if rests {
                keep.extend_from_slice(&queue);
            }
        }
        if keep.is_empty() {
            return;
        }
        for &c in &keep {
            s.d[c] = start.depth[c];
            s.o[c] = start.overflow[c];
            s.c[c] = start.contamination[c];
        }
        // (the water it began with was well formed; its wet lists follow it)
        let _ = s.sync_state();
    }
    fn check(&mut self, s: &Stack) {
        let vol = s.volume();
        let dv = (vol - self.prev_vol).abs() / max(vol, 1e-9);
        let moved = (0..s.d.len()).filter(|&c| (s.d[c] - self.prev_d[c]).abs() > 0.005).count();
        self.k += 1;
        if dv < 0.002 && moved as f64 <= 0.005 * s.cols.n as f64 {
            self.result = Some(SettleResult {
                settled: true,
                ticks: s.ticks,
                steady_ticks: None,
            });
        } else {
            if !self.sealed.is_empty()
                && self.steady.is_none()
                && steady_apart_from_sealed(s, &self.prev_d, &self.prev_o, vol, &self.sealed, 0.005, 0.005)
            {
                self.steady = Some(s.ticks);
                if self.until_steady {
                    self.result = Some(SettleResult {
                        settled: false,
                        ticks: s.ticks,
                        steady_ticks: self.steady,
                    });
                }
            }
            if self.result.is_none() && self.k >= self.checks {
                self.result = Some(SettleResult {
                    settled: false,
                    ticks: s.ticks,
                    steady_ticks: self.steady,
                });
            }
        }
        if self.result.is_none() {
            self.prev_d.copy_from_slice(&s.d);
            self.prev_o.copy_from_slice(&s.o);
            self.prev_vol = vol;
        }
    }
}
