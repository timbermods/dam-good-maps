import {execFileSync} from 'node:child_process';
import {transform} from './proposal.mjs';
// Render the same soil snapshots through the updateSoil path used by Editor.showSoil / Badtide.
import {server,browser,open,shot,DIR} from './harness.mjs';import {fixtureViews,installFixture} from './fixtures.mjs';import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';
const s=await server('proposal',4972,true),b=await browser(),out={round:3,errors:[]};
try{const p=await b.newPage({viewport:{width:1600,height:670}});p.on('pageerror',e=>out.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')out.errors.push(m.text())});await open(p,4972);await installFixture(p,'ground-veins');
 const frames=[];
 for(const level of [0,128,255,0]){
  await p.evaluate(level=>{const r=window.dgm3d.renderer,m=r.map,contamination=new Uint8Array(m.W*m.H);for(let y=12;y<m.H;y++)for(let x=0;x<m.W;x++)contamination[y*m.W+x]=level;r.updateSoil({moisture:m.soil.moisture.slice(),contamination});},level);
  await shot(p,fixtureViews['ground-veins'],join(DIR,'local/captures/day-'+level+'.jpg'));
  frames.push('data:image/png;base64,'+(await p.locator('.view3d > canvas').screenshot({type:'png'})).toString('base64'));
 }
 const points=await p.evaluate(()=>{const r=window.dgm3d.renderer;return {earth:r.project(8,5,-18),grass:r.project(24,5,-18)}});
 out.soil=await p.evaluate(async({frames,points})=>{const samples=[];for(const src of frames){const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=1600;c.height=670;const g=c.getContext('2d');g.drawImage(im,0,0);const a={};for(const[key,pos]of Object.entries(points))a[key]=g.getImageData(Math.round(pos.x)-80,Math.round(pos.y)-55,160,110).data;samples.push(a);}const out={};for(const key of Object.keys(points)){out[key]=samples.map((sample,j)=>{let changed=0,max=0;const a=sample[key],base=samples[0][key];for(let i=0;i<a.length;i+=4){const d=Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-base[i+k])));if(d>8)changed++;max=Math.max(max,d);}return {contamination:[0,128,255,0][j],changedFraction:changed/(160*110),maxChannelDelta:max};});}return out;},{frames,points});
 for(const result of Object.values(out.soil)){if(result[2].changedFraction<0.02||result[2].changedFraction>0.35)throw Error('Veins absent or staining most of soil');if(result[2].changedFraction<result[1].changedFraction)throw Error('Veins shrink at higher contamination');if(result[3].maxChannelDelta!==0)throw Error('Cleared day does not restore clean soil');}
 out.note='Changed fractions (>8 display codes) guard against absent veins and whole-soil recolouring, not a colour-blindness contrast requirement. 0/128/255/0 are synthetic displayed-day snapshots, not a weather simulation run.';
 out.build=JSON.parse(readFileSync(join(DIR,'local/build-proposal.json')));
 const previous=JSON.parse(execFileSync('git',['show','a39f004c:investigation/high-soul/checks.json'],{encoding:'utf8'})),fixture=JSON.parse(readFileSync(join(DIR,'local/fixture-manifest.json')));
 if(fixture.build.signature!==out.build.signature)throw Error('Stale fixture evidence');
 out.pools={comparisonCommit:'a39f004c',unchangedStatistics:JSON.stringify(previous.fixtures.waterPixels)===JSON.stringify(fixture.waterPixels)};
 if(!out.pools.unchangedStatistics)throw Error('Still-water samples changed');
 const oldSource=execFileSync('git',['show','a39f004c:investigation/high-soul/proposal.mjs'],{encoding:'utf8'}),old=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
 out.unchangedModules=[];
 for(const file of ['src/render3d/palette.ts','src/render3d/waterPalette.ts']){const source=readFileSync(join(DIR,'local/site',file),'utf8');if(old.transform(file,source)!==transform(file,source))throw Error(file+' changed');out.unchangedModules.push(file);}
 writeFileSync(join(DIR,'round3-checks.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out.soil));if(out.errors.length)throw Error(out.errors.join('\n'));
}finally{await b.close();await s.httpServer.close()}
