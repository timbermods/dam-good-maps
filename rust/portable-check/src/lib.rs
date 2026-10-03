//! One entry point over every portable function, for tools/rust/check.mjs: `op` picks the function (the order
//! of `OPS` there), `x`, `y`, `z` are its arguments. Exported from the Wasm; the native binary reads stdin.

#[no_mangle]
pub extern "C" fn portable_eval(op: u32, x: f64, y: f64, z: f64) -> f64 {
    match op {
        0 => portable::sin(x),
        1 => portable::cos(x),
        2 => portable::tan(x),
        3 => portable::exp(x),
        4 => portable::log(x),
        5 => portable::log2(x),
        6 => portable::pow(x, y),
        7 => portable::hypot(&[x, y, z]),
        8 => portable::sqrt(x),
        9 => portable::atan(x),
        10 => portable::atan2(x, y),
        11 => portable::tanh(x),
        12 => portable::asinh(x),
        13 => portable::asin(x),
        14 => portable::acos(x),
        15 => portable::rem(x, y),
        _ => panic!("unknown op"),
    }
}
