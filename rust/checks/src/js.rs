// JavaScript's own text for numbers and strings, so the report is the TypeScript's byte for byte:
// `Number.prototype.toString` (template literals), `toFixed`, `toLocaleString("en-US")` on integers,
// `JSON.stringify`'s strings and numbers, and `String.prototype.trim`.

/// Shortest round-trip digits and the decimal point position: x = 0.d1d2… × 10^n (x finite, > 0).
fn shortest(x: f64) -> (Vec<u8>, i32) {
    // Rust's `{:e}` without a precision prints the shortest digits that round-trip, as ECMAScript asks.
    let s = format!("{:e}", x);
    let (mant, exp) = s.split_once('e').expect("exponent");
    let digits: Vec<u8> = mant.bytes().filter(|b| b.is_ascii_digit()).collect();
    let e: i32 = exp.parse().expect("exponent digits");
    (digits, e + 1)
}

/// `String(x)` / `${x}` (Number::toString, radix 10).
pub fn num(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x == 0.0 {
        return "0".into();
    }
    if x < 0.0 {
        return format!("-{}", num(-x));
    }
    if x.is_infinite() {
        return "Infinity".into();
    }
    let (d, n) = shortest(x);
    let k = d.len() as i32;
    let ds = |a: usize, b: usize| String::from_utf8(d[a..b].to_vec()).unwrap();
    if k <= n && n <= 21 {
        let mut s = ds(0, d.len());
        for _ in 0..(n - k) {
            s.push('0');
        }
        s
    } else if 0 < n && n <= 21 {
        format!("{}.{}", ds(0, n as usize), ds(n as usize, d.len()))
    } else if -6 < n && n <= 0 {
        let mut s = String::from("0.");
        for _ in 0..(-n) {
            s.push('0');
        }
        s.push_str(&ds(0, d.len()));
        s
    } else {
        let e = n - 1;
        let sign = if e < 0 { '-' } else { '+' };
        if k == 1 {
            format!("{}e{}{}", ds(0, 1), sign, e.abs())
        } else {
            format!("{}.{}e{}{}", ds(0, 1), ds(1, d.len()), sign, e.abs())
        }
    }
}

/// `JSON.stringify` of a number.
pub fn json_num(x: f64) -> String {
    if x.is_finite() {
        num(x)
    } else {
        "null".into()
    }
}

/// `x.toFixed(1)` (|x| < 1e21): the nearest tenth, ties up, from the exact binary value.
pub fn to_fixed1(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x.abs() >= 1e21 {
        return num(x);
    }
    if x < 0.0 {
        let s = to_fixed1(-x);
        // (-0.04).toFixed(1) is "-0.0": the sign stays whenever x < 0
        return format!("-{}", s);
    }
    // every binary64 has a finite decimal expansion; 1100 fraction digits hold all of it
    let exact = format!("{:.1100}", x);
    let (int, frac) = exact.split_once('.').unwrap();
    let f = frac.as_bytes();
    let mut digits: Vec<u8> = int.bytes().map(|b| b - b'0').collect();
    digits.push(f[0] - b'0');
    if f[1] >= b'5' {
        let mut k = digits.len();
        loop {
            if k == 0 {
                digits.insert(0, 1);
                break;
            }
            k -= 1;
            if digits[k] == 9 {
                digits[k] = 0;
            } else {
                digits[k] += 1;
                break;
            }
        }
    }
    let n = digits.len();
    let mut s: String = digits[..n - 1].iter().map(|d| (b'0' + d) as char).collect();
    s.push('.');
    s.push((b'0' + digits[n - 1]) as char);
    s
}

/// `x.toLocaleString("en-US")` for an integer (thousands separated by commas). None for a non-integer,
/// whose text this port does not produce.
pub fn locale_int(x: f64) -> Option<String> {
    if !x.is_finite() || x.floor() != x || x.abs() >= 1e21 {
        return None;
    }
    let neg = x < 0.0 || (x == 0.0 && x.is_sign_negative());
    let digits = num(x.abs());
    let b = digits.as_bytes();
    let mut s = String::new();
    if neg {
        s.push('-');
    }
    for (k, c) in b.iter().enumerate() {
        if k > 0 && (b.len() - k) % 3 == 0 {
            s.push(',');
        }
        s.push(*c as char);
    }
    Some(s)
}

/// `JSON.stringify` of a string (well-formed: the host passes none other).
pub fn json_str(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// JavaScript's WhiteSpace and LineTerminator, which `trim` removes.
fn js_space(c: char) -> bool {
    matches!(
        c,
        '\u{9}' | '\u{a}' | '\u{b}' | '\u{c}' | '\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

pub fn trim(s: &str) -> &str {
    s.trim_matches(js_space)
}

/// `Math.round`.
pub fn round(x: f64) -> f64 {
    portable::round(x)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn numbers() {
        assert_eq!(num(1e21), "1e+21");
        assert_eq!(num(1e-7), "1e-7");
        assert_eq!(num(0.000001), "0.000001");
        assert_eq!(num(123456789012345680000.0), "123456789012345680000");
        assert_eq!(num(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(num(-1.5), "-1.5");
        assert_eq!(num(1.2345e-7), "1.2345e-7");
        assert_eq!(to_fixed1(0.25), "0.3");
        assert_eq!(to_fixed1(0.05), "0.1");
        assert_eq!(to_fixed1(1.45), "1.4");
        assert_eq!(to_fixed1(9.96), "10.0");
        assert_eq!(locale_int(1234567.0).unwrap(), "1,234,567");
        assert_eq!(locale_int(999.0).unwrap(), "999");
    }
}
