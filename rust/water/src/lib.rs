//! The Rust water (PLAN §10, §20 D381, D441, D442; from investigation/rust-water, #156, ported afresh from
//! src/core/sim/water.ts as it stood on dev before M9b, sealed settle, fed water and kept water included; not
//! switched on until M9b is on dev, and re-ported to its water.ts then).
//!
//! - `sim`: the simulation (`WaterSim`), byte for byte the TypeScript's.
//! - `settle`: the settle's stopping test, fed water and the canonical settle after its pre-fill.
//! - The Wasm exports below back src/core/sim/water.ts's `WaterSim` in every engine and in Node.
//! - `protocol` is the native batch job format (rust/water/src/main.rs, src/core/sim/native.ts).

pub mod protocol;
pub mod settle;
pub mod sim;

use sim::Sim;

/// Allocates `len` bytes in this module's memory for the caller to fill (freed by `water_dealloc`).
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn water_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}

/// Frees what `water_alloc` (or `water_canonical`) returned.
///
/// # Safety
/// `ptr` and `len` must come from `water_alloc(len)`.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_dealloc(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(core::ptr::slice_from_raw_parts_mut(ptr, len)));
}

/// A simulation from an encoded model and starting water (`protocol::decode_sim`).
///
/// # Safety
/// `ptr..ptr+len` must be readable.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_new(ptr: *const u8, len: usize) -> *mut Sim {
    let bytes = core::slice::from_raw_parts(ptr, len);
    Box::into_raw(Box::new(protocol::decode_sim(bytes)))
}

/// A strip of a larger map for the multi-core water (`protocol::decode_strip`), used as `water_new`'s.
///
/// # Safety
/// `ptr..ptr+len` must be readable.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_strip(ptr: *const u8, len: usize) -> *mut Sim {
    let bytes = core::slice::from_raw_parts(ptr, len);
    Box::into_raw(Box::new(protocol::decode_strip(bytes)))
}

/// Brings the bookkeeping up to date with water written over rows `lo..hi` from outside the run
/// (`Sim::sync_rows`).
///
/// # Safety
/// `s` must come from `water_new` or `water_strip`; `lo <= hi <=` its rows.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_sync(s: *mut Sim, lo: u32, hi: u32) {
    let s = &mut *s;
    assert!(lo <= hi && hi as usize <= s.h, "rows off the simulation");
    s.sync_rows(lo as usize, hi as usize);
}

/// Emitter `k`'s seep state: `set` 0 or 1 switches it off or on, any other value only reads it; returns whether
/// it is on.
///
/// # Safety
/// `s` must come from `water_new` or `water_strip`; `k` must be one of its emitters.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_seep(s: *mut Sim, k: u32, set: u32) -> u32 {
    let s = &mut *s;
    if set <= 1 {
        s.set_seep_on(k as usize, set == 1);
    }
    s.seep_on(k as usize) as u32
}

/// # Safety
/// `s` must come from `water_new` and not be used afterwards.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_free(s: *mut Sim) {
    drop(Box::from_raw(s));
}

/// The simulation's arrays for the caller to read and write between runs: 0 depth, 1 old depth,
/// 2 contamination, 3 outflows (4 per tile), 4 floor, 5 the partial obstacles (null without), 6 every
/// emitter's [strength, contamination, off, on] (4 per emitter). Views of them are valid until the next call
/// that can grow memory.
///
/// # Safety
/// `s` must come from `water_new`.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_ptr(s: *mut Sim, which: u32) -> *mut f64 {
    let s = &mut *s;
    match which {
        0 => s.d.as_mut_ptr(),
        1 => s.dold.as_mut_ptr(),
        2 => s.c.as_mut_ptr(),
        3 => s.out.as_mut_ptr(),
        4 => s.floor.as_mut_ptr(),
        5 => s.dam.as_mut().map_or(core::ptr::null_mut(), |d| d.as_mut_ptr()),
        _ => s.params.as_mut_ptr(),
    }
}

/// Runs `ticks` ticks at source scale `scale`, after reading the emitters' parameters (`water_ptr` 6).
///
/// # Safety
/// `s` must come from `water_new`.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_run(s: *mut Sim, ticks: u32, scale: f64) {
    let s = &mut *s;
    s.read_params();
    s.run(ticks as u64, scale);
}

/// Writes the cluster saturation (one byte per tile) at `p`.
///
/// # Safety
/// `s` must come from `water_new`; `p` must have room for one byte per tile.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_saturation(s: *mut Sim, p: *mut u8) {
    let s = &mut *s;
    let sat = s.saturation();
    core::ptr::copy_nonoverlapping(sat.as_ptr(), p, sat.len());
}

/// The simulation's bookkeeping against the same rebuilt from its water (`Sim::books_check`; for the tests):
/// 0 when they agree. Returned as a float, exact below 2⁵³.
///
/// # Safety
/// `s` must come from `water_new`.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_books(s: *mut Sim) -> f64 {
    (*s).books_check() as f64
}

/// The whole canonical settle after its pre-fill (`protocol::decode_canonical`): returns the encoded result,
/// whose length is written at `out_len`; free it with `water_dealloc`.
///
/// # Safety
/// `ptr..ptr+len` must be readable; `out_len` writable.
#[cfg_attr(feature = "exports", no_mangle)]
pub unsafe extern "C" fn water_canonical(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let bytes = core::slice::from_raw_parts(ptr, len);
    let out = protocol::canonical_job(bytes).into_boxed_slice();
    *out_len = out.len();
    Box::into_raw(out) as *mut u8
}

pub mod columns;
pub mod stack;
pub mod stack_prefill;
pub mod stack_engine;
pub mod stack_memory;
