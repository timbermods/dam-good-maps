//! One water crate, two representations. Flat maps delegate to the unchanged Sim.
use crate::{
    columns::Refusal,
    settle::{self, SettleResult},
    sim::{Emitter as FlatEmitter, Model as FlatModel, Rules, Sim},
    stack::{Model, Stack, State},
    stack_prefill,
};
pub enum Flow {
    Flat(Sim),
    Stacked(Stack),
}
pub enum Settle {
    Flat(settle::CanonicalRun),
    Stacked(stack_prefill::SettleRun),
}
pub struct Engine {
    pub model: Model,
    pub flow: Flow,
    pub settle: Option<Settle>,
    pub result: Option<SettleResult>,
    pub overflow: Vec<f64>,
}
pub fn open_field(m: &Model) -> Option<FlatModel> {
    let wc = &m.cols;
    if !wc.is_open() || !wc.dir_limit.is_empty() {
        return None;
    }
    let mut dam = None;
    for (&key, &v) in &wc.height_limit {
        let i = key % wc.n;
        if key / wc.n != wc.floor[i] as usize {
            continue;
        }
        dam.get_or_insert_with(|| vec![-1.0; wc.n])[i] = v;
    }
    let mut emitters = Vec::new();
    for e in &m.emitters {
        if e.cols != e.tiles {
            return None;
        }
        emitters.push(FlatEmitter {
            cells: e.tiles.clone(),
            strength: e.strength,
            contamination: e.contamination,
            limit: e.limit,
        });
    }
    Some(FlatModel {
        w: wc.w,
        h: wc.h,
        floor: wc.floor.iter().map(|&f| f as f64).collect(),
        dam,
        emitters,
    })
}
impl Engine {
    pub fn new(m: Model, game: bool) -> Result<Self, Refusal> {
        m.validate()?;
        let size = m.cols.n * m.cols.levels;
        for r in &m.retained {
            if r.tile as usize >= m.cols.n
                || !r.floor.is_finite()
                || !r.depth.is_finite()
                || !r.contamination.is_finite()
                || r.floor < 0.0
                || r.depth < 0.0
                || r.floor + r.depth > 34.0
                || !(0.0..=1.0).contains(&r.contamination)
            {
                return Err("Retained water is malformed.");
            }
        }
        if !m.drained.is_empty() && open_field(&m).is_none() {
            return Err("Drained tiles need the flat water rules.");
        }
        let flow = if let Some(f) = open_field(&m) {
            Flow::Flat(Sim::new(f, None, None, Rules { game, edge_spill: game }))
        } else {
            Flow::Stacked(Stack::new(m.clone(), game))
        };
        Ok(Self {
            model: m,
            flow,
            settle: None,
            result: None,
            overflow: vec![0.0; size],
        })
    }
    pub fn ticks(&self) -> u64 {
        match &self.flow {
            Flow::Flat(s) => s.ticks,
            Flow::Stacked(s) => s.ticks,
        }
    }
    pub fn flat(&self) -> bool {
        matches!(self.flow, Flow::Flat(_))
    }
    pub fn prefill(&mut self) -> Result<(), Refusal> {
        let game = match &self.flow {
            Flow::Flat(s) => s.rules.game,
            Flow::Stacked(s) => s.game,
        };
        let mut temp = Stack::new(self.model.clone(), game);
        let state = stack_prefill::prefill(&temp, &self.model.retained);
        temp.set_state(&state)?;
        if let Some(f) = open_field(&self.model) {
            self.flow = Flow::Flat(Sim::new(
                f,
                Some(&state.depth),
                Some(&state.contamination),
                Rules { game, edge_spill: game },
            ));
        } else {
            self.flow = Flow::Stacked(temp);
        }
        self.result = None;
        self.settle = None;
        Ok(())
    }
    pub fn sync(&mut self) -> Result<(), Refusal> {
        self.validate()?;
        if self.settle.is_some() {
            return Err("Water state cannot change during a settle.");
        }
        self.params()?;
        match &mut self.flow {
            Flow::Flat(s) => {
                let mut next = Sim::new(open_field(&self.model).unwrap(), Some(&s.d), Some(&s.c), s.rules);
                next.out.copy_from_slice(&s.out);
                next.params.copy_from_slice(&s.params);
                next.ticks = s.ticks;
                next.read_params();
                *s = next;
            }
            Flow::Stacked(s) => s.sync_state()?,
        }
        Ok(())
    }
    pub fn validate(&self) -> Result<(), Refusal> {
        match &self.flow {
            Flow::Stacked(s) => s.validate_state(),
            Flow::Flat(s) => {
                if s.d.len() != s.n
                    || s.dold.len() != s.n
                    || s.c.len() != s.n
                    || s.out.len() != 4 * s.n
                    || self.overflow.len() != s.n
                    || s.params.len() != 4 * s.emitters.len()
                {
                    return Err("Water state arrays are malformed.");
                }
                if s.d
                    .iter()
                    .chain(&s.dold)
                    .chain(&s.out)
                    .any(|v| !v.is_finite() || *v < 0.0 || *v > 1_000_000.0)
                    || s.c.iter().any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
                    || self.overflow.iter().any(|&v| v != 0.0)
                {
                    return Err("Water state is malformed.");
                }
                crate::stack::validate_params(&s.params, s.emitters.len())
            }
        }
    }
    fn params(&mut self) -> Result<(), Refusal> {
        match &mut self.flow {
            Flow::Stacked(s) => s.read_params(),
            Flow::Flat(s) => {
                for p in s.params.chunks_exact(4) {
                    if p.iter().any(|v| !v.is_finite())
                        || !(0.0..=1_000_000.0).contains(&p[0])
                        || !(0.0..=1.0).contains(&p[1])
                        || p[3] < 0.0
                        || p[2] < p[3]
                    {
                        return Err("Water emitter parameters are malformed.");
                    }
                }
                s.read_params();
                Ok(())
            }
        }
    }
    pub fn run(&mut self, ticks: u64, scale: f64) -> Result<(), Refusal> {
        if self.settle.is_some() {
            return Err("Use advance while water is settling.");
        }
        if !scale.is_finite() || scale < 0.0 || scale > 1_000_000.0 || ticks > 10_000_000 {
            return Err("Water run arguments are invalid.");
        }
        self.validate()?;
        self.params()?;
        match &mut self.flow {
            Flow::Flat(s) => s.run(ticks, scale),
            Flow::Stacked(s) => s.run(ticks, scale),
        }
        Ok(())
    }
    pub fn start_settle(&mut self, max_days: f64) -> Result<(), Refusal> {
        if !max_days.is_finite() || !(0.0..=1000.0).contains(&max_days) {
            return Err("Water settle arguments are invalid.");
        }
        if self.flat() && max_days != 6.0 {
            return Err("Flat canonical water uses its existing six-day settle.");
        }
        self.prefill()?;
        self.settle = Some(match &self.flow {
            Flow::Flat(s) => {
                let stored = settle::Stored {
                    retained: self.model.retained.iter().map(|r| vec![r.tile]).collect(),
                    drained: self.model.drained.clone(),
                };
                Settle::Flat(settle::CanonicalRun::new(
                    open_field(&self.model).unwrap(),
                    stored,
                    s.d.clone(),
                    s.c.clone(),
                    s.rules,
                ))
            }
            Flow::Stacked(s) => Settle::Stacked(stack_prefill::SettleRun::new(
                s,
                max_days,
                stack_prefill::sealed_columns(s, &self.model.retained),
            )),
        });
        Ok(())
    }
    pub fn advance(&mut self, ticks: u64) -> Result<Option<SettleResult>, Refusal> {
        if ticks > 10_000_000 {
            return Err("Water run arguments are invalid.");
        }
        self.validate()?;
        match (&mut self.settle, &mut self.flow) {
            (Some(Settle::Flat(r)), Flow::Flat(s)) => {
                if r.advance(ticks) {
                    self.result = Some(r.done.as_ref().unwrap().result);
                } // expose current arrays; the existing canonical run remains authoritative
                let mut snapshot = Sim::new(open_field(&self.model).unwrap(), Some(&r.sim.d), Some(&r.sim.c), r.sim.rules);
                snapshot.dold.copy_from_slice(&r.sim.dold);
                snapshot.out.copy_from_slice(&r.sim.out);
                snapshot.params.copy_from_slice(&r.sim.params);
                snapshot.ticks = r.sim.ticks;
                *s = snapshot;
            }
            (Some(Settle::Stacked(r)), Flow::Stacked(s)) => {
                self.result = r.advance(s, ticks);
            }
            _ => return Err("Water settle has not started."),
        }
        Ok(self.result)
    }
    pub fn state(&self) -> State {
        match &self.flow {
            Flow::Flat(s) => State {
                depth: s.d.clone(),
                overflow: self.overflow.clone(),
                contamination: s.c.clone(),
            },
            Flow::Stacked(s) => State {
                depth: s.d.clone(),
                overflow: s.o.clone(),
                contamination: s.c.clone(),
            },
        }
    }
    pub fn saturation(&mut self) -> Vec<u8> {
        match &mut self.flow {
            Flow::Flat(s) => s.saturation(),
            Flow::Stacked(s) => s.saturation(),
        }
    }
    pub fn momentum(&self) -> &[f64] {
        match &self.flow {
            Flow::Flat(s) => &s.out,
            Flow::Stacked(s) => &s.out,
        }
    }
}
