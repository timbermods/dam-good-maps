// The water measures the checks read: spill levels (sim/prefill.ts, the analysis kernel), drought storage
// (sim/drought.ts), sources inside a flow (analysis/sources.ts), storage near the start (analysis/storage.ts)
// and the start's water shore (analysis/walk.ts).

use crate::analysis;
use crate::geom::{object_tile, Placement};
use crate::input::{Emitter, Entity};
use crate::tables::{emitter_rule, DT, MAX_STRENGTH_PER_TILE, TICKS_PER_DAY};
use std::collections::HashSet;

pub struct Model<'a> {
    pub w: usize,
    pub h: usize,
    pub floor: &'a [f64],
    pub dam: Option<&'a [f64]>,
    pub emitters: &'a [Emitter],
}

/// `spillLevels`, by the analysis kernel.
pub fn spill_levels(m: &Model) -> Vec<f64> {
    let n = m.w * m.h;
    let mut emitting = vec![0.0; n];
    for e in m.emitters {
        for &c in &e.cells {
            emitting[c] = 1.0;
        }
    }
    let none;
    let dam: &[f64] = match m.dam {
        Some(d) => d,
        None => {
            none = vec![-1.0; n];
            &none
        }
    };
    analysis::k_spill(m.floor, dam, &emitting, m.w, m.h)
}

/// `clusterSaturation` (sim/moisture.ts).
pub fn cluster_saturation(wet: &[u8], w: usize, h: usize) -> Vec<u8> {
    let mut wn = vec![0u8; w * h];
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if wet[i] == 0 {
                continue;
            }
            let mut c = 1;
            for dy in -1i64..=1 {
                for dx in -1i64..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let xx = x as i64 + dx;
                    let yy = y as i64 + dy;
                    if xx >= 0 && xx < w as i64 && yy >= 0 && yy < h as i64 && wet[yy as usize * w + xx as usize] != 0 {
                        c += 1;
                    }
                }
            }
            wn[i] = c;
        }
    }
    let mut sat = vec![0u8; w * h];
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if wet[i] == 0 {
                continue;
            }
            let mut best = wn[i] as i32;
            if x > 0 && wn[i - 1] as i32 - 1 > best {
                best = wn[i - 1] as i32 - 1;
            }
            if x + 1 < w && wn[i + 1] as i32 - 1 > best {
                best = wn[i + 1] as i32 - 1;
            }
            if y > 0 && wn[i - w] as i32 - 1 > best {
                best = wn[i - w] as i32 - 1;
            }
            if y + 1 < h && wn[i + w] as i32 - 1 > best {
                best = wn[i + w] as i32 - 1;
            }
            sat[i] = best.min(8) as u8;
        }
    }
    sat
}

/// The 4-neighbours in the order −y, −x, +y, +x (−1 off the map).
#[inline]
fn n4(c: usize, k: usize, w: usize, h: usize) -> Option<usize> {
    let x = c % w;
    let y = c / w;
    match k {
        0 => (y > 0).then(|| c - w),
        1 => (x > 0).then(|| c - 1),
        2 => (y + 1 < h).then(|| c + w),
        _ => (x + 1 < w).then(|| c + 1),
    }
}

/// `droughtStorage`: depth left per tile after `days` of drought.
pub fn drought_storage(m: &Model, depth: &[f64], days: f64) -> Vec<f64> {
    let (w, h) = (m.w, m.h);
    let n = w * h;
    let spill = spill_levels(m);
    let mut own = spill.clone();
    if let Some(dam) = m.dam {
        for i in 0..n {
            if dam[i] < 0.0 {
                continue;
            }
            let x = i % w;
            let y = i / w;
            let mut lo = if x == 0 || y == 0 || x == w - 1 || y == h - 1 { m.floor[i] } else { f64::INFINITY };
            if y > 0 && spill[i - w] < lo {
                lo = spill[i - w];
            }
            if x > 0 && spill[i - 1] < lo {
                lo = spill[i - 1];
            }
            if y < h - 1 && spill[i + w] < lo {
                lo = spill[i + w];
            }
            if x < w - 1 && spill[i + 1] < lo {
                lo = spill[i + 1];
            }
            own[i] = if lo > m.floor[i] { lo } else { m.floor[i] };
        }
    }
    let mut kept = vec![0.0; n];
    let mut wet = vec![0u8; n];
    for i in 0..n {
        let surface = m.floor[i] + depth[i];
        let k = (if surface < own[i] { surface } else { own[i] }) - m.floor[i];
        kept[i] = if k > 0.0 { k } else { 0.0 };
        wet[i] = (kept[i] > 0.0) as u8;
    }
    let sat = cluster_saturation(&wet, w, h);
    let mut label = vec![-1i64; n];
    let mut queue = vec![0usize; n];
    let mut area: Vec<f64> = vec![];
    for s in 0..n {
        if wet[s] == 0 || label[s] >= 0 {
            continue;
        }
        let lab = area.len() as i64;
        label[s] = lab;
        let mut head = 0;
        let mut tail = 0;
        queue[tail] = s;
        tail += 1;
        while head < tail {
            let c = queue[head];
            head += 1;
            for k in 0..4 {
                let Some(nb) = n4(c, k, w, h) else { continue };
                if wet[nb] == 0 || label[nb] >= 0 || own[nb] != own[c] {
                    continue;
                }
                label[nb] = lab;
                queue[tail] = nb;
                tail += 1;
            }
        }
        area.push(tail as f64);
    }
    let seconds_per_day = TICKS_PER_DAY * 2.0 * DT;
    let mut evap = vec![0.0; area.len()];
    for i in 0..n {
        if label[i] < 0 {
            continue;
        }
        let t = 10.0 - sat[i] as f64;
        evap[label[i] as usize] += 1e-4 * (0.0595 * (t * t) + 0.101 * t + 0.72) * seconds_per_day;
    }
    for i in 0..n {
        if label[i] < 0 {
            continue;
        }
        let l = label[i] as usize;
        let drop = (evap[l] / area[l]) * days;
        let k = kept[i] - drop;
        kept[i] = if k > 0.0 { k } else { 0.0 };
    }
    kept
}

/// `specifiedStrength` with the water model's rule (sim/model.ts): the strength an emitter runs at map start.
fn running_strength(e: &Entity, tiles: usize, runs: bool) -> f64 {
    let mut strength = if runs && !e.delayed { e.strength } else { 0.0 };
    if strength > MAX_STRENGTH_PER_TILE * tiles as f64 {
        strength = MAX_STRENGTH_PER_TILE * tiles as f64;
    }
    if !(strength > 0.0) {
        strength = 0.0;
    }
    strength
}

pub struct SourcesInFlow {
    pub sources: usize,
    pub in_flow: Vec<usize>,
    pub tiles: Vec<(i64, i64)>,
}

struct Unit {
    object: usize,
    cells: Vec<usize>,
    strength: f64,
    source: bool,
}

/// `sourcesInFlow`.
pub fn sources_in_flow(m: &Model, objects: &[&Entity], depth: &[f64]) -> SourcesInFlow {
    let (w, h) = (m.w, m.h);
    let n = w * h;
    let mut units: Vec<Unit> = vec![];
    for (k, o) in objects.iter().enumerate() {
        let Some(rule) = emitter_rule(&o.template) else { continue };
        let p = Placement::of(o);
        let mut cells = vec![];
        for &(lx, ly) in rule.tiles {
            let (x, y) = object_tile(&p, lx, ly);
            if x >= 0 && x < w as i64 && y >= 0 && y < h as i64 {
                cells.push(y as usize * w + x as usize);
            }
        }
        if cells.is_empty() {
            continue;
        }
        let strength = running_strength(o, rule.tiles.len(), rule.runs);
        units.push(Unit { object: k, cells, strength, source: o.template == "WaterSource" || o.template == "BadwaterSource" });
    }
    let sources = units.iter().filter(|u| u.source).count();
    if sources == 0 {
        return SourcesInFlow { sources: 0, in_flow: vec![], tiles: vec![] };
    }
    let mut parent: Vec<usize> = (0..units.len()).collect();
    fn find(parent: &mut [usize], mut a: usize) -> usize {
        while parent[a] != a {
            parent[a] = parent[parent[a]];
            a = parent[a];
        }
        a
    }
    let mut owner = vec![-1i64; n];
    for (k, u) in units.iter().enumerate() {
        for &c in &u.cells {
            if owner[c] < 0 {
                owner[c] = k as i64;
            }
        }
    }
    for k in 0..units.len() {
        for ci in 0..units[k].cells.len() {
            let c = units[k].cells[ci];
            let x = (c % w) as i64;
            let y = (c / w) as i64;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let xx = x + dx;
                    let yy = y + dy;
                    if xx < 0 || yy < 0 || xx >= w as i64 || yy >= h as i64 {
                        continue;
                    }
                    let o = owner[yy as usize * w + xx as usize];
                    if o < 0 {
                        continue;
                    }
                    let ra = find(&mut parent, o as usize);
                    let rb = find(&mut parent, k);
                    if ra != rb {
                        parent[ra.max(rb)] = ra.min(rb);
                    }
                }
            }
        }
    }
    let mut roots: Vec<usize> = vec![];
    let mut groups: Vec<Vec<usize>> = vec![];
    for k in 0..units.len() {
        let r = find(&mut parent, k);
        match roots.iter().position(|&q| q == r) {
            Some(g) => groups[g].push(k),
            None => {
                roots.push(r);
                groups.push(vec![k]);
            }
        }
    }
    let spill = spill_levels(m);
    let mut pool = vec![0u8; n];
    for i in 0..n {
        let base = m.floor[i] + match m.dam {
            Some(d) if d[i] >= 0.0 => d[i],
            _ => 0.0,
        };
        pool[i] = (spill[i] > base) as u8;
    }
    let mut emitting = vec![0u8; n];
    for u in &units {
        for &c in &u.cells {
            emitting[c] = 1;
        }
    }
    let mut exit_dist = vec![-1i64; n];
    let mut flat: Vec<usize> = vec![];
    for c in 0..n {
        let x = c % w;
        let y = c / w;
        let mut exit = (x == 0 || y == 0 || x == w - 1 || y == h - 1) && emitting[c] == 0;
        let mut d = 0;
        while d < 4 && !exit {
            if let Some(nb) = n4(c, d, w, h) {
                if spill[nb] < spill[c] {
                    exit = true;
                }
            }
            d += 1;
        }
        if exit {
            exit_dist[c] = 0;
            flat.push(c);
        }
    }
    let mut head = 0;
    while head < flat.len() {
        let c = flat[head];
        head += 1;
        for d in 0..4 {
            let Some(nb) = n4(c, d, w, h) else { continue };
            if exit_dist[nb] >= 0 || spill[nb] != spill[c] {
                continue;
            }
            exit_dist[nb] = exit_dist[c] + 1;
            flat.push(nb);
        }
    }
    let runs = |c: usize, nb: usize| spill[nb] < spill[c] || (spill[nb] == spill[c] && ((pool[c] == 1 && pool[nb] == 1) || exit_dist[nb] <= exit_dist[c]));
    let reach: Vec<Vec<u8>> = groups
        .iter()
        .map(|g| {
            let mut seen = vec![0u8; n];
            let mut queue = vec![];
            for &k in g {
                for &c in &units[k].cells {
                    if seen[c] == 0 {
                        seen[c] = 1;
                        queue.push(c);
                    }
                }
            }
            let mut head = 0;
            while head < queue.len() {
                let c = queue[head];
                head += 1;
                for d in 0..4 {
                    let Some(nb) = n4(c, d, w, h) else { continue };
                    if seen[nb] != 0 || !(depth[nb] > 0.0) || !runs(c, nb) {
                        continue;
                    }
                    seen[nb] = 1;
                    queue.push(nb);
                }
            }
            seen
        })
        .collect();
    let reaches = |a: usize, b: usize, sources_only: bool| groups[b].iter().any(|&k| (!sources_only || units[k].source) && units[k].cells.iter().any(|&c| reach[a][c] == 1));
    let running: Vec<bool> = groups.iter().map(|g| g.iter().any(|&k| units[k].strength > 0.0)).collect();
    let mut in_flow: Vec<(usize, (i64, i64))> = vec![];
    for b in 0..groups.len() {
        if !groups[b].iter().any(|&k| units[k].source) {
            continue;
        }
        let mut by = false;
        for a in 0..groups.len() {
            if a != b && running[a] && reaches(a, b, true) && !reaches(b, a, false) {
                by = true;
            }
        }
        if !by {
            continue;
        }
        for &k in &groups[b] {
            if !units[k].source {
                continue;
            }
            let c = units[k].cells[0];
            in_flow.push((units[k].object, ((c % w) as i64, (c / w) as i64)));
        }
    }
    in_flow.sort_by_key(|p| p.0);
    SourcesInFlow { sources, in_flow: in_flow.iter().map(|p| p.0).collect(), tiles: in_flow.iter().map(|p| p.1).collect() }
}

pub const SECONDS_PER_DAY: f64 = 460.0;

/// `runningFlow`: clean strength feeding the water body `tile` belongs to.
pub fn running_flow(w: usize, h: usize, depth: &[f64], emitters: &[Emitter], tile: usize) -> f64 {
    let n = w * h;
    let mut body = vec![0u8; n];
    let mut q = vec![tile];
    body[tile] = 1;
    let mut k = 0;
    while k < q.len() {
        let i = q[k];
        k += 1;
        let x = i % w;
        let y = i / w;
        let nb = [(x > 0).then(|| i - 1), (x + 1 < w).then(|| i + 1), (y > 0).then(|| i - w), (y + 1 < h).then(|| i + w)];
        for j in nb.into_iter().flatten() {
            if body[j] != 0 || !(depth[j] > 0.001) {
                continue;
            }
            body[j] = 1;
            q.push(j);
        }
    }
    let mut running = 0.0;
    for e in emitters {
        if e.contamination > 0.0 || !(e.strength > 0.0) {
            continue;
        }
        if e.cells.iter().any(|&c| body[c] != 0) {
            running += e.strength;
        }
    }
    running
}

/// `leveeStorage`: the most levees can hold near the start, up to `enough`.
pub fn levee_storage(hgt: &[u8], w: usize, h: usize, d: &[f64], c: &[f64], start: (i64, i64, f64), enough: f64) -> f64 {
    let n = w * h;
    let (sx, sy, sz) = start;
    let (wi, hi) = (w as i64, h as i64);
    let mut best = 0.0;
    let in_box = |x: i64, y: i64| (x - sx).abs().max((y - sy).abs()) <= 60 && x > 0 && y > 0 && x < wi - 1 && y < hi - 1;
    let mut r = vec![-1i64; n];
    let mut stamp: i64 = 0;
    let mut seeds = vec![];
    let mut y = 1.max(sy - 40);
    while y <= (hi - 2).min(sy + 40) {
        let mut x = 1.max(sx - 40);
        while x <= (wi - 2).min(sx + 40) {
            let i = (y * wi + x) as usize;
            if d[i] > 0.05 && c[i] < 0.05 {
                seeds.push(i);
            }
            x += 3;
        }
        y += 3;
    }
    let mut tried: HashSet<(i64, i64)> = HashSet::new();
    for &s0 in &seeds {
        for crest in 1..=3 {
            let lambda = hgt[s0] as f64 + crest as f64;
            if lambda > sz {
                break;
            }
            stamp += 1;
            if r[s0] >= 0 && tried.contains(&(r[s0], lambda as i64)) {
                continue;
            }
            let mut q = vec![s0];
            r[s0] = stamp;
            let mut cut = 0.0;
            let mut perim = 0.0;
            let mut vol = 0.0;
            let mut k = 0;
            while k < q.len() {
                let i = q[k];
                k += 1;
                let x = (i % w) as i64;
                let y = (i / w) as i64;
                let sfc = hgt[i] as f64 + d[i];
                if lambda > sfc {
                    vol += lambda - sfc;
                }
                for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                    let xx = x + dx;
                    let yy = y + dy;
                    if xx < 0 || yy < 0 || xx >= wi || yy >= hi {
                        continue;
                    }
                    let j = (yy * wi + xx) as usize;
                    if r[j] == stamp {
                        continue;
                    }
                    if hgt[j] as f64 >= lambda {
                        perim += 1.0;
                        continue;
                    }
                    if !in_box(xx, yy) {
                        cut += 1.0;
                        perim += 1.0;
                        continue;
                    }
                    r[j] = stamp;
                    q.push(j);
                }
            }
            tried.insert((stamp, lambda as i64));
            if cut <= 0.25 * perim && vol > best {
                best = vol;
            }
            if best >= enough {
                return best;
            }
        }
    }
    best
}

pub const PUMP_DEPTH: f64 = 0.3;
pub const PUMP_CLEAN: f64 = 0.05;
pub const PUMP_REACH: f64 = 2.0;
pub const WATER_BODY: f64 = 0.001;
pub const WALK_LIMIT: f64 = 64.0;

/// `reachAt`.
pub fn reach_at(d: &[f64], w: usize, h: usize, i: usize) -> f64 {
    let x = i % w;
    let y = i / w;
    let mut best = d[i];
    if x > 0 && d[i - 1] + 1.0 < best {
        best = d[i - 1] + 1.0;
    }
    if x + 1 < w && d[i + 1] + 1.0 < best {
        best = d[i + 1] + 1.0;
    }
    if y > 0 && d[i - w] + 1.0 < best {
        best = d[i - w] + 1.0;
    }
    if y + 1 < h && d[i + w] + 1.0 < best {
        best = d[i + w] + 1.0;
    }
    best
}

fn tile_shore_walk(walk: &[f64], hgt: &[u8], w: usize, h: usize, i: usize, d: f64, clean: bool) -> f64 {
    if !(d >= PUMP_DEPTH) || !clean {
        return f64::INFINITY;
    }
    let surface = hgt[i] as f64 + d;
    let x = i % w;
    let y = i / w;
    let mut best = f64::INFINITY;
    for k in 0..4 {
        let nb = match k {
            0 => (x > 0).then(|| i - 1),
            1 => (x + 1 < w).then(|| i + 1),
            2 => (y > 0).then(|| i - w),
            _ => (y + 1 < h).then(|| i + w),
        };
        let Some(nb) = nb else { continue };
        if !(walk[nb] < best) {
            continue;
        }
        let lv = hgt[nb] as f64;
        if surface >= lv - PUMP_REACH && surface <= lv + 0.01 {
            best = walk[nb];
        }
    }
    best
}

pub struct Shore {
    pub distance: f64,
    pub tile: i64,
    pub puddle: f64,
}

/// `startWaterShore`.
#[allow(clippy::too_many_arguments)]
pub fn start_water_shore(walk: &[f64], hgt: &[u8], w: usize, h: usize, depth: &[f64], contamination: &[f64], emitters: &[Emitter], after: &[f64], within: f64) -> Shore {
    let n = w * h;
    let mut body = vec![-1i64; n];
    let mut queue = vec![0usize; n];
    let mut bodies = 0usize;
    for s in 0..n {
        if body[s] >= 0 || !(depth[s] > WATER_BODY) {
            continue;
        }
        let k = bodies as i64;
        bodies += 1;
        body[s] = k;
        let mut head = 0;
        let mut tail = 0;
        queue[tail] = s;
        tail += 1;
        while head < tail {
            let i = queue[head];
            head += 1;
            let x = i % w;
            let y = i / w;
            for m in 0..4 {
                let nb = match m {
                    0 => (x > 0).then(|| i - 1),
                    1 => (x + 1 < w).then(|| i + 1),
                    2 => (y > 0).then(|| i - w),
                    _ => (y + 1 < h).then(|| i + w),
                };
                let Some(nb) = nb else { continue };
                if body[nb] >= 0 || !(depth[nb] > WATER_BODY) {
                    continue;
                }
                body[nb] = k;
                queue[tail] = nb;
                tail += 1;
            }
        }
    }
    let mut counts = vec![0u8; bodies];
    for e in emitters {
        if e.strength > 0.0 {
            for &c in &e.cells {
                if body[c] >= 0 {
                    counts[body[c] as usize] = 1;
                }
            }
        }
    }
    let mut now = vec![f64::INFINITY; n];
    for i in 0..n {
        if body[i] < 0 {
            continue;
        }
        let clean = contamination[i] < PUMP_CLEAN;
        let wv = tile_shore_walk(walk, hgt, w, h, i, depth[i], clean);
        now[i] = wv;
        let b = body[i] as usize;
        if counts[b] == 0 && wv <= within && tile_shore_walk(walk, hgt, w, h, i, after[i], clean) <= within {
            counts[b] = 1;
        }
    }
    let mut distance = f64::INFINITY;
    let mut tile = -1i64;
    let mut puddle = f64::INFINITY;
    for i in 0..n {
        if !(now[i] < f64::INFINITY) {
            continue;
        }
        if counts[body[i] as usize] != 0 {
            if now[i] < distance {
                distance = now[i];
                tile = i as i64;
            }
        } else if now[i] < puddle {
            puddle = now[i];
        }
    }
    Shore { distance, tile, puddle: if puddle < distance { puddle } else { f64::INFINITY } }
}
