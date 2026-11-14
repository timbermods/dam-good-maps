//! The land stage's kernels (PLAN §20 D381, D391; the land stage in Rust): the hydrology's hollow flood
//! (land/hydro.ts `hollow`, its TypeScript in land/hollow.ts `hollowInTs`), the same tiles in the same order.
//! Integer work on the ground's levels; the levels and the budget compare as binary64, as in the TypeScript.

use std::cell::RefCell;

thread_local! {
    /// One mark array for every flood, each flood's mark its own number (cleared when the map's size changes).
    static MARKS: RefCell<(Vec<u32>, u32)> = const { RefCell::new((Vec::new(), 0)) };
}

/// The tiles joined to `from` by side steps over ground lower than `below` (`from` itself whatever its
/// height), in the order a breadth-first walk takes them: its neighbours +x, −x, +y, −y.
fn flood(ground: &[u8], w: usize, h: usize, from: usize, below: f64, seen: &mut [u32], mark: u32, q: &mut Vec<u32>) {
    q.clear();
    q.push(from as u32);
    seen[from] = mark;
    let mut k = 0;
    while k < q.len() {
        let i = q[k] as usize;
        k += 1;
        let x = i % w;
        let y = i / w;
        // (+x, −x, +y, −y: math/grid.ts `N4`'s order)
        if x + 1 < w {
            let j = i + 1;
            if seen[j] != mark && (ground[j] as f64) < below {
                seen[j] = mark;
                q.push(j as u32);
            }
        }
        if x > 0 {
            let j = i - 1;
            if seen[j] != mark && (ground[j] as f64) < below {
                seen[j] = mark;
                q.push(j as u32);
            }
        }
        if y + 1 < h {
            let j = i + w;
            if seen[j] != mark && (ground[j] as f64) < below {
                seen[j] = mark;
                q.push(j as u32);
            }
        }
        if y > 0 {
            let j = i - w;
            if seen[j] != mark && (ground[j] as f64) < below {
                seen[j] = mark;
                q.push(j as u32);
            }
        }
    }
}

/// A hollow's lake (land/hollow.ts `hollowInTs`): the tiles under `sill` joined to `seed`, its outlet cut a
/// level at a time from the lowest of them while there are more of them than `budget` (not on a sea) or it
/// stands over `max_sill`. Its tiles in `q` and its sill, or None.
#[allow(clippy::too_many_arguments)]
pub fn hollow(ground: &[u8], w: usize, h: usize, seed: usize, sill0: f64, budget: f64, max_sill: f64, sea: bool, q: &mut Vec<u32>) -> Option<f64> {
    let n = w * h;
    assert_eq!(ground.len(), n, "grid shape");
    assert!(seed < n, "seed tile");
    MARKS.with(|m| {
        let mut m = m.borrow_mut();
        let (seen, mark) = &mut *m;
        if seen.len() != n {
            seen.clear();
            seen.resize(n, 0);
            *mark = 0;
        }
        let next = |seen: &mut Vec<u32>, mark: &mut u32| {
            if *mark == u32::MAX {
                seen.iter_mut().for_each(|v| *v = 0);
                *mark = 0;
            }
            *mark += 1;
            *mark
        };
        let mut sill = sill0;
        let k = next(seen, mark);
        flood(ground, w, h, seed, sill, seen, k, q);
        while ((q.len() as f64 > budget && !sea) || sill > max_sill) && sill > 1.0 {
            sill -= 1.0;
            // (the first of the lowest, in the flood's order)
            let mut lowest = q[0] as usize;
            for &t in q.iter() {
                if ground[t as usize] < ground[lowest] {
                    lowest = t as usize;
                }
            }
            if ground[lowest] as f64 >= sill {
                return None;
            }
            let k = next(seen, mark);
            flood(ground, w, h, lowest, sill, seen, k, q);
        }
        if sill > max_sill || q.len() < 6 {
            return None;
        }
        Some(sill)
    })
}

/// The eight directions, sides first (land/drainage.ts `DX`, `DY`: the order the flood takes them in).
const DX: [isize; 8] = [1, -1, 0, 0, 1, 1, -1, -1];
const DY: [isize; 8] = [0, 0, 1, -1, 1, -1, 1, -1];

/// A heap entry: its level, then its tile, smallest first (math/grid.ts `MinHeap`'s order: the level as binary64
/// compares, 0 and −0 alike, a tie going to the lower tile).
#[derive(Clone, Copy)]
struct Entry(f64, u32);
impl PartialEq for Entry {
    fn eq(&self, o: &Self) -> bool {
        self.0 == o.0 && self.1 == o.1
    }
}
impl Eq for Entry {}
impl PartialOrd for Entry {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for Entry {
    fn cmp(&self, o: &Self) -> std::cmp::Ordering {
        // (reversed: Rust's heap pops its greatest)
        match o.0.partial_cmp(&self.0).expect("a level that is a number") {
            std::cmp::Ordering::Equal => o.1.cmp(&self.1),
            c => c,
        }
    }
}

/// The priority flood (land/drainage.ts `flood`, its TypeScript the oracle): from the border tiles (those set in
/// `outlets`, or all of them), each tile's filled level, its receiver (−1 an outlet, −2 never reached), the tiles
/// in the order the flood reached them (`order`, its count returned) and the tiles draining through each.
#[allow(clippy::too_many_arguments)]
pub fn drainage(ground: &[f64], w: usize, h: usize, eight: bool, eps: f64, outlets: Option<&[u8]>, filled: &mut [f64], rcv: &mut [i32], order: &mut [i32], area: &mut [f64]) -> usize {
    let n = w * h;
    assert!(ground.len() == n && filled.len() == n && rcv.len() == n && order.len() == n && area.len() == n, "grid shape");
    let mut heap = std::collections::BinaryHeap::new();
    for i in 0..n {
        filled[i] = 0.0;
        rcv[i] = -2;
        let x = i % w;
        let y = i / w;
        if (x == 0 || y == 0 || x == w - 1 || y == h - 1) && outlets.is_none_or(|o| o[i] != 0) {
            rcv[i] = -1;
            filled[i] = ground[i];
            heap.push(Entry(ground[i], i as u32));
        }
    }
    let k = if eight { 8 } else { 4 };
    let mut count = 0;
    while let Some(Entry(lv, c)) = heap.pop() {
        let c = c as usize;
        if lv > filled[c] {
            continue;
        }
        order[count] = c as i32;
        count += 1;
        let x = (c % w) as isize;
        let y = (c / w) as isize;
        for d in 0..k {
            let xx = x + DX[d];
            let yy = y + DY[d];
            if xx < 0 || yy < 0 || xx >= w as isize || yy >= h as isize {
                continue;
            }
            let j = yy as usize * w + xx as usize;
            if rcv[j] != -2 {
                continue;
            }
            rcv[j] = c as i32;
            let hj = ground[j];
            let f = if hj > lv + eps { hj } else { lv + eps };
            filled[j] = f;
            heap.push(Entry(f, j as u32));
        }
    }
    area.iter_mut().for_each(|a| *a = 1.0);
    for k in (0..count).rev() {
        let i = order[k] as usize;
        let r = rcv[i];
        if r >= 0 {
            area[r as usize] += area[i];
        }
    }
    count
}
