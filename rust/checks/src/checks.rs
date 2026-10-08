// checks.ts: the load class (what the game would crash on, silently drop, or break at start), the design class
// (terrain.max_height, terrain.single_floor), the principles terrain.edge_wall and terrain.dam_wall, and
// `validateMap`, which adds the playability class (playability.rs) on the map's canonically settled water.

use crate::geom::{slope_high_side, start_entrance_tile, world_blocks, Placement};
use crate::input::{Entity, Map, Stored};
use crate::js::{num, round, trim};
use crate::json::{arr, b, n, obj, s, strings, tiles, Json};
use crate::land::{dam_walls, edge_at, edge_rule_applies, edge_walls, EDGE_BAND, EDGE_INSIDE, EDGE_NAMES, EDGE_RISE, EDGE_SHARE};
use crate::mechanics;
use crate::misc::tiles_to_runs;
use crate::playability::{self, Analysis};
use crate::report::{report_json, Collector, Profile};
use crate::tables::*;
use crate::words::{counted, lines, name_of, object_line, place_of};
use std::collections::{HashMap, HashSet};

/// Templates in the Common collections: they load for both factions and in the map editor.
const COMMON: [&str; 37] = [
    "Pine", "Birch", "Oak", "Succulent", "BlueberryBush",
    "Blockage", "GeothermalField", "LargeRelic", "MediumRelic", "SmallRelic", "NaturalDam",
    "NaturalOverhang2x1", "NaturalOverhang3x1", "NaturalOverhang4x1", "ReservePile", "ReserveTank", "ReserveWarehouse",
    "Slope", "Thorns", "UnstableCore", "RuinColumnH1", "RuinColumnH2", "RuinColumnH3", "RuinColumnH4", "RuinColumnH5",
    "RuinColumnH6", "RuinColumnH7", "RuinColumnH8", "UndergroundRuins", "StartingLocation", "AncientAquiferDrill", "Aquifer",
    "BadtideDrain", "BadwaterSeep", "BadwaterSource", "WaterSeep", "WaterSource",
];

/// Ground blocks of these must stand on the first terrain column.
fn continuous(t: &str) -> bool {
    matches!(t, "WaterSource" | "BadwaterSource" | "WaterSeep" | "BadwaterSeep" | "Aquifer" | "BadtideDrain" | "GeothermalField" | "UndergroundRuins")
}

fn guid(id: &str) -> bool {
    let b = id.as_bytes();
    b.len() == 36 && b.iter().enumerate().all(|(k, &c)| if matches!(k, 8 | 13 | 18 | 23) { c == b'-' } else { c.is_ascii_digit() || (b'a'..=b'f').contains(&c) })
}

// ------------------------------------------------------------------------------------------------ file

/// `jpegSize`: width and height from a JPEG's SOF marker.
pub fn jpeg_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 2 || b[0] != 0xff || b[1] != 0xd8 {
        return None;
    }
    let mut i = 2usize;
    while i + 9 < b.len() {
        if b[i] != 0xff {
            return None;
        }
        let marker = b[i + 1];
        let len = ((b[i + 2] as usize) << 8) | b[i + 3] as usize;
        if (0xc0..=0xcf).contains(&marker) && marker != 0xc4 && marker != 0xc8 && marker != 0xcc {
            return Some((((b[i + 7] as u32) << 8) | b[i + 8] as u32, ((b[i + 5] as u32) << 8) | b[i + 6] as u32));
        }
        i += 2 + len;
    }
    None
}

fn floors_of(m: &Map) -> Vec<u8> {
    let plane = m.w * m.h;
    let l = m.layers;
    let mut out = vec![0u8; plane];
    if l == 0 {
        return out;
    }
    for i in 0..plane {
        let mut k = 0u8;
        for z in 0..l - 1 {
            if m.voxels[z * plane + i] != 0 && m.voxels[(z + 1) * plane + i] == 0 {
                k += 1;
            }
        }
        if m.voxels[(l - 1) * plane + i] != 0 {
            k += 1;
        }
        out[i] = k;
    }
    out
}

pub fn surface_of(m: &Map) -> Vec<u8> {
    let plane = m.w * m.h;
    let mut out = vec![0u8; plane];
    for i in 0..plane {
        for z in (0..m.layers).rev() {
            if m.voxels[z * plane + i] != 0 {
                out[i] = (z + 1) as u8;
                break;
            }
        }
    }
    out
}

fn check_file(m: &Map, c: &mut Collector, external: bool) {
    let (x, y) = (m.w as f64, m.h as f64);
    c.add(vec![
        ("id", s("file.size")),
        ("class", s("load")),
        ("ok", b(x >= 4.0 && x <= 256.0 && y >= 4.0 && y <= 256.0)),
        ("value", s(format!("{}x{}", num(x), num(y)))),
        ("limit", s("4..256")),
        ("message", s(if x >= 4.0 && x <= 256.0 && y >= 4.0 && y <= 256.0 { format!("{}×{} tiles", num(x), num(y)) } else { format!("{}×{} tiles, the game takes 4–256 a side", num(x), num(y)) })),
    ]);
    let layers = m.layers as f64;
    c.add(vec![("id", s("file.layers")), ("class", s("load")), ("ok", b(m.layers == 23)), ("value", n(layers)), ("limit", n(23.0)), ("message", s(if m.layers == 23 { "23 terrain layers".into() } else { format!("{} terrain layers, the game needs 23", num(layers)) }))]);
    let ver = m.game_version.as_str();
    let first = match m.version_txt.find('\n') {
        Some(k) => m.version_txt[..k].strip_suffix('\r').unwrap_or(&m.version_txt[..k]),
        None => m.version_txt.as_str(),
    };
    let txt = trim(first);
    let ver_ok = if external { ver.starts_with("1.1.") && txt == ver } else { ver == GAME_VERSION && txt == GAME_VERSION };
    c.add(vec![
        ("id", s("file.version")),
        ("class", s("load")),
        ("ok", b(ver_ok)),
        ("value", s(ver)),
        ("limit", s(if external { "1.1.x" } else { GAME_VERSION })),
        ("message", s(if ver_ok { format!("Version {}", ver) } else { format!("Version {}, version file {}", ver, txt) })),
    ]);
    const NEED: [&str; 6] = ["MapSize", "TerrainMap", "WaterMapNew", "SoilMoistureSimulator", "SoilContaminationSimulator", "WaterEvaporationMap"];
    let missing: Vec<&str> = (0..6).filter(|k| m.singletons & (1 << k) == 0).map(|k| NEED[k]).collect();
    c.add(vec![
        ("id", s("file.singletons")),
        ("class", s("load")),
        ("ok", b(missing.is_empty() && m.migrated)),
        (
            "message",
            s(if !missing.is_empty() {
                format!("{} of the map's saved data missing", counted(missing.len() as f64, "part"))
            } else if m.migrated {
                "Saved data complete".into()
            } else {
                "Water saved in an old format: every source would run at half strength".into()
            }),
        ),
    ]);
    if missing.is_empty() {
        let plane = x * y;
        let nn = m.levels * x * y;
        let want = [nn, nn, m.slots[0] * plane, m.slots[1] * plane, m.slots[1] * plane, m.slots[2] * plane];
        let bad = (0..6).any(|k| m.lens[k] != want[k]);
        let need2 = floors_of(m).iter().fold(1.0f64, |a, &v| portable::max(a, v as f64));
        c.add(vec![
            ("id", s("file.arrays")),
            ("class", s("load")),
            ("ok", b(!bad && m.levels >= need2)),
            ("value", n(m.levels)),
            ("limit", n(need2)),
            (
                "message",
                s(if bad {
                    "Saved water or soil data is the wrong size for the map".into()
                } else if m.levels < need2 {
                    format!("Water saved with {}, the terrain needs {}", counted(m.levels, "level"), num(need2))
                } else {
                    "Saved water and soil data fit the map".into()
                }),
            ),
        ]);
    }
    let md_ok = m.metadata.as_ref().is_some_and(|md| md.all_keys && md.width == x && md.height == y);
    c.add(vec![
        ("id", s("file.metadata")),
        ("class", s("load")),
        ("ok", b(md_ok)),
        ("message", s(if md_ok {
            "Map details complete"
        } else if m.metadata.is_some() {
            "Map details incomplete or the wrong size"
        } else {
            "Map details missing"
        })),
    ]);
    let thumb_ok = m.thumbnail.as_ref().is_some_and(|t| jpeg_size(t) == Some((960, 540)));
    c.add(vec![("id", s("file.thumbnail")), ("class", s("load")), ("ok", b(thumb_ok)), ("message", s(if thumb_ok { "Thumbnail 960×540" } else { "Thumbnail missing or not 960×540" }))]);
}

// ------------------------------------------------------------------------------------------- terrain

fn check_terrain(m: &Map, c: &mut Collector, surface: &[u8], stack_tops: &[i64], editing: bool) {
    let mut max_h = 0u8;
    for &v in surface {
        if v > max_h {
            max_h = v;
        }
    }
    let mh = max_h as f64;
    c.add(vec![
        ("id", s("terrain.max_height")),
        ("class", s("design")),
        ("ok", b(mh <= GAME_MAX_HEIGHT)),
        ("value", n(mh)),
        ("limit", n(GAME_MAX_HEIGHT)),
        (
            "message",
            s(if mh > GAME_MAX_HEIGHT {
                format!("Highest ground is level {}, the game's limit is {}", num(mh), num(GAME_MAX_HEIGHT))
            } else if mh > EDITOR_MAX_HEIGHT {
                format!("Highest ground is level {}; the in-game map editor edits only up to level {}", num(mh), num(EDITOR_MAX_HEIGHT))
            } else {
                format!("Highest ground is level {}", num(mh))
            }),
        ),
    ]);
    let plane = m.w * m.h;
    let mut top = 0.0;
    if m.layers >= 23 {
        for i in 0..plane {
            top += m.voxels[22 * plane + i] as f64;
        }
    }
    c.add(vec![
        ("id", s("terrain.top_layer_free")),
        ("class", s("load")),
        ("ok", b(top == 0.0)),
        ("value", n(top)),
        ("limit", n(0.0)),
        ("message", s(if top != 0.0 { format!("{} of ground in the top layer", counted(top, "block")) } else { "Top layer is empty".into() })),
    ]);
    let floors = floors_of(m);
    let multi = floors.iter().filter(|&&v| v > 1).count() as f64;
    c.add(vec![
        ("id", s("terrain.single_floor")),
        ("class", s("design")),
        ("ok", b(multi == 0.0)),
        ("value", n(multi)),
        ("limit", n(0.0)),
        ("message", s(if multi != 0.0 { format!("Caves or overhangs on {}", counted(multi, "tile")) } else { "One floor per tile".into() })),
    ]);
    // every map with a tile that is not one plain run from z = 0, whatever its count of floors: a run
    // floating over air down to z = 0 has one floor, and the game deletes it all the same
    let unsupported = if all_plain(m, surface) { 0.0 } else { unsupported_voxels(m, stack_tops) as f64 };
    c.add(vec![
        ("id", s("terrain.supported")),
        ("class", s("load")),
        ("ok", b(unsupported == 0.0)),
        ("value", n(unsupported)),
        ("limit", n(0.0)),
        ("message", s(if unsupported != 0.0 { format!("{} of ground floating", counted(unsupported, "block")) } else { "All ground is supported".into() })),
    ]);
    check_edge_wall(m.w, m.h, surface, c, editing);
}

fn check_edge_wall(w: usize, h: usize, surface: &[u8], c: &mut Collector, editing: bool) {
    if !edge_rule_applies(w, h) {
        c.not_applicable("terrain.edge_wall", "principle", &format!("Map too small for an edge wall (under {} tiles a side)", 2 * (EDGE_BAND + EDGE_INSIDE)), false);
        return;
    }
    let edges = edge_walls(surface, w, h);
    let walled: Vec<&crate::land::EdgeWall> = edges.iter().filter(|e| e.share >= EDGE_SHARE).collect();
    let mut most = &edges[0];
    for e in &edges {
        if e.share > most.share {
            most = e;
        }
    }
    let pct = |v: f64| format!("{}%", num(round(v * 100.0)));
    let fix = if editing && !walled.is_empty() { lower_the_wall(surface, w, h, &walled.iter().map(|e| e.edge).collect::<Vec<_>>()) } else { None };
    let mut r = vec![
        ("id", s("terrain.edge_wall")),
        ("class", s(if editing { "design" } else { "principle" })),
        ("ok", b(walled.is_empty())),
        ("value", n(round(most.share * 100.0) / 100.0)),
        ("limit", n(EDGE_SHARE)),
        (
            "message",
            s(if !walled.is_empty() {
                format!("Wall along the {} holds back water", walled.iter().map(|e| format!("{} edge ({})", EDGE_NAMES[e.edge], pct(e.share))).collect::<Vec<_>>().join(", "))
            } else {
                "No wall along the map's edges".into()
            }),
        ),
    ];
    if !walled.is_empty() {
        r.push(("where", obj(vec![("tiles", tiles(&walled.iter().map(|e| e.at).collect::<Vec<_>>()))])));
    }
    if let Some(f) = fix {
        r.push(("fix", f));
    }
    c.add(r);
}

/// "Lower the wall": on each walled edge, every outer tile standing EDGE_RISE+ above the land inside is cut
/// down to that land's highest tile, a level at a time, in one step.
fn lower_the_wall(hgt: &[u8], w: usize, h: usize, edges: &[usize]) -> Option<Json> {
    let mut to: Vec<(usize, i32)> = vec![];
    let mut index: HashMap<usize, usize> = HashMap::new();
    for &e in edges {
        let l = if e < 2 { w } else { h };
        for p in 0..l {
            let mut band = 0;
            for d in 0..EDGE_BAND {
                let (x, y) = edge_at(e, p, d, w, h);
                band = band.max(hgt[y * w + x] as i32);
            }
            let mut inside = 0;
            for d in EDGE_BAND..EDGE_BAND + EDGE_INSIDE {
                let (x, y) = edge_at(e, p, d, w, h);
                inside = inside.max(hgt[y * w + x] as i32);
            }
            if band - inside < EDGE_RISE {
                continue;
            }
            for d in 0..EDGE_BAND {
                let (x, y) = edge_at(e, p, d, w, h);
                let i = y * w + x;
                if hgt[i] as i32 > inside {
                    match index.get(&i) {
                        Some(&k) => to[k].1 = to[k].1.min(inside),
                        None => {
                            index.insert(i, to.len());
                            to.push((i, inside));
                        }
                    }
                }
            }
        }
    }
    let mut by_level: Vec<(i32, Vec<usize>)> = vec![];
    for &(i, level) in &to {
        match by_level.iter_mut().find(|(l, _)| *l == level) {
            Some((_, list)) => list.push(i),
            None => by_level.push((level, vec![i])),
        }
    }
    by_level.sort_by_key(|(l, _)| *l);
    let mut ops = vec![];
    for (level, t) in by_level {
        let runs = tiles_to_runs(&t, w);
        let cells = arr(runs.iter().map(|r| arr(vec![n(r[0] as f64), n(r[1] as f64), n(r[2] as f64)])).collect());
        let label = if ops.is_empty() { "Lower the wall" } else { "" };
        ops.push(obj(vec![("op", s("sculpt")), ("label", s(label)), ("params", obj(vec![("mode", s("flatten")), ("cells", cells), ("level", n(level as f64))]))]));
    }
    if ops.is_empty() {
        None
    } else {
        Some(arr(ops))
    }
}

fn check_dam_wall(w: usize, h: usize, surface: &[u8], depth: &[f64], c: &mut Collector) {
    let walls = dam_walls(surface, w, h, depth);
    let k = walls.len() as f64;
    let mut r = vec![
        ("id", s("terrain.dam_wall")),
        ("class", s("principle")),
        ("ok", b(walls.is_empty())),
        ("value", n(k)),
        ("limit", n(0.0)),
        (
            "message",
            s(if !walls.is_empty() {
                format!("{} across a valley", counted(k, "dam wall"))
            } else {
                "No dam wall across a valley".into()
            }),
        ),
    ];
    if !walls.is_empty() {
        r.push(("where", obj(vec![("tiles", tiles(&walls.iter().map(|q| (q.x, q.y)).collect::<Vec<_>>()))])));
    }
    c.add(r);
}

/// Whether every tile is one plain run from z = 0 (a heightfield): then nothing can fall.
fn all_plain(m: &Map, surface: &[u8]) -> bool {
    let plane = m.w * m.h;
    (0..plane).all(|i| (0..surface[i] as usize).all(|z| m.voxels[z * plane + i] != 0))
}

/// Whether tile `i` has a floor at `z`: air there, on solid ground (or on the map's bottom). An object
/// at `z` stands on it, whatever is above: on a heightfield it is the surface, under a roof the cave's
/// floor, on a ledge the ledge's top.
fn floor_at(m: &Map, i: usize, z: i64) -> bool {
    let plane = m.w * m.h;
    if z < 0 || z as usize > m.layers {
        return false;
    }
    let z = z as usize;
    (z == m.layers || m.voxels[z * plane + i] == 0) && (z == 0 || m.voxels[(z - 1) * plane + i] != 0)
}

/// Solid voxels not reachable from z = 0 going up, or by at most 3 sideways steps since the last upward step;
/// the top of a stackable object also supports the voxel above it.
fn unsupported_voxels(m: &Map, stack_tops: &[i64]) -> usize {
    let (xs, ys, zs) = (m.w, m.h, m.layers);
    let plane = xs * ys;
    let vox = &m.voxels;
    let mut best = vec![99i8; zs * plane];
    let mut queue: Vec<usize> = vec![];
    for i in 0..plane {
        if vox[i] != 0 {
            best[i] = 0;
            queue.push(i);
        }
    }
    for &k in stack_tops {
        let up = k + plane as i64;
        if up >= 0 && (up as usize) < zs * plane && vox[up as usize] != 0 {
            best[up as usize] = 0;
            queue.push(up as usize);
        }
    }
    let mut hd = 0;
    while hd < queue.len() {
        let v = queue[hd];
        hd += 1;
        let sv = best[v];
        let z = v / plane;
        let i = v - z * plane;
        let x = i % xs;
        let y = i / xs;
        let up = v + plane;
        if z + 1 < zs && vox[up] != 0 && best[up] > 0 {
            best[up] = 0;
            queue.push(up);
        }
        if sv < 3 {
            for (dx, dy) in [(1i64, 0i64), (-1, 0), (0, 1), (0, -1)] {
                let xx = x as i64 + dx;
                let yy = y as i64 + dy;
                if xx < 0 || xx >= xs as i64 || yy < 0 || yy >= ys as i64 {
                    continue;
                }
                let nb = z * plane + yy as usize * xs + xx as usize;
                if vox[nb] != 0 && best[nb] > sv + 1 {
                    best[nb] = sv + 1;
                    queue.push(nb);
                }
            }
        }
    }
    (0..zs * plane).filter(|&v| vox[v] != 0 && best[v] == 99).count()
}

// ------------------------------------------------------------------------------------------ entities

pub struct EntityScan {
    pub occupied: HashMap<i64, u32>,
    /// In insertion order.
    pub stack_tops: Vec<i64>,
    pub placements: Vec<usize>,
}

fn check_entities(m: &Map, c: &mut Collector) -> EntityScan {
    let (xs, ys, zs) = (m.w as i64, m.h as i64, m.layers as i64);
    let plane = xs * ys;
    let vox = &m.voxels;
    let solid = |x: i64, y: i64, z: i64| z < 0 || (z < zs && vox[(z * plane + y * xs + x) as usize] == 1);
    let mut first_top = vec![0i64; plane as usize];
    for i in 0..plane as usize {
        let mut z = 0;
        while z < zs && vox[z as usize * plane as usize + i] != 0 {
            z += 1;
        }
        first_top[i] = z;
    }
    let mut ids: HashSet<&str> = HashSet::new();
    let mut bad_ids = 0.0;
    let mut unknown: Vec<&str> = vec![];
    let mut unknown_ids: Vec<String> = vec![];
    let mut placement_ids: Vec<&str> = vec![];
    let mut bad_enum: Vec<&str> = vec![];
    let mut missing_comp: Vec<String> = vec![];
    let mut placements: Vec<usize> = vec![];
    for (k, e) in m.entities.iter().enumerate() {
        let id = e.id.as_str();
        if ids.contains(id) || !guid(id) {
            bad_ids += 1.0;
        }
        ids.insert(id);
        let t = e.template.as_str();
        if !COMMON.contains(&t) || footprint(t).is_none() {
            if !unknown.contains(&t) {
                unknown.push(t);
            }
            unknown_ids.push(e.id.clone());
            continue;
        }
        if !e.placed || e.orientation > 3 {
            bad_enum.push(t);
            continue;
        }
        for &r in required(t) {
            if e.comps & (1 << r) == 0 {
                let name = format!("{}.{}", t, COMP_NAMES[r]);
                if !missing_comp.contains(&name) {
                    missing_comp.push(name);
                }
            }
        }
        placements.push(k);
        placement_ids.push(id);
    }
    let mut r = vec![
        ("id", s("entities.templates")),
        ("class", s("load")),
        ("ok", b(unknown.is_empty())),
        (
            "message",
            s(if !unknown.is_empty() {
                format!("{} the game cannot load for every faction: {}", counted(unknown_ids.len() as f64, "object"), unknown.iter().map(|t| name_of(t)).collect::<Vec<_>>().join(", "))
            } else {
                "Every object loads for every faction".into()
            }),
        ),
    ];
    if !unknown_ids.is_empty() {
        r.push(("where", obj(vec![("entities", strings(&unknown_ids))])));
        r.push(("fix", arr(vec![obj(vec![("op", s("deleteEntities")), ("label", s("Remove the objects the game cannot load")), ("params", obj(vec![("entities", strings(&unknown_ids))]))])])));
    }
    c.add(r);
    c.add(vec![
        ("id", s("entities.enums")),
        ("class", s("load")),
        ("ok", b(bad_enum.is_empty())),
        (
            "message",
            s(if !bad_enum.is_empty() {
                let mut kinds: Vec<&str> = vec![];
                for &t in &bad_enum {
                    if !kinds.contains(&t) {
                        kinds.push(t);
                    }
                }
                format!("{} facing a direction the game does not know: {}", counted(bad_enum.len() as f64, "object"), kinds[..kinds.len().min(5)].iter().map(|t| name_of(t)).collect::<Vec<_>>().join(", "))
            } else {
                "Every object faces a direction the game knows".into()
            }),
        ),
    ]);
    c.add(vec![
        ("id", s("entities.components")),
        ("class", s("load")),
        ("ok", b(missing_comp.is_empty())),
        (
            "message",
            s(if !missing_comp.is_empty() {
                let mut names: Vec<String> = vec![];
                for k in &missing_comp {
                    let nm = name_of(k.split('.').next().unwrap_or(""));
                    if !names.contains(&nm) {
                        names.push(nm);
                    }
                }
                format!("{} missing a part the game needs", names[..names.len().min(6)].join(", "))
            } else {
                "Every object has the parts the game needs".into()
            }),
        ),
    ]);
    c.add(vec![("id", s("entities.ids")), ("class", s("load")), ("ok", b(bad_ids == 0.0)), ("value", n(bad_ids)), ("limit", n(0.0)), ("message", s(if bad_ids != 0.0 { format!("{} with a duplicate or broken ID", counted(bad_ids, "object")) } else { "Every object has its own ID".into() }))]);

    // load order: z ascending (ties keep file order, like the game's batch loader)
    let mut order: Vec<usize> = (0..placements.len()).collect();
    order.sort_by_key(|&k| m.entities[placements[k]].z);
    let mut occupied: HashMap<i64, u32> = HashMap::new();
    let mut base_cells: HashSet<i64> = HashSet::new();
    let mut stack_set: HashSet<i64> = HashSet::new();
    let mut stack_tops: Vec<i64> = vec![];
    let mut start_cells: Vec<i64> = vec![];
    let mut problems: Vec<String> = vec![];
    let mut rejected: Vec<String> = vec![];
    let key = |x: i64, y: i64, z: i64| z * plane + y * xs + x;
    for &k in &order {
        let e: &Entity = &m.entities[placements[k]];
        let p = Placement::of(e);
        let fp = footprint(&e.template).unwrap();
        let cells = world_blocks(fp, &p);
        let mut why = String::new();
        for bl in &cells {
            if bl.x < 0 || bl.x >= xs || bl.y < 0 || bl.y >= ys || bl.z >= MAX_OBJECT_Z {
                why = "off the map".into();
                break;
            }
            if solid(bl.x, bl.y, bl.z) {
                why = "inside terrain".into();
                break;
            }
            if occupied.get(&key(bl.x, bl.y, bl.z)).copied().unwrap_or(0) & bl.flags != 0 {
                why = "overlapping another object".into();
                break;
            }
            if bl.below == BELOW_GROUND && !solid(bl.x, bl.y, bl.z - 1) {
                why = "floating".into();
                break;
            }
            if bl.below == BELOW_GROUND_OR_STACKABLE && !solid(bl.x, bl.y, bl.z - 1) && !stack_set.contains(&key(bl.x, bl.y, bl.z - 1)) {
                why = "floating".into();
                break;
            }
            if bl.below == BELOW_AIR && solid(bl.x, bl.y, bl.z) {
                why = "blocked above".into();
                break;
            }
            if bl.occupy_all_below && (0..bl.z).any(|zz| base_cells.contains(&key(bl.x, bl.y, zz))) {
                why = "under another object".into();
                break;
            }
            if continuous(&e.template) && bl.below == BELOW_GROUND && bl.z != first_top[(bl.y * xs + bl.x) as usize] {
                why = "on an upper floor".into();
                break;
            }
        }
        if !why.is_empty() {
            problems.push(object_line(&e.template, &why, e.x, e.y, e.z));
            rejected.push(placement_ids[k].to_string());
            continue;
        }
        for bl in &cells {
            let kk = key(bl.x, bl.y, bl.z);
            if e.template == "StartingLocation" {
                start_cells.push(kk);
                continue;
            }
            *occupied.entry(kk).or_insert(0) |= bl.flags;
            base_cells.insert(kk);
            if bl.stackable && stack_set.insert(kk) {
                stack_tops.push(kk);
            }
        }
    }
    let pl = problems.len() as f64;
    let mut r = vec![
        ("id", s("entities.placement")),
        ("class", s("load")),
        ("ok", b(problems.is_empty())),
        ("value", n(pl)),
        ("limit", n(0.0)),
        (
            "message",
            s(if !problems.is_empty() {
                lines(&problems)
            } else {
                "Every object loads".into()
            }),
        ),
    ];
    if !rejected.is_empty() {
        r.push(("where", obj(vec![("entities", strings(&rejected))])));
        r.push(("fix", arr(vec![obj(vec![("op", s("deleteEntities")), ("label", s("Remove the objects the game would delete")), ("params", obj(vec![("entities", strings(&rejected))]))])])));
    }
    c.add(r);
    let overlap = start_cells.iter().filter(|k| occupied.contains_key(k)).count() as f64;
    c.add(vec![
        ("id", s("start.clear")),
        ("class", s("load")),
        ("ok", b(overlap == 0.0)),
        ("value", n(overlap)),
        ("limit", n(0.0)),
        ("message", s(if overlap != 0.0 { format!("Objects cover {} of the start", counted(overlap, "tile")) } else { "Nothing covers the start".into() })),
    ]);
    EntityScan { occupied, stack_tops, placements }
}

// ---------------------------------------------------------------------------------- slopes and start

fn check_slopes(m: &Map, c: &mut Collector, scan: &EntityScan) {
    let (xs, ys) = (m.w as i64, m.h as i64);
    let slopes: Vec<&Entity> = scan.placements.iter().map(|&k| &m.entities[k]).filter(|e| e.template == "Slope").collect();
    let mut at: HashMap<i64, &Entity> = HashMap::new();
    for sl in &slopes {
        at.insert(sl.y * xs + sl.x, sl);
    }
    let inb = |x: i64, y: i64| x >= 0 && x < xs && y >= 0 && y < ys;
    let mut bad: Vec<String> = vec![];
    let mut bad_tiles: Vec<(i64, i64)> = vec![];
    for sl in &slopes {
        let (dx, dy) = slope_high_side(sl.orientation);
        let (hx, hy) = (sl.x + dx, sl.y + dy);
        let (lx, ly) = (sl.x - dx, sl.y - dy);
        // the step it joins, read at the slope's own level: a floor one up on its high side, a floor
        // at its foot (or a slope below it) on its low side, whatever roof or cave is above or below
        let high_ok = inb(hx, hy) && floor_at(m, (hy * xs + hx) as usize, sl.z + 1);
        let chained = at.get(&(ly * xs + lx));
        let low_ok = inb(lx, ly) && (floor_at(m, (ly * xs + lx) as usize, sl.z) || chained.is_some_and(|q| q.z == sl.z - 1));
        if !high_ok || !low_ok {
            bad.push(object_line("Slope", "joins no step", sl.x, sl.y, sl.z));
            if inb(sl.x, sl.y) {
                bad_tiles.push((sl.x, sl.y));
            }
        }
    }
    let mut r = vec![
        ("id", s("slopes.connect")),
        ("class", s("load")),
        ("ok", b(bad.is_empty())),
        ("value", n(bad.len() as f64)),
        ("limit", n(0.0)),
        (
            "message",
            s(if !bad.is_empty() {
                lines(&bad)
            } else if !slopes.is_empty() {
                format!("{} joining levels", counted(slopes.len() as f64, "slope"))
            } else {
                "No slopes".into()
            }),
        ),
    ];
    if !bad_tiles.is_empty() {
        r.push(("where", obj(vec![("tiles", tiles(&bad_tiles))])));
        r.push((
            "fix",
            arr(bad_tiles
                .iter()
                .enumerate()
                .map(|(k, &(x, y))| obj(vec![("op", s("removeSlope")), ("label", s(if k == 0 { "Remove the slopes that join nothing" } else { "" })), ("params", obj(vec![("x", n(x as f64)), ("y", n(y as f64))]))]))
                .collect()),
        ));
    }
    c.add(r);
}

fn check_start(m: &Map, c: &mut Collector, scan: &EntityScan) {
    let (xs, ys) = (m.w as i64, m.h as i64);
    let starts: Vec<&Entity> = scan.placements.iter().map(|&k| &m.entities[k]).filter(|e| e.template == "StartingLocation").collect();
    let k = starts.len() as f64;
    c.add(vec![("id", s("start.count")), ("class", s("load")), ("ok", b(starts.len() == 1)), ("value", n(k)), ("limit", n(1.0)), (
            "message",
            s(if starts.len() == 1 {
                "One start".into()
            } else if !starts.is_empty() {
                format!("{} starts, the map needs one", num(k))
            } else {
                "No start".into()
            }),
        )]);
    if starts.len() != 1 {
        return;
    }
    let p = Placement::of(starts[0]);
    let fp = footprint("StartingLocation").unwrap();
    let flat = world_blocks(fp, &p).iter().filter(|bl| bl.local_z == 0).all(|bl| bl.x >= 0 && bl.x < xs && bl.y >= 0 && bl.y < ys && floor_at(m, (bl.y * xs + bl.x) as usize, p.z));
    c.add(vec![
        ("id", s("start.flat")),
        ("class", s("load")),
        ("ok", b(flat)),
        ("message", s(if flat { "Start ground is flat" } else { "Start ground is not flat" })),
    ]);
    let (ex, ey) = start_entrance_tile(p.x, p.y, p.orientation);
    let plane = xs * ys;
    let free = ex >= 0 && ex < xs && ey >= 0 && ey < ys && floor_at(m, (ey * xs + ex) as usize, p.z) && !scan.occupied.contains_key(&(p.z * plane + ey * xs + ex)) && !scan.occupied.contains_key(&((p.z + 1) * plane + ey * xs + ex));
    c.add(vec![
        ("id", s("start.entrance")),
        ("class", s("load")),
        ("ok", b(free)),
        ("where", obj(vec![("tiles", tiles(&[(ex, ey)]))])),
        ("message", s(if free { "Start entrance is clear".into() } else { format!("Start entrance blocked · {}", place_of(ex, ey, p.z)) })),
    ]);
}

// ---------------------------------------------------------------------------------------- validate

pub struct Validation {
    pub report: String,
    pub analysis: Option<Analysis>,
    pub mechanics: Option<Json>,
}

/// A map the checks refuse (D342): an input they cannot read as the map it claims to be, with a one-line reason.
pub type Refusal = String;

/// `validateMap`.
pub fn validate_map(m: &Map) -> Result<Validation, Refusal> {
    let profile = match m.profile {
        0 => Profile::Generate,
        1 => Profile::Export,
        2 => Profile::Import,
        _ => return Err("Unknown validation profile".into()),
    };
    if let Some(why) = &m.refusal {
        return Err(why.clone());
    }
    let mut c = Collector::new(profile);
    check_file(m, &mut c, m.external);
    let surface = surface_of(m);
    let scan = check_entities(m, &mut c);
    check_terrain(m, &mut c, &surface, &scan.stack_tops, m.editing);
    check_slopes(m, &mut c, &scan);
    check_start(m, &mut c, &scan);
    let mut analysis = None;
    let mut mech = None;
    if let Some(play) = &m.play {
        let objects: Vec<&Entity> = m.entities.iter().filter(|e| e.placed).collect();
        if objects.iter().any(|o| o.orientation > 3) {
            return Err("An object faces a direction the game does not know: fix it before the water is checked".into());
        }
        analysis = Some(playability::check_playability(m, play, &surface, &objects, &mut c)?);
        check_dam_wall(m.w, m.h, &surface, &play.depth, &mut c);
        let floors = floors_of(m);
        let mc = mechanics::mechanics_of(&objects, &floors, &surface, m.w, m.h);
        if !mc.reasons.is_empty() {
            let ring = mechanics::start_ring(&objects, m.w, m.h);
            let stored = match &play.stored {
                Stored::None => None,
                Stored::Wet(v) => Some(v.as_slice()),
                Stored::Unreadable => return Err("The map's saved water cannot be read".into()),
            };
            if let Some(why) = mechanics::approximate_reason(&mc, &play.depth, stored, ring.as_deref()) {
                c.approximate(mechanics::approximate_id, &why);
            }
        }
        mech = Some(mc.json());
    }
    Ok(Validation { report: report_json(profile, &c.checks), analysis, mechanics: mech })
}
