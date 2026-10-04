//! D448: water gaps, terrain runs and object model, from #71 (24b88b9b).
use crate::stack::{Emitter, Model};
use std::collections::BTreeMap;
pub const OPEN: i16 = 34;
pub const LAYERS: u32 = 23;
pub type Refusal = &'static str;
#[derive(Clone, Debug)]
pub struct Columns {
    pub w: usize,
    pub h: usize,
    pub n: usize,
    pub levels: usize,
    pub count: Vec<u8>,
    pub floor: Vec<i16>,
    pub ceil: Vec<i16>,
    pub height_limit: BTreeMap<usize, f64>,
    pub dir_limit: BTreeMap<usize, u8>,
}
impl Columns {
    pub fn slot_at(&self, i: usize, z: i16) -> Option<usize> {
        (0..self.count[i] as usize).find(|&s| self.floor[s * self.n + i] <= z && z < self.ceil[s * self.n + i])
    }
    pub fn is_open(&self) -> bool {
        self.levels == 1 && (0..self.n).all(|i| self.count[i] == 1 && self.ceil[i] == OPEN)
    }
}
/// Typed object codes: 0 inert, 1 blockage, 2 dam, 3/4/5 overhang 2/3/4,
/// 6 drain, 7 clean source, 8 bad source, 9 clean seep, 10 bad seep, 11 aquifer.
/// Inert objects are deliberately classified by the caller; unknown codes refuse.
#[derive(Clone, Debug)]
pub struct Object {
    pub kind: u8,
    pub x: i32,
    pub y: i32,
    pub z: i16,
    pub rotation: u8,
    pub flipped: bool,
    pub delayed: bool,
    pub strength: f64,
}
impl Object {
    fn tile(&self, x: i32, y: i32, w: usize, h: usize) -> Option<usize> {
        // All water-affecting footprints have width 1 or are non-flippable squares.
        let x = if self.flipped && [9, 10].contains(&self.kind) { 1 - x } else { x };
        let (dx, dy) = match self.rotation {
            0 => (x, y),
            1 => (y, -x),
            2 => (-x, -y),
            _ => (-y, x),
        };
        let (xx, yy) = (self.x as i64 + dx as i64, self.y as i64 + dy as i64);
        (xx >= 0 && yy >= 0 && xx < w as i64 && yy < h as i64).then_some((yy * w as i64 + xx) as usize)
    }
}
fn dimensions(w: usize, h: usize, mask: &[u32]) -> Result<usize, Refusal> {
    let n = w
        .checked_mul(h)
        .filter(|&n| w > 0 && h > 0 && n <= 1_048_576)
        .ok_or("Water map dimensions are invalid.")?;
    if mask.len() != n || mask.iter().any(|&m| m >> LAYERS != 0) {
        return Err("Water terrain masks are invalid.");
    }
    Ok(n)
}
pub fn water_columns(w: usize, h: usize, mask: &[u32], objects: &[Object]) -> Result<Columns, Refusal> {
    let n = dimensions(w, h, mask)?;
    if objects
        .iter()
        .any(|o| o.kind > 11 || o.rotation > 3 || o.z < 0 || o.z >= OPEN || !o.strength.is_finite() || o.strength < 0.0)
    {
        return Err("Water object is unknown or malformed.");
    }
    let mut gaps: Vec<Vec<(i16, i16)>> = mask
        .iter()
        .map(|&m| {
            let mut c = Vec::new();
            let mut z = 0i16;
            while z < OPEN {
                while z < LAYERS as i16 && m & (1u32 << z) != 0 {
                    z += 1;
                }
                if z >= OPEN {
                    break;
                }
                let f = z;
                while z < OPEN && !(z < LAYERS as i16 && m & (1u32 << z) != 0) {
                    z += 1;
                }
                c.push((f, z));
            }
            c
        })
        .collect();
    let mut height_limit = BTreeMap::new();
    let mut dir_limit = BTreeMap::new();
    let mut horizontal = BTreeMap::new();
    for o in objects {
        if [1, 3, 4, 5, 6].contains(&o.kind) {
            if let Some(i) = o.tile(0, 0, w, h) {
                let c = &mut gaps[i];
                let z = o.z;
                // Match #71: an obstacle already inside a solid cell is inert.
                if let Some(k) = c.iter().position(|&(f, t)| f <= z && z < t) {
                    let (f, t) = c[k];
                    if f == z {
                        if t - 1 == z {
                            c.remove(k);
                        } else {
                            c[k].0 = z + 1;
                        }
                    } else if t - 1 == z {
                        c[k].1 = z;
                    } else {
                        c[k].1 = z;
                        c.insert(k + 1, (z + 1, t));
                    }
                }
            }
        }
        if o.kind == 2 {
            if let Some(i) = o.tile(0, 0, w, h) {
                height_limit.insert(o.z as usize * n + i, 0.65);
            }
        }
        let planes: Vec<(i32, i16)> = match o.kind {
            3..=5 => (0..o.kind as i32 - 1).map(|y| (y, o.z + 1)).collect(),
            6 => vec![(1, o.z), (1, o.z + 1)],
            _ => vec![],
        };
        for (y, z) in planes {
            if z > OPEN {
                return Err("Water obstacle height is invalid.");
            }
            if let Some(i) = o.tile(0, y, w, h) {
                if horizontal.insert(z as usize * n + i, ()).is_some() {
                    continue;
                }
                let c = &mut gaps[i];
                if let Some(k) = c.iter().position(|&(f, t)| f < z && z < t) {
                    let t = c[k].1;
                    c[k].1 = z;
                    c.insert(k + 1, (z, t));
                }
            }
        }
        if o.kind == 6 {
            if let Some(i) = o.tile(0, 1, w, h) {
                dir_limit.insert(o.z as usize * n + i, [2, 3, 0, 1][o.rotation as usize]);
            }
        }
    }
    let levels = gaps.iter().map(Vec::len).max().unwrap_or(1).max(1);
    let mut c = Columns {
        w,
        h,
        n,
        levels,
        count: vec![0; n],
        floor: vec![0; n * levels],
        ceil: vec![0; n * levels],
        height_limit,
        dir_limit,
    };
    for (i, g) in gaps.iter().enumerate() {
        c.count[i] = g.len() as u8;
        for (s, &(f, t)) in g.iter().enumerate() {
            c.floor[s * n + i] = f;
            c.ceil[s * n + i] = t;
        }
    }
    Ok(c)
}
pub fn model(w: usize, h: usize, mask: &[u32], objects: &[Object]) -> Result<Model, Refusal> {
    let cols = water_columns(w, h, mask, objects)?;
    let mut emitters = Vec::new();
    for o in objects {
        let cells: Vec<(i32, i32)> = match o.kind {
            7 => vec![(0, 0)],
            8 => (0..3).flat_map(|x| (0..3).map(move |y| (x, y))).collect(),
            9 | 10 => (0..2).flat_map(|x| (0..2).map(move |y| (x, y))).collect(),
            11 => vec![(1, 1)],
            6 => vec![(0, 1)],
            _ => continue,
        };
        let mut ec = Vec::new();
        let mut tiles = Vec::new();
        for &(x, y) in &cells {
            if let Some(i) = o.tile(x, y, w, h) {
                tiles.push(i as u32);
                if let Some(s) = cols.slot_at(i, o.z) {
                    ec.push((s * cols.n + i) as u32);
                }
            }
        }
        if tiles.is_empty() {
            continue;
        }
        let strength = if o.kind >= 7 && o.kind <= 10 && !o.delayed && !ec.is_empty() {
            portable::min(o.strength, 8.0 * cells.len() as f64)
        } else {
            0.0
        };
        let limit = if (o.kind == 9 || o.kind == 10) && !ec.is_empty() {
            Some((ec[0], 0.8, 0.72))
        } else {
            None
        };
        emitters.push(Emitter {
            cols: ec,
            tiles,
            strength,
            contamination: if [6, 8, 10].contains(&o.kind) { 1.0 } else { 0.0 },
            limit,
        });
    }
    Ok(Model {
        cols,
        emitters,
        retained: Vec::new(),
        drained: Vec::new(),
    })
}
/// Solid runs, including empty run zero for a tile whose bottom voxel is air.
pub fn terrain_columns(w: usize, h: usize, mask: &[u32]) -> Result<Columns, Refusal> {
    let n = dimensions(w, h, mask)?;
    let mut runs = Vec::new();
    for &m in mask {
        let mut r = Vec::new();
        let mut solid = true;
        let mut f = 0;
        for z in 0..LAYERS as i16 {
            if m & (1 << z) != 0 {
                if !solid {
                    f = z;
                }
                solid = true;
            } else {
                if solid {
                    r.push((f, z));
                }
                solid = false;
            }
        }
        if solid {
            r.push((f, LAYERS as i16));
        }
        runs.push(r);
    }
    let levels = runs.iter().map(Vec::len).max().unwrap_or(1).max(1);
    let mut c = Columns {
        w,
        h,
        n,
        levels,
        count: vec![0; n],
        floor: vec![0; n * levels],
        ceil: vec![0; n * levels],
        height_limit: BTreeMap::new(),
        dir_limit: BTreeMap::new(),
    };
    for (i, r) in runs.iter().enumerate() {
        c.count[i] = r.len() as u8;
        for (s, &(f, t)) in r.iter().enumerate() {
            c.floor[s * n + i] = f;
            c.ceil[s * n + i] = t;
        }
    }
    Ok(c)
}
