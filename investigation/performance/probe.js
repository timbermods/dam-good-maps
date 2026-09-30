// Loaded only by the investigation build. No product/test-hook changes.
const state = { active: false, capture: false, frames: [], calls: [], tasks: [], rendered: [], images: [], errors: [], findings: [], audio: [], pcm: [], discontinuities: [], pauses: [], pauseHistory: [], previous: null, frameId: 0 };
let measurementPause = null;
function instrumentation(from, to) {
  return [...state.pauseHistory, ...(measurementPause ? [{ ...measurementPause, end: Infinity }] : [])]
    .find(p => p.start <= to && p.end >= from)?.label;
}
const audioContexts = [], audioOutputs = [], audioTaps = new Map();
if (window.AudioContext && window.AudioNode) {
  const OriginalContext = window.AudioContext, connect = AudioNode.prototype.connect;
  window.AudioContext = class extends OriginalContext {
    constructor(...args) {
      super(...args); audioContexts.push(this);
      this.addEventListener('statechange', () => { if (state.active) state.audio.push({ kind: 'context-state', at: performance.now(), audioTime: this.currentTime, state: this.state }); });
      const create = this.createBufferSource.bind(this);
      this.createBufferSource = () => {
        const source = create();
        for (const action of ['start', 'stop']) {
          const original = source[action].bind(source);
          source[action] = (...args) => {
            if (state.active) state.audio.push({ kind: action, at: performance.now(), audioTime: this.currentTime, scheduledTime: args[0] ?? 0, loop: source.loop });
            return original(...args);
          };
        }
        return source;
      };
    }
  };
  AudioNode.prototype.connect = function(destination, ...args) {
    if (destination === this.context.destination && !audioOutputs.includes(this)) audioOutputs.push(this);
    return connect.call(this, destination, ...args);
  };
  async function audioCapture() {
    for (const context of audioContexts) {
      try {
        if (!audioTaps.has(context)) {
          await context.audioWorklet.addModule('/investigation/performance/audio-worklet.js');
          const tap = new AudioWorkletNode(context, 'performance-capture'), mute = context.createGain(); mute.gain.value = 0;
          connect.call(tap, mute); connect.call(mute, context.destination);
          for (const output of audioOutputs.filter(o => o.context === context)) connect.call(output, tap);
          tap.port.onmessage = e => state.pcm.push({ contextId: `context-${audioContexts.indexOf(context)}`, frame: e.data.frame, rate: e.data.rate, pcm: Array.from(e.data.pcm) });
          audioTaps.set(context, tap);
        }
        audioTaps.get(context).port.postMessage({ record: true });
      } catch (error) { state.errors.push({ kind: 'audio-capture-unavailable', message: String(error) }); }
    }
  }
  window.startPerformanceAudioCapture = audioCapture;
}
const observers = [];
try {
  const o = new PerformanceObserver(list => { if (state.active) state.tasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration, name: e.name,
    instrumentation: instrumentation(e.startTime, e.startTime + e.duration) }))); });
  o.observe({ type: 'longtask', buffered: false }); observers.push(o);
} catch { state.longTasksSupported = false; }
window.addEventListener('error', e => { if (state.active) state.errors.push({ at: performance.now(), message: e.message }); });
window.addEventListener('unhandledrejection', e => { if (state.active) state.errors.push({ at: performance.now(), message: String(e.reason) }); });
let last = null;
function frame(t) {
  if (state.active) {
    if (last !== null) state.frames.push({ at: t, dt: t - last, visibility: document.visibilityState, focused: document.hasFocus(), instrumentation: instrumentation(last, t) });
    last = t;
  } else last = null;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
let renderer;
const hooked = new WeakSet();
function hook() {
  const r = window.dgm3d?.renderer;
  if (!r || hooked.has(r)) return;
  renderer = r; hooked.add(r);
  for (const name of ['updateTerrainRect', 'updateTerrain', 'updateWater', 'updateWaterSoon', 'updateEntities', 'meshTerrain', 'meshWater', 'meshFalls', 'bakeTiles', 'bakeShadows', 'setHeat', 'followGround', 'renderNow', 'setForceMoment', 'forceDone', 'clearForce']) {
    const original = r[name];
    if (typeof original !== 'function') continue;
    r[name] = function(...args) {
      const start = performance.now();
      let result;
      try { result = original.apply(this, args); }
      finally {
        if (state.active) {
          state.calls.push({ name, start, end: performance.now(), args: name.startsWith('mesh') ? args.slice(0, 2) : undefined });
          if (name === 'renderNow') sample(this);
        }
      }
      return result;
    };
  }
}
setInterval(hook, 100);
function sample(r) {
  const at = performance.now();
  const m = r.mapState();
  if (!m) return;
  const stat = r.gl?.info;
  state.rendered.push({ id: state.frameId++, at, force: window.dgmEditor?.force(), timing: window.dgmEditor?.forceTiming(), waterQueue: r.waterQueue?.size ?? 0,
    geometries: stat?.memory.geometries, textures: stat?.memory.textures, calls: stat?.render.calls, triangles: stat?.render.triangles,
    heap: performance.memory?.usedJSHeapSize, audio: window.dgmEditor?.sound() });
  if (!state.capture) return;
  // Each actual rendered frame is copied synchronously, before WebGL clears its drawing buffer.
  // Capture runs are separate from pacing runs; their overhead is NEVER compared as performance.
  state.images.push({ id: state.frameId - 1, at, png: r.canvas.toDataURL('image/png') });
  diagnose(r, m, at);
}
function diagnose(r, m, at) {
  const faults = [];
  // Geometry-level evidence complements captures. Skipped mine cutouts/caves are intentional.
  for (const [key, mesh] of r.terrain) {
    const pos = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
    for (let k = 0; k < pos.count; k += 4) {
      if (normals.getY(k) <= 0) continue;
      const x = Math.max(0, Math.min(m.W - 1, Math.floor((pos.getX(k) + pos.getX(k + 2)) / 2)));
      const y = Math.max(0, Math.min(m.H - 1, Math.floor(-(pos.getZ(k) + pos.getZ(k + 2)) / 2)));
      const tile = y * m.W + x;
      if (r.map.source.columns.has(tile) || r.map.source.cutout?.has(tile)) continue;
      if (pos.getY(k) !== m.heights[tile]) faults.push({ kind: 'stale-terrain-top', chunk: key, tile, drawn: pos.getY(k), expected: m.heights[tile] });
    }
  }
  for (const [key, mesh] of r.water) {
    const pos = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
    for (let k = 0; k < pos.count; k += 4) {
      if (normals.getY(k) <= 0) continue;
      const x = Math.floor((pos.getX(k) + pos.getX(k + 2)) / 2), y = Math.floor(-(pos.getZ(k) + pos.getZ(k + 2)) / 2);
      const tile = y * m.W + x, drawn = pos.getY(k), expected = m.surface.surface[tile];
      if (!Number.isFinite(expected)) continue; // lower cave layers require a separate oracle
      if (drawn < m.heights[tile] - 0.02) faults.push({ kind: 'water-under-ground', chunk: key, tile, drawn, ground: m.heights[tile] });
      if (Math.abs(drawn - expected) > 0.02) faults.push({ kind: 'water-state-mismatch', chunk: key, tile, drawn, expected });
    }
  }
  const previous = state.previous;
  if (previous) {
    let maxLand = 0, maxWater = 0, landTile = -1, waterTile = -1;
    for (let i = 0; i < m.heights.length; i++) {
      const dh = Math.abs(m.heights[i] - previous.heights[i]);
      if (dh > maxLand) { maxLand = dh; landTile = i; }
      const dw = Math.abs(m.surface.surface[i] - previous.surface[i]);
      if (Number.isFinite(dw) && dw > maxWater) { maxWater = dw; waterTile = i; }
    }
    state.discontinuities.push({ at, elapsed: at - previous.at, maxLand, landTile, maxWater, waterTile });
  }
  state.previous = { heights: m.heights.slice(), surface: m.surface.surface.slice(), at };
  state.errors.push(...faults.map(f => ({ ...f, at, frame: state.frameId - 1 })));
}
window.performanceHarness = {
  pauseMeasurement(label) { if (state.active) measurementPause = { label, start: performance.now() }; },
  resumeMeasurement() {
    if (!measurementPause) return;
    const pause = { ...measurementPause, end: performance.now() }; measurementPause = null;
    state.pauses.push(pause); state.pauseHistory.push(pause);
    if (state.pauseHistory.length > 16) state.pauseHistory.shift();
    state.calls.push({ name: 'harness:' + pause.label, start: pause.start, end: pause.end });
  },
  note(finding) { if (state.active) state.findings.push({ ...finding, at: performance.now() }); },
  fault(error) { if (state.active) state.errors.push({ ...error, at: performance.now() }); },
  async begin({ capture = false } = {}) {
    hook();
    Object.assign(state, { active: true, capture, frames: [], calls: [], tasks: [], rendered: [], images: [], errors: [], findings: [], audio: [], pcm: [], discontinuities: [], pauses: [], pauseHistory: [], previous: null, frameId: 0 });
    measurementPause = null;
    if (capture) await window.startPerformanceAudioCapture?.();
    last = null;
    return { visibility: document.visibilityState, focused: document.hasFocus(), gpu: renderer?.gpu(), software: renderer?.software, userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency,
      longTasksSupported: PerformanceObserver.supportedEntryTypes.includes('longtask'), pixelRatio: devicePixelRatio };
  },
  drainImages() { return state.images.splice(0); },
  drainAudio() { return state.pcm.splice(0); },
  drainEvents() {
    return { frames: state.frames.splice(0), calls: state.calls.splice(0), tasks: state.tasks.splice(0), rendered: state.rendered.splice(0), errors: state.errors.splice(0), findings: state.findings.splice(0), discontinuities: state.discontinuities.splice(0), pauses: state.pauses.splice(0) };
  },
  end() {
    for (const tap of audioTaps.values()) tap.port.postMessage({ record: false });
    state.active = false; return { ...state, previous: undefined, images: undefined, pcm: undefined };
  },
};
