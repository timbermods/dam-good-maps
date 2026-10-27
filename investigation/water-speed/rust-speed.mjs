import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { assertClean } from '../../tools/rust/guard.mjs';
const here = import.meta.dirname, root = path.resolve(here, '../..'), local = path.join(here, 'local');
const runtime = path.join(local, 'runtime'), req = createRequire(path.join(runtime, 'package.json'));
const cargo = path.join(process.env.USERPROFILE, '.cargo/bin/cargo.exe');
const env = { ...process.env, PATH: path.dirname(cargo) + path.delimiter + process.env.PATH, DGM_CARGO_JOBS: '4', PW_CHANNEL: 'chrome', RAYON_NUM_THREADS: '4' };
const sha = b => createHash('sha256').update(b).digest('hex');
const tree = name => path.join(local, name);
function run(exe, args, cwd, options = {}) { return execFileSync(exe, args, { cwd, env, windowsHide: true, stdio: 'inherit', ...options }); }
function tsx(dir, script, args = [], options = {}) { return run(process.execPath, ['--import', pathToFileURL(req.resolve('tsx')).href, script, ...args], dir, options); }
const mode = process.argv[2], stage = process.argv[3] ?? 'control';
if (mode === 'setup') {
  for (const name of ['control', 'candidate']) {
    const dir = tree(name);
    if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(path.join(runtime, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
    fs.writeFileSync(path.join(dir, 'rust/water/examples/water-speed.rs'), `use std::{io::Write, time::Instant};\nfn main() {\n let job = std::fs::read(std::env::args().nth(1).expect("input job")).unwrap();\n let start = Instant::now();\n let result = water::protocol::canonical_job(&job);\n eprintln!("{}", start.elapsed().as_secs_f64() * 1000.0);\n std::io::stdout().write_all(&result).unwrap();\n}\n`);
  }
  fs.writeFileSync(path.join(tree('control'), 'tools/rust/speed-input.ts'), `import {writeFileSync} from 'node:fs';\nimport {generate} from '../../src/core/gen/generate';\nimport {makeSpec} from '../../src/core/spec/mapspec';\nimport {prefill} from '../../src/core/sim/prefill';\nimport {encodeCanonicalJob} from '../../src/core/sim/rustWater';\nconst m = generate(makeSpec({seed:1, theme:'lakeBasin', size:{x:256,y:256}})).built.waterModel;\nconst s = prefill(m);\nwriteFileSync(process.argv[2], encodeCanonicalJob(m,s.depth,s.contamination));\n`);
  tsx(tree('control'), 'tools/rust/speed-input.ts', [path.join(local, 'settle-256.job')]);
  // Keep the original assertions; add explicit comparison with the unchanged baseline module.
  const original = fs.readFileSync(path.join(tree('candidate'), 'tools/rust/water-identity.ts'), 'utf8');
  const extra = `import { canonicalInWasm as todayCanonical } from '../../../control/src/core/sim/rustWater';\n` + original.replace('const diffs = [["Rust settle in Wasm", same(app, wasm)]];', 'const diffs = [["Rust settle in Wasm", same(app, wasm)], ["today baseline", same(app, todayCanonical(job, m.W * m.H) as CanonicalWater)]];');
  fs.writeFileSync(path.join(tree('candidate'), 'tools/rust/water-identity-speed.ts'), extra);
  console.log('fixed input SHA256', sha(fs.readFileSync(path.join(local, 'settle-256.job'))));
}
if (mode === 'build') {
  const dir = tree(stage === 'control' ? 'control' : 'candidate'), rust = path.join(dir, 'rust');
  const files = fs.readdirSync(rust, {recursive:true}).filter(f => f.endsWith('.rs') && !f.startsWith('target'));
  const audited=files.filter(f=>f.startsWith('water'+path.sep)||f.startsWith('portable'+path.sep));
  for(const f of audited) assertClean('source',fs.readFileSync(path.join(rust,f),'utf8'));
  console.log(stage,'source guard PASS',audited.length,'files');
  const flags = files.map(f => `--remap-path-prefix=${f}=${f.replaceAll('\\','/')}`);
  if (stage !== 'control') flags.push('-C', 'target-feature=+simd128,-relaxed-simd');
  const wasmEnv = {...env, CARGO_ENCODED_RUSTFLAGS: flags.join('\x1f')};
  run(cargo, ['rustc','--release','-j','4','-p','water','--lib','--target','wasm32-unknown-unknown','--target-dir','target/embed','--','--emit=link,llvm-ir,asm'], rust, {env:wasmEnv});
  const artifact = path.join(local, 'artifacts', stage); fs.mkdirSync(artifact, {recursive:true});
  const wasmFile = path.join(rust,'target/embed/wasm32-unknown-unknown/release/water.wasm');
  const wasm = fs.readFileSync(wasmFile); assertClean('wasm', wasm);
  const deps = path.join(rust,'target/embed/wasm32-unknown-unknown/release/deps');
  for (const file of fs.readdirSync(deps).filter(f=>f.endsWith('.ll')||f.endsWith('.s'))) assertClean(file.endsWith('.ll')?'ir':'assembly',fs.readFileSync(path.join(deps,file),'utf8'));
  fs.copyFileSync(wasmFile, path.join(artifact,'water.wasm'));
  fs.writeFileSync(path.join(dir,'src/core/sim/waterWasm.ts'), `// Local investigation build.\nexport const WATER_WASM = ${JSON.stringify(wasm.toString('base64'))};\n`);
  run(cargo,['build','--release','-j','4','-p','water','--bin','water-batch','--example','water-speed','--example','stack-fixture'],rust);
  fs.copyFileSync(path.join(rust,'target/release/examples/water-speed.exe'),path.join(artifact,'water-speed.exe'));
  fs.copyFileSync(path.join(rust,'target/release/water-batch.exe'),path.join(artifact,'water-batch.exe'));
  run(cargo,['rustc','--release','-j','4','-p','water','--lib','--','--emit=link,llvm-ir,asm'],rust);
  for (const file of fs.readdirSync(path.join(rust,'target/release/deps')).filter(f=>f.endsWith('.ll')||f.endsWith('.s'))) assertClean(file.endsWith('.ll')?'ir':'assembly',fs.readFileSync(path.join(rust,'target/release/deps',file),'utf8'));
  console.log(stage,'strict guards PASS; wasm',wasm.length,'bytes',sha(wasm));
}
if (mode === 'bench') {
  const artifact = path.join(local,'artifacts',stage), resultFile = path.join(local,'reading-'+stage+'.json');
  if(fs.existsSync(resultFile)) throw Error('One reading per stage only; existing '+resultFile);
  const input = fs.readFileSync(path.join(local,'settle-256.job'));
  const native = spawnSync(path.join(artifact,'water-speed.exe'),[path.join(local,'settle-256.job')],{env,windowsHide:true,maxBuffer:64<<20});
  if(native.status!==0) throw Error(native.stderr.toString());
  fs.writeFileSync(path.join(artifact,'result.native'),native.stdout);
  const {chromium} = req('@playwright/test');
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  let web;
  try {
    const page = await browser.newPage();
    web = await page.evaluate(async ({wasm,job}) => {
      const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
      const module=await WebAssembly.compile(decode(wasm)), instance=await WebAssembly.instantiate(module), x=instance.exports;
      const b=decode(job), p=x.water_alloc(b.length), lp=x.water_alloc(4); new Uint8Array(x.memory.buffer,p,b.length).set(b);
      const start=performance.now(), out=x.water_canonical(p,b.length,lp), ms=performance.now()-start;
      const len=new DataView(x.memory.buffer).getUint32(lp,true), bytes=new Uint8Array(x.memory.buffer,out,len);
      let str=''; for(let i=0;i<bytes.length;i+=8192) str+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return {ms,result:btoa(str)};
    }, {wasm:fs.readFileSync(path.join(artifact,'water.wasm')).toString('base64'),job:input.toString('base64')});
    const output=Buffer.from(web.result,'base64'); fs.writeFileSync(path.join(artifact,'result.chromium'),output);
    if(!output.equals(native.stdout)) throw Error('native/Chromium byte mismatch');
    const baseline=path.join(local,'artifacts/control/result.native');
    if(stage!=='control' && !output.equals(fs.readFileSync(baseline))) throw Error('today baseline byte mismatch');
    const row={stage,inputSha256:sha(input),nativeMs:Number(native.stderr.toString().trim()),chromiumMs:web.ms,chromium:browser.version(),resultSha256:sha(output),wasmSha256:sha(fs.readFileSync(path.join(artifact,'water.wasm'))),bytes:output.length,method:'one cold-instance canonical settle; compilation/input copy excluded; decode/encode included; shared PC'};
    fs.writeFileSync(resultFile,JSON.stringify(row,null,2)+'\n'); console.log(JSON.stringify(row));
  } finally {await browser.close();}
}
if(mode==='identity' || mode==='checks') {
  const dir=tree('candidate'), logs=path.join(local,'proof',stage); fs.mkdirSync(logs,{recursive:true});
  async function logged(name,exe,args,cwd) {
    console.log(stage+' '+name+' starting');
    const stream=fs.createWriteStream(path.join(logs,name+'.log'));
    const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',b=>{stream.write(b); process.stdout.write(b);});
    child.stderr.on('data',b=>{stream.write(b); process.stderr.write(b);});
    const status=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done);});
    await new Promise(done=>stream.end(done));
    if(status!==0) throw Error(name+' failed with status '+status);
    console.log(stage+' '+name+' PASS');
  }
  await logged('rust-tests',cargo,['test','-j','4','-p','water','--','--test-threads=4'],path.join(dir,'rust'));
  if(mode==='identity') await logged('baseline-identity',process.execPath,['--import',pathToFileURL(req.resolve('tsx')).href,'tools/rust/water-identity-speed.ts','--threads','4','--require-native','--sizes','96,128,256,512'],dir);
  await logged('water-tests',process.execPath,[path.join(runtime,'node_modules/vitest/vitest.mjs'),'run','--project','quick','--maxWorkers','4','tests/unit/water-speedups.test.ts','tests/unit/rustWater.test.ts'],dir);
  await logged('stack-identity',process.execPath,['--import',pathToFileURL(req.resolve('tsx')).href,'tools/rust/stack-identity.ts'],dir);
  await logged('determinism',process.execPath,['--import',pathToFileURL(req.resolve('tsx')).href,'tools/determinism/run.ts','--smoke','--only','water/,weather/','--engines','node,chromium,chromium-threads','--serial','--no-timings','--out-dir',path.join(logs,'determinism')],dir);
  // Compare every component/checkpoint with the unchanged dev manifests, not just candidate engines.
  const base=path.join(local,'proof/control/determinism/node.json');
  if(fs.existsSync(base)) {
    const a=JSON.parse(fs.readFileSync(base)), b=JSON.parse(fs.readFileSync(path.join(logs,'determinism/node.json')));
    if(a.length!==b.length || a.some((r,i)=>r.label!==b[i].label||r.hash!==b[i].hash)) throw Error('determinism differs from dev');
    console.log('today dev determinism manifests: '+a.length+' checkpoints IDENTICAL');
  }
}
if(mode==='control-determinism') {
  const dir=tree('control'), output=path.join(local,'proof/control/determinism');
  tsx(dir,'tools/determinism/run.ts',['--smoke','--only','water/,weather/','--engines','node','--serial','--no-timings','--out-dir',output]);
}
