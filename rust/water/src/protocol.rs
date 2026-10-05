//! The binary formats between TypeScript and the Rust water (little-endian; src/core/sim/rustWater.ts writes
//! and reads them).
//!
//! Model: `w u32, h u32, hasDam u32, floor f64[n], dam f64[n] if hasDam, emitters u32`, then per emitter
//! `cells u32, cell u32[cells], strength f64, contamination f64, hasLimit u32, anchor u32, off f64, on f64`.
//!
//! Rules: `game u32, edgeSpill u32` (water.ts `WaterSimOptions`, resolved).
//!
//! - A simulation (`water_new`): `"DGMS" u32, model, rules, hasStart u32, depth f64[n], contamination f64[n]`.
//! - A strip of a larger map (`water_strip`, the multi-core water): `"DGMT" u32, model, rules, depth f64[n],
//!   contamination f64[n], y0 u32, mapHeight u32, count u32[emitters]`: the model holds the strip's rows only
//!   (`n` its tiles), the map's rows `y0..` of `mapHeight`, and each emitter its cells on them, `count` being the
//!   whole emitter's tile count; a seep's anchor is a tile of the strip.
//! - A canonical settle job (`water_canonical`, the native batch binary): `"DGMC" u32, model, rules, lakes u32`, per
//!   lake `tiles u32, tile u32[tiles]`, then `drained u32, tile u32[drained], depth f64[n],
//!   contamination f64[n]` (the pre-fill's water). Its result: `settled u32, ticks f64, hasSteady u32,
//!   steadyTicks f64, depth f64[n], contamination f64[n], out f64[4n], sat u8[n]`.

use crate::settle::{CanonicalRun, Stored};
use crate::sim::{Emitter, Model, Rules, Sim};

pub const SIM_MAGIC: u32 = 0x534d_4744; // "DGMS"
pub const CANONICAL_MAGIC: u32 = 0x434d_4744; // "DGMC"
pub const STRIP_MAGIC: u32 = 0x544d_4744; // "DGMT"

pub struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    pub fn new(b: &'a [u8]) -> Self {
        Reader { b, at: 0 }
    }
    pub fn u32(&mut self) -> u32 {
        let v = u32::from_le_bytes(self.b[self.at..self.at + 4].try_into().expect("u32"));
        self.at += 4;
        v
    }
    pub fn f64(&mut self) -> f64 {
        let v = f64::from_le_bytes(self.b[self.at..self.at + 8].try_into().expect("f64"));
        self.at += 8;
        v
    }
    pub fn f64s(&mut self, n: usize) -> Vec<f64> {
        (0..n).map(|_| self.f64()).collect()
    }
    pub fn u32s(&mut self, n: usize) -> Vec<u32> {
        (0..n).map(|_| self.u32()).collect()
    }
    pub fn done(&self) -> bool {
        self.at == self.b.len()
    }
}

fn read_model(r: &mut Reader) -> Model {
    let w = r.u32() as usize;
    let h = r.u32() as usize;
    assert!(w > 0 && h > 0, "an empty map");
    let n = w.checked_mul(h).expect("map size");
    let has_dam = r.u32() != 0;
    let floor = r.f64s(n);
    let dam = has_dam.then(|| r.f64s(n));
    let count = r.u32() as usize;
    let mut emitters = Vec::with_capacity(count);
    for _ in 0..count {
        let cells_n = r.u32() as usize;
        let cells = r.u32s(cells_n);
        assert!(cells.iter().all(|&i| (i as usize) < n), "an emitter cell off the map");
        let strength = r.f64();
        let contamination = r.f64();
        let has_limit = r.u32() != 0;
        let anchor = r.u32();
        let off = r.f64();
        let on = r.f64();
        assert!(!has_limit || (anchor as usize) < n, "a seep anchor off the map");
        emitters.push(Emitter { cells, strength, contamination, limit: has_limit.then_some((anchor, off, on)) });
    }
    Model { w, h, floor, dam, emitters }
}

fn read_rules(r: &mut Reader) -> Rules {
    let game = r.u32() != 0;
    let edge_spill = r.u32() != 0;
    Rules { game, edge_spill }
}

/// A simulation (`water_new`).
pub fn decode_sim(bytes: &[u8]) -> Sim {
    let mut r = Reader::new(bytes);
    assert_eq!(r.u32(), SIM_MAGIC, "not a simulation");
    let model = read_model(&mut r);
    let rules = read_rules(&mut r);
    let n = model.w * model.h;
    let has_start = r.u32() != 0;
    let (depth, contamination) = if has_start { (Some(r.f64s(n)), Some(r.f64s(n))) } else { (None, None) };
    assert!(r.done(), "trailing bytes");
    Sim::new(model, depth.as_deref(), contamination.as_deref(), rules)
}

/// A strip of a larger map (`water_strip`).
pub fn decode_strip(bytes: &[u8]) -> Sim {
    let mut r = Reader::new(bytes);
    assert_eq!(r.u32(), STRIP_MAGIC, "not a strip");
    let model = read_model(&mut r);
    let rules = read_rules(&mut r);
    let n = model.w * model.h;
    let depth = r.f64s(n);
    let contamination = r.f64s(n);
    let y0 = r.u32() as usize;
    let gh = r.u32() as usize;
    assert!(y0 + model.h <= gh, "a strip off the map");
    let counts: Vec<usize> = (0..model.emitters.len()).map(|_| r.u32() as usize).collect();
    assert!(model.emitters.iter().zip(&counts).all(|(e, &c)| e.cells.len() <= c), "an emitter with more cells than its count");
    assert!(r.done(), "trailing bytes");
    Sim::new_strip(model, &depth, &contamination, rules, y0, gh, &counts)
}

/// A canonical settle job, run to the end, and its encoded result.
pub fn canonical_job(bytes: &[u8]) -> Vec<u8> {
    let mut r = Reader::new(bytes);
    assert_eq!(r.u32(), CANONICAL_MAGIC, "not a canonical settle job");
    let model = read_model(&mut r);
    let rules = read_rules(&mut r);
    let n = model.w * model.h;
    let lakes = r.u32() as usize;
    let mut retained = Vec::with_capacity(lakes);
    for _ in 0..lakes {
        let k = r.u32() as usize;
        let tiles = r.u32s(k);
        assert!(tiles.iter().all(|&i| (i as usize) < n), "a lake tile off the map");
        retained.push(tiles);
    }
    let dn = r.u32() as usize;
    let drained = r.u32s(dn);
    assert!(drained.iter().all(|&i| (i as usize) < n), "a drained tile off the map");
    let depth = r.f64s(n);
    let contamination = r.f64s(n);
    assert!(r.done(), "trailing bytes");
    let mut run = CanonicalRun::new(model, Stored { retained, drained }, depth, contamination, rules);
    while !run.advance(u64::MAX) {}
    let done = run.done.expect("finished");
    let mut out = Vec::with_capacity(24 + n * (8 * 7 + 1));
    out.extend_from_slice(&(done.result.settled as u32).to_le_bytes());
    out.extend_from_slice(&(done.result.ticks as f64).to_le_bytes());
    out.extend_from_slice(&(done.result.steady_ticks.is_some() as u32).to_le_bytes());
    out.extend_from_slice(&(done.result.steady_ticks.unwrap_or(0) as f64).to_le_bytes());
    for v in done.depth.iter().chain(&done.contamination).chain(&done.out) {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out.extend_from_slice(&done.sat);
    out
}
