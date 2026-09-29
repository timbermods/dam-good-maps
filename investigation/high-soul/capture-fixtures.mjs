import {server,browser,open,shot,DIR} from './harness.mjs';
import {fixtureViews,installFixture} from './fixtures.mjs';
import {join} from 'node:path';import {readFileSync,writeFileSync} from 'node:fs';
const manifest={kind:'Original synthetic material fixtures; not simulated maps',time:12.5,views:fixtureViews,errors:[]};
for(const mode of process.argv.includes('--quick')?['proposal']:['baseline','proposal']){
 const s=await server(mode,mode==='baseline'?4971:4972,process.argv.includes('--skip-build')),b=await browser();
 try{const p=await b.newPage({viewport:{width:1600,height:670}});p.on('pageerror',e=>manifest.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')manifest.errors.push(m.text())});await open(p,mode==='baseline'?4971:4972);
 for(const[id,view]of Object.entries(fixtureViews)){await installFixture(p,id);await shot(p,view,join(DIR,`local/captures/${id}-${mode}.jpg`));console.log('fixture',id,mode);
 if(id==='water-comparison'&&mode==='proposal'){
  const points=await p.evaluate(()=>{const r=window.dgm3d.renderer;return {cleanDeep:r.project(12,5.7,-9),cleanShallow:r.project(12,5.7,-26),badDeep:r.project(34,5.7,-9),badShallow:r.project(34,5.7,-26)}});
  const data='data:image/jpeg;base64,'+readFileSync(join(DIR,'local/captures/water-comparison-proposal.jpg')).toString('base64');
  manifest.waterPixels=await p.evaluate(async({data,points})=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=1600;c.height=670;const g=c.getContext('2d');g.drawImage(img,0,0);const out={};for(const[name,pos]of Object.entries(points)){if(!pos.visible)throw Error(name+' offscreen');const d=g.getImageData(Math.round(pos.x)-12,Math.round(pos.y)-12,25,25).data,values=[];for(let i=0;i<d.length;i+=4)values.push(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);values.sort((a,b)=>a-b);out[name]={pixel:[pos.x,pos.y],medianDisplayLuma:values[312],p05:values[31],p95:values[593]};}return out;},{data,points});
  if(manifest.waterPixels.cleanDeep.medianDisplayLuma>=manifest.waterPixels.cleanShallow.medianDisplayLuma)throw Error('Deep water did not render darker than shallow water');
 }
 }

 if(process.argv.includes('--quick')){await p.close();const q=await b.newPage({viewport:{width:1600,height:670}});await open(q,4972);await shot(q,JSON.parse(readFileSync(join(DIR,'views.json'))).close,join(DIR,'local/captures/pair-2-proposal.jpg'));}
 }finally{await b.close();await s.httpServer.close()}
}
manifest.build=JSON.parse(readFileSync(join(DIR,'local/build-proposal.json')));writeFileSync(join(DIR,'local/fixture-manifest.json'),JSON.stringify(manifest,null,2));if(manifest.errors.length)throw Error(manifest.errors.join('\n'));
