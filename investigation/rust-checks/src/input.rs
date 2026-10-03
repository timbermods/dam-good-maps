// The map as the checks read it, filled by the host straight into typed buffers (host/encode.ts writes them):
// the voxels, the settled water and the water model's floor as raw arrays, and one small metadata block (META)
// with what the host reads from the file's JSON (each entity's placement and the few component facts the checks
// use, the singletons' sizes, the spec's settings, the features' geometry). No map codec: big arrays are copied
// as they are.

use std::collections::HashSet;

pub const META: usize = 0;
pub const VOXELS: usize = 1;
pub const DEPTH: usize = 2;
pub const CONTAMINATION: usize = 3;
pub const FLOOR: usize = 4;
pub const DAM: usize = 5;
pub const STORED_WET: usize = 6;
pub const THUMBNAIL: usize = 7;
pub const INPUTS: usize = 8;

/// The REQUIRED components the checks look for, as bits of `Entity::comps`.
pub const COMP_NAMES: [&str; 6] = ["WaterSource", "WaterDepthStrengthModifier", "UnstableCore", "FixedStockpile", "RuinModels", "Yielder:Ruin"];

pub struct Entity {
    pub id: String,
    pub template: String,
    /// `placementOf(e)` is not null.
    pub placed: bool,
    pub x: i64,
    pub y: i64,
    pub z: i64,
    /// 0–3: Cw0, Cw90, Cw180, Cw270; 4: anything else.
    pub orientation: u8,
    pub flipped: bool,
    /// `specifiedStrength`, `isDelayed`, `LivingNaturalResource.IsDead === true`.
    pub strength: f64,
    pub delayed: bool,
    pub dead: bool,
    /// `!!LivingNaturalResource?.IsDead` (the resource totals' reading).
    pub dead_truthy: bool,
    /// `Yielder:Cuttable` giving logs: its amount as `numberOf` reads it (None: no such yield, or unreadable).
    pub cut_logs: Option<f64>,
    /// `growthOf` (None: grown).
    pub growth: Option<f64>,
    pub comps: u32,
}

pub struct Emitter {
    pub cells: Vec<usize>,
    pub strength: f64,
    pub contamination: f64,
}

pub struct Settings {
    pub rules: Option<[f64; 5]>,
    pub badwater_distance: f64,
    pub buildable_land: Option<String>,
    pub start_area: Option<String>,
    pub sources: Option<String>,
    pub drought_reserve: Option<String>,
    pub ruins: f64,
    pub forest: f64,
    pub berries: f64,
    pub badwater: Option<String>,
}

pub struct Spec {
    pub designed_for: String,
    pub theme: String,
    pub settings: Option<Settings>,
}

pub struct Lake {
    pub outline: Vec<(f64, f64)>,
    pub planned: bool,
}

pub struct Basin {
    pub x: f64,
    pub y: f64,
    pub floor: f64,
    pub outlet: Vec<f64>,
    pub levels: Vec<f64>,
    pub width: f64,
}

pub struct Extra {
    pub kind: String,
    pub generated: bool,
    pub tiles: Vec<(i64, i64)>,
    pub core_radius: f64,
}

pub struct Features {
    pub lakes: Vec<Lake>,
    pub basins: Vec<Basin>,
    pub extras: Vec<Extra>,
}

pub struct Metadata {
    pub all_keys: bool,
    pub width: f64,
    pub height: f64,
    pub width_text: String,
    pub height_text: String,
}

pub struct Playable {
    pub floor: Vec<f64>,
    pub dam: Option<Vec<f64>>,
    pub emitters: Vec<Emitter>,
    pub depth: Vec<f64>,
    pub contamination: Vec<f64>,
    pub settled: bool,
    pub ticks: f64,
    pub steady_ticks: Option<f64>,
    pub spec: Option<Spec>,
    pub designed_for: String,
    pub description: String,
    pub features: Option<Features>,
    pub stored_wet: Option<Vec<u8>>,
    pub mine_cut: Option<HashSet<i64>>,
    pub soil_port: bool,
}

pub struct Map {
    pub w: usize,
    pub h: usize,
    pub layers: usize,
    pub profile: u8,
    pub external: bool,
    pub editing: bool,
    pub game_version: String,
    pub version_txt: String,
    /// Bit k: the k-th of the six singletons checkFile needs is present.
    pub singletons: u32,
    pub migrated: bool,
    pub levels: f64,
    /// WaterColumns, ColumnOutflows, MoistureLevels, ContaminationLevels, ContaminationCandidates,
    /// EvaporationModifiers: token counts, −1 when absent.
    pub lens: [f64; 6],
    /// Soil moisture Size, soil contamination Size, evaporation Levels (1 when absent).
    pub slots: [f64; 3],
    pub metadata: Option<Metadata>,
    pub thumbnail: Option<Vec<u8>>,
    pub voxels: Vec<u8>,
    pub entities: Vec<Entity>,
    /// None with loadOnly.
    pub play: Option<Playable>,
}

pub struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}

pub type Bad = String;

impl<'a> Reader<'a> {
    pub fn new(b: &'a [u8]) -> Self {
        Reader { b, at: 0 }
    }
    fn take(&mut self, n: usize) -> Result<&'a [u8], Bad> {
        if self.at + n > self.b.len() {
            return Err("meta: short".into());
        }
        let s = &self.b[self.at..self.at + n];
        self.at += n;
        Ok(s)
    }
    pub fn u8(&mut self) -> Result<u8, Bad> {
        Ok(self.take(1)?[0])
    }
    pub fn u32(&mut self) -> Result<u32, Bad> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    pub fn f64(&mut self) -> Result<f64, Bad> {
        Ok(f64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    pub fn bool(&mut self) -> Result<bool, Bad> {
        Ok(self.u8()? != 0)
    }
    pub fn str(&mut self) -> Result<String, Bad> {
        let n = self.u32()? as usize;
        String::from_utf8(self.take(n)?.to_vec()).map_err(|_| "meta: utf-8".into())
    }
    pub fn opt_str(&mut self) -> Result<Option<String>, Bad> {
        Ok(if self.bool()? { Some(self.str()?) } else { None })
    }
    pub fn f64s(&mut self) -> Result<Vec<f64>, Bad> {
        let n = self.u32()? as usize;
        (0..n).map(|_| self.f64()).collect()
    }
    /// A coordinate the checks index with: an integer (the host refuses others).
    pub fn int(&mut self) -> Result<i64, Bad> {
        let v = self.f64()?;
        if v.floor() != v || v.abs() > 1e9 {
            return Err("meta: non-integer coordinate".into());
        }
        Ok(v as i64)
    }
    pub fn done(&self) -> Result<(), Bad> {
        if self.at == self.b.len() {
            Ok(())
        } else {
            Err("meta: trailing bytes".into())
        }
    }
}

fn f64_array(bytes: &[u8], n: usize, what: &str) -> Result<Vec<f64>, Bad> {
    if bytes.len() != n * 8 {
        return Err(format!("{}: {} bytes, expected {}", what, bytes.len(), n * 8));
    }
    Ok(bytes.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect())
}

/// The map from the input buffers (`inputs[k]`: the bytes the host wrote for buffer k).
pub fn read(inputs: &[&[u8]]) -> Result<Map, Bad> {
    let mut r = Reader::new(inputs[META]);
    if r.u32()? != 0x434d_4744 {
        return Err("meta: magic".into());
    }
    if r.u32()? != 1 {
        return Err("meta: version".into());
    }
    let w = r.u32()? as usize;
    let h = r.u32()? as usize;
    let layers = r.u32()? as usize;
    let profile = r.u8()?;
    let external = r.bool()?;
    let editing = r.bool()?;
    let load_only = r.bool()?;
    let game_version = r.str()?;
    let version_txt = r.str()?;
    let singletons = r.u32()?;
    let migrated = r.bool()?;
    let levels = r.f64()?;
    let mut lens = [0.0; 6];
    for v in lens.iter_mut() {
        *v = r.f64()?;
    }
    let mut slots = [0.0; 3];
    for v in slots.iter_mut() {
        *v = r.f64()?;
    }
    let metadata = if r.bool()? {
        Some(Metadata { all_keys: r.bool()?, width: r.f64()?, height: r.f64()?, width_text: r.str()?, height_text: r.str()? })
    } else {
        None
    };
    let has_thumbnail = r.bool()?;
    let n_entities = r.u32()? as usize;
    let mut entities = Vec::with_capacity(n_entities);
    for _ in 0..n_entities {
        let id = r.str()?;
        let template = r.str()?;
        let placed = r.bool()?;
        let (x, y, z, orientation, flipped) = if placed { (r.int()?, r.int()?, r.int()?, r.u8()?, r.bool()?) } else { (0, 0, 0, 0, false) };
        let strength = r.f64()?;
        let delayed = r.bool()?;
        let dead = r.bool()?;
        let dead_truthy = r.bool()?;
        let cut_logs = if r.bool()? { Some(r.f64()?) } else { None };
        let growth = if r.bool()? { Some(r.f64()?) } else { None };
        let comps = r.u32()?;
        entities.push(Entity { id, template, placed, x, y, z, orientation, flipped, strength, delayed, dead, dead_truthy, cut_logs, growth, comps });
    }
    let n = w * h;
    let play = if load_only {
        None
    } else {
        let n_emitters = r.u32()? as usize;
        let mut emitters = Vec::with_capacity(n_emitters);
        for _ in 0..n_emitters {
            let cells = r.f64s()?;
            let mut cs = Vec::with_capacity(cells.len());
            for c in cells {
                if !(c >= 0.0 && c < n as f64 && c.floor() == c) {
                    return Err("meta: emitter cell".into());
                }
                cs.push(c as usize);
            }
            emitters.push(Emitter { cells: cs, strength: r.f64()?, contamination: r.f64()? });
        }
        let settled = r.bool()?;
        let ticks = r.f64()?;
        let steady_ticks = if r.bool()? { Some(r.f64()?) } else { None };
        let spec = if r.bool()? {
            let designed_for = r.str()?;
            let theme = r.str()?;
            let settings = if r.bool()? {
                let rules = if r.bool()? {
                    let mut v = [0.0; 5];
                    for x in v.iter_mut() {
                        *x = r.f64()?;
                    }
                    Some(v)
                } else {
                    None
                };
                Some(Settings {
                    rules,
                    badwater_distance: r.f64()?,
                    buildable_land: r.opt_str()?,
                    start_area: r.opt_str()?,
                    sources: r.opt_str()?,
                    drought_reserve: r.opt_str()?,
                    ruins: r.f64()?,
                    forest: r.f64()?,
                    berries: r.f64()?,
                    badwater: r.opt_str()?,
                })
            } else {
                None
            };
            Some(Spec { designed_for, theme, settings })
        } else {
            None
        };
        let designed_for = r.str()?;
        let description = r.str()?;
        let features = if r.bool()? {
            let mut lakes = vec![];
            for _ in 0..r.u32()? {
                let pts = r.f64s()?;
                if pts.len() % 2 != 0 {
                    return Err("meta: outline".into());
                }
                lakes.push(Lake { outline: pts.chunks_exact(2).map(|p| (p[0], p[1])).collect(), planned: r.bool()? });
            }
            let mut basins = vec![];
            for _ in 0..r.u32()? {
                basins.push(Basin { x: r.f64()?, y: r.f64()?, floor: r.f64()?, outlet: r.f64s()?, levels: r.f64s()?, width: r.f64()? });
            }
            let mut extras = vec![];
            for _ in 0..r.u32()? {
                let kind = r.str()?;
                let generated = r.bool()?;
                let nt = r.u32()? as usize;
                let mut tiles = Vec::with_capacity(nt);
                for _ in 0..nt {
                    tiles.push((r.int()?, r.int()?));
                }
                extras.push(Extra { kind, generated, tiles, core_radius: r.f64()? });
            }
            Some(Features { lakes, basins, extras })
        } else {
            None
        };
        let has_stored = r.bool()?;
        let mine_cut = if r.bool()? {
            let v = r.f64s()?;
            Some(v.into_iter().map(|x| x as i64).collect())
        } else {
            None
        };
        let soil_port = r.bool()?;
        let floor = f64_array(inputs[FLOOR], n, "floor")?;
        let dam = if inputs[DAM].is_empty() { None } else { Some(f64_array(inputs[DAM], n, "dam")?) };
        let depth = f64_array(inputs[DEPTH], n, "depth")?;
        let contamination = f64_array(inputs[CONTAMINATION], n, "contamination")?;
        let stored_wet = if has_stored {
            if inputs[STORED_WET].len() != n {
                return Err("stored wet: length".into());
            }
            Some(inputs[STORED_WET].to_vec())
        } else {
            None
        };
        Some(Playable { floor, dam, emitters, depth, contamination, settled, ticks, steady_ticks, spec, designed_for, description, features, stored_wet, mine_cut, soil_port })
    };
    r.done()?;
    if inputs[VOXELS].len() != layers * n {
        return Err("voxels: length".into());
    }
    if w == 0 || h == 0 {
        return Err("empty map".into());
    }
    Ok(Map {
        w,
        h,
        layers,
        profile,
        external,
        editing,
        game_version,
        version_txt,
        singletons,
        migrated,
        levels,
        lens,
        slots,
        metadata,
        thumbnail: if has_thumbnail { Some(inputs[THUMBNAIL].to_vec()) } else { None },
        voxels: inputs[VOXELS].to_vec(),
        entities,
        play,
    })
}
