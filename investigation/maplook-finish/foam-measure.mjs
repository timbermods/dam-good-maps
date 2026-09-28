import {openDemo} from './browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const phase=process.argv.includes('--before')?'before':'after',folder='captures/round2';
mkdirSync(folder,{recursive:true});
const {browser,page,errors}=await openDemo();
const report={phase,threshold:.12,method:'Screen pixels of visible horizontal water; green records actual foam blend coefficient, not water brightness. Includes fall landing/crown coverage; excludes mist and rings. Clean river uses contamination < .05.',maps:[],errors};
try{
 for(const index of [2,3]){
  await page.evaluate(i=>window.finish.load(i,4242,true),index);
  await page.evaluate(()=>{window.finish.setStages([true,true,true,true]);window.finish.setPose('overview');window.finish.freeze();});
  const result=await page.evaluate(()=>{
   const a=window.finish,r=a.high,flags=a.flags,scene=r.scene;
   a.setEffects({tone:false,grade:false});a.freeze();
   const saves=[],clones=new Map(),hidden=[];
   const waterMat=[...r.water.values()][0].material,fallMat=r.fallMat;
   scene.traverse(o=>{
    if(o.name==='finish-water-particles'){hidden.push([o,o.visible]);o.visible=false;}
    if(!o.material)return;
    const original=o.material;
    const mapped=(Array.isArray(original)?original:[original]).map(old=>{let m=clones.get(old);
    if(!m){
     m=old.clone();m.uniforms=old.uniforms;
     if(old===waterMat){
      const needle='gl_FragColor = vec4(finish(c, vWorld), alpha);';
      if(!m.fragmentShader.includes(needle))throw Error('Water probe anchor changed');
      m.fragmentShader=m.fragmentShader.replace(needle,'gl_FragColor = n.y > .5 ? vec4(1.0,foam,cont,1.0) : vec4(0.0,0.0,0.0,1.0);');
     }else if(old===fallMat){
      const needle='gl_FragColor = vec4(finish(c, vWorld), alpha);';
      if(!m.fragmentShader.includes(needle))throw Error('Fall probe anchor changed');
      m.fragmentShader=m.fragmentShader.replace(needle,'if(kind<3.5)discard; gl_FragColor=vec4(1.0,1.0,cont,alpha);');
     }else if(m.isShaderMaterial)m.fragmentShader='void main(){gl_FragColor=vec4(0.0,0.0,0.0,1.0);}';
     else {m.color?.setRGB(0,0,0);m.emissive?.setRGB(0,0,0);}
     m.needsUpdate=true;clones.set(old,m);
    }return m;});saves.push([o,original]);o.material=Array.isArray(original)?mapped:mapped[0];
   });
   try{
    r.renderNow();r.renderNow();const gl=r.canvas.getContext('webgl2'),p=new Uint8Array(r.canvas.width*r.canvas.height*4);
    gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
    let water=0,foamy=0,clean=0,cleanFoamy=0;
    for(let i=0;i<p.length;i+=4)if(p[i]>250){water++;if(p[i+1]>=31)foamy++;if(p[i+2]<13){clean++;if(p[i+1]>=31)cleanFoamy++;}}
    const speeds=Array.from({length:a.map.W*a.map.H},(_,i)=>Math.hypot(a.velocity[i*2],a.velocity[i*2+1])).filter(v=>v>0.05).sort((x,y)=>x-y);
    return {label:a.label,canvas:[r.canvas.width,r.canvas.height],water,foamy,percent:foamy/water*100,clean,cleanFoamy,cleanPercent:cleanFoamy/clean*100,velocityQuantiles:[.1,.25,.5,.75,.9,.95,.99].map(q=>[q,speeds[Math.floor(q*speeds.length)]]),field:a.counts.water};
   }finally{for(const[o,m]of saves)o.material=m;for(const[o,v]of hidden)o.visible=v;for(const m of clones.values())m.dispose();a.setEffects(flags);a.freeze();}
  });
  report.maps.push(result);console.log(JSON.stringify(result));
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{writeFileSync(folder+'/foam-'+phase+'.json',JSON.stringify(report,null,2));await browser.close();}
