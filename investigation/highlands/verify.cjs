require('./runtime.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const genomePath = require.resolve('../../src/core/land/genome.ts');
// Load the baseline first, then the virtual adoption patch, keeping both implementations.
const old = require(genomePath);
delete require.cache[genomePath];
process.argv.push('--prototype');
const proposed = require(genomePath);
const { makeSpec, AVAILABLE_THEMES } = require('../../src/core/spec/mapspec.ts');
let comparisons=0;
for (const theme of AVAILABLE_THEMES.filter(t => t !== 'highlands'))
for (const seed of [1,7,20]) for (const size of [96,128,256]) for (const vt of [0,45,100]) {
  const s = makeSpec({ seed, theme, size: { x:size, y:size } });
  s.settings.terrain.verticality=vt;
  const a=old.drawGenome(theme, seed, size, size, 0, {vt});
  const b=proposed.drawGenome(theme, seed, size, size, 0, {vt});
  old.leanGenome(a, s.settings, size, size, seed, 0);
  proposed.leanGenome(b, s.settings, size, size, seed, 0);
  assert.deepEqual(b,a, `${theme}/${size}/${seed}/${vt}`);
  comparisons++;
}
console.log(`${comparisons} other-theme genome+settings comparisons: unchanged (including Any)`);
for (const seed of [1,7,20]) for (const size of [128,256]) for (const vt of [0,45,100]) {
  const s = makeSpec({ seed, theme:'highlands', size:{x:size,y:size} });
  s.settings.terrain.verticality=vt;
  const a=old.drawGenome('highlands',seed,size,size,0,{vt});
  const b=proposed.drawGenome('highlands',seed,size,size,0,{vt});
  old.leanGenome(a,s.settings,size,size,seed,0);
  proposed.leanGenome(b,s.settings,size,size,seed,0);
  assert.deepEqual(b,a,`unchanged larger Highlands/${size}/${seed}/${vt}`);
  comparisons++;
}
console.log('18 larger Highlands genome+settings comparisons: unchanged');
// Type-check the virtual source and its dependencies, without writing product files.
const ts = require('typescript');
const deps = process.env.DGM_DEPS || path.join(__dirname,'node_modules');
const opts = {target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext, moduleResolution:ts.ModuleResolutionKind.Bundler,
  strict:true, skipLibCheck:true, noEmit:true, resolveJsonModule:true, esModuleInterop:true,
  types:[], paths:{fflate:[path.join(deps,'fflate/lib/index.d.ts')]}, baseUrl:path.resolve(__dirname,'../..')};
const host=ts.createCompilerHost(opts);
const read=host.readFile;
host.readFile = file => { const s=read(file); return s===undefined?s:require('./prototype.cjs').transform(file,s); };
const program=ts.createProgram([genomePath],opts,host);
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(), getCanonicalFileName:x=>x, getNewLine:()=> '\n'}));
  process.exitCode=1;
} else console.log('Virtual adoption source and dependencies: type-check passed');
if(process.argv.includes('--maps')) {
  const {generate}=require('../../src/core/gen/generate.ts');
  for(const size of [96]) {
    const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'local','after',`${size}-1.json`),'utf8'));
    const r=generate(makeSpec({seed:1,theme:'highlands',size:{x:size,y:size}}));
    const actual=crypto.createHash('sha256').update(r.bytes).digest('hex');
    assert.equal(actual,expected.sha256, `repeat ${size}/1`);
    assert.equal(r.report.passed,true);
    console.log(`Repeat ${size}/1: byte-identical, blocking checks pass`);
  }
}
