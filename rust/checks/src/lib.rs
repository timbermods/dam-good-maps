//! The map checks (PLAN §20 D381, D465; #207): the load, design, principle and playability checks and their
//! report, the same bytes as the TypeScript they replaced (tag `ts-checks-final`), natively and in WebAssembly.
//! One call validates a map: the host (src/core/validate/rust.ts) fills the retained input buffers (input.rs),
//! calls `checks_run`, and reads the report and the analysis from the output buffers. The analysis kernels are
//! rust/analysis' own (kernels.rs); the maths is rust/portable; the data shared with the TypeScript is
//! generated into tables.rs (tools/rust/checks-tables.ts).

pub mod checks;
pub mod floors;
pub mod geom;
pub mod input;
pub mod js;
pub mod json;
mod kernels;
pub mod land;
pub mod mechanics;
pub mod misc;
pub mod playability;
pub mod report;
pub mod soil;
pub mod tables;
pub mod water;
pub mod words;

use std::cell::RefCell;

pub const OUT_REPORT: usize = 0;
pub const OUT_ANALYSIS: usize = 1;
pub const OUT_MOISTURE: usize = 2;
pub const OUT_SOIL_CONTAMINATION: usize = 3;
pub const OUT_REACH: usize = 4;
pub const OUT_START_DISTANCE: usize = 5;
pub const OUT_SCALARS: usize = 6;
pub const OUT_REFUSAL: usize = 7;
pub const OUTPUTS: usize = 8;

pub const STATUS_OK: u32 = 0;
/// The map is refused (D342): OUT_REFUSAL holds the one-line reason.
pub const STATUS_REFUSED: u32 = 1;
/// The input buffers do not hold a map.
pub const STATUS_BAD_INPUT: u32 = 2;

/// A buffer of bytes, 8-byte aligned so the host can view it as a Float64Array.
#[derive(Default)]
pub struct Buffer {
    words: Vec<u64>,
    len: usize,
}

impl Buffer {
    pub fn resize(&mut self, bytes: usize) -> *mut u8 {
        self.words.clear();
        self.words.resize(bytes.div_ceil(8).max(1), 0);
        self.len = bytes;
        self.words.as_mut_ptr() as *mut u8
    }
    pub fn bytes(&self) -> &[u8] {
        if self.words.is_empty() {
            return &[];
        }
        // SAFETY: the words own at least `len` bytes.
        unsafe { std::slice::from_raw_parts(self.words.as_ptr() as *const u8, self.len) }
    }
    pub fn set(&mut self, data: &[u8]) {
        let p = self.resize(data.len());
        // SAFETY: `resize` made room for `data.len()` bytes.
        unsafe { std::ptr::copy_nonoverlapping(data.as_ptr(), p, data.len()) };
    }
    fn set_f64(&mut self, v: &[f64]) {
        let bytes: Vec<u8> = v.iter().flat_map(|x| x.to_le_bytes()).collect();
        self.set(&bytes);
    }
}

#[derive(Default)]
pub struct Arena {
    pub inputs: [Buffer; input::INPUTS],
    pub outputs: [Buffer; OUTPUTS],
}

impl Arena {
    /// Validate the map in the input buffers into the output buffers.
    pub fn run(&mut self) -> u32 {
        for o in self.outputs.iter_mut() {
            o.resize(0);
        }
        let views: Vec<&[u8]> = self.inputs.iter().map(|b| b.bytes()).collect();
        let map = match input::read(&views) {
            Ok(m) => m,
            Err(e) => {
                self.outputs[OUT_REFUSAL].set(e.as_bytes());
                return STATUS_BAD_INPUT;
            }
        };
        match checks::validate_map(&map) {
            Err(why) => {
                self.outputs[OUT_REFUSAL].set(why.as_bytes());
                STATUS_REFUSED
            }
            Ok(v) => {
                self.outputs[OUT_REPORT].set(v.report.as_bytes());
                if let Some(a) = v.analysis {
                    let doc = json::obj(vec![("analysis", a.rest), ("mechanics", v.mechanics.unwrap_or(json::Json::Null))]);
                    self.outputs[OUT_ANALYSIS].set(doc.text().as_bytes());
                    self.outputs[OUT_MOISTURE].set_f64(&a.moisture);
                    self.outputs[OUT_SOIL_CONTAMINATION].set_f64(&a.soil_contamination);
                    self.outputs[OUT_REACH].set(&a.reach);
                    if let Some(sd) = &a.start_distance {
                        self.outputs[OUT_START_DISTANCE].set_f64(sd);
                    }
                    self.outputs[OUT_SCALARS].set_f64(&[a.water_distance]);
                }
                STATUS_OK
            }
        }
    }

    /// The floor graph (floors.rs) of the terrain in input buffer VOXELS (`layers`·`w`·`h` bytes), with the
    /// map's slopes in input buffer META as little-endian i32 quadruples (x, y, level, facing 0–3). Output
    /// buffer OUT_REPORT takes one i32 triple per floor (its tile, its level, its area), tile by tile and
    /// bottom to top in each.
    pub fn floors(&mut self, w: usize, h: usize, layers: usize) -> u32 {
        for o in self.outputs.iter_mut() {
            o.resize(0);
        }
        let voxels = self.inputs[input::VOXELS].bytes();
        let meta = self.inputs[input::META].bytes();
        if w == 0 || h == 0 || voxels.len() != layers * w * h || meta.len() % 16 != 0 {
            self.outputs[OUT_REFUSAL].set(b"floors: the terrain or the slopes are the wrong size");
            return STATUS_BAD_INPUT;
        }
        let int = |c: &[u8]| i32::from_le_bytes(c.try_into().unwrap()) as i64;
        // (a facing outside the four joins nothing)
        let facing = |o: i64| if (0..=3).contains(&o) { o as u8 } else { 4 };
        let slopes: Vec<floors::SlopeAt> = meta.chunks_exact(16).map(|q| floors::SlopeAt { x: int(&q[0..4]), y: int(&q[4..8]), z: int(&q[8..12]), orientation: facing(int(&q[12..16])) }).collect();
        let g = floors::floor_graph(voxels, w, h, layers, &slopes);
        let mut out: Vec<u8> = Vec::with_capacity(g.len() * 12);
        for k in 0..g.len() {
            out.extend((g.tile[k] as i32).to_le_bytes());
            out.extend((g.level[k] as i32).to_le_bytes());
            out.extend((g.area[k] as i32).to_le_bytes());
        }
        self.outputs[OUT_REPORT].set(&out);
        STATUS_OK
    }
}

thread_local! {
    static ARENA: RefCell<Arena> = RefCell::new(Arena::default());
}

/// Resize input buffer `kind` to `bytes` bytes (zeroed) and return where the host writes them. Views of the
/// memory must be taken again after this call (the memory may grow).
#[no_mangle]
pub extern "C" fn checks_input(kind: u32, bytes: usize) -> *mut u8 {
    ARENA.with(|a| a.borrow_mut().inputs[kind as usize].resize(bytes))
}

/// Validate the map the input buffers hold: one call per validation.
#[no_mangle]
pub extern "C" fn checks_run() -> u32 {
    ARENA.with(|a| a.borrow_mut().run())
}

/// The floor graph of the terrain and slopes the input buffers hold (`Arena::floors`).
#[no_mangle]
pub extern "C" fn checks_floors(w: u32, h: u32, layers: u32) -> u32 {
    ARENA.with(|a| a.borrow_mut().floors(w as usize, h as usize, layers as usize))
}

#[no_mangle]
pub extern "C" fn checks_output(kind: u32) -> *const u8 {
    ARENA.with(|a| a.borrow().outputs[kind as usize].bytes().as_ptr())
}

#[no_mangle]
pub extern "C" fn checks_output_len(kind: u32) -> usize {
    ARENA.with(|a| a.borrow().outputs[kind as usize].len)
}
