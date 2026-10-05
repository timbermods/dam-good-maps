// The words a check's message is made of (validate/words.ts): an object named as the game shows it, what is
// wrong in a few words, then where it is, "X 105 · Y 7 · Z 11". One line per object.

use crate::js::num;
use crate::tables::game_name;

/// The game's name for a template (doc/describeTile.ts `describeObject`): "Geothermal field", "Water source",
/// "Ruin", "Pine" …; any other template split at its words ("NaturalOverhang2x1" → "Natural Overhang2x1").
pub fn name_of(template: &str) -> String {
    if let Some(rest) = template.strip_prefix("RuinColumnH") {
        if !rest.is_empty() && rest.bytes().all(|c| c.is_ascii_digit()) {
            return "Ruin".into();
        }
    }
    if matches!(template, "SmallRelic" | "MediumRelic" | "LargeRelic") {
        return "Relic".into();
    }
    if let Some(n) = game_name(template) {
        return n.into();
    }
    // template.replace(/([a-z])([A-Z])/g, "$1 $2")
    let c: Vec<char> = template.chars().collect();
    let mut out = String::with_capacity(template.len() + 4);
    let mut k = 0;
    while k < c.len() {
        out.push(c[k]);
        if c[k].is_ascii_lowercase() && k + 1 < c.len() && c[k + 1].is_ascii_uppercase() {
            out.push(' ');
            out.push(c[k + 1]);
            k += 1;
        }
        k += 1;
    }
    out
}

/// A place the way the game counts it: "X 105 · Y 7 · Z 11".
pub fn place_of(x: i64, y: i64, z: i64) -> String {
    format!("X {} · Y {} · Z {}", x, y, z)
}

/// "1 source", "3 sources".
pub fn counted(n: f64, one: &str) -> String {
    counted_as(n, one, &format!("{one}s"))
}

/// `counted` with a plural that is not just an s.
pub fn counted_as(n: f64, one: &str, many: &str) -> String {
    format!("{} {}", num(n), if n == 1.0 { one } else { many })
}

/// "1 source's", "3 sources'".
pub fn possessive(n: f64, one: &str) -> String {
    if n == 1.0 {
        format!("{} {}'s", num(n), one)
    } else {
        format!("{} {}s'", num(n), one)
    }
}

/// The first letter capital.
pub fn cap(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// One line for an object: its name, what is wrong, its place ("Geothermal field floating · X 105 · Y 7 · Z 11").
pub fn object_line(template: &str, wrong: &str, x: i64, y: i64, z: i64) -> String {
    format!("{} {} · {}", name_of(template), wrong, place_of(x, y, z))
}

/// Lines, one per object, at most six of them and then "and 3 more".
pub fn lines(all: &[String]) -> String {
    const MAX: usize = 6;
    if all.len() > MAX {
        let mut v: Vec<String> = all[..MAX].to_vec();
        v.push(format!("and {} more", all.len() - MAX));
        v.join("\n")
    } else {
        all.join("\n")
    }
}
