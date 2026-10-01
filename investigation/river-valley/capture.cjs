const fs = require('node:fs');
const path = require('node:path');
module.exports = (r, mode) => {
  const { shadeTiles } = require('../../src/core/render/shade.ts');
  const { encodePng } = require('../../tools/png.ts');
  const { wetSystems } = require('../../src/core/analysis/story.ts');
  const b = r.built, W = b.W, H = b.H;
  const out = path.join(__dirname, 'local', mode, String(W));
  fs.mkdirSync(out, { recursive: true });
  const rgb = shadeTiles(b.heights, W, H, b.water), img = new Uint8Array(rgb.length);
  for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
  for (let i = 0; i < W * H; i++) if (b.water[i] >= 0.05 && b.contamination[i] >= 0.05) {
    const k = ((H - 1 - Math.floor(i / W)) * W + i % W) * 3;
    img.set([150, 60, 40], k);
  }
  const dot = (x, y, color, radius = 1) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) img.set(color, ((H - 1 - yy) * W + xx) * 3);
    }
  };
  for (const river of r.features.filter(f => f.kind === 'river' && !f.params.badwater)) {
    const p = river.params.path;
    const head = 'spring' in river.params.entry ? river.params.entry.spring : p[0];
    dot(Math.max(0, Math.min(W - 1, head[0])), Math.max(0, Math.min(H - 1, head[1])), [255, 220, 50]);
    if ('edge' in river.params.exit) dot(Math.max(0, Math.min(W - 1, p.at(-1)[0])), Math.max(0, Math.min(H - 1, p.at(-1)[1])), [250, 250, 250]);
  }
  if (b.start) dot(b.start.x, b.start.y, [230, 40, 40], 2);
  const key = String(r.spec.seed);
  fs.writeFileSync(path.join(out, key + '.png'), encodePng(img, W, H));
  const systems = wetSystems(W, H, b.water);
  const riverInfo = r.features.filter(f => f.kind === 'river').map(f => {
    const p = f.params.path;
    const course = [];
    for (let k = 1; k < p.length; k++) {
      const n = Math.max(1, Math.ceil(Math.hypot(p[k][0] - p[k-1][0], p[k][1] - p[k-1][1])));
      for (let q = 0; q < n; q++) {
        const x = Math.round(p[k-1][0] + q/n*(p[k][0]-p[k-1][0])), y = Math.round(p[k-1][1] + q/n*(p[k][1]-p[k-1][1]));
        if (x>=0 && x<W && y>=0 && y<H) { const i=y*W+x; course.push({x,y,h:b.heights[i],d:+b.water[i].toFixed(3),system:systems.labels[i]}); }
      }
    }
    return {role:f.role, ...f.params, course};
  });
  fs.writeFileSync(path.join(out, key + '.json'), JSON.stringify({seed:r.spec.seed, attempts:r.attempts, info:r.info, outcomes:r.outcomes, checks:r.report.checks, systems:systems.tiles, rivers:riverInfo}, null, 2));
  // Complete fields are local only, useful for visual diagnosis without re-generation.
  fs.writeFileSync(path.join(out, key + '.field.json'), JSON.stringify({W,H,heights:Array.from(b.heights),water:Array.from(b.water),contamination:Array.from(b.contamination)}));
};
