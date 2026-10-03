import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {deps,HERE,LOCAL,json} from './common.mjs';
import {host} from './host.mjs';
await deps('esbuild').build({entryPoints:[resolve(HERE,'portable.ts')],outfile:resolve(LOCAL,'portable.cjs'),bundle:true,platform:'node',format:'cjs',target:'es2022'});
const math=deps(resolve(LOCAL,'portable.cjs')),d=new DataView(new ArrayBuffer(8));
const bits=x=>{d.setFloat64(0,x,true);return d.getBigUint64(0,true).toString(16).padStart(16,'0');};
const value=n=>{d.setBigUint64(0,n,true);return d.getFloat64(0,true);};
const cases=[0,-0,Number.MIN_VALUE,Number.MAX_VALUE,1,2,3,4,0.5,Infinity];
for(let exponent=0;exponent<2047;exponent++)for(const fraction of[0n,1n,(1n<<51n)-1n,(1n<<52n)-1n])cases.push(value((BigInt(exponent)<<52n)|fraction));
let seed=123456789n;for(let i=0;i<100000;i++){seed=(seed*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);cases.push(value(seed&0x7fefffffffffffffn));}
for(const x of cases)assert.equal(bits(math.sqrtJS(x)),bits(math.sqrt(x)),'sqrtJS '+bits(x));
assert.ok(Number.isNaN(math.sqrtJS(-1)));assert.ok(Number.isNaN(math.sqrtJS(NaN)));
const vectors=cases.filter((_,i)=>i<8200||i%23===0).map(x=>[bits(x),bits(math.sqrt(x))]);
const probe=`import {sqrt,sqrtJS} from '../portable-browser.js';globalThis.mathProbe=vectors=>{const d=new DataView(new ArrayBuffer(8));const b=x=>{d.setFloat64(0,x,true);return d.getBigUint64(0,true).toString(16).padStart(16,'0')};for(const [input,expected]of vectors){d.setBigUint64(0,BigInt('0x'+input),true);const x=d.getFloat64(0,true);if(b(sqrt(x))!==expected||b(sqrtJS(x))!==expected)throw Error('sqrt bits differ '+input)}return vectors.length};`;
// Import relative to the served root, not to a product file.
writeFileSync(resolve(LOCAL,'math-probe.js'),probe.replace('../portable-browser.js','./portable-browser.js'));
await deps('esbuild').build({entryPoints:[resolve(HERE,'portable.ts')],outfile:resolve(LOCAL,'portable-browser.js'),bundle:true,platform:'browser',format:'esm',target:'es2022'});
const server=await host(),browsers=[],summary={nodeChecks:cases.length,browserChecks:[],fallback:'exact BigInt midpoint rounding, no native Math.sqrt'};
try{for(const name of['chromium','firefox','webkit']){const browser=await deps('playwright')[name].launch({headless:true});browsers.push(browser);
  for(const blocked of[false,true]){const page=await browser.newPage();if(blocked)await page.addInitScript(()=>{globalThis.WebAssembly=undefined;});await page.goto(server.url);await page.addScriptTag({url:server.url+'math-probe.js',type:'module'});await page.waitForFunction(()=>window.mathProbe);summary.browserChecks.push({engine:name,version:browser.version(),wasmBlocked:blocked,checks:await page.evaluate(v=>window.mathProbe(v),vectors)});await page.close();}
}}finally{await Promise.all(browsers.map(b=>b.close()));server.close();}
json('math-summary.json',summary);console.log(JSON.stringify(summary,null,2));
