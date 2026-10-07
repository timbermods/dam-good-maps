//! D448 typed-memory ABI. Opaque integer handles, owned aligned arrays, one call per operation.
//! All caller-controlled lengths, values, handles and operation codes refuse before indexing.
//! Pointers are views into owned memory, not parameters to any operation. Views must be reacquired
//! after a call that may grow Wasm memory; callers must not write read-only geometry/graph fields.
use crate::{
    columns::{self, Object, Refusal},
    stack::Retained,
    stack_engine::{Engine, Flow},
};
use std::{cell::RefCell, collections::BTreeMap};
pub struct Session {
    pub w: usize,
    pub h: usize,
    pub masks: Vec<u32>,
    pub objects: Vec<f64>,
    pub retained: Vec<f64>,
    pub drained: Vec<u8>,
    pub engine: Option<Engine>,
    pub sat: Vec<u8>,
    // Geometry/graph snapshots are never read by a simulation. Writing one cannot corrupt indices.
    count: Vec<u8>,
    floor: Vec<i16>,
    ceil: Vec<i16>,
    start: Vec<u32>,
    target: Vec<i32>,
    dir: Vec<u8>,
    rev: Vec<i32>,
    terrain_count: Vec<u8>,
    terrain_floor: Vec<i16>,
    terrain_ceil: Vec<i16>,
}
fn integer(v: f64, lo: f64, hi: f64) -> bool {
    v.is_finite() && v >= lo && v <= hi && v.trunc() == v
}
impl Session {
    pub fn new(w: usize, h: usize, objects: usize, retained: usize) -> Result<Self, Refusal> {
        let n = w
            .checked_mul(h)
            .filter(|&n| w > 0 && h > 0 && n <= 1_048_576)
            .ok_or("Water map dimensions are invalid.")?;
        if objects > 131_072 || retained > n {
            return Err("Water input counts are invalid.");
        }
        Ok(Self {
            w,
            h,
            masks: vec![0; n],
            objects: vec![0.0; objects * 8],
            retained: vec![0.0; retained * 4],
            drained: vec![0; n],
            engine: None,
            sat: Vec::new(),
            count: Vec::new(),
            floor: Vec::new(),
            ceil: Vec::new(),
            start: Vec::new(),
            target: Vec::new(),
            dir: Vec::new(),
            rev: Vec::new(),
            terrain_count: Vec::new(),
            terrain_floor: Vec::new(),
            terrain_ceil: Vec::new(),
        })
    }
    pub fn build(&mut self, game: bool) -> Result<(), Refusal> {
        if self.objects.len() % 8 != 0 || self.retained.len() % 4 != 0 {
            return Err("Water input rows are malformed.");
        }
        let mut objects = Vec::new();
        for p in self.objects.chunks_exact(8) {
            if !integer(p[0], 0.0, 11.0)
                || !integer(p[1], -1_048_576.0, 1_048_576.0)
                || !integer(p[2], -1_048_576.0, 1_048_576.0)
                || !integer(p[3], 0.0, 33.0)
                || !integer(p[4], 0.0, 3.0)
                || !integer(p[5], 0.0, 1.0)
                || !integer(p[6], 0.0, 1.0)
                || !p[7].is_finite()
                || !(0.0..=1_000_000.0).contains(&p[7])
            {
                return Err("Water object is unknown or malformed.");
            }
            objects.push(Object {
                kind: p[0] as u8,
                x: p[1] as i32,
                y: p[2] as i32,
                z: p[3] as i16,
                rotation: p[4] as u8,
                flipped: p[5] != 0.0,
                delayed: p[6] != 0.0,
                strength: p[7],
            });
        }
        let mut m = columns::model(self.w, self.h, &self.masks, &objects)?;
        for p in self.retained.chunks_exact(4) {
            if !integer(p[0], 0.0, (self.masks.len() - 1) as f64) {
                return Err("Retained water is malformed.");
            }
            let tile = p[0] as u32;
            if m.cols.count[tile as usize] == 0 {
                return Err("Retained water has no open column.");
            }
            m.retained.push(Retained {
                tile,
                floor: p[1],
                depth: p[2],
                contamination: p[3],
            });
        }
        if self.drained.len() != self.masks.len() || self.drained.iter().any(|&v| v > 1) {
            return Err("Drained water tiles are malformed.");
        }
        m.drained = (0..self.drained.len())
            .filter(|&i| self.drained[i] != 0)
            .map(|i| i as u32)
            .collect();
        let engine = Engine::new(m, game)?;
        let wc = &engine.model.cols;
        let terrain = columns::terrain_columns(self.w, self.h, &self.masks)?;
        self.count = wc.count.clone();
        self.floor = wc.floor.clone();
        self.ceil = wc.ceil.clone();
        self.terrain_count = terrain.count;
        self.terrain_floor = terrain.floor;
        self.terrain_ceil = terrain.ceil;
        self.sat = vec![0; wc.n * wc.levels];
        if let Flow::Stacked(s) = &engine.flow {
            self.start = s.start.clone();
            self.target = s.target.clone();
            self.dir = s.dir.clone();
            self.rev = s.rev.clone();
        } else {
            self.start.clear();
            self.target.clear();
            self.dir.clear();
            self.rev.clear();
        }
        self.engine = Some(engine);
        Ok(())
    }
    /// 0 build (a 0 game, 1 port); 1 run (a ticks, b scale); 2 prefill;
    /// 3 canonical begin (a maxDays; flat must be 6); 4 advance (a tick budget);
    /// 5 accept edited state; 6 saturation. Unknown codes refuse with one line.
    pub fn op(&mut self, op: u32, a: f64, b: f64) -> Result<(), Refusal> {
        if op == 0 {
            if !integer(a, 0.0, 1.0) || b != 0.0 {
                return Err("Water build arguments are invalid.");
            }
            return self.build(a == 0.0);
        }
        if op > 6 {
            return Err("Water operation is unknown.");
        }
        let e = self.engine.as_mut().ok_or("Water map has not been built.")?;
        match op {
            1 => {
                if !integer(a, 0.0, 10_000_000.0) {
                    return Err("Water run arguments are invalid.");
                }
                e.run(a as u64, b)?;
            }
            2 => {
                if a != 0.0 || b != 0.0 {
                    return Err("Water prefill arguments are invalid.");
                }
                e.prefill()?;
            }
            3 => {
                if b != 0.0 {
                    return Err("Water settle arguments are invalid.");
                }
                e.start_settle(a)?;
            }
            4 => {
                if !integer(a, 0.0, 10_000_000.0) || b != 0.0 {
                    return Err("Water run arguments are invalid.");
                }
                e.advance(a as u64)?;
            }
            5 => {
                if a != 0.0 || b != 0.0 {
                    return Err("Water state arguments are invalid.");
                }
                e.sync()?;
            }
            6 => {
                if a != 0.0 || b != 0.0 {
                    return Err("Water saturation arguments are invalid.");
                }
                e.validate()?;
                self.sat = e.saturation();
            }
            _ => unreachable!(),
        }
        Ok(())
    }
    /// Fields 0 masks u32, 1 objects f64[8], 2 retained f64[4]; read-only geometry:
    /// 3 count u8, 4 floor i16, 5 ceiling i16; state (writable between runs, then op 5):
    /// 6 depth f64, 7 overflow f64, 8 contamination f64, 9 old depth f64, 10 momentum f64;
    /// graph read-only: 11 start u32, 12 target i32 (-1 padding), 13 direction u8, 14 reverse i32;
    /// 15 mutable emitter parameters f64[4], 16 saturation u8;
    /// 17 terrain count u8, 18 terrain floor i16, 19 terrain top i16 (read-only).
    /// 20 drained mask u8, writable before build (flat maps, D387).
    /// Lengths are element counts, never byte counts. Flat momentum remains four per tile.
    pub fn field(&mut self, which: u32) -> Option<(*mut u8, usize)> {
        macro_rules! view {
            ($v:expr) => {{
                let v = &mut $v;
                Some((v.as_mut_ptr() as *mut u8, v.len()))
            }};
        }
        match which {
            0 => view!(self.masks),
            20 => view!(self.drained),
            1 => view!(self.objects),
            2 => view!(self.retained),
            3 => view!(self.count),
            4 => view!(self.floor),
            5 => view!(self.ceil),
            11 => view!(self.start),
            12 => view!(self.target),
            13 => view!(self.dir),
            14 => view!(self.rev),
            16 => view!(self.sat),
            17 => view!(self.terrain_count),
            18 => view!(self.terrain_floor),
            19 => view!(self.terrain_ceil),
            6..=10 | 15 => {
                let e = self.engine.as_mut()?;
                match &mut e.flow {
                    Flow::Flat(s) => match which {
                        6 => view!(s.d),
                        7 => view!(e.overflow),
                        8 => view!(s.c),
                        9 => view!(s.dold),
                        10 => view!(s.out),
                        15 => view!(s.params),
                        _ => None,
                    },
                    Flow::Stacked(s) => match which {
                        6 => view!(s.d),
                        7 => view!(s.o),
                        8 => view!(s.c),
                        9 => view!(s.dold),
                        10 => view!(s.out),
                        15 => view!(s.params),
                        _ => None,
                    },
                }
            }
            _ => None,
        }
    }
}
struct Registry {
    next: u32,
    maps: BTreeMap<u32, Session>,
    error: Refusal,
}
thread_local! {static REGISTRY:RefCell<Registry>=RefCell::new(Registry{next:1,maps:BTreeMap::new(),error:""});}
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_create(w: u32, h: u32, objects: u32, retained: u32) -> u32 {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        if r.maps.len() >= 64 || r.next == u32::MAX {
            r.error = "Too many water maps are open.";
            return 0;
        }
        match Session::new(w as usize, h as usize, objects as usize, retained as usize) {
            Ok(s) => {
                let id = r.next;
                r.next += 1;
                r.maps.insert(id, s);
                r.error = "";
                id
            }
            Err(e) => {
                r.error = e;
                0
            }
        }
    })
}
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_free(handle: u32) -> u32 {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        if r.maps.remove(&handle).is_some() {
            r.error = "";
            0
        } else {
            r.error = "Water map handle is invalid.";
            1
        }
    })
}
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_ptr(handle: u32, which: u32) -> *mut u8 {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        if let Some((p, _)) = r.maps.get_mut(&handle).and_then(|s| s.field(which)) {
            r.error = "";
            p
        } else {
            r.error = "Water map handle or field is invalid.";
            core::ptr::null_mut()
        }
    })
}
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_len(handle: u32, which: u32) -> usize {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        if let Some((_, n)) = r.maps.get_mut(&handle).and_then(|s| s.field(which)) {
            r.error = "";
            n
        } else {
            r.error = "Water map handle or field is invalid.";
            0
        }
    })
}
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_op(handle: u32, op: u32, a: f64, b: f64) -> u32 {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        let result = r
            .maps
            .get_mut(&handle)
            .ok_or("Water map handle is invalid.")
            .and_then(|s| s.op(op, a, b));
        match result {
            Ok(()) => {
                r.error = "";
                0
            }
            Err(e) => {
                r.error = e;
                1
            }
        }
    })
}
/// UTF-8 one-line refusal from the last ABI call on this thread, or empty after success.
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_error_ptr() -> *const u8 {
    REGISTRY.with(|r| r.borrow().error.as_ptr())
}
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_error_len() -> usize {
    REGISTRY.with(|r| r.borrow().error.len())
}
/// Query 0 ticks, 1 representation (0 flat, 1 stacked), 2 settle status (0 running,
/// 1 settled, 2 exhausted), 3 steady ticks (negative when absent), 4 max ticks.
#[cfg_attr(feature = "exports", no_mangle)]
pub extern "C" fn stack_info(handle: u32, which: u32) -> f64 {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        let value = r.maps.get(&handle).and_then(|s| s.engine.as_ref()).and_then(|e| match which {
            0 => Some(e.ticks() as f64),
            1 => Some(if e.flat() { 0.0 } else { 1.0 }),
            2 => Some(e.result.map_or(0.0, |r| if r.settled { 1.0 } else { 2.0 })),
            3 => Some(e.result.and_then(|r| r.steady_ticks).map_or(-1.0, |t| t as f64)),
            4 => Some(match &e.settle {
                Some(crate::stack_engine::Settle::Flat(r)) => r.max_ticks as f64,
                Some(crate::stack_engine::Settle::Stacked(r)) => (r.every * r.checks) as f64,
                None => 0.0,
            }),
            _ => None,
        });
        if let Some(v) = value {
            r.error = "";
            v
        } else {
            r.error = "Water map handle or query is invalid.";
            -1.0
        }
    })
}
