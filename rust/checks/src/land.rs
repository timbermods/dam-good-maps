// The terrain principles' measures: edge walls (analysis/edges.ts) and dam walls (analysis/ridge.ts).

pub const EDGE_BAND: usize = 2;
pub const EDGE_INSIDE: usize = 3;
pub const EDGE_RISE: i32 = 2;
pub const EDGE_SHARE: f64 = 0.6;
pub const EDGE_NAMES: [&str; 4] = ["south", "north", "west", "east"];

pub struct EdgeWall {
    pub edge: usize,
    pub share: f64,
    pub at: (i64, i64),
}

pub fn edge_rule_applies(w: usize, h: usize) -> bool {
    let need = 2 * (EDGE_BAND + EDGE_INSIDE);
    w >= need && h >= need
}

/// The tile at position p along edge e, d tiles in from it.
pub fn edge_at(e: usize, p: usize, d: usize, w: usize, h: usize) -> (usize, usize) {
    match e {
        0 => (p, d),
        1 => (p, h - 1 - d),
        2 => (d, p),
        _ => (w - 1 - d, p),
    }
}

/// `edgeWalls`.
pub fn edge_walls(hgt: &[u8], w: usize, h: usize) -> Vec<EdgeWall> {
    let mut out = vec![];
    for e in 0..4 {
        let l = if e < 2 { w } else { h };
        let mut walled = 0usize;
        let mut run = 0usize;
        let mut best = 0usize;
        let mut best_end: i64 = -1;
        for p in 0..l {
            let mut band = 0;
            for d in 0..EDGE_BAND {
                let (x, y) = edge_at(e, p, d, w, h);
                band = band.max(hgt[y * w + x] as i32);
            }
            let mut inside = 0;
            for d in EDGE_BAND..EDGE_BAND + EDGE_INSIDE {
                let (x, y) = edge_at(e, p, d, w, h);
                inside = inside.max(hgt[y * w + x] as i32);
            }
            if band - inside >= EDGE_RISE {
                walled += 1;
                run += 1;
                if run > best {
                    best = run;
                    best_end = p as i64;
                }
            } else {
                run = 0;
            }
        }
        let mid = if best_end >= 0 { best_end as usize - (best >> 1) } else { l >> 1 };
        let (x, y) = edge_at(e, mid, 0, w, h);
        out.push(EdgeWall { edge: e, share: walled as f64 / l as f64, at: (x as i64, y as i64) });
    }
    out
}

const C22: f64 = 0.9238795325112867;
const S22: f64 = 0.3826834323650898;
const R2: f64 = std::f64::consts::FRAC_1_SQRT_2;
const LINES: [(f64, f64); 8] = [(1.0, 0.0), (C22, S22), (R2, R2), (S22, C22), (0.0, 1.0), (-S22, C22), (-R2, R2), (-C22, S22)];

pub struct Wall {
    pub x: i64,
    pub y: i64,
    pub crest: f64,
    pub floor: f64,
}

#[derive(Clone, Copy)]
struct Probe {
    ok: bool,
    crest: f64,
    floor_a: f64,
    floor_b: f64,
    thick: f64,
    dry: bool,
}

const BAD: Probe = Probe { ok: false, crest: 0.0, floor_a: 0.0, floor_b: 0.0, thick: 0.0, dry: false };

fn med(v: &[f64]) -> f64 {
    let mut s = v.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    s[v.len() >> 1]
}

/// `damWalls`.
pub fn dam_walls(hgt: &[u8], w: usize, h: usize, depth: &[f64]) -> Vec<Wall> {
    let n = w * h;
    let at = |x: f64, y: f64| -> i64 {
        let xi = portable::round(x);
        let yi = portable::round(y);
        if xi < 0.0 || yi < 0.0 || xi >= w as f64 || yi >= h as f64 {
            -1
        } else {
            yi as i64 * w as i64 + xi as i64
        }
    };
    let hv = |j: i64| hgt[j as usize] as f64;
    let probe = |px: f64, py: f64, nx: f64, ny: f64| -> Probe {
        let c = at(px, py);
        if c < 0 || depth[c as usize] > 0.05 {
            return BAD;
        }
        let crest = hv(c);
        let mut floors = [0.0; 2];
        let mut dry = false;
        let mut wet_face = false;
        for (side, sgn) in [1.0f64, -1.0].into_iter().enumerate() {
            let mut f = f64::INFINITY;
            for m in 4..=7 {
                let mm = sgn * m as f64;
                let j = at(px + mm * nx, py + mm * ny);
                if j < 0 {
                    return BAD;
                }
                if hv(j) < f {
                    f = hv(j);
                }
                if depth[j as usize] > 0.05 {
                    wet_face = true;
                }
            }
            if !wet_face {
                dry = true;
            }
            wet_face = false;
            if crest < f + 2.0 || crest > f + 6.0 {
                return BAD;
            }
            let mut face = false;
            let mut m = 0;
            while m <= 5 && !face {
                let ma = sgn * m as f64;
                let mb = sgn * (m + 1) as f64;
                let a = at(px + ma * nx, py + ma * ny);
                let b = at(px + mb * nx, py + mb * ny);
                if a < 0 || b < 0 {
                    return BAD;
                }
                if hv(a) >= crest - 1.0 && hv(a) - hv(b) >= 2.0 {
                    face = true;
                }
                m += 1;
            }
            if !face {
                return BAD;
            }
            floors[side] = f;
        }
        let mut thick = 1.0;
        for sgn in [1.0f64, -1.0] {
            for m in 1..=8 {
                let mm = sgn * m as f64;
                let j = at(px + mm * nx, py + mm * ny);
                if j < 0 || hv(j) < crest - 1.0 {
                    break;
                }
                thick += 1.0;
            }
        }
        if !(2.0..=8.0).contains(&thick) {
            return BAD;
        }
        Probe { ok: true, crest, floor_a: floors[0], floor_b: floors[1], thick, dry }
    };
    let mut found: Vec<Wall> = vec![];
    for i in 0..n {
        if !(depth[i] > 0.05) {
            continue;
        }
        let cx = (i % w) as i64;
        let cy = (i / w) as i64;
        if found.iter().any(|q| (q.x - cx).abs() + (q.y - cy).abs() <= 12) {
            continue;
        }
        for &(tx, ty) in LINES.iter() {
            let nx = -ty;
            let ny = tx;
            let mut sides: Vec<Vec<Probe>> = vec![];
            for sgn in [1.0f64, -1.0] {
                let mut pts = vec![];
                let mut started = false;
                let mut miss = 0;
                for k in 1..=40 {
                    let kk = sgn * k as f64;
                    let p = probe(cx as f64 + kk * tx, cy as f64 + kk * ty, nx, ny);
                    if p.ok {
                        started = true;
                        miss = 0;
                        pts.push(p);
                    } else if !started {
                        if k > 8 {
                            break;
                        }
                    } else {
                        miss += 1;
                        if miss > 1 {
                            break;
                        }
                    }
                }
                let short = pts.len() < 6;
                sides.push(pts);
                if short {
                    break;
                }
            }
            if sides[0].len() < 6 || sides[1].len() < 6 {
                continue;
            }
            let all: Vec<Probe> = sides[0].iter().chain(sides[1].iter()).copied().collect();
            let crests: Vec<f64> = all.iter().map(|p| p.crest).collect();
            let cmax = crests.iter().cloned().fold(f64::NEG_INFINITY, portable::max);
            let cmin = crests.iter().cloned().fold(f64::INFINITY, portable::min);
            if cmax - cmin > 1.0 {
                continue;
            }
            let fa = med(&all.iter().map(|p| p.floor_a).collect::<Vec<_>>());
            let fb = med(&all.iter().map(|p| p.floor_b).collect::<Vec<_>>());
            if (fa - fb).abs() > 1.0 {
                continue;
            }
            let tmax = all.iter().map(|p| p.thick).fold(f64::NEG_INFINITY, portable::max);
            let tmin = all.iter().map(|p| p.thick).fold(f64::INFINITY, portable::min);
            if tmax - tmin > 3.0 {
                continue;
            }
            if (all.iter().filter(|p| p.dry).count() as f64) < 0.75 * all.len() as f64 {
                continue;
            }
            found.push(Wall { x: cx, y: cy, crest: med(&crests), floor: portable::min(fa, fb) });
            break;
        }
    }
    found
}
