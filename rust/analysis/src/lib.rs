//! The analysis kernels (PLAN §20 D381, D391; #157): the six scans generation and the checks repeat most,
//! the same bytes as the TypeScript they replaced (tag `ts-analysis-final`):
//!
//!  1 `distanceFrom` (math/grid.ts)        the chamfer (1, √2) distance from a mask
//!  2 `walkDistance` (analysis/walk.ts)    the colony's walk from the start's 3×3
//!  4 `landRegions` (analysis/regions.ts)  dry land joined by steps of one level
//!  7 `spillLevels` (sim/prefill.ts)       every tile's spill level (priority flood)
//!  8 `damSites` (analysis/damsites.ts)    the best dam per sampled channel tile
//!  9 `roomMap` (land/minePads.ts)         where a start has room for its mine sites
//!
//! One call is one kernel: `analysis_execute` reads a frame of binary64 values (the kernel, W, H, its
//! numbers, its arrays; src/core/analysis/rust/bridge.ts `encode`) and returns the result as binary64.
//! Traversal orders, tie-breaks and arithmetic follow the TypeScript exactly; no FMA, no approximate maths.
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::marker::PhantomData;
// A fixed, validated grid borrows its backing slice for its entire lifetime.
// No vector can grow while borrowed. Every access below is either 0..w*h,
// returned by neighbor(), or an interior square offset. Dynamic queues and
// site lists keep ordinary Rust checks. Wasm sandbox checks are unchanged.
struct Grid<'a, T> {
    ptr: *const T,
    #[allow(dead_code)] // read by the tests' bounds checks
    n: usize,
    borrow: PhantomData<&'a [T]>,
}
impl<'a, T> Grid<'a, T> {
    fn new(slice: &'a [T], n: usize) -> Self {
        assert_eq!(slice.len(), n, "grid shape");
        Self {
            ptr: slice.as_ptr(),
            n,
            borrow: PhantomData,
        }
    }
}
impl<T> std::ops::Index<usize> for Grid<'_, T> {
    type Output = T;
    #[inline(always)]
    fn index(&self, i: usize) -> &T {
        #[cfg(test)]
        assert!(i < self.n);
        unsafe { &*self.ptr.add(i) }
    }
}
struct GridMut<'a, T> {
    ptr: *mut T,
    #[allow(dead_code)]
    n: usize,
    borrow: PhantomData<&'a mut [T]>,
}
impl<'a, T> GridMut<'a, T> {
    fn new(slice: &'a mut [T], n: usize) -> Self {
        assert_eq!(slice.len(), n, "grid shape");
        Self {
            ptr: slice.as_mut_ptr(),
            n,
            borrow: PhantomData,
        }
    }
}
impl<T> std::ops::Index<usize> for GridMut<'_, T> {
    type Output = T;
    #[inline(always)]
    fn index(&self, i: usize) -> &T {
        #[cfg(test)]
        assert!(i < self.n);
        unsafe { &*self.ptr.add(i) }
    }
}
impl<T> std::ops::IndexMut<usize> for GridMut<'_, T> {
    #[inline(always)]
    fn index_mut(&mut self, i: usize) -> &mut T {
        #[cfg(test)]
        assert!(i < self.n);
        unsafe { &mut *self.ptr.add(i) }
    }
}
const S2: f64 = std::f64::consts::SQRT_2;
#[derive(Clone, Copy)]
struct Entry(f64, usize);
impl PartialEq for Entry {
    fn eq(&self, b: &Self) -> bool {
        self.0 == b.0 && self.1 == b.1
    }
}
impl Eq for Entry {}
impl PartialOrd for Entry {
    fn partial_cmp(&self, b: &Self) -> Option<Ordering> {
        Some(self.cmp(b))
    }
}
impl Ord for Entry {
    fn cmp(&self, b: &Self) -> Ordering {
        b.0.partial_cmp(&self.0)
            .unwrap()
            .then_with(|| b.1.cmp(&self.1))
    }
}
fn neighbor(c: usize, dx: isize, dy: isize, w: usize, h: usize) -> Option<usize> {
    let x = (c % w) as isize + dx;
    let y = (c / w) as isize + dy;
    if x < 0 || y < 0 || x >= w as isize || y >= h as isize {
        None
    } else {
        Some(y as usize * w + x as usize)
    }
}
fn adjacency(n: usize, links: &[f64]) -> Vec<Vec<usize>> {
    let mut a = vec![vec![]; n];
    for p in links.chunks_exact(2) {
        a[p[0] as usize].push(p[1] as usize);
        a[p[1] as usize].push(p[0] as usize);
    }
    a
}
fn distance(mask: &[f64], w: usize, h: usize) -> Vec<f64> {
    let mut d: Vec<f64> = mask
        .iter()
        .map(|&v| if v != 0.0 { 0.0 } else { f64::INFINITY })
        .collect();
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let mut v = d[i];
            if v == 0.0 {
                continue;
            }
            if x > 0 && d[i - 1] + 1.0 < v {
                v = d[i - 1] + 1.0
            }
            if y > 0 {
                let j = i - w;
                if d[j] + 1.0 < v {
                    v = d[j] + 1.0
                }
                if x > 0 && d[j - 1] + S2 < v {
                    v = d[j - 1] + S2
                }
                if x + 1 < w && d[j + 1] + S2 < v {
                    v = d[j + 1] + S2
                }
            }
            d[i] = v;
        }
    }
    for y in (0..h).rev() {
        for x in (0..w).rev() {
            let i = y * w + x;
            let mut v = d[i];
            if v == 0.0 {
                continue;
            }
            if x + 1 < w && d[i + 1] + 1.0 < v {
                v = d[i + 1] + 1.0
            }
            if y + 1 < h {
                let j = i + w;
                if d[j] + 1.0 < v {
                    v = d[j] + 1.0
                }
                if x + 1 < w && d[j + 1] + S2 < v {
                    v = d[j + 1] + S2
                }
                if x > 0 && d[j - 1] + S2 < v {
                    v = d[j - 1] + S2
                }
            }
            d[i] = v;
        }
    }
    d
}
fn walk(a: &[&[f64]], p: &[f64], w: usize, h: usize) -> Vec<f64> {
    let n = w * h;
    let ht = a[0];
    let blocked = a[1];
    let adj = adjacency(n, a[2]);
    let mut d = vec![f64::INFINITY; n];
    let mut heap = BinaryHeap::new();
    let sx = p[0] as isize;
    let sy = p[1] as isize;
    for y in sy - 1..=sy + 1 {
        for x in sx - 1..=sx + 1 {
            if x >= 0 && y >= 0 && x < w as isize && y < h as isize {
                let i = y as usize * w + x as usize;
                d[i] = 0.0;
                heap.push(Entry(0.0, i));
            }
        }
    }
    while let Some(Entry(k, c)) = heap.pop() {
        if k > d[c] {
            continue;
        }
        let lv = ht[c];
        for (dx, dy) in [
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ] {
            if let Some(v) = neighbor(c, dx, dy, w, h) {
                if blocked[v] != 0.0 || ht[v] != lv {
                    continue;
                }
                if dx != 0 && dy != 0 {
                    let q = neighbor(c, dx, 0, w, h).unwrap();
                    let r = neighbor(c, 0, dy, w, h).unwrap();
                    if blocked[q] != 0.0 || blocked[r] != 0.0 || ht[q] != lv || ht[r] != lv {
                        continue;
                    }
                }
                let nd = k + if dx != 0 && dy != 0 { S2 } else { 1.0 };
                if nd < d[v] && nd <= p[2] {
                    d[v] = nd;
                    heap.push(Entry(nd, v));
                }
            }
        }
        for &v in &adj[c] {
            if blocked[v] != 0.0 {
                continue;
            }
            let nd = k + 1.0;
            if nd < d[v] && nd <= p[2] {
                d[v] = nd;
                heap.push(Entry(nd, v));
            }
        }
    }
    d
}
// Labels are numbered in index order of each region's first tile, as the TypeScript numbers them.
fn land_regions(ht: &[f64], wet: &[f64], w: usize, h: usize) -> Vec<f64> {
    let n = w * h;
    let mut labels = vec![-1.0; n];
    let mut queue = Vec::with_capacity(n);
    let mut lab = 0.0;
    for s in 0..n {
        if labels[s] >= 0.0 || wet[s] != 0.0 {
            continue;
        }
        labels[s] = lab;
        queue.clear();
        queue.push(s);
        let mut head = 0;
        while head < queue.len() {
            let c = queue[head];
            head += 1;
            for (dx, dy) in [(0, 1), (0, -1), (1, 0), (-1, 0)] {
                if let Some(v) = neighbor(c, dx, dy, w, h) {
                    if labels[v] < 0.0 && wet[v] == 0.0 && (ht[v] - ht[c]).abs() <= 1.0 {
                        labels[v] = lab;
                        queue.push(v);
                    }
                }
            }
        }
        lab += 1.0;
    }
    labels
}
fn spill(a: &[&[f64]], w: usize, h: usize) -> Vec<f64> {
    let n = w * h;
    let mut filled: Vec<f64> = (0..n)
        .map(|i| a[0][i] + if a[1][i] >= 0.0 { a[1][i] } else { 0.0 })
        .collect();
    let mut seen = vec![false; n];
    let mut heap = BinaryHeap::new();
    for i in 0..n {
        let x = i % w;
        let y = i / w;
        if (x == 0 || y == 0 || x == w - 1 || y == h - 1) && a[2][i] == 0.0 {
            seen[i] = true;
            heap.push(Entry(filled[i], i));
        }
    }
    while let Some(Entry(lv, c)) = heap.pop() {
        for (dx, dy) in [(0, -1), (-1, 0), (0, 1), (1, 0)] {
            if let Some(v) = neighbor(c, dx, dy, w, h) {
                if seen[v] {
                    continue;
                }
                seen[v] = true;
                if filled[v] < lv {
                    filled[v] = lv
                }
                heap.push(Entry(filled[v], v));
            }
        }
    }
    filled
}
#[derive(Clone)]
struct Dam {
    x: usize,
    y: usize,
    dy: isize,
    dx: isize,
    height: f64,
    length: usize,
    area: usize,
    volume: f64,
    ratio: f64,
}
fn candidate(
    ht: &Grid<'_, f64>,
    surface: &Grid<'_, f64>,
    w: usize,
    h: usize,
    c: usize,
    dy: isize,
    dx: isize,
    height: f64,
    seen: &mut GridMut<'_, usize>,
    mark: &mut usize,
    queue: &mut Vec<usize>,
    max_flood: usize,
) -> Option<Dam> {
    let crest = ht[c] + height;
    let mut line = vec![c];
    for sgn in [1, -1] {
        let mut k = 1;
        loop {
            let v = neighbor(c, sgn * k * dx, sgn * k * dy, w, h)?;
            if k > 10 {
                return None;
            }
            if ht[v] >= crest {
                break;
            }
            line.push(v);
            k += 1;
        }
    }
    let (py, px) = if dy == 0 { (1, 0) } else { (0, 1) };
    let mut sides = vec![];
    for (sy, sx) in [(py, px), (-py, -px)] {
        if let Some(v) = neighbor(c, sx, sy, w, h) {
            if !line.contains(&v) {
                sides.push(v)
            }
        }
    }
    if sides.len() < 2 {
        return None;
    }
    let up = if surface[sides[1]] > surface[sides[0]] {
        sides[1]
    } else {
        sides[0]
    };
    let down = if surface[sides[1]] < surface[sides[0]] {
        sides[1]
    } else {
        sides[0]
    };
    if ht[up] >= crest {
        return None;
    }
    *mark += 1;
    seen[up] = *mark;
    let mut count = 1;
    queue.clear();
    queue.push(up);
    let mut head = 0;
    let mut vol = 0.0;
    while head < queue.len() {
        let q = queue[head];
        head += 1;
        vol += crest - ht[q];
        if count > max_flood {
            return None;
        }
        for (ddy, ddx) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let v = neighbor(q, ddx, ddy, w, h)?;
            if seen[v] == *mark || line.contains(&v) || ht[v] >= crest {
                continue;
            }
            if v == down {
                return None;
            }
            seen[v] = *mark;
            count += 1;
            queue.push(v);
        }
    }
    Some(Dam {
        x: c % w,
        y: c / w,
        dy,
        dx,
        height,
        length: line.len(),
        area: count,
        volume: vol,
        ratio: vol / line.len() as f64,
    })
}
fn dams(a: &[&[f64]], p: &[f64], w: usize, h: usize) -> Vec<f64> {
    let n = w * h;
    let ht = Grid::new(a[0], n);
    let channel = Grid::new(a[1], n);
    let surface = Grid::new(a[2], n);
    let sd = if a[3].is_empty() {
        None
    } else {
        Some(Grid::new(a[3], n))
    };
    let mut found = vec![];
    let mut seen_values = vec![0; n];
    let mut seen = GridMut::new(&mut seen_values, n);
    let mut mark = 0;
    let mut queue = Vec::with_capacity(w * h);
    let mut k = 0;
    let max_flood = 6000.max((0.15 * w as f64 * h as f64).floor() as usize);
    for i in 0..w * h {
        if channel[i] == 0.0 {
            continue;
        }
        let sampled = k % p[1] as usize == 0;
        k += 1;
        if !sampled || sd.as_ref().is_some_and(|v| v[i] > p[0]) {
            continue;
        }
        let mut best: Option<Dam> = None;
        for &height in a[4] {
            for (dy, dx) in [(1, 0), (0, 1), (1, 1), (1, -1)] {
                if let Some(c) = candidate(
                    &ht, &surface, w, h, i, dy, dx, height, &mut seen, &mut mark, &mut queue,
                    max_flood,
                ) {
                    if (p[3] <= 0.0 || c.volume / c.area as f64 >= p[3])
                        && (best.is_none() || c.ratio > best.as_ref().unwrap().ratio)
                    {
                        best = Some(c)
                    }
                }
            }
        }
        if let Some(c) = best {
            if c.ratio >= p[2] {
                found.push(c)
            }
        }
    }
    found.sort_by(|a, b| b.ratio.partial_cmp(&a.ratio).unwrap());
    let mut kept: Vec<Dam> = vec![];
    for c in found {
        if kept
            .iter()
            .all(|q| c.x.abs_diff(q.x).max(c.y.abs_diff(q.y)) >= 8)
        {
            kept.push(c)
        }
    }
    let mut out = vec![];
    for c in kept {
        out.extend([
            c.x as f64,
            c.y as f64,
            c.dy as f64,
            c.dx as f64,
            c.height,
            c.length as f64,
            c.area as f64,
            c.volume,
            c.ratio,
        ]);
    }
    out
}
fn near_water(wet: &[f64], w: usize, h: usize, margin: usize) -> Vec<f64> {
    let n = w * h;
    let wet = Grid::new(wet, n);
    let mut row_values = vec![0.0; n];
    let mut out_values = vec![0.0; n];
    let mut rows = GridMut::new(&mut row_values, n);
    let mut out = GridMut::new(&mut out_values, n);
    let margin = margin as isize;
    for y in 0..h {
        let mut last = -(w as isize) - margin - 1;
        for x in 0..w {
            if wet[y * w + x] > 0.05 {
                last = x as isize
            }
            if x as isize - last <= margin {
                rows[y * w + x] = 1.0
            }
        }
        let mut last = w as isize + margin + 1;
        for x in (0..w).rev() {
            if wet[y * w + x] > 0.05 {
                last = x as isize
            }
            if last - x as isize <= margin {
                rows[y * w + x] = 1.0
            }
        }
    }
    for x in 0..w {
        let mut last = -(h as isize) - margin - 1;
        for y in 0..h {
            if rows[y * w + x] != 0.0 {
                last = y as isize
            }
            if y as isize - last <= margin {
                out[y * w + x] = 1.0
            }
        }
        let mut last = h as isize + margin + 1;
        for y in (0..h).rev() {
            if rows[y * w + x] != 0.0 {
                last = y as isize
            }
            if last - y as isize <= margin {
                out[y * w + x] = 1.0
            }
        }
    }
    out_values
}
// A mine site's distance from a start (resources/mineGround.ts `mineDistance`): from the start's 7×7 zone,
// one per straight step and √2 − 1 more per diagonal one.
// (integer steps, then binary64 as the TypeScript computes it; no fmin or fmax)
fn mine_distance(sx: usize, sy: usize, cx: usize, cy: usize) -> f64 {
    let dx = sx.abs_diff(cx).saturating_sub(3);
    let dy = sy.abs_diff(cy).saturating_sub(3);
    dx.max(dy) as f64 + (S2 - 1.0) * dx.min(dy) as f64
}
// How far apart two sites' squares stand at least (Chebyshev; land/minePads.ts `APART`).
const APART: usize = 10;
fn room(a: &[&[f64]], p: &[f64], w: usize, h: usize) -> Vec<f64> {
    let n = w * h;
    let ht = Grid::new(a[0], n);
    let wet = Grid::new(a[1], n);
    let keep = Grid::new(a[2], n);
    let firm = p[2] as usize;
    let water_values = if firm > 0 {
        near_water(a[1], w, h, firm)
    } else {
        a[1].iter()
            .map(|&v| if v > 0.05 { 1.0 } else { 0.0 })
            .collect()
    };
    let mut land_values = land_regions(a[0], &water_values, w, h);
    let water = Grid::new(&water_values, n);
    let mut land = GridMut::new(&mut land_values, n);
    if firm > 0 {
        for i in 0..w * h {
            if land[i] >= 0.0 || wet[i] > 0.05 {
                continue;
            }
            let mut r = 1;
            while r <= firm + 1 && land[i] < 0.0 {
                for dy in -(r as isize)..=r as isize {
                    if land[i] >= 0.0 {
                        break;
                    }
                    for dx in -(r as isize)..=r as isize {
                        if land[i] >= 0.0 {
                            break;
                        }
                        if dx.abs().max(dy.abs()) != r as isize {
                            continue;
                        }
                        if let Some(v) = neighbor(i, dx, dy, w, h) {
                            if water[v] == 0.0 && land[v] >= 0.0 {
                                land[i] = land[v]
                            }
                        }
                    }
                }
                r += 1;
            }
        }
    }
    let near_values = near_water(a[1], w, h, 3);
    let near = Grid::new(&near_values, n);
    let mut by_land = vec![vec![]; w * h];
    let cheb = |a: usize, b: usize| (a % w).abs_diff(b % w).max((a / w).abs_diff(b / w));
    if w > 10 && h > 10 {
        for cy in 5..h - 5 {
            for cx in 5..w - 5 {
                let c = cy * w + cx;
                if land[c] < 0.0 {
                    continue;
                }
                let mut ok = true;
                let level = ht[c];
                let label = land[c];
                'square: for dy in -3..=3 {
                    for dx in -3..=3 {
                        // c is at least five tiles from all edges; +/-3 is interior.
                        let v = (c as isize + dy * w as isize + dx) as usize;
                        if near[v] != 0.0 || keep[v] != 0.0 || land[v] != label || ht[v] != level {
                            ok = false;
                            break 'square;
                        }
                    }
                }
                if ok {
                    let list = &mut by_land[land[c] as usize];
                    if list.iter().all(|&v| cheb(v, c) >= 4) {
                        list.push(c)
                    }
                }
            }
        }
    }
    // (each square's coordinates once, in the list's order)
    let coordinates: Vec<Vec<(usize, usize, usize)>> = by_land
        .iter()
        .map(|list| list.iter().map(|&c| (c, c % w, c / w)).collect())
        .collect();
    let want = p[0];
    let lo = p[1];
    let mut out = vec![0.0; w * h];
    for i in 0..w * h {
        if land[i] < 0.0 {
            continue;
        }
        let list = &coordinates[land[i] as usize];
        let (x, y) = (i % w, i / w);
        let mut count = 0;
        let mut x0 = usize::MAX;
        let mut x1 = 0;
        let mut y0 = usize::MAX;
        let mut y1 = 0;
        let mut far = vec![];
        for &(c, cx, cy) in list {
            if mine_distance(x, y, cx, cy) < lo {
                continue;
            }
            count += 1;
            if want > 2.0 {
                far.push(c)
            }
            x0 = x0.min(cx);
            x1 = x1.max(cx);
            y0 = y0.min(cy);
            y1 = y1.max(cy);
            // (the answer is monotone for one or two sites: more squares cannot undo it)
            if want <= 1.0 || (want == 2.0 && (x1 - x0 >= APART || y1 - y0 >= APART)) {
                break;
            }
        }
        if count == 0 {
            continue;
        }
        if want <= 1.0 {
            out[i] = 1.0
        } else if want == 2.0 {
            out[i] = if x1 - x0 >= APART || y1 - y0 >= APART { 1.0 } else { 0.0 }
        } else {
            let mut taken = vec![];
            for c in far {
                if taken.iter().all(|&v| cheb(v, c) >= APART) {
                    taken.push(c)
                }
            }
            if taken.len() as f64 >= want {
                out[i] = 1.0
            }
        }
    }
    out
}
/// Runs one kernel on its frame: [kernel, W, H, number of parameters, parameters…, number of arrays,
/// (length, values…) per array]. Panics (a trap in WebAssembly) on a malformed frame.
pub fn execute(input: &[f64]) -> Vec<f64> {
    fn integer(v: f64) -> usize {
        assert!(
            v.is_finite() && v >= 0.0 && v.floor() == v && v < usize::MAX as f64,
            "integer header/index"
        );
        v as usize
    }
    assert!(input.len() >= 5, "short header");
    let op = integer(input[0]);
    let w = integer(input[1]);
    let h = integer(input[2]);
    assert!(w > 0 && h > 0, "positive dimensions");
    let cells = w.checked_mul(h).expect("dimension overflow");
    assert!(
        cells <= isize::MAX as usize / std::mem::size_of::<f64>(),
        "grid address range"
    );
    let np = integer(input[3]);
    let end = 4usize.checked_add(np).expect("parameter overflow");
    let p = &input[4..end];
    let mut at = end;
    let na = integer(input[at]);
    at += 1;
    let mut a = vec![];
    for _ in 0..na {
        let n = integer(input[at]);
        at += 1;
        let end = at.checked_add(n).expect("array overflow");
        a.push(&input[at..end]);
        at = end;
    }
    assert_eq!(at, input.len());
    // (parameters, arrays, of which grids)
    let (params, arrays, grids) = match op {
        1 => (0, 1, 1),
        2 => (3, 3, 2),
        4 => (0, 2, 2),
        7 => (0, 3, 3),
        8 => (4, 5, 3),
        9 => (3, 3, 3),
        _ => panic!("unknown kernel"),
    };
    assert_eq!(p.len(), params, "parameter shape");
    assert_eq!(a.len(), arrays, "array count");
    for grid in a.iter().take(grids) {
        assert_eq!(grid.len(), cells, "grid shape");
    }
    if op == 2 {
        assert_eq!(a[2].len() % 2, 0, "link pairs");
        for &index in a[2] {
            assert!(integer(index) < cells, "link index");
        }
    }
    if op == 8 {
        assert!(a[3].is_empty() || a[3].len() == cells, "distance shape");
        assert!(integer(p[1]) > 0, "positive stride");
    }
    if op == 9 {
        assert!(integer(p[2]) <= isize::MAX as usize / 8, "firm radius");
    }
    match op {
        1 => distance(a[0], w, h),
        2 => walk(&a, p, w, h),
        4 => land_regions(a[0], a[1], w, h),
        7 => spill(&a, w, h),
        8 => dams(&a, p, w, h),
        9 => room(&a, p, w, h),
        _ => unreachable!(),
    }
}

/// The kernels as Rust functions, for the other ports (rust/checks; the `kernels` feature, so this crate's
/// own Wasm stays as it is): the computations `execute` runs, and the two floods the checks share with
/// analysis/regions.ts (`walkRegions`, `components`). Grids are binary64, one value per tile, row by row; a
/// mask is set where its value is not 0.
#[cfg(feature = "kernels")]
pub mod kernels {
    use super::*;

    /// `distanceFrom` (math/grid.ts): the chamfer (1, √2) distance from the set tiles of `mask`.
    pub fn distance_from(mask: &[f64], w: usize, h: usize) -> Vec<f64> {
        distance(mask, w, h)
    }
    /// `walkDistance` (analysis/walk.ts): the walk from the 3×3 around (`sx`, `sy`), at most `limit`; `links` are
    /// slope links as (low tile, high tile) pairs of tiles on the map.
    #[allow(clippy::too_many_arguments)]
    pub fn walk_distance(ht: &[f64], blocked: &[f64], links: &[f64], sx: f64, sy: f64, limit: f64, w: usize, h: usize) -> Vec<f64> {
        walk(&[ht, blocked, links], &[sx, sy, limit], w, h)
    }
    /// `landRegions` (analysis/regions.ts).
    pub fn land_regions_of(ht: &[f64], wet: &[f64], w: usize, h: usize) -> Vec<f64> {
        land_regions(ht, wet, w, h)
    }
    /// `spillLevels` (sim/prefill.ts): `dam` is −1 where there is none.
    pub fn spill_levels(floor: &[f64], dam: &[f64], emitting: &[f64], w: usize, h: usize) -> Vec<f64> {
        spill(&[floor, dam, emitting], w, h)
    }
    /// `damSites` (analysis/damsites.ts), its result packed as `execute` returns it.
    #[allow(clippy::too_many_arguments)]
    pub fn dam_sites(ht: &[f64], channel: &[f64], surface: &[f64], start_distance: &[f64], heights: &[f64], p: [f64; 4], w: usize, h: usize) -> Vec<f64> {
        dams(&[ht, channel, surface, start_distance, heights], &p, w, h)
    }
    /// `walkRegions` (analysis/regions.ts): land walkable on foot, 4-neighbour moves between tiles of the same
    /// level and the slope `links` (pairs of tiles); `blocked` tiles are never entered. Labels in index order of
    /// each region's first tile, −1 on blocked tiles.
    pub fn walk_regions(ht: &[f64], blocked: &[f64], links: &[f64], w: usize, h: usize) -> Vec<f64> {
        let n = w * h;
        let adj = adjacency(n, links);
        let mut labels = vec![-1.0; n];
        let mut queue = Vec::with_capacity(n);
        let mut lab = 0.0;
        for s in 0..n {
            if labels[s] >= 0.0 || blocked[s] != 0.0 {
                continue;
            }
            labels[s] = lab;
            queue.clear();
            queue.push(s);
            let mut head = 0;
            while head < queue.len() {
                let c = queue[head];
                head += 1;
                for (dx, dy) in [(0, 1), (0, -1), (1, 0), (-1, 0)] {
                    if let Some(v) = neighbor(c, dx, dy, w, h) {
                        if labels[v] < 0.0 && ht[v] == ht[c] && blocked[v] == 0.0 {
                            labels[v] = lab;
                            queue.push(v);
                        }
                    }
                }
                for &v in &adj[c] {
                    if labels[v] < 0.0 && blocked[v] == 0.0 {
                        labels[v] = lab;
                        queue.push(v);
                    }
                }
            }
            lab += 1.0;
        }
        labels
    }
    /// `components` (analysis/regions.ts): the connected set tiles of `mask`, 4- or 8-connected. Returns the
    /// labels (−1 on unset tiles, numbered in index order of each one's first tile) and each label's size.
    pub fn components(mask: &[f64], eight: bool, w: usize, h: usize) -> (Vec<f64>, Vec<f64>) {
        let n = w * h;
        let mut labels = vec![-1.0; n];
        let mut sizes = vec![];
        let mut queue = Vec::with_capacity(n);
        for s in 0..n {
            if mask[s] == 0.0 || labels[s] >= 0.0 {
                continue;
            }
            let lab = sizes.len() as f64;
            labels[s] = lab;
            queue.clear();
            queue.push(s);
            let mut head = 0;
            while head < queue.len() {
                let c = queue[head];
                head += 1;
                for dy in -1..=1isize {
                    for dx in -1..=1isize {
                        if (dx == 0 && dy == 0) || (!eight && dx != 0 && dy != 0) {
                            continue;
                        }
                        if let Some(v) = neighbor(c, dx, dy, w, h) {
                            if mask[v] != 0.0 && labels[v] < 0.0 {
                                labels[v] = lab;
                                queue.push(v);
                            }
                        }
                    }
                }
            }
            sizes.push(queue.len() as f64);
        }
        (labels, sizes)
    }
}

#[cfg(test)]
mod guards {
    use super::*;
    #[test]
    fn rejects_short_and_fractional_headers() {
        for input in [
            vec![],
            vec![1., 1.5, 1., 0., 1., 1., 0.],
            vec![1., 0., 1., 0., 1., 0.],
            vec![3., 1., 1., 0., 1., 1., 0.],
        ] {
            assert!(std::panic::catch_unwind(|| execute(&input)).is_err());
        }
    }
    #[test]
    fn rejects_room_shape_before_raw_access() {
        let input = [
            9., 2., 2., 3., 1., 2., 0., 3., 4., 0., 0., 0., 0., 1., 0., 4., 0., 0., 0., 0.,
        ];
        assert!(std::panic::catch_unwind(|| execute(&input)).is_err());
        assert!(std::panic::catch_unwind(|| Grid::new(&[1., 2.], 3)).is_err());
    }
    #[test]
    fn rejects_link_indices() {
        let input = [2., 1., 1., 3., 0., 0., 64., 3., 1., 0., 1., 0., 2., 0., 1.];
        assert!(std::panic::catch_unwind(|| execute(&input)).is_err());
    }
    #[test]
    fn distance_on_a_small_grid() {
        // a 3×1 strip, the middle set
        assert_eq!(execute(&[1., 3., 1., 0., 1., 3., 0., 1., 0.]), vec![1., 0., 1.]);
        // nothing set: no distance anywhere
        assert!(execute(&[1., 2., 1., 0., 1., 2., 0., 0.]).iter().all(|d| d.is_infinite()));
    }
    #[test]
    fn mine_distance_counts_from_the_zone() {
        assert_eq!(mine_distance(10, 10, 13, 13), 0.0);
        assert_eq!(mine_distance(10, 10, 20, 10), 7.0);
        assert_eq!(mine_distance(10, 10, 20, 20), 7.0 + (S2 - 1.0) * 7.0);
    }
}
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn analysis_alloc(n: usize) -> *mut f64 {
    let b = vec![0.0; n].into_boxed_slice();
    Box::into_raw(b) as *mut f64
}
/// # Safety
/// `p` and `n` come from `analysis_alloc` (or `analysis_execute`'s result and its length), freed once.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn analysis_free(p: *mut f64, n: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(p, n)));
}
/// # Safety
/// `p` holds `n` values (from `analysis_alloc`); `out_len` is writable. The result is freed with
/// `analysis_free(result, *out_len)`.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn analysis_execute(p: *const f64, n: usize, out_len: *mut usize) -> *mut f64 {
    let out = execute(std::slice::from_raw_parts(p, n)).into_boxed_slice();
    *out_len = out.len();
    Box::into_raw(out) as *mut f64
}
