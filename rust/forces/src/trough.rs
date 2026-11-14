// Glaciate's trough (#914, the forces queue's item 10): one U-shaped trough along the glacier's line.
//
// The planner (`glacier_once`) finds the route, the stations' widths, the cirque, the hanging valleys,
// the springs, the snout's moraine and outwash. This last stage reshapes the trough itself, the ground
// within each station's half-width of the route, so that it reads as one glacial valley:
//
// - **The line is a smooth curve.** The stations are rounded (Chaikin, three passes) and sampled every
//   half tile; every tile takes its place along the line and its offset across it from the nearest
//   sample. Nothing in the trough runs along the grid or between two drawn points as a ruled line.
// - **One floor across the trough, stepping down in long treads.** Each sample's floor level is the
//   valley's low dry ground near the line, less Power's cut, never rising down the route; the level
//   holds for a tread at least `tread` tiles long and steps down a level (or more, a rock bar) at
//   once. The floor is the same level from wall to wall.
// - **One shallow river channel.** A level below the floor, two or three tiles wide, winding gently
//   within it. Where the valley already has a river or a canyon's stream, the channel follows it (the
//   floor widens on that side to take it in), so no second channel is cut beside it.
// - **The U.** From the floor's edge to the trough's edge the walls rise as the square of the way
//   across, to the old rim, with a bench (or two, Benches Many) held level part way up where the wall
//   is tall. Only the walls go through `levels::whole`: plates, never a stair of one-tile bands.
// - **Lakes keep their water.** A lake the line runs through becomes a ribbon lake: the floor under it
//   is cut below its surface, the treads above it stand at its level or higher, and wherever ground
//   the trough lowered within three tiles of the lake (or of its ribbon) would let it out lower than
//   it did, a bar is left at its level, the old outlet at its old sill. A lake beside the line keeps
//   its shore the same way. Badwater pools are lakes too, so badwater and clean water never mix.
//
// Power bounds every cut (a tile goes down at most Power's cut and two levels more; four more at
// Power 100); the floor is raised a level at most, a river's bed two, never a lake's. Integers, the
// portable functions and the planner's own rounding: the same bytes natively and in WebAssembly.
use super::*;

struct Sample {
    x: f64,
    y: f64,
    s: f64,
    r: f64,
    nx: f64,
    ny: f64,
}

/// The stations rounded into a smooth curve, sampled every half tile.
fn centreline(path: &[GlacierStation]) -> Vec<Sample> {
    let mut pts: Vec<(f64, f64, f64)> = path.iter().map(|q| (q.x, q.y, q.r)).collect();
    for _ in 0..3 {
        if pts.len() < 3 {
            break;
        }
        let mut next = vec![pts[0]];
        for k in 0..pts.len() - 1 {
            let (a, b) = (pts[k], pts[k + 1]);
            next.push((a.0 * 0.75 + b.0 * 0.25, a.1 * 0.75 + b.1 * 0.25, a.2 * 0.75 + b.2 * 0.25));
            next.push((a.0 * 0.25 + b.0 * 0.75, a.1 * 0.25 + b.1 * 0.75, a.2 * 0.25 + b.2 * 0.75));
        }
        next.push(*pts.last().unwrap());
        pts = next;
    }
    let mut out: Vec<Sample> = vec![];
    let mut s = 0.0;
    let mut carry = 0.0;
    for k in 0..pts.len() {
        if k == 0 {
            out.push(Sample { x: pts[0].0, y: pts[0].1, s: 0.0, r: pts[0].2, nx: 0.0, ny: 0.0 });
            continue;
        }
        let (a, b) = (pts[k - 1], pts[k]);
        let len = hypot(b.0 - a.0, b.1 - a.1);
        let mut t = 0.5 - carry;
        while t <= len {
            let f = if len > 0.0 { t / len } else { 0.0 };
            out.push(Sample { x: a.0 + (b.0 - a.0) * f, y: a.1 + (b.1 - a.1) * f, s: s + t, r: a.2 + (b.2 - a.2) * f, nx: 0.0, ny: 0.0 });
            t += 0.5;
        }
        carry = len - (t - 0.5);
        s += len;
    }
    let n = out.len();
    for k in 0..n {
        let (a, b) = (&out[k.saturating_sub(4)], &out[(k + 4).min(n - 1)]);
        let (dx, dy) = (b.x - a.x, b.y - a.y);
        let len = hypot(dx, dy);
        let (nx, ny) = if len > 0.0 { (-dy / len, dx / len) } else { (1.0, 0.0) };
        out[k].nx = nx;
        out[k].ny = ny;
    }
    out
}

/// Reshape the trough (see the top of this file). `keep`: ground the force leaves alone.
pub(super) fn trough(p: &mut GlacierPlan, before: &Map, s: &GlacierSettings, keep: &[u8]) {
    let (w, h) = (before.w, before.h);
    let n = w * h;
    if p.path.len() < 2 {
        return;
    }
    let mut line = centreline(&p.path);
    if line.len() < 4 {
        return;
    }
    let length = max(line.last().unwrap().s, 1.0);
    let seed = s.seed as f64;
    // (the line wanders slowly either side of the drawn one, a fifth of the half-width at most, none at its
    // ends: a line drawn straight never makes a ruled trough)
    {
        let shift: Vec<(f64, f64)> = line
            .iter()
            .map(|q| {
                let taper = min(1.0, min(q.s, length - q.s) / 10.0);
                let a = (levels::lumps(seed, 7303, q.s / max(8.0, q.r * 2.5), 0.5, 1.0) - 0.5) * 2.0 * 0.22 * q.r * taper;
                (q.x + q.nx * a, q.y + q.ny * a)
            })
            .collect();
        for (q, (x, y)) in line.iter_mut().zip(shift) {
            q.x = x;
            q.y = y;
        }
        let ns = line.len();
        for k in 0..ns {
            let (a, b) = (&line[k.saturating_sub(4)], &line[(k + 4).min(ns - 1)]);
            let (dx, dy) = (b.x - a.x, b.y - a.y);
            let len = hypot(dx, dy);
            let (nx, ny) = if len > 0.0 { (-dy / len, dx / len) } else { (1.0, 0.0) };
            line[k].nx = nx;
            line[k].ny = ny;
        }
    }
    let t = clamp(s.power, 0.0, 100.0) / 100.0;
    let cut = 1.0 + round(10.0 * t * (0.4 + 0.6 * t));
    let cap = cut + 2.0 + round(3.0 * t) + if t >= 1.0 { 4.0 } else { 0.0 };
    let top = before.ceiling;
    let bottom = clamp(round(s.floor), 1.0, top) + 1.0;
    let old = |i: usize| before.heights[i] as f64;

    // Each tile's nearest sample, its offset across the line, and whether the trough takes it.
    let mut near = vec![-1i32; n];
    let mut best = vec![f64::INFINITY; n];
    let mut lat = vec![0.0f64; n];
    for (j, q) in line.iter().enumerate() {
        let rr = q.r * 1.5 + 3.0;
        let (x0, x1) = (max(0.0, (q.x - rr).floor()) as usize, min(w as f64, (q.x + rr).ceil()) as usize);
        let (y0, y1) = (max(0.0, (q.y - rr).floor()) as usize, min(h as f64, (q.y + rr).ceil()) as usize);
        for y in y0..y1 {
            for x in x0..x1 {
                let i = y * w + x;
                let (dx, dy) = (x as f64 + 0.5 - q.x, y as f64 + 0.5 - q.y);
                let d = hypot(dx, dy);
                if d < best[i] {
                    best[i] = d;
                    near[i] = j as i32;
                    lat[i] = dx * q.nx + dy * q.ny;
                }
            }
        }
    }
    // (past the line's two ends the trough closes: the cirque's headwall and the snout's lip rise from the floor's
    // edge as its walls do, so the floor ends where the ice did, never a round pad beyond it)
    for i in 0..n {
        if near[i] < 0 {
            continue;
        }
        let j = near[i] as usize;
        if j != 0 && j != line.len() - 1 {
            continue;
        }
        let q = &line[j];
        let along = (i % w) as f64 + 0.5 - q.x;
        let along = along * q.ny - ((i / w) as f64 + 0.5 - q.y) * q.nx;
        let past = if j == 0 { -along } else { along };
        if past > 0.0 {
            let sign = if lat[i] < 0.0 { -1.0 } else { 1.0 };
            lat[i] = sign * max(lat[i].abs(), q.r * 0.55 + past);
        }
    }
    // (its edge wanders a little, slowly, so the rim never runs as a ruled curve)
    let edge = |i: usize, r: f64| r * (1.0 + 0.16 * (levels::lumps(seed, 7101, (i % w) as f64, (i / w) as f64, 7.0) - 0.5));
    let zone: Vec<bool> = (0..n).map(|i| near[i] >= 0 && keep[i] == 0 && best[i] <= edge(i, line[near[i] as usize].r)).collect();

    // The old water: lakes (broad standing water, badwater pools) and the rest, rivers.
    let (lake_of, lakes) = glacier_lakes(before);
    let river = |i: usize| before.depth[i] > 0.05 && lake_of[i] < 0;

    // The floor's half-width on each side, widened to take in a river the line runs beside.
    let ns = line.len();
    let mut side = vec![[0.0f64; 2]; ns];
    for (j, q) in line.iter().enumerate() {
        side[j] = [q.r * 0.55, q.r * 0.55];
    }
    for i in 0..n {
        if zone[i] && river(i) {
            let j = near[i] as usize;
            let k = if lat[i] < 0.0 { 0 } else { 1 };
            side[j][k] = max(side[j][k], min(lat[i].abs() + 2.5, line[j].r * 1.4));
        }
    }
    // (smoothed along the line, so the floor's edge is a curve)
    let side: Vec<[f64; 2]> = (0..ns)
        .map(|j| {
            let (a, b) = (j.saturating_sub(12), (j + 12).min(ns - 1));
            let mut m = [0.0f64; 2];
            for k in a..=b {
                m[0] = max(m[0], side[k][0] - 0.15 * (k as f64 - j as f64).abs());
                m[1] = max(m[1], side[k][1] - 0.15 * (k as f64 - j as f64).abs());
            }
            m
        })
        .collect();
    let half = |i: usize| -> f64 { side[near[i] as usize][if lat[i] < 0.0 { 0 } else { 1 }] };
    // (where the valley's river is broad, the trough takes in its banks too: a floor on both sides of it, never
    // the river alone cut down as a slot)
    let zone: Vec<bool> = (0..n).map(|i| zone[i] || (near[i] >= 0 && keep[i] == 0 && lat[i].abs() <= half(i) && best[i] <= line[near[i] as usize].r * 1.5 + 3.0)).collect();
    let floor_tile = |i: usize| zone[i] && lat[i].abs() <= half(i);

    // The floor's level at each sample: the valley's low dry ground near the line, less Power's cut,
    // never rising down the route, held in long treads.
    let mut low: Vec<Vec<f64>> = vec![vec![]; ns];
    let mut wet_low: Vec<f64> = vec![f64::INFINITY; ns];
    for i in 0..n {
        if !zone[i] || near[i] < 0 {
            continue;
        }
        let j = near[i] as usize;
        if lat[i].abs() > min(half(i), 3.0) {
            continue;
        }
        if before.depth[i] > 0.05 {
            wet_low[j] = min(wet_low[j], old(i) + 1.0);
        } else {
            low[j].push(old(i));
        }
    }
    let mut want = vec![0.0f64; ns];
    let mut grounds = vec![0.0f64; ns];
    let mut last = f64::NAN;
    for j in 0..ns {
        let (a, b) = (j.saturating_sub(4), (j + 4).min(ns - 1));
        let mut v: Vec<f64> = vec![];
        let mut wl = f64::INFINITY;
        for k in a..=b {
            v.extend_from_slice(&low[k]);
            wl = min(wl, wet_low[k]);
        }
        let ground = if !v.is_empty() { glacier_quantile(v, 0.35) } else if wl.is_finite() { wl } else if last.is_nan() { old(glacier_tile(before, Point { x: line[j].x, y: line[j].y })) } else { last + cut };
        grounds[j] = ground;
        // (the cut eases off over the last third of the way, so the snout's floor meets the valley it leaves and its
        // river runs on out, never a basin brim-full behind a lip)
        let ease = min(1.0, (length - line[j].s) / max(8.0, length * 0.33));
        want[j] = max(bottom, ground - round(cut * ease));
        last = want[j];
    }
    let step_scale = match s.steps {
        0 => 1.6,
        2 => 0.6,
        _ => 1.0,
    };
    let mean_r = line.iter().map(|q| q.r).sum::<f64>() / ns as f64;
    let tread = max(10.0, mean_r * 1.5) * step_scale;
    let mut floor = vec![0.0f64; ns];
    let mut level = f64::INFINITY;
    for j in 0..ns {
        level = min(level, want[j]);
        want[j] = level;
    }
    let mut c = want[0];
    let mut from = 0.0;
    for j in 0..ns {
        if want[j] <= c - 2.0 || (want[j] <= c - 1.0 && line[j].s - from >= tread) {
            c = want[j];
            from = line[j].s;
        }
        floor[j] = c;
    }
    // (a tread longer than twice its length steps down a level part way, at an uneven point, so the floor and its
    // river keep falling down a level valley too: water never lies flat along it far enough to pile over the floor)
    {
        let mut a = 0;
        let mut salt = 0u32;
        while a < ns {
            let mut b = a;
            while b + 1 < ns && floor[b + 1] == floor[a] {
                b += 1;
            }
            let (sa, sb) = (line[a].s, line[b].s);
            if sb - sa > tread * 2.0 && floor[a] - 1.0 >= bottom {
                let at = sa + (sb - sa) * (0.4 + 0.25 * glacier_noise(s.seed, 7500 + salt));
                salt += 1;
                for j in a..ns {
                    if line[j].s >= at && floor[j] >= floor[a] {
                        floor[j] = floor[a] - 1.0;
                    }
                }
                continue;
            }
            a = b + 1;
        }
    }
    // Lakes the floor meets: a ribbon lake along its stretch, the treads above it at its level or higher.
    let mut ribbon = vec![-1i32; ns];
    for (id, (tiles, surface)) in lakes.iter().enumerate() {
        if tiles.is_empty() {
            continue;
        }
        let (mut j0, mut j1) = (usize::MAX, 0usize);
        for &i in tiles {
            if zone[i] && lat[i].abs() <= half(i) + 1.0 {
                let j = near[i] as usize;
                j0 = j0.min(j);
                j1 = j1.max(j);
            }
        }
        if j0 == usize::MAX {
            continue;
        }
        let held = (surface - 0.02).ceil();
        for j in 0..ns {
            if j < j0 {
                floor[j] = max(floor[j], held);
            } else if j <= j1 {
                floor[j] = max(bottom, min(floor[j], held - 2.0));
                ribbon[j] = id as i32;
            }
        }
    }

    // The way out: the river leaves the snout by the cheapest way down the old land to lower ground or
    // water at its own level (a meltwater gorge through the lip, never a ruled line). Where that would cut
    // more than three levels, the treads near the snout stand higher instead, so the trough is never a
    // closed basin brim-full of water.
    // (each tile's spill level on the old land: the lowest level water standing there rises to before it runs
    // off the map's edge, four ways round as the game's water goes; lower ground that is a closed pit is no way
    // out)
    let spill = {
        let mut f = vec![f64::INFINITY; n];
        let mut heap = ForceHeap::default();
        for i in 0..n {
            let (x, y) = (i % w, i / w);
            if x == 0 || y == 0 || x == w - 1 || y == h - 1 {
                f[i] = old(i);
                heap.push(f[i], i);
            }
        }
        while let Some((lv, c)) = heap.pop() {
            if lv > f[c] {
                continue;
            }
            let (x, y) = (c % w, c / w);
            for (on, j) in [(x > 0, c.wrapping_sub(1)), (x + 1 < w, c + 1), (y > 0, c.wrapping_sub(w)), (y + 1 < h, c + w)] {
                if on {
                    let v = max(lv, old(j));
                    if v < f[j] {
                        f[j] = v;
                        heap.push(v, j);
                    }
                }
            }
        }
        f
    };
    let mut outlet: Vec<usize> = vec![];
    let planned = floor.clone();
    // (a snout that ends in a lake it keeps drains into it, by the lake's own outlet; and a snout that stops just
    // short of water standing at its floor's level ends in it: the water reaches up the trough's last treads as a
    // deeper reach of itself, never a sheet over the floor)
    let mut joins_water: Option<(f64, i32)> = None;
    {
        let end = &line[ns - 1];
        let reach = max(6.0, end.r);
        let (x0, x1) = (max(0.0, (end.x - reach).floor()) as usize, min(w as f64, (end.x + reach).ceil()) as usize);
        let (y0, y1) = (max(0.0, (end.y - reach).floor()) as usize, min(h as f64, (end.y + reach).ceil()) as usize);
        for y in y0..y1 {
            for x in x0..x1 {
                let i = y * w + x;
                if zone[i] || before.depth[i] <= 0.05 || hypot(x as f64 + 0.5 - end.x, y as f64 + 0.5 - end.y) > reach {
                    continue;
                }
                let sfc = old(i) + before.depth[i];
                if sfc >= floor[ns - 1] - 0.5 && joins_water.map_or(true, |(v, _)| sfc < v) {
                    joins_water = Some((sfc, lake_of[i]));
                }
            }
        }
    }
    if let Some((sfc, id)) = joins_water {
        let held = (sfc - 0.02).ceil();
        for j in 0..ns {
            if floor[j] < held + 1.0 {
                floor[j] = max(bottom, min(floor[j], held - 2.0));
                if id >= 0 && ribbon[j] < 0 {
                    ribbon[j] = id;
                }
            }
        }
    }
    let mut drains = ribbon[ns - 1] >= 0 || joins_water.is_some();
    if !drains {
        let end = &line[ns - 1];
        let start = glacier_tile(before, Point { x: clamp(end.x, 0.0, w as f64 - 1.0), y: clamp(end.y, 0.0, h as f64 - 1.0) });
        // (the treads may stand higher by Power's cut at most: never above the valley's old bottom)
        for _ in 0..=(cut as usize + 1) {
            let d = floor[ns - 1] - 1.0;
            // (raised, never a floor above the valley's own bottom at the snout)
            let room = floor[ns - 1] + 1.0 <= grounds[ns - 1];
            let mut cost = vec![f64::INFINITY; n];
            let mut parent = vec![-1i32; n];
            let mut heap = ForceHeap::default();
            cost[start] = 0.0;
            heap.push(0.0, start);
            let mut goal = None;
            while let Some((c0, i)) = heap.pop() {
                if c0 != cost[i] {
                    continue;
                }
                if !zone[i] && (spill[i] <= d - if room { 1.0 } else { 0.0 } || (before.depth[i] > 0.05 && old(i) + before.depth[i] <= d + 0.6)) {
                    goal = Some(i);
                    break;
                }
                if c0 > 600.0 {
                    break;
                }
                let (x, y) = (i % w, i / w);
                for (on, j) in [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)] {
                    if !on || keep[j] != 0 {
                        continue;
                    }
                    // (through water only where it is where the river goes: a pool higher up it would dam)
                    if before.depth[j] > 0.05 && !zone[j] && old(j) + before.depth[j] > d + 0.6 {
                        continue;
                    }
                    // (inside the trough only round its snout: the river runs down the floor, never back up it)
                    if zone[j] && near[j] >= 0 && line[near[j] as usize].s < length - 8.0 {
                        continue;
                    }
                    let step = if zone[j] { 1.0 } else { 1.0 + 3.0 * max(0.0, old(j) - d) };
                    if c0 + step < cost[j] {
                        cost[j] = c0 + step;
                        parent[j] = i as i32;
                        heap.push(c0 + step, j);
                    }
                }
            }
            let Some(g) = goal else {
                if !room {
                    break;
                }
                // (the whole profile lifts a level, its treads kept)
                let end = floor[ns - 1];
                for j in 0..ns {
                    floor[j] = max(floor[j], planned[j] - planned[ns - 1] + end + 1.0);
                }
                continue;
            };
            let mut way = vec![];
            let mut i = parent[g];
            while i >= 0 {
                way.push(i as usize);
                i = parent[i as usize];
            }
            let deepest = way.iter().filter(|&&i| !zone[i]).map(|&i| old(i) - d).fold(0.0, max);
            if deepest <= 3.0 && way.iter().filter(|&&i| !zone[i]).count() as f64 <= max(24.0, mean_r * 3.0) {
                outlet = way;
                drains = true;
                break;
            }
            if !room {
                break;
            }
            let end = floor[ns - 1];
            for j in 0..ns {
                floor[j] = max(floor[j], planned[j] - planned[ns - 1] + end + 1.0);
            }
        }
    }

    // (no way out within reach: the treads stay as high as they went, the snout's at the valley's own bottom, so its
    // water leaves over the lip as the valley's did)

    // The channel's depth: a level under its tread, two over the tread's lower half (all but the last tread), so it
    // falls all the way down the trough and never lies flat along a long tread, piling its water over the floor.
    let mut sink = vec![1.0f64; ns];
    {
        let mut a = 0;
        while a < ns {
            let mut b = a;
            while b + 1 < ns && floor[b + 1] == floor[a] {
                b += 1;
            }
            let (sa, sb) = (line[a].s, line[b].s);
            if b + 1 < ns && sb - sa >= 8.0 {
                for j in a..=b {
                    if line[j].s - sa > (sb - sa) * 0.5 {
                        sink[j] = 2.0;
                    }
                }
            }
            a = b + 1;
        }
    }

    // The channel's line: the valley's own river where it has one, else a gentle meander.
    let phase = glacier_noise(s.seed, 7) * std::f64::consts::PI * 2.0;
    let wave = max(18.0, mean_r * 3.0);
    let mut sum = vec![(0.0f64, 0.0f64); ns];
    for i in 0..n {
        if floor_tile(i) && river(i) {
            let j = near[i] as usize;
            sum[j].0 += lat[i];
            sum[j].1 += 1.0;
        }
    }
    let raw: Vec<f64> = (0..ns)
        .map(|j| {
            if sum[j].1 > 0.0 {
                sum[j].0 / sum[j].1
            } else {
                let taper = min(1.0, min(line[j].s, length - line[j].s) / 8.0);
                0.45 * min(side[j][0], side[j][1]) * sin(2.0 * std::f64::consts::PI * line[j].s / wave + phase) * taper
            }
        })
        .collect();
    let course: Vec<f64> = (0..ns)
        .map(|j| {
            let (a, b) = (j.saturating_sub(8), (j + 8).min(ns - 1));
            raw[a..=b].iter().sum::<f64>() / (b - a + 1) as f64
        })
        .collect();

    // The surface: the floor, the channel, the walls (with benches).
    let mut surface = vec![f64::NAN; n];
    let mut ground = vec![f64::NAN; n];
    let mut kind = vec![0u8; n]; // 1 floor, 2 channel, 3 wall
    let mut benched = vec![false; n];
    for i in 0..n {
        if !zone[i] {
            continue;
        }
        let j = near[i] as usize;
        let q = &line[j];
        let f = floor[j];
        let a = lat[i].abs();
        let hf = half(i);
        if a <= hf {
            if (lat[i] - course[j]).abs() <= 1.05 || river(i) {
                kind[i] = 2;
            } else {
                kind[i] = 1;
            }
            continue;
        }
        let u = clamp((a - hf) / max(1.0, q.r - hf), 0.0, 1.0);
        let sign = if lat[i] < 0.0 { -1.0 } else { 1.0 };
        let (rx, ry) = (q.x + q.nx * sign * q.r * 1.05, q.y + q.ny * sign * q.r * 1.05);
        let rim = old(glacier_tile(before, Point { x: clamp(rx, 0.0, w as f64 - 1.0), y: clamp(ry, 0.0, h as f64 - 1.0) }));
        let rise = max(0.0, max(rim, old(i)) - f);
        let bench = s.benches != 0 && rise >= 5.0 && levels::lumps(seed, 7202, q.s / 14.0, sign, 1.0) > if s.benches == 2 { 0.15 } else { 0.45 };
        let mut v = u;
        if bench && (0.45..0.62).contains(&u) {
            v = 0.45;
        } else if bench && s.benches == 2 && (0.74..0.84).contains(&u) {
            v = 0.74;
        }
        let z = f + rise * v * v;
        if z >= old(i) {
            continue;
        }
        kind[i] = 3;
        benched[i] = v != u;
        surface[i] = max(z, old(i) - cap);
        ground[i] = f;
    }
    // (the ground right round the walls, at its own level, so the last step tidies the seam)
    for i in 0..n {
        if kind[i] != 0 || keep[i] != 0 {
            continue;
        }
        let (x, y) = (i % w, i / w);
        if [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)].iter().any(|&(on, j)| on && kind[j] == 3) {
            surface[i] = old(i);
            ground[i] = old(i);
        }
    }
    let grain = max(6.0, mean_r * 0.5);
    let walls = levels::whole(&surface, &ground, &before.heights, w, h, top, seed, grain);
    let prev = p.map.heights.clone();
    let mut land: Vec<f64> = (0..n).map(|i| p.map.heights[i] as f64).collect();
    for i in 0..n {
        let j = if near[i] >= 0 { near[i] as usize } else { 0 };
        match kind[i] {
            3 => land[i] = walls[i] as f64,
            1 | 2 => {
                let f = floor[j] - if kind[i] == 2 { sink[j] } else { 0.0 };
                // (a dry hollow in the floor fills a level, so the tread is one level and holds no pond; never ground
                // beside water, which it would dam)
                let wet_by = {
                    let (x, y) = ((i % w) as i64, (i / w) as i64);
                    let mut any = false;
                    for dy in -2i64..=2 {
                        for dx in -2i64..=2 {
                            let (xx, yy) = (x + dx, y + dy);
                            if xx >= 0 && yy >= 0 && xx < w as i64 && yy < h as i64 && before.depth[yy as usize * w + xx as usize] > 0.05 {
                                any = true;
                            }
                        }
                    }
                    any
                };
                let lift = if wet_by || kind[i] == 2 { 0.0 } else { 1.0 };
                land[i] = clamp(f, old(i) - cap, old(i) + lift);
            }
            _ => {
                // (ground the planner shaped as trough beyond this trough's edge goes back as it was, and so
                // does its river's straight way out of the snout: this stage leads its own)
                if !zone[i] && ((near[i] >= 0 && (p.mask[i] == 1 || p.mask[i] == 2) && p.fan[i] == 0) || p.stream[i] == 1) {
                    land[i] = old(i);
                    p.stream[i] = 0;
                } else if !surface[i].is_nan() {
                    land[i] = walls[i] as f64;
                }
                // (and the snout's moraine and outwash never stand in water: raised across a river they dammed
                // it and drowned its plain)
                if before.depth[i] > 0.05 && land[i] > old(i) {
                    land[i] = old(i);
                }
            }
        }
    }
    // A tarn in the cirque, where it was planned: its pool a level below the head's floor.
    if s.tarn {
        for k in 0..p.retained.tiles.len() {
            let i = p.retained.tiles[k];
            if zone[i] && near[i] >= 0 && line[near[i] as usize].s < length * 0.2 {
                land[i] = max(bottom - 1.0, floor[near[i] as usize] - 1.0);
                p.retained.floor[k] = land[i];
            }
        }
    }

    // No one-tile post or pit left in the trough: a tile standing above (or, off the channel, below) all four
    // of its neighbours in the trough takes their nearest level.
    for _ in 0..2 {
        for i in 0..n {
            if kind[i] == 0 {
                continue;
            }
            let (x, y) = (i % w, i / w);
            if x == 0 || y == 0 || x + 1 >= w || y + 1 >= h {
                continue;
            }
            let around = [i - 1, i + 1, i - w, i + w];
            if around.iter().any(|&j| kind[j] == 0) {
                continue;
            }
            let hi = around.iter().map(|&j| land[j]).fold(f64::NEG_INFINITY, max);
            let lo = around.iter().map(|&j| land[j]).fold(f64::INFINITY, min);
            if land[i] > hi {
                land[i] = hi;
            } else if land[i] < lo && kind[i] != 2 && before.depth[i] <= 0.05 {
                land[i] = lo;
            }
        }
    }

    // Feeders: the glacier's own springs and the hanging valleys' landings lead to the channel by the shortest
    // way down, two tiles wide, falling all the way, so their water never stands as a sheet on the level floor.
    // Then the water is let settle on the land so far, and wherever it still stands as a sheet on the floor, a
    // feeder leads it down to the channel the same way.
    for pass in 0..2 {
        let mut starts: Vec<usize> = vec![];
        if pass == 0 {
            for e in &p.map.entities {
                if e.owner.as_ref() == "glaciate" && ride_source(e.template.as_ref()) && e.x >= 0.0 && e.y >= 0.0 && (e.x as usize) < w && (e.y as usize) < h {
                    starts.push(e.y as usize * w + e.x as usize);
                }
            }
            for g in &p.hanging {
                if g.wet || g.source.is_some() {
                    starts.push(g.landing);
                }
            }
        } else {
            let mut m = p.map.clone();
            for i in 0..n {
                m.heights[i] = clamp(round(land[i]), 0.0, top) as u8;
            }
            let (depth, _) = force_prefill(&force_water_model(&m), Some(&p.retained));
            for i in 0..n {
                if kind[i] == 1 && depth[i] > 0.02 && depth[i] < 0.3 && p.stream[i] == 0 {
                    starts.push(i);
                }
            }
        }
        starts.sort_unstable();
        starts.dedup();
        for &a in &starts {
            if kind[a] == 2 {
                continue;
            }
            let mut cost = vec![f64::INFINITY; 0];
            cost.resize(n, f64::INFINITY);
            let mut parent = vec![-1i32; n];
            let mut heap = ForceHeap::default();
            cost[a] = 0.0;
            heap.push(0.0, a);
            let mut goal = None;
            while let Some((c0, i)) = heap.pop() {
                if c0 != cost[i] {
                    continue;
                }
                if kind[i] == 2 {
                    goal = Some(i);
                    break;
                }
                if c0 > 80.0 {
                    break;
                }
                let (x, y) = (i % w, i / w);
                for (on, j) in [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)] {
                    if !on || keep[j] != 0 || lake_of[j] >= 0 {
                        continue;
                    }
                    // (a little wander in its cost, so a feeder winds and never runs as a ruled line)
                    let step = 1.0 + 2.0 * max(0.0, land[j] - land[i]) + 1.5 * levels::lumps(seed, 7404, (j % w) as f64, (j / w) as f64, 3.0);
                    if c0 + step < cost[j] {
                        cost[j] = c0 + step;
                        parent[j] = i as i32;
                        heap.push(c0 + step, j);
                    }
                }
            }
            let Some(g) = goal else { continue };
            let mut way = vec![];
            let mut i = parent[g];
            while i >= 0 && i as usize != a {
                way.push(i as usize);
                i = parent[i as usize];
            }
            way.reverse();
            // (its bed falls from the start's ground to the channel's level, never rising)
            let target = land[g];
            let mut bed = land[a];
            for &t in &way {
                bed = max(target, min(bed, land[t] - 1.0));
                let (x, y) = (t % w, t / w);
                let beside = if x + 1 < w && keep[t + 1] == 0 { t + 1 } else if y + 1 < h && keep[t + w] == 0 { t + w } else { t };
                for u in [t, beside] {
                    if kind[u] != 2 && land[u] > bed && land[u] - bed <= cap {
                        land[u] = bed;
                        p.stream[u] = 2;
                    }
                }
            }
        }
    }

    // The way out, two tiles wide, at the snout's channel level.
    let out_level = floor[ns - 1] - 1.0;
    let mut led = vec![false; n];
    for &i in &outlet {
        let (x, y) = (i % w, i / w);
        let beside = if x + 1 < w && (y + 1 >= h || old(i + 1) <= old(i + w)) { i + 1 } else if y + 1 < h { i + w } else { i };
        for j in [i, beside] {
            // (its way across the snout's floor too, so the river never crosses the tread as a sheet)
            // (water on its way lies at the river's level or lower: the search passes no higher)
            if keep[j] == 0 && lake_of[j] < 0 && (before.depth[j] <= 0.05 || old(j) + before.depth[j] <= out_level + 0.6) {
                land[j] = min(land[j], max(out_level, old(j) - cap));
                p.stream[j] = 1;
                led[j] = true;
            }
        }
    }

    // Lakes keep their water: a bar wherever ground the trough lowered within three tiles of a lake (or its
    // ribbon) would let it out lower than it did; the old outlet keeps its old sill.
    for (id, (tiles, surface)) in lakes.iter().enumerate() {
        if tiles.is_empty() {
            continue;
        }
        let held = (surface - 0.02).ceil();
        let sill = surface.floor();
        let mut seen: Vec<(usize, u8)> = vec![];
        let mut queue = std::collections::VecDeque::new();
        let mut mark = std::collections::HashMap::new();
        for &i in tiles {
            mark.insert(i, 0u8);
            queue.push_back(i);
        }
        let in_ribbon = |i: usize| zone[i] && near[i] >= 0 && ribbon[near[i] as usize] == id as i32 && lat[i].abs() <= half(i);
        while let Some(i) = queue.pop_front() {
            let d = mark[&i];
            let (x, y) = (i % w, i / w);
            for (on, j) in [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)] {
                if !on || mark.contains_key(&j) || land[j] >= held {
                    continue;
                }
                let dj = if in_ribbon(j) { d } else { d + 1 };
                if dj > 3 {
                    continue;
                }
                mark.insert(j, dj);
                if dj == d {
                    queue.push_front(j);
                } else {
                    queue.push_back(j);
                }
                if dj > 0 {
                    seen.push((j, dj));
                }
            }
        }
        seen.sort_unstable();
        for (j, _) in seen {
            if land[j] < old(j) && lake_of[j] != id as i32 {
                // (the river's way out of the snout keeps its level: no bar at more than the lake's own sill)
                let stand = if old(j) >= held && !led[j] { held } else { sill };
                land[j] = max(land[j], min(old(j), stand));
            }
        }
    }

    // (the rivers the trough takes in: every stretch of water joined to one in it)
    let mut taken = vec![false; n];
    {
        // (a trough with no way out takes in no river: it would fill and spill over the land round it)
        let mut queue: Vec<usize> = if !drains { vec![] } else { (0..n).filter(|&i| zone[i] && river(i)).collect() };
        if joins_water.is_some() {
            let end = &line[ns - 1];
            let reach = max(6.0, end.r) + 1.0;
            queue.extend((0..n).filter(|&i| river(i) && hypot((i % w) as f64 + 0.5 - end.x, (i / w) as f64 + 0.5 - end.y) <= reach));
        }
        for &i in &queue {
            taken[i] = true;
        }
        while let Some(i) = queue.pop() {
            let (x, y) = (i % w, i / w);
            for (on, j) in [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)] {
                if on && !taken[j] && river(j) {
                    taken[j] = true;
                    queue.push(j);
                }
            }
        }
    }
    // A river the trough does not take in keeps its banks: ground the trough lowered within three tiles of it
    // stands at least at its surface (or as it was), so the trough never captures a river beside it.
    for i in 0..n {
        if kind[i] == 0 || kind[i] == 2 || land[i] >= old(i) || before.depth[i] > 0.05 {
            continue;
        }
        let (x, y) = ((i % w) as i64, (i / w) as i64);
        let mut stand = f64::NEG_INFINITY;
        for dy in -3i64..=3 {
            for dx in -3i64..=3 {
                let (xx, yy) = (x + dx, y + dy);
                if xx < 0 || yy < 0 || xx >= w as i64 || yy >= h as i64 {
                    continue;
                }
                let j = yy as usize * w + xx as usize;
                if river(j) && (!taken[j] || !zone[j]) {
                    stand = max(stand, (old(j) + before.depth[j] - 0.02).ceil());
                }
            }
        }
        if land[i] < stand {
            land[i] = min(old(i), stand);
        }
    }

    // The plan's record of what it shaped.
    for i in 0..n {
        let v = clamp(round(land[i]), 0.0, top) as u8;
        p.map.heights[i] = v;
        if zone[i] && kind[i] != 0 {
            let j = near[i] as usize;
            // (2: a bench, as the planner's; the rest of the trough, its walls too, 1)
            p.mask[i] = if kind[i] == 3 && benched[i] { 2 } else { 1 };
            p.floor[i] = clamp(floor[j], 0.0, top) as u8;
            p.arrival[i] = (line[j].s / length) as f32;
            p.stream[i] = if kind[i] == 2 { 1 } else if p.stream[i] == 1 { 0 } else { p.stream[i] };
        } else if p.map.heights[i] == before.heights[i] && (p.mask[i] == 1 || p.mask[i] == 2) && p.stream[i] == 0 && p.fan[i] == 0 {
            p.mask[i] = 0;
        }
    }
    // (each station's floor, the tread nearest it, so the showing reads the same floor)
    for q in p.path.iter_mut() {
        let mut bj = 0;
        let mut bd = f64::INFINITY;
        for (j, l) in line.iter().enumerate() {
            let d = hypot(l.x - q.x, l.y - q.y);
            if d < bd {
                bd = d;
                bj = j;
            }
        }
        q.floor = floor[bj];
    }
    p.stream_path = (0..ns)
        .step_by(2)
        .map(|j| Point { x: line[j].x + line[j].nx * course[j], y: line[j].y + line[j].ny * course[j] })
        .collect();

    // (closed: its springs' water, let settle on the land it leaves, would wet ground outside the trough that was
    // dry, as a sheet or a pond spilling from a trough with no way out)
    let closed = {
        let (wet, _) = force_prefill(&force_water_model(&p.map), Some(&p.retained));
        let mut out = 0usize;
        for i in 0..n {
            if !zone[i] && p.stream[i] == 0 && wet[i] > 0.02 && before.depth[i] <= 0.02 {
                out += 1;
            }
        }
        let inside = zone.iter().filter(|&&z| z).count();
        !drains && out > max(20.0, inside as f64 * 0.02) as usize
    };
    // What stood on ground this stage moved: a source or seep the glacier keeps rides it; the rest is swept.
    let mut entities = std::mem::take(&mut p.map.entities);
    entities.retain_mut(|e| {
        if e.x < 0.0 || e.y < 0.0 {
            return true;
        }
        let moved: Vec<usize> = p.map.footprint(e, 0).into_iter().filter(|&i| prev[i] != p.map.heights[i]).collect();
        // (a trough with no way out keeps no springs of its own: their water would fill it and spill over the land
        // round it)
        if closed && e.owner.as_ref() == "glaciate" && ride_source(e.template.as_ref()) {
            return false;
        }
        if moved.is_empty() || e.template.as_ref() == "StartingLocation" {
            return true;
        }
        let i = moved[0];
        if ride_source(e.template.as_ref()) && (s.ride || e.owner.as_ref() == "glaciate" || lake_of[i] >= 0) {
            e.z = ridden_level(e.z, prev[i] as f64, p.map.heights[i] as f64);
            return true;
        }
        false
    });
    p.map.entities = entities;
    let mut alive = vec![false; p.map.next_id.get()];
    for e in &p.map.entities {
        alive[e.id_key] = true;
    }
    p.map.fallen.retain(|f| alive[f.id_key]);
}
