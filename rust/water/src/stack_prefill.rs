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
pub fn prefill(s: &Stack, retained: &[Retained]) -> State {
    let size = s.d.len();
    let spill = spill_levels(s);
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
            for e in s.start[c] as usize..s.start[c + 1] as usize {
                let t = s.target[e];
                if t < 0 {
                    continue;
                }
                let t = t as usize;
                if mark[t] == stamp || spill[t] > spill[c] {
                    continue;
                }
                mark[t] = stamp;
                queue.push(t);
            }
        }
    }
    let open: Vec<bool> = (0..size).map(|c| path[c] && !(spill[c] > s.cols.floor[c] as f64)).collect();
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
        if spill[c] > fl {
            d = spill[c] - fl;
            if d > cap {
                if ce < (OPEN as f64) {
                    let o = (spill[c] - ce) / PRESSURE;
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
        let i = r.tile as usize;
        let c = (s.cols.count[i] as usize - 1) * s.cols.n + i;
        let f = s.cols.floor[c] as f64;
        if f == r.floor {
            state.depth[c] = r.depth;
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
pub fn sealed_columns(s: &Stack, retained: &[Retained]) -> Vec<usize> {
    let mut v: Vec<usize> = retained
        .iter()
        .map(|r| {
            let i = r.tile as usize;
            (s.cols.count[i] as usize - 1) * s.cols.n + i
        })
        .collect();
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
    pub until_steady: bool,
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
            sealed,
            steady: None,
            until_steady: false,
        }
    }
    pub fn advance(&mut self, s: &mut Stack, ticks: u64) -> Option<SettleResult> {
        let mut left = ticks;
        while self.result.is_none() && left > 0 {
            let n = left.min(self.every - self.since);
            s.run(n, 1.0);
            self.since += n;
            left -= n;
            if self.since < self.every {
                break;
            }
            self.since = 0;
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
        self.result
    }
}
