// report.ts: every check yields {id, class, severity, ok, value, limit, message, where?, fix?}; a profile
// decides what a class does. A result keeps its keys in the order the TypeScript writes them.

use crate::json::{b, s, Json};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Profile {
    Generate,
    Export,
    Import,
}

impl Profile {
    pub fn name(self) -> &'static str {
        match self {
            Profile::Generate => "generate",
            Profile::Export => "export",
            Profile::Import => "import",
        }
    }
}

pub type Entries = Vec<(String, Json)>;

fn field<'a>(r: &'a Entries, key: &str) -> Option<&'a Json> {
    r.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}
fn truthy(v: Option<&Json>) -> bool {
    match v {
        None | Some(Json::Null) => false,
        Some(Json::Bool(x)) => *x,
        Some(Json::Num(x)) => *x != 0.0 && !x.is_nan(),
        Some(Json::Str(x)) => !x.is_empty(),
        Some(_) => true,
    }
}
pub fn id_of(r: &Entries) -> &str {
    match field(r, "id") {
        Some(Json::Str(v)) => v,
        _ => "",
    }
}
fn str_of<'a>(r: &'a Entries, key: &str) -> &'a str {
    match field(r, key) {
        Some(Json::Str(v)) => v,
        _ => "",
    }
}

/// `severityOf`.
pub fn severity_of(profile: Profile, cls: &str, ok: bool, advisory: bool) -> &'static str {
    if ok {
        return "info";
    }
    if advisory {
        return "warning";
    }
    if cls == "load" {
        return "error";
    }
    match profile {
        Profile::Generate => "error",
        Profile::Export => {
            if cls == "principle" {
                "error"
            } else {
                "warning"
            }
        }
        Profile::Import => {
            if cls == "design" || cls == "principle" {
                "info"
            } else {
                "warning"
            }
        }
    }
}

/// `blocks`.
pub fn blocks(profile: Profile, r: &Entries) -> bool {
    if truthy(field(r, "ok")) || truthy(field(r, "advisory")) || matches!(field(r, "applicable"), Some(Json::Bool(false))) || truthy(field(r, "approximate")) {
        return false;
    }
    match profile {
        Profile::Generate => true,
        Profile::Export => {
            let c = str_of(r, "class");
            c == "load" || c == "principle"
        }
        Profile::Import => false,
    }
}

/// The checks that need the map's water, which a map made with Sources: None has none of (playability.ts
/// `WATER_CHECKS`).
const WATER_CHECKS: [&str; 14] = [
    "water.settles", "water.clean_exists", "water.clean_reach", "water.outflow", "water.badwater_contained", "water.source_in_flow", "water.storage_possible",
    "resources.badwater_source", "start.water", "start.badwater", "start.food", "start.farmland", "plants.survive", "plants.drought",
];
pub const NO_WATER_SOURCE: &str = "No water source: this map was made without its sources (Sources: None), for you to place them";

pub struct Collector {
    pub profile: Profile,
    pub checks: Vec<Entries>,
    /// Sources: None without a running source (playability.ts): the water checks say "No water source".
    pub no_water: bool,
}

impl Collector {
    pub fn new(profile: Profile) -> Self {
        Collector { profile, checks: vec![], no_water: false }
    }

    pub fn add(&mut self, r: Vec<(&str, Json)>) {
        let mut r: Entries = r.into_iter().map(|(k, v)| (k.to_string(), v)).collect();
        if self.no_water && WATER_CHECKS.contains(&id_of(&r)) {
            let advisory = truthy(field(&r, "advisory"));
            let mut out: Entries = vec![
                ("id".into(), s(id_of(&r))),
                ("class".into(), s(str_of(&r, "class"))),
                ("ok".into(), b(true)),
                ("applicable".into(), b(false)),
                ("message".into(), s(NO_WATER_SOURCE)),
            ];
            if advisory {
                out.push(("advisory".into(), b(true)));
            }
            r = out;
        }
        let sev = severity_of(self.profile, str_of(&r, "class"), truthy(field(&r, "ok")), truthy(field(&r, "advisory")));
        r.push(("severity".into(), s(sev)));
        self.checks.push(r);
    }

    /// A check that does not apply to this map: reported as passing, with the reason.
    pub fn not_applicable(&mut self, id: &str, cls: &str, message: &str, advisory: bool) {
        let mut r = vec![("id", s(id)), ("class", s(cls)), ("ok", b(true)), ("applicable", b(false)), ("message", s(message))];
        if advisory {
            r.push(("advisory", b(true)));
        }
        self.add(r);
    }

    /// Mark the checks `which` picks as approximate: they pass, keep what they measured, and say why.
    pub fn approximate(&mut self, which: impl Fn(&str) -> bool, reason: &str) {
        for c in self.checks.iter_mut() {
            if !which(id_of(c)) || matches!(field(c, "applicable"), Some(Json::Bool(false))) {
                continue;
            }
            let message = format!("approximate ({}): {}", reason, str_of(c, "message"));
            for (k, v) in c.iter_mut() {
                match k.as_str() {
                    "ok" => *v = b(true),
                    "severity" => *v = s("info"),
                    "message" => *v = s(message.clone()),
                    _ => {}
                }
            }
            if let Some(slot) = c.iter_mut().find(|(k, _)| k == "approximate") {
                slot.1 = s(reason);
            } else {
                c.push(("approximate".into(), s(reason)));
            }
        }
    }
}

/// The report as `JSON.stringify` writes it: {profile, checks, passed}.
pub fn report_json(profile: Profile, checks: &[Entries]) -> String {
    let passed = !checks.iter().any(|r| blocks(profile, r));
    let list = Json::Arr(checks.iter().map(|r| Json::Obj(r.clone())).collect());
    Json::Obj(vec![("profile".into(), s(profile.name())), ("checks".into(), list), ("passed".into(), b(passed))]).text()
}
