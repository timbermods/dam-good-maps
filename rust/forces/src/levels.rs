// Whole levels from a force's surface: the one last step for every force that shapes land.
//
// Timberborn's land is whole levels on a square grid. A force works out a real-valued surface (a
// bowl, a cone, a fan); rounding it tile by tile gives the faults every reviewer names: a smooth slope
// becomes a stair of even one-tile bands (contour rings round whatever the force made), and noise
// leaves one-tile pillars, pits and lone blocks. This stage takes the surface and gives the land:
//
//   let land = levels::whole(&surface, &ground, &before, w, h, ceiling, seed, grain);
//
// - `surface`: the force's surface at each tile, in levels; NaN where the force leaves the ground alone
//   (out of its reach, or ground it keeps: those tiles come back as `before`).
// - `ground`: what the surface stands on at each tile: the land, where the force adds to it or cuts
//   into it; the force's own level datum, where it replaces the land. The stage shapes what the
//   surface adds to this (the force's own slopes) and leaves the ground's own relief as it is: a
//   weak force on rough land changes it little.
// - `before`: the ground the force started from. `ceiling`: the highest level allowed.
// - `seed`, `grain`: the personality, and how broad the wander of the steps is, in tiles (about a
//   third of the feature's radius; at least 6).
//
// What it promises, on the tiles the force changed (and the unchanged tiles right beside them):
//
// 1. Quantized once, and a slope is plates. Each tile is rounded once, after a slow drift is added
//    (value noise `grain` tiles broad): at most 0.35 of a level on level ground, so a floor or a bench
//    the force put on a whole level stays on it everywhere. A slope three tiles wide or more (up to a
//    level a tile) is first cut into patches a few tiles across, smaller where it is steeper, each
//    the tiles nearest one of a scatter of points, and each patch is drawn most of the way to its own
//    mean height: a plate of its own size and shape, which ends against its neighbours in a step of
//    a level or two. So a step runs a patch's length and no further: no stair of even steps runs on
//    round a feature, whichever way the slope faces the grid. A narrow slope (a small hollow's wall)
//    and a steeper one keep their shape.
// 2. No band narrower than two tiles. Every tile lies in a two-by-two square of its own level, or is
//    a single tile on the side of one (a tooth on a plate's edge, where several levels meet; a band
//    the map's edge cuts can be one tile wide along the edge). Where
//    a slope is too steep for that (more than a level in two tiles), its one-tile steps join into
//    wider steps between higher walls: a steep slope is a cliff with ledges, never a stair. A cliff
//    the force made by intent (a jump in its surface) stays where it is, whole.
// 3. No one-tile pillar, pit, ridge, trench or lone block: the same rule, a pit or a trench filling to
//    the ground beside it.
//
// The land's own narrow ledges stay where the force changes the ground by a level or less: the tidying
// never drops a brink the force only brushed down its cliff.
//
// Ground the force did not change is never touched except right beside ground it did (a sliver left
// between the two would be a fault of the force). Integers, comparisons and the planner's own rounding
// only: the same bytes natively and in WebAssembly.
use super::*;

/// Value noise on the map, 0–1, `scale` tiles a cell.
pub(super) fn lumps(seed: f64, salt: u32, x: f64, y: f64, scale: f64) -> f64 {
    let (fx, fy) = (x / scale, y / scale);
    let (x0, y0) = (fx.floor(), fy.floor());
    let (tx, ty) = (smooth(fx - x0), smooth(fy - y0));
    let l = |a: i64, b: i64| {
        let k = ((x0 as i64 + a) as u32).wrapping_mul(73856093) ^ ((y0 as i64 + b) as u32).wrapping_mul(19349663) ^ salt;
        hash(seed, (k & 0x7fff_ffff) as f64)
    };
    let top = l(0, 0) + (l(1, 0) - l(0, 0)) * tx;
    let bottom = l(0, 1) + (l(1, 1) - l(0, 1)) * tx;
    top + (bottom - top) * ty
}

/// The land a force's surface gives (see the top of this file).
pub(super) fn whole(surface: &[f64], ground: &[f64], before: &[u8], w: usize, h: usize, ceiling: f64, seed: f64, grain: f64) -> Vec<u8> {
    let mut land = before.to_vec();
    let mut changed = vec![false; w * h];
    // The slopes' plates. A slope rounded tile by tile is a stair of even bands that run on round the
    // feature. Here it is cut into patches a few tiles across (smaller where it is steeper), each the
    // tiles nearest one of a scatter of points, so no two are alike and their sides run every way; each
    // patch is drawn most of the way to its own mean height: a plate, of its own size and shape, that
    // ends against its neighbours in a step of a level or two. A step runs a patch's length and no
    // further.
    let coarse = clamp(grain * 0.6, 5.0, 8.0);
    let fine = clamp(coarse * 0.55, 3.2, 4.5);
    let across = |patch: f64| ((w as f64 / patch) as usize + 3, (h as f64 / patch) as usize + 3);
    let (cw, ch) = across(coarse);
    let (fw, fh) = across(fine);
    // (the points: one in each square of a grid a patch wide, anywhere in it)
    let scatter = |patch: f64, wide: usize, high: usize, salt: f64| -> Vec<(f64, f64)> {
        (0..wide * high)
            .map(|k| {
                let (cx, cy) = ((k % wide) as f64 - 1.0, (k / wide) as f64 - 1.0);
                ((cx + hash(seed, salt + 2.0 * k as f64)) * patch, (cy + hash(seed, salt + 2.0 * k as f64 + 1.0)) * patch)
            })
            .collect()
    };
    let (coarse_points, fine_points) = (scatter(coarse, cw, ch, 5.0e6), scatter(fine, fw, fh, 9.0e6));
    let mut sums = vec![(0.0f64, 0.0f64); cw * ch + fw * fh];
    let mut patch_of = vec![u32::MAX; w * h];
    let mut slopes = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if surface[i].is_nan() {
                continue;
            }
            // (how much the force's own shape slopes here, what its surface adds to its ground: the
            // lesser of its two steps along each axis, so the foot and the brink of a cliff count as
            // the level ground they are)
            let here = surface[i] - ground[i];
            let at = |dx: i64, dy: i64| {
                let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                if nx < 0 || ny < 0 || nx >= w as i64 || ny >= h as i64 {
                    return here;
                }
                let j = ny as usize * w + nx as usize;
                if surface[j].is_nan() { 0.0 } else { surface[j] - ground[j] }
            };
            let slope = max(
                min((at(1, 0) - here).abs(), (here - at(-1, 0)).abs()),
                min((at(0, 1) - here).abs(), (here - at(0, -1)).abs()),
            );
            slopes[i] = slope as f32;
        }
    }
    // (a slope's plates are for a slope three tiles wide or more: a narrow one, the wall of a small
    // hollow or the side of a low mound, keeps its shape, so a tile counts as sloping as its least
    // sloping neighbour does)
    let broad = |x: usize, y: usize| {
        let mut least = slopes[y * w + x];
        for (dx, dy) in [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)] {
            let (nx, ny) = (x as i64 + dx, y as i64 + dy);
            if nx >= 0 && ny >= 0 && nx < w as i64 && ny < h as i64 {
                let beside = slopes[ny as usize * w + nx as usize];
                if beside < least {
                    least = beside;
                }
            }
        }
        smooth(least as f64 / 0.12)
    };
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if surface[i].is_nan() {
                continue;
            }
            let (here, slope) = (surface[i] - ground[i], slopes[i] as f64);
            let sloping = broad(x, y);
            if sloping > 0.0 {
                let (xf, yf) = (x as f64 + 0.5, y as f64 + 0.5);
                let (patch, points, base, wide, high) = if slope > 0.38 { (fine, &fine_points, cw * ch, fw, fh) } else { (coarse, &coarse_points, 0, cw, ch) };
                let (cx, cy) = ((xf / patch) as usize + 1, (yf / patch) as usize + 1);
                let mut near = (f64::INFINITY, 0);
                for ny in cy - 1..=(cy + 1).min(high - 1) {
                    for nx in cx - 1..=(cx + 1).min(wide - 1) {
                        let (qx, qy) = points[ny * wide + nx];
                        let d = (qx - xf) * (qx - xf) + (qy - yf) * (qy - yf);
                        if d < near.0 {
                            near = (d, ny * wide + nx);
                        }
                    }
                }
                let k = base + near.1;
                // (a cliff is no part of a plate: it counts for less the steeper it is)
                let share = sloping * (1.0 - smooth((slope - 0.7) / 0.6)) + 1e-6;
                sums[k].0 += here * share;
                sums[k].1 += share;
                patch_of[i] = k as u32;
            }
        }
    }
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if surface[i].is_nan() {
                continue;
            }
            let here = surface[i];
            let slope = slopes[i] as f64;
            let sloping = smooth(slope / 0.12);
            // (a surface on a whole level stays there: the drift moves steps, never floors)
            let mut target = here + (0.7 + 0.5 * sloping) * (lumps(seed, 3320, x as f64, y as f64, grain) - 0.5);
            if patch_of[i] != u32::MAX {
                // (a slope steeper than a level a tile keeps its shape: it is a cliff with ledges)
                let (sum, weight) = sums[patch_of[i] as usize];
                target += 0.85 * broad(x, y) * (1.0 - smooth((slope - 0.7) / 0.6)) * (sum / weight - (here - ground[i]));
            }
            land[i] = clamp(round(round(target * 4096.0) / 4096.0), 0.0, min(255.0, ceiling)) as u8;
            changed[i] = land[i] != before[i];
        }
    }
    // (the tiles it may tidy: the ones the force changed, and the force's own tiles right beside them)
    let mut free = vec![false; w * h];
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if !changed[i] {
                continue;
            }
            for ny in y.saturating_sub(1)..=(y + 1).min(h - 1) {
                for nx in x.saturating_sub(1)..=(x + 1).min(w - 1) {
                    let j = ny * w + nx;
                    free[j] = !surface[j].is_nan();
                }
            }
        }
    }
    let rounded = land.clone();
    for _ in 0..4 {
        if !squares(&mut land, w, h, &free) {
            break;
        }
    }
    nubs(&mut land, w, h, &free);
    // The land's own narrow ledges stay, where the force changes the ground by a level or less: a
    // tile the tidying moved more than two levels from where it stood, with nothing round it changed
    // by more than a level, goes back to where it stood (a brink one tile wide on a cliff the force
    // only brushed would else fall the cliff's whole height).
    let brushed = |i: usize| (rounded[i] as i32 - before[i] as i32).abs() <= 1;
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if !free[i] || (land[i] as i32 - before[i] as i32).abs() <= 2 {
                continue;
            }
            let mut all = true;
            for ny in y.saturating_sub(1)..=(y + 1).min(h - 1) {
                for nx in x.saturating_sub(1)..=(x + 1).min(w - 1) {
                    all = all && brushed(ny * w + nx);
                }
            }
            if all {
                land[i] = before[i];
            }
        }
    }
    land
}

/// The last odd tiles: a free tile that stands in no square of its own level, and is not the jog of
/// a band, takes the level of three tiles of one of its squares that share one (the nearest to its
/// own), so it stands in a square; or, failing that, of the two tiles on opposite sides of it that
/// share one.
fn nubs(land: &mut [u8], w: usize, h: usize, free: &[bool]) {
    let in_square = |land: &[u8], x: usize, y: usize| {
        let l = land[y * w + x];
        let at = |dx: i64, dy: i64| {
            let (nx, ny) = (x as i64 + dx, y as i64 + dy);
            nx >= 0 && ny >= 0 && nx < w as i64 && ny < h as i64 && land[ny as usize * w + nx as usize] == l
        };
        (at(-1, 0) && at(0, -1) && at(-1, -1)) || (at(1, 0) && at(0, -1) && at(1, -1)) || (at(-1, 0) && at(0, 1) && at(-1, 1)) || (at(1, 0) && at(0, 1) && at(1, 1))
    };
    let mut odd: Vec<u32> = (0..w * h).filter(|&i| free[i] && !in_square(land, i % w, i / w)).map(|i| i as u32).collect();
    for _ in 0..6 {
        let mut moved = false;
        {
            for &i in &odd {
                let i = i as usize;
                let (x, y) = (i % w, i / w);
                if in_square(land, x, y) {
                    continue;
                }
                let own = land[i];
                let same = |land: &[u8], dx: i64, dy: i64| {
                    let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                    nx >= 0 && ny >= 0 && nx < w as i64 && ny < h as i64 && land[ny as usize * w + nx as usize] == own && in_square(land, nx as usize, ny as usize)
                };
                if (same(land, -1, 0) && same(land, 1, 0)) || (same(land, 0, -1) && same(land, 0, 1)) {
                    continue;
                }
                let at = |dx: i64, dy: i64| {
                    let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                    if nx < 0 || ny < 0 || nx >= w as i64 || ny >= h as i64 { None } else { Some(land[ny as usize * w + nx as usize]) }
                };
                let mut best: Option<u8> = None;
                // (as above: held by ground within two levels of its own, it joins none further off)
                let far = |g: u8| (g as i32 - own as i32).abs() > 2;
                let held = [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| at(dx, dy).map_or(false, |g| !far(g)));
                for (dx, dy) in [(-1i64, -1i64), (1, -1), (-1, 1), (1, 1)] {
                    if let (Some(a), Some(b), Some(c)) = (at(dx, 0), at(0, dy), at(dx, dy)) {
                        if a == b && b == c && a != own && !(held && far(a)) {
                            let nearer = |v: u8| (v as i32 - own as i32).abs();
                            if best.map_or(true, |v| nearer(a) < nearer(v) || (nearer(a) == nearer(v) && a < v)) {
                                best = Some(a);
                            }
                        }
                    }
                }
                // (or, between two tiles of one level on opposite sides, theirs: it links them)
                if best.is_none() {
                    for (dx, dy) in [(1i64, 0i64), (0, 1)] {
                        if let (Some(a), Some(b)) = (at(dx, dy), at(-dx, -dy)) {
                            if a == b && a != own && best.map_or(true, |v| (a as i32 - own as i32).abs() < (v as i32 - own as i32).abs()) {
                                best = Some(a);
                            }
                        }
                    }
                }
                if let Some(to) = best {
                    land[i] = to;
                    moved = true;
                }
            }
        }
        if !moved {
            break;
        }
        // (a tile that moved can leave the ones beside it odd)
        odd = (0..w * h).filter(|&i| free[i] && !in_square(land, i % w, i / w)).map(|i| i as u32).collect();
    }
}

/// Every free tile in a two-by-two square of its own level. From the highest level down, each square
/// whose lowest tile stands at that level takes it whole, where its tiles are still to be settled (a
/// tile that is not free must stand at that level already): so a pillar, a ridge or a step one tile
/// wide comes down to the widest ground beside it that holds a square, and a stair of one-tile steps
/// becomes wider steps between higher walls. A tile no square reaches (a pit, a trench, a sliver
/// between two levels) then joins the ground beside it: the lowest that is no lower than itself,
/// else the highest. Whether any such tile was left over (then another turn may settle it).
fn squares(heights: &mut [u8], w: usize, h: usize, free: &[bool]) -> bool {
    if w < 2 || h < 2 {
        return false;
    }
    const UNSET: u8 = u8::MAX;
    // (each square with a free tile in it, under its lowest level)
    let mut levels: Vec<Vec<u32>> = vec![vec![]; 256];
    for y in 0..h - 1 {
        for x in 0..w - 1 {
            let i = y * w + x;
            if free[i] || free[i + 1] || free[i + w] || free[i + w + 1] {
                let low = heights[i].min(heights[i + 1]).min(heights[i + w]).min(heights[i + w + 1]);
                levels[low as usize].push(i as u32);
            }
        }
    }
    let mut land: Vec<u8> = (0..w * h).map(|i| if free[i] { UNSET } else { heights[i] }).collect();
    for level in (0..255usize).rev() {
        let l = level as u8;
        for &i in &levels[level] {
            let i = i as usize;
            let tiles = [i, i + 1, i + w, i + w + 1];
            if tiles.iter().all(|&t| if free[t] { land[t] == UNSET || land[t] == l } else { heights[t] == l }) {
                // (a tile more than two levels above the square that touches settled ground within
                // two levels of its own stays up there, a tooth on that ground's side: the brink of
                // a cliff never falls the cliff's height)
                let held = |t: usize| {
                    let (x, y) = (t % w, t / w);
                    [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| {
                        let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                        nx >= 0 && ny >= 0 && nx < w as i64 && ny < h as i64 && {
                            let g = land[ny as usize * w + nx as usize];
                            g != UNSET && (g as i32 - heights[t] as i32).abs() <= 2
                        }
                    })
                };
                if tiles.iter().any(|&t| free[t] && land[t] == UNSET && heights[t] as usize > level + 2 && held(t)) {
                    continue;
                }
                for t in tiles {
                    land[t] = l;
                }
            }
        }
    }
    // The tiles no square reached. Each joins a level that three settled tiles of one of its squares
    // share (the nearest to its own, so it stands in a square there); where none does, a ring of
    // them at a time joins the ground beside it (a trench fills from its sides, then stands in squares).
    let mut left: Vec<u32> = (0..w * h).filter(|&i| land[i] == UNSET).map(|i| i as u32).collect();
    let any = !left.is_empty();
    let mut joined: Vec<(u32, u8)> = vec![];
    let nearer = |to: u8, best: Option<u8>, own: u8| match best {
        Some(b) if (b as i32 - own as i32).abs() < (to as i32 - own as i32).abs() || ((b as i32 - own as i32).abs() == (to as i32 - own as i32).abs() && b <= to) => Some(b),
        _ => Some(to),
    };
    let mut ring = false;
    while !left.is_empty() {
        joined.clear();
        for &i in &left {
            let i = i as usize;
            let (x, y) = (i % w, i / w);
            let own = heights[i];
            let at = |dx: i64, dy: i64| {
                let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                if nx < 0 || ny < 0 || nx >= w as i64 || ny >= h as i64 { UNSET } else { land[ny as usize * w + nx as usize] }
            };
            let mut best = None;
            if ring {
                for (dx, dy) in [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)] {
                    let g = at(dx, dy);
                    if g != UNSET {
                        best = match best {
                            // (the lowest that is no lower than itself, else the highest)
                            Some(b) if (b >= own && (g < own || g >= b)) || (b < own && g < b) => Some(b),
                            _ => Some(g),
                        };
                    }
                }
            } else {
                // (a tile that touches settled ground within two levels of its own never joins ground
                // further off: the brink of a cliff stays on the cliff's top)
                let far = |g: u8| (g as i32 - own as i32).abs() > 2;
                let held = [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| at(dx, dy) != UNSET && !far(at(dx, dy)));
                for (dx, dy) in [(-1i64, -1i64), (1, -1), (-1, 1), (1, 1)] {
                    let (a, b, c) = (at(dx, 0), at(0, dy), at(dx, dy));
                    if a != UNSET && a == b && b == c && !(held && far(a)) {
                        best = nearer(a, best, own);
                    }
                }
            }
            if let Some(to) = best {
                joined.push((i as u32, to));
            }
        }
        if joined.is_empty() {
            if ring {
                // (nothing settled beside them: they keep their levels)
                for &i in &left {
                    land[i as usize] = heights[i as usize];
                }
                break;
            }
            ring = true;
            continue;
        }
        ring = false;
        for &(i, to) in &joined {
            land[i as usize] = to;
        }
        left.retain(|&i| land[i as usize] == UNSET);
    }
    heights.copy_from_slice(&land);
    any
}

#[cfg(test)]
mod tests {
    use super::*;
    const W: usize = 48;
    /// A surface from a function of the tile, on level ground at 8.
    fn land_of(f: impl Fn(f64, f64) -> f64, seed: f64) -> (Vec<u8>, Vec<u8>) {
        let before = vec![8u8; W * W];
        let surface: Vec<f64> = (0..W * W).map(|i| f((i % W) as f64, (i / W) as f64)).collect();
        let ground: Vec<f64> = before.iter().map(|&l| l as f64).collect();
        (whole(&surface, &ground, &before, W, W, 22.0, seed, 8.0), before)
    }
    /// Whether a tile lies in a two-by-two square of its own level.
    fn in_square(land: &[u8], x: usize, y: usize) -> bool {
        let l = land[y * W + x];
        let at = |dx: i64, dy: i64| {
            let (nx, ny) = (x as i64 + dx, y as i64 + dy);
            nx >= 0 && ny >= 0 && nx < W as i64 && ny < W as i64 && land[ny as usize * W + nx as usize] == l
        };
        (at(-1, 0) && at(0, -1) && at(-1, -1)) || (at(1, 0) && at(0, -1) && at(1, -1)) || (at(-1, 0) && at(0, 1) && at(-1, 1)) || (at(1, 0) && at(0, 1) && at(1, 1))
    }
    /// Whether a tile stands in ground two tiles wide: in a square of its level, or a single tile on the
    /// side of one.
    fn wide(land: &[u8], x: usize, y: usize) -> bool {
        let l = land[y * W + x];
        let same = |dx: i64, dy: i64| {
            let (nx, ny) = (x as i64 + dx, y as i64 + dy);
            nx >= 0 && ny >= 0 && nx < W as i64 && ny < W as i64 && land[ny as usize * W + nx as usize] == l && in_square(land, nx as usize, ny as usize)
        };
        in_square(land, x, y) || same(-1, 0) || same(1, 0) || same(0, -1) || same(0, 1)
    }
    fn cone(x: f64, y: f64, slope: f64) -> f64 {
        8.0 + max(0.0, 12.0 - slope * portable_math::hypot(&[x - 23.5, y - 23.5]))
    }
    #[test]
    fn no_band_is_narrower_than_two_tiles_on_any_slope() {
        for seed in [0.0, 1.0, 7.0] {
            for slope in [0.2, 0.45, 0.8, 1.0, 1.6, 3.0] {
                let (land, _) = land_of(|x, y| cone(x, y, slope), seed);
                for y in 1..W - 1 {
                    for x in 1..W - 1 {
                        assert!(wide(&land, x, y), "slope {slope}, seed {seed}: a band one tile wide at {x},{y}");
                    }
                }
                assert!(*land.iter().max().unwrap() >= 18, "slope {slope}: the cone keeps its height");
            }
        }
    }
    #[test]
    fn steps_on_a_slope_are_of_uneven_width() {
        // (a cone with a level every 3 tiles: rounded alone, every ring is 3 tiles wide)
        let (land, _) = land_of(|x, y| cone(x, y, 1.0 / 3.0), 3.0);
        let mut widths = std::collections::BTreeSet::new();
        for (dx, dy) in [(1i64, 0i64), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1)] {
            let (mut x, mut y, mut run) = (23i64, 23i64, 0);
            let mut last = land[23 * W + 23];
            while x > 0 && y > 0 && x < W as i64 - 1 && y < W as i64 - 1 {
                x += dx;
                y += dy;
                let l = land[y as usize * W + x as usize];
                if l == last {
                    run += 1;
                } else {
                    if last > 8 {
                        widths.insert(run + 1);
                    }
                    run = 0;
                    last = l;
                }
            }
        }
        assert!(widths.len() >= 3, "the steps' widths: {widths:?}");
    }
    #[test]
    fn no_step_of_a_slope_runs_on() {
        // (a plane that falls along x: rounded alone, each of its steps runs straight across all 48 rows)
        for seed in [0.0, 4.0, 11.0] {
            for slope in [0.15, 0.3, 0.45] {
                let (land, _) = land_of(|x, _| 20.0 - slope * x, seed);
                let mut longest = 0;
                for x in 2..W - 3 {
                    let mut run = 0;
                    for y in 0..W {
                        // (a step between this column and the next, of the same two levels as the row above's)
                        let step = |y: usize| (land[y * W + x], land[y * W + x + 1]);
                        if step(y).0 != step(y).1 && (y == 0 || step(y) == step(y - 1) || run == 0) {
                            run += 1;
                            longest = longest.max(run);
                        } else {
                            run = (step(y).0 != step(y).1) as usize;
                        }
                    }
                }
                assert!(longest <= 16, "slope {slope}, seed {seed}: a step runs straight for {longest} tiles");
            }
        }
    }
    #[test]
    fn a_floor_on_a_whole_level_stays_on_it_and_a_cliff_stays_whole() {
        for seed in [0.0, 5.0] {
            // a pit five levels deep with a level floor and sheer sides
            let (land, _) = land_of(|x, y| if x >= 10.0 && x < 30.0 && y >= 12.0 && y < 36.0 { 3.0 } else { 8.0 }, seed);
            for y in 0..W {
                for x in 0..W {
                    let inside = x >= 10 && x < 30 && y >= 12 && y < 36;
                    assert_eq!(land[y * W + x], if inside { 3 } else { 8 }, "seed {seed}: {x},{y}");
                }
            }
        }
    }
    #[test]
    fn no_pillar_pit_ridge_trench_or_lone_block() {
        let (land, _) = land_of(
            |x, y| {
                let (x, y) = (x as usize, y as usize);
                if (x, y) == (10, 10) || (x == 20 && y > 5 && y < 30) {
                    11.0 // a pillar and a ridge
                } else if (x, y) == (30, 30) || (y == 40 && x > 8 && x < 40) {
                    5.0 // a pit and a trench
                } else if (x == 35 || x == 36) && y == 12 {
                    9.0 // a block two tiles by one
                } else {
                    8.0
                }
            },
            0.0,
        );
        assert!(land.iter().all(|&l| l == 8), "{:?}", land.iter().enumerate().filter(|(_, &l)| l != 8).collect::<Vec<_>>());
    }
    #[test]
    fn ground_the_force_left_alone_is_never_touched() {
        // the old ground has a pillar and a stair of one-tile steps; the force raises a mound elsewhere
        let mut before = vec![8u8; W * W];
        before[5 * W + 5] = 12;
        for x in 0..6 {
            for y in 30..W {
                before[y * W + 40 + x] = 9 + x as u8;
            }
        }
        let surface: Vec<f64> = (0..W * W)
            .map(|i| {
                let (x, y) = ((i % W) as f64, (i / W) as f64);
                let d = portable_math::hypot(&[x - 22.0, y - 16.0]);
                if d < 9.0 { before[i] as f64 + 4.0 * (1.0 - d / 9.0) } else if d < 12.0 { before[i] as f64 } else { f64::NAN }
            })
            .collect();
        let ground: Vec<f64> = before.iter().map(|&l| l as f64).collect();
        let land = whole(&surface, &ground, &before, W, W, 22.0, 2.0, 8.0);
        for i in 0..W * W {
            let (x, y) = ((i % W) as f64, (i / W) as f64);
            if portable_math::hypot(&[x - 22.0, y - 16.0]) >= 10.5 {
                assert_eq!(land[i], before[i], "{x},{y}");
            }
        }
        assert!(land[16 * W + 22] >= 11);
    }
    #[test]
    fn the_grounds_own_relief_is_left_as_it_is() {
        // rough ground: a hillside of one-tile steps with a cliff across it; the force adds a tenth of
        // a level everywhere, then a low mound in one corner
        let before: Vec<u8> = (0..W * W).map(|i| (4 + (i % W) / 3 + if i / W > 30 { 5 } else { 0 }) as u8).collect();
        let ground: Vec<f64> = before.iter().map(|&l| l as f64).collect();
        let surface: Vec<f64> = ground.iter().map(|g| g + 0.1).collect();
        assert_eq!(whole(&surface, &ground, &before, W, W, 40.0, 6.0, 8.0), before);
        let mound: Vec<f64> = (0..W * W).map(|i| ground[i] + max(0.0, 3.0 - 0.3 * portable_math::hypot(&[(i % W) as f64 - 12.0, (i / W) as f64 - 12.0]))).collect();
        let land = whole(&mound, &ground, &before, W, W, 40.0, 6.0, 8.0);
        for i in 0..W * W {
            let rise = land[i] as i32 - before[i] as i32;
            assert!((-1..=4).contains(&rise), "{},{}: {} from {}", i % W, i / W, land[i], before[i]);
            if portable_math::hypot(&[(i % W) as f64 - 12.0, (i / W) as f64 - 12.0]) > 13.0 {
                assert_eq!(rise, 0, "{},{}", i % W, i / W);
            }
        }
    }
    #[test]
    fn a_narrow_ledge_the_force_only_brushed_stays() {
        // a cliff ten levels high with a brink one tile wide a level under its top; the force raises
        // the low ground by a level and lowers the high ground by a level
        let before: Vec<u8> = (0..W * W).map(|i| if i % W < 20 { 4 } else if i % W == 20 { 13 } else { 14 }).collect();
        let ground: Vec<f64> = before.iter().map(|&l| l as f64).collect();
        let surface: Vec<f64> = (0..W * W).map(|i| ground[i] + if i % W < 20 { 0.8 } else { -0.8 }).collect();
        let land = whole(&surface, &ground, &before, W, W, 40.0, 3.0, 8.0);
        for i in 0..W * W {
            assert!((land[i] as i32 - before[i] as i32).abs() <= 2, "{},{}: {} from {}", i % W, i / W, land[i], before[i]);
        }
    }
    #[test]
    fn the_same_land_every_time_and_never_above_the_ceiling() {
        let a = land_of(|x, y| cone(x, y, 0.7) + 6.0, 9.0).0;
        let b = land_of(|x, y| cone(x, y, 0.7) + 6.0, 9.0).0;
        assert_eq!(a, b);
        assert!(a.iter().all(|&l| l <= 22));
        assert_ne!(a, land_of(|x, y| cone(x, y, 0.7) + 6.0, 10.0).0, "another seed, other steps");
    }
}
