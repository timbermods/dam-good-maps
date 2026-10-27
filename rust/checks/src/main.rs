// checks-batch: the checks natively, for batch jobs and the identity check (tools/rust/check.ts).
//
//   checks-batch    jobs on stdin, each a u32 length (little-endian) and the eight input buffers as
//                   src/core/validate/rust.ts writes them ("DGMI", their count, then each one's u32 length and
//                   bytes); results on stdout, each a u32 length and the status and the eight output buffers
//                   ("DGMO", the status, their count, then each one's u32 length and bytes). One map at a time,
//                   in order.

use checks::{input::INPUTS, Arena, OUTPUTS};
use std::io::{Read, Write};

fn read_inputs(b: &[u8], arena: &mut Arena) -> Result<(), String> {
    if b.len() < 8 || &b[0..4] != b"DGMI" {
        return Err("not an input dump".into());
    }
    let mut at = 4;
    let count = u32::from_le_bytes(b[at..at + 4].try_into().unwrap()) as usize;
    at += 4;
    if count != INPUTS {
        return Err(format!("{count} buffers"));
    }
    for k in 0..INPUTS {
        let n = u32::from_le_bytes(b.get(at..at + 4).ok_or("short dump")?.try_into().unwrap()) as usize;
        at += 4;
        arena.inputs[k].set(b.get(at..at + n).ok_or("short dump")?);
        at += n;
    }
    Ok(())
}

fn main() {
    if std::env::args().len() != 1 {
        eprintln!("checks-batch  (no arguments: framed jobs on stdin, results on stdout)");
        std::process::exit(2);
    }
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut input = stdin.lock();
    let mut output = stdout.lock();
    let mut arena = Arena::default();
    loop {
        let mut header = [0u8; 4];
        match input.read_exact(&mut header) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => panic!("job header: {}", e),
        }
        let mut job = vec![0; u32::from_le_bytes(header) as usize];
        input.read_exact(&mut job).expect("job");
        if let Err(e) = read_inputs(&job, &mut arena) {
            eprintln!("checks-batch: {e}");
            std::process::exit(1);
        }
        let status = arena.run();
        let mut out = b"DGMO".to_vec();
        out.extend(status.to_le_bytes());
        out.extend((OUTPUTS as u32).to_le_bytes());
        for o in &arena.outputs {
            out.extend((o.bytes().len() as u32).to_le_bytes());
            out.extend(o.bytes());
        }
        output.write_all(&(out.len() as u32).to_le_bytes()).expect("result length");
        output.write_all(&out).expect("result");
    }
    output.flush().expect("flush");
}
