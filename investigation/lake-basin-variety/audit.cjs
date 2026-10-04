// Restricted Lake Basin audit: reuse m9b/measures.ts without collecting speed readings.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const label = process.argv[2];
if (!/^(before|after|trial[0-9]+)$/.test(label)) throw Error('Expected before, after or trialN');
const lakeFile = path.resolve('src/core/land/lakeBasin.ts');
require.extensions['.ts'] = (mod, file) => {
  if (label === 'after' && file === lakeFile) {
    mod.exports = require('./prototype.ts');
    return;
  }
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true }, fileName: file,
}).outputText, file);
};
const file = path.resolve('investigation/m9b/measures.ts');
let src = fs.readFileSync(file, 'utf8').split('// ------------------------------------------------------------------------------------ the batch')[0];
src = src.replace(/performance\.now\(\)/g, '0').replace(/process\.cpuUsage\([^)]*\)/g, '({ user: 0, system: 0 })')
  .replace('const b = r.built;', 'globalThis.__lakeResult = r; const b = r.built;');
// Discard the measuring function's timing fields as well as disabling its clocks.
src = src.split('\n').filter(line => !/^    (ms|cpu|spent):/.test(line)).join('\n');
src += '\nexport { measureOne };\n';
const mod = new Module(file, module);
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: file }).outputText, file);
const { straightness, tooStraight } = require('../../src/core/analysis/straight.ts');
const { shadeTiles } = require('../../src/core/render/shade.ts');
const { encodePng } = require('../../tools/png.ts');
const out = path.resolve('investigation/lake-basin-variety/local', label);
fs.mkdirSync(out, { recursive: true });
const rows = [];
for (let seed = 1; seed <= 30; seed++) {
  const m = mod.exports.measureOne('lakeBasin', seed, 128, '', false);
  const r = globalThis.__lakeResult, b = r.built;
  const straight = straightness(b.W, b.H, b.water);
  const row = { seed, ok: m.ok, promise: m.outcomes?.promise ?? false, water: m.outcomes?.water ?? false,
    signature: m.outcomes?.signature ? { bigLake: m.outcomes.signature.bigLake, lakeShare: m.outcomes.signature.lakeShare } : null,
    story: m.outcomes?.story, wetShare: m.wetShare,
    straight: { pass: !tooStraight(straight), run: straight.longest?.length ?? 0, canal: straight.canal?.length ?? 0 },
    failedChecks: m.failedChecks };
  rows.push(row);
  const rgb = shadeTiles(b.heights, 128, 128, b.water), img = new Uint8Array(256 * 256 * 3);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = y * 128 + x;
    let c = Array.from(rgb.subarray(i * 3, i * 3 + 3));
    if (b.water[i] > 0.05 && b.contamination[i] >= 0.05) c = [150, 60, 170];
    if (b.start && Math.abs(x-b.start.x) <= 1 && Math.abs(y-b.start.y) <= 1) c = [230,20,20];
    for (let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) img.set(c, (((127-y)*2+dy)*256+x*2+dx)*3);
  }
  fs.writeFileSync(path.join(out, seed+'.png'), encodePng(img,256,256));
  fs.writeFileSync(path.join(out,'outcomes.json'), JSON.stringify(rows,null,2)+'\n');
  console.log(JSON.stringify({ seed, ok: row.ok, promise: row.promise, water: row.water, straight: row.straight.pass }));
}
console.log(JSON.stringify({ maps: rows.length, promise: rows.filter(r=>r.promise).length, water: rows.filter(r=>r.water).length, both: rows.filter(r=>r.promise&&r.water).length, straight: rows.filter(r=>r.straight.pass).length }));
