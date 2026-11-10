// Roll (the showcase round's "ground with grade", 2026-11-10): the land under the gesture rolls in
// one-level steps. Built directly in Rust (D438, D444).
//
// Soil creep and slumping, sped up: tabletops break into swells and hollows, and cliffs slump into graded
// flanks, so the ground a beaver walks rises and falls a level at a time. Two parts, one result:
// - the swells: a smooth noise field (the seed's; Try another changes it) raises and lowers the ground,
//   a level at Power 0 and up to four at 100, its hills about a third of the gesture's width across;
// - the grade: the swelled ground is brought to the nearest land that never steps more than one level
//   between neighbours, the mean of its two one-level envelopes (the highest land under it and the lowest
//   over it), so a cliff's top slumps back as its foot builds out, a tall cliff becoming a long flank.
// The change fades out over the band's outer third, so the edge meets the land round it without a seam.
//
// Left as they are (D257's physics, the absolutes): water and the ground beside it, so no bank drops under a
// river's surface and no new ground stands in its course; the ground the core keeps (the layer showing, caves
// and the ground holding their roofs, outside a working area); ground under the Floor; the map's ceiling.
// Objects ride their ground (an object of more than one tile whole, or not at all: rift.rs `keep_footprints`).
// A gesture over water and its banks only leaves nothing to roll and says so.
//
// The showing: each tile moves when the gesture's sweep reaches it (`arrival`), from the stroke's start
// to its end, a click outward from its middle.
use super::*;
use super::erode::distance2;
use super::rift::{keep_footprints, result, ride};

pub(super) struct RollRecords {
    pub arrival: Vec<f32>,
    // changed, raised, lowered, the most raised, the most lowered, width, cliffs graded
    pub stats: [f64; 7],
}
impl RollRecords {
    pub fn value(&self) -> V {
        let s = &self.stats;
        json!({"arrival":self.arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),
            "stats":{"changed":s[0],"raised":s[1],"lowered":s[2],"rise":s[3],"drop":s[4],"width":s[5],"graded":s[6]},"total":20})
    }
}

/// Width across on Auto: what Power gives, in tiles (core/forces/roll.ts `rollWidth`).
pub(super) fn auto_width(power: f64) -> f64 {
    14.0 + 0.3 * clamp(power, 0.0, 100.0)
}

/// Smooth value noise in [-1, 1], `cell` tiles a lattice step, two octaves.
fn swell(seed: f64, x: f64, y: f64, cell: f64) -> f64 {
    let mut out = 0.0;
    let mut amp = 1.0;
    let mut total = 0.0;
    let mut c = cell;
    for o in 0..2 {
        let fx = x / c;
        let fy = y / c;
        let ix = fx.floor();
        let iy = fy.floor();
        let tx = smooth(fx - ix);
        let ty = smooth(fy - iy);
        let at = |a: f64, b: f64| hash(seed + o as f64 * 7919.0, a * 7331.0 + b * 104_729.0 + 17.0) * 2.0 - 1.0;
        let a = at(ix, iy) + (at(ix + 1.0, iy) - at(ix, iy)) * tx;
        let b = at(ix, iy + 1.0) + (at(ix + 1.0, iy + 1.0) - at(ix, iy + 1.0)) * tx;
        out += amp * (a + (b - a) * ty);
        total += amp;
        amp *= 0.5;
        c = max(3.0, c * 0.5);
    }
    out / total
}

/// The one-level envelopes of `t` (4-neighbour steps): the highest land at or under it (`lo` false) or the
/// lowest at or over it (`lo` true) that never steps more than one level; `free` tiles move, the rest hold.
fn envelope(w: usize, h: usize, t: &[f64], free: &[bool], over: bool) -> Vec<f64> {
    let mut e = t.to_vec();
    let s = if over { -1.0 } else { 1.0 };
    for _ in 0..64 {
        let mut moved = false;
        let mut pass = |i: usize, j: usize, e: &mut Vec<f64>| {
            if free[j] && s * (e[j] - (e[i] + s)) > 0.0 {
                e[j] = e[i] + s;
                moved = true;
            }
        };
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                if x + 1 < w { pass(i, i + 1, &mut e); }
                if y + 1 < h { pass(i, i + w, &mut e); }
            }
        }
        for y in (0..h).rev() {
            for x in (0..w).rev() {
                let i = y * w + x;
                if x > 0 { pass(i, i - 1, &mut e); }
                if y > 0 { pass(i, i - w, &mut e); }
            }
        }
        if !moved { break; }
    }
    e
}

pub(super) fn plan(before: &Map, mut map: Map, s: &Settings, intent: &Intent, keep: &[u8], area_depth: &[u8]) -> Plan {
    let (w, h) = (map.w, map.h);
    let n = w * h;
    let width = s.size.unwrap_or(auto_width(s.power));
    let reach = width * 0.5;
    let path: Vec<Point> = intent.path.iter().map(|p| Point { x: clamp(p.x, 0.0, w as f64 - 1.0), y: clamp(p.y, 0.0, h as f64 - 1.0) }).collect();
    let mut length = 0.0;
    for p in path.windows(2) { length += hypot(p[1].x - p[0].x, p[1].y - p[0].y); }
    let floor = s.floor.unwrap_or(1.0);
    let ceiling = map.ceiling;
    let amp = 1.2 + 0.029 * clamp(s.power, 0.0, 100.0);
    let cell = max(5.0, width / 3.0);
    // the band's box, and each tile's weight in it (1 inside, fading over the outer third)
    let (mut x0, mut y0, mut x1, mut y1) = (w as f64, h as f64, 0.0f64, 0.0f64);
    for p in &path { x0 = min(x0, p.x); y0 = min(y0, p.y); x1 = max(x1, p.x); y1 = max(y1, p.y); }
    let bx0 = max(0.0, (x0 - reach - 1.0).floor()) as usize;
    let by0 = max(0.0, (y0 - reach - 1.0).floor()) as usize;
    let bx1 = min(w as f64 - 1.0, (x1 + reach + 1.0).ceil()) as usize;
    let by1 = min(h as f64 - 1.0, (y1 + reach + 1.0).ceil()) as usize;
    let mut weight = vec![0.0f64; n];
    let mut held = vec![true; n];
    let wet = |i: usize| before.depth.get(i).copied().unwrap_or(0.0) > 0.02;
    let caved = |i: usize| before.masks.len() == n && before.masks[i] != mask(before.heights[i]);
    let mut banks = 0usize;
    for y in by0..=by1 {
        for x in bx0..=bx1 {
            let i = y * w + x;
            let d = portable_math::sqrt(distance2(&path, x as f64, y as f64));
            if d >= reach { continue; }
            weight[i] = smooth((reach - d) / max(1.0, reach / 3.0));
            if keep.get(i).copied().unwrap_or(0) != 0 || caved(i) || x == 0 || y == 0 || x == w - 1 || y == h - 1 { continue; }
            // water, and the ground beside it, hold
            let mut near = wet(i);
            for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let (xx, yy) = (x as i32 + dx, y as i32 + dy);
                if xx >= 0 && yy >= 0 && (xx as usize) < w && (yy as usize) < h && wet(yy as usize * w + xx as usize) { near = true; }
            }
            if near { banks += 1; continue; }
            held[i] = false;
        }
    }
    // the swells, their highest brought to `amp` so a small gesture at Power 0 still moves the ground a level
    let sw: Vec<f64> = (0..n).map(|i| if held[i] { 0.0 } else { weight[i] * swell(s.seed, (i % w) as f64, (i / w) as f64, cell) }).collect();
    let peak = sw.iter().fold(0.0f64, |a, &v| max(a, v.abs()));
    let gain = if peak > 1e-9 { amp / peak } else { 0.0 };
    // the swelled land, then its two one-level envelopes (held tiles anchor them)
    let t: Vec<f64> = (0..n).map(|i| before.heights[i] as f64 + gain * sw[i]).collect();
    let free: Vec<bool> = held.iter().map(|&k| !k).collect();
    let under = envelope(w, h, &t, &free, false);
    let over = envelope(w, h, &t, &free, true);
    let mut arrival = vec![2.0f32; n];
    let mut stats = [0.0f64; 7];
    stats[5] = width;
    for i in 0..n {
        if held[i] { continue; }
        let b = before.heights[i] as f64;
        let graded = (under[i] + over[i]) * 0.5;
        let mut v = round(b + weight[i] * (graded - b));
        v = clamp(v, min(b, floor), max(b, ceiling));
        if v < b { v = max(v, b - area_depth.get(i).copied().unwrap_or(255) as f64); }
        let v = v as u8;
        let hb = before.heights[i];
        if v == hb { continue; }
        map.heights[i] = v;
        // rock beds: a cut takes the top ones, built ground is soft
        map.lava[i] = before.lava[i] & mask(v.min(hb));
        stats[0] += 1.0;
        if v > hb { stats[1] += 1.0; stats[3] = max(stats[3], (v - hb) as f64); } else { stats[2] += 1.0; stats[4] = max(stats[4], (hb - v) as f64); }
    }
    // the cliffs it graded: steps of two or more it left as one
    for y in by0..=by1 {
        for x in bx0..=bx1 {
            let i = y * w + x;
            if x + 1 <= bx1 && (before.heights[i] as i32 - before.heights[i + 1] as i32).abs() >= 2 && (map.heights[i] as i32 - map.heights[i + 1] as i32).abs() <= 1 { stats[6] += 1.0; }
            if y + 1 <= by1 && (before.heights[i] as i32 - before.heights[i + w] as i32).abs() >= 2 && (map.heights[i] as i32 - map.heights[i + w] as i32).abs() <= 1 { stats[6] += 1.0; }
        }
    }
    keep_footprints(before, &mut map);
    for i in 0..n {
        if map.heights[i] == before.heights[i] { continue; }
        let (x, y) = ((i % w) as f64, (i / w) as f64);
        // along the stroke from its start, a click outward from its middle
        let along = if path.len() > 1 && length > 0.0 {
            let mut best = f64::INFINITY;
            let mut at = 0.0;
            let mut run = 0.0;
            for p in path.windows(2) {
                let (dx, dy) = (p[1].x - p[0].x, p[1].y - p[0].y);
                let l = hypot(dx, dy);
                let u = if l > 0.0 { clamp(((x - p[0].x) * dx + (y - p[0].y) * dy) / (l * l), 0.0, 1.0) } else { 0.0 };
                let d = hypot(x - p[0].x - u * dx, y - p[0].y - u * dy);
                if d < best { best = d; at = run + u * l; }
                run += l;
            }
            at / length
        } else {
            portable_math::sqrt(distance2(&path, x, y)) / max(1.0, reach)
        };
        arrival[i] = clamp(0.04 + 0.7 * along + 0.06 * hash(s.seed, i as f64 + 31.0), 0.04, 0.85) as f32;
    }
    // (what keep_footprints put back is no change)
    stats[0] = (0..n).filter(|&i| map.heights[i] != before.heights[i]).count() as f64;
    if stats[0] == 0.0 {
        // (water and its banks only, or ground the Floor, the working area or the core holds)
        map.error = if banks > 0 && free.iter().all(|&f| !f) { 44 } else { 43 };
    }
    ride(before, &mut map);
    result(map, Records::Roll(Box::new(RollRecords { arrival, stats })))
}
