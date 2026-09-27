import { generate } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { buildPlace, decodePlaceFile } from '../../src/core/places/place';
import { readTimber, writeTimber } from '../../src/core/format/timber';
import { openTimber, closeSession } from '../../src/worker/session';
import { emptyColumns, emptyWater, entityView, surfaceWater, type MapView, type EntityInput } from '../../src/render3d/model';
import { growthOf } from './growth';
import { noise, species } from './models';
export type MapRequest = { id?: number; kind: 'generated' | 'place' | 'gallery' | 'lineup' | 'stress'; size?: number; seed?: number; theme?: ThemeId; name?: string };

function gallery(lineup = false) {
  const W = 24, H = 22, entries: EntityInput[] = [], growth: number[] = [];
  // Four columns; rows: three natural variants, three growth stages, bare forms.
  for (let row = 0; row < (lineup ? 3 : 7); row++) for (let col = 0; col < 4; col++) {
    const g = lineup ? row === 1 ? 0.32 : 1 : row < 3 || row === 6 ? 1 : [0.08, 0.32, 0.66][row - 3];
    entries.push({ template: species[col], x: 6 + col * 3, y: lineup ? 4 + row * 3 : 3 + row * 2, z: 2, orientation: 'Cw0', owner: 'diagnostic', dead: row === (lineup ? 2 : 6), young: g < 1 }); growth.push(g);
  }
  const view: MapView = { W, H, heights: new Uint8Array(W * H).fill(2), columns: emptyColumns(), water: emptyWater(), entities: entityView(entries), soil: { moisture: new Uint8Array(W * H).fill(180), contamination: new Uint8Array(W * H) } };
  return { view, growth: Float32Array.from(growth), label: lineup ? 'Type lineup · columns pine / birch / oak / berries · rows mature / young / dead' : 'Specimen garden · original diagnostic layout' };
}
self.onmessage = async ({ data: r }: MessageEvent<MapRequest>) => {
  const start = performance.now();
  try {
    if (r.kind === 'gallery' || r.kind === 'lineup') { self.postMessage({ id: r.id, ...gallery(r.kind === 'lineup'), ms: performance.now() - start }); return; }
    let bytes: Uint8Array, label: string;
    if (r.kind === 'generated' || r.kind === 'stress') {
      const size = r.kind === 'stress' ? 256 : r.size ?? 128;
      const result = generate(makeSpec({ seed: r.seed ?? 4242, theme: r.theme ?? 'riverValley', size: { x: size, y: size } }), {
        onProgress: p => self.postMessage({ id: r.id, progress: `Generating ${size}² · attempt ${p.attempt + 1} · ${p.stage}` }),
      });
      if (!result.report.passed) throw new Error('Generator rejected this seed. Choose a different seed.');
      bytes = result.bytes; label = `${r.theme ?? 'riverValley'} · ${size}² · seed ${r.seed ?? 4242}`;
    } else {
      const response = await fetch(`/maps/place/${r.name}.json.gz`);
      if (!response.ok) throw new Error(`Real place unavailable (${response.status})`);
      const built = buildPlace(decodePlaceFile(new Uint8Array(await response.arrayBuffer())));
      bytes = writeTimber(built.file); label = r.name!.replaceAll('-', ' ');
    }
    const stored = readTimber(bytes);
    const { view } = openTimber(bytes, `${label}.timber`); closeSession();
    let growth = growthOf(view.entities, stored.world.entities);
    if (r.kind === 'stress') {
      const water = surfaceWater(view.W, view.H, view.water), list: EntityInput[] = [];
      for (let y = 1; y < view.H - 1; y++) for (let x = 1; x < view.W - 1; x++) {
        const i = y * view.W + x;
        if (water.depth[i] > 0.02 || noise(x, y, 21) > 0.86) continue;
        list.push({ template: species[Math.floor(noise(x, y, 22) * 3)], x, y, z: view.heights[i], orientation: 'Cw0', owner: 'stress', dead: false, young: false });
      }
      view.entities = entityView(list); growth = new Float32Array(list.length).fill(1);
      label += ` · dense stress overlay (${list.length.toLocaleString()} trees; placement is synthetic)`;
    }
    self.postMessage({ id: r.id, view, growth, label, ms: performance.now() - start });
  } catch (error) { self.postMessage({ id: r.id, error: String(error) }); }
};
