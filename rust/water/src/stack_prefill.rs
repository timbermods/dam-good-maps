//! D448: #71's priority flood, prefill and sliced settle. No wall-clock stopping.
use crate::{
    columns::OPEN,
    settle::SettleResult,
    sim::TICKS_PER_DAY,
    stack::{Retained, Stack, State, PRESSURE},
    stack_level,
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
pub fn steady_apart_from_sealed(s: &Stack, prev_d: &[f64], prev_o: &[f64], sealed: &[usize], tol: f64, share: f64) -> bool {
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
    // (the rest's change against the rest's own water, as the heightfield's rule (settle.rs): a lake holding much more
    // water than the rivers would otherwise let them still fill while the check passes)
    (rest - prev).abs() / max(rest, 1e-9) < 0.002 && moved as f64 <= share * s.cols.n as f64
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
    /// A sealed basin is stored at rest (D413, as the heightfield's settle stores it, src/core/sim/prefill.ts
    /// `keepSealed`): the wet columns joined to a stored lake that no running source feeds and that do not reach
    /// the map's edge, with the water the run carried from them to ground beside them (a stretch of wet columns
    /// within the basin's reach, `stack_level::arena`, that holds no other water, none from a source, the edge or
    /// another basin).
    /// - When none of them gained water since the settle began (none flowed in, none moved to ground the lake did
    ///   not hold), it only evaporated: its columns go back to the water they began with, so a Fill is written at
    ///   exactly its level.
    /// - When its water moved (an edit dug its rim or widened its hollow), the water it began with is stored where
    ///   it comes to rest by the game's rules for stacked water, through air gaps, roofs and pressure
    ///   (`stack_level::level_basin`), not as the run left it, perhaps still draining. Where that rest would reach
    ///   water or ground it can't settle on alone (the edge, a source, other water, an obstacle), or what another
    ///   basin's rest already took, the basin stays as the run left it.
    /// The basins are told apart on the water as the run left it, before any is written.
    fn keep_sealed(&self, s: &mut Stack) {
        let Some(start) = &self.start else { return };
        let size = s.d.len();
        let n = s.cols.n;
        let (w, h) = (s.cols.w, s.cols.h);
        // (1: a running source feeds the column; 2: a source or a sink works on it)
        let mut feeds = vec![0u8; size];
        for em in &s.emitters {
            if em.strength != 0.0 {
                for &c in &em.cols {
                    feeds[c as usize] |= if em.strength > 0.0 { 3 } else { 2 };
                }
            }
        }
        let mut limited = vec![false; n];
        for &k in s.cols.height_limit.keys().chain(s.cols.dir_limit.keys()) {
            limited[k % n] = true;
        }
        let edge = |c: usize| {
            let i = c % n;
            let (x, y) = (i % w, i / w);
            x == 0 || y == 0 || x == w - 1 || y == h - 1
        };
        let wet = |c: usize| s.d[c] > 0.0 || start.depth[c] > 0.0;
        let gained = |c: usize| s.d[c] > start.depth[c] + 0.005 || s.o[c] > start.overflow[c] + 0.005 / PRESSURE;
        // per column: its basin's number; the number of the basin whose reach it is in; 2k once basin k's look at
        // the run's water came to it, 2k + 1 when that water is basin k's
        let mut member = vec![0u32; size];
        let mut area = vec![0u32; size];
        let mut seen = vec![0u32; size];
        // what each is stored as: (column, depth, pressure, badwater share), later entries over earlier
        let mut writes: Vec<(usize, f64, f64, f64)> = Vec::new();
        let mut levelled: Vec<usize> = Vec::new();
        let mut claimed = vec![false; size];
        let mut queue = Vec::new();
        let mut k = 0u32;
        for &seed in &self.sealed {
            if member[seed] != 0 || !wet(seed) {
                continue;
            }
            k += 1;
            member[seed] = k;
            let mut basin = vec![seed];
            let mut open = false;
            let mut head = 0;
            while head < basin.len() {
                let c = basin[head];
                head += 1;
                if feeds[c] & 1 != 0 || edge(c) {
                    open = true;
                }
                for e in s.start[c] as usize..s.start[c + 1] as usize {
                    let t = s.target[e];
                    if t < 0 {
                        continue;
                    }
                    let t = t as usize;
                    if member[t] != 0 || !wet(t) {
                        continue;
                    }
                    member[t] = k;
                    basin.push(t);
                }
            }
            if open {
                continue;
            }
            // the run's water within its reach that is its own
            let dom = stack_level::arena(s, start, &basin, &mut area, k);
            let mut ours: Vec<usize> = Vec::new();
            let mut mixed = false;
            for &c0 in &dom {
                if !(s.d[c0] > 0.0) || seen[c0] >> 1 == k {
                    continue;
                }
                seen[c0] = 2 * k;
                queue.clear();
                queue.push(c0);
                let mut clean = true;
                let mut mine = false;
                let mut head = 0;
                while head < queue.len() {
                    let c = queue[head];
                    head += 1;
                    if area[c] != k || feeds[c] != 0 || edge(c) || (member[c] != k && (member[c] != 0 || start.depth[c] > 0.0)) {
                        clean = false;
                    }
                    if member[c] == k {
                        mine = true;
                    }
                    for e in s.start[c] as usize..s.start[c + 1] as usize {
                        let t = s.target[e];
                        if t < 0 {
                            continue;
                        }
                        let t = t as usize;
                        if !(s.d[t] > 0.0) || seen[t] >> 1 == k {
                            continue;
                        }
                        seen[t] = 2 * k;
                        queue.push(t);
                    }
                }
                if clean {
                    for &c in &queue {
                        seen[c] = 2 * k + 1;
                        if member[c] != k {
                            ours.push(c);
                        }
                    }
                } else if mine {
                    mixed = true;
                }
            }
            if mixed || basin.iter().chain(&ours).any(|&c| claimed[c]) {
                continue;
            }
            if !basin.iter().chain(&ours).any(|&c| gained(c)) {
                for &c in &basin {
                    writes.push((c, start.depth[c], start.overflow[c], start.contamination[c]));
                    claimed[c] = true;
                }
                for &c in &ours {
                    writes.push((c, 0.0, 0.0, 0.0));
                    claimed[c] = true;
                }
                continue;
            }
            let risky = |c: usize| feeds[c] != 0 || edge(c) || limited[c % n] || (wet(c) && member[c] != k && seen[c] != 2 * k + 1);
            let Some(rest) = stack_level::level_basin(s, start, &dom, basin.len(), &risky) else { continue };
            if rest.iter().any(|&(c, _, _)| claimed[c]) {
                continue;
            }
            // (a column keeps the badwater share it began with; one the water reaches anew takes the basin's)
            let mut vol = 0.0;
            let mut bad = 0.0;
            for &c in &basin {
                let v = start.depth[c] + start.overflow[c];
                vol += v;
                bad += v * start.contamination[c];
            }
            let share = if vol > 0.0 { bad / vol } else { 0.0 };
            for &c in basin.iter().chain(&ours) {
                writes.push((c, 0.0, 0.0, 0.0));
                claimed[c] = true;
                levelled.push(c);
            }
            for &(c, d, o) in &rest {
                let q = if start.depth[c] > 0.0 { start.contamination[c] } else { share };
                writes.push((c, d, o, if q > 1.0 { 1.0 } else { q }));
                claimed[c] = true;
                levelled.push(c);
            }
        }
        if writes.is_empty() {
            return;
        }
        for (c, d, o, q) in writes {
            s.d[c] = d;
            s.o[c] = o;
            s.c[c] = q;
        }
        // (water at rest has no flows)
        for c in levelled {
            for e in s.start[c] as usize..s.start[c + 1] as usize {
                s.out[e] = 0.0;
            }
        }
        // (the water written is well formed; its wet lists follow it)
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
                && steady_apart_from_sealed(s, &self.prev_d, &self.prev_o, &self.sealed, 0.005, 0.005)
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
