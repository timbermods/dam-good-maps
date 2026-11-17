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

