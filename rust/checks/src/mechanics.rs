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
        reasons.push(format!("caves or overhangs cover {} of the map", pct(cave_share)));
    }
    if clean > 0.0 && clean_delayed >= DELAYED_SHARE * clean {
        reasons.push(format!("sources that turn on later carry {} of the clean water", pct(clean_delayed / clean)));
    }
    if clean > 0.0 && aquifers >= DELAYED_SHARE * clean {
        reasons.push(format!("aquifers carry {} of the clean water", pct(aquifers / clean)));
    }
    if clean > 0.0 && seeps >= SEEP_SHARE * (clean_running + seeps) {
        reasons.push(format!("seeps carry {} of the running water", pct(seeps / (clean_running + seeps))));
    }
    if start_under_roof {
        reasons.push("the start is under a roof".into());
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
        evidence.push("settled water floods the start, which the map's own water keeps dry".into());
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

/// `approximateId`: the checks a steady state's water cannot answer for, the water checks and the start's.
pub fn approximate_id(id: &str) -> bool {
    id.starts_with("water.") || matches!(id, "start.dry" | "start.water" | "start.badwater" | "start.reach" | "start.food" | "start.wood" | "start.ruins_clear")
}

#[cfg(test)]
mod tests {
    // The approximate-water rule (D98), as tests/contract/mechanics.test.ts had it for the TypeScript.
    use super::*;

    const W: usize = 20;
    const H: usize = 20;
    const N: usize = W * H;

    fn entity(template: &str, x: i64, y: i64, strength: f64, delayed: bool) -> Entity {
        Entity {
            id: String::new(),
            template: template.into(),
            placed: true,
            x,
            y,
            z: 3,
            orientation: 0,
            flipped: false,
            strength,
            delayed,
            dead: false,
            dead_truthy: false,
            cut_logs: None,
            growth: None,
            comps: 1,
        }
    }
    fn source(strength: f64, delayed: bool, template: &str) -> Entity {
        entity(template, 2, 2, strength, delayed)
    }
    fn start() -> Entity {
        entity("StartingLocation", 9, 9, 0.0, false)
    }
    fn reasons(objects: &[Entity], floors: &[u8], surface: &[u8]) -> String {
        let refs: Vec<&Entity> = objects.iter().collect();
        mechanics_of(&refs, floors, surface, W, H).reasons.join(" ")
    }
    fn ring() -> Vec<usize> {
        let mut out = vec![];
        for y in 8..=12 {
            for x in 8..=12 {
                out.push(y * W + x);
            }
        }
        out
    }

    #[test]
    fn names_each_cause_and_none_on_a_plain_map() {
        let floors = vec![1u8; N];
        let surface = vec![3u8; N];
        assert_eq!(reasons(&[source(2.0, false, "WaterSource"), start()], &floors, &surface), "");
        assert!(reasons(&[source(1.0, false, "WaterSource"), source(3.0, true, "WaterSource"), start()], &floors, &surface).contains("turn on later carry 75%"));
        assert!(reasons(&[source(1.0, false, "WaterSource"), source(1.0, false, "Aquifer"), start()], &floors, &surface).contains("aquifers carry 50%"));
        assert!(reasons(&[source(1.0, false, "WaterSource"), source(1.0, false, "WaterSeep"), start()], &floors, &surface).contains("seeps carry 50%"));
        let mut caves = floors.clone();
        for v in caves.iter_mut().take(N / 20) {
            *v = 2;
        }
        assert!(reasons(&[source(2.0, false, "WaterSource"), start()], &caves, &surface).contains("caves or overhangs cover 5%"));
        let mut roofed = surface.clone();
        roofed[10 * W + 10] = 7; // the start's middle is under a roof: its top surface is higher
        let objects = [source(2.0, false, "WaterSource"), start()];
        let refs: Vec<&Entity> = objects.iter().collect();
        assert!(mechanics_of(&refs, &floors, &roofed, W, H).start_under_roof);
    }

    #[test]
    fn a_cause_counts_only_with_evidence() {
        let floors = vec![1u8; N];
        let surface = vec![3u8; N];
        let objects = [source(1.0, false, "WaterSource"), source(3.0, true, "WaterSource"), start()];
        let refs: Vec<&Entity> = objects.iter().collect();
        let m = mechanics_of(&refs, &floors, &surface, W, H);
        let ring = ring();
        let dry = vec![0.0; N];
        let stored = vec![0u8; N];
        // the settle agrees with the map's own water: not approximate
        assert_eq!(approximate_reason(&m, &dry, Some(&stored), Some(&ring)), None);
        // the settle floods the start, which the map's water keeps dry
        let mut flooded = dry.clone();
        flooded[10 * W + 10] = 1.0;
        let why = approximate_reason(&m, &flooded, Some(&stored), Some(&ring)).unwrap();
        assert!(why.contains("turn on later") && why.contains("floods the start"), "{why}");
        // the settle is wet on 10% of the map where the map's water is dry
        let mut wide = dry.clone();
        for v in wide.iter_mut().take(N / 10) {
            *v = 1.0;
        }
        assert!(approximate_reason(&m, &wide, Some(&stored), Some(&ring)).unwrap().contains("differs from the map's own water on 10%"));
        let plain = Mechanics { reasons: vec![], ..mechanics_of(&refs, &floors, &surface, W, H) };
        assert_eq!(approximate_reason(&plain, &wide, Some(&stored), Some(&ring)), None);
        // a start under a roof is approximate on its own
        let roofed = Mechanics { start_under_roof: true, reasons: vec!["the start is under a roof".into()], ..mechanics_of(&refs, &floors, &surface, W, H) };
        assert_eq!(approximate_reason(&roofed, &dry, Some(&stored), Some(&ring)).as_deref(), Some("the start is under a roof"));
    }

    #[test]
    fn marks_only_the_water_checks_and_the_starts_playability_checks() {
        for id in ["water.settles", "water.storage_possible", "start.dry", "start.water", "start.wood", "start.food", "start.badwater", "start.reach", "start.ruins_clear"] {
            assert!(approximate_id(id), "{id}");
        }
        for id in ["start.flat", "start.entrance", "start.count", "start.clear", "plants.survive", "resources.trees", "entities.placement"] {
            assert!(!approximate_id(id), "{id}");
        }
    }
}
