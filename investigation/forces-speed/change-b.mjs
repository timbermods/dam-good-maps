import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const tree=resolve(import.meta.dirname,'local/adopted');
function edit(path,changes){let s=readFileSync(join(tree,path),'utf8');for(const [a,b] of changes){if(!s.includes(a))throw Error(path+' missing '+a.slice(0,70));s=s.replace(a,b);}writeFileSync(join(tree,path),s);}
edit('src/core/forces/rust/bridge.ts',[
 ['/** Plans a force in Rust; throws its refusal (one plain reason). */',
  '/** Whether encode(..., false) would write the same value as its JSON-normalized copy. */\nfunction samePlain(a: unknown, b: unknown): boolean {\n  if (Object.is(a, b)) return true;\n  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;\n  if (ArrayBuffer.isView(a) || a instanceof Set) return false;\n  if (Array.isArray(a) !== Array.isArray(b)) return false;\n  const ak = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined);\n  const bk = Object.keys(b);\n  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && samePlain((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));\n}\n\n/** Plans a force in Rust; throws its refusal (one plain reason). */'],
 ['map: { ...m, _plainEntities: plain, _rockLength:',
  '// Rust defaults plain metadata to the original metadata when no second representation is supplied.\n      map: { ...m, ...(samePlain(m.entities, plain) ? {} : { _plainEntities: plain }), _rockLength:'],
 ['  const g = view(18, Float64Array).slice();','  // Geometry is decoded synchronously before forces_free: a second buffer copy is unnecessary.\n  const g = view(18, Float64Array);'],
 ['  const fallenRows = (a: ArrayLike<number>) => {','  const firstFallen = new Map<string, Fallen>();\n  for (const f of m.fallen) if (!firstFallen.has(f.id)) firstFallen.set(f.id, f);\n  const fallenRows = (a: ArrayLike<number>) => {'],
 ['      const original = m.fallen.find((f) => f.id === id);','      const original = firstFallen.get(id);']
]);
edit('src/core/forces/glaciate/run.ts',[
 ['    const m = p.map;\n    trimRock(m);','    const m = p.map;\n    // Rust already prefilled this exact raw model with the retained tarn.\n    const plannedModel = modelOf(m);\n    const plannedWater = { depth: m.water.depth.slice(), contamination: m.water.contamination.slice() };\n    trimRock(m);'],
 ['    m.water = prefill({ ...modelOf(m), ...(p.retained.tiles.length ? { retained: [p.retained] } : {}) });',
  '    const nextModel = modelOf(m);\n    const equal = (a: ArrayLike<number>, b: ArrayLike<number>) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false; return true; };\n    const same = p.retained === r && equal(plannedModel.floor, nextModel.floor) &&\n      (plannedModel.dam === null ? nextModel.dam === null : nextModel.dam !== null && equal(plannedModel.dam, nextModel.dam)) &&\n      JSON.stringify(plannedModel.emitters) === JSON.stringify(nextModel.emitters);\n    // Keep/build touches that alter the water model still take the original canonical prefill.\n    m.water = same ? plannedWater : prefill({ ...nextModel, ...(p.retained.tiles.length ? { retained: [p.retained] } : {}) });']
]);
const file=join(tree,'rust/forces/src/lib.rs');let s=readFileSync(file,'utf8'),end=s.indexOf('\nuse ',s.indexOf('mod water {')+12);
if(end<0)throw Error('water module end');
let w=s.slice(0,end),tail=s.slice(end);
function replace(a,b){if(!w.includes(a))throw Error('water missing '+a);w=w.replace(a,b);}
replace('        settle_closed: Option<Vec<bool>>,','        settle_closed: Option<Vec<bool>>,\n        // forces-speed: reused wet-transition scratch, never part of numeric state.\n        turned: Vec<usize>,');
replace('                settle_closed: None,','                settle_closed: None,\n                turned: Vec::new(),');
replace('        fn substep(&mut self, scale: f64) {','        fn substep<const GAME: bool, const DAM: bool>(&mut self, scale: f64) {');
replace('            frame.flow_phase(&self.wet);\n            frame.depth_phase(&self.active);','            frame.flow_phase::<GAME, DAM>(&self.wet);\n            frame.depth_phase::<GAME>(&self.active);');
replace('            let mut turned = vec![];','            self.turned.clear();');
replace('                    turned.push(i);','                    self.turned.push(i);');
replace('            for i in turned {\n                self.mark_active(i, if self.wet_mask[i] { 1 } else { -1 });\n            }','            for k in 0..self.turned.len() {\n                let i = self.turned[k];\n                self.mark_active(i, if self.wet_mask[i] { 1 } else { -1 });\n            }');
replace('        pub fn run(&mut self, ticks: u64, scale: f64) {\n            self.validate_shape();',
 '        pub fn run(&mut self, ticks: u64, scale: f64) {\n            self.validate_shape();\n            // Hoist invariant rule/obstacle branches out of the tile/direction kernels.\n            match (self.game, self.dam.is_some()) {\n                (true, true) => self.run_rules::<true, true>(ticks, scale),\n                (true, false) => self.run_rules::<true, false>(ticks, scale),\n                (false, true) => self.run_rules::<false, true>(ticks, scale),\n                (false, false) => self.run_rules::<false, false>(ticks, scale),\n            }\n        }\n        fn run_rules<const GAME: bool, const DAM: bool>(&mut self, ticks: u64, scale: f64) {');
replace('                self.substep(scale);\n                self.substep(scale);','                self.substep::<GAME, DAM>(scale);\n                self.substep::<GAME, DAM>(scale);');
replace('        fn flow_phase(&mut self, wet: &[usize]) {','        fn flow_phase<const GAME: bool, const DAM: bool>(&mut self, wet: &[usize]) {');
replace('                        let lim = if inside {\n                            self.dam.as_ref().map_or(-1.0, |d| d[j as usize])\n                        } else {\n                            -1.0\n                        };',
 '                        let lim = if DAM && inside {\n                            self.dam.as_ref().unwrap()[j as usize]\n                        } else {\n                            -1.0\n                        };');
replace('        fn depth_phase(&mut self, active: &[usize]) {','        fn depth_phase<const GAME: bool>(&mut self, active: &[usize]) {');
// Only the monomorphized substep and numeric kernels; all public rules and protocols remain as before.
const subStart=w.indexOf('        fn substep<'),subEnd=w.indexOf('        pub fn run',subStart);
w=w.slice(0,subStart)+w.slice(subStart,subEnd).replaceAll('self.game','GAME')+w.slice(subEnd);
const flowStart=w.indexOf('        fn flow_phase<'),flowEnd=w.indexOf('    // Little-endian',flowStart);
if(flowEnd>=0)throw Error('unexpected ordering');
const frameStart=w.indexOf('    struct NumericFrame {'),frameEnd=w.indexOf('    pub struct Reader',frameStart);
const kernelEnd=frameEnd<0?w.length:frameEnd;
const kernels=w.slice(frameStart,kernelEnd).replaceAll('self.game','GAME');
w=w.slice(0,frameStart)+kernels+w.slice(kernelEnd);
replace('        game: bool,\n        edge: bool,','        edge: bool,');
replace('                game: s.game,\n                edge: s.edge,','                edge: s.edge,');
writeFileSync(file,w+tail);
edit('src/worker/session.ts', [['    f.shown = map.heights.slice();', '    // forces-speed: this comparison buffer is private; reuse its allocation each frame.\n    f.shown.set(map.heights);']]);
console.log('B: boundary copies, exact Glaciate prefill reuse, forces-only specialized water kernels');