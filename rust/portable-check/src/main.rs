//! Native side of tools/rust/check.mjs: each stdin line is `op x y z` (the arguments as 16 hex digits of their
//! binary64 bits); each output line is the result's bits.

use std::io::{BufRead, BufWriter, Write};

fn main() {
    let stdin = std::io::stdin();
    let mut out = BufWriter::new(std::io::stdout());
    for line in stdin.lock().lines() {
        let line = line.expect("stdin");
        let parts: Vec<&str> = line.split(' ').collect();
        let arg = |i: usize| f64::from_bits(u64::from_str_radix(parts[i], 16).expect("hex"));
        let v = portable_check::portable_eval(parts[0].parse().expect("op"), arg(1), arg(2), arg(3));
        writeln!(out, "{:016x}", v.to_bits()).expect("stdout");
    }
}
