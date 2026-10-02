//! Exact M9b kernels. One source is compiled as Wasm library and native executable.
//! All arithmetic and traversal order mirrors e292cefe. No FMA or approximate maths.
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::marker::PhantomData;
// A fixed, validated grid borrows its backing slice for its entire lifetime.
// No vector can grow while borrowed. Every access below is either 0..w*h,
// returned by neighbor(), or an interior square offset. Dynamic queues and
// site lists keep ordinary Rust checks. Wasm sandbox checks are unchanged.
struct Grid<'a, T> {
    ptr: *const T,
    #[allow(dead_code)] // Read by checked_grid diagnostic and test builds.
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
        #[cfg(any(test, checked_grid))]
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
        #[cfg(any(test, checked_grid))]
        assert!(i < self.n);
        unsafe { &*self.ptr.add(i) }
    }
}
impl<T> std::ops::IndexMut<usize> for GridMut<'_, T> {
    #[inline(always)]
    fn index_mut(&mut self, i: usize) -> &mut T {
        #[cfg(any(test, checked_grid))]
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
// Region ids and list ordering are part of the interface, not just connectivity.
fn regions(op: usize, a: &[&[f64]], p: &[f64], w: usize, h: usize) -> Vec<f64> {
    let n = w * h;
    let ht = a[0];
    let empty = vec![0.0; n];
    let blocked = if op == 3 || op == 4 { a[1] } else { &empty };
    let adj = if op == 3 {
        adjacency(n, a[2])
    } else {
        vec![vec![]; n]
    };
    let mut labels = vec![-1.0; n];
    let mut sizes = vec![];
    let mut levels = vec![];
    let mut queue = Vec::with_capacity(n);
    let dirs: Vec<(isize, isize)> = if op == 5 {
        (-1..=1)
            .flat_map(|dy| {
                (-1..=1).filter_map(move |dx| {
                    if (dx != 0 || dy != 0) && (p[0] != 0.0 || dx == 0 || dy == 0) {
                        Some((dx, dy))
                    } else {
                        None
                    }
                })
            })
            .collect()
    } else if op == 6 {
        vec![(1, 0), (-1, 0), (0, 1), (0, -1)]
    } else {
        vec![(0, 1), (0, -1), (1, 0), (-1, 0)]
    };
    for s in 0..n {
        if labels[s] >= 0.0 || blocked[s] != 0.0 || (op == 5 && ht[s] == 0.0) {
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
            for &(dx, dy) in &dirs {
                if let Some(v) = neighbor(c, dx, dy, w, h) {
                    let allowed = if op == 5 {
                        ht[v] != 0.0
                    } else if op == 4 {
                        (ht[v] - ht[c]).abs() <= 1.0
                    } else {
                        ht[v] == ht[c]
                    };
                    if labels[v] < 0.0 && blocked[v] == 0.0 && allowed {
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
        sizes.push(queue.len() as f64);
        levels.push(ht[s]);
    }
    if op == 3 || op == 4 {
        return labels;
    }
    labels.push(sizes.len() as f64);
    if op == 6 {
        labels.extend(levels)
    }
    labels.extend(sizes);
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
    let mut land_values = regions(4, &[a[0], &water_values], &[], w, h);
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
    let reach = p[1] + 4.5;
    let reach2 = reach * reach;
    // Preserve list order and the exact integer->f64 conversion, hoisting the
    // repeated divisions and conversions out of the per-start candidate scan.
    let coordinates: Vec<Vec<(usize, f64, f64)>> = by_land
        .iter()
        .map(|list| {
            list.iter()
                .map(|&c| (c, (c % w) as f64, (c / w) as f64))
                .collect()
        })
        .collect();
    let mut out = vec![0.0; w * h];
    for i in 0..w * h {
        if land[i] < 0.0 {
            continue;
        }
        let list = &coordinates[land[i] as usize];
        let ix = (i % w) as f64;
        let iy = (i / w) as f64;
        let mut count = 0;
        let mut x0 = f64::INFINITY;
        let mut x1 = f64::NEG_INFINITY;
        let mut y0 = f64::INFINITY;
        let mut y1 = f64::NEG_INFINITY;
        let mut far = vec![];
        for &(c, cx, cy) in list {
            let dx = cx - ix;
            let dy = cy - iy;
            if dx * dx + dy * dy < reach2 {
                continue;
            }
            count += 1;
            if p[0] <= 1.0 {
                break;
            }
            if p[0] > 2.0 {
                far.push(c)
            }
            if cx < x0 {
                x0 = cx
            }
            if cx > x1 {
                x1 = cx
            }
            if cy < y0 {
                y0 = cy
            }
            if cy > y1 {
                y1 = cy
            }
        }
        if count == 0 {
            continue;
        }
        if p[0] <= 1.0 {
            out[i] = 1.0
        } else if p[0] == 2.0 {
            out[i] = if x1 - x0 >= 10.0 || y1 - y0 >= 10.0 {
                1.0
            } else {
                0.0
            }
        } else {
            let mut taken = vec![];
            for c in far {
                if taken.iter().all(|&v| cheb(v, c) >= 10) {
                    taken.push(c)
                }
            }
            if taken.len() as f64 >= p[0] {
                out[i] = 1.0
            }
        }
    }
    out
}
pub fn execute(input: &[f64]) -> Vec<f64> {
    fn integer(v: f64) -> usize {
        assert!(
            v.is_finite() && v >= 0.0 && v.fract() == 0.0 && v < usize::MAX as f64,
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
    let (params, arrays, grids) = match op {
        1 => (0, 1, 1),
        2 => (3, 3, 2),
        3 => (0, 3, 2),
        4 => (0, 2, 2),
        5 => (1, 1, 1),
        6 => (0, 1, 1),
        7 => (0, 3, 3),
        8 => (4, 5, 3),
        9 => (3, 3, 3),
        _ => panic!("unknown opcode"),
    };
    assert_eq!(p.len(), params, "parameter shape");
    assert_eq!(a.len(), arrays, "array count");
    for grid in a.iter().take(grids) {
        assert_eq!(grid.len(), cells, "grid shape");
    }
    if op == 2 || op == 3 {
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
        3..=6 => regions(op, &a, p, w, h),
        7 => spill(&a, w, h),
        8 => dams(&a, p, w, h),
        9 => room(&a, p, w, h),
        _ => panic!("unknown opcode"),
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
        let input = [3., 1., 1., 0., 3., 1., 0., 1., 0., 2., 0., 1.];
        assert!(std::panic::catch_unwind(|| execute(&input)).is_err());
    }
}
#[no_mangle]
pub extern "C" fn analysis_alloc(n: usize) -> *mut f64 {
    let b = vec![0.0; n].into_boxed_slice();
    Box::into_raw(b) as *mut f64
}
#[no_mangle]
pub unsafe extern "C" fn analysis_free(p: *mut f64, n: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(p, n)));
}
#[no_mangle]
pub unsafe extern "C" fn analysis_execute(
    p: *const f64,
    n: usize,
    out_len: *mut usize,
) -> *mut f64 {
    let out = execute(std::slice::from_raw_parts(p, n)).into_boxed_slice();
    *out_len = out.len();
    Box::into_raw(out) as *mut f64
}

// Native frame stream reuses rust-water's manifest/independent-map scheduling contract.
#[cfg(addon)]
mod rust_water {
    include!("local/rust-water.rs");
}
#[cfg(addon)]
mod napi {
    use super::*;
    use std::{
        ffi::{c_char, c_void},
        ptr,
    };
    type Env = *mut c_void;
    type Value = *mut c_void;
    type Info = *mut c_void;
    type Callback = unsafe extern "C" fn(Env, Info) -> Value;
    extern "C" {
        fn napi_get_cb_info(
            e: Env,
            i: Info,
            n: *mut usize,
            a: *mut Value,
            this: *mut Value,
            data: *mut *mut c_void,
        ) -> i32;
        fn napi_get_buffer_info(e: Env, v: Value, p: *mut *mut c_void, n: *mut usize) -> i32;
        fn napi_create_buffer_copy(
            e: Env,
            n: usize,
            p: *const c_void,
            data: *mut *mut c_void,
            out: *mut Value,
        ) -> i32;
        fn napi_create_function(
            e: Env,
            name: *const c_char,
            n: usize,
            f: Callback,
            data: *mut c_void,
            out: *mut Value,
        ) -> i32;
        fn napi_set_named_property(e: Env, o: Value, name: *const c_char, v: Value) -> i32;
        fn napi_create_external(
            e: Env,
            p: *mut c_void,
            f: unsafe extern "C" fn(Env, *mut c_void, *mut c_void),
            hint: *mut c_void,
            out: *mut Value,
        ) -> i32;
        fn napi_get_value_external(e: Env, v: Value, p: *mut *mut c_void) -> i32;
        fn napi_get_undefined(e: Env, out: *mut Value) -> i32;
    }
    unsafe fn args(e: Env, i: Info) -> Vec<Value> {
        let mut a = vec![ptr::null_mut(); 8];
        let mut n = a.len();
        assert_eq!(
            napi_get_cb_info(
                e,
                i,
                &mut n,
                a.as_mut_ptr(),
                ptr::null_mut(),
                ptr::null_mut()
            ),
            0
        );
        a.truncate(n);
        a
    }
    unsafe fn buffer<'a>(e: Env, v: Value) -> &'a [u8] {
        let mut p = ptr::null_mut();
        let mut n = 0;
        assert_eq!(napi_get_buffer_info(e, v, &mut p, &mut n), 0);
        std::slice::from_raw_parts(p as *const u8, n)
    }
    fn numbers(b: &[u8]) -> Vec<f64> {
        b.chunks_exact(8)
            .map(|b| f64::from_le_bytes(b.try_into().unwrap()))
            .collect()
    }
    unsafe fn output(e: Env, b: &[u8]) -> Value {
        let mut v = ptr::null_mut();
        assert_eq!(
            napi_create_buffer_copy(
                e,
                b.len(),
                b.as_ptr() as *const c_void,
                ptr::null_mut(),
                &mut v
            ),
            0
        );
        v
    }
    unsafe extern "C" fn analysis(e: Env, i: Info) -> Value {
        let a = args(e, i);
        let values = execute(&numbers(buffer(e, a[0])));
        let bytes: Vec<u8> = values.into_iter().flat_map(f64::to_le_bytes).collect();
        output(e, &bytes)
    }
    struct Handle(Option<Box<rust_water::Sim>>);
    unsafe extern "C" fn finalize(_: Env, p: *mut c_void, _: *mut c_void) {
        drop(Box::from_raw(p as *mut Handle));
    }
    unsafe fn handle<'a>(e: Env, v: Value) -> &'a mut Handle {
        let mut p = ptr::null_mut();
        assert_eq!(napi_get_value_external(e, v, &mut p), 0);
        &mut *(p as *mut Handle)
    }
    unsafe extern "C" fn water_new(e: Env, i: Info) -> Value {
        let a = args(e, i);
        let b = buffer(e, a[0]);
        let sim = Box::from_raw(rust_water::water_new(b.as_ptr(), b.len()));
        let p = Box::into_raw(Box::new(Handle(Some(sim))));
        let mut v = ptr::null_mut();
        assert_eq!(
            napi_create_external(e, p as *mut c_void, finalize, ptr::null_mut(), &mut v),
            0
        );
        v
    }
    unsafe extern "C" fn water_run(e: Env, i: Info) -> Value {
        let a = args(e, i);
        let s = handle(e, a[0]).0.as_mut().expect("disposed");
        let values = numbers(buffer(e, a[1]));
        let ticks = values[0] as u64;
        let scale = values[1];
        let mut at = 2;
        s.floor.copy_from_slice(&values[at..at + s.n]);
        at += s.n;
        if let Some(dam) = s.dam.as_mut() {
            dam.copy_from_slice(&values[at..at + s.n]);
            at += s.n;
        }
        s.out.copy_from_slice(&values[at..at + 4 * s.n]);
        at += 4 * s.n;
        for emitter in &mut s.emitters {
            emitter.strength = values[at];
            emitter.contamination = values[at + 1];
            emitter.limit = if values[at + 2] < 0.0 {
                None
            } else {
                Some((values[at + 2] as usize, values[at + 3], values[at + 4]))
            };
            at += 5;
        }
        assert_eq!(at, values.len());
        s.run(ticks, scale);
        let bytes: Vec<u8> =
            s.d.iter()
                .chain(&s.c)
                .chain(&s.old)
                .chain(&s.out)
                .copied()
                .flat_map(f64::to_le_bytes)
                .chain(s.seep.iter().copied())
                .collect();
        output(e, &bytes)
    }
    unsafe extern "C" fn water_sat(e: Env, i: Info) -> Value {
        let a = args(e, i);
        output(
            e,
            &handle(e, a[0]).0.as_ref().expect("disposed").saturation(),
        )
    }
    unsafe extern "C" fn water_dispose(e: Env, i: Info) -> Value {
        let a = args(e, i);
        handle(e, a[0]).0.take();
        let mut v = ptr::null_mut();
        napi_get_undefined(e, &mut v);
        v
    }
    #[no_mangle]
    pub unsafe extern "C" fn napi_register_module_v1(e: Env, exports: Value) -> Value {
        for (name, f) in [
            (b"execute\0" as &[u8], analysis as Callback),
            (b"waterNew\0", water_new as Callback),
            (b"waterRun\0", water_run as Callback),
            (b"waterSat\0", water_sat as Callback),
            (b"waterDispose\0", water_dispose as Callback),
        ] {
            let mut v = ptr::null_mut();
            assert_eq!(
                napi_create_function(
                    e,
                    name.as_ptr() as *const c_char,
                    name.len() - 1,
                    f,
                    ptr::null_mut(),
                    &mut v
                ),
                0
            );
            assert_eq!(
                napi_set_named_property(e, exports, name.as_ptr() as *const c_char, v),
                0
            );
        }
        exports
    }
}
#[cfg(not(target_arch = "wasm32"))]
fn main() {
    use std::{
        env, fs,
        sync::{
            atomic::{AtomicUsize, Ordering as AO},
            Arc,
        },
        thread,
        time::Instant,
    };
    let args: Vec<String> = env::args().collect();
    let jobs: Vec<(String, String)> = fs::read_to_string(&args[1])
        .unwrap()
        .lines()
        .map(|l| {
            let (a, b) = l.split_once('\t').unwrap();
            (a.into(), b.into())
        })
        .collect();
    let jobs = Arc::new(jobs);
    let next = Arc::new(AtomicUsize::new(0));
    let threads: usize = args[2].parse().unwrap();
    let t = Instant::now();
    let handles: Vec<_> = (0..threads)
        .map(|_| {
            let jobs = jobs.clone();
            let next = next.clone();
            thread::spawn(move || loop {
                let k = next.fetch_add(1, AO::Relaxed);
                if k >= jobs.len() {
                    break;
                }
                let bytes = fs::read(&jobs[k].0).unwrap();
                let mut at = 0;
                let mut out = vec![];
                while at < bytes.len() {
                    let n = u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
                    at += 4;
                    let input: Vec<f64> = bytes[at..at + n]
                        .chunks_exact(8)
                        .map(|b| f64::from_le_bytes(b.try_into().unwrap()))
                        .collect();
                    at += n;
                    let result = execute(&input);
                    out.extend_from_slice(&(result.len() as u32 * 8).to_le_bytes());
                    for v in result {
                        out.extend_from_slice(&v.to_le_bytes());
                    }
                }
                fs::write(&jobs[k].1, out).unwrap();
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap()
    }
    eprintln!(
        "{{\"jobs\":{},\"threads\":{},\"ms\":{}}}",
        jobs.len(),
        threads,
        t.elapsed().as_secs_f64() * 1000.0
    );
}
