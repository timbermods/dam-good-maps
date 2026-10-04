// The shared module remains owned by rust/portable; no private arithmetic copy.
use std::{env,fs,path::PathBuf};
fn main() {
    println!("cargo:rerun-if-env-changed=DGM_PORTABLE_MATH");
    let shared = env::var_os("DGM_PORTABLE_MATH").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../../rust/portable/src/lib.rs"));
    let shared = shared.canonicalize().expect("Set DGM_PORTABLE_MATH to the adopted rust/portable/src/lib.rs");
    println!("cargo:rerun-if-changed={}",shared.display());
    let path = shared.to_str().expect("UTF-8 portable source path").replace('\\',"/");
    fs::write(PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("portable-module.rs"),
        format!("#[path={:?}] pub mod portable_math;\n",path)).unwrap();
}
