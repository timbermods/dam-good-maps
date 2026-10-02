import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {deps,HERE,ROOT,LOCAL,hash,json} from './common.mjs';
import {adoptionPlugin,transform,native} from './transform.mjs';
import {host} from './host.mjs';
const actual=process.argv.includes('--actual'),revisions=actual?[['current',ROOT]]:[['legacy',ROOT],['dev',resolve(LOCAL,'dev')]];
const ts=deps('typescript'),cases=[],rows=[],summary={cases:0,engines:{},mismatches:[],changes:{},sourceExpressions:{}};
for(const size of [96,128,256]){
 for(const tool of ['raise','lower','flatten','smooth','naturalize'])for(const radius of [.5,6.25,24])for(const straight of [false,true])cases.push({id:`brush-${size}-${tool}-${radius}-${straight}`,kind:'brush',size,tool,radius,straight,square:false});
 for(const mode of ['rect','free','level'])for(const modifier of ['set','add','subtract'])cases.push({id:`select-${size}-${mode}-${modifier}`,kind:'select',size,mode,modifier});
 for(const [dx,dy]of [[0,0],[3,4],[3.6,4.8],[6-1e-14,0],[6,0],[6+1e-14,0],[4,4],[4.25,4.25],[.25,.5]])for(const kind of ['freehand','editor','features'])cases.push({id:`${kind}-${size}-${dx}-${dy}`,kind,size,dx,dy});
}
for(const [revision,source]of revisions)for(const adopted of [false,true]){
 const file=resolve(source,'src/editor/Editor.tsx'),text=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),calls=[];
 const visit=n=>{if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['Math','__portableMath'].includes(n.expression.expression.getText(ast))&&native.has(n.expression.name.text))calls.push(n.getText(ast));ts.forEachChild(n,visit);};visit(ast);summary.sourceExpressions[revision]=calls;
 const environment='px,py,ground,marker,vx,vy,t,e,d,low,hit,from,p,f,b,a,intent,down,k,n';
 const math=calls.map(expr=>`(env:any)=>{const {${environment}}=env;return ${expr};}`).join(',');
 let api=`export {BrushPainter,DEFAULT_BRUSH} from '${resolve(source,'src/editor/brushes.ts').replaceAll('\\','/')}';\nexport {Selection,selectTool} from '${resolve(source,'src/editor/select.ts').replaceAll('\\','/')}';\nexport {anchorOf,rectOutline,rectRuns,clampMove,movePatch} from '${resolve(source,'src/editor/features.ts').replaceAll('\\','/')}';\n`;
 const free=resolve(source,'src/editor/freehand.ts');api+=existsSync(free)?`export {FreehandPath,bandTiles} from '${free.replaceAll('\\','/')}';\n`:'export const FreehandPath:any=null,bandTiles:any=null;\n';
 let expressions=`export const editorMath=[${math}];`;if(actual)expressions=`import * as __portableMath from '${resolve(source,'src/core/math/portable.ts').replaceAll('\\','/')}';\n`+expressions;else if(adopted)expressions=transform(expressions,'editor-expressions.ts',resolve(HERE,'portable.ts').replaceAll('\\','/'));api+=expressions;
 const entry=resolve(LOCAL,`gesture-${revision}-${adopted?'adopted':'baseline'}.ts`);writeFileSync(entry,api);
 await deps('esbuild').build({entryPoints:[resolve(HERE,'gesture-driver.ts')],outfile:entry.replace(/\.ts$/,'.js'),bundle:true,format:'esm',platform:'browser',alias:{'gesture-api':entry},plugins:adopted&&!actual?[adoptionPlugin()]:[]});
}
const h=await host(),browsers=[];
try{for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);summary.engines[name]=b.version();
 for(const [revision]of revisions){const results={};for(const mode of ['baseline','adopted']){const p=await b.newPage();await p.goto(h.url);await p.addScriptTag({url:h.url+`gesture-${revision}-${mode}.js`,type:'module'});await p.waitForFunction(()=>window.gesture);results[mode]=await p.evaluate(async cases=>{const rows=[];for(const c of cases){const bytes=new TextEncoder().encode(window.gesture(c)),digest=await crypto.subtle.digest('SHA-256',bytes);rows.push({id:c.id,hash:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});}return rows;},cases);await p.close();console.log('Gesture cohort',name,revision,mode,cases.length);}
 for(let i=0;i<cases.length;i++){const before=results.baseline[i].hash,after=results.adopted[i].hash;rows.push({engine:name,revision,id:cases[i].id,before,after});if(before!==after){const key=name+'/'+revision+'/'+cases[i].kind;summary.changes[key]=(summary.changes[key]??0)+1;}}
 }}}
finally{await Promise.all(browsers.map(b=>b.close()));h.close();}
for(const [revision]of revisions)for(const c of cases){const group=rows.filter(r=>r.revision===revision&&r.id===c.id);if(group.some(r=>r.after!==group[0].after))summary.mismatches.push({revision,id:c.id});}
summary.cases=cases.length*revisions.length;json(actual?'gestures-actual-manifest.json':'gestures-manifest.json',rows);json(actual?'gestures-actual-summary.json':'gestures-summary.json',summary);console.log(summary.cases,'gesture cases; mismatches',summary.mismatches.length,'changes',summary.changes);if(summary.mismatches.length)process.exitCode=1;
