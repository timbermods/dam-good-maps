// Independent browser arithmetic/checkpoint check. A fresh headless browser; no existing tabs.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {deserialize} from 'node:v8';
import {deps,api,HERE,ROOT,LOCAL,fixtures,model,json,bytes,hash} from './common.mjs';
const esbuild=deps('esbuild');
for(const variant of ['baseline','fast']) {
  await esbuild.build({absWorkingDir:HERE,entryPoints:['api.ts'],outfile:resolve(LOCAL,variant+'.browser.js'),bundle:true,platform:'browser',format:'iife',globalName:variant==='baseline'?'WaterBaseline':'WaterFast',target:'es2022',minify:false,nodePaths:[resolve(dirname(deps.resolve('typescript/package.json')),'..')],plugins:[{name:'candidate',setup(build){if(variant==='fast')build.onResolve({filter:/water$/},args=>resolve(args.resolveDir,args.path)===resolve(ROOT,'src/core/sim/water')?{path:resolve(HERE,'water.ts')}:undefined);}}]});
}
const cases=fixtures().map(f=>({id:'fixture-'+f.name,model:model(f),rules:['game','port']}));
for(const size of [128,256])for(const theme of ['riverValley','lakeBasin','islands']) {
  cases.push({id:`${theme}-${size}`,model:deserialize(readFileSync(resolve(LOCAL,'inputs',`${theme}-${size}.bin`))),rules:['game']});
}
const encode=o=>JSON.stringify(o,(_,v)=>ArrayBuffer.isView(v)?{$type:v.constructor.name,base64:bytes(v).toString('base64')}:v);
const chrome=process.env.DGM_CHROME;
const browser=await deps('playwright').chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{}),args:['--disable-background-timer-throttling']});
try {
  const page=await browser.newPage();
  // Supply the document locally through routing; localhost is a secure WebCrypto context.
  await page.route('http://localhost/water-speed',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Water speed verification</title>'}));
  await page.goto('http://localhost/water-speed');
  for(const name of ['baseline','fast'])await page.addScriptTag({content:readFileSync(resolve(LOCAL,name+'.browser.js'),'utf8')});
  const rows=[];
  for(const c of cases) {
    const row=await page.evaluate(async encoded=>{
      const c=JSON.parse(encoded,(_,v)=>{
        if(v?.$type){const raw=Uint8Array.from(atob(v.base64),x=>x.charCodeAt(0));return new globalThis[v.$type](raw.buffer);}return v;
      });
      const a=WaterBaseline,b=WaterFast;
      const raw=x=>new Uint8Array(x.buffer,x.byteOffset,x.byteLength);
      const same=(x,y,label)=>{const aa=raw(x),bb=raw(y);if(aa.length!==bb.length||aa.some((v,i)=>v!==bb[i]))throw Error(c.id+' '+label+' byte mismatch');};
      const simCheck=(x,y,label)=>{for(const k of ['D','C','Dold','out'])same(x[k],y[k],label+' '+k);same(x.saturation(),y.saturation(),label+' sat');if(x.ticks!==y.ticks||!Object.is(x.volume(),y.volume()))throw Error(label+' ticks/volume');};
      const digest=async arrays=>{
        const size=arrays.reduce((s,x)=>s+x.byteLength,0),out=new Uint8Array(size);let at=0;
        for(const x of arrays){out.set(raw(x),at);at+=x.byteLength;}
        const data=await crypto.subtle.digest('SHA-256',out);
        return Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,'0')).join('');
      };
      const result=[];
      for(const rules of c.rules) {
        const m=c.model,aa=new a.WaterSim(structuredClone(m),a.prefill(m),{rules}),bb=new b.WaterSim(structuredClone(m),b.prefill(m),{rules});
        const ra=new a.SettleRun(aa,{sealed:a.sealedTiles(m)}),rb=new b.SettleRun(bb,{sealed:b.sealedTiles(m)});let checks=0;
        do {const x=ra.advance(128),y=rb.advance(128);if(JSON.stringify(x)!==JSON.stringify(y))throw Error('settle ticks mismatch');simCheck(aa,bb,'canonical');checks++;}while(!ra.done);
        const canonical=await digest([aa.D,aa.C,aa.Dold,aa.out,aa.saturation()]);
        const weather=[];
        for(const hazard of ['drought','badtide']) {
          const ma=structuredClone(m),mb=structuredClone(m),ca=ma.emitters.filter(e=>e.contamination===0),cb=mb.emitters.filter(e=>e.contamination===0);
          const init={depth:aa.D,contamination:aa.C},wa=new a.WaterSim(ma,init,{rules}),wb=new b.WaterSim(mb,init,{rules});
          const days=a.hazardDays('normal',hazard);
          for(let t=0;t<days*a.TICKS_PER_DAY;) {
            const gap=t<a.TICKS_PER_DAY?12:96;
            if(hazard==='badtide'){for(const e of ca)e.contamination=a.badtideContamination(t/a.TICKS_PER_DAY,days);for(const e of cb)e.contamination=b.badtideContamination(t/b.TICKS_PER_DAY,days);}
            wa.run(gap,hazard==='drought'?0:1);wb.run(gap,hazard==='drought'?0:1);t+=gap;simCheck(wa,wb,hazard);checks++;
          }
          weather.push({hazard,digest:await digest([wa.D,wa.C,wa.Dold,wa.out,wa.saturation()])});
        }
        result.push({rules,ticks:ra.done.ticks,settled:ra.done.settled,canonical,weather,checks});
      }
      return {id:c.id,result};
    },encode(c));
    // Cross-runtime full-state hashes, independently computed by Node's untouched simulator.
    const a=api();
    for(const r of row.result) {
      const aa=new a.WaterSim(structuredClone(c.model),a.prefill(c.model),{rules:r.rules});a.settle(aa,{sealed:a.sealedTiles(c.model)});
      const h=hash(Buffer.concat([aa.D,aa.C,aa.Dold,aa.out,aa.saturation()].map(bytes)));
      if(h!==r.canonical)throw Error(c.id+' Node/Chrome canonical mismatch');
      for(const w of r.weather) {
        const m=structuredClone(c.model),clean=m.emitters.filter(e=>e.contamination===0),sim=new a.WaterSim(m,{depth:aa.D,contamination:aa.C},{rules:r.rules}),days=a.hazardDays('normal',w.hazard);
        for(let t=0;t<days*a.TICKS_PER_DAY;) {const gap=t<a.TICKS_PER_DAY?12:96;if(w.hazard==='badtide')for(const e of clean)e.contamination=a.badtideContamination(t/a.TICKS_PER_DAY,days);sim.run(gap,w.hazard==='drought'?0:1);t+=gap;}
        if(hash(Buffer.concat([sim.D,sim.C,sim.Dold,sim.out,sim.saturation()].map(bytes)))!==w.digest)throw Error(c.id+' Node/Chrome '+w.hazard+' mismatch');
      }
    }
    rows.push(row);json(resolve(LOCAL,'browser.json'),{browser:browser.version(),status:'pass',cases:rows});console.log('BROWSER PASS',c.id);
  }
}finally{await browser.close();}
