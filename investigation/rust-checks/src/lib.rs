//! The map checks in Rust (PLAN §20 D381): src/core/validate (checks.ts, playability.ts, report.ts), the same
//! verdicts and report byte for byte, natively and in WebAssembly. One call validates a map: the host fills the
//! retained input buffers (input.rs), calls `checks_run`, and reads the report and the analysis from the output
//! buffers. The analysis kernels are the analysis port's own (build.rs); the maths is `rust/portable`.

#[allow(dead_code, clippy::all, unexpected_cfgs)]
mod analysis {
    include!(concat!(env!("OUT_DIR"), "/analysis.rs"));
}
pub mod checks;
pub mod geom;
pub mod input;
pub mod js;
pub mod json;
pub mod land;
pub mod mechanics;
pub mod misc;
pub mod playability;
pub mod report;
pub mod soil;
pub mod tables;
pub mod water;

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
/// The map is one this port leaves to the TypeScript (OUT_REFUSAL says why): the host runs the TypeScript.
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

#[no_mangle]
pub extern "C" fn checks_output(kind: u32) -> *const u8 {
    ARENA.with(|a| a.borrow().outputs[kind as usize].bytes().as_ptr())
}

#[no_mangle]
pub extern "C" fn checks_output_len(kind: u32) -> usize {
    ARENA.with(|a| a.borrow().outputs[kind as usize].len)
}
