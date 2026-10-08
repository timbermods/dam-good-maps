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
    let e = s.engine.as_mut().unwrap();
    let Flow::Flat(f) = &mut e.flow else { panic!() };
    f.d[0] = f64::NAN;
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
