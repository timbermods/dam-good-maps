// analysis-batch: the Rust analysis natively, for the identity check (tools/rust/check.ts).
//
//   analysis-batch    frames on stdin (u32 length in bytes, little-endian, then the frame's binary64 values,
//                     src/core/analysis/rust/bridge.ts `encode`), results framed the same way on stdout
use std::io::{Read, Write};
fn main() {
    if std::env::args().len() != 1 {
        eprintln!("analysis-batch  (no arguments: framed jobs on stdin, results on stdout)");
        std::process::exit(2);
    }
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut input = stdin.lock();
    let mut output = stdout.lock();
    loop {
        let mut header = [0u8; 4];
        match input.read_exact(&mut header) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => panic!("job header: {}", e),
        }
        let mut bytes = vec![0; u32::from_le_bytes(header) as usize];
        input.read_exact(&mut bytes).expect("job");
        let frame: Vec<f64> = bytes.chunks_exact(8).map(|b| f64::from_le_bytes(b.try_into().unwrap())).collect();
        let result = analysis::execute(&frame);
        output.write_all(&((result.len() * 8) as u32).to_le_bytes()).expect("result length");
        for v in result {
            output.write_all(&v.to_le_bytes()).expect("result");
        }
    }
    output.flush().expect("flush");
}
