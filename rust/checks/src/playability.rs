// playability.ts: the map's own water settled with the game's rules, then whether a colony can survive and grow
// from its start. Every check, message, `where` and fix as the TypeScript writes them.

use crate::kernels;
use crate::checks::Refusal;
use crate::geom::{footprint_tiles, slope_high_side, start_middle_tile, Placement};
use crate::input::{Basin, Entity, Map, Playable};
use crate::js::{locale_int, num, round, to_fixed1};
use crate::json::{arr, b, n, obj, s, strings, tiles, Json};
use crate::misc::{asks_for_badwater, channel_bed, guid_from, official_range, polygon_mask};
use crate::report::{Collector, Profile};
use crate::words::{cap, counted, counted_as, lines, place_of, possessive};
use crate::soil::game_soil;
use crate::tables::{self, *};
use crate::water::{self, Model};

pub const WET: f64 = 0.05;
pub const BAD: f64 = 0.05;
pub const NEAR: f64 = 20.0;
pub const RESERVOIR_RADIUS: f64 = 40.0;
pub const BLUEBERRY_DAYS_TO_DIE_DRY: f64 = 9.0;
pub const FARMLAND_NEAR: f64 = 100.0;
pub const MINES_WANTED: f64 = 2.0;
pub const FLOOD_MARGIN: i64 = 2;

fn is_tree(t: &str) -> bool {
    matches!(t, "Pine" | "Birch" | "Oak")
}
/// analysis/walk.ts `walkWorld`: the tiles the objects that block walking cover (`WALK_BLOCKERS`, tables.rs
/// `walk_blocker`), and the links (low tile,
/// high tile) of the map's slopes, in the objects' order.
fn walk_world(objects: &[&Entity], w: usize, h: usize) -> (Vec<u8>, Vec<f64>) {
    let inb = |x: i64, y: i64| x >= 0 && x < w as i64 && y >= 0 && y < h as i64;
    let mut blocked = vec![0u8; w * h];
    let mut links: Vec<f64> = vec![];
    for o in objects {
        if o.template == "Slope" {
            let (dx, dy) = slope_high_side(o.orientation);
            let (hx, hy) = (o.x + dx, o.y + dy);
            if inb(o.x, o.y) && inb(hx, hy) {
                links.push((o.y * w as i64 + o.x) as f64);
                links.push((hy * w as i64 + hx) as f64);
            }
        } else if walk_blocker(&o.template) {
            let Some(fp) = footprint(&o.template) else { continue };
            for (x, y) in footprint_tiles(fp, &Placement::of(o)) {
                if inb(x, y) {
                    blocked[y as usize * w + x as usize] = 1;
                }
            }
        }
    }
    (blocked, links)
}

pub struct Rules {
    pub difficulty: usize,
    pub water_within: f64,
    pub wood_within20: f64,
    pub bushes_within20: f64,
    pub badwater_within: f64,
    pub ruins_within: f64,
    pub reach_min: f64,
    pub level_land: f64,
    pub farmland: f64,
    pub sources_none: bool,
    pub drought_days: f64,
    pub reservoir_need: f64,
    pub reservoir_depth: f64,
    pub max_water_share: f64,
    pub mult: [f64; 3],
    pub badwater_source: bool,
}

fn start_area(key: &str) -> Option<(f64, f64)> {
    match key {
        "small" => Some((0.6, 79.0)),
        "normal" => Some((1.0, 113.0)),
        "large" => Some((1.8, 180.0)),
        _ => None,
    }
}

/// A setting whose value is not one of its choices.
const SETTING: &str = "A map setting is not one of its choices";

/// `rulesFor`.
pub fn rules_for(p: &Playable) -> Result<Rules, Refusal> {
    let name = p.spec.as_ref().map(|s| s.designed_for.as_str()).unwrap_or(p.designed_for.as_str());
    let difficulty = DIFFICULTIES.iter().position(|d| *d == name).ok_or("The map's difficulty is not Easy, Normal or Hard")?;
    let d = DIFFICULTY_RULES[difficulty];
    let st = p.spec.as_ref().and_then(|s| s.settings.as_ref());
    let r = st.and_then(|s| s.rules).unwrap_or(d);
    let badwater_within = match st {
        Some(s) => portable::max(s.badwater_distance, s.rules.ok_or("The map's settings have no start rules")?[3]),
        None => r[3],
    };
    let land = st.and_then(|s| s.buildable_land.clone()).unwrap_or_else(|| "normal".into());
    let area = st.and_then(|s| s.start_area.clone()).unwrap_or_else(|| "normal".into());
    let (area_k, level) = start_area(&area).ok_or(SETTING)?;
    let reserve_key = st.and_then(|s| s.drought_reserve.clone()).unwrap_or_else(|| "normal".into());
    let theme = p.spec.as_ref().map(|s| s.theme.as_str());
    Ok(Rules {
        difficulty,
        water_within: r[0],
        wood_within20: r[1],
        bushes_within20: r[2],
        badwater_within,
        ruins_within: r[4],
        reach_min: reach_min(&land).ok_or(SETTING)? * area_k,
        level_land: level,
        farmland: FARMLAND_NEAR,
        sources_none: st.is_some_and(|s| s.sources.as_deref() == Some("none")),
        drought_days: DROUGHT[difficulty][0],
        reservoir_need: RESERVOIR_NEEDED[difficulty] * reserve(&reserve_key).ok_or(SETTING)?,
        reservoir_depth: if difficulty == 2 { 3.0 } else { 0.0 },
        max_water_share: if theme == Some("islands") {
            0.7
        } else if theme == Some("lakeBasin") || theme == Some("any") {
            0.55
        } else {
            0.35
        },
        mult: match st {
            Some(s) => [s.ruins / 100.0, s.forest / 100.0, s.berries / 100.0],
            None => [1.0, 1.0, 1.0],
        },
        badwater_source: asks_for_badwater(st.and_then(|s| s.badwater.as_deref()), &p.description),
    })
}

/// What the checks measured, for the preview layers and the map card (`PlayabilityAnalysis`).
pub struct Analysis {
    pub moisture: Vec<f64>,
    pub soil_contamination: Vec<f64>,
    pub reach: Vec<u8>,
    pub start_distance: Option<Vec<f64>>,
    pub water_distance: f64,
    /// The rest, as JSON: treesNear, bushesNear, walkReach, levers, woodNear, woodBySpecies, woodGrowing,
    /// damSites, bestDam, naturalStorage, storage.
    pub rest: Json,
}

fn dam_json(d: &[f64]) -> Json {
    obj(vec![
        ("x", n(d[0])),
        ("y", n(d[1])),
        ("dir", arr(vec![n(d[2]), n(d[3])])),
        ("height", n(d[4])),
        ("length", n(d[5])),
        ("area", n(d[6])),
        ("volume", n(d[7])),
        ("ratio", n(d[8])),
    ])
}

fn fix_delete(entities: &[String], label: &str) -> Json {
    obj(vec![("op", s("deleteEntities")), ("label", s(label)), ("params", obj(vec![("entities", strings(entities))]))])
}

fn locale(x: f64) -> Result<String, Refusal> {
    locale_int(x).ok_or_else(|| "A resource count is not a whole number".to_string())
}

/// `Number(string)` for a ruin column's height (RuinColumnH…): decimal text, else NaN, which the port refuses.
fn js_number(sv: &str) -> f64 {
    let t = crate::js::trim(sv);
    if t.is_empty() {
        return 0.0;
    }
    let ok = t.bytes().all(|c| c.is_ascii_digit());
    if ok {
        t.parse().unwrap_or(f64::NAN)
    } else {
        f64::NAN
    }
}

/// Index helper: JavaScript reads `a[k]` outside an array as undefined.
fn at_u8(a: &[u8], k: i64) -> Option<u8> {
    (k >= 0 && (k as usize) < a.len()).then(|| a[k as usize])
}

pub fn check_playability(m: &Map, p: &Playable, surface: &[u8], objects: &[&Entity], c: &mut Collector) -> Result<Analysis, Refusal> {
    let rules = rules_for(p)?;
    let running = objects.iter().any(|o| matches!(o.template.as_str(), "WaterSource" | "BadwaterSource" | "BadwaterSeep") && o.strength > 0.0);
    c.no_water = rules.sources_none && !running;
    let out = playability(m, p, surface, objects, &rules, c);
    c.no_water = false;
    out
}

fn playability(m: &Map, p: &Playable, hgt: &[u8], objects: &[&Entity], rules: &Rules, c: &mut Collector) -> Result<Analysis, Refusal> {
    let (w, h) = (m.w, m.h);
    let nn = w * h;
    let d = &p.depth;
    let cn = &p.contamination;
    let model = Model { w, h, floor: &p.floor, dam: p.dam.as_deref(), emitters: &p.emitters };

    // ---- blockers by footprint, with the slopes' links
    let (blocked, links) = walk_world(objects, w, h);

    // ---- water
    let mut wet = vec![0u8; nn];
    let mut clean = vec![0u8; nn];
    let mut wet_count = 0.0;
    let mut clean_count = 0.0;
    for i in 0..nn {
        if d[i] > WET {
            wet[i] = 1;
            wet_count += 1.0;
            if cn[i] < BAD {
                clean[i] = 1;
                clean_count += 1.0;
            }
        }
    }
    let steady_at = if p.settled { Some(p.ticks) } else { p.steady_ticks };
    let days = |t: f64| to_fixed1(t / TICKS_PER_DAY);
    c.add(vec![
        ("id", s("water.settles")),
        ("class", s("playability")),
        ("ok", b(p.settled || p.steady_ticks.is_some())),
        ("value", n(steady_at.unwrap_or(p.ticks))),
        ("limit", n(SETTLE_DAYS * TICKS_PER_DAY)),
        (
            "message",
            s(match steady_at {
                None => format!("Water still changing after {} days", num(SETTLE_DAYS)),
                Some(t) if p.settled => format!("Water steady after {} days, still flowing off the map", days(t)),
                Some(t) => format!("Water steady after {} days, a sealed lake keeps slowly evaporating", days(t)),
            }),
        ),
    ]);
    let share = wet_count / nn as f64;
    c.add(vec![
        ("id", s("water.no_flood")),
        ("class", s("playability")),
        ("ok", b(share <= rules.max_water_share)),
        ("value", n(round(share * 1000.0) / 1000.0)),
        ("limit", n(rules.max_water_share)),
        ("message", s(format!("{}% of the map is under water, at most {}%", num(round(share * 100.0)), num(round(rules.max_water_share * 100.0))))),
    ]);
    let min_clean = (0.02 * nn as f64).floor();
    c.add(vec![
        ("id", s("water.clean_exists")),
        ("class", s("playability")),
        ("advisory", b(true)),
        ("ok", b(clean_count >= 0.02 * nn as f64)),
        ("value", n(clean_count)),
        ("limit", n(min_clean)),
        ("message", s(format!("{} of clean water, aim for {}", counted(clean_count, "tile"), num(min_clean)))),
    ]);
    check_outflow(p, &model, w, h, c);
    check_sources_in_flow(&model, objects, d, c);
    let cleanf: Vec<f64> = clean.iter().map(|&v| v as f64).collect();
    let bodies = kernels::k_components(&cleanf, false, w, h);
    let count = bodies[nn] as usize;
    let largest = bodies[nn + 1..nn + 1 + count].iter().fold(0.0, |a: f64, &v| if v > a { v } else { a });
    c.add(vec![
        ("id", s("water.clean_reach")),
        ("class", s("playability")),
        ("advisory", b(true)),
        ("ok", b(largest >= 40.0)),
        ("value", n(largest)),
        ("limit", n(40.0)),
        ("message", s(format!("Largest clean water badwater cannot reach is {}, aim for 40", counted(largest, "tile")))),
    ]);
    check_contained(p, hgt, w, h, c);

    let heights: Vec<f64> = hgt.iter().map(|&v| v as f64).collect();
    let soil = game_soil(w, h, &heights, d, cn, objects);
    let mut an = Analysis { moisture: soil.moisture, soil_contamination: soil.contamination, reach: vec![0u8; nn], start_distance: None, water_distance: f64::INFINITY, rest: Json::Null };
    let empty_rest = || {
        obj(vec![
            ("treesNear", n(0.0)),
            ("bushesNear", n(0.0)),
            ("woodNear", n(0.0)),
            ("woodBySpecies", obj(vec![("Oak", n(0.0)), ("Pine", n(0.0)), ("Birch", n(0.0))])),
            ("woodGrowing", n(0.0)),
            ("damSites", arr(vec![])),
            ("bestDam", Json::Null),
            ("naturalStorage", n(0.0)),
            ("storage", Json::Null),
        ])
    };

    // ---- a badwater source on every map (D200)
    let bad_sources = objects.iter().filter(|o| matches!(o.template.as_str(), "BadwaterSource" | "BadwaterSeep") && o.strength > 0.0).count() as f64;
    let wants = rules.badwater_source;
    c.add(vec![
        ("id", s("resources.badwater_source")),
        ("class", s("playability")),
        ("ok", b(bad_sources >= 1.0 || !wants)),
        ("value", n(bad_sources)),
        ("limit", n(if wants { 1.0 } else { 0.0 })),
        (
            "message",
            s(if !wants {
                format!("No badwater, as chosen{}", if bad_sources != 0.0 { format!(" (the map has {})", counted(bad_sources, "source")) } else { String::new() })
            } else if bad_sources != 0.0 {
                counted(bad_sources, "badwater source")
            } else {
                "No badwater source".into()
            }),
        ),
    ]);

    // ---- the start
    let starts: Vec<usize> = (0..objects.len()).filter(|&k| objects[k].template == "StartingLocation").collect();
    if starts.len() != 1 {
        for cid in START_CHECKS {
            c.not_applicable(cid, "playability", &format!("Needs one start, the map has {}", starts.len()), ADVISORY_START.contains(&cid));
        }
        check_mines(objects, w, h, None, c, None);
        an.rest = empty_rest();
        return Ok(an);
    }
    check_start(m, p, hgt, objects, objects[starts[0]], rules, &model, &wet, &clean, &blocked, &links, &mut an, c)?;
    Ok(an)
}

const START_CHECKS: [&str; 19] = [
    "start.dry", "start.water", "start.badwater", "start.reach", "start.food", "start.wood", "start.wood_floor", "start.farmland", "start.level_land", "start.ruins_clear",
    "plants.survive", "plants.drought", "water.storage_possible", "resources.scrap", "resources.trees", "resources.bushes", "ruins.fields",
    "ruins.access", "extras.placement",
];
const ADVISORY_START: [&str; 8] = ["start.badwater", "start.reach", "start.ruins_clear", "water.storage_possible", "plants.drought", "resources.scrap", "resources.trees", "resources.bushes"];

/// `colonyReach`.
fn colony_reach(w: usize, h: usize, hgt: &[f64], wet: &[u8], objects: &[&Entity], start: (i64, i64)) -> Vec<u8> {
    let nn = w * h;
    let (blocked, links) = walk_world(objects, w, h);
    let blocked: Vec<f64> = blocked.iter().map(|&v| v as f64).collect();
    let labels = kernels::k_walk_regions(hgt, &blocked, &links, w, h);
    let k = start.1 * w as i64 + start.0;
    let root = if k >= 0 && (k as usize) < nn { labels[k as usize] } else { -1.0 };
    let wetf: Vec<f64> = wet.iter().map(|&v| v as f64).collect();
    let land = kernels::k_land_regions(hgt, &wetf, w, h);
    let land_root = if k >= 0 && (k as usize) < nn { land[k as usize] } else { -1.0 };
    (0..nn).map(|i| ((root >= 0.0 && labels[i] == root) || (land_root >= 0.0 && land[i] == land_root)) as u8).collect()
}

/// `minesOutOfReach`: the mine sites the colony does not reach, as each one's first tile.
fn mines_out_of_reach(objects: &[&Entity], w: usize, h: usize, reach: &[u8]) -> Vec<(i64, i64)> {
    let (wi, hi) = (w as i64, h as i64);
    let mut out = vec![];
    for o in objects {
        if o.template != "UndergroundRuins" {
            continue;
        }
        let fp = footprint("UndergroundRuins").unwrap();
        let t = footprint_tiles(fp, &Placement::of(o));
        let mut own: Vec<i64> = vec![];
        for &(x, y) in &t {
            let k = y * wi + x;
            if !own.contains(&k) {
                own.push(k);
            }
        }
        let mut hit = false;
        for &i in &own {
            let x = i % wi;
            let y = (i - x) / wi;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if hit {
                        break;
                    }
                    let xx = x + dx;
                    let yy = y + dy;
                    if xx >= 0 && yy >= 0 && xx < wi && yy < hi && !own.contains(&(yy * wi + xx)) && reach[(yy * wi + xx) as usize] != 0 {
                        hit = true;
                    }
                }
            }
            if hit {
                break;
            }
        }
        if !hit && !t.is_empty() {
            out.push(t[0]);
        }
    }
    out
}

/// `resources.mine_site`.
fn check_mines(objects: &[&Entity], w: usize, h: usize, reach: Option<&[u8]>, c: &mut Collector, cut_at_open: Option<&std::collections::HashSet<i64>>) {
    let mines = objects.iter().filter(|o| o.template == "UndergroundRuins").count() as f64;
    let out = match reach {
        Some(r) => mines_out_of_reach(objects, w, h, r),
        None => vec![],
    };
    let walked = if reach.is_some() { mines - out.len() as f64 } else { 0.0 };
    let k = if reach.is_some() { walked } else { mines };
    let want = if ((w * h) as f64) < SMALL_MAP { 1.0 } else { MINES_WANTED };
    let cut: Vec<(i64, i64)> = match cut_at_open {
        Some(set) => out.iter().copied().filter(|&(x, y)| !set.contains(&(y * w as i64 + x))).collect(),
        None => vec![],
    };
    let mut r = vec![("id", s("resources.mine_site")), ("class", s("playability"))];
    if cut_at_open.is_some() {
        r.push(("advisory", b(true)));
    }
    r.push(("ok", b(k >= want && cut.is_empty())));
    r.push(("value", n(k)));
    r.push(("limit", n(want)));
    r.push((
        "message",
        s(if reach.is_none() {
            format!("{}, at least {} needed", counted(mines, "mine site"), num(want))
        } else if !cut.is_empty() {
            format!(
                "{} out of reach of the start now ({} of {} reachable)",
                if cut.len() == 1 { "A mine site is".to_string() } else { format!("{} mine sites are", cut.len()) },
                num(walked),
                num(mines)
            )
        } else {
            format!("{} of {} reachable from the start, at least {} needed", num(walked), counted(mines, "mine site"), num(want))
        }),
    ));
    if !cut.is_empty() {
        r.push(("where", obj(vec![("tiles", tiles(&cut[..cut.len().min(20)]))])));
    }
    c.add(r);
}

/// `basinLeak`: where water rising in a basin with its outlet blocked would leave it below its rim.
fn basin_leak(bs: &Basin, hgt: &[u8], w: usize, h: usize) -> Option<(i64, i64)> {
    let rim = bs.floor + 2.0;
    let (px, py) = (bs.x as i64, bs.y as i64);
    let (cx, cy) = (px + 1, py + 1);
    let blocked = channel_bed(&bs.outlet, &bs.levels, bs.width, w, h);
    let (wi, hi) = (w as i64, h as i64);
    let mut seen = vec![0u8; w * h];
    let mut queue: Vec<usize> = vec![];
    for y in py..py + 3 {
        for x in px..px + 3 {
            if x < 0 || y < 0 || x >= wi || y >= hi {
                continue;
            }
            let i = (y * wi + x) as usize;
            seen[i] = 1;
            queue.push(i);
        }
    }
    let mut q = 0;
    while q < queue.len() {
        let i = queue[q];
        q += 1;
        let x = (i % w) as i64;
        let y = (i / w) as i64;
        for (dx, dy) in [(0, -1), (-1, 0), (0, 1), (1, 0)] {
            let nx = x + dx;
            let ny = y + dy;
            if nx < 0 || ny < 0 || nx >= wi || ny >= hi {
                return Some((x, y));
            }
            let nb = (ny * wi + nx) as usize;
            if seen[nb] != 0 || blocked.contains(&nb) || hgt[nb] as f64 >= rim {
                continue;
            }
            if (nx - cx).abs() > 5 || (ny - cy).abs() > 5 {
                return Some((nx, ny));
            }
            seen[nb] = 1;
            queue.push(nb);
        }
    }
    None
}

/// `water.badwater_contained`.
fn check_contained(p: &Playable, hgt: &[u8], w: usize, h: usize, c: &mut Collector) {
    let Some(f) = &p.features else {
        c.not_applicable("water.badwater_contained", "playability", "Imported maps have no planned badwater basins", false);
        return;
    };
    if f.basins.is_empty() {
        c.not_applicable("water.badwater_contained", "playability", "No badwater basin with an outlet on this map", false);
        return;
    }
    let leaks: Vec<(i64, i64)> = f.basins.iter().filter_map(|bs| basin_leak(bs, hgt, w, h)).collect();
    let k = f.basins.len();
    let mut r = vec![
        ("id", s("water.badwater_contained")),
        ("class", s("playability")),
        ("ok", b(true)),
        ("value", n(leaks.len() as f64)),
        ("limit", n(0.0)),
        (
            "message",
            s(if !leaks.is_empty() {
                format!("{} of {} reach past {} rim (allowed, D469)", leaks.len(), counted(k as f64, "badwater basin"), if leaks.len() == 1 { "its" } else { "their" })
            } else {
                format!("{} {} water", counted(k as f64, "badwater basin"), if k == 1 { "holds its" } else { "hold their" })
            }),
        ),
    ];
    if !leaks.is_empty() {
        r.push(("where", obj(vec![("tiles", tiles(&leaks))])));
    }
    c.add(r);
}

/// `water.source_in_flow`.
fn check_sources_in_flow(model: &Model, objects: &[&Entity], depth: &[f64], c: &mut Collector) {
    if c.profile == crate::report::Profile::Export {
        c.not_applicable("water.source_in_flow", "design", "Not checked in the editor: sources go anywhere", false);
        return;
    }
    let r = water::sources_in_flow(model, objects, depth);
    if r.sources == 0 {
        c.not_applicable("water.source_in_flow", "design", "No water sources on this map", false);
        return;
    }
    let ents: Vec<String> = r.in_flow.iter().map(|&k| objects[k].id.clone()).filter(|e| !e.is_empty()).collect();
    let k = r.in_flow.len();
    let mut e = vec![
        ("id", s("water.source_in_flow")),
        ("class", s("design")),
        ("ok", b(k == 0)),
        ("value", n(k as f64)),
        ("limit", n(0.0)),
        (
            "message",
            s(if k != 0 {
                format!("{} of {} {} in another source's flow", k, counted(r.sources as f64, "water source"), if k == 1 { "sits" } else { "sit" })
            } else {
                "Every water source starts its own flow".into()
            }),
        ),
    ];
    if k != 0 {
        let mut wh = vec![("tiles", tiles(&r.tiles[..r.tiles.len().min(20)]))];
        if !ents.is_empty() {
            wh.push(("entities", strings(&ents)));
        }
        e.push(("where", obj(wh)));
    }
    c.add(e);
}

/// `water.outflow`.
fn check_outflow(p: &Playable, model: &Model, w: usize, h: usize, c: &mut Collector) {
    let Some(f) = &p.features else {
        c.not_applicable("water.outflow", "playability", "Imported maps have no planned lakes", false);
        return;
    };
    let nn = w * h;
    let any: Vec<f64> = p.depth.iter().map(|&v| if v > 0.0 { 1.0 } else { 0.0 }).collect();
    let labels = kernels::k_components(&any, false, w, h);
    let mut emitting = vec![0u8; nn];
    for e in model.emitters {
        for &i in &e.cells {
            emitting[i] = 1;
        }
    }
    let mut drains = std::collections::HashSet::new();
    for i in 0..nn {
        if labels[i] < 0.0 || emitting[i] != 0 {
            continue;
        }
        let x = i % w;
        let y = i / w;
        if x == 0 || y == 0 || x == w - 1 || y == h - 1 {
            drains.insert(labels[i] as i64);
        }
    }
    for lake in &f.lakes {
        let mask = polygon_mask(&lake.outline, w, h);
        for i in 0..nn {
            if mask[i] != 0 && labels[i] >= 0.0 {
                drains.insert(labels[i] as i64);
            }
        }
    }
    let mut bad: Vec<(i64, i64)> = vec![];
    for e in model.emitters {
        if !(e.strength > 0.0) || e.cells.is_empty() {
            continue;
        }
        let c0 = e.cells[0];
        let lab = labels[c0];
        if lab >= 0.0 && !drains.contains(&(lab as i64)) {
            bad.push(((c0 % w) as i64, (c0 / w) as i64));
        }
    }
    let mut r = vec![
        ("id", s("water.outflow")),
        ("class", s("playability")),
        ("ok", b(bad.is_empty())),
        ("value", n(bad.len() as f64)),
        ("limit", n(0.0)),
        ("message", s(if !bad.is_empty() { format!("{} water pools without an outlet", possessive(bad.len() as f64, "source")) } else { "Every source's water has an outlet".into() })),
    ];
    if !bad.is_empty() {
        r.push(("where", obj(vec![("tiles", tiles(&bad[..bad.len().min(20)]))])));
    }
    c.add(r);
}

fn wood_detail(by: [f64; 3], growing: f64) -> String {
    const NAMES: [&str; 3] = ["oak", "pine", "birch"];
    let total = by[0] + by[1] + by[2];
    let words = if !(total > 0.0) {
        String::new()
    } else {
        let mut order: Vec<usize> = (0..3).filter(|&k| by[k] > 0.0).collect();
        order.sort_by(|&a, &bb| {
            let d = by[bb] - by[a];
            if d < 0.0 {
                std::cmp::Ordering::Less
            } else if d > 0.0 {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        });
        if order.len() == 1 {
            format!("all {}", NAMES[order[0]])
        } else if by[order[0]] >= 0.6 * total {
            format!("mostly {}", NAMES[order[0]])
        } else {
            format!("{} and {}", NAMES[order[0]], NAMES[order[1]])
        }
    };
    let parts: Vec<String> = [words, if growing > 0.0 { format!("plus about {} growing", num(round(growing))) } else { String::new() }].into_iter().filter(|v| !v.is_empty()).collect();
    if parts.is_empty() {
        String::new()
    } else {
        format!(", {}", parts.join(", "))
    }
}

fn tree_logs(o: &Entity) -> f64 {
    let Some(spec) = logs_per_tree(&o.template) else { return 0.0 };
    if dead_tree_loses_logs(&o.template) && o.dead {
        return 0.0;
    }
    match o.cut_logs {
        Some(v) => {
            if v > 0.0 {
                v
            } else {
                0.0
            }
        }
        None => spec,
    }
}

fn is_sapling(o: &Entity) -> bool {
    o.growth.is_some_and(|g| g < 1.0)
}

#[allow(clippy::too_many_arguments)]
fn check_start(m: &Map, p: &Playable, hgt: &[u8], objects: &[&Entity], start: &Entity, rules: &Rules, model: &Model, wet: &[u8], clean: &[u8], blocked: &[u8], links: &[f64], an: &mut Analysis, c: &mut Collector) -> Result<(), Refusal> {
    let (w, h) = (m.w, m.h);
    let (wi, hi) = (w as i64, h as i64);
    let nn = w * h;
    let d = &p.depth;
    let cn = &p.contamination;
    let mo = an.moisture.clone();
    let sc = an.soil_contamination.clone();
    let inb = |x: i64, y: i64| x >= 0 && x < wi && y >= 0 && y < hi;
    let (sx, sy) = start_middle_tile(&Placement::of(start));
    let mut start_mask = vec![0f64; nn];
    let mut flooded = false;
    for y in sy - 2..=sy + 2 {
        for x in sx - 2..=sx + 2 {
            if !inb(x, y) {
                continue;
            }
            let i = (y * wi + x) as usize;
            if wet[i] != 0 {
                flooded = true;
            }
            if (x - sx).abs() <= 1 && (y - sy).abs() <= 1 {
                start_mask[i] = 1.0;
            }
        }
    }
    let sd = kernels::k_distance(&start_mask, w, h);
    c.add(vec![
        ("id", s("start.dry")),
        ("class", s("playability")),
        ("ok", b(!flooded)),
        ("where", obj(vec![("tiles", tiles(&[(sx, sy)]))])),
        ("message", s(if flooded { "Water within 2 tiles of the start" } else { "Start stays dry" })),
    ]);

    // walking: the map's own ground, and its slopes join levels
    let hf: Vec<f64> = hgt.iter().map(|&v| v as f64).collect();
    let bf: Vec<f64> = blocked.iter().map(|&v| v as f64).collect();
    let walk = kernels::k_walk(&hf, &bf, links, sx as f64, sy as f64, water::WALK_LIMIT, w, h);

    let kept = water::drought_storage(model, d, rules.drought_days);
    let shore = water::start_water_shore(&walk, hgt, w, h, d, cn, model.emitters, &kept, rules.water_within);
    let dw = shore.distance;
    an.water_distance = dw;
    let walk_text = |v: f64| format!("{} tiles' walk", num(round(v * 10.0) / 10.0));
    let dw_text = if dw.is_finite() { walk_text(dw) } else { "not".into() };
    let puddle_text = if shore.puddle <= rules.water_within {
        format!("A sealed puddle {} away dries up in a {}-day drought. ", walk_text(shore.puddle), num(rules.drought_days))
    } else {
        String::new()
    };
    let diff = cap(DIFFICULTIES[rules.difficulty]);
    let mut r = vec![
        ("id", s("start.water")),
        ("class", s("playability")),
        ("ok", b(dw <= rules.water_within)),
        ("value", if dw.is_finite() { n(round(dw * 10.0) / 10.0) } else { s("none") }),
        ("limit", n(rules.water_within)),
    ];
    if shore.tile >= 0 {
        r.push(("where", obj(vec![("tiles", tiles(&[(shore.tile % wi, shore.tile / wi)]))])));
    }
    r.push((
        "message",
        s(if dw <= rules.water_within {
            format!("Clean water {} from the start ({} allows {})", dw_text, diff, num(rules.water_within))
        } else if dw.is_finite() {
            format!("{}Nearest lasting clean water is {} from the start ({} allows {})", puddle_text, dw_text, diff, num(rules.water_within))
        } else if !puddle_text.is_empty() {
            format!("{}No other clean water within {} tiles' walk of the start", puddle_text, num(water::WALK_LIMIT))
        } else {
            format!("No clean water within {} tiles' walk of the start", num(water::WALK_LIMIT))
        }),
    ));
    c.add(r);
    let mut db = f64::INFINITY;
    let mut bad_at: i64 = -1;
    for i in 0..nn {
        if (sc[i] > 0.0 || (wet[i] != 0 && cn[i] >= BAD)) && sd[i] < db {
            db = sd[i];
            bad_at = i as i64;
        }
    }
    let mut r = vec![
        ("id", s("start.badwater")),
        ("class", s("playability")),
        // (a rule for a generated map: no badwater within the distance of its start, Kyler, 2026-10-05,
        // #265; a warning on an edited or imported one)
        ("advisory", b(c.profile != Profile::Generate)),
        ("ok", b(db >= rules.badwater_within)),
        ("value", if db.is_finite() { n(round(db * 10.0) / 10.0) } else { s("none") }),
        ("limit", n(rules.badwater_within)),
    ];
    if bad_at >= 0 {
        r.push(("where", obj(vec![("tiles", tiles(&[(bad_at % wi, bad_at / wi)]))])));
    }
    r.push((
        "message",
        s(if db.is_finite() { format!("Nearest badwater or contaminated soil is {} from the start, aim for {}", counted(round(db), "tile"), num(rules.badwater_within)) } else { "No badwater or contaminated soil on the map".into() }),
    ));
    c.add(r);

    // reach: same-level land joined by slopes
    let labels = kernels::k_walk_regions(&hf, &bf, links, w, h);
    let k0 = sy * wi + sx;
    let root = if k0 >= 0 && (k0 as usize) < nn { labels[k0 as usize] } else { -1.0 };
    let mut dry = 0.0;
    for i in 0..nn {
        if root >= 0.0 && labels[i] == root {
            an.reach[i] = 1;
            if wet[i] == 0 {
                dry += 1.0;
            }
        }
    }
    c.add(vec![
        ("id", s("start.reach")),
        ("class", s("playability")),
        ("advisory", b(true)),
        ("ok", b(dry >= rules.reach_min)),
        ("value", n(dry)),
        ("limit", n(rules.reach_min)),
        ("message", s(format!("{} walkable from the start, aim for {}", counted(dry, "dry tile"), num(rules.reach_min)))),
    ]);

    // starting food and wood
    let survives = |i: usize| mo[i] > 0.0 && !(d[i] > 0.0) && !(sc[i] > 0.0);
    let mut bushes = 0.0;
    let mut trees = 0.0;
    let mut wood = 0.0;
    let mut growing = 0.0;
    let mut floor_wood = 0.0;
    let mut by_species = [0.0f64; 3];
    let farthest = portable::max(NEAR, LOG_FLOOR_WALK);
    for o in objects {
        let tree = is_tree(&o.template);
        let woody = logs_per_tree(&o.template).is_some();
        if !tree && !woody && o.template != "BlueberryBush" {
            continue;
        }
        if !inb(o.x, o.y) {
            continue;
        }
        let i = (o.y * wi + o.x) as usize;
        let dd = water::reach_at(&walk, w, h, i);
        if dd > farthest {
            continue;
        }
        let logs = if woody { tree_logs(o) } else { 0.0 };
        let grown = woody && !is_sapling(o);
        if grown && dd <= LOG_FLOOR_WALK {
            floor_wood += logs;
        }
        if dd > NEAR {
            continue;
        }
        if woody {
            if !grown {
                growing += logs;
            } else {
                wood += logs;
                match o.template.as_str() {
                    "Oak" => by_species[0] += logs,
                    "Pine" => by_species[1] += logs,
                    "Birch" => by_species[2] += logs,
                    _ => {}
                }
            }
        }
        if !tree && woody {
            continue;
        }
        if o.dead || !survives(i) {
            continue;
        }
        if tree {
            trees += 1.0;
        } else {
            bushes += 1.0;
        }
    }
    let cut = p.mine_cut.as_ref();
    let reach2 = colony_reach(w, h, &hf, wet, objects, (sx, sy));
    check_mines(objects, w, h, Some(&reach2), c, cut);
    // the farmland and level building land within 20 tiles' walk (item 47)
    let mut farmland = 0.0;
    let mut level = 0.0;
    let mut flat = vec![0u8; nn];
    for y in 0..h.saturating_sub(1) {
        for x in 0..w.saturating_sub(1) {
            let i = y * w + x;
            let v = hgt[i];
            if hgt[i + 1] != v || hgt[i + w] != v || hgt[i + w + 1] != v {
                continue;
            }
            if wet[i] != 0 || wet[i + 1] != 0 || wet[i + w] != 0 || wet[i + w + 1] != 0 || blocked[i] != 0 || blocked[i + 1] != 0 || blocked[i + w] != 0 || blocked[i + w + 1] != 0 {
                continue;
            }
            flat[i] = 1;
            flat[i + 1] = 1;
            flat[i + w] = 1;
            flat[i + w + 1] = 1;
        }
    }
    for i in 0..nn {
        if wet[i] != 0 || water::reach_at(&walk, w, h, i) > NEAR {
            continue;
        }
        if mo[i] > 0.0 && !(sc[i] > 0.0) && blocked[i] == 0 {
            farmland += 1.0;
        }
        if flat[i] != 0 {
            level += 1.0;
        }
    }
    c.add(vec![
        ("id", s("start.farmland")),
        ("class", s("playability")),
        ("ok", b(farmland >= rules.farmland)),
        ("value", n(farmland)),
        ("limit", n(rules.farmland)),
        ("message", s(format!("{} of moist farmland within {} tiles' walk of the start (at least {})", counted(farmland, "tile"), num(NEAR), num(rules.farmland)))),
    ]);
    c.add(vec![
        ("id", s("start.level_land")),
        ("class", s("playability")),
        ("ok", b(level >= rules.level_land)),
        ("value", n(level)),
        ("limit", n(rules.level_land)),
        ("message", s(format!("{} of level building land within {} tiles' walk of the start (at least {})", counted(level, "tile"), num(NEAR), num(rules.level_land)))),
    ]);
    let plant = start_planting(w, h, objects, blocked, wet, d, &mo, &sc, &walk, &sd, rules.bushes_within20 - bushes, rules.wood_within20 - wood);
    let mut r = vec![
        ("id", s("start.food")),
        ("class", s("playability")),
        ("ok", b(bushes >= rules.bushes_within20)),
        ("value", n(bushes)),
        ("limit", n(rules.bushes_within20)),
        ("message", s(format!("{} within 20 tiles' walk of the start (at least {})", counted_as(bushes, "living blueberry bush", "living blueberry bushes"), num(rules.bushes_within20)))),
    ];
    if !plant.0.is_empty() {
        r.push(("fix", arr(plant.0)));
    }
    c.add(r);
    let mut r = vec![
        ("id", s("start.wood")),
        ("class", s("playability")),
        ("ok", b(wood >= rules.wood_within20)),
        ("value", n(wood)),
        ("limit", n(rules.wood_within20)),
        ("message", s(format!("{} logs within 20 tiles' walk of the start{} (at least {})", num(wood), wood_detail(by_species, growing), num(rules.wood_within20)))),
    ];
    if !plant.1.is_empty() {
        r.push(("fix", arr(plant.1)));
    }
    c.add(r);
    c.add(vec![
        ("id", s("start.wood_floor")),
        ("class", s("playability")),
        ("ok", b(floor_wood >= LOG_FLOOR)),
        ("value", n(floor_wood)),
        ("limit", n(LOG_FLOOR)),
        (
            "message",
            s(if floor_wood >= LOG_FLOOR {
                format!("{} logs within {} tiles' walk of the start, enough for a Forester ({} needed)", num(floor_wood), num(LOG_FLOOR_WALK), num(LOG_FLOOR))
            } else {
                format!("{} logs within {} tiles' walk of the start, under the {} a Forester needs", num(floor_wood), num(LOG_FLOOR_WALK), num(LOG_FLOOR))
            }),
        ),
    ]);
    let mut ruins_near: Vec<String> = vec![];
    let mut ruins_near_count = 0.0;
    for o in objects {
        if !o.template.starts_with("RuinColumnH") || !inb(o.x, o.y) {
            continue;
        }
        if sd[(o.y * wi + o.x) as usize] < rules.ruins_within {
            ruins_near_count += 1.0;
            if !o.id.is_empty() {
                ruins_near.push(o.id.clone());
            }
        }
    }
    let mut r = vec![
        ("id", s("start.ruins_clear")),
        ("class", s("playability")),
        ("advisory", b(true)),
        ("ok", b(ruins_near_count == 0.0)),
        ("value", n(ruins_near_count)),
        ("limit", n(0.0)),
        ("message", s(format!("{} within {} tiles of the start", counted(ruins_near_count, "ruin column"), num(rules.ruins_within)))),
    ];
    if !ruins_near.is_empty() {
        r.push(("where", obj(vec![("entities", strings(&ruins_near))])));
        r.push(("fix", arr(vec![fix_delete(&ruins_near, "Remove the ruin columns next to the start")])));
    }
    c.add(r);

    // plants survive
    let mut wrong: Vec<String> = vec![];
    let mut wrong_count = 0.0;
    for o in objects {
        if o.dead || !inb(o.x, o.y) {
            continue;
        }
        let i = (o.y * wi + o.x) as usize;
        let bad = if is_tree(&o.template) || o.template == "BlueberryBush" {
            mo[i] <= 0.0 || d[i] > 0.0 || sc[i] > 0.0
        } else if o.template == "Succulent" {
            mo[i] > 0.0
        } else {
            false
        };
        if bad {
            wrong_count += 1.0;
            if !o.id.is_empty() {
                wrong.push(o.id.clone());
            }
        }
    }
    let mut r = vec![
        ("id", s("plants.survive")),
        ("class", s("playability")),
        ("ok", b(wrong_count == 0.0)),
        ("value", n(wrong_count)),
        ("limit", n(0.0)),
        ("message", s(if wrong_count != 0.0 { format!("{} on soil that kills {}", counted(wrong_count, "living plant"), if wrong_count == 1.0 { "it" } else { "them" }) } else { "Every living plant is on soil it survives".into() })),
    ];
    if !wrong.is_empty() {
        r.push(("where", obj(vec![("entities", strings(&wrong))])));
        r.push(("fix", arr(vec![fix_delete(&wrong, "Remove the plants that would die")])));
    }
    c.add(r);

    // advisory: berry bushes near the start that lose their moisture in a long drought
    let dry_limit = 0.9 * BLUEBERRY_DAYS_TO_DIE_DRY;
    if rules.drought_days <= dry_limit {
        c.add(vec![
            ("id", s("plants.drought")),
            ("class", s("playability")),
            ("advisory", b(true)),
            ("ok", b(true)),
            ("value", n(0.0)),
            ("limit", n(0.0)),
            ("message", s(format!("{} droughts ({} days) are shorter than a blueberry bush survives dry", diff, num(rules.drought_days)))),
        ]);
    } else {
        let cd: Vec<f64> = (0..nn).map(|i| if kept[i] > 0.0 { cn[i] } else { 0.0 }).collect();
        let md = game_soil(w, h, &hf, &kept, &cd, objects).moisture;
        let mut thirsty: Vec<String> = vec![];
        let mut thirsty_count = 0.0;
        for o in objects {
            if o.template != "BlueberryBush" || o.dead || !inb(o.x, o.y) {
                continue;
            }
            let i = (o.y * wi + o.x) as usize;
            if sd[i] > NEAR || md[i] > 0.0 {
                continue;
            }
            thirsty_count += 1.0;
            if !o.id.is_empty() {
                thirsty.push(o.id.clone());
            }
        }
        let mut r = vec![
            ("id", s("plants.drought")),
            ("class", s("playability")),
            ("advisory", b(true)),
            ("ok", b(thirsty_count == 0.0)),
            ("value", n(thirsty_count)),
            ("limit", n(0.0)),
            (
                "message",
                s(if thirsty_count != 0.0 {
                    format!("{} near the start dry out in a {}-day drought", counted_as(thirsty_count, "blueberry bush", "blueberry bushes"), num(rules.drought_days))
                } else {
                    format!("Blueberry bushes near the start stay moist through a {}-day drought", num(rules.drought_days))
                }),
            ),
        ];
        if !thirsty.is_empty() {
            r.push(("where", obj(vec![("entities", strings(&thirsty))])));
        }
        c.add(r);
    }

    // drought: water storage near the start
    let mut natural = 0.0;
    for i in 0..nn {
        if sd[i] <= RESERVOIR_RADIUS {
            natural += kept[i];
        }
    }
    let surf: Vec<f64> = (0..nn).map(|i| hgt[i] as f64 + d[i]).collect();
    let deep = rules.reservoir_depth;
    let cleanf: Vec<f64> = clean.iter().map(|&v| v as f64).collect();
    let heights: &[f64] = if deep > 0.0 { &[1.0, 2.0, 3.0, 4.0] } else { &[1.0, 2.0, 3.0] };
    let raw = kernels::k_dams(&hf, &cleanf, &surf, &sd, heights, [60.0, 2.0, 30.0, deep], w, h);
    let sites: Vec<&[f64]> = raw.chunks_exact(9).collect();
    let mut best: Option<&[f64]> = None;
    for st in &sites {
        if sd[(st[1] as usize) * w + st[0] as usize] <= RESERVOIR_RADIUS && best.is_none_or(|bb| st[7] > bb[7]) {
            best = Some(st);
        }
    }
    let best_volume = best.map(|bb| bb[7]).unwrap_or(0.0);
    let held = portable::max(natural, best_volume);
    let need = rules.reservoir_need;
    let colony = DROUGHT[rules.difficulty][1];
    let running = if shore.tile >= 0 { water::running_flow(w, h, d, model.emitters, shore.tile as usize) } else { 0.0 };
    let running_need = need / (2.0 * water::STORAGE_DAY_SECONDS);
    let levee = if shore.tile >= 0 && held < need {
        let z = at_u8(hgt, sy * wi + sx).map(|v| v as f64).unwrap_or(f64::NAN);
        water::levee_storage(hgt, w, h, d, cn, (sx, sy, z), need)
    } else {
        0.0
    };
    let stored = portable::max(held, levee);
    let storage = obj(vec![("running", n(running)), ("runningNeed", n(running_need)), ("dam", n(best_volume)), ("natural", n(natural)), ("levee", n(levee)), ("need", n(need))]);
    let how = if best.is_some_and(|bb| bb[7] >= need) {
        "a dam"
    } else if natural >= need {
        "natural pools"
    } else if levee >= need {
        "levees"
    } else {
        ""
    };
    c.add(vec![
        ("id", s("water.storage_possible")),
        ("class", s("playability")),
        ("advisory", b(true)),
        ("ok", b(shore.tile >= 0 && running >= running_need && stored >= need)),
        ("value", n(round(stored))),
        ("limit", n(round(need))),
        (
            "message",
            s(if shore.tile < 0 {
                "No clean water in reach of the start to store".into()
            } else if running < running_need {
                format!("The start's water flows at {}/s, too little to refill {} in two days", num(round(running * 100.0) / 100.0), num(round(need)))
            } else if !how.is_empty() {
                format!("Storage near the start by {}: {} carries {} beavers through a {}-day drought", how, num(round(need)), num(colony), num(rules.drought_days))
            } else {
                format!("No dam, natural pool or levee within {} tiles holds {}", num(RESERVOIR_RADIUS), num(round(need)))
            }),
        ),
    ]);

    // resource totals, information
    let area = nn as f64;
    let mut scrap = 0.0;
    let mut tree_total = 0.0;
    let mut bush_total = 0.0;
    let mut ruins: Vec<&Entity> = vec![];
    for o in objects {
        if o.template.starts_with("RuinColumnH") {
            let k = js_number(&o.template[11..]);
            if k.is_nan() {
                return Err("A ruin column's height is not a number".into());
            }
            scrap += 15.0 * k;
            ruins.push(o);
        } else if (is_tree(&o.template) || o.template == "Succulent") && !o.dead_truthy {
            tree_total += 1.0;
        } else if o.template == "BlueberryBush" {
            bush_total += 1.0;
        }
    }
    let res: [(&str, f64, &str, usize); 3] = [("scrap", scrap, "scrap metal in ruins", 0), ("trees", tree_total, "living trees", 1), ("bushes", bush_total, "blueberry bushes", 2)];
    for (key, have, what, mk) in res {
        let all = official_range(key, area);
        let (la, lb) = (LIVING_SHARE[0], LIVING_SHARE[1]);
        let (median, low, high) = if key == "trees" { ((all.median * (la + lb)) / 2.0, all.low * la, all.high * lb) } else { (all.median, all.low, all.high) };
        let k = rules.mult[mk];
        let need2 = 0.5 * median * k;
        let lo = round(low * k);
        let hi = round(high * k);
        let place = if have < lo {
            "below"
        } else if have > hi {
            "above"
        } else {
            "within"
        };
        c.add(vec![
            ("id", s(format!("resources.{}", key))),
            ("class", s("playability")),
            ("advisory", b(true)),
            ("ok", b(have >= need2)),
            ("value", n(have)),
            ("limit", n(round(need2))),
            (
                "message",
                s(format!("{} {}, {} the official range of {}–{}{}", locale(have)?, what, place, locale(lo)?, locale(hi)?, if have >= need2 { "" } else { ", under half the median" })),
            ),
        ]);
    }

    // ruins: fields of touching columns, each scavengeable from its own level
    if !ruins.is_empty() {
        let mut rmask = vec![0f64; nn];
        let mut count = vec![0f64; nn];
        for o in &ruins {
            if !inb(o.x, o.y) {
                continue;
            }
            let i = (o.y * wi + o.x) as usize;
            rmask[i] = 1.0;
            count[i] += 1.0;
        }
        let cl = kernels::k_components(&rmask, true, w, h);
        let fields = cl[nn] as usize;
        let mut per_field = vec![0f64; fields];
        for i in 0..nn {
            if cl[i] >= 0.0 {
                per_field[cl[i] as usize] += count[i];
            }
        }
        let mut in_fields = 0.0;
        for &v in &per_field {
            if v >= 10.0 {
                in_fields += v;
            }
        }
        let share_in = in_fields / ruins.len() as f64;
        c.add(vec![
            ("id", s("ruins.fields")),
            ("class", s("playability")),
            ("ok", b(share_in >= 0.8)),
            ("value", n(round(share_in * 100.0) / 100.0)),
            ("limit", n(0.8)),
            ("message", s(format!("{}% of ruin columns are in fields of 10 or more, at least 80%", num(round(share_in * 100.0))))),
        ]);
        let mut no_access = 0.0;
        for o in &ruins {
            let mut ok = false;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if ok || (dx == 0 && dy == 0) {
                        continue;
                    }
                    let (xx, yy) = (o.x + dx, o.y + dy);
                    if inb(xx, yy) && hgt[(yy * wi + xx) as usize] as i64 == o.z && blocked[(yy * wi + xx) as usize] == 0 {
                        ok = true;
                    }
                }
            }
            if !ok {
                no_access += 1.0;
            }
        }
        c.add(vec![
            ("id", s("ruins.access")),
            ("class", s("playability")),
            ("ok", b(no_access == 0.0)),
            ("value", n(no_access)),
            ("limit", n(0.0)),
            ("message", s(if no_access != 0.0 { format!("{} nobody can scavenge from", counted(no_access, "ruin column")) } else { "Every ruin column can be scavenged".into() })),
        ]);
    } else {
        c.not_applicable("ruins.fields", "playability", "No ruins on this map", false);
        c.not_applicable("ruins.access", "playability", "No ruins on this map", false);
    }
    check_extras(p, hgt, w, h, &sd, c)?;

    an.start_distance = Some(sd.clone());
    an.rest = obj(vec![
        ("treesNear", n(trees)),
        ("bushesNear", n(bushes)),
        ("woodNear", n(wood)),
        ("woodBySpecies", obj(vec![("Oak", n(by_species[0])), ("Pine", n(by_species[1])), ("Birch", n(by_species[2]))])),
        ("woodGrowing", n(growing)),
        ("damSites", arr(sites.iter().map(|st| dam_json(st)).collect())),
        ("bestDam", best.map(dam_json).unwrap_or(Json::Null)),
        ("naturalStorage", n(natural)),
        ("storage", storage),
    ]);
    Ok(())
}

struct Band {
    lo: f64,
    hi: f64,
    scaled: bool,
    flat: bool,
}

/// A map object's distance band (`EXTRA_BANDS`, tables.rs), and whether it sits on flat, dry ground outside
/// flood reach (§11.4: mine sites, relics and geothermal fields).
fn extra_band(kind: &str) -> Option<Band> {
    let (lo, hi, scaled) = tables::extra_band(kind)?;
    Some(Band { lo, hi, scaled, flat: matches!(kind, "mineSite" | "relicSmall" | "relicMedium" | "relicLarge" | "geothermal") })
}

/// `extras.placement`.
fn check_extras(p: &Playable, hgt: &[u8], w: usize, h: usize, sd: &[f64], c: &mut Collector) -> Result<(), Refusal> {
    let Some(f) = &p.features else {
        c.not_applicable("extras.placement", "playability", "Imported maps keep their objects where they are", false);
        return Ok(());
    };
    if f.extras.is_empty() {
        c.not_applicable("extras.placement", "playability", "No relics, geothermal fields, mine sites, thorn belts or unstable cores on this map", false);
        return Ok(());
    }
    let nn = w * h;
    let (wi, hi) = (w as i64, h as i64);
    let mut flood = vec![0u8; nn];
    for i in 0..nn {
        if !(p.depth[i] > WET) {
            continue;
        }
        let x = (i % w) as i64;
        let y = (i / w) as i64;
        for dy in -FLOOD_MARGIN..=FLOOD_MARGIN {
            for dx in -FLOOD_MARGIN..=FLOOD_MARGIN {
                let (xx, yy) = (x + dx, y + dy);
                if xx >= 0 && yy >= 0 && xx < wi && yy < hi {
                    flood[(yy * wi + xx) as usize] = 1;
                }
            }
        }
    }
    for lake in &f.lakes {
        if !lake.planned {
            continue;
        }
        let mk = polygon_mask(&lake.outline, w, h);
        for i in 0..nn {
            if mk[i] != 0 {
                flood[i] = 1;
            }
        }
    }
    let side = if w > h { w } else { h };
    let scale = if side >= 128 { 1.0 } else { side as f64 / 128.0 };
    let mut bad: Vec<(i64, i64)> = vec![];
    let mut why: Vec<String> = vec![];
    let mut cores: Vec<(Vec<(i64, i64)>, f64)> = vec![];
    for e in &f.extras {
        let band = extra_band(&e.kind).ok_or_else(|| "A map object is of an unknown kind".to_string())?;
        let on: Vec<(i64, i64)> = e.tiles.iter().copied().filter(|&(x, y)| x >= 0 && y >= 0 && x < wi && y < hi).collect();
        let name = object_name(&e.kind).ok_or_else(|| "A map object is of an unknown kind".to_string())?;
        // one line: "Geothermal field on uneven ground · X 105 · Y 7 · Z 11" (the object's first tile)
        let line = |wrong: &str| -> String {
            let (x, y) = if !on.is_empty() { on[0] } else { (0.max(e.tiles[0].0), 0.max(e.tiles[0].1)) };
            let z = if x >= 0 && y >= 0 && x < wi && y < hi { hgt[(y * wi + x) as usize] as i64 } else { 0 };
            format!("{} {} · {}", name, wrong, place_of(x, y, z))
        };
        let mut problem = String::new();
        if on.len() < e.tiles.len() {
            problem = line("off the map");
        } else if band.flat {
            if on.is_empty() {
                return Err("A map object covers no tiles".into());
            }
            let lv = hgt[(on[0].1 * wi + on[0].0) as usize];
            if on.iter().any(|&(x, y)| hgt[(y * wi + x) as usize] != lv) {
                problem = line("on uneven ground");
            } else if on.iter().any(|&(x, y)| flood[(y * wi + x) as usize] != 0) {
                problem = line(&format!("within {} tiles of water", FLOOD_MARGIN));
            }
        }
        if problem.is_empty() && e.generated && !on.is_empty() {
            let lo = if band.scaled { band.lo * scale } else { band.lo };
            let hi2 = if band.scaled { band.hi * scale } else { band.hi };
            let mut dd = f64::INFINITY;
            for &(x, y) in &on {
                let v = sd[(y * wi + x) as usize];
                if v < dd {
                    dd = v;
                }
            }
            if dd < lo || dd > hi2 {
                problem = line(&format!("{} tiles from the start, wanted {}{}", num(round(dd)), num(round(lo)), if hi2 < f64::INFINITY { format!("–{}", num(round(hi2))) } else { "+".into() }));
            }
        }
        if problem.is_empty() && e.kind == "unstableCore" && e.generated {
            cores.push((on.clone(), e.core_radius));
        }
        if !problem.is_empty() {
            why.push(problem);
            if !on.is_empty() {
                bad.push(on[0]);
            } else {
                let t0 = e.tiles[0];
                bad.push(((wi - 1).min(0.max(t0.0)), (hi - 1).min(0.max(t0.1))));
            }
        }
    }
    for a in 0..cores.len() {
        for bb in a + 1..cores.len() {
            let mut gap = f64::INFINITY;
            for &(ax, ay) in &cores[a].0 {
                for &(bx, by) in &cores[bb].0 {
                    let g = (ax - bx).abs().max((ay - by).abs()) as f64;
                    if g < gap {
                        gap = g;
                    }
                }
            }
            if gap < portable::max(cores[a].1, cores[bb].1) + 2.0 {
                let (x, y) = cores[bb].0[0];
                why.push(format!("Unstable cores {} tiles apart · {}", num(gap), place_of(x, y, hgt[(y * wi + x) as usize] as i64)));
                bad.push(cores[bb].0[0]);
            }
        }
    }
    let mut r = vec![
        ("id", s("extras.placement")),
        ("class", s("playability")),
        ("ok", b(bad.is_empty())),
        ("value", n(bad.len() as f64)),
        ("limit", n(0.0)),
        ("message", s(if !bad.is_empty() { lines(&why) } else { format!("{} where they should be", counted(f.extras.len() as f64, "map object")) })),
    ];
    if !bad.is_empty() {
        r.push(("where", obj(vec![("tiles", tiles(&bad[..bad.len().min(20)]))])));
    }
    c.add(r);
    Ok(())
}

/// `startPlanting`: berry bushes and oaks on the nearest free soil within the walk, one step each.
#[allow(clippy::too_many_arguments)]
fn start_planting(w: usize, h: usize, objects: &[&Entity], blocked: &[u8], wet: &[u8], depth: &[f64], mo: &[f64], sc: &[f64], walk: &[f64], sd: &[f64], bushes: f64, logs: f64) -> (Vec<Json>, Vec<Json>) {
    let mut out_b: Vec<Json> = vec![];
    let mut out_t: Vec<Json> = vec![];
    if bushes <= 0.0 && logs <= 0.0 {
        return (out_b, out_t);
    }
    let nn = w * h;
    let (wi, hi) = (w as i64, h as i64);
    let mut taken = vec![0u8; nn];
    for o in objects {
        let t = match footprint(&o.template) {
            Some(fp) => footprint_tiles(fp, &Placement::of(o)),
            None => vec![(o.x, o.y)],
        };
        for (x, y) in t {
            if x >= 0 && x < wi && y >= 0 && y < hi {
                taken[(y * wi + x) as usize] = 1;
            }
        }
    }
    let mut moist: Vec<(usize, f64)> = vec![];
    let mut dry: Vec<(usize, f64)> = vec![];
    for i in 0..nn {
        if taken[i] != 0 || blocked[i] != 0 || wet[i] != 0 || depth[i] > 0.0 || sd[i] < 3.0 {
            continue;
        }
        let x = i % w;
        let y = i / w;
        if x < 1 || y < 1 || x + 2 > w || y + 2 > h {
            continue;
        }
        let dd = water::reach_at(walk, w, h, i);
        if !(dd <= NEAR - 2.0) {
            continue;
        }
        if mo[i] > 0.0 && !(sc[i] > 0.0) {
            moist.push((i, dd));
        } else {
            dry.push((i, dd));
        }
    }
    let near = |a: &(usize, f64), bb: &(usize, f64)| {
        let v = a.1 - bb.1;
        let v = if v != 0.0 { v } else { a.0 as f64 - bb.0 as f64 };
        if v < 0.0 {
            std::cmp::Ordering::Less
        } else if v > 0.0 {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Equal
        }
    };
    moist.sort_by(near);
    dry.sort_by(near);
    let place = |template: &str, i: usize| -> Json {
        obj(vec![
            ("op", s("placeEntity")),
            ("label", s("")),
            (
                "params",
                obj(vec![
                    ("id", s(guid_from(&["fix:start", template, &i.to_string()]))),
                    ("template", s(template)),
                    ("x", n((i % w) as f64)),
                    ("y", n((i / w) as f64)),
                    ("orientation", s("Cw0")),
                ]),
            ),
        ])
    };
    let mut k = 0;
    while k < moist.len() && (out_b.len() as f64) < bushes {
        out_b.push(place("BlueberryBush", moist[k].0));
        k += 1;
    }
    let oak = logs_per_tree("Oak").unwrap();
    let oaks = portable::max(0.0, (logs / oak).ceil());
    for st in moist[k..].iter().chain(dry.iter()) {
        if out_t.len() as f64 >= oaks {
            break;
        }
        out_t.push(place("Oak", st.0));
    }
    if (out_b.len() as f64) < bushes {
        out_b.clear();
    }
    if (out_t.len() as f64) < oaks {
        out_t.clear();
    }
    let relabel = |list: &mut Vec<Json>, label: String| {
        if let Some(Json::Obj(first)) = list.first_mut() {
            for (key, v) in first.iter_mut() {
                if key == "label" {
                    *v = s(label.clone());
                }
            }
        }
    };
    if !out_b.is_empty() {
        let k = out_b.len();
        relabel(&mut out_b, format!("Plant {} berry bush{} near the start", k, if k > 1 { "es" } else { "" }));
    }
    if !out_t.is_empty() {
        let k = out_t.len();
        relabel(&mut out_t, format!("Plant {} oak{} for the starting logs", k, if k > 1 { "s" } else { "" }));
    }
    (out_b, out_t)
}
