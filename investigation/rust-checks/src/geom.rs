// Footprints (format/footprints.ts) and an object's tiles (sim/model.ts `objectTile`): a block's world cell is
// Coordinates + R(F(local)).

use crate::input::Entity;
use crate::tables::{footprint, Footprint};

pub const ORIENTATIONS: [&str; 4] = ["Cw0", "Cw90", "Cw180", "Cw270"];

/// `rotate` (the orientation is one of the four; the checks refuse a map with any other before they rotate).
pub fn rotate(o: u8, x: i64, y: i64) -> (i64, i64) {
    match o {
        0 => (x, y),
        1 => (y, -x),
        2 => (-x, -y),
        3 => (-y, x),
        _ => unreachable!("orientation"),
    }
}

pub struct WorldBlock {
    pub x: i64,
    pub y: i64,
    pub z: i64,
    pub below: u8,
    pub flags: u32,
    pub stackable: bool,
    pub occupy_all_below: bool,
    pub local_z: i64,
}

/// A placement: the entity's template, coordinates, orientation and flip.
#[derive(Clone, Copy)]
pub struct Placement<'a> {
    pub template: &'a str,
    pub x: i64,
    pub y: i64,
    pub z: i64,
    pub orientation: u8,
    pub flipped: bool,
}

impl<'a> Placement<'a> {
    pub fn of(e: &'a Entity) -> Self {
        Placement { template: &e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped }
    }
}

/// `worldBlocks`: occupied cells of a placed object (blocks with no occupation flags are skipped).
pub fn world_blocks(fp: &Footprint, p: &Placement) -> Vec<WorldBlock> {
    let sx = fp.size[0] as i64;
    let mut out = Vec::with_capacity(fp.blocks.len());
    for b in fp.blocks {
        if b.flags == 0 {
            continue;
        }
        let lx = if p.flipped && fp.flippable { sx - 1 - b.x as i64 } else { b.x as i64 };
        let (dx, dy) = rotate(p.orientation, lx, b.y as i64);
        out.push(WorldBlock { x: p.x + dx, y: p.y + dy, z: p.z + b.z as i64, below: b.below, flags: b.flags, stackable: b.stackable, occupy_all_below: b.occupy_all_below, local_z: b.z as i64 });
    }
    out
}

/// `footprintTiles`: the 2-D tiles an object covers, in block order, each once.
pub fn footprint_tiles(fp: &Footprint, p: &Placement) -> Vec<(i64, i64)> {
    let mut out: Vec<(i64, i64)> = vec![];
    for b in world_blocks(fp, p) {
        if !out.contains(&(b.x, b.y)) {
            out.push((b.x, b.y));
        }
    }
    out
}

/// `objectTile`: a local tile of a placed object in world tiles.
pub fn object_tile(p: &Placement, lx: i64, ly: i64) -> (i64, i64) {
    let x = match footprint(p.template) {
        Some(fp) if p.flipped && fp.flippable => fp.size[0] as i64 - 1 - lx,
        _ => lx,
    };
    let (dx, dy) = rotate(p.orientation, x, ly);
    (p.x + dx, p.y + dy)
}

/// `slopeHighSide`.
pub fn slope_high_side(o: u8) -> (i64, i64) {
    rotate(o, 0, -1)
}

/// `startEntranceTile`.
pub fn start_entrance_tile(x: i64, y: i64, o: u8) -> (i64, i64) {
    let (dx, dy) = rotate(o, 1, -1);
    (x + dx, y + dy)
}

/// The district center's middle tile (playability.ts `startMiddleTile`, mechanics.ts): the rounded mean of
/// its ground blocks.
pub fn start_middle_tile(p: &Placement) -> (i64, i64) {
    let fp = footprint("StartingLocation").expect("StartingLocation footprint");
    let mut sx = 0.0;
    let mut sy = 0.0;
    let mut n = 0.0;
    for b in world_blocks(fp, p) {
        if b.local_z != 0 {
            continue;
        }
        sx += b.x as f64;
        sy += b.y as f64;
        n += 1.0;
    }
    (portable::round(sx / n) as i64, portable::round(sy / n) as i64)
}
