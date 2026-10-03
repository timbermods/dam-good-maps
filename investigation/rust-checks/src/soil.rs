// The soil of a heightfield map by the game's own rules (sim/soil.ts `gameSoil` in its "game" mode: the water
// columns of sim/columns.ts, the column saturation and the float32 tick settle of sim/soil3d.ts). Every
// JavaScript `Math.fround` and Float32Array store is an `as f32` here, and every other operation runs in f64 as
// JavaScript runs it, so each value is the TypeScript's bit for bit.

use crate::geom::{object_tile, Placement};
use crate::input::Entity;
use std::collections::HashMap;

const TERRAIN_LAYERS: i32 = 23;
const OPEN_CEILING: i32 = 34;

/// Float32 rounding, `Math.fround`.
#[inline(always)]
fn f32r(v: f64) -> f64 {
    v as f32 as f64
}

struct WaterColumns {
    n: usize,
    l: usize,
    count: Vec<u8>,
    floor: Vec<i32>,
    ceil: Vec<i32>,
}

/// Run tops of a heightfield: tile i solid from 0 to its height, one run each (`terrainColumns(heightMasks)`).
struct Runs {
    n: usize,
    t: usize,
    count: Vec<u8>,
    floor: Vec<i32>,
    ceil: Vec<i32>,
}

fn clz32(m: u32) -> i32 {
    m.leading_zeros() as i32
}

/// `waterColumns(heightMasks(…), objects)`, without the height and direction limits the soil does not read.
fn water_columns(w: usize, h: usize, mask: &[u32], objects: &[&Entity]) -> WaterColumns {
    let n = w * h;
    let mut lists: HashMap<usize, Vec<i32>> = HashMap::new();
    let mut order: Vec<usize> = vec![];
    let mut simple_floor = vec![0i32; n];
    for i in 0..n {
        let m = mask[i];
        if m & m.wrapping_add(1) == 0 {
            simple_floor[i] = if m == 0 { 0 } else { 32 - clz32(m) };
            continue;
        }
        let mut c = vec![];
        let mut z = 0;
        while z < OPEN_CEILING {
            while z < TERRAIN_LAYERS && m & (1 << z) != 0 {
                z += 1;
            }
            if z >= OPEN_CEILING {
                break;
            }
            let f = z;
            while z < OPEN_CEILING && !(z < TERRAIN_LAYERS && m & (1 << z) != 0) {
                z += 1;
            }
            c.push(f);
            c.push(z);
        }
        lists.insert(i, c);
        order.push(i);
    }
    fn list<'a>(lists: &'a mut HashMap<usize, Vec<i32>>, order: &mut Vec<usize>, simple_floor: &[i32], i: usize) -> &'a mut Vec<i32> {
        if !lists.contains_key(&i) {
            lists.insert(i, vec![simple_floor[i], OPEN_CEILING]);
            order.push(i);
        }
        lists.get_mut(&i).unwrap()
    }
    fn find(c: &[i32], z: i32) -> i64 {
        let mut k = 0;
        while k < c.len() {
            if z < c[k] {
                break;
            }
            if z < c[k + 1] {
                return k as i64;
            }
            k += 2;
        }
        -1
    }
    let mut hcount: HashMap<i64, u32> = HashMap::new();
    let inside = |x: i64, y: i64| x >= 0 && x < w as i64 && y >= 0 && y < h as i64;
    for o in objects {
        let (full, horizontal): (&[(i64, i64)], &[(i64, i64, i64)]) = match o.template.as_str() {
            "Blockage" => (&[(0, 0)], &[]),
            "NaturalOverhang2x1" => (&[(0, 0)], &[(0, 0, 1), (0, 1, 1)]),
            "NaturalOverhang3x1" => (&[(0, 0)], &[(0, 0, 1), (0, 1, 1), (0, 2, 1)]),
            "NaturalOverhang4x1" => (&[(0, 0)], &[(0, 0, 1), (0, 1, 1), (0, 2, 1), (0, 3, 1)]),
            "BadtideDrain" => (&[(0, 0)], &[(0, 1, 0), (0, 1, 1)]),
            _ => continue, // NaturalDam's partial obstacle changes no column
        };
        let p = Placement::of(o);
        for &(lx, ly) in full {
            let (x, y) = object_tile(&p, lx, ly);
            if !inside(x, y) {
                continue;
            }
            let i = y as usize * w + x as usize;
            let z = o.z as i32;
            let c = list(&mut lists, &mut order, &simple_floor, i);
            let k = find(c, z);
            if k < 0 {
                continue;
            }
            let k = k as usize;
            if c[k] == z {
                if c[k + 1] - 1 == z {
                    c.drain(k..k + 2);
                } else {
                    c[k] = z + 1;
                }
            } else if c[k + 1] - 1 == z {
                c[k + 1] = z;
            } else {
                let top = c[k + 1];
                c[k + 1] = z;
                c.splice(k + 2..k + 2, [z + 1, top]);
            }
        }
        for &(lx, ly, lz) in horizontal {
            let (x, y) = object_tile(&p, lx, ly);
            if !inside(x, y) {
                continue;
            }
            let i = y as usize * w + x as usize;
            let z = (o.z + lz) as i32;
            let key = z as i64 * n as i64 + i as i64;
            let cnt = hcount.entry(key).or_insert(0);
            *cnt += 1;
            if *cnt != 1 {
                continue;
            }
            let c = list(&mut lists, &mut order, &simple_floor, i);
            let k = find(c, z);
            if k < 0 || c[k as usize] == z {
                continue;
            }
            let k = k as usize;
            let top = c[k + 1];
            c[k + 1] = z;
            c.splice(k + 2..k + 2, [z, top]);
        }
    }
    let mut l = 1;
    for c in lists.values() {
        if c.len() / 2 > l {
            l = c.len() / 2;
        }
    }
    let mut count = vec![0u8; n];
    let mut floor = vec![0i32; l * n];
    let mut ceil = vec![0i32; l * n];
    for i in 0..n {
        match lists.get(&i) {
            None => {
                count[i] = 1;
                floor[i] = simple_floor[i];
                ceil[i] = OPEN_CEILING;
            }
            Some(c) => {
                count[i] = (c.len() / 2) as u8;
                for k in 0..c.len() / 2 {
                    floor[k * n + i] = c[2 * k];
                    ceil[k * n + i] = c[2 * k + 1];
                }
            }
        }
    }
    WaterColumns { n, l, count, floor, ceil }
}

/// `terrainColumns`.
fn terrain_columns(n: usize, mask: &[u32]) -> Runs {
    let mut t = 1;
    let mut count = vec![0u8; n];
    let mut runs: Vec<Option<Vec<i32>>> = vec![None; n];
    for i in 0..n {
        let m = mask[i];
        if m & m.wrapping_add(1) == 0 {
            count[i] = 1;
            continue;
        }
        let mut r = vec![];
        let mut solid = true;
        let mut f = 0;
        for z in 0..TERRAIN_LAYERS {
            if m & (1 << z) != 0 {
                if !solid {
                    f = z;
                }
                solid = true;
            } else {
                if solid {
                    r.push(f);
                    r.push(z);
                }
                solid = false;
            }
        }
        if solid {
            r.push(f);
            r.push(TERRAIN_LAYERS);
        }
        count[i] = (r.len() / 2) as u8;
        if count[i] as usize > t {
            t = count[i] as usize;
        }
        runs[i] = Some(r);
    }
    let mut floor = vec![0i32; t * n];
    let mut ceil = vec![0i32; t * n];
    for i in 0..n {
        match &runs[i] {
            None => {
                let m = mask[i];
                ceil[i] = if m == 0 { 0 } else { 32 - clz32(m) };
            }
            Some(r) => {
                for k in 0..r.len() / 2 {
                    floor[k * n + i] = r[2 * k];
                    ceil[k * n + i] = r[2 * k + 1];
                }
            }
        }
    }
    Runs { n, t, count, floor, ceil }
}

/// `columnSaturation`.
fn column_saturation(wc: &WaterColumns, w: usize, h: usize, depth: &[f64]) -> Vec<u8> {
    let n = wc.n;
    let m = wc.l * n;
    let (fl, ce, count) = (&wc.floor, &wc.ceil, &wc.count);
    let mut wn = vec![0i32; m];
    let neighbour_wet = |c: usize, t: usize| -> bool {
        let fc = fl[c];
        let cc = ce[c];
        if fl[t] >= fc {
            return cc > fl[t] && depth[t] > 0.0;
        }
        for s in (0..count[t] as usize).rev() {
            let id = s * n + t;
            if fl[id] < cc && ce[id] > fc && depth[id] > 0.0 {
                return true;
            }
        }
        false
    };
    for c in 0..m {
        if !(depth[c] > 0.0) {
            continue;
        }
        let i = c % n;
        let x = (i % w) as i64;
        let y = (i / w) as i64;
        let mut k = 1;
        for dy in -1..=1 {
            let yy = y + dy;
            if yy < 0 || yy >= h as i64 {
                continue;
            }
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let xx = x + dx;
                if xx >= 0 && xx < w as i64 && neighbour_wet(c, yy as usize * w + xx as usize) {
                    k += 1;
                }
            }
        }
        wn[c] = k;
    }
    let best_wn = |c: usize, t: usize| -> i32 {
        let fc = fl[c];
        let cc = ce[c];
        let mut best = 0;
        for s in 0..count[t] as usize {
            let id = s * n + t;
            if depth[id] > 0.0 && wn[id] > best && ce[id] > fc && fl[id] < cc {
                best = wn[id];
            }
        }
        best
    };
    let mut sat = vec![0u8; m];
    for c in 0..m {
        if !(depth[c] > 0.0) {
            continue;
        }
        let i = c % n;
        let x = i % w;
        let y = i / w;
        let mut best = wn[c];
        if y > 0 {
            best = best.max(best_wn(c, i - w) - 1);
        }
        if x > 0 {
            best = best.max(best_wn(c, i - 1) - 1);
        }
        if y < h - 1 {
            best = best.max(best_wn(c, i + w) - 1);
        }
        if x < w - 1 {
            best = best.max(best_wn(c, i + 1) - 1);
        }
        sat[c] = if best < 8 { best as u8 } else { 8 };
    }
    sat
}

/// The spread's neighbour order (`MoistureCalculationTask`): −y, −x, +x, +y, then the diagonals.
const SPREAD8: [(i64, i64, bool); 8] = [(0, -1, false), (-1, 0, false), (1, 0, false), (0, 1, false), (-1, -1, true), (1, -1, true), (-1, 1, true), (1, 1, true)];
const DIRS4: [(i64, i64); 4] = [(0, -1), (-1, 0), (0, 1), (1, 0)];

struct Graph {
    start: Vec<usize>,
    to: Vec<usize>,
    diag: Vec<bool>,
    nodes: Vec<usize>,
}

fn spread_graph(runs: &Runs, w: usize, h: usize) -> Graph {
    let n = runs.n;
    let nn = runs.t * n;
    let mut start = vec![0usize; nn + 1];
    let mut to = vec![];
    let mut diag = vec![];
    let mut nodes = vec![];
    for node in 0..nn {
        start[node] = to.len();
        let i = node % n;
        if node / n >= runs.count[i] as usize {
            continue;
        }
        nodes.push(node);
        let top = runs.ceil[node];
        let bottom = runs.floor[node];
        let x = (i % w) as i64;
        let y = (i / w) as i64;
        for (d, &(dx, dy, dg)) in SPREAD8.iter().enumerate() {
            let _ = d;
            let xx = x + dx;
            let yy = y + dy;
            if xx < 0 || xx >= w as i64 || yy < 0 || yy >= h as i64 {
                continue;
            }
            let j = yy as usize * w + xx as usize;
            for k in 0..runs.count[j] as usize {
                let r = k * n + j;
                if runs.ceil[r] < bottom {
                    continue;
                }
                if runs.floor[r] > top {
                    break;
                }
                to.push(r);
                diag.push(dg);
            }
        }
    }
    start[nn] = to.len();
    Graph { start, to, diag, nodes }
}

/// `settleTicks`.
fn settle_ticks(g: &Graph, nn: usize, mut cell: impl FnMut(usize, &[f32]) -> f32, max_ticks: usize) -> Vec<f32> {
    let mut last = vec![0f32; nn];
    let mut active: Vec<usize> = g.nodes.clone();
    active.resize(nn.max(g.nodes.len()), 0);
    let mut active_count = g.nodes.len();
    let mut next_active = vec![0usize; nn];
    let mut changed = vec![0usize; nn];
    let mut values = vec![0f32; nn];
    let mut mark = vec![0u32; nn];
    let mut stamp = 0u32;
    let mut tick = 0;
    while tick < max_ticks && active_count > 0 {
        let mut nc = 0;
        for a in 0..active_count {
            let node = active[a];
            let v = cell(node, &last);
            if v != last[node] {
                changed[nc] = node;
                values[nc] = v;
                nc += 1;
            }
        }
        for k in 0..nc {
            last[changed[k]] = values[k];
        }
        stamp += 1;
        let mut na = 0;
        for k in 0..nc {
            let node = changed[k];
            if mark[node] != stamp {
                mark[node] = stamp;
                next_active[na] = node;
                na += 1;
            }
            for e in g.start[node]..g.start[node + 1] {
                let r = g.to[e];
                if mark[r] != stamp {
                    mark[r] = stamp;
                    next_active[na] = r;
                    na += 1;
                }
            }
        }
        std::mem::swap(&mut active, &mut next_active);
        active_count = na;
        tick += 1;
    }
    last
}

fn run_water(runs: &Runs, wc: &WaterColumns) -> (Vec<i64>, Vec<i64>) {
    let n = runs.n;
    let mut own = vec![-1i64; runs.t * n];
    let mut below = vec![-1i64; runs.t * n];
    for i in 0..n {
        for k in 0..runs.count[i] as usize {
            let nd = k * n + i;
            let top = runs.ceil[nd];
            let bottom = runs.floor[nd];
            for s in 0..wc.count[i] as usize {
                let id = s * n + i;
                if wc.floor[id] == top {
                    own[nd] = id as i64;
                    break;
                }
                if wc.floor[id] > top {
                    break;
                }
            }
            for s in 0..wc.count[i] as usize {
                let id = s * n + i;
                if wc.ceil[id] == bottom {
                    below[nd] = id as i64;
                    break;
                }
                if wc.ceil[id] > bottom {
                    break;
                }
            }
        }
    }
    (own, below)
}

struct Consts {
    m_decay: f64,
    m_spread: f64,
    m_scaler: f64,
    m_min_water: f64,
    m_min: f64,
    m_diag: f64,
    c_decay: f64,
    c_spread: f64,
    c_max: f64,
    c_reg: f64,
    c_diag: f64,
    c_vert: f64,
    c_scaler: f64,
    c_threshold: f64,
}

fn consts() -> Consts {
    let tick = f32r(0.6);
    Consts {
        m_decay: f32r(f32r(1.25) * tick),
        m_spread: f32r(f32r(6.66) * tick),
        m_scaler: f32r(1.0 / f32r(0.53)),
        m_min_water: f32r(0.01),
        m_min: f32r(0.01),
        m_diag: f32r(1.414),
        c_decay: f32r(f32r(0.033) * tick),
        c_spread: f32r(f32r(0.066) * tick),
        c_max: f32r(1.0 - f32r(0.001)),
        c_reg: f32r(1.0 / 7.0),
        c_diag: f32r(f32r(std::f64::consts::SQRT_2) / 7.0),
        c_vert: f32r(5.0 / 7.0),
        c_scaler: f32r(1.0 / (1.0 - 0.5)),
        c_threshold: f32r(0.001),
    }
}
const C_MIN_WATER: f64 = 0.5;

pub struct Soil {
    pub moisture: Vec<f64>,
    pub contamination: Vec<f64>,
}

/// `gameSoil(W, H, heights, depth, contamination, objects)` with the game's rules.
pub fn game_soil(w: usize, h: usize, heights: &[f64], depth: &[f64], contamination: &[f64], objects: &[&Entity]) -> Soil {
    let n = w * h;
    let mask: Vec<u32> = heights.iter().map(|&v| ((1u64 << (portable::min(TERRAIN_LAYERS as f64, portable::max(0.0, v)) as u32)) - 1) as u32).collect();
    let wc = water_columns(w, h, &mask, objects);
    let m = wc.l * n;
    let mut d = depth.to_vec();
    let mut c = contamination.to_vec();
    if m > n {
        d.resize(m, 0.0);
        c.resize(m, 0.0);
    }
    let runs = terrain_columns(n, &mask);
    let mut barrier: Option<std::collections::HashSet<i64>> = None;
    for o in objects {
        if o.template != "Thorns" {
            continue;
        }
        let (x, y) = object_tile(&Placement::of(o), 0, 0);
        if x < 0 || x >= w as i64 || y < 0 || y >= h as i64 {
            continue;
        }
        barrier.get_or_insert_with(Default::default).insert(o.z * n as i64 + y * w as i64 + x);
    }
    let sat = column_saturation(&wc, w, h, &d);
    let k = consts();
    let g = spread_graph(&runs, w, h);
    let (own, below) = run_water(&runs, &wc);
    let nn = runs.t * n;
    let df: Vec<f64> = d.iter().map(|&v| f32r(v)).collect();
    let cf: Vec<f64> = c.iter().map(|&v| f32r(v)).collect();
    let barred = |top: i32, i: usize| barrier.as_ref().is_some_and(|b| b.contains(&(top as i64 * n as i64 + i as i64)));

    // ---- moisture3dGame
    let initial_range = |cc: usize| f32r(2.0 * sat[cc] as f64);
    let range = |cc: usize| -> f64 {
        let cn = cf[cc];
        if cn < k.m_min_water {
            return initial_range(cc).trunc();
        }
        let s = f32r(cn * k.m_scaler);
        if s >= 1.0 {
            return 0.0;
        }
        f32r(initial_range(cc) * f32r(1.0 - s)).trunc()
    };
    let mut fixed = vec![f64::NAN; nn];
    let mut num = vec![0f64; nn];
    let mut keep = vec![0f64; nn];
    let mut climb_base = vec![0i64; nn];
    for &nd in &g.nodes {
        let i = nd % n;
        let top = runs.ceil[nd];
        let bottom = runs.floor[nd];
        let wo = own[nd];
        climb_base[nd] = top as i64 + (if wo >= 0 { df[wo as usize] } else { 0.0 }).ceil() as i64;
        if barred(top, i) {
            fixed[nd] = 0.0;
            continue;
        }
        if wo >= 0 && df[wo as usize] > 0.0 && cf[wo as usize] <= k.m_min_water {
            fixed[nd] = f32r(initial_range(wo as usize).trunc());
            continue;
        }
        keep[nd] = f32r(1.0 - if wo >= 0 { cf[wo as usize] } else { 0.0 });
        let mut v = 0.0;
        let b = below[nd];
        if b >= 0 && f32r(df[b as usize] + wc.floor[b as usize] as f64) >= wc.ceil[b as usize] as f64 {
            v = range(b as usize) - ((top - bottom - 1) * 6) as f64;
        }
        let x = (i % w) as i64;
        let y = (i / w) as i64;
        for &(dx, dy) in DIRS4.iter() {
            if v >= 16.0 {
                break;
            }
            let xx = x + dx;
            let yy = y + dy;
            if xx < 0 || xx >= w as i64 || yy < 0 || yy >= h as i64 {
                continue;
            }
            let j = yy as usize * w + xx as usize;
            let mut cc: i64 = -1;
            for s in (0..wc.count[j] as usize).rev() {
                let id = s * n + j;
                if wc.floor[id] <= top && df[id] > 0.0 {
                    cc = id as i64;
                    break;
                }
            }
            if cc < 0 {
                continue;
            }
            let cc = cc as usize;
            let surface = f32r(wc.floor[cc] as f64 + df[cc]).ceil();
            if surface <= bottom as f64 {
                continue;
            }
            let mv = range(cc) - portable::max(0.0, top as f64 - surface) * 6.0;
            if mv > v {
                v = mv;
            }
        }
        num[nd] = v;
    }
    let moisture = settle_ticks(
        &g,
        nn,
        |nd, last| {
            let f = fixed[nd];
            if !f.is_nan() {
                return f as f32;
            }
            let water = num[nd];
            let mut spread = 0.0f64;
            if water < 16.0 {
                let top = runs.ceil[nd] as i64;
                for e in g.start[nd]..g.start[nd + 1] {
                    let r = g.to[e];
                    let m = last[r] as f64;
                    if m == 0.0 {
                        continue;
                    }
                    let cost = if g.diag[e] { k.m_diag } else { 1.0 };
                    let climb = top - climb_base[r];
                    let v = if climb < 0 { f32r(m - cost) } else { f32r(f32r(m - (climb * 6) as f64) - cost) };
                    if v > spread {
                        spread = v;
                    }
                }
            }
            let was = last[nd] as f64;
            let mut decayed = f32r(was - k.m_decay);
            if decayed < 0.0 {
                decayed = 0.0;
            }
            let mut v = decayed;
            if water > decayed && water >= spread {
                let cap = f32r(was + k.m_spread);
                v = if water > cap { cap } else { water };
            } else if spread > decayed {
                v = spread;
            }
            let out = f32r(v * keep[nd]);
            if out < k.m_min {
                0.0
            } else {
                out as f32
            }
        },
        3000,
    );

    // ---- contamination3dGame
    let mut cbarred = vec![false; nn];
    let mut cnum = vec![0f64; nn];
    for &nd in &g.nodes {
        let i = nd % n;
        let top = runs.ceil[nd];
        let bottom = runs.floor[nd];
        if barred(top, i) {
            cbarred[nd] = true;
            continue;
        }
        let mut v = 0.0;
        let b = below[nd];
        if b >= 0 && f32r(df[b as usize] + wc.floor[b as usize] as f64) >= wc.ceil[b as usize] as f64 {
            let s = f32r(cf[b as usize] - C_MIN_WATER);
            v = if s < 0.0 { 0.0 } else { f32r(f32r(s * k.c_scaler) - f32r((top - bottom - 1) as f64 * k.c_vert)) };
        }
        let x = (i % w) as i64;
        let y = (i / w) as i64;
        for &(dx, dy) in DIRS4.iter() {
            if v >= k.c_max {
                break;
            }
            let xx = x + dx;
            let yy = y + dy;
            if xx < 0 || xx >= w as i64 || yy < 0 || yy >= h as i64 {
                continue;
            }
            let j = yy as usize * w + xx as usize;
            let mut cc: i64 = -1;
            for s in (0..wc.count[j] as usize).rev() {
                let id = s * n + j;
                if wc.floor[id] <= top && cf[id] > 0.0 {
                    cc = id as i64;
                    break;
                }
            }
            if cc < 0 {
                continue;
            }
            let cc = cc as usize;
            let s = f32r(cf[cc] - C_MIN_WATER);
            if s < 0.0 {
                continue;
            }
            let surface = if df[cc] > 0.0 { f32r(wc.floor[cc] as f64 + df[cc]).ceil() } else { 0.0 };
            if surface <= bottom as f64 {
                continue;
            }
            let scaled = f32r(s * k.c_scaler);
            let up = top as f64 - surface;
            let mv = if up < 0.0 { scaled } else { f32r(scaled - f32r(up * k.c_vert)) };
            if mv > v {
                v = mv;
            }
        }
        cnum[nd] = f32r(v);
    }
    let mut climb_cost = vec![0f64; g.to.len()];
    for &nd in &g.nodes {
        for e in g.start[nd]..g.start[nd + 1] {
            climb_cost[e] = f32r((0i32).max(runs.ceil[nd] - runs.ceil[g.to[e]]) as f64 * k.c_vert);
        }
    }
    let cand = settle_ticks(
        &g,
        nn,
        |nd, last| {
            if cbarred[nd] {
                return 0.0;
            }
            let water = cnum[nd];
            let mut spread = 0.0f64;
            if water < k.c_max {
                for e in g.start[nd]..g.start[nd + 1] {
                    let v = f32r(f32r(last[g.to[e]] as f64 - climb_cost[e]) - if g.diag[e] { k.c_diag } else { k.c_reg });
                    if v > spread {
                        spread = v;
                    }
                }
            }
            let was = last[nd] as f64;
            let mut decayed = f32r(was - k.c_decay);
            if decayed < 0.0 {
                decayed = 0.0;
            }
            let v = if water > decayed && water >= spread {
                let cap = f32r(was + k.c_spread);
                if water > cap {
                    cap
                } else {
                    water
                }
            } else if spread > decayed {
                spread
            } else {
                decayed
            };
            v as f32
        },
        3000,
    );
    let mut soil_c = vec![0f64; nn];
    for i in 0..nn {
        soil_c[i] = if (cand[i] as f64) < k.c_threshold { 0.0 } else { cand[i] as f64 };
    }
    let mut mo: Vec<f64> = moisture.iter().map(|&v| v as f64).collect();
    mo.truncate(n);
    soil_c.truncate(n);
    Soil { moisture: mo, contamination: soil_c }
}
