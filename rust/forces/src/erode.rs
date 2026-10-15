// Erode (D281; ROADMAP "Terrain above terrain", 3. Creating them): wind and water wear rock. Built
// directly in Rust (D438, D444); behaviour reference: investigation/erode (its report's "The choices").
//
// One rule set, and the land decides the form (D257, D258): there is no cave, overhang or arch mode.
// Every solid voxel with open air beside it gathers wear, step by step, from each open side:
// - more near the foot of the face the air stands on (sand-laden wind and splash wear hardest near the
//   ground): a cliff's foot hollows into a cave or an alcove;
// - more just under a hard bed (seepage along the contact): hard rock capping softer rock is left as a
//   lip, an overhang;
// - from both sides at once where a ridge is thin: it opens right through, an arch;
// - hard rock (the map's beds, fresh volcanic rock) wears at a ninth of the rate.
// Wear starts only at faces the gesture touched (Size sets how wide along them), and reaches into the
// rock as far as Power lets it. A voxel goes when its wear passes its own resistance (noise from the
// seed: Try another changes the seams). Only rock under a roof wears: every tile keeps its top two
// blocks (or its top one, when that is hard), so the map's surface and every object on it stay where they are,
// and nothing wears next to water at its level (the hollow would fill: the editor's water is the
// heightfield's), under a water source's ground (a source stands on its tile's lowest run) or on the
// map's edge tiles.
//
// Held, not dropped (the game's support rule, terrain/support.ts): after the wear, where a roof would
// hang more than 3 tiles from support, the rock that wore least under it comes back as a pillar down to
// the floor; nothing the game would delete is ever left. Where no face can wear (flat ground, low
// steps), water and wind scour the ground instead: a shallow hollow round the gesture, deeper with Power
// (D356: a force always has a visible effect).
//
// A gesture's points are in tiles, a tile's centre at its whole coordinates (as every force's).
//
// The showing: the worn voxels in 24 buckets, in the order they wore (the face first, then deeper), a
// voxel that would hang at the end of a bucket going in that bucket, so no frame shows ground the game
// would drop (adding rock never takes support away).
use super::*;

pub(super) const BUCKETS: usize = 24;
/// The game's layers (22 + 1); the top one stays empty.
const Z: usize = 23;
/// How far terrain support reaches sideways in a layer.
const REACH: u8 = 3;
/// Wear from one open side, by how high above the ground beside it the voxel stands.
const FOOT: [f64; 6] = [1.6, 1.25, 1.0, 0.8, 0.65, 0.5];
/// A step's wear from one open side, at the foot of the face, before the rest of its weights.
const RATE: f64 = 0.6;

pub(super) struct ErodeRecords {
    /// Tiles whose voxels changed (ascending), and each one's voxels now (bit z: voxel z solid).
    pub tiles: Vec<u32>,
    pub masks: Vec<u32>,
    /// The voxels it took (z·N + tile), in the order they are shown, and the bucket each goes in.
    pub cells: Vec<u32>,
    pub buckets: Vec<u8>,
    // worn, held (put back to hold a roof), scoured tiles, focus x, y, z, size across, depth reached
    pub stats: [f64; 8],
}
impl ErodeRecords {
    pub fn value(&self) -> V {
        let s = &self.stats;
        json!({"tiles":self.tiles,"masks":self.masks,"cells":self.cells,"buckets":self.buckets,
            "stats":{"worn":s[0],"held":s[1],"scoured":s[2],"x":s[3],"y":s[4],"z":s[5],"size":s[6],"depth":s[7]},"total":BUCKETS})
    }
}

/// Size across on Auto: what Power gives, in tiles (core/forces/erode.ts `erodeSize`).
pub(super) fn auto_size(power: f64) -> f64 {
    6.0 + 0.14 * clamp(power, 0.0, 100.0)
}

/// The map's voxels, a mask per tile: its own when given, else its heightfield.
pub(super) fn masks_of(m: &Map) -> Vec<u32> {
    if m.masks.len() == m.w * m.h {
        m.masks.clone()
    } else {
        m.heights.iter().map(|&h| mask(h)).collect()
    }
}

/// The larger of two weights (never the native float max: the guard forbids it).
fn fmax32(a: f32, b: f32) -> f32 {
    if b > a {
        b
    } else {
        a
    }
}
fn surface(m: u32) -> usize {
    32 - m.leading_zeros() as usize
}
fn plain(m: u32) -> bool {
    m & m.wrapping_add(1) == 0
}
fn lattice(seed: f64, x: i64, y: i64, z: i64, salt: u32) -> f64 {
    let k = (x as u32).wrapping_mul(73856093) ^ (y as u32).wrapping_mul(19349663) ^ (z as u32).wrapping_mul(83492791) ^ salt;
    hash(seed, (k & 0x7fff_ffff) as f64)
}
/// Smooth value noise, 0–1, `scale` tiles a cell.
fn noise3(seed: f64, x: f64, y: f64, z: f64, scale: f64, salt: u32) -> f64 {
    let (fx, fy, fz) = (x / scale, y / scale, z / scale);
    let (x0, y0, z0) = (fx.floor(), fy.floor(), fz.floor());
    let (tx, ty, tz) = (smooth(fx - x0), smooth(fy - y0), smooth(fz - z0));
    let (ix, iy, iz) = (x0 as i64, y0 as i64, z0 as i64);
    let l = |a: i64, b: i64, c: i64| lattice(seed, ix + a, iy + b, iz + c, salt);
    let lerp = |a: f64, b: f64, t: f64| a + (b - a) * t;
    let c00 = lerp(l(0, 0, 0), l(1, 0, 0), tx);
    let c10 = lerp(l(0, 1, 0), l(1, 1, 0), tx);
    let c01 = lerp(l(0, 0, 1), l(1, 0, 1), tx);
    let c11 = lerp(l(0, 1, 1), l(1, 1, 1), tx);
    lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz)
}

/// Solid voxels the game deletes (the support rule, terrain/support.ts `unsupportedVoxels` without
/// objects' stackable tops, so only ever stricter): by cell (z·N + tile), 1 where it falls.
pub(super) fn unsupported(t: &[u32], w: usize, h: usize) -> Vec<u8> {
    let n = w * h;
    let all = (1u32 << Z) - 1;
    let mut out = vec![0u8; Z * n];
    let mut upper = vec![0u32; n];
    let mut any = false;
    for i in 0..n {
        let m = t[i] & all;
        let u = m & !(m & !(m.wrapping_add(1)));
        upper[i] = u;
        any |= u != 0;
    }
    if !any {
        return out;
    }
    let is_upper = |i: usize, z: usize| upper[i] & (1 << z) != 0;
    let mut best = vec![99u8; Z * n];
    let mut queue: Vec<usize> = vec![];
    let reach = |best: &mut Vec<u8>, queue: &mut Vec<usize>, v: usize, s: u8| {
        if best[v] > s {
            best[v] = s;
            queue.push(v);
        }
    };
    for i in 0..n {
        let u = upper[i];
        if u == 0 {
            continue;
        }
        let x = i % w;
        let y = i / w;
        for z in 0..Z {
            let bit = 1u32 << z;
            if u & bit == 0 {
                continue;
            }
            let side = |j: usize| t[j] & bit != 0 && !is_upper(j, z);
            if (x > 0 && side(i - 1)) || (x + 1 < w && side(i + 1)) || (y > 0 && side(i - w)) || (y + 1 < h && side(i + w)) {
                reach(&mut best, &mut queue, z * n + i, 1);
            }
        }
    }
    let mut head = 0;
    while head < queue.len() {
        let v = queue[head];
        head += 1;
        let s = best[v];
        let z = v / n;
        let i = v - z * n;
        let x = i % w;
        let y = i / w;
        if z + 1 < Z && is_upper(i, z + 1) {
            reach(&mut best, &mut queue, v + n, 0);
        }
        if s < REACH {
            if x > 0 && is_upper(i - 1, z) {
                reach(&mut best, &mut queue, v - 1, s + 1);
            }
            if x + 1 < w && is_upper(i + 1, z) {
                reach(&mut best, &mut queue, v + 1, s + 1);
            }
            if y > 0 && is_upper(i - w, z) {
                reach(&mut best, &mut queue, v - w, s + 1);
            }
            if y + 1 < h && is_upper(i + w, z) {
                reach(&mut best, &mut queue, v + w, s + 1);
            }
        }
    }
    for i in 0..n {
        let u = upper[i];
        if u == 0 {
            continue;
        }
        for z in 0..Z {
            if u & (1 << z) != 0 && best[z * n + i] == 99 {
                out[z * n + i] = 1;
            }
        }
    }
    out
}

/// The squared distance from (x, y) to the gesture: its one point, or its polyline.
fn distance2(path: &[Point], x: f64, y: f64) -> f64 {
    if path.len() == 1 {
        let (dx, dy) = (x - path[0].x, y - path[0].y);
        return dx * dx + dy * dy;
    }
    let mut best = f64::INFINITY;
    for s in path.windows(2) {
        let (a, b) = (s[0], s[1]);
        let (dx, dy) = (b.x - a.x, b.y - a.y);
        let l = dx * dx + dy * dy;
        let t = if l > 0.0 { clamp(((x - a.x) * dx + (y - a.y) * dy) / l, 0.0, 1.0) } else { 0.0 };
        let (ex, ey) = (x - a.x - t * dx, y - a.y - t * dy);
        let d = ex * ex + ey * ey;
        if d < best {
            best = d;
        }
    }
    best
}

pub(super) fn plan(before: &Map, mut map: Map, s: &Settings, intent: &Intent, keep: &[u8], area_depth: &[u8]) -> Plan {
    let (w, h) = (map.w, map.h);
    let n = w * h;
    let power = clamp(s.power, 0.0, 100.0) / 100.0;
    let size = s.size.unwrap_or_else(|| auto_size(s.power));
    let r = size * 0.5;
    let depth = 1.5 + 8.5 * power;
    let hmax = (1.0 + round(4.0 * power)) as usize;
    let floor_cut = (s.floor.unwrap_or(1.0) as usize).max(1);
    let seed = s.seed;
    let steps = (2.0 * depth).ceil() as usize + 3;
    let orig = masks_of(before);
    let mut t = orig.clone();
    let hard = |i: usize, z: usize| (before.lava[i] >> z) & 1 != 0 || before.rock.get(z).copied().unwrap_or(0.0) > 0.5;
    // the ground no wear reaches: kept tiles, outside the working area, the map's edge, a source's own
    let mut fixed = vec![false; n];
    // (no hollow on the map's edge tiles: their outer face is the map's end)
    let mut edge = vec![false; n];
    for i in 0..n {
        let (x, y) = (i % w, i / w);
        fixed[i] = keep.get(i).copied().unwrap_or(0) != 0 || area_depth.get(i).copied().unwrap_or(255) == 0;
        edge[i] = x == 0 || y == 0 || x + 1 == w || y + 1 == h;
    }
    for e in &before.entities {
        if emitter(&e.template) {
            for j in before.footprint(e, 0) {
                fixed[j] = true;
            }
        }
    }
    // the gesture, on the map
    let mut path: Vec<Point> = intent.path.iter().map(|p| Point { x: clamp(p.x, 0.0, w as f64 - 1.0), y: clamp(p.y, 0.0, h as f64 - 1.0) }).collect();
    let solid = |t: &[u32], i: usize, z: usize| z < Z && (t[i] >> z) & 1 != 0;
    let wet_beside = |t: &[u32], i: usize, z: usize| {
        let (x, y) = (i % w, i / w);
        let mut wet = false;
        for (ok, j) in [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)] {
            if ok && !solid(t, j, z) && (before.heights[j] as usize) <= z && before.heights[j] as f64 + before.depth[j] > z as f64 + 0.02 {
                wet = true;
            }
        }
        wet
    };
    // a voxel the wind and water may take: under a roof, above the Floor, away from water at its level
    let wearable = |t: &[u32], i: usize, z: usize| {
        let top = surface(orig[i]);
        !fixed[i] && !edge[i] && z >= floor_cut && (z + 2 < top || (z + 2 == top && hard(i, top - 1))) && solid(t, i, z) && !wet_beside(t, i, z)
    };
    let air_below = |t: &[u32], j: usize, z: usize| {
        let mut a = 0;
        while a < z && !solid(t, j, z - a - 1) {
            a += 1;
        }
        a
    };
    // how far the gesture's weight reaches: 1 within about half its Size, none beyond it
    let weight = |d: f64| smooth((r - d) / max(0.5, 0.45 * r));
    // a click on open ground reaches for the nearest face it can wear, a few tiles away
    let length: f64 = path.windows(2).map(|p| hypot(p[1].x - p[0].x, p[1].y - p[0].y)).sum();
    let exposed = |i: usize| {
        let (x, y) = (i % w, i / w);
        (1..surface(orig[i]).min(Z)).any(|z| {
            wearable(&orig, i, z)
                && [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)]
                    .iter()
                    .any(|&(ok, j)| ok && !solid(&orig, j, z) && air_below(&orig, j, z) <= hmax)
        })
    };
    if length < 1.5 {
        let p = path[0];
        let (px, py) = (round(p.x) as i64, round(p.y) as i64);
        let near = |rad: i64, best: &mut Option<(f64, usize)>| {
            for y in (py - rad).max(0)..=(py + rad).min(h as i64 - 1) {
                for x in (px - rad).max(0)..=(px + rad).min(w as i64 - 1) {
                    let i = y as usize * w + x as usize;
                    let (dx, dy) = (x as f64 - p.x, y as f64 - p.y);
                    let d = dx * dx + dy * dy;
                    if d <= (rad * rad) as f64 && best.map_or(true, |b| d < b.0) && exposed(i) {
                        *best = Some((d, i));
                    }
                }
            }
        };
        let mut here = None;
        near(r.ceil() as i64, &mut here);
        if here.is_none() {
            let mut far = None;
            near(10, &mut far);
            if let Some((_, i)) = far {
                path = vec![Point { x: (i % w) as f64, y: (i / w) as f64 }];
            }
        }
    }
    // the tiles it can reach: within its Size and the depth Power gives of the gesture
    let tile_d = |i: usize| portable_math::sqrt(distance2(&path, (i % w) as f64, (i / w) as f64));
    let (mut x0, mut y0, mut x1, mut y1) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    for p in &path {
        x0 = min(x0, p.x);
        y0 = min(y0, p.y);
        x1 = max(x1, p.x);
        y1 = max(y1, p.y);
    }
    let margin = r + depth + 2.0;
    let bx0 = max(0.0, (x0 - margin).floor()) as usize;
    let by0 = max(0.0, (y0 - margin).floor()) as usize;
    let bx1 = min(w as f64 - 1.0, (x1 + margin).ceil()) as usize;
    let by1 = min(h as f64 - 1.0, (y1 + margin).ceil()) as usize;
    let mut tiles: Vec<usize> = vec![];
    let mut dist = vec![f64::INFINITY; n];
    for y in by0..=by1 {
        for x in bx0..=bx1 {
            let i = y * w + x;
            let d = tile_d(i);
            if d <= margin {
                dist[i] = d;
                tiles.push(i);
            }
        }
    }
    // each air voxel's way in from the face (0 for the air that was there), the weight of the
    // gesture where that face met it and the ground at the face's foot (a hollow's height above it
    // is what the wind and splash read); each voxel's wear so far, and the step it went at
    let mut din = vec![255u8; Z * n];
    let mut gin = vec![0f32; Z * n];
    let mut fl = vec![0u8; Z * n];
    for &i in &tiles {
        for z in 0..Z {
            if !solid(&orig, i, z) {
                din[z * n + i] = 0;
                gin[z * n + i] = weight(dist[i]) as f32;
                fl[z * n + i] = (z - air_below(&orig, i, z)) as u8;
            }
        }
    }
    let mut acc = vec![0f32; Z * n];
    let mut went = vec![0u16; Z * n];
    let resistance = |i: usize, z: usize| {
        let (x, y) = ((i % w) as f64, (i / w) as f64);
        let grain = 0.6 * noise3(seed, x, y, z as f64, 2.3, 0x51) + 0.4 * lattice(seed, x as i64, y as i64, z as i64, 0x93);
        (if hard(i, z) { 9.0 } else { 1.0 }) * (0.6 + 0.8 * grain)
    };
    let limit = |i: usize, z: usize, g: f64| depth * portable_math::sqrt(g) * (0.8 + 0.4 * noise3(seed, (i % w) as f64, (i / w) as f64, z as f64, 3.1, 0x2d));
    let nbrs = |i: usize| {
        let (x, y) = (i % w, i / w);
        [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)]
    };
    // what wears this step, read from the land as it was when the step began
    let mut worn = 0usize;
    for step in 1..=steps {
        let mut go: Vec<(usize, u8, f32, u8)> = vec![];
        for &i in &tiles {
            if fixed[i] || edge[i] {
                continue;
            }
            let top = surface(t[i]).min(Z);
            for z in floor_cut..top {
                if !wearable(&t, i, z) {
                    continue;
                }
                let c = z * n + i;
                let mut sum = 0.0;
                let mut d_new = 255u8;
                let mut g_new = 0f32;
                let mut f_new = 255u8;
                for (ok, j) in nbrs(i) {
                    if !ok || solid(&t, j, z) {
                        continue;
                    }
                    let b = z * n + j;
                    let a = z.saturating_sub(fl[b] as usize);
                    if a > hmax || din[b] == 255 || gin[b] <= 0.0 {
                        continue;
                    }
                    d_new = d_new.min(din[b] + 1);
                    g_new = fmax32(g_new, gin[b]);
                    f_new = f_new.min(fl[b]);
                    sum += FOOT[a.min(5)];
                }
                // the roof of a hollow wears too, more slowly: its ceiling rises
                if z > 0 && !solid(&t, i, z - 1) {
                    let b = (z - 1) * n + i;
                    if din[b] != 255 && gin[b] > 0.0 && z.saturating_sub(fl[b] as usize) <= hmax {
                        d_new = d_new.min(din[b].max(1));
                        g_new = fmax32(g_new, gin[b]);
                        f_new = f_new.min(fl[b]);
                        sum += 0.35;
                    }
                }
                if sum == 0.0 {
                    continue;
                }
                let lim = limit(i, z, g_new as f64);
                if d_new as f64 > lim {
                    continue;
                }
                let cap = if hard(i, z + 1) { 1.8 } else if z + 2 < Z && hard(i, z + 2) { 1.3 } else { 1.0 };
                let deeper = portable_math::sqrt(max(0.0, 1.0 - (d_new as f64 - 1.0) / (lim + 1.0)));
                acc[c] += (RATE * sum * cap * g_new as f64 * (0.5 + 0.5 * deeper)) as f32;
                if acc[c] as f64 >= resistance(i, z) {
                    go.push((c, d_new, g_new, f_new));
                }
            }
        }
        for &(c, d, g, f) in &go {
            t[c % n] &= !(1u32 << (c / n));
            din[c] = d;
            gin[c] = g;
            fl[c] = f;
            went[c] = step as u16;
        }
        worn += go.len();
    }
    // a lone soft spike standing in the hollow, open on three sides or more, goes with it
    if worn > 0 {
        let mut spikes = vec![];
        for &i in &tiles {
            let top = surface(t[i]).min(Z);
            for z in floor_cut..top {
                if !wearable(&t, i, z) || hard(i, z) {
                    continue;
                }
                let mut open = 0;
                let (mut d, mut g, mut f) = (255u8, 0f32, 255u8);
                for (ok, j) in nbrs(i) {
                    let a = z * n + j;
                    if ok && !solid(&t, j, z) && din[a] != 255 && din[a] > 0 {
                        open += 1;
                        d = d.min(din[a] + 1);
                        g = fmax32(g, gin[a]);
                        f = f.min(fl[a]);
                    }
                }
                if open >= 3 && d as f64 <= limit(i, z, g as f64) + 1.0 {
                    spikes.push((z * n + i, d, g, f));
                }
            }
        }
        for (c, d, g, f) in spikes {
            t[c % n] &= !(1u32 << (c / n));
            din[c] = d;
            gin[c] = g;
            fl[c] = f;
            went[c] = steps as u16;
        }
    }
    let removed = |t: &[u32], i: usize, z: usize| (orig[i] >> z) & 1 != 0 && (t[i] >> z) & 1 == 0;
    let any_removed = |t: &[u32]| tiles.iter().any(|&i| t[i] != orig[i]);
    // where no face could wear (flat ground, low steps), the ground is scoured: a shallow hollow
    let mut scoured = 0usize;
    if !any_removed(&t) {
        for &i in &tiles {
            let d = dist[i];
            let ragged = r * (0.7 + 0.45 * noise3(seed, (i % w) as f64, (i / w) as f64, 0.0, 2.7, 0x7a));
            // (the tile under the gesture always: a click anywhere wears something, D356)
            if fixed[i] || !plain(orig[i]) || (d > ragged && d > 0.75) {
                continue;
            }
            let top = surface(orig[i]);
            if top <= floor_cut {
                continue;
            }
            let k = 1.0 + (power * 2.0 * portable_math::sqrt(max(0.0, 1.0 - d / max(0.5, ragged))) + 0.5 * lattice(seed, (i % w) as i64, (i / w) as i64, 0, 0x5c)).floor();
            let k = (clamp(k, 1.0, 3.0) as usize).min(area_depth.get(i).copied().unwrap_or(255) as usize);
            let low = top.saturating_sub(k).max(floor_cut);
            if low >= top {
                continue;
            }
            t[i] = mask(low as u8);
            for z in low..top {
                went[z * n + i] = (1.0 + d / max(0.5, r) * steps as f64).floor() as u16;
            }
            scoured += 1;
        }
    }
    // held, not dropped: what the game would delete that it kept before, a pillar at a time
    let was = unsupported(&orig, w, h);
    let fresh = |t: &[u32]| -> Vec<usize> {
        let u = unsupported(t, w, h);
        (0..u.len()).filter(|&c| u[c] != 0 && was[c] == 0).collect()
    };
    let restore = |t: &mut Vec<u32>, i: usize, mut z: usize| -> usize {
        let mut k = 0;
        loop {
            if !removed(t, i, z) {
                break;
            }
            t[i] |= 1 << z;
            k += 1;
            if z == 0 {
                break;
            }
            z -= 1;
        }
        k
    };
    let mut held = 0usize;
    loop {
        let u = fresh(&t);
        if u.is_empty() {
            break;
        }
        let zs = u.iter().map(|&c| c / n).min().unwrap();
        let loose: Vec<usize> = u.iter().filter(|&&c| c / n == zs).map(|&c| c % n).collect();
        let mut gain: HashMap<usize, f64> = HashMap::new();
        if zs > 0 {
            for &l in &loose {
                // the voxels of this layer within support's reach of the loose one, through rock
                let mut seen: Vec<(usize, u8)> = vec![(l, 0)];
                let mut k = 0;
                while k < seen.len() {
                    let (j, d) = seen[k];
                    k += 1;
                    if removed(&t, j, zs - 1) {
                        *gain.entry(j).or_insert(0.0) += 1.0;
                    }
                    if d == REACH {
                        continue;
                    }
                    for (ok, q) in nbrs(j) {
                        if ok && solid(&t, q, zs) && !seen.iter().any(|s| s.0 == q) {
                            seen.push((q, d + 1));
                        }
                    }
                }
            }
        }
        let mut best: Option<(f64, usize)> = None;
        let mut keys: Vec<_> = gain.keys().copied().collect();
        keys.sort_unstable();
        for c in keys {
            // the rock that wore least, set back from the open air, in the grain of the rock
            let b = (zs - 1) * n + c;
            let late = went[b] as f64 / steps as f64;
            let set_back = if din[b] <= 1 { 0.35 } else if din[b] == 2 { 0.75 } else { 1.0 };
            let score = gain[&c] * (0.7 + 0.6 * noise3(seed, (c % w) as f64, (c / w) as f64, 0.0, 2.0, 0x77)) * (1.0 + 0.5 * late) * set_back;
            if best.map_or(true, |b| score > b.0) {
                best = Some((score, c));
            }
        }
        let mut back = 0;
        if let Some((_, c)) = best {
            // a broad remnant: the pillar and the rock beside it on its grain's side, two by two
            back += restore(&mut t, c, zs - 1);
            let (cx, cy) = (c % w, c / w);
            let sx = if hash(seed, c as f64 + 0.5) < 0.5 { -1i64 } else { 1 };
            let sy = if hash(seed + 1.0, c as f64) < 0.5 { -1i64 } else { 1 };
            for (dx, dy) in [(sx, 0), (0, sy), (sx, sy)] {
                let (qx, qy) = (cx as i64 + dx, cy as i64 + dy);
                if qx < 0 || qy < 0 || qx >= w as i64 || qy >= h as i64 {
                    continue;
                }
                let q = qy as usize * w + qx as usize;
                if removed(&t, q, zs - 1) && solid(&t, q, zs) {
                    back += restore(&mut t, q, zs - 1);
                }
            }
        } else {

            // nothing under it to stand a pillar on: its own layer's rock beside it comes back
            for &l in &loose {
                for (ok, q) in nbrs(l) {
                    if ok && removed(&t, q, zs) {
                        back += restore(&mut t, q, zs);
                    }
                }
            }
        }
        if back == 0 {
            // (never met: the land as it was holds; the wear is taken back whole)
            t.clone_from(&orig);
            break;
        }
        held += back;
    }
    // the voxels it took, in the order they are shown
    let mut cells: Vec<u32> = vec![];
    for &i in &tiles {
        if t[i] == orig[i] {
            continue;
        }
        for z in 0..Z {
            if removed(&t, i, z) {
                cells.push((z * n + i) as u32);
            }
        }
    }
    if cells.is_empty() {
        map.error = 37;
        return rift::result(map, Records::Erode(Box::new(ErodeRecords { tiles: vec![], masks: vec![], cells: vec![], buckets: vec![], stats: [0.0; 8] })));
    }
    cells.sort_by(|&a, &b| {
        let (sa, sb) = (went[a as usize], went[b as usize]);
        sa.cmp(&sb).then_with(|| lattice(seed, a as i64, 0, 0, 0x3c).partial_cmp(&lattice(seed, b as i64, 0, 0, 0x3c)).unwrap()).then(a.cmp(&b))
    });
    let total = cells.len();
    let mut bucket: HashMap<u32, u8> = HashMap::new();
    for (k, &c) in cells.iter().enumerate() {
        bucket.insert(c, min((((k as f64 + 0.5) / total as f64) * BUCKETS as f64).floor(), BUCKETS as f64 - 1.0) as u8);
    }
    let mut show = orig.clone();
    for b in 0..BUCKETS as u8 {
        for &c in &cells {
            if bucket[&c] == b {
                show[c as usize % n] &= !(1u32 << (c as usize / n));
            }
        }
        loop {
            let u = fresh(&show);
            if u.is_empty() {
                break;
            }
            for c in u {
                // (only a voxel still to go can hang: the final land holds, and more rock holds more)
                let c32 = c as u32;
                if let Some(e) = bucket.get_mut(&c32) {
                    *e = b;
                }
                show[c % n] &= !(1u32 << (c / n));
            }
        }
    }
    cells.sort_by_key(|c| bucket[c]);
    let buckets: Vec<u8> = cells.iter().map(|c| bucket[c]).collect();
    // the map it leaves: the surface of each changed tile, its fresh rock where rock remains
    let mut changed: Vec<u32> = vec![];
    let mut masks: Vec<u32> = vec![];
    let (mut fx, mut fy, mut fz) = (0.0, 0.0, 0.0);
    for &c in &cells {
        let (i, z) = (c as usize % n, c as usize / n);
        fx += (i % w) as f64;
        fy += (i / w) as f64;
        fz += z as f64;
    }
    for i in 0..n {
        if t[i] != orig[i] {
            changed.push(i as u32);
            masks.push(t[i]);
            map.heights[i] = surface(t[i]) as u8;
            map.lava[i] &= t[i];
        }
    }
    if !map.masks.is_empty() {
        map.masks.clone_from(&t);
    }
    rift::ride(before, &mut map);
    let k = total as f64;
    let reached = (0..Z * n).filter(|&c| din[c] != 255).map(|c| din[c] as f64).fold(0.0, max);
    let stats = [k, held as f64, scoured as f64, fx / k, fy / k, round(fz / k), size, reached];
    rift::result(map, Records::Erode(Box::new(ErodeRecords { tiles: changed, masks, cells, buckets, stats })))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A map W × H from heights, with its rock beds and the given masks.
    fn map_of(w: usize, h: usize, heights: Vec<u8>, rock: Vec<f64>, masks: Vec<u32>) -> Map {
        let n = w * h;
        let mut v = json!({"W":w as f64,"H":h as f64,"maxHeight":22.0,"entities":[],"fallen":[]});
        v["heights"] = json!(heights.iter().map(|&x| x as f64).collect::<Vec<_>>());
        v["lava"] = json!(vec![0.0; n]);
        v["rockLayers"] = json!(rock);
        v["water"] = json!({"depth":vec![0.0; n],"contamination":vec![0.0; n]});
        if !masks.is_empty() {
            v["masks"] = json!(masks.iter().map(|&m| m as f64).collect::<Vec<_>>());
        }
        Map::from(&v, &json!({}))
    }
    fn settings(power: f64, seed: f64) -> Settings {
        Settings::from(&json!({"power":power,"seed":seed,"mode":"wear","floor":1.0}))
    }
    fn click(x: f64, y: f64) -> Intent {
        Intent { origin: 0.0, end: 0.0, side: 1.0, path: vec![Point { x, y }], via: vec![] }
    }
    /// A cliff: level 3 to the west of x = 20, level 12 east of it (rock soft, a hard bed at 9).
    fn cliff() -> Map {
        let (w, h) = (40, 40);
        let heights = (0..w * h).map(|i| if i % w < 20 { 3 } else { 12 }).collect();
        let mut rock = vec![0.0; 23];
        rock[9] = 1.0;
        map_of(w, h, heights, rock, vec![])
    }
    fn run(m: &Map, s: &Settings, intent: &Intent) -> Plan {
        let n = m.w * m.h;
        plan(m, m.clone(), s, intent, &vec![0; n], &vec![255; n])
    }
    fn final_masks(m: &Map, p: &Plan) -> Vec<u32> {
        let mut t = masks_of(m);
        if let Records::Erode(r) = &p.records {
            for (k, &i) in r.tiles.iter().enumerate() {
                t[i as usize] = r.masks[k];
            }
        }
        t
    }

    #[test]
    fn a_cliffs_foot_wears_a_cave_that_holds() {
        let m = cliff();
        for power in [0.0, 55.0, 100.0] {
            let p = run(&m, &settings(power, 1.0), &click(19.5, 20.5));
            assert_eq!(p.map.error, 0);
            let t = final_masks(&m, &p);
            let Records::Erode(r) = &p.records else { panic!() };
            assert!(r.cells.len() > 0, "power {power}: nothing worn");
            // under a roof: the surface stays, and something is hollow under it
            assert_eq!(p.map.heights, m.heights);
            assert!(r.tiles.iter().all(|&i| !plain(t[i as usize])));
            assert!(unsupported(&t, m.w, m.h).iter().all(|&u| u == 0), "power {power}: ground would fall");
        }
    }

    #[test]
    fn more_power_wears_deeper() {
        let m = cliff();
        let worn = |p: f64| match &run(&m, &settings(p, 3.0), &click(19.5, 20.5)).records {
            Records::Erode(r) => r.cells.len(),
            _ => 0,
        };
        assert!(worn(100.0) > worn(0.0));
    }

    #[test]
    fn try_another_changes_the_seams_and_the_same_seed_repeats() {
        let m = cliff();
        let a = final_masks(&m, &run(&m, &settings(70.0, 1.0), &click(19.5, 20.5)));
        let b = final_masks(&m, &run(&m, &settings(70.0, 2.0), &click(19.5, 20.5)));
        let c = final_masks(&m, &run(&m, &settings(70.0, 1.0), &click(19.5, 20.5)));
        assert_ne!(a, b);
        assert_eq!(a, c);
    }

    #[test]
    fn a_thin_ridge_opens_into_an_arch() {
        // a fin two tiles thick, 14 high, between two floors at level 2
        let (w, h) = (40, 40);
        let heights: Vec<u8> = (0..w * h).map(|i| if i % w == 20 || i % w == 21 { 14 } else { 2 }).collect();
        let m = map_of(w, h, heights, vec![0.0; 23], vec![]);
        let p = run(&m, &settings(80.0, 1.0), &Intent { origin: 0.0, end: 0.0, side: 1.0, path: vec![Point { x: 16.0, y: 20.5 }, Point { x: 25.0, y: 20.5 }], via: vec![] });
        let t = final_masks(&m, &p);
        // somewhere along the fin both of its tiles are open at the same level: light through it
        let through = (0..h).any(|y| (2..12).any(|z| (t[y * w + 20] >> z) & 1 == 0 && (t[y * w + 21] >> z) & 1 == 0));
        assert!(through, "the fin did not open through");
        assert!(unsupported(&t, w, h).iter().all(|&u| u == 0));
    }

    #[test]
    fn flat_ground_is_scoured() {
        let (w, h) = (32, 32);
        let m = map_of(w, h, vec![6; w * h], vec![0.0; 23], vec![]);
        let p = run(&m, &settings(0.0, 1.0), &click(16.0, 16.0));
        assert_eq!(p.map.error, 0);
        assert!(p.map.heights.iter().any(|&x| x < 6));
    }
}
