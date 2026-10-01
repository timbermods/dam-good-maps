// Read-back of the brief (information, never a new acceptance gate).
require('./runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { fallsOf } = require('../../src/core/analysis/vertical.ts');
const { levelRegions } = require('../../src/core/math/grid.ts');
const folder = path.join(__dirname, 'local', process.argv.includes('--prototype') ? 'after' : 'before');
for (const file of fs.readdirSync(folder).filter(f => /^\d+-\d+\.json$/.test(f))) {
  const name = path.join(folder, file), d = JSON.parse(fs.readFileSync(name, 'utf8'));
  const n = d.spec.size.x;
  const h = Uint8Array.from(d.heights), water = Float64Array.from(d.water);
  const falls = fallsOf(h, water, n, n).filter(f => d.contamination[f.i] < .05);
  const reg = levelRegions(h, n, n);
  const broad = reg.size.map((size, k) => ({ size, level: reg.level[k] })).filter(r => r.size >= 120 * n * n / 16384);
  d.brief = { cleanFallTiles: falls.length, tallestCleanFall: Math.max(0, ...falls.map(f => f.drop)), broadLevelHeights: [...new Set(broad.map(r => r.level))].sort((a,b) => a-b), startLevelArea: d.start ? reg.size[reg.labels[d.start.y*n+d.start.x]] : 0 };
  fs.writeFileSync(name, JSON.stringify(d));
}
