// forces-batch: the Rust forces natively, for batch jobs and the identity check (tools/rust/check.ts).
//
//   forces-batch INPUT OUTPUT    one job (the fixture format, src/core/forces/rust/protocol.ts) to its packed result
//   forces-batch                 jobs framed on stdin (u32 length, little-endian, then the job), results framed on stdout
use std::{
    env, fs,
    io::{Read, Write},
};
fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() == 3 {
        let input = fs::read(&args[1]).expect("input");
        fs::write(&args[2], forces::execute(&input)).expect("output");
        return;
    }
    if args.len() != 1 {
        eprintln!("forces-batch [INPUT OUTPUT]  (no arguments: framed jobs on stdin, results on stdout)");
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
        let result = forces::execute(&bytes);
        output.write_all(&(result.len() as u32).to_le_bytes()).expect("result length");
        output.write_all(&result).expect("result");
    }
    output.flush().expect("flush");
}
