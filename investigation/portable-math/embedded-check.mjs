import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deps,ROOT,HERE,LOCAL,json,hash} from './common.mjs';
import {transform} from './transform.mjs';
import {violations} from './guard.mjs';
import {host} from './host.mjs';
const actual=process.argv.includes('--actual'),ts=deps('typescript'),candidate=actual?ROOT:resolve(LOCAL,'adopted-root');
if(!actual){for(const file of ['capture-live-editing.ts','capture-objects.ts','capture-waterfalls.ts'])writeFileSync(resolve(candidate,'tools',file),transform(readFileSync(resolve(ROOT,'tools',file),'utf8'),'tools/'+file,'../src/core/math/portable'));mkdirSync(resolve(candidate,'tools'),{recursive:true});writeFileSync(resolve(candidate,'tools/portable-page.ts'),readFileSync(resolve(HERE,'portable-page.ts')));}
const {portablePage,portableEvaluate}=await import(pathToFileURL(resolve(candidate,'tools/portable-page.ts')));
const scripts=[];
for(const file of ['capture-live-editing.ts','capture-objects.ts','capture-waterfalls.ts']){
 const text=readFileSync(resolve(candidate,'tools',file),'utf8');if(violations(text,'tools/'+file).length)throw Error('Embedded native call remains');
 const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 function visit(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&ts.isStringLiteral(n.initializer)&&n.initializer.text.includes('__portableMath.'))scripts.push({file,name:n.name.text,code:n.initializer.text});ts.forEachChild(n,visit);}visit(ast);
}
if(scripts.length!==5)throw Error('Expected five evaluated page scripts');
const cases=[];for(const size of [64,96,128])for(const variant of [0,1,2])for(const which of ['live','whole','tallest','strong','cascade','badwater'])cases.push({size,variant,which});
const encoded=new Map();for(const s of scripts)encoded.set(s.file+'/'+s.name,await portablePage(s.code));
const palettes=scripts.filter(s=>s.name!=='FIND_JS').map(s=>{const a=s.code.indexOf('const table ='),b=s.code.indexOf('const enc ='),end=s.code.indexOf('\n',b);if(a<0||b<0)throw Error('Palette extraction failed');return '('+s.code.slice(a,end)+';return [Array.from(table),Array.from({length:501},(_,i)=>enc(i/500))];)';});
const paletteCode=await Promise.all(palettes.map(s=>portablePage('(()=>{'+s.slice(1,-1)+'})()')));
const h=await host(),summary={cases:cases.length+paletteCode.length+1,engines:{},mismatches:[],pins:{},bindings:hash(readFileSync(resolve(candidate,'tools/portable-page.ts')))},rows=[];
try{for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});try{const p=await b.newPage();await p.goto(h.url);summary.engines[name]=b.version();
 await p.evaluate(()=>{for(const n of ['sin','cos','tan','asin','acos','atan','atan2','exp','log','log2','pow','hypot','sqrt'])Math[n]=()=>{throw Error('Native embedded '+n)};window.exact=x=>{if(typeof x==='number'){if(!Number.isFinite(x))throw Error('Nonfinite embedded result');const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,x,true);return [...b].map(v=>v.toString(16).padStart(2,'0')).join('');}if(x===null||typeof x!=='object')return x;if(Array.isArray(x))return x.map(window.exact);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,window.exact(v)]));};});
 const values=[];for(const c of cases){await p.evaluate(({size:W,variant})=>{const H=W,N=W*H,heights=new Float64Array(N),depth=new Float64Array(N),contamination=new Float64Array(N),surface=new Float64Array(N);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;heights[i]=Math.floor(y/8)*1.5+Math.floor(x/16)*.25+variant*.125;const wet=Math.abs(x-W/2)<=3||x>W*.65&&y>H*.6;depth[i]=wet?.5+(y%3)/16:0;contamination[i]=wet&&y>H*.6?.6:0;surface[i]=wet?heights[i]+depth[i]:NaN;}const map={W,H,heights,surface:{depth,contamination,surface}};window.dgm3d={renderer:{map,mapState:()=>map}};},c);
 const source=c.which==='live'?encoded.get('capture-live-editing.ts/FIND_JS'):'('+encoded.get('capture-waterfalls.ts/FIND_JS')+')('+JSON.stringify([c.which,-Math.PI/6,70*Math.PI/180,.42])+')';values.push(await p.evaluate('JSON.stringify(window.exact('+source+'))'));}
 for(const code of paletteCode)values.push(await p.evaluate('JSON.stringify(window.exact('+code+'))'));
 // Exercise the real callback adapter, not just manually assembled strings.
 values.push(JSON.stringify(await portableEvaluate(p,data=>__portableMath.hypot(data[0],data[1]),[5.25,-12.125])));
 rows.push({engine:name,hashes:values.map(hash)});summary.pins[name]=hash(JSON.stringify(rows.at(-1).hashes));await p.close();console.log('Embedded scripts',name,values.length,'native calls trapped');
 }finally{await b.close();}}}finally{h.close();}
for(const r of rows)if(r.hashes.some((v,i)=>v!==rows[0].hashes[i]))summary.mismatches.push(r.engine);
json('embedded-summary.json',summary);json('embedded-manifest.json',rows);if(summary.mismatches.length)throw Error('Embedded page maths differ');
