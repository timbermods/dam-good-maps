export const DEFAULTS = Object.freeze({ enabled: true, volume: .72, ambience: false });
export const LADDER = Object.freeze([0, 2, 4, 7]);
export const SOUNDS = [
  ['raise', 'Raise', 'Brushes', 'Packed earth · weight with a clean edge'],
  ['lower', 'Lower', 'Brushes', 'Loose stone · a little falling grit'],
  ['flatten', 'Flatten', 'Brushes', 'Mineral scrape · smooth, firm contact'],
  ['smooth', 'Smooth', 'Brushes', 'Brushed leaves · a soft travelling sweep'],
  ['naturalize', 'Naturalize', 'Brushes', 'Dry leaves · irregular, delicate detail'],
  ['remove', 'Remove', 'Brushes', 'Earth puff · a short, dry release'],
  ['tree', 'Tree', 'Objects', 'Hollow wood · leaves · a tiny resonant reward'],
  ['berry', 'Berry bush', 'Objects', 'Lighter wood · a close leafy flick'],
  ['ruin', 'Ruin', 'Objects', 'Damped metal · stone beneath it'],
  ['mine', 'Mine site', 'Objects', 'Heavy timber · a solid foundation'],
  ['start', 'Start', 'Objects', 'Earth settles · a warm wooden finish'],
  ['water', 'Water source', 'Objects', 'A fresh splash · bright little bubbles'],
  ['badwater', 'Badwater source', 'Objects', 'Low, thick bubbles · a murky splash'],
  ['carve', 'Carve', 'Forces', 'A rushing torrent carrying broken earth'],
  ['craterize', 'Craterize', 'Forces', 'A sucked-in breath · crack · boom · falling stone'],
  ['quake', 'Quake · lift', 'Forces', 'A fault opens · heavy crack · grinding earth'],
  ['slide', 'Quake · slide', 'Forces', 'Splintering rock · a long, weighty grind'],
  ['erupt', 'Erupt', 'Forces', 'Pressure builds · roaring plume · cooling hiss'],
  ['undo', 'Undo', 'Utility', 'A short reversed wooden catch'],
  ['waterfall', 'Waterfall', 'Ambience', 'Recorded falling water · a broad, quiet bed'],
  ['stream', 'Stream', 'Ambience', 'A close trickle · a few gentle bubbles'],
].map(([id, label, group, detail]) => ({ id, label, group, detail }));
export const clamp = (n, min = 0, max = 1) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
export function parameters(p = {}) {
  return { size: clamp(p.size ?? .45), strength: clamp(p.strength ?? .55),
    distance: clamp(p.distance ?? 0, 0, 8), pan: clamp(p.pan ?? 0, -1, 1),
    activity: clamp(p.activity ?? 1) };
}
export function spatial(p, camera = 0) {
  const d = clamp(p.distance + camera, 0, 8);
  return { gain: (0.62 + .55 * p.size) * (.68 + .52 * p.strength) * p.activity / (1 + 2.8*d),
    cutoff: Math.max(850, 18000/(1+5*d)), pan: p.pan };
}
export class RewardRuns {
  constructor() { this.runs = new Map(); }
  next(name, seconds) {
    const old = this.runs.get(name);
    const index = old && seconds - old.at < .85 ? Math.min(old.index+1, LADDER.length-1) : 0;
    this.runs.set(name, { at: seconds, index });
    return LADDER[index];
  }
  clear() { this.runs.clear(); }
}

// All excitation comes from recorded material. No oscillators or generated noise.
// Relative layers are balanced here; calibration.js supplies measured recipe trim.
export function recipe(name, p = {}, { semitones = 0, random = Math.random, phase } = {}) {
  p = parameters(p);
  const pick = (a, b) => random() < .5 ? a : b;
  const r = 2 ** ((semitones + (random()-.5)*.22 - p.size*.6)/12);
  const a = [];
  const add = (sample, gain = 1, delay = 0, options = {}) => a.push({ sample, gain,
    delay: delay ? delay + random()*.013 : 0, rate: r*(.985 + random()*.03),
    attack: .001, release: .065, ...options });
  const earth = pick('earth-a', 'earth-b'), wood = pick('wood-a', 'wood-b');
  const leaf = pick('leaf-a', 'leaf-b'), crack = pick('crack-a', 'crack-b');
  const reward = (gain = .22, delay = .025) => add('resonance', gain, delay,
    { rate: r*.74, duration: .36, lowpass: 5200, release: .18 });
  const rubble = (count = 6, at = .3) => {
    for (let i = 0; i < count; i++) add(i%2 ? 'grit' : 'stone', .33*(1-i/(count+2)),
      at === 0 && i === 0 ? 0 : at+i*.13+random()*.09, { rate: r*(.85+random()*.7), duration: .32, pan: (random()-.5)*1.2 });
  };
  switch (name) {
    case 'raise': add(earth, 1.8); add('stone', .38, .018); break;
    case 'lower': add('grit', 1.0); add(earth, .65); rubble(3, .09); break;
    case 'flatten': add('scrape', 1.1, 0, { duration: .48 }); add(earth, .65); break;
    case 'smooth': add('leaf-bed', 1.35, 0, { offset: .5, duration: .48, attack: .035, release: .18 }); break;
    case 'naturalize': add(leaf, 1.3); add('leaf-bed', .8, .03, { offset: .4, duration: .48, attack: .03 }); break;
    case 'remove': add(earth, 1.1, 0, { rate: r*1.25, duration: .24 }); add(leaf, .45, .015, { duration: .22 }); break;
    case 'tree': add(wood, 1.55); add('wood-body', .5, .012); add(leaf, .42, .04); reward(); break;
    case 'berry': add(wood, 1.1, 0, { rate: r*1.23 }); add(leaf, .8, .024); reward(.15); break;
    case 'ruin': add('metal', 1, 0, { lowpass: 7000, duration: .5, release: .22 }); add('stone', .7, .012); add('tin', .3, .025, { duration: .26 }); break;
    case 'mine': add('wood-heavy', 1.3, 0, { rate: r*.83 }); add(earth, .8, .014); add('wood-body', .45, .05); break;
    case 'start': add(earth, 1.3, 0, { rate: r*.8 }); add('wood-body', .7, .035); reward(.3, .065); break;
    case 'water': add(pick('splash-a', 'splash-b'), 1.05); add('bubbles', .7, .02, { duration: .7, offset: random()*2, release: .2 }); reward(.12); break;
    case 'badwater': add('splash-b', .7, 0, { rate: r*.7, lowpass: 4500 }); add('bubbles', 1.4, .015, { duration: .9, offset: random()*2, rate: r*.6, lowpass: 3300, release: .3 }); break;
    case 'carve': add('waterfall', 1.35, 0, { offset: random()*2, duration: 2.4, attack: .035, release: .6 }); add('earth-bed', .75, .04, { duration: 2, rate: .7, attack: .06, release: .6 }); rubble(7, .08); break;
    case 'craterize': {
      if (!phase || phase === 'incoming') add(crack, .6, 0, { reverse: true, duration: .22, rate: 1.4, attack: .05, release: .006 });
      const t = phase ? 0 : .22;
      if (!phase || phase === 'impact') { add(crack, 1.2, t); add('boom', 1.65, t+.007, { rate: .75-.18*p.strength, duration: 3.2, release: 1.1 }); add(earth, 1.1, t+.018, { rate: .65 }); }
      if (!phase || phase === 'debris') rubble(10, phase ? 0 : .55);
      break;
    }
    case 'quake': add(crack, 1.35); add('boom', 1, .02, { offset: .28, rate: .5, duration: 2.5, lowpass: 480, attack: .01, release: .8 }); add('stone-bed', .9, .05, { duration: 2.2, rate: .65, release: .7 }); rubble(5, .18); break;
    case 'slide': add(crack, .95); add('stone-bed', 1.5, .04, { duration: 2.7, rate: .64, attack: .02, release: .75 }); add('boom', .9, .02, { offset: .4, duration: 2.3, rate: .6, lowpass: 550, attack: .07, release: .8 }); break;
    case 'erupt': {
      if (!phase || phase === 'rumble') add('boom', 1.1, 0, { offset: .18, duration: 2.1, rate: .52, lowpass: 520, attack: .1, release: .7 });
      if (!phase || phase === 'plume') { const t = phase ? 0 : .85; add('boom', .85, t, { rate: .85, duration: 2.6, attack: .045, release: .9 }); add('waterfall', 1.55, t, { offset: random()*2, duration: 3, attack: .08, release: .8, rate: .85 }); add('stone-bed', .75, t+.2, { duration: 2, rate: .8, attack: .1, release: .5 }); }
      if (!phase || phase === 'cool') { const t = phase ? 0 : 3.25; add('waterfall', .55, t, { offset: 3, duration: 2, highpass: 2100, attack: .15, release: 1.1 }); add('bubbles', .75, t+.13, { duration: 1.8, attack: .12, release: .8 }); }
      break;
    }
    case 'undo': add(wood, 1.2, 0, { reverse: true, duration: .22, rate: r*1.1, attack: .025, release: .025 }); break;
    case 'waterfall': add('waterfall', .48, 0, { duration: 3.5, offset: random(), attack: .3, release: .6 }); break;
    case 'stream': add('bubbles', .32, 0, { duration: 3.5, offset: random()*.4, attack: .3, release: .6, rate: 1.12 }); add('waterfall', .15, 0, { duration: 3.5, attack: .3, release: .6, highpass: 800 }); break;
  }
  return a;
}

export function texture(name) {
  const bed = (sample, gain, rate = 1, lowpass = 18000) => ({ sample, gain, rate, lowpass });
  switch (name) {
    case 'raise': return [bed('earth-bed', 1.4, .8), bed('stone-bed', .24, .65)];
    case 'lower': return [bed('stone-bed', 1.1, .85), bed('earth-bed', .55)];
    case 'flatten': return [bed('stone-bed', 1.2, 1.1)];
    case 'smooth': return [bed('leaf-bed', 1.15, .8)];
    case 'naturalize': return [bed('leaf-bed', 1.2, 1.15), bed('earth-bed', .2)];
    case 'remove': return [bed('leaf-bed', .65, .85), bed('earth-bed', .8, 1.2)];
    case 'carve': return [bed('waterfall', 1.2, .9), bed('earth-bed', .65, .75)];
    case 'quake': case 'slide': return [bed('stone-bed', 1.2, .65), bed('boom', .75, .5, 480)];
    case 'erupt': return [bed('waterfall', 1.3, .8), bed('boom', .85, .5, 650)];
    case 'waterfall': return [bed('waterfall', .48)];
    case 'stream': return [bed('bubbles', .35, 1.08), bed('waterfall', .16)];
    default: return [];
  }
}
