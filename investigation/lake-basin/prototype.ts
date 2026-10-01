// Investigation-only module hook. Product files remain byte-for-byte unchanged.
// Adoption belongs to M9b: call shapeLakeBasin after leanGenome and before makeField.
import type { Genome } from '../../src/core/land/genome';
import type { Settings } from '../../src/core/spec/mapspec';
import { stream } from '../../src/core/math/rng';

export function shapeLakeBasin(g: Genome, s: Settings, W: number, H: number, seed: number, attempt: number): void {
  if (g.theme !== 'lakeBasin' || s.water.lakes === 'none') return;
  const rng = stream(seed, 'lake-basin-catchment', attempt);
  const side = Math.min(W, H);
  const focus: [number, number] = [rng.range(0.44, 0.56), rng.range(0.44, 0.56)];
  // The existing valley-basin process supplies ragged bays, fingers and an irregular floor.
  // One basin grows with the map; scattered fixed-tile bowls no longer compete for its water.
  g.parts = g.parts.filter(p => p.kind !== 'basin' && p.kind !== 'caldera');
  g.parts.unshift({kind:'basin', at:focus, size:side*rng.range(0.25,0.29), height:-rng.range(5.5,7), turn:rng.float(), extra:rng.range(0.8,1.4), soft:0, shape:'valley'});
  g.focus = focus;
  g.tiltKind = 'radial';
  g.tilt = Math.max(g.tilt, rng.range(3.8,4.8));
  g.noise.amp = Math.min(g.noise.amp, 2.2);
  g.regional.amp = Math.min(g.regional.amp, 2.4);
  g.hyps.eq = Math.min(g.hyps.eq, 0.25);
  g.base = Math.max(g.base, 5);
  g.relief = g.top - g.base;
  // Existing drainage chooses all courses and the exit. No channel or outlet is stamped.
  if (!g.hydro.exactInflows) g.hydro.inflows = Math.max(2, g.hydro.inflows);
  g.hydro.springs = Math.min(4, Math.max(3, g.hydro.springs));
  g.hydro.split *= 0.25;
  g.hydro.delta = 0;
  g.hydro.incise = Math.min(g.hydro.incise, 0.7);
  g.hydro.lakeBudget = Math.max(0.24, Math.min(0.32,g.hydro.lakeBudget));
  g.troughs = Math.min(g.troughs,0.25);
  g.lakeSprings = Math.min(g.lakeSprings,0.25);
  g.lakeSpringMax = 1;
}
export function install(_mode: string): void {
  const genome = require('../../src/core/land/genome');
  const lean = genome.leanGenome;
  genome.leanGenome = (g:Genome,s:Settings,W:number,H:number,seed:number,attempt:number,designedFor:any) => {
    lean(g,s,W,H,seed,attempt,designedFor);
    shapeLakeBasin(g,s,W,H,seed,attempt);
  };
}
