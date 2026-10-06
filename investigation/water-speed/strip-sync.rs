//! Regression for the occupancy-only sync shortcut, including signed zero and later substeps.
use water::sim::{Emitter, Model, Rules, Sim};

fn bits(a: &[f64]) -> Vec<u64> { a.iter().map(|v| v.to_bits()).collect() }

#[test]
fn synchronized_rows_match_bookkeeping_rebuilt_from_the_same_water() {
    let (w, h) = (9, 11);
    let n = w * h;
    let model = Model {
        w, h, floor: (0..n).map(|i| (i % 4) as f64).collect(),
        dam: Some((0..n).map(|i| if i % 13 == 0 { 0.65 } else { -1.0 }).collect()),
        emitters: vec![Emitter { cells: vec![0, (4 * w + 3) as u32], strength: 1.5, contamination: 0.3, limit: None }],
    };
    for rules in [Rules { game: true, edge_spill: true }, Rules { game: false, edge_spill: false }] {
        let d: Vec<f64> = (0..n).map(|i| if i % 3 == 0 { -0.0 } else { 0.1 + (i % 7) as f64 }).collect();
        let c: Vec<f64> = (0..n).map(|i| (i % 5) as f64 / 5.0).collect();
        let mut sim = Sim::new(model.clone(), Some(&d), Some(&c), rules);
        sim.run(5, 1.0);
        for change_occupancy in [false, true] {
            for i in 2 * w..6 * w {
                sim.d[i] = if change_occupancy && i % 2 == 0 { -0.0 }
                    else if change_occupancy { 0.75 }
                    else if sim.d[i] > 0.0 { sim.d[i] * 0.75 } else { sim.d[i] };
                sim.c[i] = 0.625;
                sim.dold[i] = sim.d[i] + 0.25;
                sim.out[4 * i..4 * i + 4].copy_from_slice(&[0.125, 0.25, 0.375, 0.5]);
            }
            sim.sync_rows(2, 6);
            assert_eq!(sim.books_check(), 0);
            let mut rebuilt = Sim::new(model.clone(), Some(&sim.d), Some(&sim.c), rules);
            rebuilt.out.copy_from_slice(&sim.out);
            rebuilt.dold.copy_from_slice(&sim.dold);
            rebuilt.ticks = sim.ticks;
            for _ in 0..8 {
                sim.run(1, 0.35); rebuilt.run(1, 0.35);
                assert_eq!(bits(&sim.d), bits(&rebuilt.d));
                assert_eq!(bits(&sim.c), bits(&rebuilt.c));
                assert_eq!(bits(&sim.out), bits(&rebuilt.out));
                assert_eq!(bits(&sim.dold), bits(&rebuilt.dold));
                assert_eq!(sim.saturation(), rebuilt.saturation());
                assert_eq!(sim.books_check(), 0);
            }
        }
    }
}
