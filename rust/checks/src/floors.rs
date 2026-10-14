// The floor graph (D122; investigation/terrain3d/GAME_RULES.md §4): where beavers can stand, and what they
// reach on foot. A floor is air on solid ground (or on the map's bottom), at any level of a tile: the open
// surface, a cave's floor, a ledge, the top of an arch. There is no headroom rule (a passage one level high is
// walked). Floors of neighbouring tiles join only at the same level; a step of one level is never walked.
// Levels are joined only by the map's Slope objects, each from its own tile at its level to the floor one
// level up on its high side (the links the heightfield walk has, analysis `walk_regions`), and by the stairs a
// player builds, which no map holds. An area is the floors one can walk between.
//
// A diagonal move needs both tiles beside it at the same level, so it never joins two areas: the areas are
// the 4-neighbour ones.

use crate::geom::slope_high_side;

/// A Slope object: its tile, its level and its facing (0–3).
pub struct SlopeAt {
    pub x: i64,
    pub y: i64,
    pub z: i64,
    pub orientation: u8,
}

/// Whether tile `i` has a floor at `z`: air there, on solid ground (or on the map's bottom). An object at `z`
/// stands on it, whatever is above: on a heightfield it is the surface, under a roof the cave's floor, on a
/// ledge the ledge's top.
pub fn floor_at(voxels: &[u8], plane: usize, layers: usize, i: usize, z: i64) -> bool {
    if z < 0 || z as usize > layers {
        return false;
    }
    let z = z as usize;
    (z == layers || voxels[z * plane + i] == 0) && (z == 0 || voxels[(z - 1) * plane + i] != 0)
}

pub struct Floors {
    pub w: usize,
    pub h: usize,
    /// Tile i's floors are `first[i]..first[i + 1]`, bottom to top.
    pub first: Vec<u32>,
    /// Each floor's tile and level.
    pub tile: Vec<u32>,
    pub level: Vec<u8>,
    /// Each floor's area, numbered in the order of each area's first floor.
    pub area: Vec<u32>,
    pub areas: usize,
}

impl Floors {
    /// The floor of tile `i` at level `z`.
    pub fn at(&self, i: usize, z: i64) -> Option<usize> {
        (self.first[i] as usize..self.first[i + 1] as usize).find(|&k| self.level[k] as i64 == z)
    }
    pub fn len(&self) -> usize {
        self.level.len()
    }
    pub fn is_empty(&self) -> bool {
        self.level.is_empty()
    }
}

/// The map's floors and their areas.
pub fn floor_graph(voxels: &[u8], w: usize, h: usize, layers: usize, slopes: &[SlopeAt]) -> Floors {
    let plane = w * h;
    let mut first = Vec::with_capacity(plane + 1);
    let mut tile: Vec<u32> = Vec::with_capacity(plane);
    let mut level: Vec<u8> = Vec::with_capacity(plane);
    for i in 0..plane {
        first.push(level.len() as u32);
        for z in 0..=layers {
            if floor_at(voxels, plane, layers, i, z as i64) {
                tile.push(i as u32);
                level.push(z as u8);
            }
        }
    }
    first.push(level.len() as u32);
    let count = level.len();
    let mut out = Floors { w, h, first, tile, level, area: vec![u32::MAX; count], areas: 0 };

    // the slopes' links, both ways: (floor, floor), sorted so a floor's links are found together
    let mut links: Vec<(u32, u32)> = vec![];
    for sl in slopes {
        if sl.orientation > 3 || sl.x < 0 || sl.y < 0 || sl.x >= w as i64 || sl.y >= h as i64 {
            continue;
        }
        let (dx, dy) = slope_high_side(sl.orientation);
        let (hx, hy) = (sl.x + dx, sl.y + dy);
        if hx < 0 || hy < 0 || hx >= w as i64 || hy >= h as i64 {
            continue;
        }
        let (Some(a), Some(b)) = (out.at(sl.y as usize * w + sl.x as usize, sl.z), out.at(hy as usize * w + hx as usize, sl.z + 1)) else { continue };
        links.push((a as u32, b as u32));
        links.push((b as u32, a as u32));
    }
    links.sort_unstable();

    let mut queue: Vec<u32> = Vec::with_capacity(count);
    for s in 0..count {
        if out.area[s] != u32::MAX {
            continue;
        }
        let lab = out.areas as u32;
        out.areas += 1;
        out.area[s] = lab;
        queue.clear();
        queue.push(s as u32);
        let mut head = 0;
        while head < queue.len() {
            let c = queue[head] as usize;
            head += 1;
            let i = out.tile[c] as usize;
            let z = out.level[c] as i64;
            let (x, y) = (i % w, i / w);
            let mut visit = |v: usize, out: &mut Floors| {
                if out.area[v] == u32::MAX {
                    out.area[v] = lab;
                    queue.push(v as u32);
                }
            };
            if y + 1 < h {
                if let Some(v) = out.at(i + w, z) {
                    visit(v, &mut out);
                }
            }
            if y > 0 {
                if let Some(v) = out.at(i - w, z) {
                    visit(v, &mut out);
                }
            }
            if x + 1 < w {
                if let Some(v) = out.at(i + 1, z) {
                    visit(v, &mut out);
                }
            }
            if x > 0 {
                if let Some(v) = out.at(i - 1, z) {
                    visit(v, &mut out);
                }
            }
            let from = links.partition_point(|l| l.0 < c as u32);
            for l in &links[from..] {
                if l.0 != c as u32 {
                    break;
                }
                visit(l.1 as usize, &mut out);
            }
        }
    }
    out
}

/// The air open to the sky or to the map's edge, by cell (z·plane + tile): the air above each tile's top
/// surface, the air of every tile on the edge (water there drains off the map), and all the air joined to
/// either through air, up, down and to the four sides. Air that is not open is sealed inside rock.
pub fn open_air(voxels: &[u8], w: usize, h: usize, layers: usize) -> Vec<u8> {
    let plane = w * h;
    let mut open = vec![0u8; layers * plane];
    let mut queue: Vec<u32> = vec![];
    for i in 0..plane {
        let (x, y) = (i % w, i / w);
        let edge = x == 0 || y == 0 || x + 1 == w || y + 1 == h;
        let mut sky = true;
        for z in (0..layers).rev() {
            let v = z * plane + i;
            if voxels[v] != 0 {
                sky = false;
                continue;
            }
            if sky || edge {
                open[v] = 1;
                queue.push(v as u32);
            }
        }
    }
    let mut head = 0;
    while head < queue.len() {
        let v = queue[head] as usize;
        head += 1;
        let z = v / plane;
        let i = v - z * plane;
        let (x, y) = (i % w, i / w);
        let mut visit = |n: usize| {
            if voxels[n] == 0 && open[n] == 0 {
                open[n] = 1;
                queue.push(n as u32);
            }
        };
        if z + 1 < layers {
            visit(v + plane);
        }
        if z > 0 {
            visit(v - plane);
        }
        if x + 1 < w {
            visit(v + 1);
        }
        if x > 0 {
            visit(v - 1);
        }
        if y + 1 < h {
            visit(v + w);
        }
        if y > 0 {
            visit(v - w);
        }
    }
    open
}

#[cfg(test)]
mod tests {
    use super::*;

    const W: usize = 8;
    const H: usize = 6;
    const L: usize = 23;
    const N: usize = W * H;

    /// Flat ground at level 3.
    fn flat() -> Vec<u8> {
        let mut v = vec![0u8; L * N];
        for z in 0..3 {
            for i in 0..N {
                v[z * N + i] = 1;
            }
        }
        v
    }
    fn set(v: &mut [u8], x: usize, y: usize, z: usize, solid: bool) {
        v[z * N + y * W + x] = solid as u8;
    }

    #[test]
    fn a_heightfield_has_one_floor_per_tile_and_a_step_parts_two_areas() {
        let mut v = flat();
        for y in 0..H {
            for x in 4..W {
                set(&mut v, x, y, 3, true);
            }
        }
        let g = floor_graph(&v, W, H, L, &[]);
        assert_eq!(g.len(), N);
        assert_eq!(g.areas, 2);
        // a slope on the low side, its high side to the east (Cw270), joins them
        let g = floor_graph(&v, W, H, L, &[SlopeAt { x: 3, y: 2, z: 3, orientation: 3 }]);
        assert_eq!(g.areas, 1);
        // a slope that faces the wrong way joins nothing
        let g = floor_graph(&v, W, H, L, &[SlopeAt { x: 3, y: 2, z: 3, orientation: 1 }]);
        assert_eq!(g.areas, 2);
    }

    #[test]
    fn a_tunnel_one_high_is_walked_and_a_cave_floor_is_its_own_floor() {
        // a wall four thick and three high across the map, with a tunnel one level high through it at y = 2
        let mut v = flat();
        for y in 0..H {
            for x in 2..6 {
                for z in 3..6 {
                    set(&mut v, x, y, z, true);
                }
            }
        }
        let walled = floor_graph(&v, W, H, L, &[]);
        assert_eq!(walled.areas, 3); // west, east, and the wall's top
        for x in 2..6 {
            set(&mut v, x, 2, 3, false);
        }
        let g = floor_graph(&v, W, H, L, &[]);
        assert_eq!(g.areas, 2); // the tunnel joins west and east; the top stays apart
        let t = 2 * W + 3;
        assert_eq!((g.first[t + 1] - g.first[t]) as usize, 2); // the tunnel's floor and the wall's top
        assert_eq!(g.area[g.at(t, 3).unwrap()], g.area[g.at(0, 3).unwrap()]);
        assert_ne!(g.area[g.at(t, 6).unwrap()], g.area[g.at(0, 3).unwrap()]);
    }

    #[test]
    fn air_is_open_to_the_sky_or_the_edge_and_sealed_otherwise() {
        // a block of rock in the middle with a pocket inside it
        let mut v = flat();
        for y in 1..5 {
            for x in 2..6 {
                for z in 3..7 {
                    set(&mut v, x, y, z, true);
                }
            }
        }
        set(&mut v, 3, 2, 4, false);
        set(&mut v, 4, 2, 4, false);
        let open = open_air(&v, W, H, L);
        assert_eq!(open[4 * N + 2 * W + 3], 0);
        assert_eq!(open[3 * N], 1);
        // a shaft up from the pocket opens it
        for z in 5..7 {
            set(&mut v, 4, 2, z, false);
        }
        let open = open_air(&v, W, H, L);
        assert_eq!(open[4 * N + 2 * W + 3], 1);
    }
}
