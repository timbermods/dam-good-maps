// Maps whose water a steady state cannot show (analysis/mechanics.ts): their water and start checks are
// reported as approximate, with the reason.

use crate::geom::{start_middle_tile, Placement};
use crate::input::Entity;
use crate::js::{num, round};
use crate::json::{arr, b, n, obj, s, Json};

pub const CAVE_SHARE: f64 = 0.05;
pub const DELAYED_SHARE: f64 = 0.25;
pub const SEEP_SHARE: f64 = 0.5;
pub const DISAGREE_SHARE: f64 = 0.1;

pub struct Mechanics {
    pub clean_running: f64,
    pub clean_delayed: f64,
    pub aquifers: f64,
    pub seeps: f64,
    pub cave_share: f64,
    pub start_under_roof: bool,
    pub reasons: Vec<String>,
}

impl Mechanics {
    pub fn json(&self) -> Json {
        obj(vec![
            ("cleanRunning", n(self.clean_running)),
            ("cleanDelayed", n(self.clean_delayed)),
            ("aquifers", n(self.aquifers)),
            ("seeps", n(self.seeps)),
            ("caveShare", n(self.cave_share)),
            ("startUnderRoof", b(self.start_under_roof)),
            ("reasons", arr(self.reasons.iter().map(|r| s(r.clone())).collect())),
        ])
    }
}

fn pct(v: f64) -> String {
    format!("{}%", num(round(v * 100.0)))
}

/// `mechanicsOf`.
pub fn mechanics_of(objects: &[&Entity], floors: &[u8], surface: &[u8], w: usize, h: usize) -> Mechanics {
    let mut clean_running = 0.0;
    let mut clean_delayed = 0.0;
    let mut aquifers = 0.0;
    let mut seeps = 0.0;
    let mut starts: Vec<&Entity> = vec![];
    for o in objects {
        if o.template == "StartingLocation" {
            starts.push(o);
        }
        let sv = if matches!(o.template.as_str(), "WaterSource" | "WaterSeep" | "Aquifer") { o.strength } else { 0.0 };
        match o.template.as_str() {
            "WaterSource" => {
                if o.delayed {
                    clean_delayed += sv;
                } else {
                    clean_running += sv;
                }
            }
            "WaterSeep" => seeps += sv,
            "Aquifer" => aquifers += sv,
            _ => {}
        }
    }
    let caves = floors.iter().filter(|&&v| v > 1).count() as f64;
    let cave_share = if floors.is_empty() { 0.0 } else { caves / floors.len() as f64 };
    let mut start_under_roof = false;
    if starts.len() == 1 {
        let (x, y) = start_middle_tile(&Placement::of(starts[0]));
        if x >= 0 && y >= 0 && x < w as i64 && y < h as i64 && surface[y as usize * w + x as usize] as i64 != starts[0].z {
            start_under_roof = true;
        }
    }
    let clean = clean_running + clean_delayed + aquifers + seeps;
    let mut reasons = vec![];
    if cave_share >= CAVE_SHARE {
        reasons.push(format!("caves or overhangs cover {} of the map, and water under them is not simulated", pct(cave_share)));
    }
    if clean > 0.0 && clean_delayed >= DELAYED_SHARE * clean {
        reasons.push(format!("sources that turn on later carry {} of the clean water", pct(clean_delayed / clean)));
    }
    if clean > 0.0 && aquifers >= DELAYED_SHARE * clean {
        reasons.push(format!("aquifers, which need a powered drill, carry {} of the clean water", pct(aquifers / clean)));
    }
    if clean > 0.0 && seeps >= SEEP_SHARE * (clean_running + seeps) {
        reasons.push(format!("seeps, which stop at 0.8 deep, carry {} of the running water", pct(seeps / (clean_running + seeps))));
    }
    if start_under_roof {
        reasons.push("the start stands under a roof".into());
    }
    Mechanics { clean_running, clean_delayed, aquifers, seeps, cave_share, start_under_roof, reasons }
}

/// `approximateReason`.
pub fn approximate_reason(m: &Mechanics, settled: &[f64], stored: Option<&[u8]>, ring: Option<&[usize]>) -> Option<String> {
    if m.start_under_roof {
        return Some(m.reasons.join("; "));
    }
    let stored = stored?;
    if m.reasons.is_empty() {
        return None;
    }
    let mut differ = 0.0;
    for i in 0..stored.len() {
        if (settled[i] > 0.05) as u8 != stored[i] {
            differ += 1.0;
        }
    }
    let mut ring_settled = 0;
    let mut ring_stored = 0;
    for &i in ring.unwrap_or(&[]) {
        if settled[i] > 0.05 {
            ring_settled += 1;
        }
        if stored[i] != 0 {
            ring_stored += 1;
        }
    }
    let mut evidence: Vec<String> = vec![];
    if ring_settled > ring_stored {
        evidence.push("the settled water floods the start, which the map's own water keeps dry".into());
    }
    let len = stored.len() as f64;
    if differ >= DISAGREE_SHARE * len {
        evidence.push(format!("the settled water differs from the map's own water on {} of the map", pct(differ / len)));
    }
    if evidence.is_empty() {
        None
    } else {
        Some(m.reasons.iter().cloned().chain(evidence).collect::<Vec<_>>().join("; "))
    }
}

/// `startRing`: the start's tiles within Chebyshev 2 of the middle of its 3×3.
pub fn start_ring(objects: &[&Entity], w: usize, h: usize) -> Option<Vec<usize>> {
    let starts: Vec<&&Entity> = objects.iter().filter(|o| o.template == "StartingLocation").collect();
    if starts.len() != 1 {
        return None;
    }
    let (cx, cy) = start_middle_tile(&Placement::of(starts[0]));
    let mut out = vec![];
    for y in cy - 2..=cy + 2 {
        for x in cx - 2..=cx + 2 {
            if x >= 0 && y >= 0 && x < w as i64 && y < h as i64 {
                out.push(y as usize * w + x as usize);
            }
        }
    }
    Some(out)
}

/// `approximateId`.
pub fn approximate_id(id: &str) -> bool {
    id.starts_with("water.") || matches!(id, "start.dry" | "start.water" | "start.badwater" | "start.reach" | "start.food" | "start.wood" | "start.ruins_clear")
}
