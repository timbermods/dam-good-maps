//! A sealed basin's water at rest, through columns (D222, D413): the stacked engine's counterpart of the
//! heightfield's `levelInto` (src/core/sim/prefill.ts, settle.rs `level_into`). When an edit let a stored lake's
//! water move (a rim dug, a hollow widened), the settle may stop while it is still draining, since a sealed basin's
//! columns are excused from the steady test; `SettleRun::keep_sealed` then stores the water it began with where
//! it comes to rest instead of as the run left it.
//!
//! The rest is worked out by the game's rules for stacked water. Water at rest stands at one head in each pool:
//! a column holds its floor up to that head, its roof's height at most, and past its roof the pressure of the
//! head above it (an eighth of the height, `PRESSURE`, to the top of the world). Water moves from a column to a
//! neighbour whose air gap overlaps its own when the neighbour's floor is below its surface, so a pool at head `L`
//! covers the columns joined to it through floors below `L`. Water never runs uphill: a pool fills its hollow to
//! the lowest point of its rim (the spill) and only the water past that runs on, into the next hollow, filling
//! the lowest first (fill and spill). So the water a lake held stays behind a dug rim at the cut's floor when
//! the hollow beyond takes the rest, and the two stand as one level when it fills.
//!
//! How: the columns the basin's water could reach (through ground below its highest head at the start, `arena`)
//! are flooded in order of their ground, each joining the hollow of the columns it touches, two hollows merging
//! at the column that joins them (the hollows' tree, as a priority flood builds it). The start's water is then
//! poured: each hollow keeps what began in it up to its spill level, the overflow goes on to the hollows beside
//! it, lowest first, and a hollow whose water rises past its spill stands as one pool over all of it.
//!
//! The rest is refused (`None`, and the basin is stored as the run left it, as before) when its water would reach
//! a column it can't settle on by these rules alone: the map's edge, a running source, other water, or a tile
//! with a partial obstacle or a direction limiter. Deterministic: plain sequential arithmetic in a fixed order.
use crate::{
    columns::OPEN,
    stack::{Stack, State, PRESSURE},
};

/// A hollow of the basin's ground: the column where it began (its lowest, or where two hollows met), the
/// hollows it merged, the columns that joined it directly, and the start's water on those.
struct Hollow {
    level: f64,
    children: Vec<u32>,
    cols: Vec<u32>,
    joint: Option<u32>,
    own: f64,
}

/// Column `c`'s water at head `l`: its depth and its pressure.
fn at_head(s: &Stack, c: usize, l: f64) -> (f64, f64) {
    let f = s.cols.floor[c] as f64;
    if !(l > f) {
        return (0.0, 0.0);
    }
    let ce = s.cols.ceil[c] as f64;
    if l > ce {
        let o = (l - ce) / PRESSURE;
        let max_o = (OPEN as f64 - ce) / PRESSURE;
        (ce - f, if o > max_o { max_o } else { o })
    } else {
        (l - f, 0.0)
    }
}

/// The columns `cols` hold at head `l`.
fn volume_at(s: &Stack, cols: &[usize], l: f64) -> f64 {
    let mut v = 0.0;
    for &c in cols {
        let (d, o) = at_head(s, c, l);
        v += d + o;
    }
    v
}

/// The head at which the columns `cols` hold `v`, joined as one pool: below its roof a column takes the full rise,
/// past it an eighth (its pressure), past the top of the world nothing.
fn surface(s: &Stack, cols: &[usize], v: f64) -> Option<f64> {
    let mut ev: Vec<(f64, f64)> = Vec::with_capacity(3 * cols.len());
    for &c in cols {
        let f = s.cols.floor[c] as f64;
        let ce = s.cols.ceil[c];
        ev.push((f, 1.0));
        if ce < OPEN {
            ev.push((ce as f64, -1.0 + 1.0 / PRESSURE));
            ev.push((OPEN as f64, -1.0 / PRESSURE));
        } else {
            ev.push((ce as f64, -1.0));
        }
    }
    ev.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
    let mut at = ev.first()?.0;
    let mut held = 0.0;
    let mut slope = 0.0;
    for (lv, ds) in ev {
        if lv > at {
            let next = held + slope * (lv - at);
            if slope > 0.0 && next >= v {
                return Some(at + (v - held) / slope);
            }
            held = next;
            at = lv;
        }
        slope += ds;
    }
    None
}

/// The ground a column's water stands on: its floor, raised by a partial obstacle there (as `prefill`'s).
fn ground(s: &Stack, c: usize) -> f64 {
    let n = s.cols.n;
    let f = s.cols.floor[c];
    f as f64 + *s.cols.height_limit.get(&(f as usize * n + c % n)).unwrap_or(&0.0)
}

/// The columns the water sealed basin `basin` began with (`start`) could reach: the basin's own first, then those
/// joined to it through ground below its highest head at the start (water never rises past that), in the order
/// a flood from it finds them, each marked `mark[c] = stamp`.
pub fn arena(s: &Stack, start: &State, basin: &[usize], mark: &mut [u32], stamp: u32) -> Vec<usize> {
    let mut top = f64::NEG_INFINITY;
    let mut cols: Vec<usize> = Vec::with_capacity(basin.len());
    for &c in basin {
        if start.depth[c] + start.overflow[c] > 0.0 {
            let head = s.cols.floor[c] as f64 + start.depth[c] + start.overflow[c] * PRESSURE;
            if head > top {
                top = head;
            }
        }
        if mark[c] != stamp {
            mark[c] = stamp;
            cols.push(c);
        }
    }
    let mut head = 0;
    while head < cols.len() {
        let c = cols[head];
        head += 1;
        for e in s.start[c] as usize..s.start[c + 1] as usize {
            let t = s.target[e];
            if t < 0 {
                continue;
            }
            let t = t as usize;
            if mark[t] == stamp || !(ground(s, t) < top) {
                continue;
            }
            mark[t] = stamp;
            cols.push(t);
        }
    }
    cols
}

/// The water a sealed basin began with (`start`), at rest: every column it ends on with its depth and pressure,
/// ascending by column. `dom` is its `arena`, its own `own` columns first; `risky` marks the columns it may not
/// settle on (above); `None` when it would reach one.
pub fn level_basin(s: &Stack, start: &State, dom: &[usize], own: usize, risky: &dyn Fn(usize) -> bool) -> Option<Vec<(usize, f64, f64)>> {
    let mut volume = 0.0;
    for &c in &dom[..own] {
        if risky(c) {
            return None;
        }
        volume += start.depth[c] + start.overflow[c];
    }
    if !(volume > 0.0) {
        return None;
    }
    let mut slot = vec![u32::MAX; s.d.len()];
    for (k, &c) in dom.iter().enumerate() {
        slot[c] = k as u32;
    }
    let g: Vec<f64> = dom.iter().map(|&c| ground(s, c)).collect();
    let mut order: Vec<u32> = (0..dom.len() as u32).collect();
    order.sort_by(|&a, &b| g[a as usize].total_cmp(&g[b as usize]).then(dom[a as usize].cmp(&dom[b as usize])));
    // the hollows' tree: each column, in order of its ground, joins the hollows of the columns it touches
    let mut hollows: Vec<Hollow> = Vec::new();
    let mut up: Vec<u32> = Vec::new();
    let mut of = vec![u32::MAX; dom.len()];
    let find = |up: &mut Vec<u32>, mut x: u32| -> u32 {
        while up[x as usize] != x {
            let p = up[x as usize];
            up[x as usize] = up[p as usize];
            x = p;
        }
        x
    };
    let mut roots: Vec<u32> = Vec::new();
    for &a in &order {
        let c = dom[a as usize];
        roots.clear();
        for e in s.start[c] as usize..s.start[c + 1] as usize {
            let t = s.target[e];
            if t < 0 || slot[t as usize] == u32::MAX {
                continue;
            }
            let b = of[slot[t as usize] as usize];
            if b == u32::MAX {
                continue;
            }
            let r = find(&mut up, b);
            if !roots.contains(&r) {
                roots.push(r);
            }
        }
        let id = if roots.len() == 1 {
            roots[0]
        } else {
            let id = hollows.len() as u32;
            roots.sort_by(|&x, &y| hollows[x as usize].level.total_cmp(&hollows[y as usize].level).then(x.cmp(&y)));
            for &r in &roots {
                up[r as usize] = id;
            }
            hollows.push(Hollow {
                level: g[a as usize],
                children: roots.clone(),
                cols: Vec::new(),
                joint: (roots.len() > 1).then_some(a),
                own: 0.0,
            });
            up.push(id);
            id
        };
        of[a as usize] = id;
        let h = &mut hollows[id as usize];
        h.cols.push(a);
        // (only the basin's own water: other water its own rest may not reach, `risky`)
        if (a as usize) < own {
            h.own += start.depth[c] + start.overflow[c];
        }
    }
    // (the basin's columns are joined, so the tree has one root)
    let root = find(&mut up, of[0]);
    if (0..hollows.len() as u32).any(|x| up[x as usize] == x && x != root) {
        return None;
    }
    // each hollow's start water, its own and its hollows'; the lowest floor of a column it may not settle on
    let mut nat = vec![0.0; hollows.len()];
    let mut low = vec![f64::INFINITY; hollows.len()];
    for id in 0..hollows.len() {
        let h = &hollows[id];
        let mut v = h.own;
        let mut lo = f64::INFINITY;
        for &ch in &h.children {
            v += nat[ch as usize];
            if low[ch as usize] < lo {
                lo = low[ch as usize];
            }
        }
        for &a in &h.cols {
            let c = dom[a as usize];
            if risky(c) && (s.cols.floor[c] as f64) < lo {
                lo = s.cols.floor[c] as f64;
            }
        }
        nat[id] = v;
        low[id] = lo;
    }
    let subtree = |id: u32, into: &mut Vec<usize>| {
        into.clear();
        let mut st = vec![id];
        while let Some(x) = st.pop() {
            let h = &hollows[x as usize];
            into.extend(h.cols.iter().map(|&a| dom[a as usize]));
            st.extend_from_slice(&h.children);
        }
    };
    // the pouring, from the root down: a hollow given more than its hollows hold at its level is one pool;
    // otherwise each of its hollows keeps its own water up to that level and the rest fills them, lowest first
    let mut given = vec![0.0; hollows.len()];
    given[root as usize] = volume;
    let mut out: Vec<(usize, f64, f64)> = Vec::new();
    let mut cols: Vec<usize> = Vec::new();
    let mut todo = vec![root];
    while let Some(id) = todo.pop() {
        let v = given[id as usize];
        if !(v > 0.0) {
            continue;
        }
        let h = &hollows[id as usize];
        let mut caps = Vec::with_capacity(h.children.len());
        let mut full = 0.0;
        for &ch in &h.children {
            subtree(ch, &mut cols);
            let cap = volume_at(s, &cols, h.level);
            full += cap;
            caps.push(cap);
        }
        if h.children.is_empty() || v >= full {
            subtree(id, &mut cols);
            let l = surface(s, &cols, v)?;
            if (!h.children.is_empty() && l < h.level) || low[id as usize] < l {
                return None;
            }
            for &c in &cols {
                let (d, o) = at_head(s, c, l);
                if d > 0.0 {
                    out.push((c, d, o));
                }
            }
            continue;
        }
        let mut rest = v;
        for (k, &ch) in h.children.iter().enumerate() {
            let keep = if nat[ch as usize] < caps[k] { nat[ch as usize] } else { caps[k] };
            given[ch as usize] = keep;
            rest -= keep;
        }
        if rest > 0.0 {
            // (the overflow runs over the column where the hollows meet)
            if h.joint.is_some_and(|a| risky(dom[a as usize])) {
                return None;
            }
            for (k, &ch) in h.children.iter().enumerate() {
                let room = caps[k] - given[ch as usize];
                if room > 0.0 && rest > 0.0 {
                    let pour = if room < rest { room } else { rest };
                    given[ch as usize] += pour;
                    rest -= pour;
                }
            }
        }
        todo.extend_from_slice(&h.children);
    }
    out.sort_unstable_by_key(|e| e.0);
    Some(out)
}
