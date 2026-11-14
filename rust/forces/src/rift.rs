// Built directly in Rust (D438/D444). Behaviour reference: investigation/rift, approved #99.
use super::*;

pub(super) struct RiftRecords {
    pub fault: Fault,
    pub arrival: Vec<f32>,
    // changed, maximum drop, held at Floor, stepped, sheer, width
    pub stats: [f64; 6],
}
impl RiftRecords {
    pub fn value(&self) -> V {
        json!({"fault":self.fault.value(), "arrival":self.arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),
            "stats":{"changed":self.stats[0],"drop":self.stats[1],"held":self.stats[2],"stepped":self.stats[3],"sheer":self.stats[4],"width":self.stats[5]},"total":21})
    }
    pub fn geometry(&self, out: &mut Vec<f64>) {
        let f=&self.fault;
        out.extend([f.length,f.reach,f.lift,f.slide,f.heading.x,f.heading.y,21.0,f.points.len() as f64,f.segments.len() as f64,f.directions.len() as f64]);
        for p in &f.points {out.extend([p.x,p.y]);}
        for s in &f.segments {out.extend([s.a.x,s.a.y,s.b.x,s.b.y,s.dx,s.dy,s.length,s.along]);}
        for p in &f.directions {out.extend([p.x,p.y]);}
    }
}
pub(super) fn noise(seed:f64,t:f64,key:f64)->f64 {
    let k=t.floor();let a=hash(seed,k+key);let b=hash(seed,k+key+1.0);
    a+(b-a)*smooth(t-k)
}
// Shared empty tape construction. No value/JSON operations on the planning path.
pub(super) fn result(map:Map,records:Records)->Plan {
    Plan {raw:Some(map.clone()),map,records,literal:Literal::default(),geometry:vec![],objects:vec![],fallen:vec![],
        raw_objects:vec![],raw_fallen:vec![],step_objects:vec![],closure_objects:vec![],closure_fallen:vec![],literal_objects:vec![],
        before:None,before_objects:vec![],before_fallen:vec![]}
}
// An object of more than one tile rides its ground whole (D368 (10)): where the force would move its
// tiles by different amounts, it leaves them as they were, so none is left on air or in rock (a relic
// across a rift's wall, say). Sources and seeps follow D474's rule, the start is the editor's (D257).
// Whether it kept any footprint.
pub(super) fn keep_footprints(before:&Map,map:&mut Map) -> bool {
    let mut kept=false;
    for k in 0..map.entities.len() {
        let e=&map.entities[k];
        if !rides_whole(e) {continue;}
        let tiles=map.footprint(e,0);
        let dz=|m:&Map,i:usize| m.heights[i] as i32-before.heights[i] as i32;
        let Some(&first)=tiles.first() else {continue};
        let d0=dz(map,first);
        if tiles.iter().all(|&i|dz(map,i)==d0) {continue;}
        for i in tiles {map.heights[i]=before.heights[i];map.lava[i]=before.lava[i];}
        kept=true;
    }
    kept
}
/// An object whose footprint `keep_footprints` holds together: more than one tile, not a source, seep, plant or the start.
pub(super) fn rides_whole(e:&Entity) -> bool {
    e.sx*e.sy>1.0 && !emitter(&e.template) && !plant(&e.template) && e.template.as_ref()!="StartingLocation"
}
// Vertical transport, never topple trees or create objects. Opaque metadata stays attached by numeric slot.
pub(super) fn ride(before:&Map,map:&mut Map) {
    for e in &mut map.entities {
        let i=e.y as usize*map.w+e.x as usize;
        let dz=map.heights[i] as f64-before.heights[i] as f64;
        if dz!=0.0 {e.z+=dz;e.raw_removed=true;}
    }
    for f in &mut map.fallen {
        let i=(f.y.floor() as usize).min(map.h-1)*map.w+(f.x.floor() as usize).min(map.w-1);
        f.z+=map.heights[i] as f64-before.heights[i] as f64;
    }
}
/// A rift's width across on Auto (tiles): what Power gives (rift.ts `riftWidth`), at most `RIFT_AUTO_SHARE` of the
/// map's short side.
fn auto_width(power: f64, short: f64) -> f64 {
    min(8.0 + power * 0.12, max(6.0, RIFT_AUTO_SHARE * short))
}
/// Auto's width at most, as a share of the map's short side.
const RIFT_AUTO_SHARE: f64 = 0.16;
/// A click's rift is this many times as long as it is wide (the force audit's finding 7: at least 3), at most
/// `RIFT_CLICK_SHARE` of the map's short side long.
const RIFT_CLICK_LENGTH: f64 = 3.2;
const RIFT_CLICK_SHARE: f64 = 0.62;
/// One border fault's segments: 12 to 20 tiles long, each set 2 to 4 tiles off the one before (en échelon), the
/// ground between two of them a relay ramp `RELAY` tiles long.
const RELAY: f64 = 3.0;
/// The deepest a rift's lake stands, on a map with water (levels): its floor never lies further under the level its
/// water would drain at (the force audit's finding 6).
const RIFT_LAKE: f64 = 2.0;
/// One side's border fault along the rift: its segments' ends (along the axis), how far each stands off the axis
/// beyond the half width, and its benches' widths (a stepped side).
struct Border {
    ends: Vec<f64>,
    offsets: Vec<f64>,
    benches: Vec<f64>,
}
impl Border {
    fn new(seed: f64, salt: f64, length: f64) -> Self {
        let (mut ends, mut offsets, mut benches) = (vec![0.0], vec![], vec![]);
        let sign = if hash(seed, salt) < 0.5 { 1.0 } else { -1.0 };
        let mut k = 0.0;
        loop {
            let at = *ends.last().unwrap();
            let next = at + 12.0 + 8.0 * hash(seed, salt + 1.0 + k);
            // (a last piece under 8 tiles joins the segment before it)
            let next = if length - next < 8.0 { f64::INFINITY } else { next };
            offsets.push(if (k as u32) % 2 == 0 { sign } else { -sign } * (1.0 + hash(seed, salt + 40.0 + k)));
            benches.push(3.0 + 2.0 * hash(seed, salt + 80.0 + k));
            ends.push(next);
            k += 1.0;
            if !next.is_finite() {
                break;
            }
        }
        Self { ends, offsets, benches }
    }
    /// At `t` along the axis, a lateral `w` (tiles toward this wall from the axis) within `outer` of a segment's line
    /// (the half width, its tips drawn in, plus the segment's offset): how much of the block's drop reaches here (1 on
    /// the floor, 0 past the wall; the share of a relay ramp between two segments), and the bench widths there.
    fn share(&self, t: f64, w: f64, half: f64, taper: f64, wiggle: f64) -> (f64, f64, f64) {
        let n = self.offsets.len();
        let mut k = 0;
        while k + 1 < n && t >= self.ends[k + 1] {
            k += 1;
        }
        // (never narrower than a tile and a half each side, so a narrow rift is no sliver the tidying takes away)
        let off = |j: usize| max(min(1.5, half), (half + self.offsets[j] * taper) * taper) + wiggle;
        let inside = |o: f64| if w < o { 1.0 } else { 0.0 };
        // (near the end it shares with a neighbour, the outer segment's block runs on into the neighbour's and dies
        // there: a ramp between the two walls)
        let (a, b, q) = if k + 1 < n && t > self.ends[k + 1] - RELAY {
            (k, k + 1, (t - (self.ends[k + 1] - RELAY)) / (2.0 * RELAY))
        } else if k > 0 && t < self.ends[k] + RELAY {
            (k - 1, k, (t - (self.ends[k] - RELAY)) / (2.0 * RELAY))
        } else {
            return (inside(off(k)), off(k), self.benches[k]);
        };
        let (oa, ob) = (off(a), off(b));
        let near = if q < 0.5 { a } else { b };
        let s = if w < min(oa, ob) {
            1.0
        } else if w >= max(oa, ob) {
            0.0
        } else if oa > ob {
            1.0 - smooth(q)
        } else {
            smooth(q)
        };
        (s, off(near), self.benches[near])
    }
}
pub(super) fn plan(before:&Map,mut map:Map,s:&Settings,intent:&Intent,keep:&[u8],area_depth:&[u8],walls:u32)->Plan {
    let (w, h) = (map.w, map.h);
    let short = w.min(h) as f64;
    let width = s.size.unwrap_or_else(|| auto_width(s.power, short));
    let seed = s.seed;
    let mut path=intent.path.clone();
    if path.len()==1 || path.windows(2).map(|p|hypot(p[1].x-p[0].x,p[1].y-p[0].y)).sum::<f64>()<min(8.0,width*0.5) {
        // (a click: a rift at least `RIFT_CLICK_LENGTH` times as long as wide, running on past the map's edge rather
        // than shortened by it, so at the edge it is open to the edge (the force audit's finding 29))
        // (its middle kept at least a quarter of its length in from the edge, so most of it lies on the map)
        let r=max(8.0,min(width*RIFT_CLICK_LENGTH,RIFT_CLICK_SHARE*short)*0.5);
        let inset=|v:f64,n:usize| clamp(v,min(r*0.5,(n as f64-1.0)*0.5),max((n as f64-1.0)*0.5,n as f64-1.0-r*0.5));
        let p=Point{x:inset(path[0].x,w),y:inset(path[0].y,h)};let angle=hash(seed,580.0)*PI;
        let dx=cos(angle);let dy=sin(angle);
        path=[-1.0,1.0].iter().map(|&d|Point{x:p.x+dx*r*d,y:p.y+dy*r*d}).collect();
    }
    let fault=Fault::new(s,&Intent{path,side:1.0,origin:0.0,end:0.0,via:vec![]});
    let length = fault.length;
    let mut arrival=vec![2.0f32;w*h];
    let mut stats=[0.0;6];stats[5]=width;
    let strength = s.power/100.0;
    // The throw: about 5 levels at the default, 8 or 9 at Power 100 at its deepest; a shallow coherent block at Power
    // zero (D356).
    let throw = 1.0 + s.power * 0.065;
    let deepest = max(1.0, round(throw * 1.15));
    let floor=s.floor.unwrap_or(1.0) as u8;
    let half = width * 0.5;
    // Its anatomy (the force audit's findings 6 and 7): two border faults, each of segments set off from one another
    // with relay ramps between; one the main wall, sheer, the other stepping down in benches of about two levels
    // (Walls on Auto; Sheer or Stepped make both alike); the block between them in two or three pieces, each tilted
    // down toward the main wall, and the whole floor tilted down along the axis toward its low end, where the ground
    // beyond is lower, and notched out to that ground.
    let main = if hash(seed, 960.0) < 0.5 { 1.0 } else { -1.0 };
    let (main_sheer, other_sheer) = match walls { 1 => (true, true), 2 => (false, false), _ => (true, false) };
    let borders = [Border::new(seed, 1200.0, length), Border::new(seed, 1300.0, length)];
    let benches = clamp(round(throw * 0.7 / 2.0) - 1.0, 0.0, 2.0);
    let tip = clamp(length * 0.36, 4.0, width * 2.0);
    // (the low end: the end whose ground beyond is lower; the seed's where they are alike)
    let lowest = |p: Point, out: Point| {
        let r = max(4.0, width * 0.6);
        let (cx, cy) = (p.x + out.x * width * 0.5, p.y + out.y * width * 0.5);
        let mut low = f64::INFINITY;
        for y in max(0.0, (cy - r).floor()) as usize..=min(h as f64 - 1.0, max(0.0, (cy + r).ceil())) as usize {
            for x in max(0.0, (cx - r).floor()) as usize..=min(w as f64 - 1.0, max(0.0, (cx + r).ceil())) as usize {
                if hypot(x as f64 - cx, y as f64 - cy) <= r {
                    low = min(low, before.heights[y * w + x] as f64);
                }
            }
        }
        low
    };
    let (first, last) = (fault.points[0], *fault.points.last().unwrap());
    let span = max(1e-9, hypot(last.x - first.x, last.y - first.y));
    let (ux, uy) = ((last.x - first.x) / span, (last.y - first.y) / span);
    let (l0, l1) = (lowest(first, Point { x: -ux, y: -uy }), lowest(last, Point { x: ux, y: uy }));
    let low_at_end = if l1 != l0 { l1 < l0 } else { hash(seed, 961.0) < 0.5 };
    // (the floor's pieces: two, or three on a long rift, parted by cross faults a little oblique to the axis)
    let pieces = if length < 36.0 { 2 } else { 3 };
    let cuts: Vec<(f64, f64)> = (1..pieces)
        .map(|k| (length * (k as f64 / pieces as f64 + (hash(seed, 1400.0 + k as f64) - 0.5) * 0.16), (hash(seed, 1410.0 + k as f64) - 0.5) * 0.8))
        .collect();
    let mut surface = vec![f64::NAN; w * h];
    let mut cap = vec![0u8; w * h];
    let mut side_of = vec![0i8; w * h];
    let ground: Vec<f64> = before.heights.iter().map(|&l| l as f64).collect();
    for i in 0..w * h {
        if keep.get(i).copied().unwrap_or(0) != 0 {
            continue;
        }
        let (x, y) = ((i % w) as f64, (i / w) as f64);
        let f = fault.at(x, y);
        if f.end > 0.6 || f.d.abs() > half + 6.0 {
            continue;
        }
        let t = f.along;
        let e = min(t, length - t);
        let taper = pow(clamp(e / tip, 0.0, 1.0), 0.85);
        if taper <= 0.0 {
            continue;
        }
        let u = f.d * main;
        let wiggle = (lumps(seed, 4510, x, y, 4.0) - 0.5) * 1.6 * min(1.0, half / 4.0);
        let mut share = 1.0;
        let mut offs = [0.0; 2];
        for (k, (lat, sheer)) in [(u, main_sheer), (-u, other_sheer)].into_iter().enumerate() {
            let (sh, o, bench) = borders[k].share(t, lat, half, taper, wiggle);
            offs[k] = o;
            let mut sh = sh;
            if !sheer && sh > 0.0 && benches > 0.0 {
                // (benches about two levels apart, 3 to 5 tiles wide: no more of the side than six tenths)
                let bw = min(bench, o * 0.6 / benches);
                let from_wall = o - lat;
                if bw > 0.5 && from_wall < benches * bw {
                    sh *= min((from_wall / bw).floor(), benches) / (benches + 1.0) + 1.0 / (benches + 1.0);
                }
            }
            share = min(share, sh);
        }
        if share <= 0.0 {
            continue;
        }
        let tl = if low_at_end { t / max(1.0, length) } else { 1.0 - t / max(1.0, length) };
        let ell = 2.0 * t / max(1.0, length) - 1.0;
        let along = portable_math::sqrt(max(0.0, 1.0 - ell * ell)) * (1.0 + strength * 0.35 * (2.0 * tl - 1.0));
        let frac = clamp((u + offs[1]) / max(1.0, offs[0] + offs[1]), 0.0, 1.0);
        let across = 1.0 - strength * 0.3 * (1.0 - frac);
        let piece = cuts.iter().filter(|&&(c, slope)| t > c + u * slope).count();
        let piece = 1.0 + strength * (hash(seed, 1420.0 + piece as f64) - 0.5) * 0.3;
        // (whatever lies inside both walls drops a level at least: Power 0 still drops a level, D356)
        let drop = min(deepest, max(throw * along * across * piece * share, if share >= 1.0 { 1.0 } else { share }));
        if drop < 0.05 {
            continue;
        }
        let b = before.heights[i] as f64;
        surface[i] = b - drop;
        cap[i] = min(deepest, round(drop) + 1.0) as u8;
        side_of[i] = if u >= 0.0 { 1 } else { -1 };
    }
    // (the ground right round what it shapes: its own level, so the last step may tidy it with the rift)
    let rim: Vec<usize> = (0..w * h)
        .filter(|&i| {
            let (x, y) = (i % w, i / w);
            surface[i].is_nan() && keep.get(i).copied().unwrap_or(0) == 0 && [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)].iter().any(|&(on, j)| on && !surface[j].is_nan())
        })
        .collect();
    for i in rim {
        surface[i] = before.heights[i] as f64;
    }
    let mut land = levels::whole(&surface, &ground, &before.heights, w, h, map.ceiling, seed, max(6.0, width * 0.33));
    let bound = |i: usize, v: u8| -> u8 {
        let b = before.heights[i];
        if keep.get(i).copied().unwrap_or(0) != 0 {
            return b;
        }
        let deepest = (cap[i].max(1)).min(area_depth.get(i).copied().unwrap_or(255));
        v.min(b).max(b.saturating_sub(deepest)).max(b.min(floor))
    };
    for i in 0..w * h {
        land[i] = if surface[i].is_nan() { before.heights[i] } else { bound(i, land[i]) };
    }
    // The notch: from the deepest floor near the low end, the cheapest way out to lower ground beyond the rift that
    // drains (its water leaving at that level or lower, never a closed hollow), or to the map's edge, through no ground
    // more than the throw above that floor; its bed the ground's own lowest so far along the way, so it falls or runs
    // level and never cuts deeper than the throw.
    let mut notch = vec![false; w * h];
    let dropped: Vec<bool> = (0..w * h).map(|i| land[i] < before.heights[i]).collect();
    let mut start = None;
    for i in 0..w * h {
        if !dropped[i] {
            continue;
        }
        let f = fault.at((i % w) as f64, (i / w) as f64);
        let tl = if low_at_end { f.along / max(1.0, length) } else { 1.0 - f.along / max(1.0, length) };
        if tl < 0.5 {
            continue;
        }
        if start.map_or(true, |j: usize| land[i] < land[j]) {
            start = Some(i);
        }
    }
    if let Some(p) = start {
        let z = land[p] as u32;
        let drains = drain_levels(w, h, &before.heights.iter().map(|&v| v as f64).collect::<Vec<_>>());
        let reach = max(24.0, length * 0.5);
        let deep = max(2.0, round(throw)) as u32;
        let (px, py) = ((p % w) as f64, (p / w) as f64);
        let mut cost = vec![u32::MAX; w * h];
        let mut from = vec![usize::MAX; w * h];
        let mut heap = std::collections::BinaryHeap::new();
        cost[p] = 0;
        heap.push(std::cmp::Reverse((0u32, p)));
        let mut found = None;
        while let Some(std::cmp::Reverse((c, i))) = heap.pop() {
            if c > cost[i] {
                continue;
            }
            let (x, y) = (i % w, i / w);
            let edge = x == 0 || y == 0 || x + 1 == w || y + 1 == h;
            if !dropped[i] && (((land[i] as u32) < z && drains[i] <= z as f64) || (edge && land[i] as u32 <= z)) {
                found = Some(i);
                break;
            }
            for (ok, j) in [(x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)] {
                if !ok || keep.get(j).copied().unwrap_or(0) != 0 || hypot((j % w) as f64 - px, (j / w) as f64 - py) > reach {
                    continue;
                }
                let lj = land[j] as u32;
                if lj > z + deep {
                    continue;
                }
                let c2 = c + 4 + 3 * lj.saturating_sub(z);
                if c2 < cost[j] {
                    cost[j] = c2;
                    from[j] = i;
                    heap.push(std::cmp::Reverse((c2, j)));
                }
            }
        }
        if let Some(q) = found {
            let mut route = vec![q];
            while *route.last().unwrap() != p {
                route.push(from[*route.last().unwrap()]);
            }
            route.reverse();
            let mut bed = z as u8;
            for &i in &route {
                bed = bed.min(land[i]);
                let (x, y) = (i % w, i / w);
                // (three tiles wide where the ground beside allows it)
                for (ok, j) in [(true, i), (x > 0, i.wrapping_sub(1)), (x + 1 < w, i + 1), (y > 0, i.wrapping_sub(w)), (y + 1 < h, i + w)] {
                    if !ok || keep.get(j).copied().unwrap_or(0) != 0 || land[j] <= bed || (land[j] - bed) as u32 > deep {
                        continue;
                    }
                    let b = before.heights[j];
                    let v = bed.max(b.min(floor)).max(b.saturating_sub(area_depth.get(j).copied().unwrap_or(255)));
                    if v < land[j] {
                        land[j] = v;
                        notch[j] = !dropped[j];
                    }
                }
            }
        }
    }
    // On a map with water its floor drains: where water would stand on it (under the level it would drain at, from
    // the map's edges, the water standing on the map counted as its surface), the floor rises to that level, and toward its high end a level or a few above it, in long
    // treads, so its stream runs down it to the low end; there a lake at most `RIFT_LAKE` deep may stand
    // (deeper only where the water stood before: its floor still drops a level).
    let wet = before.depth.iter().any(|&d| d > 0.0) || before.entities.iter().any(|e| emitter(&e.template));
    // (again while anything rises: a tread raised upstream can close a hollow below it, which then fills the same way)
    let rise = min(3.0, (throw * 0.5).floor());
    for _ in 0..if wet { 4 } else { 0 } {
        let level = drain_levels(w, h, &(0..w * h).map(|i| land[i] as f64 + before.depth.get(i).copied().unwrap_or(0.0)).collect::<Vec<_>>());
        let mut raised = false;
        for i in 0..w * h {
            if land[i] >= before.heights[i] || land[i] as f64 >= level[i] {
                continue;
            }
            let (x, y) = ((i % w) as f64, (i / w) as f64);
            let f = fault.at(x, y);
            let tl = clamp(if low_at_end { f.along / max(1.0, length) } else { 1.0 - f.along / max(1.0, length) } + (lumps(seed, 4520, x, y, 6.0) - 0.5) * 0.16, 0.0, 1.0);
            let lake = RIFT_LAKE * smooth((tl - 0.7) / 0.25);
            // (its treads rise with the room the ground gives above that level: none on a river's own plain)
            let tread = min(min(((1.0 - tl) * (rise + 1.0)).floor(), rise), ((before.heights[i] as f64 - level[i]) * 0.5).floor());
            // (never all the way back: what it dropped stays a level down at least, so it always shows, D356)
            let v = max(min((level[i] - lake).ceil() + tread, before.heights[i] as f64 - 1.0), land[i] as f64) as u8;
            raised |= v != land[i];
            land[i] = v;
        }
        if !raised {
            break;
        }
    }
    // (no one-tile pit or pillar in what it dropped: a tile under all four beside it rises to the lowest of them, one
    // over all four falls to the highest, as far as the Floor and the working area let it)
    for _ in 0..2 {
        let was = land.clone();
        for i in 0..w * h {
            let (x, y) = (i % w, i / w);
            let b = before.heights[i];
            if x == 0 || y == 0 || x + 1 == w || y + 1 == h || keep.get(i).copied().unwrap_or(0) != 0 {
                continue;
            }
            let n = [was[i - 1], was[i + 1], was[i - w], was[i + w]];
            let (low, high) = (n.iter().copied().min().unwrap(), n.iter().copied().max().unwrap());
            if was[i] < b && was[i] < low {
                land[i] = low.min(b);
            } else if was[i] > high && (was[i] < b || n.iter().all(|&v| v < b)) && !surface[i].is_nan() {
                land[i] = high.max(b.min(floor)).max(b.saturating_sub(area_depth.get(i).copied().unwrap_or(255)));
            }
        }
    }
    for i in 0..w * h {
        let hb = before.heights[i];
        map.heights[i] = land[i];
        if land[i] == hb {
            continue;
        }
        let f = fault.at((i % w) as f64, (i / w) as f64);
        arrival[i] = clamp(0.04 + f.along / max(1.0, length) * 0.74 + f.d.abs() / max(1.0, half) * 0.05, 0.04, 0.85) as f32;
        if land[i] <= hb.min(floor) && hb > floor {
            stats[2] += 1.0;
        }
        stats[0] += 1.0;
        stats[1] = max(stats[1], (hb - land[i]) as f64);
        let stepped = match side_of[i] { 1 => !main_sheer, -1 => !other_sheer, _ => false };
        stats[if stepped { 3 } else { 4 }] += 1.0;
        // Rock beds drop with the block; relief is never replaced by a level trench. A notch cuts them.
        map.lava[i] = if notch[i] { before.lava[i] & mask(land[i]) } else { (before.lava[i] >> (hb - land[i])) & mask(land[i]) };
    }
    if stats[0]==0.0 {map.error=29;}
    drop_footprints(before,&mut map,keep,floor);
    ride(before,&mut map);
    result(map,Records::Rift(Box::new(RiftRecords{fault,arrival,stats})))
}
/// An object of more than one tile rides a rift's block down whole (the force audit's finding 23): where the rift
/// moves its tiles by different amounts, all of them move by the amount most of them move (the least, among
/// equals), so none is left on a pillar; on kept ground, or where the Floor holds part of it, it keeps its ground
/// as it was (`keep_footprints`).
fn drop_footprints(before:&Map,map:&mut Map,keep:&[u8],floor:u8) {
    for k in 0..map.entities.len() {
        let e=&map.entities[k];
        if !rides_whole(e) {continue;}
        let tiles=map.footprint(e,0);
        if tiles.is_empty() {continue;}
        let dz=|m:&Map,i:usize| m.heights[i] as i32-before.heights[i] as i32;
        let d0=dz(map,tiles[0]);
        if tiles.iter().all(|&i|dz(map,i)==d0) {continue;}
        let mut best=(0usize,0i32);
        for &i in &tiles {
            let d=dz(map,i);
            let n=tiles.iter().filter(|&&j|dz(map,j)==d).count();
            if n>best.0 || (n==best.0 && d>best.1) {best=(n,d);}
        }
        let d=best.1;
        let fits=tiles.iter().all(|&i|keep.get(i).copied().unwrap_or(0)==0 && before.heights[i] as i32+d>=before.heights[i].min(floor) as i32);
        for &i in &tiles {
            let b=before.heights[i];
            let v=if fits {(b as i32+d) as u8} else {b};
            map.heights[i]=v;
            map.lava[i]=if v<b {(before.lava[i]>>(b-v))&mask(v)} else {before.lava[i]};
        }
    }
}
