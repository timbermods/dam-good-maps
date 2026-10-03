// The native checks for batch jobs: `rust-checks <manifest>` reads lines `input<TAB>output`; each input is the
// eight input buffers as the host wrote them (host/encode.ts `dumpInputs`), each output the status and the
// eight output buffers. One map at a time, in manifest order.

use rust_checks::{input::INPUTS, Arena, OUTPUTS};
use std::fs;

fn read_inputs(path: &str, arena: &mut Arena) -> Result<(), String> {
    let b = fs::read(path).map_err(|e| format!("{path}: {e}"))?;
    if b.len() < 8 || &b[0..4] != b"DGMI" {
        return Err(format!("{path}: not an input dump"));
    }
    let mut at = 4;
    let count = u32::from_le_bytes(b[at..at + 4].try_into().unwrap()) as usize;
    at += 4;
    if count != INPUTS {
        return Err(format!("{path}: {count} buffers"));
    }
    for k in 0..INPUTS {
        let n = u32::from_le_bytes(b[at..at + 4].try_into().unwrap()) as usize;
        at += 4;
        arena.inputs[k].set(&b[at..at + n]);
        at += n;
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 2 {
        eprintln!("usage: rust-checks <manifest>");
        std::process::exit(2);
    }
    let manifest = fs::read_to_string(&args[1]).expect("manifest");
    let mut arena = Arena::default();
    let mut failed = 0;
    for line in manifest.lines().filter(|l| !l.trim().is_empty()) {
        let (input, output) = line.split_once('\t').expect("input<TAB>output");
        if let Err(e) = read_inputs(input, &mut arena) {
            eprintln!("{e}");
            failed += 1;
            continue;
        }
        let status = arena.run();
        let mut out = b"DGMO".to_vec();
        out.extend(status.to_le_bytes());
        out.extend((OUTPUTS as u32).to_le_bytes());
        for o in &arena.outputs {
            out.extend((o.bytes().len() as u32).to_le_bytes());
            out.extend(o.bytes());
        }
        fs::write(output, out).expect("output");
    }
    if failed > 0 {
        std::process::exit(1);
    }
}
