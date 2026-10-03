// Builds on the analysis port (investigation/rust-analysis, #157) rather than porting its kernels again: its one
// source, analysis.rs, is included unchanged as a module (only its `//!` crate docs dropped, which a module
// cannot carry), with thin wrappers that call the kernels the checks use. When the analysis is adopted, the
// wrappers call its adopted crate instead.

use std::{env, fs, path::Path};

const WRAPPERS: &str = r#"
// ---- the checks' entry points into the analysis kernels (rust-checks/build.rs)
pub(crate) fn k_distance(mask: &[f64], w: usize, h: usize) -> Vec<f64> { distance(mask, w, h) }
pub(crate) fn k_walk(ht: &[f64], blocked: &[f64], links: &[f64], sx: f64, sy: f64, limit: f64, w: usize, h: usize) -> Vec<f64> { walk(&[ht, blocked, links], &[sx, sy, limit], w, h) }
pub(crate) fn k_walk_regions(ht: &[f64], blocked: &[f64], links: &[f64], w: usize, h: usize) -> Vec<f64> { regions(3, &[ht, blocked, links], &[], w, h) }
pub(crate) fn k_land_regions(ht: &[f64], wet: &[f64], w: usize, h: usize) -> Vec<f64> { regions(4, &[ht, wet], &[], w, h) }
pub(crate) fn k_components(mask: &[f64], eight: bool, w: usize, h: usize) -> Vec<f64> { regions(5, &[mask], &[if eight { 1.0 } else { 0.0 }], w, h) }
pub(crate) fn k_spill(floor: &[f64], dam: &[f64], emitting: &[f64], w: usize, h: usize) -> Vec<f64> { spill(&[floor, dam, emitting], w, h) }
pub(crate) fn k_dams(ht: &[f64], channel: &[f64], surface: &[f64], sd: &[f64], heights: &[f64], p: [f64; 4], w: usize, h: usize) -> Vec<f64> { dams(&[ht, channel, surface, sd, heights], &p, w, h) }
"#;

fn main() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../rust-analysis/analysis.rs");
    println!("cargo:rerun-if-changed={}", src.display());
    let text = fs::read_to_string(&src).expect("investigation/rust-analysis/analysis.rs");
    let body: String = text.lines().filter(|l| !l.trim_start().starts_with("//!")).map(|l| format!("{l}\n")).collect();
    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("analysis.rs");
    fs::write(out, format!("{body}{WRAPPERS}")).unwrap();
    println!("cargo:rustc-check-cfg=cfg(addon)");
    println!("cargo:rustc-check-cfg=cfg(checked_grid)");
}
