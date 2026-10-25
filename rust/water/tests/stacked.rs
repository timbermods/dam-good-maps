use water::{
    columns::{self, Object},
    sim::{self, Rules},
    stack::Model,
    stack_engine::{Engine, Flow},
    stack_memory::{self, Session},
};
fn obj(kind: u8, x: i32, y: i32, z: i16, strength: f64) -> Object {
    Object {
        kind,
        x,
        y,
        z,
        rotation: 0,
        flipped: false,
        delayed: false,
        strength,
    }
}
fn sealed() -> Model {
    let mut mask = vec![(1 << 10) - 1; 144];
    for y in 4..=7 {
        for x in 4..=7 {
            mask[y * 12 + x] &= !(7 << 3);
        }
    }
    columns::model(12, 12, &mask, &[obj(7, 5, 5, 3, 4.0)]).unwrap()
}
fn bits(a: &[f64], b: &[f64]) {
    assert_eq!(
        a.iter().map(|v| v.to_bits()).collect::<Vec<_>>(),
        b.iter().map(|v| v.to_bits()).collect::<Vec<_>>()
    );
}
#[test]
fn pressure_is_capped_and_roofs_never_leak() {
    let mut e = Engine::new(sealed(), true).unwrap();
    e.run(2304, 1.0).unwrap();
    let s = e.state();
    for y in 4..=7 {
        for x in 4..=7 {
            let c = y * 12 + x;
            assert_eq!(s.depth[c], 3.0);
            assert!(s.overflow[c] > 0.0 && s.overflow[c] <= 3.5);
            assert_eq!(s.depth[144 + c], 0.0);
        }
    }
}
#[test]
fn sliced_settle_matches_one_go() {
    let m = sealed();
    let mut a = Engine::new(m.clone(), true).unwrap();
    let mut b = Engine::new(m, true).unwrap();
    a.start_settle(4.0).unwrap();
    b.start_settle(4.0).unwrap();
    a.advance(10_000_000).unwrap();
    while b.result.is_none() {
        b.advance(37).unwrap();
    }
    assert_eq!(a.result, b.result);
    let x = a.state();
    let y = b.state();
    bits(&x.depth, &y.depth);
    bits(&x.overflow, &y.overflow);
    bits(&x.contamination, &y.contamination);
    bits(a.momentum(), b.momentum());
    assert_eq!(a.saturation(), b.saturation());
}
#[test]
fn flat_delegates_to_today_sim_under_both_rules() {
    for game in [false, true] {
        let m = columns::model(9, 7, &vec![7; 63], &[obj(7, 4, 3, 3, 1.0), obj(2, 3, 3, 3, 0.0)]).unwrap();
        let mut e = Engine::new(m.clone(), game).unwrap();
        assert!(e.flat());
        let mut today = sim::Sim::new(
            water::stack_engine::open_field(&m).unwrap(),
            None,
            None,
            Rules { game, edge_spill: game },
        );
        for (ticks, scale) in [(73, 1.0), (19, 0.0), (128, 0.4)] {
            e.run(ticks, scale).unwrap();
            today.run(ticks, scale);
        }
        let Flow::Flat(s) = &e.flow else { panic!() };
        bits(&s.d, &today.d);
        bits(&s.c, &today.c);
        bits(&s.dold, &today.dold);
        bits(&s.out, &today.out);
        assert_eq!(s.saturation(), today.saturation());
    }
}
#[test]
fn duplicate_planes_and_empty_run_zero() {
    let o = obj(3, 1, 1, 2, 0.0);
    let c = columns::water_columns(5, 5, &[1 << 5; 25], &[o.clone(), o]).unwrap();
    let i = 11;
    assert_eq!(c.count[i], 3);
    assert_eq!((c.floor[i], c.ceil[i]), (0, 3));
    assert_eq!((c.floor[25 + i], c.ceil[25 + i]), (3, 5));
    let t = columns::terrain_columns(5, 5, &[1 << 5; 25]).unwrap();
    assert_eq!((t.floor[0], t.ceil[0]), (0, 0));
    assert_eq!((t.floor[25], t.ceil[25]), (5, 6));
}
#[test]
fn seeps_flip_before_rotation() {
    let mut o = obj(9, 0, 0, 0, 1.0);
    o.flipped = true;
    let m = columns::model(3, 3, &[0; 9], &[o]).unwrap();
    assert_eq!(m.emitters[0].tiles, vec![1, 4, 0, 3]);
    assert_eq!(m.emitters[0].limit, Some((1, 0.8, 0.72)));
}
#[test]
fn drain_notch_and_direction_survive_all_rotations() {
    for rot in 0..4 {
        let mut o = obj(6, 3, 3, 2, 0.0);
        o.rotation = rot;
        let m = columns::model(7, 7, &[0; 49], &[o]).unwrap();
        let e = &m.emitters[0];
        let id = e.cols[0] as usize;
        assert_eq!(e.strength, 0.0);
        assert_eq!((m.cols.floor[id], m.cols.ceil[id]), (2, 3));
        assert_eq!(
            *m.cols.dir_limit.get(&(98 + e.tiles[0] as usize)).unwrap(),
            [2, 3, 0, 1][rot as usize]
        );
    }
}
#[test]
fn malformed_unknown_and_stale_handles_refuse() {
    assert!(Session::new(0, 1, 0, 0).is_err());
    let mut s = Session::new(2, 2, 1, 0).unwrap();
    s.objects[0] = 100.0;
    assert!(s.op(0, 0.0, 0.0).is_err());
    s.objects[0] = 7.0;
    s.objects[7] = f64::NAN;
    assert!(s.op(0, 0.0, 0.0).is_err());
    s.objects[7] = 1.0;
    s.masks[0] = 1 << 31;
    assert!(s.op(0, 0.0, 0.0).is_err());
    s.masks[0] = 0;
    s.op(0, 0.0, 0.0).unwrap();
    assert!(s.op(100, 0.0, 0.0).is_err());
    assert!(s.op(1, -1.0, 1.0).is_err());
    assert!(s.op(1, 1.0, f64::NAN).is_err());
    let e = s.engine_mut().unwrap();
    let Flow::Flat(f) = &mut e.flow else { panic!() };
    f.d[0] = f64::NAN;
    assert!(s.op(1, 1.0, 1.0).is_err());
    // a run trusts the state it wrote, until a view of it is handed out
    let mut s = Session::new(2, 2, 0, 0).unwrap();
    s.op(0, 0.0, 0.0).unwrap();
    s.op(1, 1.0, 1.0).unwrap();
    let (p, _) = s.field(6).unwrap();
    unsafe { *(p as *mut f64) = f64::NAN };
    assert!(s.op(1, 1.0, 1.0).is_err());
    let id = stack_memory::stack_create(2, 2, 0, 0);
    assert_ne!(id, 0);
    assert_eq!(stack_memory::stack_free(id), 0);
    assert_ne!(stack_memory::stack_op(id, 1, 1.0, 1.0), 0);
    assert!(stack_memory::stack_ptr(id, 6).is_null());
    assert!(stack_memory::stack_error_len() > 0);
}
#[test]
fn malformed_native_geometry_refuses_before_indexing() {
    let mut m = sealed();
    m.cols.floor.clear();
    assert!(Engine::new(m, true).is_err());
    let mut m = sealed();
    m.emitters[0].cols[0] = u32::MAX;
    assert!(Engine::new(m, true).is_err());
}
#[test]
fn edited_state_clears_wet_lists_and_stale_flows() {
    let mut e = Engine::new(sealed(), true).unwrap();
    e.run(50, 1.0).unwrap();
    let Flow::Stacked(s) = &mut e.flow else { panic!() };
    s.d.fill(0.0);
    s.o.fill(0.0);
    s.c.fill(0.0);
    s.out.fill(0.0);
    e.sync().unwrap();
    e.run(1, 0.0).unwrap();
    assert!(e.state().depth.iter().all(|&v| v == 0.0));
}
#[test]
fn retained_water_uses_top_column_and_bad_overflow_refuses() {
    let mut m = sealed();
    m.retained.push(water::stack::Retained {
        tile: 65,
        floor: 10.0,
        depth: 1.0,
        contamination: 0.4,
    });
    let mut e = Engine::new(m, true).unwrap();
    e.prefill().unwrap();
    let s = e.state();
    assert_eq!(s.depth[209], 1.0);
    assert_eq!(s.contamination[209], 0.4);
    let Flow::Stacked(s) = &mut e.flow else { panic!() };
    s.o[65] = 10.0;
    assert!(e.run(1, 1.0).is_err());
}

#[test]
fn malformed_native_rows_and_state_lengths_refuse() {
    let mut session = Session::new(2, 2, 1, 0).unwrap();
    session.objects.truncate(1);
    assert!(session.op(0, 0.0, 0.0).is_err());
    let mut e = Engine::new(sealed(), true).unwrap();
    let Flow::Stacked(s) = &mut e.flow else { panic!() };
    s.o.clear();
    assert!(e.run(1, 1.0).is_err());
    let mut e = Engine::new(sealed(), true).unwrap();
    let Flow::Stacked(s) = &mut e.flow else { panic!() };
    s.params.clear();
    assert!(e.run(1, 1.0).is_err());
    assert!(e.sync().is_err());
    let mut e = Engine::new(sealed(), true).unwrap();
    e.start_settle(4.0).unwrap();
    let Flow::Stacked(s) = &mut e.flow else { panic!() };
    s.params[0] = f64::NAN;
    assert!(e.advance(37).is_err());
}

#[test]
fn clean_and_badwater_mix_inside_a_roofed_chamber() {
    let mut m = sealed();
    let mut bad = columns::model(12, 12, &vec![7; 144], &[obj(8, 4, 4, 3, 2.0)])
        .unwrap()
        .emitters
        .remove(0);
    // The same cells lie in slot zero of this chamber; the top slots remain dry.
    bad.cols = bad.tiles.clone();
    m.emitters.push(bad);
    let mut e = Engine::new(m, true).unwrap();
    e.run(200, 1.0).unwrap();
    let s = e.state();
    assert!(s.contamination.iter().any(|&c| c > 0.0 && c < 1.0));
    assert!(s.contamination.iter().all(|&c| (0.0..=1.0).contains(&c)));
    for i in 0..144 {
        assert_eq!(s.depth[144 + i], 0.0);
    }
}
// A sink (a negative strength, D337). In the open it is today's rule; under a roof it follows the game's
// one task for every column (`UpdateWaterSourcesTask`, `WaterDepthSetter.SetWaterDepth`): from the game's
// code, not yet played.
#[test]
fn a_sink_on_an_open_field_is_todays_rule() {
    for game in [false, true] {
        let m = columns::model(9, 7, &vec![7; 63], &[obj(7, 4, 3, 3, 2.0), obj(7, 6, 3, 3, -0.75), obj(8, 1, 1, 3, 1.0)]).unwrap();
        let mut e = Engine::new(m.clone(), game).unwrap();
        assert!(e.flat());
        let mut today = sim::Sim::new(water::stack_engine::open_field(&m).unwrap(), None, None, Rules { game, edge_spill: game });
        e.run(400, 1.0).unwrap();
        today.run(400, 1.0);
        let Flow::Flat(s) = &e.flow else { panic!() };
        bits(&s.d, &today.d);
        bits(&s.c, &today.c);
    }
}
#[test]
fn a_sink_under_a_roof_takes_pressure_first_and_never_goes_below_dry() {
    // the sealed chamber, full and under pressure from its source
    let mut full = Engine::new(sealed(), true).unwrap();
    full.run(2304, 1.0).unwrap();
    let before = full.state();
    let volume = |s: &water::stack::State| (0..144).map(|c| s.depth[c] + s.overflow[c]).sum::<f64>();
    assert!(before.overflow[5 * 12 + 5] > 0.0);
    // the same chamber with a sink beside the source, weaker than it: it still fills, with less pressure
    let mut mask = vec![(1 << 10) - 1; 144];
    for y in 4..=7 {
        for x in 4..=7 {
            mask[y * 12 + x] &= !(7 << 3);
        }
    }
    let m = columns::model(12, 12, &mask, &[obj(7, 5, 5, 3, 4.0), obj(7, 6, 6, 3, -1.0)]).unwrap();
    let mut e = Engine::new(m, true).unwrap();
    assert!(!e.flat());
    e.run(2304, 1.0).unwrap();
    let s = e.state();
    assert!(volume(&s) > 0.0 && volume(&s) <= volume(&before));
    assert!(s.depth.iter().chain(&s.overflow).chain(&s.contamination).all(|v| v.is_finite() && *v >= 0.0));
    // a sink stronger than the source keeps the chamber from filling, and its own cell at or near dry
    let m = columns::model(12, 12, &mask, &[obj(7, 5, 5, 3, 1.0), obj(7, 6, 6, 3, -8.0)]).unwrap();
    let mut e = Engine::new(m, true).unwrap();
    e.run(2304, 1.0).unwrap();
    let s = e.state();
    assert!(s.overflow.iter().all(|&o| o == 0.0));
    assert!(s.depth[6 * 12 + 6] < 0.5);
    assert!(s.depth.iter().chain(&s.contamination).all(|v| v.is_finite() && *v >= 0.0));
}
/// A 12 × 12 block of rock to 10 with a sealed cave (air at z 3–5) under x, y 4–7 and no objects.
fn dry_cave() -> Model {
    let mut mask = vec![(1 << 10) - 1; 144];
    for y in 4..=7 {
        for x in 4..=7 {
            mask[y * 12 + x] &= !(7 << 3);
        }
    }
    columns::model(12, 12, &mask, &[]).unwrap()
}
fn cave_lake(m: &mut Model, depth: f64) {
    for y in 4..=7 {
        for x in 4..=7 {
            m.retained.push(water::stack::Retained {
                tile: (y * 12 + x) as u32,
                floor: 3.0,
                depth,
                contamination: 0.0,
            });
        }
    }
}
#[test]
fn a_lake_in_a_cave_stands_in_the_cave_and_past_its_roof_under_pressure() {
    let mut m = dry_cave();
    cave_lake(&mut m, 4.0);
    let mut e = Engine::new(m, true).unwrap();
    e.prefill().unwrap();
    let s = e.state();
    let c = 5 * 12 + 5;
    // the cave column (slot 0), full; the pressure of the water a level over its roof; the top dry
    assert_eq!(s.depth[c], 3.0);
    assert_eq!(s.overflow[c], 1.0 / 8.0);
    assert_eq!(s.depth[144 + c], 0.0);
}
#[test]
fn a_sealed_lake_only_evaporating_is_stored_as_it_began() {
    let mut m = dry_cave();
    cave_lake(&mut m, 2.0);
    let mut e = Engine::new(m, true).unwrap();
    e.start_settle(4.0).unwrap();
    let r = e.advance(10_000_000).unwrap().unwrap();
    // it stopped at the first check where only the lake changed (it evaporates), and the lake is as it began
    assert!(r.steady_ticks.is_some() || r.settled);
    assert_eq!(r.ticks, 128);
    let s = e.state();
    for y in 4..=7 {
        for x in 4..=7 {
            assert_eq!(s.depth[y * 12 + x], 2.0);
        }
    }
}
#[test]
fn a_settle_goes_on_from_the_water_as_written() {
    let mut e = Engine::new(dry_cave(), true).unwrap();
    let Flow::Stacked(s) = &mut e.flow else { panic!() };
    s.d[5 * 12 + 5] = 1.5;
    e.settle_from_state(1.0).unwrap();
    e.advance(10_000_000).unwrap().unwrap();
    // not pre-filled (which would leave the cave dry): the water written spreads over the cave's floor
    let s = e.state();
    let total: f64 = (4..=7).flat_map(|y| (4..=7).map(move |x| y * 12 + x)).map(|c| s.depth[c]).sum();
    assert!(total > 0.0 && total <= 1.5);
    // an open field has no such settle
    let mut flat = Engine::new(columns::model(4, 4, &[7; 16], &[]).unwrap(), true).unwrap();
    assert!(flat.settle_from_state(1.0).is_err());
}
#[test]
fn a_big_sealed_lake_never_excuses_water_still_filling_beside_it() {
    // a full cave lake (48 of water) and, on the rock beside it, a pond a source still fills: ten columns rising
    // 0.0004 between two checks, each under the 0.005 that counts as moved, the pond's water 0.4% more
    let mut m = dry_cave();
    cave_lake(&mut m, 3.0);
    let retained = m.retained.clone();
    let mut e = Engine::new(m, true).unwrap();
    e.prefill().unwrap();
    let Flow::Stacked(s) = &mut e.flow else { panic!() };
    let sealed = water::stack_prefill::sealed_columns(s, &retained);
    let pond: Vec<usize> = (1..=5).flat_map(|y| [9, 10].map(|x| y * 12 + x)).collect();
    for &c in &pond {
        s.d[c] = 0.1;
    }
    let (prev_d, prev_o) = (s.d.clone(), s.o.clone());
    // nothing changed but the lake (here not even it): steady
    assert!(water::stack_prefill::steady_apart_from_sealed(s, &prev_d, &prev_o, &sealed, 0.005, 0.005));
    for &c in &pond {
        s.d[c] = 0.1004;
    }
    // the pond's change is weighed against the pond's water (0.4%), not the lake's and the pond's (0.008%): not steady
    assert!(!water::stack_prefill::steady_apart_from_sealed(s, &prev_d, &prev_o, &sealed, 0.005, 0.005));
}
/// A `w` × `h` block of rock to 10 with air carved at z `z0..=z1` under x `x0..=x1`, y `y0..=y1` for each cut.
fn carved_wh(w: usize, h: usize, cuts: &[(usize, usize, usize, usize, u32, u32)]) -> Model {
    let mut mask = vec![(1 << 10) - 1; w * h];
    for &(x0, x1, y0, y1, z0, z1) in cuts {
        for y in y0..=y1 {
            for x in x0..=x1 {
                for z in z0..=z1 {
                    mask[y * w + x] &= !(1 << z);
                }
            }
        }
    }
    columns::model(w, h, &mask, &[]).unwrap()
}
fn carved(cuts: &[(usize, usize, usize, usize, u32, u32)]) -> Model {
    carved_wh(12, 12, cuts)
}
/// A stored lake on the cave columns of x 4–7, y 4–7, on `floor`.
fn lake_on(m: &mut Model, floor: f64, depth: f64) {
    for y in 4..=7 {
        for x in 4..=7 {
            m.retained.push(water::stack::Retained {
                tile: (y * 12 + x) as u32,
                floor,
                depth,
                contamination: 0.0,
            });
        }
    }
}
/// The settle's stored water: each wet column's (tile, floor, depth, pressure), and the water in all.
fn settled(m: Model) -> (Vec<(usize, i16, f64, f64)>, f64) {
    let cols = m.cols.clone();
    let mut e = Engine::new(m, true).unwrap();
    e.start_settle(6.0).unwrap();
    e.advance(10_000_000).unwrap().unwrap();
    let s = e.state();
    let wet = (0..s.depth.len())
        .filter(|&c| s.depth[c] > 0.0)
        .map(|c| (c % 144, cols.floor[c], s.depth[c], s.overflow[c]))
        .collect();
    (wet, s.depth.iter().zip(&s.overflow).map(|(d, o)| d + o).sum())
}
fn tiles(x0: usize, x1: usize, y0: usize, y1: usize) -> Vec<usize> {
    (y0..=y1).flat_map(|y| (x0..=x1).map(move |x| y * 12 + x)).collect()
}
#[test]
fn a_dug_rim_drains_a_sealed_cave_lake_into_the_hollow_below_and_it_ends_level_with_its_water_kept() {
    // a cave lake (floor 2, roof 6) 3 deep, its rim at x 8 dug down to 3, a lower hollow (floor 1) beyond it:
    // the hollow fills past the cut, so the lake, the cut and the hollow stand as one level, 48 of water over
    // 16 columns on 2, 4 on 3 and 8 on 1: (48 + 32 + 12 + 8) / 28
    let mut m = carved(&[(4, 7, 4, 7, 2, 5), (8, 8, 4, 7, 3, 5), (9, 10, 4, 7, 1, 5)]);
    lake_on(&mut m, 2.0, 3.0);
    let (wet, total) = settled(m);
    let level = 100.0 / 28.0;
    let mut want: Vec<usize> = tiles(4, 10, 4, 7);
    want.sort_unstable();
    assert_eq!(wet.iter().map(|w| w.0).collect::<Vec<_>>(), want);
    for &(_, floor, d, o) in &wet {
        assert!((floor as f64 + d - level).abs() < 1e-12, "{floor} {d}");
        assert_eq!(o, 0.0);
    }
    // the water it began with, none evaporated by the settle's days and none lost
    assert!((total - 48.0).abs() < 1e-9, "{total}");
}
#[test]
fn a_dug_rim_into_a_hollow_too_big_to_fill_leaves_the_lake_at_its_cut_and_the_rest_below() {
    // the same lake and cut, the hollow beyond 20 columns: the lake runs out only down to the cut's floor (3), its
    // 32 above it filling the hollow to 1 + 32 / 20; water never runs back uphill to level the two
    let mut m = carved(&[(4, 7, 4, 7, 2, 5), (8, 8, 4, 7, 3, 5), (9, 10, 1, 10, 1, 5)]);
    lake_on(&mut m, 2.0, 3.0);
    let (wet, total) = settled(m);
    for &(tile, floor, d, o) in &wet {
        let (x, y) = (tile % 12, tile / 12);
        let level = if x <= 7 { 3.0 } else { 2.6 };
        assert!(x != 8 && (4..=7).contains(&y) || x >= 9, "{x} {y}");
        assert!((floor as f64 + d - level).abs() < 1e-12, "{x} {y} {floor} {d}");
        assert_eq!(o, 0.0);
    }
    assert_eq!(wet.len(), 16 + 20);
    assert!((total - 48.0).abs() < 1e-9, "{total}");
}
#[test]
fn a_roofed_lake_under_pressure_drains_into_a_low_roofed_tunnel_and_rests_under_pressure_there() {
    // a cave lake (floor 3, roof 6) standing to 7, a level over its roof (pressure 1/8): 50 of water. Its wall at
    // x 8–9 opens into a tunnel on 1 roofed at 4. At rest the tunnel is full, under the pressure of the head over
    // its roof, and the cave stands at the same head: 16 (L - 3) + 8 (3 + (L - 4) / 8) = 50
    let mut m = carved(&[(4, 7, 4, 7, 3, 5), (8, 9, 4, 7, 1, 3)]);
    lake_on(&mut m, 3.0, 4.0);
    let (wet, total) = settled(m);
    let level = 78.0 / 17.0;
    assert_eq!(wet.len(), 24);
    for &(tile, floor, d, o) in &wet {
        let x = tile % 12;
        if x <= 7 {
            assert_eq!(floor, 3);
            assert!((3.0 + d - level).abs() < 1e-12);
            assert_eq!(o, 0.0);
        } else {
            assert_eq!((floor, d), (1, 3.0));
            assert!((4.0 + o * 8.0 - level).abs() < 1e-12, "{o}");
        }
    }
    assert!((total - 50.0).abs() < 1e-9, "{total}");
}
/// A stored lake on the cave columns of x 1–4, y 4–7 of a 64-wide map, on floor 2.
fn west_lake(m: &mut Model, depth: f64) {
    for y in 4..=7 {
        for x in 1..=4 {
            m.retained.push(water::stack::Retained {
                tile: (y * 64 + x) as u32,
                floor: 2.0,
                depth,
                contamination: 0.0,
            });
        }
    }
}
#[test]
fn a_lake_whose_spilt_water_dried_before_the_stop_is_not_stored_back_above_its_cut() {
    // a cave lake (floor 2) standing to 5, its rim dug to 3, a wide shelf on 2 beyond: the water that runs over the
    // cut spreads thin over the shelf and dries before the settle stops, so no column gained, but the start would
    // not stand (head 5 over ground at 3), so it is not given back: it is stored at rest, the lake at the cut's
    // floor, its 32 above it over the shelf's 530 columns
    let mut m = carved_wh(64, 12, &[(1, 4, 4, 7, 2, 5), (5, 5, 4, 7, 3, 5), (6, 58, 1, 10, 2, 5)]);
    west_lake(&mut m, 3.0);
    let cols = m.cols.clone();
    let mut e = Engine::new(m, true).unwrap();
    e.start_settle(6.0).unwrap();
    e.advance(10_000_000).unwrap().unwrap();
    let s = e.state();
    let mut total = 0.0;
    for c in 0..s.depth.len() {
        total += s.depth[c] + s.overflow[c];
        if !(s.depth[c] > 0.0) {
            continue;
        }
        let x = (c % 768) % 64;
        let level = if x <= 4 { 3.0 } else { 2.0 + 32.0 / 530.0 };
        assert!(x != 5 && (cols.floor[c] as f64 + s.depth[c] - level).abs() < 1e-12, "{x} {}", s.depth[c]);
    }
    assert!((total - 48.0).abs() < 1e-9, "{total}");
}
#[test]
fn the_ground_a_levelled_lake_reaches_is_in_the_settles_reach() {
    // a lake (floor 2, to 5.5) behind a rim dug to 3, a pit on 0 and a shelf on 2 to x 58 beyond: the run wets only
    // the near end of the shelf, but the water stored at rest stands over all of it, and its level depends on all
    // of it, so the settle's reach takes the shelf in (an edit at x 55 then settles again in full, not at once)
    let mut m = carved_wh(64, 12, &[(1, 4, 4, 7, 2, 5), (5, 5, 4, 7, 3, 5), (6, 9, 4, 7, 0, 5), (10, 58, 1, 10, 2, 5)]);
    west_lake(&mut m, 3.5);
    let mut e = Engine::new(m, true).unwrap();
    e.start_settle(4.0).unwrap();
    e.advance(10_000_000).unwrap().unwrap();
    let Flow::Stacked(s) = &e.flow else { panic!() };
    let c = 5 * 64 + 55;
    assert!(s.d[c] > 0.0);
    assert_eq!(s.wet_ever[c], 1);
}
