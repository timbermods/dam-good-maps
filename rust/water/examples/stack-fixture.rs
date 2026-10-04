//! Test-only disk fixture adapter. Production callers use Session or stack_memory directly.
use std::{
    fs,
    io::{self, Write},
};
use water::{
    stack_engine::{Flow, Settle},
    stack_memory::Session,
};
fn read_u32(b: &[u8], at: &mut usize) -> Result<u32, String> {
    let v = b.get(*at..*at + 4).ok_or("Fixture is truncated.")?;
    *at += 4;
    Ok(u32::from_le_bytes(v.try_into().unwrap()))
}
fn read_f64(b: &[u8], at: &mut usize) -> Result<f64, String> {
    let v = b.get(*at..*at + 8).ok_or("Fixture is truncated.")?;
    *at += 8;
    Ok(f64::from_le_bytes(v.try_into().unwrap()))
}
fn job() -> Result<(), String> {
    let p = std::env::args().nth(1).ok_or("Fixture path is missing.")?;
    let b = fs::read(p).map_err(|_| "Fixture cannot be read.")?;
    let mut at = 0;
    let w = read_u32(&b, &mut at)?;
    let h = read_u32(&b, &mut at)?;
    let objects = read_u32(&b, &mut at)?;
    let retained = read_u32(&b, &mut at)?;
    let ops = read_u32(&b, &mut at)?;
    let mut s = Session::new(w as usize, h as usize, objects as usize, retained as usize)?;
    for v in &mut s.masks {
        *v = read_u32(&b, &mut at)?;
    }
    for v in s.objects.iter_mut().chain(s.retained.iter_mut()) {
        *v = read_f64(&b, &mut at)?;
    }
    for _ in 0..ops {
        let op = read_f64(&b, &mut at)?;
        let a = read_f64(&b, &mut at)?;
        let b = read_f64(&b, &mut at)?;
        if !op.is_finite() || op.trunc() != op || !(0.0..=6.0).contains(&op) {
            return Err("Fixture operation is invalid.".into());
        }
        s.op(op as u32, a, b)?;
    }
    if at != b.len() {
        return Err("Fixture has trailing data.".into());
    }
    let e = s.engine.as_ref().ok_or("Fixture map was not built.")?;
    let info = [
        e.ticks() as f64,
        if matches!(e.flow, Flow::Flat(_)) { 0.0 } else { 1.0 },
        e.result.map_or(0.0, |r| if r.settled { 1.0 } else { 2.0 }),
        e.result.and_then(|r| r.steady_ticks).map_or(-1.0, |t| t as f64),
        match &e.settle {
            Some(Settle::Flat(r)) => r.max_ticks as f64,
            Some(Settle::Stacked(r)) => (r.every * r.checks) as f64,
            None => 0.0,
        },
    ];
    let mut out = Vec::new();
    for v in info {
        out.extend(v.to_le_bytes());
    }
    for field in 0..20 {
        let (ptr, len) = s.field(field).ok_or("Fixture field is missing.")?;
        let width = match field {
            0 | 11 | 12 | 14 => 4,
            4 | 5 | 18 | 19 => 2,
            1 | 2 | 6..=10 | 15 => 8,
            _ => 1,
        };
        out.extend((len as u32).to_le_bytes());
        // The owned field supplies this exact allocation, aligned and valid until the next mutation.
        let bytes = unsafe { std::slice::from_raw_parts(ptr, len * width) };
        out.extend(bytes);
    }
    io::stdout().write_all(&out).map_err(|_| "Fixture result cannot be written.")?;
    Ok(())
}
fn main() {
    if let Err(reason) = job() {
        eprintln!("{reason}");
        std::process::exit(1);
    }
}
