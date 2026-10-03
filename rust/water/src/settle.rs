//! The settle (water.ts `SettleRun`, `sealedBasins`, `steadyApartFromSealed`; PLAN §11.3, D222, D413) and fed
//! water (fed.ts `fedTiles`, `keptSeeds`, `withoutUnfed`; D385, D387 (2)), ported exactly, and the canonical
//! settle after its pre-fill (prefill.ts `canonicalRun`, `keepSealed`).

use crate::sim::{Model, Sim, TICKS_PER_DAY};
use portable::max;

/// The settle's result (water.ts `SettleResult`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SettleResult {
    pub settled: bool,
    pub ticks: u64,
    pub steady_ticks: Option<u64>,
}

pub struct SettleOptions {
    pub max_days: f64,
    pub tol: f64,
    pub check_every: u64,
    pub moved_share: f64,
    pub sealed: Option<Vec<u32>>,
}

impl Default for SettleOptions {
    fn default() -> Self {
        SettleOptions { max_days: 4.0, tol: 0.005, check_every: 128, moved_share: 0.005, sealed: None }
    }
}

/// The sealed basins at a check: `closed` marks every tile of a basin nothing flows into or out of, `drying`
/// those of its tiles that did not rise.
pub fn sealed_basins(sim: &Sim, prev: &[f64], sealed: &[u32]) -> (Vec<u8>, Vec<u8>) {
    let (w, h, n) = (sim.w, sim.h, sim.n);
    let d = &sim.d;
    let mut feeds = vec![0u8; n];
    for e in &sim.emitters {
        if e.strength > 0.0 {
            for &i in &e.cells {
                feeds[i as usize] = 1;
            }
        }
    }
    let wet = |i: usize| d[i] > 0.0 || prev[i] > 0.0;
    let mut closed = vec![0u8; n];
    let mut drying = vec![0u8; n];
    let mut seen = vec![0u8; n];
    let mut queue = vec![0usize; n];
    for &s in sealed {
        let s = s as usize;
        if seen[s] != 0 || !wet(s) {
            continue;
        }
        seen[s] = 1;
        queue[0] = s;
        let mut tail = 1;
        let mut open = false;
        let mut head = 0;
        while head < tail {
            let c = queue[head];
            head += 1;
            let x = c % w;
            let y = (c - x) / w;
            if feeds[c] != 0 || x == 0 || y == 0 || x == w - 1 || y == h - 1 {
                open = true;
            }
            for k in 0..4 {
                let nb = match k {
                    0 => (y > 0).then(|| c - w),
                    1 => (x > 0).then(|| c - 1),
                    2 => (y < h - 1).then(|| c + w),
                    _ => (x < w - 1).then(|| c + 1),
                };
                let Some(nb) = nb else { continue };
                if seen[nb] != 0 || !wet(nb) {
                    continue;
                }
                seen[nb] = 1;
                queue[tail] = nb;
                tail += 1;
            }
        }
        if open {
            continue;
        }
        for &i in &queue[..tail] {
            closed[i] = 1;
            if !(d[i] > prev[i]) {
                drying[i] = 1;
            }
        }
    }
    (closed, drying)
}

/// Whether the water changed between two checks only by sealed basins evaporating.
pub fn steady_apart_from_sealed(sim: &Sim, prev: &[f64], sealed: &[u32], tol: f64, moved_share: f64) -> bool {
    let (_, drying) = sealed_basins(sim, prev, sealed);
    let mut rest = 0.0;
    let mut rest_prev = 0.0;
    let mut moved: u64 = 0;
    for i in 0..sim.n {
        if drying[i] != 0 {
            continue;
        }
        rest += sim.d[i];
        rest_prev += prev[i];
        if (sim.d[i] - prev[i]).abs() > tol {
            moved += 1;
        }
    }
    let dv = (rest - rest_prev).abs() / max(rest, 1e-9);
    dv < 0.002 && (moved as f64) <= moved_share * sim.n as f64
}

/// The settle in steps (water.ts `SettleRun`): `advance` runs at most the ticks it is given.
pub struct SettleRun {
    pub every: u64,
    pub checks: u64,
    tol: f64,
    moved_share: f64,
    sealed: Option<Vec<u32>>,
    prev: Vec<f64>,
    prev_vol: f64,
    k: u64,
    since_check: u64,
    pub result: Option<SettleResult>,
}

impl SettleRun {
    pub fn new(sim: &Sim, opts: SettleOptions) -> SettleRun {
        let checks_f = ((opts.max_days * TICKS_PER_DAY as f64) / opts.check_every as f64).floor();
        let checks = if checks_f > 0.0 { checks_f as u64 } else { 0 };
        let sealed = opts.sealed.filter(|s| !s.is_empty());
        let result = if checks == 0 { Some(SettleResult { settled: false, ticks: sim.ticks, steady_ticks: None }) } else { None };
        SettleRun {
            every: opts.check_every,
            checks,
            tol: opts.tol,
            moved_share: opts.moved_share,
            sealed,
            prev: sim.d.clone(),
            prev_vol: sim.volume(),
            k: 0,
            since_check: 0,
            result,
        }
    }

    pub fn max_ticks(&self) -> u64 {
        self.checks * self.every
    }

    /// Once finished, the sealed basins at its last check (`closed`); None without sealed basins.
    pub fn closed_basins(&self, sim: &Sim) -> Option<Vec<u8>> {
        match (&self.result, &self.sealed) {
            (Some(_), Some(sealed)) => Some(sealed_basins(sim, &self.prev, sealed).0),
            _ => None,
        }
    }

    /// Run at most `ticks` more ticks (u64::MAX for no limit); the result when finished.
    pub fn advance(&mut self, sim: &mut Sim, ticks: u64) -> Option<SettleResult> {
        let mut left = ticks;
        while self.result.is_none() && left > 0 {
            let n = left.min(self.every - self.since_check);
            sim.run(n, 1.0);
            self.since_check += n;
            left -= n;
            if self.since_check < self.every {
                break;
            }
            self.since_check = 0;
            let vol = sim.volume();
            let dv = (vol - self.prev_vol).abs() / max(vol, 1e-9);
            let mut moved: u64 = 0;
            for i in 0..sim.n {
                if (sim.d[i] - self.prev[i]).abs() > self.tol {
                    moved += 1;
                }
            }
            self.k += 1;
            if dv < 0.002 && (moved as f64) <= self.moved_share * sim.n as f64 {
                self.result = Some(SettleResult { settled: true, ticks: sim.ticks, steady_ticks: None });
            } else if self.sealed.as_ref().is_some_and(|s| steady_apart_from_sealed(sim, &self.prev, s, self.tol, self.moved_share)) {
                self.result = Some(SettleResult { settled: false, ticks: sim.ticks, steady_ticks: Some(sim.ticks) });
            } else if self.k >= self.checks {
                self.result = Some(SettleResult { settled: false, ticks: sim.ticks, steady_ticks: None });
            }
            if self.result.is_none() {
                self.prev.copy_from_slice(&sim.d);
                self.prev_vol = vol;
            }
        }
        self.result
    }
}

/// Stored lake water (water.ts `RetainedWater`): only its tiles matter to the settle after the pre-fill.
pub struct Stored {
    /// Every retained lake's tiles, lake by lake.
    pub retained: Vec<Vec<u32>>,
    /// Drained tiles, ascending.
    pub drained: Vec<u32>,
}

impl Stored {
    /// water.ts `sealedTiles`: every retained tile, ascending, or None without retained water.
    pub fn sealed_tiles(&self) -> Option<Vec<u32>> {
        if self.retained.is_empty() {
            return None;
        }
        let mut all: Vec<u32> = self.retained.iter().flatten().copied().collect();
        all.sort_unstable();
        all.dedup();
        Some(all)
    }

    /// fed.ts `keptSeeds`.
    pub fn kept_seeds(&self, n: usize) -> Option<Vec<u8>> {
        if self.retained.is_empty() {
            return None;
        }
        let mut mask = vec![0u8; n];
        for r in &self.retained {
            for &i in r {
                mask[i as usize] = 1;
            }
        }
        for &i in &self.drained {
            mask[i as usize] = 0;
        }
        Some(mask)
    }
}

/// fed.ts `fedTiles`: the tiles a running source's water, or a seed's, reaches.
pub fn fed_tiles(m: &Model, depth: &[f64], seeds: Option<&[u8]>) -> Vec<u8> {
    let (w, h) = (m.w, m.h);
    let n = w * h;
    let f = &m.floor;
    let mut fed = vec![0u8; n];
    let mut queue = vec![0usize; n];
    let mut tail = 0;
    for e in &m.emitters {
        if !(e.strength > 0.0) {
            continue;
        }
        for &i in &e.cells {
            let i = i as usize;
            if fed[i] != 0 {
                continue;
            }
            fed[i] = 1;
            queue[tail] = i;
            tail += 1;
        }
    }
    if let Some(seeds) = seeds {
        for i in 0..n {
            if seeds[i] == 0 || fed[i] != 0 || !(depth[i] > 0.0) {
                continue;
            }
            fed[i] = 1;
            queue[tail] = i;
            tail += 1;
        }
    }
    let mut head = 0;
    while head < tail {
        let c = queue[head];
        head += 1;
        let d = depth[c];
        if !(d > 0.0) {
            continue;
        }
        let hc = f[c] + d;
        let x = c % w;
        let y = (c - x) / w;
        for k in 0..4 {
            let nb = match k {
                0 => (y > 0).then(|| c - w),
                1 => (x > 0).then(|| c - 1),
                2 => (y < h - 1).then(|| c + w),
                _ => (x < w - 1).then(|| c + 1),
            };
            let Some(nb) = nb else { continue };
            if fed[nb] != 0 || !(depth[nb] > 0.0) {
                continue;
            }
            let fn_ = f[nb];
            if !(fn_ <= hc) {
                continue;
            }
            let lim = match &m.dam {
                Some(dam) => dam[nb],
                None => -1.0,
            };
            if lim >= 0.0 && fn_ < hc.ceil() && hc - fn_ < lim {
                continue;
            }
            fed[nb] = 1;
            queue[tail] = nb;
            tail += 1;
        }
    }
    fed
}

/// fed.ts `withoutUnfed`: a new simulation without the unfed water, at the same tick; None when there is none.
pub fn without_unfed(m: &Model, stored: &Stored, sim: &Sim) -> Option<Sim> {
    let mut depth = sim.d.clone();
    let mut contamination = sim.c.clone();
    let mut out = sim.out.clone();
    let seeds = stored.kept_seeds(sim.n);
    let fed = fed_tiles(m, &depth, seeds.as_deref());
    let mut any = false;
    for i in 0..sim.n {
        if !(depth[i] > 0.0) || fed[i] != 0 {
            continue;
        }
        depth[i] = 0.0;
        contamination[i] = 0.0;
        out[4 * i] = 0.0;
        out[4 * i + 1] = 0.0;
        out[4 * i + 2] = 0.0;
        out[4 * i + 3] = 0.0;
        any = true;
    }
    if !any {
        return None;
    }
    let mut next = Sim::new(m.clone(), Some(&depth), Some(&contamination));
    next.out.copy_from_slice(&out);
    next.ticks = sim.ticks;
    Some(next)
}

/// prefill.ts `DRAIN_DAYS`.
pub const DRAIN_DAYS: f64 = 4.0;

/// The canonical settle's result after its pre-fill (prefill.ts `CanonicalWater` without the flags).
pub struct Canonical {
    pub result: SettleResult,
    pub depth: Vec<f64>,
    pub contamination: Vec<f64>,
    pub sat: Vec<u8>,
    pub out: Vec<f64>,
}

/// prefill.ts `canonicalRun` from the pre-fill's water (`start`) to the end, in slices.
pub struct CanonicalRun {
    model: Model,
    stored: Stored,
    start_depth: Vec<f64>,
    start_contamination: Vec<f64>,
    sealed: Option<Vec<u32>>,
    pub sim: Sim,
    run: SettleRun,
    pub max_ticks: u64,
    drain_next: bool,
    pub done: Option<Canonical>,
}

impl CanonicalRun {
    pub fn new(model: Model, stored: Stored, start_depth: Vec<f64>, start_contamination: Vec<f64>) -> CanonicalRun {
        let sim = Sim::new(model.clone(), Some(&start_depth), Some(&start_contamination));
        let sealed = stored.sealed_tiles();
        let run = SettleRun::new(&sim, SettleOptions { sealed: sealed.clone(), ..Default::default() });
        let max_ticks = run.max_ticks();
        CanonicalRun { model, stored, start_depth, start_contamination, sealed, sim, run, max_ticks, drain_next: true, done: None }
    }

    /// Run at most `ticks` more ticks (u64::MAX for no limit); true once finished (`done`).
    pub fn advance(&mut self, ticks: u64) -> bool {
        if self.done.is_some() {
            return true;
        }
        let mut left = ticks;
        loop {
            let t0 = self.sim.ticks;
            let r = self.run.advance(&mut self.sim, left);
            left = left.saturating_sub(self.sim.ticks - t0);
            let Some(r) = r else { return false };
            if self.drain_next {
                self.drain_next = false;
                if let Some(next) = without_unfed(&self.model, &self.stored, &self.sim) {
                    self.sim = next;
                    self.run = SettleRun::new(&self.sim, SettleOptions { sealed: self.sealed.clone(), max_days: DRAIN_DAYS, ..Default::default() });
                    self.max_ticks = self.sim.ticks + self.run.max_ticks();
                    if left > 0 {
                        continue;
                    }
                    return false;
                }
            }
            let closed = self.run.closed_basins(&self.sim);
            let kept = keep_sealed(&mut self.sim, closed.as_deref(), &self.start_depth, &self.start_contamination, &self.stored.drained);
            let sat = if kept {
                Sim::new(self.model.clone(), Some(&self.sim.d), Some(&self.sim.c)).saturation()
            } else {
                self.sim.saturation()
            };
            self.done = Some(Canonical { result: r, depth: self.sim.d.clone(), contamination: self.sim.c.clone(), sat, out: self.sim.out.clone() });
            return true;
        }
    }
}

/// prefill.ts `keepSealed`: a sealed basin only evaporating is stored as it started.
fn keep_sealed(sim: &mut Sim, closed: Option<&[u8]>, start_depth: &[f64], start_contamination: &[f64], drained: &[u32]) -> bool {
    let Some(closed) = closed else { return false };
    let mut skip = vec![0u8; sim.n];
    for &i in drained {
        skip[i as usize] = 1;
    }
    let mut any = false;
    for i in 0..sim.n {
        if closed[i] == 0 || skip[i] != 0 {
            continue;
        }
        sim.d[i] = start_depth[i];
        sim.c[i] = start_contamination[i];
        for k in 0..4 {
            sim.out[4 * i + k] = 0.0;
        }
        any = true;
    }
    any
}
