//! The native water for batch jobs (PLAN §20 D381): canonical settle jobs (`protocol`) on stdin, results on
//! stdout. Each job is `length u32` then its bytes; each result likewise. src/core/sim/native.ts drives it.

use std::io::{Read, Write};

fn main() {
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    loop {
        let mut len = [0u8; 4];
        if input.read_exact(&mut len).is_err() {
            break; // the caller closed the pipe
        }
        let mut job = vec![0u8; u32::from_le_bytes(len) as usize];
        input.read_exact(&mut job).expect("a whole job");
        let result = water::protocol::canonical_job(&job);
        output.write_all(&(result.len() as u32).to_le_bytes()).expect("stdout");
        output.write_all(&result).expect("stdout");
        output.flush().expect("stdout");
    }
}
