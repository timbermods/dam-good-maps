import { generate } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { buildPlace, decodePlaceFile } from '../../src/core/places/place';
import { readTimber, writeTimber } from '../../src/core/format/timber';
import { openTimber, closeSession } from '../../src/worker/session';
import { surfaceWater } from '../../src/render3d/model';
import { WaterSim } from '../../src/core/sim/water';
import { waterModelFromWorld } from '../../src/core/sim/model';
import { surfaceVelocity } from './flow';

export type MapRequest = { id: number; kind: 'generated' | 'place' | 'prototype'; theme?: ThemeId; size?: number; seed?: number; name?: string };
self.onmessage = async ({ data: r }: MessageEvent<MapRequest>) => {
  try {
    let bytes: Uint8Array;
    let label: string;
    let settledFlow: { depth: Float64Array; out?: Float64Array } | undefined;
    if (r.kind === 'generated') {
      const size = r.size ?? 128;
      const result = generate(makeSpec({ seed: r.seed ?? 4242, theme: r.theme, size: { x: size, y: size } }), {
        onProgress: p => self.postMessage({ id: r.id, progress: `Generating: attempt ${p.attempt + 1}, ${p.stage}` }),
      });
      if (!result.report.passed) throw new Error('Generator rejected this seed after its normal retries. Choose another seed.');
      bytes = result.bytes;
      settledFlow = result.built.settle;
      label = `${r.theme} · ${size}² · seed ${r.seed ?? 4242}`;
    } else {
      const path = r.kind === 'place' ? `/maps/place/${r.name}.json.gz` : `/maps/prototype/${encodeURIComponent(r.name!)}`;
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Map unavailable: ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
      if (r.kind === 'place') {
        const built = buildPlace(decodePlaceFile(bytes));
        bytes = writeTimber(built.file); settledFlow = built.settle;
      }
      label = r.name!;
    }
    // Exactly the editor's stored-water/soil path, including multi-level columns.
    const { view } = openTimber(bytes, `${label}.timber`);
    closeSession();
    let flowSource = 'generator settled outflows';
    if (!settledFlow?.out) {
      // Imported files do not carry the renderer's velocity. Warm the repository's
      // simulator from their stored surface water; never replace the displayed map.
      const sw = surfaceWater(view.W, view.H, view.water);
      const model = waterModelFromWorld(readTimber(bytes).world, view.heights);
      const sim = new WaterSim(model, { depth: Float64Array.from(sw.depth), contamination: Float64Array.from(sw.contamination) });
      sim.run(128);
      settledFlow = { depth: sim.D, out: sim.out };
      flowSource = '128-tick estimate from stored water';
    }
    const velocity = surfaceVelocity(view.W, view.H, settledFlow.depth, settledFlow.out!);
    self.postMessage({ id: r.id, view, label, velocity, flowSource });
  } catch (error) {
    self.postMessage({ id: r.id, error: String(error) });
  }
};
